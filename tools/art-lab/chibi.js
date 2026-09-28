// @ts-check
/**
 * "Chibi" style study (art pass 5): detailed anime-chibi soldiers — a big head (≈40 % of the figure), short
 * limbs, oversized boots, big expressive eyes with a white glint, 3-tone cel shading and dark tinted outlines
 * instead of black. Built from 3D primitives on the New style's ray-caster (src/render/model3d.js), so every
 * facing and frame renders from the same model. Original designs in our palette: GOD olive/khaki/steel blue,
 * NOT charcoal/violet/lime.
 */
import { rasterize } from '../../src/render/model3d.js';
import { Rig, add } from '../../src/render/rig3d.js';

export const W = 48, H = 52, AX = 24, AY = 44;
const Mt = (ramp, extra = {}) => ({ ramp, ...extra });

// ---------------------------------------------------------------- materials (cel ramps: dark → mid → light)
const GOD = {
  helmet: Mt(['#3E4A20', '#66773A', '#9AAE52']), skin: Mt(['#B8734A', '#E8A878', '#FFD6AE']), hair: Mt(['#3A2414', '#5E3A20', '#86562E']),
  jacket: Mt(['#6E6036', '#A69458', '#D6C48A']), pants: Mt(['#343B1A', '#55602A', '#7C8A40']), boot: Mt(['#1E1810', '#3A2E20', '#5A4830']),
  strap: Mt(['#1E4466', '#2F6FA6', '#5EA2DA']),
  lens: Mt(['#24588A', '#3E84C2', '#78BEEC'], { weight: 5 }), frame: Mt(['#16181C', '#2A2E34'], { weight: 4 }),
  gun: Mt(['#16181A', '#2E3336', '#566066'], { weight: 3 }), scope: Mt(['#22262A', '#3E464C', '#7A8690'], { weight: 3 }),
  eye: Mt(['#1A1620', '#2A2436', '#3A3448'], { weight: 4 }), glint: Mt(['#FFFFFF'], { emissive: true, weight: 6 }),
  out: '#241C10',
};
const NOT = {
  head: Mt(['#22262C', '#3C434C', '#66707C']), body: Mt(['#1E2126', '#353B42', '#5A626C']), plate: Mt(['#3E1C70', '#6E36BA', '#A874F2']),
  lime: Mt(['#A6F03C'], { emissive: true, weight: 4 }), eye: Mt(['#C6FF5A'], { emissive: true, weight: 5 }), glint: Mt(['#FFFFFF'], { emissive: true, weight: 6 }),
  gun: Mt(['#14161A', '#2A2F35', '#4E565E'], { weight: 3 }), tank: Mt(['#7A3C10', '#D9822A', '#FFC46A']), hose: Mt(['#2E5A10', '#5E9A20', '#9FE22E'], { weight: 2 }),
  lens: Mt(['#9FE22E', '#E6FF8A'], { emissive: true, weight: 5 }), mask: Mt(['#2A2E34', '#4A525C', '#7C8692']),
  out: '#1A1022',
};

// ---------------------------------------------------------------- pose helpers (local frame: x forward, y right, z up)
function gait(ph, stride, lift) {
  const a = ph * Math.PI * 2;
  const foot = (off, side) => { const q = a + off, sw = Math.sin(q); return [Math.cos(q) * stride, side, Math.max(0, -sw) * lift]; };
  return { L: foot(0, -1.8), R: foot(Math.PI, 1.8), bob: Math.abs(Math.cos(a)) * 0.8, swing: Math.sin(a) };
}

