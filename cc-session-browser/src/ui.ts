import type { PluginContext, PluginExports } from '../../plugin-api/index'
import {
  initIcons,
  IconArchive,
  IconArchiveRestore,
  IconArrowLeft,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClaude,
  IconCopy,
  IconEye,
  IconFileText,
  IconFolder,
  IconGlobe,
  IconHash,
  IconPencil,
  IconPlay,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconTerminal,
  IconTrash2,
  IconUser,
  IconX,
  IconZap,
} from './icons'
import { initI18n, normalizeLocaleSetting, resolveLocale, type LocaleSetting, type PluginLocale } from './i18n'

export type SessionPartition = 'active' | 'archive'

export interface IndexedSession {
  id: string
  rootPath: string
  attributionKey: string
  title: string
  createdAt: string
  lastActiveAt: string
  messageCount: number
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
export type TimeRangeFilter = 'all' | '24h' | '7d' | '30d'

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
export type BulkAction = 'archive' | 'restore' | 'delete'
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

interface CliFailure {
  error: string
  message: string
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
}

const STORAGE_KEYS = {
  locale: 'locale',
  fontScale: 'fontScale',
  themeFollowHost: 'themeFollowHost',
  paneWidths: 'paneWidths',
  treeRoot: 'treeRoot',
  treeExpandedPaths: 'treeExpandedPaths',
  sessionListSort: 'sessionListSort',
  pageSize: 'pageSize',
} as const

const DEFAULT_PANE_WIDTHS: PaneWidths = { left: 280, middle: 360 }
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

type Translate = ReturnType<typeof initI18n>['t']
type CompactView = 'tree' | 'list' | 'detail'

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

export async function runBulkSerial(options: {
  action: BulkAction
  items: IndexedSession[]
  run: (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>
  isCancelled?: () => boolean
  onProgress?: (completed: number, total: number, session: IndexedSession) => void
}): Promise<BulkRunResult> {
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
        try { reason = (JSON.parse(executed.stderr) as MutationReason).message || reason } catch { /* raw stderr */ }
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
      options.onProgress?.(index + 1, options.items.length, session)
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
    else comparison = left.messageCount - right.messageCount
    return comparison * direction || left.title.localeCompare(right.title) || left.id.localeCompare(right.id)
  })
}

