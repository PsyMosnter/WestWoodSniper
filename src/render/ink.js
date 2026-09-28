// @ts-check
/**
 * Ink — a small vector illustrator for the cutscenes, painting the way 90s adventure-game artists did: flat cel
 * colours, hard-edged shadow and highlight shapes, black ink outlines and tapered brush lines, dithered skies and
 * light. Shapes are smooth closed curves through control points (Catmull-Rom; a point [x, y, 1] stays a sharp
 * corner) and are rasterised WITHOUT anti-aliasing into a Pix, so every frame stays crisp pixel art at any zoom
 * or camera move. Works headless (no DOM) — tests and the art lab render the same frames.
 *
 * Fill styles: '#rrggbb' · { dither: [a, b], level } (Bayer-dithered mix) · { grad: [[t, colour]…], from, to }
 * (dithered linear gradient) · { radial: [[t, colour]…], c: [x, y], r } (dithered radial gradient).
 */
import { Pix, pack } from './pixel.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];

/** Coverage over a bounding box, in screen pixels. */
export class Mask {
  constructor(x0, y0, w, h) {
    this.x0 = x0; this.y0 = y0; this.w = Math.max(0, w); this.h = Math.max(0, h);
    this.d = new Uint8Array(this.w * this.h);
  }
  has(x, y) { x -= this.x0; y -= this.y0; return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[y * this.w + x] === 1; }
  get empty() { return !this.d.some((v) => v); }
}

/** Smooth a list of points (Catmull-Rom through them; points flagged [x, y, 1] stay corners). */
export function smoothPath(P, closed) {
  const n = P.length;
  if (n < 3) return P.slice();
  const out = [];
  const get = (i) => P[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p1 = get(i), p2 = get(i + 1);
    let p0 = get(i - 1), p3 = get(i + 2);
    if (p1[2] || (!closed && i === 0)) p0 = p1;
    if (p2[2] || (!closed && i === segs - 1)) p3 = p2;
    const t1x = (p2[0] - p0[0]) * 0.5, t1y = (p2[1] - p0[1]) * 0.5, t2x = (p3[0] - p1[0]) * 0.5, t2y = (p3[1] - p1[1]) * 0.5;
    const steps = Math.max(1, Math.min(64, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 1.5)));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.push([h00 * p1[0] + h10 * t1x + h01 * p2[0] + h11 * t2x, h00 * p1[1] + h10 * t1y + h01 * p2[1] + h11 * t2y]);
    }
  }
  if (!closed) out.push([P[n - 1][0], P[n - 1][1]]);
  return out;
}

/** Fill a polygon (non-zero winding, pixel centres) into a mask clipped to W×H. */
export function fillPoly(poly, W, H) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of poly) { if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; }
  const x0 = Math.max(0, Math.floor(minx)), y0 = Math.max(0, Math.floor(miny)), x1 = Math.min(W - 1, Math.ceil(maxx)), y1 = Math.min(H - 1, Math.ceil(maxy));
  const m = new Mask(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  if (!m.w || !m.h) return m;
  const ex = [];
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    if (a[1] === b[1]) continue;
    const down = a[1] < b[1], top = down ? a : b, bot = down ? b : a;
    ex.push(top[1], bot[1], top[0], (bot[0] - top[0]) / (bot[1] - top[1]), down ? 1 : -1);
  }
  const xs = [], ds = [];
  for (let y = y0; y <= y1; y++) {
    const sy = y + 0.5;
    xs.length = 0; ds.length = 0;
    for (let e = 0; e < ex.length; e += 5) {
      if (sy < ex[e] || sy >= ex[e + 1]) continue;
      const x = ex[e + 2] + (sy - ex[e]) * ex[e + 3];
      let j = xs.length;
      xs.push(x); ds.push(ex[e + 4]);
      while (j > 0 && xs[j - 1] > x) { xs[j] = xs[j - 1]; ds[j] = ds[j - 1]; xs[j - 1] = x; ds[j - 1] = ex[e + 4]; j--; }
    }
    let wind = 0, start = 0;
    const row = (y - y0) * m.w;
    for (let j = 0; j < xs.length; j++) {
      const before = wind;
      wind += ds[j];
      if (before === 0 && wind !== 0) start = xs[j];
      else if (before !== 0 && wind === 0) {
        const a = Math.max(x0, Math.ceil(start - 0.5)), b = Math.min(x1, Math.ceil(xs[j] - 0.5) - 1);
        for (let x = a; x <= b; x++) m.d[row + x - x0] = 1;
      }
    }
  }
  return m;
}

