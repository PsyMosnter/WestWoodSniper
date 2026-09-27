// @ts-check
/**
 * Art style "Chibi" — infantry (art pass 5; study page tools/art-lab/chibi.html). Detailed anime-chibi soldiers:
 * a big head (≈40 % of the figure), short limbs, oversized boots, big expressive eyes with a white glint, 3-tone
 * cel shading and dark tinted outlines. Each frame is a small 3D model ray-cast into pixels by the New style's
 * renderer (model3d.js), so all 8 facings and every frame come from one model; the joints are the same as the
 * Newest style's (rtsInfantry.pose / deathState), scaled up — so walks, runs, falls and tumbles match.
 *
 * WREN wears round steel-blue glasses; the sun catches them now and then (variant 'gl-0'…'gl-4': a white band
 * sweeps across the lenses, a little star flashes). NOT: charcoal, violet, lime (anime eyes glow lime); the
 * Scorcher wears a gas mask with round lime lenses. Per-pixel hit zones follow SPEC §12.1 (tank, pod and radio on
 * the back), weapons pass the shot through, deaths carry the unit's own blood colour (never red).
 */
import { Art } from '../artStyle.js';
import { rasterize, project, Z } from '../model3d.js';
import { Rig } from '../rig3d.js';
import { pose, deathState } from './rtsInfantry.js';
import { BLOOD as BLOODS } from '../../config/palette.js';
import { makeCanvas, pack } from '../pixel.js';

const K = 2.3;                                          // joint units (the Newest rig) → model units (= pixels)
export const STAND = { w: 48, h: 54, ax: 24, ay: 46 };
export const LIE = { w: 104, h: 84, ax: 52, ay: 50 };
const Mt = (ramp, extra = {}) => ({ ramp, ...extra });

// ------------------------------------------------------------------ materials (cel ramps: dark → mid → light)
const GLINT = Mt(['#FFFFFF'], { emissive: true, weight: 6 });
const GODM = {
  helmet: Mt(['#3E4A20', '#66773A', '#9AAE52']), skin: Mt(['#B8734A', '#E8A878', '#FFD6AE']), hair: Mt(['#3A2414', '#5E3A20', '#86562E']),
  jacket: Mt(['#6E6036', '#A69458', '#D6C48A']), pants: Mt(['#343B1A', '#55602A', '#7C8A40']), boot: Mt(['#1E1810', '#3A2E20', '#5A4830']),
  strap: Mt(['#1E4466', '#2F6FA6', '#5EA2DA']), lens: Mt(['#6C9CC4', '#9CC6E4', '#D2EAF8'], { weight: 5 }), pack: Mt(['#4A4428', '#6E6640', '#948A5C']), frame: Mt(['#16181C', '#2A2E34'], { weight: 4 }),
  gun: Mt(['#16181A', '#2E3336', '#566066'], { weight: 3 }), scope: Mt(['#22262A', '#3E464C', '#7A8690'], { weight: 3 }),
  eye: Mt(['#1A1620', '#2A2436', '#3A3448'], { weight: 4 }), mouth: Mt(['#8A4A34'], { weight: 3 }), out: '#241C10',
};
const NOTM = {
  head: Mt(['#22262C', '#3C434C', '#66707C']), body: Mt(['#1E2126', '#353B42', '#5A626C']), plate: Mt(['#3E1C70', '#6E36BA', '#A874F2']),
  lime: Mt(['#A6F03C'], { emissive: true, weight: 4 }), eye: Mt(['#C6FF5A'], { emissive: true, weight: 5 }),
  gun: Mt(['#14161A', '#2A2F35', '#4E565E'], { weight: 3 }), tank: Mt(['#7A3C10', '#D9822A', '#FFC46A']), hose: Mt(['#2E5A10', '#5E9A20', '#9FE22E'], { weight: 2 }),
  lens: Mt(['#9FE22E', '#E6FF8A'], { emissive: true, weight: 5 }), mask: Mt(['#2A2E34', '#4A525C', '#7C8692']), metal: Mt(['#3A4048', '#5E6670', '#8D96A0']),
  radio: Mt(['#24282E', '#474D55', '#6C747E']), basket: Mt(['#46341C', '#6E5430', '#9A7A4A']), out: '#1A1022',
};
const PILOT = { ...GODM, helmet: Mt(['#6E747A', '#A4AAAE', '#D0D4D2']), jacket: Mt(['#3E4842', '#646E68', '#8C9890']), pants: Mt(['#343C38', '#545E58', '#747E78']), lens: Mt(['#1A2630', '#26323C', '#5A6E80'], { weight: 5 }) };
const SCI = { ...GODM, jacket: Mt(['#8A8A84', '#C8C8C0', '#F2F2EA']), pants: Mt(['#3A3424', '#5A5038', '#7A6E4E']) };
const HARV = { ...NOTM, head: Mt(['#464C54', '#6E7680', '#9AA2AC']), body: Mt(['#3A3F46', '#5E6670', '#8A929C']) };

