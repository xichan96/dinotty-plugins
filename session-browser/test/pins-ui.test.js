const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')
const esbuild = require('esbuild')

const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-browser-pins-ui-'))
const uiBundlePath = path.join(bundleDir, 'ui.cjs')
const i18nBundlePath = path.join(bundleDir, 'i18n.cjs')
esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/ui.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: uiBundlePath,
  logLevel: 'silent',
})
esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/i18n.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: i18nBundlePath,
  logLevel: 'silent',
})
const { activate } = require(uiBundlePath)
const { dictionaries } = require(i18nBundlePath)
const CLI = process.env.CC_SB_TEST_CLI || path.resolve(__dirname, '../dist/cli')

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

function textOf(value) {
  return flatten(value).filter(item => typeof item === 'string').join('')
}

function hasClass(node, className) {
  const value = node?.props?.class
  return Array.isArray(value) ? value.includes(className) : String(value || '').split(/\s+/).includes(className)
}

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

async function flush(rounds = 4) {
  for (let index = 0; index < rounds; index++) await new Promise(resolve => setImmediate(resolve))
}

function session(id, rootPath, overrides = {}) {
  return {
    id,
    agent: 'claude-code',
    rootPath,
    attributionKey: rootPath.replaceAll('/', '-'),
    title: id,
    createdAt: '2026-07-10T00:00:00.000Z',
    lastActiveAt: '2026-07-10T01:00:00.000Z',
    messageCount: 1,
    partition: 'active',
    health: 'ok',
    timestampSource: 'event',
    sizeBytes: 1,
    ...overrides,
  }
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

async function mountPins(options = {}) {
  const previousDocument = global.document
  const previousMutationObserver = global.MutationObserver
  const previousRequestAnimationFrame = global.requestAnimationFrame
  const previousCancelAnimationFrame = global.cancelAnimationFrame
  const previousNavigator = Object.getOwnPropertyDescriptor(global, 'navigator')
  const mounted = []
  const unmounted = []
  const calls = []
  const notifications = []
  const storage = new Map([
    ['locale', options.locale || 'en'],
    ['activeAgent', 'claude-code'],
    ...(options.storageEntries || []),
  ])
  const sessionsByAgent = options.sessionsByAgent || {
    'claude-code': options.sessions || [session('default-a', '/work')],
    codex: [session('default-b', '/codex', { agent: 'codex' })],
  }
  const pinsByAgent = options.pinsByAgent || {
    'claude-code': [],
    codex: [],
  }
  const corruptAgents = new Set(options.corruptAgents || [])

  global.document = {
    documentElement: { lang: options.locale === 'zh' ? 'zh-TW' : 'en-US' },
    body: { classList: { add() {}, remove() {} } },
    addEventListener() {},
    removeEventListener() {},
    getElementById() { return null },
  }
  global.MutationObserver = class { observe() {} disconnect() {} }
  global.requestAnimationFrame = callback => setTimeout(callback, 0)
  global.cancelAnimationFrame = handle => clearTimeout(handle)
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText: async () => {} } },
  })

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
      get: async key => storage.get(key),
      set: async (key, value) => { storage.set(key, value) },
    },
    exec: {
      run: async args => {
        calls.push([...args])
        if (options.run) {
          const overridden = await options.run(args, { pinsByAgent, corruptAgents })
          if (overridden !== undefined) return overridden
        }
        if (args[0] === 'agents') return {
          code: 0,
          stdout: JSON.stringify([
            { id: 'claude-code', available: true, capabilities, resume: { argv: ['claude', '--resume'] } },
            { id: 'codex', available: true, capabilities, resume: { argv: ['codex', 'resume'] } },
          ]),
          stderr: '',
        }
        if (args[0] === 'build-index') {
          const agent = args[args.indexOf('--agent') + 1] || 'claude-code'
          return { code: 0, stdout: JSON.stringify(sessionsByAgent[agent] || []), stderr: '' }
        }
        if (args[0] === 'list-pins') {
          const agent = args[1]
          if (corruptAgents.has(agent)) return {
            code: 0,
            stdout: JSON.stringify({ pins: [], corrupt: true, sidecar: `/preserved/${agent}.json` }),
            stderr: '',
          }
          return { code: 0, stdout: JSON.stringify({ pins: pinsByAgent[agent] || [] }), stderr: '' }
        }
        if (args[0] === 'add-pin') {
          const [, agent, suppliedPath] = args
          const canonicalPath = `/canonical${suppliedPath}`
          const pins = pinsByAgent[agent] || (pinsByAgent[agent] = [])
          const duplicate = pins.some(pin => pin.path === canonicalPath)
          if (!duplicate) pins.unshift({ path: canonicalPath, addedAt: Date.now(), exists: true })
          return { code: 0, stdout: JSON.stringify({ canonicalPath, outcome: duplicate ? 'duplicate' : 'applied' }), stderr: '' }
        }
        if (args[0] === 'remove-pin') {
          const [, agent, ...requested] = args
          if (requested.includes('--reset-corrupt')) {
            corruptAgents.delete(agent)
            pinsByAgent[agent] = []
            return { code: 0, stdout: JSON.stringify({ results: [], changed: true }), stderr: '' }
          }
          const pins = pinsByAgent[agent] || []
          const remove = new Set(requested)
          const results = requested.map(pinPath => ({
            path: pinPath,
            outcome: pins.some(pin => pin.path === pinPath) ? 'applied' : 'absent',
          }))
          const next = pins.filter(pin => !remove.has(pin.path))
          pinsByAgent[agent] = next
          return { code: 0, stdout: JSON.stringify({ results, changed: next.length !== pins.length }), stderr: '' }
        }
        if (args[0] === 'move-pin') {
          const [, agent, pinPath, direction] = args
          const pins = pinsByAgent[agent] || []
          const index = pins.findIndex(pin => pin.path === pinPath)
          if (index >= 0) {
            const target = direction === 'up' ? Math.max(0, index - 1) : Math.min(pins.length - 1, index + 1)
            const [pin] = pins.splice(index, 1)
            pins.splice(target, 0, pin)
          }
          return { code: 0, stdout: JSON.stringify({ outcome: index >= 0 ? 'applied' : 'absent' }), stderr: '' }
        }
        if (args[0] === 'promote-pins') {
          const [, agent, ...requested] = args
          const pins = pinsByAgent[agent] || []
          const selected = new Set(requested)
          const promoted = pins.filter(pin => selected.has(pin.path)).sort((left, right) => left.path.localeCompare(right.path))
          pinsByAgent[agent] = [...promoted, ...pins.filter(pin => !selected.has(pin.path))]
          return { code: 0, stdout: JSON.stringify({ results: requested.map(pinPath => ({ path: pinPath, outcome: 'applied' })), changed: true }), stderr: '' }
        }
        if (args[0] === 'read-session') return { code: 0, stdout: '[]', stderr: '' }
        return { code: 0, stdout: JSON.stringify({ outcome: 'success', cacheRefreshed: true }), stderr: '' }
      },
    },
    ui: {
      notify: (...args) => notifications.push(args),
      confirm: async () => true,
    },
    terminal: { activePaneId: () => null },
  }

  const plugin = activate(ctx)
  plugin.component.setup()
  mounted[0]()
  await flush(8)

  return {
    plugin,
    calls,
    notifications,
    pinsByAgent,
    storage,
    render: () => plugin.component.render(),
    cleanup() {
      unmounted[0]()
      global.document = previousDocument
      global.MutationObserver = previousMutationObserver
      global.requestAnimationFrame = previousRequestAnimationFrame
      global.cancelAnimationFrame = previousCancelAnimationFrame
      if (previousNavigator) Object.defineProperty(global, 'navigator', previousNavigator)
      else delete global.navigator
    },
  }
}

