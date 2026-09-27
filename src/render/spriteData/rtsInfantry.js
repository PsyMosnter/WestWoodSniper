// @ts-check
/**
 * Art style "Newest" — infantry (playtest 2 art pass; prototype and review page: tools/art-lab/).
 * Baseline: 1995-era RTS infantry — 8 real facings, 6-frame walks, 12-frame deaths, tiny figures (a 3–5 px
 * head, slim body, a stick of a rifle), flat 3-tone colour lit from the top-left, dark self-coloured edges.
 *
 * A figure is a handful of limbs posed in 3D (x forward, y to its right, z up), turned to one of 8 facings and
 * projected top-down 3/4 (screen y = ground y × 0.5 − height). Limbs are drawn as blocky pixel stamps, far to
 * near; each thick limb first leaves a dark edge one pixel down-right of itself (over empty ground or parts well
 * behind it), which is how the old sprites separated an arm from the torso. Poses are joint angles, so walks and
 * deaths are smooth at any frame count and every facing comes for free. The shadow is the same limbs dropped onto
 * the ground away from the light, so it starts at the feet. Every pixel records the hit zone of the part that
 * drew it (weapons pass the shot through), so the scope magnifies these very sprites (scopeSprites.zoneAtMap).
 */
import { Art } from '../artStyle.js';
import { Z } from '../model3d.js';

// ------------------------------------------------------------------ colour & raster helpers
const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const darken = (c, f) => toHex(hex(c).map((v) => v * f));
const mixc = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const rad = (d) => (d * Math.PI) / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ palettes (3-tone ramps: light, mid, dark)
const GOD = {
  helmet: ['#98AA4E', '#66773A', '#3E4A20'], visor: ['#A8E6FF', '#3C8ACB'], skin: ['#E6AE7E', '#B67E52'],
  vest: ['#D8C682', '#AA985A', '#6E6236'], strap: '#3A74B0', arm: ['#C8B676', '#9A8A50', '#665A30'],
  legs: ['#707E3C', '#505B29', '#343B1A'], boot: ['#4E4230', '#2A2219'], gun: ['#7A838A', '#2A2E31'], pack: ['#8A7C48', '#6E6236', '#4A4226'],
};
const NOTC = {
  helmet: ['#6C747E', '#474D55', '#2A2E33'], eye: '#F0FFA8', core: '#AEEB38', knee: '#AEEB38',
  vest: ['#666E78', '#40464E', '#23262B'], plate: ['#A26DEE', '#6A33B3', '#3B1A68'], arm: ['#4E545C', '#33373D', '#1C1F23'],
  legs: ['#626A74', '#3A3F46', '#1E2125'], boot: ['#4E545C', '#1C1F23'], gun: ['#6A7278', '#24282B'], glow: '#C6FF5A',
};
const HUMAN = { thigh: 3.1, shin: 3.3, hipZ: 6.5, hipW: 1.5, chestZ: 10.0, shoulderZ: 10.3, shoulderW: 2.6, torsoW: 5, torsoD: 3, headZ: 13.2, headR: 2.0, upperArm: 2.6, foreArm: 2.6, kneeDir: 1, helmetStyle: 'wren' };
const NOTB = { thigh: 4.6, shin: 5.0, hipZ: 9.2, hipW: 1.6, chestZ: 13.8, shoulderZ: 14.2, shoulderW: 3.0, torsoW: 4, torsoD: 3, headZ: 17.2, headR: 1.7, headLong: 1.2, upperArm: 3.8, foreArm: 3.6, kneeDir: -1 };

/** Unit definitions: body proportions, colours, weapon and gear. */
export const RTS = {
  operative: { ...HUMAN, col: GOD, weapon: 'sniper', gear: ['pack'] },
  pilot: { ...HUMAN, col: { ...GOD, helmet: ['#F2F2EA', '#C8C8C0', '#8A8A84'], visor: ['#5A6E80', '#26323C'], vest: ['#9AA6A0', '#6E7A74', '#46504A'], arm: ['#8A968E', '#626E68', '#3E4842'], legs: ['#7E8A84', '#5A6660', '#3A4440'], strap: '#2A2E31' }, weapon: 'none', gear: [] },
  scientist: { ...HUMAN, helmetStyle: 'hair', col: { ...GOD, helmet: ['#6A4A30', '#4A3220', '#2E1E12'], vest: ['#F2F2EA', '#C8C8C0', '#8A8A84'], arm: ['#E8E8E0', '#BEBEB6', '#86867E'], legs: ['#8A7C58', '#6A5E40', '#46402A'], strap: '#3A74B0' }, weapon: 'none', gear: [] },
  husk: { ...NOTB, col: NOTC, weapon: 'rifle', gear: [] },
  lobber: { ...NOTB, col: NOTC, weapon: 'grenade', gear: ['belt'] },
  scorcher: { ...NOTB, col: NOTC, weapon: 'flamer', gear: ['tank'] },
  launcher: { ...NOTB, col: NOTC, weapon: 'launcher', gear: ['pod'] },
  warden: { ...NOTB, col: NOTC, weapon: 'smg', gear: ['radio', 'crest'] },
  harvester: { ...NOTB, col: { ...NOTC, helmet: ['#8A929C', '#626A74', '#40464E'], vest: ['#8A929C', '#5E6670', '#3A3F46'], legs: ['#7E8690', '#565E68', '#343940'], arm: ['#6E7680', '#4A5058', '#2C3035'] }, weapon: 'none', gear: ['basket'] },
  vrask: { ...NOTB, scale: 1.1, col: NOTC, weapon: 'smg', gear: ['helmet', 'cape'] },
  sniffer: { beast: true, col: NOTC },
};

