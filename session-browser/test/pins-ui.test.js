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

function findPinRow(rendered, pinPath) {
  return flatten(rendered).find(node => hasClass(node, 'ccm-browser-pin-row') && node.props.title === pinPath)
}

function findPinReveal(rendered) {
  const revealTitle = dictionaries.en['pin-reveal-in-tree']
  const reveals = flatten(rendered).filter(node => node?.tag === 'button' && node.props?.title === revealTitle)
  assert.equal(reveals.length, 1, 'pin reveal action is not a single header control')
  const header = flatten(rendered).find(node => hasClass(node, 'ccm-browser-pins-header'))
  const controls = flatten(header).find(node => hasClass(node, 'ccm-browser-pins-controls'))
  assert.equal(flatten(controls).includes(reveals[0]), true, 'pin reveal action is not in the pins header control group')
  return reveals[0]
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

test('pins are rendered as a sibling above the independently flexing tree pane main', async () => {
  const harness = await mountPins()
  try {
    const treePane = flatten(harness.render()).find(node => node?.tag === 'aside' && hasClass(node, 'ccm-browser-tree-pane'))
    const children = treePane.children.flat()
    assert.equal(hasClass(children[0], 'ccm-browser-pins-section'), true, 'pins section is not the first tree-pane child')
    assert.equal(hasClass(children[1], 'ccm-browser-tree-pane-main'), true, 'tree pane content is not wrapped after pins')
    assert.equal(flatten(children[1]).some(node => hasClass(node, 'ccm-browser-pins-section')), false,
      'pins section is still nested in the tree pane main')
  } finally {
    harness.cleanup()
  }
})

test('activatePin preserves the visible tree root while selecting the exact pin and marking it active', async () => {
  const harness = await mountPins({
    storageEntries: [['treeRoot:claude-code', '/work']],
    pinsByAgent: { 'claude-code': [{ path: '/outside-pin', addedAt: 1, exists: true }], codex: [] },
  })
  try {
    const rootBefore = harness.storage.get('treeRoot:claude-code')
    findPinRow(harness.render(), '/outside-pin').props.onClick()

    const rendered = harness.render()
    const rootPath = flatten(rendered).find(node => hasClass(node, 'ccm-browser-root-path'))
    const activeRow = findPinRow(rendered, '/outside-pin')
    assert.equal(rootPath.props.title, '/work', 'activatePin changed visibleRoot')
    assert.equal(harness.storage.get('treeRoot:claude-code'), rootBefore, 'activatePin persisted a new tree root')
    assert.match(textOf(flatten(rendered).find(node => hasClass(node, 'ccm-browser-scope-summary'))),
      /Exact directory.*\/outside-pin/, 'activatePin did not commit exact pin scope')
    assert.equal(hasClass(activeRow, 'ccm-browser-pin-row-active'), true, 'activated pin row is missing its active modifier')
    assert.equal(activeRow.props['aria-current'], 'true', 'activated pin row is missing aria-current')
  } finally {
    harness.cleanup()
  }
})

test('pin header reveal is disabled and does nothing when no pin is active', async () => {
  const harness = await mountPins({
    storageEntries: [
      ['treeRoot:claude-code', '/work'],
      ['treeExpandedPaths:claude-code', []],
    ],
    pinsByAgent: {
      'claude-code': [{ path: '/work/inside/leaf', addedAt: 1, exists: true }],
      codex: [],
    },
  })
  try {
    let rendered = harness.render()
    const reveal = findPinReveal(rendered)
    const rootBefore = flatten(rendered).find(node => hasClass(node, 'ccm-browser-root-path')).props.title
    const scopeBefore = textOf(flatten(rendered).find(node => hasClass(node, 'ccm-browser-scope-summary')))
    const expandedBefore = harness.storage.get('treeExpandedPaths:claude-code')
    assert.equal(reveal.props.disabled, true, 'pin header reveal is enabled without an active pin')
    reveal.props.onClick()

    rendered = harness.render()
    assert.equal(flatten(rendered).find(node => hasClass(node, 'ccm-browser-root-path')).props.title, rootBefore,
      'disabled pin header reveal changed visibleRoot')
    assert.equal(textOf(flatten(rendered).find(node => hasClass(node, 'ccm-browser-scope-summary'))), scopeBefore,
      'disabled pin header reveal changed the committed scope')
    assert.deepEqual(harness.storage.get('treeExpandedPaths:claude-code'), expandedBefore,
      'disabled pin header reveal expanded tree paths')
  } finally {
    harness.cleanup()
  }
})

test('pin header reveal uses the active inside pin without changing visibleRoot', async () => {
  const harness = await mountPins({
    storageEntries: [
      ['treeRoot:claude-code', '/work'],
      ['treeExpandedPaths:claude-code', []],
    ],
    pinsByAgent: {
      'claude-code': [{ path: '/work/inside/leaf', addedAt: 1, exists: true }],
      codex: [],
    },
  })
  try {
    findPinRow(harness.render(), '/work/inside/leaf').props.onClick()
    const reveal = findPinReveal(harness.render())
    assert.equal(reveal.props.disabled, false, 'pin header reveal is disabled for an active pin')
    reveal.props.onClick()

    const rendered = harness.render()
    assert.equal(flatten(rendered).find(node => hasClass(node, 'ccm-browser-root-path')).props.title, '/work',
      'revealing an inside pin changed visibleRoot')
    assert.match(textOf(flatten(rendered).find(node => hasClass(node, 'ccm-browser-scope-summary'))),
      /Subtree.*\/work\/inside\/leaf/, 'inside reveal did not commit subtree scope')
    assert.equal(harness.storage.get('treeExpandedPaths:claude-code').includes('/work/inside'), true,
      'inside reveal did not expand the pin ancestors')
    assert.equal(hasClass(findPinRow(rendered, '/work/inside/leaf'), 'ccm-browser-pin-row-active'), true,
      'inside reveal cleared the active pin')
  } finally {
    harness.cleanup()
  }
})

test('pin header reveal moves visibleRoot to the active outside pin', async () => {
  const harness = await mountPins({
    storageEntries: [['treeRoot:claude-code', '/work']],
    pinsByAgent: {
      'claude-code': [
        { path: '/work/inside', addedAt: 1, exists: true },
        { path: '/elsewhere/deep', addedAt: 2, exists: true },
      ],
      codex: [],
    },
  })
  try {
    findPinRow(harness.render(), '/elsewhere/deep').props.onClick()
    const reveal = findPinReveal(harness.render())
    assert.equal(reveal.props.disabled, false, 'pin header reveal is disabled for an active pin')
    reveal.props.onClick()

    const rendered = harness.render()
    assert.equal(flatten(rendered).find(node => hasClass(node, 'ccm-browser-root-path')).props.title, '/elsewhere/deep',
      'revealing an outside pin did not move visibleRoot')
    assert.match(textOf(flatten(rendered).find(node => hasClass(node, 'ccm-browser-scope-summary'))),
      /Subtree.*\/elsewhere\/deep/, 'outside reveal did not retain subtree scope')
    assert.equal(hasClass(findPinRow(rendered, '/elsewhere/deep'), 'ccm-browser-pin-row-active'), true,
      'outside reveal cleared the active pin')
  } finally {
    harness.cleanup()
  }
})

test('pin header reveal is disabled while a session bulk action is running', async () => {
  const pendingArchive = deferred()
  const harness = await mountPins({
    pinsByAgent: {
      'claude-code': [{ path: '/work', addedAt: 1, exists: true }],
      codex: [],
    },
    run: async args => args[0] === 'archive' ? pendingArchive.promise : undefined,
  })
  try {
    findPinRow(harness.render(), '/work').props.onClick()
    let nodes = flatten(harness.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Select mode').props.onClick()
    nodes = flatten(harness.render())
    nodes.find(node => node?.tag === 'input' && node.props?.type === 'checkbox').props.onClick({ stopPropagation() {}, shiftKey: false })
    nodes = flatten(harness.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Archive 1').props.onClick()
    await flush(4)

    assert.equal(findPinReveal(harness.render()).props.disabled, true,
      'pin header reveal is enabled while a session bulk action is running')

    pendingArchive.resolve({ code: 0, stdout: JSON.stringify({ outcome: 'success', cacheRefreshed: true }), stderr: '' })
    await flush(8)
  } finally {
    harness.cleanup()
  }
})

test('pin row click and keyboard behavior switches between activation and selection with edit mode', async () => {
  const harness = await mountPins({
    pinsByAgent: {
      'claude-code': [
        { path: '/one', addedAt: 1, exists: true },
        { path: '/two', addedAt: 2, exists: true },
      ],
      codex: [],
    },
  })
  try {
    findPinRow(harness.render(), '/one').props.onClick()
    assert.match(textOf(flatten(harness.render()).find(node => hasClass(node, 'ccm-browser-scope-summary'))),
      /Exact directory.*\/one/, 'normal-mode row click did not activate the pin')

    let nodes = flatten(harness.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === dictionaries.en['pin-edit-mode']).props.onClick()
    const editRow = findPinRow(harness.render(), '/two')
    assert.equal(typeof editRow.props.onClick, 'function', 'select-mode pin row has no click handler')
    editRow.props.onClick({ shiftKey: false })
    let checkbox = flatten(harness.render()).find(node => node?.tag === 'input' && node.props?.['aria-label'] === 'Select two')
    assert.equal(checkbox.props.checked, true, 'select-mode row click did not toggle the checkbox on')
    assert.match(textOf(flatten(harness.render()).find(node => hasClass(node, 'ccm-browser-scope-summary'))),
      /Exact directory.*\/one/, 'select-mode row click activated the pin')
    findPinRow(harness.render(), '/two').props.onClick({ shiftKey: false })
    checkbox = flatten(harness.render()).find(node => node?.tag === 'input' && node.props?.['aria-label'] === 'Select two')
    assert.equal(checkbox.props.checked, false, 'select-mode row click did not toggle the checkbox off')

    const editModeRow = findPinRow(harness.render(), '/two')
    assert.equal(editModeRow.props.role, undefined, 'select-mode pin row retains a button role')
    assert.equal(editModeRow.props.tabindex, undefined, 'select-mode pin row remains in the tab order')
    assert.equal(editModeRow.props['aria-disabled'], undefined, 'select-mode pin row retains aria-disabled')
    assert.equal(editModeRow.props['aria-current'], undefined, 'select-mode pin row retains aria-current')
    assert.equal(editModeRow.props.onKeydown, undefined, 'select-mode pin row retains a keyboard activation handler')

    nodes = flatten(harness.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === dictionaries.en['pin-edit-mode']).props.onClick()
    const normalRow = findPinRow(harness.render(), '/two')
    normalRow.props.onKeydown({ key: 'Enter', target: normalRow, currentTarget: normalRow, shiftKey: false, preventDefault() {} })
    assert.match(textOf(flatten(harness.render()).find(node => hasClass(node, 'ccm-browser-scope-summary'))),
      /Exact directory.*\/two/, 'normal-mode Enter did not activate the pin')
  } finally {
    harness.cleanup()
  }
})

test('pin move buttons do not change row checkbox selection in edit mode', async () => {
  const harness = await mountPins({
    pinsByAgent: {
      'claude-code': ['/a', '/b', '/c'].map((pinPath, index) => ({ path: pinPath, addedAt: index + 1, exists: true })),
      codex: [],
    },
  })
  try {
    let nodes = flatten(harness.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === dictionaries.en['pin-edit-mode']).props.onClick()

    for (const title of ['Move b up', 'Move b down']) {
      nodes = flatten(harness.render())
      const event = { stopped: false, stopPropagation() { this.stopped = true } }
      nodes.find(node => node?.tag === 'button' && node.props?.title === title).props.onClick(event)
      assert.equal(event.stopped, true, `${title} did not stop row click propagation`)
      const checkbox = flatten(harness.render()).find(node => node?.tag === 'input' && node.props?.['aria-label'] === 'Select b')
      assert.equal(checkbox.props.checked, false, `${title} changed the row checkbox selection`)
      await flush(6)
    }
  } finally {
    harness.cleanup()
  }
})

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
    const workRow = findPinRow(nodes, '/work')
    const aliasRow = findPinRow(nodes, '/Canonical/É')
    assert.match(textOf(workRow), /1 session/)
    assert.doesNotMatch(textOf(workRow), /2 sessions/)
    assert.match(textOf(aliasRow), /1 session/)

    workRow.props.onClick()
    nodes = flatten(harness.render())
    assert.match(textOf(nodes.find(node => hasClass(node, 'ccm-browser-scope-summary'))), /Exact directory.*\/work/)
    const cards = nodes.filter(node => node?.tag === 'article').map(textOf).join('\n')
    assert.match(cards, /exact-session/)
    assert.doesNotMatch(cards, /descendant-session/)

    findPinRow(nodes, '/empty').props.onClick()
    const rendered = textOf(harness.render())
    assert.match(rendered, /This pinned folder has no sessions for this view\./)
    assert.doesNotMatch(rendered, /No Active sessions match these filters\./)
  } finally {
    harness.cleanup()
  }
})