/** WREN, chibi: olive helmet with steel-blue goggles, big eyes, khaki jacket, olive trousers, long scoped rifle */
function wren(r, ph) {
  const walking = ph != null, g = gait(ph ?? 0, walking ? 2.6 : 0, walking ? 1.6 : 0);
  const hip = 7 + (walking ? g.bob : 0);
  // legs & boots
  for (const [f, s] of [[g.L, -1], [g.R, 1]]) {
    r.part();
    const h = [0, s * 1.8, hip], k = add([(f[0]) * 0.5 + 0.6, s * 1.9, (hip + f[2]) * 0.5 + 0.4], [0, 0, 0]);
    r.cap(h, k, 1.8, GOD.pants); r.cap(k, [f[0], f[1], f[2] + 1.2], 1.7, GOD.pants);
    r.ell([f[0] + 0.8, f[1], f[2] + 1.1], [[1, 0, 0], [0, 1, 0]], [2.6, 1.7, 1.3], GOD.boot);
  }
  // torso: khaki jacket with a blue strap and a belt
  r.part();
  const chest = [0.4, 0, hip + 4.6];
  r.ell(chest, [[1, 0, 0], [0, 1, 0]], [3.1, 4.1, 4.6], GOD.jacket, 2);
  r.cap([2.9, 3.2, hip + 7.4], [3, -2.4, hip + 2], 0.6, GOD.strap, 2);
  r.cyl([0.4, 0, hip + 0.9], [0.4, 0, hip + 1.9], 3.9, GOD.boot, 2);
  // arms holding the rifle at the ready
  const sw = walking ? g.swing * 0.4 : 0;
  const handR = [3.2 + sw, 2.6, hip + 3.6], handL = [7 + sw, 0.4, hip + 4.6];
  r.part(); r.cap([0.4, 3.9, hip + 7.6], [1.6, 3.8, hip + 4.8], 1.4, GOD.jacket, 3); r.cap([1.6, 3.8, hip + 4.8], handR, 1.3, GOD.jacket, 3); r.ball(handR, 1.2, GOD.skin, 3);
  r.part(); r.cap([0.4, -3.9, hip + 7.6], [3.4, -2.6, hip + 5.6], 1.4, GOD.jacket, 3); r.cap([3.4, -2.6, hip + 5.6], handL, 1.3, GOD.jacket, 3); r.ball(handL, 1.2, GOD.skin, 3);
  r.part();
  r.box([6.5 + sw, 1.2, hip + 4.4], [[1, 0, 0.08], [0, 1, 0]], [7.5, 0.55, 0.7], GOD.gun, 255);
  r.cyl([4.6 + sw, 1.2, hip + 5.6], [8.4 + sw, 1.2, hip + 5.7], 0.8, GOD.scope, 255);
  // head: big, with a helmet over the top and goggles pushed up on it; anime eyes with a glint
  r.part();
  const head = [1.2, 0, hip + 14.4];
  r.ball(head, 6.2, GOD.skin, 1);
  r.ell(add(head, [-1.4, 0, -0.6]), [[1, 0, 0], [0, 1, 0]], [5.4, 6.2, 5.6], GOD.hair, 1);          // hair at the back and sides
  r.ell(add(head, [-1.1, 0, 3.1]), [[1, 0, 0], [0, 1, 0]], [6.4, 6.9, 4.2], GOD.helmet, 1);         // helmet riding high: the face shows
  r.cyl(add(head, [-1.1, 0, 1.4]), add(head, [-1.1, 0, 2.1]), 7, GOD.helmet, 1);                    // rim
  // round glasses over the eyes: steel-blue lenses in a thin dark frame, a bridge, arms back to the ears
  for (const s of [-1, 1]) {
    r.ell(add(head, [6.0, s * 2.4, -0.4]), [[1, 0, 0], [0, 1, 0]], [0.9, 2.0, 2.0], GOD.frame, 1);
    r.ell(add(head, [6.3, s * 2.4, -0.4]), [[1, 0, 0], [0, 1, 0]], [0.7, 1.6, 1.6], GOD.lens, 1);
    r.cap(add(head, [5.6, s * 4.2, 0]), add(head, [2.2, s * 5.9, 0.4]), 0.35, GOD.frame, 1);
  }
  r.cap(add(head, [6.3, -0.8, -0.1]), add(head, [6.3, 0.8, -0.1]), 0.35, GOD.frame, 1);
  r.ell(add(head, [5.9, 0, -3.3]), [[1, 0, 0], [0, 1, 0]], [0.4, 0.9, 0.35], Mt(['#8A4A34'], { weight: 3 }), 1);   // mouth
}

