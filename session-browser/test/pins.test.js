const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { afterEach, beforeEach, test } = require('node:test')

const CLI = process.env.CC_SB_TEST_CLI || path.resolve(__dirname, '../dist/cli')
const AGENT = 'claude-code'

let fixture
let env
let children

function pinsDir() {
  return path.join(env.CC_SB_DATA_DIR, 'pins')
}

function pinFile() {
  return path.join(pinsDir(), `${AGENT}.json`)
}

function mkdir(name) {
  const result = path.join(fixture, name)
  fs.mkdirSync(result, { recursive: true })
  return result
}

function storedPin(pinPath, addedAt = 1, matchKeys = [pinPath.toLowerCase()]) {
  return { path: pinPath, addedAt, matchKeys }
}

function writeStore(pins) {
  fs.mkdirSync(pinsDir(), { recursive: true })
  fs.writeFileSync(pinFile(), JSON.stringify({ version: 1, pins }), { mode: 0o600 })
}

function readStore() {
  return JSON.parse(fs.readFileSync(pinFile(), 'utf8'))
}

function run(args, extraEnv = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...env, ...extraEnv },
  })
}

function runJson(args, extraEnv = {}) {
  const result = run(args, extraEnv)
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

function spawnCli(args, extraEnv = {}) {
  const child = spawn(process.execPath, [CLI, ...args], {
    env: { ...env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  const completion = new Promise(resolve => {
    child.on('close', (code, signal) => {
      children.delete(child)
      resolve({ code, signal, stdout, stderr })
    })
  })
  return { child, completion }
}

async function waitFor(predicate, message, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.fail(message)
}

function writePreload(name, source) {
  const preload = path.join(fixture, name)
  fs.writeFileSync(preload, source)
  return preload
}

function nodeOptions(preload) {
  return `${env.NODE_OPTIONS || ''} --require=${preload}`.trim()
}

function renameBarrier() {
  const barrier = mkdir('rename-barrier')
  const preload = writePreload('rename-barrier.cjs', [
    "const fs = require('node:fs')",
    'const original = fs.renameSync',
    'fs.renameSync = function(source, destination) {',
    "  if (String(source).includes('.json.tmp.') && String(destination).endsWith('.json')) {",
    "    fs.writeFileSync(require('node:path').join(process.env.PIN_BARRIER, `ready.${process.pid}`), '')",
    '    const wait = new Int32Array(new SharedArrayBuffer(4))',
    "    while (!fs.existsSync(require('node:path').join(process.env.PIN_BARRIER, 'release'))) Atomics.wait(wait, 0, 0, 10)",
    '  }',
    '  return original.apply(this, arguments)',
    '}',
  ].join('\n'))
  return {
    barrier,
    childEnv: { PIN_BARRIER: barrier, NODE_OPTIONS: nodeOptions(preload) },
    readyCount: () => fs.readdirSync(barrier).filter(name => name.startsWith('ready.')).length,
    release: () => fs.writeFileSync(path.join(barrier, 'release'), ''),
  }
}

function sidecarNames() {
  return fs.readdirSync(pinsDir()).filter(name => name.startsWith(`${AGENT}.json.corrupt.`))
}

function matchKey(value) {
  const trimmed = value.normalize('NFC').toLowerCase().trim()
  const absolute = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  const parts = []
  for (const part of absolute.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.length ? `/${parts.join('/')}` : '/'
}

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'session-browser-pins-'))
  env = {
    ...process.env,
    HOME: path.join(fixture, 'home'),
    CC_SB_PROJECTS_DIR: path.join(fixture, 'projects'),
    CC_SB_ARCHIVE_DIR: path.join(fixture, 'projects-archive'),
    CC_SB_SESSIONS_DIR: path.join(fixture, 'sessions'),
    CC_SB_DATA_DIR: path.join(fixture, 'data'),
  }
  children = new Set()
})

afterEach(async () => {
  for (const child of children) child.kill('SIGKILL')
  await Promise.all([...children].map(child => new Promise(resolve => child.once('close', resolve))))
  fs.rmSync(fixture, { recursive: true, force: true })
})

test('add, list, and remove round-trip while absent removal is a no-op', () => {
  const folder = mkdir('round-trip')
  const add = runJson(['add-pin', AGENT, folder])
  assert.deepEqual(add, { canonicalPath: fs.realpathSync.native(folder), outcome: 'applied' })

  const listed = runJson(['list-pins', AGENT])
  assert.equal(listed.pins.length, 1)
  assert.deepEqual({ path: listed.pins[0].path, exists: listed.pins[0].exists }, { path: add.canonicalPath, exists: true })
  assert.equal(typeof listed.pins[0].addedAt, 'number')

  const absent = path.join(fixture, 'absent')
  assert.deepEqual(runJson(['remove-pin', AGENT, absent]), {
    results: [{ path: absent, outcome: 'absent' }],
    changed: false,
  })
  assert.deepEqual(runJson(['remove-pin', AGENT, add.canonicalPath]), {
    results: [{ path: add.canonicalPath, outcome: 'applied' }],
    changed: true,
  })
  assert.deepEqual(runJson(['list-pins', AGENT]), { pins: [] })
})

test('bulk remove reports applied, absent, and duplicate independently', () => {
  const first = mkdir('bulk-first')
  const second = mkdir('bulk-second')
  const firstPath = runJson(['add-pin', AGENT, first]).canonicalPath
  const secondPath = runJson(['add-pin', AGENT, second]).canonicalPath
  const missing = path.join(fixture, 'bulk-missing')
  const result = runJson(['remove-pin', AGENT, firstPath, missing, firstPath, secondPath])
  assert.deepEqual(result, {
    results: [
      { path: firstPath, outcome: 'applied' },
      { path: missing, outcome: 'absent' },
      { path: firstPath, outcome: 'duplicate' },
      { path: secondPath, outcome: 'applied' },
    ],
    changed: true,
  })
  assert.deepEqual(readStore().pins, [])
})

test('empty remove and promote batches are successful no-ops', () => {
  assert.deepEqual(runJson(['remove-pin', AGENT]), { results: [], changed: false })
  assert.deepEqual(runJson(['promote-pins', AGENT]), { results: [], changed: false })
  assert.equal(fs.existsSync(pinFile()), false)
})

test('the 500-pin cap rejects add while a 500-path promote argv succeeds', () => {
  const pins = Array.from({ length: 500 }, (_, index) => storedPin(`/pins/${String(index).padStart(3, '0')}`, index + 1))
  writeStore(pins)
  const extra = mkdir('over-cap')
  const rejected = run(['add-pin', AGENT, extra])
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /500-pin limit/)
  assert.equal(readStore().pins.length, 500)

  const promoted = runJson(['promote-pins', AGENT, ...pins.map(pin => pin.path).reverse()])
  assert.equal(promoted.results.length, 500)
  assert.equal(promoted.results.every(item => item.outcome === 'applied'), true)
})

