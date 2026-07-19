import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { codexConnector } from './codex-connector'

let settingsMigrationAttempted = false

export function migratePluginSettings(pluginDataBase: string, legacyDirName: string, currentDirName: string): void {
  if (settingsMigrationAttempted) return
  settingsMigrationAttempted = true

  try {
    const legacyDir = path.join(pluginDataBase, legacyDirName)
    const currentDir = path.join(pluginDataBase, currentDirName)
    const entries = fs.readdirSync(legacyDir, { withFileTypes: true })
    fs.mkdirSync(currentDir, { recursive: true })

    for (const entry of entries) {
      if (!entry.name.endsWith('.json') || !entry.isFile()) continue
      try {
        fs.copyFileSync(
          path.join(legacyDir, entry.name),
          path.join(currentDir, entry.name),
          fs.constants.COPYFILE_EXCL,
        )
      } catch { /* settings migration is best-effort and never overwrites current files */ }
    }
  } catch { /* absent or inaccessible legacy settings are ignored */ }
}

// --- Paths ---
const HOME = process.env.HOME || '/root'
const CLAUDE_DIR = path.join(HOME, '.claude')
const PROJECTS_DIR = process.env.CC_SB_PROJECTS_DIR || path.join(CLAUDE_DIR, 'projects')
const ARCHIVE_DIR = process.env.CC_SB_ARCHIVE_DIR || path.join(CLAUDE_DIR, 'projects-archive')
const SESSIONS_DIR = process.env.CC_SB_SESSIONS_DIR || path.join(CLAUDE_DIR, 'sessions')
const PLUGIN_DATA_BASE = path.join(HOME, '.dinotty', 'plugin-data')
if (process.env.CC_SB_DATA_DIR === undefined) migratePluginSettings(PLUGIN_DATA_BASE, 'cc-session-browser', 'session-browser')
const DATA_DIR = process.env.CC_SB_DATA_DIR || path.join(HOME, '.dinotty/plugin-data/session-browser')
const INDEX_CACHE_PATH = path.join(DATA_DIR, 'index-cache.json')

// --- Types ---
export type AgentId = 'claude-code' | 'codex'
export interface ConnectorCapabilities { archive: boolean; rename: boolean; delete: boolean; deleteRequiresArchived: boolean; nativeIndex: boolean; tokenStats: boolean; originFilter: boolean }
export interface ConnectorAvailability { available: boolean; degraded: boolean; reason?: string }
export interface SessionConnector {
  id: AgentId
  capabilities: ConnectorCapabilities
  resume: { argv: string[] }
  isAvailable(): ConnectorAvailability
  buildIndex(refresh: boolean): void
  indexSessions(refresh: boolean): IndexedSession[]
  listUnder(rootPath: string, partition?: string): void
  listProjects(): void
  listSessions(scopeKey: string): void
  readSession(scopeKey: string, sessionId: string): Promise<Message[]>
  moveSession(scopeKey: string, sessionId: string, direction: 'archive' | 'restore', force?: boolean): void
  deleteArchived(scopeKey: string, sessionId: string, force?: boolean): void
  search(query: string, scope?: string): Promise<void>
  listRecent(limit?: number): void
}
interface Project { path: string; encodedPath: string; sessionCount: number }
interface Session { id: string; project: string; encodedPath: string; firstPrompt: string; lastTimestamp: string; messageCount?: number; gitBranch?: string; live?: true; aiTitle?: string; customTitle?: string }
export interface Message { uuid: string; role: 'user' | 'assistant' | 'developer'; content: string; timestamp: string; model?: string; toolUses?: { name: string; summary: string; filePath?: string; oldString?: string; newString?: string; content?: string; replaceAll?: boolean }[] }
export interface IndexedSession {
  id: string
  agent: AgentId
  rootPath: string
  attributionKey: string
  title: string
  createdAt: string
  lastActiveAt: string
  messageCount?: number
  gitBranch?: string
  partition: 'active' | 'archive'
  health: 'ok' | 'live' | 'truncated' | 'empty'
  lossyPath?: boolean
  attributionMismatch?: boolean
  timestampSource: 'event' | 'mtime'
  sizeBytes: number
  live?: true
  aiTitle?: string
  customTitle?: string
  origin?: string
}
interface SearchResult { session: IndexedSession; match: string }
interface CacheEntry { size: number; mtimeMs: number; meta: IndexedSession }
interface IndexCache { version: number; entries: Record<string, CacheEntry> }
interface LiveRegistryEntry { sessionId: string; cwd?: string; updatedAt: number }
interface MutationReason { error: string; message: string }
export type MutationResult =
  | { outcome: 'success'; cacheRefreshed: boolean }
  | { outcome: 'failure'; reason: MutationReason }
  | { outcome: 'partial'; stage: string; jsonlPath: string; artifactPath: string; reason: MutationReason }

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ENCODED_PATH_RE = /^[A-Za-z0-9_-]+$/
const HEAD_SCAN_BYTES = 64 * 1024
const HEAD_SCAN_LINES = 200
const TAIL_SCAN_BYTES = 1024 * 1024
const READ_SESSION_MAX_OUTPUT_BYTES = 16 * 1024 * 1024
export const LIVE_WINDOW_MS = 60 * 1000
const INDEX_CACHE_VERSION = 3
const EXPORT_TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000
const EXPORT_TEMP_RE = /^\.export-tmp-\d+-\d+-\d+$/
const EXPORT_TEMP_SWEEP_MAX_DEPTH = 2
const EXPORT_FILENAME_MAX_BYTES = 255
const EXPORT_FILENAME_ATTEMPTS = 1000
const EXPORT_LINK_FALLBACK_CODES = new Set(['EPERM', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'EMLINK'])
const TERMINAL_SESSION_STATUSES = new Set(['closed', 'completed', 'dead', 'done', 'ended', 'exited', 'failed', 'stopped', 'terminated'])
let exportTempCounter = 0

// --- Helpers ---
function output(value: unknown) {
  console.log(JSON.stringify(value))
}

function fail(error: string, message: string): never {
  console.error(JSON.stringify({ error, message }))
  process.exit(1)
}

function structuredError(error: string, message: string): NodeJS.ErrnoException {
  const result: NodeJS.ErrnoException = new Error(message)
  result.code = error
  return result
}

function mutationFailure(error: string, message: string): MutationResult {
  return { outcome: 'failure', reason: { error, message } }
}

function mutationPartial(stage: string, jsonlPath: string, artifactPath: string, error: string, message: string): MutationResult {
  return {
    outcome: 'partial',
    stage,
    jsonlPath: path.resolve(jsonlPath),
    artifactPath: path.resolve(artifactPath),
    reason: { error, message },
  }
}

function hasInjectedFault(name: string): boolean {
  const faults = (process.env.CC_SB_TEST_FAULTS || '').split(',').map(item => item.trim()).filter(Boolean)
  return faults.includes(name)
}

function injectedFault(name: string, code = 'EIO') {
  if (hasInjectedFault(name)) {
    const error: NodeJS.ErrnoException = new Error(`Injected fault: ${name}`)
    error.code = code
    throw error
  }
}

let moveAttempt = 0

function readLiveRegistry(): Map<string, LiveRegistryEntry> {
  const live = new Map<string, LiveRegistryEntry>()
  let names: string[]
  try {
    names = fs.readdirSync(SESSIONS_DIR).filter(name => name.endsWith('.json'))
  } catch {
    return live
  }

  for (const name of names) {
    try {
      const pidText = path.basename(name, '.json')
      if (!/^\d+$/.test(pidText)) continue
      const pid = Number(pidText)
      if (!Number.isSafeInteger(pid) || pid <= 0) continue

      const parsed = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, name), 'utf8')) as Record<string, unknown>
      if (!parsed || typeof parsed !== 'object' || typeof parsed.sessionId !== 'string' || !SESSION_ID_RE.test(parsed.sessionId)) continue
      const status = typeof parsed.status === 'string' ? parsed.status.toLocaleLowerCase() : ''
      if (TERMINAL_SESSION_STATUSES.has(status)) continue
      process.kill(pid, 0)

      const updatedAtValue = typeof parsed.updatedAt === 'number'
        ? parsed.updatedAt
        : typeof parsed.updatedAt === 'string'
          ? Date.parse(parsed.updatedAt)
          : Number.NaN
      const updatedAt = Number.isFinite(updatedAtValue) ? updatedAtValue : 0
      const candidate: LiveRegistryEntry = {
        sessionId: parsed.sessionId,
        cwd: typeof parsed.cwd === 'string' && parsed.cwd ? parsed.cwd : undefined,
        updatedAt,
      }
      const existing = live.get(candidate.sessionId)
      if (!existing || candidate.updatedAt > existing.updatedAt) live.set(candidate.sessionId, candidate)
    } catch { /* malformed, stale, or inaccessible registry entries are ignored */ }
  }
  return live
}

function overlayLiveRegistry(sessions: IndexedSession[]): IndexedSession[] {
  const live = readLiveRegistry()
  return sessions.map(session => live.has(session.id) ? { ...session, live: true } : session)
}