/** Grow a mask by r pixels (alternating plus / square steps, so the ring comes out round-ish). */
export function dilate(m, r, W, H) {
  let cur = m;
  for (let k = 0; k < r; k++) {
    const x0 = Math.max(0, cur.x0 - 1), y0 = Math.max(0, cur.y0 - 1), x1 = Math.min(W - 1, cur.x0 + cur.w), y1 = Math.min(H - 1, cur.y0 + cur.h);
    const o = new Mask(x0, y0, x1 - x0 + 1, y1 - y0 + 1), sq = k % 2 === 1;
    const cw = cur.w, cd = cur.d;
    const at = (x, y) => { x -= cur.x0; y -= cur.y0; return x >= 0 && y >= 0 && x < cw && y < cur.h && cd[y * cw + x] === 1; };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (at(x, y) || at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1) || (sq && (at(x - 1, y - 1) || at(x + 1, y - 1) || at(x - 1, y + 1) || at(x + 1, y + 1)))) o.d[(y - y0) * o.w + x - x0] = 1;
    }
    cur = o;
  }
  return cur;
}

/** Pixels in a or b. */
export function union(a, b) {
  if (!a.w) return b; if (!b.w) return a;
  const x0 = Math.min(a.x0, b.x0), y0 = Math.min(a.y0, b.y0), x1 = Math.max(a.x0 + a.w, b.x0 + b.w), y1 = Math.max(a.y0 + a.h, b.y0 + b.h);
  const o = new Mask(x0, y0, x1 - x0, y1 - y0);
  for (const m of [a, b]) for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.d[y * m.w + x]) o.d[(y + m.y0 - y0) * o.w + x + m.x0 - x0] = 1;
  return o;
}
/** The mask moved by (dx, dy) pixels. */
export function shift(m, dx, dy) { const o = new Mask(m.x0 + dx, m.y0 + dy, m.w, m.h); o.d.set(m.d); return o; }
/** Pixels of a that are not in b. */
export function subtract(a, b) {
  const o = new Mask(a.x0, a.y0, a.w, a.h);
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const i = y * a.w + x; if (a.d[i] && !b.has(x + a.x0, y + a.y0)) o.d[i] = 1; }
  return o;
}

/** A packed-colour sampler for a fill style at a pixel. */
function sampler(style) {
  if (typeof style === 'string' || typeof style === 'number') { const v = pack(style); return () => v; }
  if (style.dither) { const a = pack(style.dither[0]), b = pack(style.dither[1]), l = style.level ?? 0.5; return (x, y) => (bayer(x, y) < l ? b : a); }
  const stops = (style.grad || style.radial).map(([t, c]) => [t, pack(c)]);
  const pick = (t, x, y) => {
    if (t <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) { const u = (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0] || 1); return bayer(x, y) < u ? stops[i][1] : stops[i - 1][1]; }
    }
    return stops[stops.length - 1][1];
  };
  if (style.radial) { const [cx, cy] = style.c, r = style.r; return (x, y) => pick(Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * (style.sy || 1)) / r, x, y); }
  const [fx, fy] = style.from, [tx, ty] = style.to, dx = tx - fx, dy = ty - fy, l2 = dx * dx + dy * dy || 1;
  return (x, y) => pick(((x + 0.5 - fx) * dx + (y + 0.5 - fy) * dy) / l2, x, y);
}