// joints in the Newest rig's units (see rtsInfantry.pose) — chibi proportions: short legs, big head
const HUMAN = { thigh: 1.5, shin: 1.55, hipZ: 3.1, hipW: 0.8, chest: 2.4, head: 3.7, arm: 1.4, fore: 1.35, knee: 1 };
const LANKY = { thigh: 1.9, shin: 2.0, hipZ: 3.9, hipW: 0.75, chest: 2.6, head: 4.2, arm: 1.8, fore: 1.7, knee: -1 };

/** Unit definitions. face: wren | pilot | hair | alien | mask; weapon; gear on the back / waist. */
export const CHIBI = {
  operative: { ...HUMAN, mats: GODM, face: 'wren', weapon: 'rifle', gear: ['pack'] },
  pilot: { ...HUMAN, mats: PILOT, face: 'pilot', weapon: 'none', gear: [] },
  scientist: { ...HUMAN, mats: SCI, face: 'hair', weapon: 'none', gear: [] },
  husk: { ...LANKY, mats: NOTM, face: 'alien', weapon: 'rifle', gear: [] },
  lobber: { ...LANKY, mats: NOTM, face: 'alien', weapon: 'grenade', gear: ['belt'] },
  scorcher: { ...LANKY, mats: NOTM, face: 'mask', weapon: 'flamer', gear: ['tank'] },
  launcher: { ...LANKY, mats: NOTM, face: 'alien', weapon: 'launcher', gear: ['pod'] },
  warden: { ...LANKY, mats: NOTM, face: 'alien', weapon: 'smg', gear: ['radio', 'crest'] },
  harvester: { ...LANKY, mats: HARV, face: 'alien', weapon: 'none', gear: ['basket'] },
  vrask: { ...LANKY, scale: 1.1, mats: NOTM, face: 'alien', weapon: 'smg', gear: ['helmet', 'cape', 'crest'] },
  sniffer: { beast: true, mats: NOTM },
};

// cutscene-only cast (never on the map): the voice in WREN's ear, the brass, the shield people
const OVW = { ...GODM, jacket: Mt(['#2E4A4E', '#46707A', '#72A2AA']), pants: Mt(['#2A3438', '#3E4C52', '#5A6C72']), hair: Mt(['#16100C', '#2A1E16', '#46342A']), skin: Mt(['#7A4A2E', '#A8704A', '#D09A6E']), headset: Mt(['#16181C', '#2E3238', '#565C64'], { weight: 3 }) };
const GEN = { ...GODM, jacket: Mt(['#34402C', '#52644A', '#7A8E6C']), pants: Mt(['#2A3424', '#40503A', '#5E7054']), helmet: Mt(['#26301E', '#3E4C32', '#5E7048']), hair: Mt(['#6A6660', '#9A968E', '#CAC6BC']), gold: Mt(['#8A6A1A', '#D8A83A', '#FFE08A'], { weight: 3 }), ribbon: Mt(['#1E4466', '#2F6FA6', '#5EA2DA'], { weight: 3 }), skin: Mt(['#B07A5A', '#DCA482', '#F6CCA8']) };
const ADL = { ...SCI, hair: Mt(['#6A6660', '#A29E96', '#D8D4CC']), frame: Mt(['#3A2A1A', '#5A4430'], { weight: 4 }) };
export const CAST = {
  overwatch: { ...HUMAN, mats: OVW, face: 'hair', weapon: 'none', gear: ['headset'] },
  general: { ...HUMAN, chest: 2.6, hipW: 0.95, mats: GEN, face: 'general', weapon: 'none', gear: ['medals'] },
  adler: { ...HUMAN, mats: ADL, face: 'hair', weapon: 'none', gear: ['bun'] },
};
const defOf = (type) => CHIBI[type] || CAST[type] || CHIBI.husk;

// ------------------------------------------------------------------ vector helpers
const A = (p) => [p.x * K, p.y * K, p.z * K];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mid = (a, b) => mul(add(a, b), 0.5);
const rad = (d) => (d * Math.PI) / 180;

/** a frame on a joint: origin o, forward F, right R, up U; at(a, b, c) = o + aF + bR + cU */
function frameAt(o, F, U) { const f = nrm(F), u = nrm(U), r = cross(u, f); return { o, F: f, R: r, U: u, at: (a, b, c) => add(o, add(mul(f, a), add(mul(r, b), mul(u, c)))) }; }

const ATTACH = [
  ['headF', 'head', [1, 0, 0]], ['headU', 'head', [0, 0, 1]], ['chestF', 'chest', [1, 0, 0]], ['chestU', 'chest', [0, 0, 1]],
];