function validateSessionId(value: string) {
  if (!SESSION_ID_RE.test(value)) fail('invalid-session-id', 'Session id must be a 36-character UUID basename')
}

function validateEncodedPath(value: string) {
  if (!ENCODED_PATH_RE.test(value)) fail('invalid-encoded-path', 'Encoded path contains invalid characters')
}

function validateAbsolutePath(value: string) {
  if (!path.isAbsolute(value) || value.split(path.sep).some(segment => segment === '.' || segment === '..')) {
    fail('invalid-absolute-path', 'Path must be absolute and contain no traversal segments')
  }
}

function fallbackDecode(encodedPath: string): string {
  return '/' + encodedPath.replace(/^-/, '').replace(/-/g, '/')
}

function encodeRootPath(rootPath: string): string {
  return rootPath.replace(/\//g, '-')
}

function readFileRange(filePath: string, start: number, length: number): string {
  if (length <= 0) return ''
  const fd = fs.openSync(filePath, 'r')
  try {
    const buffer = Buffer.allocUnsafe(length)
    const bytesRead = fs.readSync(fd, buffer, 0, length, start)
    return buffer.toString('utf-8', 0, bytesRead)
  } finally {
    fs.closeSync(fd)
  }
}

function readTailLines(filePath: string, size: number): { lines: string[]; trailingPartial: boolean; start: number } {
  if (size === 0) return { lines: [], trailingPartial: false, start: 0 }
  const start = Math.max(0, size - TAIL_SCAN_BYTES)
  const startsMidLine = start > 0 && readFileRange(filePath, start - 1, 1) !== '\n'
  const raw = readFileRange(filePath, start, size - start)
  const lines = raw.split('\n')
  let trailingPartial = false
  if (raw.length > 0 && !raw.endsWith('\n')) {
    try { JSON.parse(lines[lines.length - 1]) } catch {
      trailingPartial = true
      lines.pop()
    }
  }
  if (startsMidLine) lines.shift()
  return { lines, trailingPartial, start }
}

function readBoundedSessionLines(filePath: string, size: number): { lines: string[]; trailingPartial: boolean } {
  if (size <= HEAD_SCAN_BYTES + TAIL_SCAN_BYTES) {
    const raw = readFileRange(filePath, 0, size)
    const lines = raw.split('\n')
    let trailingPartial = false
    if (raw.length > 0 && !raw.endsWith('\n')) {
      try { JSON.parse(lines[lines.length - 1]) } catch {
        trailingPartial = true
        lines.pop()
      }
    }
    return { lines, trailingPartial }
  }

  const tail = readTailLines(filePath, size)
  const rawHead = readFileRange(filePath, 0, Math.min(size, HEAD_SCAN_BYTES))
  const headLines = rawHead.split('\n')
  if (!rawHead.endsWith('\n')) headLines.pop()
  return {
    lines: [...headLines.slice(0, HEAD_SCAN_LINES), ...tail.lines],
    trailingPartial: tail.trailingPartial,
  }
}

function timestampFromLine(line: string): string {
  if (!line.trim()) return ''
  try {
    const obj = JSON.parse(line)
    return typeof obj.timestamp === 'string' && obj.timestamp && !Number.isNaN(Date.parse(obj.timestamp)) ? obj.timestamp : ''
  } catch {
    return ''
  }
}

function readLastEventTimestamp(filePath: string, size: number, trailingPartial: boolean): string {
  if (size === 0) return ''

  const { lines } = readTailLines(filePath, size)
  if (trailingPartial && lines.length && !lines[lines.length - 1].trim()) lines.pop()
  for (let i = lines.length - 1; i >= 0; i--) {
    const timestamp = timestampFromLine(lines[i])
    if (timestamp) return timestamp
  }
  return ''
}

function readSessionMeta(filePath: string, id: string, attributionKey: string, partition: 'active' | 'archive', stat?: fs.Stats): IndexedSession {
  const fileStat = stat || fs.statSync(filePath)
  const { lines, trailingPartial } = readBoundedSessionLines(filePath, fileStat.size)
  let firstCwd = ''
  let createdAt = ''
  let title = ''
  let fallbackTitle = ''
  let gitBranch = ''
  let aiTitle: string | undefined
  let customTitle: string | undefined
  let messageCount = 0
  let parseableCount = 0
  let headBytes = 0
  let headLines = 0

  for (const line of lines) {
    const lineBytes = Buffer.byteLength(line, 'utf-8') + 1
    const inHead = headLines < HEAD_SCAN_LINES && headBytes + lineBytes <= HEAD_SCAN_BYTES
    headLines++
    headBytes += lineBytes
    if (!line.trim()) continue
    try {
      const obj = JSON.parse(line)
      parseableCount++
      if (inHead) {
        if (!firstCwd && typeof obj.cwd === 'string' && obj.cwd) firstCwd = obj.cwd
        if (!createdAt && typeof obj.timestamp === 'string' && !Number.isNaN(Date.parse(obj.timestamp))) createdAt = obj.timestamp
        if (!gitBranch && typeof obj.gitBranch === 'string' && obj.gitBranch) gitBranch = obj.gitBranch
        if (!fallbackTitle && obj.type === 'last-prompt' && typeof obj.lastPrompt === 'string') {
          fallbackTitle = obj.lastPrompt
        }
      }
      if (obj.type === 'user') {
        messageCount++
        if (inHead && !title && typeof obj.message?.content === 'string') {
          title = obj.message.content
        }
      }
      if (obj.type === 'ai-title' && typeof obj.aiTitle === 'string' && obj.aiTitle.trim()) aiTitle = obj.aiTitle.trim()
      if (obj.type === 'custom-title' && typeof obj.customTitle === 'string' && obj.customTitle.trim()) customTitle = obj.customTitle.trim()
    } catch { /* skip corrupt complete lines */ }
  }

  const rootPath = firstCwd || fallbackDecode(attributionKey)
  const attributionMismatch = firstCwd ? encodeRootPath(rootPath) !== attributionKey : false
  const eventTimestamp = readLastEventTimestamp(filePath, fileStat.size, trailingPartial)
  const timestampSource: 'event' | 'mtime' = eventTimestamp ? 'event' : 'mtime'
  const lastActiveAt = eventTimestamp || fileStat.mtime.toISOString()

  let health: IndexedSession['health']
  if (parseableCount === 0) health = 'empty'
  else if (!eventTimestamp) health = 'truncated'
  else if (Date.now() - fileStat.mtimeMs < LIVE_WINDOW_MS && trailingPartial) health = 'live'
  else if (trailingPartial) health = 'truncated'
  else health = 'ok'

  return {
    id,
    agent: 'claude-code',
    rootPath,
    attributionKey,
    title: (title || fallbackTitle).slice(0, 200),
    createdAt,
    lastActiveAt,
    messageCount,
    gitBranch: gitBranch || undefined,
    partition,
    health,
    lossyPath: !firstCwd || undefined,
    attributionMismatch: firstCwd && attributionMismatch ? true : undefined,
    timestampSource,
    sizeBytes: fileStat.size,
    aiTitle,
    customTitle,
  }
}

function parseMessage(obj: any): Message | null {
  if (obj.type === 'user') {
    if (typeof obj.message?.content !== 'string') return null
    return {
      uuid: obj.uuid || '',
      role: 'user',
      content: obj.message.content,
      timestamp: obj.timestamp || '',
    }
  }
  if (obj.type === 'assistant') {
    const content = obj.message?.content || []
    const textParts: string[] = []
    const toolUses: { name: string; summary: string; filePath?: string; oldString?: string; newString?: string; content?: string; replaceAll?: boolean }[] = []

    for (const block of content) {
      if (block.type === 'text') textParts.push(block.text)
      else if (block.type === 'tool_use') {
        const tu: { name: string; summary: string; filePath?: string; oldString?: string; newString?: string; content?: string; replaceAll?: boolean } = {
          name: block.name,
          summary: summarizeTool(block.name, block.input),
        }
        if (block.name === 'Edit' && block.input) {
          tu.filePath = block.input.file_path || ''
          tu.oldString = block.input.old_string || ''
          tu.newString = block.input.new_string || ''
          tu.replaceAll = block.input.replace_all || false
        } else if (block.name === 'Write' && block.input) {
          tu.filePath = block.input.file_path || ''
          tu.content = block.input.content || ''
        }
        toolUses.push(tu)
      }
    }

    return {
      uuid: obj.uuid || '',
      role: 'assistant',
      content: textParts.join('\n'),
      timestamp: obj.timestamp || '',
      model: obj.message?.model,
      toolUses: toolUses.length > 0 ? toolUses : undefined,
    }
  }
  return null
}

function summarizeTool(name: string, input: any): string {
  if (!input) return name
  switch (name) {
    case 'Bash': return (input.command || name).slice(0, 80)
    case 'Read': return input.file_path || name
    case 'Edit': return input.file_path || name
    case 'Write': return input.file_path || name
    case 'Grep': return input.pattern || name
    case 'Glob': return input.pattern || name
    case 'Agent': return (input.description || name).slice(0, 60)
    case 'WebFetch': return (input.url || name).slice(0, 60)
    case 'WebSearch': return (input.query || name).slice(0, 60)
    default: return name
  }
}

function readCache(): IndexCache {
  try {
    const parsed = JSON.parse(fs.readFileSync(INDEX_CACHE_PATH, 'utf-8'))
    if (!parsed || typeof parsed !== 'object' || parsed.version !== INDEX_CACHE_VERSION || !parsed.entries || typeof parsed.entries !== 'object') throw new Error('invalid cache')
    for (const entry of Object.values(parsed.entries) as CacheEntry[]) entry.meta.agent = 'claude-code'
    return parsed as IndexCache
  } catch {
    return { version: INDEX_CACHE_VERSION, entries: {} }
  }
}

function writeCache(cache: IndexCache) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const tempPath = `${INDEX_CACHE_PATH}.tmp-${process.pid}-${Date.now()}`
  try {
    fs.writeFileSync(tempPath, JSON.stringify(cache))
    fs.renameSync(tempPath, INDEX_CACHE_PATH)
  } finally {
    try { fs.unlinkSync(tempPath) } catch { /* already renamed or never written */ }
  }
}