test('symlink identity deduplicates and stores canonical plus supplied-form match keys', () => {
  const target = mkdir('identity-target')
  const link = path.join(fixture, 'identity-link')
  fs.symlinkSync(target, link, 'dir')
  const first = runJson(['add-pin', AGENT, link])
  assert.equal(first.outcome, 'applied')
  assert.equal(first.canonicalPath, fs.realpathSync.native(target))
  assert.notEqual(first.canonicalPath, link)
  assert.equal(runJson(['add-pin', AGENT, target]).outcome, 'duplicate')
  const [pin] = readStore().pins
  assert.deepEqual(new Set(pin.matchKeys), new Set([
    matchKey(first.canonicalPath),
    matchKey(link),
    matchKey(target),
  ]))
})

test('duplicate add merges a new symlink spelling once and reports whether storage changed', () => {
  const target = mkdir('duplicate-merge-target')
  const link = path.join(fixture, 'duplicate-merge-link')
  fs.symlinkSync(target, link, 'dir')
  const first = runJson(['add-pin', AGENT, target])

  assert.deepEqual(runJson(['add-pin', AGENT, link]), {
    canonicalPath: first.canonicalPath,
    outcome: 'duplicate',
    matchKeysMerged: true,
  })
  const afterMerge = readStore()
  assert.equal(afterMerge.pins.length, 1)
  assert.deepEqual(new Set(afterMerge.pins[0].matchKeys), new Set([
    matchKey(first.canonicalPath),
    matchKey(target),
    matchKey(link),
  ]))

  assert.deepEqual(runJson(['add-pin', AGENT, link]), {
    canonicalPath: first.canonicalPath,
    outcome: 'duplicate',
    matchKeysMerged: false,
  })
  assert.deepEqual(readStore(), afterMerge)
})

test('match keys normalize case, Unicode composition, and the supplied symlink form', () => {
  const target = mkdir('Unicode-\u00c9')
  const decomposedLink = path.join(fixture, 'LINK-E\u0301')
  fs.symlinkSync(target, decomposedLink, 'dir')
  runJson(['add-pin', AGENT, decomposedLink])
  const [pin] = readStore().pins
  assert.ok(pin.matchKeys.includes(matchKey(pin.path.toUpperCase())))
  assert.ok(pin.matchKeys.includes(matchKey(decomposedLink)))
  assert.equal(matchKey(decomposedLink).includes('e\u0301'), false)
})

