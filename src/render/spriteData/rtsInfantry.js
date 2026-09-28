// @ts-check
/**
 * Art style "Newest" — infantry ("mini" style, playtest 2 art pass; study page: tools/art-lab/mini.html).
 * Original sprites at the scale and read of a 1995-era RTS rifleman: a ~11 px figure (the NOT a head taller),
 * 1 px limbs, a 2–3 px torso, a stick of a weapon, a dark edge on the shadow side so the figure reads on any
 * ground, and a flat cast shadow trailing from the feet. WREN keeps his Classic head: olive helmet, bright
 * blue visor band, face. Everything is drawn from our own rig (joints → pixels); no reference art is sampled.
 *
 * Frames are 64×48 with the feet at (32, 36); 8 facings (N, NE, E, SE, S, SW, W, NW — none mirrored);
 * walk/run/pistol 6 frames, crawl 4, fire 2, deaths 12 (shot, takedown, explosion — slime droplets baked in,
 * never red). Every pixel records the hit zone of the part that drew it (weapons pass the shot through), so
 * the scope magnifies these very sprites (scopeSprites.zoneAtMap).
 */
import { Art } from '../artStyle.js';
import { Z } from '../model3d.js';
import { BLOOD as BLOODS } from '../../config/palette.js';

export const FW = 64, FH = 48, FAX = 32, FAY = 36;

// ------------------------------------------------------------------ colours
const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mixc = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const rad = (d) => (d * Math.PI) / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// 3-tone ramps [light, mid, dark]; darker than the ground so the tiny figures read on sand and grass
const GOD = {
  shirt: ['#A89454', '#76642F', '#453A1A'], trousers: ['#5E6A2E', '#3F4920', '#252B12'], boot: '#16130D',
  helmet: ['#9AAE48', '#63742E', '#38441A'], visor: ['#8ADCFF', '#2F80C4'], skin: ['#F0B07A', '#B0743E'],
  gun: '#101214', gunTip: '#7A8692', gunStock: '#5A4428', edge: '#15140C',
};
const NOT = {
  shirt: ['#5E666F', '#3C4249', '#22262B'], trousers: ['#4E555D', '#33383E', '#1D2024'], boot: '#101214',
  helmet: ['#737B85', '#4B525A', '#2A2F35'], eye: '#E4FF6A', lime: '#A6F03C', plate: ['#A36BE6', '#7A3FC0', '#4A2478'],
  gun: '#15171A', gunTip: '#A6F03C', gunStock: '#3A3F46', edge: '#0B0C0E', skin: ['#5E666F', '#3C4249'],
};
const ORANGE = ['#FFC24A', '#E8862A', '#8A4A12'];
/** blood by name (the unit's own colour, picked at spawn) — never red (SPEC §2) */
const bloodOf = (name) => { const b = BLOODS.find((q) => q.name === name) || BLOODS[0]; return [b.main, b.shade, b.hi]; };

const HUMAN = { thigh: 2.1, shin: 2.2, hipZ: 4.3, hipW: 1.2, chest: 2.5, head: 1.6, arm: 1.5, fore: 1.5, knee: 1, torso: 3, headKind: 'helmet' };
const LANKY = { thigh: 2.7, shin: 2.9, hipZ: 5.5, hipW: 1.1, chest: 3.0, head: 2.0, arm: 2.0, fore: 1.9, knee: -1, torso: 2, headKind: 'not' };

/** Unit definitions: proportions, colours, weapon, gear. */
export const MINI = {
  operative: { ...HUMAN, col: GOD, weapon: 'rifle', gear: [] },
  pilot: { ...HUMAN, col: { ...GOD, helmet: ['#F2F2EA', '#C8C8C0', '#8A8A84'], visor: ['#5A6E80', '#26323C'], shirt: ['#8C9890', '#646E68', '#3E4842'], trousers: ['#747E78', '#545E58', '#343C38'] }, weapon: 'none', gear: [] },
  scientist: { ...HUMAN, headKind: 'hair', col: { ...GOD, helmet: ['#6A4A30', '#4A3220', '#2E1E12'], shirt: ['#F2F2EA', '#C8C8C0', '#8A8A84'], trousers: ['#7A6E4E', '#5A5038', '#3A3424'] }, weapon: 'none', gear: [] },
  husk: { ...LANKY, col: NOT, weapon: 'rifle', gear: [] },
  lobber: { ...LANKY, col: NOT, weapon: 'grenade', gear: ['belt'] },
  scorcher: { ...LANKY, col: NOT, weapon: 'flamer', gear: ['tank'] },
  launcher: { ...LANKY, col: NOT, weapon: 'launcher', gear: ['pod'] },
  warden: { ...LANKY, col: NOT, weapon: 'smg', gear: ['radio', 'crest'] },
  harvester: { ...LANKY, col: { ...NOT, shirt: ['#8A929C', '#626A74', '#40464E'], trousers: ['#7E8690', '#565E68', '#343940'], helmet: ['#9AA2AC', '#6E7680', '#464C54'] }, weapon: 'none', gear: ['basket'] },
  vrask: { ...LANKY, scale: 1.12, col: NOT, weapon: 'smg', gear: ['helmet', 'cape'] },
  sniffer: { beast: true, col: NOT },
};