function lstatIfExists(filePath: string): fs.Stats | null {
  try {
    return fs.lstatSync(filePath)
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

function unsafePath(message: string): never {
  const error: NodeJS.ErrnoException = new Error(message)
  error.code = 'unsafe-path'
  throw error
}

function assertSafePartitionPath(partitionRoot: string, targetPath: string) {
  const resolvedRoot = path.resolve(partitionRoot)
  const resolvedTarget = path.resolve(targetPath)
  if (!isUnder(resolvedRoot, resolvedTarget)) unsafePath(`Path escapes partition root: ${resolvedTarget}`)

  const relative = path.relative(resolvedRoot, resolvedTarget)
  const components = relative ? relative.split(path.sep) : []
  let current = resolvedRoot
  for (let index = -1; index < components.length; index++) {
    if (index >= 0) current = path.join(current, components[index])
    const stat = lstatIfExists(current)
    if (!stat) break
    if (stat.isSymbolicLink()) unsafePath(`Symlink is not allowed in a session path: ${current}`)
    if (index < components.length - 1 && !stat.isDirectory()) unsafePath(`Non-directory path component: ${current}`)
  }

  const rootStat = lstatIfExists(resolvedRoot)
  const parentStat = lstatIfExists(path.dirname(resolvedTarget))
  if (rootStat && parentStat) {
    if (!rootStat.isDirectory() || !parentStat.isDirectory()) unsafePath(`Mutation parent is not a directory: ${path.dirname(resolvedTarget)}`)
    const canonicalRoot = fs.realpathSync(resolvedRoot)
    const canonicalParent = fs.realpathSync(path.dirname(resolvedTarget))
    if (!isUnder(canonicalRoot, canonicalParent)) unsafePath(`Canonical parent escapes partition root: ${canonicalParent}`)
  }
}

function movePath(sourcePath: string, destPath: string, isDirectory: boolean): boolean {
  if (!lstatIfExists(sourcePath)) return false
  if (lstatIfExists(destPath)) {
    const error: NodeJS.ErrnoException = new Error(`Destination already exists: ${destPath}`)
    error.code = 'collision'
    throw error
  }

  try {
    moveAttempt += 1
    injectedFault(`move-exdev-${moveAttempt}`, 'EXDEV')
    injectedFault('move-exdev', 'EXDEV')
    fs.renameSync(sourcePath, destPath)
  } catch (error: any) {
    if (error?.code !== 'EXDEV') throw error
    const unsupported: NodeJS.ErrnoException = new Error(`Cross-filesystem moves are not supported: ${sourcePath} -> ${destPath}`)
    unsupported.code = 'cross-filesystem-not-supported'
    throw unsupported
  }
  return true
}

function touchOpenedFile(filePath: string, expectedStat: fs.Stats, atime: Date, mtime: Date) {
  const fd = fs.openSync(filePath, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW)
  try {
    const openedStat = fs.fstatSync(fd)
    if (!openedStat.isFile() || openedStat.dev !== expectedStat.dev || openedStat.ino !== expectedStat.ino) {
      unsafePath(`Session file changed before timestamp update: ${filePath}`)
    }
    fs.futimesSync(fd, atime, mtime)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
}

function updateMovedCache(sourceJsonPath: string, destJsonPath: string, id: string, attributionKey: string, partition: 'active' | 'archive') {
  const cache = readCache()
  delete cache.entries[sourceJsonPath]
  const stat = fs.statSync(destJsonPath)
  cache.entries[destJsonPath] = {
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    meta: readSessionMeta(destJsonPath, id, attributionKey, partition, stat),
  }
  writeCache(cache)
}

function dropCachedEntry(filePath: string) {
  const cache = readCache()
  delete cache.entries[filePath]
  writeCache(cache)
}

function indexDiagnostic(filePath: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(JSON.stringify({ diagnostic: 'index-read-failed', path: path.resolve(filePath), message }))
}

function preserveCachedEntry(filePath: string, cache: IndexCache, nextEntries: Record<string, CacheEntry>, sessions: IndexedSession[]) {
  const cached = cache.entries[filePath]
  if (!cached || nextEntries[filePath]) return
  nextEntries[filePath] = cached
  sessions.push(cached.meta)
}

function preserveCachedEntriesUnder(dirPath: string, cache: IndexCache, nextEntries: Record<string, CacheEntry>, sessions: IndexedSession[]) {
  for (const filePath of Object.keys(cache.entries)) {
    if (isUnder(dirPath, filePath)) preserveCachedEntry(filePath, cache, nextEntries, sessions)
  }
}

function sweepOrphanedTemps(dirPath: string, names: string[], pattern: RegExp, canUnlink: (name: string) => boolean) {
  const cutoff = Date.now() - EXPORT_TEMP_MAX_AGE_MS
  for (const name of names) {
    if (!pattern.test(name)) continue
    const filePath = path.join(dirPath, name)
    try {
      const stat = fs.lstatSync(filePath)
      if (stat.isFile() && stat.mtimeMs < cutoff && canUnlink(name)) fs.unlinkSync(filePath)
    } catch { /* orphan-temp cleanup is best-effort; keep walking after every failure */ }
  }
}

function canUnlinkExportTemp(name: string): boolean {
  const match = /^\.export-tmp-(\d+)-/.exec(name)
  const pid = match ? Number(match[1]) : NaN
  if (!Number.isSafeInteger(pid) || pid < 1) return false
  try {
    process.kill(pid, 0)
    return false
  } catch (error: any) {
    if (error?.code === 'ESRCH') return true
    if (error?.code === 'EPERM') return false
    // Deliberately fail safe: leave an orphan rather than risk deleting live export data.
    return false
  }
}

function sweepOrphanedExportTemps(destination: string) {
  let exportRoot = destination
  for (let candidate = destination; candidate !== path.dirname(candidate); candidate = path.dirname(candidate)) {
    if (path.basename(candidate).endsWith('_exp')) {
      exportRoot = candidate
      break
    }
  }

  const walk = (dirPath: string, depth: number) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch { return /* export-temp cleanup is best-effort */ }
    sweepOrphanedTemps(dirPath, entries.map(entry => entry.name), EXPORT_TEMP_RE, canUnlinkExportTemp)
    if (depth >= EXPORT_TEMP_SWEEP_MAX_DEPTH) return
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const childPath = path.join(dirPath, entry.name)
      walk(childPath, depth + 1)
    }
  }
  walk(exportRoot, 0)
}

function walkPartition(baseDir: string, partition: 'active' | 'archive', cache: IndexCache, refresh: boolean, nextEntries: Record<string, CacheEntry>, sessions: IndexedSession[]) {
  let dirs: fs.Dirent[]
  try {
    dirs = fs.readdirSync(baseDir, { withFileTypes: true })
  } catch (error: any) {
    if (error?.code === 'ENOENT') return
    fail('partition-read-failed', error?.message || `Could not read partition root: ${baseDir}`)
  }

  for (const dirEntry of dirs) {
    if (!dirEntry.isDirectory() || dirEntry.name.startsWith('.') || !ENCODED_PATH_RE.test(dirEntry.name)) continue
    const attributionKey = dirEntry.name
    const dirPath = path.join(baseDir, attributionKey)
    let files: string[]
    try {
      assertSafePartitionPath(baseDir, dirPath)
      const names = fs.readdirSync(dirPath)
      files = names.filter(name => name.endsWith('.jsonl')).sort()
    } catch (error: any) {
      indexDiagnostic(dirPath, error)
      if (error?.code !== 'unsafe-path') preserveCachedEntriesUnder(dirPath, cache, nextEntries, sessions)
      continue
    }

    for (const fileName of files) {
      const id = fileName.slice(0, -'.jsonl'.length)
      if (!SESSION_ID_RE.test(id)) continue
      const filePath = path.join(dirPath, fileName)
      try {
        assertSafePartitionPath(baseDir, filePath)
        const stat = fs.lstatSync(filePath)
        if (stat.isSymbolicLink() || !stat.isFile()) continue
        const cached = cache.entries[filePath]
        const meta = !refresh && cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs
          ? cached.meta
          : readSessionMeta(filePath, id, attributionKey, partition, stat)
        nextEntries[filePath] = { size: stat.size, mtimeMs: stat.mtimeMs, meta }
        sessions.push(meta)
      } catch (error: any) {
        indexDiagnostic(filePath, error)
        if (error?.code !== 'unsafe-path') preserveCachedEntry(filePath, cache, nextEntries, sessions)
      }
    }
  }
}

function buildIndex(refresh = false): IndexedSession[] {
  const cache = readCache()
  const nextEntries: Record<string, CacheEntry> = {}
  const sessions: IndexedSession[] = []

  walkPartition(PROJECTS_DIR, 'active', cache, refresh, nextEntries, sessions)
  walkPartition(ARCHIVE_DIR, 'archive', cache, refresh, nextEntries, sessions)

  sessions.sort((a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt) || a.id.localeCompare(b.id))
  writeCache({ version: INDEX_CACHE_VERSION, entries: nextEntries })
  return overlayLiveRegistry(sessions)
}

function isUnder(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath))
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function toLegacySession(session: IndexedSession): Session {
  return {
    id: session.id,
    project: session.rootPath,
    encodedPath: session.attributionKey,
    firstPrompt: session.title,
    lastTimestamp: session.lastActiveAt,
    messageCount: session.messageCount,
    gitBranch: session.gitBranch,
    live: session.live,
    aiTitle: session.aiTitle,
    customTitle: session.customTitle,
  }
}

