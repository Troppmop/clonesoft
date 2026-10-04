// Draws the app icons in frontend/public/icons: the Clonesoft grid logo (the header's LayoutGrid
// mark) in white on indigo. Run with `node scripts/build-icons.mjs` from the repository root.
import { mkdir, writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'

const INDIGO = [79, 70, 229]
const WHITE = [255, 255, 255]

// Signed distance from (x, y) to a rounded rectangle centered at (cx, cy)
function roundedRect(x, y, cx, cy, halfW, halfH, r) {
  const dx = Math.abs(x - cx) - halfW + r
  const dy = Math.abs(y - cy) - halfH + r
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r
}

/**
 * background: 'rounded' (transparent corners), 'full' (edge to edge, for maskable and Apple icons)
 * or 'none' (transparent, for the monochrome notification badge). `scale` sizes the grid.
 */
function draw(size, { background, scale }) {
  const px = new Uint8Array(size * size * 4)
  const samples = 4
  const cell = 0.18 * scale // half-width of each grid square, as a fraction of the icon
  const gap = 0.045 * scale
  const centers = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => [0.5 + sx * (cell + gap), 0.5 + sy * (cell + gap)]))

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0
      let fg = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const u = (x + (sx + 0.5) / samples) / size
          const v = (y + (sy + 0.5) / samples) / size
          if (background === 'full' || (background === 'rounded' && roundedRect(u, v, 0.5, 0.5, 0.5, 0.5, 0.22) <= 0)) bg++
          if (centers.some(([cx, cy]) => roundedRect(u, v, cx, cy, cell, cell, cell * 0.32) <= 0)) fg++
        }
      }
      const n = samples * samples
      const fgA = fg / n
      const bgA = background === 'none' ? 0 : bg / n
      const alpha = fgA + bgA * (1 - fgA)
      const i = (y * size + x) * 4
      for (let c = 0; c < 3; c++) {
        px[i + c] = alpha ? Math.round((WHITE[c] * fgA + INDIGO[c] * bgA * (1 - fgA)) / alpha) : 0
      }
      px[i + 3] = Math.round(alpha * 255)
    }
  }
  return png(size, px)
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function png(size, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8) // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // no filter
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const dir = 'frontend/public/icons'
await mkdir(dir, { recursive: true })
await writeFile(`${dir}/icon-192.png`, draw(192, { background: 'rounded', scale: 0.72 }))
await writeFile(`${dir}/icon-512.png`, draw(512, { background: 'rounded', scale: 0.72 }))
// Maskable icons get cropped to a circle or squircle, so the logo stays inside the middle 80%
await writeFile(`${dir}/maskable-512.png`, draw(512, { background: 'full', scale: 0.6 }))
await writeFile(`${dir}/apple-touch-icon.png`, draw(180, { background: 'full', scale: 0.7 }))
await writeFile(`${dir}/badge-96.png`, draw(96, { background: 'none', scale: 1.15 }))
console.log('wrote icons to', dir)