// ------------------------------------------------------------------ joints
function pitch(p, a, px, pz) {
  const x = p.x - px, z = p.z - pz, c = Math.cos(a), s = Math.sin(a);
  return { x: px + x * c + z * s, y: p.y, z: pz - x * s + z * c };
}
/** 2-bone limb in the x-z plane: the middle joint; bend > 0 pushes it forward */
function joint(a, t, l1, l2, bend) {
  const dx = t.x - a.x, dz = t.z - a.z, d = Math.max(0.01, Math.min(l1 + l2 - 0.01, Math.hypot(dx, dz)));
  const base = Math.atan2(dz, dx), c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const ang = base + bend * Math.acos(Math.max(-1, Math.min(1, c)));
  return { x: a.x + Math.cos(ang) * l1, y: (a.y + t.y) / 2, z: a.z + Math.sin(ang) * l1 };
}

/**
 * Joint positions for a humanoid pose (shared with the Chibi style, which builds 3D shapes on these joints).
 * s.attach: extra named points fixed to the body ([name, 'head'|'chest'|'pelvis', [x, y, z]] in the unit's
 * frame) that follow it through leans, falls and tumbles — eyes, glasses, back tanks.
 * s: gait 'walk'|'run' + ph (0..1) · kneel (0..1) · arms 'hold'|'aim'|'pistol'|'swing'|'shoulder'|'fling'|'up'|'limp'|'prone'
 * |'custom' (s.hands = {R: [x, y, z], L: [x, y, z]} from the chest — cutscene gestures) · armT · lean
 * · pitch/pivotZ/pitchKnees · rootX/rootZ · crawl (phase) · recoil · sit (seat height: hips there, feet forward)
 */
