// @ts-check
import { rasterize, Z, Z_PASS } from '../model3d.js';
import { Rig, add, AX, pitchAx } from '../rig3d.js';
import { Art } from '../artStyle.js';
import { MODEL_SCALE } from './newInfantry.js';

/**
 * New-style vehicles (Art style "New"): the same ray-cast 3D models as the infantry, at the same scale,
 * so the scope can magnify the map sprite and every pixel knows what it is — the Skitter's driver
 * (a big, visible target), the Hauler driver behind open cab windows, the Fuel Hauler's tank, the
 * Skitter's jerrycans, and the armour's tiny glowing view slit on the front plate (SPEC §12.2).
 * Wrecks are the same hull, burnt out, settled and askew.
 *
 * Sprite canvas VW×VH with the ground centre at (VAX, VAY); 8 facings.
 */
export const VW = 72, VH = 56, VAX = 36, VAY = 36;

const ramp = (...c) => c;
const M = {
  hull: { ramp: ramp('#101214', '#1A1D20', '#262A2E', '#353B40', '#495158', '#646E76') },
  hullL: { ramp: ramp('#1A1D20', '#262A2E', '#353B40', '#495158', '#646E76', '#808B94') },
  tire: { ramp: ramp('#0B0C0D', '#141618', '#1E2124', '#2A2E32') },
  track: { ramp: ramp('#0C0D0E', '#16181A', '#222528', '#2F3337'), mottle: 0.5 },
  metal: { ramp: ramp('#23272A', '#3A4045', '#566067', '#76828A', '#9EA9B0') },
  gun: { ramp: ramp('#15171A', '#23272B', '#343A3F', '#4C545A'), weight: 2 },
  violet: { ramp: ramp('#2A1248', '#461E72', '#6630A8', '#8A4ED6', '#B084F0') },
  canvas: { ramp: ramp('#26123E', '#3A1C5E', '#52287E', '#6C389E', '#8A52BC'), mottle: 0.18 },
  lime: { ramp: ramp('#8AD42E', '#C4FF5A', '#EEFFA8'), emissive: true, weight: 2.5 },
  slit: { ramp: ramp('#C4FF5A', '#F4FFC0'), emissive: true, weight: 6 },
  eye: { ramp: ramp('#E4FF6A', '#FAFFD0'), emissive: true, weight: 5 },
  orange: { ramp: ramp('#5A2A0C', '#8E4416', '#C0661E', '#E8923A', '#FFC274') },
  hazard: { ramp: ramp('#141414', '#222222', '#303030') },
  cab: { ramp: ramp('#07090A', '#0E1113', '#161A1D') },   // dark cab interior
  // GOD medical truck
  khaki: { ramp: ramp('#4A4230', '#6E6444', '#968A5E', '#B8AA7C', '#D2C69A') },
  khakiD: { ramp: ramp('#3A3424', '#554C34', '#756A48', '#948760', '#AC9F76') },
  steel: { ramp: ramp('#1E3A52', '#2C5474', '#3F77A2', '#5E98C4', '#8CBCDC') },
  olive: { ramp: ramp('#262C1A', '#3A4426', '#556436', '#71844A', '#8FA35E') },
  skin: { ramp: ramp('#6A4A34', '#94704E', '#BC906A', '#D8AE86') },
  visor: { ramp: ramp('#5E9CC4', '#9FD8FF', '#D8F2FF'), emissive: true, weight: 2 },
  // burnt out
  char: { ramp: ramp('#0E0C0B', '#1A1614', '#26201C', '#342C26', '#443A32'), mottle: 0.5 },
};
const OUT = '#08090A';

