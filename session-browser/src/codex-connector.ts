import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { spawnSync } from 'child_process'
import { LIVE_WINDOW_MS, type IndexedSession, type Message, type MutationResult, type SessionConnector } from './history-cli'

const HOME = process.env.HOME || '/root'
const LIVE_DB_PATH = path.join(HOME, '.codex', 'state_5.sqlite')
const LEGACY_DB_PATH = path.join(HOME, '.codex', 'sqlite', 'state_5.sqlite')
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const READ_SESSION_MAX_OUTPUT_BYTES = 16 * 1024 * 1024
export const CODEX_INJECTED_PREFIXES = [
  '<environment_context',
  '<user_action',
  '<turn_aborted',
  '<subagent_notification',
  '<codex_internal_context',
  '<skill',
]
const REQUIRED_THREAD_COLUMNS = [
  'id',
  'rollout_path',
  'created_at',
  'created_at_ms',
  'recency_at',
  'recency_at_ms',
  'cwd',
  'title',
  'archived',
  'git_branch',
  'source',
]

interface DatabaseSyncLike {
  exec(sql: string): void
  prepare(sql: string): { all(...params: unknown[]): unknown[]; get(...params: unknown[]): unknown }
  close(): void
}

interface DatabaseSyncConstructor {
  new(path: string, options: { readOnly: boolean }): DatabaseSyncLike
}

interface ThreadRow {
  id: string
  rollout_path: string
  created_at: number | null
  created_at_ms: number | null
  recency_at: number | null
  recency_at_ms: number | null
  cwd: string
  title: string
  archived: unknown
  git_branch: string | null
  source: string | null
}

interface ListedThread {
  session: IndexedSession
  rolloutPath: string
}

interface ToolUse extends NonNullable<Message['toolUses']>[number] {}

interface PendingTool {
  callId: string
  message: Message
  tool: ToolUse
}

function output(value: unknown) {
  console.log(JSON.stringify(value))
}

function fatal(error: string, message: string): never {
  console.error(JSON.stringify({ error, message }))
  process.exit(1)
}

function connectorUnavailable(reason: string): never {
  return fatal('connector-unavailable', `Codex connector unavailable: ${reason}`)
}

function isDatabaseBusy(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : ''
  return code === 'SQLITE_BUSY'
    || code === 'SQLITE_LOCKED'
    || /\b(?:SQLITE_BUSY|SQLITE_LOCKED|database(?: table| schema)? (?:is )?(?:busy|locked))\b/i.test(errorMessage(error))
}

function databaseFailure(context: string, error: unknown): never {
  const detail = errorMessage(error)
  if (isDatabaseBusy(error)) {
    return fatal('connector-busy', `Codex database is temporarily busy; retry shortly: ${context}${detail ? `: ${detail}` : ''}`)
  }
  return connectorUnavailable(`${context}${detail ? `: ${detail}` : ''}`)
}

