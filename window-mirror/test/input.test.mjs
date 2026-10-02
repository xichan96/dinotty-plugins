// Checks that a PointerEvent arriving over RFB actually moves the real cursor.
//
// The unit tests cover the coordinate arithmetic and the keysym table; what
// they cannot cover is the path from a wire message through SendInput to the
// desktop. This drives that path end to end and then asks the OS where the
// cursor went.
//
// The key half is exercised with Shift, which changes nothing on its own: the
// test asserts the host sees it held down and then released. Any key that
// produces text would type into whatever window this test just raised.

import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const exe = join(here, '..', 'native', 'target', 'release', 'window-mirror.exe')
const run = (...args) => JSON.parse(execFileSync(exe, args, { encoding: 'utf8' }))
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Absolute mouse positioning is quantised to 1/65535 of the virtual desktop,
 * so across two monitors a landing point can be a couple of pixels off what the
 * mapping computed. Anything larger is a real mapping error.
 */
const TOLERANCE = 4
const near = (a, b) => Math.abs(a.x - b.x) <= TOLERANCE && Math.abs(a.y - b.y) <= TOLERANCE

/**
 * Send, then look, retrying a few times.
 *
 * This test drives the one real cursor on a real desktop. If someone is using
 * the machine, their hand wins the race and the reading is meaningless -- which
 * is a reason to retry, not a reason to fail. Persistent disagreement is still
 * a failure.
 */
async function landsNear(expected, send, attempts = 4) {
  let last = null
  for (let i = 0; i < attempts; i++) {
    send()
    await wait(250)
    last = run('cursor')
    if (near(last, expected)) return { ok: true, last }
    await wait(250)
  }
  return { ok: false, last }
}

