// @ts-check
/** Low-level pixel painting into Uint32 buffers, then to canvases. Used for all procedural art. */

const colCache = new Map();
/** Parse '#rgb', '#rrggbb', 'rgb(r,g,b)', 'rgba(r,g,b,a)' → packed ABGR uint32 (little-endian RGBA bytes). */
export function pack(c, alpha = 1) {
  if (typeof c === 'number') return c;
  const key = c + '|' + alpha;
  let v = colCache.get(key);
  if (v !== undefined) return v;
  let r = 0, g = 0, b = 0, a = 255;
  if (c[0] === '#') {
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16);
  } else {
    const m = c.match(/[\d.]+/g) || [];
    r = +m[0]; g = +m[1]; b = +m[2]; if (m[3] !== undefined) a = Math.round(+m[3] * 255);
  }
  a = Math.round(a * alpha);
  v = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  colCache.set(key, v);
  return v;
}
export function unpack(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
export function packRgba(r, g, b, a = 255) {
  return (((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
}
/** Multiply RGB by f (keeps alpha). */
export function shade(v, f) {
  const [r, g, b, a] = unpack(v);
  const c = (x) => Math.max(0, Math.min(255, Math.round(x * f)));
  return packRgba(c(r), c(g), c(b), a);
}
/** Mix two packed colours. */
export function mix(v1, v2, t) {
  const A = unpack(v1), B = unpack(v2);
  return packRgba(
    Math.round(A[0] + (B[0] - A[0]) * t), Math.round(A[1] + (B[1] - A[1]) * t),
    Math.round(A[2] + (B[2] - A[2]) * t), Math.round(A[3] + (B[3] - A[3]) * t));
}

export const hasDOM = typeof document !== 'undefined';

/** @returns {HTMLCanvasElement} */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  const ctx = c.getContext('2d');
  if (ctx) ctx.imageSmoothingEnabled = false;
  return c;
}

// 4x4 Bayer matrix, normalised 0..1
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export function bayer(x, y) { return BAYER4[(y & 3) * 4 + (x & 3)]; }

export class Pix {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.data = new Uint32Array(w * h);
  }
  static from(pix) { const p = new Pix(pix.w, pix.h); p.data.set(pix.data); return p; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { x |= 0; y |= 0; return this.inb(x, y) ? this.data[y * this.w + x] : 0; }
  alphaAt(x, y) { return this.get(x, y) >>> 24; }
  set(x, y, c) {
    x |= 0; y |= 0;
    if (!this.inb(x, y)) return;
    const v = pack(c);
    if (v >>> 24 === 255 || v >>> 24 === 0) { this.data[y * this.w + x] = v; return; }
    // alpha blend over existing
    const a = (v >>> 24) / 255;
    const d = this.data[y * this.w + x];
    if (d >>> 24 === 0) { this.data[y * this.w + x] = v; return; }
    const [r1, g1, b1] = unpack(d); const [r2, g2, b2] = unpack(v);
    this.data[y * this.w + x] = packRgba(r1 + (r2 - r1) * a, g1 + (g2 - g1) * a, b1 + (b2 - b1) * a, Math.max(d >>> 24, v >>> 24));
  }
  clear(x, y) { if (this.inb(x | 0, y | 0)) this.data[(y | 0) * this.w + (x | 0)] = 0; }
  rect(x, y, w, h, c) {
    const v = pack(c);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, v);
  }
  fill(c) { this.data.fill(pack(c)); }
  hline(x0, x1, y, c) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c); }
  vline(x, y0, y1, c) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c); }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  ellipse(cx, cy, rx, ry, c) {
    const v = pack(c);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, v);
      }
    }
  }
  circle(cx, cy, r, c) { this.ellipse(cx, cy, r, r, c); }
  /** Shaded blob: lit from top-left. cols = [dark, mid, light, highlight?] */
  blob(cx, cy, rx, ry, cols, rnd) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        // light direction (-0.6,-0.7)
        let l = -(dx * 0.6 + dy * 0.75) * 0.9 + (1 - d) * 0.35;
        if (rnd) l += (rnd() - 0.5) * 0.35;
        let idx = l > 0.55 && cols[3] ? 3 : l > 0.15 ? 2 : l > -0.35 ? 1 : 0;
        this.set(x, y, cols[idx]);
      }
    }
  }
  /** Outline all opaque pixels with colour c (4-neighbour, outside only). */
  outline(c, diag = false) {
    const v = pack(c);
    const src = Uint32Array.from(this.data);
    const W = this.w, H = this.h;
    const op = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (src[y * W + x] >>> 24) > 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (op(x, y)) continue;
      if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1) ||
        (diag && (op(x - 1, y - 1) || op(x + 1, y - 1) || op(x - 1, y + 1) || op(x + 1, y + 1)))) this.data[y * W + x] = v;
    }
  }
  /** Replace colours via map packed→packed */
  recolor(map) {
    for (let i = 0; i < this.data.length; i++) { const r = map.get(this.data[i]); if (r !== undefined) this.data[i] = r; }
  }
  blit(src, dx, dy, mirror = false) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const v = src.data[y * src.w + (mirror ? src.w - 1 - x : x)];
      if (v >>> 24) this.set(dx + x, dy + y, v);
    }
  }
  mirrored() {
    const p = new Pix(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) p.data[y * this.w + x] = this.data[y * this.w + this.w - 1 - x];
    return p;
  }
  /** Draw from a palette-indexed grid. */
  grid(rows, pal, dx = 0, dy = 0, mirror = false) {
    for (let y = 0; y < rows.length; y++) {
      const r = rows[y];
      for (let x = 0; x < r.length; x++) {
        const ch = r[mirror ? r.length - 1 - x : x];
        if (ch === '.' || ch === ' ') continue;
        const col = pal[ch];
        if (col) this.set(dx + x, dy + y, col);
      }
    }
  }
  toCanvas() {
    const c = makeCanvas(this.w, this.h);
    const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    const img = ctx.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.data);
    ctx.putImageData(img, 0, 0);
    return c;
  }
}
