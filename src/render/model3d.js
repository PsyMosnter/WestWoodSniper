// @ts-check
import { Pix, pack, unpack, packRgba } from './pixel.js';

/**
 * A tiny software "pre-renderer" for the New art style: units are built from a handful of 3D primitives
 * (capsules, ellipsoids, boxes, cylinders), posed per animation frame and ray-cast orthographically from
 * the game's 3/4 camera into small pixel-art sprites — shaded with fixed colour ramps, 4×4 supersampled
 * (thin parts such as rifle barrels and glowing eyes are weighted so they survive), outlined, and with
 * darker lines where a near part overlaps a far one. Every pixel also records the hit zone (head, torso,
 * weak spot, …) of the part it shows, so the scope can use the very same pixels as its hit map.
 *
 * World axes: x east, y south (towards the camera), z up. 1 unit = 1 screen pixel before `scale`.
 */

export const ELEV = 34 * Math.PI / 180;           // camera elevation above the horizon
const CE = Math.cos(ELEV), SEL = Math.sin(ELEV);
const RY = -CE, RZ = -SEL;                        // ray direction (0, RY, RZ): into the scene
const VY = SEL, VZ = -CE;                         // screen-down axis in world space (0, VY, VZ)
const FAR = 80;
const LIGHT = norm([-0.55, -0.05, 0.84]);         // towards the light: from the top-left of the screen
const VIEW = [0, CE, SEL];                        // towards the camera (soft fill light)
const AMB = 0.26, KEY = 0.56, FILL = 0.24;

const SS = 4;                   // supersampling per axis
const EDGE_DEPTH = 1.6;         // same part folding over itself
const PART_DEPTH = 0.02;        // another part in front
const SOFT_DEPTH = 2.2;         // how far behind a soft part (arm) a shot still counts for what it hits

/** @param {number[]} v */
export function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

/** World-space point → screen offset (x, y) from the ground anchor. */
export function project(p) { return [p[0], p[1] * SEL - p[2] * CE]; }

/**
 * @typedef {{ramp: string[], weight?: number, emissive?: boolean, flat?: number}} Material
 *   ramp: dark → light colours; weight: vote weight when downsampling (thin/important parts > 1);
 *   emissive: ignores light (glows); flat: fixed ramp index offset
 */

/** Primitive list for one frame, all in world space. */
export class Model {
  constructor() {
    /** @type {any[]} */
    this.prims = [];
    /** current body part id: parts overlapping each other get a dark separating line */
    this.part = 0;
  }
  /** start a new body part (arm, leg, gun, …) */
  newPart() { this.part++; return this; }
  /** capsule a→b with radius r */
  capsule(a, b, r, mat, zone = 0) { this.prims.push({ k: 0, a, b, r, mat, zone, part: this.part }); return this; }
  /** ellipsoid at c with orthonormal axes ax[3] and radii rr[3] */
  ellipsoid(c, ax, rr, mat, zone = 0) { this.prims.push({ k: 1, c, ax, rr, mat, zone, part: this.part }); return this; }
  /** oriented box at c with axes ax[3] and half extents hh[3] */
  box(c, ax, hh, mat, zone = 0) { this.prims.push({ k: 2, c, ax, hh, mat, zone, part: this.part }); return this; }
  /** capped cylinder a→b with radius r */
  cylinder(a, b, r, mat, zone = 0) { this.prims.push({ k: 3, a, b, r, mat, zone, part: this.part }); return this; }
}

