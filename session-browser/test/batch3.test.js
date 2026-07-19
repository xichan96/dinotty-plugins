const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const esbuild = require('esbuild')

const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-browser-batch3-'))
const bundlePath = path.join(bundleDir, 'ui.cjs')
esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/ui.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: bundlePath,
  logLevel: 'silent',
})
const {
  clampPage,
  commitAbsoluteLastActiveRange,
  commitDurationTimeRange,
  filterSessions,
  localDateBounds,
  normalizeDateRange,
  runBulkSerial,
  selectionReducer,
  sessionKey,
} = require(bundlePath)

test.after(() => fs.rmSync(bundleDir, { recursive: true, force: true }))

function session(id, partition = 'active', overrides = {}) {
  return {
    id,
    rootPath: '/work',
    attributionKey: '-work',
    title: id,
    createdAt: '2026-07-10T00:00:00.000Z',
    lastActiveAt: '2026-07-10T01:00:00.000Z',
    messageCount: 1,
    partition,
    health: 'ok',
    timestampSource: 'event',
    sizeBytes: 1,
    ...overrides,
  }
}

test('selection reducer toggles and shift-ranges only within the rendered page', () => {
  const keys = ['a', 'b', 'c', 'd']
  let state = { selected: new Set(), anchor: null }
  state = selectionReducer(state, { type: 'toggle', key: 'b' })
  state = selectionReducer(state, { type: 'shift-range', key: 'd', pageKeys: keys })
  assert.deepEqual([...state.selected], ['b', 'c', 'd'])
  state = selectionReducer(state, { type: 'shift-range', key: 'x', pageKeys: ['x', 'y'] })
  assert.equal(state.selected.has('x'), true)
  assert.equal(state.selected.has('y'), false)
})

test('selection snapshot is one-time and filter/partition reconciliation is explicit', () => {
  let state = selectionReducer({ selected: new Set(), anchor: null }, { type: 'snapshot-all', keys: ['a', 'b'] })
  assert.equal(state.selected.has('new-after-refresh'), false)
  state = selectionReducer(state, { type: 'intersect', keys: ['b', 'c'] })
  assert.deepEqual([...state.selected], ['b'])
  state = selectionReducer(state, { type: 'clear-partition' })
  assert.equal(state.selected.size, 0)
})

test('selection post-op reconcile drops all successes and retains failures/skips', () => {
  const state = { selected: new Set(['done', 'failed', 'skipped', 'move']), anchor: 'done' }
  const reconciled = selectionReducer(state, {
    type: 'reconcile',
    succeeded: ['done', 'move'],
    retagged: { move: 'archive-move' },
  })
  assert.deepEqual([...reconciled.selected], ['failed', 'skipped'])
  assert.equal(reconciled.anchor, null)
})

test('pagination clamps after mutation shrink, empty-page stepback, and refresh preservation', () => {
  assert.equal(clampPage(5, 81, 20), 5)
  assert.equal(clampPage(5, 79, 20), 4)
  assert.equal(clampPage(3, 0, 20), 1)
  assert.equal(clampPage(2, 100, 50), 2)
  assert.equal(clampPage(2, 20, 50), 1)
})

test('date ranges use inclusive local midnight and exclusive day-after boundaries', () => {
  const bounds = localDateBounds({ from: '2026-07-10', to: '2026-07-10' })
  assert.equal(bounds.from, new Date(2026, 6, 10).getTime())
  assert.equal(bounds.toExclusive, new Date(2026, 6, 11).getTime())
  const items = [
    session('before', 'active', { createdAt: new Date(bounds.from - 1).toISOString() }),
    session('start', 'active', { createdAt: new Date(bounds.from).toISOString() }),
    session('end', 'active', { createdAt: new Date(bounds.toExclusive - 1).toISOString() }),
    session('after', 'active', { createdAt: new Date(bounds.toExclusive).toISOString() }),
  ]
  const filtered = filterSessions(items, {
    partition: 'active', scopePath: '/work', scopeMode: 'exact', timeRange: 'all', branch: '', query: '',
    createdFrom: '2026-07-10', createdTo: '2026-07-10',
  })
  assert.deepEqual(filtered.map(item => item.id), ['start', 'end'])
})