test('realpathSync.native canonicalizes differently-cased identity on case-insensitive volumes', t => {
  const original = mkdir('NativeCaseProbe')
  const alternate = path.join(path.dirname(original), path.basename(original).toLowerCase())
  let sameDirectory = false
  try {
    const left = fs.statSync(original)
    const right = fs.statSync(alternate)
    sameDirectory = left.dev === right.dev && left.ino === right.ino
  } catch { /* case-sensitive volume */ }
  if (!sameDirectory) return t.skip('fixture volume is case-sensitive')

  const nativeCanonical = fs.realpathSync.native(original)
  assert.equal(fs.realpathSync.native(alternate), nativeCanonical)
  assert.notEqual(fs.realpathSync(alternate), nativeCanonical)
  const first = runJson(['add-pin', AGENT, alternate])
  assert.equal(first.canonicalPath, nativeCanonical)
  assert.notEqual(first.canonicalPath, alternate)
  assert.equal(runJson(['add-pin', AGENT, original]).outcome, 'duplicate')
  assert.equal(readStore().pins.length, 1)
})

test('pin lookup canonicalizes non-canonical, canonical, and differently-cased paths', t => {
  const nonCanonicalPath = mkdir('LookupCaseProbe')
  const canonicalPath = fs.realpathSync.native(nonCanonicalPath)
  if (canonicalPath === nonCanonicalPath) return t.skip('os.tmpdir() does not expose a non-canonical path spelling')
  assert.notEqual(canonicalPath, nonCanonicalPath)

  const differentlyCasedPath = path.join(path.dirname(nonCanonicalPath), path.basename(nonCanonicalPath).toLowerCase())
  let sameDirectory = false
  try {
    const left = fs.statSync(nonCanonicalPath)
    const right = fs.statSync(differentlyCasedPath)
    sameDirectory = left.dev === right.dev && left.ino === right.ino
  } catch { /* case-sensitive volume */ }
  if (!sameDirectory) return t.skip('fixture volume is case-sensitive')
  assert.equal(fs.realpathSync.native(differentlyCasedPath), canonicalPath)

  const anchorPath = runJson(['add-pin', AGENT, mkdir('lookup-anchor')]).canonicalPath
  for (const lookupPath of [nonCanonicalPath, canonicalPath, differentlyCasedPath]) {
    assert.deepEqual(runJson(['add-pin', AGENT, nonCanonicalPath]), { canonicalPath, outcome: 'applied' })
    assert.deepEqual(readStore().pins.map(pin => pin.path), [canonicalPath, anchorPath])

    assert.deepEqual(runJson(['move-pin', AGENT, lookupPath, 'down']), { outcome: 'applied' })
    assert.deepEqual(readStore().pins.map(pin => pin.path), [anchorPath, canonicalPath])

    assert.deepEqual(runJson(['promote-pins', AGENT, lookupPath]), {
      results: [{ path: lookupPath, outcome: 'applied' }],
      changed: true,
    })
    assert.deepEqual(readStore().pins.map(pin => pin.path), [canonicalPath, anchorPath])

    assert.deepEqual(runJson(['remove-pin', AGENT, lookupPath]), {
      results: [{ path: lookupPath, outcome: 'applied' }],
      changed: true,
    })
    assert.deepEqual(readStore().pins.map(pin => pin.path), [anchorPath])
  }
})

test('new pins prepend and relative up/down moves one current position without silent reversal', () => {
  const a = mkdir('order-a')
  const b = mkdir('order-b')
  const c = mkdir('order-c')
  const aPath = runJson(['add-pin', AGENT, a]).canonicalPath
  const bPath = runJson(['add-pin', AGENT, b]).canonicalPath
  const cPath = runJson(['add-pin', AGENT, c]).canonicalPath
  assert.deepEqual(readStore().pins.map(pin => pin.path), [cPath, bPath, aPath])
  assert.deepEqual(runJson(['move-pin', AGENT, cPath, 'up']), { outcome: 'applied' })
  assert.deepEqual(readStore().pins.map(pin => pin.path), [cPath, bPath, aPath])
  runJson(['move-pin', AGENT, aPath, 'up'])
  assert.deepEqual(readStore().pins.map(pin => pin.path), [cPath, aPath, bPath])
  runJson(['move-pin', AGENT, cPath, 'down'])
  assert.deepEqual(readStore().pins.map(pin => pin.path), [aPath, cPath, bPath])
  runJson(['move-pin', AGENT, bPath, 'up'])
  assert.deepEqual(readStore().pins.map(pin => pin.path), [aPath, bPath, cPath])
})

test('serialized rapid relative moves produce a net two-position movement', () => {
  const pins = ['/a', '/b', '/c', '/d'].map((pinPath, index) => storedPin(pinPath, index + 1))
  writeStore(pins)
  runJson(['move-pin', AGENT, '/d', 'up'])
  runJson(['move-pin', AGENT, '/d', 'up'])
  assert.deepEqual(readStore().pins.map(pin => pin.path), ['/a', '/d', '/b', '/c'])
})