export function pose(d, s) {
  const k = d.scale || 1, L = (v) => v * k;
  const run = s.gait === 'run', gait = s.gait != null;
  const a = (s.ph || 0) * Math.PI * 2;
  const stride = L(run ? 2.3 : 1.4), kick = L(run ? 2.1 : 1.1);
  // stance (sin q > 0): planted, sliding back under the body · swing (sin q < 0): lifted, the knee drives forward
  const foot = (off, side) => {
    if (!gait) return { x: 0.2, y: side * L(d.hipW + 0.2), z: 0 };
    const q = a + off, sw = Math.sin(q), swing = Math.max(0, -sw);
    return { x: Math.cos(q) * stride - 0.6 * swing * Math.max(0, -Math.cos(q)), y: side * L(d.hipW + 0.2 + Math.max(0, sw) * (run ? 0.5 : 0.25)), z: swing * kick };
  };
  const bob = gait ? Math.abs(Math.cos(a)) * (run ? 0.7 : 0.4) : 0;
  const sway = gait ? Math.sin(a) * (run ? 0.4 : 0.25) : 0;
  const kneel = s.kneel || 0;
  const hipZ = s.sit != null ? L(s.sit) : L(d.hipZ) * (1 - kneel * 0.5) + bob;
  const J = {};
  J.hipL = { x: 0.2, y: sway - L(d.hipW), z: hipZ }; J.hipR = { x: 0.2, y: sway + L(d.hipW), z: hipZ };
  J.footL = foot(0, -1); J.footR = foot(Math.PI, 1);
  if (s.sit != null) { const fx = 0.2 + L(d.thigh) * 0.9; J.footL = { x: fx, y: -L(d.hipW + 0.35), z: 0 }; J.footR = { x: fx + 0.3, y: L(d.hipW + 0.35), z: 0 }; }
  if (kneel) {                                        // one knee down (left shin flat behind), right foot forward
    J.footL = { x: lerp(J.footL.x, -L(d.shin) * 0.9, kneel), y: J.footL.y, z: 0 };
    J.footR = { x: lerp(J.footR.x, L(0.9), kneel), y: J.footR.y, z: 0 };
  }
  J.kneeL = joint(J.hipL, J.footL, L(d.thigh), L(d.shin), d.knee); J.kneeR = joint(J.hipR, J.footR, L(d.thigh), L(d.shin), d.knee);
  const lean = s.lean ?? (run ? 1.6 : gait ? 0.5 : 0);
  J.chest = { x: 0.2 + lean, y: sway * 0.5, z: hipZ + L(d.chest) };
  J.shL = { x: J.chest.x, y: J.chest.y - L(1), z: J.chest.z + 0.2 }; J.shR = { x: J.chest.x, y: J.chest.y + L(1), z: J.chest.z + 0.2 };
  J.head = { x: J.chest.x + (run ? 1.1 : lean * 0.6), y: J.chest.y, z: J.chest.z + L(d.head) };
  const arms = s.arms || 'hold', at = s.armT ?? 0, pump = gait ? Math.sin(a) : 0, rock = gait ? Math.cos(a * 2) * 0.35 : 0;
  const C = J.chest, ua = L(d.arm), fa = L(d.fore);
  const set = (r, l) => { J.handR = r; J.handL = l; };
  if (arms === 'hold') set({ x: C.x + 0.4 + pump * 0.5, y: C.y + 0.7, z: C.z - 1.5 + rock }, { x: C.x + 2.2 + pump * 0.5, y: C.y - 0.2, z: C.z - 1.1 - rock + pump * 0.4 });
  else if (arms === 'aim') set({ x: C.x + 0.5 - (s.recoil || 0), y: C.y + 0.6, z: C.z - 0.3 }, { x: C.x + 2.3 - (s.recoil || 0), y: C.y - 0.2, z: C.z - 0.2 });
  else if (arms === 'pistol') set({ x: C.x + ua + fa - 0.4, y: C.y + 0.7, z: C.z - 0.4 }, { x: C.x - pump * 1.2, y: C.y - L(1.2), z: C.z - ua - fa + 0.8 });
  else if (arms === 'swing') set({ x: C.x + pump * 1.3, y: C.y + L(1.2), z: C.z - ua - fa + 0.9 }, { x: C.x - pump * 1.3, y: C.y - L(1.2), z: C.z - ua - fa + 0.9 });
  else if (arms === 'shoulder') set({ x: C.x + 0.9, y: C.y + L(1), z: C.z - 0.1 }, { x: C.x + 2, y: C.y + 0.3, z: C.z - 0.3 });
  else if (arms === 'fling') set({ x: C.x - 0.8 - at * 1.4, y: C.y + L(1.4), z: C.z + 0.8 + at * 1.4 }, { x: C.x - 0.4 - at * 1.1, y: C.y - L(1.4), z: C.z + 1 + at * 1.2 });
  else if (arms === 'up') set({ x: C.x + 0.7, y: 0.4, z: J.head.z - 1.2 }, { x: C.x + 0.7, y: -0.4, z: J.head.z - 1.1 });
  else if (arms === 'custom') { const R = s.hands.R, Lh = s.hands.L; set({ x: C.x + R[0], y: C.y + R[1], z: C.z + R[2] }, { x: C.x + Lh[0], y: C.y + Lh[1], z: C.z + Lh[2] }); }
  else if (arms === 'prone') { const c = s.crawl ?? 0; set({ x: C.x + ua + fa - 0.6 + Math.sin(c) * 0.9, y: C.y + 0.6, z: C.z - 0.2 }, { x: C.x + ua + fa - 0.2 - Math.sin(c) * 0.9, y: C.y - 0.5, z: C.z - 0.2 }); }
  else set({ x: C.x + 0.4 + at, y: C.y + L(1.2) + at * 0.6, z: C.z - ua - fa + 0.6 }, { x: C.x - 0.3 - at, y: C.y - L(1.2) - at * 0.4, z: C.z - ua - fa + 0.6 });
  J.elbR = joint(J.shR, J.handR, ua, fa, -1); J.elbL = joint(J.shL, J.handL, ua, fa, -1);
  for (const [name, at, o] of s.attach || []) { const b = J[at === 'pelvis' ? 'hipL' : at]; const base = at === 'pelvis' ? { x: (J.hipL.x + J.hipR.x) / 2, y: (J.hipL.y + J.hipR.y) / 2, z: J.hipL.z } : b; J[name] = { x: base.x + o[0], y: base.y + o[1], z: base.z + o[2] }; }
  // whole-body pitch about a pivot (lying flat, falls) — kneeling falls pitch the body above the knees
  if (s.pitch) {
    const fromKnees = !!s.pitchKnees;
    const px0 = fromKnees ? (J.kneeL.x + J.kneeR.x) / 2 : 0, pz0 = fromKnees ? (J.kneeL.z + J.kneeR.z) / 2 : s.pivotZ || 0;
    for (const key of Object.keys(J)) if (!(fromKnees && (key.startsWith('foot') || key.startsWith('knee')))) J[key] = pitch(J[key], s.pitch, px0, pz0);
  }
  if (s.crawl != null) {                              // crawling: the knees draw up alternately to the side
    const c = s.crawl, kn = Math.sin(c) * 0.8;
    J.kneeL = { ...J.kneeL, y: J.kneeL.y - Math.max(0, kn) * 0.8, x: J.kneeL.x + Math.max(0, kn) };
    J.kneeR = { ...J.kneeR, y: J.kneeR.y + Math.max(0, -kn) * 0.8, x: J.kneeR.x + Math.max(0, -kn) };
  }
  const rx = s.rootX || 0, rz = s.rootZ || 0;
  const free = new Set((s.attach || []).map((a) => a[0]));
  for (const key of Object.keys(J)) {
    const p = J[key];
    J[key] = { x: p.x + rx, y: p.y, z: free.has(key) ? p.z + rz : Math.max(key.startsWith('foot') || key.startsWith('knee') ? 0 : 0.3, p.z + rz) };
  }
  return J;
}

