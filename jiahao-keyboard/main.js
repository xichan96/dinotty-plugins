// en-US keyboard layout (simplified from eDEX-UI)
const LAYOUT = {
  row_numbers: [
    { name: 'ESC', cmd: '\x1b' },
    { name: '`', cmd: '`', shift_name: '~', shift_cmd: '~' },
    { name: '1', cmd: '1', shift_name: '!', shift_cmd: '!', fn_name: 'F1', fn_cmd: '\x1bOP' },
    { name: '2', cmd: '2', shift_name: '@', shift_cmd: '@', fn_name: 'F2', fn_cmd: '\x1bOQ' },
    { name: '3', cmd: '3', shift_name: '#', shift_cmd: '#', fn_name: 'F3', fn_cmd: '\x1bOR' },
    { name: '4', cmd: '4', shift_name: '$', shift_cmd: '$', fn_name: 'F4', fn_cmd: '\x1bOS' },
    { name: '5', cmd: '5', shift_name: '%', shift_cmd: '%', fn_name: 'F5', fn_cmd: '\x1b[15~' },
    { name: '6', cmd: '6', shift_name: '^', shift_cmd: '^', fn_name: 'F6', fn_cmd: '\x1b[17~' },
    { name: '7', cmd: '7', shift_name: '&', shift_cmd: '&', fn_name: 'F7', fn_cmd: '\x1b[18~' },
    { name: '8', cmd: '8', shift_name: '*', shift_cmd: '*', fn_name: 'F8', fn_cmd: '\x1b[19~' },
    { name: '9', cmd: '9', shift_name: '(', shift_cmd: '(', fn_name: 'F9', fn_cmd: '\x1b[20~' },
    { name: '0', cmd: '0', shift_name: ')', shift_cmd: ')', fn_name: 'F10', fn_cmd: '\x1b[21~' },
    { name: '-', cmd: '-', shift_name: '_', shift_cmd: '_', fn_name: 'F11', fn_cmd: '\x1b[23~' },
    { name: '=', cmd: '=', shift_name: '+', shift_cmd: '+', fn_name: 'F12', fn_cmd: '\x1b[24~' },
    { name: 'BACK', cmd: '\x7f' },
  ],
  row_1: [
    { name: 'TAB', cmd: '\t' },
    { name: 'Q', cmd: 'q', shift_cmd: 'Q' },
    { name: 'W', cmd: 'w', shift_cmd: 'W' },
    { name: 'E', cmd: 'e', shift_cmd: 'E' },
    { name: 'R', cmd: 'r', shift_cmd: 'R' },
    { name: 'T', cmd: 't', shift_cmd: 'T' },
    { name: 'Y', cmd: 'y', shift_cmd: 'Y' },
    { name: 'U', cmd: 'u', shift_cmd: 'U' },
    { name: 'I', cmd: 'i', shift_cmd: 'I' },
    { name: 'O', cmd: 'o', shift_cmd: 'O' },
    { name: 'P', cmd: 'p', shift_cmd: 'P' },
    { name: '[', cmd: '[', shift_name: '{', shift_cmd: '{' },
    { name: ']', cmd: ']', shift_name: '}', shift_cmd: '}' },
    { name: 'ENTER', cmd: '\r' },
  ],
  row_2: [
    { name: 'CAPS', cmd: 'CAPS_LOCK' },
    { name: 'A', cmd: 'a', shift_cmd: 'A' },
    { name: 'S', cmd: 's', shift_cmd: 'S' },
    { name: 'D', cmd: 'd', shift_cmd: 'D' },
    { name: 'F', cmd: 'f', shift_cmd: 'F' },
    { name: 'G', cmd: 'g', shift_cmd: 'G' },
    { name: 'H', cmd: 'h', shift_cmd: 'H' },
    { name: 'J', cmd: 'j', shift_cmd: 'J' },
    { name: 'K', cmd: 'k', shift_cmd: 'K' },
    { name: 'L', cmd: 'l', shift_cmd: 'L' },
    { name: ';', cmd: ';', shift_name: ':', shift_cmd: ':' },
    { name: "'", cmd: "'", shift_name: '"', shift_cmd: '"' },
    { name: '\\', cmd: '\\', shift_name: '|', shift_cmd: '|' },
  ],
  row_3: [
    { name: 'SHIFT', cmd: 'SHIFT_LEFT' },
    { name: 'Z', cmd: 'z', shift_cmd: 'Z' },
    { name: 'X', cmd: 'x', shift_cmd: 'X' },
    { name: 'C', cmd: 'c', shift_cmd: 'C' },
    { name: 'V', cmd: 'v', shift_cmd: 'V' },
    { name: 'B', cmd: 'b', shift_cmd: 'B' },
    { name: 'N', cmd: 'n', shift_cmd: 'N' },
    { name: 'M', cmd: 'm', shift_cmd: 'M' },
    { name: ',', cmd: ',', shift_name: '<', shift_cmd: '<' },
    { name: '.', cmd: '.', shift_name: '>', shift_cmd: '>' },
    { name: '/', cmd: '/', shift_name: '?', shift_cmd: '?' },
    { name: 'SHIFT', cmd: 'SHIFT_RIGHT' },
    { name: '▲', cmd: '\x1bOA', isArrow: true },
  ],
  row_space: [
    { name: 'CTRL', cmd: 'CTRL_LEFT' },
    { name: 'FN', cmd: 'FN_TOGGLE' },
    { name: ' ', cmd: ' ', isSpace: true },
    { name: 'ALT', cmd: 'ALT_RIGHT' },
    { name: 'CTRL', cmd: 'CTRL_RIGHT' },
    { name: '◀', cmd: '\x1bOD', isArrow: true },
    { name: '▼', cmd: '\x1bOB', isArrow: true },
    { name: '▶', cmd: '\x1bOC', isArrow: true },
  ],
}

