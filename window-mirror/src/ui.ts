import RFB from '@novnc/novnc'
import type { PluginContext, PluginExports } from '../../plugin-api/index'
import { charToKeysym, diffInput, needsReset, KEYSYM, NAMED_KEYS, PAD } from './keys'
import { storageKeyFor } from './storage-key'
import {
  advance,
  centre,
  classify,
  distance,
  midpoint,
  type Bounds,
  type Point,
  HOLD_MS,
  TAP_MS,
  TAP_SLOP,
} from './trackpad'

/**
 * The pane: pick a window, then watch it — and, once you take control, drive it.
 *
 * Three things shape this file.
 *
 * The pixels do not come through `PluginContext` at all. The sidecar serves RFB
 * on a loopback WebSocket port and the pane points noVNC at `/preview/<port>/`,
 * which dinotty already reverse-proxies with the caller authenticated. So the
 * only thing that has to cross the plugin API is a port number, and it crosses
 * as a file: the sidecar writes it with `--announce`, the pane reads it with
 * `ctx.storage.get()`.
 *
 * The capture is a managed process, not a spawn. A phone locking its screen
 * must not kill the mirror — picking it back up on another device is then just
 * reading the same announcement again.
 *
 * And noVNC already handles touch: one-finger tap is a left click, two fingers
 * a right click, three a middle click, a long press holds the button down, and
 * a two-finger drag scrolls. What it does not handle is a desktop-sized window
 * on a phone-sized screen, or a keyboard — so that is what is built here.
 */

type Locale = 'en' | 'zh'

/** How the framebuffer is fitted into the pane. */
type View = 'fit' | 'actual'

/**
 * How a finger becomes a pointer. `direct` is noVNC's own handling -- a tap is
 * a click where you touched. `trackpad` moves a visible cursor instead, which
 * is the only way to hit a 2560-pixel window with a fingertip.
 */
type Pointer = 'direct' | 'trackpad'

interface Strings {
  title: string
  pick: string
  refresh: string
  starting: string
  connecting: string
  connected: (title: string) => string
  stop: string
  retry: string
  noWindows: string
  viewOnly: string
  interactive: string
  takeControl: string
  release: string
  fit: string
  actual: string
  keyboard: string
  direct: string
  trackpad: string
  failed: (reason: string) => string
}

const STRINGS: Record<Locale, Strings> = {
  en: {
    title: 'Window Mirror',
    pick: 'Pick a window to mirror',
    refresh: 'Refresh',
    starting: 'Starting capture...',
    connecting: 'Connecting...',
    connected: (title) => `Mirroring ${title}`,
    stop: 'Stop',
    retry: 'Retry',
    noWindows: 'No capturable windows found.',
    viewOnly: 'view only',
    interactive: 'interactive',
    takeControl: 'Take control',
    release: 'Release',
    fit: 'Fit',
    actual: '1:1',
    keyboard: 'Keyboard',
    direct: 'Touch',
    trackpad: 'Trackpad',
    failed: (reason) => `Failed: ${reason}`,
  },
  zh: {
    title: '窗口映射',
    pick: '选择要映射的窗口',
    refresh: '刷新',
    starting: '正在启动抓帧…',
    connecting: '连接中…',
    connected: (title) => `正在映射 ${title}`,
    stop: '停止',
    retry: '重试',
    noWindows: '没有找到可抓取的窗口。',
    viewOnly: '只读',
    interactive: '可操作',
    takeControl: '接管',
    release: '放开',
    fit: '适应',
    actual: '原始',
    keyboard: '键盘',
    direct: '直接',
    trackpad: '触控板',
    failed: (reason) => `失败：${reason}`,
  },
}

interface WindowInfo {
  id: number
  pid: number
  app: string
  title: string
  width: number
  height: number
  minimized: boolean
  focused: boolean
}

interface Announcement {
  port: number
  hwnd: number
  title: string
}

type Phase = 'picking' | 'starting' | 'live' | 'failed'

/** Modifiers a phone keyboard does not have, latched until the next key. */
interface Modifiers {
  ctrl: boolean
  alt: boolean
  shift: boolean
}