// ------------------------------------------------------------------ poses
function pitch(p, a, px = 0, pz = 0) {
  const x = p.x - px, z = p.z - pz, c = Math.cos(a), s = Math.sin(a);
  return { x: px + x * c + z * s, y: p.y, z: pz - x * s + z * c };
}
function roll(p, a, pz = 0) {
  const y = p.y, z = p.z - pz, c = Math.cos(a), s = Math.sin(a);
  return { x: p.x, y: y * c - z * s, z: pz + y * s + z * c };
}
/** 2-bone limb from `a` toward `t` in the x-z plane (y interpolated); bend > 0 pushes the joint forward */
function ik(a, t, l1, l2, bend) {
  const dx = t.x - a.x, dz = t.z - a.z, d = Math.max(0.01, Math.min(l1 + l2 - 0.01, Math.hypot(dx, dz)));
  const base = Math.atan2(dz, dx), cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const ang = base + bend * Math.acos(Math.max(-1, Math.min(1, cosA)));
  const L = Math.hypot(dx, dz) || 1e-6;
  return [{ x: a.x + Math.cos(ang) * l1, y: (a.y + t.y) / 2, z: a.z + Math.sin(ang) * l1 }, { x: a.x + (dx / L) * d, y: t.y, z: a.z + (dz / L) * d }];
}

/**
 * Joint positions for a pose.
 * @param {any} d  unit def
 * @param {{walk?: number, run?: boolean, pitch?: number, pitchKnees?: boolean, pivotX?: number, pivotZ?: number,
 *   rootX?: number, rootZ?: number, kneel?: number, arms?: string, armT?: number, dropGun?: boolean, lean?: number,
 *   crawl?: number}} s
 */
function pose(d, s = {}) {
  const J = {};
  const k = d.scale || 1;
  const ph = s.walk ?? null;
  const stride = (s.run ? 2.6 : 1.9) * k;
  const hipDrop = (s.kneel || 0) * (d.thigh * k * 0.95);
  const foot = (side, phase) => {
    if (phase == null) return { x: 0.2, y: side * (d.hipW * k + 0.1), z: 0 };
    const a = phase * Math.PI * 2;
    return { x: Math.cos(a) * stride, y: side * (d.hipW * k + 0.1), z: Math.max(0, Math.sin(a)) * (s.run ? 1.6 : 1.1) };
  };
  const bob = ph != null ? -Math.abs(Math.cos(ph * Math.PI * 2)) * 0.5 + 0.25 : 0;
  const hipZ = d.hipZ * k - hipDrop + bob;
  J.hipL = { x: 0, y: -d.hipW * k, z: hipZ }; J.hipR = { x: 0, y: d.hipW * k, z: hipZ };
  J.footL = foot(-1, ph); J.footR = foot(1, ph == null ? null : ph + 0.5);
  if (s.kneel) {                                       // kneeling: shins flat on the ground behind him
    const q = s.kneel;
    J.footL = { x: lerp(J.footL.x, -d.shin * k * 0.9, q), y: J.footL.y, z: lerp(J.footL.z, 0, q) };
    J.footR = { x: lerp(J.footR.x, -d.shin * k * 0.8 + (s.kneelSplit ? 1.6 : 0), q), y: J.footR.y, z: lerp(J.footR.z, 0, q) };
  }
  const bend = d.kneeDir > 0 ? 1 : -1;
  [J.kneeL, J.footL] = ik(J.hipL, J.footL, d.thigh * k, d.shin * k, bend);
  [J.kneeR, J.footR] = ik(J.hipR, J.footR, d.thigh * k, d.shin * k, bend);
  const lean = s.lean ?? (s.run ? 0.8 : ph != null ? 0.35 : 0);
  J.pelvis = { x: 0, y: 0, z: hipZ + 0.6 };
  J.chest = { x: lean, y: 0, z: hipZ + (d.chestZ - d.hipZ) * k };
  J.shL = { x: lean, y: -d.shoulderW * k, z: hipZ + (d.shoulderZ - d.hipZ) * k }; J.shR = { x: lean, y: d.shoulderW * k, z: J.shL.z };
  J.head = { x: lean * 1.2 + 0.2, y: 0, z: hipZ + (d.headZ - d.hipZ) * k };
  const arms = s.arms || 'hold', at = s.armT ?? 0;
  const swing = ph != null ? Math.cos(ph * Math.PI * 2) : 0;
  const shZ = J.shR.z, ua = d.upperArm * k, fa = d.foreArm * k;
  if (arms === 'hold') {                               // weapon carried at the hip, pointing ahead
    J.handR = { x: lean + 1.4 + swing * 0.15, y: d.shoulderW * k * 0.5, z: shZ - 3.2 * k };
    J.handL = { x: lean + 3.4 + swing * 0.15, y: -0.2, z: shZ - 2.6 * k };
  } else if (arms === 'aim') {                         // shouldered, looking down the sights
    J.handR = { x: lean + 1.2, y: d.shoulderW * k * 0.4, z: shZ - 0.8 };
    J.handL = { x: lean + 3.6, y: -0.2, z: shZ - 0.6 };
  } else if (arms === 'pistol') {                      // right arm out with the pistol, left swinging
    J.handR = { x: lean + ua + fa - 0.6, y: d.shoulderW * k * 0.6, z: shZ - 1 };
    J.handL = { x: lean - swing * 1.4, y: -d.shoulderW * k - 0.3, z: shZ - ua - fa + 1 };
  } else if (arms === 'swing') {                       // unarmed: arms swing with the stride
    J.handR = { x: lean + swing * 1.6, y: d.shoulderW * k + 0.3, z: shZ - ua - fa + 1.2 };
    J.handL = { x: lean - swing * 1.6, y: -d.shoulderW * k - 0.3, z: shZ - ua - fa + 1.2 };
  } else if (arms === 'shoulder') {                    // launcher tube on the right shoulder
    J.handR = { x: lean + 1.6, y: d.shoulderW * k, z: shZ - 0.4 };
    J.handL = { x: lean + 3, y: d.shoulderW * k * 0.3, z: shZ - 0.6 };
  } else if (arms === 'fling') {                       // thrown up and back by a hit
    J.handR = { x: lean - 1 - at * 2, y: d.shoulderW * k + 1, z: shZ + 1 + at * 2 };
    J.handL = { x: lean - 0.5 - at * 1.5, y: -d.shoulderW * k - 1, z: shZ + 1.5 + at * 1.5 };
  } else if (arms === 'up') {                          // grabbed from behind: hands to the throat
    J.handR = { x: lean + 1, y: 0.6, z: J.head.z - 1.5 }; J.handL = { x: lean + 1, y: -0.6, z: J.head.z - 1.4 };
  } else if (arms === 'prone') {                       // flat on the ground: elbows down, rifle ahead
    const c = s.crawl ?? 0;
    J.handR = { x: lean + ua + fa - 1 + Math.sin(c) * 1.2, y: d.shoulderW * k * 0.6, z: shZ - 0.2 };
    J.handL = { x: lean + ua + fa - 0.4 - Math.sin(c) * 1.2, y: -d.shoulderW * k * 0.4, z: shZ - 0.2 };
  } else {                                             // limp: hanging / sprawled
    J.handR = { x: lean + 0.6 + at, y: d.shoulderW * k + 0.8 + at, z: shZ - ua - fa + 0.8 };
    J.handL = { x: lean - 0.4 - at, y: -d.shoulderW * k - 0.8 - at * 0.5, z: shZ - ua - fa + 0.8 };
  }
  [J.elbR, J.handR] = ik(J.shR, J.handR, ua, fa, -1);
  [J.elbL, J.handL] = ik(J.shL, J.handL, ua, fa, -1);
  // whole-body pitch about a pivot (falls, lying flat) — or, kneeling, the body above the knees about the knees
  if (s.pitch) {
    const fromKnees = !!s.pitchKnees;
    const px0 = fromKnees ? (J.kneeL.x + J.kneeR.x) / 2 : s.pivotX || 0, pz0 = fromKnees ? (J.kneeL.z + J.kneeR.z) / 2 : s.pivotZ || 0;
    for (const key of Object.keys(J)) {
      if (fromKnees && (key.startsWith('foot') || key.startsWith('knee'))) continue;
      J[key] = pitch(J[key], s.pitch, px0, pz0);
    }
  }
  const rx = s.rootX || 0, rz = s.rootZ || 0;
  for (const key of Object.keys(J)) {
    const p = J[key];
    J[key] = { x: p.x + rx, y: p.y, z: Math.max(key.startsWith('foot') || key.startsWith('knee') ? -0.2 : 0.4, p.z + rz) };
  }
  return J;
}