test('current folder pin prefers an exact case-preserving path before folded match keys', async () => {
  const harness = await mountPins({
    sessions: [session('lowercase-folder', '/work/foo')],
    pinsByAgent: {
      'claude-code': [
        { path: '/work/Foo', addedAt: 1, exists: true },
        { path: '/work/foo', addedAt: 2, exists: true },
      ],
      codex: [],
    },
  })
  try {
    const callStart = harness.calls.length
    const toggle = flatten(harness.render()).find(node => node?.tag === 'button'
      && node.props?.title === dictionaries.en['pin-current-folder-remove'])
    assert.ok(toggle)
    toggle.props.onClick()
    await flush(4)
    assert.deepEqual(harness.calls.slice(callStart).find(args => args[0] === 'remove-pin'), [
      'remove-pin',
      'claude-code',
      '/work/foo',
    ])
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

test('pin mutation queue does not start a second asynchronous command before the first resolves', async () => {
  const firstMove = deferred()
  const secondMove = deferred()
  let moveCount = 0
  const harness = await mountPins({
    pinsByAgent: {
      'claude-code': ['/a', '/b', '/c', '/d'].map((pinPath, index) => ({
        path: pinPath,
        addedAt: index + 1,
        exists: true,
      })),
      codex: [],
    },
    run: async args => {
      if (args[0] !== 'move-pin') return undefined
      moveCount++
      await (moveCount === 1 ? firstMove.promise : secondMove.promise)
      return { code: 0, stdout: JSON.stringify({ outcome: 'applied' }), stderr: '' }
    },
  })
  try {
    let nodes = flatten(harness.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Edit pinned folders').props.onClick()
    nodes = flatten(harness.render())
    const callStart = harness.calls.length
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Move d up').props.onClick()
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Move c up').props.onClick()
    await flush(3)
    assert.deepEqual(harness.calls.slice(callStart).filter(args => args[0] === 'move-pin'), [
      ['move-pin', 'claude-code', '/d', 'up'],
    ])

    firstMove.resolve()
    await flush(6)
    assert.deepEqual(harness.calls.slice(callStart).filter(args => args[0] === 'move-pin'), [
      ['move-pin', 'claude-code', '/d', 'up'],
      ['move-pin', 'claude-code', '/c', 'up'],
    ])
    secondMove.resolve()
    await flush(6)
  } finally {
    harness.cleanup()
  }
})

test('a failed current-generation pin mutation reloads the committed pin list', async () => {
  const harness = await mountPins({
    pinsByAgent: {
      'claude-code': [
        { path: '/a', addedAt: 1, exists: true },
        { path: '/b', addedAt: 2, exists: true },
      ],
      codex: [],
    },
    run: async args => args[0] === 'move-pin'
      ? { code: 1, stdout: '', stderr: 'directory fsync failed after rename' }
      : undefined,
  })
  try {
    let nodes = flatten(harness.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Edit pinned folders').props.onClick()
    nodes = flatten(harness.render())
    const callStart = harness.calls.length
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Move b up').props.onClick()
    await flush(8)
    assert.deepEqual(harness.calls.slice(callStart).map(args => args[0]), ['move-pin', 'list-pins'])
  } finally {
    harness.cleanup()
  }
})

test('a successful no-op mutation reloads pins changed concurrently while the command was pending', async () => {
  const slowRemove = deferred()
  const harness = await mountPins({
    pinsByAgent: {
      'claude-code': [{ path: '/work', addedAt: 1, exists: true }],
      codex: [],
    },
    run: async (args, state) => {
      if (args[0] !== 'remove-pin' || args[1] !== 'claude-code') return undefined
      await slowRemove.promise
      state.pinsByAgent['claude-code'] = [{ path: '/concurrent-pin', addedAt: 2, exists: true }]
      return {
        code: 0,
        stdout: JSON.stringify({ results: [{ path: args[2], outcome: 'absent' }], changed: false }),
        stderr: '',
      }
    },
  })
  try {
    let nodes = flatten(harness.render())
    findPinRow(nodes, '/work').props.onClick()
    nodes = flatten(harness.render())
    const callStart = harness.calls.length
    nodes.find(node => node?.tag === 'button'
      && node.props?.title === dictionaries.en['pin-current-folder-remove']).props.onClick()
    await flush(2)
    assert.ok(harness.calls.slice(callStart).some(args => args[0] === 'remove-pin'))

    slowRemove.resolve()
    await flush(8)
    const pinPaths = flatten(harness.render())
      .filter(node => hasClass(node, 'ccm-browser-pin-row'))
      .map(node => node.props.title)
    assert.deepEqual(pinPaths, ['/concurrent-pin'])
    assert.ok(harness.calls.slice(callStart).some(args => args[0] === 'list-pins'))
  } finally {
    harness.cleanup()
  }
})

test('reloading pins clears the active path when the active pin was removed concurrently', async () => {
  const harness = await mountPins({
    pinsByAgent: {
      'claude-code': [{ path: '/work', addedAt: 1, exists: true }],
      codex: [],
    },
    run: async (args, state) => {
      if (args[0] !== 'remove-pin' || args[1] !== 'claude-code') return undefined
      state.pinsByAgent['claude-code'] = []
      return {
        code: 0,
        stdout: JSON.stringify({ results: [{ path: args[2], outcome: 'absent' }], changed: false }),
        stderr: '',
      }
    },
  })
  try {
    findPinRow(harness.render(), '/work').props.onClick()
    let rendered = harness.render()
    assert.equal(hasClass(findPinRow(rendered, '/work'), 'ccm-browser-pin-row-active'), true,
      'activated pin row is missing its active modifier')
    assert.equal(findPinReveal(rendered).props.disabled, false, 'pin header reveal is disabled for an active pin')

    flatten(rendered).find(node => node?.tag === 'button'
      && node.props?.title === dictionaries.en['pin-current-folder-remove']).props.onClick()
    await flush(8)

    rendered = harness.render()
    assert.equal(hasClass(findPinRow(rendered, '/work'), 'ccm-browser-pin-row-active'), false,
      'removed pin row retains its active modifier after reload')
    assert.equal(findPinReveal(rendered).props.disabled, true,
      'pin header reveal remains enabled after the active pin was removed')
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

test('a stale add completion reconciles the agent that is current after switching away and back', async () => {
  const slowAdd = deferred()
  const pinsByAgent = {
    'claude-code': [],
    codex: [{ path: '/codex-pin', addedAt: 1, exists: true }],
  }
  const harness = await mountPins({
    pinsByAgent,
    run: async (args, state) => {
      if (args[0] !== 'add-pin' || args[1] !== 'claude-code') return undefined
      const response = await slowAdd.promise
      state.pinsByAgent['claude-code'] = [{ path: response.canonicalPath, addedAt: 2, exists: true }]
      return { code: 0, stdout: JSON.stringify(response), stderr: '' }
    },
  })
  try {
    const callStart = harness.calls.length
    flatten(harness.render()).find(node => node?.tag === 'button'
      && node.props?.title === dictionaries.en['pin-current-folder-add']).props.onClick()
    await flush(2)
    assert.ok(harness.calls.slice(callStart).some(args => args[0] === 'add-pin'))

    switchAgent(harness, 'codex')
    await flush(8)
    switchAgent(harness, 'claude-code')
    await flush(8)
    assert.doesNotMatch(textOf(harness.render()), /late-agent-a-pin/)

    slowAdd.resolve({ canonicalPath: '/late-agent-a-pin', outcome: 'applied' })
    await flush(10)
    const pinPaths = flatten(harness.render())
      .filter(node => hasClass(node, 'ccm-browser-pin-row'))
      .map(node => node.props.title)
    assert.deepEqual(pinPaths, ['/late-agent-a-pin'])
    const aLists = harness.calls.slice(callStart)
      .filter(args => args[0] === 'list-pins' && args[1] === 'claude-code')
    assert.ok(aLists.length >= 2, JSON.stringify(harness.calls.slice(callStart)))
  } finally {
    harness.cleanup()
  }
})

test('stale mutation reconciliation preserves a newer-generation queued mutation', async () => {
  const slowFirstAdd = deferred()
  let addCount = 0
  const harness = await mountPins({
    sessionsByAgent: {
      'claude-code': [session('claude-work', '/work')],
      codex: [session('codex-work', '/codex', { agent: 'codex' })],
    },
    pinsByAgent: { 'claude-code': [], codex: [] },
    run: async (args, state) => {
      if (args[0] !== 'add-pin' || args[1] !== 'claude-code') return undefined
      addCount++
      if (addCount === 1) await slowFirstAdd.promise
      const canonicalPath = addCount === 1 ? '/stale-first-add' : '/queued-second-add'
      state.pinsByAgent['claude-code'] = [{ path: canonicalPath, addedAt: addCount, exists: true }]
      return { code: 0, stdout: JSON.stringify({ canonicalPath, outcome: 'applied' }), stderr: '' }
    },
  })
  try {
    const addButton = () => flatten(harness.render()).find(node => node?.tag === 'button'
      && node.props?.title === dictionaries.en['pin-current-folder-add'])
    const callStart = harness.calls.length
    addButton().props.onClick()
    await flush(2)

    switchAgent(harness, 'codex')
    await flush(8)
    switchAgent(harness, 'claude-code')
    await flush(8)
    addButton().props.onClick()
    await flush(2)
    assert.equal(harness.calls.slice(callStart).filter(args => args[0] === 'add-pin').length, 1)

    slowFirstAdd.resolve()
    await flush(12)
    assert.deepEqual(harness.calls.slice(callStart).filter(args => args[0] === 'add-pin'), [
      ['add-pin', 'claude-code', '/work'],
      ['add-pin', 'claude-code', '/work'],
    ])
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
    const headerButtons = sectionNodes.filter(node => node?.tag === 'button')
    assert.deepEqual(headerButtons.map(node => node.props.title), ['Expand pinned folders'])
    assert.equal(headerButtons.some(node => node.props.title === 'Reveal in tree'), false,
      'collapsed header still renders the pin reveal action')
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
  assert.equal(dictionaries.en['pinned-folders'], 'Pinned folders', 'English pinned-folders wording changed')
  assert.equal(dictionaries.zh['pinned-folders'], '置顶目录', 'Chinese pinned-folders wording was not renamed')
  assert.equal(Object.values(dictionaries.zh).some(value => value.includes('固定目录')), false,
    'a Chinese pinned-folder string still uses 固定目录')
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
      const pinRow = findPinRow(harness.render(), canonicalPath)
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