// ---- compiled primitives: everything that only depends on the (fixed) ray direction is precomputed ----
function compile(p) {
  const q = { k: p.k, mat: p.mat, zone: p.zone, part: p.part, bb: primBounds(p), mi: 0 };
  if (p.k === 0 || p.k === 3) {
    const [ax, ay, az] = p.a, bx = p.b[0] - ax, by = p.b[1] - ay, bz = p.b[2] - az;
    const baba = bx * bx + by * by + bz * bz || 1e-9, bard = by * RY + bz * RZ;
    Object.assign(q, { ax, ay, az, bx, by, bz, ex: p.b[0], ey: p.b[1], ez: p.b[2], baba, bard, r: p.r, rr: p.r * p.r, A: baba - bard * bard });
  } else if (p.k === 1) {
    const u = p.ax.map((a, i) => [a[0] / p.rr[i], a[1] / p.rr[i], a[2] / p.rr[i]]);
    const d = u.map((a) => a[1] * RY + a[2] * RZ);
    Object.assign(q, { cx: p.c[0], cy: p.c[1], cz: p.c[2], u, d, A: d[0] * d[0] + d[1] * d[1] + d[2] * d[2], axes: p.ax, rr: p.rr });
  } else {
    const d = p.ax.map((a) => a[1] * RY + a[2] * RZ);
    Object.assign(q, { cx: p.c[0], cy: p.c[1], cz: p.c[2], axes: p.ax, hh: p.hh, d });
  }
  return q;
}

/** Nearest positive hit distance along the ray from (ox, oy, oz), or -1. */
function hit(p, ox, oy, oz) {
  switch (p.k) {
    case 0: {   // capsule
      const oax = ox - p.ax, oay = oy - p.ay, oaz = oz - p.az;
      const baoa = p.bx * oax + p.by * oay + p.bz * oaz, rdoa = oay * RY + oaz * RZ, oaoa = oax * oax + oay * oay + oaz * oaz;
      const B = p.baba * rdoa - baoa * p.bard, C = p.baba * oaoa - baoa * baoa - p.rr * p.baba;
      const h = B * B - p.A * C;
      if (h < 0) return -1;
      if (p.A > 1e-9) {
        const t = (-B - Math.sqrt(h)) / p.A, y = baoa + t * p.bard;
        if (y > 0 && y < p.baba) return t;
        // end caps
        const cx = y <= 0 ? oax : ox - p.ex, cy = y <= 0 ? oay : oy - p.ey, cz = y <= 0 ? oaz : oz - p.ez;
        const b = cy * RY + cz * RZ, c = cx * cx + cy * cy + cz * cz - p.rr, hh = b * b - c;
        return hh > 0 ? -b - Math.sqrt(hh) : -1;
      }
      const b = oay * RY + oaz * RZ, c = oaoa - p.rr, hh = b * b - c;   // capsule seen end-on: a sphere
      return hh > 0 ? -b - Math.sqrt(hh) : -1;
    }
    case 1: {   // ellipsoid
      const ocx = ox - p.cx, ocy = oy - p.cy, ocz = oz - p.cz, u = p.u, d = p.d;
      const o0 = ocx * u[0][0] + ocy * u[0][1] + ocz * u[0][2], o1 = ocx * u[1][0] + ocy * u[1][1] + ocz * u[1][2], o2 = ocx * u[2][0] + ocy * u[2][1] + ocz * u[2][2];
      const B = o0 * d[0] + o1 * d[1] + o2 * d[2], C = o0 * o0 + o1 * o1 + o2 * o2 - 1;
      const h = B * B - p.A * C;
      return h < 0 ? -1 : (-B - Math.sqrt(h)) / p.A;
    }
    case 2: {   // oriented box (slabs)
      const ocx = ox - p.cx, ocy = oy - p.cy, ocz = oz - p.cz;
      let tn = -Infinity, tf = Infinity;
      for (let i = 0; i < 3; i++) {
        const a = p.axes[i], o = ocx * a[0] + ocy * a[1] + ocz * a[2], d = p.d[i], hh = p.hh[i];
        if (Math.abs(d) < 1e-9) { if (Math.abs(o) > hh) return -1; continue; }
        let t1 = (-hh - o) / d, t2 = (hh - o) / d;
        if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
        if (t1 > tn) tn = t1;
        if (t2 < tf) tf = t2;
        if (tn > tf) return -1;
      }
      return tf < 0 ? -1 : tn;
    }
    default: {  // capped cylinder
      const ocx = ox - p.ax, ocy = oy - p.ay, ocz = oz - p.az;
      const baoc = p.bx * ocx + p.by * ocy + p.bz * ocz, ocrd = ocy * RY + ocz * RZ;
      const k2 = p.A, k1 = p.baba * ocrd - baoc * p.bard, k0 = p.baba * (ocx * ocx + ocy * ocy + ocz * ocz) - baoc * baoc - p.rr * p.baba;
      let h = k1 * k1 - k2 * k0;
      if (h < 0) return -1;
      h = Math.sqrt(h);
      if (k2 > 1e-9) {
        const t = (-k1 - h) / k2, y = baoc + t * p.bard;
        if (y > 0 && y < p.baba) return t;
        const tc = ((y < 0 ? 0 : p.baba) - baoc) / p.bard;
        return Math.abs(k1 + k2 * tc) < h ? tc : -1;
      }
      // seen end-on: the near cap, if the ray passes inside the radius
      return k0 <= 0 ? ((p.bard > 0 ? 0 : p.baba) - baoc) / p.bard : -1;
    }
  }
}

