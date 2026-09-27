// @ts-check
/**
 * "RTS" infantry rig (art proposal, round 2). Baseline: 1995-era RTS infantry — 8 real facings, 6-frame
 * walks, 10–12-frame deaths, tiny figures (2–3 px head, slim body, a stick of a rifle).
 *
 * A figure is a handful of limbs posed in 3D (x forward, y to its right, z up), turned to one of 8 facings
 * and projected top-down 3/4 (screen y = ground y × 0.5 − height). Every limb is drawn as blocky pixel stamps
 * in a flat 3-tone ramp lit from the top-left, then the whole figure gets a dark self-coloured edge. Because
 * poses are joint angles, walks and deaths are smooth at any frame count and every facing comes for free.
 * The shadow is the same limbs projected onto the ground away from the light, so it starts at the feet.
 */
import { blank, selout, mixc, darken } from './proposal.js';

// ------------------------------------------------------------------ unit definitions
/** 3-tone ramps: [light, mid, dark] */
export const RIG = {
  wren: {
    height: 'wren', helmetStyle: 'wren',
    thigh: 3.1, shin: 3.3, hipZ: 6.5, hipW: 1.5, chestZ: 10.0, shoulderZ: 10.3, shoulderW: 2.6, torsoW: 5, torsoD: 3, headZ: 13.2, headR: 2.0,
    upperArm: 2.6, foreArm: 2.6, kneeDir: 1,
    col: {
      helmet: ['#98AA4E', '#66773A', '#3E4A20'], visor: ['#A8E6FF', '#3C8ACB'], skin: ['#E6AE7E', '#B67E52'],
      vest: ['#D8C682', '#AA985A', '#6E6236'], strap: '#3A74B0', arm: ['#C8B676', '#9A8A50', '#665A30'],
      legs: ['#707E3C', '#505B29', '#343B1A'], boot: ['#4E4230', '#2A2219'], gun: ['#7A838A', '#2A2E31'],
    },
  },
  husk: {
    thigh: 4.6, shin: 5.0, hipZ: 9.2, hipW: 1.6, chestZ: 13.8, shoulderZ: 14.2, shoulderW: 3.0, torsoW: 4, torsoD: 3, headZ: 17.2, headR: 1.7, headLong: 1.2,
    upperArm: 3.8, foreArm: 3.6, kneeDir: -1,          // NOT knees bend backwards
    col: {
      helmet: ['#6C747E', '#474D55', '#2A2E33'], eye: '#F0FFA8', core: '#AEEB38', knee: '#AEEB38',
      vest: ['#666E78', '#40464E', '#23262B'], plate: ['#A26DEE', '#6A33B3', '#3B1A68'], arm: ['#4E545C', '#33373D', '#1C1F23'],
      legs: ['#626A74', '#3A3F46', '#1E2125'], boot: ['#4E545C', '#1C1F23'], gun: ['#6A7278', '#24282B'], glow: '#C6FF5A',
    },
  },
};
RIG.warden = { ...RIG.husk, col: { ...RIG.husk.col }, crest: true, radio: true, cape: true };
RIG.lobber = { ...RIG.husk, col: { ...RIG.husk.col }, belt: true };

// ------------------------------------------------------------------ small vector helpers
const rad = (d) => (d * Math.PI) / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
/** rotate (x, z) about (px, pz) by `a` radians (positive = tips forward) */
function pitch(p, a, px = 0, pz = 0) {
  const x = p.x - px, z = p.z - pz, c = Math.cos(a), s = Math.sin(a);
  return { x: px + x * c + z * s, y: p.y, z: pz - x * s + z * c };
}
/** 2-bone limb from `a` toward `target` in the x-z plane (y interpolated); bend > 0 pushes the joint forward */
function ik(a, t, l1, l2, bend) {
  const dx = t.x - a.x, dz = t.z - a.z, d = Math.min(l1 + l2 - 0.01, Math.hypot(dx, dz));
  const base = Math.atan2(dz, dx), cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const ang = base + bend * Math.acos(Math.max(-1, Math.min(1, cosA)));
  const j = { x: a.x + Math.cos(ang) * l1, y: (a.y + t.y) / 2, z: a.z + Math.sin(ang) * l1 };
  const e = { x: a.x + (dx / Math.hypot(dx, dz || 1e-6)) * d, y: t.y, z: a.z + (dz / Math.hypot(dx, dz || 1e-6)) * d };
  return [j, e];
}