/** In-flight state of one touch gesture. Reset between gestures. */
interface Touch {
  startedAt: number
  /** Total path length, not displacement -- a finger that wandered and came
   *  back was aiming at something, and must not count as a tap. */
  travelled: number
  last: Point
  holding: boolean
  holdTimer: ReturnType<typeof setTimeout> | null
  twoFinger: boolean
  lastMid: Point | null
}

interface Mirror {
  phase: Phase
  /** Whether this viewer sends input. Starts off, so that opening a mirror
   *  cannot take the desktop away from whoever is at the machine by accident. */
  interactive: boolean
  view: View
  pointer: Pointer
  /** Virtual cursor, in the canvas's own CSS pixel space. */
  cursor: Point | null
  touch: Touch | null
  keyboardOpen: boolean
  mods: Modifiers
  windows: WindowInfo[]
  announcement: Announcement | null
  error: string
  connected: boolean
  container: HTMLElement | null
  field: HTMLTextAreaElement | null
  /** Last value of the hidden field, to diff the next one against. */
  fieldValue: string
  composing: boolean
  rfb: RFB | null
}

/** How long to wait for the sidecar to announce its port before giving up. */
const ANNOUNCE_TIMEOUT_MS = 10_000
const ANNOUNCE_POLL_MS = 150

/** DOM `code` values for the modifiers, which noVNC wants alongside the keysym. */
const MODIFIER_CODES: Array<[keyof Modifiers, number, string]> = [
  ['ctrl', KEYSYM.Control_L, 'ControlLeft'],
  ['alt', KEYSYM.Alt_L, 'AltLeft'],
  ['shift', KEYSYM.Shift_L, 'ShiftLeft'],
]