/** Death state at t ∈ [0, 1] (12 frames). */
export function deathState(d, kind, t) {
  const k = d.scale || 1;
  if (kind === 'takedown') {
    // grabbed from behind: arches back, hands at the throat · sags, knees go · slumps forward from the knees · face down
    const kn = t < 0.2 ? 0 : ease((t - 0.2) / 0.25), fwd = t < 0.45 ? 0 : ease((t - 0.45) / 0.35);
    return { pitch: rad(t < 0.2 ? -8 * Math.sin((t / 0.2) * Math.PI) : fwd * 86), pitchKnees: t >= 0.2, kneel: kn, arms: t < 0.3 ? 'up' : 'limp', armT: fwd * 0.6, lean: 0, dropGun: t > 0.15, rootZ: t > 0.8 && t < 0.9 ? 0.4 : 0 };
  }
  if (kind === 'explosion') {
    // thrown up and back, tumbling about the middle, lands at .7, bounces, settles
    const air = Math.min(1, t / 0.7), hz = d.hipZ * k;
    const z = t < 0.7 ? Math.sin(air * Math.PI) * 8 : t < 0.85 ? Math.sin(((t - 0.7) / 0.15) * Math.PI) * 1.5 : 0;
    return { pitch: -rad(t < 0.7 ? air * 330 : lerp(330, 270, Math.min(1, (t - 0.7) / 0.2))), pivotZ: hz, rootX: -lerp(0, 6, ease(t / 0.85)), rootZ: z - (t >= 0.7 ? hz - 1 : lerp(0, hz - 1, air)), arms: t < 0.85 ? 'fling' : 'limp', armT: Math.abs(Math.sin(t * 9)), lean: 0, dropGun: true };
  }
  // shot: snaps back, arms fling, rifle flies · staggers back, knees buckle · topples backwards (accelerating) ·
  // hits the ground and bounces · settles
  const fall = t < 0.42 ? 0 : t < 0.75 ? ease((t - 0.42) / 0.33) ** 1.4 : 1;
  const bounce = t > 0.75 && t < 0.9 ? Math.sin(((t - 0.75) / 0.15) * Math.PI) : 0;
  return {
    pitch: -rad(lerp(t < 0.18 ? lerp(0, 20, ease(t / 0.18)) : lerp(20, 34, Math.min(1, (t - 0.18) / 0.24)), 88, fall)),
    rootX: -lerp(0, 2.4, ease(t / 0.42)), rootZ: bounce, kneel: t < 0.12 ? 0 : Math.min(0.6, (t - 0.12) * 2) * (1 - fall * 0.7),
    arms: t < 0.75 ? 'fling' : 'limp', armT: t < 0.75 ? Math.min(1.3, t * 5) : Math.min(1, (t - 0.75) * 4), lean: 0, dropGun: true,
  };
}

// ------------------------------------------------------------------ drawing
function makeCanvasCtx() {
  const px = new Array(FW * FH).fill(null), zone = new Uint8Array(FW * FH), zb = new Float32Array(FW * FH).fill(-1e9);
  const hgt = new Float32Array(FW * FH).fill(-1);      // height above ground of each figure pixel (for the shadow)
  return { px, zone, zb, hgt };
}

/**
 * Render one frame. variant: 'nohelm' (Vrask without his helmet) and/or 'dk-shot' | 'dk-takedown' |
 * 'dk-explosion' | 'dk-headshot' (how a dead unit died), '|'-separated.
 * @returns {{px: (string|null)[], zone: Uint8Array, shadow: Uint8Array, w: number, h: number, ax: number, ay: number, top: number}}
 */