/** Surface normal of prim p at ray distance t (into out, not normalised). */
function normalAt(p, t, ox, oy, oz, out) {
  const px = ox, py = oy + t * RY, pz = oz + t * RZ;
  if (p.k === 0 || p.k === 3) {
    const ax = px - p.ax, ay = py - p.ay, az = pz - p.az;
    const y = (ax * p.bx + ay * p.by + az * p.bz) / p.baba;
    if (p.k === 3 && (y < 1e-4 || y > 1 - 1e-4)) {
      const s = y < 0.5 ? -1 : 1;
      out[0] = p.bx * s; out[1] = p.by * s; out[2] = p.bz * s;
      return;
    }
    const k = Math.max(0, Math.min(1, y));
    out[0] = ax - p.bx * k; out[1] = ay - p.by * k; out[2] = az - p.bz * k;
    return;
  }
  const cx = px - p.cx, cy = py - p.cy, cz = pz - p.cz, A = p.axes;
  if (p.k === 1) {
    for (let j = 0; j < 3; j++) out[j] = 0;
    for (let i = 0; i < 3; i++) {
      const q = (cx * A[i][0] + cy * A[i][1] + cz * A[i][2]) / (p.rr[i] * p.rr[i]);
      out[0] += A[i][0] * q; out[1] += A[i][1] * q; out[2] += A[i][2] * q;
    }
    return;
  }
  let bi = 0, bv = -1, bs = 1;
  for (let i = 0; i < 3; i++) {
    const o = (cx * A[i][0] + cy * A[i][1] + cz * A[i][2]) / p.hh[i];
    if (Math.abs(o) > bv) { bv = Math.abs(o); bi = i; bs = o < 0 ? -1 : 1; }
  }
  out[0] = A[bi][0] * bs; out[1] = A[bi][1] * bs; out[2] = A[bi][2] * bs;
}

/**
 * Ray-cast a model into a w×h sprite whose ground anchor (world origin) sits at pixel (ax, ay).
 * @param {Model} model
 * @param {{w: number, h: number, ax: number, ay: number, outline: string, scale?: number, soft?: number}} o
 *   scale: pixels per model unit; soft: a zone a shot passes through into whatever lies just behind it
 *   (an arm held across the chest still counts as a chest hit)
 * @returns {{pix: Pix, zone: Uint8Array, depth: Float32Array, top: number}} top: first opaque row
 */
