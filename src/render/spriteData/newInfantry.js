// @ts-check
import { Model, rasterize, norm, Z, Z_PASS } from '../model3d.js';
import { Art } from '../artStyle.js';

/**
 * New-style infantry (Art style "New"): WREN, the GOD non-combatants and every NOT foot soldier are
 * posed 3D figures ray-cast into pixel art (see model3d.js). The scope close-up is the very same frame
 * scaled ×4, and its hit zones are the sprite's own pixels, so a weak spot is exactly where you see it.
 *
 * Sprite canvas NW×NH with the ground anchor at (NAX, NAY). Poses: idle, walk(4), run(4), crouch,
 * cover, fire(2), pistol(4), prone, dead(4).
 */
export const NW = 36, NH = 38, NAX = 18, NAY = 32;
/** lying poses (dead, prone) need a wider canvas: a fallen body can stretch ~24 px either way */
export const LW = 56, LH = 44, LAX = 28, LAY = 24;
/** screen pixels per model unit */
export const MODEL_SCALE = 1.3;
export const SCOPE_SCALE = 4;

// ---------- materials ----------
const ramp = (...c) => c;
const M = {
  // GOD
  olive: { ramp: ramp('#262C1A', '#3A4426', '#556436', '#71844A', '#8FA35E') },
  oliveD: { ramp: ramp('#1E2314', '#2E361E', '#414C28', '#566435', '#6C7C44') },
  khaki: { ramp: ramp('#4A4230', '#6E6444', '#968A5E', '#B8AA7C', '#D2C69A') },
  khakiD: { ramp: ramp('#3A3424', '#554C34', '#756A48', '#948760', '#AC9F76') },
  steel: { ramp: ramp('#1E3A52', '#2C5474', '#3F77A2', '#5E98C4', '#8CBCDC') },
  visor: { ramp: ramp('#5E9CC4', '#9FD8FF', '#D8F2FF'), emissive: true, weight: 2 },
  skin: { ramp: ramp('#6A4A34', '#94704E', '#BC906A', '#D8AE86') },
  boot: { ramp: ramp('#15120E', '#221D16', '#302820', '#43392C') },
  gun: { ramp: ramp('#131517', '#1E2124', '#2C3135', '#434A50', '#5E666C'), weight: 2.2 },
  gunWood: { ramp: ramp('#2A2016', '#3E3020', '#54422C', '#6A5538'), weight: 1.6 },
  lens: { ramp: ramp('#2C5474', '#6FB4E8'), emissive: true, weight: 1.5 },
  flash: { ramp: ramp('#FFC24A', '#FFF1A8'), emissive: true, weight: 3 },
  // NOT
  chitin: { ramp: ramp('#0E1012', '#181B1E', '#24282C', '#343A3F', '#4C545A', '#66707A') },
  chitinL: { ramp: ramp('#1A1D20', '#2A2F33', '#3C4348', '#535B62', '#6E7880', '#8A949C') },
  violet: { ramp: ramp('#2A1248', '#461E72', '#6630A8', '#8A4ED6', '#B084F0') },
  lime: { ramp: ramp('#8AD42E', '#C4FF5A', '#EEFFA8'), emissive: true, weight: 2.2 },
  limeDull: { ramp: ramp('#3E6A16', '#5E9420', '#86C22E', '#AEE84E') },
  eye: { ramp: ramp('#E4FF6A', '#FAFFD0'), emissive: true, weight: 5 },
  orange: { ramp: ramp('#5A2A0C', '#8E4416', '#C0661E', '#E8923A', '#FFC274') },
  metal: { ramp: ramp('#23272A', '#3A4045', '#566067', '#76828A', '#9EA9B0') },
  antenna: { ramp: ramp('#3A4045', '#76828A', '#9EA9B0'), weight: 4 },
  gearBox: { ramp: ramp('#3A4248', '#5E6A72', '#84929A', '#AAB8C0', '#CAD6DC') },
  hide: { ramp: ramp('#2A2016', '#44351F', '#5E4A2C', '#7A6240') },
  // non-combatants
  flight: { ramp: ramp('#5A2A10', '#8E4A20', '#C0682E', '#E08A46', '#F4AA6A') },
  flightD: { ramp: ramp('#40200C', '#643618', '#8A4E24', '#A8663A') },
  white: { ramp: ramp('#6E746E', '#9CA29A', '#C4C8C0', '#E4E6E0', '#F6F8F2') },
  darkVisor: { ramp: ramp('#1A2229', '#2E3A44', '#48586A'), weight: 2 },
  hair: { ramp: ramp('#2A1C12', '#3E2A1E', '#5A3E2A', '#7A5A3E') },
  badge: { ramp: ramp('#3A6284', '#6FA2C8'), emissive: true, weight: 2 },
  harness: { ramp: ramp('#5A4A10', '#8E7818', '#C0A428', '#E0C040') },
};
const OUT_GOD = '#141612', OUT_NOT = '#08090A';

// ---------- small vector kit (local frame: f forward, r right, z up) ----------
/** @typedef {number[]} V */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
/** orthonormal basis with forward d and "up-ish" hint */
function basis(d, up = [0, 0, 1]) {
  const f = norm(d);
  let r = cross(up, f);
  if (len(r) < 1e-4) r = cross([1, 0, 0], f);
  r = norm(r);
  const u = cross(f, r);
  return [f, r, u];   // forward, right, up
}
/** 2-bone IK: joint between a and c with segment lengths l1, l2, bending towards hint */
function ik(a, c, l1, l2, hint) {
  let d = sub(c, a);
  let dl = len(d);
  const max = (l1 + l2) * 0.999;
  if (dl > max) { d = mul(d, max / dl); dl = max; }
  if (dl < 1e-4) return add(a, mul(norm(hint), l1));
  const u = mul(d, 1 / dl);
  const x = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl);
  const y = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let w = sub(hint, mul(u, dot(hint, u)));
  w = len(w) < 1e-4 ? [0, 0, 1] : norm(w);
  return add(a, add(mul(u, x), mul(w, y)));
}

