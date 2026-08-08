export type PathStyle = 'windows' | 'posix'

export const WINDOWS_FOREST_ROOT = '::windows-roots::'

export interface PathAncestor {
  key: string
  ioPath: string
  label: string
}

export interface PathDescriptor {
  ioPath: string
  key: string
  rootKey: string
  ancestors: PathAncestor[]
}

export function normalizePosixPath(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return '/'
  const absolute = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  const parts: string[] = []
  for (const part of absolute.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.length ? `/${parts.join('/')}` : '/'
}

export function migrateLegacyWindowsPath(value: string): string {
  const trimmed = value.trim()
  return /^\/(?:[A-Za-z]:[\\/]|\\\\)/.test(trimmed) ? trimmed.slice(1) : trimmed
}

function normalizedSegments(value: string): string[] {
  const result: string[] = []
  for (const segment of value.split('\\')) {
    if (!segment || segment === '.') continue
    if (segment === '..') result.pop()
    else result.push(segment)
  }
  return result
}

function comparisonSegment(value: string): string {
  return value.normalize('NFC').toLowerCase()
}

function windowsDescriptor(value: string): PathDescriptor | null {
  const ioPath = migrateLegacyWindowsPath(value)
  if (!ioPath || ioPath === WINDOWS_FOREST_ROOT || ioPath === '/') return null
  const normalized = ioPath.replaceAll('/', '\\')

  let kind: 'drive' | 'unc'
  let rootIdentity: string
  let rootLabel: string
  let rootIoPath: string
  let remainder: string

  let match = /^\\\\\?\\([A-Za-z]):\\(.*)$/.exec(normalized)
  if (match) {
    kind = 'drive'
    const drive = match[1].toUpperCase()
    rootIdentity = drive.toLowerCase()
    rootLabel = `${drive}:\\`
    rootIoPath = `\\\\?\\${drive}:\\`
    remainder = match[2]
  } else {
    match = /^\\\\\?\\UNC\\([^\\]+)\\([^\\]+)(?:\\(.*))?$/.exec(normalized)
    if (match) {
      kind = 'unc'
      const server = match[1]
      const share = match[2]
      rootIdentity = `${comparisonSegment(server)}\\${comparisonSegment(share)}`
      rootLabel = `\\\\${server}\\${share}`
      rootIoPath = `\\\\?\\UNC\\${server}\\${share}\\`
      remainder = match[3] || ''
    } else {
      match = /^([A-Za-z]):\\(.*)$/.exec(normalized)
      if (match) {
        kind = 'drive'
        const drive = match[1].toUpperCase()
        rootIdentity = drive.toLowerCase()
        rootLabel = `${drive}:\\`
        rootIoPath = `${drive}:\\`
        remainder = match[2]
      } else {
        match = /^\\\\([^\\]+)\\([^\\]+)(?:\\(.*))?$/.exec(normalized)
        if (!match) return null
        kind = 'unc'
        const server = match[1]
        const share = match[2]
        rootIdentity = `${comparisonSegment(server)}\\${comparisonSegment(share)}`
        rootLabel = `\\\\${server}\\${share}`
        rootIoPath = `\\\\${server}\\${share}\\`
        remainder = match[3] || ''
      }
    }
  }

  const rootKey = `win:${kind}:${rootIdentity}`
  const ancestors: PathAncestor[] = [{ key: rootKey, ioPath: rootIoPath, label: rootLabel }]
  const rawSegments = normalizedSegments(remainder)
  const keySegments: string[] = []
  const ioSegments: string[] = []
  for (const segment of rawSegments) {
    keySegments.push(comparisonSegment(segment))
    ioSegments.push(segment)
    ancestors.push({
      key: `${rootKey}\\${keySegments.join('\\')}`,
      ioPath: `${rootIoPath}${ioSegments.join('\\')}`,
      label: segment,
    })
  }
  return {
    ioPath,
    key: ancestors.at(-1)!.key,
    rootKey,
    ancestors,
  }
}

function posixAncestors(value: string): PathAncestor[] {
  const normalized = normalizePosixPath(value)
  const result: PathAncestor[] = [{ key: '/', ioPath: '/', label: '/' }]
  let current = ''
  for (const segment of normalized.split('/').filter(Boolean)) {
    current += `/${segment}`
    result.push({ key: current, ioPath: current, label: segment })
  }
  return result
}

export function describePath(value: string, style: PathStyle): PathDescriptor | null {
  if (style === 'windows') return windowsDescriptor(value)
  const ancestors = posixAncestors(value)
  return {
    ioPath: normalizePosixPath(value),
    key: ancestors.at(-1)!.key,
    rootKey: '/',
    ancestors,
  }
}

export function normalizeIoPath(value: string, style: PathStyle): string {
  if (style === 'windows') {
    if (value === WINDOWS_FOREST_ROOT || value.trim() === '/') return WINDOWS_FOREST_ROOT
    return windowsDescriptor(value)?.ioPath || migrateLegacyWindowsPath(value)
  }
  return normalizePosixPath(value)
}

export function pathKey(value: string, style: PathStyle): string {
  if (style === 'windows' && (value === WINDOWS_FOREST_ROOT || value.trim() === '/')) return WINDOWS_FOREST_ROOT
  const descriptor = describePath(value, style)
  if (descriptor) return descriptor.key
  return style === 'windows'
    ? `win:opaque:${migrateLegacyWindowsPath(value).normalize('NFC').toLowerCase()}`
    : normalizePosixPath(value)
}

export function pathAncestors(value: string, style: PathStyle): PathAncestor[] {
  return describePath(value, style)?.ancestors || []
}

export function parentPathForStyle(value: string, style: PathStyle): string {
  if (style === 'windows') {
    if (value === WINDOWS_FOREST_ROOT || value.trim() === '/') return WINDOWS_FOREST_ROOT
    const ancestors = pathAncestors(value, style)
    return ancestors.length <= 1 ? WINDOWS_FOREST_ROOT : ancestors[ancestors.length - 2].ioPath
  }
  const normalized = normalizePosixPath(value)
  if (normalized === '/') return '/'
  const slash = normalized.lastIndexOf('/')
  return slash <= 0 ? '/' : normalized.slice(0, slash)
}

export function pathNameForStyle(value: string, style: PathStyle): string {
  if (style === 'windows' && (value === WINDOWS_FOREST_ROOT || value.trim() === '/')) return WINDOWS_FOREST_ROOT
  const ancestors = pathAncestors(value, style)
  return ancestors.at(-1)?.label || (style === 'windows' ? value : '/')
}

export function isPathWithinStyle(rootPath: string, candidatePath: string, style: PathStyle): boolean {
  if (style === 'windows' && (rootPath === WINDOWS_FOREST_ROOT || rootPath.trim() === '/')) return true
  const root = pathKey(rootPath, style)
  const candidate = pathKey(candidatePath, style)
  const separator = style === 'windows' ? '\\' : '/'
  if (style === 'posix' && root === '/') return true
  return candidate === root
    || candidate.startsWith(`${root}${separator}`)
}

export function deepestCommonPath(rootPaths: string[], style: PathStyle): string {
  if (rootPaths.length === 0) return style === 'windows' ? WINDOWS_FOREST_ROOT : '/'
  if (style === 'posix') {
    const split = rootPaths.map(value => normalizePosixPath(value).split('/').filter(Boolean))
    const common: string[] = []
    for (let index = 0; ; index += 1) {
      const segment = split[0][index]
      if (segment === undefined || !split.every(parts => parts[index] === segment)) break
      common.push(segment)
    }
    return common.length ? `/${common.join('/')}` : '/'
  }

  const descriptors = rootPaths.map(value => windowsDescriptor(value))
  if (descriptors.some(value => !value)) return WINDOWS_FOREST_ROOT
  const concrete = descriptors as PathDescriptor[]
  if (!concrete.every(value => value.rootKey === concrete[0].rootKey)) return WINDOWS_FOREST_ROOT
  let commonIndex = 0
  const shortest = Math.min(...concrete.map(value => value.ancestors.length))
  while (commonIndex < shortest
    && concrete.every(value => value.ancestors[commonIndex].key === concrete[0].ancestors[commonIndex].key)) commonIndex += 1
  return concrete[0].ancestors[Math.max(0, commonIndex - 1)].ioPath
}

export function isAbsolutePathForStyle(value: string, style: PathStyle): boolean {
  if (style === 'windows') return windowsDescriptor(value) !== null
  return value.trim().startsWith('/')
}