// ------------------------------------------------------------------ drawing
const LIGHT = { x: -0.55, y: -0.6 };                     // from the top-left: shadows fall down-right

/**
 * Rasterize a list of primitives into a sprite. `frame` = {W, H, AX, AY} canvas and ground anchor.
 * @returns {{px: (string|null)[], zone: Uint8Array, shadow: Uint8Array, w: number, h: number, ax: number, ay: number, top: number}}
 */
function raster(prims, frame, fx, fy, extra = []) {
  const { W, H, AX, AY } = frame;
  const scr = (w) => ({ sx: AX + w.X, sy: AY + w.Y * 0.5 - w.z });
  prims.sort((a, b) => a.depth - b.depth);
  const px = new Array(W * H).fill(null);
  const zone = new Uint8Array(W * H);
  const zb = new Float32Array(W * H).fill(-Infinity);
  const fig = new Uint8Array(W * H);                     // pixels of the figure itself (not blood/flash extras)
  let curDepth = 0, edging = false, curZone = 0;
  const put = (x, y, c) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (edging) { if (zb[i] > curDepth - 0.6) return; px[i] = c; fig[i] = 1; if (curZone !== 255) zone[i] = curZone; return; }
    px[i] = c; zb[i] = curDepth; fig[i] = 1;
    if (curZone !== 255) zone[i] = curZone;          // (weapons pass the shot on to whatever is behind)
  };
  const tone = (ramp, u, v) => ramp[Math.min(ramp.length - 1, u + v < -0.35 ? 0 : u + v > 0.45 ? 2 : 1)];
  const edgeOf = (ramp) => mixc(darken(ramp[ramp.length - 1], 0.55), '#0B0C0A', 0.3);
  const draw = (p, dx, dy, solid) => {
    const col = (c) => solid || c;
    if (p.kind === 'px') { if (solid) return; const s0 = scr(p.P); put(s0.sx + dx, s0.sy + dy, p.col); return; }
    if (p.kind === 'helmet') {
      // 5 wide: a 3-px dome, the helmet body, the brim; below it the visor band and the face (or the neck)
      const s0 = scr(p.P), X = Math.round(s0.sx), Y = Math.round(s0.sy);
      const Hc = p.ramp, side = Math.round(p.fx * 1.2);
      const rows = [[[-1, 0], [0, 0], [1, 1]], [[-2, 0], [-1, 0], [0, 1], [1, 1], [2, 2]], [[-2, 1], [-1, 1], [0, 1], [1, 2], [2, 2]]];
      rows.forEach((r, j) => r.forEach(([xx, c]) => put(X + xx + dx, Y - 2 + j + dy, col(Hc[c]))));
      if (solid) return;
      if (p.style === 'hair') {                        // bare head: hair on top, face below
        if (p.front) { for (const xx of [-1, 0, 1]) put(X + xx + side, Y + 1, p.skin[0]); put(X + side + 1, Y + 1, p.skin[1]); put(X + side, Y + 2, p.skin[1]); }
        else { for (const xx of [-1, 0, 1]) put(X + xx, Y + 1, Hc[1]); put(X, Y + 2, p.skin[1]); }
      } else if (p.front) {
        for (const xx of [-1, 0, 1]) put(X + xx + side, Y + 1, p.visor[xx < 1 ? 0 : 1]);
        put(X + side, Y + 2, p.skin[0]); put(X + side + 1, Y + 2, p.skin[1]);
      } else { for (const xx of [-1, 0, 1]) put(X + xx, Y + 1, Hc[2]); put(X, Y + 2, p.skin[1]); }
      return;
    }
    if (p.kind === 'dot') {
      const s0 = scr(p.P), r = p.r, L = p.long || 0;
      for (let yy = -Math.ceil(r + L); yy <= Math.ceil(r); yy++) for (let xx = -Math.ceil(r); xx <= Math.ceil(r); xx++) {
        const ny = yy < 0 ? Math.min(0, yy + L) : yy;
        if (xx * xx + ny * ny > r * r + 0.6) continue;
        put(s0.sx + xx + dx, s0.sy + yy + dy, col(tone(p.ramp, xx / (r + 0.5), (yy + L / 2) / (r + L / 2 + 0.5))));
      }
      return;
    }
    const a = scr(p.A), b = scr(p.B);
    const n = Math.max(1, Math.ceil(Math.hypot(b.sx - a.sx, b.sy - a.sy) * 2));
    const hw = (p.w - 1) / 2, c0 = (Math.ceil(hw) - Math.floor(hw)) / 2;   // (even widths: centre between two pixels)
    for (let i = 0; i <= n; i++) {
      const x = lerp(a.sx, b.sx, i / n), y = lerp(a.sy, b.sy, i / n);
      for (let oy = -Math.floor(hw); oy <= Math.ceil(hw); oy++) for (let ox = -Math.floor(hw); ox <= Math.ceil(hw); ox++) {
        put(x + ox + dx, y + oy + dy, col(tone(p.ramp, hw ? (ox - c0) / (hw + 0.5) : 0, (i / n - 0.5) * 0.4 + (hw ? (oy - c0) / (hw + 1) : 0) * 0.5)));
      }
    }
  };
  for (const p of prims) {
    curDepth = p.depth; curZone = p.zone ?? 0;
    const thick = p.kind === 'dot' || p.kind === 'helmet' || (p.kind === 'seg' && p.w >= 2);
    if (thick && p.ramp) { edging = true; draw(p, 1, 1, edgeOf(p.ramp)); edging = false; }
    draw(p, 0, 0, null);
  }
  // shadow: every limb dropped to the ground along the light (height → offset down-right)
  const shadow = new Uint8Array(W * H);
  for (const p of prims) {
    if (p.noShadow) continue;
    const pts = p.kind === 'seg' ? [p.A, p.B, { X: (p.A.X + p.B.X) / 2, Y: (p.A.Y + p.B.Y) / 2, z: (p.A.z + p.B.z) / 2 }] : [p.P];
    for (const q of pts) {
      const gx = AX + q.X - LIGHT.x * q.z * 0.55, gy = AY + (q.Y - LIGHT.y * q.z * 0.55) * 0.5;
      const r = p.kind === 'seg' ? Math.max(1, p.w - 0.5) : 1.4;
      for (let yy = -1; yy <= 0; yy++) for (let xx = -Math.floor(r / 2); xx <= Math.ceil(r / 2); xx++) {
        const X = Math.round(gx + xx), Y = Math.round(gy + yy);
        if (X >= 0 && Y >= 0 && X < W && Y < H) shadow[Y * W + X] = 1;
      }
    }
  }
  for (let y = 0; y < H; y++) for (let x = 1; x < W - 1; x++) if (!shadow[y * W + x] && shadow[y * W + x - 1] && shadow[y * W + x + 1]) shadow[y * W + x] = 1;
  // extras drawn on top without edges/zones (muzzle flash, blood droplets and splats baked into death frames)
  for (const e of extra) {
    const X = Math.round(e.x), Y = Math.round(e.y);
    for (let yy = 0; yy < (e.h || 1); yy++) for (let xx = 0; xx < (e.w || 1); xx++) if (X + xx >= 0 && Y + yy >= 0 && X + xx < W && Y + yy < H && !px[(Y + yy) * W + X + xx]) px[(Y + yy) * W + X + xx] = e.col;
  }
  // self-coloured outline around the whole figure (1 px ring; no hit zone)
  const out = px.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (px[y * W + x]) continue;
    let n = null;
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (fig[yy * W + xx]) { n = px[yy * W + xx]; break; }
    }
    if (n) out[y * W + x] = mixc(darken(n, 0.34), '#0B0C0A', 0.35);
  }
  let top = H;
  for (let i = 0; i < out.length; i++) if (fig[i]) { top = Math.floor(i / W); break; }
  return { px: out, zone, shadow, w: W, h: H, ax: AX, ay: AY, top: AY - top };
}

