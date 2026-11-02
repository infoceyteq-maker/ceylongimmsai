/**
 * Generates a neutral PLACEHOLDER wordmark PNG (light ash + black type).
 * This is NOT the supplied AI GIMMS logo — that asset was not present in this
 * workspace. Replace public/logo-512.png with the original file when available;
 * do not invert, redraw, recolour or crop it.
 *
 * Pure Node (zlib only), no dependencies, no external CDN.
 */
import fs from "node:fs";
import zlib from "node:zlib";

const W = 512;
const H = 512;
const buf = Buffer.alloc(W * H * 4);

for (let i = 0; i < W * H; i += 1) {
  buf[i * 4] = 236;
  buf[i * 4 + 1] = 238;
  buf[i * 4 + 2] = 233;
  buf[i * 4 + 3] = 255;
}

function px(x, y, r, g, b) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 4;
  buf[o] = r;
  buf[o + 1] = g;
  buf[o + 2] = b;
  buf[o + 3] = 255;
}

function fill(x0, y0, w, h, r, g, b) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) px(x, y, r, g, b);
  }
}

const GLYPHS = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01110"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function drawText(str, x0, y0, scale) {
  let cx = x0;
  for (const ch of str) {
    const glyph = GLYPHS[ch] || GLYPHS[" "];
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        if (glyph[row][col] === "1") {
          fill(cx + col * scale, y0 + row * scale, scale, scale, 11, 13, 15);
        }
      }
    }
    cx += 6 * scale;
  }
}

// Thin frame (black, #0B0D0F), light ash interior.
fill(28, 28, W - 56, 2, 11, 13, 15);
fill(28, H - 30, W - 56, 2, 11, 13, 15);
fill(28, 28, 2, H - 56, 11, 13, 15);
fill(W - 30, 28, 2, H - 56, 11, 13, 15);

// Wordmark, centred.
drawText("AI GIMMS", 16, 221, 10);
fill(76, 308, 360, 3, 11, 13, 15);
fill(176, 322, 160, 2, 11, 13, 15);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const tag = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([length, tag, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const rows = [];
for (let y = 0; y < H; y += 1) {
  const row = Buffer.alloc(1 + W * 4);
  row[0] = 0; // filter: none
  buf.copy(row, 1, y * W * 4, (y + 1) * W * 4);
  rows.push(row);
}

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

fs.mkdirSync("public", { recursive: true });
fs.writeFileSync("public/logo-512.png", png);
console.log(`wrote public/logo-512.png (${png.length} bytes)`);