class Reader {
  #chunks = []
  #len = 0
  #want = null
  push(bytes) {
    this.#chunks.push(bytes)
    this.#len += bytes.length
    if (this.#want && this.#len >= this.#want.n) {
      const { n, resolve } = this.#want
      this.#want = null
      resolve(this.#take(n))
    }
  }
  #take(n) {
    const out = Buffer.allocUnsafe(n)
    let filled = 0
    while (filled < n) {
      const head = this.#chunks[0]
      const use = Math.min(head.length, n - filled)
      head.copy(out, filled, 0, use)
      filled += use
      if (use === head.length) this.#chunks.shift()
      else this.#chunks[0] = head.subarray(use)
    }
    this.#len -= n
    return out
  }
  read(n) {
    if (this.#len >= n) return Promise.resolve(this.#take(n))
    return new Promise((resolve) => { this.#want = { n, resolve } })
  }
}

const hwnd =
  process.argv[2] ?? String(JSON.parse(execFileSync(exe, ['list'], { encoding: 'utf8' }))[0].id)

// Park the cursor away from the middle, so that landing in the middle later is
// evidence of something rather than of where it already was.
run('pointer-probe', '--hwnd', hwnd, '--fx', '0.2', '--fy', '0.2')

const server = spawn(exe, ['serve', '--hwnd', hwnd], { stdio: ['ignore', 'pipe', 'pipe'] })
let serverErr = ''
server.stderr.on('data', (d) => (serverErr += d))
const listening = await new Promise((resolve, reject) => {
  let buf = ''
  server.stdout.on('data', (d) => {
    buf += d
    const line = buf.split('\n').find((l) => l.includes('"listening"'))
    if (line) resolve(JSON.parse(line))
  })
  server.on('exit', (code) => reject(new Error(`server exited ${code}: ${serverErr}`)))
  setTimeout(() => reject(new Error(`server never announced a port: ${serverErr}`)), 15000)
})
assert.equal(listening.input, true, 'input should be on unless --view-only was passed')

const reader = new Reader()
const ws = new WebSocket(`ws://127.0.0.1:${listening.port}/`, ['binary'])
ws.binaryType = 'arraybuffer'
ws.onmessage = (e) => reader.push(Buffer.from(e.data))
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = () => reject(new Error('websocket failed to open'))
})

await reader.read(12)
ws.send(Buffer.from('RFB 003.008\n', 'ascii'))
const types = await reader.read(1)
await reader.read(types[0])
ws.send(Buffer.from([1]))
await reader.read(4)
ws.send(Buffer.from([1]))
const init = await reader.read(24)
const width = init.readUInt16BE(0)
const height = init.readUInt16BE(2)
await reader.read(init.readUInt32BE(20))

// Work out where the middle of *this* framebuffer is only now that the server
// has said how big it is. Measuring beforehand was the bug: a window that
// resizes between the measurement and the connection leaves the test sending
// the centre of one framebuffer and checking it against another, which reads
// as a mapping error and is not one.
const centre = run('map-point', '--hwnd', hwnd, '--fx', '0.5', '--fy', '0.5')
assert.equal(
  centre.frame.width,
  width,
  'the window resized between connecting and measuring; rerun on a still desktop',
)
assert.equal(centre.frame.height, height)
assert.ok(
  !near(run('cursor'), centre.expected_screen),
  'the cursor should be parked away from the centre before the real test',
)

// The centre of the framebuffer, which is the point pointer-probe measured.
const pointer = Buffer.alloc(6)
pointer[0] = 5
pointer[1] = 0 // no buttons: move only, so nothing gets clicked
pointer.writeUInt16BE(Math.round((width - 1) * 0.5), 2)
pointer.writeUInt16BE(Math.round((height - 1) * 0.5), 4)
const { ok, last } = await landsNear(centre.expected_screen, () => ws.send(pointer))
console.log('sent framebuffer centre; cursor at', last, 'expected', centre.expected_screen)
assert.ok(
  ok,
  `a PointerEvent over RFB should land where the coordinate mapping says: ` +
    `wanted ${JSON.stringify(centre.expected_screen)}, got ${JSON.stringify(last)}. ` +
    `If someone is using this machine, their mouse is fighting the test.`,
)

// A key event over the same path: Shift down, held, and up again.
const VK_LSHIFT = 160
const key = (keysym, down) => {
  const b = Buffer.alloc(8)
  b[0] = 4
  b[1] = down ? 1 : 0
  b.writeUInt32BE(keysym, 4)
  ws.send(b)
}
const KEYSYM_SHIFT_L = 0xffe1
assert.equal(run('key-state', '--vk', String(VK_LSHIFT)).down, false, 'shift starts up')
key(KEYSYM_SHIFT_L, true)
await new Promise((resolve) => setTimeout(resolve, 250))
assert.equal(
  run('key-state', '--vk', String(VK_LSHIFT)).down,
  true,
  'a KeyEvent should leave the key held on the host',
)
key(KEYSYM_SHIFT_L, false)
await new Promise((resolve) => setTimeout(resolve, 250))
assert.equal(run('key-state', '--vk', String(VK_LSHIFT)).down, false, 'and release it')
console.log('shift held and released through the RFB path')

// And a read-only server must ignore the same event.
ws.close()
server.kill()

// Park the cursor away from the centre, so that "did not move to the centre"
// is a meaningful thing to assert afterwards.
run('pointer-probe', '--hwnd', hwnd, '--fx', '0.2', '--fy', '0.2')
const readOnly = spawn(exe, ['serve', '--hwnd', hwnd, '--view-only'], {
  stdio: ['ignore', 'pipe', 'pipe'],
})
const roListening = await new Promise((resolve, reject) => {
  let buf = ''
  readOnly.stdout.on('data', (d) => {
    buf += d
    const line = buf.split('\n').find((l) => l.includes('"listening"'))
    if (line) resolve(JSON.parse(line))
  })
  setTimeout(() => reject(new Error('read-only server never announced a port')), 15000)
})
assert.equal(roListening.input, false)

const roReader = new Reader()
const roWs = new WebSocket(`ws://127.0.0.1:${roListening.port}/`, ['binary'])
roWs.binaryType = 'arraybuffer'
roWs.onmessage = (e) => roReader.push(Buffer.from(e.data))
await new Promise((resolve) => { roWs.onopen = resolve })
await roReader.read(12)
roWs.send(Buffer.from('RFB 003.008\n', 'ascii'))
const roTypes = await roReader.read(1)
await roReader.read(roTypes[0])
roWs.send(Buffer.from([1]))
await roReader.read(4)
roWs.send(Buffer.from([1]))
const roInit = await roReader.read(24)
await roReader.read(roInit.readUInt32BE(20))
roWs.send(pointer)

await wait(500)
// Asserting where the cursor *is* would fail whenever a hand nudges the mouse.
// What matters is that it did not jump to the point the ignored event named.
assert.ok(
  !near(run('cursor'), centre.expected_screen),
  '--view-only must ignore a PointerEvent, not merely hide the control',
)

roWs.close()
readOnly.kill()
console.log('\nOK')
