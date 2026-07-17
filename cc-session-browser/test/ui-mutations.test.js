const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const esbuild = require('esbuild')

const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-session-browser-ui-mutations-'))
const bundlePath = path.join(bundleDir, 'ui.cjs')
esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/ui.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: bundlePath,
  logLevel: 'silent',
})
const { activate, sessionKey } = require(bundlePath)

test.after(() => fs.rmSync(bundleDir, { recursive: true, force: true }))

function session(id, partition = 'active', overrides = {}) {
  return {
    id,
    rootPath: '/work',
    attributionKey: '-work',
    title: `${partition} ${id}`,
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

function h(tag, props, ...children) {
  return { tag, props: props || {}, children }
}

function flatten(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) flatten(item, output)
  } else if (value !== null && value !== undefined && value !== false) {
    output.push(value)
    if (typeof value === 'object' && 'children' in value) flatten(value.children, output)
  }
  return output
}

function textOf(value) {
  return flatten(value).filter(item => typeof item === 'string').join('')
}

async function flush() {
  await new Promise(resolve => setImmediate(resolve))
  await new Promise(resolve => setImmediate(resolve))
}

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

async function mount(indexedSessions, runOverride, confirmOverride = async () => true, lifecycle = {}) {
  const previousDocument = global.document
  const previousMutationObserver = global.MutationObserver
  const previousRequestAnimationFrame = global.requestAnimationFrame
  const previousCancelAnimationFrame = global.cancelAnimationFrame
  const mounted = []
  const unmounted = []
  const calls = []
  const confirmations = []
  const notifications = []

  global.document = {
    documentElement: { lang: 'en-US' },
    body: { classList: { add() {}, remove() {} } },
    addEventListener() {},
    removeEventListener() {},
  }
  global.MutationObserver = lifecycle.MutationObserver || class { observe() {} disconnect() {} }
  global.requestAnimationFrame = lifecycle.requestAnimationFrame || (callback => setTimeout(callback, 0))
  global.cancelAnimationFrame = lifecycle.cancelAnimationFrame || (handle => clearTimeout(handle))

  const storage = new Map([['locale', 'en']])
  const ctx = {
    h,
    ref: value => ({ value }),
    computed: getter => ({ get value() { return getter() } }),
    watch() {},
    onMounted: callback => mounted.push(callback),
    onUnmounted: callback => unmounted.push(callback),
    open() {},
    commands: { register: () => ({ dispose() {} }) },
    storage: {
      get: async key => lifecycle.storageGet ? lifecycle.storageGet(key, () => storage.get(key)) : storage.get(key),
      set: async (key, value) => { storage.set(key, value) },
    },
    exec: {
      run: async args => {
        calls.push(args)
        if (runOverride) {
          const overridden = await runOverride(args)
          if (overridden) return overridden
        }
        if (args[0] === 'build-index') return { code: 0, stdout: JSON.stringify(indexedSessions), stderr: '' }
        if (args[0] === 'read-session') return { code: 0, stdout: '[]', stderr: '' }
        if (args[0] === 'check-dir') return { code: 0, stdout: JSON.stringify({ exists: true, dir: true }), stderr: '' }
        return { code: 0, stdout: JSON.stringify({ outcome: 'success', cacheRefreshed: true }), stderr: '' }
      },
    },
    ui: {
      notify: (...args) => { notifications.push(args) },
      confirm: async message => {
        confirmations.push(message)
        return confirmOverride(message)
      },
    },
    terminal: { activePaneId: () => null },
  }

  const plugin = activate(ctx)
  let currentUnmount = null
  let isMounted = false
  function mountComponent() {
    const mountedIndex = mounted.length
    const unmountedIndex = unmounted.length
    plugin.component.setup()
    currentUnmount = unmounted[unmountedIndex]
    isMounted = true
    mounted[mountedIndex]()
  }
  function unmountComponent() {
    if (!isMounted) return
    isMounted = false
    currentUnmount()
  }
  mountComponent()
  await flush()

  return {
    plugin,
    calls,
    confirmations,
    notifications,
    unmount: unmountComponent,
    async remount() {
      unmountComponent()
      mountComponent()
      await flush()
    },
    cleanup() {
      unmountComponent()
      global.document = previousDocument
      global.MutationObserver = previousMutationObserver
      global.requestAnimationFrame = previousRequestAnimationFrame
      global.cancelAnimationFrame = previousCancelAnimationFrame
    },
  }
}