function findOption(args: string[], option: string): { value?: string; rest: string[] } {
  const index = args.indexOf(option)
  if (index < 0) return { rest: args }
  if (!args[index + 1]) fail('missing-option-value', `${option} requires a value`)
  return { value: args[index + 1], rest: [...args.slice(0, index), ...args.slice(index + 2)] }
}

function resolveAllowMissing(filePath: string): string {
  let existing = path.resolve(filePath)
  const missing: string[] = []
  while (true) {
    try {
      return path.join(fs.realpathSync(existing), ...missing.reverse())
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error
      const parent = path.dirname(existing)
      if (parent === existing) throw error
      missing.push(path.basename(existing))
      existing = parent
    }
  }
}

function cleanupCreatedExportDirectories(firstCreated: string | undefined, requested: string) {
  if (!firstCreated) return
  const first = path.resolve(firstCreated)
  let current = path.resolve(requested)
  while (isUnder(first, current)) {
    try { fs.rmdirSync(current) } catch { /* destination cleanup is best-effort */ }
    if (current === first) break
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
}

function isExportDestinationOutsideHome(dest: string): boolean {
  const expanded = dest.replace(/^~(?=$|[\\/])/, HOME)
  let resolvedHome: string
  try {
    resolvedHome = resolveAllowMissing(HOME)
  } catch (error: any) {
    fail('export-home-resolve-failed', error?.message || `Could not resolve home directory: ${HOME}`)
  }
  let resolvedRequested: string
  try {
    resolvedRequested = resolveAllowMissing(path.resolve(expanded))
  } catch (error: any) {
    fail('export-destination-resolve-failed', error?.message || `Could not resolve export destination: ${dest}`)
  }
  return !isUnder(resolvedHome!, resolvedRequested!)
}

function prepareExportDestination(dest: string, allowOutsideHome: boolean): string {
  const expanded = dest.replace(/^~(?=$|[\\/])/, HOME)
  const requested = path.resolve(expanded)
  let firstCreated: string | undefined

  if (!allowOutsideHome && isExportDestinationOutsideHome(dest)) {
    fail('export-destination-outside-home', `Export destination is outside the user's home directory: ${requested}`)
  }

  try {
    const stat = fs.statSync(requested)
    if (!stat.isDirectory()) fail('export-destination-not-directory', `Export destination is not a directory: ${requested}`)
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      if (error?.code === 'ENOTDIR') fail('export-destination-not-directory', `Export destination is not a directory: ${requested}`)
      fail('export-destination-inspection-failed', error?.message || `Could not inspect export destination: ${requested}`)
    }
    try {
      firstCreated = fs.mkdirSync(requested, { recursive: true })
    } catch (mkdirError: any) {
      if (mkdirError?.code === 'EEXIST' || mkdirError?.code === 'ENOTDIR') {
        fail('export-destination-not-directory', `Export destination is not a directory: ${requested}`)
      }
      fail('export-destination-create-failed', mkdirError?.message || `Could not create export destination: ${requested}`)
    }
  }

  let resolved: string
  try {
    resolved = fs.realpathSync(requested)
  } catch (error: any) {
    fail('export-destination-resolve-failed', error?.message || `Could not resolve export destination: ${requested}`)
  }

  try {
    if (!fs.statSync(resolved).isDirectory()) {
      fail('export-destination-not-directory', `Export destination is not a directory: ${resolved}`)
    }
  } catch (error: any) {
    if (error?.code === 'export-destination-not-directory') throw error
    fail('export-destination-resolve-failed', error?.message || `Could not inspect resolved export destination: ${resolved}`)
  }

  try {
    fs.accessSync(resolved, fs.constants.W_OK)
  } catch (error: any) {
    fail('export-destination-not-writable', error?.message || `Export destination is not writable: ${resolved}`)
  }

  if (!allowOutsideHome) {
    let resolvedHome: string
    try {
      resolvedHome = resolveAllowMissing(HOME)
    } catch (error: any) {
      fail('export-home-resolve-failed', error?.message || `Could not resolve home directory: ${HOME}`)
    }
    if (!isUnder(resolvedHome, resolved)) {
      cleanupCreatedExportDirectories(firstCreated, requested)
      fail('export-destination-outside-home', `Export destination is outside the user's home directory: ${resolved}`)
    }
  }

  sweepOrphanedExportTemps(resolved)
  return resolved
}

function stripExportTitleMarkup(text: string): string {
  for (let iteration = 0; iteration < 5; iteration++) {
    const stripped = text
      .replace(/<system-reminder>[\s\S]*?(?:<\/system-reminder>|$)/g, '')
      .replace(/<local-command-stdout>[\s\S]*?(?:<\/local-command-stdout>|$)/g, '')
    if (stripped === text) break
    text = stripped
  }
  return text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function cleanExportTitle(text: string): string {
  const commandName = text.match(/<command-name>([\s\S]*?)<\/command-name>/)
  if (commandName) {
    const name = stripExportTitleMarkup(commandName[1]).replace(/^\//, '')
    const args = stripExportTitleMarkup(text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1] || '')
    return cleanExportFilenameText(`${name} ${args}`)
  }
  return cleanExportFilenameText(stripExportTitleMarkup(text))
}

function resolvedExportTitle(session: IndexedSession): string {
  return session.aiTitle?.trim() || session.customTitle?.trim() || cleanExportTitle(session.title) || 'session'
}

function cleanExportFilenameText(text: string): string {
  return text
    .replace(/\[[A-Z][A-Z0-9-]{4,}(?:\s+[^\]\r\n]*)?\]/g, '')
    .replace(/[\p{S}\p{Extended_Pictographic}\u200d\u20e3\ufe0e\ufe0f]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncateExportTitle(title: string, maxCharacters: number): string {
  const characters = Array.from(title)
  if (characters.length <= maxCharacters) return title

  const minimumBoundary = Math.max(0, maxCharacters - 15)
  for (let index = maxCharacters - 1; index >= minimumBoundary; index--) {
    if (/\s/u.test(characters[index])) return characters.slice(0, index).join('').trimEnd()
    if (/[.!?,;:。！？，；：、]/u.test(characters[index])) return characters.slice(0, index + 1).join('').trimEnd()
  }
  return characters.slice(0, maxCharacters).join('')
}

function legalizeFilenameTitle(title: string): string {
  let legalized = title
    .replace(/^\.+/, '')
    .replace(/[. ]+$/g, '')
    .trim()
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(legalized)) legalized = `_${legalized}`
  return legalized
}

function sanitizeFilenameTitle(title: string): string {
  const sanitized = legalizeFilenameTitle(cleanExportFilenameText(title)
    .replace(/[<>:"|?*\\/]/g, '')
    .replace(/\.\./g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\s+/g, ' ')
    .trim())
  return legalizeFilenameTitle(truncateExportTitle(sanitized, 60)) || 'session'
}

function truncateUtf8(value: string, maxBytes: number): string {
  let result = ''
  let bytes = 0
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8')
    if (bytes + characterBytes > maxBytes) break
    result += character
    bytes += characterBytes
  }
  return result
}

function exportDateSegment(createdAt: string): string {
  const parsed = new Date(createdAt)
  const date = Number.isFinite(parsed.getTime()) ? parsed : new Date()
  const year = ((date.getFullYear() % 100) + 100) % 100
  return `${String(year).padStart(2, '0')}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
}

function exportFilenameBase(title: string, createdAt: string): string {
  const dateSegment = exportDateSegment(createdAt)
  const largestFixed = `${dateSegment}_ (${EXPORT_FILENAME_ATTEMPTS}).md`
  const titleBytes = EXPORT_FILENAME_MAX_BYTES - Buffer.byteLength(largestFixed, 'utf8')
  let truncatedTitle = legalizeFilenameTitle(truncateUtf8(title, Math.max(0, titleBytes)))
  if (Buffer.byteLength(truncatedTitle, 'utf8') > titleBytes) {
    truncatedTitle = legalizeFilenameTitle(truncateUtf8(truncatedTitle, Math.max(0, titleBytes)))
  }
  truncatedTitle ||= 'session'
  return `${dateSegment}_${truncatedTitle}`
}

function exportFilename(base: string, attempt: number): string {
  const numericSuffix = attempt === 1 ? '' : ` (${attempt})`
  return `${base}${numericSuffix}.md`
}

function renderSessionMarkdown(title: string, agent: AgentId, sessionId: string, createdAt: string, messages: Message[]): string {
  const lines = [
    `# ${title.replace(/\s+/g, ' ').trim() || 'session'}`,
    '',
    `- Agent: ${agent}`,
    `- Session ID: ${sessionId}`,
  ]
  if (createdAt) lines.push(`- Created: ${createdAt}`)

  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue
    lines.push('', `## ${message.role === 'user' ? 'User' : 'Assistant'}`, '')
    if (message.content) lines.push(message.content)
    for (const tool of message.toolUses || []) {
      lines.push(`- Tool: ${tool.summary.replace(/[\r\n]+/g, ' ')}`)
    }
  }
  return `${lines.join('\n')}\n`
}