export function rasterize(model, o) {
  const { w, h, ax, ay } = o;
  const sc = o.scale || 1, inv = 1 / sc;
  const soft = o.soft ?? -1;
  const N = SS * SS;
  const prims = model.prims.map(compile);
  /** @type {Material[]} */
  const mats = [];
  const matIdx = new Map();
  for (const p of prims) {
    if (!matIdx.has(p.mat)) { matIdx.set(p.mat, mats.length); mats.push(p.mat); }
    p.mi = matIdx.get(p.mat);
  }
  // which primitives can touch each pixel
  /** @type {any[][]} */
  const lists = new Array(w * h);
  for (const p of prims) {
    const b = p.bb;
    const x0 = Math.max(0, Math.floor(b[0] * sc + ax)), x1 = Math.min(w - 1, Math.floor(b[2] * sc + ax));
    const y0 = Math.max(0, Math.floor(b[1] * sc + ay)), y1 = Math.min(h - 1, Math.floor(b[3] * sc + ay));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) (lists[y * w + x] ||= []).push(p);
  }
  const pix = new Pix(w, h);
  const zone = new Uint8Array(w * h);
  const depth = new Float32Array(w * h).fill(Infinity);
  const matOf = new Int16Array(w * h).fill(-1);
  const partOf = new Int32Array(w * h).fill(-1);
  const lvl = new Float32Array(w * h);
  const sM = new Int16Array(N), sL = new Float32Array(N), sT = new Float32Array(N), sZ = new Uint8Array(N), sP = new Int32Array(N);
  const score = new Float32Array(mats.length);
  const nv = [0, 0, 0];
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const idx = py * w + px, list = lists[idx];
    if (!list) continue;
    let n = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const sx = (px - ax + (i + 0.5) / SS) * inv, sy = (py - ay + (j + 0.5) / SS) * inv;
      const ox = sx, oy = sy * VY - FAR * RY, oz = sy * VZ - FAR * RZ;
      let bt = Infinity, bp = null, zt = Infinity, zz = 0, ht = Infinity, hz = 0;
      for (let k = 0; k < list.length; k++) {
        const p = list[k], b = p.bb;
        if (sx < b[0] || sx > b[2] || sy < b[1] || sy > b[3]) continue;
        const t = hit(p, ox, oy, oz);
        if (!(t > 0)) continue;
        if (t < bt) { bt = t; bp = p; }
        if (p.zone !== Z_PASS) {
          if (t < zt) { zt = t; zz = p.zone; }
          if (p.zone !== soft && t < ht) { ht = t; hz = p.zone; }
        }
      }
      if (!bp) continue;
      if (zz === soft && hz && ht - zt < SOFT_DEPTH) zz = hz;
      let l = 1;
      if (!bp.mat.emissive) {
        normalAt(bp, bt, ox, oy, oz, nv);
        const nl = Math.hypot(nv[0], nv[1], nv[2]) || 1;
        const dl = (nv[0] * LIGHT[0] + nv[1] * LIGHT[1] + nv[2] * LIGHT[2]) / nl, dv = (nv[1] * VIEW[1] + nv[2] * VIEW[2]) / nl;
        l = AMB + KEY * Math.max(0, dl) + FILL * Math.max(0, dv);
      }
      sM[n] = bp.mi; sL[n] = l; sT[n] = bt; sZ[n] = zz; sP[n] = bp.part; n++;
    }
    if (!n) continue;
    // weighted vote: which material this pixel shows (thin, important parts weigh more)
    let best = -1, bs = 0, cover = 0;
    for (let s = 0; s < n; s++) { const m = sM[s], wgt = mats[m].weight || 1; score[m] += wgt; cover += wgt; }
    for (let s = 0; s < n; s++) { const m = sM[s]; if (score[m] > bs) { bs = score[m]; best = m; } }
    for (let s = 0; s < n; s++) score[sM[s]] = 0;
    if (cover / N < 0.5) continue;
    let cnt = 0, sl = 0, st = 0;
    for (let s = 0; s < n; s++) if (sM[s] === best) { cnt++; sl += sL[s]; st += sT[s]; }
    matOf[idx] = best;
    lvl[idx] = sl / cnt;
    depth[idx] = st / cnt;
    zone[idx] = majority(sZ, sM, n, best);
    partOf[idx] = majority(sP, sM, n, best);
  }
  // tidy the silhouette: drop lone pixels that stick out (dome tips, stair-step nubs) unless they are
  // an important thin part (eyes, barrels, antennas)
  for (let pass = 0; pass < 2; pass++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, m = matOf[i];
    if (m < 0 || (mats[m].weight || 1) > 1) continue;
    let c = 0;
    if (x > 0 && matOf[i - 1] >= 0) c++;
    if (x < w - 1 && matOf[i + 1] >= 0) c++;
    if (y > 0 && matOf[i - w] >= 0) c++;
    if (y < h - 1 && matOf[i + w] >= 0) c++;
    if (c <= 1) { matOf[i] = -1; depth[i] = Infinity; zone[i] = 0; }
  }
  // colour: ramp by light level, darker where another part lies in front (arm over torso, near leg
  // over far leg) or the same part folds over itself
  const near = (j, t, pt) => depth[j] < t - (partOf[j] !== pt ? PART_DEPTH : EDGE_DEPTH);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, mi = matOf[i];
    if (mi < 0) continue;
    const m = mats[mi], r = m.ramp, n = r.length;
    let k = m.emissive ? n - 1 : Math.min(n - 1, Math.max(0, Math.floor(lvl[i] * n * 1.02) + (m.flat || 0)));
    if (!m.emissive) {
      const t = depth[i], pt = partOf[i];
      if ((x > 0 && near(i - 1, t, pt)) || (x < w - 1 && near(i + 1, t, pt)) || (y > 0 && near(i - w, t, pt)) || (y < h - 1 && near(i + w, t, pt))) k = Math.max(0, k - (k > 2 ? 2 : 1));
    }
    pix.data[i] = pack(r[k]);
  }
  // exterior outline; outline pixels take the zone of the most important part they border
  const src = Uint32Array.from(pix.data);
  const oc = pack(o.outline);
  const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && (src[y * w + x] >>> 24) > 0;
  let top = h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (op(x, y)) { if (y < top) top = y; continue; }
    let best = -1;
    for (let d = 0; d < 4; d++) {
      const dx = d === 0 ? -1 : d === 1 ? 1 : 0, dy = d === 2 ? -1 : d === 3 ? 1 : 0;
      if (!op(x + dx, y + dy)) continue;
      const z = zone[(y + dy) * w + x + dx];
      if (best < 0 || ZONE_PRIO[z] > ZONE_PRIO[best]) best = z;
    }
    if (best < 0) continue;
    pix.data[y * w + x] = oc;
    zone[y * w + x] = best;
    if (y < top) top = y;
  }
  return { pix, zone, depth, top };
}

