const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const esbuild = require('esbuild')

const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-browser-ui-mutations-'))
const bundlePath = path.join(bundleDir, 'ui.cjs')
esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/ui.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: bundlePath,
  logLevel: 'silent',
})
const { activate, parseCliFailure, runBulkSerial, sessionKey } = require(bundlePath)

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

async function triggerSingleExport(harness) {
  const nodes = flatten(harness.plugin.component.render())
  nodes.find(node => node?.tag === 'button' && node.props?.title === 'Export session').props.onClick({ stopPropagation() {} })
  await flush()
}

async function triggerBulkExport(harness) {
  let nodes = flatten(harness.plugin.component.render())
  nodes.find(node => node?.tag === 'button' && node.props?.title === 'Select mode').props.onClick()
  nodes = flatten(harness.plugin.component.render())
  nodes.find(node => node?.tag === 'input' && node.props?.type === 'checkbox').props.onClick({ stopPropagation() {}, shiftKey: false })
  nodes = flatten(harness.plugin.component.render())
  nodes.find(node => node?.tag === 'button' && textOf(node) === 'Export 1').props.onClick()
  await flush()
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
  const previousNavigator = Object.getOwnPropertyDescriptor(global, 'navigator')
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
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText: async () => {} } },
  })

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
        if (args[0] === 'classify-export-destination') {
          const configured = args[1].trim()
          return { code: 0, stdout: JSON.stringify({ outsideHome: configured !== '~' && !configured.startsWith('~/') }), stderr: '' }
        }
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
      if (previousNavigator) Object.defineProperty(global, 'navigator', previousNavigator)
      else delete global.navigator
    },
  }
}

test('single export uses the saved root with the agent and single-files folders', async () => {
  const active = session('14141414-1414-1414-1414-141414141414')
  const exportedPath = '/exports/session.md'
  const harness = await mount([active], async args => {
    if (args[0] === 'export-session') {
      return { code: 0, stdout: JSON.stringify({ ok: true, path: exportedPath }), stderr: '' }
    }
  }, undefined, {
    storageGet: (key, fallback) => key === 'exportDestination' ? '/exports' : fallback(),
  })
  try {
    const nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Export session').props.onClick({ stopPropagation() {} })
    await flush()

    const call = harness.calls.find(args => args[0] === 'export-session')
    assert.deepEqual(call.slice(0, 5), [
      'export-session',
      '-work',
      active.id,
      '--dest',
      '/exports/claude_exp/single files',
    ])
    assert.deepEqual(harness.notifications, [])
  } finally {
    harness.cleanup()
  }
})

test('normal in-home single export confirms the actual directory in configured path terms', async () => {
  const active = session('20202020-2020-2020-2020-202020202020')
  const harness = await mount([active], async args => {
    if (args[0] === 'export-session') {
      return { code: 0, stdout: JSON.stringify({ ok: true, path: '/home/user/Downloads/session.md' }), stderr: '' }
    }
  }, undefined, {
    storageGet: (key, fallback) => key === 'exportDestination' ? '~/My Exports' : fallback(),
  })
  try {
    const nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Export session').props.onClick({ stopPropagation() {} })
    await flush()

    assert.equal(harness.confirmations.length, 1)
    assert.equal(harness.confirmations[0], 'Export this session to ~/My Exports/claude_exp/single files?')
    assert.equal(harness.calls.filter(args => args[0] === 'export-session').length, 1)
  } finally {
    harness.cleanup()
  }
})

test('declining the single-export destination confirmation returns without exporting or notifying', async () => {
  const active = session('21202020-2020-2020-2020-202020202020')
  const harness = await mount([active], undefined, async () => false)
  try {
    const nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Export session').props.onClick({ stopPropagation() {} })
    await flush()

    assert.equal(harness.confirmations.length, 1)
    assert.equal(harness.confirmations[0], 'Export this session to ~/Downloads/claude_exp/single files?')
    assert.equal(harness.calls.some(args => args[0] === 'export-session'), false)
    assert.deepEqual(harness.notifications, [])
    assert.equal(flatten(harness.plugin.component.render()).some(node => node?.props?.class === 'ccm-browser-error'), false)
  } finally {
    harness.cleanup()
  }
})

test('single export completes without notifying or writing to the clipboard', async () => {
  const active = session('19191919-1919-1919-1919-191919191919')
  const exportedPath = '/exports/session.md'
  const harness = await mount([active], async args => {
    if (args[0] === 'export-session') {
      return { code: 0, stdout: JSON.stringify({ ok: true, path: exportedPath }), stderr: '' }
    }
  })
  let clipboardWrites = 0
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText: async () => { clipboardWrites++ } } },
  })
  try {
    const nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Export session').props.onClick({ stopPropagation() {} })
    await flush()

    assert.equal(harness.calls.filter(args => args[0] === 'export-session').length, 1)
    assert.equal(clipboardWrites, 0)
    assert.deepEqual(harness.notifications, [])
    assert.equal(flatten(harness.plugin.component.render()).some(node => node?.props?.class === 'ccm-browser-error'), false)
  } finally {
    harness.cleanup()
  }
})

test('single export reports an invalid response for non-JSON stdout', async () => {
  const active = session('18181818-1818-1818-1818-181818181818')
  const harness = await mount([active], async args => {
    if (args[0] === 'export-session') {
      return { code: 0, stdout: 'not json', stderr: '' }
    }
  })
  try {
    const nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Export session').props.onClick({ stopPropagation() {} })
    await flush()

    const errorBanner = flatten(harness.plugin.component.render()).find(node => node?.props?.class === 'ccm-browser-error')
    assert.equal(textOf(errorBanner), 'Command failed: Export command returned an invalid response.')
  } finally {
    harness.cleanup()
  }
})