interface ExportSuccess { ok: true; path: string }
interface ExportFailure { ok: false; error: string; message: string }

function exportError(error: string, message: string): NodeJS.ErrnoException {
  return structuredError(error, message)
}

function exportTempName(): string {
  exportTempCounter = (exportTempCounter + 1) >>> 0
  return `.export-tmp-${process.pid}-${Date.now()}-${exportTempCounter}`
}

function exportFailure(error: unknown): ExportFailure {
  const candidate = error as NodeJS.ErrnoException
  return {
    ok: false,
    error: candidate?.code || 'export-session-failed',
    message: candidate?.message || String(error),
  }
}

function writeExportSessionWithRenameFallback(
  markdown: string,
  filenameBase: string,
  destination: string,
): ExportSuccess {
  let candidatePath = ''
  let tempPath = ''
  let reserved = false
  for (let attempt = 1; attempt <= EXPORT_FILENAME_ATTEMPTS; attempt++) {
    candidatePath = path.join(destination, exportFilename(filenameBase, attempt))
    let fd: number
    try {
      fd = fs.openSync(candidatePath, 'wx')
    } catch (error: any) {
      if (error?.code === 'EEXIST') continue
      throw exportError('export-file-open-failed', error?.message || `Could not reserve export file: ${candidatePath}`)
    }
    reserved = true
    try {
      fs.closeSync(fd)
      break
    } catch (error: any) {
      try { fs.closeSync(fd) } catch { /* preserve the primary close failure */ }
      try { fs.unlinkSync(candidatePath) } catch { /* preserve the primary close failure */ }
      reserved = false
      throw exportError('export-file-close-failed', error?.message || `Could not close reserved export file: ${candidatePath}`)
    }
  }
  if (!reserved) throw exportError('export-name-exhausted', `Could not allocate an unused export filename after ${EXPORT_FILENAME_ATTEMPTS} attempts`)

  tempPath = path.join(destination, exportTempName())
  try {
    fs.writeFileSync(tempPath, markdown, { encoding: 'utf8', flag: 'wx' })
    // Filesystems without usable hard links retain this narrow empty-file window;
    // accepting it keeps export available while preserving no-clobber allocation.
    fs.renameSync(tempPath, candidatePath)
    tempPath = ''
    reserved = false
  } catch (error: any) {
    throw exportError('export-file-write-failed', error?.message || `Could not write export file: ${candidatePath}`)
  } finally {
    if (tempPath) {
      try { fs.unlinkSync(tempPath) } catch { /* already renamed or never written */ }
    }
    if (reserved) {
      try { fs.unlinkSync(candidatePath) } catch { /* preserve the primary export failure */ }
    }
  }
  return { ok: true, path: path.resolve(candidatePath) }
}

function writeExportSession(
  connector: SessionConnector,
  session: IndexedSession,
  sessionId: string,
  destination: string,
  messages: Message[],
): ExportSuccess {
  const title = resolvedExportTitle(session)
  const filenameTitle = sanitizeFilenameTitle(title)
  const filenameBase = exportFilenameBase(filenameTitle, session.createdAt)
  const markdown = renderSessionMarkdown(title, connector.id, sessionId, session.createdAt, messages)
  let candidatePath = ''
  let tempPath = path.join(destination, exportTempName())
  try {
    fs.writeFileSync(tempPath, markdown, { encoding: 'utf8', flag: 'wx' })
  } catch (error: any) {
    try { fs.unlinkSync(tempPath) } catch { /* never created or preserve the primary write failure */ }
    throw exportError('export-file-write-failed', error?.message || `Could not write export temp file: ${tempPath}`)
  }

  try {
    for (let attempt = 1; attempt <= EXPORT_FILENAME_ATTEMPTS; attempt++) {
      candidatePath = path.join(destination, exportFilename(filenameBase, attempt))
      try {
        fs.linkSync(tempPath, candidatePath)
      } catch (error: any) {
        if (error?.code === 'EEXIST') continue
        if (EXPORT_LINK_FALLBACK_CODES.has(error?.code)) {
          try {
            fs.unlinkSync(tempPath)
            tempPath = ''
          } catch (unlinkError: any) {
            throw exportError('export-file-write-failed', unlinkError?.message || `Could not remove export temp file: ${tempPath}`)
          }
          return writeExportSessionWithRenameFallback(markdown, filenameBase, destination)
        }
        throw exportError('export-file-open-failed', error?.message || `Could not allocate export file: ${candidatePath}`)
      }
      try {
        fs.unlinkSync(tempPath)
        tempPath = ''
      } catch { /* final hard link is complete; retry in finally, then leave it for the orphan-temp sweep */ }
      return { ok: true, path: path.resolve(candidatePath) }
    }
    throw exportError('export-name-exhausted', `Could not allocate an unused export filename after ${EXPORT_FILENAME_ATTEMPTS} attempts`)
  } finally {
    if (tempPath) try { fs.unlinkSync(tempPath) } catch { /* preserve the primary export failure */ }
  }
}

function findExportSession(connector: SessionConnector, sessions: IndexedSession[], scopeKey: string, sessionId: string): IndexedSession {
  const candidates = sessions.filter(session => session.id === sessionId
    && (connector.id === 'codex' || session.attributionKey === scopeKey))
  const session = candidates.find(candidate => candidate.partition === 'active') || candidates[0]
  if (!session) throw exportError('export-session-not-indexed', `Session does not exist in the connector index: ${sessionId}`)
  return session
}

function exportIndex(connector: SessionConnector): IndexedSession[] {
  const sessions = connector.indexSessions(false)
  if (!Array.isArray(sessions)) fail('export-index-output-invalid', 'Connector index output is not an array')
  return sessions
}

async function cmdExportSession(connector: SessionConnector, scopeKey: string, sessionId: string, dest: string, allowOutsideHome: boolean) {
  const destination = prepareExportDestination(dest, allowOutsideHome)
  const messages = await connector.readSession(scopeKey, sessionId)
  if (!Array.isArray(messages)) fail('export-session-output-invalid', 'Connector session output is not an array')
  const sessions = exportIndex(connector)
  try {
    const session = findExportSession(connector, sessions, scopeKey, sessionId)
    output(writeExportSession(connector, session, sessionId, destination, messages))
  } catch (error) {
    const failure = exportFailure(error)
    fail(failure.error, failure.message)
  }
}

// --- Subcommands ---
function cmdBuildIndex(refresh: boolean) {
  output(buildIndex(refresh))
}

function cmdListUnder(rootPath: string, partition?: string) {
  if (partition && partition !== 'active' && partition !== 'archive') {
    fail('invalid-partition', 'Partition must be active or archive')
  }
  const sessions = buildIndex().filter(session => (!partition || session.partition === partition) && isUnder(rootPath, session.rootPath))
  output(sessions)
}

function cmdListProjects() {
  const grouped = new Map<string, Project>()
  for (const session of buildIndex().filter(item => item.partition === 'active')) {
    const existing = grouped.get(session.attributionKey)
    if (existing) existing.sessionCount++
    else grouped.set(session.attributionKey, { path: session.rootPath, encodedPath: session.attributionKey, sessionCount: 1 })
  }
  output([...grouped.values()].sort((a, b) => b.sessionCount - a.sessionCount))
}