/** NOT Husk, chibi: an elongated alien head with huge glowing lime eyes, violet shoulder pads, lanky legs */
function husk(r, ph, scorcher = false) {
  const walking = ph != null, g = gait(ph ?? 0, walking ? 2.8 : 0, walking ? 1.8 : 0);
  const hip = 9 + (walking ? g.bob : 0);
  for (const [f, s] of [[g.L, -1], [g.R, 1]]) {
    r.part();
    const h = [0, s * 1.7, hip], k = [f[0] * 0.5 - 1.6, s * 1.8, (hip + f[2]) * 0.55];     // reverse knee
    r.cap(h, k, 1.4, NOT.body); r.cap(k, [f[0], f[1], f[2] + 1], 1.1, NOT.body);
    r.ball(k, 0.9, NOT.lime, 3);
    r.ell([f[0] + 0.9, f[1], f[2] + 0.8], [[1, 0, 0], [0, 1, 0]], [2.3, 1.4, 1], NOT.body);
  }
  r.part();
  const chest = [0.3, 0, hip + 4.6];
  r.ell(chest, [[1, 0, 0], [0, 1, 0]], [2.8, 3.4, 4.8], NOT.body, 2);
  r.ball(add(chest, [2.4, 0, 0.4]), 0.9, NOT.lime, 2);
  for (const s of [-1, 1]) r.ell([0.2, s * 3.6, hip + 8.2], [[1, 0, 0], [0, 1, 0]], [2.2, 2, 1.7], NOT.plate, 2);
  if (scorcher) {
    // twin orange tanks on the back, a hose to the mask
    r.part();
    for (const s of [-1, 1]) r.cyl([-3.6, s * 1.6, hip + 1.2], [-3.6, s * 1.6, hip + 8.4], 1.6, NOT.tank, 5);
    r.cap([-3.4, 0, hip + 8.6], [2.6, 0, hip + 11.4], 0.5, NOT.hose, 5);
  }
  const sw = walking ? g.swing * 0.4 : 0;
  const handR = [3.2 + sw, 2.4, hip + 3.2], handL = [6.2 + sw, 0.2, hip + 4.2];
  r.part(); r.cap([0.2, 3.6, hip + 7.6], [1.2, 3.6, hip + 4.4], 1, NOT.body, 3); r.cap([1.2, 3.6, hip + 4.4], handR, 0.9, NOT.body, 3);
  r.part(); r.cap([0.2, -3.6, hip + 7.6], [3.2, -2.4, hip + 5.2], 1, NOT.body, 3); r.cap([3.2, -2.4, hip + 5.2], handL, 0.9, NOT.body, 3);
  r.part();
  if (scorcher) { r.cyl([2.2 + sw, 1, hip + 3.6], [9.4 + sw, 0.6, hip + 4.6], 0.8, NOT.gun, 255); r.ball([9.8 + sw, 0.6, hip + 4.6], 0.8, NOT.tank, 255); }
  else { r.box([5 + sw, 1, hip + 3.9], [[1, 0, 0.06], [0, 1, 0]], [4.6, 0.6, 0.9], NOT.gun, 255); r.ball([9.8 + sw, 1, hip + 4.2], 0.55, NOT.lime, 255); }
  // head
  r.part();
  const head = [1, 0, hip + 14.6];
  r.ell(head, [[1, 0, 0.25], [0, 1, 0]], [5.4, 5.6, 7], NOT.head, 1);
  if (scorcher) {
    // gas mask: two big round lime lenses and a snout
    r.ell(add(head, [3.4, 0, -2]), [[1, 0, 0], [0, 1, 0]], [3, 4.6, 3.4], NOT.mask, 1);
    for (const s of [-1, 1]) r.ball(add(head, [5.4, s * 2.3, -0.2]), 1.6, NOT.lens, 1);
    r.cyl(add(head, [5.4, 0, -3]), add(head, [7.2, 0, -3.6]), 1.2, NOT.mask, 1);
  } else {
    for (const s of [-1, 1]) {
      r.ell(add(head, [4.6, s * 2.5, -0.6]), [[1, 0, 0], [0, 1, 0]], [1, 1.5, 2.2], NOT.eye, 1);
      r.ball(add(head, [5.4, s * 2.1, 0.4]), 0.5, NOT.glint, 1);
    }
    r.ell(add(head, [-1, 0, 5]), [[1, 0, 0], [0, 1, 0]], [2.4, 1, 1.8], NOT.plate, 1);   // violet crest
  }
}

/**
 * Render one frame. kind: wren | husk | scorcher; dir 0..7 (N, NE, E, SE, S, SW, W, NW); frame 0..5 walking, or
 * walk=false for the idle pose.
 */
export function chibi(kind, dir, frame = 0, walk = false, gleam = -1) {
  const r = new Rig(((dir * 45 - 90) * Math.PI) / 180);
  const ph = walk ? (frame % 6) / 6 : null;
  if (kind === 'wren') wren(r, ph); else husk(r, ph, kind === 'scorcher');
  const { pix } = rasterize(r.m, { w: W, h: H, ax: AX, ay: AY, outline: kind === 'wren' ? GOD.out : NOT.out, scale: 1 });
  if (kind === 'wren' && gleam >= 0) addGleam(pix, gleam);
  return { pix, w: W, h: H, ax: AX, ay: AY };
}

/**
 * The sun catching WREN's glasses: a bright diagonal band sweeps across the lens pixels (t 0 → 1), white in the
 * middle with a pale-blue halo. Only lens pixels change, so it follows the lenses in every facing.
 */
const LENS = new Set(GOD.lens.ramp.map((c) => parseInt(c.slice(1), 16)));
function addGleam(pix, t) {
  const w = pix.w, h = pix.h, cells = [];
  let x0 = w, x1 = -1, y0 = h;
  for (let i = 0; i < w * h; i++) {
    const v = pix.data[i];
    if (!(v >>> 24)) continue;
    const rgb = ((v & 255) << 16) | (((v >>> 8) & 255) << 8) | ((v >>> 16) & 255);
    if (!LENS.has(rgb)) continue;
    const x = i % w, y = Math.floor(i / w);
    cells.push([i, x, y]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y);
  }
  if (!cells.length) return;
  const band = x0 - 3 + t * (x1 - x0 + 6);
  for (const [i, x, y] of cells) {
    const d = Math.abs(x - band + (y - y0) * 0.8);
    if (d < 1.3) pix.data[i] = 0xFFFFFFFF;
    else if (d < 2.4) pix.data[i] = 0xFFFFF0D8;          // pale blue (ABGR)
  }
  // the sparkle: a little 4-point star flashing on the rim of the far lens as the band crosses it
  if (t > 0.45 && t < 0.85) {
    const big = t > 0.55 && t < 0.75;
    const sx = x1, sy = y0 - 1, R = big ? 2 : 1;
    const put = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) pix.data[y * w + x] = 0xFFFFFFFF; };
    put(sx, sy);
    for (let k = 1; k <= R; k++) { put(sx + k, sy); put(sx - k, sy); put(sx, sy + k); put(sx, sy - k); }
  }
}
export const KINDS = ['wren', 'husk', 'scorcher'];