/** Build a humanoid's primitives for a pose. */
function humanoid(type, d, s, facing, opt = {}) {
  const C = d.col, k = d.scale || 1;
  const J = pose(d, s);
  const th = rad(facing * 45 - 90);
  const fx = Math.cos(th), fy = Math.sin(th), rxv = -fy, ryv = fx;
  const toW = (p) => ({ X: p.x * fx + p.y * rxv, Y: p.x * fy + p.y * ryv, z: p.z });
  const prims = [];
  const seg = (a, b, w, ramp, zone, bias = 0) => { const A = toW(a), B = toW(b); prims.push({ kind: 'seg', A, B, w, ramp, zone, depth: (A.Y + B.Y) / 2 + bias }); };
  const dot = (p, r, ramp, zone, bias = 0, long = 0) => { const P = toW(p); prims.push({ kind: 'dot', P, r, ramp, long, zone, depth: P.Y + bias }); };
  const px = (p, col, zone, bias = 0.5) => { const P = toW(p); prims.push({ kind: 'px', P, col, zone, depth: P.Y + bias }); };
  const gear = d.gear || [];
  const back = (dx, dz) => ({ x: J.chest.x - dx, y: 0, z: dz });    // a point on his back
  const ZL = Z.limb, ZT = Z.torso, ZH = Z.head;

  // legs
  seg(J.hipL, J.kneeL, 2, C.legs, ZL); seg(J.kneeL, J.footL, 2, C.legs, ZL); dot(J.footL, 0.6, C.boot, ZL, 0.1);
  seg(J.hipR, J.kneeR, 2, C.legs, ZL); seg(J.kneeR, J.footR, 2, C.legs, ZL); dot(J.footR, 0.6, C.boot, ZL, 0.1);
  if (C.knee && !d.helmetStyle) { px(J.kneeL, C.knee, ZL); px(J.kneeR, C.knee, ZL); }
  // torso: wide from the front or back, narrow side-on
  seg(J.pelvis, J.chest, Math.round(lerp(d.torsoD || d.torsoW, d.torsoW, Math.abs(fy)) * (k > 1 ? 1.2 : 1)), C.vest, ZT);
  const plate = C.plate && !d.helmetStyle ? C.plate : C.vest;
  seg(J.shL, J.shR, 2, plate, ZT, 0.05);
  if (C.plate && !d.helmetStyle) { dot(J.shL, 0.9, C.plate, ZT, 0.1); dot(J.shR, 0.9, C.plate, ZT, 0.1); }
  if (d.helmetStyle && C.strap) { const m = { x: (J.shL.x + J.pelvis.x) / 2, y: 0, z: (J.shL.z + J.pelvis.z) / 2 }; seg(J.shR, m, 1, [C.strap, C.strap, C.strap], ZT, 0.3); }
  if (!d.helmetStyle && C.core) px({ x: J.chest.x + 0.6, y: 0, z: J.chest.z - 1 }, C.core, ZT, 0.6);
  // gear on the back (hidden by the torso seen from the front — SPEC §12.1 weak spots)
  const bz0 = J.pelvis.z + 1, bz1 = J.chest.z - 0.3;
  if (gear.includes('tank')) seg(back(1.7, bz0), back(1.7, bz1), 3, ['#F0A040', '#C06A1A', '#6E3A12'], Z.fuelTank, -0.1);
  if (gear.includes('pod')) { seg(back(1.7, bz0 + 1), back(1.7, bz1), 3, ['#8D96A0', '#5E6670', '#353B42'], Z.rocketPod, -0.1); px(back(1.7, bz1 + 0.4), C.glow, Z.rocketPod, -0.05); }
  if (gear.includes('radio')) { seg(back(1.6, bz0 + 0.5), back(1.6, bz1), 2, ['#6C747E', '#474D55', '#2A2E33'], Z.radio, -0.1); seg(back(1.8, bz1), back(2, J.head.z + 2), 1, C.gun, 255, -0.1); px(back(2, J.head.z + 2.4), C.glow, 255, -0.05); }
  if (gear.includes('basket')) seg(back(1.8, bz0), back(1.8, bz1 + 0.5), 3, ['#9A7A4A', '#6E5430', '#46341C'], ZT, -0.1);
  if (gear.includes('pack')) seg(back(1.5, bz0 + 0.5), back(1.5, bz1 - 0.3), 3, C.pack, ZT, -0.1);
  if (gear.includes('cape')) seg(back(1.2, J.chest.z), back(1.8, J.pelvis.z - 2.5), 3, C.plate, ZT, -0.6);
  if (gear.includes('belt')) for (const yy of [-1.3, 0, 1.3]) dot({ x: J.pelvis.x + 0.9, y: yy, z: J.pelvis.z - 0.3 }, 0.6, ['#FFE07A', '#F09A2A', '#8A4A12'], Z.grenadeBelt, 0.6);
  // arms
  seg(J.shL, J.elbL, 1, C.arm, ZL); seg(J.elbL, J.handL, 1, C.arm, ZL);
  seg(J.shR, J.elbR, 1, C.arm, ZL); seg(J.elbR, J.handR, 1, C.arm, ZL);
  // weapon (never takes the hit itself: zone 255 passes it through)
  const wp = s.dropGun ? 'none' : s.weapon || d.weapon;
  const gunCol = [C.gun[0], C.gun[1], C.gun[1]];
  const fwd = (p, t, dz = 0) => ({ x: p.x + t, y: p.y * 0.6, z: p.z + dz });
  let tip = null;
  if (wp === 'sniper') { seg(fwd(J.handR, -2), fwd(J.handL, 3.2, 0.2), 1, gunCol, 255, 0.4); tip = fwd(J.handL, 3.4, 0.2); }
  else if (wp === 'rifle') { seg(fwd(J.handR, -1.5), fwd(J.handL, 2.2, 0.2), 1, gunCol, 255, 0.4); tip = fwd(J.handL, 2.4, 0.2); px(tip, C.glow, 255, 0.45); }
  else if (wp === 'smg') { seg(fwd(J.handR, -0.6), fwd(J.handR, 1.8), 1, gunCol, 255, 0.4); tip = fwd(J.handR, 2); }
  else if (wp === 'flamer') { seg(fwd(J.handR, -1), fwd(J.handL, 2.6, 0.1), 1, gunCol, 255, 0.4); tip = fwd(J.handL, 2.8, 0.1); px(tip, '#F09A2A', 255, 0.45); }
  else if (wp === 'launcher') { seg({ x: J.shR.x - 2, y: J.shR.y, z: J.shR.z + 0.6 }, { x: J.shR.x + 4, y: J.shR.y, z: J.shR.z + 0.8 }, 2, ['#8D96A0', '#5E6670', '#353B42'], 255, 0.5); tip = { x: J.shR.x + 4.4, y: J.shR.y, z: J.shR.z + 0.8 }; }
  else if (wp === 'pistol') { seg(J.handR, fwd(J.handR, 1.2), 1, gunCol, 255, 0.4); tip = fwd(J.handR, 1.4); }
  else if (wp === 'grenade') px(J.handR, '#F09A2A', 255, 0.5);
  if (wp === 'pistol' && d.weapon === 'sniper') seg(back(1.6, J.pelvis.z), back(0.6, J.shL.z + 1.5), 1, gunCol, 255, -0.2);   // rifle slung on the back
  // head
  const front = fy > -0.35;
  const helm = gear.includes('helmet') && !opt.nohelm;
  if (d.helmetStyle) { const P = toW(J.head); prims.push({ kind: 'helmet', P, front, fx, ramp: C.helmet, visor: C.visor, skin: C.skin, style: d.helmetStyle, zone: ZH, depth: P.Y + 0.2 }); }
  else {
    dot(J.head, d.headR * k, C.helmet, ZH, 0.2, d.headLong || 0);
    if (front) { const f = { x: J.head.x + d.headR * 0.8, y: 0, z: J.head.z - 0.3 }; px({ ...f, y: -0.6 }, C.eye, ZH, 0.9); px({ ...f, y: 0.6 }, C.eye, ZH, 0.9); }
    if (helm) {                                        // Vrask's helmet: a violet-black dome with a lime visor slit
      dot({ ...J.head, z: J.head.z + 0.8 }, d.headR * k + 0.4, ['#5A3A8A', '#3B1A68', '#1E0E36'], Z.helmet, 0.35, 0.6);
      if (front) seg({ x: J.head.x + d.headR, y: -0.9, z: J.head.z }, { x: J.head.x + d.headR, y: 0.9, z: J.head.z }, 1, [C.eye, C.core, C.core], Z.helmet, 0.95);
    }
  }
  if (gear.includes('crest')) seg({ ...J.head, z: J.head.z + d.headR }, { ...J.head, x: J.head.x - 1, z: J.head.z + d.headR + 1.4 }, 1, C.plate, ZH, 0.3);
  // muzzle flash on the first 'fire' frame
  const extra = [];
  if (opt.flash && tip) { const P = toW(tip); extra.push({ w: P, flash: true }); }
  return { prims, fx, fy, extra };
}