// Map physical key codes to layout row/key indices for highlighting
const PHYSICAL_KEY_MAP = {
  'Escape': 'r0k0', 'Backquote': 'r0k1',
  'Digit1': 'r0k2', 'Digit2': 'r0k3', 'Digit3': 'r0k4', 'Digit4': 'r0k5',
  'Digit5': 'r0k6', 'Digit6': 'r0k7', 'Digit7': 'r0k8', 'Digit8': 'r0k9',
  'Digit9': 'r0k10', 'Digit0': 'r0k11', 'Minus': 'r0k12', 'Equal': 'r0k13',
  'Backspace': 'r0k14',
  'Tab': 'r1k0',
  'KeyQ': 'r1k1', 'KeyW': 'r1k2', 'KeyE': 'r1k3', 'KeyR': 'r1k4',
  'KeyT': 'r1k5', 'KeyY': 'r1k6', 'KeyU': 'r1k7', 'KeyI': 'r1k8',
  'KeyO': 'r1k9', 'KeyP': 'r1k10', 'BracketLeft': 'r1k11', 'BracketRight': 'r1k12',
  'Enter': 'r1k13',
  'CapsLock': 'r2k0',
  'KeyA': 'r2k1', 'KeyS': 'r2k2', 'KeyD': 'r2k3', 'KeyF': 'r2k4',
  'KeyG': 'r2k5', 'KeyH': 'r2k6', 'KeyJ': 'r2k7', 'KeyK': 'r2k8',
  'KeyL': 'r2k9', 'Semicolon': 'r2k10', 'Quote': 'r2k11', 'Backslash': 'r2k12',
  'ShiftLeft': 'r3k0',
  'KeyZ': 'r3k1', 'KeyX': 'r3k2', 'KeyC': 'r3k3', 'KeyV': 'r3k4',
  'KeyB': 'r3k5', 'KeyN': 'r3k6', 'KeyM': 'r3k7',
  'Comma': 'r3k8', 'Period': 'r3k9', 'Slash': 'r3k10',
  'ShiftRight': 'r3k11',
  'ArrowUp': 'r3k12',
  'ControlLeft': 'r4k0', 'AltLeft': 'r4k1',
  'Space': 'r4k2',
  'AltRight': 'r4k3', 'ControlRight': 'r4k4',
  'ArrowLeft': 'r4k5', 'ArrowDown': 'r4k6', 'ArrowRight': 'r4k7',
}

