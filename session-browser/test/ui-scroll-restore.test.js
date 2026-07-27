const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const esbuild = require('esbuild')

const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-browser-ui-scroll-restore-'))
const bundlePath = path.join(bundleDir, 'ui.cjs')
esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/ui.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: bundlePath,
  logLevel: 'silent',
})
const { activate } = require(bundlePath)

test.after(() => fs.rmSync(bundleDir, { recursive: true, force: true }))

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

async function flushAsync(rounds = 8) {
  for (let index = 0; index < rounds; index++) await new Promise(resolve => setImmediate(resolve))
}

function createFrameController() {
  let nextHandle = 1
  const callbacks = new Map()
  return {
    request(callback) {
      const handle = nextHandle++
      callbacks.set(handle, callback)
      return handle
    },
    cancel(handle) {
      callbacks.delete(handle)
    },
    flushFrame() {
      const frame = [...callbacks.entries()]
      callbacks.clear()
      for (const [, callback] of frame) callback()
      return frame.length
    },
    flushAll(limit = 100) {
      let frames = 0
      while (callbacks.size > 0) {
        assert.ok(frames < limit, 'requestAnimationFrame queue did not settle')
        this.flushFrame()
        frames++
      }
      return frames
    },
    get size() {
      return callbacks.size
    },
  }
}

function createWatchController() {
  const watchers = new Set()
  return {
    watch(getter, callback) {
      const watcher = { getter, callback, value: getter() }
      watchers.add(watcher)
      return () => watchers.delete(watcher)
    },
    flush() {
      for (const watcher of [...watchers]) {
        const next = watcher.getter()
        if (Object.is(next, watcher.value)) continue
        const previous = watcher.value
        watcher.value = next
        watcher.callback(next, previous)
      }
    },
  }
}

function createScrollBody({ scrollHeight = 1000, clientHeight = 300, scrollTop = 0, top = 100, anchors = [] } = {}) {
  const listeners = new Map()
  let currentScrollTop = scrollTop
  let anchorModels = anchors
  const writes = []
  const body = {
    scrollHeight,
    clientHeight,
    writes,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(listener)
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener)
    },
    dispatch(type, event = {}) {
      for (const listener of [...(listeners.get(type) || [])]) {
        listener({ type, target: body, currentTarget: body, ...event })
      }
    },
    getBoundingClientRect() {
      return {
        top,
        bottom: top + body.clientHeight,
        left: 0,
        right: 800,
        width: 800,
        height: body.clientHeight,
      }
    },
    querySelectorAll(selector) {
      return selector === '[data-transcript-id]' ? anchorModels.map(model => model.element) : []
    },
    querySelector(selector) {
      const idMatch = selector.match(/^\[data-transcript-id="(.*)"\]$/)
      if (idMatch) {
        const id = idMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
        return anchorModels.find(model => model.id === id)?.element || null
      }
      const indexMatch = selector.match(/^\[data-transcript-index="(\d+)"\]$/)
      if (indexMatch) return anchorModels.find(model => String(model.index) === indexMatch[1])?.element || null
      return null
    },
    scrollTo(options) {
      body.scrollTop = Number(options.top) || 0
    },
    setRawScrollTop(value) {
      currentScrollTop = value
    },
    clearWrites() {
      writes.length = 0
    },
    setAnchors(nextAnchors) {
      anchorModels = nextAnchors
      attachAnchorElements()
    },
    get anchors() {
      return anchorModels
    },
  }

  Object.defineProperty(body, 'scrollTop', {
    configurable: true,
    enumerable: true,
    get() {
      return currentScrollTop
    },
    set(value) {
      const next = Number(value)
      const changed = next !== currentScrollTop
      currentScrollTop = next
      writes.push(next)
      if (changed) body.dispatch('scroll')
    },
  })

  function attachAnchorElements() {
    anchorModels.forEach((model, index) => {
      if (model.index === undefined) model.index = index
      model.element = {
        getAttribute(name) {
          if (name === 'data-transcript-id') return model.id
          if (name === 'data-transcript-index') return String(model.index)
          return null
        },
        getBoundingClientRect() {
          const anchorTop = top + model.contentTop - currentScrollTop
          return {
            top: anchorTop,
            bottom: anchorTop + model.height,
            left: 0,
            right: 800,
            width: 800,
            height: model.height,
          }
        },
        scrollIntoView() {
          body.scrollTop = model.contentTop
        },
      }
    })
  }

  attachAnchorElements()
  return body
}