test('sessions pane renders an undated exclusion hint with a created-from filter', async () => {
  const dated = session('11111111-1111-1111-1111-111111111111')
  const undated = session('22222222-2222-2222-2222-222222222222', 'active', { createdAt: '' })
  const harness = await mount([dated, undated])
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Date-range filters').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    const dateInputs = nodes.filter(node => node?.tag === 'input' && node.props?.type === 'date')
    dateInputs[0].props.onChange({ target: { value: '2026-07-01' } })

    let rendered
    assert.doesNotThrow(() => { rendered = harness.plugin.component.render() })
    assert.ok(flatten(rendered).includes('+1 undated excluded'))
  } finally {
    harness.cleanup()
  }
})

test('deleting an archived duplicate leaves the active composite-key copy untouched', async () => {
  const id = '33333333-3333-3333-3333-333333333333'
  const active = session(id, 'active')
  const archived = session(id, 'archive')
  const harness = await mount([active, archived])
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.role === 'tab' && textOf(node) === 'Archive').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Delete archived session').props.onClick({ stopPropagation() {} })
    await flush()

    nodes = flatten(harness.plugin.component.render())
    assert.equal(nodes.some(node => node?.tag === 'article' && node.props?.key === sessionKey(archived)), false)
    nodes.find(node => node?.tag === 'button' && node.props?.role === 'tab' && textOf(node) === 'Active').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    assert.equal(nodes.some(node => node?.tag === 'article' && node.props?.key === sessionKey(active)), true)
  } finally {
    harness.cleanup()
  }
})

test('a partial single restore forces a refreshed index rebuild before reporting failure', async () => {
  const archived = session('44444444-4444-4444-4444-444444444444', 'archive')
  const harness = await mount([archived], async args => {
    if (args[0] === 'restore') {
      return {
        code: 0,
        stdout: JSON.stringify({
          outcome: 'partial',
          stage: 'restore-touch',
          jsonlPath: '/active/session.jsonl',
          artifactPath: '/active/session',
          reason: { error: 'restore-touch-failed', message: 'touch failed' },
        }),
        stderr: '',
      }
    }
  })
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.role === 'tab' && textOf(node) === 'Archive').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Restore session').props.onClick({ stopPropagation() {} })
    await flush()

    assert.ok(harness.calls.some(args => args[0] === 'build-index' && args[1] === '--refresh'))
    assert.match(textOf(harness.plugin.component.render()), /touch failed/)
  } finally {
    harness.cleanup()
  }
})

test('bulk archive drops successful selection and retags the open detail session before refresh', async () => {
  const active = session('55555555-5555-5555-5555-555555555555', 'active')
  let index = [active]
  const harness = await mount(index, async args => {
    if (args[0] === 'archive') {
      index = [{ ...active, partition: 'archive' }]
      return { code: 0, stdout: JSON.stringify({ outcome: 'success', cacheRefreshed: true }), stderr: '' }
    }
    if (args[0] === 'build-index') return { code: 0, stdout: JSON.stringify(index), stderr: '' }
  })
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'article').props.onClick()
    await flush()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Select mode').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'input' && node.props?.type === 'checkbox' && node.props?.['aria-label']?.startsWith('Select ')).props.onClick({ stopPropagation() {}, shiftKey: false })
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Archive 1').props.onClick()
    await flush()

    nodes = flatten(harness.plugin.component.render())
    assert.ok(nodes.includes('0 selected'))
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Resume session').props.onClick()
    await flush()
    assert.ok(harness.confirmations.some(message => message.includes('Restore first?')))
  } finally {
    harness.cleanup()
  }
})

