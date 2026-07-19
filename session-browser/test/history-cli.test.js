const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { afterEach, beforeEach, test } = require('node:test')
const esbuild = require('esbuild')

const CLI = process.env.CC_SB_TEST_CLI || path.resolve(__dirname, '../dist/cli')
const IDS = {
  normal: '11111111-1111-1111-1111-111111111111',
  archive: '22222222-2222-2222-2222-222222222222',
  empty: '33333333-3333-3333-3333-333333333333',
  noTimestamp: '44444444-4444-4444-4444-444444444444',
  partial: '55555555-5555-5555-5555-555555555555',
  fallback: '66666666-6666-6666-6666-666666666666',
}

let fixture
let env

function encoded(rootPath) {
  return rootPath.replace(/\//g, '-')
}

function sessionPath(partitionDir, attributionKey, id) {
  return path.join(partitionDir, attributionKey, `${id}.jsonl`)
}

function artifactPath(partitionDir, attributionKey, id) {
  return path.join(partitionDir, attributionKey, id)
}

function findUnusedPid() {
  for (let candidate = 1_000_000; candidate < 2_147_483_647; candidate += 1) {
    try {
      process.kill(candidate, 0)
    } catch (error) {
      if (error?.code === 'ESRCH') return candidate
      if (error?.code !== 'EPERM') throw error
    }
  }
  throw new Error('Could not find an unused pid')
}

function writeSession(partitionDir, attributionKey, id, lines, trailingNewline = true) {
  const filePath = sessionPath(partitionDir, attributionKey, id)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, lines.join('\n') + (trailingNewline && lines.length ? '\n' : ''))
  return filePath
}

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env })
}