test('promote uses locale-independent lowercased basename then canonical-path code-unit order', () => {
  const pins = [
    storedPin('/remain/first', 1),
    storedPin('/z/Zed', 2),
    storedPin('/zzz/ALPHA', 3),
    storedPin('/other/alpha', 4),
  ]
  const selected = ['/z/Zed', '/zzz/ALPHA', '/other/alpha']
  writeStore(pins)
  const first = runJson(['promote-pins', AGENT, ...selected], { LANG: 'tr_TR.UTF-8', LC_ALL: 'tr_TR.UTF-8' })
  assert.equal(first.changed, true)
  const turkishBytes = fs.readFileSync(pinFile())
  assert.deepEqual(readStore().pins.map(pin => pin.path), ['/other/alpha', '/zzz/ALPHA', '/z/Zed', '/remain/first'])

  writeStore(pins)
  runJson(['promote-pins', AGENT, ...selected], { LANG: 'C', LC_ALL: 'C' })
  assert.deepEqual(fs.readFileSync(pinFile()), turkishBytes)
})

test('list retains a deleted pin and reports exists false', () => {
  const folder = mkdir('later-deleted')
  const canonicalPath = runJson(['add-pin', AGENT, folder]).canonicalPath
  fs.rmSync(folder, { recursive: true })
  assert.deepEqual(runJson(['list-pins', AGENT]).pins.map(pin => ({ path: pin.path, exists: pin.exists })), [
    { path: canonicalPath, exists: false },
  ])
  assert.equal(readStore().pins[0].path, canonicalPath)
})

test('a deleted pin remains removable by its stored canonical path', () => {
  const folder = mkdir('deleted-removal')
  const canonicalPath = runJson(['add-pin', AGENT, folder]).canonicalPath
  fs.rmSync(folder, { recursive: true })
  assert.deepEqual(runJson(['remove-pin', AGENT, canonicalPath]), {
    results: [{ path: canonicalPath, outcome: 'applied' }],
    changed: true,
  })
  assert.deepEqual(readStore().pins, [])
})

test('atomic replace exposes the old list until one whole new list is published', async () => {
  const oldFolder = mkdir('atomic-old')
  const newFolder = mkdir('atomic-new')
  const oldPath = runJson(['add-pin', AGENT, oldFolder]).canonicalPath
  const barrier = renameBarrier()
  const writer = spawnCli(['add-pin', AGENT, newFolder], barrier.childEnv)
  await waitFor(() => barrier.readyCount() === 1, 'writer did not reach the rename barrier')
  assert.deepEqual(runJson(['list-pins', AGENT]).pins.map(pin => pin.path), [oldPath])
  barrier.release()
  const result = await writer.completion
  assert.equal(result.code, 0, result.stderr)
  const finalPaths = runJson(['list-pins', AGENT]).pins.map(pin => pin.path)
  assert.deepEqual(finalPaths, [fs.realpathSync.native(newFolder), oldPath])
})

test('two genuinely overlapping mutations keep valid JSON and lose at most one edit', async () => {
  const base = mkdir('concurrent-base')
  const left = mkdir('concurrent-left')
  const right = mkdir('concurrent-right')
  const basePath = runJson(['add-pin', AGENT, base]).canonicalPath
  const barrier = renameBarrier()
  const leftWriter = spawnCli(['add-pin', AGENT, left], barrier.childEnv)
  const rightWriter = spawnCli(['add-pin', AGENT, right], barrier.childEnv)
  await waitFor(() => barrier.readyCount() === 2, 'writers did not overlap at the publish barrier')

  const parseFailures = []
  const reader = setInterval(() => {
    try { JSON.parse(fs.readFileSync(pinFile(), 'utf8')) } catch (error) { parseFailures.push(error) }
  }, 0)
  barrier.release()
  const [leftResult, rightResult] = await Promise.all([leftWriter.completion, rightWriter.completion])
  clearInterval(reader)
  assert.equal(leftResult.code, 0, leftResult.stderr)
  assert.equal(rightResult.code, 0, rightResult.stderr)
  assert.deepEqual(parseFailures, [])
  const final = readStore()
  assert.equal(final.version, 1)
  assert.equal(final.pins.some(pin => pin.path === basePath), true)
  const editsRetained = [left, right].filter(folder => final.pins.some(pin => pin.path === fs.realpathSync.native(folder)))
  assert.ok(editsRetained.length >= 1, 'more than one overlapping edit was lost')
})