export function renderMini(type, pose_, dir, frame = 0, variant = '') {
  const d = MINI[type] || MINI.husk, C = d.col;
  const v = String(variant || '');
  const nohelm = v.includes('nohelm');
  let dk = (v.match(/dk-(\w+)/) || [])[1] || 'shot';
  if (dk === 'headshot') dk = 'shot';
  const armsIdle = d.weapon === 'none' ? 'swing' : d.weapon === 'launcher' ? 'shoulder' : 'hold';
  const n6 = (f) => ((f % 6) + 6) % 6 / 6;
  let st, deadT = -1;
  switch (pose_) {
    case 'walk': st = { gait: 'walk', ph: n6(frame), arms: armsIdle }; break;
    case 'run': st = { gait: 'run', ph: n6(frame), arms: armsIdle }; break;
    case 'pistol': st = { gait: 'walk', ph: n6(frame), arms: 'pistol', weapon: 'pistol' }; break;
    case 'crouch': st = { kneel: 0.8, arms: d.weapon === 'none' ? 'limp' : d.weapon === 'launcher' ? 'shoulder' : 'aim', lean: 0.3 }; break;
    case 'cover': st = { kneel: 1, arms: d.weapon === 'none' ? 'limp' : 'hold', lean: -0.3 }; break;
    case 'fire': st = { kneel: 0.8, arms: d.weapon === 'launcher' ? 'shoulder' : 'aim', lean: 0.3, recoil: frame & 1 ? 0.4 : 0 }; break;
    case 'prone': st = { pitch: rad(86), pivotZ: 0, arms: 'prone', lean: 0, rootX: -d.hipZ * 0.35 }; break;
    case 'crawl': st = { pitch: rad(86), pivotZ: 0, arms: 'prone', lean: 0, rootX: -d.hipZ * 0.35, crawl: (frame & 3) * (Math.PI / 2) }; break;
    case 'dead': deadT = Math.min(1, frame / 11); st = d.beast ? null : deathState(d, dk, deadT); break;
    default: st = { arms: armsIdle };
  }
  const th = rad(dir * 45 - 90), fx = Math.cos(th), fy = Math.sin(th), rx = -fy, ry = fx;
  const cx = makeCanvasCtx();
  const { px, zone, zb, hgt } = cx;
  const P = (p) => { const X = p.x * fx + p.y * rx, Y = p.x * fy + p.y * ry; return { sx: FAX + X, sy: FAY + Y * 0.5 - p.z, depth: Y, z: p.z }; };
  let curZone = 0;
  const put = (x, y, c, depth, z = 0) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= FW || y >= FH) return;
    const i = y * FW + x; if (zb[i] > depth + 0.05) return;
    px[i] = c; zb[i] = depth; hgt[i] = Math.max(0, z);
    if (curZone !== 255) zone[i] = curZone;           // (weapons pass the shot on to whatever is behind)
  };
  const line = (a, b, c, zn, bias = 0) => {
    curZone = zn;
    const A = P(a), B = P(b), n = Math.max(1, Math.ceil(Math.hypot(B.sx - A.sx, B.sy - A.sy) * 2));
    for (let i = 0; i <= n; i++) put(A.sx + (B.sx - A.sx) * i / n, A.sy + (B.sy - A.sy) * i / n, c, (A.depth + B.depth) / 2 + bias, A.z + (B.z - A.z) * i / n);
  };
  const dot = (p, c, zn, bias = 0.5, dx = 0, dy = 0) => { curZone = zn; const q = P(p); put(q.sx + dx, q.sy + dy, c, q.depth + bias, q.z); };

  if (d.beast) drawSniffer(d, C, pose_, frame, deadT, { P, put, line, dot, setZone: (z) => { curZone = z; } }, fx, fy);
  else {
    const J = pose(d, st);
    const ZL = Z.limb, ZT = Z.torso, ZH = Z.head;
    const gear = d.gear || [];
    // legs, far one first (near leg mid tone, far leg dark)
    const nearL = P(J.hipL).depth > P(J.hipR).depth;
    for (const [s, near] of [['L', nearL], ['R', !nearL]].sort((a, b) => (a[1] ? 1 : 0) - (b[1] ? 1 : 0))) {
      const T = C.trousers[near ? 1 : 2];
      line(J['hip' + s], J['knee' + s], T, ZL); line(J['knee' + s], J['foot' + s], T, ZL);
      if (C.lime && d.knee < 0) dot(J['knee' + s], C.lime, ZL, 0.05);              // NOT: lime knee joints
      const f = P(J['foot' + s]); curZone = ZL; put(f.sx, f.sy, C.boot, f.depth + 0.1, f.z); put(f.sx + Math.round(fx), f.sy, C.boot, f.depth + 0.1, f.z);
    }
    // gear on the back first (hidden by the torso from the front — SPEC §12.1 weak spots)
    const back = (dx, z) => ({ x: J.chest.x - dx, y: J.chest.y, z });
    const hipC = { x: (J.hipL.x + J.hipR.x) / 2, y: (J.hipL.y + J.hipR.y) / 2, z: J.hipL.z };
    const bz0 = hipC.z + 0.6, bz1 = J.chest.z - 1.1;
    const block = (a, b, w, ramp, zn) => { for (let o = 0; o < w; o++) { const off = (o - (w - 1) / 2) * 0.9; line({ ...a, y: a.y + off }, { ...b, y: b.y + off }, ramp[o === 0 ? 0 : o === w - 1 ? 2 : 1], zn, -0.3); } };
    if (gear.includes('tank')) block(back(2.1, bz0), back(2.1, bz1), 2, ORANGE, Z.fuelTank);
    if (gear.includes('pod')) { block(back(2.1, bz0 + 0.4), back(2.1, bz1), 2, ['#8D96A0', '#5E6670', '#353B42'], Z.rocketPod); dot(back(2.1, bz1), C.lime, Z.rocketPod, -0.2); }
    if (gear.includes('radio')) { block(back(2.1, bz0 + 0.3), back(2.1, bz1), 2, ['#6C747E', '#474D55', '#2A2E33'], Z.radio); line(back(1.1, bz1), back(1.3, J.head.z + 1.6), C.gun, 255, -0.3); dot(back(1.3, J.head.z + 1.9), C.lime, 255, -0.25); }
    if (gear.includes('basket')) block(back(1.1, bz0), back(1.1, bz1 + 0.3), 2, ['#9A7A4A', '#6E5430', '#46341C'], ZT);
    if (gear.includes('cape')) block(back(0.9, J.chest.z), back(1.3, hipC.z - 1.6), 3, C.plate, ZT);
    // torso: 3 px wide from the front/back (NOT: 2), 2 side-on; light on the left, dark on the right
    const wide = Math.abs(fy) > 0.2 ? Math.round(d.torso * (d.scale || 1)) : 2;
    curZone = ZT;
    const A = P(hipC), B = P(J.chest), n = Math.max(1, Math.ceil(Math.hypot(B.sx - A.sx, B.sy - A.sy) * 2));
    for (let i = 0; i <= n; i++) {
      const x = A.sx + (B.sx - A.sx) * i / n, y = A.sy + (B.sy - A.sy) * i / n, z = A.z + (B.z - A.z) * i / n;
      for (let o = 0; o < wide; o++) put(x - Math.floor(wide / 2) + o, y, C.shirt[o === 0 ? 0 : o === wide - 1 ? 2 : 1], (A.depth + B.depth) / 2, z);
    }
    for (let o = 0; o < wide; o++) put(A.sx - Math.floor(wide / 2) + o, A.sy, C.shirt[2], A.depth + 0.01, A.z);   // belt line
    if (C.plate) { dot(J.shL, C.plate[0], ZT, 0.1); dot(J.shR, C.plate[1], ZT, 0.1); }                       // violet pauldrons
    if (C.lime && fy > -0.3) dot({ x: J.chest.x + 0.5, y: J.chest.y, z: J.chest.z - 0.8 }, C.lime, ZT, 0.3);  // lime core
    if (gear.includes('belt')) for (const yy of [-1, 0, 1]) dot({ x: hipC.x + 0.7, y: hipC.y + yy, z: hipC.z + 0.2 }, yy ? ORANGE[1] : ORANGE[0], Z.grenadeBelt, 0.4);
    // arms (1 px), far arm first
    const farArm = P(J.shL).depth < P(J.shR).depth ? 'L' : 'R';
    for (const s of farArm === 'L' ? ['L', 'R'] : ['R', 'L']) {
      const c = C.shirt[s === farArm ? 2 : 1];
      line(J['sh' + s], J['elb' + s], c, ZL); line(J['elb' + s], J['hand' + s], c, ZL);
    }
    // weapon (zone 255: never takes the hit itself)
    const wp = st.dropGun ? 'none' : st.weapon || d.weapon;
    const fwd = (p, t, dz = 0) => ({ x: p.x + t, y: p.y * 0.5, z: p.z + dz });
    let tip = null;
    if (wp === 'rifle') { line(fwd(J.handR, -1.5), fwd(J.handL, 2.3, 0.4), C.gun, 255, 0.3); tip = fwd(J.handL, 2.3, 0.4); dot(fwd(J.handR, -1.5), C.gunStock, 255, 0.4); }
    else if (wp === 'smg') { line(fwd(J.handR, -0.5), fwd(J.handR, 1.6), C.gun, 255, 0.3); tip = fwd(J.handR, 1.6); }
    else if (wp === 'flamer') { line(fwd(J.handR, -1), fwd(J.handL, 1.8, 0.2), C.gun, 255, 0.3); tip = fwd(J.handL, 1.8, 0.2); dot(tip, ORANGE[1], 255, 0.4); }
    else if (wp === 'launcher') { line({ x: J.shR.x - 1.6, y: J.shR.y, z: J.shR.z + 0.5 }, { x: J.shR.x + 3.2, y: J.shR.y, z: J.shR.z + 0.7 }, '#6E7680', 255, 0.4); tip = { x: J.shR.x + 3.4, y: J.shR.y, z: J.shR.z + 0.7 }; }
    else if (wp === 'pistol') { line(J.handR, fwd(J.handR, 1), C.gun, 255, 0.3); tip = fwd(J.handR, 1.1); }
    else if (wp === 'grenade') dot(J.handR, ORANGE[1], 255, 0.5);
    if (tip && C.gunTip && wp !== 'launcher' && wp !== 'grenade') dot(tip, C.gunTip, 255, 0.45);
    if (wp === 'pistol' && d.weapon === 'rifle') line(back(0.9, hipC.z + 0.3), back(0.3, J.chest.z + 0.9), C.gun, 255, -0.4);   // rifle slung on the back
    if (d.headKind !== 'not') for (const s of ['L', 'R']) dot(J['hand' + s], C.skin[1], ZL, 0.5);   // bare hands (GOD)
    // muzzle flash on the first 'fire' frame
    if (pose_ === 'fire' && !(frame & 1) && tip) { curZone = 255; const q = P(fwd(tip, 0.8)); put(q.sx, q.sy, '#FFF1A8', q.depth + 1, q.z); put(q.sx + Math.sign(fx || 1), q.sy, '#FFC24A', q.depth + 1, q.z); put(q.sx, q.sy - 1, '#FFC24A', q.depth + 1, q.z); }
    // head
    const hd = P(J.head), hx = Math.round(hd.sx), hy = Math.round(hd.sy), dz = hd.depth + 0.6, hz = hd.z;
    const side = fx > 0.3 ? 1 : fx < -0.3 ? -1 : 0, toward = fy > -0.3;
    curZone = ZH;
    const H = C.helmet;
    if (d.headKind === 'not') {
      // long skull, 2 wide × 4 tall; lime eyes on the side it faces
      put(hx, hy - 4, H[0], dz, hz); put(hx + 1, hy - 4, H[1], dz, hz);
      for (const yy of [-3, -2]) { put(hx, hy + yy, H[0], dz, hz); put(hx + 1, hy + yy, H[1], dz, hz); }
      put(hx, hy - 1, H[1], dz, hz); put(hx + 1, hy - 1, H[2], dz, hz);
      if (toward) { if (side >= 0) put(hx + 1, hy - 2, C.eye, dz + 0.1, hz); if (side <= 0) put(hx, hy - 2, C.eye, dz + 0.1, hz); }
      if (gear.includes('crest')) { put(hx, hy - 5, C.plate[0], dz, hz); put(hx, hy - 6, C.plate[1], dz, hz); }   // Warden's violet crest
      if (gear.includes('helmet') && !nohelm) {       // Vrask's violet helmet with a lime visor slit
        curZone = Z.helmet;
        for (const [xx, yy, c] of [[-1, -4, 0], [0, -5, 0], [1, -5, 1], [2, -4, 2], [-1, -3, 1], [0, -4, 0], [1, -4, 1], [2, -3, 2]]) put(hx + xx, hy + yy, C.plate[c], dz + 0.2, hz);
        if (toward) { put(hx, hy - 3, C.lime, dz + 0.3, hz); put(hx + 1, hy - 3, C.lime, dz + 0.3, hz); }
      }
    } else {
      // WREN's Classic helmet (pilot: white helmet, dark visor) — or bare head with hair (scientist)
      put(hx, hy - 3, H[0], dz, hz); put(hx + 1, hy - 3, H[1], dz, hz);
      put(hx - 1, hy - 2, H[0], dz, hz); put(hx, hy - 2, H[1], dz, hz); put(hx + 1, hy - 2, H[2], dz, hz);
      if (toward) {
        if (d.headKind === 'hair') { put(hx - 1, hy - 1, C.skin[0], dz, hz); put(hx, hy - 1, C.skin[0], dz, hz); put(hx + 1, hy - 1, C.skin[1], dz, hz); }
        else {
          const v0 = side > 0 ? hx : hx - 1;
          put(v0, hy - 1, C.visor[0], dz, hz); put(v0 + 1, hy - 1, C.visor[side < 0 ? 0 : 1], dz, hz);
          if (side === 0) put(hx + 1, hy - 1, C.visor[1], dz, hz); else put(side > 0 ? hx - 1 : hx + 1, hy - 1, H[2], dz, hz);
        }
        put(hx + (side > 0 ? 1 : 0), hy, C.skin[0], dz, hz); put(hx + (side > 0 ? 0 : side < 0 ? -1 : 1), hy, C.skin[1], dz, hz);
      } else { put(hx - 1, hy - 1, H[1], dz, hz); put(hx, hy - 1, H[2], dz, hz); put(hx + 1, hy - 1, H[2], dz, hz); put(hx, hy, C.skin[1], dz, hz); }
    }
  }
  // dark edge on the shadow side (right and below), only against open ground so 1-px gaps stay open
  const fig = px.slice();
  for (let i = 0; i < FW * FH; i++) {
    if (!fig[i]) continue;
    const x = i % FW, y = Math.floor(i / FW);
    for (const [ddx, ddy] of [[1, 0], [0, 1]]) {
      const j = (y + ddy) * FW + x + ddx, k2 = (y + 2 * ddy) * FW + x + 2 * ddx;
      if (x + 2 * ddx < FW && y + 2 * ddy < FH && !fig[j] && !fig[k2]) { px[j] = C.edge; hgt[j] = hgt[i]; }   // (the edge takes no hit)
    }
  }
  // flat cast shadow: each pixel dropped from its height to the ground along the light (down-right)
  const shadow = new Uint8Array(FW * FH);
  for (let i = 0; i < FW * FH; i++) {
    if (!px[i] || hgt[i] < 0) continue;
    const x = i % FW, y = Math.floor(i / FW), h = hgt[i];
    const sx = Math.round(x + h * 0.75), sy = Math.round(y + h + h * 0.18);
    for (const ddx of [0, 1]) if (sx + ddx < FW && sy < FH && sy >= 0) shadow[sy * FW + sx + ddx] = 1;
  }
  // blood of a death: droplets flying back out of the wound, splats where they land, a mist puff on the hit
  if (deadT >= 0 && (d.beast || dk !== 'takedown')) bloodInto(px, d, d.beast ? 'shot' : dk, deadT, fx, fy, bloodOf((v.match(/bl-(\w+)/) || [])[1]));
  if (deadT >= 0 && dk === 'explosion' && !d.beast) for (let i = 0; i < px.length; i++) if (px[i] && zone[i]) px[i] = mixc(px[i], '#1A120C', Math.min(0.55, deadT * 0.9));
  let top = FH;
  for (let i = 0; i < fig.length; i++) if (fig[i]) { top = Math.floor(i / FW); break; }
  return { px, zone, shadow, w: FW, h: FH, ax: FAX, ay: FAY, top: FAY - top };
}