// ------------------------------------------------------------------ poses
/**
 * Joint positions for a pose.
 * @param {any} d  unit def
 * @param {{walk?: number, run?: boolean, pitch?: number, pivotZ?: number, rootX?: number, rootZ?: number,
 *   kneel?: number, arms?: 'hold'|'fling'|'limp'|'up', armT?: number, dropGun?: boolean, lean?: number}} s
 */
export function pose(d, s = {}) {
  const J = {};
  const ph = s.walk ?? null;
  const stride = s.run ? 2.6 : 1.9;
  const hipDrop = (s.kneel || 0) * (d.thigh * 0.95);
  let bob = 0;
  // feet: a 6-frame gait (contact → down → passing → up), opposite legs half a cycle apart
  const foot = (side, phase) => {
    if (phase == null) return { x: 0.2, y: side * (d.hipW + 0.1), z: 0 };
    const a = phase * Math.PI * 2;
    const x = Math.cos(a) * stride;
    const lift = Math.max(0, Math.sin(a)) * (s.run ? 1.6 : 1.1);
    return { x, y: side * (d.hipW + 0.1), z: lift };
  };
  if (ph != null) bob = -Math.abs(Math.cos(ph * Math.PI * 2)) * 0.5 + 0.25;
  const hipZ = d.hipZ - hipDrop + bob;
  J.hipL = { x: 0, y: -d.hipW, z: hipZ }; J.hipR = { x: 0, y: d.hipW, z: hipZ };
  J.footL = foot(-1, ph); J.footR = foot(1, ph == null ? null : ph + 0.5);
  if (s.kneel) {                                       // on his knees: shins flat on the ground behind him
    const k = s.kneel;
    J.footL = { x: lerp(J.footL.x, -d.shin * 0.9, k), y: J.footL.y, z: lerp(J.footL.z, 0, k) };
    J.footR = { x: lerp(J.footR.x, -d.shin * 0.8, k), y: J.footR.y, z: lerp(J.footR.z, 0, k) };
  }
  const bend = d.kneeDir > 0 ? 1 : -1;
  [J.kneeL, J.footL] = ik(J.hipL, J.footL, d.thigh, d.shin, bend);
  [J.kneeR, J.footR] = ik(J.hipR, J.footR, d.thigh, d.shin, bend);
  const lean = s.lean ?? (s.run ? 0.8 : ph != null ? 0.35 : 0);
  J.pelvis = { x: 0, y: 0, z: hipZ + 0.6 };
  J.chest = { x: lean, y: 0, z: hipZ + (d.chestZ - d.hipZ) };
  J.shL = { x: lean, y: -d.shoulderW, z: hipZ + (d.shoulderZ - d.hipZ) }; J.shR = { x: lean, y: d.shoulderW, z: J.shL.z };
  J.head = { x: lean * 1.2 + 0.2, y: 0, z: hipZ + (d.headZ - d.hipZ) };
  // arms
  const arms = s.arms || 'hold', at = s.armT ?? 0;
  const swing = ph != null ? Math.cos(ph * Math.PI * 2) * 0.4 : 0;
  if (arms === 'hold') {                               // rifle carried at the hip, pointing ahead
    J.handR = { x: lean + 1.4 + swing * 0.3, y: d.shoulderW * 0.5, z: J.shR.z - 3.2 };
    J.handL = { x: lean + 3.4 + swing * 0.3, y: -0.2, z: J.shR.z - 2.6 };
  } else if (arms === 'fling') {                       // thrown up and back by a hit
    J.handR = { x: lean - 1 - at * 2, y: d.shoulderW + 1, z: J.shR.z + 1 + at * 2 };
    J.handL = { x: lean - 0.5 - at * 1.5, y: -d.shoulderW - 1, z: J.shL.z + 1.5 + at * 1.5 };
  } else if (arms === 'up') {                          // grabbed from behind: hands up to the throat
    J.handR = { x: lean + 1, y: 0.6, z: J.head.z - 1.5 }; J.handL = { x: lean + 1, y: -0.6, z: J.head.z - 1.4 };
  } else {                                             // limp: hanging / sprawled
    J.handR = { x: lean + 0.6 + at, y: d.shoulderW + 0.8 + at, z: J.shR.z - d.upperArm - d.foreArm + 0.8 };
    J.handL = { x: lean - 0.4 - at, y: -d.shoulderW - 0.8 - at * 0.5, z: J.shL.z - d.upperArm - d.foreArm + 0.8 };
  }
  [J.elbR, J.handR] = ik(J.shR, J.handR, d.upperArm, d.foreArm, -1);
  [J.elbL, J.handL] = ik(J.shL, J.handL, d.upperArm, d.foreArm, -1);
  J.gun = s.dropGun ? null : arms === 'hold' ? [{ x: J.handR.x - 1.8, y: J.handR.y * 0.6, z: J.handR.z - 0.2 }, { x: J.handL.x + 2.4, y: J.handL.y * 0.6, z: J.handL.z + 0.2 }] : null;
  // whole-body pitch about a pivot (falls) — or, kneeling, only the body above the knees about the knees
  // (the shins stay on the ground) — then the root offset (stagger, tumble, bounce)
  if (s.pitch) {
    const fromKnees = !!s.pitchKnees;
    const px0 = fromKnees ? (J.kneeL.x + J.kneeR.x) / 2 : s.pivotX || 0, pz0 = fromKnees ? (J.kneeL.z + J.kneeR.z) / 2 : s.pivotZ || 0;
    for (const k of Object.keys(J)) {
      if (!J[k] || k === 'gun' || (fromKnees && (k.startsWith('foot') || k.startsWith('knee')))) continue;
      J[k] = pitch(J[k], s.pitch, px0, pz0);
    }
    if (J.gun) J.gun = J.gun.map((p) => pitch(p, s.pitch, px0, pz0));
  }
  const rx = s.rootX || 0, rz = s.rootZ || 0;
  for (const k of Object.keys(J)) {
    if (!J[k]) continue;
    const move = (p) => ({ x: p.x + rx, y: p.y, z: Math.max(k.startsWith('foot') || k.startsWith('knee') ? -0.2 : 0.4, p.z + rz) });
    J[k] = k === 'gun' ? J[k].map(move) : move(J[k]);
  }
  return J;
}

