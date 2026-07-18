const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const esbuild = require('esbuild')

const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-browser-ui-test-'))
const bundlePath = path.join(bundleDir, 'ui.cjs')
const diffBundlePath = path.join(bundleDir, 'diff.cjs')
const uiSource = fs.readFileSync(path.resolve(__dirname, '../src/ui.ts'), 'utf8')
esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/ui.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: bundlePath,
  logLevel: 'silent',
})
esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/diff.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: diffBundlePath,
  logLevel: 'silent',
})
const {
  cleanFirstPrompt,
  DEFAULT_PARTITION_SORT,
  deriveSessionPathTree,
  filterBranchOptions,
  filterSessions,
  isSafeTranscriptHref,
  nextTranscriptBatchEnd,
  normalizeStoredExpandedPaths,
  normalizeStoredTreeRoot,
  normalizePartitionSortSettings,
  resolveSessionTitle,
  resolveSessionTitles,
  runBulkSerial,
  shQuote,
  sortSessions,
} = require(bundlePath)
const { computeEditDiff, DIFF_MAX_LINES, isFullDiffSafe } = require(diffBundlePath)

test.after(() => fs.rmSync(bundleDir, { recursive: true, force: true }))

test('filterBranchOptions filters case-insensitive substrings and preserves empty queries', () => {
  const options = ['feature/Search', 'main', 'Release']
  assert.deepEqual(filterBranchOptions(options, 'SEAr'), ['feature/Search'])
  assert.deepEqual(filterBranchOptions(options, '  '), options)
  assert.deepEqual(filterBranchOptions(options, 'missing'), [])
})

test('transcript batches advance by 50 without exceeding the parsed message count', () => {
  assert.equal(nextTranscriptBatchEnd(132, 0), 50)
  assert.equal(nextTranscriptBatchEnd(132, 50), 100)
  assert.equal(nextTranscriptBatchEnd(132, 100), 132)
  assert.equal(nextTranscriptBatchEnd(12, 0), 12)
})

test('transcript markdown links only allow http, https, and mailto protocols', () => {
  assert.equal(isSafeTranscriptHref('https://example.com'), true)
  assert.equal(isSafeTranscriptHref('HTTP://example.com'), true)
  assert.equal(isSafeTranscriptHref('mailto:user@example.com'), true)
  assert.equal(isSafeTranscriptHref('javascript:alert(1)'), false)
  assert.equal(isSafeTranscriptHref('data:text/html,unsafe'), false)
  assert.equal(isSafeTranscriptHref('ftp://example.com'), false)
  assert.match(uiSource, /else parts\.push\(first\.match\[1\]\)/)
})

test('bulk progress increments only after the current command completes', async () => {
  const item = session('progress', '/work', 'active', '2026-07-15T00:00:00.000Z')
  let finish
  const command = new Promise(resolve => { finish = resolve })
  const progress = []
  const running = runBulkSerial({
    action: 'archive',
    items: [item],
    run: () => command,
    onProgress: (completed, total, current) => progress.push([completed, total, current.id]),
  })

  await Promise.resolve()
  assert.deepEqual(progress, [])
  finish({ code: 0, stdout: JSON.stringify({ outcome: 'success', cacheRefreshed: true }), stderr: '' })
  await running
  assert.deepEqual(progress, [[1, 1, 'progress']])
})

test('restoring font scale immediately recomputes compact mode at the current root width', () => {
  const start = uiSource.indexOf('async function loadDisplaySettings()')
  const end = uiSource.indexOf('function setVisibleRoot', start)
  const body = uiSource.slice(start, end)
  const restore = body.indexOf('fontScale.value =')
  const recompute = body.indexOf('updateCompactMode(rootWidth)')

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  assert.ok(restore >= 0 && recompute > restore)
})

test('index refresh intersects selection through sessionsForList', () => {
  const start = uiSource.indexOf('async function loadIndex(')
  const end = uiSource.indexOf('async function loadPaneWidths()', start)
  const body = uiSource.slice(start, end)

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  assert.match(body, /sessionsForList\(activePartition\.value\)\.map\(sessionKey\)/)
  assert.doesNotMatch(body, /sessions\.value\.map\(sessionKey\)/)
})

test('stored tree state rejects mixed types and normalizes valid paths independently', () => {
  assert.equal(normalizeStoredTreeRoot({ path: '/work' }), null)
  assert.equal(normalizeStoredTreeRoot('/work/./app/../repo'), '/work/repo')
  assert.equal(normalizeStoredExpandedPaths(['/work', 42]), null)
  assert.deepEqual([...normalizeStoredExpandedPaths(['/work/./app', '/work/app'])], ['/work/app'])
})