export function filterSessions(items: IndexedSession[], filters: SessionListFilters, now = Date.now()): IndexedSession[] {
  const query = filters.query.trim().toLocaleLowerCase()
  const ranges: Record<Exclude<TimeRangeFilter, 'all'>, number> = {
    '24h': 24 * 60 * 60_000,
    '7d': 7 * 24 * 60 * 60_000,
    '30d': 30 * 24 * 60 * 60_000,
  }
  return items.filter(session => {
    if (session.partition !== filters.partition) return false
    const sessionPath = normalizePath(session.rootPath)
    const inScope = filters.scopeMode === 'exact'
      ? sessionPath === normalizePath(filters.scopePath)
      : isPathWithin(filters.scopePath, sessionPath)
    if (!inScope) return false
    if (filters.timeRange !== 'all' && now - timestampValue(session.lastActiveAt) > ranges[filters.timeRange]) return false
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
  const showRootPicker = ctx.ref(false)
  const pickerCurrentDir = ctx.ref('/')
  const pickerEntries = ctx.ref<DirectoryEntry[]>([])
  const pickerLoading = ctx.ref(false)
  const pickerError = ctx.ref<string | null>(null)
  const pickerManualPath = ctx.ref('')
  const pickerTriggerRef = ctx.ref<HTMLElement | null>(null)
  const pickerInputRef = ctx.ref<HTMLInputElement | null>(null)
  const paneWidths = ctx.ref<PaneWidths>({ ...DEFAULT_PANE_WIDTHS })
  const activePartition = ctx.ref<SessionPartition>('active')
  const sortSettings = ctx.ref<PartitionSortSettings>(normalizePartitionSortSettings(null))
  const timeRange = ctx.ref<TimeRangeFilter>('all')
  const branchFilter = ctx.ref('')
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

  ctx.commands.register('cc-session-browser.open', () => { ctx.open() })
  ctx.commands.register('cc-session-browser.search', () => {
    ctx.open()
    if (compactMode.value) compactView.value = 'list'
    settingsOpen.value = false
    filtersOpen.value = false
    scheduleMountTimeout(() => searchInputRef.value?.focus(), 0)
  })

  const tree = ctx.computed(() => deriveSessionPathTree(sessions.value, visibleRoot.value))

  function persist(key: string, value: unknown) {
    ctx.storage.set(key, value).catch((caught: any) => {
      if (warnedPersistFailure) return
      warnedPersistFailure = true
      console.warn('[cc-session-browser] could not persist plugin setting', caught)
    })
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
    persist(STORAGE_KEYS.treeExpandedPaths, Array.from(expandedPaths.value))
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

  function parseCliFailure(stderr: string, fallback: string): CliFailure {
    try {
      const parsed = JSON.parse(stderr.trim()) as Partial<CliFailure>
      return {
        error: typeof parsed.error === 'string' ? parsed.error : '',
        message: typeof parsed.message === 'string' ? parsed.message : fallback,
      }
    } catch {
      return { error: '', message: stderr.trim() || fallback }
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
    if (result.cacheRefreshed) return
    const rebuilt = await ctx.exec.run(['build-index', '--refresh'], { timeout: 30_000 })
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
    console.info(`[cc-session-browser] ${action} session`, { id: session.id, cacheRefreshed })
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
      const result = await ctx.exec.run(['read-session', session.attributionKey, session.id], { timeout: 30_000 })
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

    const command = `cd -- ${shQuote(session.rootPath)} && claude --resume ${session.id}`
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
    clearError()
    try {
      const result = await ctx.exec.run(['restore', session.attributionKey, session.id], { timeout: 30_000 })
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
      const title = resolveSessionTitle(session) || t('untitled-session')
      const accepted = await ctx.ui.confirm(t('archive-session-confirm', { title }))
      if (!isCurrent() || !accepted) return

      clearError()
      try {
        let result = await ctx.exec.run(['archive', session.attributionKey, session.id], { timeout: 30_000 })
        if (!isCurrent()) return
        if (result.code !== 0) throw new Error(parseCliFailure(result.stderr, 'archive failed').message)
        let mutation = parseMutationResult(result.stdout)
        if (mutation.outcome === 'failure' && (mutation.reason.error === 'possibly-live' || mutation.reason.error === 'session-live')) {
          const forceAccepted = await ctx.ui.confirm(t('archive-session-force-confirm', { title }))
          if (!isCurrent() || !forceAccepted) return
          result = await ctx.exec.run(['archive', session.attributionKey, session.id, '--force'], { timeout: 30_000 })
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

  async function deleteArchivedSession(session: IndexedSession): Promise<void> {
    await coordinateMutation(undefined, async isCurrent => {
      const title = resolveSessionTitle(session) || t('untitled-session')
      const accepted = await ctx.ui.confirm(t('delete-session-confirm', { title }))
      if (!isCurrent() || !accepted) return

      clearError()
      try {
        const result = await ctx.exec.run(['delete-archived', session.attributionKey, session.id], { timeout: 30_000 })
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
      const result = await ctx.exec.run(['check-dir', resumable.rootPath], { timeout: 10_000 })
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
        argv: ['claude', '--resume', resumable.id],
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
      const result = await ctx.exec.run(refresh ? ['build-index', '--refresh'] : ['build-index'], { timeout: 30_000 })
      if (!isCurrent()) return false
      if (result.code !== 0) throw new Error(result.stderr || 'build-index failed')
      const parsed = JSON.parse(result.stdout)
      if (!Array.isArray(parsed)) throw new Error('build-index returned invalid JSON')
      sessions.value = parsed as IndexedSession[]
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
        savedRoot = normalizeStoredTreeRoot(await ctx.storage.get(STORAGE_KEYS.treeRoot))
      } catch { /* use the indexed common ancestor */ }
      if (!isCurrentTree()) return false
      visibleRoot.value = savedRoot || deepestCommonAncestor(sessions.value.map(session => session.rootPath))
      if (!savedRoot) persist(STORAGE_KEYS.treeRoot, visibleRoot.value)
      committedSelection.value = { path: visibleRoot.value, mode: 'subtree', sessionId: null }

      let savedExpanded: Set<string> | null = null
      try {
        savedExpanded = normalizeStoredExpandedPaths(await ctx.storage.get(STORAGE_KEYS.treeExpandedPaths))
      } catch { /* use the indexed tree paths */ }
      if (!isCurrentTree()) return false
      if (savedExpanded) {
        expandedPaths.value = savedExpanded
      } else {
        expandedPaths.value = collectTreePaths(deriveSessionPathTree(sessions.value, visibleRoot.value))
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
      const [savedLocale, savedFontScale, savedThemeFollowHost, savedPageSize] = await Promise.all([
        ctx.storage.get(STORAGE_KEYS.locale),
        ctx.storage.get(STORAGE_KEYS.fontScale),
        ctx.storage.get(STORAGE_KEYS.themeFollowHost),
        ctx.storage.get(STORAGE_KEYS.pageSize),
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
    } catch { /* use defaults */ }
  }

  function setVisibleRoot(nextRoot: string) {
    if (bulkRunning.value) return
    if (activeMount) activeMount.treeGeneration++
    visibleRoot.value = normalizePath(nextRoot)
    clearSearchOverlay()
    committedSelection.value = { path: visibleRoot.value, mode: committedSelection.value.mode, sessionId: null }
    applyFilterChange()
    resetTranscript()
    expandedPaths.value = new Set(expandedPaths.value).add(visibleRoot.value)
    persist(STORAGE_KEYS.treeRoot, visibleRoot.value)
    persistExpandedPaths()
  }

  async function loadPickerDirs(dir: string) {
    const mount = activeMount
    if (!isActiveMount(mount)) return
    const requestSeq = ++mount.pickerRequestSeq
    pickerLoading.value = true
    pickerError.value = null
    try {
      const result = await ctx.exec.run(['list-dirs', dir], { timeout: 10_000 })
      if (!isActiveMount(mount) || requestSeq !== mount.pickerRequestSeq) return
      if (result.code !== 0) throw new Error(parseCliFailure(result.stderr, 'list-dirs failed').message)
      const parsed = JSON.parse(result.stdout) as ListDirsResult
      if ('error' in parsed) {
        pickerEntries.value = []
        pickerError.value = parsed.message
      } else if (Array.isArray(parsed.dirs)) {
        pickerEntries.value = parsed.dirs
      } else {
        throw new Error('list-dirs returned invalid JSON')
      }
    } catch (caught: any) {
      if (!isActiveMount(mount) || requestSeq !== mount.pickerRequestSeq) return
      pickerEntries.value = []
      pickerError.value = caught?.message || t('picker-list-error')
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
    scheduleMountTimeout(() => pickerTriggerRef.value?.focus(), 0)
  }

  function openRootPicker() {
    pickerCurrentDir.value = visibleRoot.value
    pickerManualPath.value = visibleRoot.value
    pickerEntries.value = []
    pickerError.value = null
    showRootPicker.value = true
    void loadPickerDirs(pickerCurrentDir.value)
    scheduleMountTimeout(() => pickerInputRef.value?.focus(), 0)
  }

  async function validateAndCommitRoot(candidate: string) {
    const mount = activeMount
    if (!isActiveMount(mount)) return
    const requestSeq = ++mount.pickerValidationSeq
    const isCurrent = () => isActiveMount(mount) && showRootPicker.value && requestSeq === mount.pickerValidationSeq
    const nextRoot = candidate.trim()
    if (!nextRoot.startsWith('/')) {
      if (isCurrent()) pickerError.value = t('tree-root-absolute-error')
      return
    }
    try {
      const result = await ctx.exec.run(['check-dir', nextRoot], { timeout: 10_000 })
      if (!isCurrent()) return
      if (result.code !== 0) throw new Error(parseCliFailure(result.stderr, 'check-dir failed').message)
      const checked = JSON.parse(result.stdout) as { exists?: boolean; dir?: boolean }
      if (!checked.exists) {
        pickerError.value = t('picker-path-missing', { path: nextRoot })
        return
      }
      if (!checked.dir) {
        pickerError.value = t('picker-path-not-directory', { path: nextRoot })
        return
      }
    } catch (caught: any) {
      if (isCurrent()) pickerError.value = caught?.message || t('picker-check-error')
      return
    }
    if (!isCurrent()) return
    clearError()
    setVisibleRoot(nextRoot)
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
    return filterSessions(sessions.value, {
      partition,
      scopePath: committedSelection.value.path,
      scopeMode: committedSelection.value.mode,
      timeRange: 'all',
      branch: '',
      query: '',
    })
  }

  function sessionsForList(partition: SessionPartition): IndexedSession[] {
    return sortSessions(filterSessions(sessions.value, {
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
    }), sortSettings.value[partition])
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
      const result = await ctx.exec.run(args, { timeout: 30_000 })
      if (!isCurrent()) return
      if (result.code !== 0) throw new Error(result.stderr || 'search failed')
      const parsed = JSON.parse(result.stdout)
      if (!Array.isArray(parsed)) throw new Error('search returned invalid JSON')
      searchOverlay.value = {
        query,
        scopePath: global ? null : scopePath,
        results: parsed as SearchResult[],
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
    return items.filter(session => session.live || (action === 'archive' && now - timestampValue(session.lastActiveAt) < 60_000)).length
  }

  async function executeBulk(action: BulkAction) {
    await coordinateMutation(undefined, async isCurrent => {
      const confirmationItems = selectedItems()
      if (!confirmationItems.length) return
      const expectedSkipped = expectedBulkSkips(action, confirmationItems)
      const accepted = await ctx.ui.confirm(t('bulk-confirm', { n: confirmationItems.length, m: expectedSkipped }))
      if (!isCurrent() || !accepted) return
      const items = selectedItems()
      if (!items.length) return
      bulkRunning.value = true
      bulkCancelRequested.value = false
      bulkResult.value = null
      bulkRefreshFailed.value = false
      bulkProgress.value = { completed: 0, total: items.length, title: '' }
      try {
        const outcome = await runBulkSerial({
          action,
          items,
          run: args => ctx.exec.run(args, { timeout: 30_000 }),
          isCancelled: () => !isCurrent() || bulkCancelRequested.value,
          onProgress: (completed, total, session) => {
            if (isCurrent()) bulkProgress.value = { completed, total, title: resolveSessionTitle(session) || t('untitled-session') }
          },
        })
        if (!isCurrent()) return
        bulkResult.value = outcome
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
    return h('aside', {
      class: 'ccm-browser-pane ccm-browser-tree-pane',
      style: compactMode.value ? undefined : { width: `calc(${paneWidths.value.left}px * var(--ccm-fs, 1))` },
    }, [
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
            class: 'ccm-icon-btn',
            title: t('navigate-parent'),
            'aria-label': t('navigate-parent'),
            disabled: bulkRunning.value || visibleRoot.value === '/',
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
            title: t('change-tree-root'),
            'aria-label': t('change-tree-root'),
            disabled: bulkRunning.value,
            ref: (element: HTMLElement | null) => { pickerTriggerRef.value = element },
            onClick: openRootPicker,
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
    ])
  }

  function renderCardActions(session: IndexedSession): any {
    const actions = session.partition === 'active'
      ? [
          { label: t('resume-session'), icon: IconPlay, action: 'resume' },
          { label: t('archive-session'), icon: IconArchive, action: 'archive' },
        ]
      : [
          { label: t('restore-session'), icon: IconArchiveRestore, action: 'restore' },
          { label: t('delete-archived-session'), icon: IconTrash2, action: 'delete' },
        ]
    return h('div', { class: 'ccm-browser-session-actions' }, actions.map(({ label, icon, action }) => h('button', {
      class: 'ccm-icon-btn ccm-browser-card-action',
      title: label,
      'aria-label': label,
      disabled: bulkRunning.value,
      onClick: (event: Event) => {
        event.stopPropagation()
        if (bulkRunning.value) return
        if (action === 'resume') void resumeSession(session)
        else if (action === 'archive') void archiveSession(session)
        else if (action === 'restore') void restoreSession(session)
        else void deleteArchivedSession(session)
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
    return h('article', {
      class: ['ccm-browser-session-card', selected ? 'ccm-browser-session-card-selected' : ''],
      key: sessionKey(session),
      role: 'button',
      tabindex: 0,
      onClick: () => { if (!bulkRunning.value) selectSession(session) },
      onKeydown: (event: KeyboardEvent) => {
        if (bulkRunning.value) return
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        selectSession(session)
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
          title: t(session.messageCount === 1 ? 'message-count-one' : 'message-count-other', { n: session.messageCount }),
        }, [IconHash(12), String(session.messageCount)]),
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
        h('span', { class: 'ccm-browser-session-stat' }, [IconHash(12), String(session.messageCount)]),
        h('span', { class: 'ccm-browser-session-branch' }, session.gitBranch || t('no-branch')),
      ]),
    ])
  }

  function renderRootPicker(): any {
    if (!showRootPicker.value) return null
    const dir = pickerCurrentDir.value
    const segments = dir.split('/').filter(Boolean)
    const breadcrumbs: any[] = [
      h('span', {
        class: 'ccm-picker-crumb',
        onClick: () => { void navigatePickerDir('/') },
      }, '/'),
    ]
    let accumulated = ''
    for (const segment of segments) {
      accumulated += `/${segment}`
      const target = accumulated
      breadcrumbs.push(h('span', { class: 'ccm-picker-crumb-sep' }, '/'))
      breadcrumbs.push(h('span', {
        class: 'ccm-picker-crumb',
        onClick: () => { void navigatePickerDir(target) },
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
      h('section', { class: 'ccm-picker-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('picker-title') }, [
        h('div', { class: 'ccm-picker-header' }, [
          h('span', { class: 'ccm-picker-title' }, t('picker-title')),
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
            'aria-label': t('picker-manual-path'),
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
          }, [IconCheck(14), h('span', {}, t('picker-use-manual-path'))]),
        ]),
        h('div', { class: 'ccm-picker-breadcrumb' }, breadcrumbs),
        h('div', { class: 'ccm-picker-current' }, [IconFolder(14), h('span', {}, t('picker-current', { path: dir }))]),
        h('div', { class: 'ccm-picker-actions' }, [
          h('button', {
            class: 'ccm-picker-action-btn',
            type: 'button',
            onClick: () => { void validateAndCommitRoot(dir) },
          }, [IconCheck(14), h('span', {}, t('picker-select-current', { name: dir.split('/').pop() || '/' }))]),
        ]),
        h('div', { class: 'ccm-picker-list' }, pickerLoading.value
          ? h('div', { class: 'ccm-picker-empty' }, [h('span', { class: 'ccm-browser-spinner' }), h('span', {}, t('picker-loading'))])
          : pickerError.value
            ? h('div', { class: 'ccm-picker-empty', role: 'alert' }, t('picker-error', { msg: pickerError.value }))
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
    ])
  }

  function renderSessionList() {
    const partition = activePartition.value
    const listedSessions = sessionsForList(partition)
    const overlay = searchOverlay.value
    const displayedCount = overlay ? overlay.results.length : listedSessions.length
    const maxPage = Math.max(1, Math.ceil(listedSessions.length / pageSize.value))
    const pageSessions = listedSessions.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
    const pageKeys = pageSessions.map(sessionKey)
    const createdRangeActive = Boolean(createdRange.value.from || createdRange.value.to)
    const undatedExcluded = createdRangeActive ? sessions.value.filter(session => {
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
    const currentSort = sortSettings.value[partition]
    const branches = branchOptions(partition)
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
            compactView.value = 'tree'
          },
        }, [IconFolder(15)]) : null,
        h('div', { class: 'ccm-browser-partition-tabs', role: 'tablist', 'aria-label': t('session-partition') }, [
          h('button', {
            class: ['ccm-browser-partition-tab', partition === 'active' ? 'ccm-browser-partition-tab-active' : ''],
            role: 'tab',
            'aria-selected': partition === 'active',
            disabled: bulkRunning.value,
            onClick: () => setPartition('active'),
          }, t('active')),
          h('button', {
            class: ['ccm-browser-partition-tab', partition === 'archive' ? 'ccm-browser-partition-tab-active' : ''],
            role: 'tab',
            'aria-selected': partition === 'archive',
            disabled: bulkRunning.value,
            onClick: () => setPartition('archive'),
          }, t('archive')),
        ]),
        h('div', { class: 'ccm-browser-pane-count' }, String(displayedCount)),
        h('button', {
          class: ['ccm-icon-btn', selectMode.value ? 'ccm-icon-btn-active' : ''],
          title: t('select-mode'),
          'aria-label': t('select-mode'),
          disabled: bulkRunning.value || Boolean(overlay),
          onClick: () => { selectMode.value = !selectMode.value },
        }, [IconCheck(15)]),
        h('div', { class: ['ccm-browser-settings', settingsOpen.value ? 'ccm-browser-settings-open' : ''] }, [
          h('button', {
            class: ['ccm-icon-btn', settingsOpen.value ? 'ccm-icon-btn-active' : ''],
            title: t('settings'),
            'aria-label': t('settings'),
            'aria-expanded': settingsOpen.value,
            disabled: bulkRunning.value,
            onClick: () => { settingsOpen.value = !settingsOpen.value; if (settingsOpen.value) filtersOpen.value = false },
          }, [IconSettings(15)]),
          renderSettingsPopover(),
        ]),
      ]),
      h('div', { class: 'ccm-browser-list-toolbar' }, [
        h('label', { class: 'ccm-browser-search-box', title: partition === 'archive' ? archiveSearchTooltip : t('type-filter-search') }, [
          IconSearch(14),
          h('input', {
            id: 'cc-session-browser-search-input',
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
            h('option', { value: 'msgcount' }, t('messages')),
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
            h('option', { value: '24h' }, t('time-24h')),
            h('option', { value: '7d' }, t('time-7d')),
            h('option', { value: '30d' }, t('time-30d')),
          ]),
        ]),
        h('label', { class: 'ccm-browser-select-control ccm-browser-branch-filter', title: t('filter-by-git-branch') }, [
          IconHash(13),
          h('select', {
            value: branchFilter.value,
            disabled: bulkRunning.value,
            'aria-label': t('filter-by-git-branch'),
            onChange: (event: Event) => { branchFilter.value = (event.target as HTMLSelectElement).value; applyFilterChange() },
          }, [h('option', { value: '' }, t('all-branches')), ...branches.map(branch => h('option', { value: branch }, branch))]),
        ]),
        h('div', { class: ['ccm-browser-settings', filtersOpen.value ? 'ccm-browser-settings-open' : ''] }, [
          h('button', {
            class: ['ccm-icon-btn', filtersOpen.value ? 'ccm-icon-btn-active' : ''],
            title: t('date-filters'),
            'aria-label': t('date-filters'),
            disabled: bulkRunning.value,
            onClick: () => { filtersOpen.value = !filtersOpen.value; if (filtersOpen.value) settingsOpen.value = false },
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
            h('button', { type: 'button', disabled: bulkRunning.value, onClick: clearAllFilters }, t('clear-all-filters')),
          ]) : null,
        ]),
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
                : h('div', { class: 'ccm-browser-pane-state' }, t('no-matching-sessions', { partition: t(partition) })),
      ]),
      !overlay && selectMode.value ? h('div', { class: 'ccm-browser-filter-row' }, [
        h('button', {
          disabled: bulkRunning.value || listedSessions.length === 0,
          onClick: () => { selection.value = selectionReducer(selection.value, { type: 'snapshot-all', keys: listedSessions.map(sessionKey) }) },
        }, t('select-all-filtered', { n: listedSessions.length })),
        h('span', {}, t('selected-count', { n: selection.value.selected.size })),
      ]) : null,
      !overlay && selection.value.selected.size ? h('div', { class: 'ccm-browser-filter-row', role: 'toolbar', 'aria-label': t('bulk-actions') }, [
        partition === 'active'
          ? h('button', { disabled: bulkRunning.value, onClick: () => { void executeBulk('archive') } }, t('bulk-archive', { n: selectedItems().length }))
          : h('button', { disabled: bulkRunning.value, onClick: () => { void executeBulk('restore') } }, t('bulk-restore', { n: selectedItems().length })),
        partition === 'archive'
          ? h('button', { disabled: bulkRunning.value, onClick: () => { void executeBulk('delete') } }, t('bulk-delete', { n: selectedItems().length }))
          : null,
        bulkRunning.value ? h('button', { onClick: () => { bulkCancelRequested.value = true } }, t('cancel')) : null,
      ]) : null,
      bulkRunning.value ? h('div', { role: 'status' }, [
        h('progress', { value: bulkProgress.value.completed, max: bulkProgress.value.total }),
        h('span', {}, t('bulk-progress', { n: bulkProgress.value.completed, total: bulkProgress.value.total, title: bulkProgress.value.title })),
      ]) : null,
      bulkResult.value ? h('div', { role: 'status', style: { maxHeight: '10rem', overflow: 'auto' } }, [
        h('div', {}, t('bulk-result', { done: bulkResult.value.done, failed: bulkResult.value.failed, skipped: bulkResult.value.skipped })),
        bulkRefreshFailed.value ? h('div', {}, t('bulk-refresh-stale')) : null,
        ...bulkResult.value.results.filter(result => result.status !== 'done').map(result => h('div', { key: result.key }, [
          h('strong', {}, resolveSessionTitle(result.session) || t('untitled-session')),
          h('code', {}, result.session.id),
          h('span', {}, result.reason || ''),
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
          h('button', {
            class: 'ccm-icon-btn',
            title: t('resume-session'),
            'aria-label': t('resume-session'),
            disabled: bulkRunning.value,
            onClick: () => { void resumeSession(session) },
          }, [IconPlay(15)]),
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
          void loadDisplaySettings()
          void loadPaneWidths()
          void loadSortSettings()
          void loadIndex(preserveState)
        })
        ctx.onUnmounted(() => {
          bulkCancelRequested.value = true
          bulkRunning.value = false
          loading.value = false
          transcriptLoading.value = false
          searching.value = false
          pickerLoading.value = false
          stopResize()
          mount.active = false
          mount.indexGeneration++
          mount.searchGeneration++
          mount.transcriptLoadToken++
          mount.pickerRequestSeq++
          mount.pickerValidationSeq++
          mount.rootResizeObserver?.disconnect()
          mount.localeObserver?.disconnect()
          for (const dispose of mount.disposers) dispose()
          mount.disposers.clear()
          mount.highlightTimer = null
          mount.copiedTimer = null
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
          (settingsOpen.value || filtersOpen.value)
            ? h('div', {
                class: 'ccm-browser-settings-scrim',
                'aria-hidden': 'true',
                onClick: () => { settingsOpen.value = false; filtersOpen.value = false },
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