/**
 * Posed figure builder: collects parts in the local frame, then maps them into world space
 * (yaw to the facing direction, plus an optional whole-body transform used by death animations).
 */
class Rig {
  constructor(angle, xf = null) {
    this.m = new Model();
    const c = Math.cos(angle), s = Math.sin(angle);
    this.F = [c, s, 0]; this.R = [-s, c, 0];
    this.xf = xf;       // local point → local point (before yaw)
  }
  /** start a new body part (drawn with a shadow line where it overlaps another) */
  part() { this.m.newPart(); }
  /** local → world */
  W(p) {
    const q = this.xf ? this.xf(p) : p;
    return [this.F[0] * q[0] + this.R[0] * q[1], this.F[1] * q[0] + this.R[1] * q[1], q[2]];
  }
  /** local direction → world direction (through the same transform) */
  D(d) {
    const o = this.W([0, 0, 0]), e = this.W(d);
    return norm(sub(e, o));
  }
  cap(a, b, r, mat, zone) { this.m.capsule(this.W(a), this.W(b), r, mat, zone); }
  cyl(a, b, r, mat, zone) { this.m.cylinder(this.W(a), this.W(b), r, mat, zone); }
  ball(c, r, mat, zone) { this.m.ellipsoid(this.W(c), [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [r, r, r], mat, zone); }
  /** ellipsoid with local axes ax (f, r, up) */
  ell(c, ax, rr, mat, zone) {
    const w = ax.map((a) => this.D(a));
    this.m.ellipsoid(this.W(c), orthonormal(w), rr, mat, zone);
  }
  box(c, ax, hh, mat, zone) {
    const w = ax.map((a) => this.D(a));
    this.m.box(this.W(c), orthonormal(w), hh, mat, zone);
  }
}
function orthonormal([a, b]) {
  const f = norm(a);
  let r = sub(b, mul(f, dot(b, f)));
  r = norm(r);
  return [f, r, cross(f, r)];
}
const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
/** axes pitched forward by a (about the right axis) */
function pitchAx(a) { return [[Math.cos(a), 0, -Math.sin(a)], [0, 1, 0], [Math.sin(a), 0, Math.cos(a)]]; }

// ---------- body plans ----------
/** GOD human proportions */
const HUMAN = { thigh: 3.5, shin: 3.4, ankle: 0.75, hipW: 1.2, upper: 2.3, fore: 2.2, shoulderW: 2.05, chestUp: 2.8, shoulderUp: 4.1, headUp: 5.9 };
/** NOT: tall, digitigrade legs, three-segment arms */
const ALIEN = { thigh: 3.2, shin: 3.3, meta: 2.5, hipW: 1.15, upper: 2.4, mid: 2.1, fore: 2.0, shoulderW: 2.2, chestUp: 3.0, shoulderUp: 4.3, headUp: 7.3 };

/**
 * Animation parameters for a pose/frame: hip height, lean, foot targets, and how the arms/weapon are held.
 * @param {string} pose @param {number} frame @param {'god'|'not'} sp
 */
function motion(pose, frame, sp) {
  const god = sp === 'god';
  const standZ = god ? HUMAN.ankle + (HUMAN.thigh + HUMAN.shin) * 0.97 : 8.3;
  const f = frame & 3;
  const m = { hipZ: standZ, lean: god ? 0.04 : 0.16, feet: [[0.7, -1.3, 0], [-0.5, 1.3, 0]], lift: [0, 0], hold: 'low', swing: 0, kneel: false, flash: false, recoil: 0, twist: 0 };
  if (pose === 'walk' || pose === 'pistol') {
    const S = god ? 1.7 : 1.9, H = god ? 0.9 : 1.1;
    const ph = [1, 0, -1, 0][f], lift = [[0, 0], [0, H], [0, 0], [H, 0]][f];
    m.feet = [[S * ph, -1.25, 0], [-S * ph, 1.25, 0]];
    m.lift = lift;
    m.hipZ = standZ - (ph ? 0.35 : 0);
    m.swing = ph;
    if (pose === 'pistol') m.hold = 'pistol';
  } else if (pose === 'run') {
    const S = god ? 2.7 : 3.0, H = god ? 1.9 : 2.2;
    const ph = [1, 0, -1, 0][f], lift = [[0, 0.6], [0, H], [0.6, 0], [H, 0]][f];
    m.feet = [[S * ph + 0.4, -1.15, 0], [-S * ph + 0.4, 1.15, 0]];
    m.lift = lift;
    m.hipZ = standZ - (ph ? 0.7 : 0.1);
    m.lean = god ? 0.3 : 0.38;
    m.swing = ph * 1.6;
    m.hold = 'port';
  } else if (pose === 'crouch' || pose === 'fire' || pose === 'cover') {
    // kneeling on the right knee, left foot planted forward, weapon shouldered
    m.kneel = true;
    m.hipZ = god ? 4.3 : 4.9;
    m.lean = pose === 'cover' ? 0.34 : god ? 0.1 : 0.2;
    if (pose === 'cover') m.hipZ -= 0.8;
    m.feet = [[1.9, -1.3, 0], [-2.7, 1.2, 0]];
    m.hold = 'aim';
    if (pose === 'fire') { m.flash = f === 0; m.recoil = f === 0 ? 0.35 : 0; }
  } else if (pose === 'idle') {
    m.hold = 'low';
  }
  return m;
}

/**
 * Build the figure for one frame.
 * @param {any} T type spec @param {string} pose @param {number} dir @param {number} frame
 */
function build(T, pose, dir, frame) {
  const angle = dir * Math.PI / 4 - Math.PI / 2;
  if (T.species === 'beast') return beast(T, pose, angle, frame);
  let xf = null;
  let deadPose = null;
  if (pose === 'dead') {
    // 0 hit (rocked back) · 1 knees give · 2 falling · 3 on the ground
    const k = [0.28, 0.55, 1.05, Math.PI / 2][frame & 3];
    const lift = [0, 0, 0.3, T.species === 'not' ? 1.5 : 1.4][frame & 3];
    const back = T.species === 'not' ? 0.9 : 0.7;
    xf = (p) => {
      const c = Math.cos(k), s = Math.sin(k);
      // fall backwards about a pivot behind the heels
      const f = p[0] + back, z = p[2];
      return [f * c - z * s - back, p[1], f * s + z * c + lift];
    };
    deadPose = frame & 3;
  }
  const r = new Rig(angle, xf);
  const m = motion(pose === 'dead' ? (deadPose >= 1 ? 'deadSlump' : 'idle') : pose, frame, T.species);
  if (deadPose !== null) {
    m.hold = deadPose >= 2 ? 'drop' : 'flail';
    if (deadPose >= 1) { m.hipZ -= deadPose === 1 ? 1.4 : 1.0; m.lean = -0.1; m.feet = [[0.9, -1.2, 0], [0.5, 1.2, 0]]; }
  }
  if (pose === 'prone') return prone(T, r, frame);
  if (T.species === 'god') human(T, r, m, pose);
  else alien(T, r, m, pose);
  return r.m;
}

// ---------- GOD human ----------
function human(T, r, m, pose) {
  const B = HUMAN, mt = T.mats;
  const hip = [0, 0, m.hipZ];
  const lean = m.lean;
  const tAx = pitchAx(lean);
  const up = tAx[2];
  const at = (h) => add(hip, mul(up, h));
  // legs
  for (const s of [0, 1]) {
    r.part();
    const side = s ? 1 : -1;
    const hj = add(hip, [0, side * B.hipW, 0]);
    let foot = add(m.feet[s], [0, 0, B.ankle + m.lift[s]]);
    let knee;
    if (m.kneel && s === 1) {
      // right knee down on the ground, shin trailing back
      knee = [0.5, side * 1.0, 0.75];
      foot = [-2.4, side * 1.0, 0.75];
    } else knee = ik(hj, foot, B.thigh, B.shin, [1, side * 0.15, 0]);
    r.cap(hj, knee, 0.95, mt.legs, Z.limb);
    r.cap(knee, foot, 0.82, mt.legs, Z.limb);
    // boot
    const toe = m.kneel && s === 1 ? [-3.3, side * 1.0, 0.45] : add(foot, [1.2, 0, -0.35 + (m.lift[s] ? 0.2 : 0)]);
    r.cap(add(foot, [0, 0, -0.25]), toe, 0.62, mt.boots, Z.limb);
  }
  // pelvis & torso
  r.part();
  r.ell(at(0.5), tAx, [1.15, 1.35, 1.0], mt.legs, Z.torso);
  const chest = at(B.chestUp);
  r.ell(chest, tAx, [1.5, 1.75, 2.0], mt.torso, Z.torso);
  if (mt.webbing) {
    // shoulder straps + belt in steel blue
    for (const s of [-1, 1]) r.cap(add(at(3.9), mul(tAx[1], s * 1.1)), add(at(1.3), mul(tAx[1], s * 0.8)), 0.55, mt.webbing, Z.torso);
    r.ell(at(1.15), tAx, [1.4, 1.85, 0.5], mt.webbing, Z.torso);
    r.box(add(at(1.3), mul(tAx[0], 1.0)), tAx, [0.35, 0.55, 0.45], mt.webbing, Z.torso);   // pouch
  }
  if (mt.badge) r.ball(add(at(3.5), add(mul(tAx[0], 1.25), mul(tAx[1], -0.8))), 0.35, mt.badge, Z.torso);
  if (mt.harness) for (const s of [-1, 1]) r.cap(add(at(3.9), mul(tAx[1], s * 1.0)), add(at(0.9), mul(tAx[1], -s * 0.7)), 0.34, mt.harness, Z.torso);
  if (T.pack) {
    r.part();
    // backpack with a rolled mat on top
    r.box(add(at(2.7), mul(tAx[0], -1.55)), tAx, [0.7, 1.25, 1.35], mt.pack, Z.torso);
    r.cyl(add(at(4.2), add(mul(tAx[0], -1.4), mul(tAx[1], -1.3))), add(at(4.2), add(mul(tAx[0], -1.4), mul(tAx[1], 1.3))), 0.55, mt.roll, Z.torso);
  }
  // head
  r.part();
  const neck = at(B.shoulderUp + 0.3);
  const head = add(at(B.headUp), [lean > 0.2 ? 0.5 : 0.15, 0, 0]);
  r.cap(neck, head, 0.55, mt.skin, Z.head);
  r.ball(head, 1.5, mt.skin, Z.head);
  if (mt.hair) r.ell(add(head, [-0.25, 0, 0.4]), AX, [1.5, 1.58, 1.3], mt.hair, Z.head);
  if (mt.helmet) {
    r.ell(add(head, [-0.1, 0, 0.55]), AX, [1.85, 1.85, 1.05], mt.helmet, Z.head);
    r.ell(add(head, [0.1, 0, 0.2]), AX, [2.05, 2.0, 0.42], mt.helmetRim || mt.helmet, Z.head);   // brim
  }
  if (mt.visor) r.box(add(head, [1.25, 0, -0.05]), AX, [0.45, 1.35, 0.45], mt.visor, Z.head);
  // arms + weapon
  const sh = (s) => add(at(B.shoulderUp), mul(tAx[1], s * B.shoulderW));
  const hands = weapon(T, r, m, { sh, at, tAx, species: 'god' });
  for (const s of [0, 1]) {
    r.part();
    const side = s ? 1 : -1;
    const S = sh(side);
    const hand = hands[s] || add(S, [m.swing * -side * 0.9, side * 0.8, -(B.upper + B.fore) * 0.9]);
    const elbow = ik(S, hand, B.upper, B.fore, [-0.6, side * 1.0, -0.3]);
    r.ell(S, tAx, [0.85, 0.85, 0.8], mt.sleeves || mt.torso, Z.limb);
    r.cap(S, elbow, 0.68, mt.sleeves || mt.torso, Z.limb);
    r.cap(elbow, hand, 0.6, mt.sleeves || mt.torso, Z.limb);
    r.ball(hand, 0.55, mt.hands || mt.skin, Z.limb);
  }
}

// ---------- NOT soldier ----------
function alien(T, r, m, pose) {
  const B = ALIEN, mt = T.mats, g = T.scale || 1;
  const hip = [0, 0, m.hipZ * g];
  const lean = m.lean;
  const tAx = pitchAx(lean);
  const up = tAx[2];
  const at = (h) => add(hip, mul(up, h * g));
  // legs: thigh forward, shin back to a raised hock, long foot forward — the "reverse knee"
  for (const s of [0, 1]) {
    r.part();
    const side = s ? 1 : -1;
    const hj = add(hip, [0, side * B.hipW * g, 0]);
    const ball = add(m.feet[s], [0, 0, m.lift[s]]);
    let hock, knee, toe;
    if (m.kneel && s === 1) {
      knee = [0.3 * g, side * 1.0 * g, 1.0];
      hock = [-2.6 * g, side * 1.0 * g, 1.2];
      toe = [-2.2 * g, side * 1.0 * g, 0.4];
    } else {
      const lifted = m.lift[s] > 0;
      hock = add(ball, [-1.0 * g, 0, (B.meta - 0.3) * g - (lifted ? 0.4 : 0)]);
      knee = ik(hj, hock, B.thigh * g, B.shin * g, [1, side * 0.1, 0.1]);
      toe = add(ball, [1.1 * g, 0, lifted ? -0.3 : 0.25]);
    }
    r.cap(hj, knee, 0.9 * g, mt.legs, Z.limb);
    r.cap(knee, hock, 0.62 * g, mt.legs, Z.limb);
    r.cap(hock, ball, 0.5 * g, mt.legs, Z.limb);
    r.cap(ball, toe, 0.42 * g, mt.legs, Z.limb);
    r.ball(knee, 0.72 * g, mt.joint, Z.limb);
    r.ball(hock, 0.5 * g, mt.hock || mt.joint, Z.limb);
  }
  // waist, carapace chest, pauldrons with violet rims
  r.part();
  r.cap(at(0.2), at(2.0), 0.75 * g, mt.legs, Z.torso);
  r.ell(at(0.55), tAx, [0.95 * g, 1.2 * g, 0.4 * g], mt.belt, Z.torso);
  const chest = add(at(B.chestUp + 0.3), mul(tAx[0], 0.35 * g));
  r.ell(chest, tAx, [1.4 * g, 1.75 * g, 1.6 * g], mt.body, Z.torso);
  for (let i = 0; i < 3; i++) r.ell(add(at(1.8 + i * 1.15), mul(tAx[0], -1.05 * g)), tAx, [0.5 * g, 0.65 * g, 0.42 * g], mt.trim, Z.torso);   // spine plates
  r.ball(add(chest, add(mul(tAx[0], 1.35 * g), mul(up, 0.2 * g))), 0.42 * g, mt.core, Z.torso);                                            // chest core glow
  const sh = (s) => add(at(B.shoulderUp), mul(tAx[1], s * B.shoulderW * g));
  for (const s of [-1, 1]) {
    const S = add(sh(s), mul(up, 0.35 * g));
    r.ell(add(S, mul(up, -0.45 * g)), tAx, [1.3 * g, 1.15 * g, 0.45 * g], mt.trim, Z.torso);
    r.ell(add(S, mul(up, -0.2 * g)), tAx, [1.05 * g, 0.95 * g, 0.55 * g], mt.body, Z.torso);
  }
  // neck forward, long head with a jaw, glowing eyes
  r.part();
  const neck = add(at(B.shoulderUp + 0.2), mul(tAx[0], 0.4 * g));
  const head = add(at(B.headUp - 0.2), mul(tAx[0], 0.7 * g));
  r.cap(neck, head, 0.62 * g, mt.legs, Z.head);
  const hAx = pitchAx(0.12);
  r.ell(head, hAx, [1.55 * g, 1.1 * g, 1.2 * g], mt.head, Z.head);
  r.ell(add(head, [0.95 * g, 0, -0.55 * g]), hAx, [0.95 * g, 0.72 * g, 0.55 * g], mt.head, Z.head);   // jaw
  r.ell(add(head, [-0.3 * g, 0, 0.75 * g]), hAx, [1.15 * g, 0.35 * g, 0.55 * g], mt.trim, Z.head);    // crest ridge
  for (const s of [-1, 1]) r.ball(add(head, [1.12 * g, s * 0.55 * g, 0.12 * g]), 0.33 * g, M.eye, Z.head);
  gear(T, r, { at, tAx, up, head, sh, g, hAx });
  // arms: shoulder → elbow → second elbow → hand
  const hands = weapon(T, r, m, { sh, at, tAx, species: 'not', g });
  for (const s of [0, 1]) {
    r.part();
    const side = s ? 1 : -1;
    const S = sh(side);
    const hand = hands[s] || add(S, [m.swing * -side * 1.0, side * 0.9 * g, -(B.upper + B.mid + B.fore) * 0.78 * g]);
    const e1 = add(S, mul(norm(add(sub(hand, S), [-0.8 * g, side * 1.4 * g, 0])), B.upper * g));
    const e2 = ik(e1, hand, B.mid * g, B.fore * g, [0.4, side * 0.4, -0.8]);
    r.cap(S, e1, 0.6 * g, mt.legs, Z.limb);
    r.cap(e1, e2, 0.5 * g, mt.legs, Z.limb);
    r.cap(e2, hand, 0.46 * g, mt.legs, Z.limb);
    r.ball(e1, 0.5 * g, mt.joint, Z.limb);
    r.ball(e2, 0.44 * g, mt.joint, Z.limb);
    r.ell(hand, AX, [0.55 * g, 0.45 * g, 0.45 * g], mt.joint, Z.limb);
  }
}

/** Role gear (weak spots live here). */
function gear(T, r, c) {
  const { at, tAx, up, head, g } = c;
  r.part();
  const back = (h, d = 1.5) => add(at(h), mul(tAx[0], -d * g));
  if (T.gear.includes('belt')) {
    // grenade pods around the front and sides of the waist
    for (let i = 0; i < 7; i++) {
      const a = -1.45 + i * (2.9 / 6);
      const p = add(at(0.55), add(mul(tAx[0], Math.cos(a) * 1.35 * g), mul(tAx[1], Math.sin(a) * 1.55 * g)));
      r.ball(p, 0.5 * g, M.orange, Z.grenadeBelt);
    }
  }
  if (T.gear.includes('tank')) {
    // twin fuel tanks on the back
    for (const s of [-0.62, 0.62]) {
      const b = add(back(0.2, 1.75), mul(tAx[1], s * g));
      r.cyl(b, add(b, mul(up, 3.0 * g)), 0.72 * g, M.orange, Z.fuelTank);
      r.ball(add(b, mul(up, 3.0 * g)), 0.45 * g, M.metal, Z.fuelTank);
    }
    r.box(back(2.4, 1.3), tAx, [0.25, 1.3 * g, 0.3], M.metal, Z.fuelTank);
  }
  if (T.gear.includes('pod')) {
    // rocket pod riding high on the back, tubes pointing forward over the shoulder
    const pc = add(back(1.7, 1.8), mul(tAx[1], 0.35 * g));
    const pAx = pitchAx(0.1);
    r.box(pc, pAx, [1.15 * g, 0.85 * g, 0.72 * g], M.gearBox, Z.rocketPod);
    for (const s of [-0.38, 0.38]) for (const u of [-0.3, 0.3]) {
      r.ball(add(pc, add(add(mul(pAx[0], 1.3 * g), mul(tAx[1], s * g)), mul(up, u * g))), 0.3 * g, M.orange, Z.rocketPod);    // warheads
      r.ball(add(pc, add(add(mul(pAx[0], -1.15 * g), mul(tAx[1], s * g)), mul(up, u * g))), 0.34 * g, M.orange, Z.rocketPod);   // exhausts
    }
    r.box(add(pc, mul(tAx[1], 0.95 * g)), pAx, [1.2 * g, 0.15, 0.55 * g], M.violet, Z.rocketPod);
  }
  if (T.gear.includes('radio')) {
    const rc = back(1.9, 1.7);
    r.box(rc, tAx, [0.7 * g, 1.05 * g, 1.3 * g], M.gearBox, Z.radio);
    r.box(add(rc, add(mul(tAx[0], -0.72 * g), mul(up, 0.35 * g))), tAx, [0.06, 0.9 * g, 0.55 * g], M.lime, Z.radio);   // glowing dial panel
    r.cap(add(rc, add(mul(up, 1.2 * g), mul(tAx[1], 0.8 * g))), add(rc, add(mul(up, 5.2 * g), add(mul(tAx[1], 0.9 * g), mul(tAx[0], -0.6)))), 0.2, M.antenna, Z.none);   // the whip antenna itself is not a target
    r.ball(add(rc, add(mul(up, 5.3 * g), add(mul(tAx[1], 0.9 * g), mul(tAx[0], -0.6)))), 0.3, M.lime, Z.none);
  }
  if (T.gear.includes('crest')) r.ell(add(head, [-0.4 * g, 0, 1.3 * g]), c.hAx, [1.1 * g, 0.28 * g, 0.75 * g], M.violet, Z.head);
  if (T.gear.includes('basket')) {
    const bc = back(2.2, 1.7);
    r.box(bc, tAx, [0.75 * g, 1.3 * g, 1.3 * g], M.hide, Z.torso);
    for (const [f, s, h] of [[0, -0.7, 1.5], [0.1, 0, 1.9], [0, 0.7, 1.4], [-0.3, -0.3, 1.2], [-0.3, 0.4, 1.3]]) {
      r.ell(add(bc, add(mul(tAx[1], s * g), add(mul(up, h * g), mul(tAx[0], f)))), tAx, [0.3, 0.3, 0.7], M.lime, Z.torso);
    }
  }
  if (T.gear.includes('helmet')) {
    r.ell(add(head, [-0.15 * g, 0, 0.45 * g]), c.hAx, [1.75 * g, 1.3 * g, 1.1 * g], M.metal, Z.helmet);
    r.ell(add(head, [-0.5 * g, 0, 1.5 * g]), c.hAx, [1.3 * g, 0.3 * g, 1.0 * g], M.violet, Z.helmet);
  }
  if (T.gear.includes('cape')) {
    const top = back(4.0, 1.25);
    r.box(add(top, mul(up, -2.8 * g)), pitchAx(-0.12), [0.18, 1.9 * g, 3.0 * g], M.violet, Z.torso);
  }
}

/**
 * Weapons and how they are held. Returns [leftHand, rightHand] targets (null = free arm swing).
 */
function weapon(T, r, m, c) {
  const { sh, at, tAx, g = 1 } = c;
  const w = T.weapon;
  const god = c.species === 'god';
  if (w === 'none' || m.hold === 'drop') {
    if (m.hold === 'drop' && w !== 'none') gun(T, r, add(at(0.2), [1.2, 1.8, 0]), [0.2, -1, 0], w, false, g);
    return m.hold === 'flail' ? [add(sh(-1), [-1.2, -1.2, 1.4]), add(sh(1), [-1.2, 1.2, 1.4])] : [null, null];
  }
  if (m.hold === 'flail') {
    gun(T, r, add(sh(1), [0.4, 0.8, 0.8]), norm([0.5, 0.3, 0.9]), w, false, g);
    return [add(sh(-1), [-1.0, -1.4, 1.2]), add(sh(1), [0.2, 0.7, 0.5])];
  }
  if (w === 'grenade') {
    // grenade ready in the right hand, left arm free
    const hand = m.hold === 'aim' ? add(sh(1), [-1.2, 0.8, 1.3 * g]) : add(sh(1), [0.9 + m.swing * -0.5, 0.7, -2.6 * g]);
    r.ball(add(hand, [0.2, 0, 0.35]), 0.55 * g, M.orange, Z_PASS);
    return [null, hand];
  }
  if (w === 'launcher') {
    // tube on the right shoulder
    const S = sh(1);
    const d = m.hold === 'port' ? norm([1, 0, 0.25]) : [1, 0, 0];
    const mid = add(S, [0.2, -0.3, 0.9 * g]);
    const a = add(mid, mul(d, -3.2 * g)), b = add(mid, mul(d, 3.4 * g));
    r.cyl(a, b, 0.62 * g, M.metal, Z_PASS);
    r.cyl(add(b, mul(d, -0.25)), add(b, mul(d, 0.05)), 0.66 * g, M.violet, Z_PASS);
    r.ball(add(b, mul(d, -0.1)), 0.42 * g, M.orange, Z_PASS);
    r.box(add(mid, [0.6, 0, -0.75 * g]), AX, [0.3, 0.2, 0.55], M.metal, Z_PASS);
    if (m.flash) r.ball(add(a, mul(d, -0.6)), 0.9, M.flash, Z_PASS);   // back-blast
    return [add(mid, mul(d, 1.8 * g)), add(mid, [0.6, 0, -0.9 * g])];
  }
  let grip, dir;
  const shoulder = sh(1);
  if (m.hold === 'aim') {
    dir = [1, 0, 0];
    grip = add(shoulder, [0.9 - m.recoil, -0.55, 0.05]);
  } else if (m.hold === 'port') {
    dir = norm([0.75, -0.5, 0.55]);
    grip = add(at(1.8), [0.9, 0.9, 0]);
  } else if (m.hold === 'pistol') {
    // WREN: rifle slung on the back, pistol out in the right hand
    gun(T, r, add(at(3.0), [-1.9, 0, 0]), norm([-0.1, -0.35, -1]), w, true, g);
    const hand = add(shoulder, [2.6, -0.4, -0.3]);
    r.box(add(hand, [0.55, 0, 0.25]), AX, [0.7, 0.18, 0.28], M.gun, Z_PASS);
    return [add(sh(-1), [m.swing * 0.9, -0.3, -4.0]), hand];
  } else {
    // port arms: diagonally across the chest, muzzle up and to the left
    dir = norm([0.5, -0.75, 0.45]);
    grip = add(at(1.6), [0.9, 1.0, 0]);
  }
  const hand2 = gun(T, r, grip, dir, w, false, g);
  if (m.flash) {
    const L = GUN_LEN[w] || 5;
    r.ball(add(grip, mul(dir, L + 0.7)), 0.85, M.flash, Z_PASS);
  }
  return [hand2, grip];
}
const GUN_LEN = { sniper: 6.4, rifle: 5.0, smg: 3.3, flamer: 4.4 };
/** Draw a gun with its grip at `grip` pointing along `dir`; returns the fore-grip point. */
function gun(T, r, grip, dir, w, slung, g) {
  r.part();
  const b = basis(dir);
  const [F, R, U] = b;
  const P = (fw, up, s = 0) => add(grip, add(mul(F, fw), add(mul(U, up), mul(R, s))));
  const gAx = [F, R];
  const Lz = GUN_LEN[w] || 5;
  if (w === 'sniper') {
    r.box(P(-1.0, -0.1), gAx, [0.95, 0.28, 0.45], M.gunWood, Z_PASS);   // stock
    r.box(P(0.9, 0.1), gAx, [1.1, 0.28, 0.38], M.gun, Z_PASS);          // receiver
    r.cap(P(2.0, 0.15), P(Lz, 0.15), 0.22, M.gun, Z_PASS);             // barrel
    r.cyl(P(0.2, 0.75), P(1.9, 0.75), 0.36, M.gun, Z_PASS);            // scope
    r.ball(P(1.95, 0.75), 0.24, M.lens, Z_PASS);
    return P(2.6, 0.0);
  }
  if (w === 'rifle') {
    r.box(P(-0.7, -0.05), gAx, [0.7, 0.26, 0.4], M.metal, Z_PASS);
    r.box(P(1.0, 0.1), gAx, [1.2, 0.3, 0.45], M.metal, Z_PASS);
    r.box(P(1.0, -0.6), gAx, [0.3, 0.22, 0.45], M.metal, Z_PASS);      // magazine
    r.cap(P(2.2, 0.15), P(Lz - 0.3, 0.15), 0.24, M.metal, Z_PASS);
    r.ball(P(Lz, 0.15), 0.3, M.lime, Z_PASS);
    return P(2.4, 0);
  }
  if (w === 'smg') {
    r.box(P(0.7, 0.1), gAx, [1.1, 0.3, 0.45], M.metal, Z_PASS);
    r.cap(P(1.8, 0.15), P(Lz - 0.2, 0.15), 0.22, M.metal, Z_PASS);
    r.ball(P(Lz, 0.15), 0.28, M.lime, Z_PASS);
    return P(1.6, -0.1);
  }
  if (w === 'flamer') {
    r.box(P(0.6, 0.05), gAx, [0.9, 0.3, 0.42], M.metal, Z_PASS);
    r.cyl(P(1.4, 0.15), P(Lz - 0.4, 0.15), 0.32, M.metal, Z_PASS);
    r.ball(P(Lz - 0.2, 0.15), 0.34, M.orange, Z_PASS);
    return P(2.4, 0);
  }
  return P(2, 0);
}

// ---------- prone (hunkered / crawling) ----------
function prone(T, r, frame) {
  const god = T.species === 'god', mt = T.mats;
  const f = frame & 3;
  const sw = [1, 0, -1, 0][f];
  const lay = 1.05;
  // torso along +f, head forward, legs trailing back
  const tAx = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const hips = [-1.2, 0, lay];
  const chest = [1.3, 0, lay + 0.15];
  r.ell(hips, tAx, [1.3, 1.3, 0.85], god ? mt.legs : mt.legs, Z.torso);
  r.ell(chest, tAx, [1.9, 1.7, 1.0], god ? mt.torso : mt.body, Z.torso);
  if (god && mt.webbing) r.ell([1.2, 0, lay + 0.35], tAx, [1.4, 1.8, 0.8], mt.webbing, Z.torso);
  if (god && T.pack) r.box([0.4, 0, lay + 1.05], tAx, [1.1, 1.1, 0.45], mt.pack, Z.torso);
  for (const s of [-1, 1]) {
    const knee = [-3.8, s * (1.3 + (s === sw ? 0.4 : 0)), 0.75 + (s === sw ? 0.3 : 0)];
    const foot = [-6.2 + (s === sw ? 0.6 : 0), s * 1.5, 0.6];
    r.cap([-1.4, s * 0.8, lay], knee, 0.85, mt.legs, Z.limb);
    r.cap(knee, foot, 0.72, mt.legs, Z.limb);
    r.cap(foot, add(foot, [-0.3, 0, 1.0]), 0.55, god ? mt.boots : mt.legs, Z.limb);
  }
  const head = [3.6, 0, lay + 0.75];
  if (god) {
    r.ball(head, 1.25, mt.skin, Z.head);
    if (mt.helmet) r.ell(add(head, [-0.15, 0, 0.35]), AX, [1.55, 1.55, 1.12], mt.helmet, Z.head);
    if (mt.visor) r.box(add(head, [1.0, 0, -0.1]), AX, [0.35, 1.0, 0.3], mt.visor, Z.head);
  } else {
    r.ell(head, AX, [1.5, 1.1, 1.0], mt.head, Z.head);
    for (const s of [-1, 1]) r.ball(add(head, [1.15, s * 0.5, 0.1]), 0.3, M.eye, Z.head);
  }
  // elbows planted, rifle forward
  for (const s of [-1, 1]) {
    const el = [2.6 + (s === -sw ? 0.5 : 0), s * 2.0, 0.55];
    r.cap([2.2, s * 1.5, lay + 0.3], el, 0.62, god ? (mt.sleeves || mt.torso) : mt.legs, Z.limb);
    r.cap(el, [4.2, s * 0.6, 0.9], 0.55, god ? (mt.sleeves || mt.torso) : mt.legs, Z.limb);
  }
  if (T.weapon !== 'none') gun(T, r, [3.6, 0.7, 1.0], [1, -0.05, 0.02], T.weapon === 'sniper' ? 'sniper' : T.weapon === 'grenade' || T.weapon === 'launcher' ? 'smg' : T.weapon, false, 1);
  return r.m;
}

// ---------- Sniffer: a low, fast quadruped ----------
function beast(T, pose, angle, frame) {
  let xf = null;
  if (pose === 'dead') {
    const k = [0.3, 0.7, 1.2, Math.PI / 2][frame & 3];
    xf = (p) => { const c = Math.cos(k), s = Math.sin(k); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c + (frame >= 2 ? 1.2 : 0)]; };
  }
  const r = new Rig(angle, xf);
  const f = frame & 3;
  const moving = pose === 'walk' || pose === 'run';
  const run = pose === 'run';
  const bodyZ = 4.4 + (moving && f & 1 ? 0.35 : 0);
  const body = [0, 0, bodyZ];
  const bAx = pitchAx(-0.08);
  r.ell(body, bAx, [3.3, 1.7, 1.6], M.chitin, Z.body);
  r.ell([2.4, 0, bodyZ + 0.3], bAx, [1.7, 1.8, 1.6], M.chitin, Z.body);                 // shoulders
  for (let i = 0; i < 4; i++) r.ell([-1.8 + i * 1.25, 0, bodyZ + 1.5], AX, [0.45, 0.35, 0.55], M.violet, Z.body);
  // head low and forward, jaws, four eyes
  const head = [4.6, 0, bodyZ - 0.4];
  r.ell(head, pitchAx(0.35), [1.6, 1.3, 1.1], M.chitin, Z.head);
  r.ell(add(head, [1.1, 0, -0.6]), pitchAx(0.35), [1.0, 0.9, 0.5], M.chitin, Z.head);
  for (const [s, u] of [[-0.55, 0.45], [0.55, 0.45], [-0.85, 0.05], [0.85, 0.05]]) r.ball(add(head, [1.05, s, u]), 0.26, M.eye, Z.head);
  r.ball(add(head, [1.6, 0, -0.9]), 0.3, M.limeDull, Z.head);
  // tail
  r.cap([-3.2, 0, bodyZ + 0.2], [-4.8, 0, bodyZ + 1.4], 0.45, M.chitin, Z.body);
  // four digitigrade legs
  const S = run ? 1.6 : 1.0;
  const legs = [[2.2, -1.2, 0], [2.2, 1.2, 2], [-2.0, -1.2, 2], [-2.0, 1.2, 0]];
  for (const [lf, ls, ph] of legs) {
    const k = moving ? [1, 0, -1, 0][(f + ph) & 3] : 0;
    const lift = moving && ((f + ph) & 3) === 1 ? 0.9 : 0;
    const top = [lf, ls, bodyZ - 0.6];
    const foot = [lf + k * S, ls * 1.1, lift];
    const hock = add(foot, [-0.7, 0, 1.6]);
    const knee = ik(top, hock, 2.2, 1.9, [lf > 0 ? -1 : 1, 0, 0]);
    r.cap(top, knee, 0.62, M.chitin, Z.body);
    r.cap(knee, hock, 0.45, M.chitin, Z.body);
    r.cap(hock, foot, 0.38, M.chitin, Z.body);
    r.ball(knee, 0.42, M.violet, Z.body);
  }
  return r.m;
}