function switchAgent(harness, agent) {
  const select = flatten(harness.render()).find(node => node?.tag === 'select' && node.props?.['aria-label'] === dictionaries.en['agent-switcher'])
  select.props.onChange({ target: { value: agent } })
}

test('pin rows use exact match-key metadata and activation sets exact scope with a pin-specific empty state', async () => {
  const pins = [
    { path: '/work', addedAt: 1, exists: true },
    { path: '/empty', addedAt: 2, exists: true },
    { path: '/Canonical/É', addedAt: 3, exists: true, matchKeys: ['/symlink/é'] },
  ]
  const harness = await mountPins({
    sessions: [
      session('exact-session', '/work'),
      session('descendant-session', '/work/child'),
      session('matched-alias-session', '/SYMLINK/E\u0301'),
    ],
    pinsByAgent: { 'claude-code': pins, codex: [] },
  })
  try {
    let nodes = flatten(harness.render())
    const workRow = nodes.find(node => node?.tag === 'button' && hasClass(node, 'ccm-browser-pin-row') && node.props.title === '/work')
    const aliasRow = nodes.find(node => node?.tag === 'button' && hasClass(node, 'ccm-browser-pin-row') && node.props.title === '/Canonical/É')
    assert.match(textOf(workRow), /1 session/)
    assert.doesNotMatch(textOf(workRow), /2 sessions/)
    assert.match(textOf(aliasRow), /1 session/)

    workRow.props.onClick()
    nodes = flatten(harness.render())
    assert.match(textOf(nodes.find(node => hasClass(node, 'ccm-browser-scope-summary'))), /Exact directory.*\/work/)
    const cards = nodes.filter(node => node?.tag === 'article').map(textOf).join('\n')
    assert.match(cards, /exact-session/)
    assert.doesNotMatch(cards, /descendant-session/)

    nodes.find(node => node?.tag === 'button' && hasClass(node, 'ccm-browser-pin-row') && node.props.title === '/empty').props.onClick()
    const rendered = textOf(harness.render())
    assert.match(rendered, /This pinned folder has no sessions for this view\./)
    assert.doesNotMatch(rendered, /No Active sessions match these filters\./)
  } finally {
    harness.cleanup()
  }
})