// ------------------------------------------------------------------ humanoid model
function humanoid(r, d, st, opt) {
  const M = d.mats, J = pose(d, { ...st, attach: ATTACH });
  const gear = d.gear, human = d.face === 'wren' || d.face === 'pilot' || d.face === 'hair' || d.face === 'general';
  // lying down, the round chibi body and big head rest on their surfaces instead of sinking into the ground
  const lift = (keys, dz) => { if (dz > 0) for (const k of keys) J[k] = { ...J[k], z: J[k].z + dz }; };
  const heads = ['head', 'headF', 'headU'];
  lift(Object.keys(J), 1.35 - (J.chest.z + (J.hipL.z + J.hipR.z) / 2) / 2);
  lift(heads, 2.5 - J.head.z);
  if (opt.headUp) { J.head = { ...J.head, z: Math.max(J.head.z, 2.9) }; J.headF = { ...J.head, x: J.head.x + 1 }; J.headU = { ...J.head, z: J.head.z + 1 }; }
  const body = frameAt(A(J.chest), sub(A(J.chestF), A(J.chest)), sub(A(J.chestU), A(J.chest)));
  let head = frameAt(A(J.head), sub(A(J.headF), A(J.head)), sub(A(J.headU), A(J.head)));
  if (opt.yaw || opt.tilt) {                     // cutscenes: turn the head (yaw), nod or look down (tilt)
    const cy = Math.cos(opt.yaw || 0), sy = Math.sin(opt.yaw || 0), ct = Math.cos(opt.tilt || 0), stt = Math.sin(opt.tilt || 0);
    const F1 = add(mul(head.F, cy), mul(head.R, sy));
    head = frameAt(head.o, sub(mul(F1, ct), mul(head.U, stt)), add(mul(head.U, ct), mul(F1, stt)));
  }
  const pelvis = mid(A(J.hipL), A(J.hipR));
  const legR = human ? 1.8 : 1.35, armR = human ? 1.35 : 0.95;
  const legMat = human ? M.pants : M.body, armMat = human ? M.jacket : M.body;
  // legs & boots
  for (const s of ['L', 'R']) {
    r.part();
    r.cap(A(J['hip' + s]), A(J['knee' + s]), legR, legMat, Z.limb);
    r.cap(A(J['knee' + s]), A(J['foot' + s]), legR * 0.92, legMat, Z.limb);
    if (!human) r.ball(A(J['knee' + s]), 0.9, M.lime, Z.limb);
    r.ell(add(A(J['foot' + s]), mul(body.F, 0.8)), [body.F, body.R], [human ? 2.6 : 2.3, human ? 1.7 : 1.4, human ? 1.3 : 1], human ? M.boot : M.body, Z.limb);
  }
  // torso
  r.part();
  const tc = mid(pelvis, body.o);
  r.ell(tc, [body.F, body.R], human ? [3.1, 4.1, 4.6] : [2.8, 3.4, 4.8], human ? M.jacket : M.body, Z.torso);
  if (human) {
    if (d.face === 'wren') r.cap(body.at(2.8, 3.2, 2.2), body.at(2.9, -2.4, -3.2), 0.6, M.strap, Z.torso);
    if (gear.includes('medals')) { for (const [y, m] of [[-1.2, M.ribbon], [-2.2, M.gold], [-3.2, M.ribbon]]) r.box(body.at(3.2, y, 1.4), [body.F, body.R], [0.4, 0.45, 0.6], m, Z.torso); r.ball(body.at(3.1, -2.2, 0.2), 0.6, M.gold, Z.torso); for (const s2 of [-1, 1]) r.box(body.at(0, s2 * 3.6, 3.4), [body.F, body.R], [1.4, 1, 0.35], M.gold, Z.torso); }
    r.cyl(add(pelvis, mul(body.U, 0.9)), add(pelvis, mul(body.U, 1.9)), 3.9, M.boot, Z.torso);
  } else {
    r.ball(body.at(2.3, 0, -0.6), 0.9, M.lime, Z.torso);
    for (const s of [-1, 1]) r.ell(body.at(-0.2, s * 3.6, 2.6), [body.F, body.R], [2.2, 2, 1.7], M.plate, Z.torso);
  }
  // gear on the back (hidden by the torso from the front — SPEC §12.1) and at the waist
  r.part();
  if (gear.includes('tank')) { for (const s of [-1, 1]) r.cyl(body.at(-3.6, s * 1.6, -4.4), body.at(-3.6, s * 1.6, 2.2), 1.6, M.tank, Z.fuelTank); r.cap(body.at(-3.4, 0, 2.6), head.at(2.8, 0, -3.4), 0.5, M.hose, Z.fuelTank); }
  if (gear.includes('pod')) { r.box(body.at(-3.6, 0, -0.8), [body.F, body.R], [1.4, 2.6, 3], M.metal, Z.rocketPod); for (const s of [-1, 1]) r.ball(body.at(-3.6, s * 1.3, 2.4), 0.7, M.lime, Z.rocketPod); }
  if (gear.includes('radio')) { r.box(body.at(-3.5, 0, -0.6), [body.F, body.R], [1.3, 2.2, 2.8], M.radio, Z.radio); r.cap(body.at(-3.6, 1.4, 2), body.at(-4.4, 1.6, 11), 0.3, M.gun, 255); r.ball(body.at(-4.4, 1.6, 11.4), 0.55, M.lime, 255); }
  if (gear.includes('pack')) { r.box(body.at(-3.3, 0, -0.4), [body.F, body.R], [1.3, 2.6, 2.6], M.pack, Z.torso); r.box(body.at(-3.9, 0, -1.6), [body.F, body.R], [0.8, 2, 1], M.pants, Z.torso); }
  if (gear.includes('basket')) r.box(body.at(-3.6, 0, -1), [body.F, body.R], [1.6, 2.8, 3.2], M.basket, Z.torso);
  if (gear.includes('cape')) r.ell(body.at(-3.1, 0, -2.6), [body.F, body.R], [0.8, 4.2, 5.6], M.plate, Z.torso);
  if (gear.includes('belt')) for (const s of [-1.6, 0, 1.6]) r.ball(add(add(pelvis, mul(body.F, 2.6)), add(mul(body.R, s), mul(body.U, 1.2))), 1, M.tank, Z.grenadeBelt);
  // arms
  for (const s of ['L', 'R']) {
    r.part();
    r.cap(A(J['sh' + s]), A(J['elb' + s]), armR, armMat, Z.limb);
    r.cap(A(J['elb' + s]), A(J['hand' + s]), armR * 0.92, armMat, Z.limb);
    r.ball(A(J['hand' + s]), human ? 1.2 : 0.9, human ? M.skin : M.body, Z.limb);
  }
  // weapon (zone 255: never takes the hit itself)
  r.part();
  const wp = st.dropGun ? 'none' : st.weapon || d.weapon;
  // cutscene props in the hands
  const prop = opt.prop;
  if (prop === 'rod') { const a = sub(A(J.handR), [1.5, 0, 1.2]), b = add(A(J.handL), [11, 2.5, 12]); r.cap(a, b, 0.35, M.boot, 255); r.ball(a, 0.8, M.boot, 255); opt.rodTip = b; }
  if (prop === 'pointer') { r.cap(A(J.handR), add(A(J.handR), [9, -1, -3]), 0.3, M.boot, 255); }
  if (prop === 'handset') r.box(add(A(J.handR), [0.4, 0, 0.6]), [[0, 0, 1], [0, 1, 0]], [2, 0.7, 0.8], M.gun || M.frame, 255);
  if (prop === 'clipboard') r.box(add(A(J.handL), [0.6, 0.8, 0.8]), [nrm([1, 0, 1.2]), [0, 1, 0]], [2.4, 1.9, 0.2], Mt(['#6E5430', '#9A7A4A', '#C8A870']), 255);
  // guns point the way the unit faces (level when aiming or prone, a little down at the hip)
  const hR = A(J.handR), hL = A(J.handL), F = nrm([1, 0, st.arms === 'hold' || st.arms === 'pistol' ? -0.15 : 0]), UP = [0, 0, 1];
  let tip = null;
  if (wp === 'rifle') {
    const a = sub(hR, mul(F, 3)), b = add(hL, mul(F, human ? 7 : 4.5));
    r.cap(a, b, human ? 0.55 : 0.6, M.gun, 255);
    if (human) r.cyl(add(mid(a, b), add(mul(F, -1.5), mul(UP, 1.1))), add(mid(a, b), add(mul(F, 2), mul(UP, 1.1))), 0.8, M.scope, 255);
    else r.ball(b, 0.6, M.lime, 255);
    tip = b;
  } else if (wp === 'smg' || wp === 'pistol') { const b = add(hR, mul(F, wp === 'smg' ? 3.6 : 2.4)); r.cap(sub(hR, mul(F, 0.8)), b, 0.55, M.gun, 255); tip = b; }
  else if (wp === 'flamer') { const b = add(hL, mul(F, 3.4)); r.cyl(sub(hR, mul(F, 1.2)), b, 0.8, M.gun, 255); r.ball(b, 0.8, M.tank, 255); tip = b; }
  else if (wp === 'launcher') { const sh = A(J.shR); const a = add(sub(sh, mul(F, 4)), mul(UP, 1.4)), b = add(add(sh, mul(F, 7)), mul(UP, 1.6)); r.cyl(a, b, 1.2, M.metal, 255); tip = b; }
  else if (wp === 'grenade') r.ball(hR, 1.1, M.tank, 255);
  if (wp === 'pistol' && d.weapon === 'rifle') r.cap(body.at(-3.4, -2.6, -3.5), body.at(-3.4, 2.4, 3.6), 0.5, M.gun, 255);   // rifle slung on the back
  // head
  r.part();
  const H = head;
  if (human) {
    r.ball(H.o, 6.2, M.skin, Z.head);
    r.ell(H.at(-1.4, 0, -0.6), [H.F, H.R], [5.4, 6.2, 5.6], M.hair, Z.head);
    if (d.face === 'general') {                                                                     // peaked cap
      r.ell(H.at(-0.6, 0, 3.8), [H.F, H.R], [6.6, 6.8, 3.4], M.helmet, Z.head);
      r.ell(H.at(4.4, 0, 1.6), [H.F, H.R], [2.8, 5.6, 0.5], M.boot, Z.head);
      r.ball(H.at(5.6, 0, 4.2), 0.9, M.gold, Z.head);
      for (const s2 of [-1, 1]) r.ell(H.at(5.7, s2 * 1.3, -2.2), [H.F, H.R], [0.9, 1.6, 0.8], M.hair, Z.head);   // moustache
    } else if (d.face !== 'hair') {
      r.ell(H.at(-1.1, 0, 3.1), [H.F, H.R], [6.4, 6.9, 4.2], M.helmet, Z.head);
      r.cyl(H.at(-1.1, 0, 1.4), H.at(-1.1, 0, 2.1), 7, M.helmet, Z.head);
    } else r.ell(H.at(-0.6, 0, 2.6), [H.F, H.R], [5.8, 6.4, 3.6], M.hair, Z.head);
    if (gear.includes('bun')) r.ball(H.at(-5.4, 0, 3), 2.4, M.hair, Z.head);
    if (gear.includes('headset')) {
      r.cap(H.at(0, -6.2, 0.6), H.at(0, -3.6, 5.8), 0.55, M.headset, Z.head); r.cap(H.at(0, -3.6, 5.8), H.at(0, 3.6, 5.8), 0.55, M.headset, Z.head); r.cap(H.at(0, 3.6, 5.8), H.at(0, 6.2, 0.6), 0.55, M.headset, Z.head);
      for (const s2 of [-1, 1]) r.ell(H.at(0, s2 * 6.3, -0.4), [H.F, H.R], [1.8, 0.9, 2], M.headset, Z.head);
      r.cap(H.at(0.6, 6.6, -1.4), H.at(5.2, 2.6, -3.8), 0.3, M.headset, Z.head); r.ball(H.at(5.4, 2.4, -3.9), 0.7, M.headset, Z.head);
    }
    if (opt.brow != null && d.face !== 'pilot') {                                                  // cutscenes: eyebrows (−1 cross … +1 raised)
      const b = opt.brow, bz = d.face === 'wren' ? 2.5 : 2.1;
      for (const s2 of [-1, 1]) r.cap(H.at(5.4, s2 * 1.3, bz - b * 0.2 - (b < 0 ? 0.5 : 0)), H.at(5.0, s2 * 3.4, bz + b * 0.7), 0.42, d.face === 'wren' ? M.hair : M.hair, Z.head);
    }
    if (d.face === 'wren') {
      // round glasses over the eyes: steel-blue lenses in a thin frame, a bridge, arms back to the ears
      // pale lenses with the eyes showing through, so he keeps his anime eyes behind them
      for (const s of [-1, 1]) {
        r.ell(H.at(5.95, s * 2.25, -0.4), [H.F, H.R], [0.8, 1.85, 1.85], M.frame, Z.head);
        r.ell(H.at(6.2, s * 2.25, -0.4), [H.F, H.R], [0.6, 1.5, 1.5], M.lens, Z.head);
        r.ell(H.at(6.65, s * 2.05, -0.6), [H.F, H.R], [0.3, 0.55, 0.95], M.eye, Z.head);
        r.cap(H.at(5.4, s * 3.9, 0), H.at(2.2, s * 5.8, 0.4), 0.3, M.frame, Z.head);
      }
      r.cap(H.at(6.3, -0.7, -0.1), H.at(6.3, 0.7, -0.1), 0.3, M.frame, Z.head);
    } else if (d.face === 'pilot') {
      r.ell(H.at(5.2, 0, -0.2), [H.F, H.R], [1.4, 5.2, 1.8], M.lens, Z.head);                          // dark visor
    } else {
      for (const s of [-1, 1]) { r.ell(H.at(5.5, s * 2.3, -0.6), [H.F, H.R], [0.9, 1.35, 2.1], M.eye, Z.head); r.ball(H.at(6.2, s * 1.9, 0.3), 0.55, GLINT, Z.head); }
    }
    r.ell(H.at(5.9, 0, -3.3), [H.F, H.R], [0.4, 0.9, 0.35], M.mouth, Z.head);
    opt.anch = { mouth: H.at(6.1, 0, -3.3), eyeL: H.at(6.0, -2.3, -0.4), eyeR: H.at(6.0, 2.3, -0.4), top: H.at(0, 0, 10), eyes: d.face === 'wren' || d.face === 'pilot' ? '' : 'anime' };
  } else {
    r.ell(H.o, [add(H.F, mul(H.U, 0.25)), H.R], [5.4, 5.6, 7], M.head, Z.head);
    if (d.face === 'mask') {
      r.ell(H.at(3.4, 0, -2), [H.F, H.R], [3, 4.6, 3.4], M.mask, Z.head);
      for (const s of [-1, 1]) r.ball(H.at(5.4, s * 2.3, -0.2), 1.6, M.lens, Z.head);
      r.cyl(H.at(5.4, 0, -3), H.at(7.2, 0, -3.6), 1.2, M.mask, Z.head);
    } else {
      for (const s of [-1, 1]) { r.ell(H.at(4.6, s * 2.5, -0.6), [H.F, H.R], [1, 1.5, 2.2], M.eye, Z.head); r.ball(H.at(5.4, s * 2.1, 0.4), 0.5, GLINT, Z.head); }
    }
    if (gear.includes('crest')) r.ell(H.at(-1, 0, 5), [H.F, H.R], [2.4, 1, 1.8], M.plate, Z.head);
    opt.anch = { mouth: null, eyeL: H.at(5.0, -2.5, -0.6), eyeR: H.at(5.0, 2.5, -0.6), top: H.at(0, 0, 11), eyes: 'glow' };
    if (gear.includes('helmet') && !opt.nohelm) {                                                   // Vrask's helmet
      r.ell(H.at(-0.2, 0, 2.6), [H.F, H.R], [6.2, 6.4, 5.4], M.plate, Z.helmet);
      r.ell(H.at(5.4, 0, 0.4), [H.F, H.R], [0.6, 3.6, 0.7], M.lime, Z.helmet);
      r.ell(H.at(-0.6, 0, 7.6), [H.F, H.R], [4.6, 0.9, 2], M.head, Z.helmet);                   // a dark crest fin
      r.ball(H.at(3.4, 0, 7), 0.7, M.lime, Z.helmet);
    }
  }
  opt.faceF = H.F;
  return { J, body, tip };
}

