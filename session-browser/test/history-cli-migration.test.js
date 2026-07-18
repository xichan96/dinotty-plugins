const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { afterEach, beforeEach, test } = require('node:test')

const CLI = path.resolve(__dirname, '../dist/cli')

let fixture
let pluginDataBase
let legacyDir
let currentDir
let env

function runMigration() {
  const result = spawnSync(process.execPath, [CLI, 'agents'], { encoding: 'utf8', env })
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotThrow(() => JSON.parse(result.stdout))
}

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'session-browser-migration-'))
  pluginDataBase = path.join(fixture, 'home', '.dinotty', 'plugin-data')
  legacyDir = path.join(pluginDataBase, 'cc-session-browser')
  currentDir = path.join(pluginDataBase, 'session-browser')
  env = {
    ...process.env,
    HOME: path.join(fixture, 'home'),
    CC_SB_PROJECTS_DIR: path.join(fixture, 'projects'),
    CC_SB_ARCHIVE_DIR: path.join(fixture, 'projects-archive'),
    CC_SB_SESSIONS_DIR: path.join(fixture, 'sessions'),
  }
  delete env.CC_SB_DATA_DIR
})

afterEach(() => {
  fs.rmSync(fixture, { recursive: true, force: true })
})

test('legacy settings absent is a no-op that does not throw', () => {
  runMigration()

  assert.equal(fs.existsSync(currentDir), false)
})

test('all legacy JSON settings are copied when current settings are absent', () => {
  fs.mkdirSync(legacyDir, { recursive: true })
  fs.writeFileSync(path.join(legacyDir, 'alpha.json'), '{"alpha":1}\n')
  fs.writeFileSync(path.join(legacyDir, 'beta.json'), '{"beta":2}\n')
  fs.writeFileSync(path.join(legacyDir, 'ignored.txt'), 'not settings')

  runMigration()

  assert.equal(fs.readFileSync(path.join(currentDir, 'alpha.json'), 'utf8'), '{"alpha":1}\n')
  assert.equal(fs.readFileSync(path.join(currentDir, 'beta.json'), 'utf8'), '{"beta":2}\n')
  assert.equal(fs.existsSync(path.join(currentDir, 'ignored.txt')), false)
  assert.equal(fs.existsSync(legacyDir), true)
})

test('only missing settings are copied and current bytes remain identical', () => {
  const currentBytes = Buffer.from([0x00, 0xff, 0x7b, 0x7d, 0x0a])
  fs.mkdirSync(legacyDir, { recursive: true })
  fs.mkdirSync(currentDir, { recursive: true })
  fs.writeFileSync(path.join(legacyDir, 'existing.json'), '{"legacy":true}\n')
  fs.writeFileSync(path.join(legacyDir, 'missing.json'), '{"copied":true}\n')
  fs.writeFileSync(path.join(currentDir, 'existing.json'), currentBytes)

  runMigration()

  assert.deepEqual(fs.readFileSync(path.join(currentDir, 'existing.json')), currentBytes)
  assert.equal(fs.readFileSync(path.join(currentDir, 'missing.json'), 'utf8'), '{"copied":true}\n')
})

test('a garbage JSON entry does not abort migration or throw', () => {
  fs.mkdirSync(path.join(legacyDir, 'garbage.json'), { recursive: true })
  fs.writeFileSync(path.join(legacyDir, 'valid.json'), '{"valid":true}\n')

  runMigration()

  assert.equal(fs.readFileSync(path.join(currentDir, 'valid.json'), 'utf8'), '{"valid":true}\n')
  assert.equal(fs.existsSync(path.join(currentDir, 'garbage.json')), false)
})