function runJson(args) {
  const result = run(args)
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

function localDateSegment(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  const year = ((date.getFullYear() % 100) + 100) % 100
  return `${String(year).padStart(2, '0')}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
}

function loadExportFilenameHelpers() {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/history-cli.ts'), 'utf8')
  const constants = ['EXPORT_FILENAME_MAX_BYTES', 'EXPORT_FILENAME_ATTEMPTS'].map(name => {
    const match = source.match(new RegExp(`^const ${name} = .+$`, 'm'))
    assert.ok(match, `missing ${name}`)
    return match[0]
  })
  const functions = ['legalizeFilenameTitle', 'truncateUtf8', 'exportDateSegment', 'exportFilenameBase', 'exportFilename'].map(name => {
    const match = source.match(new RegExp(`function ${name}\\([^]*?^}`, 'm'))
    assert.ok(match, `missing ${name}`)
    return match[0]
  })
  const compiled = esbuild.transformSync([
    ...constants,
    ...functions,
    'module.exports = { exportFilenameBase, exportFilename }',
  ].join('\n'), { loader: 'ts', format: 'cjs', target: 'node18' })
  const loaded = { exports: {} }
  Function('module', 'exports', 'require', compiled.code)(loaded, loaded.exports, require)
  return loaded.exports
}

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'session-browser-'))
  env = {
    ...process.env,
    HOME: path.join(fixture, 'home'),
    CC_SB_PROJECTS_DIR: path.join(fixture, 'projects'),
    CC_SB_ARCHIVE_DIR: path.join(fixture, 'projects-archive'),
    CC_SB_SESSIONS_DIR: path.join(fixture, 'sessions'),
    CC_SB_DATA_DIR: path.join(fixture, 'data'),
  }
})

afterEach(() => {
  fs.rmSync(fixture, { recursive: true, force: true })
})

test('meta parser uses first event cwd/createdAt and expanding tail timestamp', () => {
  const rootPath = '/work/tree/app'
  const attributionKey = encoded(rootPath)
  const filler = 'x'.repeat(70 * 1024)
  writeSession(env.CC_SB_PROJECTS_DIR, attributionKey, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: rootPath, timestamp: '2026-07-01T00:00:00.000Z', gitBranch: 'main', message: { content: 'First prompt' } }),
    JSON.stringify({ type: 'assistant', cwd: '/later/cd', timestamp: '2026-07-01T01:00:00.000Z', message: { content: [{ type: 'text', text: 'answer' }] } }),
    JSON.stringify({ type: 'progress', payload: filler }),
  ])

  const [meta] = runJson(['build-index'])
  assert.equal(meta.rootPath, rootPath)
  assert.equal(meta.attributionKey, attributionKey)
  assert.equal(meta.createdAt, '2026-07-01T00:00:00.000Z')
  assert.equal(meta.lastActiveAt, '2026-07-01T01:00:00.000Z')
  assert.equal(meta.timestampSource, 'event')
  assert.equal(meta.health, 'ok')
  assert.equal(meta.title, 'First prompt')
  assert.equal(meta.messageCount, 1)
  assert.equal(meta.lossyPath, undefined)
})

test('meta parser skips metadata preamble for head fields', () => {
  const rootPath = '/Volumes/Dev/ai/projects/dinotty_mods'
  const attributionKey = encoded(rootPath)
  writeSession(env.CC_SB_PROJECTS_DIR, attributionKey, IDS.normal, [
    JSON.stringify({ type: 'last-prompt', cwd: null, timestamp: null }),
    JSON.stringify({ type: 'mode', mode: 'default' }),
    JSON.stringify({ type: 'permission-mode', mode: 'default' }),
    JSON.stringify({ type: 'user', cwd: rootPath, timestamp: '2026-07-10T12:34:56.000Z', gitBranch: 'custom', message: { content: 'Real first prompt' } }),
  ])

  const [meta] = runJson(['build-index'])
  assert.equal(meta.createdAt, '2026-07-10T12:34:56.000Z')
  assert.equal(meta.rootPath, rootPath)
  assert.equal(meta.title, 'Real first prompt')
  assert.equal(meta.gitBranch, 'custom')
  assert.equal(meta.lossyPath, undefined)
})

test('meta parser keeps the last jsonl ai and custom title records', () => {
  const rootPath = '/work/title-chain'
  const attributionKey = encoded(rootPath)
  writeSession(env.CC_SB_PROJECTS_DIR, attributionKey, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: rootPath, timestamp: '2026-07-10T12:34:56.000Z', message: { content: 'First prompt' } }),
    JSON.stringify({ type: 'ai-title', aiTitle: 'First AI title' }),
    JSON.stringify({ type: 'custom-title', customTitle: 'First custom title' }),
    JSON.stringify({ type: 'assistant', timestamp: '2026-07-10T12:35:56.000Z', message: { content: [] } }),
    JSON.stringify({ type: 'custom-title', customTitle: 'Last custom title' }),
    JSON.stringify({ type: 'ai-title', aiTitle: 'Last AI title' }),
    JSON.stringify({ type: 'custom-title', customTitle: '   ' }),
    JSON.stringify({ type: 'ai-title', aiTitle: '' }),
  ])

  const [session] = runJson(['list-sessions', attributionKey])
  assert.equal(session.aiTitle, 'Last AI title')
  assert.equal(session.customTitle, 'Last custom title')
})

test('health precedence covers empty, truncated, and live files', () => {
  const key = '-work-health'
  const emptyPath = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.empty, [])
  const noTimestampPath = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.noTimestamp, [JSON.stringify({ type: 'user', cwd: '/work/health', message: { content: 'no timestamp' } })])
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.partial, [
    JSON.stringify({ type: 'user', cwd: '/work/health', timestamp: '2026-07-02T00:00:00.000Z', message: { content: 'live' } }),
    '{"type":"assistant","timestamp":"2099-01-01T00:00:00.000Z"',
  ], false)
  const index = runJson(['build-index'])
  const byId = Object.fromEntries(index.map(item => [item.id, item]))
  assert.equal(byId[IDS.empty].health, 'empty')
  assert.equal(byId[IDS.empty].timestampSource, 'mtime')
  assert.equal(byId[IDS.noTimestamp].health, 'truncated')
  assert.equal(byId[IDS.noTimestamp].timestampSource, 'mtime')
  assert.equal(byId[IDS.partial].health, 'live')
  assert.equal(byId[IDS.partial].lastActiveAt, '2026-07-02T00:00:00.000Z')
  assert.equal(fs.statSync(emptyPath).size, 0)
  assert.equal(byId[IDS.noTimestamp].lastActiveAt, fs.statSync(noTimestampPath).mtime.toISOString())
})

test('tail corruption remains truncated after the live detection window', () => {
  const key = '-work-old-tail-corruption'
  const filePath = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.partial, [
    JSON.stringify({ type: 'user', cwd: '/work/old-tail-corruption', timestamp: '2026-07-03T00:00:00.000Z', message: { content: 'old' } }),
    '{broken',
  ], false)
  const old = new Date('2026-06-01T00:00:00.000Z')
  fs.utimesSync(filePath, old, old)

  assert.equal(runJson(['build-index'])[0].health, 'truncated')
  assert.equal(runJson(['build-index', '--refresh'])[0].health, 'truncated')
})

test('invalid tail timestamps are skipped in favor of the last valid event timestamp', () => {
  const key = '-work-invalid-timestamp'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/work/invalid-timestamp', timestamp: '2026-07-03T00:00:00.000Z', message: { content: 'valid' } }),
    JSON.stringify({ type: 'assistant', timestamp: 'not-a-date', message: { content: [] } }),
  ])

  const [meta] = runJson(['build-index'])
  assert.equal(meta.lastActiveAt, '2026-07-03T00:00:00.000Z')
  assert.equal(meta.timestampSource, 'event')
  assert.equal(meta.health, 'ok')
})

test('tail scanning keeps a complete record when the bounded read starts exactly after a newline', () => {
  const key = '-work-tail-boundary'
  const filePath = sessionPath(env.CC_SB_PROJECTS_DIR, key, IDS.normal)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const prefix = JSON.stringify({ type: 'progress', payload: 'p'.repeat(70 * 1024) }) + '\n'
  const boundary = JSON.stringify({
    type: 'user', cwd: '/work/tail-boundary', timestamp: '2026-07-04T00:00:00.000Z', message: { content: 'boundary record' },
  }) + '\n'
  const emptyFiller = JSON.stringify({ type: 'progress', payload: '' }) + '\n'
  const tailBytes = 1024 * 1024
  const fillerLength = tailBytes - Buffer.byteLength(boundary) - Buffer.byteLength(emptyFiller)
  const filler = JSON.stringify({ type: 'progress', payload: 'x'.repeat(fillerLength) }) + '\n'
  assert.equal(Buffer.byteLength(boundary + filler), tailBytes)
  fs.writeFileSync(filePath, prefix + boundary + filler)

  const [meta] = runJson(['build-index'])
  assert.equal(meta.messageCount, 1)
  assert.equal(meta.lastActiveAt, '2026-07-04T00:00:00.000Z')
})

test('attribution separates encoded-key mismatch from lossy fallback decode', () => {
  writeSession(env.CC_SB_PROJECTS_DIR, '-work-under-score', IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/work/under_score', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'mismatch' } }),
  ])
  writeSession(env.CC_SB_PROJECTS_DIR, '-fallback-with-hyphen', IDS.fallback, [
    JSON.stringify({ type: 'user', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'fallback' } }),
    JSON.stringify({ type: 'assistant', cwd: null, timestamp: '2026-07-01T01:00:00.000Z', message: { content: [] } }),
  ])

  const index = runJson(['build-index'])
  const mismatch = index.find(item => item.id === IDS.normal)
  const fallback = index.find(item => item.id === IDS.fallback)
  assert.equal(mismatch.rootPath, '/work/under_score')
  assert.equal(mismatch.attributionKey, '-work-under-score')
  assert.equal(mismatch.lossyPath, undefined)
  assert.equal(mismatch.attributionMismatch, true)
  assert.equal(fallback.rootPath, '/fallback/with/hyphen')
  assert.equal(fallback.lossyPath, true)
  assert.equal(fallback.attributionMismatch, undefined)
})

test('incremental cache reuses unchanged size+mtime, invalidates changes, and heals corruption', () => {
  const key = '-cache-root'
  const filePath = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/cache/root', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'alpha' } }),
  ])
  const first = runJson(['build-index'])
  const original = fs.readFileSync(filePath, 'utf8')
  fs.writeFileSync(filePath, original.replace('alpha', 'bravo'))
  const changedStat = fs.statSync(filePath)
  const cachePath = path.join(env.CC_SB_DATA_DIR, 'index-cache.json')
  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
  assert.equal(cache.version, 3)
  cache.entries[filePath].size = changedStat.size
  cache.entries[filePath].mtimeMs = changedStat.mtimeMs
  fs.writeFileSync(cachePath, JSON.stringify(cache))
  const reused = runJson(['build-index'])
  assert.deepEqual(reused, first)

  const refreshed = runJson(['build-index', '--refresh'])
  assert.equal(refreshed[0].title, 'bravo')

  fs.appendFileSync(filePath, JSON.stringify({ type: 'assistant', timestamp: '2026-07-02T00:00:00.000Z', message: { content: [] } }) + '\n')
  const invalidated = runJson(['build-index'])
  assert.equal(invalidated[0].title, 'bravo')
  assert.equal(invalidated[0].lastActiveAt, '2026-07-02T00:00:00.000Z')

  fs.writeFileSync(cachePath, '{garbage')
  const rebuilt = runJson(['build-index'])
  assert.deepEqual(rebuilt, invalidated)
})

test('build-index fails when a partition root is unreadable', () => {
  fs.mkdirSync(env.CC_SB_PROJECTS_DIR, { recursive: true })
  fs.chmodSync(env.CC_SB_PROJECTS_DIR, 0o000)
  try {
    const result = run(['build-index'])
    assert.equal(result.status, 1)
    assert.equal(JSON.parse(result.stderr).error, 'partition-read-failed')
  } finally {
    fs.chmodSync(env.CC_SB_PROJECTS_DIR, 0o700)
  }
})

test('build-index diagnoses a file read failure and retains its cached entry', () => {
  const key = '-cached-read-failure'
  const filePath = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/cached/read/failure', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'cached' } }),
  ])
  assert.equal(runJson(['build-index'])[0].id, IDS.normal)
  fs.chmodSync(filePath, 0o000)
  try {
    const result = run(['build-index', '--refresh'])
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stderr, /"diagnostic":"index-read-failed"/)
    assert.deepEqual(JSON.parse(result.stdout).map(item => item.id), [IDS.normal])
    const cache = JSON.parse(fs.readFileSync(path.join(env.CC_SB_DATA_DIR, 'index-cache.json'), 'utf8'))
    assert.equal(cache.entries[filePath].meta.id, IDS.normal)
  } finally {
    fs.chmodSync(filePath, 0o600)
  }
})

test('list-under filters exact roots and descendants by partition', () => {
  writeSession(env.CC_SB_PROJECTS_DIR, '-repo-app', IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/repo/app', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'active child' } }),
  ])
  writeSession(env.CC_SB_PROJECTS_DIR, '-other', IDS.empty, [
    JSON.stringify({ type: 'user', cwd: '/other', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'outside' } }),
  ])
  writeSession(env.CC_SB_ARCHIVE_DIR, '-repo-archived', IDS.archive, [
    JSON.stringify({ type: 'user', cwd: '/repo/archived', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'archived child' } }),
  ])

  assert.deepEqual(runJson(['list-under', '/repo', '--partition', 'active']).map(item => item.id), [IDS.normal])
  assert.deepEqual(runJson(['list-under', '/repo', '--partition', 'archive']).map(item => item.id), [IDS.archive])
  assert.deepEqual(new Set(runJson(['list-under', '/repo']).map(item => item.id)), new Set([IDS.normal, IDS.archive]))
})

test('check-dir reports existing and missing paths and rejects relative or traversal paths', () => {
  const existing = path.join(fixture, 'workspace')
  fs.mkdirSync(existing)

  assert.deepEqual(runJson(['check-dir', existing]), { exists: true, dir: true })
  assert.deepEqual(runJson(['check-dir', path.join(fixture, 'missing')]), { exists: false, dir: false })

  const relative = run(['check-dir', 'relative/workspace'])
  assert.notEqual(relative.status, 0)
  assert.match(relative.stderr, /invalid-absolute-path/)

  const traversal = run(['check-dir', `${fixture}/workspace/../other`])
  assert.notEqual(traversal.status, 0)
  assert.match(traversal.stderr, /invalid-absolute-path/)
})

test('export destination classification resolves traversal, absolute home paths, and symlinks', () => {
  const homeChild = path.join(env.HOME, 'exports')
  const outside = path.join(fixture, 'outside')
  fs.mkdirSync(homeChild, { recursive: true })
  fs.mkdirSync(outside, { recursive: true })
  fs.symlinkSync(outside, path.join(env.HOME, 'linked-outside'))

  assert.deepEqual(runJson(['classify-export-destination', homeChild]), { outsideHome: false })
  assert.deepEqual(runJson(['classify-export-destination', '~/../outside']), { outsideHome: true })
  assert.deepEqual(runJson(['classify-export-destination', '~/linked-outside']), { outsideHome: true })
})

test('list-dirs returns structured errors and includes symlinked directories', () => {
  const root = path.join(fixture, 'picker-root')
  const target = path.join(fixture, 'picker-target')
  fs.mkdirSync(path.join(root, 'real-dir'), { recursive: true })
  fs.mkdirSync(target, { recursive: true })
  fs.symlinkSync(target, path.join(root, 'linked-dir'))
  fs.writeFileSync(path.join(root, 'plain-file'), 'not a directory')

  const listed = runJson(['list-dirs', root])
  assert.deepEqual(listed.dirs.map(entry => entry.name), ['linked-dir', 'real-dir'])

  const missing = runJson(['list-dirs', path.join(fixture, 'missing')])
  assert.equal(missing.error, 'not-found')
  assert.match(missing.message, /missing/)

  const denied = path.join(fixture, 'denied')
  fs.mkdirSync(denied)
  fs.chmodSync(denied, 0o000)
  try {
    const unreadable = runJson(['list-dirs', denied])
    assert.equal(unreadable.error, 'unreadable-directory')
    assert.equal(typeof unreadable.message, 'string')
  } finally {
    fs.chmodSync(denied, 0o700)
  }
})

test('live registry ignores malformed, dead, and terminal entries and newest duplicate wins without entering the cache', () => {
  const key = '-live-registry'
  const sourceJson = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/live/registry', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'fallback title' } }),
  ])
  fs.mkdirSync(env.CC_SB_SESSIONS_DIR, { recursive: true })

  fs.writeFileSync(path.join(env.CC_SB_SESSIONS_DIR, `${process.pid}.json`), '{broken')
  assert.equal(runJson(['build-index'])[0].live, undefined)

  fs.writeFileSync(path.join(env.CC_SB_SESSIONS_DIR, '99999999.json'), JSON.stringify({
    sessionId: IDS.normal,
    name: 'dead process',
    nameSource: 'user',
    status: 'busy',
    updatedAt: '2026-07-16T12:00:00.000Z',
  }))
  assert.equal(runJson(['build-index'])[0].live, undefined)

  fs.writeFileSync(path.join(env.CC_SB_SESSIONS_DIR, `${process.pid}.json`), JSON.stringify({
    sessionId: IDS.normal,
    name: 'terminal',
    nameSource: 'user',
    status: 'ended',
    updatedAt: '2026-07-16T13:00:00.000Z',
  }))
  assert.equal(runJson(['build-index'])[0].live, undefined)

  fs.writeFileSync(path.join(env.CC_SB_SESSIONS_DIR, `${process.pid}.json`), JSON.stringify({
    sessionId: IDS.normal,
    cwd: '/live/registry',
    name: 'older name',
    nameSource: 'derived',
    status: 'busy',
    updatedAt: '2026-07-16T14:00:00.000Z',
  }))
  fs.writeFileSync(path.join(env.CC_SB_SESSIONS_DIR, `${process.ppid}.json`), JSON.stringify({
    sessionId: IDS.normal,
    cwd: '/live/registry',
    name: 'newest user rename',
    nameSource: 'user',
    status: 'future-unknown-status',
    updatedAt: '2026-07-16T15:00:00.000Z',
  }))

  const [indexed] = runJson(['build-index'])
  assert.equal(indexed.live, true)
  assert.equal(runJson(['list-sessions', key])[0].live, true)
  assert.equal(runJson(['list-recent', '1'])[0].live, true)

  const cache = JSON.parse(fs.readFileSync(path.join(env.CC_SB_DATA_DIR, 'index-cache.json'), 'utf8'))
  assert.equal(cache.entries[sourceJson].meta.live, undefined)
})

test('search scope is subtree-limited and active-only', () => {
  writeSession(env.CC_SB_PROJECTS_DIR, '-repo-app', IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/repo/app', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'find this needle' } }),
  ])
  writeSession(env.CC_SB_PROJECTS_DIR, '-other', IDS.empty, [
    JSON.stringify({ type: 'user', cwd: '/other', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'needle elsewhere' } }),
  ])
  writeSession(env.CC_SB_ARCHIVE_DIR, '-repo-archive', IDS.archive, [
    JSON.stringify({ type: 'user', cwd: '/repo/archive', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'needle archived' } }),
  ])

  const results = runJson(['search', 'needle', '--scope', '/repo'])
  assert.deepEqual(results.map(result => result.session.id), [IDS.normal])
  assert.equal(results[0].session.partition, 'active')
})

test('search ignores JSON keys and metadata outside human-visible message text', () => {
  const cwd = '/metadata/only/path'
  writeSession(env.CC_SB_PROJECTS_DIR, encoded(cwd), IDS.normal, [
    JSON.stringify({ type: 'user', cwd, timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'Nothing relevant here' } }),
  ])

  assert.deepEqual(runJson(['search', 'user']), [])
  assert.deepEqual(runJson(['search', cwd]), [])
})

test('search returns trimmed context around matching human-visible text', () => {
  const text = `${'x'.repeat(80)}Visible Needle${'y'.repeat(80)}`
  writeSession(env.CC_SB_PROJECTS_DIR, '-search-snippet', IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/search/snippet', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'User preface' } }),
    JSON.stringify({ type: 'assistant', timestamp: '2026-07-01T00:01:00.000Z', message: { content: [{ type: 'tool_use', name: 'noop' }, { type: 'text', text }] } }),
  ])

  const results = runJson(['search', 'visible needle'])
  assert.deepEqual(results.map(result => result.session.id), [IDS.normal])
  assert.equal(results[0].match, `${'x'.repeat(60)}Visible Needle${'y'.repeat(60)}`)
})

test('read-session falls back to archive and drops trailing partial records', () => {
  const key = '-archive-root'
  writeSession(env.CC_SB_ARCHIVE_DIR, key, IDS.archive, [
    JSON.stringify({ type: 'user', cwd: '/archive/root', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'kept' } }),
    JSON.stringify({ type: 'user', timestamp: '2026-07-02T00:00:00.000Z', message: { content: 'partial dropped' } }).slice(0, -1),
  ], false)
  const messages = runJson(['read-session', key, IDS.archive])
  assert.deepEqual(messages.map(message => message.content), ['kept'])
})

test('read-session retains a complete final message without a trailing newline', () => {
  const key = '-no-trailing-newline'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/no/trailing/newline', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'first' } }),
    JSON.stringify({ type: 'user', timestamp: '2026-07-02T00:00:00.000Z', message: { content: 'complete final' } }),
  ], false)

  const messages = runJson(['read-session', key, IDS.normal])
  assert.deepEqual(messages.map(message => message.content), ['first', 'complete final'])
  const [meta] = runJson(['build-index'])
  assert.equal(meta.lastActiveAt, '2026-07-02T00:00:00.000Z')
  assert.equal(meta.messageCount, 2)
  assert.equal(meta.health, 'ok')
})

test('read-session classifies a missing session separately from a read failure', () => {
  const missing = run(['read-session', '-missing', IDS.normal])
  assert.equal(missing.status, 1)
  assert.equal(JSON.parse(missing.stderr).error, 'not-found')

  const key = '-symlink-session'
  const target = writeSession(env.CC_SB_PROJECTS_DIR, '-target', IDS.archive, [
    JSON.stringify({ type: 'user', cwd: '/target', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'target' } }),
  ])
  const linkPath = sessionPath(env.CC_SB_PROJECTS_DIR, key, IDS.normal)
  fs.mkdirSync(path.dirname(linkPath), { recursive: true })
  fs.symlinkSync(target, linkPath)

  const unreadable = run(['read-session', key, IDS.normal])
  assert.equal(unreadable.status, 1)
  assert.equal(JSON.parse(unreadable.stderr).error, 'read-failed')
})

test('read-session rejects parsed output above the bounded response limit', () => {
  const key = '-oversized-read'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/oversized/read', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'x'.repeat(16 * 1024 * 1024) } }),
  ])

  const result = run(['read-session', key, IDS.normal])
  assert.equal(result.status, 1)
  assert.equal(JSON.parse(result.stderr).error, 'session-output-too-large')
})

test('session exports to Markdown and contains its turns and tool summaries', () => {
  const key = '-export-session'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/export/session', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'Export this conversation' } }),
    JSON.stringify({ type: 'assistant', timestamp: '2026-07-01T00:01:00.000Z', message: { content: [
      { type: 'text', text: 'Here is the exported answer.' },
      { type: 'tool_use', name: 'Read', input: { file_path: '/tmp/example.txt' } },
    ] } }),
  ])

  const exported = runJson(['export-session', key, IDS.normal, '--dest', '~/exports'])
  assert.equal(exported.ok, true)
  assert.equal(path.isAbsolute(exported.path), true)
  assert.equal(path.dirname(exported.path), fs.realpathSync(path.join(env.HOME, 'exports')))
  const markdown = fs.readFileSync(exported.path, 'utf8')
  assert.match(markdown, /^# Export this conversation/m)
  assert.match(markdown, /## User\n\nExport this conversation/)
  assert.match(markdown, /## Assistant\n\nHere is the exported answer\./)
  assert.match(markdown, /- Tool: \/tmp\/example\.txt/)
  assert.deepEqual(fs.readdirSync(path.dirname(exported.path)).filter(name => name.startsWith('.')), [])
})

test('export filename uses the local session creation date and omits the session id', () => {
  const key = '-export-created-date'
  const createdAt = '2026-07-01T18:30:00.000Z'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/export/created-date', timestamp: createdAt, message: { content: 'Dated export' } }),
  ])

  const exported = runJson(['export-session', key, IDS.normal, '--dest', path.join(env.HOME, 'exports')])
  const filename = path.basename(exported.path)
  assert.equal(filename, `${localDateSegment(createdAt)}_Dated export.md`)
  assert.equal(filename.includes(IDS.normal.slice(0, 8)), false)
})

test('export filename falls back to a valid current local date for missing and invalid createdAt', () => {
  const key = '-export-fallback-date'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.noTimestamp, [
    JSON.stringify({ type: 'user', cwd: '/export/fallback-date', message: { content: 'Missing date' } }),
  ])
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.partial, [
    JSON.stringify({ type: 'user', cwd: '/export/fallback-date', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'Invalid date' } }),
  ])
  runJson(['build-index'])
  const cachePath = path.join(env.CC_SB_DATA_DIR, 'index-cache.json')
  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
  const invalidEntry = Object.values(cache.entries).find(entry => entry.meta.id === IDS.partial)
  assert.ok(invalidEntry)
  invalidEntry.meta.createdAt = 'Infinity'
  fs.writeFileSync(cachePath, JSON.stringify(cache))

  const before = localDateSegment()
  const missing = runJson(['export-session', key, IDS.noTimestamp, '--dest', path.join(env.HOME, 'exports')])
  const invalid = runJson(['export-session', key, IDS.partial, '--dest', path.join(env.HOME, 'exports')])
  const after = localDateSegment()
  const validTodaySegments = new Set([before, after])
  for (const [exported, title] of [[missing, 'Missing date'], [invalid, 'Invalid date']]) {
    const filename = path.basename(exported.path)
    const match = /^(\d{6})_(.+)\.md$/.exec(filename)
    assert.ok(match, filename)
    assert.equal(validTodaySegments.has(match[1]), true)
    assert.equal(match[2], title)
    assert.doesNotMatch(filename, /NaN|undefined|^_/)
  }
})

test('export removes every Windows-illegal character from the filename', () => {
  const key = '-export-illegal-title'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/export/illegal-title', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'Why? colon: star* "quote" <less> >greater | pipe' } }),
  ])

  const exported = runJson(['export-session', key, IDS.normal, '--dest', path.join(env.HOME, 'exports')])
  assert.doesNotMatch(path.basename(exported.path), /[<>:"|?*\\/]/)
  assert.equal(fs.existsSync(exported.path), true)
})

test('export strips pictographic glyphs and bracketed machine tokens from the filename', () => {
  const key = '-export-clean-title'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/export/clean-title', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'Review ↓ ⏺ [ACTION-PROPOSE abc123] customer export notes' } }),
  ])

  const exported = runJson(['export-session', key, IDS.normal, '--dest', path.join(env.HOME, 'exports')])
  assert.equal(path.basename(exported.path), '260701_Review customer export notes.md')
  assert.doesNotMatch(path.basename(exported.path), /↓|⏺|ACTION-PROPOSE/)
})

test('export makes reserved and trailing-dot titles usable on Windows', () => {
  const key = '-export-windows-title'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/export/windows-title', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'CON' } }),
  ])
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.archive, [
    JSON.stringify({ type: 'user', cwd: '/export/windows-title', timestamp: '2026-07-01T00:01:00.000Z', message: { content: 'Trailing title.' } }),
  ])
  const dest = path.join(env.HOME, 'exports')

  const reserved = runJson(['export-session', key, IDS.normal, '--dest', dest])
  const trailing = runJson(['export-session', key, IDS.archive, '--dest', dest])
  assert.equal(path.basename(reserved.path), '260701__CON.md')
  assert.equal(path.basename(trailing.path), '260701_Trailing title.md')
  assert.equal(fs.statSync(reserved.path).isFile(), true)
  assert.equal(fs.statSync(trailing.path).isFile(), true)
})

test('CJK export titles are truncated at a UTF-8 boundary within the filename cap', () => {
  const key = '-export-cjk'
  const title = '漢'.repeat(100)
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/export/cjk', timestamp: '2026-07-01T00:00:00.000Z', message: { content: title } }),
  ])

  const exported = runJson(['export-session', key, IDS.normal, '--dest', path.join(env.HOME, 'exports')])
  const filename = path.basename(exported.path)
  assert.ok(Buffer.byteLength(filename, 'utf8') <= 255)
  assert.match(filename, /^260701_漢+\.md$/)
  assert.equal(filename.includes('\uFFFD'), false)
  const markdown = fs.readFileSync(exported.path, 'utf8')
  assert.equal(markdown.includes(`# ${title}\n`), true)
  assert.equal(markdown.includes(`## User\n\n${title}\n`), true)
  assert.deepEqual(fs.readdirSync(path.dirname(exported.path)).filter(name => name.startsWith('.export-tmp-')), [])
})