function cmdListSessions(encodedPath: string) {
  validateEncodedPath(encodedPath)
  output(buildIndex().filter(session => session.partition === 'active' && session.attributionKey === encodedPath).map(toLegacySession))
}

async function forEachTranscriptLine(filePath: string, visit: (line: string) => boolean | void | Promise<boolean | void>) {
  const input = fs.createReadStream(filePath, { encoding: 'utf-8' })
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      if (await visit(line) === false) break
    }
  } finally {
    lines.close()
    input.destroy()
  }
}

async function cmdReadSession(encodedPath: string, sessionId: string) {
  validateEncodedPath(encodedPath)
  validateSessionId(sessionId)

  const activePath = path.join(PROJECTS_DIR, encodedPath, `${sessionId}.jsonl`)
  const archivePath = path.join(ARCHIVE_DIR, encodedPath, `${sessionId}.jsonl`)
  let filePath = ''
  for (const [root, candidate] of [[PROJECTS_DIR, activePath], [ARCHIVE_DIR, archivePath]]) {
    try {
      assertSafePartitionPath(root, candidate)
      const stat = fs.lstatSync(candidate)
      if (stat.isSymbolicLink() || !stat.isFile()) fail('read-failed', `Session path is not a regular file: ${candidate}`)
      filePath = candidate
      break
    } catch (error: any) {
      if (error?.code !== 'ENOENT') fail('read-failed', error?.message || `Could not inspect session file: ${candidate}`)
    }
  }
  if (!filePath) fail('not-found', `Session does not exist: ${activePath}`)

  const messages: Message[] = []
  let outputBytes = 2

  try {
    await forEachTranscriptLine(filePath, line => {
      try {
        if (Buffer.byteLength(line, 'utf-8') > READ_SESSION_MAX_OUTPUT_BYTES) {
          fail('session-output-too-large', `Parsed session output exceeds ${READ_SESSION_MAX_OUTPUT_BYTES} bytes`)
        }
        const msg = parseMessage(JSON.parse(line))
        if (msg) {
          const messageBytes = Buffer.byteLength(JSON.stringify(msg), 'utf-8') + (messages.length ? 1 : 0)
          if (outputBytes + messageBytes > READ_SESSION_MAX_OUTPUT_BYTES) {
            fail('session-output-too-large', `Parsed session output exceeds ${READ_SESSION_MAX_OUTPUT_BYTES} bytes`)
          }
          outputBytes += messageBytes
          messages.push(msg)
        }
      } catch { /* skip corrupt or partial records */ }
    })
  } catch (error: any) {
    fail('read-failed', error?.message || `Could not read session file: ${filePath}`)
  }
  return messages
}

function cmdMoveSession(encodedPath: string, sessionId: string, direction: 'archive' | 'restore', force = false) {
  validateEncodedPath(encodedPath)
  validateSessionId(sessionId)

  const sourceRoot = direction === 'archive' ? PROJECTS_DIR : ARCHIVE_DIR
  const destRoot = direction === 'archive' ? ARCHIVE_DIR : PROJECTS_DIR
  const sourceDir = path.join(sourceRoot, encodedPath)
  const destDir = path.join(destRoot, encodedPath)
  const sourceJsonPath = path.join(sourceDir, `${sessionId}.jsonl`)
  const destJsonPath = path.join(destDir, `${sessionId}.jsonl`)
  const sourceArtifactPath = path.join(sourceDir, sessionId)
  const destArtifactPath = path.join(destDir, sessionId)

  try {
    assertSafePartitionPath(sourceRoot, sourceJsonPath)
    assertSafePartitionPath(sourceRoot, sourceArtifactPath)
    assertSafePartitionPath(destRoot, destJsonPath)
    assertSafePartitionPath(destRoot, destArtifactPath)
  } catch (error: any) {
    output(mutationFailure(error?.code === 'unsafe-path' ? 'unsafe-path' : 'path-inspection-failed', error?.message || 'Could not validate session paths'))
    return
  }

  let sourceStat: fs.Stats
  try {
    sourceStat = fs.lstatSync(sourceJsonPath)
    if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) throw new Error('not a regular file')
  } catch {
    output(mutationFailure('session-not-found', `Source session does not exist: ${sourceJsonPath}`))
    return
  }

  if (lstatIfExists(destJsonPath)) {
    output(mutationFailure('collision', `Destination already exists: ${destJsonPath}`))
    return
  }
  const sourceArtifactStat = lstatIfExists(sourceArtifactPath)
  const destArtifactStat = lstatIfExists(destArtifactPath)
  if (sourceArtifactStat && !sourceArtifactStat.isDirectory()) {
    output(mutationFailure('unsafe-path', `Source artifact path is not a directory: ${sourceArtifactPath}`))
    return
  }
  if (destArtifactStat && !destArtifactStat.isDirectory()) {
    output(mutationFailure('unsafe-path', `Destination artifact path is not a directory: ${destArtifactPath}`))
    return
  }
  if (sourceArtifactStat && destArtifactStat) {
    output(mutationFailure('artifact-collision', `Source and destination artifact directories both exist: ${sourceArtifactPath}; ${destArtifactPath}`))
    return
  }

  // Revalidate both registry liveness and the source immediately before mutation.
  const liveRegistry = readLiveRegistry()
  try {
    assertSafePartitionPath(sourceRoot, sourceJsonPath)
    assertSafePartitionPath(sourceRoot, sourceArtifactPath)
    assertSafePartitionPath(destRoot, destJsonPath)
    assertSafePartitionPath(destRoot, destArtifactPath)
    sourceStat = fs.lstatSync(sourceJsonPath)
    if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) throw new Error('not a regular file')
  } catch (error: any) {
    if (error?.code === 'unsafe-path') {
      output(mutationFailure('unsafe-path', error.message))
      return
    }
    output(mutationFailure('session-not-found', `Source session disappeared before move: ${sourceJsonPath}`))
    return
  }
  const liveEntry = liveRegistry.get(sessionId)
  if (!force && liveEntry) {
    const attributionNote = liveEntry.cwd && encodeRootPath(liveEntry.cwd) === encodedPath
      ? ''
      : '; registry attribution is unverified, so the session UUID match is skipped conservatively'
    output(mutationFailure('session-live', `Session has a validated live registry entry and cannot be ${direction === 'archive' ? 'archived' : 'restored'} while live${attributionNote}`))
    return
  }
  if (direction === 'archive' && !force && Date.now() - sourceStat.mtimeMs < LIVE_WINDOW_MS) {
    output(mutationFailure('possibly-live', 'Session was modified within the last 60 seconds; retry with --force after confirmation'))
    return
  }

  try {
    fs.mkdirSync(destDir, { recursive: true })
    assertSafePartitionPath(destRoot, destJsonPath)
    assertSafePartitionPath(destRoot, destArtifactPath)
  } catch (error: any) {
    output(mutationFailure(error?.code === 'unsafe-path' ? 'unsafe-path' : 'destination-create-failed', error?.message || `Could not create destination: ${destDir}`))
    return
  }

  let restoreTempPath: string | null = null
  if (direction === 'restore') {
    restoreTempPath = path.join(destDir, `.${sessionId}.restore-${process.pid}-${Date.now()}`)
    try {
      assertSafePartitionPath(destRoot, restoreTempPath)
      if (sourceStat.dev !== fs.statSync(destDir).dev) {
        const error: NodeJS.ErrnoException = new Error(`Cross-filesystem moves are not supported: ${sourceJsonPath} -> ${destJsonPath}`)
        error.code = 'cross-filesystem-not-supported'
        throw error
      }
      injectedFault('restore-touch')
      fs.copyFileSync(sourceJsonPath, restoreTempPath, fs.constants.COPYFILE_EXCL)
      const tempStat = fs.lstatSync(restoreTempPath)
      if (tempStat.isSymbolicLink() || !tempStat.isFile()) unsafePath(`Restore temporary path is not a regular file: ${restoreTempPath}`)
      const now = new Date()
      touchOpenedFile(restoreTempPath, tempStat, now, now)
      injectedFault('restore-post-touch')
      const revalidated = fs.lstatSync(sourceJsonPath)
      if (revalidated.isSymbolicLink() || !revalidated.isFile()
        || revalidated.dev !== sourceStat.dev || revalidated.ino !== sourceStat.ino
        || revalidated.size !== sourceStat.size || revalidated.mtimeMs !== sourceStat.mtimeMs) {
        unsafePath(`Session file changed while preparing restore: ${sourceJsonPath}`)
      }
    } catch (error: any) {
      if (restoreTempPath) try { fs.unlinkSync(restoreTempPath) } catch { /* not created or already removed */ }
      output(mutationFailure(
        error?.code === 'cross-filesystem-not-supported' ? 'cross-filesystem-not-supported' : 'restore-touch-failed',
        error?.message || 'Could not prepare restored session timestamp',
      ))
      return
    }
  }

  try {
    assertSafePartitionPath(sourceRoot, sourceJsonPath)
    assertSafePartitionPath(sourceRoot, sourceArtifactPath)
    assertSafePartitionPath(destRoot, destJsonPath)
    assertSafePartitionPath(destRoot, destArtifactPath)
  } catch (error: any) {
    if (restoreTempPath) try { fs.unlinkSync(restoreTempPath) } catch { /* already removed */ }
    output(mutationFailure(error?.code === 'unsafe-path' ? 'unsafe-path' : 'path-inspection-failed', error?.message || 'Could not revalidate session paths'))
    return
  }

  let artifactMoved = false
  try {
    artifactMoved = movePath(sourceArtifactPath, destArtifactPath, true)
  } catch (error: any) {
    if (restoreTempPath) try { fs.unlinkSync(restoreTempPath) } catch { /* already removed */ }
    const moveError = error?.code === 'collision'
      ? 'artifact-collision'
      : error?.code === 'cross-filesystem-not-supported'
        ? 'cross-filesystem-not-supported'
        : 'artifact-move-failed'
    output(mutationFailure(moveError, error?.message || 'Could not move session artifacts'))
    return
  }

  let jsonPublished = false
  try {
    injectedFault('move-jsonl')
    if (direction === 'restore') {
      if (!restoreTempPath) throw new Error('Restore temporary file is unavailable')
      if (hasInjectedFault('restore-publish-collision')) fs.writeFileSync(destJsonPath, 'concurrent destination\n', { flag: 'wx' })
      fs.linkSync(restoreTempPath, destJsonPath)
      jsonPublished = true
      fs.unlinkSync(restoreTempPath)
      restoreTempPath = null
      fs.unlinkSync(sourceJsonPath)
    } else if (!movePath(sourceJsonPath, destJsonPath, false)) {
      throw new Error(`Source session disappeared before move: ${sourceJsonPath}`)
    }
  } catch (error: any) {
    if (restoreTempPath) try { fs.unlinkSync(restoreTempPath) } catch { /* already removed */ }
    let jsonRollbackFailed = false
    if (direction === 'restore' && jsonPublished && lstatIfExists(sourceJsonPath) && lstatIfExists(destJsonPath)) {
      try { fs.unlinkSync(destJsonPath) } catch { jsonRollbackFailed = true }
    }
    const reason = error?.message || 'Could not move session jsonl'
    const moveError = error?.code === 'collision' || error?.code === 'EEXIST'
      ? 'collision'
      : error?.code === 'cross-filesystem-not-supported'
        ? 'cross-filesystem-not-supported'
        : 'jsonl-move-failed'
    if (artifactMoved) {
      try {
        injectedFault('rollback-artifact')
        if (!movePath(destArtifactPath, sourceArtifactPath, true)) throw new Error(`Artifact rollback destination already exists: ${sourceArtifactPath}`)
        if (jsonRollbackFailed) {
          output(mutationPartial('jsonl-rollback', destJsonPath, sourceArtifactPath, 'jsonl-rollback-failed', reason))
          return
        }
        output(mutationFailure(moveError, reason))
        return
      } catch (rollbackError: any) {
        output(mutationPartial(
          'artifact-rollback',
          lstatIfExists(destJsonPath) ? destJsonPath : sourceJsonPath,
          lstatIfExists(sourceArtifactPath) ? sourceArtifactPath : destArtifactPath,
          'artifact-rollback-failed',
          `${reason}; artifact rollback failed: ${rollbackError?.message || 'unknown rollback error'}`,
        ))
        return
      }
    }

    if (jsonRollbackFailed) {
      output(mutationPartial('jsonl-rollback', destJsonPath, sourceArtifactPath, 'jsonl-rollback-failed', reason))
      return
    }
    if (lstatIfExists(destArtifactPath) && !lstatIfExists(sourceArtifactPath)) {
      output(mutationPartial('jsonl-move', sourceJsonPath, destArtifactPath, 'jsonl-move-failed', reason))
    } else {
      output(mutationFailure(moveError, reason))
    }
    return
  }

  try {
    injectedFault('cache-write')
    updateMovedCache(sourceJsonPath, destJsonPath, sessionId, encodedPath, direction === 'archive' ? 'archive' : 'active')
    output({ outcome: 'success', cacheRefreshed: true } satisfies MutationResult)
  } catch {
    output({ outcome: 'success', cacheRefreshed: false } satisfies MutationResult)
  }
}