test('declining the outside-home confirmation returns without notifying or retrying', async () => {
  const active = session('15151515-1515-1515-1515-151515151515')
  let confirmationCount = 0
  const harness = await mount([active], async args => {
    if (args[0] === 'export-session') {
      return {
        code: 1,
        stdout: '',
        stderr: JSON.stringify({
          error: 'export-destination-outside-home',
          message: 'outside home',
        }),
      }
    }
  }, async () => ++confirmationCount === 1, {
    storageGet: (key, fallback) => key === 'exportDestination' ? '/outside' : fallback(),
  })
  try {
    const nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Export session').props.onClick({ stopPropagation() {} })
    await flush()

    assert.equal(harness.calls.filter(args => args[0] === 'export-session').length, 1)
    assert.equal(harness.confirmations.length, 2)
    assert.ok(harness.confirmations.every(message => message.includes('/outside')))
    assert.deepEqual(harness.notifications, [])
    assert.equal(flatten(harness.plugin.component.render()).some(node => node?.props?.class === 'ccm-browser-error'), false)
  } finally {
    harness.cleanup()
  }
})

test('single export outside home retries once with explicit permission when confirmed', async () => {
  const active = session('16161616-1616-1616-1616-161616161616')
  const harness = await mount([active], async args => {
    if (args[0] !== 'export-session') return
    if (args.includes('--allow-outside-home')) {
      return { code: 0, stdout: JSON.stringify({ ok: true, path: '/outside/session.md' }), stderr: '' }
    }
    return {
      code: 1,
      stdout: '',
      stderr: JSON.stringify({
        error: 'export-destination-outside-home',
        message: 'outside home',
      }),
    }
  }, async () => true, {
    storageGet: (key, fallback) => key === 'exportDestination' ? '/outside' : fallback(),
  })
  try {
    const nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Export session').props.onClick({ stopPropagation() {} })
    await flush()

    const exportCalls = harness.calls.filter(args => args[0] === 'export-session')
    assert.equal(exportCalls.length, 2)
    assert.equal(exportCalls[0].includes('--allow-outside-home'), false)
    assert.equal(exportCalls[1].filter(arg => arg === '--allow-outside-home').length, 1)
  } finally {
    harness.cleanup()
  }
})

test('declining either single-export confirmation releases the mutation mutex', async () => {
  const cases = [
    ['destination', '38383838-3838-3838-3838-383838383838'],
    ['outside-home', '39393939-3939-3939-3939-393939393939'],
  ]
  for (const [decline, sessionId] of cases) {
    const active = session(sessionId)
    let confirmationCount = 0
    const harness = await mount([active], async args => {
      if (args[0] === 'export-session') {
        return {
          code: 1,
          stdout: '',
          stderr: JSON.stringify({
            error: 'export-destination-outside-home',
            message: 'outside home',
          }),
        }
      }
    }, async () => {
      confirmationCount++
      return decline === 'outside-home' && confirmationCount === 1
    }, {
      storageGet: (key, fallback) => key === 'exportDestination' ? '/outside' : fallback(),
    })
    try {
      await triggerSingleExport(harness)
      const nodes = flatten(harness.plugin.component.render())
      nodes.find(node => node?.tag === 'button' && node.props?.title === 'Resume session').props.onClick({ stopPropagation() {} })
      await flush()

      assert.equal(harness.calls.filter(args => args[0] === 'check-dir').length, 1, decline)
      assert.equal(harness.notifications.some(([, level]) => level === 'warn'), false, decline)
    } finally {
      harness.cleanup()
    }
  }
})

test('outside-home retry is bounded to exactly one retry when that retry succeeds', async () => {
  const active = session('outside-home-retry-bounded')
  let exportAttempts = 0
  const harness = await mount([active], async args => {
    if (args[0] !== 'export-session') return
    exportAttempts++
    if (exportAttempts === 1) return {
        code: 1,
        stdout: '',
        stderr: JSON.stringify({
          error: 'export-destination-outside-home',
          message: 'outside home',
        }),
      }
    if (exportAttempts === 2) return { code: 0, stdout: JSON.stringify({ ok: true, path: '/outside/session.md' }), stderr: '' }
    return { code: 1, stdout: '', stderr: 'unexpected extra retry' }
  }, async () => true, {
    storageGet: (key, fallback) => key === 'exportDestination' ? '/outside' : fallback(),
  })
  try {
    await triggerSingleExport(harness)

    const exportCalls = harness.calls.filter(args => args[0] === 'export-session')
    assert.equal(harness.confirmations.length, 2)
    assert.equal(exportCalls.length, 2)
    assert.equal(exportCalls[0].includes('--allow-outside-home'), false)
    assert.equal(exportCalls[1].filter(arg => arg === '--allow-outside-home').length, 1)
    assert.equal(flatten(harness.plugin.component.render()).some(node => node?.props?.class === 'ccm-browser-error'), false)
  } finally {
    harness.cleanup()
  }
})