export function activate(ctx) {
  const h = ctx.h

  const isShiftOn = ctx.ref(false)
  const isCapsLckOn = ctx.ref(false)
  const isCtrlOn = ctx.ref(false)
  const isAltOn = ctx.ref(false)
  const isFnOn = ctx.ref(false)
  const activeKeys = ctx.ref(new Set())
  const blinkKeys = ctx.ref(new Set())

  const rows = [
    { id: 'row_numbers', keys: LAYOUT.row_numbers },
    { id: 'row_1', keys: LAYOUT.row_1 },
    { id: 'row_2', keys: LAYOUT.row_2 },
    { id: 'row_3', keys: LAYOUT.row_3 },
    { id: 'row_space', keys: LAYOUT.row_space },
  ]

  function getCmd(key) {
    if (isFnOn.value && key.fn_cmd) return key.fn_cmd
    if (isAltOn.value && isShiftOn.value && key.altshift_cmd) return key.altshift_cmd
    if (isAltOn.value && key.alt_cmd) return key.alt_cmd
    if (isCtrlOn.value && key.ctrl_cmd) return key.ctrl_cmd
    if ((isShiftOn.value || isCapsLckOn.value) && key.shift_cmd) return key.shift_cmd
    return key.cmd
  }

  function sendToTerminal(cmd) {
    const paneId = ctx.terminal.activePaneId()
    if (paneId) {
      ctx.terminal.send(paneId, cmd)
    }
  }

  function handleSpecialCmd(cmd) {
    if (cmd === 'CAPS_LOCK') {
      isCapsLckOn.value = !isCapsLckOn.value
      return true
    }
    if (cmd === 'SHIFT_LEFT' || cmd === 'SHIFT_RIGHT') {
      isShiftOn.value = true
      return true
    }
    if (cmd === 'CTRL_LEFT' || cmd === 'CTRL_RIGHT') {
      isCtrlOn.value = true
      return true
    }
    if (cmd === 'ALT_RIGHT') {
      isAltOn.value = true
      return true
    }
    if (cmd === 'FN_TOGGLE') {
      isFnOn.value = !isFnOn.value
      return true
    }
    return false
  }

  function handleSpecialRelease(cmd) {
    if (cmd === 'SHIFT_LEFT' || cmd === 'SHIFT_RIGHT') {
      isShiftOn.value = false
      return true
    }
    if (cmd === 'CTRL_LEFT' || cmd === 'CTRL_RIGHT') {
      isCtrlOn.value = false
      return true
    }
    if (cmd === 'ALT_RIGHT') {
      isAltOn.value = false
      return true
    }
    return false
  }

  function activateKey(rowIdx, keyIdx) {
    const k = `r${rowIdx}k${keyIdx}`
    const s = new Set(activeKeys.value)
    s.add(k)
    activeKeys.value = s
  }

  function deactivateKey(rowIdx, keyIdx) {
    const k = `r${rowIdx}k${keyIdx}`
    const s = new Set(activeKeys.value)
    s.delete(k)
    activeKeys.value = s
    // Blink
    const b = new Set(blinkKeys.value)
    b.add(k)
    blinkKeys.value = b
    setTimeout(() => {
      const b2 = new Set(blinkKeys.value)
      b2.delete(k)
      blinkKeys.value = b2
    }, 150)
  }

  function handleMouseDown(rowIdx, keyIdx, key) {
    activateKey(rowIdx, keyIdx)
    const cmd = key.cmd
    if (handleSpecialCmd(cmd)) return
    const actualCmd = getCmd(key)
    if (actualCmd) sendToTerminal(actualCmd)
  }

  function handleMouseUp(rowIdx, keyIdx, key) {
    deactivateKey(rowIdx, keyIdx)
    handleSpecialRelease(key.cmd)
  }

  // Physical keyboard sync
  let keydownHandler = null
  let keyupHandler = null

  ctx.commands.register('jiahao-keyboard.open', () => { ctx.open() })

  return {
    component: {
      setup() {
        ctx.onMounted(() => {
          keydownHandler = (e) => {
            const mapped = PHYSICAL_KEY_MAP[e.code]
            if (!mapped) return
            const rowIdx = parseInt(mapped[1])
            const keyIdx = parseInt(mapped.slice(3))
            activateKey(rowIdx, keyIdx)

            // Update modifier states
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') isShiftOn.value = true
            if (e.code === 'ControlLeft' || e.code === 'ControlRight') isCtrlOn.value = true
            if (e.code === 'AltLeft' || e.code === 'AltRight') isAltOn.value = true
            if (e.code === 'CapsLock') isCapsLckOn.value = !isCapsLckOn.value
          }

          keyupHandler = (e) => {
            const mapped = PHYSICAL_KEY_MAP[e.code]
            if (!mapped) return
            const rowIdx = parseInt(mapped[1])
            const keyIdx = parseInt(mapped.slice(3))
            deactivateKey(rowIdx, keyIdx)

            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') isShiftOn.value = false
            if (e.code === 'ControlLeft' || e.code === 'ControlRight') isCtrlOn.value = false
            if (e.code === 'AltLeft' || e.code === 'AltRight') isAltOn.value = false
          }

          document.addEventListener('keydown', keydownHandler)
          document.addEventListener('keyup', keyupHandler)
        })

        ctx.onUnmounted(() => {
          if (keydownHandler) document.removeEventListener('keydown', keydownHandler)
          if (keyupHandler) document.removeEventListener('keyup', keyupHandler)
        })

        return {}
      },
      render() {
        const modifierState = [
          isShiftOn.value ? 'shift' : '',
          isCapsLckOn.value ? 'caps' : '',
          isCtrlOn.value ? 'ctrl' : '',
          isAltOn.value ? 'alt' : '',
          isFnOn.value ? 'fn' : '',
        ].filter(Boolean).join(' ')

        return h('div', {
          class: 'jk-root' + (modifierState ? ' jk-modifiers-active' : ''),
          'data-modifiers': modifierState,
        },
          rows.map((row, ri) =>
            h('div', { key: row.id, class: 'jk-row', 'data-row': row.id },
              row.keys.map((key, ki) => {
                const keyId = `r${ri}k${ki}`
                const isActive = activeKeys.value.has(keyId)
                const isBlink = blinkKeys.value.has(keyId)

                let cls = 'jk-key'
                if (key.isSpace) cls += ' jk-key-space'
                if (key.isArrow) cls += ' jk-key-arrow'
                if (key.cmd === 'ENTER' && ri === 1) cls += ' jk-key-enter'
                if (key.cmd === 'CAPS_LOCK' && isCapsLckOn.value) cls += ' jk-key-lit'
                if (key.cmd === 'FN_TOGGLE' && isFnOn.value) cls += ' jk-key-lit'
                if (isActive) cls += ' jk-key-active'
                if (isBlink) cls += ' jk-key-blink'

                // Determine display label
                let label = key.name
                let subLabel = null
                if ((isShiftOn.value || isCapsLckOn.value) && key.shift_name) {
                  subLabel = key.name
                  label = key.shift_name
                }
                if (isFnOn.value && key.fn_name) {
                  subLabel = key.name
                  label = key.fn_name
                }

                return h('div', {
                  key: keyId,
                  class: cls,
                  onMousedown: (e) => { e.preventDefault(); handleMouseDown(ri, ki, key) },
                  onMouseup: () => handleMouseUp(ri, ki, key),
                  onMouseleave: () => {
                    if (isActive) handleMouseUp(ri, ki, key)
                  },
                }, [
                  subLabel ? h('span', { class: 'jk-key-sub' }, subLabel) : null,
                  h('span', { class: 'jk-key-label' }, label),
                ].filter(Boolean))
              })
            )
          )
        )
      },
    },
    dispose() {
      if (keydownHandler) document.removeEventListener('keydown', keydownHandler)
      if (keyupHandler) document.removeEventListener('keyup', keyupHandler)
    },
  }
}