test('bulk archive applies successes locally and warns when the final refresh fails', async () => {
  const active = session('88888888-8888-8888-8888-888888888888', 'active')
  let buildCount = 0
  const harness = await mount([active], async args => {
    if (args[0] === 'build-index' && ++buildCount > 1) return { code: 1, stdout: '', stderr: 'refresh unavailable' }
  })
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Select mode').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'input' && node.props?.type === 'checkbox').props.onClick({ stopPropagation() {}, shiftKey: false })
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Archive 1').props.onClick()
    await flush()

    const rendered = harness.plugin.component.render()
    nodes = flatten(rendered)
    assert.equal(nodes.some(node => node?.tag === 'article' && node.props?.key === sessionKey(active)), false)
    assert.match(textOf(rendered), /Refresh failed, view may be stale/)
  } finally {
    harness.cleanup()
  }
})

test('archived resume checks the workspace before offering or performing restore', async () => {
  const archived = session('99999999-9999-9999-9999-999999999999', 'archive')
  const harness = await mount([archived], async args => {
    if (args[0] === 'check-dir') return { code: 0, stdout: JSON.stringify({ exists: false, dir: false }), stderr: '' }
  }, async () => false)
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.role === 'tab' && textOf(node) === 'Archive').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'article').props.onClick()
    await flush()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Resume session').props.onClick()
    await flush()

    assert.equal(harness.calls.some(args => args[0] === 'restore'), false)
    assert.equal(harness.confirmations.some(message => message.includes('Restore first?')), false)
    assert.equal(harness.calls.findIndex(args => args[0] === 'check-dir') > -1, true)
  } finally {
    harness.cleanup()
  }
})

test('resuming a live session requires confirmation before opening another copy', async () => {
  const live = session('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active', { live: true })
  const harness = await mount([live], undefined, async message => !message.includes('already live'))
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Resume session').props.onClick({ stopPropagation() {} })
    await flush()

    assert.ok(harness.confirmations.some(message => message.includes('already live')))
  } finally {
    harness.cleanup()
  }
})

test('terminal resume rejects an invalid session id before directory or terminal work', async () => {
  const invalid = session('not-a-session-id', 'active')
  const harness = await mount([invalid])
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Resume session').props.onClick({ stopPropagation() {} })
    await flush()

    assert.equal(harness.calls.some(args => args[0] === 'check-dir'), false)
    assert.match(textOf(harness.plugin.component.render()), /Invalid session id/)
  } finally {
    harness.cleanup()
  }
})

test('single archive re-checks bulk state after its confirmation resolves', async () => {
  const active = session('66666666-6666-6666-6666-666666666666', 'active')
  const singleConfirm = deferred()
  const bulkArchive = deferred()
  let heldSingleConfirm = false
  const harness = await mount([active], async args => {
    if (args[0] === 'archive') return bulkArchive.promise
  }, message => {
    if (message.startsWith('Archive session') && !heldSingleConfirm) {
      heldSingleConfirm = true
      return singleConfirm.promise
    }
    return true
  })
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Archive session').props.onClick({ stopPropagation() {} })
    await flush()

    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Select mode').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'input' && node.props?.type === 'checkbox').props.onClick({ stopPropagation() {}, shiftKey: false })
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Archive 1').props.onClick()
    await flush()

    singleConfirm.resolve(true)
    await flush()
    assert.equal(harness.calls.filter(args => args[0] === 'archive').length, 1)

    bulkArchive.resolve({ code: 0, stdout: JSON.stringify({ outcome: 'success', cacheRefreshed: true }), stderr: '' })
    await flush()
  } finally {
    harness.cleanup()
  }
})