test('all export CLI error codes use their localized taxonomy in single and bulk results', async () => {
  const cliSource = fs.readFileSync(path.resolve(__dirname, '../src/history-cli.ts'), 'utf8')
  const uiSource = fs.readFileSync(path.resolve(__dirname, '../src/ui.ts'), 'utf8')
  const emittedCodes = [...new Set(
    [...cliSource.matchAll(/(?:\b(?:fail|exportError)\(\s*['"](export-[^'"]+)['"]|\|\|\s*['"](export-[^'"]+)['"])/g)].map(match => match[1] || match[2]),
  )].sort()
  const localizedExportErrorSource = uiSource.match(
    /function localizedExportError\b[\s\S]*?\n}\n\nexport function shQuote/,
  )?.[0] || ''
  const mappedCodes = [...new Set(
    [...localizedExportErrorSource.matchAll(/case\s+['"](export-[^'"]+)['"]\s*:/g)].map(match => match[1]),
  )].sort()

  assert.ok(emittedCodes.length > 0)
  assert.deepEqual(mappedCodes, emittedCodes)

  for (const code of emittedCodes) {
    const active = session(`taxonomy-single-${code}`)
    const rawMessage = `RAW CLI ${code} /raw/noise/path`
    const single = await mount([active], async args => args[0] === 'export-session'
      ? { code: 1, stdout: '', stderr: JSON.stringify({ error: code, message: rawMessage }) }
      : undefined, undefined, {
      storageGet: (key, fallback) => key === 'exportDestination' ? '/taxonomy' : fallback(),
    })
    try {
      await triggerSingleExport(single)
      const rendered = textOf(single.plugin.component.render())
      assert.doesNotMatch(rendered, /RAW CLI|\/raw\/noise\/path/)
      assert.doesNotMatch(rendered, /unexpected error/i)
      assert.doesNotMatch(rendered, /export-error-[a-z-]+/)
    } finally {
      single.cleanup()
    }

    const bulk = await mount([active], async args => args[0] === 'export-session'
      ? { code: 1, stdout: '', stderr: JSON.stringify({ error: code, message: rawMessage }) }
      : undefined, undefined, {
      storageGet: (key, fallback) => key === 'exportDestination' ? '/taxonomy' : fallback(),
    })
    try {
      await triggerBulkExport(bulk)
      const rendered = textOf(bulk.plugin.component.render())
      assert.doesNotMatch(rendered, /RAW CLI|\/raw\/noise\/path/)
      assert.doesNotMatch(rendered, /unexpected error/i)
      assert.doesNotMatch(rendered, /export-error-[a-z-]+/)
    } finally {
      bulk.cleanup()
    }
  }
})

test('an unrecognized export code uses the generic localization without raw CLI text', async () => {
  const active = session('future-export-error')
  const rawMessage = 'RAW FUTURE CLI MESSAGE'
  const run = async args => args[0] === 'export-session'
    ? { code: 1, stdout: '', stderr: JSON.stringify({ error: 'export-quantum-destination-failed', message: rawMessage }) }
    : undefined

  const single = await mount([active], run)
  try {
    await triggerSingleExport(single)
    const rendered = textOf(single.plugin.component.render())
    assert.match(rendered, /The session could not be exported because of an unexpected error\./)
    assert.doesNotMatch(rendered, /RAW FUTURE CLI MESSAGE/)
  } finally {
    single.cleanup()
  }

  const bulk = await mount([active], run)
  try {
    await triggerBulkExport(bulk)
    const rendered = textOf(bulk.plugin.component.render())
    assert.match(rendered, /The session could not be exported because of an unexpected error\./)
    assert.doesNotMatch(rendered, /RAW FUTURE CLI MESSAGE/)
  } finally {
    bulk.cleanup()
  }
})

test('bulk failure rows expose readable layout hooks backed by stylesheet rules', async () => {
  const active = session('bulk-layout-hooks', 'active', { title: 'A very long failed export title' })
  const harness = await mount([active], async args => args[0] === 'export-session'
    ? { code: 1, stdout: '', stderr: JSON.stringify({ error: 'export-file-write-failed', message: 'raw write error' }) }
    : undefined)
  try {
    await triggerBulkExport(harness)
    const nodes = flatten(harness.plugin.component.render())
    const row = nodes.find(node => node?.props?.class === 'ccm-browser-bulk-result-item')
    assert.ok(row)
    assert.equal(flatten(row).find(node => node?.tag === 'strong').props.class, 'ccm-browser-bulk-result-title')
    assert.equal(flatten(row).find(node => node?.tag === 'code').props.class, 'ccm-browser-bulk-result-id')
    assert.equal(flatten(row).find(node => node?.tag === 'span').props.class, 'ccm-browser-bulk-result-reason')

    const css = fs.readFileSync(path.resolve(__dirname, '../styles.css'), 'utf8')
    assert.match(css, /\.ccm-browser-bulk-result-item\s*\{[^}]*display:\s*grid/s)
    assert.match(css, /\.ccm-browser-bulk-result-title,\s*\.ccm-browser-bulk-result-id\s*\{[^}]*text-overflow:\s*ellipsis/s)
    assert.match(css, /\.ccm-browser-bulk-result-id\s*\{[^}]*var\(--ccm-text-dim\)[^}]*var\(--ccm-font-mono\)/s)
    assert.match(css, /\.ccm-browser-bulk-result-reason\s*\{[^}]*var\(--ccm-text-muted\)/s)
  } finally {
    harness.cleanup()
  }
})

test('bulk export confirms outside home once up front and permits every item', async () => {
  const active = session('17171717-1717-1717-1717-171717171717')
  const harness = await mount([active], async args => {
    if (args[0] === 'export-session') {
      if (args.includes('--allow-outside-home')) {
        return { code: 0, stdout: JSON.stringify({ ok: true, path: '/outside/session.md' }), stderr: '' }
      }
      return {
        code: 1,
        stdout: '',
        stderr: JSON.stringify({
          error: 'export-destination-outside-home',
          message: 'outside home',
        }),
      }
    }
  }, async () => true, {
    storageGet: (key, fallback) => key === 'exportDestination' ? '/outside' : fallback(),
  })
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Select mode').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'input' && node.props?.type === 'checkbox').props.onClick({ stopPropagation() {}, shiftKey: false })
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Export 1').props.onClick()
    await flush()

    assert.equal(harness.calls.filter(args => args[0] === 'export-session').length, 1)
    const exportCalls = harness.calls.filter(args => args[0] === 'export-session')
    assert.equal(exportCalls.length, 1)
    assert.equal(exportCalls[0].filter(arg => arg === '--allow-outside-home').length, 1)
    assert.equal(harness.confirmations.length, 2)
    assert.equal(harness.confirmations.filter(message => message.includes('outside your home directory')).length, 1)
    assert.match(textOf(harness.plugin.component.render()), /Done 1 · Failed 0 · Skipped 0/)
  } finally {
    harness.cleanup()
  }
})