/** The Sniffer, chibi: a stubby four-legged hunting beast with a big head and four lime eyes. */
function sniffer(rig, st) {
  const S = 1.3, sc = (p) => mul(p, S);                                  // modelled small, drawn 1.3× (a hound, not a cat)
  const r = {
    part: () => rig.part(), cap: (a, b, q, m, z) => rig.cap(sc(a), sc(b), q * S, m, z), ball: (c, q, m, z) => rig.ball(sc(c), q * S, m, z),
    ell: (c, ax, rr, m, z) => rig.ell(sc(c), ax, mul(rr, S), m, z),
  };
  const M = NOTM, walking = st.walk != null, run = !!st.run;
  const a = (st.walk || 0) * Math.PI * 2, bob = walking ? Math.abs(Math.sin(a)) * 0.8 : 0;
  const bodyZ = 7 + bob;
  for (const [lx, ly, off] of [[3.4, -2.4, 0], [3.4, 2.4, 0.5], [-3.4, -2.4, 0.5], [-3.4, 2.4, 0]]) {
    r.part();
    const q = a + off * Math.PI * 2;
    const fx = lx + (walking ? Math.cos(q) * (run ? 2.4 : 1.6) : 0), lift = walking ? Math.max(0, -Math.sin(q)) * 1.8 : 0;
    const top = [lx, ly, bodyZ - 1], foot = [fx, ly * 1.1, lift], knee = [(lx + fx) / 2 + (lx > 0 ? -1 : 1), ly * 1.05, (bodyZ + lift) / 2 + 0.6];
    r.cap(top, knee, 1.3, M.body, Z.body); r.cap(knee, foot, 1, M.body, Z.body); r.ball(knee, 0.8, M.plate, Z.body);
  }
  r.part();
  r.ell([0, 0, bodyZ + 0.6], [[1, 0, 0], [0, 1, 0]], [6, 3.6, 3.2], M.body, Z.body);
  for (let i = 0; i < 4; i++) r.ball([-3 + i * 2, 0, bodyZ + 3.6], 1, M.plate, Z.body);
  r.cap([-5.6, 0, bodyZ + 1], [-9, 0, bodyZ + 3.2], 0.8, M.body, Z.body);
  r.part();
  const h = [7.4, 0, bodyZ + 2.4];
  r.ell(h, [[1, 0, 0.3], [0, 1, 0]], [4.4, 4.2, 3.8], M.head, Z.head);
  for (const [ey, ez] of [[-1.6, 0.8], [1.6, 0.8], [-2.4, -0.6], [2.4, -0.6]]) r.ball([h[0] + 3.6, ey, h[2] + ez], 0.8, M.eye, Z.head);
  if (st.bite) r.ell([h[0] + 4.4, 0, h[2] - 2.2], [[1, 0, 0], [0, 1, 0]], [1.6, 2, 0.8], Mt(['#DDE8C0'], { weight: 3 }), 255);
}