function bloodInto(px, d, kind, t, fx, fy, BLOOD) {
  let s = 5; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const n = kind === 'shot' ? 22 : 12, tt = t * 1.1, chestZ = d.beast ? 3 : (d.hipZ + d.chest - 0.6) * (d.scale || 1);
  const put = (x, y, c) => { x = Math.round(FAX + x); y = Math.round(FAY + y); if (x >= 0 && y >= 0 && x < FW && y < FH && !px[y * FW + x]) px[y * FW + x] = c; };
  for (let i = 0; i < n; i++) {
    const vx = -(10 + rnd() * 26), vy = (rnd() - 0.5) * 18, vz = 7 + rnd() * 22, t0 = rnd() * 0.16, col = BLOOD[Math.floor(rnd() * 3)];
    const q = tt - t0; if (q < 0) continue;
    const tl = (2 * vz) / 90, qq = Math.min(q, tl), landed = q >= tl;
    const X = vx * qq + 1, Y = vy * qq, Zh = vz * qq - 45 * qq * qq;
    const wx = X * fx - Y * fy, wy = X * fy + Y * fx;
    const sy = wy * 0.5 - (landed ? 0 : Zh + chestZ * (1 - qq / tl));
    put(wx, sy, col); if (landed) put(wx + 1, sy, col);
  }
  if (kind === 'shot' && t < 0.25) {
    const R = 0.8 + t * 7, cy = -fy * 0.5 - chestZ, cxx = -fx;
    for (let yy = -Math.ceil(R); yy <= Math.ceil(R); yy++) for (let xx = -Math.ceil(R); xx <= Math.ceil(R); xx++) {
      const dd = Math.hypot(xx, yy) / R; if (dd > 1 || (((xx + yy) & 1) && dd > 0.5)) continue;
      put(cxx + xx, cy + yy, dd < 0.45 ? BLOOD[2] : BLOOD[0]);
    }
  }
}

