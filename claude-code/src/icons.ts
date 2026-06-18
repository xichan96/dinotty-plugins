// SVG icon helper for dinotty plugins using h() hyperscript
// Lucide icons (https://lucide.dev) + Lobe-icons Claude branding

type HFn = (tag: string, attrs: Record<string, any> | null, ...children: any[]) => any

// Lucide icon definitions: [tagName, attributes][]
// Source: lucide v1.21.0 (ISC License)
const ICON_PATHS: Record<string, [string, Record<string, string>][]> = {
  search: [['path', { d: 'm21 21-4.34-4.34' }], ['circle', { cx: '11', cy: '11', r: '8' }]],
  'refresh-cw': [
    ['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }],
    ['path', { d: 'M21 3v5h-5' }],
    ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }],
    ['path', { d: 'M8 16H3v5' }],
  ],
  plus: [['path', { d: 'M5 12h14' }], ['path', { d: 'M12 5v14' }]],
  x: [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]],
  'chevron-right': [['path', { d: 'm9 18 6-6-6-6' }]],
  'chevron-down': [['path', { d: 'm6 9 6 6 6-6' }]],
  'arrow-left': [['path', { d: 'm12 19-7-7 7-7' }], ['path', { d: 'M19 12H5' }]],
  send: [
    ['path', { d: 'M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z' }],
    ['path', { d: 'm21.854 2.147-10.94 10.939' }],
  ],
  menu: [['path', { d: 'M4 5h16' }], ['path', { d: 'M4 12h16' }], ['path', { d: 'M4 19h16' }]],
  brain: [
    ['path', { d: 'M12 18V5' }],
    ['path', { d: 'M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4' }],
    ['path', { d: 'M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5' }],
    ['path', { d: 'M17.997 5.125a4 4 0 0 1 2.526 5.77' }],
    ['path', { d: 'M18 18a4 4 0 0 0 2-7.464' }],
    ['path', { d: 'M6.003 5.125a4 4 0 0 0-2.526 5.77' }],
    ['path', { d: 'M6 18a4 4 0 0 1-2-7.464' }],
  ],
  copy: [
    ['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' }],
    ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
  ],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  folder: [
    ['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }],
  ],
  zap: [
    ['path', { d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z' }],
  ],
  hash: [
    ['line', { x1: '4', x2: '20', y1: '9', y2: '9' }],
    ['line', { x1: '4', x2: '20', y1: '15', y2: '15' }],
    ['line', { x1: '10', x2: '8', y1: '3', y2: '21' }],
    ['line', { x1: '16', x2: '14', y1: '3', y2: '21' }],
  ],
  terminal: [['path', { d: 'M12 19h8' }], ['path', { d: 'm4 17 6-6-6-6' }]],
  'file-text': [
    ['path', { d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z' }],
    ['path', { d: 'M14 2v5a1 1 0 0 0 1 1h5' }],
    ['path', { d: 'M10 12h4' }],
    ['path', { d: 'M10 16h4' }],
  ],
  pencil: [
    ['path', { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' }],
  ],
  eye: [
    ['path', { d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0' }],
    ['circle', { cx: '12', cy: '12', r: '3' }],
  ],
  globe: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' }],
    ['path', { d: 'M2 12h20' }],
  ],
  settings: [
    ['path', { d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915' }],
    ['circle', { cx: '12', cy: '12', r: '3' }],
  ],
  'message-square': [
    ['path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }],
  ],
  'square-pen': [
    ['path', { d: 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }],
    ['path', { d: 'M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z' }],
  ],
}

// ClaudeCode icon from lobe-icons (fill-based SVG, not stroke)
const CLAUDE_CODE_PATH = 'M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z'

let _h: HFn

export function initIcons(h: HFn) {
  _h = h
}

function renderIcon(paths: [string, Record<string, string>][], size = 16, cls = ''): any {
  const children = paths.map(([tag, attrs]) => _h(tag, attrs))
  return _h('svg', {
    class: `ccm-icon ${cls}`.trim(),
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }, ...children)
}

function renderFillIcon(pathD: string, size = 16, cls = ''): any {
  return _h('svg', {
    class: `ccm-icon ${cls}`.trim(),
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    xmlns: 'http://www.w3.org/2000/svg',
  }, _h('path', { d: pathD, 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' }))
}

// --- Exported icon functions ---

export function IconSearch(size?: number) { return renderIcon(ICON_PATHS.search, size) }
export function IconRefresh(size?: number) { return renderIcon(ICON_PATHS['refresh-cw'], size) }
export function IconPlus(size?: number) { return renderIcon(ICON_PATHS.plus, size) }
export function IconX(size?: number) { return renderIcon(ICON_PATHS.x, size) }
export function IconChevronRight(size?: number) { return renderIcon(ICON_PATHS['chevron-right'], size) }
export function IconChevronDown(size?: number) { return renderIcon(ICON_PATHS['chevron-down'], size) }
export function IconArrowLeft(size?: number) { return renderIcon(ICON_PATHS['arrow-left'], size) }
export function IconSend(size?: number) { return renderIcon(ICON_PATHS.send, size) }
export function IconMenu(size?: number) { return renderIcon(ICON_PATHS.menu, size) }
export function IconBrain(size?: number) { return renderIcon(ICON_PATHS.brain, size) }
export function IconCopy(size?: number) { return renderIcon(ICON_PATHS.copy, size) }
export function IconCheck(size?: number) { return renderIcon(ICON_PATHS.check, size) }
export function IconFolder(size?: number) { return renderIcon(ICON_PATHS.folder, size) }
export function IconZap(size?: number) { return renderIcon(ICON_PATHS.zap, size) }
export function IconHash(size?: number) { return renderIcon(ICON_PATHS.hash, size) }
export function IconTerminal(size?: number) { return renderIcon(ICON_PATHS.terminal, size) }
export function IconFileText(size?: number) { return renderIcon(ICON_PATHS['file-text'], size) }
export function IconPencil(size?: number) { return renderIcon(ICON_PATHS.pencil, size) }
export function IconEye(size?: number) { return renderIcon(ICON_PATHS.eye, size) }
export function IconGlobe(size?: number) { return renderIcon(ICON_PATHS.globe, size) }
export function IconSettings(size?: number) { return renderIcon(ICON_PATHS.settings, size) }
export function IconMessageSquare(size?: number) { return renderIcon(ICON_PATHS['message-square'], size) }
export function IconSquarePen(size?: number) { return renderIcon(ICON_PATHS['square-pen'], size) }

// ClaudeCode icon from lobe-icons (fill-based, not stroke)
export function IconClaude(size?: number, cls?: string) { return renderFillIcon(CLAUDE_CODE_PATH, size, cls) }