/** Wheel: a short cylinder across the vehicle (tyre + hub). */
function wheel(r, f, side, rad, width, z, mats) {
  const y0 = side * 0.5 * width;
  r.cyl([f, r.halfW * side - y0, z], [f, r.halfW * side + y0, z], rad, mats.tire, Z.hull);
  r.cyl([f, r.halfW * side + y0, z], [f, r.halfW * side + y0 + 0.12 * side, z], rad * 0.45, mats.metal, Z.hull);
}
/** Tracked running gear on one side: a rounded belt with road wheels on its outer face. */
function tracks(r, len, y, width, height, mats) {
  for (const side of [-1, 1]) {
    r.part();
    const cy = side * y, hz = height / 2, rad = hz;
    r.box([0, cy, hz], AX, [len / 2 - rad, width / 2, hz], mats.track, Z.hull);
    for (const e of [-1, 1]) r.cyl([e * (len / 2 - rad), cy - width / 2, hz], [e * (len / 2 - rad), cy + width / 2, hz], rad, mats.track, Z.hull);
    const n = Math.max(3, Math.round(len / 3.6));
    for (let i = 0; i < n; i++) {
      const f = -len / 2 + rad + (i + 0.5) * (len - 2 * rad) / n;
      r.cyl([f, cy + side * width / 2, hz * 0.85], [f, cy + side * (width / 2 + 0.15), hz * 0.85], rad * 0.6, mats.metal, Z.hull);
    }
  }
}
/** A seated NOT (or GOD) driver from the waist up: the big, obvious "driver" weak spot. */
function driver(r, at, mats, god = false, k = 1) {
  r.part();
  const zone = god ? Z.none : Z.driver;
  at = [at[0], at[1], at[2]];
  const S = (v) => [v[0] * k, v[1] * k, v[2] * k];
  const P = (v) => add(at, S(v));
  r.ell(P([0, 0, 1.3]), AX, S([1.15, 1.45, 1.55]), god ? mats.khaki : mats.hullL, zone);          // torso
  for (const s of [-1, 1]) r.ell(P([0.1, s * 1.35, 2.6]), AX, S([0.95, 0.9, 0.5]), god ? mats.khakiD : mats.violet, zone);   // pauldrons
  for (const s of [-1, 1]) r.cap(P([0.2, s * 1.4, 2.4]), P([2.1, s * 0.7, 1.4]), 0.5 * k, god ? mats.khaki : mats.hullL, zone);   // arms to the wheel
  const head = P(god ? [0.2, 0, 3.8] : [0.6, 0, 4.1]);
  if (god) {
    r.ball(head, 1.2 * k, mats.skin, zone);
    r.ell(add(head, S([-0.1, 0, 0.4])), AX, S([1.45, 1.45, 0.95]), mats.olive, zone);
    r.box(add(head, S([1.0, 0, -0.05])), AX, S([0.35, 1.05, 0.3]), mats.visor, zone);
  } else {
    r.ell(head, pitchAx(0.12), S([1.5, 1.1, 1.2]), mats.hullL, zone);
    r.ell(add(head, S([0.9, 0, -0.5])), pitchAx(0.12), S([0.9, 0.7, 0.5]), mats.hullL, zone);   // jaw
    r.ell(add(head, S([-0.3, 0, 0.8])), pitchAx(0.12), S([1.1, 0.35, 0.55]), mats.violet, zone);  // crest
    for (const s of [-1, 1]) r.ball(add(head, S([1.12, s * 0.52, 0.1])), 0.34 * k, mats.eye, zone);
  }
}
/** Open-topped truck cab (front at +f): windscreen frame, solid back wall, the driver visible from above. */
function cab(r, f0, f1, halfW, mats, god, crew) {
  r.part();
  const fc = (f0 + f1) / 2, hf = (f1 - f0) / 2;
  const body = god ? mats.khaki : mats.hull;
  r.box([fc, 0, 4.1], AX, [hf, halfW, 1.2], body, Z.hull);                          // doors
  r.box([fc, 0, 5.0], AX, [hf - 0.4, halfW - 0.4, 0.2], mats.cab, Z.hull);          // dark cab floor
  for (const s of [-1, 1]) r.box([f1 - 0.3, s * (halfW - 0.25), 6.4], AX, [0.25, 0.25, 1.1], body, Z.hull);   // windscreen posts
  r.box([f1 - 0.3, 0, 7.4], AX, [0.25, halfW - 0.1, 0.18], body, Z.hull);          // windscreen top bar
  r.box([f0 + 0.3, 0, 7.6], AX, [0.35, halfW - 0.1, 2.3], body, Z.hull);             // tall back wall: no view of the driver from behind
  r.box([f1 + 1.2, 0, 3.8], AX, [1.3, halfW - 0.5, 1.2], body, Z.hull);             // engine hood
  for (const s of [-1, 1]) r.ball([f1 + 2.5, s * (halfW - 1.3), 4.3], 0.45, god ? mats.steel : mats.lime, Z.hull);   // headlights
  if (crew) driver(r, [fc + 0.4, -halfW * 0.2, 3.3], mats, god, 0.9);
}