test('bulk export skips outside-home confirmation for an absolute destination classified inside home', async () => {
  const active = session('bulk-absolute-inside-home')
  const harness = await mount([active], async args => {
    if (args[0] === 'classify-export-destination') {
      return { code: 0, stdout: JSON.stringify({ outsideHome: false }), stderr: '' }
    }
    if (args[0] === 'export-session') {
      return { code: 0, stdout: JSON.stringify({ ok: true, path: '/home/user/exports/session.md' }), stderr: '' }
    }
  }, async () => true, {
    storageGet: (key, fallback) => key === 'exportDestination' ? '/home/user/exports' : fallback(),
  })
  try {
    await triggerBulkExport(harness)
    assert.equal(harness.confirmations.length, 1)
    const exportCall = harness.calls.find(args => args[0] === 'export-session')
    assert.ok(exportCall)
    assert.equal(exportCall.includes('--allow-outside-home'), false)
  } finally {
    harness.cleanup()
  }
})

test('bulk export surfaces classifier failures and does not start the run', async () => {
  const failures = [
    { name: 'nonzero exit', result: { code: 1, stdout: '', stderr: 'classifier failed' } },
    { name: 'timeout', error: new Error('timed out after 10000ms') },
    { name: 'malformed JSON', result: { code: 0, stdout: 'not json', stderr: '' } },
    { name: 'wrong response type', result: { code: 0, stdout: JSON.stringify({ outsideHome: 'no' }), stderr: '' } },
  ]

  for (const failure of failures) {
    const harness = await mount([session(`classifier-${failure.name}`)], async args => {
      if (args[0] !== 'classify-export-destination') return undefined
      if (failure.error) throw failure.error
      return failure.result
    })
    try {
      const buildCountBefore = harness.calls.filter(args => args[0] === 'build-index').length
      await triggerBulkExport(harness)
      const rendered = textOf(harness.plugin.component.render())
      assert.match(rendered, /Could not verify whether the export destination is inside your home directory\. The export was not started\./, failure.name)
      assert.equal(harness.confirmations.length, 1, failure.name)
      assert.equal(harness.calls.filter(args => args[0] === 'build-index').length, buildCountBefore, failure.name)
      assert.equal(harness.calls.some(args => args[0] === 'export-session'), false, failure.name)
    } finally {
      harness.cleanup()
    }
  }
})

test('declining bulk outside-home permission does not start the run', async () => {
  const active = session('bulk-outside-home-declined')
  let confirmationCount = 0
  const harness = await mount([active], undefined, async () => ++confirmationCount === 1, {
    storageGet: (key, fallback) => key === 'exportDestination' ? '/outside' : fallback(),
  })
  try {
    await triggerBulkExport(harness)
    assert.equal(harness.confirmations.length, 2)
    assert.equal(harness.calls.some(args => args[0] === 'export-session'), false)
  } finally {
    harness.cleanup()
  }
})

test('stale single export completion after remount does not touch UI state or surface an error', async () => {
  const active = session('stale-single-export')
  const pendingExport = deferred()
  const harness = await mount([active], async args => args[0] === 'export-session' ? pendingExport.promise : undefined)
  try {
    const before = textOf(harness.plugin.component.render())
    const running = triggerSingleExport(harness)
    await flush()
    await harness.remount()
    pendingExport.resolve({ code: 1, stdout: '', stderr: JSON.stringify({ error: 'export-file-write-failed', message: 'stale failure' }) })
    await running
    await flush()

    assert.equal(textOf(harness.plugin.component.render()), before)
    assert.deepEqual(harness.notifications, [])
    assert.equal(flatten(harness.plugin.component.render()).some(node => node?.props?.class === 'ccm-browser-error'), false)
  } finally {
    harness.cleanup()
  }
})

test('card keyboard activation handles Enter and Space in normal and select modes', async () => {
  const first = session('card-keyboard-enter')
  const second = session('card-keyboard-space')
  const harness = await mount([first, second])
  try {
    let nodes = flatten(harness.plugin.component.render())
    let cards = nodes.filter(node => node?.tag === 'article')
    const enterNormal = { key: 'Enter', prevented: false, preventDefault() { this.prevented = true } }
    cards[0].props.onKeydown(enterNormal)
    await flush()
    const spaceNormal = { key: ' ', prevented: false, preventDefault() { this.prevented = true } }
    cards = flatten(harness.plugin.component.render()).filter(node => node?.tag === 'article')
    cards[1].props.onKeydown(spaceNormal)
    await flush()

    assert.equal(enterNormal.prevented, true)
    assert.equal(spaceNormal.prevented, true)
    assert.equal(harness.calls.filter(args => args[0] === 'read-session').length, 2)

    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Select mode').props.onClick()
    cards = flatten(harness.plugin.component.render()).filter(node => node?.tag === 'article')
    const enterSelect = { key: 'Enter', prevented: false, preventDefault() { this.prevented = true } }
    cards[0].props.onKeydown(enterSelect)
    const spaceSelect = { key: ' ', prevented: false, preventDefault() { this.prevented = true } }
    cards[1].props.onKeydown(spaceSelect)

    assert.equal(enterSelect.prevented, true)
    assert.equal(spaceSelect.prevented, true)
    assert.match(textOf(harness.plugin.component.render()), /2 selected/)
    assert.equal(harness.calls.filter(args => args[0] === 'read-session').length, 2)
  } finally {
    harness.cleanup()
  }
})

test('checkbox and action-button clicks stop propagation from session cards', async () => {
  const active = session('card-nested-control-propagation')
  const harness = await mount([active], undefined, async () => false)
  try {
    let nodes = flatten(harness.plugin.component.render())
    const actionEvent = { stopped: false, stopPropagation() { this.stopped = true } }
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Export session').props.onClick(actionEvent)
    await flush()

    assert.equal(actionEvent.stopped, true)
    assert.equal(harness.calls.filter(args => args[0] === 'read-session').length, 0)

    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Select mode').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    const checkboxEvent = { shiftKey: false, stopped: false, stopPropagation() { this.stopped = true } }
    nodes.find(node => node?.tag === 'input' && node.props?.type === 'checkbox').props.onClick(checkboxEvent)

    assert.equal(checkboxEvent.stopped, true)
    assert.match(textOf(harness.plugin.component.render()), /1 selected/)
  } finally {
    harness.cleanup()
  }
})