/** The Sniffer: a low, four-legged hunting beast (chitin, violet spine plates, four lime eyes). */
function sniffer(d, s, facing) {
  const C = d.col;
  const th = rad(facing * 45 - 90), fx = Math.cos(th), fy = Math.sin(th), rxv = -fy, ryv = fx;
  const rollA = s.roll || 0, pz = 3.5;
  const tr = (p) => { let q = rollA ? roll(p, rollA, pz) : p; q = { x: q.x + (s.rootX || 0), y: q.y, z: Math.max(0.3, q.z + (s.rootZ || 0)) }; return { X: q.x * fx + q.y * rxv, Y: q.x * fy + q.y * ryv, z: q.z }; };
  const prims = [];
  const seg = (a, b, w, ramp, zone, bias = 0) => { const A = tr(a), B = tr(b); prims.push({ kind: 'seg', A, B, w, ramp, zone, depth: (A.Y + B.Y) / 2 + bias }); };
  const dot = (p, r, ramp, zone, bias = 0) => { const P = tr(p); prims.push({ kind: 'dot', P, r, ramp, zone, depth: P.Y + bias }); };
  const px = (p, col, zone, bias = 0.5) => { const P = tr(p); prims.push({ kind: 'px', P, col, zone, depth: P.Y + bias }); };
  const ph = s.walk, run = s.run, ZB = Z.body;
  const bodyZ = 4 + (ph != null ? Math.abs(Math.sin(ph * Math.PI * 2)) * 0.4 : 0) - (s.low || 0);
  // legs first (four-beat gait), then body, spine plates, tail, head
  for (const [lx, ly, off] of [[2.2, -1.3, 0], [2.2, 1.3, 0.5], [-2.2, -1.3, 0.5], [-2.2, 1.3, 0]]) {
    const a = ph == null ? 0 : (ph + off) * Math.PI * 2;
    const footX = lx + (ph == null ? 0 : Math.cos(a) * (run ? 1.8 : 1.2)), lift = ph == null ? 0 : Math.max(0, Math.sin(a)) * 0.9;
    const top = { x: lx, y: ly, z: bodyZ - 0.6 }, foot = { x: footX, y: ly * 1.1, z: lift };
    const knee = { x: (lx + footX) / 2 + (lx > 0 ? -0.6 : 0.6), y: ly * 1.05, z: (bodyZ + lift) / 2 + 0.4 };
    seg(top, knee, 2, C.legs, ZB); seg(knee, foot, 1, C.legs, ZB); px(knee, C.plate[1], ZB);
  }
  seg({ x: -3, y: 0, z: bodyZ + 0.2 }, { x: 3, y: 0, z: bodyZ + 0.4 }, 4, C.vest, ZB);
  for (let i = 0; i < 4; i++) px({ x: -1.8 + i * 1.3, y: 0, z: bodyZ + 2.2 }, C.plate[i & 1], ZB, 0.6);
  seg({ x: -3, y: 0, z: bodyZ + 0.4 }, { x: -5, y: 0, z: bodyZ + 1.8 }, 1, C.vest, ZB);
  const head = { x: 4.6, y: 0, z: bodyZ - 0.2 };
  dot(head, 1.7, C.helmet, Z.head, 0.3);
  if (fy > -0.35) for (const [ey, ez] of [[-0.6, 0.3], [0.6, 0.3], [-0.9, -0.3], [0.9, -0.3]]) px({ x: head.x + 1.4, y: ey, z: head.z + ez }, C.eye, Z.head, 0.9);
  return { prims, fx, fy, extra: [] };
}