// ------------------------------------------------------------------ frames
/**
 * Render one frame. variant: 'nohelm', 'dk-shot' | 'dk-takedown' | 'dk-explosion', 'bl-<blood>', 'gl-0'…'gl-4'
 * (WREN's glasses catching the sun), '|'-separated.
 * @returns {{pix: import('../pixel.js').Pix, zone: Uint8Array, w: number, h: number, ax: number, ay: number, top: number, lying: boolean}}
 */
export function renderChibi(type, pose_, dir, frame = 0, variant = '') {
  const d = CHIBI[type] || CHIBI.husk;
  const v = String(variant || '');
  let dk = (v.match(/dk-(\w+)/) || [])[1] || 'shot';
  if (dk === 'headshot') dk = 'shot';
  const armsIdle = d.weapon === 'none' ? 'swing' : d.weapon === 'launcher' ? 'shoulder' : 'hold';
  const n6 = (f) => (((f % 6) + 6) % 6) / 6;
  let st, deadT = -1, lying = false;
  switch (pose_) {
    case 'walk': st = { gait: 'walk', ph: n6(frame), arms: armsIdle, walk: n6(frame) }; break;
    case 'run': st = { gait: 'run', ph: n6(frame), arms: armsIdle, walk: n6(frame), run: true }; break;
    case 'pistol': st = { gait: 'walk', ph: n6(frame), arms: 'pistol', weapon: 'pistol', walk: n6(frame) }; break;
    case 'crouch': st = { kneel: 0.8, arms: d.weapon === 'none' ? 'limp' : d.weapon === 'launcher' ? 'shoulder' : 'aim', lean: 0.3 }; break;
    case 'cover': st = { kneel: 1, arms: d.weapon === 'none' ? 'limp' : 'hold', lean: -0.3 }; break;
    case 'fire': st = { kneel: 0.8, arms: d.weapon === 'launcher' ? 'shoulder' : 'aim', lean: 0.3, recoil: frame & 1 ? 0.4 : 0, bite: !(frame & 1) }; break;
    case 'prone': st = { pitch: rad(86), pivotZ: 0, arms: 'prone', lean: 0, rootX: -d.hipZ * 0.35 }; lying = true; break;
    case 'crawl': st = { pitch: rad(86), pivotZ: 0, arms: 'prone', lean: 0, rootX: -d.hipZ * 0.35, crawl: (frame & 3) * (Math.PI / 2) }; lying = true; break;
    case 'dead': deadT = Math.min(1, frame / 11); st = d.beast ? {} : deathState(d, dk, deadT); lying = true; break;
    default: st = { arms: armsIdle };
  }
  // the Sniffer rolls onto its side when it dies
  const xf = d.beast && deadT >= 0 ? (p) => {
    const a = rad(95) * Math.min(1, deadT / 0.6), y = p[1], z = p[2] - 3;
    return [p[0] - 3 * Math.min(1, deadT / 0.4), y * Math.cos(a) - z * Math.sin(a), Math.max(0.5, 3 + y * Math.sin(a) + z * Math.cos(a) - 2 * Math.min(1, deadT / 0.6))];
  } : null;
  const r = new Rig(rad(dir * 45 - 90), xf);
  const built = d.beast ? (sniffer(r, st), null) : humanoid(r, d, st, { nohelm: v.includes('nohelm'), headUp: pose_ === 'prone' || pose_ === 'crawl' });
  const box = lying || (d.beast && deadT >= 0) ? LIE : STAND;
  const out = rasterize(r.m, { w: box.w, h: box.h, ax: box.ax, ay: box.ay, outline: d.mats.out, scale: 1 });
  const { pix, zone } = out;
  const put = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < box.w && y < box.h) pix.set(x, y, c); };
  // muzzle flash on the first 'fire' frame
  if (built && pose_ === 'fire' && !(frame & 1) && built.tip) {
    const [sx, sy] = project(r.W(add(built.tip, [1.5, 0, 0])));
    for (const [dx, dy, c] of [[0, 0, '#FFF1A8'], [1, 0, '#FFF1A8'], [0, -1, '#FFC24A'], [2, 0, '#FFC24A'], [1, 1, '#FFC24A']]) put(box.ax + sx + dx, box.ay + sy + dy, c);
  }
  // blood of a death: droplets fly back out of the wound on arcs, splat where they land; a mist puff on the hit
  if (deadT >= 0 && (d.beast || dk !== 'takedown')) {
    const b = BLOODS.find((q) => q.name === (v.match(/bl-(\w+)/) || [])[1]) || BLOODS[0], cols = [b.main, b.shade, b.hi];
    let s = 5; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const kind = d.beast ? 'shot' : dk, n = kind === 'shot' ? 26 : 14, tt = deadT * 1.1, cz = d.beast ? 8 : (d.hipZ + d.chest) * K * (d.scale || 1);
    for (let i = 0; i < n; i++) {
      const vx = -(22 + rnd() * 50), vy = (rnd() - 0.5) * 36, vz = 14 + rnd() * 40, t0 = rnd() * 0.16, c = cols[Math.floor(rnd() * 3)];
      const q = tt - t0; if (q < 0) continue;
      const tl = (2 * vz) / 160, qq = Math.min(q, tl), landed = q >= tl;
      const p = [vx * qq + 2, vy * qq, landed ? 0 : cz + vz * qq - 80 * qq * qq];
      const [sx, sy] = project(r.W(p));
      put(box.ax + sx, box.ay + sy, c); if (landed) put(box.ax + sx + 1, box.ay + sy, c); else if (i % 3 === 0) put(box.ax + sx, box.ay + sy + 1, c);
    }
    if (kind === 'shot' && deadT < 0.25) {
      const [cx, cy] = project(r.W([1, 0, cz])), R = 1.5 + deadT * 12;
      for (let yy = -Math.ceil(R); yy <= Math.ceil(R); yy++) for (let xx = -Math.ceil(R); xx <= Math.ceil(R); xx++) {
        const dd = Math.hypot(xx, yy) / R; if (dd > 1 || (((xx + yy) & 1) && dd > 0.5)) continue;
        put(box.ax + cx + xx, box.ay + cy + yy, dd < 0.45 ? b.hi : b.main);
      }
    }
  }
  if (deadT >= 0 && dk === 'explosion' && !d.beast) {                                     // charred
    for (let i = 0; i < pix.data.length; i++) { const c = pix.data[i]; if (!(c >>> 24)) continue; const k = 1 - Math.min(0.35, deadT * 0.6); pix.data[i] = ((c & 0xFF000000) | ((((c >>> 16) & 255) * k) << 16) | ((((c >>> 8) & 255) * k) << 8) | ((c & 255) * k)) >>> 0; }
  }
  const gl = (v.match(/gl-(\d)/) || [])[1];
  if (gl != null && d.face === 'wren') addGleam(pix, (+gl + 1) / 6);
  return { pix, zone, w: box.w, h: box.h, ax: box.ax, ay: box.ay, top: box.ay - out.top, lying };
}