test('bulk export reports an invalid response for non-JSON stdout', async () => {
  const active = session('20202020-2020-2020-2020-202020202020')
  const harness = await mount([active], async args => {
    if (args[0] === 'export-session') {
      return { code: 0, stdout: 'not json', stderr: '' }
    }
  })
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Select mode').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'input' && node.props?.type === 'checkbox').props.onClick({ stopPropagation() {}, shiftKey: false })
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Export 1').props.onClick()
    await flush()

    const renderedText = textOf(harness.plugin.component.render())
    assert.match(renderedText, /Export command returned an invalid response\./)
    assert.doesNotMatch(renderedText, /Unexpected token|JSON/)
  } finally {
    harness.cleanup()
  }
})

test('bulk export uses agent, run timestamp, then project and sanitizes the agent segment', async () => {
  const first = session('21212121-2121-2121-2121-212121212121', 'active', {
    rootPath: '/workspace/alpha',
    attributionKey: 'scope-alpha',
  })
  const second = session('22222222-2222-2222-2222-222222222222', 'active', {
    rootPath: '/workspace/alpha',
    attributionKey: 'scope-alpha',
  })
  const third = session('23232323-2323-2323-2323-232323232323', 'active', {
    rootPath: '/workspace/beta',
    attributionKey: 'scope-beta',
  })
  const calls = []
  const outcome = await runBulkSerial({
    action: 'export',
    items: [first, second, third],
    exportDestination: '/exports',
    exportAgent: '../codex',
    run: async (args, timeout) => {
      calls.push({ args, timeout })
      return { code: 0, stdout: JSON.stringify({ ok: true, path: `/exports/${args[2]}.md` }), stderr: '' }
    },
  })

  assert.equal(calls.filter(call => call.args[0] === 'build-index').length, 0)
  const exportCalls = calls.filter(call => call.args[0] === 'export-session')
  assert.equal(exportCalls.length, 3)
  assert.ok(exportCalls.every(call => call.timeout === 30_000))
  assert.deepEqual(exportCalls.map(call => call.args.slice(0, 3)), [
    ['export-session', 'scope-alpha', first.id],
    ['export-session', 'scope-alpha', second.id],
    ['export-session', 'scope-beta', third.id],
  ])
  const destinations = exportCalls.map(call => call.args[call.args.indexOf('--dest') + 1])
  assert.match(destinations[0], /^\/exports\/codex_exp\/(\d{6}-\d{6})\/alpha$/)
  assert.equal(destinations[0], destinations[1])
  assert.match(destinations[2], /^\/exports\/codex_exp\/(\d{6}-\d{6})\/beta$/)
  assert.equal(destinations[0].split('/').at(-2), destinations[2].split('/').at(-2))
  assert.equal(outcome.done, 3)
  assert.equal(outcome.failed, 0)
})

test('bulk export trusts a zero exit code even when the CLI writes diagnostics to stderr', async () => {
  const item = session('bulk-export-stderr-diagnostic')
  const outcome = await runBulkSerial({
    action: 'export',
    items: [item],
    run: async args => args[0] === 'export-session'
      ? { code: 0, stdout: JSON.stringify({ ok: true, path: '/exports/session.md' }), stderr: 'index read diagnostic\n' }
      : { code: 0, stdout: '[]', stderr: '' },
  })

  assert.equal(outcome.done, 1)
  assert.equal(outcome.failed, 0)
  assert.equal(outcome.results[0].status, 'done')
})

test('bulk export splits one attribution across roots and shares the run timestamp', async () => {
  const first = session('28282828-2828-2828-2828-282828282828', 'active', {
    rootPath: '/workspace/alpha',
    attributionKey: 'shared-scope',
  })
  const second = session('29292929-2929-2929-2929-292929292929', 'active', {
    rootPath: '/workspace/beta',
    attributionKey: 'shared-scope',
  })
  const calls = []
  const RealDate = global.Date
  let clockReads = 0
  global.Date = class extends RealDate {
    constructor(...args) {
      if (args.length) super(...args)
      else super(`2026-07-19T00:00:0${clockReads++}.000Z`)
    }
  }
  let outcome
  try {
    outcome = await runBulkSerial({
      action: 'export',
      items: [first, second],
      exportDestination: '/exports',
      run: async args => {
        calls.push(args)
        return {
          code: 0,
          stdout: JSON.stringify({ ok: true, path: '/exports/session.md' }),
          stderr: '',
        }
      },
    })
  } finally {
    global.Date = RealDate
  }

  const exportCalls = calls.filter(args => args[0] === 'export-session')
  assert.equal(exportCalls.length, 2)
  assert.deepEqual(exportCalls.map(args => args[1]), ['shared-scope', 'shared-scope'])
  const destinations = exportCalls.map(args => args[args.indexOf('--dest') + 1])
  assert.match(destinations[0], /^\/exports\/claude_exp\/(\d{6}-\d{6})\/alpha$/)
  assert.match(destinations[1], /^\/exports\/claude_exp\/(\d{6}-\d{6})\/beta$/)
  assert.equal(destinations[0].split('/').at(-2), destinations[1].split('/').at(-2))
  assert.equal(clockReads, 1)
  assert.equal(outcome.done, 2)
  assert.equal(outcome.failed, 0)
})