/** Most common value of vals[] among the samples whose material is m. */
function majority(vals, mats, n, m) {
  let best = 0, bn = -1;
  for (let a = 0; a < n; a++) {
    if (mats[a] !== m) continue;
    let c = 0;
    for (let b = 0; b < n; b++) if (mats[b] === m && vals[b] === vals[a]) c++;
    if (c > bn) { bn = c; best = vals[a]; }
  }
  return best;
}

/** Hit zones by id (index). 0 = none. Higher prio wins where the scope's assisted aim overlaps them. */
export const ZONES = ['', 'head', 'torso', 'limb', 'grenadeBelt', 'fuelTank', 'rocketPod', 'radio', 'helmet', 'body'];
export const ZONE_PRIO = [0, 5, 3, 1, 4, 4, 4, 4, 5, 3];
export const Z = Object.fromEntries(ZONES.map((n, i) => [n || 'none', i]));
/** A part that never takes a hit itself (weapons): the shot passes on to whatever is behind it. */
export const Z_PASS = 255;

function primBounds(p) {
  if (p.k === 0 || p.k === 3) {
    const r = p.r;
    const A = project(p.a), B = project(p.b);
    return [Math.min(A[0], B[0]) - r, Math.min(A[1], B[1]) - r, Math.max(A[0], B[0]) + r, Math.max(A[1], B[1]) + r];
  }
  if (p.k === 1) {
    const R = Math.max(...p.rr);
    const C = project(p.c);
    return [C[0] - R, C[1] - R, C[0] + R, C[1] + R];
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const q = [0, 1, 2].map((i) => p.c[i] + p.ax[0][i] * p.hh[0] * sx + p.ax[1][i] * p.hh[1] * sy + p.ax[2][i] * p.hh[2] * sz);
    const [X, Y] = project(q);
    x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y);
  }
  return [x0, y0, x1, y1];
}

/** Lighten (f > 1, towards white) or darken (f < 1) a hex colour. */
export function tone(hex, f) {
  const [r, g, b] = unpack(pack(hex));
  const c = (v) => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)));
  const v = packRgba(c(r), c(g), c(b), 255);
  return '#' + [v & 255, (v >>> 8) & 255, (v >>> 16) & 255].map((x) => x.toString(16).padStart(2, '0')).join('');
}