test('large edit diffs degrade to a constant-size summary before LCS allocation', () => {
  const oversized = Array.from({ length: DIFF_MAX_LINES }, (_, index) => `line ${index}`).join('\n')
  assert.equal(isFullDiffSafe(oversized, 'replacement'), false)
  assert.deepEqual(computeEditDiff(oversized, 'replacement'), [
    { type: 'ctx', text: 'Diff summary only: content exceeds the safe comparison limit.' },
  ])
  assert.ok(computeEditDiff('before', 'after').some(line => line.type === 'del'))
})

test('shQuote exactly encodes shell-sensitive paths with POSIX single quotes', () => {
  assert.equal(shQuote('/tmp/path with spaces'), "'/tmp/path with spaces'")
  assert.equal(shQuote("/tmp/it's-here"), "'/tmp/it'\\''s-here'")
  assert.equal(shQuote('/tmp/"double"'), "'/tmp/\"double\"'")
  assert.equal(shQuote('/tmp/$(x)'), "'/tmp/$(x)'")
  assert.equal(shQuote('/tmp/`x`'), "'/tmp/`x`'")
  assert.equal(shQuote('/tmp/line\nbreak'), "'/tmp/line\nbreak'")
  assert.equal(shQuote('-leading-dash'), "'-leading-dash'")
})

test('title chain uses jsonl titles before the cleaned first prompt', () => {
  const title = 'First prompt fallback'
  assert.deepEqual(resolveSessionTitles({ title, aiTitle: 'AI summary', customTitle: 'User rename' }), { primary: 'AI summary', secondary: 'User rename' })
  assert.deepEqual(resolveSessionTitles({ title, customTitle: 'User rename' }), { primary: 'User rename', secondary: undefined })
  assert.deepEqual(resolveSessionTitles({ title, aiTitle: 'AI summary' }), { primary: 'AI summary', secondary: undefined })
  assert.deepEqual(resolveSessionTitles({ title, aiTitle: '', customTitle: 'rename' }), { primary: 'rename', secondary: undefined })
  assert.deepEqual(resolveSessionTitles({ title, aiTitle: '   ', customTitle: 'rename' }), { primary: 'rename', secondary: undefined })
  assert.deepEqual(resolveSessionTitles({ title, aiTitle: 'AI', customTitle: '  ' }), { primary: 'AI', secondary: undefined })
  assert.deepEqual(resolveSessionTitles({ title: '<b>First</b>   prompt' }), { primary: 'First prompt', secondary: undefined })
  assert.equal(resolveSessionTitle({ title, aiTitle: 'AI summary', customTitle: 'User rename' }), 'AI summary')
})

test('cleanFirstPrompt unwraps commands and removes injected blocks and tags', () => {
  assert.equal(cleanFirstPrompt('<command-message>cycle-abort</command-message>\n<command-name>/cycle-abort</command-name>\n<command-args>C260711-012</command-args>'), 'cycle-abort C260711-012')
  assert.equal(cleanFirstPrompt('Before <system-reminder>hidden\ncontent</system-reminder> after'), 'Before after')
  assert.equal(cleanFirstPrompt('Plain text unchanged'), 'Plain text unchanged')
  assert.equal(cleanFirstPrompt('<system-reminder>hidden</system-reminder><local-command-stdout>also hidden</local-command-stdout>'), '')
  assert.equal(cleanFirstPrompt('<command-name>/run</command-name>\n<command-args>one\ntwo</command-args>'), 'run one two')
  assert.equal(cleanFirstPrompt('<command-name>/run</command-name>\n<command-args>one <system-reminder>hidden</system-reminder> two</command-args>'), 'run one two')
  assert.equal(cleanFirstPrompt('Visible <system-reminder>leak to end'), 'Visible')
})

function session(id, rootPath, partition, lastActiveAt) {
  return {
    id,
    rootPath,
    attributionKey: rootPath.replaceAll('/', '-'),
    title: id,
    createdAt: lastActiveAt,
    lastActiveAt,
    messageCount: 1,
    partition,
    health: 'ok',
    timestampSource: 'event',
    sizeBytes: 1,
  }
}

test('default idle ascending sort puts most-recently-active sessions first', () => {
  const older = session('older', '/work', 'active', '2026-07-01T00:00:00.000Z')
  const newer = session('newer', '/work', 'active', '2026-07-15T00:00:00.000Z')

  assert.deepEqual(sortSessions([older, newer], DEFAULT_PARTITION_SORT.active).map(item => item.id), ['newer', 'older'])
  assert.deepEqual(sortSessions([older, newer], { field: 'idle', direction: 'desc' }).map(item => item.id), ['older', 'newer'])
})