function cmdDeleteArchived(encodedPath: string, sessionId: string, force = false) {
  validateEncodedPath(encodedPath)
  validateSessionId(sessionId)

  const archiveDir = path.join(ARCHIVE_DIR, encodedPath)
  const jsonPath = path.join(archiveDir, `${sessionId}.jsonl`)
  const artifactPath = path.join(archiveDir, sessionId)
  try {
    assertSafePartitionPath(ARCHIVE_DIR, jsonPath)
    assertSafePartitionPath(ARCHIVE_DIR, artifactPath)
    const jsonStat = fs.lstatSync(jsonPath)
    if (jsonStat.isSymbolicLink() || !jsonStat.isFile()) throw new Error('not a regular file')
    const artifactStat = lstatIfExists(artifactPath)
    if (artifactStat && !artifactStat.isDirectory()) unsafePath(`Artifact path is not a directory: ${artifactPath}`)
  } catch (error: any) {
    if (error?.code === 'unsafe-path') {
      output(mutationFailure('unsafe-path', error.message))
      return
    }
    output(mutationFailure('archived-session-not-found', `Archived session does not exist: ${jsonPath}`))
    return
  }

  const liveEntry = readLiveRegistry().get(sessionId)
  try {
    assertSafePartitionPath(ARCHIVE_DIR, jsonPath)
    assertSafePartitionPath(ARCHIVE_DIR, artifactPath)
    const jsonStat = fs.lstatSync(jsonPath)
    if (jsonStat.isSymbolicLink() || !jsonStat.isFile()) throw new Error('not a regular file')
    const artifactStat = lstatIfExists(artifactPath)
    if (artifactStat && !artifactStat.isDirectory()) unsafePath(`Artifact path is not a directory: ${artifactPath}`)
  } catch (error: any) {
    if (error?.code === 'unsafe-path') {
      output(mutationFailure('unsafe-path', error.message))
      return
    }
    output(mutationFailure('archived-session-not-found', `Archived session disappeared before deletion: ${jsonPath}`))
    return
  }
  if (!force && liveEntry) {
    const attributionNote = liveEntry.cwd && encodeRootPath(liveEntry.cwd) === encodedPath
      ? ''
      : '; registry attribution is unverified, so the session UUID match is skipped conservatively'
    output(mutationFailure('session-live', `Session has a validated live registry entry and cannot be deleted while live${attributionNote}`))
    return
  }

  let artifactDeleted = false
  if (lstatIfExists(artifactPath)) {
    try {
      fs.rmSync(artifactPath, { recursive: true, force: false })
      artifactDeleted = true
    } catch (error: any) {
      output(mutationFailure('artifact-delete-failed', error?.message || 'Could not delete archived session artifacts'))
      return
    }
  }
  try {
    injectedFault('delete-jsonl')
    fs.unlinkSync(jsonPath)
  } catch (error: any) {
    const message = error?.message || 'Could not delete archived session jsonl'
    if (artifactDeleted) output(mutationPartial('jsonl-delete', jsonPath, artifactPath, 'jsonl-delete-failed', message))
    else output(mutationFailure('jsonl-delete-failed', message))
    return
  }
  try {
    injectedFault('cache-write')
    dropCachedEntry(jsonPath)
    output({ outcome: 'success', cacheRefreshed: true } satisfies MutationResult)
  } catch {
    output({ outcome: 'success', cacheRefreshed: false } satisfies MutationResult)
  }
}

function extractSearchTexts(line: string): string[] {
  try {
    const obj = JSON.parse(line)
    if (obj.type === 'user' && typeof obj.message?.content === 'string') return [obj.message.content]
    if (obj.type === 'assistant' && Array.isArray(obj.message?.content)) {
      return obj.message.content
        .filter((block: any) => block.type === 'text' && typeof block.text === 'string')
        .map((block: any) => block.text)
    }
  } catch {}
  return []
}

function searchSnippet(text: string, matchIndex: number, needleLength: number): string {
  const start = Math.max(0, matchIndex - 60)
  const end = Math.min(text.length, matchIndex + needleLength + 60)
  return text.slice(start, end).trim()
}