test('date day-after construction is DST-safe and undated created sessions are excluded', () => {
  const previous = process.env.TZ
  process.env.TZ = 'America/New_York'
  try {
    const spring = localDateBounds({ from: '2026-03-08', to: '2026-03-08' })
    assert.equal(spring.toExclusive - spring.from, 23 * 60 * 60_000)
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
  const filtered = filterSessions([session('known'), session('undated', 'active', { createdAt: '' })], {
    partition: 'active', scopePath: '/work', scopeMode: 'exact', timeRange: 'all', branch: '', query: '', createdFrom: '2026-07-01',
  })
  assert.deepEqual(filtered.map(item => item.id), ['known'])
})

test('date ranges auto-swap and last-active absolute/duration controls are mutually exclusive', () => {
  assert.deepEqual(normalizeDateRange({ from: '2026-07-12', to: '2026-07-01' }), { from: '2026-07-01', to: '2026-07-12' })
  assert.deepEqual(commitAbsoluteLastActiveRange('7d', { from: '2026-07-01', to: '' }), {
    timeRange: 'all', range: { from: '2026-07-01', to: '' },
  })
  assert.deepEqual(commitDurationTimeRange('24h', { from: '2026-07-01', to: '2026-07-02' }), {
    timeRange: '24h', range: { from: '', to: '' },
  })
})

test('bulk engine is strictly serial and classifies live failures as skips', async () => {
  const items = [session('one'), session('two'), session('three')]
  const order = []
  let active = 0
  const outcome = await runBulkSerial({
    action: 'archive',
    items,
    run: async args => {
      assert.equal(args.includes('--force'), false)
      active++
      assert.equal(active, 1)
      order.push(args[2])
      await new Promise(resolve => setImmediate(resolve))
      active--
      if (args[2] === 'two') return { code: 0, stdout: JSON.stringify({ outcome: 'failure', reason: { error: 'session-live', message: 'live' } }), stderr: '' }
      if (args[2] === 'three') return { code: 0, stdout: JSON.stringify({ outcome: 'failure', reason: { error: 'possibly-live', message: 'recent' } }), stderr: '' }
      return { code: 0, stdout: JSON.stringify({ outcome: 'success', cacheRefreshed: true }), stderr: '' }
    },
  })
  assert.deepEqual(order, ['one', 'two', 'three'])
  assert.deepEqual([outcome.done, outcome.failed, outcome.skipped], [1, 0, 2])
  assert.equal(outcome.results[0].retaggedKey, sessionKey({ ...items[0], partition: 'archive' }))
})

test('bulk delete classifies a live registry guard as skipped and never adds force', async () => {
  const item = session('live-delete', 'archive')
  const outcome = await runBulkSerial({
    action: 'delete',
    items: [item],
    run: async args => {
      assert.deepEqual(args, ['delete-archived', item.attributionKey, item.id])
      return {
        code: 0,
        stdout: JSON.stringify({ outcome: 'failure', reason: { error: 'session-live', message: 'live' } }),
        stderr: '',
      }
    },
  })
  assert.deepEqual([outcome.done, outcome.failed, outcome.skipped], [0, 0, 1])
})

test('bulk engine flags partial and stale-cache successes for one rebuild', async () => {
  const outcomes = [
    { outcome: 'partial', stage: 'move', jsonlPath: '/j', artifactPath: '/a', reason: { error: 'partial', message: 'partial failure' } },
    { outcome: 'success', cacheRefreshed: false },
  ]
  const result = await runBulkSerial({
    action: 'restore',
    items: [session('one', 'archive'), session('two', 'archive')],
    run: async () => ({ code: 0, stdout: JSON.stringify(outcomes.shift()), stderr: '' }),
  })
  assert.equal(result.rebuildRequired, true)
  assert.deepEqual([result.done, result.failed, result.skipped], [1, 1, 0])
})

test('bulk cancel stops before the next item', async () => {
  let cancelled = false
  const calls = []
  const result = await runBulkSerial({
    action: 'delete',
    items: [session('one', 'archive'), session('two', 'archive')],
    isCancelled: () => cancelled,
    run: async args => {
      calls.push(args[2])
      cancelled = true
      return { code: 0, stdout: JSON.stringify({ outcome: 'success', cacheRefreshed: true }), stderr: '' }
    },
  })
  assert.deepEqual(calls, ['one'])
  assert.equal(result.cancelled, true)
})

test('bulk mutations use run and report a completed item before observing cancellation', async () => {
  let cancelled = false
  const result = await runBulkSerial({
    action: 'archive',
    items: [session('bulk-cancel')],
    run: async () => {
      cancelled = true
      return { code: 0, stdout: JSON.stringify({ outcome: 'success', cacheRefreshed: true }), stderr: '' }
    },
    isCancelled: () => cancelled,
  })
  assert.equal(result.cancelled, false)
  assert.equal(result.failed, 0)
  assert.equal(result.done, 1)
  assert.equal(result.results[0].status, 'done')
})
