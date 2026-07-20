import type { PluginContext, PluginExports } from '../../plugin-api/index'
import {
  initIcons,
  IconArchive,
  IconArchiveRestore,
  IconArrowDown,
  IconArrowLeft,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClaude,
  IconCopy,
  IconCornerUpRight,
  IconDownload,
  IconEye,
  IconFileText,
  IconFolder,
  IconFolderDown,
  IconGlobe,
  IconHash,
  IconPencil,
  IconPin,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconTerminal,
  IconTrash2,
  IconUser,
  IconX,
  IconZap,
} from './icons'
import { initI18n, normalizeLocaleSetting, resolveLocale, translate, type LocaleSetting, type PluginLocale } from './i18n'

export type SessionPartition = 'active' | 'archive'
export type AgentId = 'claude-code' | 'codex'

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
  partition: SessionPartition
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

export interface TranscriptToolUse {
  name: string
  summary: string
  filePath?: string
  oldString?: string
  newString?: string
  content?: string
  replaceAll?: boolean
}

export interface TranscriptMessage {
  uuid: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  model?: string
  toolUses?: TranscriptToolUse[]
}

export interface SessionPathTreeNode {
  path: string
  name: string
  directActiveCount: number
  directArchiveCount: number
  activeCount: number
  archiveCount: number
  newestLastActiveAt: string
  children: SessionPathTreeNode[]
}

interface MutableTreeNode extends Omit<SessionPathTreeNode, 'children'> {
  childrenByName: Map<string, MutableTreeNode>
}

interface PaneWidths {
  left: number
  middle: number
}

export type SessionSortField = 'idle' | 'created' | 'msgcount'
export type SortDirection = 'asc' | 'desc'
export type TimeRangeFilter = 'all' | '24h' | '7d' | '30d' | 'older-15d' | 'older-30d'

export interface SessionSortSetting {
  field: SessionSortField
  direction: SortDirection
}

export type PartitionSortSettings = Record<SessionPartition, SessionSortSetting>

export interface SessionListFilters {
  partition: SessionPartition
  scopePath: string
  scopeMode: 'subtree' | 'exact'
  timeRange: TimeRangeFilter
  branch: string
  query: string
  createdFrom?: string
  createdTo?: string
  lastActiveFrom?: string
  lastActiveTo?: string
}

export interface DateRange { from: string; to: string }
export type BulkAction = 'archive' | 'restore' | 'delete' | 'export'
export type BulkItemStatus = 'done' | 'failed' | 'skipped'
export interface BulkItemResult {
  key: string
  session: IndexedSession
  status: BulkItemStatus
  reason?: string
  retaggedKey?: string
}
export interface BulkRunResult {
  results: BulkItemResult[]
  done: number
  failed: number
  skipped: number
  rebuildRequired: boolean
  cancelled: boolean
  earlyAborted?: boolean
}

interface SearchResult {
  session: IndexedSession
  match: string
}

interface SearchOverlay {
  query: string
  scopePath: string | null
  results: SearchResult[]
  selectedSessionId: string | null
}

interface CommittedSelection {
  path: string
  mode: 'subtree' | 'exact'
  sessionId: string | null
}

interface FolderPin {
  path: string
  addedAt: number
  exists: boolean
  matchKeys?: string[]
}

interface PinsState extends SelectionState {
  pins: FolderPin[]
  loading: boolean
  error: string | null
  corruptSidecar: string | null
  collapsed: boolean
  conflictNote: boolean
  activePath: string | null
}

type PinMutationIntent =
  | { type: 'add'; path: string }
  | { type: 'remove'; paths: string[] }
  | { type: 'move'; path: string; direction: 'up' | 'down' }
  | { type: 'promote'; paths: string[] }
  | { type: 'reset-corrupt' }

interface QueuedPinMutation {
  mount: MountContext
  agent: AgentId
  generation: number
  intent: PinMutationIntent
}

interface CliFailure {
  error: string
  message: string
}

type PickerTarget = 'tree-root' | 'export-destination'

interface ConnectorCapabilities {
  archive: boolean
  rename: boolean
  delete: boolean
  deleteRequiresArchived: boolean
  nativeIndex: boolean
  tokenStats: boolean
  originFilter: boolean
}

interface AgentDescriptor {
  id: AgentId
  available: boolean
  degraded?: boolean
  unavailableReason?: string
  degradedReason?: string
  capabilities: ConnectorCapabilities
  resume: { argv: string[] }
}

interface MutationReason {
  error: string
  message: string
}

type MutationResult =
  | { outcome: 'success'; cacheRefreshed: boolean }
  | { outcome: 'failure'; reason: MutationReason }
  | { outcome: 'partial'; stage: string; jsonlPath: string; artifactPath: string; reason: MutationReason }

export interface SelectionState { selected: Set<string>; anchor: string | null }
export type SelectionAction =
  | { type: 'toggle'; key: string; plain?: boolean }
  | { type: 'shift-range'; key: string; pageKeys: string[] }
  | { type: 'snapshot-all'; keys: string[] }
  | { type: 'intersect'; keys: string[] }
  | { type: 'clear-partition' }
  | { type: 'clear-anchor' }
  | { type: 'reconcile'; succeeded: string[]; retagged?: Record<string, string> }

interface DirectoryEntry { name: string; path: string }
type ListDirsResult = { dirs: DirectoryEntry[] } | { error: string; message: string }

interface MountContext {
  active: boolean
  generation: number
  indexGeneration: number
  searchGeneration: number
  displayGeneration: number
  paneGeneration: number
  sortGeneration: number
  treeGeneration: number
  pinsGeneration: number
  disposers: Set<() => void>
  highlightTimer: ReturnType<typeof setTimeout> | null
  copiedTimer: ReturnType<typeof setTimeout> | null
  transcriptFrame: number | null
  transcriptLoadToken: number
  pickerRequestSeq: number
  pickerValidationSeq: number
  allTranscriptMessages: TranscriptMessage[]
  rootResizeObserver: ResizeObserver | null
  localeObserver: MutationObserver | null
  pinsNoteTimer: ReturnType<typeof setTimeout> | null
}

const STORAGE_KEYS = {
  locale: 'locale',
  activeAgent: 'activeAgent',
  fontScale: 'fontScale',
  themeFollowHost: 'themeFollowHost',
  paneWidths: 'paneWidths',
  treeRoot: 'treeRoot',
  treeExpandedPaths: 'treeExpandedPaths',
  hideScriptedSessions: 'hideScriptedSessions',
  exportDestination: 'exportDestination',
  sessionListSort: 'sessionListSort',
  pageSize: 'pageSize',
  pinsCollapsed: 'pinsCollapsed',
} as const

const DEFAULT_PANE_WIDTHS: PaneWidths = { left: 280, middle: 360 }
const DEFAULT_EXPORT_DESTINATION = '~/Downloads'
export const DEFAULT_PARTITION_SORT: PartitionSortSettings = {
  active: { field: 'idle', direction: 'asc' },
  archive: { field: 'idle', direction: 'asc' },
}
const MIN_LEFT_WIDTH = 190
const MAX_LEFT_WIDTH = 520
export const TRANSCRIPT_BATCH_SIZE = 50
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FONT_SCALE_MULTIPLIERS: Record<number, number> = { 1: 0.85, 2: 0.93, 3: 1, 4: 1.1, 5: 1.25 }
export const PAGE_SIZES = [20, 50, 100] as const
const AGENT_AGNOSTIC = new Set(['list-dirs', 'check-dir', 'classify-export-destination', 'agents'])
const DEFAULT_AGENT: AgentId = 'claude-code'
const UNAVAILABLE_CAPABILITIES: ConnectorCapabilities = {
  archive: false,
  rename: false,
  delete: false,
  deleteRequiresArchived: true,
  nativeIndex: true,
  tokenStats: false,
  originFilter: false,
}
const LEGACY_CAPABILITIES: ConnectorCapabilities = {
  archive: true,
  // No rename write path exists.
  rename: false,
  delete: true,
  deleteRequiresArchived: true,
  nativeIndex: false,
  tokenStats: false,
  originFilter: false,
}
const DEFAULT_RESUME_ARGV_BY_AGENT = new Map<AgentId, readonly string[]>([
  ['claude-code', ['claude', '--resume']],
  ['codex', ['codex', 'resume']],
])
const LEGACY_RESUME = { argv: ['claude', '--resume'] }
const RESUME_ARG_TOKEN_RE = /^[A-Za-z0-9_@%+=:,./-]+$/

type Translate = ReturnType<typeof initI18n>['t']
type CompactView = 'tree' | 'list' | 'detail'

function localizedExportError(failure: Pick<CliFailure, 'error'>, destination: string, t: Translate): string {
  switch (failure.error) {
  case 'export-destination-outside-home':
    return t('export-error-destination-outside-home', { path: destination })
  case 'export-destination-not-directory':
    return t('export-error-destination-not-directory', { path: destination })
  case 'export-destination-not-writable':
    return t('export-error-destination-not-writable', { path: destination })
  case 'export-destination-create-failed':
    return t('export-error-destination-create-failed', { path: destination })
  case 'export-destination-inspection-failed':
    return t('export-error-destination-inspection-failed', { path: destination })
  case 'export-destination-resolve-failed':
    return t('export-error-destination-resolve-failed', { path: destination })
  case 'export-home-resolve-failed':
    return t('export-error-home-resolve-failed', { path: destination })
  case 'export-file-open-failed':
    return t('export-error-file-open-failed')
  case 'export-file-close-failed':
    return t('export-error-file-close-failed')
  case 'export-file-write-failed':
    return t('export-error-file-write-failed')
  case 'export-name-exhausted':
    return t('export-error-name-exhausted')
  case 'export-session-not-indexed':
    return t('export-error-session-not-indexed')
  case 'export-index-output-invalid':
    return t('export-error-index-output-invalid')
  case 'export-session-output-invalid':
    return t('export-error-session-output-invalid')
  case 'export-session-failed':
    return t('export-error-session-failed')
  default:
    return t('export-error-generic')
  }
}

export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function stripInjected(text: string): string {
  for (let iteration = 0; iteration < 5; iteration++) {
    const stripped = text
      .replace(/<system-reminder>[\s\S]*?(?:<\/system-reminder>|$)/g, '')
      .replace(/<local-command-stdout>[\s\S]*?(?:<\/local-command-stdout>|$)/g, '')
    if (stripped === text) break
    text = stripped
  }
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function cleanFirstPrompt(text: string): string {
  const commandName = text.match(/<command-name>([\s\S]*?)<\/command-name>/)
  if (commandName) {
    const name = stripInjected(commandName[1]).replace(/^\//, '')
    const args = stripInjected(text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1] || '')
    return `${name} ${args}`.trim()
  }
  return stripInjected(text)
}

export function resolveSessionTitles(session: Pick<IndexedSession, 'title' | 'aiTitle' | 'customTitle'>): { primary: string; secondary?: string } {
  const ai = session.aiTitle?.trim() || undefined
  const custom = session.customTitle?.trim() || undefined
  return {
    primary: ai ?? custom ?? cleanFirstPrompt(session.title),
    secondary: ai && custom ? custom : undefined,
  }
}

export function resolveSessionTitle(session: Pick<IndexedSession, 'title' | 'aiTitle' | 'customTitle'>): string {
  return resolveSessionTitles(session).primary
}

export function nextTranscriptBatchEnd(total: number, rendered: number, batchSize = TRANSCRIPT_BATCH_SIZE): number {
  if (!Number.isFinite(total) || !Number.isFinite(rendered) || !Number.isFinite(batchSize) || batchSize <= 0) return 0
  return Math.min(Math.max(0, Math.floor(total)), Math.max(0, Math.floor(rendered)) + Math.floor(batchSize))
}

function normalizePath(value: string): string {
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

export function normalizePinMatchKey(value: string): string {
  return normalizePath(value.normalize('NFC').toLowerCase())
}

export function normalizeStoredTreeRoot(value: unknown): string | null {
  return typeof value === 'string' ? normalizePath(value) : null
}

export function normalizeStoredExpandedPaths(value: unknown): Set<string> | null {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) return null
  return new Set(value.map(item => normalizePath(item)))
}

function parentPath(value: string): string {
  const normalized = normalizePath(value)
  if (normalized === '/') return '/'
  const slash = normalized.lastIndexOf('/')
  return slash <= 0 ? '/' : normalized.slice(0, slash)
}

function pathName(value: string): string {
  const normalized = normalizePath(value)
  return normalized === '/' ? '/' : normalized.slice(normalized.lastIndexOf('/') + 1)
}

function isPathWithin(rootPath: string, candidatePath: string): boolean {
  const root = normalizePath(rootPath)
  const candidate = normalizePath(candidatePath)
  return root === '/' || candidate === root || candidate.startsWith(`${root}/`)
}

function timestampValue(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export function sessionKey(session: Pick<IndexedSession, 'partition' | 'attributionKey' | 'id'>): string {
  return `${session.partition}\0${session.attributionKey}\0${session.id}`
}

export function normalizeDateRange(range: DateRange): DateRange {
  return range.from && range.to && range.from > range.to
    ? { from: range.to, to: range.from }
    : range
}

export function localDateBounds(range: DateRange): { from: number | null; toExclusive: number | null } {
  const parse = (value: string, nextDay: boolean): number | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!match) return null
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + (nextDay ? 1 : 0))
    return date.getTime()
  }
  return {
    from: range.from ? parse(range.from, false) : null,
    toExclusive: range.to ? parse(range.to, true) : null,
  }
}

export function dateRangeMatches(timestamp: string, range: DateRange): boolean {
  if (!range.from && !range.to) return true
  const value = Date.parse(timestamp)
  if (Number.isNaN(value)) return false
  const bounds = localDateBounds(range)
  return (bounds.from === null || value >= bounds.from) && (bounds.toExclusive === null || value < bounds.toExclusive)
}

export function commitAbsoluteLastActiveRange(timeRange: TimeRangeFilter, range: DateRange): { timeRange: TimeRangeFilter; range: DateRange } {
  const normalized = normalizeDateRange(range)
  return { timeRange: normalized.from || normalized.to ? 'all' : timeRange, range: normalized }
}

export function commitDurationTimeRange(value: TimeRangeFilter, range: DateRange): { timeRange: TimeRangeFilter; range: DateRange } {
  return { timeRange: value, range: value === 'all' ? range : { from: '', to: '' } }
}

export function clampPage(page: number, total: number, pageSize: number): number {
  const maxPage = Math.max(1, Math.ceil(Math.max(0, total) / pageSize))
  return Math.min(maxPage, Math.max(1, Math.floor(page) || 1))
}

export function parseCliFailure(stderr: string, fallback: string): CliFailure {
  const trimmed = stderr.trim()
  const lines = trimmed.split(/\r?\n/).filter(line => line.trim())
  const candidates = [lines.at(-1)?.trim(), trimmed].filter((value, index, values): value is string => (
    Boolean(value) && values.indexOf(value) === index
  ))
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<CliFailure>
      return {
        error: typeof parsed.error === 'string' ? parsed.error : '',
        message: typeof parsed.message === 'string' ? parsed.message : fallback,
      }
    } catch { /* try the next representation */ }
  }
  return { error: '', message: trimmed || fallback }
}

export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  if (action.type === 'clear-partition') return { selected: new Set(), anchor: null }
  if (action.type === 'clear-anchor') return { selected: new Set(state.selected), anchor: null }
  if (action.type === 'intersect') {
    const allowed = new Set(action.keys)
    return { selected: new Set([...state.selected].filter(key => allowed.has(key))), anchor: null }
  }
  if (action.type === 'snapshot-all') return { selected: new Set(action.keys), anchor: state.anchor }
  if (action.type === 'reconcile') {
    const succeeded = new Set(action.succeeded)
    const next = new Set<string>()
    for (const key of state.selected) {
      if (!succeeded.has(key)) next.add(key)
    }
    return { selected: next, anchor: null }
  }
  const selected = new Set(state.selected)
  if (action.type === 'toggle') {
    if (selected.has(action.key)) selected.delete(action.key)
    else selected.add(action.key)
    return { selected, anchor: action.plain === false ? state.anchor : action.key }
  }
  const anchorIndex = state.anchor ? action.pageKeys.indexOf(state.anchor) : -1
  const targetIndex = action.pageKeys.indexOf(action.key)
  if (anchorIndex < 0 || targetIndex < 0) {
    if (selected.has(action.key)) selected.delete(action.key)
    else selected.add(action.key)
    return { selected, anchor: state.anchor }
  }
  const shouldSelect = !selected.has(action.key)
  for (const key of action.pageKeys.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)) {
    if (shouldSelect) selected.add(key)
    else selected.delete(key)
  }
  return { selected, anchor: state.anchor }
}

const MAX_EXPORT_SEGMENT_BYTES = 255
const EXPORT_COLLISION_SUFFIX_BYTES = 9

function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder()
  if (encoder.encode(value).length <= maxBytes) return value
  let truncated = ''
  let bytes = 0
  for (const character of value) {
    const characterBytes = encoder.encode(character).length
    if (bytes + characterBytes > maxBytes) break
    truncated += character
    bytes += characterBytes
  }
  return truncated
}

function legalizeExportProjectName(value: string): string {
  let legalized = value
    .replace(/^\.+/, '')
    .replace(/[. ]+$/g, '')
    .trim()
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(legalized)) legalized = `_${legalized}`
  return legalized
}