// ------------------------------------------------------------------ poses → frames
const STAND = { W: 40, H: 40, AX: 20, AY: 32 };
const LIE = { W: 72, H: 52, AX: 36, AY: 40 };
const BLOOD = ['#5BD13A', '#2E7A1C', '#B8F27A'];          // slime — never red (SPEC §2)

/** State of a humanoid death at t ∈ [0, 1]. */
function deathState(d, kind, t) {
  const k = d.scale || 1;
  if (kind === 'takedown') {
    // grabbed from behind: arches back, hands at the throat · sags, knees go · slumps forward from the knees · face down
    const kn = t < 0.2 ? 0 : ease((t - 0.2) / 0.25);
    const fwd = t < 0.45 ? 0 : ease((t - 0.45) / 0.35);
    return { pitch: rad(t < 0.2 ? -8 * Math.sin((t / 0.2) * Math.PI) : fwd * 88), pitchKnees: t >= 0.2, kneel: kn, arms: t < 0.3 ? 'up' : 'limp', armT: fwd * 0.8, dropGun: t > 0.15, lean: 0, rootZ: t > 0.8 && t < 0.9 ? 0.6 : 0 };
  }
  if (kind === 'explosion') {
    // thrown up and back, tumbling about the middle, lands at .7, bounces, settles
    const air = Math.min(1, t / 0.7), hz = d.hipZ * k;
    const z = t < 0.7 ? Math.sin(air * Math.PI) * 11 : t < 0.85 ? Math.sin(((t - 0.7) / 0.15) * Math.PI) * 2 : 0;
    return { pitch: -rad(t < 0.7 ? air * 330 : lerp(330, 270, Math.min(1, (t - 0.7) / 0.2))), pivotX: 0, pivotZ: hz, rootX: -lerp(0, 9, ease(t / 0.85)), rootZ: z - (t >= 0.7 ? hz - 1.4 : lerp(0, hz - 1.4, air)), arms: t < 0.85 ? 'fling' : 'limp', armT: Math.abs(Math.sin(t * 9)), dropGun: true, lean: 0 };
  }
  // shot: snaps back, arms fling, rifle flies · staggers back, knees buckle · topples backwards (accelerating) ·
  // hits the ground and bounces · settles
  const fall = t < 0.42 ? 0 : t < 0.75 ? ease((t - 0.42) / 0.33) ** 1.4 : 1;
  const bounce = t > 0.75 && t < 0.9 ? Math.sin(((t - 0.75) / 0.15) * Math.PI) * 1.4 : 0;
  return {
    pitch: -rad(lerp(t < 0.18 ? lerp(0, 20, ease(t / 0.18)) : lerp(20, 34, Math.min(1, (t - 0.18) / 0.24)), 90, fall)),
    rootX: -lerp(0, 3.2, ease(t / 0.42)), rootZ: bounce, kneel: t < 0.12 ? 0 : Math.min(0.7, (t - 0.12) * 2.2) * (1 - fall * 0.7),
    arms: t < 0.75 ? 'fling' : 'limp', armT: t < 0.75 ? Math.min(1.4, t * 5) : Math.min(1, (t - 0.75) * 4), dropGun: true, lean: 0,
  };
}