test('long export titles stop at a readable boundary within 60 characters', () => {
  const key = '-export-readable-title'
  const title = 'Readable export filenames should stop cleanly at the final available word boundary instead of splitting anotherword'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/export/readable-title', timestamp: '2026-07-01T00:00:00.000Z', message: { content: title } }),
  ])

  const exported = runJson(['export-session', key, IDS.normal, '--dest', path.join(env.HOME, 'exports')])
  const filename = path.basename(exported.path)
  const filenameTitle = filename.slice('260701_'.length, -'.md'.length)
  assert.equal(filenameTitle, 'Readable export filenames should stop cleanly at the final')
  assert.ok(Array.from(filenameTitle).length <= 60)
  assert.equal(filenameTitle.endsWith(' a'), false)
})

test('export rechecks title legality after character truncation and preserves the empty-title fallback', () => {
  const key = '-export-post-truncation-title'
  const title = `${'a'.repeat(50)}.${'b'.repeat(20)}`
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/export/post-truncation-title', timestamp: '2026-07-01T00:00:00.000Z', message: { content: title } }),
  ])
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.archive, [
    JSON.stringify({ type: 'user', cwd: '/export/post-truncation-title', timestamp: '2026-07-01T00:01:00.000Z', message: { content: '...' } }),
  ])
  const dest = path.join(env.HOME, 'exports')

  const truncated = runJson(['export-session', key, IDS.normal, '--dest', dest])
  const fallback = runJson(['export-session', key, IDS.archive, '--dest', dest])
  const titleComponent = path.basename(truncated.path).slice('260701_'.length, -'.md'.length)
  assert.equal(path.basename(truncated.path), `260701_${'a'.repeat(50)}.md`)
  assert.equal(titleComponent, 'a'.repeat(50))
  assert.equal(titleComponent.endsWith('.'), false)
  assert.equal(path.basename(fallback.path), '260701_session.md')
})