export async function activate(ctx: PluginContext): Promise<PluginExports> {
  const { h, reactive } = ctx
  let locale: Locale = ctx.i18n.getLocale() === 'zh' ? 'zh' : 'en'
  ctx.i18n.onDidChangeLocale((next) => {
    locale = next === 'zh' ? 'zh' : 'en'
  })
  const t = () => STRINGS[locale]

  const mirrors = new Map<string, Mirror>()

  /** One announcement key per pane, so two panes can mirror two windows. */
  const keyFor = storageKeyFor

  function mirrorFor(paneId: string): Mirror {
    let mirror = mirrors.get(paneId)
    if (!mirror) {
      mirror = reactive<Mirror>({
        phase: 'picking',
        interactive: false,
        view: 'fit',
        pointer: 'trackpad',
        cursor: null,
        touch: null,
        keyboardOpen: false,
        mods: { ctrl: false, alt: false, shift: false },
        windows: [],
        announcement: null,
        error: '',
        connected: false,
        container: null,
        field: null,
        fieldValue: '',
        composing: false,
        rfb: null,
      }) as Mirror
      mirrors.set(paneId, mirror)
      void reattachOrList(paneId, mirror)
    }
    return mirror
  }

  async function listWindows(mirror: Mirror): Promise<void> {
    try {
      const result = await ctx.exec.run(['list'])
      if (result.code !== 0) {
        throw new Error(result.stderr.trim() || `exit ${result.code}`)
      }
      const windows = JSON.parse(result.stdout) as WindowInfo[]
      // A minimized window has nothing for the compositor to hand us, so it is
      // left out rather than offered and then failing.
      mirror.windows = windows.filter((w) => !w.minimized)
      mirror.phase = 'picking'
    } catch (e) {
      mirror.error = e instanceof Error ? e.message : String(e)
      mirror.phase = 'failed'
    }
  }

  /**
   * A mirror already running for this pane is picked back up instead of
   * restarted — this is what makes moving from desktop to phone mid-session
   * free.
   */
  async function reattachOrList(paneId: string, mirror: Mirror): Promise<void> {
    const announcement = await ctx.storage.get<Announcement>(keyFor(paneId))
    if (announcement && (await isServing(announcement))) {
      mirror.announcement = announcement
      mirror.phase = 'live'
      connect(mirror)
      return
    }
    await listWindows(mirror)
  }

  /** Whether a sidecar is still serving the announced window. */
  async function isServing(announcement: Announcement): Promise<boolean> {
    const processes = await ctx.process.list()
    return processes.some(
      (p) =>
        p.state === 'running' &&
        p.args.includes('serve') &&
        p.args.includes(String(announcement.hwnd)),
    )
  }

  async function start(paneId: string, mirror: Mirror, target: WindowInfo): Promise<void> {
    mirror.phase = 'starting'
    mirror.error = ''
    const key = keyFor(paneId)
    try {
      // A stale announcement from a previous run would otherwise be read as
      // this run's port and connect to nothing.
      await ctx.storage.delete(key)
      await ctx.process.start(['serve', '--hwnd', String(target.id), '--announce', key])

      const deadline = Date.now() + ANNOUNCE_TIMEOUT_MS
      for (;;) {
        const announcement = await ctx.storage.get<Announcement>(key)
        if (announcement?.port) {
          mirror.announcement = announcement
          mirror.phase = 'live'
          connect(mirror)
          return
        }
        if (Date.now() > deadline) {
          throw new Error(`the capture did not start within ${ANNOUNCE_TIMEOUT_MS / 1000}s`)
        }
        await new Promise((resolve) => setTimeout(resolve, ANNOUNCE_POLL_MS))
      }
    } catch (e) {
      mirror.error = e instanceof Error ? e.message : String(e)
      mirror.phase = 'failed'
    }
  }

  async function stop(paneId: string, mirror: Mirror): Promise<void> {
    disconnect(mirror)
    const announcement = mirror.announcement
    mirror.announcement = null
    await ctx.storage.delete(keyFor(paneId))
    if (announcement) {
      const processes = await ctx.process.list()
      for (const p of processes) {
        if (p.state === 'running' && p.args.includes(String(announcement.hwnd))) {
          await ctx.process.stop(p.pid)
        }
      }
    }
    await listWindows(mirror)
  }

  /**
   * `crypto.randomUUID` is not the only thing missing on an insecure origin —
   * reaching dinotty from a phone means plain `http://<lan-ip>:8999`, so the
   * socket scheme has to be derived from the page rather than assumed to be wss.
   */
  function socketUrl(port: number): string {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    return `${scheme}://${location.host}/preview/${port}/`
  }

  /**
   * Fit shows the whole window and is unreadable on a phone; 1:1 is readable
   * and needs panning. That choice, not a magnifier, is what makes a
   * desktop-sized window usable on a small screen — at 1:1 a tap lands on the
   * pixel it was aimed at, which is the same precision a mouse has.
   */
  function applyView(mirror: Mirror): void {
    const rfb = mirror.rfb
    if (!rfb) return
    const actual = mirror.view === 'actual'
    rfb.scaleViewport = !actual
    rfb.clipViewport = actual
    // With clipViewport a one-finger drag pans instead of dragging remotely.
    // Tap still clicks, so nothing is lost.
    rfb.dragViewport = actual
  }

  function connect(mirror: Mirror): void {
    if (!mirror.container || !mirror.announcement || mirror.rfb) return
    const rfb = new RFB(mirror.container, socketUrl(mirror.announcement.port), {})
    rfb.viewOnly = !mirror.interactive
    rfb.background = 'transparent'
    rfb.addEventListener('connect', () => {
      mirror.connected = true
      applyView(mirror)
    })
    rfb.addEventListener('disconnect', (e: any) => {
      mirror.connected = false
      mirror.rfb = null
      if (!e?.detail?.clean) {
        mirror.error = 'the connection dropped'
        mirror.phase = 'failed'
      }
    })
    mirror.rfb = rfb
    applyView(mirror)
  }

  /**
   * Taking control raises the mirrored window on the host, so it is a toggle
   * the viewer holds rather than a mode the pane is born in. This is an
   * ergonomic switch, not a boundary — a server started with `--view-only`
   * ignores input no matter what a client sends.
   */
  function setInteractive(mirror: Mirror, interactive: boolean): void {
    mirror.interactive = interactive
    if (mirror.rfb) {
      mirror.rfb.viewOnly = !interactive
      // So a desktop viewer's physical keyboard reaches the mirror too.
      if (interactive) mirror.rfb.focus()
    }
    if (!interactive) closeKeyboard(mirror)
  }

  // --- keys ----------------------------------------------------------------

  /** Send one key press and release, wrapped in whichever modifiers are latched. */
  function sendKey(mirror: Mirror, keysym: number, code = ''): void {
    const rfb = mirror.rfb
    if (!rfb || !mirror.interactive) return
    const held = MODIFIER_CODES.filter(([name]) => mirror.mods[name])
    for (const [, sym, modCode] of held) rfb.sendKey(sym, modCode, true)
    rfb.sendKey(keysym, code, true)
    rfb.sendKey(keysym, code, false)
    // Released in reverse so the host never sees a modifier outlive the one
    // pressed after it.
    for (const [, sym, modCode] of [...held].reverse()) rfb.sendKey(sym, modCode, false)
    if (held.length > 0) mirror.mods = { ctrl: false, alt: false, shift: false }
  }

  function resetField(mirror: Mirror): void {
    if (!mirror.field) return
    mirror.field.value = PAD
    mirror.fieldValue = PAD
    // The caret sits in the middle so that a delete has filler to consume on
    // either side and always produces an event.
    mirror.field.setSelectionRange(PAD.length / 2, PAD.length / 2)
  }

  function handleFieldInput(mirror: Mirror): void {
    // Mid-composition the field holds a half-built character; sending it would
    // deliver the user's intermediate keystrokes to the host.
    if (mirror.composing || !mirror.field) return
    const now = mirror.field.value
    const { backspaces, inserted } = diffInput(mirror.fieldValue, now)
    for (let i = 0; i < backspaces; i++) sendKey(mirror, KEYSYM.BackSpace, 'Backspace')
    for (const ch of inserted) sendKey(mirror, charToKeysym(ch))
    mirror.fieldValue = now
    if (needsReset(now)) resetField(mirror)
  }

  function handleFieldKeydown(mirror: Mirror, e: KeyboardEvent): void {
    const keysym = NAMED_KEYS[e.key]
    if (keysym === undefined) return
    // These never show up as text, and letting Backspace through as well would
    // have the diff send it a second time.
    e.preventDefault()
    sendKey(mirror, keysym, e.code)
  }

  function openKeyboard(mirror: Mirror): void {
    mirror.keyboardOpen = true
    resetField(mirror)
    // Focusing is what raises the on-screen keyboard; there is no API for it.
    mirror.field?.focus()
  }

  function closeKeyboard(mirror: Mirror): void {
    mirror.keyboardOpen = false
    mirror.mods = { ctrl: false, alt: false, shift: false }
    mirror.field?.blur()
  }

  function bindContainer(mirror: Mirror, el: unknown): void {
    const element = el instanceof HTMLElement ? el : null
    if (mirror.container === element) return
    mirror.container = element
    if (element) connect(mirror)
    else disconnect(mirror)
  }

  function disconnect(mirror: Mirror): void {
    mirror.rfb?.disconnect()
    mirror.rfb = null
    mirror.connected = false
  }

  // --- trackpad ------------------------------------------------------------

  /**
   * noVNC listens for ordinary `mousedown` / `mousemove` / `mouseup` on its
   * canvas, so a virtual cursor can drive it with synthesised DOM events and
   * never reach for a private method. Its own touch handling is bypassed
   * instead, by stopping the touch events in the capture phase before they
   * reach it.
   */
  function canvasOf(mirror: Mirror): HTMLCanvasElement | null {
    return mirror.container?.querySelector('canvas') ?? null
  }

  function boundsOf(mirror: Mirror): Bounds | null {
    const canvas = canvasOf(mirror)
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : null
  }

  function dispatchMouse(mirror: Mirror, type: string, button = 0, buttons = 0): void {
    const canvas = canvasOf(mirror)
    if (!canvas || !mirror.cursor) return
    const rect = canvas.getBoundingClientRect()
    canvas.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + mirror.cursor.x,
        clientY: rect.top + mirror.cursor.y,
        button,
        buttons,
      }),
    )
  }

  function dispatchWheel(mirror: Mirror, deltaX: number, deltaY: number): void {
    const canvas = canvasOf(mirror)
    if (!canvas || !mirror.cursor) return
    const rect = canvas.getBoundingClientRect()
    canvas.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + mirror.cursor.x,
        clientY: rect.top + mirror.cursor.y,
        deltaX,
        deltaY,
      }),
    )
  }

  const pointOf = (t: { clientX: number; clientY: number }): Point => ({
    x: t.clientX,
    y: t.clientY,
  })

  function clearHold(mirror: Mirror): void {
    if (mirror.touch?.holdTimer) {
      clearTimeout(mirror.touch.holdTimer)
      mirror.touch.holdTimer = null
    }
  }

  function onTouchStart(mirror: Mirror, e: TouchEvent): void {
    const bounds = boundsOf(mirror)
    if (!bounds) return
    e.stopPropagation()
    e.preventDefault()
    if (!mirror.cursor) mirror.cursor = centre(bounds)

    if (e.touches.length === 1) {
      const touch: Touch = {
        startedAt: Date.now(),
        travelled: 0,
        last: pointOf(e.touches[0]),
        holding: false,
        holdTimer: null,
        twoFinger: false,
        lastMid: null,
      }
      mirror.touch = touch
      // A finger that rests without moving means press-and-hold, which is the
      // only way to drag: select text, move a window, work a slider.
      touch.holdTimer = setTimeout(() => {
        if (touch.travelled <= TAP_SLOP) {
          touch.holding = true
          dispatchMouse(mirror, 'mousedown', 0, 1)
        }
      }, HOLD_MS)
    } else if (mirror.touch) {
      clearHold(mirror)
      mirror.touch.twoFinger = true
      mirror.touch.lastMid = midpoint(pointOf(e.touches[0]), pointOf(e.touches[1]))
    }
  }

  function onTouchMove(mirror: Mirror, e: TouchEvent): void {
    const touch = mirror.touch
    const bounds = boundsOf(mirror)
    if (!touch || !bounds || !mirror.cursor) return
    e.stopPropagation()
    e.preventDefault()

    if (e.touches.length >= 2 && touch.lastMid) {
      const mid = midpoint(pointOf(e.touches[0]), pointOf(e.touches[1]))
      // Two fingers moving up should move the content up, which is a wheel
      // turning the same way as on a laptop trackpad.
      dispatchWheel(mirror, touch.lastMid.x - mid.x, touch.lastMid.y - mid.y)
      touch.lastMid = mid
      return
    }

    const point = pointOf(e.touches[0])
    const delta = { x: point.x - touch.last.x, y: point.y - touch.last.y }
    touch.travelled += distance(point, touch.last)
    touch.last = point
    mirror.cursor = advance(mirror.cursor, delta, bounds)
    dispatchMouse(mirror, 'mousemove', 0, touch.holding ? 1 : 0)
  }

  function onTouchEnd(mirror: Mirror, e: TouchEvent): void {
    const touch = mirror.touch
    if (!touch) return
    e.stopPropagation()
    e.preventDefault()
    // Fingers leave one at a time; the gesture ends when the last one does.
    if (e.touches.length > 0) return
    clearHold(mirror)

    const elapsed = Date.now() - touch.startedAt
    if (touch.holding) {
      dispatchMouse(mirror, 'mouseup', 0, 0)
    } else if (touch.twoFinger) {
      if (touch.travelled <= TAP_SLOP && elapsed <= TAP_MS) {
        dispatchMouse(mirror, 'mousedown', 2, 2)
        dispatchMouse(mirror, 'mouseup', 2, 0)
      }
    } else if (classify(touch.travelled, elapsed) === 'tap') {
      dispatchMouse(mirror, 'mousedown', 0, 1)
      dispatchMouse(mirror, 'mouseup', 0, 0)
    }
    mirror.touch = null
  }

  /** Where to draw the cursor, relative to the element it sits in. */
  function cursorStyle(mirror: Mirror): Record<string, string> | null {
    const canvas = canvasOf(mirror)
    if (!canvas || !mirror.cursor || !mirror.container) return null
    const canvasRect = canvas.getBoundingClientRect()
    const hostRect = mirror.container.getBoundingClientRect()
    return {
      left: `${canvasRect.left - hostRect.left + mirror.cursor.x}px`,
      top: `${canvasRect.top - hostRect.top + mirror.cursor.y}px`,
    }
  }

  // --- rendering -----------------------------------------------------------

  function renderPicker(paneId: string, mirror: Mirror) {
    const s = t()
    return h('div', { class: 'wm-picker' }, [
      h('div', { class: 'wm-picker-head' }, [
        h('span', { class: 'wm-picker-title' }, s.pick),
        h('button', { class: 'wm-btn', onClick: () => void listWindows(mirror) }, s.refresh),
      ]),
      mirror.windows.length === 0
        ? h('div', { class: 'wm-empty' }, s.noWindows)
        : h(
            'ul',
            { class: 'wm-list' },
            mirror.windows.map((w) =>
              h(
                'li',
                { key: w.id, class: 'wm-item', onClick: () => void start(paneId, mirror, w) },
                [
                  h('span', { class: 'wm-item-app' }, w.app),
                  h('span', { class: 'wm-item-title' }, w.title),
                  h('span', { class: 'wm-item-size' }, `${w.width}x${w.height}`),
                ],
              ),
            ),
          ),
    ])
  }

  /** Keys a phone keyboard does not offer but a desktop application needs. */
  function renderModifierRow(mirror: Mirror) {
    const sticky = MODIFIER_CODES.map(([name, , code]) =>
      h(
        'button',
        {
          key: name,
          class: mirror.mods[name] ? 'wm-key wm-key-on' : 'wm-key',
          // Pressing a key must not move focus off the hidden field, or the
          // on-screen keyboard closes underneath the user.
          onMousedown: (e: Event) => e.preventDefault(),
          onClick: () => {
            mirror.mods[name] = !mirror.mods[name]
          },
        },
        code.replace('Left', ''),
      ),
    )
    const immediate: Array<[string, number, string]> = [
      ['Esc', KEYSYM.Escape, 'Escape'],
      ['Tab', KEYSYM.Tab, 'Tab'],
      ['←', KEYSYM.Left, 'ArrowLeft'],
      ['↑', KEYSYM.Up, 'ArrowUp'],
      ['↓', KEYSYM.Down, 'ArrowDown'],
      ['→', KEYSYM.Right, 'ArrowRight'],
    ]
    return h('div', { class: 'wm-keys' }, [
      ...sticky,
      ...immediate.map(([label, keysym, code]) =>
        h(
          'button',
          {
            key: code,
            class: 'wm-key',
            onMousedown: (e: Event) => e.preventDefault(),
            onClick: () => sendKey(mirror, keysym, code),
          },
          label,
        ),
      ),
    ])
  }

  function renderLive(paneId: string, mirror: Mirror) {
    const s = t()
    const title = mirror.announcement?.title ?? ''
    return h('div', { class: 'wm-live' }, [
      h('div', { class: 'wm-bar' }, [
        h('span', { class: 'wm-bar-title' }, mirror.connected ? s.connected(title) : s.connecting),
        h(
          'span',
          { class: mirror.interactive ? 'wm-badge wm-badge-live' : 'wm-badge' },
          mirror.interactive ? s.interactive : s.viewOnly,
        ),
        h(
          'button',
          {
            class: 'wm-btn',
            onClick: () => {
              mirror.view = mirror.view === 'fit' ? 'actual' : 'fit'
              applyView(mirror)
            },
          },
          mirror.view === 'fit' ? s.actual : s.fit,
        ),
        h(
          'button',
          {
            class: mirror.pointer === 'trackpad' ? 'wm-btn wm-btn-on' : 'wm-btn',
            onClick: () => {
              mirror.pointer = mirror.pointer === 'trackpad' ? 'direct' : 'trackpad'
              mirror.cursor = null
            },
          },
          mirror.pointer === 'trackpad' ? s.trackpad : s.direct,
        ),
        h(
          'button',
          {
            class: mirror.keyboardOpen ? 'wm-btn wm-btn-on' : 'wm-btn',
            disabled: !mirror.interactive,
            onClick: () =>
              mirror.keyboardOpen ? closeKeyboard(mirror) : openKeyboard(mirror),
          },
          s.keyboard,
        ),
        h(
          'button',
          { class: 'wm-btn', onClick: () => setInteractive(mirror, !mirror.interactive) },
          mirror.interactive ? s.release : s.takeControl,
        ),
        h('button', { class: 'wm-btn', onClick: () => void stop(paneId, mirror) }, s.stop),
      ]),
      h(
        'div',
        {
          class: mirror.view === 'actual' ? 'wm-screen wm-screen-actual' : 'wm-screen',
          ref: (el: unknown) => bindContainer(mirror, el),
          // Capture phase, so noVNC's gesture handler on the canvas never sees
          // these. In `direct` mode nothing is attached and its own handling is
          // left intact.
          ...(mirror.pointer === 'trackpad'
            ? {
                onTouchstartCapture: (e: TouchEvent) => onTouchStart(mirror, e),
                onTouchmoveCapture: (e: TouchEvent) => onTouchMove(mirror, e),
                onTouchendCapture: (e: TouchEvent) => onTouchEnd(mirror, e),
                onTouchcancelCapture: (e: TouchEvent) => onTouchEnd(mirror, e),
              }
            : {}),
        },
        mirror.pointer === 'trackpad' && mirror.cursor
          ? [
              h('div', {
                class: mirror.touch?.holding ? 'wm-cursor wm-cursor-held' : 'wm-cursor',
                style: cursorStyle(mirror) ?? { display: 'none' },
              }),
            ]
          : [],
      ),
      mirror.keyboardOpen ? renderModifierRow(mirror) : null,
      // Always mounted, never visible: it is what the on-screen keyboard
      // attaches to, and remounting it on toggle would drop the caret.
      h('textarea', {
        class: 'wm-field',
        ref: (el: unknown) => {
          mirror.field = el instanceof HTMLTextAreaElement ? el : null
        },
        autocapitalize: 'off',
        autocomplete: 'off',
        autocorrect: 'off',
        spellcheck: 'false',
        onInput: () => handleFieldInput(mirror),
        onKeydown: (e: KeyboardEvent) => handleFieldKeydown(mirror, e),
        onCompositionstart: () => {
          mirror.composing = true
        },
        onCompositionend: () => {
          mirror.composing = false
          handleFieldInput(mirror)
        },
        onBlur: () => {
          mirror.keyboardOpen = false
        },
      }),
    ])
  }

  return {
    component: {
      props: ['paneId', 'workspaceId', 'isVisible', 'isFocused'],
      setup(props: any) {
        const paneId = String(props.paneId ?? 'default')
        const mirror = mirrorFor(paneId)
        return () => {
          const s = t()
          switch (mirror.phase) {
            case 'live':
              return h('div', { class: 'wm-root' }, [renderLive(paneId, mirror)])
            case 'starting':
              return h('div', { class: 'wm-root wm-centered' }, s.starting)
            case 'failed':
              return h('div', { class: 'wm-root wm-centered' }, [
                h('div', { class: 'wm-error' }, s.failed(mirror.error)),
                h('button', { class: 'wm-btn', onClick: () => void listWindows(mirror) }, s.retry),
              ])
            default:
              return h('div', { class: 'wm-root' }, [renderPicker(paneId, mirror)])
          }
        }
      },
    },
    dispose() {
      for (const mirror of mirrors.values()) disconnect(mirror)
      mirrors.clear()
    },
  }
}