test('a pre-existing process temp makes wx fail without truncating or unlinking it', async () => {
  const folder = mkdir('exclusive-folder')
  const barrier = mkdir('open-barrier')
  const preload = writePreload('open-barrier.cjs', [
    "const fs = require('node:fs')",
    "const path = require('node:path')",
    'const original = fs.openSync',
    'fs.openSync = function(target, flags) {',
    "  if (String(target).includes('.json.tmp.') && flags === 'wx') {",
    "    fs.writeFileSync(path.join(process.env.PIN_BARRIER, `ready.${process.pid}`), '')",
    '    const wait = new Int32Array(new SharedArrayBuffer(4))',
    "    while (!fs.existsSync(path.join(process.env.PIN_BARRIER, 'release'))) Atomics.wait(wait, 0, 0, 10)",
    '  }',
    '  return original.apply(this, arguments)',
    '}',
  ].join('\n'))
  const writer = spawnCli(['add-pin', AGENT, folder], {
    PIN_BARRIER: barrier,
    NODE_OPTIONS: nodeOptions(preload),
  })
  await waitFor(() => fs.existsSync(path.join(barrier, `ready.${writer.child.pid}`)), 'writer did not reach temp open')
  fs.mkdirSync(pinsDir(), { recursive: true })
  const collision = path.join(pinsDir(), `.${AGENT}.json.tmp.${writer.child.pid}.1`)
  fs.writeFileSync(collision, 'sentinel')
  fs.writeFileSync(path.join(barrier, 'release'), '')
  const result = await writer.completion
  assert.equal(result.code, 1)
  assert.equal(fs.readFileSync(collision, 'utf8'), 'sentinel')
  assert.equal(fs.existsSync(pinFile()), false)
})

test('replacement destination has mode 0600 under a 0022 umask', () => {
  const folder = mkdir('permissions')
  const preload = writePreload('umask.cjs', 'process.umask(0o022)\n')
  runJson(['add-pin', AGENT, folder], { NODE_OPTIONS: nodeOptions(preload) })
  assert.equal(fs.statSync(pinFile()).mode & 0o777, 0o600)
})

test('temp fd fsync occurs before rename and containing-directory fsync', () => {
  const folder = mkdir('durability')
  const log = path.join(fixture, 'durability.log')
  const preload = writePreload('durability.cjs', [
    "const fs = require('node:fs')",
    "const path = require('node:path')",
    'const descriptors = new Map()',
    'const originalOpen = fs.openSync',
    'const originalClose = fs.closeSync',
    'const originalFsync = fs.fsyncSync',
    'const originalRename = fs.renameSync',
    'const originalAppend = fs.appendFileSync',
    "const log = value => originalAppend(process.env.PIN_DURABILITY_LOG, `${value}\\n`)",
    'fs.openSync = function(target) { const fd = originalOpen.apply(this, arguments); descriptors.set(fd, String(target)); return fd }',
    "fs.fsyncSync = function(fd) { log(`fsync:${path.basename(descriptors.get(fd) || '?')}`); return originalFsync.apply(this, arguments) }",
    "fs.renameSync = function(source, destination) { log(`rename:${path.basename(source)}>${path.basename(destination)}`); return originalRename.apply(this, arguments) }",
    'fs.closeSync = function(fd) { try { return originalClose.apply(this, arguments) } finally { descriptors.delete(fd) } }',
  ].join('\n'))
  runJson(['add-pin', AGENT, folder], {
    PIN_DURABILITY_LOG: log,
    NODE_OPTIONS: nodeOptions(preload),
  })
  const events = fs.readFileSync(log, 'utf8').trim().split('\n')
  const tempFsync = events.findIndex(event => event.startsWith(`fsync:.${AGENT}.json.tmp.`))
  const rename = events.findIndex(event => event.startsWith(`rename:.${AGENT}.json.tmp.`))
  const directoryFsync = events.findIndex((event, index) => index > rename && event === 'fsync:pins')
  assert.ok(tempFsync >= 0, events.join('\n'))
  assert.ok(rename > tempFsync, events.join('\n'))
  assert.ok(directoryFsync > rename, events.join('\n'))
})