test('single delete re-checks bulk state after its confirmation resolves', async () => {
  const archived = session('77777777-7777-7777-7777-777777777777', 'archive')
  const singleConfirm = deferred()
  const bulkDelete = deferred()
  let heldSingleConfirm = false
  const harness = await mount([archived], async args => {
    if (args[0] === 'delete-archived') return bulkDelete.promise
  }, message => {
    if (message.startsWith('Permanently delete archived session') && !heldSingleConfirm) {
      heldSingleConfirm = true
      return singleConfirm.promise
    }
    return true
  })
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.role === 'tab' && textOf(node) === 'Archive').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Delete archived session').props.onClick({ stopPropagation() {} })
    await flush()

    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Select mode').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'input' && node.props?.type === 'checkbox').props.onClick({ stopPropagation() {}, shiftKey: false })
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Delete 1').props.onClick()
    await flush()

    singleConfirm.resolve(true)
    await flush()
    assert.equal(harness.calls.filter(args => args[0] === 'delete-archived').length, 1)

    bulkDelete.resolve({ code: 0, stdout: JSON.stringify({ outcome: 'success', cacheRefreshed: true }), stderr: '' })
    await flush()
  } finally {
    harness.cleanup()
  }
})

test('a stale index response from an unmounted generation cannot overwrite the remount', async () => {
  const stale = session('88888888-8888-8888-8888-888888888888')
  const current = session('99999999-9999-9999-9999-999999999999')
  const firstBuild = deferred()
  let buildCount = 0
  const harness = await mount([], async args => {
    if (args[0] !== 'build-index') return
    buildCount++
    if (buildCount === 1) return firstBuild.promise
    return { code: 0, stdout: JSON.stringify([current]), stderr: '' }
  })
  try {
    await harness.remount()
    firstBuild.resolve({ code: 0, stdout: JSON.stringify([stale]), stderr: '' })
    await flush()

    const nodes = flatten(harness.plugin.component.render())
    assert.equal(nodes.some(node => node?.tag === 'article' && node.props?.key === sessionKey(current)), true)
    assert.equal(nodes.some(node => node?.tag === 'article' && node.props?.key === sessionKey(stale)), false)
  } finally {
    harness.cleanup()
  }
})

test('a full-text response is dropped when its request-time scope changes', async () => {
  const active = session('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  const search = deferred()
  const harness = await mount([active], async args => {
    if (args[0] === 'search') return search.promise
  })
  try {
    let nodes = flatten(harness.plugin.component.render())
    const input = nodes.find(node => node?.tag === 'input' && node.props?.id === 'cc-session-browser-search-input')
    input.props.onInput({ target: { value: 'needle' } })
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Run full-text search').props.onClick()
    await flush()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Full-text search uses selected tree scope').props.onClick()
    search.resolve({ code: 0, stdout: JSON.stringify([{ session: active, match: 'stale match' }]), stderr: '' })
    await flush()

    assert.doesNotMatch(textOf(harness.plugin.component.render()), /stale match/)
  } finally {
    harness.cleanup()
  }
})

test('the mutation coordinator rejects a concurrent single operation', async () => {
  const active = session('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
  const confirmation = deferred()
  const harness = await mount([active], undefined, message => (
    message.startsWith('Archive session') ? confirmation.promise : true
  ))
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Archive session').props.onClick({ stopPropagation() {} })
    await flush()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Resume session').props.onClick({ stopPropagation() {} })
    await flush()

    assert.equal(harness.calls.some(args => args[0] === 'check-dir'), false)
    assert.ok(harness.notifications.some(([message, level]) => message.includes('already running') && level === 'warn'))
    confirmation.resolve(false)
    await flush()
  } finally {
    harness.cleanup()
  }
})

test('unmount cancels registered focus timers and transcript animation frames', async () => {
  const active = session('cccccccc-cccc-cccc-cccc-cccccccccccc')
  const messages = Array.from({ length: 60 }, (_, index) => ({
    uuid: String(index), role: 'user', content: `message ${index}`, timestamp: '2026-07-10T00:00:00.000Z',
  }))
  const frames = []
  const cancelledFrames = []
  const harness = await mount([active], async args => {
    if (args[0] === 'read-session') return { code: 0, stdout: JSON.stringify(messages), stderr: '' }
  }, undefined, {
    requestAnimationFrame: callback => { frames.push(callback); return frames.length },
    cancelAnimationFrame: handle => { cancelledFrames.push(handle) },
  })
  const realSetTimeout = global.setTimeout
  const realClearTimeout = global.clearTimeout
  const timers = []
  const clearedTimers = []
  global.setTimeout = callback => { timers.push(callback); return timers.length }
  global.clearTimeout = handle => { clearedTimers.push(handle) }
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Change tree root').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Close directory picker').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'article').props.onClick()
    await flush()

    assert.ok(timers.length >= 2)
    assert.ok(frames.length >= 2)
    harness.unmount()
    assert.deepEqual(new Set(clearedTimers), new Set(timers.map((_, index) => index + 1)))
    assert.deepEqual(new Set(cancelledFrames), new Set(frames.map((_, index) => index + 1)))
  } finally {
    global.setTimeout = realSetTimeout
    global.clearTimeout = realClearTimeout
    harness.cleanup()
  }
})

