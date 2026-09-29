// The soft-keyboard diff, tested away from a browser.
//
// This is the part of the mobile keyboard that fails quietly: get the diff
// wrong and the host receives a deletion the user did not make, or misses one
// they did. The field is padded on both sides of the caret, so both ends of the
// comparison matter.

import test from 'node:test'
import assert from 'node:assert/strict'
import { charToKeysym, diffInput, needsReset, PAD } from '../dist/keys.mjs'

const caret = PAD.length / 2
/** The field's value after typing `typed` at the caret, with padding intact. */
const typedInto = (typed) => PAD.slice(0, caret) + typed + PAD.slice(caret)

test('an untouched field reports nothing', () => {
  assert.deepEqual(diffInput(PAD, PAD), { backspaces: 0, inserted: '' })
})

test('a character typed between the padding is the only insertion', () => {
  assert.deepEqual(diffInput(PAD, typedInto('a')), { backspaces: 0, inserted: 'a' })
})

test('a whole word arrives as one insertion', () => {
  assert.deepEqual(diffInput(PAD, typedInto('hello')), { backspaces: 0, inserted: 'hello' })
})

test('deleting what was typed is a backspace, not an insertion', () => {
  assert.deepEqual(diffInput(typedInto('a'), PAD), { backspaces: 1, inserted: '' })
})

test('deleting into the padding still reports a backspace', () => {
  // Why the field is padded at all: with an empty field the browser reports
  // nothing here, and the user's delete is lost.
  assert.deepEqual(diffInput(PAD, PAD.slice(1)), { backspaces: 1, inserted: '' })
})

test('replacing a selection is reported as delete-then-insert', () => {
  assert.deepEqual(diffInput(typedInto('abc'), typedInto('x')), {
    backspaces: 3,
    inserted: 'x',
  })
})

test('a committed composition arrives as its characters', () => {
  assert.deepEqual(diffInput(PAD, typedInto('中文')), { backspaces: 0, inserted: '中文' })
})

test('latin-1 characters are their own keysyms', () => {
  assert.equal(charToKeysym('a'), 0x61)
  assert.equal(charToKeysym(' '), 0x20)
  assert.equal(charToKeysym('é'), 0xe9)
})

test('everything above latin-1 goes in the unicode range', () => {
  assert.equal(charToKeysym('中'), 0x0100_0000 + 0x4e2d)
})

test('an astral character is one keysym, not two surrogates', () => {
  // `for...of` over a string yields code points, so the caller hands whole
  // characters to this function.
  assert.equal(charToKeysym('😀'), 0x0100_0000 + 0x1f600)
})

test('the field is reset once it has drifted out of shape', () => {
  assert.equal(needsReset(PAD), false)
  assert.equal(needsReset(''), true, 'an empty field cannot report a delete')
  assert.equal(needsReset(PAD.repeat(5)), true)
})
