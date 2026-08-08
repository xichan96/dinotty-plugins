const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { afterEach, test } = require('node:test')

const ROOT = path.resolve(__dirname, '..')
const MANIFEST = path.join(ROOT, 'plugin.json')
const PACKAGE = path.join(ROOT, 'package.json')
const ATTRIBUTES = path.join(ROOT, '.gitattributes')
const LAUNCHER = path.join(ROOT, 'dist', 'cli-wrapper.exe')
const LAUNCHER_SOURCE = path.join(ROOT, 'native', 'windows-launcher.rs')
const PROVENANCE = path.join(ROOT, 'native', 'windows-launcher.provenance.json')
const PROVENANCE_WRITER = path.join(ROOT, 'native', 'write-windows-launcher-provenance.js')

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function canonicalText(file) {
  return Buffer.from(fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n'), 'utf8')
}

let fixture

afterEach(() => {
  if (fixture) fs.rmSync(fixture, { recursive: true, force: true })
  fixture = undefined
})

test('manifest selects the native Windows launcher', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))

  assert.equal(manifest.minAppVersion, '0.19.0')
  assert.equal(manifest.bin.entry, 'dist/cli-wrapper')
  assert.equal(manifest.bin.entries['windows-x86_64'], 'dist/cli-wrapper.exe')
  assert.deepEqual(manifest.permissions, ['native.execute'])
  assert.equal(fs.statSync(LAUNCHER).isFile(), true)
})

test('native launcher build pins text normalization and refreshes provenance', () => {
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE, 'utf8'))
  const attributes = fs.readFileSync(ATTRIBUTES, 'utf8')

  assert.match(attributes, /^native\/windows-launcher\.rs text eol=lf$/m)
  assert.match(attributes, /^dist\/cli-wrapper\.exe binary$/m)
  assert.match(packageJson.scripts['build:windows-launcher'], /write-windows-launcher-provenance\.js/)
  assert.equal(fs.statSync(PROVENANCE_WRITER).isFile(), true)
})

test('native Windows launcher matches its recorded provenance', () => {
  const provenance = JSON.parse(fs.readFileSync(PROVENANCE, 'utf8'))

  assert.equal(provenance.compiler, 'rustc 1.94.1 (e408947bf 2026-03-25)')
  assert.equal(provenance.sourceEol, 'lf')
  assert.equal(provenance.sourceSha256, sha256(canonicalText(LAUNCHER_SOURCE)))
  assert.equal(provenance.binarySha256, sha256(fs.readFileSync(LAUNCHER)))
})

test('native Windows launcher forwards metacharacters as one literal argument', { skip: process.platform !== 'win32' }, () => {
  const argument = 'probe & echo %PATH% "quoted value"'
  const result = spawnSync(LAUNCHER, [argument], {
    encoding: 'utf8',
    env: process.env,
    windowsHide: true,
  })

  assert.equal(result.error, undefined)
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.deepEqual(JSON.parse(result.stderr), {
    error: 'unknown-subcommand',
    message: `Unknown subcommand: ${argument}`,
  })
})

test('native Windows launcher lets Node resolve home from USERPROFILE', { skip: process.platform !== 'win32' }, () => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'session-browser-launcher-'))
  const exportDir = path.join(fixture, 'exports')
  fs.mkdirSync(exportDir)
  const env = {
    ...process.env,
    USERPROFILE: fixture,
    CC_SB_PROJECTS_DIR: path.join(fixture, 'projects'),
    CC_SB_ARCHIVE_DIR: path.join(fixture, 'projects-archive'),
    CC_SB_SESSIONS_DIR: path.join(fixture, 'sessions'),
    CC_SB_DATA_DIR: path.join(fixture, 'plugin-data'),
  }
  delete env.HOME

  const result = spawnSync(LAUNCHER, ['classify-export-destination', exportDir], {
    encoding: 'utf8',
    env,
    windowsHide: true,
  })

  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { outsideHome: false })
})