test('locale observation is reattached with a fresh observer after remount', async () => {
  const observers = []
  class TrackingObserver {
    constructor() { this.observed = 0; this.disconnected = 0; observers.push(this) }
    observe() { this.observed++ }
    disconnect() { this.disconnected++ }
  }
  const harness = await mount([], undefined, undefined, { MutationObserver: TrackingObserver })
  try {
    assert.equal(observers.length, 1)
    assert.equal(observers[0].observed, 1)
    await harness.remount()
    assert.equal(observers.length, 2)
    assert.equal(observers[0].disconnected, 1)
    assert.equal(observers[1].observed, 1)
  } finally {
    harness.cleanup()
  }
})

test('the selected session remains open after an unmount and remount', async () => {
  const active = session('dddddddd-dddd-dddd-dddd-dddddddddddd')
  const harness = await mount([active])
  try {
    flatten(harness.plugin.component.render()).find(node => node?.tag === 'article').props.onClick()
    await flush()
    assert.ok(flatten(harness.plugin.component.render()).some(node => node?.tag === 'button' && node.props?.title === 'Copy session id'))
    await harness.remount()
    assert.ok(flatten(harness.plugin.component.render()).some(node => node?.tag === 'button' && node.props?.title === 'Copy session id'))
  } finally {
    harness.cleanup()
  }
})

test('the mutation mutex and bulk continuation stay bound to the originating mount', async () => {
  const active = session('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')
  const bulkConfirm = deferred()
  const harness = await mount([active], undefined, () => bulkConfirm.promise)
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Select mode').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'input' && node.props?.type === 'checkbox').props.onClick({ stopPropagation() {}, shiftKey: false })
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Archive 1').props.onClick()
    await flush()

    await harness.remount()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Resume session').props.onClick({ stopPropagation() {} })
    await flush()
    assert.equal(harness.calls.some(args => args[0] === 'check-dir'), false)
    assert.ok(harness.notifications.some(([message, level]) => message.includes('already running') && level === 'warn'))

    bulkConfirm.resolve(true)
    await flush()
    assert.equal(harness.calls.some(args => args[0] === 'archive'), false)
  } finally {
    harness.cleanup()
  }
})