test('pin temp and corrupt-sidecar descriptors are relinquished before a failing close', () => {
  const preload = writePreload('close-failure.cjs', [
    "const fs = require('node:fs')",
    'const originalOpen = fs.openSync',
    'const originalClose = fs.closeSync',
    'const originalAppend = fs.appendFileSync',
    'const descriptors = new Map()',
    'const failed = new Set()',
    'fs.openSync = function(target) { const fd = originalOpen.apply(this, arguments); descriptors.set(fd, String(target)); return fd }',
    'fs.closeSync = function(fd) {',
    '  const target = descriptors.get(fd) || ""',
    '  if (target.includes(process.env.PIN_CLOSE_TARGET)) {',
    '    originalAppend(process.env.PIN_CLOSE_LOG, `${fd}:${target}\\n`)',
    '    if (!failed.has(fd)) {',
    '      failed.add(fd)',
    '      originalClose.call(this, fd)',
    '      throw new Error("synthetic close failure")',
    '    }',
    '  }',
    '  return originalClose.apply(this, arguments)',
    '}',
  ].join('\n'))
  const closeAttempts = (target, args, prepare) => {
    const log = path.join(fixture, `${target.replaceAll('.', '')}.log`)
    prepare()
    const result = run(args, {
      NODE_OPTIONS: nodeOptions(preload),
      PIN_CLOSE_TARGET: target,
      PIN_CLOSE_LOG: log,
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /synthetic close failure/)
    return fs.readFileSync(log, 'utf8').trim().split('\n')
  }

  const tempAttempts = closeAttempts('.json.tmp.', ['add-pin', AGENT, mkdir('close-failure-add')], () => {})
  const sidecarAttempts = closeAttempts('.json.corrupt.', ['list-pins', AGENT], () => {
    fs.mkdirSync(pinsDir(), { recursive: true })
    fs.writeFileSync(pinFile(), 'close-failure-corrupt')
  })
  assert.deepEqual({
    temp: tempAttempts.length,
    corruptSidecar: sidecarAttempts.length,
  }, {
    temp: 1,
    corruptSidecar: 1,
  }, [...tempAttempts, ...sidecarAttempts].join('\n'))
})

test('SIGKILL during the write protocol leaves the previous file byte-intact', async () => {
  const originalFolder = mkdir('crash-original')
  const newFolder = mkdir('crash-new')
  runJson(['add-pin', AGENT, originalFolder])
  const previous = fs.readFileSync(pinFile())
  const barrier = mkdir('crash-barrier')
  const preload = writePreload('crash-barrier.cjs', [
    "const fs = require('node:fs')",
    "const path = require('node:path')",
    'const descriptors = new Map()',
    'const originalOpen = fs.openSync',
    'const originalClose = fs.closeSync',
    'const originalFsync = fs.fsyncSync',
    'fs.openSync = function(target) { const fd = originalOpen.apply(this, arguments); descriptors.set(fd, String(target)); return fd }',
    'fs.closeSync = function(fd) { try { return originalClose.apply(this, arguments) } finally { descriptors.delete(fd) } }',
    'fs.fsyncSync = function(fd) {',
    "  if ((descriptors.get(fd) || '').includes('.json.tmp.')) {",
    "    fs.writeFileSync(path.join(process.env.PIN_BARRIER, `ready.${process.pid}`), '')",
    '    const wait = new Int32Array(new SharedArrayBuffer(4))',
    "    while (!fs.existsSync(path.join(process.env.PIN_BARRIER, 'release'))) Atomics.wait(wait, 0, 0, 10)",
    '  }',
    '  return originalFsync.apply(this, arguments)',
    '}',
  ].join('\n'))
  const writer = spawnCli(['add-pin', AGENT, newFolder], {
    PIN_BARRIER: barrier,
    NODE_OPTIONS: nodeOptions(preload),
  })
  await waitFor(() => fs.existsSync(path.join(barrier, `ready.${writer.child.pid}`)), 'writer did not pause mid-write before temp fsync')
  writer.child.kill('SIGKILL')
  const result = await writer.completion
  assert.equal(result.signal, 'SIGKILL')
  assert.deepEqual(fs.readFileSync(pinFile()), previous)
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(pinFile(), 'utf8')))
})

test('a real EACCES read failure aborts closed and writes nothing', () => {
  writeStore([storedPin('/read-error-original')])
  const previous = fs.readFileSync(pinFile())
  const folder = mkdir('read-error-new')
  fs.chmodSync(pinFile(), 0o000)
  const result = run(['add-pin', AGENT, folder])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /pin-list-read-failed/)
  fs.chmodSync(pinFile(), 0o600)
  assert.deepEqual(fs.readFileSync(pinFile()), previous)
  assert.deepEqual(fs.readdirSync(pinsDir()), [`${AGENT}.json`])
})

test('corrupt mutation preserves hashed bytes, aborts, and leaves the live file in place', () => {
  fs.mkdirSync(pinsDir(), { recursive: true })
  const corrupt = Buffer.from('{not json\n')
  fs.writeFileSync(pinFile(), corrupt)
  const folder = mkdir('corrupt-add')
  const result = run(['add-pin', AGENT, folder])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /corrupt-pin-list/)
  assert.deepEqual(fs.readFileSync(pinFile()), corrupt)
  assert.equal(sidecarNames().length, 1)
  assert.deepEqual(fs.readFileSync(path.join(pinsDir(), sidecarNames()[0])), corrupt)
})

test('schema-invalid input is corrupt rather than an empty or missing list', () => {
  fs.mkdirSync(pinsDir(), { recursive: true })
  fs.writeFileSync(pinFile(), JSON.stringify({ version: 1, pins: [{ path: '/bad' }] }))
  const listed = runJson(['list-pins', AGENT])
  assert.deepEqual(listed.pins, [])
  assert.equal(listed.corrupt, true)
  assert.equal(typeof listed.sidecar, 'string')
})

