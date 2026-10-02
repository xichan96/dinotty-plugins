// The arithmetic behind the virtual cursor.
//
// These are the numbers that decide whether a tap lands on the button the user
// was aiming at, so they are checked away from a browser where the failure
// would only ever show up as "it clicked the wrong thing".

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  advance,
  centre,
  clamp,
  classify,
  distance,
  midpoint,
  HOLD_MS,
  SENSITIVITY,
  TAP_MS,
  TAP_SLOP,
} from '../dist/trackpad.mjs'

const BOUNDS = { width: 390, height: 600 }

test('the cursor starts in the middle of the canvas', () => {
  assert.deepEqual(centre(BOUNDS), { x: 194.5, y: 299.5 })
})

test('the cursor cannot leave the canvas', () => {
  assert.deepEqual(clamp({ x: -50, y: -50 }, BOUNDS), { x: 0, y: 0 })
  assert.deepEqual(clamp({ x: 9999, y: 9999 }, BOUNDS), { x: 389, y: 599 })
})

test('the cursor moves slower than the finger', () => {
  // The whole point: below 1:1 the cursor can be placed more precisely than a
  // fingertip is wide.
  const moved = advance({ x: 100, y: 100 }, { x: 10, y: 10 }, BOUNDS)
  assert.deepEqual(moved, { x: 100 + 10 * SENSITIVITY, y: 100 + 10 * SENSITIVITY })
  assert.ok(SENSITIVITY < 1)
})

test('fractional movement accumulates instead of being lost', () => {
  // Rounding each step to a whole pixel would make small nudges do nothing at
  // all, which is exactly the range precision work happens in.
  let cursor = { x: 0, y: 0 }
  for (let i = 0; i < 10; i++) cursor = advance(cursor, { x: 1, y: 0 }, BOUNDS)
  assert.ok(Math.abs(cursor.x - 10 * SENSITIVITY) < 1e-9)
})

test('a push against the edge stops at the edge', () => {
  const cursor = advance({ x: 389, y: 0 }, { x: 500, y: 0 }, BOUNDS)
  assert.equal(cursor.x, 389)
})

test('a quick still touch is a tap', () => {
  assert.equal(classify(0, 50), 'tap')
  assert.equal(classify(TAP_SLOP, TAP_MS), 'tap')
})

test('a long still touch is a hold, not a tap', () => {
  assert.equal(classify(2, HOLD_MS), 'hold')
})

test('a touch that travelled is never a tap, however brief', () => {
  // Otherwise a flick would both move the cursor and click wherever it stopped.
  assert.equal(classify(TAP_SLOP + 1, 10), 'move')
  assert.equal(classify(300, 2000), 'move')
})

test('a hesitant finger does not click by accident', () => {
  // Between the tap and hold thresholds there is no intent to infer, so the
  // safe reading is that the user was only moving the cursor.
  assert.equal(classify(0, (TAP_MS + HOLD_MS) / 2), 'move')
})

test('distance is a length, and midpoint is halfway', () => {
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5)
  assert.deepEqual(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 }), { x: 5, y: 10 })
})