test('partition sort persistence shape is normalized independently', () => {
  assert.deepEqual(normalizePartitionSortSettings({
    active: { field: 'msgcount', direction: 'desc' },
    archive: { field: 'created', direction: 'asc' },
  }), {
    active: { field: 'msgcount', direction: 'desc' },
    archive: { field: 'created', direction: 'asc' },
  })

  assert.deepEqual(normalizePartitionSortSettings({ active: { field: 'bad', direction: 'sideways' } }), {
    active: { field: 'idle', direction: 'asc' },
    archive: { field: 'idle', direction: 'asc' },
  })
})

test('filterSessions subtree scope respects path segment boundaries', () => {
  const inside = session('inside', '/work/app', 'active', '2026-07-15T00:00:00.000Z')
  const siblingPrefix = session('prefix', '/workspace/app', 'active', '2026-07-15T00:00:00.000Z')
  const exactRoot = session('root', '/work', 'active', '2026-07-15T00:00:00.000Z')

  const filtered = filterSessions([inside, siblingPrefix, exactRoot], {
    partition: 'active',
    scopePath: '/work',
    scopeMode: 'subtree',
    timeRange: 'all',
    branch: '',
    query: '',
  })

  assert.deepEqual(filtered.map(item => item.id), ['inside', 'root'])
})

test('filterSessions applies last-active time, branch, and quick title search', () => {
  const matching = { ...session('matching', '/work', 'archive', '2026-07-16T00:00:00.000Z'), title: 'Hidden first prompt', aiTitle: 'Fix parser', customTitle: 'User rename', gitBranch: 'feature/search' }
  const old = { ...session('old', '/work', 'archive', '2026-06-01T00:00:00.000Z'), title: 'Fix parser', gitBranch: 'feature/search' }

  const filtered = filterSessions([matching, old], {
    partition: 'archive',
    scopePath: '/work',
    scopeMode: 'exact',
    timeRange: '24h',
    branch: 'feature/search',
    query: 'USER RENAME',
  }, Date.parse('2026-07-16T12:00:00.000Z'))

  assert.deepEqual(filtered.map(item => item.id), ['matching'])
})

test('filterSessions applies staleness presets with inclusive boundaries', () => {
  const now = Date.parse('2026-07-16T12:00:00.000Z')
  const fresh = session('fresh', '/work', 'active', new Date(now - 1 * 24 * 60 * 60_000).toISOString())
  const old = session('old', '/work', 'active', new Date(now - 20 * 24 * 60 * 60_000).toISOString())
  const boundary = session('boundary', '/work', 'active', new Date(now - 15 * 24 * 60 * 60_000).toISOString())
  const filters = {
    partition: 'active',
    scopePath: '/work',
    scopeMode: 'exact',
    branch: '',
    query: '',
  }

  assert.deepEqual(filterSessions([fresh, old], { ...filters, timeRange: 'older-15d' }, now).map(item => item.id), ['old'])
  assert.deepEqual(filterSessions([fresh, old], { ...filters, timeRange: 'older-30d' }, now).map(item => item.id), [])
  assert.deepEqual(filterSessions([boundary], { ...filters, timeRange: 'older-15d' }, now).map(item => item.id), ['boundary'])
})

test('deriveSessionPathTree builds a sparse tree with subtree counts and newest activity', () => {
  const tree = deriveSessionPathTree([
    session('one', '/a/b', 'active', '2026-07-01T00:00:00.000Z'),
    session('two', '/a/b/c', 'archive', '2026-07-03T00:00:00.000Z'),
    session('three', '/x', 'active', '2026-07-02T00:00:00.000Z'),
  ])

  assert.ok(tree)
  assert.equal(tree.path, '/')
  assert.deepEqual(tree.children.map(node => node.path), ['/a', '/x'])
  assert.equal(tree.activeCount, 2)
  assert.equal(tree.archiveCount, 1)
  assert.equal(tree.newestLastActiveAt, '2026-07-03T00:00:00.000Z')

  const a = tree.children[0]
  const b = a.children[0]
  const c = b.children[0]
  assert.deepEqual(a.children.map(node => node.path), ['/a/b'])
  assert.deepEqual(b.children.map(node => node.path), ['/a/b/c'])
  assert.deepEqual(c.children, [])
  assert.equal(a.activeCount, 1)
  assert.equal(a.archiveCount, 1)
  assert.equal(b.directActiveCount, 1)
  assert.equal(b.directArchiveCount, 0)
  assert.equal(c.directActiveCount, 0)
  assert.equal(c.directArchiveCount, 1)
  assert.equal(a.newestLastActiveAt, '2026-07-03T00:00:00.000Z')

  const allPaths = []
  const visit = node => {
    allPaths.push(node.path)
    node.children.forEach(visit)
  }
  visit(tree)
  assert.deepEqual(allPaths, ['/', '/a', '/a/b', '/a/b/c', '/x'])
})