test('long export filenames reserve room for the date and largest collision suffix', () => {
  const key = '-export-max-filename'
  const title = '𐐀'.repeat(60)
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/export/max-filename', timestamp: '2026-07-01T00:00:00.000Z', message: { content: title } }),
  ])

  const exported = runJson(['export-session', key, IDS.normal, '--dest', path.join(env.HOME, 'exports')])
  const filename = path.basename(exported.path)
  const base = path.basename(exported.path, '.md')
  assert.equal(filename, `260701_${'𐐀'.repeat(59)}.md`)
  assert.equal(Buffer.byteLength(filename, 'utf8'), 246)
  assert.equal(Buffer.byteLength(`${base} (1000).md`, 'utf8'), 253)
  assert.equal(filename.includes('\uFFFD'), false)
})

test('reserved export title stays within the byte cap at collision attempt 1000', () => {
  const { exportFilenameBase, exportFilename } = loadExportFilenameHelpers()
  const hostileTitle = `con.${'a'.repeat(234)}`
  assert.equal(Buffer.byteLength(hostileTitle, 'utf8'), 238)

  const base = exportFilenameBase(hostileTitle, '2026-07-19T12:00:00')
  const filename = exportFilename(base, 1000)
  assert.ok(Buffer.byteLength(filename, 'utf8') <= 255)
  assert.equal(filename.endsWith('.md'), true)
  assert.doesNotMatch(filename, /[. ](?: \(1000\))?\.md$/)
})

test('benign export title uses the full byte cap at collision attempt 1000', () => {
  const { exportFilenameBase, exportFilename } = loadExportFilenameHelpers()
  const benignTitle = 'a'.repeat(238)
  assert.equal(Buffer.byteLength(benignTitle, 'utf8'), 238)

  const base = exportFilenameBase(benignTitle, '2026-07-19T12:00:00')
  const filename = exportFilename(base, 1000)
  assert.equal(Buffer.byteLength(filename, 'utf8'), 255)
  assert.equal(filename.endsWith('.md'), true)
  assert.doesNotMatch(filename, /[. ](?: \(1000\))?\.md$/)
})

test('colliding export filenames receive numeric suffixes without overwriting', () => {
  const key = '-export-collision'
  const title = '𐐀'.repeat(80)
  const createdAt = '2026-07-01T00:00:00.000Z'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/export/collision', timestamp: createdAt, message: { content: title } }),
    JSON.stringify({ type: 'assistant', timestamp: '2026-07-01T00:01:00.000Z', message: { content: [{ type: 'text', text: 'first distinct session' }] } }),
  ])
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.archive, [
    JSON.stringify({ type: 'user', cwd: '/export/collision', timestamp: createdAt, message: { content: title } }),
    JSON.stringify({ type: 'assistant', timestamp: '2026-07-01T00:02:00.000Z', message: { content: [{ type: 'text', text: 'second distinct session' }] } }),
  ])
  const dest = path.join(env.HOME, 'exports')

  const first = runJson(['export-session', key, IDS.normal, '--dest', dest])
  const firstContents = fs.readFileSync(first.path, 'utf8')
  const second = runJson(['export-session', key, IDS.archive, '--dest', dest])
  const expectedBase = `260701_${'𐐀'.repeat(59)}`
  const firstBase = path.basename(first.path, '.md')
  const secondBase = path.basename(second.path, '.md').slice(0, -' (2)'.length)
  assert.equal(path.basename(first.path), `${expectedBase}.md`)
  assert.equal(path.basename(second.path), `${expectedBase} (2).md`)
  assert.deepEqual(Buffer.from(secondBase), Buffer.from(firstBase))
  assert.match(firstContents, new RegExp(`Session ID: ${IDS.normal}`))
  assert.match(fs.readFileSync(second.path, 'utf8'), new RegExp(`Session ID: ${IDS.archive}`))
  assert.equal(fs.readFileSync(first.path, 'utf8'), firstContents)
  assert.notEqual(second.path, first.path)
})

test('export falls back to reserve and rename when hard links are not permitted', () => {
  const key = '-export-link-fallback'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/export/link-fallback', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'Fallback export content' } }),
  ])
  const dest = path.join(env.HOME, 'exports')
  const preload = path.join(fixture, 'reject-export-links.cjs')
  fs.writeFileSync(preload, [
    "const fs = require('node:fs')",
    'fs.linkSync = function () {',
    "  const error = new Error('hard links are not permitted')",
    "  error.code = 'ENOTSUP'",
    '  throw error',
    '}',
  ].join('\n'))
  const originalNodeOptions = env.NODE_OPTIONS
  env.NODE_OPTIONS = `${originalNodeOptions || ''} --require=${preload}`.trim()

  let exported
  try {
    exported = runJson(['export-session', key, IDS.normal, '--dest', dest])
  } finally {
    if (originalNodeOptions === undefined) delete env.NODE_OPTIONS
    else env.NODE_OPTIONS = originalNodeOptions
  }

  assert.equal(exported.ok, true)
  assert.match(fs.readFileSync(exported.path, 'utf8'), /## User\n\nFallback export content/)
  assert.deepEqual(fs.readdirSync(dest).filter(name => name.startsWith('.')), [])
})