test('unmount resets transcript, search, and picker loading flags before remount', async () => {
  const active = session('ffffffff-ffff-ffff-ffff-ffffffffffff')
  const transcript = deferred()
  const search = deferred()
  const picker = deferred()
  const harness = await mount([active], async args => {
    if (args[0] === 'read-session') return transcript.promise
    if (args[0] === 'search') return search.promise
    if (args[0] === 'list-dirs') return picker.promise
  })
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'article').props.onClick()
    nodes.find(node => node?.tag === 'input' && node.props?.id === 'cc-session-browser-search-input').props.onInput({ target: { value: 'needle' } })
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Run full-text search').props.onClick()
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Change tree root').props.onClick()
    await flush()
    assert.match(textOf(harness.plugin.component.render()), /Loading transcript/)
    assert.match(textOf(harness.plugin.component.render()), /Searching session text/)
    assert.match(textOf(harness.plugin.component.render()), /Loading directories/)

    await harness.remount()
    const rendered = textOf(harness.plugin.component.render())
    assert.doesNotMatch(rendered, /Loading transcript/)
    assert.doesNotMatch(rendered, /Searching session text/)
    assert.doesNotMatch(rendered, /Loading directories/)

    transcript.resolve({ code: 0, stdout: '[]', stderr: '' })
    search.resolve({ code: 0, stdout: '[]', stderr: '' })
    picker.resolve({ code: 0, stdout: JSON.stringify({ dirs: [] }), stderr: '' })
    await flush()
  } finally {
    harness.cleanup()
  }
})

test('a tree root change during build-index is not overwritten by that request', async () => {
  const build = deferred()
  const indexed = session('12121212-1212-1212-1212-121212121212', 'active', { rootPath: '/indexed' })
  const harness = await mount([], async args => {
    if (args[0] === 'build-index') return build.promise
  }, undefined, {
    storageGet: (key, fallback) => key === 'treeRoot' ? '/stored' : fallback(),
  })
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Change tree root').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    const input = nodes.find(node => node?.tag === 'input' && node.props?.class === 'ccm-picker-input')
    input.props.onInput({ target: { value: '/chosen' } })
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Use entered path').props.onClick()
    await flush()

    build.resolve({ code: 0, stdout: JSON.stringify([indexed]), stderr: '' })
    await flush()
    const root = flatten(harness.plugin.component.render()).find(node => node?.props?.class === 'ccm-browser-root-path')
    assert.equal(textOf(root), '/chosen')
  } finally {
    harness.cleanup()
  }
})

test('tree invalidation during stored-root loading clears the index loading flag', async () => {
  const storedRoot = deferred()
  const indexed = session('13131313-1313-1313-1313-131313131313', 'active', { rootPath: '/indexed' })
  const harness = await mount([indexed], undefined, undefined, {
    storageGet: (key, fallback) => key === 'treeRoot' ? storedRoot.promise : fallback(),
  })
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Change tree root').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'input' && node.props?.class === 'ccm-picker-input').props.onInput({ target: { value: '/chosen' } })
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Use entered path').props.onClick()
    await flush()

    storedRoot.resolve('/stored')
    await flush()
    const rendered = harness.plugin.component.render()
    assert.doesNotMatch(textOf(rendered), /Loading sessions/)
    assert.equal(textOf(flatten(rendered).find(node => node?.props?.class === 'ccm-browser-root-path')), '/chosen')
  } finally {
    harness.cleanup()
  }
})

test('an older root validation cannot overwrite a newer accepted picker root', async () => {
  const older = deferred()
  const newer = deferred()
  const harness = await mount([], async args => {
    if (args[0] === 'check-dir' && args[1] === '/older') return older.promise
    if (args[0] === 'check-dir' && args[1] === '/newer') return newer.promise
  })
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Change tree root').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    const input = nodes.find(node => node?.tag === 'input' && node.props?.class === 'ccm-picker-input')
    const usePath = () => flatten(harness.plugin.component.render()).find(node => node?.tag === 'button' && textOf(node) === 'Use entered path')
    input.props.onInput({ target: { value: '/older' } })
    usePath().props.onClick()
    input.props.onInput({ target: { value: '/newer' } })
    usePath().props.onClick()
    await flush()

    newer.resolve({ code: 0, stdout: JSON.stringify({ exists: true, dir: true }), stderr: '' })
    await flush()
    older.resolve({ code: 0, stdout: JSON.stringify({ exists: true, dir: true }), stderr: '' })
    await flush()
    const root = flatten(harness.plugin.component.render()).find(node => node?.props?.class === 'ccm-browser-root-path')
    assert.equal(textOf(root), '/newer')
  } finally {
    harness.cleanup()
  }
})