export class Ink {
  /** @param {number} w @param {number} h */
  constructor(w, h) {
    this.w = w; this.h = h;
    this.pix = new Pix(w, h);
    this.m = [1, 0, 0, 1, 0, 0];
    /** @type {Mask[]} */ this.clips = [];
    this.stack = [];
  }
  // ---------------------------------------------------------------- transform
  save() { this.stack.push([this.m.slice(), this.clips.slice()]); return this; }
  restore() { const s = this.stack.pop(); if (s) { this.m = s[0]; this.clips = s[1]; } return this; }
  translate(x, y) { const m = this.m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; return this; }
  scale(sx, sy = sx) { const m = this.m; m[0] *= sx; m[1] *= sx; m[2] *= sy; m[3] *= sy; return this; }
  rotate(a) {
    const c = Math.cos(a), s = Math.sin(a), m = this.m, [a0, b0, c0, d0] = m;
    m[0] = a0 * c + c0 * s; m[1] = b0 * c + d0 * s; m[2] = -a0 * s + c0 * c; m[3] = -b0 * s + d0 * c;
    return this;
  }
  /** local → screen (keeps a corner flag) */
  T(p) { const m = this.m; return p[2] ? [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5], 1] : [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; }
  /** average scale of the current transform (for line widths that should follow a drawing's size) */
  get k() { const m = this.m; return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])); }
  path(pts, smooth = true, closed = true) { const P = pts.map((p) => this.T(p)); return smooth ? smoothPath(P, closed) : P; }
  /** clip everything drawn until restore() to this mask (intersects with any current clip) */
  clip(m) { this.clips.push(m); return this; }

  // ---------------------------------------------------------------- painting
  /** Paint a mask with a fill style (honouring clips). @param {Mask} m */
  paint(m, style) {
    if (!m.w) return;
    const f = sampler(style), W = this.w, D = this.pix.data, clips = this.clips;
    for (let y = 0; y < m.h; y++) {
      const Y = y + m.y0, row = y * m.w;
      for (let x = 0; x < m.w; x++) {
        if (!m.d[row + x]) continue;
        const X = x + m.x0;
        if (X < 0 || Y < 0 || X >= W || Y >= this.h) continue;
        let ok = true;
        for (let c = 0; c < clips.length; c++) if (!clips[c].has(X, Y)) { ok = false; break; }
        if (!ok) continue;
        const v = f(X, Y);
        if (v >>> 24) D[Y * W + X] = v;
      }
    }
  }
  /** Mix a colour into what is already there (light, haze, shadow); dithered to keep it pixel art. */
  tint(m, color, alpha, dither = true) {
    if (!m.w) return;
    const c = pack(color), cr = c & 255, cg = (c >>> 8) & 255, cb = (c >>> 16) & 255, W = this.w, D = this.pix.data, clips = this.clips;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (!m.d[y * m.w + x]) continue;
      const X = x + m.x0, Y = y + m.y0;
      if (X < 0 || Y < 0 || X >= W || Y >= this.h) continue;
      let ok = true;
      for (let q = 0; q < clips.length; q++) if (!clips[q].has(X, Y)) { ok = false; break; }
      if (!ok) continue;
      const a = typeof alpha === 'function' ? alpha(X, Y) : alpha;
      if (a <= 0) continue;
      // quantised to quarter steps, dithered between them (reads as 90s palette light, not smooth blending)
      const q = Math.min(1, a) * 4, k = dither ? (bayer(X, Y) < q - Math.floor(q) ? Math.ceil(q) : Math.floor(q)) / 4 : a;
      if (k <= 0) continue;
      const i = Y * W + X, v = D[i];
      const r = (v & 255) + (cr - (v & 255)) * k, g = ((v >>> 8) & 255) + (cg - ((v >>> 8) & 255)) * k, b = ((v >>> 16) & 255) + (cb - ((v >>> 16) & 255)) * k;
      D[i] = ((255 << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
    }
  }
  /**
   * A closed shape. o: fill (style), line (ink colour), lw (outline px), smooth (default true), paint: false
   * (just return the mask). @returns {Mask}
   */
  shape(pts, o = {}) {
    const m = fillPoly(this.path(pts, o.smooth !== false), this.w, this.h);
    if (o.paint === false) return m;
    if (o.line && o.lw) { const d = dilate(m, o.lw, this.w, this.h); this.paint(o.fill ? d : subtract(d, m), o.line); }
    if (o.fill) this.paint(m, o.fill);
    if (o.tint) this.tint(m, o.tint[0], o.tint[1]);
    return m;
  }
  /** An ellipse (local units; rotation in radians). */
  ellipse(cx, cy, rx, ry, rot = 0, o = {}) {
    const pts = [], n = Math.max(12, Math.min(72, Math.round((rx + ry) * this.k * 0.8)));
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry; pts.push([cx + x * c - y * s, cy + x * s + y * c]); }
    return this.shape(pts, { ...o, smooth: false });
  }
  rect(x, y, w, h, o = {}) { return this.shape([[x, y, 1], [x + w, y, 1], [x + w, y + h, 1], [x, y + h, 1]], { ...o, smooth: false }); }
  /**
   * A tapered brush line along a smooth path. w: width in px — a number, [start, end], or [start, middle, end].
   * @returns {Mask}
   */
  stroke(pts, w, color, o = {}) {
    const P = this.path(pts, o.smooth !== false, false);
    const ws = typeof w === 'number' ? [w, w] : w;
    const width = (u) => (ws.length === 3 ? (u < 0.5 ? ws[0] + (ws[1] - ws[0]) * u * 2 : ws[1] + (ws[2] - ws[1]) * (u - 0.5) * 2) : ws[0] + (ws[1] - ws[0]) * u);
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity, total = 0;
    const acc = [0];
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
      if (i) { total += Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]); acc.push(total); }
    }
    const R = Math.max(...ws) / 2 + 1;
    const x0 = Math.max(0, Math.floor(minx - R)), y0 = Math.max(0, Math.floor(miny - R)), x1 = Math.min(this.w - 1, Math.ceil(maxx + R)), y1 = Math.min(this.h - 1, Math.ceil(maxy + R));
    const m = new Mask(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    if (!m.w || !m.h) return m;
    const stamp = (cx, cy, r) => {
      if (r < 0.6) { const X = Math.floor(cx), Y = Math.floor(cy); if (X >= x0 && Y >= y0 && X <= x1 && Y <= y1) m.d[(Y - y0) * m.w + X - x0] = 1; return; }
      for (let Y = Math.max(y0, Math.floor(cy - r)); Y <= Math.min(y1, Math.ceil(cy + r)); Y++) for (let X = Math.max(x0, Math.floor(cx - r)); X <= Math.min(x1, Math.ceil(cx + r)); X++) {
        const dx = X + 0.5 - cx, dy = Y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) m.d[(Y - y0) * m.w + X - x0] = 1;
      }
    };
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], L = acc[i] - acc[i - 1], n = Math.max(1, Math.ceil(L / 0.35));
      for (let s = 0; s <= n; s++) { const t = s / n, u = total ? (acc[i - 1] + L * t) / total : 0; stamp(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, width(u) / 2); }
    }
    if (o.paint !== false) this.paint(m, color);
    return m;
  }
  /** Scatter single pixels over a mask (texture: stubble, grain, snow). density 0..1 */
  speckle(m, color, density, seed = 1) {
    let s = seed >>> 0 || 1;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const o = new Mask(m.x0, m.y0, m.w, m.h);
    for (let i = 0; i < m.d.length; i++) if (m.d[i] && rnd() < density) o.d[i] = 1;
    this.paint(o, color);
  }
  /** Fill the whole frame. */
  fill(style) { const m = new Mask(0, 0, this.w, this.h); m.d.fill(1); this.paint(m, style); }
  /** Copy another picture on top (transparent pixels skipped). @param {Pix} p */
  blit(p, dx = 0, dy = 0) {
    const D = this.pix.data, S = p.data, W = this.w;
    for (let y = 0; y < p.h; y++) {
      const Y = y + dy;
      if (Y < 0 || Y >= this.h) continue;
      for (let x = 0; x < p.w; x++) { const X = x + dx; if (X < 0 || X >= W) continue; const v = S[y * p.w + x]; if (v >>> 24) D[Y * W + X] = v; }
    }
  }
}