test('bulk export disambiguates different roots with the same sanitized project name', async () => {
  const first = session('24242424-2424-2424-2424-242424242424', 'active', {
    rootPath: '/workspace/team:one',
    attributionKey: 'scope-one',
  })
  const second = session('25252525-2525-2525-2525-252525252525', 'active', {
    rootPath: '/other/teamone',
    attributionKey: 'scope-two',
  })
  const harness = await mount([first, second], async args => {
    if (args[0] === 'export-session') {
      return {
        code: 0,
        stdout: JSON.stringify({ ok: true, path: '/exports/session.md' }),
        stderr: '',
      }
    }
  }, undefined, {
    storageGet: (key, fallback) => key === 'exportDestination' ? '/exports' : fallback(),
  })
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Select mode').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Select all 2 filtered').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Export 2').props.onClick()
    await flush()

    const destinations = harness.calls
      .filter(args => args[0] === 'export-session')
      .map(args => args[args.indexOf('--dest') + 1])
    assert.equal(destinations.length, 2)
    assert.match(destinations[0], /^\/exports\/claude_exp\/\d{6}-\d{6}\/teamone-[0-9a-f]{8}$/)
    assert.match(destinations[1], /^\/exports\/claude_exp\/\d{6}-\d{6}\/teamone-[0-9a-f]{8}$/)
    assert.notEqual(destinations[0].split('/').at(-1), destinations[1].split('/').at(-1))
  } finally {
    harness.cleanup()
  }
})

test('bulk export disambiguates project names that differ only by case', async () => {
  const upper = session('30303030-3030-3030-3030-303030303030', 'active', {
    rootPath: '/workspace/Foo',
    attributionKey: 'scope-upper',
  })
  const lower = session('31313131-3131-3131-3131-313131313131', 'active', {
    rootPath: '/other/foo',
    attributionKey: 'scope-lower',
  })
  const calls = []
  await runBulkSerial({
    action: 'export',
    items: [upper, lower],
    exportDestination: '/exports',
    run: async args => {
      calls.push(args)
      return {
        code: 0,
        stdout: JSON.stringify({ ok: true, path: '/exports/session.md' }),
        stderr: '',
      }
    },
  })

  const upperDestination = calls.find(args => args[0] === 'export-session' && args[1] === 'scope-upper').at(-1)
  const lowerDestination = calls.find(args => args[0] === 'export-session' && args[1] === 'scope-lower').at(-1)
  assert.match(upperDestination, /^\/exports\/claude_exp\/\d{6}-\d{6}\/Foo-[0-9a-f]{8}$/)
  assert.match(lowerDestination, /^\/exports\/claude_exp\/\d{6}-\d{6}\/foo-[0-9a-f]{8}$/)
  assert.notEqual(upperDestination.toLowerCase(), lowerDestination.toLowerCase())
})

test('bulk export caps multibyte project segments without splitting characters', async () => {
  const longName = '界'.repeat(100)
  const first = session('multibyte-first', 'active', { rootPath: `/workspace/${longName}`, attributionKey: 'scope-first' })
  const second = session('multibyte-second', 'active', { rootPath: `/other/${longName}`, attributionKey: 'scope-second' })
  const calls = []
  await runBulkSerial({
    action: 'export',
    items: [first, second],
    exportDestination: '/exports',
    run: async args => {
      calls.push(args)
      return { code: 0, stdout: JSON.stringify({ ok: true, path: '/exports/session.md' }), stderr: '' }
    },
  })

  const projectSegments = calls
    .filter(args => args[0] === 'export-session')
    .map(args => args.at(-1).split('/').at(-1))
  assert.equal(projectSegments.length, 2)
  assert.ok(projectSegments.every(segment => new TextEncoder().encode(segment).length <= 255))
  assert.ok(projectSegments.every(segment => /^界+-[0-9a-f]{8}$/.test(segment)))
})

test('bulk export rechecks project-name legality after byte truncation', async () => {
  const longName = `${'a'.repeat(245)}.tail`
  const item = session('post-truncation-project', 'active', {
    rootPath: `/workspace/${longName}`,
    attributionKey: 'scope-post-truncation',
  })
  const calls = []
  await runBulkSerial({
    action: 'export',
    items: [item],
    exportDestination: '/exports',
    run: async args => {
      calls.push(args)
      return { code: 0, stdout: JSON.stringify({ ok: true, path: '/exports/session.md' }), stderr: '' }
    },
  })

  const destination = calls.find(args => args[0] === 'export-session').at(-1)
  const projectName = destination.split('/').at(-1)
  assert.equal(projectName, 'a'.repeat(245))
  assert.equal(projectName.endsWith('.'), false)
})

test('bulk export legalizes its fallback when the sanitized project name is empty', async () => {
  const item = session('empty-project-name', 'active', {
    rootPath: '/workspace/...',
    attributionKey: 'scope-empty-project',
  })
  const calls = []
  await runBulkSerial({
    action: 'export',
    items: [item],
    exportDestination: '/exports',
    unknownProjectName: 'CON.',
    run: async args => {
      calls.push(args)
      return { code: 0, stdout: JSON.stringify({ ok: true, path: '/exports/session.md' }), stderr: '' }
    },
  })

  const destination = calls.find(args => args[0] === 'export-session').at(-1)
  assert.equal(destination.split('/').at(-1), '_CON')
})

test('bulk export aborts after 5 consecutive failures and surfaces skipped sessions', async () => {
  const items = Array.from({ length: 7 }, (_, index) => session(`failure-${index + 1}`))
  const harness = await mount(items, async args => {
    if (args[0] === 'export-session') return { code: 1, stdout: '', stderr: `failure ${args[2]}` }
  })
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Select mode').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Select all 7 filtered').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Export 7').props.onClick()
    await flush()

    assert.equal(harness.calls.filter(args => args[0] === 'export-session').length, 5)
    const renderedText = textOf(harness.plugin.component.render())
    assert.match(renderedText, /Done 0 · Failed 5 · Skipped 2/)
    assert.match(renderedText, /Export stopped after 5 consecutive failures; remaining sessions were skipped\./)
  } finally {
    harness.cleanup()
  }
})