test('export leaves the source session mtime unchanged', () => {
  const key = '-export-read-only'
  const source = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/export/read-only', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'Read only source' } }),
  ])
  const old = new Date('2025-01-01T00:00:00.000Z')
  fs.utimesSync(source, old, old)
  const before = fs.statSync(source).mtimeMs

  runJson(['export-session', key, IDS.normal, '--dest', path.join(env.HOME, 'exports')])
  assert.equal(fs.statSync(source).mtimeMs, before)
})

test('export rejects a destination that is not a directory with structured error JSON', () => {
  const key = '-export-not-directory'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/export/not-directory', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'Destination error' } }),
  ])
  fs.mkdirSync(env.HOME, { recursive: true })
  const dest = path.join(env.HOME, 'not-a-directory')
  fs.writeFileSync(dest, 'keep')

  const result = run(['export-session', key, IDS.normal, '--dest', dest])
  assert.equal(result.status, 1)
  assert.equal(JSON.parse(result.stderr).error, 'export-destination-not-directory')
  assert.equal(fs.readFileSync(dest, 'utf8'), 'keep')
})

test('export requires an override for destinations outside home', () => {
  const key = '-export-outside-home'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/export/outside-home', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'Outside home' } }),
  ])
  const dest = path.join(fixture, 'outside-home')

  const rejected = run(['export-session', key, IDS.normal, '--dest', dest])
  assert.equal(rejected.status, 1)
  assert.equal(JSON.parse(rejected.stderr).error, 'export-destination-outside-home')

  const accepted = runJson(['export-session', key, IDS.normal, '--dest', dest, '--allow-outside-home'])
  assert.equal(accepted.ok, true)
  assert.equal(path.dirname(accepted.path), fs.realpathSync(dest))
})

test('rejected outside-home export does not create the destination directory', () => {
  const key = '-export-outside-home-no-create'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/export/outside-home-no-create', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'Outside home no create' } }),
  ])
  const outsideRoot = path.join(fixture, 'outside-home-no-create')
  const dest = path.join(outsideRoot, 'nested', 'exports')

  const rejected = run(['export-session', key, IDS.normal, '--dest', dest])
  assert.equal(rejected.status, 1)
  assert.equal(JSON.parse(rejected.stderr).error, 'export-destination-outside-home')
  assert.equal(fs.existsSync(dest), false)
  assert.equal(fs.existsSync(outsideRoot), false)
})