// ------------------------------------------------------------------ rendering
const W = 40, H = 36, AX = 20, AY = 30;                 // canvas and ground anchor
const LIGHT = { x: -0.55, y: -0.6 };                     // light from the top-left: shadows fall down-right

/**
 * Render a figure. `facing` 0..7 (0 = N, 2 = E, 4 = S …) or any angle in degrees via facingDeg.
 * @returns {{img: any, shadow: any, ax: number, ay: number}}
 */
export function render(type, s = {}, facing = 4, opt = {}) {
  const d = RIG[type], C = d.col;
  const J = pose(d, s);
  const th = rad((facing * 45) - 90);                   // screen angle of "forward"
  const fx = Math.cos(th), fy = Math.sin(th);           // forward on the ground (y = south)
  const rxv = -fy, ryv = fx;                             // the unit's right
  const toW = (p) => ({ X: p.x * fx + p.y * rxv, Y: p.x * fy + p.y * ryv, z: p.z });
  const scr = (w) => ({ sx: AX + w.X, sy: AY + w.Y * 0.5 - w.z });
  const prims = [];
  const seg = (a, b, w, ramp, depthBias = 0) => { if (!a || !b) return; const A = toW(a), B = toW(b); prims.push({ kind: 'seg', A, B, w, ramp, depth: (A.Y + B.Y) / 2 + depthBias }); };
  const dot = (p, r, ramp, depthBias = 0, long = 0) => { const P = toW(p); prims.push({ kind: 'dot', P, r, ramp, long, depth: P.Y + depthBias }); };
  const px = (p, col, depthBias = 0.5) => { const P = toW(p); prims.push({ kind: 'px', P, col, depth: P.Y + depthBias }); };

  // legs, arms, torso, head (+ gear)
  seg(J.hipL, J.kneeL, 2, C.legs); seg(J.kneeL, J.footL, 2, C.legs); dot(J.footL, 0.6, C.boot, 0.1);
  seg(J.hipR, J.kneeR, 2, C.legs); seg(J.kneeR, J.footR, 2, C.legs); dot(J.footR, 0.6, C.boot, 0.1);
  if (C.knee) { px(J.kneeL, C.knee); px(J.kneeR, C.knee); }
  // the torso is wide seen from the front or back, narrow side-on
  seg(J.pelvis, J.chest, Math.round(lerp(d.torsoD || d.torsoW, d.torsoW, Math.abs(fy))), C.vest);
  seg(J.shL, J.shR, 2, C.plate || C.vest, 0.05);
  if (C.plate) { dot(J.shL, 0.9, C.plate, 0.1); dot(J.shR, 0.9, C.plate, 0.1); }
  if (C.strap) { const m = { x: (J.shL.x + J.pelvis.x) / 2, y: 0, z: (J.shL.z + J.pelvis.z) / 2 }; seg(J.shR, m, 1, [C.strap, C.strap, C.strap], 0.3); }
  if (C.core) px({ x: J.chest.x + 0.6, y: 0, z: J.chest.z - 1 }, C.core, 0.6);
  if (d.belt) { dot({ x: J.pelvis.x + 0.5, y: -1, z: J.pelvis.z - 0.4 }, 0.5, ['#FFE07A', '#F09A2A', '#8A4A12'], 0.6); dot({ x: J.pelvis.x + 0.5, y: 1, z: J.pelvis.z - 0.4 }, 0.5, ['#FFE07A', '#F09A2A', '#8A4A12'], 0.6); }
  if (d.cape) seg({ x: J.chest.x - 1, y: 0, z: J.chest.z }, { x: J.pelvis.x - 1.4, y: 0, z: J.pelvis.z - 2.5 }, 3, C.plate, -0.6);
  seg(J.shL, J.elbL, 1, C.arm); seg(J.elbL, J.handL, 1, C.arm);
  seg(J.shR, J.elbR, 1, C.arm); seg(J.elbR, J.handR, 1, C.arm);
  if (J.gun) seg(J.gun[0], J.gun[1], 1, [C.gun[0], C.gun[1], C.gun[1]], 0.4);
  // head: WREN's Classic helmet (flat dome, brim, visor band) or a disc; then the face on the front half
  const front = fy > -0.35;                              // facing the viewer or sideways
  if (d.helmetStyle === 'wren') { const P = toW(J.head); prims.push({ kind: 'helmet', P, front, fx, ramp: C.helmet, depth: P.Y + 0.2 }); }
  else dot(J.head, d.headR, C.helmet, 0.2, d.headLong || 0);
  if (front && d.helmetStyle !== 'wren') {
    const f = { x: J.head.x + d.headR * 0.8, y: 0, z: J.head.z - 0.3 };
    if (C.visor) { seg({ ...f, y: -0.9 }, { ...f, y: 0.9 }, 1, [C.visor[0], C.visor[0], C.visor[1]], 0.9); px({ ...f, z: f.z - 1.1 }, C.skin[0], 0.9); }
    if (C.eye) { px({ ...f, y: -0.6 }, C.eye, 0.9); px({ ...f, y: 0.6 }, C.eye, 0.9); }
  }
  if (d.crest) seg({ ...J.head, z: J.head.z + d.headR }, { ...J.head, x: J.head.x - 1, z: J.head.z + d.headR + 1.4 }, 1, C.plate, 0.3);
  if (d.radio) { seg({ x: J.chest.x - 1.2, y: 1, z: J.chest.z }, { x: J.chest.x - 1.4, y: 1.2, z: J.chest.z + 5 }, 1, C.gun, -0.4); px({ x: J.chest.x - 1.4, y: 1.2, z: J.chest.z + 5.4 }, C.glow, -0.3); }

  // painter's order: far (north) first
  prims.sort((a, b) => a.depth - b.depth);
  const img = blank(W, H);
  const zb = new Float32Array(W * H).fill(-Infinity);   // depth of the part that owns each pixel
  let curDepth = 0, edging = false;
  const put = (x, y, c) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (edging) { if (zb[i] > curDepth - 0.6) return; img.px[i] = c; return; }   // edges only over empty ground or parts well behind
    img.px[i] = c; zb[i] = curDepth;
  };
  const tone = (ramp, u, v) => ramp[Math.min(ramp.length - 1, u + v < -0.35 ? 0 : u + v > 0.45 ? 2 : 1)];   // top-left light
  // each limb first leaves a dark edge one pixel down-right of itself: arms read against the torso, the
  // near leg against the far one (the 1990s way of separating parts on tiny sprites)
  const edgeOf = (ramp) => mixc(darken(ramp[ramp.length - 1], 0.55), '#0B0C0A', 0.3);
  const drawPrim = (p, dx, dy, solid) => {
    const col = (c) => solid || c;
    if (p.kind === 'px') { if (solid) return; const s0 = scr(p.P); put(s0.sx + dx, s0.sy + dy, p.col); return; }
    if (p.kind === 'helmet') {
      // 5 wide: a 3-px dome, the helmet body, the brim; below it the visor band and the face (or the neck)
      const s0 = scr(p.P), X = Math.round(s0.sx), Y = Math.round(s0.sy);
      const H = C.helmet, side = Math.round(p.fx * 1.2);            // the visor slides to the side he faces
      const rows = [
        [[-1, H[0]], [0, H[0]], [1, H[1]]],
        [[-2, H[0]], [-1, H[0]], [0, H[1]], [1, H[1]], [2, H[2]]],
        [[-2, H[1]], [-1, H[1]], [0, H[1]], [1, H[2]], [2, H[2]]],
      ];
      rows.forEach((r, j) => r.forEach(([xx, c]) => put(X + xx + dx, Y - 2 + j + dy, col(c))));
      if (solid) return;
      if (p.front) {
        for (const xx of [-1, 0, 1]) put(X + xx + side, Y + 1, xx === -1 + side * 0 ? C.visor[0] : C.visor[xx < 1 ? 0 : 1]);
        put(X + side, Y + 2, C.skin[0]); put(X + side + 1, Y + 2, C.skin[1]);
      } else { for (const xx of [-1, 0, 1]) put(X + xx, Y + 1, H[2]); put(X, Y + 2, C.skin[1]); }
      return;
    }
    if (p.kind === 'dot') {
      const s0 = scr(p.P), r = p.r, L = p.long;
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
    curDepth = p.depth;
    const thick = p.kind === 'dot' || p.kind === 'helmet' || (p.kind === 'seg' && p.w >= 2);
    if (thick) { edging = true; drawPrim(p, 1, 1, edgeOf(p.ramp)); edging = false; }
    drawPrim(p, 0, 0, null);
  }
  // shadow: every figure pixel dropped to the ground along the light (height → offset down-right)
  const shadow = blank(W, H);
  for (const p of prims) {
    const pts = p.kind === 'seg' ? [p.A, p.B, { X: (p.A.X + p.B.X) / 2, Y: (p.A.Y + p.B.Y) / 2, z: (p.A.z + p.B.z) / 2 }] : [p.P];
    for (const q of pts) {
      const gx = AX + q.X - LIGHT.x * q.z * 0.55, gy = AY + (q.Y - LIGHT.y * q.z * 0.55) * 0.5;
      const r = p.kind === 'seg' ? Math.max(1, p.w - 0.5) : 1.4;
      for (let yy = -1; yy <= 0; yy++) for (let xx = -Math.floor(r / 2); xx <= Math.ceil(r / 2); xx++) {
        const X = Math.round(gx + xx), Y = Math.round(gy + yy);
        if (X >= 0 && Y >= 0 && X < W && Y < H) shadow.px[Y * W + X] = '#000000';
      }
    }
  }
  // fill the shadow's gaps between sampled points along each limb
  for (let y = 0; y < H; y++) for (let x = 1; x < W - 1; x++) if (!shadow.px[y * W + x] && shadow.px[y * W + x - 1] && shadow.px[y * W + x + 1]) shadow.px[y * W + x] = '#000000';
  let out = selout(img, 0.34);
  if (opt.char) out = { ...out, px: out.px.map((c) => (c ? mixc(c, '#1A120C', opt.char) : c)) };
  return { img: out, shadow, ax: AX + 1, ay: AY + 1, sax: AX, say: AY };
}