/** Model of one vehicle type (local frame: f forward, r right, z up). */
function build(type, dir, state) {
  const wreck = state === 'wreck';
  const angle = dir * Math.PI / 4 - Math.PI / 2;
  const xf = wreck ? (p) => [p[0], p[1] * Math.cos(0.07) - p[2] * Math.sin(0.07), p[1] * Math.sin(0.07) + p[2] * Math.cos(0.07) - 0.5] : null;
  const r = /** @type {any} */ (new Rig(angle, xf));
  const god = type === 'medTruck';
  // a wreck is the same hull, burnt out: every surface charred, no lights, no crew
  const mats = wreck ? new Proxy(M, { get: () => M.char }) : M;
  const crew = state === 'ok';                          // 'nodriver': the driver has been shot
  switch (type) {
    case 'skitter': {
      // an open buggy: the driver sits high and in plain view — the big weak spot
      r.halfW = 5.0;
      r.part();
      r.box([0, 0, 2.6], AX, [8.6, 4.0, 0.9], mats.hull, Z.hull);                         // chassis
      r.box([6.0, 0, 3.7], pitchAx(0.2), [2.8, 3.6, 0.6], mats.hull, Z.hull);            // hood
      r.box([-0.4, 0, 3.8], AX, [5.0, 3.8, 0.35], mats.hull, Z.hull);                    // floor tub
      for (const s of [-1, 1]) r.box([0, s * 4.05, 4.0], AX, [7.6, 0.2, 0.4], mats.violet, Z.hull);   // side rails
      for (const s of [-1, 1]) r.ball([8.6, s * 2.7, 3.7], 0.5, mats.lime, Z.hull);     // headlights
      for (const f of [-5.8, 5.8]) for (const s of [-1, 1]) { r.part(); wheel(r, f, s, 2.5, 1.8, 2.5, mats); }
      // low roll bar behind the seats
      r.part();
      for (const s of [-1, 1]) r.cap([-2.4, s * 3.7, 4.0], [-2.4, s * 3.7, 6.4], 0.32, mats.metal, Z.hull);
      r.cap([-2.4, -3.7, 6.4], [-2.4, 3.7, 6.4], 0.32, mats.metal, Z.hull);
      // MG on a post at the back right, jerrycans on the rear deck
      r.part();
      r.cap([-4.2, 2.0, 4.0], [-4.2, 2.0, 6.8], 0.34, mats.metal, Z.hull);
      r.box([-3.8, 2.0, 7.1], AX, [1.1, 0.4, 0.45], mats.gun, Z_PASS);
      r.cap([-2.7, 2.0, 7.15], [2.2, 2.0, 7.15], 0.24, mats.gun, Z_PASS);
      r.part();
      for (const s of [-1, 1]) r.box([-7.2, s * 1.6, 5.3], AX, [1.05, 1.15, 1.45], mats.orange, Z.jerrycan);
      if (crew) driver(r, [0.2, -1.9, 3.8], mats, false, 1.25);
      break;
    }
    case 'hauler': case 'fuelHauler': case 'medTruck': {
      r.halfW = 4.5;
      r.part();
      r.box([-0.5, 0, 2.5], AX, [11, 4.0, 0.7], god ? mats.khakiD : mats.hull, Z.hull);   // chassis
      if (!god) for (const s of [-1, 1]) r.box([-0.5, s * 4.05, 2.6], AX, [10.5, 0.12, 0.3], mats.violet, Z.hull);
      for (const f of [8.2, -3.8, -7.8]) for (const s of [-1, 1]) { r.part(); wheel(r, f, s, 2.2, 1.6, 2.2, mats); }
      cab(r, 5.0, 10.2, 4.3, mats, god, crew);
      r.part();
      if (type === 'fuelHauler') {
        // the tank: side, rear and top are all orange; the cab hides its front end
        r.cyl([-11, 0, 5.6], [4.3, 0, 5.6], 3.25, mats.orange, Z.tank);
        for (const f of [-8, -3, 2]) r.cyl([f - 0.2, 0, 5.6], [f + 0.2, 0, 5.6], 3.38, mats.hazard, Z.tank);
        r.cyl([-11.25, 0, 5.6], [-11, 0, 5.6], 2.2, mats.metal, Z.tank);
        r.box([-3.5, 0, 9.0], AX, [6.5, 0.6, 0.12], mats.metal, Z.tank);                // catwalk
      } else {
        r.box([-3.4, 0, 3.6], AX, [7.8, 4.4, 0.45], god ? mats.khakiD : mats.hull, Z.hull);   // cargo bed
        const cover = god ? mats.khaki : mats.canvas;
        r.box([-3.4, 0, 5.5], AX, [7.6, 4.3, 1.5], cover, Z.hull);
        r.cyl([-11, 0, 6.6], [4.2, 0, 6.6], 4.1, cover, Z.hull);
        for (const f of [-9, -5.5, -2, 1.5]) r.cyl([f - 0.12, 0, 6.6], [f + 0.12, 0, 6.6], 4.2, god ? mats.khakiD : mats.violet, Z.hull);
        if (god) {
          // steel-blue cross on the roof and both sides
          r.box([-3.4, 0, 10.72], AX, [2.4, 0.7, 0.05], mats.steel, Z.hull);
          r.box([-3.4, 0, 10.72], AX, [0.7, 2.4, 0.05], mats.steel, Z.hull);
          for (const s of [-1, 1]) { r.box([-3.4, s * 4.36, 6.2], AX, [1.8, 0.05, 0.5], mats.steel, Z.hull); r.box([-3.4, s * 4.36, 6.2], AX, [0.5, 0.05, 1.8], mats.steel, Z.hull); }
        }
      }
      break;
    }
    case 'crawler': {
      tracks(r, 20, 5.2, 2.4, 3.0, mats);
      r.part();
      r.box([-0.6, 0, 4.4], AX, [9.4, 4.1, 1.7], mats.hull, Z.hull);                     // hull
      r.box([8.9, 0, 4.0], pitchAx(0.6), [1.6, 4.0, 1.2], mats.hull, Z.hull);           // lower glacis
      r.box([9.0, 0, 5.4], AX, [0.3, 3.2, 0.75], mats.hullL, Z.hull);                   // front plate
      r.box([9.285, 0, 5.5], AX, [0.02, 0.95, 0.32], mats.slit, Z.slit);                // view slit, flush: front only
      for (const s of [-1, 1]) r.box([-0.6, s * 4.15, 5.3], AX, [9, 0.1, 0.25], mats.violet, Z.hull);
      r.box([-10.0, 0, 4.4], AX, [0.2, 2.2, 1.3], mats.metal, Z.hull);                   // rear door
      for (const s of [-1, 1]) r.ball([9.2, s * 3.3, 4.5], 0.35, mats.lime, Z.hull);
      r.part();
      r.cyl([-2.5, 1.6, 6.1], [-2.5, 1.6, 7.4], 1.5, mats.hullL, Z.hull);               // cupola
      r.cap([-1.6, 1.6, 7.2], [3.8, 1.6, 7.2], 0.22, mats.gun, Z_PASS);
      break;
    }
    case 'brute': case 'juggernaut': {
      const big = type === 'juggernaut';
      const L = big ? 25 : 19, Y = big ? 6.6 : 5.2, TW = big ? 3.0 : 2.4, TH = big ? 3.6 : 3.0;
      tracks(r, L, Y, TW, TH, mats);
      r.part();
      const hl = L / 2 - 0.4, hw = Y - 1.1, hz = big ? 2.0 : 1.5, zc = TH + hz - 0.6;
      r.box([0, 0, zc], AX, [hl, hw, hz], mats.hull, Z.hull);
      r.box([hl + 0.1, 0, zc - 0.3], AX, [0.3, hw - 0.8, hz * 0.6], mats.hullL, Z.hull);   // front plate
      r.box([hl + 0.385, 0, zc - 0.2], AX, [0.02, big ? 0.8 : 0.75, 0.32], mats.slit, Z.slit);   // view slit, flush: front only
      for (const s of [-1, 1]) r.box([0, s * (hw + 0.1), zc + hz * 0.4], AX, [hl - 0.5, 0.1, 0.22], mats.violet, Z.hull);
      for (const s of [-1, 1]) r.ball([hl + 0.1, s * (hw - 0.4), zc - 0.6], 0.35, mats.lime, Z.hull);
      // turret and cannon(s): a hit here only rings off the armour
      r.part();
      const tz = zc + hz + (big ? 1.5 : 1.25), tf = big ? -1.6 : -0.9;
      const turretAx = wreck ? [[Math.cos(0.5), Math.sin(0.5), 0], [-Math.sin(0.5), Math.cos(0.5), 0], [0, 0, 1]] : AX;
      r.ell([tf, 0, tz], turretAx, big ? [5.4, 4.7, 1.8] : [3.7, 3.4, 1.5], mats.hullL, Z.turret);
      r.ell([tf - 1.2, -1.4, tz + (big ? 1.5 : 1.25)], AX, [0.9, 0.9, 0.35], mats.violet, Z.turret);   // hatch
      const barrels = big ? [-1.6, 1.6] : [0];
      const reach = big ? 15.5 : 12.2, dx = wreck ? Math.cos(0.5) : 1, dy = wreck ? Math.sin(0.5) : 0;
      for (const b of barrels) {
        const s0 = [tf + 2.5 * dx - b * dy, b + 2.5 * dy, tz], s1 = [tf + reach * dx - b * dy, b + reach * dy, tz];
        r.cyl(s0, s1, big ? 0.55 : 0.5, mats.metal, Z.turret);
        r.cyl(add(s1, [-0.9 * dx, -0.9 * dy, 0]), s1, big ? 0.72 : 0.66, mats.metal, Z.turret);   // muzzle brake
      }
      break;
    }
  }
  return r.m;
}

export const VEHICLE_TYPES = ['skitter', 'hauler', 'fuelHauler', 'crawler', 'brute', 'juggernaut', 'medTruck'];

/** Render one vehicle facing `dir` (0 N … 7 NW); state 'ok' | 'wreck'. */
export function renderVehicle(type, dir, state = 'ok') {
  const { pix, zone, top } = rasterize(build(type, dir, state), { w: VW, h: VH, ax: VAX, ay: VAY, outline: OUT, scale: MODEL_SCALE });
  return { pix, zone, top, ax: VAX, ay: VAY, w: VW, h: VH };
}

for (const type of VEHICLE_TYPES) {
  Art.register('vehicle', type, (dir, state) => {
    const r = renderVehicle(type, dir, state);
    const P = r.pix;
    return { get canvas() { return this._c || (this._c = P.toCanvas()); }, _c: null, ax: r.ax, ay: r.ay, w: r.w, h: r.h, zoneMap: state === 'wreck' ? null : r.zone, top: r.ay - r.top, pix: P };
  });
}