test('legacy missing matchKeys is mutable while a present malformed field is corrupt everywhere', () => {
  writeStore([{ path: '/legacy-pin', addedAt: 1 }])
  assert.deepEqual(runJson(['list-pins', AGENT]), {
    pins: [{ path: '/legacy-pin', addedAt: 1, exists: false, matchKeys: [] }],
  })
  assert.deepEqual(runJson(['remove-pin', AGENT, '/legacy-pin']), {
    results: [{ path: '/legacy-pin', outcome: 'applied' }],
    changed: true,
  })

  writeStore([{ path: '/malformed-pin', addedAt: 2, matchKeys: 'not-an-array' }])
  const listed = runJson(['list-pins', AGENT])
  assert.deepEqual(listed.pins, [])
  assert.equal(listed.corrupt, true)
  const mutation = run(['remove-pin', AGENT, '/malformed-pin'])
  assert.equal(mutation.status, 1)
  assert.match(mutation.stderr, /corrupt-pin-list/)
})

test('reading identical corrupt bytes 50 times creates exactly one sidecar', () => {
  fs.mkdirSync(pinsDir(), { recursive: true })
  fs.writeFileSync(pinFile(), 'same corrupt bytes')
  for (let index = 0; index < 50; index++) {
    const result = runJson(['list-pins', AGENT])
    assert.equal(result.corrupt, true)
  }
  assert.equal(sidecarNames().length, 1)
})

test('corrupt sidecars are capped at ten distinct oldest-preserving copies', () => {
  fs.mkdirSync(pinsDir(), { recursive: true })
  for (let index = 0; index < 12; index++) {
    fs.writeFileSync(pinFile(), `corrupt-${index}`)
    assert.equal(runJson(['list-pins', AGENT]).corrupt, true)
  }
  assert.equal(sidecarNames().length, 10)
})

test('reusing an old corrupt sidecar keeps the returned path past the retention cap', () => {
  fs.mkdirSync(pinsDir(), { recursive: true })
  const reusedBytes = Buffer.from('corrupt bytes that will recur')
  fs.writeFileSync(pinFile(), reusedBytes)
  const first = runJson(['list-pins', AGENT])
  assert.equal(first.corrupt, true)
  const reusedSidecar = first.sidecar
  fs.utimesSync(reusedSidecar, new Date(0), new Date(0))

  for (let index = 0; index < 9; index++) {
    fs.writeFileSync(pinFile(), `different-corrupt-bytes-${index}`)
    assert.equal(runJson(['list-pins', AGENT]).corrupt, true)
  }
  fs.writeFileSync(path.join(pinsDir(), `${AGENT}.json.corrupt.extra-newer-sidecar`), 'extra')
  assert.equal(sidecarNames().length, 11)

  fs.writeFileSync(pinFile(), reusedBytes)
  const current = runJson(['list-pins', AGENT])
  assert.equal(current.sidecar, reusedSidecar)
  assert.equal(fs.existsSync(current.sidecar), true, `returned sidecar was pruned: ${current.sidecar}`)
})

test('sidecar pruning skips an entry removed between readdir and stat', () => {
  fs.mkdirSync(pinsDir(), { recursive: true })
  const racedSidecar = path.join(pinsDir(), `${AGENT}.json.corrupt.raced`)
  for (let index = 0; index < 11; index++) {
    const sidecar = index === 0
      ? racedSidecar
      : path.join(pinsDir(), `${AGENT}.json.corrupt.existing-${index}`)
    fs.writeFileSync(sidecar, `sidecar-${index}`)
  }
  fs.writeFileSync(pinFile(), 'new corrupt bytes for pruning')
  const preload = writePreload('sidecar-stat-race.cjs', [
    "const fs = require('node:fs')",
    'const originalStat = fs.statSync',
    'let raced = false',
    'fs.statSync = function(target) {',
    '  if (!raced && String(target) === process.env.PIN_RACED_SIDECAR) {',
    '    raced = true',
    '    try { fs.unlinkSync(target) } catch {}',
    '    const error = new Error("simulated readdir/stat race")',
    '    error.code = "ENOENT"',
    '    throw error',
    '  }',
    '  return originalStat.apply(this, arguments)',
    '}',
  ].join('\n'))
  const result = run(['list-pins', AGENT], {
    NODE_OPTIONS: nodeOptions(preload),
    PIN_RACED_SIDECAR: racedSidecar,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).corrupt, true)
  assert.equal(sidecarNames().length, 10)
})