test('bulk export success resets the consecutive-failure guard', async () => {
  const items = Array.from({ length: 6 }, (_, index) => session(`reset-${index + 1}`))
  const calls = []
  let exportIndex = 0
  const outcome = await runBulkSerial({
    action: 'export',
    items,
    run: async args => {
      calls.push(args)
      const succeeds = exportIndex++ === 2
      return succeeds
        ? { code: 0, stdout: JSON.stringify({ ok: true, path: '/exports/session.md' }), stderr: '' }
        : { code: 1, stdout: '', stderr: 'export failed' }
    },
  })

  assert.equal(calls.filter(args => args[0] === 'export-session').length, 6)
  assert.equal(outcome.done, 1)
  assert.equal(outcome.failed, 5)
  assert.equal(outcome.skipped, 0)
  assert.equal(outcome.earlyAborted, false)
})

test('bulk export cancellation stops before issuing the next session export', async () => {
  const first = session('26262626-2626-2626-2626-262626262626', 'active', {
    rootPath: '/workspace/first',
    attributionKey: 'scope-first',
  })
  const second = session('27272727-2727-2727-2727-272727272727', 'active', {
    rootPath: '/workspace/second',
    attributionKey: 'scope-second',
  })
  const calls = []
  let cancelled = false
  const outcome = await runBulkSerial({
    action: 'export',
    items: [first, second],
    exportDestination: '/exports',
    run: async args => {
      calls.push(args)
      cancelled = true
      return {
        code: 0,
        stdout: JSON.stringify({ ok: true, path: '/exports/first.md' }),
        stderr: '',
      }
    },
    isCancelled: () => cancelled,
  })

  const exportCalls = calls.filter(args => args[0] === 'export-session')
  assert.equal(exportCalls.length, 1)
  assert.equal(exportCalls[0][1], 'scope-first')
  assert.equal(outcome.done, 1)
  assert.equal(outcome.cancelled, true)
})

test('bulk export cancellation during the fifth consecutive failure wins over early abort', async () => {
  const items = Array.from({ length: 6 }, (_, index) => session(`cancel-failure-${index + 1}`))
  let exportCount = 0
  let cancelled = false
  const outcome = await runBulkSerial({
    action: 'export',
    items,
    run: async args => {
      exportCount += 1
      if (exportCount === 5) cancelled = true
      return { code: 1, stdout: '', stderr: 'export failed' }
    },
    isCancelled: () => cancelled,
  })

  assert.equal(exportCount, 5)
  assert.equal(outcome.failed, 5)
  assert.equal(outcome.skipped, 0)
  assert.equal(outcome.cancelled, true)
  assert.equal(outcome.earlyAborted, false)
})

test('bulk export cancelled before start runs no commands', async () => {
  const calls = []
  const outcome = await runBulkSerial({
    action: 'export',
    items: [session('cancelled-before-start')],
    run: async args => {
      calls.push(args)
      return { code: 0, stdout: '[]', stderr: '' }
    },
    isCancelled: () => true,
  })

  assert.deepEqual(calls, [])
  assert.deepEqual(outcome.results, [])
  assert.equal(outcome.cancelled, true)
  assert.equal(outcome.earlyAborted, false)
})

test('destination input invalidates an in-flight storage load while typing', async () => {
  const savedDestination = deferred()
  const harness = await mount([], undefined, undefined, {
    storageGet: (key, fallback) => key === 'exportDestination' ? savedDestination.promise : fallback(),
  })
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Settings').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    let input = nodes.find(node => node?.tag === 'input' && node.props?.type === 'text')
    input.props.onInput({ target: { value: '/typed/export' } })
    savedDestination.resolve('/stored/export')
    await flush()

    nodes = flatten(harness.plugin.component.render())
    input = nodes.find(node => node?.tag === 'input' && node.props?.type === 'text')
    assert.equal(input.props.value, '/typed/export')
    input.props.onInput({ target: { value: '   ' } })
    assert.equal(flatten(harness.plugin.component.render()).find(node => node?.tag === 'input' && node.props?.type === 'text').props.value, '~/Downloads')
  } finally {
    savedDestination.resolve('/stored/export')
    harness.cleanup()
  }
})

test('the shared picker routes tree-root and export-destination commits independently', async () => {
  const harness = await mount([session('picker-target-routing')])
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Change tree root').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    assert.ok(nodes.some(node => node?.props?.class === 'ccm-picker-title' && textOf(node) === 'Select tree root directory'))
    nodes.find(node => node?.tag === 'input' && node.props?.class === 'ccm-picker-input').props.onInput({ target: { value: '/picked/root' } })
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Use the entered path as the tree root').props.onClick()
    await flush()

    nodes = flatten(harness.plugin.component.render())
    assert.equal(textOf(nodes.find(node => node?.props?.class === 'ccm-browser-root-path')), '/picked/root')
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Settings').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    assert.equal(nodes.find(node => node?.tag === 'input' && node.props?.['aria-label'] === 'Export destination').props.value, '~/Downloads')
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Browse for export destination').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    assert.ok(nodes.some(node => node?.props?.class === 'ccm-picker-title' && textOf(node) === 'Select export destination'))
    nodes.find(node => node?.tag === 'input' && node.props?.class === 'ccm-picker-input').props.onInput({ target: { value: '/picked/export' } })
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Use the entered path as the export destination').props.onClick()
    await flush()

    nodes = flatten(harness.plugin.component.render())
    assert.equal(textOf(nodes.find(node => node?.props?.class === 'ccm-browser-root-path')), '/picked/root')
    assert.equal(nodes.find(node => node?.tag === 'input' && node.props?.['aria-label'] === 'Export destination').props.value, '/picked/export')
    assert.equal(nodes.some(node => node?.props?.class === 'ccm-picker-overlay'), false)
  } finally {
    harness.cleanup()
  }
})