/**
 * The sun catching WREN's glasses: a thin bright diagonal band sweeps across the lens pixels only (t 0 → 1), white
 * in the middle with a pale halo, and a little 4-point star flashes on the rim of the far lens. k: pixels per model
 * unit (big cutscene renders sweep a proportionally wider band).
 */
const LENS = new Set(GODM.lens.ramp.map((c) => parseInt(c.slice(1), 16)));
export function addGleam(pix, t, k = 1) {
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
  // each lens gets its own sweep (the sun hits both at once)
  const midX = (x0 + x1) / 2, lenses = [cells.filter((c) => c[1] < midX), cells.filter((c) => c[1] >= midX)];
  for (const L of lenses) {
    if (!L.length) continue;
    let a = w, b = -1, top = h;
    for (const [, x, y] of L) { a = Math.min(a, x); b = Math.max(b, x); top = Math.min(top, y); }
    const band = a - 1.5 * k + t * (b - a + 3 * k);
    for (const [i, x, y] of L) {
      const dd = Math.abs(x - band + (y - top) * 0.8);
      if (dd < 1.0 * k) pix.data[i] = 0xFFFFFFFF;
      else if (dd < 1.8 * k) pix.data[i] = 0xFFFFF8EC;
    }
  }
  if (t > 0.5 && t < 0.8) {
    const R = Math.round((t > 0.58 && t < 0.72 ? 2 : 1) * k), sx = x1, sy = y0 - 1;
    const put = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) pix.data[y * w + x] = 0xFFFFFFFF; };
    put(sx, sy); for (let j = 1; j <= R; j++) { put(sx + j, sy); put(sx - j, sy); put(sx, sy + j); put(sx, sy - j); }
  }
}