// ---------- type table ----------
const GOD_MATS = { legs: M.khakiD, torso: M.khaki, sleeves: M.khaki, boots: M.boot, skin: M.skin, hands: M.boot, helmet: M.olive, webbing: M.steel, visor: M.visor, pack: M.khakiD, roll: M.olive };
const NOT_MATS = { legs: M.chitin, body: M.chitin, head: M.chitin, trim: M.violet, joint: M.limeDull, hock: M.violet, belt: M.lime, core: M.lime };
export const INFANTRY = {
  operative: { species: 'god', mats: GOD_MATS, weapon: 'sniper', pack: true, out: OUT_GOD },
  pilot: { species: 'god', mats: { legs: M.flightD, torso: M.flight, sleeves: M.flight, boots: M.boot, skin: M.skin, hands: M.boot, helmet: M.white, visor: M.darkVisor, harness: M.harness }, weapon: 'none', out: OUT_GOD },
  scientist: { species: 'god', mats: { legs: M.khakiD, torso: M.white, sleeves: M.white, boots: M.boot, skin: M.skin, hair: M.hair, badge: M.badge }, weapon: 'none', out: OUT_GOD },
  husk: { species: 'not', mats: NOT_MATS, weapon: 'rifle', gear: [], out: OUT_NOT },
  lobber: { species: 'not', mats: NOT_MATS, weapon: 'grenade', gear: ['belt'], out: OUT_NOT },
  scorcher: { species: 'not', mats: NOT_MATS, weapon: 'flamer', gear: ['tank'], out: OUT_NOT },
  launcher: { species: 'not', mats: NOT_MATS, weapon: 'launcher', gear: ['pod'], out: OUT_NOT },
  warden: { species: 'not', mats: NOT_MATS, weapon: 'smg', gear: ['radio', 'crest'], out: OUT_NOT },
  harvester: { species: 'not', mats: { ...NOT_MATS, legs: M.chitinL, body: M.chitinL, head: M.chitinL }, weapon: 'none', gear: ['basket'], out: OUT_NOT },
  vrask: { species: 'not', mats: NOT_MATS, weapon: 'smg', gear: ['helmet', 'cape'], scale: 1.1, out: OUT_NOT },
  sniffer: { species: 'beast', out: OUT_NOT, gear: [] },
};

