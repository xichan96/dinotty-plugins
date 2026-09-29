/**
 * Turning a phone's soft keyboard into RFB key events.
 *
 * A mobile browser only raises its keyboard for a focused text field, and it
 * does not report most keys as `keydown` -- it reports the *text* that resulted.
 * So the pane keeps a hidden field, pads it with filler, and works out what
 * happened by diffing its value. That is the same trick noVNC's own web app
 * uses; it lives in the app rather than the library, so it is rebuilt here.
 *
 * Kept out of the pane module because the diff is the part that breaks
 * subtly -- an off-by-one here deletes a character the user meant to keep.
 */

/** X11 keysyms. RFB carries these regardless of what the client runs on. */
export const KEYSYM = {
  BackSpace: 0xff08,
  Tab: 0xff09,
  Return: 0xff0d,
  Escape: 0xff1b,
  Home: 0xff50,
  Left: 0xff51,
  Up: 0xff52,
  Right: 0xff53,
  Down: 0xff54,
  PageUp: 0xff55,
  PageDown: 0xff56,
  End: 0xff57,
  Delete: 0xffff,
  Shift_L: 0xffe1,
  Control_L: 0xffe3,
  Alt_L: 0xffe9,
  Super_L: 0xffeb,
} as const

/** Keysyms at or above this encode a Unicode codepoint directly. */
const UNICODE_BASE = 0x0100_0000

/**
 * The keysym for a character. Latin-1 is its own codepoint; everything else
 * goes in the Unicode range, which is how a CJK character reaches the host.
 */
export function charToKeysym(ch: string): number {
  const codepoint = ch.codePointAt(0)
  if (codepoint === undefined) return 0
  if (codepoint <= 0xff) return codepoint
  return UNICODE_BASE + codepoint
}

/** DOM `KeyboardEvent.key` values that arrive as keys rather than as text. */
export const NAMED_KEYS: Record<string, number> = {
  Enter: KEYSYM.Return,
  Backspace: KEYSYM.BackSpace,
  Tab: KEYSYM.Tab,
  Escape: KEYSYM.Escape,
  ArrowLeft: KEYSYM.Left,
  ArrowUp: KEYSYM.Up,
  ArrowRight: KEYSYM.Right,
  ArrowDown: KEYSYM.Down,
  Home: KEYSYM.Home,
  End: KEYSYM.End,
  PageUp: KEYSYM.PageUp,
  PageDown: KEYSYM.PageDown,
  Delete: KEYSYM.Delete,
}

/**
 * Filler kept on both sides of the caret in the hidden field.
 *
 * Without it a backspace at an empty field produces no event at all on most
 * mobile browsers, and the user's delete is silently lost.
 */
export const PAD = ' '.repeat(4)

export interface InputDiff {
  backspaces: number
  inserted: string
}

/**
 * What the user did, from how the field's value changed.
 *
 * Compares from both ends, because the caret sits in the middle of the filler:
 * a deletion shortens the common prefix, an insertion lengthens it, and the
 * unchanged suffix is filler that must not be mistaken for typing.
 */
export function diffInput(previous: string, current: string): InputDiff {
  let prefix = 0
  while (
    prefix < previous.length &&
    prefix < current.length &&
    previous[prefix] === current[prefix]
  ) {
    prefix++
  }
  let suffix = 0
  while (
    suffix < previous.length - prefix &&
    suffix < current.length - prefix &&
    previous[previous.length - 1 - suffix] === current[current.length - 1 - suffix]
  ) {
    suffix++
  }
  return {
    backspaces: previous.length - prefix - suffix,
    inserted: current.slice(prefix, current.length - suffix),
  }
}

/**
 * Whether the field has drifted far enough from its resting shape that it
 * should be reset. Too short and a delete stops being reportable; too long and
 * the diff has more filler to scan than it needs.
 */
export function needsReset(value: string): boolean {
  return value.length < PAD.length || value.length > PAD.length * 4
}