/** A soft ground shadow (canvas made lazily): an ellipse under the feet, longer for a body lying down. */
const shadowCache = new Map();
function shadowOf(box, lying) {
  const key = box.w + 'x' + box.h + (lying ? 'L' : 'S');
  let s = shadowCache.get(key);
  if (s) return s;
  s = {
    get canvas() {
      if (this._c) return this._c;
      const c = makeCanvas(box.w, box.h), g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
      g.fillStyle = 'rgba(12,10,6,0.36)';
      const rx = lying ? 15 : 9, ry = lying ? 4 : 3, cx = box.ax + 2, cy = box.ay;
      for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(1 - (y * y) / (ry * ry + 0.5))); g.fillRect(cx - w, cy + y, 2 * w, 1); }
      return (this._c = c);
    }, _c: null, ax: box.ax, ay: box.ay, w: box.w, h: box.h,
  };
  shadowCache.set(key, s);
  return s;
}

/** Map-sprite painter: canvas (lazy), hit-zone map, top, and a ground shadow. */
function painter(type) {
  return (pose_, dir, frame, variant) => {
    const r = renderChibi(type, pose_, dir, frame, variant);
    const P = r.pix;
    return {
      get canvas() { return this._c || (this._c = P.toCanvas()); }, _c: null,
      ax: r.ax, ay: r.ay, w: r.w, h: r.h, zoneMap: r.zone, top: r.top,
      shadow: shadowOf(r.lying ? LIE : STAND, r.lying),
    };
  };
}
for (const type of Object.keys(CHIBI)) Art.registerChibi('unit', type, painter(type));