/** Blood of a death at t (screen offsets from the anchor): droplets flying back out of the wound, then splats. */
function deathBlood(d, kind, t, fx, fy) {
  if (kind === 'takedown') return [];
  let s = 5; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const n = kind === 'shot' ? 32 : 16, out = [], k = d.scale || 1;
  const tt = t * 1.1;
  const chestZ = (kind === 'shot' ? d.chestZ - 1 : d.hipZ + 2) * k;
  for (let i = 0; i < n; i++) {
    const vx = -(16 + rnd() * 40), vy = (rnd() - 0.5) * 26, vz = 10 + rnd() * 34, t0 = rnd() * 0.16, col = BLOOD[Math.floor(rnd() * 3)], sz = rnd() < 0.35 ? 2 : 1;
    const q = tt - t0; if (q < 0) continue;
    const tl = (2 * vz) / 90, qq = Math.min(q, tl);
    const X = vx * qq, Y = vy * qq, Zh = vz * qq - 45 * qq * qq;
    const wx = (X + 1) * fx - Y * fy, wy = (X + 1) * fy + Y * fx;
    const landed = q >= tl;
    out.push({ x: wx, y: wy * 0.5 - (landed ? 0 : Zh + chestZ * (1 - qq / tl)), col, w: landed ? 2 : sz, h: landed ? 1 : sz });
  }
  // the hit: a puff of slime mist at the wound
  if (kind === 'shot' && t < 0.25) {
    const R = 1 + t * 10, cy = -fy * 0.5 - (d.chestZ - 1) * k, cx = -fx;
    for (let yy = -Math.ceil(R); yy <= Math.ceil(R); yy++) for (let xx = -Math.ceil(R); xx <= Math.ceil(R); xx++) {
      const dd = Math.hypot(xx, yy) / R; if (dd > 1 || (((xx + yy) & 1) && dd > 0.5)) continue;
      out.push({ x: cx + xx, y: cy + yy, col: dd < 0.45 ? BLOOD[2] : BLOOD[0] });
    }
  }
  return out;
}

