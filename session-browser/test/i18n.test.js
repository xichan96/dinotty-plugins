const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const esbuild = require('esbuild')

const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-browser-i18n-test-'))
const i18nBundlePath = path.join(bundleDir, 'i18n.cjs')
const uiBundlePath = path.join(bundleDir, 'ui.cjs')
esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/i18n.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: i18nBundlePath,
  logLevel: 'silent',
})
esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/ui.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: uiBundlePath,
  logLevel: 'silent',
})

const { dictionaries, initI18n, resolveLocale, translate } = require(i18nBundlePath)
const { activate } = require(uiBundlePath)

test.after(() => fs.rmSync(bundleDir, { recursive: true, force: true }))

test('en and zh dictionaries have identical key sets', () => {
  assert.deepEqual(Object.keys(dictionaries.zh).sort(), Object.keys(dictionaries.en).sort())
})

test('a missing localized key falls back to the English string', () => {
  const original = dictionaries.zh.settings
  delete dictionaries.zh.settings
  try {
    assert.equal(translate('zh', 'settings'), 'Settings')
  } finally {
    dictionaries.zh.settings = original
  }
})

test('translation parameters interpolate all matching placeholders', () => {
  const localeRef = { value: 'en' }
  const { t } = initI18n(localeRef)
  assert.equal(t('tree-badge', { active: 2, archive: 1, time: '4m' }), '2 active, 1 archive; newest 4m ago')
})

test('locale resolution prefers explicit storage settings over the host language', () => {
  assert.equal(resolveLocale('zh', 'en-US'), 'zh')
  assert.equal(resolveLocale('en', 'zh-CN'), 'en')
  assert.equal(resolveLocale('auto', 'zh-CN'), 'zh')
  assert.equal(resolveLocale('auto', 'zh-TW'), 'zh')
  assert.equal(resolveLocale('auto', 'en-US'), 'en')
  assert.equal(resolveLocale('auto', ''), 'en')
})

function flatten(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) flatten(item, output)
  } else if (value !== null && value !== undefined && value !== false) {
    output.push(value)
    if (typeof value === 'object' && 'children' in value) flatten(value.children, output)
  }
  return output
}

function h(tag, props, ...children) {
  return { tag, props: props || {}, children }
}

test('zh locale renders the session list and localizes an archive confirmation', async () => {
  const previousDocument = global.document
  const previousMutationObserver = global.MutationObserver
  const previousRequestAnimationFrame = global.requestAnimationFrame
  const previousCancelAnimationFrame = global.cancelAnimationFrame
  const mounted = []
  const unmounted = []
  const confirmations = []
  const observer = { observe() {}, disconnect() {} }

  global.document = {
    documentElement: { lang: 'en-US' },
    body: { classList: { add() {}, remove() {} } },
    addEventListener() {},
    removeEventListener() {},
  }
  global.MutationObserver = class {
    constructor(callback) { this.callback = callback }
    observe(...args) { observer.observe(...args) }
    disconnect() { observer.disconnect() }
  }
  global.requestAnimationFrame = callback => setTimeout(callback, 0)
  global.cancelAnimationFrame = handle => clearTimeout(handle)

  const indexedSession = {
    id: '11111111-1111-1111-1111-111111111111',
    rootPath: '/workspace/demo',
    attributionKey: '-workspace-demo',
    title: '测试会话',
    createdAt: '2026-07-16T00:00:00.000Z',
    lastActiveAt: '2026-07-16T01:00:00.000Z',
    messageCount: 2,
    gitBranch: 'main',
    partition: 'active',
    health: 'ok',
    timestampSource: 'event',
    sizeBytes: 1,
  }
  const storage = new Map([
    ['locale', 'zh'],
    ['fontScale', 3],
    ['themeFollowHost', true],
  ])
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
      run: async args => args[0] === 'build-index'
        ? { code: 0, stdout: JSON.stringify([indexedSession]), stderr: '' }
        : { code: 0, stdout: '[]', stderr: '' },
    },
    ui: {
      notify() {},
      confirm: async message => { confirmations.push(message); return false },
    },
    terminal: { activePaneId: () => null },
  }

  try {
    const plugin = activate(ctx)
    plugin.component.setup()
    for (const callback of mounted) callback()
    await new Promise(resolve => setImmediate(resolve))
    await new Promise(resolve => setImmediate(resolve))

    const tree = plugin.component.render()
    const nodes = flatten(tree)
    const texts = nodes.filter(node => typeof node === 'string')
    assert.ok(texts.includes('活跃'))
    assert.ok(texts.includes('测试会话'))

    const archiveButton = nodes.find(node => node?.tag === 'button' && node.props?.title === '归档会话')
    assert.ok(archiveButton)
    archiveButton.props.onClick({ stopPropagation() {} })
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(confirmations, ['归档会话“测试会话”？'])

    for (const callback of unmounted) callback()
  } finally {
    global.document = previousDocument
    global.MutationObserver = previousMutationObserver
    global.requestAnimationFrame = previousRequestAnimationFrame
    global.cancelAnimationFrame = previousCancelAnimationFrame
  }
})
