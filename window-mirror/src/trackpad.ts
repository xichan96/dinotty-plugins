/**
 * A trackpad for a desktop you are touching with a finger.
 *
 * Tapping where you want to click is the obvious design and it is the one that
 * does not work. Fitted to a phone, a 2560-pixel window is about 390 CSS pixels
 * wide, so one pixel of finger is six pixels of desktop and a fingertip covers
 * a toolbar. Showing it at 1:1 fixes the precision and loses the window.
 *
 * So the finger stops being a pointer and becomes a trackpad: it moves a cursor
 * that you can see before you commit to it, and the tap that follows lands
 * where the cursor is, not where the finger is. Relative motion also means
 * sensitivity is a free parameter -- below 1 the cursor moves slower than the
 * finger, which is how sub-fingertip precision is possible at all.
 *
 * Everything here is arithmetic over coordinates in the canvas's own CSS pixel
 * space, deliberately free of DOM: the event plumbing is in the pane, and the
 * part that decides where a click lands is here, where it can be tested.
 */

export interface Point {
  x: number
  y: number
}

export interface Bounds {
  width: number
  height: number
}

/**
 * How far the cursor travels per unit of finger travel.
 *
 * Below 1 so that a fitted window can be addressed precisely: at 0.6 the
 * cursor crosses a phone-width canvas in about one and a half swipes, and a
 * deliberate 10-pixel nudge of the finger moves it 6.
 */
export const SENSITIVITY = 0.6

/** Longest a touch can last and still count as a tap rather than a hold. */
export const TAP_MS = 250

/** Furthest a touch can travel and still count as a tap. */
export const TAP_SLOP = 10

/** How long a still finger must rest before it means "press and hold". */
export const HOLD_MS = 500

export function clamp(point: Point, bounds: Bounds): Point {
  return {
    x: Math.min(Math.max(point.x, 0), Math.max(bounds.width - 1, 0)),
    y: Math.min(Math.max(point.y, 0), Math.max(bounds.height - 1, 0)),
  }
}

/** Move the cursor by a finger delta, scaled and kept on the canvas. */
export function advance(
  cursor: Point,
  delta: Point,
  bounds: Bounds,
  sensitivity = SENSITIVITY,
): Point {
  return clamp(
    { x: cursor.x + delta.x * sensitivity, y: cursor.y + delta.y * sensitivity },
    bounds,
  )
}

/** Where the cursor should start when a mirror is first touched. */
export function centre(bounds: Bounds): Point {
  return { x: (bounds.width - 1) / 2, y: (bounds.height - 1) / 2 }
}

export type Gesture = 'tap' | 'hold' | 'move'

/**
 * What a finished one-finger touch meant.
 *
 * `travelled` is the total distance the finger covered, not the distance
 * between its first and last position: a finger that wanders out and comes back
 * was aiming at something, and treating that as a tap would click somewhere the
 * user had already moved away from.
 */
export function classify(travelled: number, elapsedMs: number): Gesture {
  if (travelled > TAP_SLOP) return 'move'
  if (elapsedMs >= HOLD_MS) return 'hold'
  if (elapsedMs <= TAP_MS) return 'tap'
  // Still, but neither quick enough to be a tap nor long enough to be a hold.
  // Clicking on this would make a hesitant finger click by accident.
  return 'move'
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** The midpoint of two touches, which is what a two-finger gesture tracks. */
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}