const capabilities = {
  archive: true,
  rename: false,
  delete: true,
  deleteRequiresArchived: true,
  nativeIndex: false,
  tokenStats: false,
  originFilter: false,
}

function indexedSession(id = '11111111-1111-1111-1111-111111111111') {
  return {
    id,
    agent: 'claude-code',
    rootPath: '/work',
    attributionKey: '-work',
    title: 'Scroll restore session',
    createdAt: '2026-07-10T00:00:00.000Z',
    lastActiveAt: '2026-07-10T01:00:00.000Z',
    messageCount: 120,
    partition: 'active',
    health: 'ok',
    timestampSource: 'event',
    sizeBytes: 1,
  }
}

function transcriptMessages(count, emptyIds = false) {
  return Array.from({ length: count }, (_, index) => ({
    uuid: emptyIds ? '' : `message-${index}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `message ${index}`,
    timestamp: '2026-07-10T01:00:00.000Z',
  }))
}

async function createHarness({
  messages = transcriptMessages(3),
  session = indexedSession(),
  sessions = [session],
  messagesBySession = {},
} = {}) {
  const previous = {
    document: global.document,
    MutationObserver: global.MutationObserver,
    ResizeObserver: global.ResizeObserver,
    requestAnimationFrame: global.requestAnimationFrame,
    cancelAnimationFrame: global.cancelAnimationFrame,
    navigator: Object.getOwnPropertyDescriptor(global, 'navigator'),
  }
  const frames = createFrameController()
  const watches = createWatchController()
  const mounted = []
  const unmounted = []
  const resizeObservers = []
  const panes = []

  global.document = {
    documentElement: { lang: 'en-US' },
    body: { classList: { add() {}, remove() {} } },
    getElementById() { return null },
    addEventListener() {},
    removeEventListener() {},
  }
  global.MutationObserver = class {
    observe() {}
    disconnect() {}
  }
  global.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback
      this.targets = new Set()
      resizeObservers.push(this)
    }
    observe(target) {
      this.targets.add(target)
    }
    disconnect() {
      this.targets.clear()
    }
    trigger() {
      this.callback()
    }
  }
  global.requestAnimationFrame = callback => frames.request(callback)
  global.cancelAnimationFrame = handle => frames.cancel(handle)
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText: async () => {} } },
  })

  const storage = new Map([
    ['locale', 'en'],
    ['activeAgent', 'claude-code'],
  ])
  const ctx = {
    h,
    ref: value => ({ value }),
    computed: getter => ({ get value() { return getter() } }),
    watch: (getter, callback) => watches.watch(getter, callback),
    onMounted: callback => mounted.push(callback),
    onUnmounted: callback => unmounted.push(callback),
    open() {},
    commands: { register: () => ({ dispose() {} }) },
    storage: {
      get: async key => storage.get(key),
      set: async (key, value) => { storage.set(key, value) },
    },
    exec: {
      run: async args => {
        if (args[0] === 'agents') {
          return {
            code: 0,
            stdout: JSON.stringify([{
              id: 'claude-code',
              available: true,
              capabilities,
              resume: { argv: ['claude', '--resume'] },
            }]),
            stderr: '',
          }
        }
        if (args[0] === 'build-index') return { code: 0, stdout: JSON.stringify(sessions), stderr: '' }
        if (args[0] === 'list-pins') return { code: 0, stdout: JSON.stringify({ pins: [] }), stderr: '' }
        if (args[0] === 'read-session') {
          return { code: 0, stdout: JSON.stringify(messagesBySession[args[2]] ?? messages), stderr: '' }
        }
        return { code: 0, stdout: JSON.stringify({ outcome: 'success', cacheRefreshed: true }), stderr: '' }
      },
    },
    ui: {
      notify() {},
      confirm: async () => true,
    },
    terminal: { activePaneId: () => null },
  }

  const plugin = activate(ctx)

  function setupPane(id) {
    const props = { paneId: id, workspaceId: `workspace-${id}`, isVisible: true, isFocused: true }
    const mountedIndex = mounted.length
    const unmountedIndex = unmounted.length
    const render = plugin.component.setup(props)
    const mountCallbacks = mounted.slice(mountedIndex)
    const unmountCallbacks = unmounted.slice(unmountedIndex)
    let active = false
    const pane = {
      props,
      render,
      mount() {
        if (active) return
        active = true
        for (const callback of mountCallbacks) callback()
      },
      unmount() {
        if (!active) return
        active = false
        for (const callback of unmountCallbacks) callback()
      },
      setVisible(value) {
        props.isVisible = value
        watches.flush()
      },
      sessionCard() {
        return flatten(render()).find(
          node => node?.tag === 'article'
            && Array.isArray(node.props?.class)
            && node.props.class.includes('ccm-browser-session-card'),
        )
      },
      sessionCardFor(sessionId) {
        return flatten(render()).find(
          node => node?.tag === 'article'
            && Array.isArray(node.props?.class)
            && node.props.class.includes('ccm-browser-session-card')
            && node.props?.key?.endsWith(`\0${sessionId}`),
        )
      },
      transcriptBodyNode() {
        return flatten(render()).find(
          node => node?.tag === 'div'
            && Array.isArray(node.props?.class)
            && node.props.class.includes('ccm-browser-transcript-body'),
        )
      },
      jumpPillNode() {
        return flatten(render()).find(
          node => node?.tag === 'button' && node.props?.class === 'ccm-jump-pill',
        )
      },
    }
    panes.push(pane)
    pane.mount()
    return pane
  }

  async function preparePane(pane, body) {
    await flushAsync()
    const card = pane.sessionCard()
    assert.ok(card, 'session card did not render')
    card.props.onClick()
    await flushAsync()
    const bodyNode = pane.transcriptBodyNode()
    assert.ok(bodyNode, 'transcript body did not render')
    bodyNode.props.ref(body)
    frames.flushAll()
    body.clearWrites()
    return flatten(pane.render()).filter(node => node?.tag === 'article' && node.props?.['data-transcript-index'] !== undefined)
  }

  return {
    frames,
    watches,
    plugin,
    setupPane,
    preparePane,
    resizeObserverFor(target) {
      const observer = resizeObservers.find(candidate => candidate.targets.has(target))
      assert.ok(observer, 'ResizeObserver for target was not registered')
      return observer
    },
    cleanup() {
      for (const pane of panes) pane.unmount()
      plugin.dispose()
      global.document = previous.document
      global.MutationObserver = previous.MutationObserver
      global.ResizeObserver = previous.ResizeObserver
      global.requestAnimationFrame = previous.requestAnimationFrame
      global.cancelAnimationFrame = previous.cancelAnimationFrame
      if (previous.navigator) Object.defineProperty(global, 'navigator', previous.navigator)
      else delete global.navigator
    },
  }
}

function captureUserScroll(harness, body, scrollTop) {
  body.dispatch('wheel')
  body.scrollTop = scrollTop
  harness.frames.flushAll()
  body.clearWrites()
}

test('bottom-stuck transcript restores against the changed hidden height', async () => {
  const harness = await createHarness()
  const pane = harness.setupPane('pane-a')
  const body = createScrollBody({ scrollHeight: 1000, clientHeight: 300 })
  try {
    await harness.preparePane(pane, body)
    captureUserScroll(harness, body, 700)

    pane.setVisible(false)
    body.scrollHeight = 1400
    pane.setVisible(true)
    harness.frames.flushAll()

    assert.equal(body.scrollTop, 1100)
  } finally {
    harness.cleanup()
  }
})

test('mid-list restore uses the composite transcript id and preserves the saved anchor offset', async () => {
  const session = indexedSession()
  const id0 = `${session.id}-0`
  const id1 = `${session.id}-1`
  const first = { id: id0, contentTop: 0, height: 200 }
  const second = { id: id1, contentTop: 400, height: 220 }
  const harness = await createHarness({ messages: transcriptMessages(3, true), session })
  const pane = harness.setupPane('pane-a')
  const body = createScrollBody({ anchors: [first, second] })
  try {
    const renderedMessages = await harness.preparePane(pane, body)
    assert.equal(renderedMessages[0].props['data-transcript-id'], id0)
    assert.equal(renderedMessages[1].props['data-transcript-id'], id1)
    assert.equal(renderedMessages[1].props['data-transcript-index'], '1')
    captureUserScroll(harness, body, 450)

    pane.setVisible(false)
    second.contentTop = 650
    pane.setVisible(true)
    harness.frames.flushAll()

    assert.equal(body.scrollTop, 700)
  } finally {
    harness.cleanup()
  }
})

test('settled restore waits for transcript and minimap frames plus one additional frame', async () => {
  const messages = transcriptMessages(300)
  const anchor = { id: 'message-1', contentTop: 400, height: 220 }
  const harness = await createHarness({ messages })
  const pane = harness.setupPane('pane-a')
  const body = createScrollBody({ anchors: [anchor] })
  try {
    await harness.preparePane(pane, body)
    // Opening a transcript clears the saved position by design, so the user scroll has to come
    // after the re-open. One frame lets the transcript's initial scroll-to-top run; the wheel
    // then releases suppression so the user's own scroll is what gets saved, while the
    // remaining render batches stay queued for the restore to wait on.
    pane.sessionCard().props.onClick()
    await flushAsync()
    harness.frames.flushFrame()
    body.dispatch('wheel')
    body.scrollTop = 450
    harness.frames.flushFrame()
    body.clearWrites()

    pane.setVisible(false)
    harness.resizeObserverFor(body).trigger()
    anchor.contentTop = 650
    pane.setVisible(true)
    assert.deepEqual(body.writes, [700])

    const writesPerFrame = []
    for (let index = 0; index < 8; index++) {
      harness.frames.flushFrame()
      writesPerFrame.push(body.writes.filter(value => value === 700).length)
    }
    // Four frames of pending render batches, then the one extra frame, then the settled
    // re-apply. The leading 1s are the point: the restore must not re-apply while work is
    // still queued.
    assert.deepEqual(writesPerFrame, [1, 1, 1, 1, 2, 2, 2, 2])
    harness.frames.flushAll()
  } finally {
    harness.cleanup()
  }
})

test('wheel cancellation releases suppression so the next user scroll saves a new anchor', async () => {
  const oldAnchor = { id: 'message-0', contentTop: 300, height: 200 }
  const newAnchor = { id: 'message-1', contentTop: 700, height: 200 }
  const harness = await createHarness()
  const pane = harness.setupPane('pane-a')
  const body = createScrollBody({ scrollHeight: 1200, anchors: [oldAnchor, newAnchor] })
  try {
    await harness.preparePane(pane, body)
    captureUserScroll(harness, body, 320)

    pane.setVisible(false)
    oldAnchor.contentTop = 500
    pane.setVisible(true)
    assert.equal(body.scrollTop, 520)

    body.dispatch('wheel')
    body.scrollTop = 720
    harness.frames.flushAll()

    pane.setVisible(false)
    newAnchor.contentTop = 900
    pane.setVisible(true)
    harness.frames.flushAll()

    assert.equal(body.scrollTop, 920)
  } finally {
    harness.cleanup()
  }
})

test('the plugin restore scroll event does not overwrite the previously saved anchor', async () => {
  const decoy = { id: 'message-1', contentTop: 0, height: 100 }
  const saved = { id: 'message-0', contentTop: 300, height: 200 }
  const harness = await createHarness()
  const pane = harness.setupPane('pane-a')
  const body = createScrollBody({ scrollHeight: 1200, anchors: [decoy, saved] })
  try {
    await harness.preparePane(pane, body)
    captureUserScroll(harness, body, 300)

    pane.setVisible(false)
    decoy.contentTop = 510
    saved.contentTop = 500
    pane.setVisible(true)
    harness.frames.flushAll()
    assert.equal(body.scrollTop, 500)

    pane.setVisible(false)
    decoy.contentTop = 900
    saved.contentTop = 800
    pane.setVisible(true)
    harness.frames.flushAll()

    assert.equal(body.scrollTop, 800)
  } finally {
    harness.cleanup()
  }
})

test('a missing saved anchor abandons restoration without changing scrollTop', async () => {
  const anchor = { id: 'message-0', contentTop: 300, height: 200 }
  const harness = await createHarness()
  const pane = harness.setupPane('pane-a')
  const body = createScrollBody({ anchors: [anchor] })
  try {
    await harness.preparePane(pane, body)
    captureUserScroll(harness, body, 320)

    pane.setVisible(false)
    body.setAnchors([])
    body.clearWrites()
    pane.setVisible(true)
    harness.frames.flushAll()

    assert.equal(body.scrollTop, 320)
    assert.deepEqual(body.writes, [])
  } finally {
    harness.cleanup()
  }
})

test('two mounts hide, reveal, and restore their transcript positions independently', async () => {
  const anchorA = { id: 'message-0', contentTop: 300, height: 200 }
  const anchorB = { id: 'message-1', contentTop: 500, height: 200 }
  const harness = await createHarness()
  const paneA = harness.setupPane('pane-a')
  const paneB = harness.setupPane('pane-b')
  const bodyA = createScrollBody({ scrollHeight: 1000, clientHeight: 300, anchors: [anchorA] })
  const bodyB = createScrollBody({ scrollHeight: 1200, clientHeight: 300, anchors: [anchorB] })
  try {
    await harness.preparePane(paneA, bodyA)
    await harness.preparePane(paneB, bodyB)
    captureUserScroll(harness, bodyA, 700)
    captureUserScroll(harness, bodyB, 520)

    paneA.setVisible(false)
    paneB.setVisible(false)
    bodyA.scrollHeight = 1500
    anchorB.contentTop = 800
    paneA.setVisible(true)
    paneB.setVisible(true)
    harness.frames.flushAll()

    assert.equal(bodyA.scrollTop, 1200)
    assert.equal(bodyB.scrollTop, 820)
  } finally {
    harness.cleanup()
  }
})

test('a programmatic jump to the bottom survives a tab switch', async () => {
  const middleAnchor = { id: 'message-1', contentTop: 400, height: 200 }
  const harness = await createHarness()
  const pane = harness.setupPane('pane-a')
  const body = createScrollBody({
    scrollHeight: 1000,
    clientHeight: 300,
    anchors: [middleAnchor],
  })
  try {
    await harness.preparePane(pane, body)
    captureUserScroll(harness, body, 450)

    const jumpPill = pane.jumpPillNode()
    assert.ok(jumpPill, 'jump-to-bottom control did not render')
    jumpPill.props.onClick()
    harness.frames.flushAll()
    assert.equal(body.scrollTop, 700)

    pane.setVisible(false)
    body.scrollHeight = 1400
    pane.setVisible(true)
    harness.frames.flushAll()

    assert.equal(body.scrollTop, 1100)
  } finally {
    harness.cleanup()
  }
})

test('a jump to the bottom interrupted by a tab switch still restores the bottom', async () => {
  const middleAnchor = { id: 'message-1', contentTop: 400, height: 200 }
  const harness = await createHarness()
  const pane = harness.setupPane('pane-a')
  const body = createScrollBody({
    scrollHeight: 1000,
    clientHeight: 300,
    anchors: [middleAnchor],
  })
  try {
    await harness.preparePane(pane, body)
    captureUserScroll(harness, body, 450)

    const jumpPill = pane.jumpPillNode()
    assert.ok(jumpPill, 'jump-to-bottom control did not render')
    jumpPill.props.onClick()
    assert.equal(body.scrollTop, 700)

    pane.setVisible(false)
    body.scrollHeight = 1400
    pane.setVisible(true)
    harness.frames.flushAll()

    assert.equal(body.scrollTop, 1100)
  } finally {
    harness.cleanup()
  }
})

test('restore state does not leak from one transcript to the next', async () => {
  const sessionA = { ...indexedSession('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), title: 'Transcript A' }
  const sessionB = { ...indexedSession('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), title: 'Transcript B' }
  const harness = await createHarness({
    sessions: [sessionA, sessionB],
    messagesBySession: {
      [sessionA.id]: [{ ...transcriptMessages(1)[0], content: 'transcript A content' }],
      [sessionB.id]: [{ ...transcriptMessages(1)[0], content: 'transcript B content' }],
    },
  })
  const pane = harness.setupPane('pane-a')
  const body = createScrollBody({ scrollHeight: 1000, clientHeight: 300 })
  try {
    await harness.preparePane(pane, body)
    captureUserScroll(harness, body, 700)

    const secondCard = pane.sessionCardFor(sessionB.id)
    assert.ok(secondCard, 'second session card did not render')
    secondCard.props.onClick()
    await flushAsync()
    assert.ok(flatten(pane.render()).includes('transcript B content'))

    harness.frames.flushFrame()
    assert.equal(body.scrollTop, 0)
    body.clearWrites()

    pane.setVisible(false)
    pane.setVisible(true)
    harness.frames.flushAll()

    assert.equal(body.scrollTop, 0)
  } finally {
    harness.cleanup()
  }
})