// ------------------------------------------------------------------ animations
/** 6-frame walk (or run) cycle */
export const walk = (type, facing, frame, run = false) => render(type, { walk: frame / 6, run }, facing);
export const idle = (type, facing) => render(type, {}, facing);

/**
 * Deaths, 12 frames each, as [{state, fx}] where fx lists blood droplets/splats for that frame.
 * @param {'shot'|'takedown'|'explosion'} kind
 */
export function death(type, kind, facing = 2) {
  const d = RIG[type];
  const N = 12, frames = [];
  const bloodCols = ['#5BD13A', '#2E7A1C', '#B8F27A'];     // slime — never red (SPEC §2)
  // blood: droplets fly back out of the exit wound on arcs, splat where they land, then a pool spreads
  let s = 5; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const drops = kind === 'takedown' ? [] : Array.from({ length: kind === 'shot' ? 32 : 16 }, () => ({
    vx: -(16 + rnd() * 40), vy: (rnd() - 0.5) * 26, vz: 10 + rnd() * 34, t0: rnd() * 0.16, col: bloodCols[Math.floor(rnd() * 3)],
    sz: rnd() < 0.35 ? 2 : 1,
  }));
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    let st;
    if (kind === 'shot') {
      // 0–.18 hit: snaps back, arms fling, rifle flies · .18–.42 staggers back, knees buckle ·
      // .42–.75 topples backwards (accelerating) · .75–.85 hits the ground, bounces · .85–1 settles
      const fall = t < 0.42 ? 0 : t < 0.75 ? ease((t - 0.42) / 0.33) ** 1.4 : 1;
      const bounce = t > 0.75 && t < 0.9 ? Math.sin(((t - 0.75) / 0.15) * Math.PI) * 1.4 : 0;
      st = {
        pitch: -rad(lerp(t < 0.18 ? lerp(0, 20, ease(t / 0.18)) : lerp(20, 34, Math.min(1, (t - 0.18) / 0.24)), 90, fall)),
        rootX: -lerp(0, 3.2, ease(Math.min(1, t / 0.42))), rootZ: bounce, kneel: t < 0.12 ? 0 : Math.min(0.7, (t - 0.12) * 2.2) * (1 - fall * 0.7),
        arms: t < 0.75 ? 'fling' : 'limp', armT: t < 0.75 ? Math.min(1.4, t * 5) : Math.min(1, (t - 0.75) * 4), dropGun: true, lean: 0,
      };
    } else if (kind === 'takedown') {
      // 0–.2 grabbed: jerks upright, hands to the throat · .2–.45 sags, knees go · .45–.8 slumps forward
      // from the knees · .8–1 face down, settles
      const kn = t < 0.2 ? 0 : Math.min(1, ease((t - 0.2) / 0.25));
      const fwd = t < 0.45 ? 0 : ease(Math.min(1, (t - 0.45) / 0.35));
      st = {
        pitch: rad(t < 0.2 ? -8 * Math.sin((t / 0.2) * Math.PI) : fwd * 88), pitchKnees: t >= 0.2,
        kneel: kn, arms: t < 0.3 ? 'up' : 'limp', armT: fwd * 0.8, dropGun: t > 0.15, lean: 0, rootZ: t > 0.8 && t < 0.9 ? 0.6 : 0,
      };
    } else {
      // blast: thrown up and back, tumbling about the middle, lands at .7, bounces, settles charred
      const air = Math.min(1, t / 0.7);
      const z = t < 0.7 ? Math.sin(air * Math.PI) * 11 : t < 0.85 ? Math.sin(((t - 0.7) / 0.15) * Math.PI) * 2 : 0;
      st = {
        pitch: -rad(t < 0.7 ? air * 330 : lerp(330, 270, Math.min(1, (t - 0.7) / 0.2))) , pivotX: 0, pivotZ: d.hipZ,
        rootX: -lerp(0, 9, ease(Math.min(1, t / 0.85))), rootZ: z - (t >= 0.7 ? d.hipZ - 1.4 : lerp(0, d.hipZ - 1.4, air)),
        arms: t < 0.85 ? 'fling' : 'limp', armT: Math.abs(Math.sin(t * 9)), dropGun: true, lean: 0,
      };
    }
    const r = render(type, st, facing, { char: kind === 'explosion' ? Math.min(0.55, t * 0.9) : 0 });
    // blood for this frame (screen space, relative to the ground anchor)
    const th = rad(facing * 45 - 90), fx = Math.cos(th), fy = Math.sin(th);
    const fxList = [];
    const tt = t * 1.1;                                  // the animation is ~1.1 s long
    for (const q of drops) {
      const k = tt - q.t0; if (k < 0) continue;
      const tl = (2 * q.vz) / 90;                          // time of flight (g = 90 px/s²)
      const kk = Math.min(k, tl);
      const X = q.vx * kk, Y = q.vy * kk, Z = q.vz * kk - 45 * kk * kk;
      // droplet position relative to the chest at the moment of the hit, in the unit's frame → screen
      const wx = (X + 1) * fx - Y * fy, wy = (X + 1) * fy + Y * fx;
      const chestZ = kind === 'shot' ? d.chestZ - 1 : d.hipZ + 2;
      fxList.push({ x: wx, y: wy * 0.5 - (k < tl ? Z + chestZ * (1 - kk / tl) : 0), col: q.col, sz: k < tl ? q.sz : 2, landed: k >= tl });
    }
    // the hit: a puff of slime mist at the wound
    if (kind === 'shot' && t < 0.25) fxList.push({ mist: true, x: -1 * fx, y: -1 * fy * 0.5 - (d.chestZ - 1), r: 1 + t * 10 });
    if (kind !== 'explosion' && t > 0.72) {               // the pool spreads from under his chest
      const g = Math.min(1, (t - 0.72) / 0.28), pr = (kind === 'shot' ? 5 : 2.6) * ease(g);
      const bx = (kind === 'shot' ? -d.chestZ * 0.85 : d.chestZ * 0.75);
      fxList.push({ pool: true, x: bx * fx, y: bx * fy * 0.5, r: pr });
    }
    frames.push({ ...r, fx: fxList });
  }
  return frames;
}
