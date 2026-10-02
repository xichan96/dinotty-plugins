// The storage key becomes a filename on the host, and a pane id is not one.

import test from 'node:test'
import assert from 'node:assert/strict'
import { storageKeyFor } from '../dist/storage-key.mjs'

const BACKSLASH = String.fromCharCode(92)

test('a uuid pane id passes through unchanged', () => {
  assert.equal(
    storageKeyFor('f2671e56-9d21-47dd-af2d-3697ebf91509'),
    'mirror-f2671e56-9d21-47dd-af2d-3697ebf91509',
  )
})

test('the plugin tab id loses its colons', () => {
  // This is the one that actually bit: the plugin tab's pane id is
  // `plugin:window-mirror:`, and a colon cannot appear in a Windows path. The
  // sidecar died writing the announcement, so the pane waited out its timeout
  // for a file that was never going to exist.
  assert.equal(storageKeyFor('plugin:window-mirror:'), 'mirror-plugin-window-mirror-')
})

test('nothing that could leave the data directory survives', () => {
  assert.equal(storageKeyFor('../../etc/passwd'), 'mirror-------etc-passwd')
  const mangled = storageKeyFor(`a/b${BACKSLASH}c`)
  assert.ok(!mangled.includes('/'))
  assert.ok(!mangled.includes(BACKSLASH))
})

test('two different pane ids still get two different keys', () => {
  assert.notEqual(storageKeyFor('pane:1'), storageKeyFor('pane:2'))
})