function availabilityDatabaseReason(context: string, error: unknown): string {
  const detail = errorMessage(error)
  if (isDatabaseBusy(error)) {
    return `Codex database is temporarily busy; retry shortly: ${context}${detail ? `: ${detail}` : ''}`
  }
  return `${context}${detail ? `: ${detail}` : ''}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error)
}

function validateSessionId(sessionId: string) {
  if (!SESSION_ID_RE.test(sessionId)) fatal('invalid-session-id', 'Session id must be a 36-character UUID basename')
}

function resolveDatabasePath(): { dbPath: string; degraded: boolean } {
  const override = process.env.CC_SB_CODEX_DB
  if (override) {
    if (!fs.existsSync(override)) throw new Error(`Codex database was not found at configured path ${override}`)
    return { dbPath: override, degraded: false }
  }
  if (fs.existsSync(LIVE_DB_PATH)) return { dbPath: LIVE_DB_PATH, degraded: false }
  if (fs.existsSync(LEGACY_DB_PATH)) return { dbPath: LEGACY_DB_PATH, degraded: true }
  throw new Error(`Codex database was not found at ${LIVE_DB_PATH} or ${LEGACY_DB_PATH}`)
}

function loadDatabaseSync(): DatabaseSyncConstructor {
  // Kept behind a runtime guard because node:sqlite is absent on older supported Node hosts.
  return (require('node:sqlite') as { DatabaseSync: DatabaseSyncConstructor }).DatabaseSync
}

function inspectThreadsSchema(db: DatabaseSyncLike) {
  const columns = new Set(
    (db.prepare('PRAGMA table_info(threads)').all() as Array<{ name?: unknown }>)
      .map(column => typeof column.name === 'string' ? column.name : ''),
  )
  const missing = REQUIRED_THREAD_COLUMNS.filter(column => !columns.has(column))
  if (missing.length) throw new Error(`threads schema is missing required columns: ${missing.join(', ')}`)
}

function openDatabase(): DatabaseSyncLike {
  let DatabaseSync: DatabaseSyncConstructor
  try {
    DatabaseSync = loadDatabaseSync()
  } catch (error) {
    return connectorUnavailable(`node:sqlite is not available: ${errorMessage(error)}`)
  }

  let dbPath: string
  let degraded: boolean
  try {
    ({ dbPath, degraded } = resolveDatabasePath())
  } catch (error) {
    return connectorUnavailable(errorMessage(error))
  }

  let db: DatabaseSyncLike
  try {
    db = new DatabaseSync(dbPath, { readOnly: true })
  } catch (error) {
    return databaseFailure(`could not open read-only database ${dbPath}`, error)
  }

  try {
    db.exec('PRAGMA busy_timeout=2000')
  } catch (error) {
    try { db.close() } catch {}
    return databaseFailure(`could not configure read-only database ${dbPath}`, error)
  }

  try {
    inspectThreadsSchema(db)
  } catch (error) {
    try { db.close() } catch {}
    return databaseFailure(`could not inspect threads schema in ${dbPath}`, error)
  }

  if (degraded) {
    console.error(JSON.stringify({
      diagnostic: 'connector-degraded',
      agent: 'codex',
      reason: `Using stale legacy Codex database at ${dbPath}; live database ${LIVE_DB_PATH} was not found`,
    }))
  }
  return db
}

function codexBinaryOnPath(): boolean {
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(path.delimiter)
    : ['']
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    for (const extension of extensions) {
      const candidate = path.join(directory || process.cwd(), `codex${extension}`)
      try {
        fs.accessSync(candidate, fs.constants.X_OK)
        if (fs.statSync(candidate).isFile()) return true
      } catch {}
    }
  }
  return false
}

function codexAvailability() {
  let DatabaseSync: DatabaseSyncConstructor
  try {
    DatabaseSync = loadDatabaseSync()
  } catch (error) {
    return {
      available: false,
      degraded: false,
      reason: `This Node.js version does not provide node:sqlite: ${errorMessage(error)}`,
    }
  }

  let resolution: { dbPath: string; degraded: boolean }
  try {
    resolution = resolveDatabasePath()
  } catch (error) {
    return { available: false, degraded: false, reason: errorMessage(error) }
  }

  let db: DatabaseSyncLike
  try {
    db = new DatabaseSync(resolution.dbPath, { readOnly: true })
  } catch (error) {
    return {
      available: false,
      degraded: false,
      reason: availabilityDatabaseReason(`Codex database could not be opened read-only at ${resolution.dbPath}`, error),
    }
  }

  try {
    db.exec('PRAGMA busy_timeout=2000')
  } catch (error) {
    try { db.close() } catch {}
    return {
      available: false,
      degraded: false,
      reason: availabilityDatabaseReason(`Codex database could not be configured read-only at ${resolution.dbPath}`, error),
    }
  }

  try {
    inspectThreadsSchema(db)
  } catch (error) {
    return {
      available: false,
      degraded: false,
      reason: isDatabaseBusy(error)
        ? availabilityDatabaseReason(`could not inspect threads schema in ${resolution.dbPath}`, error)
        : `Codex database schema is incompatible: ${errorMessage(error)}`,
    }
  } finally {
    try { db.close() } catch {}
  }

  if (!codexBinaryOnPath()) {
    return {
      available: false,
      degraded: false,
      reason: 'Codex CLI binary was not found on PATH; install Codex or add it to PATH',
    }
  }

  if (resolution.degraded) {
    return {
      available: true,
      degraded: true,
      reason: `Using legacy Codex database at ${resolution.dbPath}; data may be stale because live database ${LIVE_DB_PATH} was not found`,
    }
  }
  return { available: true, degraded: false }
}

function withDatabase<T>(read: (db: DatabaseSyncLike) => T): T {
  const db = openDatabase()
  try {
    return read(db)
  } catch (error) {
    return databaseFailure('threads query failed', error)
  } finally {
    try { db.close() } catch {}
  }
}

function toIsoTimestamp(milliseconds: number | null, seconds: number | null): string {
  const value = milliseconds ?? (seconds === null ? Number.NaN : seconds * 1000)
  return Number.isFinite(value) ? new Date(value).toISOString() : ''
}

function containsSubagentKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  if (Object.prototype.hasOwnProperty.call(value, 'subagent')) return true
  return Object.values(value).some(containsSubagentKey)
}

export function normalizeCodexOrigin(value: unknown): string {
  if (typeof value !== 'string') return 'other'
  const source = value.trim()
  if (source === 'exec' || source === 'cli' || source === 'vscode' || source === 'subagent') return source
  try {
    return containsSubagentKey(JSON.parse(source)) ? 'subagent' : 'other'
  } catch {
    return 'other'
  }
}

function readArchived(value: unknown): boolean {
  if (value === 0 || value === false) return false
  if (value === 1 || value === true) return true
  if (typeof value === 'string') {
    const normalized = value.trim().toLocaleLowerCase()
    if (normalized === '0' || normalized === 'false') return false
    if (normalized === '1' || normalized === 'true') return true
  }
  throw new Error(`threads.archived has unsupported encoding: ${JSON.stringify(value)}`)
}

function threadRecencyMs(row: ThreadRow): number {
  return row.recency_at_ms ?? (row.recency_at === null ? Number.NaN : row.recency_at * 1000)
}

function isThreadLive(row: ThreadRow): boolean {
  const recencyMs = threadRecencyMs(row)
  return Number.isFinite(recencyMs) && Date.now() - recencyMs < LIVE_WINDOW_MS
}

function mapThread(row: ThreadRow): IndexedSession {
  let stat: fs.Stats | null = null
  try {
    stat = fs.statSync(row.rollout_path)
  } catch {}
  const rolloutExists = Boolean(stat?.isFile())
  let health: IndexedSession['health']
  if (!rolloutExists) health = 'truncated'
  else if (stat!.size === 0) health = 'empty'
  else if (isThreadLive(row)) health = 'live'
  else health = 'ok'
  return {
    id: row.id,
    agent: 'codex',
    rootPath: row.cwd,
    attributionKey: row.cwd,
    title: row.title.slice(0, 200),
    createdAt: toIsoTimestamp(row.created_at_ms, row.created_at),
    lastActiveAt: toIsoTimestamp(row.recency_at_ms, row.recency_at),
    gitBranch: row.git_branch || undefined,
    partition: readArchived(row.archived) ? 'archive' : 'active',
    health,
    timestampSource: 'event',
    sizeBytes: rolloutExists && stat ? stat.size : 0,
    origin: normalizeCodexOrigin(row.source),
  }
}

function listThreadRecords(): ListedThread[] {
  return withDatabase(db => {
    const rows = db.prepare(`
      SELECT id, rollout_path, created_at, created_at_ms, recency_at, recency_at_ms,
             cwd, title, archived, git_branch, source
      FROM threads
      ORDER BY COALESCE(recency_at_ms, recency_at * 1000) DESC, id
    `).all() as unknown as ThreadRow[]
    return rows.map(row => ({ session: mapThread(row), rolloutPath: row.rollout_path }))
  })
}

function listThreads(): IndexedSession[] {
  return listThreadRecords().map(record => record.session)
}

function findThread(sessionId: string): ThreadRow | null {
  return withDatabase(db => {
    const row = db.prepare(`
      SELECT id, rollout_path, created_at, created_at_ms, recency_at, recency_at_ms,
             cwd, title, archived, git_branch, source
      FROM threads WHERE id = ?
    `).get(sessionId)
    return (row || null) as ThreadRow | null
  })
}

function isUnder(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath))
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function toLegacySession(session: IndexedSession) {
  return {
    id: session.id,
    project: session.rootPath,
    encodedPath: session.attributionKey,
    firstPrompt: session.title,
    lastTimestamp: session.lastActiveAt,
    messageCount: session.messageCount,
    gitBranch: session.gitBranch,
  }
}

function contentText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .filter(item => item && typeof item === 'object'
      && ((item as any).type === 'input_text' || (item as any).type === 'output_text')
      && typeof (item as any).text === 'string')
    .map(item => (item as any).text)
    .join('\n')
}

export function isCodexInjectedUserMessage(content: unknown): boolean {
  if (typeof content !== 'string') return false
  const trimmed = content.trimStart()
  return CODEX_INJECTED_PREFIXES.some((prefix) => {
    if (!trimmed.startsWith(prefix)) return false
    const boundary = trimmed.charAt(prefix.length)
    return boundary === '>' || /\s/.test(boundary)
  })
}

function compactText(value: unknown, limit = 160): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function parseToolInput(payload: any): unknown {
  const raw = payload.type === 'function_call' ? payload.arguments : payload.input
  if (typeof raw !== 'string') return raw
  try { return JSON.parse(raw) } catch { return raw }
}

function toolSummary(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return compactText(input) || name
  const record = input as Record<string, unknown>
  return compactText(record.command ?? record.cmd ?? record.file_path ?? record.path ?? record.query ?? input) || name
}

function toolOutput(payload: any): string {
  if (typeof payload.output === 'string') return payload.output
  const projected = contentText(payload.output)
  return projected || compactText(payload.output, 4000)
}

function toolUseFromPayload(payload: any): ToolUse {
  const input = parseToolInput(payload)
  const tool: ToolUse = {
    name: typeof payload.name === 'string' && payload.name ? payload.name : 'tool',
    summary: toolSummary(payload.name || 'tool', input),
  }
  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>
    if (typeof record.file_path === 'string') tool.filePath = record.file_path
    if (typeof record.old_string === 'string') tool.oldString = record.old_string
    if (typeof record.new_string === 'string') tool.newString = record.new_string
    if (typeof record.content === 'string') tool.content = record.content
    if (typeof record.replace_all === 'boolean') tool.replaceAll = record.replace_all
  }
  return tool
}

function appendTool(messages: Message[], pending: Map<string, PendingTool>, record: any) {
  const payload = record.payload
  const callId = typeof payload.call_id === 'string' ? payload.call_id : ''
  let message = [...messages].reverse().find(item => item.role === 'assistant')
  if (!message) {
    message = { uuid: payload.id || callId, role: 'assistant', content: '', timestamp: record.timestamp || '' }
    messages.push(message)
  }
  const tool = toolUseFromPayload(payload)
  if (!message.toolUses) message.toolUses = []
  message.toolUses.push(tool)
  if (callId) pending.set(callId, { callId, message, tool })
}

function parseResponseRecord(record: any, messages: Message[], pending: Map<string, PendingTool>) {
  if (!record || record.type !== 'response_item' || !record.payload || typeof record.payload !== 'object') return
  const payload = record.payload
  if (payload.type === 'message') {
    if (payload.role !== 'user' && payload.role !== 'assistant' && payload.role !== 'developer') return
    const content = contentText(payload.content)
    messages.push({
      uuid: typeof payload.id === 'string' ? payload.id : '',
      role: payload.role,
      content,
      timestamp: typeof record.timestamp === 'string' ? record.timestamp : '',
      ...(payload.role === 'user' ? { isRealUser: !isCodexInjectedUserMessage(content) } : {}),
    })
    return
  }
  if (payload.type === 'function_call' || payload.type === 'custom_tool_call') {
    appendTool(messages, pending, record)
    return
  }
  if (payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output') {
    const paired = typeof payload.call_id === 'string' ? pending.get(payload.call_id) : undefined
    if (paired) paired.tool.content = toolOutput(payload)
  }
}

async function readMessages(filePath: string): Promise<Message[]> {
  let stat: fs.Stats
  try {
    stat = fs.statSync(filePath)
    if (!stat.isFile()) throw new Error('not a regular file')
  } catch (error: any) {
    return fatal('read-failed', `Could not read Codex rollout ${filePath}${error?.message ? `: ${error.message}` : ''}`)
  }

  const messages: Message[] = []
  const pending = new Map<string, PendingTool>()
  const input = fs.createReadStream(filePath, { encoding: 'utf8' })
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  let outputBytes = 2
  try {
    for await (const line of lines) {
      if (!line.trim()) continue
      try {
        const before = messages.length
        parseResponseRecord(JSON.parse(line), messages, pending)
        for (let index = before; index < messages.length; index++) {
          outputBytes += Buffer.byteLength(JSON.stringify(messages[index]), 'utf8') + (index ? 1 : 0)
          if (outputBytes > READ_SESSION_MAX_OUTPUT_BYTES) {
            fatal('session-output-too-large', `Parsed session output exceeds ${READ_SESSION_MAX_OUTPUT_BYTES} bytes`)
          }
        }
      } catch (error: any) {
        if (error?.code === 'session-output-too-large') throw error
        // Corrupt or partial records are skipped independently.
      }
    }
  } catch (error: any) {
    return fatal('read-failed', error?.message || `Could not read Codex rollout ${filePath}`)
  } finally {
    lines.close()
    input.destroy()
  }
  if (Buffer.byteLength(JSON.stringify(messages), 'utf8') > READ_SESSION_MAX_OUTPUT_BYTES) {
    return fatal('session-output-too-large', `Parsed session output exceeds ${READ_SESSION_MAX_OUTPUT_BYTES} bytes`)
  }
  return messages
}

function mutationFailure(error: string, message: string): MutationResult {
  return { outcome: 'failure', reason: { error, message } }
}

function runMutation(command: 'archive' | 'unarchive' | 'delete', sessionId: string, force = false) {
  validateSessionId(sessionId)
  if (!force && (command === 'archive' || command === 'delete')) {
    const thread = findThread(sessionId)
    if (thread && isThreadLive(thread)) {
      output(mutationFailure('possibly-live', 'Session was modified within the last 60 seconds; retry with --force after confirmation'))
      return
    }
  }
  const args = command === 'delete' ? [command, '--force', sessionId] : [command, sessionId]
  const result = spawnSync('codex', args, { encoding: 'utf8' })
  if (result.error) {
    output(mutationFailure('codex-command-unavailable', result.error.message))
    return
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    output(mutationFailure('codex-command-failed', detail || `codex ${command} exited with status ${result.status}`))
    return
  }
  output({ outcome: 'success', cacheRefreshed: true } satisfies MutationResult)
}

async function searchSessions(query: string, scope?: string) {
  const needle = query.toLocaleLowerCase()
  const results: Array<{ session: IndexedSession; match: string }> = []
  const records = listThreadRecords().filter(record => record.session.partition === 'active' && (!scope || isUnder(scope, record.session.rootPath)))
  for (const { session, rolloutPath } of records) {
    if (results.length >= 20) break
    if (!fs.existsSync(rolloutPath)) continue
    const messages = await readMessages(rolloutPath)
    let match = ''
    for (const message of messages) {
      const index = message.content.toLocaleLowerCase().indexOf(needle)
      if (index < 0) continue
      const start = Math.max(0, index - 60)
      match = message.content.slice(start, Math.min(message.content.length, index + query.length + 60)).trim()
      break
    }
    if (match) results.push({ session, match })
  }
  output(results)
}

export const codexConnector: SessionConnector = {
  id: 'codex',
  capabilities: {
    archive: true,
    rename: false,
    delete: true,
    deleteRequiresArchived: false,
    nativeIndex: true,
    tokenStats: false,
    originFilter: true,
  },
  resume: { argv: ['codex', 'resume'] },
  isAvailable: () => {
    try {
      return codexAvailability()
    } catch (error) {
      return {
        available: false,
        degraded: false,
        reason: `Codex availability check failed: ${errorMessage(error)}`,
      }
    }
  },
  buildIndex: () => output(listThreads()),
  indexSessions: () => listThreads(),
  listUnder: (rootPath, partition) => {
    if (partition && partition !== 'active' && partition !== 'archive') {
      fatal('invalid-partition', 'Partition must be active or archive')
    }
    output(listThreads().filter(session => (!partition || session.partition === partition) && isUnder(rootPath, session.rootPath)))
  },
  listProjects: () => {
    const grouped = new Map<string, { path: string; encodedPath: string; sessionCount: number }>()
    for (const session of listThreads().filter(item => item.partition === 'active')) {
      const existing = grouped.get(session.attributionKey)
      if (existing) existing.sessionCount++
      else grouped.set(session.attributionKey, { path: session.rootPath, encodedPath: session.attributionKey, sessionCount: 1 })
    }
    output([...grouped.values()].sort((a, b) => b.sessionCount - a.sessionCount))
  },
  listSessions: () => output(listThreads().filter(session => session.partition === 'active').map(toLegacySession)),
  readSession: async (_scopeKey, sessionId) => {
    validateSessionId(sessionId)
    const thread = findThread(sessionId)
    if (!thread) fatal('not-found', `Codex session does not exist: ${sessionId}`)
    return readMessages(thread.rollout_path)
  },
  moveSession: (_scopeKey, sessionId, direction, force) => runMutation(direction === 'archive' ? 'archive' : 'unarchive', sessionId, force),
  deleteArchived: (_scopeKey, sessionId, force) => runMutation('delete', sessionId, force),
  search: (query, scope) => searchSessions(query, scope),
  listRecent: (limit = 30) => output(listThreads().filter(session => session.partition === 'active').slice(0, limit).map(toLegacySession)),
}