function sanitizeExportProjectName(value: string, fallback: string): string {
  const sanitized = legalizeExportProjectName(value
    .replace(/[<>:"|?*\\/]/g, '')
    .replace(/\.\./g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\s+/g, ' ')
    .trim())
  const legalizedFallback = legalizeExportProjectName(fallback)
  return legalizeExportProjectName(truncateUtf8(
    sanitized || legalizedFallback,
    MAX_EXPORT_SEGMENT_BYTES - EXPORT_COLLISION_SUFFIX_BYTES,
  )) || legalizedFallback
}

function exportProjectName(rootPath: string, fallback: string): string {
  const lastSegment = rootPath.split(/[\\/]/).filter(Boolean).at(-1) || ''
  return sanitizeExportProjectName(lastSegment, fallback)
}

function stablePathSuffix(rootPath: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < rootPath.length; index += 1) {
    hash ^= rootPath.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function exportProjectNameKey(name: string): string {
  return name.normalize('NFC').toLowerCase().normalize('NFC')
}

function exportProjectNameWithSuffix(name: string, suffix: string): string {
  const suffixWithSeparator = `-${suffix}`
  const suffixBytes = new TextEncoder().encode(suffixWithSeparator).length
  return `${truncateUtf8(name, MAX_EXPORT_SEGMENT_BYTES - suffixBytes)}${suffixWithSeparator}`
}

function bulkExportProjectNames(items: IndexedSession[], fallback: string): Map<string, string> {
  const rootsByName = new Map<string, Array<{ name: string; rootPath: string }>>()
  for (const rootPath of new Set(items.map(item => item.rootPath))) {
    const name = exportProjectName(rootPath, fallback)
    const nameKey = exportProjectNameKey(name)
    rootsByName.set(nameKey, [...(rootsByName.get(nameKey) || []), { name, rootPath }])
  }
  const names = new Map<string, string>()
  const reservedNames = new Set([...rootsByName].flatMap(([nameKey, roots]) => roots.length === 1 ? [nameKey] : []))
  const usedNames = new Set(reservedNames)
  const sortedGroups = [...rootsByName].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
  for (const [, roots] of sortedGroups) {
    if (roots.length === 1) {
      names.set(roots[0].rootPath, roots[0].name)
      continue
    }
    for (const { name, rootPath } of [...roots].sort((left, right) => (
      left.rootPath < right.rootPath ? -1 : left.rootPath > right.rootPath ? 1 : 0
    ))) {
      const hash = stablePathSuffix(rootPath)
      const hashedName = exportProjectNameWithSuffix(name, hash)
      let uniqueName = hashedName
      let attempt = 2
      while (usedNames.has(exportProjectNameKey(uniqueName))) uniqueName = exportProjectNameWithSuffix(name, `${hash}-${attempt++}`)
      usedNames.add(exportProjectNameKey(uniqueName))
      names.set(rootPath, uniqueName)
    }
  }
  return names
}

function bulkExportTimestamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(now.getFullYear() % 100)}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function joinExportDestination(destination: string, ...segments: string[]): string {
  const separator = destination.includes('\\') && !destination.includes('/') ? '\\' : '/'
  const base = destination.replace(/[\\/]+$/, '')
  return `${base || separator}${base ? separator : ''}${segments.join(separator)}`
}

function exportAgentFolderName(agent: string): string {
  const agentName = agent === 'claude-code' ? 'claude' : agent
  return sanitizeExportProjectName(`${agentName}_exp`, 'agent_exp')
}

function singleExportFolderName(): string {
  return sanitizeExportProjectName('single files', 'single files')
}

async function isExportDestinationOutsideHome(
  destination: string,
  run: (args: string[], timeout?: number) => Promise<{ code: number; stdout: string; stderr: string }>,
): Promise<boolean> {
  const result = await run(['classify-export-destination', destination.trim()], 10_000)
  if (result.code !== 0) throw new Error(result.stderr || 'export destination classification failed')
  const classified = JSON.parse(result.stdout)
  if (typeof classified?.outsideHome !== 'boolean') throw new Error('export destination classification returned an invalid response')
  return classified.outsideHome
}

async function runBulkExport(options: {
  items: IndexedSession[]
  exportDestination?: string
  exportFailureMessage?: string
  invalidExportMessage?: string
  earlyAbortMessage?: string
  unknownProjectName?: string
  exportAgent?: string
  allowOutsideHome?: boolean
  localizeExportError?: (failure: CliFailure, destination: string) => string
  run: (args: string[], timeout?: number) => Promise<{ code: number; stdout: string; stderr: string }>
  isCancelled?: () => boolean
  onProgress?: (completed: number, total: number, session: IndexedSession) => void
}): Promise<BulkRunResult> {
  const destination = options.exportDestination || DEFAULT_EXPORT_DESTINATION
  const invalidResponse = options.invalidExportMessage || translate('en', 'bulk-export-command-failed')
  const earlyAbortReason = options.earlyAbortMessage || translate('en', 'bulk-export-early-abort')
  const unknownProjectName = options.unknownProjectName || translate('en', 'export-unknown-project')
  const projectNames = bulkExportProjectNames(options.items, unknownProjectName)
  const agentFolder = exportAgentFolderName(options.exportAgent || DEFAULT_AGENT)
  const timestamp = bulkExportTimestamp(new Date())
  const destinationsByGroup = new Map<string, string>()
  const results: BulkItemResult[] = []
  let completed = 0
  let consecutiveFailures = 0
  let earlyAborted = false
  for (const session of options.items) {
    const groupKey = JSON.stringify([session.attributionKey, session.rootPath])
    if (!destinationsByGroup.has(groupKey)) {
      const projectName = projectNames.get(session.rootPath) || unknownProjectName
      destinationsByGroup.set(groupKey, joinExportDestination(destination, agentFolder, timestamp, projectName))
    }
  }

  const record = (session: IndexedSession, status: BulkItemStatus, reason?: string) => {
    results.push({ key: sessionKey(session), session, status, reason })
    completed += 1
    options.onProgress?.(completed, options.items.length, session)
  }

  for (let index = 0; index < options.items.length; index += 1) {
    if (options.isCancelled?.()) break
    const session = options.items[index]
    const groupKey = JSON.stringify([session.attributionKey, session.rootPath])
    const groupDestination = destinationsByGroup.get(groupKey)!
    let succeeded = false
    let rawOutput: string | undefined
    try {
      const executed = await options.run([
        'export-session',
        session.attributionKey,
        session.id,
        '--dest',
        groupDestination,
        ...(options.allowOutsideHome ? ['--allow-outside-home'] : []),
      ], 30_000)
      rawOutput = executed.stdout
      if (executed.code !== 0) {
        const failure = parseCliFailure(executed.stderr, options.exportFailureMessage || translate('en', 'bulk-export-command-failed'))
        console.warn(failure)
        record(session, 'failed', options.localizeExportError?.(failure, groupDestination) || failure.message)
      } else {
        let exported: any
        let malformed = false
        try {
          exported = JSON.parse(executed.stdout)
        } catch (caught) {
          console.warn(caught, executed.stdout)
          record(session, 'failed', invalidResponse)
          malformed = true
        }
        if (!malformed) {
          if (exported?.ok === true && typeof exported.path === 'string' && exported.path) {
            record(session, 'done')
            succeeded = true
          } else if (exported?.ok === false && typeof exported.error === 'string') {
            const failure = {
              error: exported.error,
              message: typeof exported.message === 'string' ? exported.message : options.exportFailureMessage || invalidResponse,
            }
            console.warn(exported)
            record(session, 'failed', options.localizeExportError?.(failure, groupDestination) || failure.message)
          } else {
            console.warn(exported)
            record(session, 'failed', invalidResponse)
          }
        }
      }
    } catch (caught: any) {
      console.warn(caught, rawOutput)
      const failure = { error: '', message: invalidResponse }
      record(session, 'failed', options.localizeExportError?.(failure, groupDestination) || invalidResponse)
    }

    consecutiveFailures = succeeded ? 0 : consecutiveFailures + 1
    if (options.isCancelled?.()) break
    if (consecutiveFailures === 5 && index + 1 < options.items.length) {
      earlyAborted = true
      for (const untried of options.items.slice(index + 1)) record(untried, 'skipped', earlyAbortReason)
      break
    }
  }

  return {
    results,
    done: results.filter(result => result.status === 'done').length,
    failed: results.filter(result => result.status === 'failed').length,
    skipped: results.filter(result => result.status === 'skipped').length,
    rebuildRequired: false,
    cancelled: results.length < options.items.length,
    earlyAborted,
  }
}

export async function runBulkSerial(options: {
  action: BulkAction
  items: IndexedSession[]
  exportDestination?: string
  exportFailureMessage?: string
  invalidExportMessage?: string
  earlyAbortMessage?: string
  unknownProjectName?: string
  exportAgent?: string
  allowOutsideHome?: boolean
  localizeExportError?: (failure: CliFailure, destination: string) => string
  run: (args: string[], timeout?: number) => Promise<{ code: number; stdout: string; stderr: string }>
  isCancelled?: () => boolean
  onProgress?: (completed: number, total: number, session: IndexedSession) => void
}): Promise<BulkRunResult> {
  if (options.action === 'export') return runBulkExport(options)
  const results: BulkItemResult[] = []
  let rebuildRequired = false
  for (let index = 0; index < options.items.length; index += 1) {
    if (options.isCancelled?.()) break
    const session = options.items[index]
    const args = options.action === 'delete'
      ? ['delete-archived', session.attributionKey, session.id]
      : [options.action, session.attributionKey, session.id]
    try {
      const executed = await options.run(args)
      if (executed.code !== 0) {
        let reason = executed.stderr || 'command failed'
        try { reason = (JSON.parse(executed.stderr) as MutationReason).message || reason } catch { /* use fallback */ }
        results.push({ key: sessionKey(session), session, status: 'failed', reason })
        continue
      }
      const mutation = JSON.parse(executed.stdout) as MutationResult
      if (mutation.outcome === 'success') {
        if (!mutation.cacheRefreshed) rebuildRequired = true
        const retaggedKey = options.action === 'archive'
          ? sessionKey({ ...session, partition: 'archive' })
          : options.action === 'restore'
            ? sessionKey({ ...session, partition: 'active' })
            : undefined
        results.push({ key: sessionKey(session), session, status: 'done', retaggedKey })
      } else if (mutation.outcome === 'failure' && (mutation.reason.error === 'session-live' || mutation.reason.error === 'possibly-live')) {
        results.push({ key: sessionKey(session), session, status: 'skipped', reason: mutation.reason.message })
      } else {
        if (mutation.outcome === 'partial') rebuildRequired = true
        results.push({ key: sessionKey(session), session, status: 'failed', reason: mutation.reason.message })
      }
    } catch (caught: any) {
      results.push({ key: sessionKey(session), session, status: 'failed', reason: caught?.message || String(caught) })
    } finally {
      if (results.length > index) options.onProgress?.(index + 1, options.items.length, session)
    }
  }
  return {
    results,
    done: results.filter(result => result.status === 'done').length,
    failed: results.filter(result => result.status === 'failed').length,
    skipped: results.filter(result => result.status === 'skipped').length,
    rebuildRequired,
    cancelled: results.length < options.items.length,
  }
}

export function normalizePartitionSortSettings(value: unknown): PartitionSortSettings {
  const saved = value && typeof value === 'object' ? value as Partial<PartitionSortSettings> : {}
  const normalize = (partition: SessionPartition): SessionSortSetting => {
    const setting = saved[partition]
    const field = setting?.field
    const direction = setting?.direction
    return {
      field: field === 'idle' || field === 'created' || field === 'msgcount' ? field : DEFAULT_PARTITION_SORT[partition].field,
      direction: direction === 'asc' || direction === 'desc' ? direction : DEFAULT_PARTITION_SORT[partition].direction,
    }
  }
  return { active: normalize('active'), archive: normalize('archive') }
}

export function sortSessions(items: IndexedSession[], setting: SessionSortSetting): IndexedSession[] {
  const direction = setting.direction === 'asc' ? 1 : -1
  return [...items].sort((left, right) => {
    let comparison = 0
    if (setting.field === 'idle') comparison = timestampValue(right.lastActiveAt) - timestampValue(left.lastActiveAt)
    else if (setting.field === 'created') comparison = timestampValue(left.createdAt) - timestampValue(right.createdAt)
    else comparison = (left.messageCount ?? 0) - (right.messageCount ?? 0)
    return comparison * direction || left.title.localeCompare(right.title) || left.id.localeCompare(right.id)
  })
}

export function filterBranchOptions(options: string[], query: string): string[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return options
  return options.filter(option => option.toLocaleLowerCase().includes(normalizedQuery))
}

export function filterSessions(items: IndexedSession[], filters: SessionListFilters, now = Date.now()): IndexedSession[] {
  const query = filters.query.trim().toLocaleLowerCase()
  const ranges: Record<'24h' | '7d' | '30d', number> = {
    '24h': 24 * 60 * 60_000,
    '7d': 7 * 24 * 60 * 60_000,
    '30d': 30 * 24 * 60 * 60_000,
  }
  const staleThresholds: Record<'older-15d' | 'older-30d', number> = {
    'older-15d': 15 * 24 * 60 * 60_000,
    'older-30d': 30 * 24 * 60 * 60_000,
  }
  return items.filter(session => {
    if (session.partition !== filters.partition) return false
    const sessionPath = normalizePath(session.rootPath)
    const inScope = filters.scopeMode === 'exact'
      ? sessionPath === normalizePath(filters.scopePath)
      : isPathWithin(filters.scopePath, sessionPath)
    if (!inScope) return false
    const idleDuration = now - timestampValue(session.lastActiveAt)
    // Exact boundaries are included by both recency and staleness presets.
    if (filters.timeRange in ranges && idleDuration > ranges[filters.timeRange as keyof typeof ranges]) return false
    if (filters.timeRange in staleThresholds && idleDuration < staleThresholds[filters.timeRange as keyof typeof staleThresholds]) return false
    if (!dateRangeMatches(session.createdAt, { from: filters.createdFrom || '', to: filters.createdTo || '' })) return false
    if (!dateRangeMatches(session.lastActiveAt, { from: filters.lastActiveFrom || '', to: filters.lastActiveTo || '' })) return false
    if (filters.branch && (session.gitBranch || '') !== filters.branch) return false
    const titles = resolveSessionTitles(session)
    if (query && !`${titles.primary}\n${titles.secondary || ''}\n${session.gitBranch || ''}`.toLocaleLowerCase().includes(query)) return false
    return true
  })
}

export function deepestCommonAncestor(rootPaths: string[]): string {
  const normalized = rootPaths.map(normalizePath)
  if (normalized.length === 0) return '/'
  const split = normalized.map(value => value.split('/').filter(Boolean))
  const common: string[] = []
  const shortest = Math.min(...split.map(parts => parts.length))

  for (let index = 0; index < shortest; index += 1) {
    const segment = split[0][index]
    if (!split.every(parts => parts[index] === segment)) break
    common.push(segment)
  }
  return common.length ? `/${common.join('/')}` : '/'
}

function newerTimestamp(current: string, candidate: string): string {
  if (!current) return candidate
  if (!candidate) return current
  const currentTime = Date.parse(current)
  const candidateTime = Date.parse(candidate)
  if (Number.isNaN(candidateTime)) return current
  if (Number.isNaN(currentTime) || candidateTime > currentTime) return candidate
  return current
}

/**
 * Build the visible sparse cwd tree. Every returned directory either owns a
 * session or is an ancestor of one; unrelated and empty directories never
 * appear. Counts and newest activity are aggregated over each node's subtree.
 */
export function deriveSessionPathTree(
  sessions: IndexedSession[],
  visibleRoot = deepestCommonAncestor(sessions.map(session => session.rootPath)),
): SessionPathTreeNode | null {
  const rootPath = normalizePath(visibleRoot)
  const scoped = sessions.filter(session => isPathWithin(rootPath, session.rootPath))
  if (scoped.length === 0) return null

  const makeNode = (nodePath: string): MutableTreeNode => ({
    path: nodePath,
    name: pathName(nodePath),
    directActiveCount: 0,
    directArchiveCount: 0,
    activeCount: 0,
    archiveCount: 0,
    newestLastActiveAt: '',
    childrenByName: new Map(),
  })

  const root = makeNode(rootPath)
  for (const session of scoped) {
    const sessionPath = normalizePath(session.rootPath)
    const relativeParts = sessionPath === rootPath
      ? []
      : sessionPath.slice(rootPath === '/' ? 1 : rootPath.length + 1).split('/').filter(Boolean)
    const chain = [root]
    let node = root
    let currentPath = rootPath

    for (const segment of relativeParts) {
      currentPath = currentPath === '/' ? `/${segment}` : `${currentPath}/${segment}`
      let child = node.childrenByName.get(segment)
      if (!child) {
        child = makeNode(currentPath)
        node.childrenByName.set(segment, child)
      }
      node = child
      chain.push(node)
    }

    if (session.partition === 'active') node.directActiveCount += 1
    else node.directArchiveCount += 1

    for (const ancestor of chain) {
      if (session.partition === 'active') ancestor.activeCount += 1
      else ancestor.archiveCount += 1
      ancestor.newestLastActiveAt = newerTimestamp(ancestor.newestLastActiveAt, session.lastActiveAt)
    }
  }

  const freezeNode = (node: MutableTreeNode): SessionPathTreeNode => ({
    path: node.path,
    name: node.name,
    directActiveCount: node.directActiveCount,
    directArchiveCount: node.directArchiveCount,
    activeCount: node.activeCount,
    archiveCount: node.archiveCount,
    newestLastActiveAt: node.newestLastActiveAt,
    children: Array.from(node.childrenByName.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(freezeNode),
  })

  return freezeNode(root)
}

function formatRelativeTime(timestamp: string, t: Translate, now = Date.now()): string {
  const time = Date.parse(timestamp)
  if (Number.isNaN(time)) return t('relative-unknown')
  const elapsed = Math.max(0, now - time)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (elapsed < minute) return t('relative-now')
  if (elapsed < hour) return t('relative-minutes', { n: Math.floor(elapsed / minute) })
  if (elapsed < day) return t('relative-hours', { n: Math.floor(elapsed / hour) })
  if (elapsed < 30 * day) return t('relative-days', { n: Math.floor(elapsed / day) })
  if (elapsed < 365 * day) return t('relative-months', { n: Math.floor(elapsed / (30 * day)) })
  return t('relative-years', { n: Math.floor(elapsed / (365 * day)) })
}

function formatCreatedAt(timestamp: string, locale: PluginLocale, t: Translate): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return t('created-unknown')
  return t('created-at', { date: new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date) })
}

function formatTranscriptTime(timestamp: string, locale: PluginLocale): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatSessionSpan(createdAt: string, lastActiveAt: string, locale: PluginLocale, t: Translate): string {
  const created = new Date(createdAt)
  const last = new Date(lastActiveAt)
  if (Number.isNaN(created.getTime()) || Number.isNaN(last.getTime())) return t('time-span-unknown')
  const format = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
  return `${format.format(created)} → ${format.format(last)}`
}

function idleGrade(timestamp: string): 'bright' | 'neutral' | 'faded' {
  const elapsed = Date.now() - Date.parse(timestamp)
  if (!Number.isFinite(elapsed) || elapsed >= 7 * 24 * 60 * 60_000) return 'faded'
  if (elapsed < 24 * 60 * 60_000) return 'bright'
  return 'neutral'
}

function collectTreePaths(node: SessionPathTreeNode | null, paths = new Set<string>()): Set<string> {
  if (!node) return paths
  paths.add(node.path)
  for (const child of node.children) collectTreePaths(child, paths)
  return paths
}

export function isSafeTranscriptHref(href: string): boolean {
  return /^(?:https?:|mailto:)/i.test(href)
}

export function activate(ctx: PluginContext): PluginExports {
  const h = ctx.h
  initIcons(h)

  const documentLanguage = typeof document === 'undefined' ? '' : document.documentElement.lang
  const localeSetting = ctx.ref<LocaleSetting>('auto')
  const localeRef = ctx.ref<PluginLocale>(resolveLocale('auto', documentLanguage))
  const { t, locale } = initI18n(localeRef)
  const fontScale = ctx.ref(3)
  const activeAgent = ctx.ref<AgentId>(DEFAULT_AGENT)
  const agents = ctx.ref<AgentDescriptor[]>([])
  const themeFollowHost = ctx.ref(true)
  const settingsOpen = ctx.ref(false)
  const sessions = ctx.ref<IndexedSession[]>([])
  const loading = ctx.ref(true)
  const error = ctx.ref<string | null>(null)
  const errorAction = ctx.ref<{ label: string; run: () => void } | null>(null)
  const visibleRoot = ctx.ref('/')
  const committedSelection = ctx.ref<CommittedSelection>({ path: '/', mode: 'subtree', sessionId: null })
  const searchOverlay = ctx.ref<SearchOverlay | null>(null)
  const transientHighlightPath = ctx.ref<string | null>(null)
  const expandedPaths = ctx.ref<Set<string>>(new Set())
  const hideScriptedSessions = ctx.ref(false)
  const exportDestination = ctx.ref(DEFAULT_EXPORT_DESTINATION)
  const showRootPicker = ctx.ref(false)
  const pickerCurrentDir = ctx.ref('/')
  const pickerEntries = ctx.ref<DirectoryEntry[]>([])
  const pickerLoading = ctx.ref(false)
  const pickerError = ctx.ref<string | null>(null)
  const pickerManualPath = ctx.ref('')
  const pickerTarget = ctx.ref<PickerTarget>('tree-root')
  const pickerTriggerRef = ctx.ref<HTMLElement | null>(null)
  const pickerInputRef = ctx.ref<HTMLInputElement | null>(null)
  const paneWidths = ctx.ref<PaneWidths>({ ...DEFAULT_PANE_WIDTHS })
  const activePartition = ctx.ref<SessionPartition>('active')
  const sortSettings = ctx.ref<PartitionSortSettings>(normalizePartitionSortSettings(null))
  const timeRange = ctx.ref<TimeRangeFilter>('all')
  const branchFilter = ctx.ref('')
  const branchPickerOpen = ctx.ref(false)
  const branchPickerQuery = ctx.ref('')
  const branchSearchRef = ctx.ref<HTMLInputElement | null>(null)
  const createdRange = ctx.ref<DateRange>({ from: '', to: '' })
  const lastActiveRange = ctx.ref<DateRange>({ from: '', to: '' })
  const filtersOpen = ctx.ref(false)
  const searchQuery = ctx.ref('')
  const globalSearch = ctx.ref(false)
  const searching = ctx.ref(false)
  const selectedSession = ctx.ref<IndexedSession | null>(null)
  const compactMode = ctx.ref(false)
  const compactView = ctx.ref<CompactView>('list')
  const kbAvoid = ctx.ref(false)
  const kbAvoidW = ctx.ref(0)
  const kbAvoidH = ctx.ref(0)
  const rootRef = ctx.ref<HTMLElement | null>(null)
  const transcriptMessages = ctx.ref<TranscriptMessage[]>([])
  const transcriptLoading = ctx.ref(false)
  const transcriptError = ctx.ref<string | null>(null)
  const expandedTools = ctx.ref<Set<string>>(new Set())
  const copiedSessionId = ctx.ref(false)
  const transcriptScrollRef = ctx.ref<HTMLElement | null>(null)
  const searchInputRef = ctx.ref<HTMLInputElement | null>(null)
  const page = ctx.ref(1)
  const pageSize = ctx.ref<(typeof PAGE_SIZES)[number]>(50)
  const selectMode = ctx.ref(false)
  const selection = ctx.ref<SelectionState>({ selected: new Set(), anchor: null })
  const bulkRunning = ctx.ref(false)
  const bulkCancelRequested = ctx.ref(false)
  const bulkProgress = ctx.ref({ completed: 0, total: 0, title: '' })
  const bulkResult = ctx.ref<BulkRunResult | null>(null)
  const bulkRefreshFailed = ctx.ref(false)
  const pinsSelectMode = ctx.ref(false)
  const pinsSelection = ctx.ref<PinsState>({
    selected: new Set(),
    anchor: null,
    pins: [],
    loading: true,
    error: null,
    corruptSidecar: null,
    collapsed: false,
    conflictNote: false,
    activePath: null,
  })
  const pinsBulkRunning = ctx.ref(false)
  let resizeStartX = 0
  let resizeStartWidth = 0
  let resizeActive = false
  const COMPACT_BASE_WIDTH = 900
  let rootWidth = 0
  let mountGeneration = 0
  let activeMount: MountContext | null = null
  let mutationInFlight = false
  let hasMounted = false
  let warnedPersistFailure = false
  const pinMutationQueue: QueuedPinMutation[] = []
  let pinMutationInFlight = false

  function runAgent(args: string[], opts: Parameters<typeof ctx.exec.run>[1]) {
    if (AGENT_AGNOSTIC.has(args[0])) return ctx.exec.run(args, opts)
    return ctx.exec.run([...args, '--agent', activeAgent.value], opts)
  }

  ctx.commands.register('session-browser.open', () => { ctx.open() })
  ctx.commands.register('session-browser.search', () => {
    ctx.open()
    if (compactMode.value) compactView.value = 'list'
    settingsOpen.value = false
    filtersOpen.value = false
    scheduleMountTimeout(() => searchInputRef.value?.focus(), 0)
  })

  const activeDescriptor = ctx.computed(() => agents.value.find(agent => agent.id === activeAgent.value) || null)
  const activeCapabilities = ctx.computed(() => activeDescriptor.value?.capabilities || UNAVAILABLE_CAPABILITIES)
  const activeResumeArgv = ctx.computed(() => activeDescriptor.value?.resume.argv
    || DEFAULT_RESUME_ARGV_BY_AGENT.get(activeAgent.value)!)
  const originFilteredSessions = ctx.computed(() => sessions.value.filter(session => isSessionVisibleByOrigin(session)))
  const tree = ctx.computed(() => deriveSessionPathTree(originFilteredSessions.value, visibleRoot.value))

  function persist(key: string, value: unknown) {
    ctx.storage.set(key, value).catch((caught: any) => {
      if (warnedPersistFailure) return
      warnedPersistFailure = true
      console.warn('[session-browser] could not persist plugin setting', caught)
    })
  }

  function perAgentStorageKey(key: string, agent = activeAgent.value): string {
    return `${key}:${agent}`
  }

  async function readPerAgentTreeSetting(key: string, agent: AgentId): Promise<unknown> {
    const value = await ctx.storage.get(perAgentStorageKey(key, agent))
    if (value !== undefined || agent !== DEFAULT_AGENT) return value
    return ctx.storage.get(key)
  }

  function isSessionVisibleByOrigin(session: IndexedSession): boolean {
    if (!activeCapabilities.value.originFilter || !hideScriptedSessions.value) return true
    return session.origin !== 'exec' && session.origin !== 'subagent'
  }

  function updatePinsState(patch: Partial<PinsState>) {
    pinsSelection.value = { ...pinsSelection.value, ...patch }
  }

  function reducePinsSelection(action: SelectionAction) {
    pinsSelection.value = {
      ...pinsSelection.value,
      ...selectionReducer(pinsSelection.value, action),
    }
  }

  function pinMatchKeys(pin: FolderPin): Set<string> {
    return new Set(pin.matchKeys?.length
      ? pin.matchKeys
      : [normalizePinMatchKey(pin.path)])
  }

  function currentFolderPin(): FolderPin | undefined {
    const selectedPath = normalizePath(committedSelection.value.path)
    const exact = pinsSelection.value.pins.find(pin => normalizePath(pin.path) === selectedPath)
    if (exact) return exact
    const selectedKey = normalizePinMatchKey(selectedPath)
    return pinsSelection.value.pins.find(pin => pinMatchKeys(pin).has(selectedKey))
  }

  function parsePinsResponse(stdout: string): { pins: FolderPin[]; corruptSidecar: string | null } {
    const parsed = JSON.parse(stdout) as any
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.pins)) {
      throw new Error(t('pin-invalid-response'))
    }
    const pins = parsed.pins.map((pin: any) => {
      const validMatchKeys = pin?.matchKeys === undefined
        || (Array.isArray(pin.matchKeys) && pin.matchKeys.every((key: unknown) => typeof key === 'string'))
      if (!pin || typeof pin.path !== 'string' || typeof pin.addedAt !== 'number'
        || typeof pin.exists !== 'boolean' || !validMatchKeys) {
        throw new Error(t('pin-invalid-response'))
      }
      return {
        path: pin.path,
        addedAt: pin.addedAt,
        exists: pin.exists,
        ...(pin.matchKeys ? { matchKeys: [...pin.matchKeys] } : {}),
      } as FolderPin
    })
    if (parsed.corrupt === true) {
      if (typeof parsed.sidecar !== 'string' || !parsed.sidecar) throw new Error(t('pin-invalid-response'))
      return { pins, corruptSidecar: parsed.sidecar }
    }
    return { pins, corruptSidecar: null }
  }

  function pinPaths(): string[] {
    return pinsSelection.value.pins.map(pin => pin.path)
  }

  function samePinOrder(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((pinPath, index) => pinPath === right[index])
  }

  function showPinConflict(mount: MountContext) {
    updatePinsState({ conflictNote: true })
    if (mount.pinsNoteTimer) clearTimeout(mount.pinsNoteTimer)
    mount.pinsNoteTimer = scheduleMountTimeout(() => {
      if (isActiveMount(mount)) updatePinsState({ conflictNote: false })
      mount.pinsNoteTimer = null
    }, 4_000)
  }

  async function loadPins(requestGeneration?: number, expectedPaths?: string[]): Promise<boolean> {
    const mount = activeMount
    if (!isActiveMount(mount)) return false
    const generation = requestGeneration ?? ++mount.pinsGeneration
    const requestAgent = activeAgent.value
    const isCurrent = () => isActiveMount(mount)
      && generation === mount.pinsGeneration
      && requestAgent === activeAgent.value
    if (isCurrent()) updatePinsState({ loading: true, error: null })
    try {
      const result = await ctx.exec.run(['list-pins', requestAgent], { timeout: 10_000 })
      if (!isCurrent()) return false
      if (result.code !== 0) throw new Error(parseCliFailure(result.stderr, t('pin-list-load-failed')).message)
      const loaded = parsePinsResponse(result.stdout)
      const priorActive = pinsSelection.value.activePath
      const nextActivePath = priorActive !== null && loaded.pins.some(pin => normalizePath(pin.path) === normalizePath(priorActive)) ? priorActive : null
      updatePinsState({
        pins: loaded.pins,
        loading: false,
        error: null,
        corruptSidecar: loaded.corruptSidecar,
        activePath: nextActivePath,
      })
      reducePinsSelection({ type: 'intersect', keys: loaded.pins.map(pin => pin.path) })
      if (expectedPaths && !samePinOrder(expectedPaths, loaded.pins.map(pin => pin.path))) showPinConflict(mount)
      return true
    } catch (caught) {
      console.warn('[session-browser]', caught)
      if (isCurrent()) updatePinsState({ loading: false, error: t('pin-list-load-failed') })
      return false
    } finally {
      if (isCurrent() && pinsSelection.value.loading) updatePinsState({ loading: false })
    }
  }

  function expectedMove(paths: string[], pinPath: string, direction: 'up' | 'down'): string[] {
    const next = [...paths]
    const index = next.indexOf(pinPath)
    if (index < 0) return next
    const target = direction === 'up' ? Math.max(0, index - 1) : Math.min(next.length - 1, index + 1)
    if (target !== index) {
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
    }
    return next
  }

  function comparePinPaths(left: string, right: string): number {
    const leftBase = pathName(left).toLowerCase()
    const rightBase = pathName(right).toLowerCase()
    if (leftBase < rightBase) return -1
    if (leftBase > rightBase) return 1
    return left < right ? -1 : left > right ? 1 : 0
  }

  function expectedPromote(paths: string[], selectedPaths: string[]): string[] {
    const selected = new Set(selectedPaths)
    const promoted = paths.filter(pinPath => selected.has(pinPath)).sort(comparePinPaths)
    return [...promoted, ...paths.filter(pinPath => !selected.has(pinPath))]
  }

  async function reconcilePinsAfterStaleMutation() {
    const mount = activeMount
    if (!isActiveMount(mount)) return
    await loadPins(mount.pinsGeneration)
  }

  async function executePinMutation(task: QueuedPinMutation) {
    const { mount, agent, generation, intent } = task
    const isCurrent = () => isActiveMount(mount)
      && generation === mount.pinsGeneration
      && agent === activeAgent.value
    if (!isCurrent()) return
    const before = pinPaths()
    let args: string[]
    if (intent.type === 'add') args = ['add-pin', agent, intent.path]
    else if (intent.type === 'remove') args = ['remove-pin', agent, ...intent.paths]
    else if (intent.type === 'move') args = ['move-pin', agent, intent.path, intent.direction]
    else if (intent.type === 'promote') args = ['promote-pins', agent, ...intent.paths]
    else args = ['remove-pin', agent, '--reset-corrupt']

    try {
      const result = await ctx.exec.run(args, { timeout: 10_000 })
      if (!isCurrent()) {
        await reconcilePinsAfterStaleMutation()
        return
      }
      if (result.code !== 0) throw new Error(parseCliFailure(result.stderr, t('pin-mutation-failed')).message)
      const parsed = JSON.parse(result.stdout) as any
      let expected = before
      let expectedAfterReload: string[] | undefined = before
      if (intent.type === 'add') {
        if (typeof parsed?.canonicalPath !== 'string' || (parsed.outcome !== 'applied' && parsed.outcome !== 'duplicate')) {
          throw new Error(t('pin-invalid-response'))
        }
        expected = parsed.outcome === 'applied'
          ? [parsed.canonicalPath, ...before.filter(pinPath => pinPath !== parsed.canonicalPath)]
          : before
      } else if (intent.type === 'move') {
        if (parsed?.outcome !== 'applied' && parsed?.outcome !== 'absent') throw new Error(t('pin-invalid-response'))
        expected = parsed.outcome === 'applied' ? expectedMove(before, intent.path, intent.direction) : before
      } else {
        if (!Array.isArray(parsed?.results) || typeof parsed.changed !== 'boolean') throw new Error(t('pin-invalid-response'))
        if (intent.type === 'remove') {
          const removed = new Set(parsed.results
            .filter((item: any) => item?.outcome === 'applied' && typeof item.path === 'string')
            .map((item: any) => item.path))
          expected = before.filter(pinPath => !removed.has(pinPath))
        } else if (intent.type === 'promote') {
          expected = expectedPromote(before, intent.paths)
        } else {
          expected = []
          if (!parsed.changed) expectedAfterReload = undefined
        }
      }
      if (expectedAfterReload !== undefined) expectedAfterReload = expected
      if (!isCurrent()) return
      await loadPins(generation, expectedAfterReload)
    } catch (caught) {
      console.warn('[session-browser]', caught)
      if (!isCurrent()) await reconcilePinsAfterStaleMutation()
      else {
        showError(t('pin-mutation-failed'))
        await loadPins(generation)
      }
    }
  }

  async function drainPinMutationQueue() {
    if (pinMutationInFlight) return
    pinMutationInFlight = true
    try {
      while (pinMutationQueue.length > 0) {
        const task = pinMutationQueue.shift()!
        const current = isActiveMount(task.mount)
          && task.generation === task.mount.pinsGeneration
          && task.agent === activeAgent.value
        if (!current) continue
        pinsBulkRunning.value = true
        await executePinMutation(task)
        if (current && task.generation === task.mount.pinsGeneration && task.agent === activeAgent.value) {
          pinsBulkRunning.value = false
        }
      }
    } finally {
      pinMutationInFlight = false
      const mount = activeMount
      if (isActiveMount(mount) && pinMutationQueue.length === 0) pinsBulkRunning.value = false
    }
  }

  function enqueuePinMutation(intent: PinMutationIntent) {
    const mount = activeMount
    if (!isActiveMount(mount)) return
    pinMutationQueue.push({ mount, agent: activeAgent.value, generation: mount.pinsGeneration, intent })
    pinsBulkRunning.value = true
    void drainPinMutationQueue()
  }

  async function persistPinsCollapsed(collapsed: boolean) {
    try {
      await ctx.storage.set(STORAGE_KEYS.pinsCollapsed, collapsed)
      const verified = await ctx.storage.get(STORAGE_KEYS.pinsCollapsed)
      if (verified !== collapsed) console.warn('[session-browser]', t('pin-collapse-persist-warning'))
    } catch (caught) {
      console.warn('[session-browser]', t('pin-collapse-persist-warning'), caught)
    }
  }

  function createMountContext(): MountContext {
    return {
      active: false,
      generation: ++mountGeneration,
      indexGeneration: 0,
      searchGeneration: 0,
      displayGeneration: 0,
      paneGeneration: 0,
      sortGeneration: 0,
      treeGeneration: 0,
      pinsGeneration: 0,
      disposers: new Set(),
      highlightTimer: null,
      copiedTimer: null,
      transcriptFrame: null,
      transcriptLoadToken: 0,
      pickerRequestSeq: 0,
      pickerValidationSeq: 0,
      allTranscriptMessages: [],
      rootResizeObserver: null,
      localeObserver: null,
      pinsNoteTimer: null,
    }
  }

  function isActiveMount(mount: MountContext | null): mount is MountContext {
    return Boolean(mount?.active && activeMount?.generation === mount.generation)
  }

  function addMountDisposer(mount: MountContext, dispose: () => void) {
    mount.disposers.add(dispose)
  }

  function scheduleMountTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout> | null {
    const mount = activeMount
    if (!isActiveMount(mount)) return null
    let handle: ReturnType<typeof setTimeout>
    const dispose = () => clearTimeout(handle)
    handle = setTimeout(() => {
      mount.disposers.delete(dispose)
      if (isActiveMount(mount)) callback()
    }, delay)
    addMountDisposer(mount, dispose)
    return handle
  }

  function scheduleMountFrame(mount: MountContext, callback: () => void): number | null {
    if (!isActiveMount(mount)) return null
    let handle: number
    const dispose = () => cancelAnimationFrame(handle)
    handle = requestAnimationFrame(() => {
      mount.disposers.delete(dispose)
      if (isActiveMount(mount)) callback()
    })
    addMountDisposer(mount, dispose)
    return handle
  }

  function persistExpandedPaths() {
    persist(perAgentStorageKey(STORAGE_KEYS.treeExpandedPaths), Array.from(expandedPaths.value))
  }

  function setHideScriptedSessions(value: boolean) {
    hideScriptedSessions.value = value
    persist(perAgentStorageKey(STORAGE_KEYS.hideScriptedSessions), value)
    clearSearchOverlay()
    if (selectedSession.value && !isSessionVisibleByOrigin(selectedSession.value)) {
      committedSelection.value = { ...committedSelection.value, sessionId: null }
      resetTranscript()
    }
    applyFilterChange()
  }

  function setExportDestination(value: string) {
    if (activeMount) activeMount.displayGeneration++
    exportDestination.value = value.trim() || DEFAULT_EXPORT_DESTINATION
    persist(STORAGE_KEYS.exportDestination, exportDestination.value)
  }

  function setLocaleSetting(value: unknown) {
    if (activeMount) activeMount.displayGeneration++
    localeSetting.value = normalizeLocaleSetting(value)
    localeRef.value = resolveLocale(localeSetting.value, typeof document === 'undefined' ? '' : document.documentElement.lang)
    persist(STORAGE_KEYS.locale, localeSetting.value)
  }

  function setFontScale(value: number) {
    if (activeMount) activeMount.displayGeneration++
    fontScale.value = Math.min(5, Math.max(1, Math.round(value)))
    updateCompactMode(rootWidth)
    persist(STORAGE_KEYS.fontScale, fontScale.value)
  }

  function updateKbAvoid() {
    const root = rootRef.value
    let active = false
    let w = 0
    let h = 0
    if (root && typeof document !== 'undefined') {
      const btn = document.getElementById('kb-toggle-btn')
      if (btn) {
        const cs = window.getComputedStyle(btn)
        if (cs.display !== 'none' && cs.visibility === 'visible') {
          const br = btn.getBoundingClientRect()
          const rr = root.getBoundingClientRect()
          const overlapW = Math.min(rr.right, br.right) - Math.max(rr.left, br.left)
          const overlapH = Math.min(rr.bottom, br.bottom) - Math.max(rr.top, br.top)
          if (br.width > 0 && br.height > 0 && overlapW > 0 && overlapH > 0) {
            active = true
            w = Math.min(Math.ceil(rr.right - br.left) + 8, Math.ceil(br.width) + 32)
            h = Math.min(Math.ceil(rr.bottom - br.top) + 8, Math.ceil(br.height) + 32)
          }
        }
      }
    }
    if (kbAvoid.value === active && kbAvoidW.value === w && kbAvoidH.value === h) return
    kbAvoid.value = active
    kbAvoidW.value = w
    kbAvoidH.value = h
  }

  function updateCompactMode(width: number) {
    rootWidth = width
    const multiplier = FONT_SCALE_MULTIPLIERS[fontScale.value] || 1
    const nextCompact = width < COMPACT_BASE_WIDTH * multiplier
    if (nextCompact !== compactMode.value) {
      compactMode.value = nextCompact
      settingsOpen.value = false
      filtersOpen.value = false
      stopResize()
      if (nextCompact) compactView.value = selectedSession.value ? 'detail' : 'list'
    }
    updateKbAvoid()
  }

  function observeRootElement(mount: MountContext, element: HTMLElement) {
    updateCompactMode(element.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    mount.rootResizeObserver?.disconnect()
    mount.rootResizeObserver = new ResizeObserver(() => updateCompactMode(element.getBoundingClientRect().width))
    mount.rootResizeObserver.observe(element)
    const kbBtn = document.getElementById('kb-toggle-btn')
    if (kbBtn) mount.rootResizeObserver.observe(kbBtn)
  }

  function setRootElement(element: HTMLElement | null) {
    if (element === rootRef.value) return
    rootRef.value = element
    if (!element) {
      activeMount?.rootResizeObserver?.disconnect()
      if (activeMount) activeMount.rootResizeObserver = null
      return
    }
    const mount = activeMount
    if (isActiveMount(mount)) observeRootElement(mount, element)
  }

  function setThemeFollowHost(value: boolean) {
    if (activeMount) activeMount.displayGeneration++
    themeFollowHost.value = value
    persist(STORAGE_KEYS.themeFollowHost, value)
  }

  function resetPageAndAnchor() {
    page.value = 1
    selection.value = selectionReducer(selection.value, { type: 'clear-anchor' })
  }

  function applyFilterChange() {
    resetPageAndAnchor()
    const keys = sessionsForList(activePartition.value).map(sessionKey)
    selection.value = selectionReducer(selection.value, { type: 'intersect', keys })
  }

  function setPage(nextPage: number, total = sessionsForList(activePartition.value).length) {
    const clamped = clampPage(nextPage, total, pageSize.value)
    if (clamped !== page.value) selection.value = selectionReducer(selection.value, { type: 'clear-anchor' })
    page.value = clamped
  }

  function clearError() {
    error.value = null
    errorAction.value = null
  }

  function showError(message: string, action?: { label: string; run: () => void }) {
    error.value = message
    errorAction.value = action || null
  }

  function cliError(message: string): string {
    return t('cli-error', { msg: message })
  }

  function agentLabel(agent: Pick<AgentDescriptor, 'id'>): string {
    return t(`agent-${agent.id}`)
  }

  function parseAgentDescriptors(stdout: string): AgentDescriptor[] {
    const parsed = JSON.parse(stdout) as unknown
    if (!Array.isArray(parsed)) throw new Error(t('agent-discovery-invalid'))
    return parsed.map((value: any) => {
      const caps = value?.capabilities
      const resumeArgv = value?.resume?.argv
      const defaultResumeArgv = DEFAULT_RESUME_ARGV_BY_AGENT.get(value?.id)
      const validCapabilities = caps
        && ['archive', 'rename', 'delete', 'deleteRequiresArchived', 'nativeIndex', 'tokenStats', 'originFilter']
          .every(key => typeof caps[key] === 'boolean')
      if (!value || typeof value.id !== 'string' || typeof value.available !== 'boolean' || !validCapabilities) {
        throw new Error(t('agent-discovery-invalid'))
      }
      const validResumeArgv = Array.isArray(resumeArgv)
        && resumeArgv.length > 0
        && resumeArgv.every(arg => typeof arg === 'string' && RESUME_ARG_TOKEN_RE.test(arg))
      if (!validResumeArgv && !defaultResumeArgv) throw new Error(t('agent-discovery-invalid'))
      return {
        id: value.id as AgentId,
        available: value.available,
        degraded: value.degraded === true,
        unavailableReason: typeof value.unavailableReason === 'string' ? value.unavailableReason : undefined,
        degradedReason: typeof value.degradedReason === 'string' ? value.degradedReason : undefined,
        capabilities: caps as ConnectorCapabilities,
        resume: {
          argv: validResumeArgv
            ? [...resumeArgv]
            : [...defaultResumeArgv!],
        },
      }
    })
  }

  function legacyAgentDescriptor(): AgentDescriptor {
    return {
      id: DEFAULT_AGENT,
      available: true,
      degraded: false,
      capabilities: LEGACY_CAPABILITIES,
      resume: { argv: [...LEGACY_RESUME.argv] },
    }
  }

  function agentTooltip(agent: AgentDescriptor): string {
    if (!agent.available) return agent.unavailableReason || t('agent-unavailable-tooltip')
    if (agent.degraded) return agent.degradedReason || t('agent-degraded-tooltip')
    return t('agent-switcher')
  }

  function notifyDegradedAgent(agent: AgentDescriptor) {
    if (!agent.degraded) return
    ctx.ui.notify(
      t('agent-degraded-notice', { agent: agentLabel(agent), reason: agent.degradedReason || t('agent-degraded-tooltip') }),
      'warn',
      t('agent-degraded-title'),
    )
  }

  function resetForAgentSwitch() {
    if (activeMount) {
      activeMount.indexGeneration++
      activeMount.searchGeneration++
      activeMount.treeGeneration++
      activeMount.pinsGeneration++
      activeMount.pickerRequestSeq++
      activeMount.pickerValidationSeq++
      if (activeMount.pinsNoteTimer) clearTimeout(activeMount.pinsNoteTimer)
      activeMount.pinsNoteTimer = null
    }
    clearSearchOverlay(true)
    resetTranscript()
    sessions.value = []
    committedSelection.value = { path: '/', mode: 'subtree', sessionId: null }
    activePartition.value = 'active'
    page.value = 1
    selection.value = selectionReducer(selection.value, { type: 'clear-partition' })
    selectMode.value = false
    pinsSelectMode.value = false
    pinsBulkRunning.value = false
    pinsSelection.value = {
      ...pinsSelection.value,
      selected: new Set(),
      anchor: null,
      pins: [],
      loading: true,
      error: null,
      corruptSidecar: null,
      conflictNote: false,
      activePath: null,
    }
    timeRange.value = 'all'
    branchFilter.value = ''
    branchPickerOpen.value = false
    branchPickerQuery.value = ''
    createdRange.value = { from: '', to: '' }
    lastActiveRange.value = { from: '', to: '' }
    globalSearch.value = false
    filtersOpen.value = false
    settingsOpen.value = false
    showRootPicker.value = false
    pickerLoading.value = false
    bulkResult.value = null
    bulkRefreshFailed.value = false
    compactView.value = 'list'
  }

  async function switchAgent(nextAgent: AgentId) {
    const descriptor = agents.value.find(agent => agent.id === nextAgent)
    if (!descriptor?.available || nextAgent === activeAgent.value || loading.value || bulkRunning.value || mutationInFlight) return
    activeAgent.value = nextAgent
    persist(STORAGE_KEYS.activeAgent, nextAgent)
    resetForAgentSwitch()
    const [loaded] = await Promise.all([loadIndex(), loadPins()])
    if (!loaded) return
    if (sessions.value.length === 0) {
      ctx.ui.notify(t('agent-empty-notice', { agent: agentLabel(descriptor) }), 'warn', t('agent-empty-title'))
    }
    notifyDegradedAgent(descriptor)
  }

  async function initializeAgents(preserveState: boolean) {
    const mount = activeMount
    if (!isActiveMount(mount)) return
    loading.value = true
    clearError()
    try {
      const [result, storedAgent] = await Promise.all([
        runAgent(['agents'], { timeout: 10_000 }),
        ctx.storage.get(STORAGE_KEYS.activeAgent).catch(() => null),
      ])
      if (!isActiveMount(mount)) return
      if (result.code !== 0) throw new Error(parseCliFailure(result.stderr, t('agent-discovery-failed')).message)
      let discovered: AgentDescriptor[]
      try {
        discovered = parseAgentDescriptors(result.stdout)
      } catch (caught) {
        let legacyResponse = false
        try {
          const parsed = JSON.parse(result.stdout)
          legacyResponse = Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'outcome' in parsed)
        } catch { /* handled by the original discovery error */ }
        if (!legacyResponse) throw caught
        discovered = []
      }
      if (discovered.length === 0) discovered = [legacyAgentDescriptor()]
      agents.value = discovered

      const requestedId = (typeof storedAgent === 'string' ? storedAgent : DEFAULT_AGENT) as AgentId
      const requested = discovered.find(agent => agent.id === requestedId)
      const available = discovered.filter(agent => agent.available)
      if (available.length === 0) {
        activeAgent.value = requested?.id || discovered[0].id
        loading.value = false
        showError(t('agent-none-available'))
        return
      }

      const candidates = requested?.available
        ? [requested, ...available.filter(agent => agent.id !== requested.id)]
        : available
      const previousAgent = activeAgent.value
      let chosen: AgentDescriptor | null = null
      let requestedLoaded = false
      for (const candidate of candidates) {
        const switchedAgent = candidate.id !== activeAgent.value
        if (switchedAgent) resetForAgentSwitch()
        activeAgent.value = candidate.id
        const preserveCandidateState = preserveState
          && !switchedAgent
          && candidate.id === previousAgent
          && candidate.id === requestedId
        const [loaded] = await Promise.all([loadIndex(preserveCandidateState), loadPins()])
        if (!isActiveMount(mount)) return
        if (candidate.id === requestedId) requestedLoaded = loaded
        if (loaded && sessions.value.length > 0) {
          chosen = candidate
          break
        }
      }

      if (!chosen) {
        const emptyAgent = candidates[0]
        if (activeAgent.value !== emptyAgent.id) {
          resetForAgentSwitch()
          activeAgent.value = emptyAgent.id
          await Promise.all([loadIndex(), loadPins()])
          if (!isActiveMount(mount)) return
        } else if (requestedLoaded && sessions.value.length === 0) {
          clearSearchOverlay(true)
          resetTranscript()
          page.value = 1
          selection.value = selectionReducer(selection.value, { type: 'clear-partition' })
          selectMode.value = false
        }
        if (emptyAgent.id !== requestedId) persist(STORAGE_KEYS.activeAgent, emptyAgent.id)
        ctx.ui.notify(t('agent-no-sessions'), 'warn', t('agent-empty-title'))
        notifyDegradedAgent(emptyAgent)
        return
      }

      if (chosen.id !== requestedId) {
        persist(STORAGE_KEYS.activeAgent, chosen.id)
        const requestedName = requested ? agentLabel(requested) : String(requestedId)
        const reason = !requested
          ? t('agent-not-registered')
          : !requested.available
            ? requested.unavailableReason || t('agent-unavailable-tooltip')
            : requestedLoaded
              ? t('agent-no-sessions-short')
              : t('agent-load-failed-short')
        ctx.ui.notify(
          t('agent-fallback-notice', { agent: requestedName, fallback: agentLabel(chosen), reason }),
          'warn',
          t('agent-fallback-title'),
        )
      }
      notifyDegradedAgent(chosen)
    } catch (caught: any) {
      if (isActiveMount(mount)) {
        loading.value = false
        showError(cliError(caught?.message || t('agent-discovery-failed')))
      }
    }
  }

  function parseMutationResult(stdout: string): MutationResult {
    const parsed = JSON.parse(stdout) as Partial<MutationResult>
    if (parsed.outcome === 'success' && typeof parsed.cacheRefreshed === 'boolean') return parsed as MutationResult
    if ((parsed.outcome === 'failure' || parsed.outcome === 'partial')
      && parsed.reason
      && typeof parsed.reason === 'object'
      && typeof (parsed.reason as MutationReason).error === 'string'
      && typeof (parsed.reason as MutationReason).message === 'string') return parsed as MutationResult
    throw new Error('mutation command returned invalid JSON')
  }

  function mutationError(result: Exclude<MutationResult, { outcome: 'success' }>): Error {
    if (result.outcome === 'partial') {
      return new Error(`${result.reason.message} (${result.jsonlPath}; ${result.artifactPath})`)
    }
    return new Error(result.reason.message)
  }

  async function requireMutationSuccess(result: MutationResult): Promise<Extract<MutationResult, { outcome: 'success' }>> {
    if (result.outcome === 'success') return result
    if (result.outcome === 'partial') await loadIndex(true, true)
    throw mutationError(result)
  }

  async function refreshCacheIfNeeded(result: Extract<MutationResult, { outcome: 'success' }>) {
    const caps = activeCapabilities.value
    if (result.cacheRefreshed || caps.nativeIndex) return
    const rebuilt = await runAgent(['build-index', '--refresh'], { timeout: 30_000 })
    if (rebuilt.code !== 0) throw new Error(parseCliFailure(rebuilt.stderr, 'cache rebuild failed').message)
    try {
      if (!Array.isArray(JSON.parse(rebuilt.stdout))) throw new Error('cache rebuild returned invalid JSON')
    } catch (caught: any) {
      throw new Error(caught?.message || 'cache rebuild returned invalid JSON')
    }
  }

  function sameSession(left: IndexedSession, right: IndexedSession): boolean {
    return sessionKey(left) === sessionKey(right)
  }

  function retagSession(session: IndexedSession, partition: SessionPartition): IndexedSession {
    const oldKey = sessionKey(session)
    const updated = { ...session, partition }
    sessions.value = sessions.value.map(candidate => sameSession(candidate, session) ? updated : candidate)
    if (selectedSession.value && sameSession(selectedSession.value, session)) selectedSession.value = updated
    if (committedSelection.value.sessionId === oldKey) {
      committedSelection.value = { ...committedSelection.value, sessionId: sessionKey(updated) }
    }
    if (searchOverlay.value) {
      const results = searchOverlay.value.results.flatMap(result => {
        if (!sameSession(result.session, session)) return [result]
        return partition === 'active' ? [{ ...result, session: updated }] : []
      })
      searchOverlay.value = {
        ...searchOverlay.value,
        results,
        selectedSessionId: results.some(result => sessionKey(result.session) === searchOverlay.value?.selectedSessionId)
          ? searchOverlay.value.selectedSessionId
          : null,
      }
    }
    if (selection.value.selected.has(oldKey)) {
      selection.value = selectionReducer(selection.value, {
        type: 'reconcile',
        succeeded: [oldKey],
      })
    }
    page.value = clampPage(page.value, sessionsForList(activePartition.value).length, pageSize.value)
    return updated
  }

  function removeSession(session: IndexedSession) {
    const removedKey = sessionKey(session)
    sessions.value = sessions.value.filter(candidate => !sameSession(candidate, session))
    if (committedSelection.value.sessionId === removedKey) {
      committedSelection.value = { ...committedSelection.value, sessionId: null }
    }
    if (searchOverlay.value) {
      const results = searchOverlay.value.results.filter(result => !sameSession(result.session, session))
      searchOverlay.value = {
        ...searchOverlay.value,
        results,
        selectedSessionId: searchOverlay.value.selectedSessionId === removedKey
          ? null
          : searchOverlay.value.selectedSessionId,
      }
    }
    if (selectedSession.value && sameSession(selectedSession.value, session)) resetTranscript()
    selection.value = selectionReducer(selection.value, { type: 'reconcile', succeeded: [removedKey] })
    page.value = clampPage(page.value, sessionsForList(activePartition.value).length, pageSize.value)
  }

  function logMutation(action: 'archived' | 'restored' | 'deleted', session: IndexedSession, cacheRefreshed: boolean) {
    console.info(`[session-browser] ${action} session`, { id: session.id, cacheRefreshed })
    const localizedAction = t(`action-${action}`)
    ctx.ui.notify(t('notify-paths-one', {
      action: localizedAction,
      n: 1,
    }), 'info', t('notify-files-updated'))
  }

  function cancelTranscriptFrame() {
    const mount = activeMount
    if (!mount) return
    if (mount.transcriptFrame !== null) cancelAnimationFrame(mount.transcriptFrame)
    mount.transcriptFrame = null
  }

  function resetTranscript() {
    const mount = activeMount
    if (mount) mount.transcriptLoadToken++
    cancelTranscriptFrame()
    if (mount?.copiedTimer) clearTimeout(mount.copiedTimer)
    if (mount) mount.copiedTimer = null
    selectedSession.value = null
    transcriptMessages.value = []
    if (mount) mount.allTranscriptMessages = []
    transcriptLoading.value = false
    transcriptError.value = null
    expandedTools.value = new Set()
    copiedSessionId.value = false
    transcriptScrollRef.value = null
  }

  function renderNextTranscriptBatch(mount: MountContext, token: number) {
    if (!isActiveMount(mount) || token !== mount.transcriptLoadToken) return
    const start = transcriptMessages.value.length
    const end = nextTranscriptBatchEnd(mount.allTranscriptMessages.length, start)
    if (end <= start) {
      mount.transcriptFrame = null
      return
    }
    transcriptMessages.value = [...transcriptMessages.value, ...mount.allTranscriptMessages.slice(start, end)]
    mount.transcriptFrame = end < mount.allTranscriptMessages.length
      ? scheduleMountFrame(mount, () => renderNextTranscriptBatch(mount, token))
      : null
  }

  async function openTranscript(session: IndexedSession) {
    const mount = activeMount
    if (!isActiveMount(mount)) return
    const token = ++mount.transcriptLoadToken
    cancelTranscriptFrame()
    selectedSession.value = session
    transcriptMessages.value = []
    mount.allTranscriptMessages = []
    transcriptLoading.value = true
    transcriptError.value = null
    expandedTools.value = new Set()
    copiedSessionId.value = false

    try {
      const result = await runAgent(['read-session', session.attributionKey, session.id], { timeout: 30_000 })
      if (!isActiveMount(mount) || token !== mount.transcriptLoadToken) return
      if (result.code !== 0) throw new Error(result.stderr || 'read-session failed')
      const parsed = JSON.parse(result.stdout)
      if (!Array.isArray(parsed)) throw new Error('read-session returned invalid JSON')
      mount.allTranscriptMessages = parsed as TranscriptMessage[]
      renderNextTranscriptBatch(mount, token)
      scheduleMountFrame(mount, () => {
        if (token === mount.transcriptLoadToken && transcriptScrollRef.value) transcriptScrollRef.value.scrollTop = 0
      })
    } catch (caught: any) {
      if (isActiveMount(mount) && token === mount.transcriptLoadToken) transcriptError.value = cliError(caught?.message || String(caught))
    } finally {
      if (isActiveMount(mount) && token === mount.transcriptLoadToken) transcriptLoading.value = false
    }
  }

  function selectSession(session: IndexedSession, fromSearch = false) {
    if (fromSearch) {
      if (searchOverlay.value) searchOverlay.value = { ...searchOverlay.value, selectedSessionId: sessionKey(session) }
      flashTreePath(session.rootPath)
    } else {
      committedSelection.value = { ...committedSelection.value, sessionId: sessionKey(session) }
    }
    openTranscript(session)
    if (compactMode.value) compactView.value = 'detail'
  }

  async function copySessionId() {
    const session = selectedSession.value
    if (!session) return
    try {
      await navigator.clipboard.writeText(session.id)
      copiedSessionId.value = true
      const mount = activeMount
      if (!isActiveMount(mount)) return
      if (mount.copiedTimer) clearTimeout(mount.copiedTimer)
      mount.copiedTimer = scheduleMountTimeout(() => {
        copiedSessionId.value = false
        mount.copiedTimer = null
      }, 1_500)
    } catch {
      transcriptError.value = t('error-copy-session-id')
    }
  }

  async function copyResumeCommand(session: IndexedSession, isCurrent = () => true): Promise<boolean> {
    if (!SESSION_ID_RE.test(session.id)) {
      showError(t('error-invalid-session-id'))
      return false
    }

    const command = `cd -- ${shQuote(session.rootPath)} && ${activeResumeArgv.value.join(' ')} ${session.id}`
    try {
      await navigator.clipboard.writeText(command)
      if (!isCurrent()) return false
      ctx.ui.notify(t('notify-command-copied'), 'info')
      return true
    } catch {
      if (isCurrent()) showError(t('error-copy-resume'))
      return false
    }
  }

  async function coordinateMutation<T>(fallback: T, operation: (isCurrent: () => boolean) => Promise<T>): Promise<T> {
    const mount = activeMount
    if (!isActiveMount(mount)) return fallback
    if (mutationInFlight) {
      ctx.ui.notify(t('notify-mutation-in-progress'), 'warn')
      return fallback
    }
    mutationInFlight = true
    try {
      return await operation(() => isActiveMount(mount))
    } finally {
      mutationInFlight = false
    }
  }

  async function restoreSessionCore(session: IndexedSession, isCurrent: () => boolean): Promise<IndexedSession | null> {
    const caps = activeCapabilities.value
    if (!caps.archive) return null
    clearError()
    try {
      const result = await runAgent(['restore', session.attributionKey, session.id], { timeout: 30_000 })
      if (!isCurrent()) return null
      if (result.code !== 0) throw new Error(parseCliFailure(result.stderr, 'restore failed').message)
      const mutation = await requireMutationSuccess(parseMutationResult(result.stdout))
      if (!isCurrent()) return null
      const restored = retagSession(session, 'active')
      await refreshCacheIfNeeded(mutation)
      if (!isCurrent()) return null
      logMutation('restored', session, mutation.cacheRefreshed)
      return restored
    } catch (caught: any) {
      if (isCurrent()) showError(cliError(caught?.message || t('error-restore')))
      return null
    }
  }

  async function restoreSession(session: IndexedSession): Promise<IndexedSession | null> {
    return coordinateMutation(null, isCurrent => restoreSessionCore(session, isCurrent))
  }

  async function archiveSession(session: IndexedSession): Promise<void> {
    await coordinateMutation(undefined, async isCurrent => {
      const caps = activeCapabilities.value
      if (!caps.archive) return
      const title = resolveSessionTitle(session) || t('untitled-session')
      const accepted = await ctx.ui.confirm(t('archive-session-confirm', { title }))
      if (!isCurrent() || !accepted) return

      clearError()
      try {
        let result = await runAgent(['archive', session.attributionKey, session.id], { timeout: 30_000 })
        if (!isCurrent()) return
        if (result.code !== 0) throw new Error(parseCliFailure(result.stderr, 'archive failed').message)
        let mutation = parseMutationResult(result.stdout)
        if (mutation.outcome === 'failure' && (mutation.reason.error === 'possibly-live' || mutation.reason.error === 'session-live')) {
          const forceAccepted = await ctx.ui.confirm(t('archive-session-force-confirm', { title }))
          if (!isCurrent() || !forceAccepted) return
          result = await runAgent(['archive', session.attributionKey, session.id, '--force'], { timeout: 30_000 })
          if (!isCurrent()) return
          if (result.code !== 0) throw new Error(parseCliFailure(result.stderr, 'forced archive failed').message)
          mutation = parseMutationResult(result.stdout)
        }
        mutation = await requireMutationSuccess(mutation)
        if (!isCurrent()) return

        retagSession(session, 'archive')
        await refreshCacheIfNeeded(mutation)
        if (!isCurrent()) return
        logMutation('archived', session, mutation.cacheRefreshed)
      } catch (caught: any) {
        if (isCurrent()) showError(cliError(caught?.message || t('error-archive')))
      }
    })
  }

  async function exportSession(session: IndexedSession): Promise<void> {
    await coordinateMutation(undefined, async isCurrent => {
      const destinationRoot = exportDestination.value.trim() || DEFAULT_EXPORT_DESTINATION
      const destination = joinExportDestination(
        destinationRoot,
        exportAgentFolderName(activeAgent.value),
        singleExportFolderName(),
      )
      const accepted = await ctx.ui.confirm(t('export-destination-confirm', { dest: destination }))
      if (!isCurrent()) return
      if (!accepted) {
        return
      }
      clearError()
      try {
        const args = ['export-session', session.attributionKey, session.id, '--dest', destination]
        let result = await runAgent(args, { timeout: 30_000 })
        if (!isCurrent()) return
        if (result.code !== 0) {
          const failure = parseCliFailure(result.stderr, t('error-export'))
          console.warn(failure)
          if (failure.error !== 'export-destination-outside-home') {
            showError(cliError(localizedExportError(failure, destination, t)))
            return
          }
          const outsideHomeAccepted = await ctx.ui.confirm(t('export-outside-home-confirm', { dest: destinationRoot }))
          if (!isCurrent()) return
          if (!outsideHomeAccepted) {
            return
          }
          result = await runAgent([...args, '--allow-outside-home'], { timeout: 30_000 })
          if (!isCurrent()) return
          if (result.code !== 0) {
            const failure = parseCliFailure(result.stderr, t('error-export'))
            console.warn(failure)
            showError(cliError(localizedExportError(failure, destination, t)))
            return
          }
        }
        let exported: unknown
        try {
          exported = JSON.parse(result.stdout)
        } catch (caught) {
          console.warn(caught, result.stdout)
          if (isCurrent()) showError(cliError(t('error-export-invalid-response')))
          return
        }
        if (exported && typeof exported === 'object'
          && (exported as any).ok === false
          && typeof (exported as any).error === 'string') {
          const failure = exported as CliFailure
          console.warn(failure)
          if (isCurrent()) showError(cliError(localizedExportError(failure, destination, t)))
          return
        }
        if (!exported || typeof exported !== 'object'
          || (exported as any).ok !== true
          || typeof (exported as any).path !== 'string'
          || !(exported as any).path) {
          console.warn(exported)
          if (isCurrent()) showError(cliError(t('error-export-invalid-response')))
          return
        }
        if (!isCurrent()) return
      } catch (caught: any) {
        console.warn(caught)
        if (isCurrent()) showError(cliError(t('export-error-generic')))
      }
    })
  }

  async function deleteSession(session: IndexedSession): Promise<void> {
    await coordinateMutation(undefined, async isCurrent => {
      const caps = activeCapabilities.value
      if (!caps.delete || (caps.deleteRequiresArchived && session.partition !== 'archive')) return
      const title = resolveSessionTitle(session) || t('untitled-session')
      const accepted = await ctx.ui.confirm(t(
        caps.deleteRequiresArchived ? 'delete-session-confirm' : 'delete-session-direct-confirm',
        { title },
      ))
      if (!isCurrent() || !accepted) return

      clearError()
      try {
        const result = await runAgent(['delete-archived', session.attributionKey, session.id], { timeout: 30_000 })
        if (!isCurrent()) return
        if (result.code !== 0) throw new Error(parseCliFailure(result.stderr, 'delete-archived failed').message)
        const mutation = await requireMutationSuccess(parseMutationResult(result.stdout))
        if (!isCurrent()) return
        removeSession(session)
        await refreshCacheIfNeeded(mutation)
        if (!isCurrent()) return
        logMutation('deleted', session, mutation.cacheRefreshed)
      } catch (caught: any) {
        if (isCurrent()) showError(cliError(caught?.message || t('error-delete')))
      }
    })
  }

  async function resumeSession(session: IndexedSession): Promise<void> {
    await coordinateMutation(undefined, isCurrent => resumeSessionCore(session, isCurrent))
  }

  async function resumeSessionCore(session: IndexedSession, isCurrent: () => boolean): Promise<void> {
    clearError()
    let resumable = session

    if (!SESSION_ID_RE.test(resumable.id)) {
      showError(t('error-invalid-session-id'))
      return
    }

    try {
      const result = await runAgent(['check-dir', resumable.rootPath], { timeout: 10_000 })
      if (!isCurrent()) return
      if (result.code !== 0) throw new Error(result.stderr || 'check-dir failed')
      const checked = JSON.parse(result.stdout) as { exists?: boolean; dir?: boolean }
      if (!checked.exists || !checked.dir) {
        const warning = checked.exists
          ? t('workspace-not-directory', { path: resumable.rootPath })
          : t('workspace-missing', { path: resumable.rootPath })
        ctx.ui.notify(warning, 'warn', t('notify-resume-unavailable'))
        const accepted = await ctx.ui.confirm(t('resume-copy-fallback-confirm', { warning }))
        if (isCurrent() && accepted) await copyResumeCommand(resumable, isCurrent)
        return
      }
    } catch (caught: any) {
      if (isCurrent()) showError(cliError(caught?.message || t('error-check-workspace')), {
        label: t('copy-command'),
        run: () => { void copyResumeCommand(resumable, isCurrent) },
      })
      return
    }

    if (resumable.live) {
      const title = resolveSessionTitle(resumable) || t('untitled-session')
      const accepted = await ctx.ui.confirm(t('resume-live-confirm', { title }))
      if (!isCurrent() || !accepted) return
    }

    if (resumable.partition === 'archive') {
      const title = resolveSessionTitle(resumable) || t('untitled-session')
      const accepted = await ctx.ui.confirm(t('restore-first-confirm', { title }))
      if (!isCurrent() || !accepted) return
      const restored = await restoreSessionCore(resumable, isCurrent)
      if (!restored) return
      resumable = restored
    }

    const terminal = ctx.terminal as typeof ctx.terminal & {
      createTerminalTab?: (opts: { cwd: string; argv: string[]; title?: string }) => Promise<string>
    }
    if (typeof terminal?.createTerminalTab !== 'function') {
      await copyResumeCommand(resumable, isCurrent)
      return
    }

    try {
      await terminal.createTerminalTab({
        cwd: resumable.rootPath,
        argv: [...activeResumeArgv.value, resumable.id],
        title: resolveSessionTitle(resumable).slice(0, 24),
      })
    } catch {
      if (isCurrent()) showError(t('error-open-terminal'), {
        label: t('copy-command'),
        run: () => { void copyResumeCommand(resumable, isCurrent) },
      })
    }
  }

  function toggleTool(messageKey: string, toolIndex: number) {
    const key = `${messageKey}-${toolIndex}`
    const next = new Set(expandedTools.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    expandedTools.value = next
  }

  async function loadIndex(preserveState = false, refresh = false): Promise<boolean> {
    const mount = activeMount
    if (!isActiveMount(mount)) return false
    const requestGeneration = ++mount.indexGeneration
    const isCurrent = () => isActiveMount(mount) && requestGeneration === mount.indexGeneration
    const treeGeneration = ++mount.treeGeneration
    const isCurrentTree = () => isCurrent() && treeGeneration === mount.treeGeneration
    loading.value = true
    clearError()
    try {
      const caps = activeCapabilities.value
      const result = await runAgent(refresh && !caps.nativeIndex ? ['build-index', '--refresh'] : ['build-index'], { timeout: 30_000 })
      if (!isCurrent()) return false
      if (result.code !== 0) throw new Error(result.stderr || 'build-index failed')
      const parsed = JSON.parse(result.stdout)
      if (!Array.isArray(parsed)) throw new Error('build-index returned invalid JSON')
      sessions.value = parsed as IndexedSession[]
      const requestAgent = activeAgent.value
      if (caps.originFilter) {
        try {
          hideScriptedSessions.value = await ctx.storage.get(
            perAgentStorageKey(STORAGE_KEYS.hideScriptedSessions, requestAgent),
          ) === true
        } catch { hideScriptedSessions.value = false }
      } else {
        hideScriptedSessions.value = false
      }
      if (!isCurrent()) return false
      const presentKeys = sessionsForList(activePartition.value).map(sessionKey)
      selection.value = selectionReducer(selection.value, { type: 'intersect', keys: presentKeys })

      if (preserveState) {
        page.value = clampPage(page.value, sessionsForList(activePartition.value).length, pageSize.value)
        if (selectedSession.value) {
          selectedSession.value = sessions.value.find(item => sessionKey(item) === sessionKey(selectedSession.value!)) || selectedSession.value
        }
        return true
      }
      resetTranscript()
      if (!isCurrentTree()) return false
      let savedRoot: string | null = null
      try {
        savedRoot = normalizeStoredTreeRoot(await readPerAgentTreeSetting(STORAGE_KEYS.treeRoot, requestAgent))
      } catch { /* use the indexed common ancestor */ }
      if (!isCurrentTree()) return false
      visibleRoot.value = savedRoot || deepestCommonAncestor(originFilteredSessions.value.map(session => session.rootPath))
      persist(perAgentStorageKey(STORAGE_KEYS.treeRoot, requestAgent), visibleRoot.value)
      committedSelection.value = { path: visibleRoot.value, mode: 'subtree', sessionId: null }

      let savedExpanded: Set<string> | null = null
      try {
        savedExpanded = normalizeStoredExpandedPaths(
          await readPerAgentTreeSetting(STORAGE_KEYS.treeExpandedPaths, requestAgent),
        )
      } catch { /* use the indexed tree paths */ }
      if (!isCurrentTree()) return false
      if (savedExpanded) {
        expandedPaths.value = savedExpanded
      } else {
        expandedPaths.value = collectTreePaths(deriveSessionPathTree(originFilteredSessions.value, visibleRoot.value))
        persistExpandedPaths()
      }
      expandedPaths.value.add(visibleRoot.value)
      persistExpandedPaths()
      return true
    } catch (caught: any) {
      if (isCurrent()) showError(cliError(caught?.message || String(caught)))
      return false
    } finally {
      if (isCurrent()) loading.value = false
    }
  }

  async function loadPaneWidths() {
    const mount = activeMount
    if (!isActiveMount(mount)) return
    const generation = ++mount.paneGeneration
    try {
      const saved = await ctx.storage.get<Partial<PaneWidths>>(STORAGE_KEYS.paneWidths)
      if (!isActiveMount(mount) || generation !== mount.paneGeneration) return
      if (saved && Number.isFinite(saved.left)) {
        paneWidths.value = {
          left: Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, Number(saved.left))),
          middle: Number.isFinite(saved.middle) ? Math.max(280, Number(saved.middle)) : DEFAULT_PANE_WIDTHS.middle,
        }
      }
    } catch { /* use defaults */ }
  }

  async function loadSortSettings() {
    const mount = activeMount
    if (!isActiveMount(mount)) return
    const generation = ++mount.sortGeneration
    try {
      const saved = await ctx.storage.get(STORAGE_KEYS.sessionListSort)
      if (!isActiveMount(mount) || generation !== mount.sortGeneration) return
      sortSettings.value = normalizePartitionSortSettings(saved)
    } catch { /* use defaults */ }
  }

  async function loadDisplaySettings() {
    const mount = activeMount
    if (!isActiveMount(mount)) return
    const generation = ++mount.displayGeneration
    try {
      const [savedLocale, savedFontScale, savedThemeFollowHost, savedPageSize, savedExportDestination, savedPinsCollapsed] = await Promise.all([
        ctx.storage.get(STORAGE_KEYS.locale),
        ctx.storage.get(STORAGE_KEYS.fontScale),
        ctx.storage.get(STORAGE_KEYS.themeFollowHost),
        ctx.storage.get(STORAGE_KEYS.pageSize),
        ctx.storage.get(STORAGE_KEYS.exportDestination),
        ctx.storage.get(STORAGE_KEYS.pinsCollapsed),
      ])
      if (!isActiveMount(mount) || generation !== mount.displayGeneration) return
      localeSetting.value = normalizeLocaleSetting(savedLocale)
      localeRef.value = resolveLocale(localeSetting.value, typeof document === 'undefined' ? '' : document.documentElement.lang)
      fontScale.value = typeof savedFontScale === 'number' && Number.isInteger(savedFontScale) && savedFontScale >= 1 && savedFontScale <= 5
        ? savedFontScale
        : 3
      updateCompactMode(rootWidth)
      themeFollowHost.value = typeof savedThemeFollowHost === 'boolean' ? savedThemeFollowHost : true
      pageSize.value = PAGE_SIZES.includes(savedPageSize as any) ? savedPageSize as (typeof PAGE_SIZES)[number] : 50
      exportDestination.value = typeof savedExportDestination === 'string' && savedExportDestination.trim()
        ? savedExportDestination.trim()
        : DEFAULT_EXPORT_DESTINATION
      updatePinsState({ collapsed: savedPinsCollapsed === true })
    } catch { /* use defaults */ }
  }

  function setVisibleRoot(nextRoot: string) {
    if (bulkRunning.value) return
    if (activeMount) activeMount.treeGeneration++
    visibleRoot.value = normalizePath(nextRoot)
    updatePinsState({ activePath: null })
    clearSearchOverlay()
    committedSelection.value = { path: visibleRoot.value, mode: committedSelection.value.mode, sessionId: null }
    applyFilterChange()
    resetTranscript()
    expandedPaths.value = new Set(expandedPaths.value).add(visibleRoot.value)
    persist(perAgentStorageKey(STORAGE_KEYS.treeRoot), visibleRoot.value)
    persistExpandedPaths()
  }

  async function loadPickerDirs(dir: string) {
    const mount = activeMount
    if (!isActiveMount(mount)) return
    const requestSeq = ++mount.pickerRequestSeq
    pickerLoading.value = true
    pickerError.value = null
    let rawOutput: string | undefined
    try {
      const result = await runAgent(['list-dirs', dir], { timeout: 10_000 })
      if (!isActiveMount(mount) || requestSeq !== mount.pickerRequestSeq) return
      rawOutput = result.stdout
      if (result.code !== 0) {
        console.warn(parseCliFailure(result.stderr, t('picker-list-error')))
        pickerEntries.value = []
        pickerError.value = t('picker-list-error')
        return
      }
      const parsed = JSON.parse(result.stdout) as ListDirsResult
      if ('error' in parsed) {
        console.warn(parsed)
        pickerEntries.value = []
        pickerError.value = t('picker-list-error')
      } else if (Array.isArray(parsed.dirs)) {
        pickerEntries.value = parsed.dirs
      } else {
        console.warn(parsed)
        pickerEntries.value = []
        pickerError.value = t('picker-list-error')
      }
    } catch (caught: any) {
      if (!isActiveMount(mount) || requestSeq !== mount.pickerRequestSeq) return
      console.warn(caught, rawOutput)
      pickerEntries.value = []
      pickerError.value = t('picker-list-error')
    } finally {
      if (isActiveMount(mount) && requestSeq === mount.pickerRequestSeq) pickerLoading.value = false
    }
  }

  async function navigatePickerDir(dir: string) {
    pickerCurrentDir.value = normalizePath(dir)
    await loadPickerDirs(pickerCurrentDir.value)
  }

  function closeRootPicker() {
    if (!showRootPicker.value) return
    if (activeMount) {
      activeMount.pickerRequestSeq++
      activeMount.pickerValidationSeq++
    }
    showRootPicker.value = false
    pickerLoading.value = false
    pickerTarget.value = 'tree-root'
    scheduleMountTimeout(() => pickerTriggerRef.value?.focus(), 0)
  }

  function openRootPicker(target: PickerTarget) {
    if (activeMount) activeMount.pickerValidationSeq++
    pickerTarget.value = target
    const targetPath = target === 'export-destination' ? exportDestination.value : visibleRoot.value
    const startDir = targetPath.startsWith('/') ? normalizePath(targetPath) : visibleRoot.value
    pickerCurrentDir.value = startDir
    pickerManualPath.value = startDir
    pickerEntries.value = []
    pickerError.value = null
    showRootPicker.value = true
    void loadPickerDirs(pickerCurrentDir.value)
    scheduleMountTimeout(() => pickerInputRef.value?.focus(), 0)
  }

  async function validateAndCommitRoot(candidate: string) {
    const mount = activeMount
    if (!isActiveMount(mount)) return
    const target = pickerTarget.value
    const requestSeq = ++mount.pickerValidationSeq
    const isCurrent = () => isActiveMount(mount)
      && showRootPicker.value
      && target === pickerTarget.value
      && requestSeq === mount.pickerValidationSeq
    const nextRoot = candidate.trim()
    if (!nextRoot.startsWith('/')) {
      if (isCurrent()) pickerError.value = t('tree-root-absolute-error')
      return
    }
    try {
      const result = await runAgent(['check-dir', nextRoot], { timeout: 10_000 })
      if (!isCurrent()) return
      if (result.code !== 0) {
        const failure = parseCliFailure(result.stderr, t('picker-check-error'))
        console.warn(failure)
        pickerError.value = localizedExportError(failure, nextRoot, t)
        return
      }
      const checked = JSON.parse(result.stdout) as { exists?: boolean; dir?: boolean }
      if (typeof checked?.exists !== 'boolean' || typeof checked?.dir !== 'boolean') {
        console.warn(checked)
        pickerError.value = t('picker-check-error')
        return
      }
      if (!checked.exists) {
        pickerError.value = t('picker-path-missing', { path: nextRoot })
        return
      }
      if (!checked.dir) {
        pickerError.value = t('picker-path-not-directory', { path: nextRoot })
        return
      }
    } catch (caught: any) {
      console.warn(caught)
      if (isCurrent()) pickerError.value = t('picker-check-error')
      return
    }
    if (!isCurrent()) return
    clearError()
    if (target === 'export-destination') setExportDestination(nextRoot)
    else setVisibleRoot(nextRoot)
    closeRootPicker()
  }

  function toggleExpanded(nodePath: string) {
    if (activeMount) activeMount.treeGeneration++
    const next = new Set(expandedPaths.value)
    if (next.has(nodePath)) next.delete(nodePath)
    else next.add(nodePath)
    expandedPaths.value = next
    persistExpandedPaths()
  }

  function selectNode(nodePath: string) {
    if (bulkRunning.value) return
    clearSearchOverlay()
    updatePinsState({ activePath: null })
    committedSelection.value = { ...committedSelection.value, path: nodePath, sessionId: null }
    applyFilterChange()
    resetTranscript()
    if (compactMode.value) compactView.value = 'list'
  }

  function onResizeMove(event: PointerEvent) {
    const fsMultiplier = FONT_SCALE_MULTIPLIERS[fontScale.value] || 1
    const nextWidth = resizeStartWidth + (event.clientX - resizeStartX) / fsMultiplier
    paneWidths.value = {
      ...paneWidths.value,
      left: Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, nextWidth)),
    }
  }

  function stopResize() {
    if (!resizeActive) return
    resizeActive = false
    document.removeEventListener('pointermove', onResizeMove)
    document.removeEventListener('pointerup', stopResize)
    document.body.classList.remove('ccm-is-resizing')
    if (activeMount) activeMount.paneGeneration++
    persist(STORAGE_KEYS.paneWidths, paneWidths.value)
  }

  function startResize(event: PointerEvent) {
    if (compactMode.value) return
    if (activeMount) activeMount.paneGeneration++
    resizeActive = true
    resizeStartX = event.clientX
    resizeStartWidth = paneWidths.value.left
    document.body.classList.add('ccm-is-resizing')
    document.addEventListener('pointermove', onResizeMove)
    document.addEventListener('pointerup', stopResize)
    event.preventDefault()
  }

  function persistSortSettings() {
    if (activeMount) activeMount.sortGeneration++
    persist(STORAGE_KEYS.sessionListSort, sortSettings.value)
  }

  function scopedPartitionSessions(partition: SessionPartition): IndexedSession[] {
    return filterSessions(originFilteredSessions.value, {
      partition,
      scopePath: committedSelection.value.path,
      scopeMode: committedSelection.value.mode,
      timeRange: 'all',
      branch: '',
      query: '',
    })
  }

  function sessionsForList(partition: SessionPartition): IndexedSession[] {
    const setting = sortSettings.value[partition]
    const effectiveSetting = setting.field === 'msgcount' && !messageCountsAvailable()
      ? { ...setting, field: 'idle' as const }
      : setting
    return sortSessions(filterSessions(originFilteredSessions.value, {
      partition,
      scopePath: committedSelection.value.path,
      scopeMode: committedSelection.value.mode,
      timeRange: timeRange.value,
      branch: branchFilter.value,
      query: searchQuery.value,
      createdFrom: createdRange.value.from,
      createdTo: createdRange.value.to,
      lastActiveFrom: lastActiveRange.value.from,
      lastActiveTo: lastActiveRange.value.to,
    }), effectiveSetting)
  }

  function messageCountsAvailable(): boolean {
    return originFilteredSessions.value.some(session => session.messageCount !== undefined)
  }

  function branchOptions(partition: SessionPartition): string[] {
    return Array.from(new Set(scopedPartitionSessions(partition)
      .map(session => session.gitBranch || '')
      .filter(Boolean)))
      .sort((left, right) => left.localeCompare(right))
  }

  function clearSearchOverlay(clearQuery = false) {
    if (activeMount) activeMount.searchGeneration++
    const hadSelectedResult = Boolean(searchOverlay.value?.selectedSessionId)
    searchOverlay.value = null
    searching.value = false
    if (clearQuery) searchQuery.value = ''
    if (hadSelectedResult) resetTranscript()
  }

  function setPartition(partition: SessionPartition) {
    if (bulkRunning.value) return
    clearSearchOverlay()
    activePartition.value = partition
    page.value = 1
    selection.value = selectionReducer(selection.value, { type: 'clear-partition' })
    committedSelection.value = { ...committedSelection.value, sessionId: null }
    resetTranscript()
    if (branchFilter.value && !branchOptions(partition).includes(branchFilter.value)) branchFilter.value = ''
  }

  function updateSortField(field: SessionSortField) {
    if (bulkRunning.value) return
    const partition = activePartition.value
    sortSettings.value = {
      ...sortSettings.value,
      [partition]: { ...sortSettings.value[partition], field },
    }
    persistSortSettings()
    resetPageAndAnchor()
  }

  function toggleSortDirection() {
    if (bulkRunning.value) return
    const partition = activePartition.value
    const current = sortSettings.value[partition]
    sortSettings.value = {
      ...sortSettings.value,
      [partition]: { ...current, direction: current.direction === 'asc' ? 'desc' : 'asc' },
    }
    persistSortSettings()
    resetPageAndAnchor()
  }

  function flashTreePath(rootPath: string) {
    const mount = activeMount
    if (!isActiveMount(mount)) return
    transientHighlightPath.value = normalizePath(rootPath)
    if (mount.highlightTimer) clearTimeout(mount.highlightTimer)
    mount.highlightTimer = scheduleMountTimeout(() => {
      transientHighlightPath.value = null
      mount.highlightTimer = null
    }, 2_000)
  }

  async function runFullTextSearch() {
    const query = searchQuery.value.trim()
    if (!query || activePartition.value !== 'active' || searching.value || bulkRunning.value) return
    const mount = activeMount
    if (!isActiveMount(mount)) return
    const requestGeneration = ++mount.searchGeneration
    const global = globalSearch.value
    const scopePath = committedSelection.value.path
    const requestPartition = activePartition.value
    const isCurrent = () => isActiveMount(mount)
      && requestGeneration === mount.searchGeneration
      && activePartition.value === requestPartition
      && globalSearch.value === global
      && committedSelection.value.path === scopePath
    searching.value = true
    clearError()
    try {
      const args = ['search', query]
      if (!global) args.push('--scope', scopePath)
      const result = await runAgent(args, { timeout: 30_000 })
      if (!isCurrent()) return
      if (result.code !== 0) throw new Error(result.stderr || 'search failed')
      const parsed = JSON.parse(result.stdout)
      if (!Array.isArray(parsed)) throw new Error('search returned invalid JSON')
      searchOverlay.value = {
        query,
        scopePath: global ? null : scopePath,
        results: (parsed as SearchResult[]).filter(result => isSessionVisibleByOrigin(result.session)),
        selectedSessionId: null,
      }
      selection.value = selectionReducer(selection.value, { type: 'clear-anchor' })
      committedSelection.value = { ...committedSelection.value, sessionId: null }
      resetTranscript()
    } catch (caught: any) {
      if (isCurrent()) showError(cliError(caught?.message || String(caught)))
    } finally {
      if (isCurrent()) searching.value = false
    }
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      clearSearchOverlay(true)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      runFullTextSearch()
    }
  }

  function commitDateRange(axis: 'created' | 'lastActive', field: 'from' | 'to', value: string) {
    if (bulkRunning.value) return
    const current = axis === 'created' ? createdRange.value : lastActiveRange.value
    const normalized = normalizeDateRange({ ...current, [field]: value })
    if (axis === 'created') createdRange.value = normalized
    else {
      const committed = commitAbsoluteLastActiveRange(timeRange.value, normalized)
      lastActiveRange.value = committed.range
      timeRange.value = committed.timeRange
    }
    applyFilterChange()
  }

  function setTimeRange(value: TimeRangeFilter) {
    if (bulkRunning.value) return
    const committed = commitDurationTimeRange(value, lastActiveRange.value)
    timeRange.value = committed.timeRange
    lastActiveRange.value = committed.range
    applyFilterChange()
  }

  function clearAllFilters() {
    if (bulkRunning.value) return
    timeRange.value = 'all'
    branchFilter.value = ''
    searchQuery.value = ''
    createdRange.value = { from: '', to: '' }
    lastActiveRange.value = { from: '', to: '' }
    clearSearchOverlay()
    applyFilterChange()
  }

  function toggleSelected(session: IndexedSession, shift: boolean, pageKeys: string[]) {
    selection.value = selectionReducer(selection.value, shift
      ? { type: 'shift-range', key: sessionKey(session), pageKeys }
      : { type: 'toggle', key: sessionKey(session) })
  }

  function selectedItems(): IndexedSession[] {
    const selected = selection.value.selected
    return sessionsForList(activePartition.value).filter(session => selected.has(sessionKey(session)))
  }

  function expectedBulkSkips(action: BulkAction, items: IndexedSession[], now = Date.now()): number {
    if (action === 'export') return 0
    return items.filter(session => session.live || (action === 'archive' && now - timestampValue(session.lastActiveAt) < 60_000)).length
  }

  async function executeBulk(action: BulkAction) {
    await coordinateMutation(undefined, async isCurrent => {
      const caps = activeCapabilities.value
      if ((action === 'archive' || action === 'restore') && !caps.archive) return
      if (action === 'delete' && (!caps.delete || (caps.deleteRequiresArchived && activePartition.value !== 'archive'))) return
      const confirmationItems = selectedItems()
      if (!confirmationItems.length) return
      const expectedSkipped = expectedBulkSkips(action, confirmationItems)
      const accepted = await ctx.ui.confirm(t('bulk-confirm', { n: confirmationItems.length, m: expectedSkipped }))
      if (!isCurrent() || !accepted) return
      const items = selectedItems()
      if (!items.length) return
      const bulkExportDestination = exportDestination.value.trim() || DEFAULT_EXPORT_DESTINATION
      let allowOutsideHome = false
      let outsideHome = false
      if (action === 'export') {
        try {
          outsideHome = await isExportDestinationOutsideHome(
            bulkExportDestination,
            (args, timeout = 10_000) => runAgent(args, { timeout }),
          )
        } catch (caught) {
          console.warn(caught)
          if (isCurrent()) showError(cliError(t('error-export-destination-classification')))
          return
        }
      }
      if (outsideHome) {
        allowOutsideHome = await ctx.ui.confirm(t('export-outside-home-confirm', { dest: bulkExportDestination }))
        if (!isCurrent() || !allowOutsideHome) return
      }
      bulkRunning.value = true
      bulkCancelRequested.value = false
      bulkResult.value = null
      bulkRefreshFailed.value = false
      bulkProgress.value = { completed: 0, total: items.length, title: '' }
      try {
        const outcome = await runBulkSerial({
          action,
          items,
          exportDestination: bulkExportDestination,
          allowOutsideHome,
          exportFailureMessage: t('error-export'),
          invalidExportMessage: t('error-export-invalid-response'),
          earlyAbortMessage: t('bulk-export-early-abort'),
          unknownProjectName: t('export-unknown-project'),
          exportAgent: activeAgent.value,
          localizeExportError: (failure, destination) => localizedExportError(failure, destination, t),
          run: (args, timeout = 30_000) => runAgent(args, { timeout }),
          isCancelled: () => !isCurrent() || bulkCancelRequested.value,
          onProgress: (completed, total, session) => {
            if (isCurrent()) bulkProgress.value = { completed, total, title: resolveSessionTitle(session) || t('untitled-session') }
          },
        })
        if (!isCurrent()) return
        bulkResult.value = outcome
        if (action === 'export') {
          bulkProgress.value = { completed: outcome.results.length, total: items.length, title: '' }
          return
        }
        const completed = outcome.results.filter(result => result.status === 'done')
        for (const result of completed) {
          if (result.retaggedKey) retagSession(result.session, action === 'archive' ? 'archive' : 'active')
          else removeSession(result.session)
        }
        page.value = clampPage(page.value, sessionsForList(activePartition.value).length, pageSize.value)
        const succeeded = completed.map(result => result.key)
        const retagged = Object.fromEntries(completed.flatMap(result => result.retaggedKey ? [[result.key, result.retaggedKey]] : []))
        selection.value = selectionReducer(selection.value, { type: 'reconcile', succeeded, retagged })

        const selectedResult = selectedSession.value
          ? completed.find(result => result.key === sessionKey(selectedSession.value!))
          : undefined
        if (selectedResult) {
          if (selectedResult.retaggedKey) {
            const partition = action === 'archive' ? 'archive' : 'active'
            selectedSession.value = { ...selectedSession.value!, partition }
          } else {
            resetTranscript()
          }
        }
        const committedResult = committedSelection.value.sessionId
          ? completed.find(result => result.key === committedSelection.value.sessionId)
          : undefined
        if (committedResult) {
          committedSelection.value = {
            ...committedSelection.value,
            sessionId: committedResult.retaggedKey || null,
          }
        }
        const refreshed = await loadIndex(true, outcome.rebuildRequired)
        if (!isCurrent()) return
        bulkRefreshFailed.value = !refreshed
        bulkProgress.value = { completed: outcome.results.length, total: items.length, title: '' }
      } finally {
        if (isCurrent()) bulkRunning.value = false
      }
    })
  }

  function activatePin(pin: FolderPin) {
    if (pinsBulkRunning.value) return
    if (activeMount) activeMount.treeGeneration++
    clearSearchOverlay()
    committedSelection.value = { path: pin.path, mode: 'exact', sessionId: null }
    updatePinsState({ activePath: pin.path })
    applyFilterChange()
    resetTranscript()
    if (compactMode.value) compactView.value = 'list'
  }

  function revealActivePinInTree() {
    const state = pinsSelection.value
    const activePath = state.activePath
    if (!activePath || state.loading || pinsBulkRunning.value || bulkRunning.value || state.corruptSidecar) return
    clearSearchOverlay()
    committedSelection.value = { path: activePath, mode: 'subtree', sessionId: null }

    const nextExpanded = new Set(expandedPaths.value)
    let ancestor = parentPath(activePath)
    while (true) {
      nextExpanded.add(ancestor)
      if (ancestor === '/') break
      ancestor = parentPath(ancestor)
    }
    expandedPaths.value = nextExpanded
    persistExpandedPaths()

    if (!isPathWithin(visibleRoot.value, activePath)) {
      setVisibleRoot(activePath)
      updatePinsState({ activePath })
    }
    applyFilterChange()
    resetTranscript()
    if (compactMode.value) compactView.value = 'tree'
  }

  function pinMetadata(pin: FolderPin): { count: number; lastActiveAt: string } {
    const keys = pinMatchKeys(pin)
    const exactSessions = originFilteredSessions.value.filter(session => keys.has(normalizePinMatchKey(session.rootPath)))
    return {
      count: exactSessions.length,
      lastActiveAt: exactSessions.reduce((newest, session) => newerTimestamp(newest, session.lastActiveAt), ''),
    }
  }

  function renderPinRow(pin: FolderPin, index: number): any {
    const selectMode = pinsSelectMode.value
    const metadata = pinMetadata(pin)
    const name = pathName(pin.path)
    const count = t(metadata.count === 1 ? 'pin-session-count-one' : 'pin-session-count-other', { n: metadata.count })
    const activity = t('pin-last-activity', { time: formatRelativeTime(metadata.lastActiveAt, t) })
    const missingTitle = pin.exists ? pin.path : t('pin-folder-missing')
    const activePath = pinsSelection.value.activePath
    const active = activePath !== null && normalizePath(pin.path) === normalizePath(activePath)
    const activateOrToggle = (shiftKey = false) => {
      if (pinsBulkRunning.value) return
      if (pinsSelectMode.value) {
        reducePinsSelection(shiftKey
          ? { type: 'shift-range', key: pin.path, pageKeys: pinPaths() }
          : { type: 'toggle', key: pin.path })
      } else {
        activatePin(pin)
      }
    }

    return h('div', {
      class: [
        'ccm-browser-pin-row',
        pinsSelectMode.value ? 'ccm-browser-pin-row-edit' : '',
        !pin.exists ? 'ccm-browser-pin-row-missing' : '',
        active ? 'ccm-browser-pin-row-active' : '',
      ],
      key: pin.path,
      title: missingTitle,
      role: !selectMode ? 'button' : undefined,
      tabindex: !selectMode ? (pinsBulkRunning.value ? -1 : 0) : undefined,
      'aria-disabled': !selectMode ? pinsBulkRunning.value : undefined,
      'aria-current': !selectMode && active ? 'true' : undefined,
      onClick: (event?: MouseEvent) => activateOrToggle(Boolean(event?.shiftKey)),
      onKeydown: !selectMode ? (event: KeyboardEvent) => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        activateOrToggle(event.shiftKey)
      } : undefined,
    }, [
      pinsSelectMode.value ? h('input', {
        type: 'checkbox',
        checked: pinsSelection.value.selected.has(pin.path),
        disabled: pinsBulkRunning.value,
        'aria-label': t('pin-select-folder', { name }),
        onClick: (event: MouseEvent) => {
          event.stopPropagation()
          reducePinsSelection(event.shiftKey
            ? { type: 'shift-range', key: pin.path, pageKeys: pinPaths() }
            : { type: 'toggle', key: pin.path })
        },
      }) : null,
      IconFolder(14),
      h('span', { class: 'ccm-browser-pin-name' }, name),
      h('span', { class: 'ccm-browser-pin-meta' }, [
        h('span', {}, count),
        h('span', {}, activity),
      ]),
      pinsSelectMode.value ? h('button', {
        class: 'ccm-icon-btn ccm-browser-pin-move',
        type: 'button',
        title: t('pin-move-up', { name }),
        'aria-label': t('pin-move-up', { name }),
        disabled: pinsBulkRunning.value || index === 0,
        onClick: (event?: MouseEvent) => {
          event?.stopPropagation()
          enqueuePinMutation({ type: 'move', path: pin.path, direction: 'up' })
        },
      }, [IconArrowUp(13)]) : null,
      pinsSelectMode.value ? h('button', {
        class: 'ccm-icon-btn ccm-browser-pin-move',
        type: 'button',
        title: t('pin-move-down', { name }),
        'aria-label': t('pin-move-down', { name }),
        disabled: pinsBulkRunning.value || index === pinsSelection.value.pins.length - 1,
        onClick: (event?: MouseEvent) => {
          event?.stopPropagation()
          enqueuePinMutation({ type: 'move', path: pin.path, direction: 'down' })
        },
      }, [IconArrowDown(13)]) : null,
    ])
  }

  function renderPinsSection(): any {
    const state = pinsSelection.value
    const headerControlsDisabled = state.loading || pinsBulkRunning.value || Boolean(state.corruptSidecar)
    const allSelected = state.pins.length > 0 && state.pins.every(pin => state.selected.has(pin.path))
    const selectedPins = state.pins.filter(pin => state.selected.has(pin.path))
    return h('section', { class: ['ccm-browser-pins-section', state.collapsed ? 'ccm-browser-pins-collapsed' : ''] }, [
      h('div', { class: 'ccm-browser-pins-header' }, [
        IconPin(14),
        h('span', { class: 'ccm-browser-pins-title' }, t('pinned-folders')),
        h('span', { class: 'ccm-browser-pane-count' }, String(state.pins.length)),
        h('div', { class: 'ccm-browser-pins-controls' }, [
          !state.collapsed ? h('button', {
            class: ['ccm-icon-btn', pinsSelectMode.value ? 'ccm-icon-btn-active' : ''],
            type: 'button',
            title: t('pin-edit-mode'),
            'aria-label': t('pin-edit-mode'),
            'aria-pressed': pinsSelectMode.value,
            disabled: headerControlsDisabled,
            onClick: () => {
              pinsSelectMode.value = !pinsSelectMode.value
              if (!pinsSelectMode.value) reducePinsSelection({ type: 'clear-partition' })
            },
          }, [IconCheck(14)]) : null,
          !state.collapsed ? h('button', {
            class: 'ccm-icon-btn',
            type: 'button',
            title: t('pin-reveal-in-tree'),
            'aria-label': t('pin-reveal-in-tree'),
            disabled: headerControlsDisabled || !state.activePath || bulkRunning.value,
            onClick: revealActivePinInTree,
          }, [IconCornerUpRight(14)]) : null,
          h('button', {
            class: 'ccm-icon-btn',
            type: 'button',
            title: t(state.collapsed ? 'pin-expand-section' : 'pin-collapse-section'),
            'aria-label': t(state.collapsed ? 'pin-expand-section' : 'pin-collapse-section'),
            'aria-expanded': !state.collapsed,
            'aria-pressed': state.collapsed,
            disabled: headerControlsDisabled,
            onClick: () => {
              const collapsed = !state.collapsed
              updatePinsState({ collapsed })
              void persistPinsCollapsed(collapsed)
            },
          }, [state.collapsed ? IconChevronRight(14) : IconChevronDown(14)]),
        ]),
      ]),
      state.collapsed ? null : h('div', { class: 'ccm-browser-pins-body' }, [
        state.conflictNote
          ? h('div', { class: 'ccm-browser-pin-note', role: 'status' }, t('pin-list-changed'))
          : null,
        state.corruptSidecar
          ? h('div', { class: 'ccm-browser-pin-banner', role: 'alert' }, [
              h('span', {}, t('pin-list-unreadable', { path: state.corruptSidecar })),
              h('button', {
                class: 'ccm-primary-btn ccm-primary-btn-sm',
                type: 'button',
                disabled: pinsBulkRunning.value,
                onClick: () => enqueuePinMutation({ type: 'reset-corrupt' }),
              }, t('pin-reset-list')),
            ])
          : state.error
            ? h('div', { class: 'ccm-browser-pin-banner', role: 'alert' }, state.error)
            : state.loading
              ? h('div', { class: 'ccm-browser-pin-state', role: 'status' }, t('pin-list-loading'))
              : state.pins.length === 0
                ? h('div', { class: 'ccm-browser-pin-state' }, t('pin-empty-onboarding'))
                : h('div', { class: 'ccm-browser-pin-list' }, state.pins.map(renderPinRow)),
        pinsSelectMode.value && !state.corruptSidecar ? h('div', { class: 'ccm-browser-filter-row ccm-browser-select-bar ccm-browser-pin-select-bar' }, [
          h('button', {
            class: 'ccm-icon-btn ccm-browser-action-control',
            type: 'button',
            disabled: pinsBulkRunning.value || state.pins.length === 0,
            onClick: () => reducePinsSelection(allSelected
              ? { type: 'clear-partition' }
              : { type: 'snapshot-all', keys: state.pins.map(pin => pin.path) }),
          }, [IconCheck(13), t(allSelected ? 'deselect-all' : 'select-all-filtered', { n: state.pins.length })]),
          h('span', { class: 'ccm-browser-selected-count' }, t('selected-count', { n: state.selected.size })),
          state.selected.size > 0 ? h('button', {
            class: 'ccm-icon-btn ccm-browser-clear-selection',
            type: 'button',
            title: t('clear-selection'),
            'aria-label': t('clear-selection'),
            disabled: pinsBulkRunning.value,
            onClick: () => reducePinsSelection({ type: 'clear-partition' }),
          }, [IconX(13)]) : null,
        ]) : null,
        state.selected.size > 0 && !state.corruptSidecar ? h('div', {
          class: 'ccm-browser-filter-row ccm-browser-bulk-toolbar ccm-browser-pin-toolbar',
          role: 'toolbar',
          'aria-label': t('bulk-actions'),
        }, [
          h('button', {
            class: 'ccm-icon-btn ccm-browser-action-control ccm-browser-danger-control',
            type: 'button',
            disabled: pinsBulkRunning.value,
            onClick: () => enqueuePinMutation({ type: 'remove', paths: selectedPins.map(pin => pin.path) }),
          }, [IconTrash2(13), t('pin-remove-selected', { n: selectedPins.length })]),
          h('button', {
            class: 'ccm-icon-btn ccm-browser-action-control',
            type: 'button',
            disabled: pinsBulkRunning.value,
            onClick: () => enqueuePinMutation({ type: 'promote', paths: selectedPins.map(pin => pin.path) }),
          }, [IconArrowUp(13), t('pin-promote-selected', { n: selectedPins.length })]),
        ]) : null,
      ]),
    ])
  }

  function renderTreeNode(node: SessionPathTreeNode, depth: number): any {
    const selected = committedSelection.value.path === node.path
    const highlighted = transientHighlightPath.value === node.path
    const expanded = expandedPaths.value.has(node.path)
    const hasChildren = node.children.length > 0
    const badgeTitle = t('tree-badge', {
      active: node.activeCount,
      archive: node.archiveCount,
      time: formatRelativeTime(node.newestLastActiveAt, t),
    })

    return h('div', { class: 'ccm-browser-tree-branch', key: node.path }, [
      h('div', {
        class: [
          'ccm-browser-tree-node',
          selected ? 'ccm-browser-tree-node-selected' : '',
          highlighted ? 'ccm-browser-tree-node-highlight' : '',
        ],
        style: { paddingLeft: `${8 + depth * 16}px` },
        title: node.path,
        onClick: () => selectNode(node.path),
      }, [
        hasChildren
          ? h('button', {
              class: 'ccm-icon-btn ccm-browser-tree-chevron',
              title: t(expanded ? 'collapse-directory' : 'expand-directory'),
              'aria-label': t(expanded ? 'collapse-directory' : 'expand-directory'),
              disabled: bulkRunning.value,
              onClick: (event: Event) => {
                event.stopPropagation()
                toggleExpanded(node.path)
              },
            }, [expanded ? IconChevronDown(14) : IconChevronRight(14)])
          : h('span', { class: 'ccm-browser-tree-chevron-spacer' }),
        IconFolder(15),
        h('span', { class: 'ccm-browser-tree-label' }, node.name),
        h('span', { class: 'ccm-browser-tree-badge', title: badgeTitle }, [
          h('span', { class: 'ccm-browser-tree-count ccm-browser-tree-count-active' }, t('tree-count-active', { n: node.activeCount })),
          h('span', { class: 'ccm-browser-tree-count ccm-browser-tree-count-archive' }, t('tree-count-archive', { n: node.archiveCount })),
          h('span', { class: 'ccm-browser-tree-activity' }, formatRelativeTime(node.newestLastActiveAt, t)),
        ]),
      ]),
      hasChildren && expanded
        ? h('div', { class: 'ccm-browser-tree-children' }, node.children.map(child => renderTreeNode(child, depth + 1)))
        : null,
    ])
  }

  function renderTreePane() {
    const pinnedFolder = currentFolderPin()
    return h('aside', {
      class: 'ccm-browser-pane ccm-browser-tree-pane',
      style: compactMode.value ? undefined : { width: `calc(${paneWidths.value.left}px * var(--ccm-fs, 1))` },
    }, [
      renderPinsSection(),
      h('div', { class: 'ccm-browser-tree-pane-main' }, [
        h('div', { class: 'ccm-browser-pane-header' }, [
          h('div', { class: 'ccm-browser-pane-title' }, t('workspaces')),
          h('div', { class: 'ccm-browser-pane-actions' }, [
            compactMode.value ? h('button', {
              class: 'ccm-icon-btn',
              title: t('compact-back-to-sessions'),
              'aria-label': t('compact-back-to-sessions'),
              onClick: () => { compactView.value = 'list' },
            }, [IconChevronLeft(15)]) : null,
            h('button', {
              class: ['ccm-icon-btn', pinnedFolder ? 'ccm-icon-btn-active' : ''],
              type: 'button',
              title: t(pinnedFolder ? 'pin-current-folder-remove' : 'pin-current-folder-add'),
              'aria-label': t(pinnedFolder ? 'pin-current-folder-remove' : 'pin-current-folder-add'),
              'aria-pressed': Boolean(pinnedFolder),
              disabled: loading.value
                || pinsSelection.value.loading
                || pinsBulkRunning.value
                || Boolean(pinsSelection.value.corruptSidecar)
                || !committedSelection.value.path,
              onClick: () => enqueuePinMutation(pinnedFolder
                ? { type: 'remove', paths: [pinnedFolder.path] }
                : { type: 'add', path: committedSelection.value.path }),
            }, [IconPin(15)]),
            h('button', {
              class: 'ccm-icon-btn',
              title: t('navigate-parent'),
              'aria-label': t('navigate-parent'),
              disabled: loading.value || bulkRunning.value || visibleRoot.value === '/',
              onClick: () => setVisibleRoot(parentPath(visibleRoot.value)),
            }, [IconArrowLeft(15)]),
            h('button', {
              class: ['ccm-icon-btn', committedSelection.value.mode === 'exact' ? 'ccm-icon-btn-active' : ''],
              title: t(committedSelection.value.mode === 'subtree' ? 'scope-exact' : 'scope-subtree'),
              'aria-label': t(committedSelection.value.mode === 'subtree' ? 'scope-exact' : 'scope-subtree'),
              disabled: bulkRunning.value,
              onClick: () => {
                clearSearchOverlay()
                committedSelection.value = {
                  ...committedSelection.value,
                  mode: committedSelection.value.mode === 'subtree' ? 'exact' : 'subtree',
                  sessionId: null,
                }
                applyFilterChange()
              },
            }, [committedSelection.value.mode === 'subtree' ? IconFolder(15) : IconFileText(15)]),
            h('button', {
              class: 'ccm-icon-btn',
              title: t('use-selected-folder-as-tree-root'),
              'aria-label': t('use-selected-folder-as-tree-root'),
              disabled: loading.value
                || bulkRunning.value
                || !committedSelection.value.path
                || committedSelection.value.path === visibleRoot.value,
              onClick: () => setVisibleRoot(committedSelection.value.path),
            }, [IconFolderDown(15)]),
            h('button', {
              class: 'ccm-icon-btn',
              title: t('change-tree-root'),
              'aria-label': t('change-tree-root'),
              disabled: loading.value || bulkRunning.value,
              ref: (element: HTMLElement | null) => { pickerTriggerRef.value = element },
              onClick: () => openRootPicker('tree-root'),
            }, [IconPencil(15)]),
          ]),
        ]),
        h('div', { class: 'ccm-browser-root-path', title: visibleRoot.value }, visibleRoot.value),
        h('div', { class: 'ccm-browser-tree-body' }, [
          loading.value
            ? h('div', { class: 'ccm-browser-pane-state' }, t('building-index'))
            : tree.value
              ? renderTreeNode(tree.value, 0)
              : h('div', { class: 'ccm-browser-pane-state' }, t('no-indexed-sessions')),
        ]),
      ]),
    ])
  }

  function renderCardActions(session: IndexedSession): any {
    const caps = activeCapabilities.value
    const actions: Array<{
      label: string
      icon: typeof IconTerminal
      action: 'resume' | 'archive' | 'restore' | 'delete' | 'export'
    }> = []
    actions.push({ label: t('export-session'), icon: IconDownload, action: 'export' })
    if (session.partition === 'active') {
      actions.push({ label: t('resume-session'), icon: IconTerminal, action: 'resume' })
      if (caps.archive) actions.push({ label: t('archive-session'), icon: IconArchive, action: 'archive' })
      if (caps.delete && !caps.deleteRequiresArchived) {
        actions.push({ label: t('delete-session'), icon: IconTrash2, action: 'delete' })
      }
    } else {
      if (caps.archive) actions.push({ label: t('restore-session'), icon: IconArchiveRestore, action: 'restore' })
      if (caps.delete) actions.push({ label: t('delete-archived-session'), icon: IconTrash2, action: 'delete' })
    }
    return h('div', { class: 'ccm-browser-session-actions' }, actions.map(({ label, icon, action }) => h('button', {
      class: 'ccm-icon-btn ccm-browser-card-action',
      title: label,
      'aria-label': label,
      disabled: bulkRunning.value,
      onClick: (event: Event) => {
        event.stopPropagation()
        if (bulkRunning.value) return
        if (action === 'resume') void resumeSession(session)
        else if (action === 'export') void exportSession(session)
        else if (action === 'archive') void archiveSession(session)
        else if (action === 'restore') void restoreSession(session)
        else void deleteSession(session)
      },
    }, [icon(14)])))
  }

  function renderSessionCard(session: IndexedSession, pageKeys: string[] = []): any {
    const selectedId = searchOverlay.value?.selectedSessionId ?? committedSelection.value.sessionId
    const selected = selectedId === sessionKey(session)
    const idle = formatRelativeTime(session.lastActiveAt, t)
    const untitled = t('untitled-session')
    const titles = resolveSessionTitles(session)
    const title = titles.primary || untitled
    const health = session.health === 'ok' ? '' : t(`health-${session.health}`)
    const activateCard = () => {
      if (bulkRunning.value) return
      if (selectMode.value) toggleSelected(session, false, pageKeys)
      else selectSession(session)
    }
    return h('article', {
      class: ['ccm-browser-session-card', selected ? 'ccm-browser-session-card-selected' : ''],
      key: sessionKey(session),
      role: 'button',
      tabindex: 0,
      onClick: activateCard,
      onKeydown: (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        activateCard()
      },
    }, [
      selectMode.value ? h('input', {
        type: 'checkbox',
        checked: selection.value.selected.has(sessionKey(session)),
        disabled: bulkRunning.value,
        'aria-label': t('select-session', { title }),
        onClick: (event: MouseEvent) => {
          event.stopPropagation()
          toggleSelected(session, event.shiftKey, pageKeys)
        },
      }) : null,
      h('div', { class: 'ccm-browser-session-card-topline' }, [
        session.live
          ? h('span', {
              title: t('session-live-indicator'),
              'aria-label': t('session-live-indicator'),
              style: {
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: 'var(--ccm-green)',
                boxShadow: '0 0 0 2px var(--ccm-green-bg)',
                flexShrink: '0',
              },
            })
          : null,
        h('span', { class: 'ccm-browser-session-title', title }, [
          title,
          titles.secondary ? h('span', { class: 'ccm-browser-title-sub' }, titles.secondary) : null,
        ]),
        session.health !== 'ok'
          ? h('span', {
              class: `ccm-browser-health-badge ccm-browser-health-${session.health}`,
              title: t('session-health-title', { health }),
            }, health)
          : null,
      ]),
      h('div', { class: 'ccm-browser-session-meta' }, [
        h('span', {}, formatCreatedAt(session.createdAt, locale(), t)),
        h('span', { class: `ccm-browser-session-idle ccm-browser-idle-${idleGrade(session.lastActiveAt)}` }, t('idle-value', { time: idle })),
      ]),
      h('div', { class: 'ccm-browser-session-footer' }, [
        h('span', {
          class: 'ccm-browser-session-stat',
          title: session.messageCount === undefined
            ? t('message-count-unknown')
            : t(session.messageCount === 1 ? 'message-count-one' : 'message-count-other', { n: session.messageCount }),
        }, [IconHash(12), session.messageCount === undefined ? '—' : String(session.messageCount)]),
        h('span', { class: 'ccm-browser-session-branch', title: session.gitBranch || t('no-git-branch') }, session.gitBranch || t('no-branch')),
        renderCardActions(session),
      ]),
    ])
  }

  function renderSearchResult(result: SearchResult): any {
    const session = result.session
    const selected = searchOverlay.value?.selectedSessionId === sessionKey(session)
    const titles = resolveSessionTitles(session)
    const title = titles.primary || t('untitled-session')
    return h('article', {
      class: ['ccm-browser-session-card ccm-browser-search-result', selected ? 'ccm-browser-session-card-selected' : ''],
      key: sessionKey(session),
      role: 'button',
      tabindex: 0,
      onClick: () => selectSession(session, true),
      onKeydown: (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        selectSession(session, true)
      },
    }, [
      h('div', { class: 'ccm-browser-session-card-topline' }, [
        session.live
          ? h('span', {
              title: t('session-live-indicator'),
              'aria-label': t('session-live-indicator'),
              style: { width: '7px', height: '7px', borderRadius: '50%', background: 'var(--ccm-green)', flexShrink: '0' },
            })
          : null,
        h('span', { class: 'ccm-browser-session-title', title }, [
          title,
          titles.secondary ? h('span', { class: 'ccm-browser-title-sub' }, titles.secondary) : null,
        ]),
        h('span', { class: 'ccm-browser-search-path', title: session.rootPath }, session.rootPath),
      ]),
      h('div', { class: 'ccm-browser-search-match' }, result.match),
      h('div', { class: 'ccm-browser-session-footer' }, [
        h('span', {
          class: 'ccm-browser-session-stat',
          title: session.messageCount === undefined
            ? t('message-count-unknown')
            : t(session.messageCount === 1 ? 'message-count-one' : 'message-count-other', { n: session.messageCount }),
        }, [IconHash(12), session.messageCount === undefined ? '—' : String(session.messageCount)]),
        h('span', { class: 'ccm-browser-session-branch' }, session.gitBranch || t('no-branch')),
      ]),
    ])
  }

  function renderRootPicker(): any {
    if (!showRootPicker.value) return null
    const selectingExportDestination = pickerTarget.value === 'export-destination'
    const pickerTitle = t(selectingExportDestination ? 'picker-export-title' : 'picker-title')
    const dir = pickerCurrentDir.value
    const segments = dir.split('/').filter(Boolean)
    const breadcrumbs: any[] = [
      h('span', {
        class: 'ccm-picker-crumb',
        role: 'button',
        tabindex: 0,
        onClick: () => { void navigatePickerDir('/') },
        onKeydown: (event: KeyboardEvent) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          void navigatePickerDir('/')
        },
      }, '/'),
    ]
    let accumulated = ''
    for (const segment of segments) {
      accumulated += `/${segment}`
      const target = accumulated
      breadcrumbs.push(h('span', { class: 'ccm-picker-crumb-sep' }, '/'))
      breadcrumbs.push(h('span', {
        class: 'ccm-picker-crumb',
        role: 'button',
        tabindex: 0,
        onClick: () => { void navigatePickerDir(target) },
        onKeydown: (event: KeyboardEvent) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          void navigatePickerDir(target)
        },
      }, segment))
    }

    return h('div', {
      class: 'ccm-picker-overlay',
      onKeydown: (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeRootPicker()
        }
      },
    }, [
      h('div', { class: 'ccm-picker-backdrop', onClick: closeRootPicker }),
      h('section', { class: 'ccm-picker-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': pickerTitle }, [
        h('div', { class: 'ccm-picker-header' }, [
          h('span', { class: 'ccm-picker-title' }, pickerTitle),
          h('button', {
            class: 'ccm-icon-btn ccm-icon-btn-sm',
            title: t('picker-close'),
            'aria-label': t('picker-close'),
            onClick: closeRootPicker,
          }, [IconX(14)]),
        ]),
        h('div', { class: 'ccm-picker-search' }, [
          h('input', {
            class: 'ccm-picker-input',
            ref: (element: HTMLInputElement | null) => { pickerInputRef.value = element },
            value: pickerManualPath.value,
            placeholder: t('absolute-path-placeholder'),
            'aria-label': t(selectingExportDestination ? 'picker-export-manual-path' : 'picker-manual-path'),
            onInput: (event: Event) => { pickerManualPath.value = (event.target as HTMLInputElement).value },
            onKeydown: (event: KeyboardEvent) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void validateAndCommitRoot(pickerManualPath.value)
              }
            },
          }),
          h('button', {
            class: 'ccm-picker-action-btn',
            type: 'button',
            onClick: () => { void validateAndCommitRoot(pickerManualPath.value) },
          }, [IconCheck(14), h('span', {}, t(selectingExportDestination ? 'picker-export-use-manual-path' : 'picker-use-manual-path'))]),
        ]),
        h('div', { class: 'ccm-picker-current' }, [IconFolder(14), h('span', {}, t('picker-current', { path: dir }))]),
        h('div', { class: 'ccm-picker-actions' }, [
          h('button', {
            class: 'ccm-picker-action-btn',
            type: 'button',
            onClick: () => { void validateAndCommitRoot(dir) },
          }, [IconCheck(14), h('span', {}, t(selectingExportDestination ? 'picker-export-select-current' : 'picker-select-current', { name: dir.split('/').pop() || '/' }))]),
        ]),
        h('div', { class: 'ccm-picker-breadcrumb' }, breadcrumbs),
        h('div', { class: 'ccm-picker-list' }, pickerLoading.value
          ? h('div', { class: 'ccm-picker-empty' }, [h('span', { class: 'ccm-browser-spinner' }), h('span', {}, t('picker-loading'))])
          : pickerError.value
            ? h('div', { class: 'ccm-picker-empty', role: 'alert' }, pickerError.value)
            : pickerEntries.value.length
              ? pickerEntries.value.map(entry => h('div', {
                  class: 'ccm-picker-item',
                  key: entry.path,
                  role: 'button',
                  tabindex: 0,
                  onClick: () => { void navigatePickerDir(entry.path) },
                  onKeydown: (event: KeyboardEvent) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    void navigatePickerDir(entry.path)
                  },
                }, [
                  IconFolder(14),
                  h('div', { class: 'ccm-picker-item-info' }, [
                    h('span', { class: 'ccm-picker-item-name' }, entry.name),
                    h('span', { class: 'ccm-picker-item-path' }, entry.path),
                  ]),
                  IconChevronRight(14),
                ]))
              : h('div', { class: 'ccm-picker-empty' }, t('picker-no-subdirs'))),
      ]),
    ])
  }

  function renderSettingsPopover(): any {
    if (!settingsOpen.value) return null
    return h('div', {
      class: 'ccm-browser-settings-popover',
      role: 'dialog',
      'aria-label': t('settings'),
      onKeydown: (event: KeyboardEvent) => {
        if (event.key === 'Escape') settingsOpen.value = false
      },
    }, [
      h('label', { class: 'ccm-browser-settings-row' }, [
        h('span', { class: 'ccm-browser-settings-label' }, t('language')),
        h('select', {
          value: localeSetting.value,
          onChange: (event: Event) => setLocaleSetting((event.target as HTMLSelectElement).value),
        }, [
          h('option', { value: 'auto' }, t('language-auto')),
          h('option', { value: 'zh' }, t('language-zh')),
          h('option', { value: 'en' }, t('language-en')),
        ]),
      ]),
      h('div', { class: 'ccm-browser-settings-row' }, [
        h('span', { class: 'ccm-browser-settings-label' }, t('settings-font-scale')),
        h('div', { class: 'ccm-browser-settings-stepper' }, [
          h('button', {
            class: 'ccm-icon-btn',
            type: 'button',
            title: t('settings-decrease-font'),
            'aria-label': t('settings-decrease-font'),
            disabled: fontScale.value <= 1,
            onClick: () => setFontScale(fontScale.value - 1),
          }, '−'),
          h('output', { 'aria-live': 'polite' }, t('settings-font-scale-value', { n: fontScale.value })),
          h('button', {
            class: 'ccm-icon-btn',
            type: 'button',
            title: t('settings-increase-font'),
            'aria-label': t('settings-increase-font'),
            disabled: fontScale.value >= 5,
            onClick: () => setFontScale(fontScale.value + 1),
          }, '+'),
        ]),
      ]),
      h('label', { class: 'ccm-browser-settings-row ccm-browser-settings-toggle' }, [
        h('span', { class: 'ccm-browser-settings-label' }, t('settings-theme-follow')),
        h('input', {
          type: 'checkbox',
          checked: themeFollowHost.value,
          onChange: (event: Event) => setThemeFollowHost((event.target as HTMLInputElement).checked),
        }),
      ]),
      h('div', { class: 'ccm-browser-settings-row' }, [
        h('span', { class: 'ccm-browser-settings-label' }, t('settings-export-destination')),
        h('div', { class: 'ccm-browser-settings-path-control' }, [
          h('input', {
            type: 'text',
            value: exportDestination.value,
            'aria-label': t('settings-export-destination'),
            onInput: (event: Event) => setExportDestination((event.target as HTMLInputElement).value),
          }),
          h('button', {
            class: 'ccm-icon-btn',
            type: 'button',
            title: t('settings-export-destination-browse'),
            'aria-label': t('settings-export-destination-browse'),
            onClick: () => openRootPicker('export-destination'),
          }, [IconFolder(14)]),
        ]),
      ]),
      activeCapabilities.value.originFilter ? h('label', {
        class: 'ccm-browser-settings-row ccm-browser-settings-toggle',
        title: t('hide-scripted-sessions-tooltip'),
      }, [
        h('span', { class: 'ccm-browser-settings-label' }, t('hide-scripted-sessions')),
        h('input', {
          type: 'checkbox',
          checked: hideScriptedSessions.value,
          'aria-label': t('hide-scripted-sessions'),
          onChange: (event: Event) => setHideScriptedSessions((event.target as HTMLInputElement).checked),
        }),
      ]) : null,
    ])
  }

  function renderAgentSwitcher(): any {
    const descriptor = activeDescriptor.value
    return h('label', {
      class: 'ccm-browser-select-control',
      title: descriptor ? agentTooltip(descriptor) : t('agent-switcher'),
    }, [
      IconTerminal(13),
      h('select', {
        value: activeAgent.value,
        disabled: loading.value || bulkRunning.value || mutationInFlight || agents.value.length === 0,
        'aria-label': t('agent-switcher'),
        onChange: (event: Event) => {
          void switchAgent((event.target as HTMLSelectElement).value as AgentId)
        },
      }, agents.value.map(agent => h('option', {
        value: agent.id,
        disabled: !agent.available,
        title: agentTooltip(agent),
      }, agent.degraded
        ? t('agent-degraded-option', { agent: agentLabel(agent) })
        : agentLabel(agent)))),
    ])
  }

  function renderSessionList() {
    const partition = activePartition.value
    const listedSessions = sessionsForList(partition)
    const overlay = searchOverlay.value
    const displayedCount = overlay ? overlay.results.length : listedSessions.length
    const maxPage = Math.max(1, Math.ceil(listedSessions.length / pageSize.value))
    const pageSessions = listedSessions.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
    const pinSpecificEmpty = pinsSelection.value.activePath === committedSelection.value.path
      && scopedPartitionSessions(partition).length === 0
    const pageKeys = pageSessions.map(sessionKey)
    const allSelected = listedSessions.length > 0 && listedSessions.every(session => selection.value.selected.has(sessionKey(session)))
    const createdRangeActive = Boolean(createdRange.value.from || createdRange.value.to)
    const undatedExcluded = createdRangeActive ? originFilteredSessions.value.filter(session => {
      if (!Number.isNaN(Date.parse(session.createdAt))) return false
      return filterSessions([session], {
        partition,
        scopePath: committedSelection.value.path,
        scopeMode: committedSelection.value.mode,
        timeRange: timeRange.value,
        branch: branchFilter.value,
        query: searchQuery.value,
        lastActiveFrom: lastActiveRange.value.from,
        lastActiveTo: lastActiveRange.value.to,
      }).length > 0
    }).length : 0
    const archiveSearchTooltip = t('archive-search-p2')
    const caps = activeCapabilities.value
    const savedSort = sortSettings.value[partition]
    const currentSort = savedSort.field === 'msgcount' && !messageCountsAvailable()
      ? { ...savedSort, field: 'idle' as const }
      : savedSort
    const branches = branchOptions(partition)
    const filteredBranches = filterBranchOptions(branches, branchPickerQuery.value)
    const dateRangesActive = Boolean(
      createdRange.value.from || createdRange.value.to || lastActiveRange.value.from || lastActiveRange.value.to,
    )
    const anyFilterActive = timeRange.value !== 'all'
      || Boolean(branchFilter.value)
      || Boolean(searchQuery.value.trim())
      || dateRangesActive
    return h('section', {
      class: 'ccm-browser-pane ccm-browser-list-pane',
      style: compactMode.value ? undefined : { width: `calc(${paneWidths.value.middle}px * var(--ccm-fs, 1))` },
    }, [
      h('div', { class: 'ccm-browser-pane-header' }, [
        compactMode.value ? h('button', {
          class: 'ccm-icon-btn',
          title: t('compact-show-workspaces'),
          'aria-label': t('compact-show-workspaces'),
          onClick: () => {
            settingsOpen.value = false
            filtersOpen.value = false
            branchPickerOpen.value = false
            compactView.value = 'tree'
          },
        }, [IconFolder(15)]) : null,
        renderAgentSwitcher(),
        h('div', { class: 'ccm-browser-partition-tabs', role: 'tablist', 'aria-label': t('session-partition') }, [
          h('button', {
            class: ['ccm-browser-partition-tab', partition === 'active' ? 'ccm-browser-partition-tab-active' : ''],
            role: 'tab',
            'aria-selected': partition === 'active',
            disabled: bulkRunning.value,
            onClick: () => setPartition('active'),
          }, t('active')),
          caps.archive ? h('button', {
            class: ['ccm-browser-partition-tab', partition === 'archive' ? 'ccm-browser-partition-tab-active' : ''],
            role: 'tab',
            'aria-selected': partition === 'archive',
            disabled: bulkRunning.value,
            onClick: () => setPartition('archive'),
          }, t('archive')) : null,
        ]),
        h('div', { class: 'ccm-browser-pane-count' }, String(displayedCount)),
        h('button', {
          class: ['ccm-icon-btn', selectMode.value ? 'ccm-icon-btn-active' : ''],
          title: t('select-mode'),
          'aria-label': t('select-mode'),
          'aria-pressed': selectMode.value,
          disabled: bulkRunning.value || Boolean(overlay),
          onClick: () => {
            selectMode.value = !selectMode.value
            if (!selectMode.value) selection.value = selectionReducer(selection.value, { type: 'clear-partition' })
          },
        }, [IconCheck(15)]),
        h('div', { class: ['ccm-browser-settings', settingsOpen.value ? 'ccm-browser-settings-open' : ''] }, [
          h('button', {
            class: ['ccm-icon-btn', settingsOpen.value ? 'ccm-icon-btn-active' : ''],
            title: t('settings'),
            'aria-label': t('settings'),
            'aria-expanded': settingsOpen.value,
            disabled: bulkRunning.value,
            onClick: () => {
              settingsOpen.value = !settingsOpen.value
              if (settingsOpen.value) {
                filtersOpen.value = false
                branchPickerOpen.value = false
              }
            },
          }, [IconSettings(15)]),
          renderSettingsPopover(),
        ]),
      ]),
      h('div', { class: 'ccm-browser-list-toolbar' }, [
        h('label', { class: 'ccm-browser-search-box', title: partition === 'archive' ? archiveSearchTooltip : t('type-filter-search') }, [
          IconSearch(14),
          h('input', {
            id: 'session-browser-search-input',
            ref: (element: HTMLInputElement | null) => { searchInputRef.value = element },
            value: searchQuery.value,
            disabled: bulkRunning.value,
            placeholder: t('search-placeholder'),
            'aria-label': t('search-sessions'),
            onInput: (event: Event) => {
              clearSearchOverlay()
              searchQuery.value = (event.target as HTMLInputElement).value
              applyFilterChange()
            },
            onKeydown: handleSearchKeydown,
          }),
          searchQuery.value
            ? h('button', {
                class: 'ccm-icon-btn ccm-browser-search-clear',
                title: t('clear-search'),
                'aria-label': t('clear-search'),
                disabled: bulkRunning.value,
                onClick: () => clearSearchOverlay(true),
              }, [IconX(13)])
            : null,
        ]),
        h('button', {
          class: ['ccm-icon-btn', globalSearch.value ? 'ccm-icon-btn-active' : ''],
          title: t(globalSearch.value ? 'full-text-global' : 'full-text-scoped'),
          'aria-label': t('toggle-global-search'),
          'aria-pressed': globalSearch.value,
          disabled: bulkRunning.value,
          onClick: () => {
            clearSearchOverlay()
            globalSearch.value = !globalSearch.value
          },
        }, [IconGlobe(14)]),
        h('button', {
          class: 'ccm-icon-btn',
          title: partition === 'archive' ? archiveSearchTooltip : t('run-full-text-search'),
          'aria-label': t('run-full-text-search'),
          disabled: bulkRunning.value || partition === 'archive' || !searchQuery.value.trim() || searching.value,
          onClick: runFullTextSearch,
        }, [IconSearch(14)]),
      ]),
      h('div', { class: 'ccm-browser-filter-row' }, [
        h('label', { class: 'ccm-browser-select-control', title: t('sort-sessions') }, [
          IconChevronDown(13),
          h('select', {
            value: currentSort.field,
            disabled: bulkRunning.value,
            'aria-label': t('sort-sessions-by'),
            onChange: (event: Event) => updateSortField((event.target as HTMLSelectElement).value as SessionSortField),
          }, [
            h('option', { value: 'idle' }, t('idle')),
            h('option', { value: 'created' }, t('created')),
            messageCountsAvailable() ? h('option', { value: 'msgcount' }, t('messages')) : null,
          ]),
        ]),
        h('button', {
          class: ['ccm-icon-btn ccm-browser-sort-direction', currentSort.direction === 'desc' ? 'ccm-browser-sort-desc' : ''],
          title: t(currentSort.direction === 'asc' ? 'sort-ascending' : 'sort-descending'),
          'aria-label': t('sort-direction-toggle'),
          disabled: bulkRunning.value,
          onClick: toggleSortDirection,
        }, [IconChevronDown(14)]),
        h('label', { class: 'ccm-browser-select-control', title: t('filter-by-last-activity') }, [
          IconRefresh(13),
          h('select', {
            value: timeRange.value,
            disabled: bulkRunning.value,
            'aria-label': t('filter-by-time-range'),
            onChange: (event: Event) => setTimeRange((event.target as HTMLSelectElement).value as TimeRangeFilter),
          }, [
            h('option', { value: 'all' }, t('all-time')),
            h('optgroup', { label: t('activity-recent') }, [
              h('option', { value: '24h' }, t('time-24h')),
              h('option', { value: '7d' }, t('time-7d')),
              h('option', { value: '30d' }, t('time-30d')),
            ]),
            h('optgroup', { label: t('activity-stale') }, [
              h('option', { value: 'older-15d' }, t('time-older-15d')),
              h('option', { value: 'older-30d' }, t('time-older-30d')),
            ]),
          ]),
        ]),
        h('div', { class: ['ccm-browser-settings ccm-browser-branch-filter', branchPickerOpen.value ? 'ccm-browser-settings-open' : ''] }, [
          h('button', {
            class: 'ccm-icon-btn ccm-browser-select-control ccm-browser-branch-trigger',
            type: 'button',
            title: t('filter-by-git-branch'),
            'aria-label': t('filter-by-git-branch'),
            disabled: bulkRunning.value,
            onClick: () => {
              branchPickerOpen.value = !branchPickerOpen.value
              if (branchPickerOpen.value) {
                branchPickerQuery.value = ''
                scheduleMountTimeout(() => branchSearchRef.value?.focus(), 0)
                filtersOpen.value = false
                settingsOpen.value = false
              }
            },
          }, [IconHash(13), h('span', { class: 'ccm-browser-branch-current' }, branchFilter.value || t('all-branches'))]),
          branchPickerOpen.value ? h('div', {
            class: 'ccm-browser-settings-popover ccm-browser-branch-popover',
            role: 'dialog',
            'aria-label': t('filter-by-git-branch'),
          }, [
            h('input', {
              class: 'ccm-browser-branch-search',
              type: 'search',
              ref: (element: HTMLInputElement | null) => { branchSearchRef.value = element },
              value: branchPickerQuery.value,
              placeholder: t('branch-search-placeholder'),
              'aria-label': t('branch-search-placeholder'),
              disabled: bulkRunning.value,
              onInput: (event: Event) => { branchPickerQuery.value = (event.target as HTMLInputElement).value },
              onKeydown: (event: KeyboardEvent) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  branchPickerOpen.value = false
                } else if (event.key === 'Enter' && filteredBranches.length > 0) {
                  event.preventDefault()
                  branchFilter.value = filteredBranches[0]
                  branchPickerOpen.value = false
                  branchPickerQuery.value = ''
                  applyFilterChange()
                }
              },
            }),
            h('div', { class: 'ccm-browser-branch-options', role: 'listbox' }, [
              h('button', {
                class: ['ccm-browser-branch-option', branchFilter.value === '' ? 'is-active' : ''],
                type: 'button',
                role: 'option',
                'aria-selected': branchFilter.value === '',
                disabled: bulkRunning.value,
                onClick: () => {
                  branchFilter.value = ''
                  branchPickerOpen.value = false
                  branchPickerQuery.value = ''
                  applyFilterChange()
                },
              }, t('all-branches')),
              ...filteredBranches.map(branch => h('button', {
                class: ['ccm-browser-branch-option', branchFilter.value === branch ? 'is-active' : ''],
                type: 'button',
                role: 'option',
                'aria-selected': branchFilter.value === branch,
                disabled: bulkRunning.value,
                title: branch,
                onClick: () => {
                  branchFilter.value = branch
                  branchPickerOpen.value = false
                  branchPickerQuery.value = ''
                  applyFilterChange()
                },
              }, branch)),
              filteredBranches.length === 0 ? h('div', { class: 'ccm-browser-branch-empty' }, t('no-branch-matches')) : null,
            ]),
          ]) : null,
        ]),
        h('div', { class: ['ccm-browser-settings', filtersOpen.value ? 'ccm-browser-settings-open' : ''] }, [
          h('button', {
            class: [
              'ccm-icon-btn ccm-browser-text-control',
              filtersOpen.value ? 'ccm-icon-btn-active' : '',
              dateRangesActive ? 'ccm-browser-has-active' : '',
            ],
            title: t('date-filters'),
            'aria-label': t('date-filters'),
            disabled: bulkRunning.value,
            onClick: () => {
              filtersOpen.value = !filtersOpen.value
              if (filtersOpen.value) {
                settingsOpen.value = false
                branchPickerOpen.value = false
              }
            },
          }, t('date-filter-short')),
          filtersOpen.value ? h('div', { class: 'ccm-browser-settings-popover', role: 'dialog', 'aria-label': t('date-filters') }, [
            h('fieldset', {}, [
              h('legend', {}, t('created')),
              h('label', {}, [t('date-from'), h('input', { type: 'date', disabled: bulkRunning.value, value: createdRange.value.from, onChange: (event: Event) => commitDateRange('created', 'from', (event.target as HTMLInputElement).value) })]),
              h('label', {}, [t('date-to'), h('input', { type: 'date', disabled: bulkRunning.value, value: createdRange.value.to, onChange: (event: Event) => commitDateRange('created', 'to', (event.target as HTMLInputElement).value) })]),
            ]),
            h('fieldset', {}, [
              h('legend', {}, t('last-active')),
              h('label', {}, [t('date-from'), h('input', { type: 'date', disabled: bulkRunning.value, value: lastActiveRange.value.from, onChange: (event: Event) => commitDateRange('lastActive', 'from', (event.target as HTMLInputElement).value) })]),
              h('label', {}, [t('date-to'), h('input', { type: 'date', disabled: bulkRunning.value, value: lastActiveRange.value.to, onChange: (event: Event) => commitDateRange('lastActive', 'to', (event.target as HTMLInputElement).value) })]),
            ]),
          ]) : null,
        ]),
        anyFilterActive ? h('button', {
          class: 'ccm-icon-btn ccm-browser-text-control ccm-browser-secondary-control ccm-browser-reset-filters',
          type: 'button',
          title: t('clear-all-filters'),
          'aria-label': t('clear-all-filters'),
          disabled: bulkRunning.value,
          onClick: clearAllFilters,
        }, [IconX(13)]) : null,
      ]),
      h('div', {
        class: ['ccm-browser-scope-summary', overlay ? 'ccm-browser-search-breadcrumb' : ''],
        title: overlay?.scopePath || committedSelection.value.path,
      }, [
        h('span', {}, overlay ? t('search') : t(committedSelection.value.mode === 'subtree' ? 'subtree' : 'exact-directory')),
        h('span', { class: 'ccm-browser-scope-path' }, overlay
          ? `${overlay.scopePath ? overlay.scopePath : t('global')} · “${overlay.query}”`
          : committedSelection.value.path),
        overlay
          ? h('button', {
              class: 'ccm-icon-btn',
              title: t('leave-full-text-results'),
              'aria-label': t('leave-full-text-results'),
              disabled: bulkRunning.value,
              onClick: () => clearSearchOverlay(true),
            }, [IconX(13)])
          : null,
      ]),
      h('div', { class: 'ccm-browser-session-list' }, [
        loading.value
          ? h('div', { class: 'ccm-browser-pane-state' }, t('loading-sessions'))
          : searching.value
            ? h('div', { class: 'ccm-browser-pane-state' }, t('searching-session-text'))
            : overlay
              ? overlay.results.length
                ? overlay.results.map(renderSearchResult)
                : h('div', { class: 'ccm-browser-pane-state' }, t('no-full-text-matches'))
              : pageSessions.length
                ? pageSessions.map(session => renderSessionCard(session, pageKeys))
                : h('div', { class: 'ccm-browser-pane-state' }, pinSpecificEmpty
                    ? t('pin-no-sessions')
                    : t('no-matching-sessions', { partition: t(partition) })),
      ]),
      !overlay && selectMode.value ? h('div', { class: 'ccm-browser-filter-row ccm-browser-select-bar' }, [
        h('button', {
          class: 'ccm-icon-btn ccm-browser-action-control',
          disabled: bulkRunning.value || listedSessions.length === 0,
          onClick: () => {
            selection.value = selectionReducer(selection.value, allSelected
              ? { type: 'clear-partition' }
              : { type: 'snapshot-all', keys: listedSessions.map(sessionKey) })
          },
        }, [IconCheck(13), t(allSelected ? 'deselect-all' : 'select-all-filtered', { n: listedSessions.length })]),
        h('span', { class: 'ccm-browser-selected-count' }, t('selected-count', { n: selection.value.selected.size })),
        selection.value.selected.size > 0 ? h('button', {
          class: 'ccm-icon-btn ccm-browser-clear-selection',
          title: t('clear-selection'),
          'aria-label': t('clear-selection'),
          disabled: bulkRunning.value,
          onClick: () => { selection.value = selectionReducer(selection.value, { type: 'clear-partition' }) },
        }, [IconX(13)]) : null,
      ]) : null,
      !overlay && selection.value.selected.size ? h('div', { class: 'ccm-browser-filter-row ccm-browser-bulk-toolbar', role: 'toolbar', 'aria-label': t('bulk-actions') }, [
        h('button', { class: 'ccm-icon-btn ccm-browser-action-control', disabled: bulkRunning.value, onClick: () => { void executeBulk('export') } }, [IconDownload(13), t('bulk-export', { n: selectedItems().length })]),
        caps.archive && partition === 'active'
          ? h('button', { class: 'ccm-icon-btn ccm-browser-action-control', disabled: bulkRunning.value, onClick: () => { void executeBulk('archive') } }, [IconArchive(13), t('bulk-archive', { n: selectedItems().length })])
          : null,
        caps.archive && partition === 'archive'
          ? h('button', { class: 'ccm-icon-btn ccm-browser-action-control', disabled: bulkRunning.value, onClick: () => { void executeBulk('restore') } }, [IconArchiveRestore(13), t('bulk-restore', { n: selectedItems().length })])
          : null,
        caps.delete && (partition === 'archive' || !caps.deleteRequiresArchived)
          ? h('button', { class: 'ccm-icon-btn ccm-browser-action-control ccm-browser-danger-control', disabled: bulkRunning.value, onClick: () => { void executeBulk('delete') } }, [IconTrash2(13), t('bulk-delete', { n: selectedItems().length })])
          : null,
        bulkRunning.value ? h('button', { class: 'ccm-icon-btn ccm-browser-action-control ccm-browser-secondary-control', onClick: () => { bulkCancelRequested.value = true } }, [IconX(13), t('cancel')]) : null,
      ]) : null,
      bulkRunning.value ? h('div', { role: 'status' }, [
        h('progress', { value: bulkProgress.value.completed, max: bulkProgress.value.total }),
        h('span', {}, t('bulk-progress', { n: bulkProgress.value.completed, total: bulkProgress.value.total, title: bulkProgress.value.title })),
      ]) : null,
      bulkResult.value ? h('div', { class: 'ccm-browser-bulk-result', role: 'status' }, [
        h('div', { class: 'ccm-browser-bulk-result-summary' }, [
          h('span', {}, t('bulk-result', { done: bulkResult.value.done, failed: bulkResult.value.failed, skipped: bulkResult.value.skipped })),
          h('button', {
            class: 'ccm-icon-btn',
            title: t('dismiss-result'),
            'aria-label': t('dismiss-result'),
            onClick: () => { bulkResult.value = null; bulkRefreshFailed.value = false },
          }, [IconX(13)]),
        ]),
        bulkRefreshFailed.value ? h('div', {}, t('bulk-refresh-stale')) : null,
        bulkResult.value.earlyAborted ? h('div', {}, t('bulk-export-early-abort')) : null,
        ...bulkResult.value.results.filter(result => result.status !== 'done').map(result => h('div', { class: 'ccm-browser-bulk-result-item', key: result.key }, [
          h('strong', { class: 'ccm-browser-bulk-result-title' }, resolveSessionTitle(result.session) || t('untitled-session')),
          h('code', { class: 'ccm-browser-bulk-result-id' }, result.session.id),
          h('span', { class: 'ccm-browser-bulk-result-reason' }, result.reason || t('bulk-result-unknown-reason')),
        ])),
      ]) : null,
      !overlay ? h('footer', { class: 'ccm-browser-filter-row ccm-browser-pager' }, [
        h('button', { class: 'ccm-icon-btn', title: t('previous-page'), 'aria-label': t('previous-page'), disabled: bulkRunning.value || page.value <= 1, onClick: () => setPage(page.value - 1, listedSessions.length) }, [IconChevronLeft(15)]),
        h('span', {}, t('page-indicator', { page: page.value, pages: maxPage })),
        h('button', { class: 'ccm-icon-btn', title: t('next-page'), 'aria-label': t('next-page'), disabled: bulkRunning.value || page.value >= maxPage, onClick: () => setPage(page.value + 1, listedSessions.length) }, [IconChevronRight(15)]),
        h('label', { class: 'ccm-browser-pager-size', 'aria-label': t('page-size') }, [
          h('span', { class: 'ccm-browser-pager-size-label' }, t('page-size')),
          h('select', {
            value: pageSize.value,
            disabled: bulkRunning.value,
            onChange: (event: Event) => {
              if (activeMount) activeMount.displayGeneration++
              pageSize.value = Number((event.target as HTMLSelectElement).value) as (typeof PAGE_SIZES)[number]
              persist(STORAGE_KEYS.pageSize, pageSize.value)
              page.value = clampPage(page.value, listedSessions.length, pageSize.value)
              selection.value = selectionReducer(selection.value, { type: 'clear-anchor' })
            },
          }, PAGE_SIZES.map(size => h('option', { value: size }, String(size)))),
        ]),
        undatedExcluded ? h('span', {}, t('undated-excluded', { n: undatedExcluded })) : null,
      ]) : null,
    ])
  }

  function getToolIcon(name: string): any {
    switch (name) {
      case 'Bash': return IconTerminal(14)
      case 'Read': return IconEye(14)
      case 'Edit': case 'Write': return IconPencil(14)
      case 'Grep': case 'Glob': return IconSearch(14)
      case 'Agent': return IconZap(14)
      default: return IconFileText(14)
    }
  }

  function renderToolDetail(tool: TranscriptToolUse): any {
    const rows: any[] = [
      h('div', { class: 'ccm-browser-tool-detail-row' }, [
        h('span', { class: 'ccm-browser-tool-detail-label' }, t('summary')),
        h('code', {}, tool.summary || tool.name),
      ]),
    ]
    if (tool.filePath) rows.push(h('div', { class: 'ccm-browser-tool-detail-row' }, [
      h('span', { class: 'ccm-browser-tool-detail-label' }, t('file')),
      h('code', {}, tool.filePath),
    ]))
    if (tool.oldString !== undefined) rows.push(h('div', { class: 'ccm-browser-tool-detail-section' }, [
      h('span', { class: 'ccm-browser-tool-detail-label' }, t('before')),
      h('pre', {}, tool.oldString),
    ]))
    if (tool.newString !== undefined) rows.push(h('div', { class: 'ccm-browser-tool-detail-section' }, [
      h('span', { class: 'ccm-browser-tool-detail-label' }, t(tool.replaceAll ? 'after-replace-all' : 'after')),
      h('pre', {}, tool.newString),
    ]))
    if (tool.content !== undefined) rows.push(h('div', { class: 'ccm-browser-tool-detail-section' }, [
      h('span', { class: 'ccm-browser-tool-detail-label' }, t('content')),
      h('pre', {}, tool.content),
    ]))
    return rows
  }

  function renderToolCard(messageKey: string, tool: TranscriptToolUse, index: number): any {
    const key = `${messageKey}-${index}`
    const expanded = expandedTools.value.has(key)
    const toggle = () => toggleTool(messageKey, index)
    return h('div', { class: ['ccm-browser-tool-card', expanded ? 'ccm-browser-tool-card-expanded' : ''], key }, [
      h('div', {
        class: 'ccm-browser-tool-header',
        role: 'button',
        tabindex: 0,
        'aria-expanded': expanded,
        onClick: toggle,
        onKeydown: (event: KeyboardEvent) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          toggle()
        },
      }, [
        h('span', { class: 'ccm-browser-tool-icon' }, getToolIcon(tool.name)),
        h('span', { class: 'ccm-browser-tool-name' }, tool.name),
        h('span', { class: 'ccm-browser-tool-summary' }, tool.summary || tool.name),
        h('span', { class: 'ccm-browser-tool-chevron' }, expanded ? IconChevronDown(12) : IconChevronRight(12)),
      ]),
      expanded ? h('div', { class: 'ccm-browser-tool-detail' }, renderToolDetail(tool)) : null,
    ])
  }

  function renderTranscriptMessage(message: TranscriptMessage, index: number): any {
    const isUser = message.role === 'user'
    const messageKey = message.uuid || `${selectedSession.value?.id || 'session'}-${index}`
    return h('article', {
      class: ['ccm-browser-message', isUser ? 'ccm-browser-message-user' : 'ccm-browser-message-assistant'],
      key: messageKey,
    }, [
      h('div', { class: 'ccm-browser-message-gutter' }, [
        h('div', { class: ['ccm-browser-avatar', isUser ? 'ccm-browser-avatar-user' : 'ccm-browser-avatar-assistant'] }, [
          isUser ? IconUser(16) : IconClaude(16),
        ]),
      ]),
      h('div', { class: 'ccm-browser-message-body' }, [
        h('div', { class: 'ccm-browser-message-meta' }, [
          h('span', { class: 'ccm-browser-message-role' }, t(isUser ? 'you' : 'claude')),
          message.model ? h('span', { class: 'ccm-browser-model-tag' }, message.model) : null,
          h('span', { class: 'ccm-browser-message-time' }, formatTranscriptTime(message.timestamp, locale())),
        ].filter(Boolean)),
        h('div', { class: 'ccm-browser-message-content' }, renderMarkdown(message.content)),
        message.toolUses?.length
          ? h('div', { class: 'ccm-browser-tools-section' }, message.toolUses.map((tool, toolIndex) => renderToolCard(messageKey, tool, toolIndex)))
          : null,
      ]),
    ])
  }

  function renderMarkdown(content: string): any[] {
    if (!content) return [h('span', { class: 'ccm-browser-muted' }, t('no-content'))]
    const cleaned = content.replace(/<\/?command-(?:message|name)[^>]*>/g, '')
    const lines = cleaned.split('\n')
    const elements: any[] = []
    let inCode = false
    let codeLines: string[] = []
    let codeLang = ''
    let codeKey = 0

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]
      if (line.startsWith('```')) {
        if (inCode) {
          elements.push(renderCodeBlock(codeLines.join('\n'), codeLang, codeKey++))
          codeLines = []
          codeLang = ''
          inCode = false
        } else {
          inCode = true
          codeLang = line.slice(3).trim()
        }
        continue
      }
      if (inCode) {
        codeLines.push(line)
        continue
      }
      if (line.startsWith('# ')) elements.push(h('h1', { class: 'ccm-browser-md-h1', key: index }, renderInline(line.slice(2))))
      else if (line.startsWith('## ')) elements.push(h('h2', { class: 'ccm-browser-md-h2', key: index }, renderInline(line.slice(3))))
      else if (line.startsWith('### ')) elements.push(h('h3', { class: 'ccm-browser-md-h3', key: index }, renderInline(line.slice(4))))
      else if (line.startsWith('> ')) elements.push(h('blockquote', { class: 'ccm-browser-md-quote', key: index }, renderInline(line.slice(2))))
      else if (/^[-*]\s/.test(line)) elements.push(h('div', { class: 'ccm-browser-md-li', key: index }, renderInline(line.replace(/^[-*]\s/, ''))))
      else if (/^\d+\.\s/.test(line)) elements.push(h('div', { class: 'ccm-browser-md-li ccm-browser-md-oli', key: index }, renderInline(line.replace(/^\d+\.\s/, ''))))
      else if (line === '---' || line === '***') elements.push(h('hr', { class: 'ccm-browser-md-hr', key: index }))
      else if (line.trim() !== '') elements.push(h('p', { class: 'ccm-browser-md-p', key: index }, renderInline(line)))
    }
    if (inCode && codeLines.length) elements.push(renderCodeBlock(codeLines.join('\n'), codeLang, codeKey))
    return elements.length ? elements : [h('span', { class: 'ccm-browser-muted' }, t('empty'))]
  }

  function renderCodeBlock(code: string, lang: string, key: number): any {
    return h('div', { class: 'ccm-browser-code-block', key: `code-${key}` }, [
      h('div', { class: 'ccm-browser-code-toolbar' }, [
        h('span', { class: 'ccm-browser-code-lang' }, lang || t('code')),
        h('button', {
          class: 'ccm-icon-btn ccm-browser-code-copy',
          title: t('copy-code'),
          'aria-label': t('copy-code'),
          onClick: () => { navigator.clipboard.writeText(code).catch(() => {}) },
        }, [IconCopy(13)]),
      ]),
      h('pre', { class: 'ccm-browser-code-pre' }, [h('code', { class: lang ? `language-${lang}` : '' }, code)]),
    ])
  }

  function renderInline(text: string): any[] {
    const parts: any[] = []
    let remaining = text
    let keyCounter = 0
    while (remaining.length > 0) {
      const codeMatch = remaining.match(/`([^`]+)`/)
      const boldMatch = remaining.match(/\*\*([^*]+)\*\*/)
      const italicMatch = remaining.match(/(?<!\*)\*([^*]+)\*(?!\*)/)
      const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/)
      const candidates = [
        codeMatch ? { type: 'code', idx: codeMatch.index!, match: codeMatch } : null,
        boldMatch ? { type: 'bold', idx: boldMatch.index!, match: boldMatch } : null,
        italicMatch ? { type: 'italic', idx: italicMatch.index!, match: italicMatch } : null,
        linkMatch ? { type: 'link', idx: linkMatch.index!, match: linkMatch } : null,
      ].filter(Boolean) as { type: string; idx: number; match: RegExpMatchArray }[]
      if (!candidates.length) {
        parts.push(remaining)
        break
      }
      candidates.sort((left, right) => left.idx - right.idx)
      const first = candidates[0]
      if (first.idx > 0) parts.push(remaining.slice(0, first.idx))
      const key = keyCounter++
      if (first.type === 'code') parts.push(h('code', { class: 'ccm-browser-inline-code', key }, first.match[1]))
      else if (first.type === 'bold') parts.push(h('strong', { key }, first.match[1]))
      else if (first.type === 'italic') parts.push(h('em', { key }, first.match[1]))
      else if (isSafeTranscriptHref(first.match[2])) parts.push(h('a', { class: 'ccm-browser-link', href: first.match[2], target: '_blank', rel: 'noopener', key }, first.match[1]))
      else parts.push(first.match[1])
      remaining = remaining.slice(first.idx + first.match[0].length)
    }
    return parts
  }

  function renderDetailPane() {
    const session = selectedSession.value
    if (!session) return h('main', { class: 'ccm-browser-pane ccm-browser-detail-pane' }, [
      h('div', { class: 'ccm-browser-pane-header' }, [
        compactMode.value ? h('button', {
          class: 'ccm-icon-btn',
          title: t('compact-back-to-sessions'),
          'aria-label': t('compact-back-to-sessions'),
          onClick: () => { compactView.value = 'list' },
        }, [IconChevronLeft(15)]) : null,
        h('div', { class: 'ccm-browser-pane-title' }, t('session-pane-title')),
      ]),
      h('div', { class: 'ccm-browser-detail-placeholder' }, t('session-select-prompt')),
    ])

    const caps = activeCapabilities.value
    const unhealthy = session.health === 'empty' || session.health === 'truncated'
    return h('main', { class: 'ccm-browser-pane ccm-browser-detail-pane' }, [
      h('div', { class: 'ccm-browser-pane-header ccm-browser-transcript-header' }, [
        compactMode.value ? h('button', {
          class: 'ccm-icon-btn ccm-browser-transcript-back',
          title: t('compact-back-to-sessions'),
          'aria-label': t('compact-back-to-sessions'),
          onClick: () => { compactView.value = 'list' },
        }, [IconChevronLeft(15)]) : null,
        h('div', { class: 'ccm-browser-transcript-identity' }, [
          h('div', { class: 'ccm-browser-transcript-id-row' }, [
            h('code', { class: 'ccm-browser-transcript-id', title: session.id }, session.id),
            h('button', {
              class: 'ccm-icon-btn ccm-browser-transcript-copy-id',
              title: t(copiedSessionId.value ? 'session-id-copied' : 'copy-session-id'),
              'aria-label': t(copiedSessionId.value ? 'session-id-copied' : 'copy-session-id'),
              onClick: copySessionId,
            }, [copiedSessionId.value ? IconCheck(13) : IconCopy(13)]),
            copiedSessionId.value ? h('span', { class: 'ccm-browser-copy-feedback', 'aria-live': 'polite' }, t('copied')) : null,
          ]),
          h('div', { class: 'ccm-browser-transcript-cwd', title: session.rootPath }, session.rootPath),
          h('div', { class: 'ccm-browser-transcript-span', title: `${session.createdAt} → ${session.lastActiveAt}` }, formatSessionSpan(session.createdAt, session.lastActiveAt, locale(), t)),
        ]),
        h('div', { class: 'ccm-browser-pane-actions' }, [
          session.partition === 'active' || caps.archive ? h('button', {
            class: 'ccm-icon-btn',
            title: t('resume-session'),
            'aria-label': t('resume-session'),
            disabled: bulkRunning.value,
            onClick: () => { void resumeSession(session) },
          }, [IconTerminal(15)]) : null,
          h('button', {
            class: 'ccm-icon-btn',
            title: t('copy-resume-command'),
            'aria-label': t('copy-resume-command'),
            onClick: () => { void copyResumeCommand(session) },
          }, [IconCopy(15)]),
        ]),
      ]),
      h('div', {
        class: 'ccm-browser-transcript-body',
        ref: (element: HTMLElement | null) => { transcriptScrollRef.value = element },
      }, [
        unhealthy ? h('div', { class: 'ccm-browser-transcript-notice', role: 'status' },
          session.health === 'empty'
            ? t('transcript-empty')
            : t('transcript-truncated')
        ) : null,
        transcriptError.value ? h('div', { class: 'ccm-browser-transcript-error', role: 'alert' }, [
          h('span', {}, transcriptError.value),
          h('button', {
            class: 'ccm-icon-btn',
            title: t('dismiss-transcript-error'),
            'aria-label': t('dismiss-transcript-error'),
            onClick: () => { transcriptError.value = null },
          }, [IconX(13)]),
        ]) : null,
        transcriptLoading.value ? h('div', { class: 'ccm-browser-transcript-loading', role: 'status' }, [
          h('span', { class: 'ccm-browser-spinner', 'aria-hidden': 'true' }),
          h('span', {}, t('loading-transcript')),
        ]) : null,
        !transcriptLoading.value && !transcriptError.value && transcriptMessages.value.length === 0
          ? h('div', { class: 'ccm-browser-transcript-empty' }, t('no-transcript-messages'))
          : transcriptMessages.value.map(renderTranscriptMessage),
      ]),
    ])
  }

  return {
    component: {
      setup() {
        const mount = createMountContext()
        activeMount = mount
        ctx.onMounted(() => {
          mount.active = true
          activeMount = mount
          if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
            mount.localeObserver = new MutationObserver(() => {
              if (isActiveMount(mount) && localeSetting.value === 'auto') {
                localeRef.value = resolveLocale('auto', document.documentElement.lang)
              }
            })
            mount.localeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
          }
          if (rootRef.value) observeRootElement(mount, rootRef.value)
          const preserveState = hasMounted
          hasMounted = true
          void loadPaneWidths()
          void loadSortSettings()
          void (async () => {
            await loadDisplaySettings()
            if (isActiveMount(mount)) await initializeAgents(preserveState)
          })()
        })
        ctx.onUnmounted(() => {
          bulkCancelRequested.value = true
          bulkRunning.value = false
          pinsBulkRunning.value = false
          loading.value = false
          transcriptLoading.value = false
          searching.value = false
          pickerLoading.value = false
          stopResize()
          mount.active = false
          mount.indexGeneration++
          mount.searchGeneration++
          mount.pinsGeneration++
          mount.transcriptLoadToken++
          mount.pickerRequestSeq++
          mount.pickerValidationSeq++
          mount.rootResizeObserver?.disconnect()
          mount.localeObserver?.disconnect()
          if (mount.pinsNoteTimer) clearTimeout(mount.pinsNoteTimer)
          for (const dispose of mount.disposers) dispose()
          mount.disposers.clear()
          mount.highlightTimer = null
          mount.copiedTimer = null
          mount.pinsNoteTimer = null
          mount.transcriptFrame = null
          if (activeMount === mount) activeMount = null
        })
        return {}
      },
      render() {
        return h('div', {
          class: [
            'ccm-root ccm-browser-root',
            themeFollowHost.value ? 'ccm-theme-host' : 'ccm-theme-builtin',
            compactMode.value ? 'ccm-browser-compact' : '',
            compactMode.value ? `ccm-browser-view-${compactView.value}` : '',
            kbAvoid.value ? 'ccm-browser-kb-avoid' : '',
          ],
          ref: setRootElement,
          style: {
            '--ccm-fs': String(FONT_SCALE_MULTIPLIERS[fontScale.value] || 1),
            ...(kbAvoid.value
              ? { '--ccm-kb-w': `${kbAvoidW.value}px`, '--ccm-kb-h': `${kbAvoidH.value}px` }
              : {}),
          },
        }, [
          (settingsOpen.value || filtersOpen.value || branchPickerOpen.value)
            ? h('div', {
                class: 'ccm-browser-settings-scrim',
                'aria-hidden': 'true',
                onClick: () => { settingsOpen.value = false; filtersOpen.value = false; branchPickerOpen.value = false },
              })
            : null,
          error.value
            ? h('div', { class: 'ccm-browser-error', role: 'alert' }, [
                h('span', {}, error.value),
                errorAction.value
                  ? h('button', {
                      class: 'ccm-primary-btn ccm-primary-btn-sm',
                      onClick: () => {
                        const action = errorAction.value
                        clearError()
                        action?.run()
                      },
                    }, errorAction.value.label)
                  : null,
                h('button', {
                  class: 'ccm-icon-btn',
                  title: t('dismiss-error'),
                  'aria-label': t('dismiss-error'),
                  onClick: clearError,
                }, [IconX(14)]),
              ])
            : null,
          h('div', { class: 'ccm-browser-layout' }, [
            renderTreePane(),
            compactMode.value ? null : h('div', {
              class: 'ccm-browser-resize-handle',
              role: 'separator',
              'aria-label': t('resize-workspace-tree'),
              'aria-orientation': 'vertical',
              onPointerdown: startResize,
            }),
            renderSessionList(),
            renderDetailPane(),
          ]),
          renderRootPicker(),
        ])
      },
    },
  }
}