test('stale picker validation cannot commit after switching target modes', async () => {
  const staleValidation = deferred()
  const harness = await mount([session('picker-cross-target-race')], async args => (
    args[0] === 'check-dir' && args[1] === '/stale/root' ? staleValidation.promise : undefined
  ))
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Change tree root').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'input' && node.props?.class === 'ccm-picker-input').props.onInput({ target: { value: '/stale/root' } })
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Use the entered path as the tree root').props.onClick()
    await flush()

    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Settings').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Browse for export destination').props.onClick()
    assert.match(textOf(harness.plugin.component.render()), /Select export destination/)

    staleValidation.resolve({ code: 0, stdout: JSON.stringify({ exists: true, dir: true }), stderr: '' })
    await flush()

    nodes = flatten(harness.plugin.component.render())
    assert.equal(textOf(nodes.find(node => node?.props?.class === 'ccm-browser-root-path')), '/work')
    assert.equal(nodes.find(node => node?.tag === 'input' && node.props?.['aria-label'] === 'Export destination').props.value, '~/Downloads')
    assert.match(textOf(nodes.find(node => node?.props?.class === 'ccm-picker-title')), /Select export destination/)
  } finally {
    staleValidation.resolve({ code: 0, stdout: JSON.stringify({ exists: true, dir: true }), stderr: '' })
    harness.cleanup()
  }
})

test('picker check-dir failures use the localized export fallback instead of raw CLI text', async () => {
  const harness = await mount([session('picker-check-taxonomy')], async args => args[0] === 'check-dir'
    ? {
        code: 1,
        stdout: '',
        stderr: JSON.stringify({ error: 'future-picker-check-error', message: 'RAW PICKER CHECK FAILURE' }),
      }
    : undefined)
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Change tree root').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'input' && node.props?.class === 'ccm-picker-input').props.onInput({ target: { value: '/picked/error' } })
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Use the entered path as the tree root').props.onClick()
    await flush()

    const rendered = textOf(harness.plugin.component.render())
    assert.match(rendered, /The session could not be exported because of an unexpected error\./)
    assert.doesNotMatch(rendered, /RAW PICKER CHECK FAILURE/)
  } finally {
    harness.cleanup()
  }
})

test('parseCliFailure prefers structured errors, then raw stderr, then the supplied fallback', () => {
  const diagnostic = JSON.stringify({ level: 'warn', message: 'connector diagnostic' })
  const failure = JSON.stringify({ error: 'archive-failed', message: 'final failure' })
  assert.deepEqual(parseCliFailure(failure, 'fallback failure'), {
    error: 'archive-failed',
    message: 'final failure',
  })
  assert.deepEqual(parseCliFailure(`${diagnostic}\n${failure}\n`, 'fallback failure'), {
    error: 'archive-failed',
    message: 'final failure',
  })
  assert.deepEqual(parseCliFailure('command timed out after 30000ms', 'fallback failure'), {
    error: '',
    message: 'command timed out after 30000ms',
  })
  assert.deepEqual(parseCliFailure('  \n', 'fallback failure'), {
    error: '',
    message: 'fallback failure',
  })
})

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
    const input = nodes.find(node => node?.tag === 'input' && node.props?.id === 'session-browser-search-input')
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
    nodes.find(node => node?.tag === 'input' && node.props?.id === 'session-browser-search-input').props.onInput({ target: { value: 'needle' } })
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
    storageGet: (key, fallback) => key === 'treeRoot:claude-code' ? '/stored' : fallback(),
  })
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Change tree root').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    const input = nodes.find(node => node?.tag === 'input' && node.props?.class === 'ccm-picker-input')
    input.props.onInput({ target: { value: '/chosen' } })
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Use the entered path as the tree root').props.onClick()
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
    storageGet: (key, fallback) => key === 'treeRoot:claude-code' ? storedRoot.promise : fallback(),
  })
  try {
    let nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && node.props?.title === 'Change tree root').props.onClick()
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'input' && node.props?.class === 'ccm-picker-input').props.onInput({ target: { value: '/chosen' } })
    nodes = flatten(harness.plugin.component.render())
    nodes.find(node => node?.tag === 'button' && textOf(node) === 'Use the entered path as the tree root').props.onClick()
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
    const usePath = () => flatten(harness.plugin.component.render()).find(node => node?.tag === 'button' && textOf(node) === 'Use the entered path as the tree root')
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

test('a stored tree root for one agent does not leak into another agent', async () => {
  const claudeSession = session('14141414-1414-1414-1414-141414141414', 'active', { rootPath: '/claude-indexed' })
  const codexSession = session('15151515-1515-1515-1515-151515151515', 'active', { rootPath: '/codex-indexed' })
  const capabilities = {
    archive: true,
    rename: false,
    delete: true,
    deleteRequiresArchived: true,
    nativeIndex: true,
    tokenStats: false,
    originFilter: false,
  }
  const harness = await mount([], async args => {
    if (args[0] === 'agents') {
      return {
        code: 0,
        stdout: JSON.stringify([
          { id: 'claude-code', available: true, capabilities },
          { id: 'codex', available: true, capabilities },
        ]),
        stderr: '',
      }
    }
    if (args[0] === 'build-index') {
      const indexed = args[args.indexOf('--agent') + 1] === 'codex' ? [codexSession] : [claudeSession]
      return { code: 0, stdout: JSON.stringify(indexed), stderr: '' }
    }
  }, undefined, {
    storageGet: (key, fallback) => key === 'treeRoot:claude-code' ? '/claude-stored' : fallback(),
  })
  try {
    let nodes = flatten(harness.plugin.component.render())
    assert.equal(textOf(nodes.find(node => node?.props?.class === 'ccm-browser-root-path')), '/claude-stored')

    nodes.find(node => node?.tag === 'select' && node.props?.value === 'claude-code').props.onChange({ target: { value: 'codex' } })
    await flush()

    nodes = flatten(harness.plugin.component.render())
    assert.equal(textOf(nodes.find(node => node?.props?.class === 'ccm-browser-root-path')), '/codex-indexed')
  } finally {
    harness.cleanup()
  }
})