async function cmdSearch(query: string, scope?: string) {
  const sessions = buildIndex().filter(session => session.partition === 'active' && (!scope || isUnder(scope, session.rootPath)))
  const results: SearchResult[] = []
  const needle = query.toLocaleLowerCase()

  for (const session of sessions) {
    if (results.length >= 20) break
    const filePath = path.join(PROJECTS_DIR, session.attributionKey, `${session.id}.jsonl`)
    let matchText = ''

    try {
      assertSafePartitionPath(PROJECTS_DIR, filePath)
      const stat = fs.lstatSync(filePath)
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Session path is not a regular file: ${filePath}`)
      await forEachTranscriptLine(filePath, line => {
        if (!line.toLocaleLowerCase().includes(needle)) return
        for (const text of extractSearchTexts(line)) {
          const matchIndex = text.toLocaleLowerCase().indexOf(needle)
          if (matchIndex === -1) continue
          matchText = searchSnippet(text, matchIndex, query.length)
          return false
        }
      })
    } catch {
      continue
    }

    if (matchText) results.push({ session, match: matchText })
  }
  output(results)
}

function cmdListRecent(limit = 30) {
  output(buildIndex().filter(session => session.partition === 'active').slice(0, limit).map(toLegacySession))
}

const claudeCodeConnector: SessionConnector = {
  id: 'claude-code',
  capabilities: {
    archive: true,
    // No rename write path exists.
    rename: false,
    delete: true,
    deleteRequiresArchived: true,
    nativeIndex: false,
    tokenStats: false,
    originFilter: false,
  },
  resume: { argv: ['claude', '--resume'] },
  isAvailable: () => {
    try {
      path.resolve(PROJECTS_DIR)
      return { available: true, degraded: false }
    } catch (error: any) {
      return {
        available: false,
        degraded: false,
        reason: `Claude Code projects directory could not be resolved${error?.message ? `: ${error.message}` : ''}`,
      }
    }
  },
  buildIndex: refresh => cmdBuildIndex(refresh),
  indexSessions: refresh => buildIndex(refresh),
  listUnder: (rootPath, partition) => cmdListUnder(rootPath, partition),
  listProjects: () => cmdListProjects(),
  listSessions: scopeKey => cmdListSessions(scopeKey),
  readSession: (scopeKey, sessionId) => cmdReadSession(scopeKey, sessionId),
  moveSession: (scopeKey, sessionId, direction, force) => cmdMoveSession(scopeKey, sessionId, direction, force),
  deleteArchived: (scopeKey, sessionId, force) => cmdDeleteArchived(scopeKey, sessionId, force),
  search: (query, scope) => cmdSearch(query, scope),
  listRecent: limit => cmdListRecent(limit),
}

const CONNECTORS: SessionConnector[] = [claudeCodeConnector, codexConnector]

function findConnector(args: string[]): { connector: SessionConnector; rest: string[] } {
  const parsed = findOption(args, '--agent')
  const agent = parsed.value || 'claude-code'
  const connector = CONNECTORS.find(candidate => candidate.id === agent)
  if (!connector) fail('invalid-arguments', `Unknown agent: ${agent}`)
  return { connector, rest: parsed.rest }
}

function cmdAgents() {
  output(CONNECTORS.map(connector => {
    const availability = connector.isAvailable()
    return {
      id: connector.id,
      available: availability.available,
      ...(!availability.available && availability.reason ? { unavailableReason: availability.reason } : {}),
      ...(connector.id === 'codex' ? { degraded: availability.degraded } : {}),
      ...(availability.degraded && availability.reason ? { degradedReason: availability.reason } : {}),
      capabilities: connector.capabilities,
      resume: connector.resume,
    }
  }))
}

function cmdListDirs(dirPath: string) {
  const resolved = dirPath.replace(/^~/, HOME)
  try {
    const stat = fs.statSync(resolved)
    if (!stat.isDirectory()) {
      output({ error: 'not-directory', message: `Path is not a directory: ${resolved}` })
      return
    }
  } catch (error: any) {
    output({
      error: error?.code === 'ENOENT' ? 'not-found' : 'unreadable-directory',
      message: error?.message || `Could not access directory: ${resolved}`,
    })
    return
  }

  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true })
    const dirs: { name: string; path: string }[] = []
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.claude') continue
      const entryPath = path.join(resolved, entry.name)
      if (entry.isDirectory()) dirs.push({ name: entry.name, path: entryPath })
      else if (entry.isSymbolicLink()) {
        try {
          if (fs.statSync(entryPath).isDirectory()) dirs.push({ name: entry.name, path: entryPath })
        } catch { /* ignore broken or inaccessible symlinks */ }
      }
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name))
    output({ dirs })
  } catch (error: any) {
    output({ error: 'unreadable-directory', message: error?.message || `Could not list directory: ${resolved}` })
  }
}

function cmdCheckDir(dirPath: string) {
  validateAbsolutePath(dirPath)
  try {
    const stat = fs.statSync(dirPath)
    output({ exists: true, dir: stat.isDirectory() })
  } catch {
    output({ exists: false, dir: false })
  }
}

// --- Main ---
async function main() {
  const [,, subcommand, ...args] = process.argv

  switch (subcommand) {
  case 'agents':
    if (args.length) fail('invalid-arguments', 'Usage: agents')
    cmdAgents()
    break
  case 'build-index': {
    const { connector, rest } = findConnector(args)
    const unknown = rest.filter(arg => arg !== '--refresh')
    if (unknown.length) fail('invalid-arguments', 'Usage: build-index [--refresh]')
    connector.buildIndex(rest.includes('--refresh'))
    break
  }
  case 'list-under': {
    const { connector, rest } = findConnector(args)
    const parsed = findOption(rest, '--partition')
    if (parsed.rest.length !== 1) fail('invalid-arguments', 'Usage: list-under <realRootPath> [--partition active|archive]')
    connector.listUnder(parsed.rest[0], parsed.value)
    break
  }
  case 'list-projects': {
    const { connector } = findConnector(args)
    connector.listProjects()
    break
  }
  case 'list-sessions': {
    const { connector, rest } = findConnector(args)
    if (rest.length !== 1) fail('invalid-arguments', 'Usage: list-sessions <encodedPath>')
    connector.listSessions(rest[0])
    break
  }
  case 'read-session': {
    const { connector, rest } = findConnector(args)
    if (rest.length !== 2) fail('invalid-arguments', 'Usage: read-session <encodedPath> <sessionId>')
    output(await connector.readSession(rest[0], rest[1]))
    break
  }
  case 'export-session': {
    const { connector, rest } = findConnector(args)
    const parsed = findOption(rest, '--dest')
    const allowOutsideHome = parsed.rest.includes('--allow-outside-home')
    const positionals = parsed.rest.filter(arg => arg !== '--allow-outside-home')
    if (!parsed.value || parsed.value.startsWith('--') || positionals.length !== 2
      || parsed.rest.filter(arg => arg === '--allow-outside-home').length > 1) {
      fail('invalid-arguments', 'Usage: export-session <scopeKey> <sessionId> --dest <dir> [--agent codex] [--allow-outside-home]')
    }
    await cmdExportSession(connector, positionals[0], positionals[1], parsed.value, allowOutsideHome)
    break
  }
  case 'archive': {
    const parsed = findConnector(args)
    const force = parsed.rest.includes('--force')
    const rest = parsed.rest.filter(arg => arg !== '--force')
    if (rest.length !== 2 || parsed.rest.filter(arg => arg === '--force').length > 1) fail('invalid-arguments', 'Usage: archive <encodedPath> <sessionId> [--force]')
    parsed.connector.moveSession(rest[0], rest[1], 'archive', force)
    break
  }
  case 'restore': {
    const { connector, rest } = findConnector(args)
    if (rest.length !== 2) fail('invalid-arguments', 'Usage: restore <encodedPath> <sessionId>')
    connector.moveSession(rest[0], rest[1], 'restore')
    break
  }
  case 'delete-archived': {
    const parsed = findConnector(args)
    const force = parsed.rest.includes('--force')
    const rest = parsed.rest.filter(arg => arg !== '--force')
    if (rest.length !== 2 || parsed.rest.filter(arg => arg === '--force').length > 1) fail('invalid-arguments', 'Usage: delete-archived <encodedPath> <sessionId> [--force]')
    parsed.connector.deleteArchived(rest[0], rest[1], force)
    break
  }
  case 'search': {
    const { connector, rest } = findConnector(args)
    const parsed = findOption(rest, '--scope')
    if (parsed.rest.length === 0) fail('invalid-arguments', 'Usage: search <query> [--scope <realRootPath>]')
    await connector.search(parsed.rest.join(' '), parsed.value)
    break
  }
  case 'list-recent': {
    const { connector, rest } = findConnector(args)
    if (rest.length > 1) fail('invalid-arguments', 'Usage: list-recent [limit]')
    connector.listRecent(rest[0] ? parseInt(rest[0], 10) : 30)
    break
  }
  case 'list-dirs':
    if (args.length !== 1) fail('invalid-arguments', 'Usage: list-dirs <path>')
    cmdListDirs(args[0])
    break
  case 'check-dir':
    if (args.length !== 1) fail('invalid-arguments', 'Usage: check-dir <absolutePath>')
    cmdCheckDir(args[0])
    break
  case 'classify-export-destination':
    if (args.length !== 1) fail('invalid-arguments', 'Usage: classify-export-destination <path>')
    console.log(JSON.stringify({ outsideHome: isExportDestinationOutsideHome(args[0]) }))
    break
  default:
    fail('unknown-subcommand', `Unknown subcommand: ${subcommand || ''}`)
  }
}

void main().catch((error: any) => fail('command-failed', error?.message || String(error)))