/**
 * Render one frame. variant 'nohelm' drops Vrask's helmet once it has been shot off.
 * @returns {{pix: import('../pixel.js').Pix, zone: Uint8Array, ax: number, ay: number, w: number, h: number}}
 */
export function renderInfantry(type, pose, dir, frame = 0, variant = '') {
  let T = INFANTRY[type] || INFANTRY.husk;
  if (variant === 'nohelm' && T.gear?.includes('helmet')) T = { ...T, gear: T.gear.filter((x) => x !== 'helmet') };
  const model = build(T, pose, dir, frame);
  const lying = pose === 'prone' || (pose === 'dead' && frame >= 2);
  const w = lying ? LW : NW, h = lying ? LH : NH, ax = lying ? LAX : NAX, ay = lying ? LAY : NAY;
  const { pix, zone, top } = rasterize(model, { w, h, ax, ay, outline: T.out, scale: MODEL_SCALE, soft: Z.limb });
  return { pix, zone, top, ax, ay, w, h };
}

/** Map sprite for the sprite cache. */
function unitPainter(type) {
  return (pose, dir, frame, variant) => {
    const r = renderInfantry(type, pose, dir, frame, variant);
    // zoneMap: per-pixel hit zones, so the scope can magnify this very sprite (scopeSprites.zoneAtMap)
    // (canvas made on first draw, so hit zones also work headless)
    const P = r.pix;
    // top: height of the figure above its feet, so overhead markers clear its head (sprites.markerLift)
    return { get canvas() { return this._c || (this._c = P.toCanvas()); }, _c: null, ax: r.ax, ay: r.ay, w: r.w, h: r.h, zoneMap: r.zone, top: r.ay - r.top };
  };
}
for (const type of Object.keys(INFANTRY)) Art.register('unit', type, unitPainter(type));