test('post-check outside-home rejection removes directories created after an ancestor symlink swap', () => {
  const key = '-export-outside-home-swap'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/export/outside-home-swap', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'Outside home swap' } }),
  ])
  const ancestor = path.join(env.HOME, 'swap-ancestor')
  const outside = path.join(fixture, 'swap-target')
  const dest = path.join(ancestor, 'created', 'exports')
  fs.mkdirSync(ancestor, { recursive: true })
  fs.mkdirSync(outside, { recursive: true })
  const preload = path.join(fixture, 'swap-before-mkdir.cjs')
  fs.writeFileSync(preload, [
    "const fs = require('node:fs')",
    "const path = require('node:path')",
    'const originalMkdirSync = fs.mkdirSync',
    'fs.mkdirSync = function (target, options) {',
    '  if (path.resolve(target) === path.resolve(process.env.CC_SB_TEST_SWAP_DEST)) {',
    '    fs.rmdirSync(process.env.CC_SB_TEST_SWAP_ANCESTOR)',
    "    fs.symlinkSync(process.env.CC_SB_TEST_SWAP_OUTSIDE, process.env.CC_SB_TEST_SWAP_ANCESTOR, 'dir')",
    '  }',
    '  return originalMkdirSync.apply(this, arguments)',
    '}',
  ].join('\n'))
  env.CC_SB_TEST_SWAP_DEST = dest
  env.CC_SB_TEST_SWAP_ANCESTOR = ancestor
  env.CC_SB_TEST_SWAP_OUTSIDE = outside
  env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --require=${preload}`.trim()

  const rejected = run(['export-session', key, IDS.normal, '--dest', dest])
  assert.equal(rejected.status, 1)
  assert.equal(JSON.parse(rejected.stderr).error, 'export-destination-outside-home')
  assert.equal(fs.existsSync(dest), false)
  assert.equal(fs.existsSync(path.join(outside, 'created')), false)
})

test('export sweeps stale export temps at the destination but retains recent ones', () => {
  const key = '-export-temp-sweep'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/export/temp/sweep', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'Sweep destination export temps' } }),
  ])
  const dest = path.join(env.HOME, 'exports')
  fs.mkdirSync(dest, { recursive: true })
  const unusedPid = findUnusedPid()
  const stale = path.join(dest, `.export-tmp-${unusedPid}-1000-1`)
  const recent = path.join(dest, `.export-tmp-${unusedPid}-2000-2`)
  fs.writeFileSync(stale, 'stale export')
  fs.writeFileSync(recent, 'recent export')
  const old = new Date(Date.now() - (24 * 60 * 60 * 1000) - 5000)
  fs.utimesSync(stale, old, old)

  runJson(['export-session', key, IDS.normal, '--dest', dest])
  assert.equal(fs.existsSync(stale), false)
  assert.equal(fs.readFileSync(recent, 'utf8'), 'recent export')
})

test('export temp sweep retains a stale temp from a live pid and removes one from an unused pid', () => {
  const key = '-export-temp-live-writer'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/export/temp/live-writer', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'Protect live export temps' } }),
  ])
  const dest = path.join(env.HOME, 'exports')
  fs.mkdirSync(dest, { recursive: true })
  const live = path.join(dest, `.export-tmp-${process.pid}-1000-1`)
  const dead = path.join(dest, `.export-tmp-${findUnusedPid()}-2000-2`)
  fs.writeFileSync(live, 'live export')
  fs.writeFileSync(dead, 'dead export')
  const old = new Date(Date.now() - (24 * 60 * 60 * 1000) - 5000)
  fs.utimesSync(live, old, old)
  fs.utimesSync(dead, old, old)

  runJson(['export-session', key, IDS.normal, '--dest', dest])
  assert.equal(fs.readFileSync(live, 'utf8'), 'live export')
  assert.equal(fs.existsSync(dead), false)
})

test('bulk export temp sweep revisits older run directories without following symlinks or exceeding its depth bound', () => {
  const key = '-bulk-export-temp-sweep'
  writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/bulk/export/temp/sweep', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'Sweep old bulk run temps' } }),
  ])
  const exportRoot = path.join(env.HOME, 'exports', 'claude-code_exp')
  const current = path.join(exportRoot, '20260719-120000', 'current-project')
  const older = path.join(exportRoot, '20260718-120000', 'older-project')
  const tooDeep = path.join(exportRoot, 'one', 'two', 'three')
  const outside = path.join(env.HOME, 'outside-export-tree')
  fs.mkdirSync(current, { recursive: true })
  fs.mkdirSync(older, { recursive: true })
  fs.mkdirSync(tooDeep, { recursive: true })
  fs.mkdirSync(outside, { recursive: true })
  const unusedPid = findUnusedPid()
  const oldOrphan = path.join(older, `.export-tmp-${unusedPid}-1000-1`)
  const deepOrphan = path.join(tooDeep, `.export-tmp-${unusedPid}-1000-2`)
  const outsideOrphan = path.join(outside, `.export-tmp-${unusedPid}-1000-3`)
  const linkedDir = path.join(exportRoot, 'linked-outside')
  fs.writeFileSync(oldOrphan, 'old orphan')
  fs.writeFileSync(deepOrphan, 'bounded orphan')
  fs.writeFileSync(outsideOrphan, 'outside orphan')
  fs.symlinkSync(outside, linkedDir, 'dir')
  const old = new Date(Date.now() - (24 * 60 * 60 * 1000) - 5000)
  for (const file of [oldOrphan, deepOrphan, outsideOrphan]) fs.utimesSync(file, old, old)

  runJson(['export-session', key, IDS.normal, '--dest', current])
  assert.equal(fs.existsSync(oldOrphan), false)
  assert.equal(fs.readFileSync(deepOrphan, 'utf8'), 'bounded orphan')
  assert.equal(fs.readFileSync(outsideOrphan, 'utf8'), 'outside orphan')
})

test('export temp sweep descent relies on directory entries without a later lstat race', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/history-cli.ts'), 'utf8')
  const sweep = source.match(/function sweepOrphanedExportTemps\([^]*?^}/m)?.[0]
  assert.ok(sweep)
  assert.match(sweep, /readdirSync\(dirPath, \{ withFileTypes: true \}\)/)
  assert.doesNotMatch(sweep, /lstatSync\(childPath\)/)
})

test('index walk never deletes any file in session storage', () => {
  const key = '-restore-temp-nonmatch'
  const source = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/restore/temp/nonmatch', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'Keep dot files' } }),
  ])
  const unrelated = path.join(path.dirname(source), '.keep-me')
  const restoreTemp = path.join(path.dirname(source), `.${IDS.normal}.restore-123-1000`)
  fs.writeFileSync(unrelated, 'never delete')
  fs.writeFileSync(restoreTemp, 'never delete')
  const old = new Date(Date.now() - (48 * 60 * 60 * 1000))
  fs.utimesSync(unrelated, old, old)
  fs.utimesSync(restoreTemp, old, old)

  runJson(['build-index'])
  assert.equal(fs.readFileSync(unrelated, 'utf8'), 'never delete')
  assert.equal(fs.readFileSync(restoreTemp, 'utf8'), 'never delete')
})

test('archive, restore, and delete-archived complete the full lifecycle with artifacts', () => {
  const key = '-lifecycle-root'
  const activeJson = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/lifecycle/root', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'lifecycle' } }),
  ])
  const activeArtifacts = artifactPath(env.CC_SB_PROJECTS_DIR, key, IDS.normal)
  fs.mkdirSync(path.join(activeArtifacts, 'subagents'), { recursive: true })
  fs.writeFileSync(path.join(activeArtifacts, 'subagents', 'agent.txt'), 'artifact')
  runJson(['build-index'])

  const archived = runJson(['archive', key, IDS.normal, '--force'])
  const archiveJson = sessionPath(env.CC_SB_ARCHIVE_DIR, key, IDS.normal)
  const archiveArtifacts = artifactPath(env.CC_SB_ARCHIVE_DIR, key, IDS.normal)
  assert.deepEqual(archived, { outcome: 'success', cacheRefreshed: true })
  assert.equal(fs.existsSync(activeJson), false)
  assert.equal(fs.existsSync(activeArtifacts), false)
  assert.equal(fs.readFileSync(path.join(archiveArtifacts, 'subagents', 'agent.txt'), 'utf8'), 'artifact')
  assert.equal(runJson(['list-under', '/lifecycle/root', '--partition', 'archive'])[0].partition, 'archive')

  const restored = runJson(['restore', key, IDS.normal])
  assert.deepEqual(restored, { outcome: 'success', cacheRefreshed: true })
  assert.equal(fs.existsSync(archiveJson), false)
  assert.equal(runJson(['list-under', '/lifecycle/root', '--partition', 'active'])[0].partition, 'active')

  runJson(['archive', key, IDS.normal, '--force'])
  const deleted = runJson(['delete-archived', key, IDS.normal])
  assert.deepEqual(deleted, { outcome: 'success', cacheRefreshed: true })
  assert.equal(fs.existsSync(archiveArtifacts), false)
  assert.equal(fs.existsSync(archiveJson), false)
  assert.deepEqual(runJson(['build-index']), [])
})

test('archive heals a partial operation when the destination artifact directory already exists', () => {
  const key = '-partial-heal'
  const sourceJson = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/partial/heal', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'heal' } }),
  ])
  const destArtifacts = artifactPath(env.CC_SB_ARCHIVE_DIR, key, IDS.normal)
  fs.mkdirSync(destArtifacts, { recursive: true })
  fs.writeFileSync(path.join(destArtifacts, 'already-moved.txt'), 'kept')

  const result = runJson(['archive', key, IDS.normal, '--force'])
  const destJson = sessionPath(env.CC_SB_ARCHIVE_DIR, key, IDS.normal)
  assert.deepEqual(result, { outcome: 'success', cacheRefreshed: true })
  assert.equal(fs.existsSync(sourceJson), false)
  assert.equal(fs.readFileSync(path.join(destArtifacts, 'already-moved.txt'), 'utf8'), 'kept')
})

test('archive rejects when source and destination artifact directories coexist', () => {
  const key = '-artifact-conflict'
  const sourceJson = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/artifact/conflict', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'conflict' } }),
  ])
  const sourceArtifacts = artifactPath(env.CC_SB_PROJECTS_DIR, key, IDS.normal)
  const destArtifacts = artifactPath(env.CC_SB_ARCHIVE_DIR, key, IDS.normal)
  fs.mkdirSync(sourceArtifacts, { recursive: true })
  fs.mkdirSync(destArtifacts, { recursive: true })
  fs.writeFileSync(path.join(sourceArtifacts, 'source.txt'), 'source')
  fs.writeFileSync(path.join(destArtifacts, 'destination.txt'), 'destination')

  const result = runJson(['archive', key, IDS.normal, '--force'])
  assert.equal(result.outcome, 'failure')
  assert.equal(result.reason.error, 'artifact-collision')
  assert.equal(fs.existsSync(sourceJson), true)
  assert.equal(fs.existsSync(sessionPath(env.CC_SB_ARCHIVE_DIR, key, IDS.normal)), false)
  assert.equal(fs.readFileSync(path.join(sourceArtifacts, 'source.txt'), 'utf8'), 'source')
  assert.equal(fs.readFileSync(path.join(destArtifacts, 'destination.txt'), 'utf8'), 'destination')
})

test('archive rejects EXDEV without copying or deleting the source', () => {
  const key = '-cross-filesystem'
  const sourceJson = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/cross/filesystem', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'stay put' } }),
  ])
  env.CC_SB_TEST_FAULTS = 'move-exdev'

  const result = runJson(['archive', key, IDS.normal, '--force'])
  delete env.CC_SB_TEST_FAULTS
  assert.equal(result.outcome, 'failure')
  assert.equal(result.reason.error, 'cross-filesystem-not-supported')
  assert.match(result.reason.message, /Cross-filesystem moves are not supported/)
  assert.equal(fs.existsSync(sourceJson), true)
  assert.equal(fs.existsSync(sessionPath(env.CC_SB_ARCHIVE_DIR, key, IDS.normal)), false)
})

test('archive rolls back artifacts when the second rename hits EXDEV', () => {
  const key = '-cross-filesystem-jsonl'
  const sourceJson = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/cross/filesystem/jsonl', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'stay together' } }),
  ])
  const sourceArtifacts = artifactPath(env.CC_SB_PROJECTS_DIR, key, IDS.normal)
  const destJson = sessionPath(env.CC_SB_ARCHIVE_DIR, key, IDS.normal)
  const destArtifacts = artifactPath(env.CC_SB_ARCHIVE_DIR, key, IDS.normal)
  fs.mkdirSync(sourceArtifacts, { recursive: true })
  fs.writeFileSync(path.join(sourceArtifacts, 'artifact.txt'), 'source artifact')
  env.CC_SB_TEST_FAULTS = 'move-exdev-2'

  const result = runJson(['archive', key, IDS.normal, '--force'])
  delete env.CC_SB_TEST_FAULTS
  assert.equal(result.outcome, 'failure')
  assert.equal(result.reason.error, 'cross-filesystem-not-supported')
  assert.equal(fs.existsSync(sourceJson), true)
  assert.equal(fs.readFileSync(path.join(sourceArtifacts, 'artifact.txt'), 'utf8'), 'source artifact')
  assert.equal(fs.existsSync(destJson), false)
  assert.equal(fs.existsSync(destArtifacts), false)
})

test('destructive commands reject symlink-owned session paths outside the partition root', () => {
  const key = '-symlink-owned'
  const outsideDir = path.join(fixture, 'outside', key)
  const outsideJson = writeSession(path.dirname(outsideDir), key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/outside', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'outside' } }),
  ])
  fs.mkdirSync(env.CC_SB_PROJECTS_DIR, { recursive: true })
  fs.symlinkSync(outsideDir, path.join(env.CC_SB_PROJECTS_DIR, key))

  const result = runJson(['archive', key, IDS.normal, '--force'])
  assert.equal(result.outcome, 'failure')
  assert.equal(result.reason.error, 'unsafe-path')
  assert.equal(fs.existsSync(outsideJson), true)
  assert.equal(fs.existsSync(sessionPath(env.CC_SB_ARCHIVE_DIR, key, IDS.normal)), false)
})

test('archive collision aborts before moving either source unit', () => {
  const key = '-collision-root'
  const sourceJson = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/collision/root', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'source' } }),
  ])
  const sourceArtifacts = artifactPath(env.CC_SB_PROJECTS_DIR, key, IDS.normal)
  fs.mkdirSync(sourceArtifacts, { recursive: true })
  fs.writeFileSync(path.join(sourceArtifacts, 'source.txt'), 'source artifact')
  const destJson = writeSession(env.CC_SB_ARCHIVE_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/collision/root', timestamp: '2026-06-01T00:00:00.000Z', message: { content: 'destination' } }),
  ])

  const result = runJson(['archive', key, IDS.normal, '--force'])
  assert.equal(result.outcome, 'failure')
  assert.equal(result.reason.error, 'collision')
  assert.equal(fs.existsSync(sourceJson), true)
  assert.equal(fs.readFileSync(path.join(sourceArtifacts, 'source.txt'), 'utf8'), 'source artifact')
  assert.match(fs.readFileSync(destJson, 'utf8'), /destination/)
})

test('archive rejects a possibly-live session unless forced', () => {
  const key = '-possibly-live'
  const sourceJson = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/possibly/live', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'live' } }),
  ])

  const guarded = runJson(['archive', key, IDS.normal])
  assert.equal(guarded.outcome, 'failure')
  assert.equal(guarded.reason.error, 'possibly-live')
  assert.equal(fs.existsSync(sourceJson), true)
  assert.equal(fs.existsSync(path.join(env.CC_SB_ARCHIVE_DIR, key)), false)

  runJson(['archive', key, IDS.normal, '--force'])
  assert.equal(fs.existsSync(sourceJson), false)
  assert.equal(fs.existsSync(sessionPath(env.CC_SB_ARCHIVE_DIR, key, IDS.normal)), true)
})

test('archive validates the live registry immediately before moving and force uses the distinct session-live override', () => {
  const key = '-validated-live'
  const sourceJson = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/validated/live', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'live registry' } }),
  ])
  const old = new Date('2026-01-01T00:00:00.000Z')
  fs.utimesSync(sourceJson, old, old)
  fs.mkdirSync(env.CC_SB_SESSIONS_DIR, { recursive: true })
  fs.writeFileSync(path.join(env.CC_SB_SESSIONS_DIR, `${process.pid}.json`), JSON.stringify({
    sessionId: IDS.normal,
    cwd: '/validated/live',
    name: 'live registry title',
    nameSource: 'user',
    status: 'idle',
    updatedAt: '2026-07-16T12:00:00.000Z',
  }))

  const guarded = runJson(['archive', key, IDS.normal])
  assert.equal(guarded.outcome, 'failure')
  assert.equal(guarded.reason.error, 'session-live')
  assert.doesNotMatch(guarded.reason.message, /--force/)
  assert.equal(fs.existsSync(sourceJson), true)

  const forced = runJson(['archive', key, IDS.normal, '--force'])
  assert.deepEqual(forced, { outcome: 'success', cacheRefreshed: true })
})

test('live registry marks duplicate UUIDs while archive safety remains conservative', () => {
  const projectA = '/registry/project-a'
  const projectB = '/registry/project-b'
  const keyA = encoded(projectA)
  const keyB = encoded(projectB)
  const projectAJson = writeSession(env.CC_SB_PROJECTS_DIR, keyA, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: projectA, timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'project A title' } }),
  ])
  const projectBJson = writeSession(env.CC_SB_PROJECTS_DIR, keyB, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: projectB, timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'project B title' } }),
  ])
  const old = new Date('2026-01-01T00:00:00.000Z')
  fs.utimesSync(projectAJson, old, old)
  fs.utimesSync(projectBJson, old, old)
  fs.mkdirSync(env.CC_SB_SESSIONS_DIR, { recursive: true })
  fs.writeFileSync(path.join(env.CC_SB_SESSIONS_DIR, `${process.pid}.json`), JSON.stringify({
    sessionId: IDS.normal,
    cwd: projectA,
    name: 'project A live rename',
    nameSource: 'user',
    status: 'busy',
    updatedAt: '2026-07-16T12:00:00.000Z',
  }))

  const indexed = runJson(['build-index'])
  const sessionA = indexed.find(item => item.attributionKey === keyA)
  const sessionB = indexed.find(item => item.attributionKey === keyB)
  assert.equal(sessionA.live, true)
  assert.equal(sessionB.live, true)

  const guarded = runJson(['archive', keyB, IDS.normal])
  assert.equal(guarded.outcome, 'failure')
  assert.equal(guarded.reason.error, 'session-live')
  assert.match(guarded.reason.message, /attribution is unverified/)
  assert.equal(fs.existsSync(projectBJson), true)
})

test('live registry marks a colliding encoded cwd while live safety still matches the session UUID', () => {
  const sessionRoot = '/a-b'
  const registryRoot = '/a/b'
  const attributionKey = encoded(sessionRoot)
  assert.equal(encoded(registryRoot), attributionKey)
  const sourceJson = writeSession(env.CC_SB_PROJECTS_DIR, attributionKey, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: sessionRoot, timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'session title' } }),
  ])
  const old = new Date('2026-01-01T00:00:00.000Z')
  fs.utimesSync(sourceJson, old, old)
  fs.mkdirSync(env.CC_SB_SESSIONS_DIR, { recursive: true })
  fs.writeFileSync(path.join(env.CC_SB_SESSIONS_DIR, `${process.pid}.json`), JSON.stringify({
    sessionId: IDS.normal,
    cwd: registryRoot,
    name: 'wrong colliding live rename',
    nameSource: 'user',
    status: 'busy',
    updatedAt: '2026-07-16T12:00:00.000Z',
  }))

  const [indexed] = runJson(['build-index'])
  assert.equal(indexed.rootPath, sessionRoot)
  assert.equal(indexed.live, true)

  const guarded = runJson(['archive', attributionKey, IDS.normal])
  assert.equal(guarded.outcome, 'failure')
  assert.equal(guarded.reason.error, 'session-live')
  assert.equal(fs.existsSync(sourceJson), true)
})

test('delete-archived skips a validated live UUID unless the single command explicitly forces it', () => {
  const rootPath = '/delete/live'
  const key = encoded(rootPath)
  const archiveJson = writeSession(env.CC_SB_ARCHIVE_DIR, key, IDS.archive, [
    JSON.stringify({ type: 'user', cwd: rootPath, timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'live archived session' } }),
  ])
  fs.mkdirSync(env.CC_SB_SESSIONS_DIR, { recursive: true })
  fs.writeFileSync(path.join(env.CC_SB_SESSIONS_DIR, `${process.pid}.json`), JSON.stringify({
    sessionId: IDS.archive,
    cwd: rootPath,
    status: 'idle',
    updatedAt: '2026-07-16T12:00:00.000Z',
  }))

  const guarded = runJson(['delete-archived', key, IDS.archive])
  assert.equal(guarded.outcome, 'failure')
  assert.equal(guarded.reason.error, 'session-live')
  assert.equal(fs.existsSync(archiveJson), true)

  const forced = runJson(['delete-archived', key, IDS.archive, '--force'])
  assert.deepEqual(forced, { outcome: 'success', cacheRefreshed: true })
  assert.equal(fs.existsSync(archiveJson), false)
})

test('restore skips a validated live UUID before moving the archived source', () => {
  const rootPath = '/restore/live'
  const key = encoded(rootPath)
  const archiveJson = writeSession(env.CC_SB_ARCHIVE_DIR, key, IDS.archive, [
    JSON.stringify({ type: 'user', cwd: rootPath, timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'live restore source' } }),
  ])
  fs.mkdirSync(env.CC_SB_SESSIONS_DIR, { recursive: true })
  fs.writeFileSync(path.join(env.CC_SB_SESSIONS_DIR, `${process.pid}.json`), JSON.stringify({
    sessionId: IDS.archive,
    cwd: rootPath,
    status: 'busy',
    updatedAt: '2026-07-16T12:00:00.000Z',
  }))

  const guarded = runJson(['restore', key, IDS.archive])
  assert.equal(guarded.outcome, 'failure')
  assert.equal(guarded.reason.error, 'session-live')
  assert.equal(fs.existsSync(archiveJson), true)
  assert.equal(fs.existsSync(sessionPath(env.CC_SB_PROJECTS_DIR, key, IDS.archive)), false)
})

test('jsonl move failure rolls back the artifact and reports failure without a split state', () => {
  const key = '-jsonl-rollback'
  const sourceJson = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/jsonl/rollback', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'rollback' } }),
  ])
  const sourceArtifacts = artifactPath(env.CC_SB_PROJECTS_DIR, key, IDS.normal)
  fs.mkdirSync(sourceArtifacts, { recursive: true })
  fs.writeFileSync(path.join(sourceArtifacts, 'artifact.txt'), 'kept')
  env.CC_SB_TEST_FAULTS = 'move-jsonl'

  const result = runJson(['archive', key, IDS.normal, '--force'])
  delete env.CC_SB_TEST_FAULTS
  assert.equal(result.outcome, 'failure')
  assert.equal(result.reason.error, 'jsonl-move-failed')
  assert.equal(fs.existsSync(sourceJson), true)
  assert.equal(fs.existsSync(sourceArtifacts), true)
  assert.equal(fs.existsSync(artifactPath(env.CC_SB_ARCHIVE_DIR, key, IDS.normal)), false)
})

test('rollback failure reports partial paths and a second archive heals the split move', () => {
  const key = '-rollback-partial'
  const sourceJson = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/rollback/partial', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'partial' } }),
  ])
  const sourceArtifacts = artifactPath(env.CC_SB_PROJECTS_DIR, key, IDS.normal)
  const destArtifacts = artifactPath(env.CC_SB_ARCHIVE_DIR, key, IDS.normal)
  fs.mkdirSync(sourceArtifacts, { recursive: true })
  fs.writeFileSync(path.join(sourceArtifacts, 'artifact.txt'), 'stranded')
  env.CC_SB_TEST_FAULTS = 'move-jsonl,rollback-artifact'

  const partial = runJson(['archive', key, IDS.normal, '--force'])
  delete env.CC_SB_TEST_FAULTS
  assert.equal(partial.outcome, 'partial')
  assert.equal(partial.stage, 'artifact-rollback')
  assert.equal(partial.jsonlPath, sourceJson)
  assert.equal(partial.artifactPath, destArtifacts)
  assert.equal(fs.existsSync(sourceJson), true)
  assert.equal(fs.existsSync(sourceArtifacts), false)
  assert.equal(fs.existsSync(destArtifacts), true)

  const healed = runJson(['archive', key, IDS.normal, '--force'])
  assert.deepEqual(healed, { outcome: 'success', cacheRefreshed: true })
  assert.equal(fs.existsSync(sourceJson), false)
  assert.equal(fs.existsSync(sessionPath(env.CC_SB_ARCHIVE_DIR, key, IDS.normal)), true)
  assert.equal(fs.readFileSync(path.join(destArtifacts, 'artifact.txt'), 'utf8'), 'stranded')
})

test('cache write failure after a committed archive is success with cacheRefreshed false', () => {
  const key = '-cache-fault'
  const sourceJson = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/cache/fault', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'cache fault' } }),
  ])
  env.CC_SB_TEST_FAULTS = 'cache-write'

  const result = runJson(['archive', key, IDS.normal, '--force'])
  delete env.CC_SB_TEST_FAULTS
  assert.deepEqual(result, { outcome: 'success', cacheRefreshed: false })
  assert.equal(fs.existsSync(sourceJson), false)
  assert.equal(fs.existsSync(sessionPath(env.CC_SB_ARCHIVE_DIR, key, IDS.normal)), true)
})

test('delete failure after artifact deletion reports partial and retry is idempotent', () => {
  const key = '-delete-partial'
  const archiveJson = writeSession(env.CC_SB_ARCHIVE_DIR, key, IDS.archive, [
    JSON.stringify({ type: 'user', cwd: '/delete/partial', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'delete partial' } }),
  ])
  const archiveArtifacts = artifactPath(env.CC_SB_ARCHIVE_DIR, key, IDS.archive)
  fs.mkdirSync(archiveArtifacts, { recursive: true })
  fs.writeFileSync(path.join(archiveArtifacts, 'artifact.txt'), 'delete me')
  env.CC_SB_TEST_FAULTS = 'delete-jsonl'

  const partial = runJson(['delete-archived', key, IDS.archive])
  delete env.CC_SB_TEST_FAULTS
  assert.equal(partial.outcome, 'partial')
  assert.equal(partial.stage, 'jsonl-delete')
  assert.equal(partial.jsonlPath, archiveJson)
  assert.equal(partial.artifactPath, archiveArtifacts)
  assert.equal(fs.existsSync(archiveArtifacts), false)
  assert.equal(fs.existsSync(archiveJson), true)

  const retried = runJson(['delete-archived', key, IDS.archive])
  assert.deepEqual(retried, { outcome: 'success', cacheRefreshed: true })
  assert.equal(fs.existsSync(archiveJson), false)
})

test('restore touches the jsonl mtime to now', () => {
  const key = '-restore-touch'
  const archiveJson = writeSession(env.CC_SB_ARCHIVE_DIR, key, IDS.archive, [
    JSON.stringify({ type: 'user', cwd: '/restore/touch', timestamp: '2025-01-01T00:00:00.000Z', message: { content: 'old' } }),
  ])
  const old = new Date('2025-01-01T00:00:00.000Z')
  fs.utimesSync(archiveJson, old, old)
  const before = Date.now()

  runJson(['restore', key, IDS.archive])
  const restoredMtime = fs.statSync(sessionPath(env.CC_SB_PROJECTS_DIR, key, IDS.archive)).mtimeMs
  assert.ok(restoredMtime >= before - 1000)
  assert.ok(restoredMtime <= Date.now() + 1000)
})

test('restore touch failure happens before either session unit is committed', () => {
  const key = '-restore-touch-order'
  const archiveJson = writeSession(env.CC_SB_ARCHIVE_DIR, key, IDS.archive, [
    JSON.stringify({ type: 'user', cwd: '/restore/touch/order', timestamp: '2025-01-01T00:00:00.000Z', message: { content: 'old' } }),
  ])
  const archiveArtifacts = artifactPath(env.CC_SB_ARCHIVE_DIR, key, IDS.archive)
  fs.mkdirSync(archiveArtifacts, { recursive: true })
  fs.writeFileSync(path.join(archiveArtifacts, 'artifact.txt'), 'still archived')
  env.CC_SB_TEST_FAULTS = 'restore-touch'

  const result = runJson(['restore', key, IDS.archive])
  delete env.CC_SB_TEST_FAULTS
  assert.equal(result.outcome, 'failure')
  assert.equal(result.reason.error, 'restore-touch-failed')
  assert.equal(fs.existsSync(archiveJson), true)
  assert.equal(fs.existsSync(archiveArtifacts), true)
  assert.equal(fs.existsSync(sessionPath(env.CC_SB_PROJECTS_DIR, key, IDS.archive)), false)
  assert.equal(fs.existsSync(artifactPath(env.CC_SB_PROJECTS_DIR, key, IDS.archive)), false)
})

test('restore post-touch failure leaves the archived source unchanged and removes its temporary file', () => {
  const key = '-restore-post-touch'
  const archiveJson = writeSession(env.CC_SB_ARCHIVE_DIR, key, IDS.archive, [
    JSON.stringify({ type: 'user', cwd: '/restore/post/touch', timestamp: '2025-01-01T00:00:00.000Z', message: { content: 'unchanged' } }),
  ])
  const archiveArtifacts = artifactPath(env.CC_SB_ARCHIVE_DIR, key, IDS.archive)
  fs.mkdirSync(archiveArtifacts, { recursive: true })
  const old = new Date('2025-01-01T00:00:00.000Z')
  fs.utimesSync(archiveJson, old, old)
  const before = fs.statSync(archiveJson)
  const content = fs.readFileSync(archiveJson, 'utf8')
  env.CC_SB_TEST_FAULTS = 'restore-post-touch'

  const result = runJson(['restore', key, IDS.archive])
  delete env.CC_SB_TEST_FAULTS
  assert.equal(result.outcome, 'failure')
  assert.equal(result.reason.error, 'restore-touch-failed')
  assert.equal(fs.readFileSync(archiveJson, 'utf8'), content)
  assert.equal(fs.statSync(archiveJson).mtimeMs, before.mtimeMs)
  assert.equal(fs.existsSync(archiveArtifacts), true)
  assert.equal(fs.existsSync(sessionPath(env.CC_SB_PROJECTS_DIR, key, IDS.archive)), false)
  assert.deepEqual(fs.readdirSync(path.join(env.CC_SB_PROJECTS_DIR, key)), [])
})

test('restore atomic publish preserves a destination created after the collision precheck', () => {
  const key = '-restore-publish-collision'
  const archiveJson = writeSession(env.CC_SB_ARCHIVE_DIR, key, IDS.archive, [
    JSON.stringify({ type: 'user', cwd: '/restore/publish/collision', timestamp: '2025-01-01T00:00:00.000Z', message: { content: 'archived' } }),
  ])
  const activeJson = sessionPath(env.CC_SB_PROJECTS_DIR, key, IDS.archive)
  env.CC_SB_TEST_FAULTS = 'restore-publish-collision'

  const result = runJson(['restore', key, IDS.archive])
  delete env.CC_SB_TEST_FAULTS
  assert.equal(result.outcome, 'failure')
  assert.equal(result.reason.error, 'collision')
  assert.equal(fs.readFileSync(activeJson, 'utf8'), 'concurrent destination\n')
  assert.equal(fs.existsSync(archiveJson), true)
  assert.deepEqual(fs.readdirSync(path.dirname(activeJson)), [path.basename(activeJson)])
})

test('index, read, and search reject a symlinked partition root that resolves outside containment', () => {
  const outsideRoot = path.join(fixture, 'outside-projects')
  const key = '-symlink-read-root'
  writeSession(outsideRoot, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/symlink/read/root', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'outside needle' } }),
  ])
  fs.symlinkSync(outsideRoot, env.CC_SB_PROJECTS_DIR, 'dir')

  assert.deepEqual(runJson(['build-index']), [])
  const readResult = run(['read-session', key, IDS.normal])
  assert.equal(readResult.status, 1)
  assert.equal(JSON.parse(readResult.stderr).error, 'read-failed')
  assert.deepEqual(runJson(['search', 'outside needle']), [])
})

test('delete-archived refuses an active-partition session without deleting it', () => {
  const key = '-active-only'
  const activeJson = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/active/only', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'active' } }),
  ])
  const activeArtifacts = artifactPath(env.CC_SB_PROJECTS_DIR, key, IDS.normal)
  fs.mkdirSync(activeArtifacts, { recursive: true })

  const result = runJson(['delete-archived', key, IDS.normal])
  assert.equal(result.outcome, 'failure')
  assert.equal(result.reason.error, 'archived-session-not-found')
  assert.equal(fs.existsSync(activeJson), true)
  assert.equal(fs.existsSync(activeArtifacts), true)
})

test('archive re-keys the cache so list-under reflects the move without refresh', () => {
  const key = '-cache-move'
  const sourceJson = writeSession(env.CC_SB_PROJECTS_DIR, key, IDS.normal, [
    JSON.stringify({ type: 'user', cwd: '/cache/move', timestamp: '2026-07-01T00:00:00.000Z', message: { content: 'cache move' } }),
  ])
  runJson(['build-index'])
  runJson(['archive', key, IDS.normal, '--force'])
  const destJson = sessionPath(env.CC_SB_ARCHIVE_DIR, key, IDS.normal)
  const cache = JSON.parse(fs.readFileSync(path.join(env.CC_SB_DATA_DIR, 'index-cache.json'), 'utf8'))
  assert.equal(cache.entries[sourceJson], undefined)
  assert.equal(cache.entries[destJson].meta.partition, 'archive')
  assert.deepEqual(runJson(['list-under', '/cache/move', '--partition', 'active']), [])
  assert.deepEqual(runJson(['list-under', '/cache/move', '--partition', 'archive']).map(item => item.id), [IDS.normal])
})

test('invalid encoded paths and session ids return error JSON before filesystem access', () => {
  const marker = path.join(fixture, 'marker')
  fs.writeFileSync(marker, 'unchanged')

  const encodedResult = run(['read-session', '..%2F', IDS.normal])
  assert.equal(encodedResult.status, 1)
  assert.equal(JSON.parse(encodedResult.stderr).error, 'invalid-encoded-path')

  const idResult = run(['read-session', '-safe', '../../x'])
  assert.equal(idResult.status, 1)
  assert.equal(JSON.parse(idResult.stderr).error, 'invalid-session-id')

  const archiveResult = run(['archive', '-safe', '../../x', '--force'])
  assert.equal(archiveResult.status, 1)
  assert.equal(JSON.parse(archiveResult.stderr).error, 'invalid-session-id')

  const deleteResult = run(['delete-archived', '..%2F', IDS.normal])
  assert.equal(deleteResult.status, 1)
  assert.equal(JSON.parse(deleteResult.stderr).error, 'invalid-encoded-path')
  assert.equal(fs.readFileSync(marker, 'utf8'), 'unchanged')
  assert.equal(fs.existsSync(env.CC_SB_PROJECTS_DIR), false)
  assert.equal(fs.existsSync(env.CC_SB_ARCHIVE_DIR), false)
  assert.equal(fs.existsSync(env.CC_SB_DATA_DIR), false)
})