test('pins edit mode and selection remain isolated from session select mode and members', async () => {
  const harness = await mountPins({
    pinsByAgent: { 'claude-code': [{ path: '/pinned', addedAt: 1, exists: true }], codex: [] },
  })
  try {
    let nodes = flatten(harness.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Edit pinned folders').props.onClick()
    nodes = flatten(harness.render())
    assert.equal(nodes.filter(node => node?.tag === 'input' && node.props?.type === 'checkbox').length, 1)
    assert.equal(nodes.find(node => node?.tag === 'button' && node.props?.title === 'Select mode').props['aria-pressed'], false)

    const pinCheckbox = nodes.find(node => node?.tag === 'input' && node.props?.['aria-label'] === 'Select pinned')
    pinCheckbox.props.onClick({ stopPropagation() {}, shiftKey: false })
    nodes = flatten(harness.render())
    assert.match(textOf(nodes.find(node => hasClass(node, 'ccm-browser-pin-select-bar'))), /1 selected/)
    assert.equal(nodes.some(node => node?.tag === 'button' && textOf(node) === 'Export 1'), false)

    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Select mode').props.onClick()
    nodes = flatten(harness.render())
    const sessionCheckbox = nodes.find(node => node?.tag === 'input'
      && node.props?.type === 'checkbox'
      && node.props?.['aria-label'] !== 'Select pinned')
    assert.ok(sessionCheckbox)
    assert.equal(nodes.find(node => node?.tag === 'input' && node.props?.['aria-label'] === 'Select pinned').props.checked, true)
    assert.equal(sessionCheckbox.props.checked, false)
    sessionCheckbox.props.onClick({ stopPropagation() {}, shiftKey: false })
    nodes = flatten(harness.render())
    assert.equal(nodes.find(node => node?.tag === 'input' && node.props?.['aria-label'] === 'Select pinned').props.checked, true)
    assert.equal(nodes.find(node => node?.tag === 'input'
      && node.props?.type === 'checkbox'
      && node.props?.['aria-label'] !== 'Select pinned').props.checked, true)
  } finally {
    harness.cleanup()
  }
})

test('pin mutation queue serializes two rapid up gestures into two ordered moves', async () => {
  const paths = ['/a', '/b', '/c', '/d']
  const harness = await mountPins({
    pinsByAgent: { 'claude-code': paths.map((pinPath, index) => ({ path: pinPath, addedAt: index + 1, exists: true })), codex: [] },
  })
  try {
    let nodes = flatten(harness.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Edit pinned folders').props.onClick()
    nodes = flatten(harness.render())
    const moveUp = nodes.find(node => node?.tag === 'button' && node.props?.title === 'Move d up')
    const callStart = harness.calls.length
    moveUp.props.onClick()
    moveUp.props.onClick()
    await flush(10)

    const mutationCalls = harness.calls.slice(callStart).filter(args => args[0] === 'move-pin' || args[0] === 'list-pins')
    assert.deepEqual(mutationCalls.map(args => args[0]), ['move-pin', 'list-pins', 'move-pin', 'list-pins'])
    const order = flatten(harness.render())
      .filter(node => hasClass(node, 'ccm-browser-pin-row-edit'))
      .map(node => node.props.title)
    assert.deepEqual(order, ['/a', '/d', '/b', '/c'])
  } finally {
    harness.cleanup()
  }
})

test('agent generations discard stale list and add completions, then switch-back reload reconciles the add', async () => {
  const slowList = deferred()
  const slowAdd = deferred()
  let deferNextAList = false
  let deferAdd = false
  const pinsByAgent = {
    'claude-code': [],
    codex: [{ path: '/codex-pin', addedAt: 1, exists: true }],
  }
  const harness = await mountPins({
    pinsByAgent,
    run: async (args, state) => {
      if (args[0] === 'list-pins' && args[1] === 'claude-code' && deferNextAList) {
        deferNextAList = false
        return slowList.promise
      }
      if (args[0] === 'add-pin' && args[1] === 'claude-code' && deferAdd) {
        const response = await slowAdd.promise
        state.pinsByAgent['claude-code'] = [{ path: response.canonicalPath, addedAt: 2, exists: true }]
        return { code: 0, stdout: JSON.stringify(response), stderr: '' }
      }
    },
  })
  try {
    switchAgent(harness, 'codex')
    await flush(6)
    deferNextAList = true
    switchAgent(harness, 'claude-code')
    await flush(3)
    switchAgent(harness, 'codex')
    await flush(4)
    slowList.resolve({ code: 0, stdout: JSON.stringify({ pins: [{ path: '/stale-list-pin', addedAt: 3, exists: true }] }), stderr: '' })
    await flush(6)
    assert.doesNotMatch(textOf(harness.render()), /stale-list-pin/)
    assert.match(textOf(harness.render()), /codex-pin/)

    switchAgent(harness, 'claude-code')
    await flush(6)
    deferAdd = true
    let nodes = flatten(harness.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Pin selected folder').props.onClick()
    await flush(2)
    switchAgent(harness, 'codex')
    await flush(5)
    slowAdd.resolve({ canonicalPath: '/canonical-added-for-a', outcome: 'applied' })
    await flush(6)
    assert.doesNotMatch(textOf(harness.render()), /canonical-added-for-a/)
    assert.match(textOf(harness.render()), /codex-pin/)

    switchAgent(harness, 'claude-code')
    await flush(8)
    assert.match(textOf(harness.render()), /canonical-added-for-a/)
  } finally {
    harness.cleanup()
  }
})

test('collapsing pinned folders hides rows, selection, arrows, and both edit toolbars', async () => {
  const harness = await mountPins({
    pinsByAgent: { 'claude-code': [{ path: '/pinned', addedAt: 1, exists: true }], codex: [] },
  })
  try {
    let nodes = flatten(harness.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Edit pinned folders').props.onClick()
    nodes = flatten(harness.render())
    nodes.find(node => node?.tag === 'input' && node.props?.['aria-label'] === 'Select pinned').props.onClick({ stopPropagation() {}, shiftKey: false })
    nodes = flatten(harness.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Collapse pinned folders').props.onClick()
    await flush()

    const section = flatten(harness.render()).find(node => node?.tag === 'section' && hasClass(node, 'ccm-browser-pins-section'))
    const sectionNodes = flatten(section)
    assert.equal(sectionNodes.some(node => hasClass(node, 'ccm-browser-pin-row')), false)
    assert.equal(sectionNodes.some(node => node?.tag === 'input'), false)
    assert.equal(sectionNodes.some(node => hasClass(node, 'ccm-browser-pin-move')), false)
    assert.equal(sectionNodes.some(node => hasClass(node, 'ccm-browser-pin-select-bar')), false)
    assert.equal(sectionNodes.some(node => hasClass(node, 'ccm-browser-pin-toolbar')), false)
    assert.deepEqual(sectionNodes.filter(node => node?.tag === 'button').map(node => node.props.title), ['Expand pinned folders'])
    assert.equal(harness.storage.get('pinsCollapsed'), true)
  } finally {
    harness.cleanup()
  }
})

test('corrupt pin banner exposes a reset action that restores the onboarding state', async () => {
  const harness = await mountPins({ corruptAgents: ['claude-code'] })
  try {
    let rendered = textOf(harness.render())
    assert.match(rendered, /previous list was preserved at \/preserved\/claude-code\.json/)
    assert.doesNotMatch(rendered, /Pin a selected folder/)
    const reset = flatten(harness.render()).find(node => node?.tag === 'button' && textOf(node) === 'Reset pinned folders')
    reset.props.onClick()
    await flush(8)

    rendered = textOf(harness.render())
    assert.match(rendered, /Pin a selected folder to keep it close at hand\./)
    assert.doesNotMatch(rendered, /previous list was preserved/)
    assert.ok(harness.calls.some(args => args[0] === 'remove-pin' && args[1] === 'claude-code' && args.includes('--reset-corrupt')))
  } finally {
    harness.cleanup()
  }
})

test('corrupt reset reloads a list repaired by another window instead of replacing it with onboarding', async () => {
  const harness = await mountPins({
    corruptAgents: ['claude-code'],
    run: async (args, state) => {
      if (args[0] !== 'remove-pin' || !args.includes('--reset-corrupt')) return undefined
      state.corruptAgents.delete('claude-code')
      state.pinsByAgent['claude-code'] = [{ path: '/repaired-pin', addedAt: 4, exists: true }]
      return { code: 0, stdout: JSON.stringify({ results: [], changed: false }), stderr: '' }
    },
  })
  try {
    const reset = flatten(harness.render()).find(node => node?.tag === 'button' && textOf(node) === 'Reset pinned folders')
    reset.props.onClick()
    await flush(8)

    const rendered = textOf(harness.render())
    assert.match(rendered, /repaired-pin/)
    assert.doesNotMatch(rendered, /Pin a selected folder to keep it close at hand\./)
    assert.doesNotMatch(rendered, /previous list was preserved/)
  } finally {
    harness.cleanup()
  }
})

test('every rendered pin key is localized in English and Chinese with complete dictionaries', async () => {
  const uiSource = fs.readFileSync(path.resolve(__dirname, '../src/ui.ts'), 'utf8')
  const usedKeys = [...new Set([...uiSource.matchAll(/t\(\s*['"](pin-[^'"]+|pinned-folders)['"]/g)].map(match => match[1]))]
  assert.ok(usedKeys.length > 0)
  for (const key of usedKeys) {
    assert.equal(typeof dictionaries.en[key], 'string', key)
    assert.equal(typeof dictionaries.zh[key], 'string', key)
  }

  for (const locale of ['en', 'zh']) {
    const harness = await mountPins({
      locale,
      pinsByAgent: { 'claude-code': [{ path: '/pinned', addedAt: 1, exists: false }], codex: [] },
    })
    try {
      let nodes = flatten(harness.render())
      nodes.find(node => node?.tag === 'button' && node.props?.title === dictionaries[locale]['pin-edit-mode']).props.onClick()
      nodes = flatten(harness.render())
      const renderedStrings = nodes.flatMap(node => {
        if (typeof node === 'string') return [node]
        return ['title', 'aria-label', 'placeholder']
          .map(key => node?.props?.[key])
          .filter(value => typeof value === 'string')
      }).join('\n')
      assert.doesNotMatch(renderedStrings, /\bpin-[a-z][a-z-]*\b/, locale)
    } finally {
      harness.cleanup()
    }
  }
})

test('a symlink-added pin still matches sessions after a cold load from list-pins output', async () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'session-browser-pins-ui-cold-'))
  const target = path.join(fixture, 'target')
  const link = path.join(fixture, 'link')
  fs.mkdirSync(target)
  fs.symlinkSync(target, link, 'dir')
  const cliEnv = {
    ...process.env,
    HOME: path.join(fixture, 'home'),
    CC_SB_PROJECTS_DIR: path.join(fixture, 'projects'),
    CC_SB_ARCHIVE_DIR: path.join(fixture, 'projects-archive'),
    CC_SB_SESSIONS_DIR: path.join(fixture, 'sessions'),
    CC_SB_DATA_DIR: path.join(fixture, 'data'),
  }
  const runCli = args => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: cliEnv })

  try {
    const added = runCli(['add-pin', 'claude-code', link])
    assert.equal(added.status, 0, added.stderr)
    const canonicalPath = JSON.parse(added.stdout).canonicalPath
    const listed = runCli(['list-pins', 'claude-code'])
    assert.equal(listed.status, 0, listed.stderr)

    const harness = await mountPins({
      sessions: [session('symlink-session', link)],
      pinsByAgent: { 'claude-code': [], codex: [] },
      run: async args => args[0] === 'list-pins' && args[1] === 'claude-code'
        ? { code: 0, stdout: listed.stdout, stderr: '' }
        : undefined,
    })
    try {
      const pinRow = flatten(harness.render()).find(node => node?.tag === 'button'
        && hasClass(node, 'ccm-browser-pin-row')
        && node.props.title === canonicalPath)
      assert.ok(pinRow)
      assert.match(textOf(pinRow), /1 session/)
      assert.equal(harness.calls.some(args => args[0] === 'add-pin'), false)
    } finally {
      harness.cleanup()
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})