/** The Sniffer: a low, four-legged hunting beast — chitin body, violet spine, four lime eyes. */
function drawSniffer(d, C, pose_, frame, deadT, g, fx, fy) {
  const { line, dot } = g;
  const moving = pose_ === 'walk' || pose_ === 'run', run = pose_ === 'run';
  const ph = moving ? ((frame % 6) + 6) % 6 / 6 : 0;
  const dead = deadT >= 0, rollT = dead ? ease(deadT / 0.6) : 0;
  // dead: rolls onto its side (the legs swing up and out)
  const R = (p) => {
    if (!dead) return p;
    const a = rad(90) * rollT, y = p.y, z = p.z - 1.2;
    return { x: p.x - lerp(0, 1.5, ease(deadT / 0.4)), y: y * Math.cos(a) - z * Math.sin(a), z: Math.max(0.3, 1.2 + y * Math.sin(a) + z * Math.cos(a) - rollT * 1.2) };
  };
  const bodyZ = 2.8 + (moving ? Math.abs(Math.sin(ph * Math.PI * 2)) * 0.3 : 0);
  const ZB = Z.body;
  for (const [lx, ly, off] of [[1.6, -0.9, 0], [1.6, 0.9, 0.5], [-1.6, -0.9, 0.5], [-1.6, 0.9, 0]]) {
    const a = (ph + off) * Math.PI * 2;
    const footX = lx + (moving ? Math.cos(a) * (run ? 1.3 : 0.9) : 0), lift = moving ? Math.max(0, -Math.sin(a)) * 0.8 : 0;
    const top = { x: lx, y: ly, z: bodyZ - 0.4 }, foot = { x: footX, y: ly * 1.1, z: lift };
    const knee = { x: (lx + footX) / 2 + (lx > 0 ? -0.4 : 0.4), y: ly * 1.05, z: (bodyZ + lift) / 2 + 0.3 };
    line(R(top), R(knee), C.trousers[ly > 0 ? 1 : 2], ZB); line(R(knee), R(foot), C.trousers[ly > 0 ? 1 : 2], ZB);
  }
  for (let o = 0; o < 2; o++) line(R({ x: -2.2, y: o - 0.5, z: bodyZ }), R({ x: 2.2, y: o - 0.5, z: bodyZ + 0.3 }), C.shirt[o], ZB);
  line(R({ x: -2.2, y: 0, z: bodyZ + 0.6 }), R({ x: 2.2, y: 0, z: bodyZ + 0.9 }), C.shirt[0], ZB);
  for (let i = 0; i < 3; i++) dot(R({ x: -1.4 + i * 1.3, y: 0, z: bodyZ + 1.3 }), C.plate[i & 1], ZB, 0.3);
  line(R({ x: -2.2, y: 0, z: bodyZ + 0.3 }), R({ x: -3.6, y: 0, z: bodyZ + 1.3 }), C.shirt[1], ZB);
  const head = { x: 3.2, y: 0, z: bodyZ - 0.2 };
  for (const [hx, hz] of [[0, 0], [0.8, -0.2], [0, 0.8], [0.8, 0.6]]) dot(R({ x: head.x + hx, y: 0, z: head.z + hz }), C.helmet[hx ? 1 : 0], Z.head, 0.4);
  if (fy > -0.35 && !dead) for (const ey of [-0.5, 0.5]) dot(R({ x: head.x + 1.2, y: ey, z: head.z + 0.5 }), C.eye, Z.head, 0.9);
  if (pose_ === 'fire' && !(frame & 1)) dot(R({ x: head.x + 1.8, y: 0, z: head.z - 0.3 }), '#DDE8C0', 255, 1);   // the bite
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

/** Map-sprite painter: canvas + hit-zone map + the figure's own ground shadow. */
function painter(type) {
  return (pose_, dir, frame, variant) => {
    const r = renderMini(type, pose_, dir, frame, variant);
    return {
      get canvas() { return this._c || (this._c = canvasOf(r.px, r.w, r.h)); }, _c: null,
      ax: r.ax, ay: r.ay, w: r.w, h: r.h, zoneMap: r.zone, top: r.top,
      shadow: { get canvas() { return this._c || (this._c = canvasOf(null, r.w, r.h, 100, r.shadow)); }, _c: null, ax: r.ax, ay: r.ay, w: r.w, h: r.h },
    };
  };
}
for (const type of Object.keys(MINI)) Art.registerNewest('unit', type, painter(type));