/**
 * Render one frame of `type` in `pose` facing `dir` (0 = N … 7 = NW). variant: 'nohelm' (Vrask without his
 * helmet) and/or 'dk-shot' | 'dk-takedown' | 'dk-explosion' (how a dead unit died), '|'-separated.
 */
export function renderRts(type, pose, dir, frame = 0, variant = '') {
  const d = RTS[type] || RTS.husk;
  const v = String(variant || '');
  const nohelm = v.includes('nohelm');
  const dk = (v.match(/dk-(\w+)/) || [])[1] || 'shot';
  const armsIdle = d.weapon === 'none' ? 'swing' : d.weapon === 'launcher' ? 'shoulder' : 'hold';
  let st = {}, fr = STAND, extraW = [], char = 0;
  const n6 = (f) => (f % 6) / 6;
  switch (pose) {
    case 'walk': st = { walk: n6(frame), arms: armsIdle }; break;
    case 'run': st = { walk: n6(frame), run: true, arms: armsIdle }; break;
    case 'pistol': st = { walk: n6(frame), arms: 'pistol', weapon: 'pistol' }; break;
    case 'crouch': st = { kneel: 0.55, kneelSplit: true, arms: d.weapon === 'none' ? 'limp' : d.weapon === 'launcher' ? 'shoulder' : 'aim', lean: 0.3 }; break;
    case 'cover': st = { kneel: 0.7, kneelSplit: true, arms: d.weapon === 'none' ? 'limp' : 'hold', lean: -0.2 }; break;
    case 'fire': st = { kneel: d.beast ? 0 : 0.55, kneelSplit: true, arms: d.weapon === 'launcher' ? 'shoulder' : 'aim', lean: 0.3 }; break;
    case 'prone': st = { pitch: rad(88), pivotX: 0, pivotZ: 0, arms: 'prone', lean: 0, rootX: -d.headZ * 0.15 }; fr = LIE; break;
    case 'crawl': st = { pitch: rad(88), pivotX: 0, pivotZ: 0, arms: 'prone', lean: 0, rootX: -d.headZ * 0.15, crawl: (frame & 3) * (Math.PI / 2), walk: ((frame & 3) / 4) * 0.35 }; fr = LIE; break;
    case 'dead': {
      const t = Math.min(1, frame / 11);
      st = d.beast ? { roll: rad(lerp(0, 90, ease(t / 0.6))), rootX: -lerp(0, 2, ease(t / 0.4)), low: lerp(0, 2.4, ease(t / 0.6)) } : deathState(d, dk, t);
      fr = LIE;
      if (dk === 'explosion') char = Math.min(0.55, t * 0.9);
      break;
    }
    default: st = { arms: armsIdle };
  }
  const built = d.beast ? sniffer(d, st, dir) : humanoid(type, d, st, dir, { nohelm, flash: pose === 'fire' && (frame & 1) === 0 });
  const { prims, fx, fy } = built;
  // extras (screen space): muzzle flash, blood
  const extra = [];
  for (const e of built.extra || []) if (e.flash) {
    const X = fr.AX + e.w.X, Y = fr.AY + e.w.Y * 0.5 - e.w.z;
    extra.push({ x: X, y: Y - 1, col: '#FFF1A8', w: 2, h: 2 }, { x: X + Math.sign(fx || 1), y: Y - 1, col: '#FFC24A' }, { x: X, y: Y - 2, col: '#FFC24A' });
  }
  if (pose === 'dead') for (const b of deathBlood(d, d.beast ? 'shot' : dk, Math.min(1, frame / 11), fx, fy)) extra.push({ ...b, x: fr.AX + b.x, y: fr.AY + b.y });
  const r = raster(prims, fr, fx, fy, extra);
  if (char) r.px = r.px.map((c) => (c ? mixc(c, '#1A120C', char) : c));
  return r;
}

/** Canvas from a colour array (lazily, so the frames and their hit zones also work headless). */
function canvasOf(px, w, h, alpha = 255, only = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const col = only ? (only[i] ? '#000000' : null) : px[i];
    if (!col) continue;
    const [r, gg, b] = hex(col);
    img.data.set([r, gg, b, alpha], i * 4);
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Map-sprite painter for the sprite cache: canvas + hit-zone map + ground shadow. */
function painter(type) {
  return (pose, dir, frame, variant) => {
    const r = renderRts(type, pose, dir, frame, variant);
    return {
      get canvas() { return this._c || (this._c = canvasOf(r.px, r.w, r.h)); }, _c: null,
      ax: r.ax, ay: r.ay, w: r.w, h: r.h, zoneMap: r.zone, top: r.top,
      // the figure's own shadow (drawn under it by the unit renderer instead of the generic blob)
      shadow: { get canvas() { return this._c || (this._c = canvasOf(null, r.w, r.h, 90, r.shadow)); }, _c: null, ax: r.ax, ay: r.ay, w: r.w, h: r.h },
    };
  };
}
for (const type of Object.keys(RTS)) Art.registerNewest('unit', type, painter(type));
