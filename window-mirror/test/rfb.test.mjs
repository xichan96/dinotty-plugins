// End-to-end check of the RFB server: start it against a real window, speak
// the protocol back at it as a client would, and decode what comes out.
//
// Node's global WebSocket (22+) is the client, so this needs no dependencies.
// It is not a fixture replay -- the point is that the bytes on the wire are
// right, which only a live handshake can show.

import { spawn, execFileSync } from 'node:child_process'
import { createInflate, deflateSync, constants as zlibConstants } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const exe = join(here, '..', 'native', 'target', 'release', 'window-mirror.exe')

const ENCODING_RAW = 0
const ENCODING_ZLIB = 6
const ENCODING_DESKTOP_SIZE = -223

/** A byte stream assembled from WebSocket messages, since RFB has no framing. */
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
    return new Promise((resolve) => {
      this.#want = { n, resolve }
    })
  }
}

function png(width, height, rgba) {
  const raw = Buffer.allocUnsafe((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const chunk = (type, data) => {
    const out = Buffer.allocUnsafe(data.length + 12)
    out.writeUInt32BE(data.length, 0)
    out.write(type, 4, 'ascii')
    data.copy(out, 8)
    const crcInput = out.subarray(4, 8 + data.length)
    let crc = 0xffffffff
    for (const byte of crcInput) {
      crc ^= byte
      for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
    out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length)
    return out
  }
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// One zlib stream for the whole connection, exactly as the server keeps one:
// decompressing each rect independently would fail on the second one.
const inflate = createInflate()
const inflated = new Reader()
inflate.on('data', (chunk) => inflated.push(chunk))

async function readUpdate(reader, fb) {
  const head = await reader.read(4)
  assert.equal(head[0], 0, 'expected a FramebufferUpdate')
  const rects = head.readUInt16BE(2)
  const seen = []
  for (let i = 0; i < rects; i++) {
    const r = await reader.read(12)
    const rect = {
      x: r.readUInt16BE(0),
      y: r.readUInt16BE(2),
      w: r.readUInt16BE(4),
      h: r.readUInt16BE(6),
      encoding: r.readInt32BE(8),
    }
    if (rect.encoding === ENCODING_DESKTOP_SIZE) {
      seen.push({ ...rect, wire: 0 })
      fb.resize(rect.w, rect.h)
      continue
    }
    const pixels = rect.w * rect.h * 4
    let data
    if (rect.encoding === ENCODING_ZLIB) {
      const length = (await reader.read(4)).readUInt32BE(0)
      rect.wire = length + 4
      const compressed = await reader.read(length)
      inflate.write(compressed)
      // The server sync-flushed, so everything is there; nudge node into
      // emitting it rather than holding it in its own buffer.
      inflate.flush(zlibConstants.Z_SYNC_FLUSH)
      data = await inflated.read(pixels)
    } else {
      assert.equal(rect.encoding, ENCODING_RAW, `unexpected encoding ${rect.encoding}`)
      rect.wire = pixels
      data = await reader.read(pixels)
    }
    seen.push(rect)
    fb.blit(rect, data)
  }
  return seen
}

function framebuffer(width, height) {
  return {
    width,
    height,
    pixels: Buffer.alloc(width * height * 4),
    resize(w, h) {
      this.width = w
      this.height = h
      this.pixels = Buffer.alloc(w * h * 4)
    },
    blit(rect, data) {
      for (let row = 0; row < rect.h; row++) {
        data.copy(
          this.pixels,
          ((rect.y + row) * this.width + rect.x) * 4,
          row * rect.w * 4,
          (row + 1) * rect.w * 4,
        )
      }
    },
  }
}

const hwndArg = process.argv[2]
const hwnd =
  hwndArg ?? String(JSON.parse(execFileSync(exe, ['list'], { encoding: 'utf8' }))[0].id)

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
console.log('server:', listening)

const reader = new Reader()
const ws = new WebSocket(`ws://127.0.0.1:${listening.port}/`, ['binary'])
ws.binaryType = 'arraybuffer'
ws.onmessage = (e) => reader.push(Buffer.from(e.data))
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = () => reject(new Error('websocket failed to open'))
})
assert.equal(ws.protocol, 'binary', 'server must echo the binary subprotocol back')

const send = (bytes) => ws.send(bytes)

// --- handshake -------------------------------------------------------------
const version = await reader.read(12)
assert.equal(version.toString('ascii'), 'RFB 003.008\n')
send(Buffer.from('RFB 003.008\n', 'ascii'))

const types = await reader.read(1)
const offered = await reader.read(types[0])
assert.ok(offered.includes(1), 'security type None must be offered')
send(Buffer.from([1]))

const secResult = await reader.read(4)
assert.equal(secResult.readUInt32BE(0), 0, 'security handshake must succeed')

send(Buffer.from([1])) // shared

const init = await reader.read(24)
const fb = framebuffer(init.readUInt16BE(0), init.readUInt16BE(2))
const pf = init.subarray(4, 20)
assert.equal(pf[0], 32, 'expected 32 bpp')
assert.equal(pf[3], 1, 'expected true colour')
const name = (await reader.read(init.readUInt32BE(20))).toString('utf8')
console.log(`framebuffer ${fb.width}x${fb.height} "${name}"`)
assert.ok(fb.width > 0 && fb.height > 0)

// --- ask for pixels --------------------------------------------------------
const encodings = Buffer.alloc(4 + 12)
encodings[0] = 2
encodings.writeUInt16BE(3, 2)
encodings.writeInt32BE(ENCODING_ZLIB, 4)
encodings.writeInt32BE(ENCODING_RAW, 8)
encodings.writeInt32BE(ENCODING_DESKTOP_SIZE, 12)
send(encodings)

const request = (incremental) => {
  const b = Buffer.alloc(10)
  b[0] = 3
  b[1] = incremental ? 1 : 0
  b.writeUInt16BE(0, 2)
  b.writeUInt16BE(0, 4)
  b.writeUInt16BE(fb.width, 6)
  b.writeUInt16BE(fb.height, 8)
  send(b)
}

const startedFull = Date.now()
request(false)
const fullRects = await readUpdate(reader, fb)
const fullMs = Date.now() - startedFull
assert.equal(fullRects.length, 1, 'a non-incremental request should answer with one full rect')
assert.deepEqual(
  { x: fullRects[0].x, y: fullRects[0].y, w: fullRects[0].w, h: fullRects[0].h },
  { x: 0, y: 0, w: fb.width, h: fb.height },
)
assert.equal(fullRects[0].encoding, ENCODING_ZLIB, 'zlib should win over raw when offered')
const fullPixels = fb.width * fb.height * 4
console.log(
  `full update: ${(fullPixels / 1e6).toFixed(1)} MB of pixels sent as ` +
    `${(fullRects[0].wire / 1e6).toFixed(2)} MB (${(fullPixels / fullRects[0].wire).toFixed(1)}x) ` +
    `in ${fullMs} ms`,
)

const out = join(here, 'rfb-frame.png')
writeFileSync(out, png(fb.width, fb.height, fb.pixels))
console.log('decoded to', out)

// --- and then only what changed -------------------------------------------
const startedInc = Date.now()
request(true)
const incRects = await readUpdate(reader, fb)
const incMs = Date.now() - startedInc
const incPixels = incRects.reduce((n, r) => n + r.w * r.h * 4, 0)
const incWire = incRects.reduce((n, r) => n + r.wire, 0)
console.log(
  `incremental update: ${incRects.length} rect(s), ` +
    `${(incPixels / 1e3).toFixed(1)} kB of pixels sent as ${(incWire / 1e3).toFixed(1)} kB ` +
    `in ${incMs} ms`,
)
assert.ok(incWire < fullRects[0].wire, 'an incremental update must be smaller than a full frame')
writeFileSync(join(here, 'rfb-frame-2.png'), png(fb.width, fb.height, fb.pixels))

ws.close()
server.kill()
console.log('\nOK')