test('concurrent corrupt observers preserve held bytes without touching a repaired live file', async () => {
  fs.mkdirSync(pinsDir(), { recursive: true })
  const corrupt = Buffer.from('corrupt ABA bytes')
  fs.writeFileSync(pinFile(), corrupt)
  const barrier = mkdir('sidecar-barrier')
  const preload = writePreload('sidecar-barrier.cjs', [
    "const fs = require('node:fs')",
    "const path = require('node:path')",
    'const original = fs.openSync',
    'fs.openSync = function(target, flags) {',
    "  if (String(target).includes('.json.corrupt.') && flags === 'wx') {",
    "    fs.writeFileSync(path.join(process.env.PIN_BARRIER, `ready.${process.pid}`), '')",
    '    const wait = new Int32Array(new SharedArrayBuffer(4))',
    "    while (!fs.existsSync(path.join(process.env.PIN_BARRIER, 'release'))) Atomics.wait(wait, 0, 0, 10)",
    '  }',
    '  return original.apply(this, arguments)',
    '}',
  ].join('\n'))
  const childEnv = { PIN_BARRIER: barrier, NODE_OPTIONS: nodeOptions(preload) }
  const first = spawnCli(['list-pins', AGENT], childEnv)
  const second = spawnCli(['list-pins', AGENT], childEnv)
  await waitFor(() => fs.readdirSync(barrier).filter(name => name.startsWith('ready.')).length === 2, 'corrupt readers did not overlap')
  const repaired = { version: 1, pins: [storedPin('/repaired')] }
  fs.writeFileSync(pinFile(), JSON.stringify(repaired))
  fs.writeFileSync(path.join(barrier, 'release'), '')
  const [firstResult, secondResult] = await Promise.all([first.completion, second.completion])
  assert.equal(firstResult.code, 0, firstResult.stderr)
  assert.equal(secondResult.code, 0, secondResult.stderr)
  assert.equal(JSON.parse(firstResult.stdout).corrupt, true)
  assert.equal(JSON.parse(secondResult.stdout).corrupt, true)
  assert.deepEqual(readStore(), repaired)
  assert.equal(sidecarNames().length, 1)
  assert.deepEqual(fs.readFileSync(path.join(pinsDir(), sidecarNames()[0])), corrupt)
})

test('--reset-corrupt re-verifies a repaired file and proceeds from repaired pins', () => {
  fs.mkdirSync(pinsDir(), { recursive: true })
  fs.writeFileSync(pinFile(), 'broken before abort')
  const newFolder = mkdir('reset-new')
  assert.equal(run(['add-pin', AGENT, newFolder]).status, 1)
  const repaired = storedPin('/repaired-pin')
  writeStore([repaired])
  const result = runJson(['add-pin', AGENT, newFolder, '--reset-corrupt'])
  assert.equal(result.outcome, 'applied')
  assert.deepEqual(readStore().pins.map(pin => pin.path), [result.canonicalPath, repaired.path])
})

test('--reset-corrupt resets bytes only while still corrupt and preserves a sidecar', () => {
  fs.mkdirSync(pinsDir(), { recursive: true })
  const corrupt = Buffer.from('still broken')
  fs.writeFileSync(pinFile(), corrupt)
  const result = runJson(['remove-pin', AGENT, '--reset-corrupt'])
  assert.deepEqual(result, { results: [], changed: true })
  assert.deepEqual(readStore(), { version: 1, pins: [] })
  assert.equal(sidecarNames().length, 1)
  assert.deepEqual(fs.readFileSync(path.join(pinsDir(), sidecarNames()[0])), corrupt)
})

test('corrupt list response is explicit and a later successful list clears it', () => {
  fs.mkdirSync(pinsDir(), { recursive: true })
  fs.writeFileSync(pinFile(), 'broken list')
  const corrupt = runJson(['list-pins', AGENT])
  assert.equal(corrupt.corrupt, true)
  assert.deepEqual(corrupt.pins, [])
  writeStore([storedPin('/healthy-again')])
  assert.deepEqual(runJson(['list-pins', AGENT]), {
    pins: [{ path: '/healthy-again', addedAt: 1, exists: false, matchKeys: ['/healthy-again'] }],
  })
})

test('list-pins exposes canonical and symlink-form match keys', () => {
  const target = mkdir('listed-symlink-target')
  const link = path.join(fixture, 'listed-symlink-link')
  fs.symlinkSync(target, link, 'dir')
  const added = runJson(['add-pin', AGENT, link])

  const [listed] = runJson(['list-pins', AGENT]).pins
  assert.deepEqual(new Set(listed.matchKeys), new Set([
    matchKey(added.canonicalPath),
    matchKey(link),
  ]))
})

test('list-pins degrades a missing stored matchKeys field to an empty array', () => {
  writeStore([{ path: '/legacy-pin', addedAt: 1 }])

  assert.deepEqual(runJson(['list-pins', AGENT]), {
    pins: [{ path: '/legacy-pin', addedAt: 1, exists: false, matchKeys: [] }],
  })
})
