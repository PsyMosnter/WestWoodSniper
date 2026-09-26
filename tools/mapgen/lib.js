// @ts-check
/**
 * Map generator helpers (SPEC §19.3 authoring tip). Paint rectangles, ellipses, noisy blobs,
 * polylines for roads and rivers — all from a seeded RNG — then emit the three layer arrays.
 */
import { Rng, fbm } from '../../src/core/rng.js';

export class MapGen {
  constructor(w, h, seed = 1, base = 'g') {
    this.w = w; this.h = h;
    this.rng = new Rng(seed);
    this.seed = seed;
    this.t = Array.from({ length: h }, () => Array(w).fill(base));
    this.e = Array.from({ length: h }, () => Array(w).fill(0));
    this.o = Array.from({ length: h }, () => Array(w).fill('.'));
    this.structures = []; this.units = []; this.paths = {}; this.areas = {}; this.pickups = []; this.props = [];
    this.friendlies = []; this.demolishable = [];
  }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, p) {
    x = Math.round(x); y = Math.round(y);
    if (!this.inb(x, y)) return;
    if (p.t !== undefined) this.t[y][x] = p.t;
    if (p.e !== undefined) this.e[y][x] = p.e;
    if (p.o !== undefined) this.o[y][x] = p.o;
  }
  get(x, y) { return this.inb(x, y) ? { t: this.t[y][x], e: this.e[y][x], o: this.o[y][x] } : null; }
  rect(x, y, w, h, p) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, p); }
  ellipse(cx, cy, rx, ry, p, rough = 0, seed = 7) {
    for (let y = Math.floor(cy - ry - 3); y <= cy + ry + 3; y++) for (let x = Math.floor(cx - rx - 3); x <= cx + rx + 3; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      const n = rough ? (fbm(x * 0.15, y * 0.15, this.seed + seed) - 0.5) * rough : 0;
      if (dx * dx + dy * dy <= 1 + n) this.set(x, y, p);
    }
  }
  /** Fill from a coarse schematic with domain-warped edges. legend: ch → (x,y,rng)=>props|null */
  schematic(rows, cell, legend, warp = 2.5) {
    const sh = rows.length, sw = rows[0].length;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const wx = x + (fbm(x * 0.09, y * 0.09, this.seed + 1) - 0.5) * 2 * warp;
      const wy = y + (fbm(x * 0.09, y * 0.09, this.seed + 2) - 0.5) * 2 * warp;
      const cx = Math.max(0, Math.min(sw - 1, Math.floor(wx / cell)));
      const cy = Math.max(0, Math.min(sh - 1, Math.floor(wy / cell)));
      const ch = rows[cy][cx];
      const f = legend[ch];
      if (!f) continue;
      const p = typeof f === 'function' ? f(x, y, this.rng) : f;
      if (p) this.set(x, y, p);
    }
  }
  /** Elevation-only schematic fill (digits), warped. */
  elevation(rows, cell, warp = 2) {
    const sh = rows.length, sw = rows[0].length;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const wx = x + (fbm(x * 0.12, y * 0.12, this.seed + 3) - 0.5) * 2 * warp;
      const wy = y + (fbm(x * 0.12, y * 0.12, this.seed + 4) - 0.5) * 2 * warp;
      const cx = Math.max(0, Math.min(sw - 1, Math.floor(wx / cell)));
      const cy = Math.max(0, Math.min(sh - 1, Math.floor(wy / cell)));
      const ch = rows[cy][cx];
      const d = ch >= '0' && ch <= '3' ? +ch : 0;
      this.e[y][x] = d;
    }
  }
  /** Thick polyline with optional meander. */
  polyline(pts, width, p, meander = 0, seed = 11) {
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.ceil(len * 2);
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        let x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u;
        if (meander) {
          const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
          const m = (fbm(x * 0.05, y * 0.05, this.seed + seed) - 0.5) * 2 * meander;
          x += nx * m; y += ny * m;
        }
        const r = width / 2;
        for (let j = Math.floor(y - r); j <= Math.ceil(y + r); j++) for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) {
          if ((i + 0.5 - x) ** 2 + (j + 0.5 - y) ** 2 <= r * r + 0.25) { const v = typeof p === 'function' ? p(i, j) : p; if (v) this.set(i, j, v); }
        }
      }
    }
  }
  /** Roughen water edges so shores aren't straight tile-aligned lines. */
  roughenWater(seed = 61, amount = 0.58) {
    const W = this.w, H = this.h;
    const snap = this.t.map((r) => r.slice());
    const nb = (x, y, ch) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => snap[y + dy]?.[x + dx] === ch);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = snap[y][x], n = fbm(x * 0.35, y * 0.35, this.seed + seed);
      if (this.o[y][x] === 'h' || this.o[y][x] === 'R') continue;
      if (t === 'w' && nb(x, y, 'W') && n > amount) this.t[y][x] = 'W';
      else if (t === 'W' && nb(x, y, 'w') && n < 1 - amount - 0.1) this.t[y][x] = 'w';
      else if ((t === 'g' || t === 't' || t === 'd') && nb(x, y, 'w') && n > amount + 0.04 && this.e[y][x] === 0 && this.o[y][x] === '.') this.t[y][x] = 'w';
    }
  }
  /** Replace overlay/terrain within region by predicate */
  each(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) fn(x, y, this.get(x, y)); }
  /** Scatter props in a rect with a density, only where pred passes. */
  scatter(x, y, w, h, density, p, pred) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (!this.inb(i, j)) continue;
      if (pred && !pred(i, j, this.get(i, j))) continue;
      if (this.rng.chance(density)) this.set(i, j, p);
    }
  }
  /**
   * Ramp: tiles at `level` placed at (x,y)… running `width` tiles perpendicular to dir.
   * dir: 'N'|'E'|'S'|'W' = direction of the HIGHER ground. The tile beyond is forced to level+1,
   * the approach tile before it forced to `level`.
   */
  ramp(x, y, dir, width, level) {
    const d = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }[dir];
    const perp = [d[1] === 0 ? 0 : 1, d[0] === 0 ? 0 : 1];
    for (let k = 0; k < width; k++) {
      const rx = x + perp[0] * k, ry = y + perp[1] * k;
      this.set(rx, ry, { e: level, o: 'R' });
      if (this.t[ry]?.[rx] === 'W' || this.t[ry]?.[rx] === 'l') this.set(rx, ry, { t: 'd' });
      this.set(rx + d[0], ry + d[1], { e: level + 1 });
      if (this.o[ry + d[1]]?.[rx + d[0]] !== 'R') this.set(rx + d[0], ry + d[1], { o: '.' });
      this.set(rx - d[0], ry - d[1], { e: level });
      if (this.o[ry - d[1]]?.[rx - d[0]] !== 'R') this.set(rx - d[0], ry - d[1], { o: '.' });
      // second tile of approach & landing kept clear too
      this.set(rx + 2 * d[0], ry + 2 * d[1], { e: level + 1 });
      if (this.o[ry + 2 * d[1]]?.[rx + 2 * d[0]] !== 'R') this.set(rx + 2 * d[0], ry + 2 * d[1], { o: '.' });
    }
  }
  /**
   * Walk a road polyline and put a ramp (road-width) wherever the elevation steps by one level,
   * oriented along the local travel direction. Call after elevations are final.
   */
  autoRamps(pts, width = 2) {
    const dirOf = (dx, dy) => Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N');
    const D = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
    const placed = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const dir = dirOf(x1 - x0, y1 - y0);
      const [dx, dy] = D[dir];
      let px = Math.floor(x0), py = Math.floor(y0);
      for (let s = 1; s <= Math.ceil(len * 3); s++) {
        const u = s / Math.ceil(len * 3);
        const tx = Math.floor(x0 + (x1 - x0) * u), ty = Math.floor(y0 + (y1 - y0) * u);
        if (tx === px && ty === py) continue;
        const e0 = this.e[py]?.[px], e1 = this.e[ty]?.[tx];
        if (e0 !== undefined && e1 !== undefined && e0 !== e1 && !placed.some((p) => Math.abs(p.x - tx) + Math.abs(p.y - ty) < 3)) {
          const perp = dx === 0 ? [1, 0] : [0, 1];
          // first lane: offset so the ramp covers the road width centred on the line
          const cx = x0 + (x1 - x0) * u, cy = y0 + (y1 - y0) * u;
          const bx = Math.floor(cx - perp[0] * (width - 1) / 2), by = Math.floor(cy - perp[1] * (width - 1) / 2);
          if (e1 > e0) {
            // going up: ramp on the lower side, just before the step
            const rx = dx ? tx - dx : bx, ry = dy ? ty - dy : by;
            this.ramp(dx ? rx : bx, dy ? ry : by, dir, width, e0);
            placed.push({ x: tx, y: ty });
          } else {
            // going down: ramp on the lower tile, pointing back up
            const back = { N: 'S', S: 'N', E: 'W', W: 'E' }[dir];
            this.ramp(dx ? tx : bx, dy ? ty : by, back, width, e1);
            placed.push({ x: tx, y: ty });
          }
          for (let w = 0; w < width; w++) {
            const rx = (dx ? (e1 > e0 ? tx - dx : tx) : bx + perp[0] * w), ry = (dy ? (e1 > e0 ? ty - dy : ty) : by + perp[1] * w);
            if (this.inb(rx, ry)) this.t[ry][rx] = 'r';
          }
        }
        px = tx; py = ty;
      }
    }
    return placed;
  }
  /** Clear trees/boulders in a rect (keep terrain) */
  clear(x, y, w, h, t) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { if (!this.inb(i, j)) continue; if (this.o[j][i] !== 'R') this.o[j][i] = '.'; if (t) this.t[j][i] = t; } }
  /** Flatten elevation in a rect */
  level(x, y, w, h, e) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.inb(i, j)) this.e[j][i] = e; }

  structure(s) { this.structures.push(s); this.clear(s.x - 1, s.y - 1, (s.w || 2) + 2, (s.h || 2) + 2); return s; }
  unit(u) { this.units.push(u); return u; }
  path(id, pts) { this.paths[id] = pts; return id; }
  area(id, x, y, w, h) { this.areas[id] = { x, y, w, h }; return id; }

  layers() {
    return {
      terrain: this.t.map((r) => r.join('')),
      elevation: this.e.map((r) => r.join('')),
      overlay: this.o.map((r) => r.join('')),
    };
  }
}

/** Serialise a mission data object to an ES module string (stable, diff-friendly). */
export function toModule(obj, header = '') {
  const lines = [];
  lines.push('// @ts-nocheck');
  lines.push('// GENERATED by tools/mapgen — do not edit by hand. Regenerate with: node tools/mapgen/build.js');
  if (header) lines.push('// ' + header);
  lines.push('export default {');
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'string') {
      lines.push(`  ${k}: [`);
      for (const s of v) lines.push(`    ${JSON.stringify(s)},`);
      lines.push('  ],');
    } else {
      lines.push(`  ${k}: ${JSON.stringify(v)},`);
    }
  }
  lines.push('};');
  return lines.join('\n') + '\n';
}
