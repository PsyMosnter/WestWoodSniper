// @ts-check
import { Pix, pack, shade } from '../pixel.js';
import { Art } from '../artStyle.js';

/**
 * Vehicle sprites (SPEC §4.5, §12.2).
 * World sprites use "sprite stacking": each vehicle is a stack of horizontal layers defined as
 * colour functions f(u, v, z) in local coords (u forward, v right, z up), rotated to any of 8 facings.
 * Scope close-ups (96×64, front/back/right; left mirrored) carry the hit zones.
 */
const CH = ['#141618', '#22262A', '#343A3F', '#4C545A', '#66707A'];
const LIME = ['#4E8A1C', '#7CC42E', '#A6F03C', '#E4FF6A'];
const VIO = ['#3A1A60', '#6A34A8', '#9B5AE0', '#C9A0FF'];
const OR = ['#7A3A10', '#C0621E', '#E8923A', '#FFD27A'];
const MET = ['#23262A', '#3A3F42', '#5A6166', '#8A949A', '#B4BCC0'];
const TRK = ['#101112', '#1C1E20', '#2C2F32'];
const KH = ['#4A4430', '#7C7049', '#A89968', '#C4B687'];
const STEEL = ['#2A4A66', '#4A7FA8', '#6FA2C8', '#9FD8FF'];
const EYE = '#E4FF6A';

const rr = (u, v, hu, hv, r = 1) => { const du = Math.max(0, Math.abs(u) - hu + r), dv = Math.max(0, Math.abs(v) - hv + r); return du * du + dv * dv <= r * r; };
const circ = (u, v, cu, cv, r) => (u - cu) ** 2 + (v - cv) ** 2 <= r * r;

/** layer definitions: { L, W, H, f(u,v,z) } */
export const VEH_SHAPES = {
  skitter: { L: 16, W: 10, H: 8, f(u, v, z) {
    if (z <= 2 && [[-5, -4.5], [-5, 4.5], [5, -4.5], [5, 4.5]].some(([a, b]) => circ(u, v, a, b, 2.2))) return TRK[1];
    if (z >= 2 && z <= 3 && rr(u, v, 7.5, 4, 1.5)) return z === 3 ? CH[3] : CH[2];
    if (z >= 3 && z <= 5 && u < -5.5 && u > -8.2 && Math.abs(v) < 3 && Math.abs(v) > 0.5) return z === 5 ? OR[3] : OR[2]; // jerrycans
    if (z >= 4 && z <= 6 && circ(u, v, 1, -1.5, 1.4)) return z === 6 ? CH[4] : CH[2]; // driver
    if (z === 6 && Math.abs(u - 2) < 0.6 && Math.abs(v + 1.5) < 0.6) return EYE;
    if (z >= 4 && z <= 7 && Math.abs(u + 2) < 0.7 && Math.abs(v - 1.5) < 0.7) return MET[2]; // MG post
    if (z === 7 && u > -2 && u < 5 && Math.abs(v - 1.5) < 0.6) return MET[1];
    if (z === 4 && Math.abs(v) > 3.3 && Math.abs(v) < 4.3 && Math.abs(u) < 6) return LIME[1]; // roll bar trim
    return null;
  } },
  hauler: { L: 24, W: 11, H: 10, f(u, v, z) {
    if (z <= 2 && [[-8, -5], [-8, 5], [-3, -5], [-3, 5], [8, -5], [8, 5]].some(([a, b]) => circ(u, v, a, b, 2.3))) return TRK[1];
    if (z >= 2 && z <= 3 && rr(u, v, 11.5, 5, 1)) return CH[1];
    if (z >= 3 && z <= 8 && u > 5 && rr(u - 8.5, v, 3.5, 4.8, 1.2)) { if (z >= 6 && u > 10.5) return '#2A3A30'; return z === 8 ? CH[4] : CH[2]; }
    if (z === 7 && u > 11 && u < 12.2 && Math.abs(v + 2) < 1) return EYE;
    if (z >= 4 && z <= 8 && u < 4.5 && rr(u + 3.5, v, 7.5, 5.2, 0.6)) return z === 8 ? VIO[2] : z >= 6 ? VIO[1] : CH[3];
    return null;
  } },
  fuelHauler: { L: 24, W: 11, H: 10, f(u, v, z) {
    if (z <= 2 && [[-8, -5], [-8, 5], [-3, -5], [-3, 5], [8, -5], [8, 5]].some(([a, b]) => circ(u, v, a, b, 2.3))) return TRK[1];
    if (z >= 2 && z <= 3 && rr(u, v, 11.5, 5, 1)) return CH[1];
    if (z >= 3 && z <= 8 && u > 5 && rr(u - 8.5, v, 3.5, 4.8, 1.2)) { if (z >= 6 && u > 10.5) return '#2A3A30'; return z === 8 ? CH[4] : CH[2]; }
    if (z >= 3 && z <= 9 && u < 4.5 && u > -11.5) { const r = Math.hypot(v, z - 6); if (r <= 4.6) return r > 4 ? OR[0] : (Math.floor(u) % 4 === 0 ? '#1A1A1A' : z >= 8 ? OR[3] : OR[2]); }
    return null;
  } },
  crawler: { L: 22, W: 13, H: 9, f(u, v, z) {
    if (z <= 3 && Math.abs(v) > 4.2 && Math.abs(v) < 6.8 && Math.abs(u) < 10.5) return (Math.floor(u) & 1) ? TRK[0] : TRK[2];
    const front = u > 7 ? (u - 7) * 0.9 : 0; // sloped glacis
    if (z >= 2 && z <= 7 - front && rr(u, v, 10, 5.5, 1.2)) return z >= 6 - front ? CH[3] : CH[2];
    if (z === 6 && u > 7.5 && u < 9 && Math.abs(v) < 2) return LIME[2]; // view slit
    if (z >= 7 && z <= 9 && circ(u, v, -2, 1.5, 2.2)) return z === 9 ? CH[4] : CH[3];
    if (z === 9 && u > -1 && u < 5 && Math.abs(v - 1.5) < 0.6) return MET[1];
    if (z === 6 && Math.abs(u) < 9 && Math.abs(Math.abs(v) - 5.5) < 0.6) return VIO[1];
    return null;
  } },
  brute: { L: 20, W: 13, H: 10, f(u, v, z) {
    if (z <= 3 && Math.abs(v) > 4 && Math.abs(v) < 6.6 && Math.abs(u) < 9.5) return (Math.floor(u) & 1) ? TRK[0] : TRK[2];
    if (z >= 2 && z <= 5 && rr(u, v, 9, 5.2, 1.5)) return z === 5 ? CH[3] : CH[2];
    if (z === 5 && u > 7.5 && u < 9.2 && Math.abs(v) < 1.6) return LIME[2]; // view slit
    if (z >= 6 && z <= 8 && circ(u, v, -1, 0, 4)) return z === 8 ? CH[4] : CH[3];
    if (z === 7 && u > 2 && u < 13 && Math.abs(v) < 0.8) return MET[2]; // cannon
    if (z === 8 && circ(u, v, -2.5, -1.5, 0.8)) return VIO[2];
    return null;
  } },
  juggernaut: { L: 26, W: 16, H: 12, f(u, v, z) {
    if (z <= 4 && Math.abs(v) > 5 && Math.abs(v) < 8.2 && Math.abs(u) < 12.5) return (Math.floor(u) & 1) ? TRK[0] : TRK[2];
    if (z >= 3 && z <= 7 && rr(u, v, 12, 6.8, 2)) return z === 7 ? CH[3] : CH[2];
    if (z === 7 && u > 10 && u < 12.2 && Math.abs(v) < 1.5) return LIME[2];
    if (z >= 8 && z <= 11 && rr(u + 1.5, v, 5.5, 5, 2)) return z === 11 ? CH[4] : CH[3];
    if (z === 9 && u > 3 && u < 16 && (Math.abs(v - 1.8) < 0.7 || Math.abs(v + 1.8) < 0.7)) return MET[2];
    if (z === 11 && Math.abs(u + 1.5) < 4 && Math.abs(v) < 0.6) return VIO[2];
    return null;
  } },
  medTruck: { L: 24, W: 11, H: 10, f(u, v, z) {
    if (z <= 2 && [[-8, -5], [-8, 5], [-3, -5], [-3, 5], [8, -5], [8, 5]].some(([a, b]) => circ(u, v, a, b, 2.3))) return TRK[1];
    if (z >= 2 && z <= 3 && rr(u, v, 11.5, 5, 1)) return KH[0];
    if (z >= 3 && z <= 8 && u > 5 && rr(u - 8.5, v, 3.5, 4.8, 1.2)) { if (z >= 6 && u > 10.5) return STEEL[3]; return z === 8 ? KH[3] : KH[2]; }
    if (z >= 4 && z <= 9 && u < 4.5 && rr(u + 3.5, v, 7.5, 5.2, 0.6)) {
      if (z === 9 && ((Math.abs(u + 3.5) < 1.2 && Math.abs(v) < 3.5) || (Math.abs(v) < 1.2 && Math.abs(u + 3.5) < 3.5))) return STEEL[1];
      return z === 9 ? KH[3] : z >= 7 ? KH[2] : KH[1];
    }
    return null;
  } },
};

const worldCache = new Map();
/** 8-direction stacked sprite. dir 0..7 (N..NW); state: 'ok'|'wreck' */
export function vehicleSprite(type, dir, state = 'ok') {
  const np = Art.painter('vehicle', type);               // New art style, if this type has a redesign
  const key = (np ? 'new|' : '') + type + dir + state;
  let s = worldCache.get(key);
  if (s) return s;
  if (np) { s = np(dir, state); worldCache.set(key, s); return s; }
  const sh = VEH_SHAPES[type] || VEH_SHAPES.skitter;
  const S = Math.ceil(Math.max(sh.L, sh.W) * 1.25) + 4;
  const Hs = S + sh.H + 2;
  const p = new Pix(S, Hs);
  const cx = S / 2, cy = S / 2 + sh.H;
  const a = dir * Math.PI / 4 - Math.PI / 2; // facing angle (0 = east)
  const ca = Math.cos(a), sa = Math.sin(a);
  for (let z = 0; z < sh.H; z++) {
    const f = 0.62 + 0.38 * (z / Math.max(1, sh.H - 1));
    for (let y = 0; y < Hs; y++) for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 + z - cy;
      const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
      let c = sh.f(u, v, z);
      if (!c) continue;
      let pc = shade(pack(c), f);
      if (state === 'wreck') pc = shade(pack(z % 3 ? '#2A2624' : '#3A302A'), f);
      p.data[y * S + x] = pc;
    }
  }
  p.outline('#08090A');
  s = { canvas: p.toCanvas(), ax: Math.round(cx), ay: Math.round(cy), w: S, h: Hs, pix: p };
  worldCache.set(key, s);
  return s;
}

// ---------------------------------------------------------------- scope close-ups (96×64)
class SP {
  constructor() { this.p = new Pix(96, 64); }
  rect(x, y, w, h, c) { this.p.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h), c); }
  shaded(x, y, w, h, ramp) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j === 0 ? 3 : i === 0 ? 3 : j === h - 1 || i === w - 1 ? 0 : (i + j * 2) % 23 === 0 ? 0 : j < h * 0.4 ? 2 : 1;
      this.p.set(x + i, y + j, ramp[Math.min(ramp.length - 1, k)]);
    }
  }
  wheel(cx, cy, r, tread = false) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, y); if (d <= r) this.p.set(cx + x, cy + y, d > r - 1.5 ? TRK[0] : d < r * 0.45 ? MET[2] : TRK[2]); }
  }
  done() { this.p.outline('#08090A'); return this.p; }
}

function scopeVehicle(type, view) {
  const s = new SP();
  const Z = [];
  const zone = (name, x, y, w, h, prio) => Z.push({ name, x, y, w, h, prio });
  const truck = type === 'hauler' || type === 'fuelHauler' || type === 'medTruck';
  const tracked = type === 'crawler' || type === 'brute' || type === 'juggernaut';
  const body = type === 'medTruck' ? KH : CH;
  if (view === 'right') {
    if (tracked) {
      s.shaded(4, 40, 88, 18, TRK.concat([TRK[2]]));
      for (let x = 10; x < 88; x += 12) s.wheel(x, 49, 5);
      s.shaded(6, 22, 84, 20, body);
      if (type === 'crawler') { for (let x = 16; x < 80; x += 14) s.rect(x, 28, 8, 4, MET[1]); s.shaded(40, 12, 22, 12, body); s.rect(62, 16, 20, 2, MET[2]); }
      else { s.shaded(30, 8, 34, 16, body); s.rect(62, 13, type === 'juggernaut' ? 34 : 30, 3, MET[2]); if (type === 'juggernaut') s.rect(62, 18, 34, 3, MET[2]); }
      for (let x = 8; x < 88; x++) s.p.set(x, 41, VIO[1]);
      zone('turret', 28, 6, 38, 18, 2);
      zone('hull', 2, 20, 92, 40, 1);
    } else if (type === 'skitter') {
      s.wheel(20, 52, 10); s.wheel(76, 52, 10);
      s.shaded(10, 36, 76, 10, body);
      for (let x = 30; x < 70; x++) s.p.set(x, 20 + Math.abs(x - 50) * 0.2, LIME[1]);
      s.shaded(50, 22, 12, 14, CH); s.rect(52, 20, 8, 5, CH[3]); s.p.set(58, 22, EYE); s.p.set(59, 22, EYE);    // driver
      s.rect(30, 16, 3, 20, MET[2]); s.rect(30, 16, 30, 3, MET[1]);                                                // MG
      s.shaded(4, 30, 10, 12, OR);                                                                                  // jerrycan (rear)
      zone('driver', 49, 18, 15, 19, 5); zone('hull', 2, 30, 90, 30, 1);
    } else {
      for (const x of [16, 30, 78]) s.wheel(x, 54, 8);
      s.shaded(4, 42, 88, 8, body);
      s.shaded(66, 14, 26, 30, body); s.shaded(78, 18, 12, 12, type === 'medTruck' ? STEEL : ['#1A2A22', '#2A3A30', '#3A4A40', '#4A5A50']);
      if (type !== 'medTruck') { s.rect(80, 21, 6, 6, CH[2]); s.p.set(84, 23, EYE); }
      if (type === 'fuelHauler') {
        for (let y = 16; y < 44; y++) for (let x = 6; x < 64; x++) { const k = Math.abs(y - 30) / 14; if (k <= 1) s.p.set(x, y, k > 0.85 ? OR[0] : x % 12 < 2 ? '#1A1A1A' : k < 0.3 ? OR[3] : OR[2]); }
        zone('tank', 6, 16, 58, 28, 4);
      } else if (type === 'medTruck') {
        s.shaded(6, 14, 58, 30, KH); s.rect(30, 20, 6, 18, STEEL[1]); s.rect(24, 26, 18, 6, STEEL[1]);
      } else { s.shaded(6, 16, 58, 28, VIO); for (let x = 8; x < 62; x += 8) s.rect(x, 16, 1, 28, VIO[0]); }
      zone('driver', 76, 16, 16, 16, 5); zone('hull', 2, 12, 92, 50, 1);
    }
  } else if (view === 'front') {
    if (tracked) {
      s.shaded(8, 38, 18, 22, TRK); s.shaded(70, 38, 18, 22, TRK);
      s.shaded(22, 26, 52, 30, body);
      const slitW = type === 'crawler' ? 4 : 3;
      s.rect(48 - Math.floor(slitW / 2), 32, slitW, 2, LIME[3]); s.rect(44, 31, 8, 1, CH[0]); s.rect(44, 34, 8, 1, CH[0]);
      zone('slit', 48 - Math.floor(slitW / 2), 32, slitW, 2, 6);
      if (type !== 'crawler') { s.shaded(32, 8, 32, 20, body); for (let r = 0; r < 5; r++) s.rect(46, 14 + r, 4, 1, MET[r % 2 + 1]); zone('turret', 30, 6, 36, 22, 2); }
      else { s.shaded(38, 14, 20, 12, body); }
      zone('hull', 6, 20, 84, 42, 1);
    } else {
      s.wheel(18, 52, 10); s.wheel(78, 52, 10);
      s.shaded(12, 34, 72, 16, body);
      const glass = type === 'medTruck' ? STEEL : ['#1A2A22', '#2A3A30', '#3A4A40', '#4A5A50'];
      if (type === 'skitter') {
        s.rect(28, 20, 40, 2, LIME[1]);
        s.shaded(40, 22, 16, 14, CH); s.rect(44, 18, 8, 6, CH[3]); s.p.set(46, 21, EYE); s.p.set(49, 21, EYE);
        zone('driver', 38, 16, 20, 20, 5);
      } else {
        s.shaded(22, 8, 52, 28, body); s.shaded(28, 12, 40, 14, glass);
        if (type !== 'medTruck') { s.rect(44, 15, 8, 9, CH[2]); s.p.set(46, 18, EYE); s.p.set(49, 18, EYE); }
        zone('driver', 28, 11, 40, 16, 5);
      }
      for (const x of [16, 76]) s.rect(x, 38, 6, 4, OR[3]);
      zone('hull', 6, 8, 84, 54, 1);
    }
  } else { // back
    if (tracked) {
      s.shaded(8, 38, 18, 22, TRK); s.shaded(70, 38, 18, 22, TRK);
      s.shaded(22, 24, 52, 32, body);
      if (type === 'crawler') { s.rect(40, 32, 16, 20, CH[0]); s.rect(41, 33, 14, 1, VIO[1]); }
      else { s.shaded(32, 8, 32, 20, body); zone('turret', 30, 6, 36, 22, 2); }
      zone('hull', 6, 20, 84, 42, 1);
    } else {
      s.wheel(18, 52, 10); s.wheel(78, 52, 10);
      s.shaded(12, 30, 72, 18, body);
      if (type === 'skitter') { s.shaded(30, 22, 14, 14, OR); s.shaded(52, 22, 14, 14, OR); zone('jerrycan', 29, 21, 38, 16, 5); }
      else if (type === 'fuelHauler') { for (let y = 6; y < 44; y++) for (let x = 20; x < 76; x++) { const d = Math.hypot((x - 48) / 28, (y - 25) / 19); if (d <= 1) s.p.set(x, y, d > 0.85 ? OR[0] : d < 0.4 ? OR[3] : OR[2]); } zone('tank', 20, 6, 56, 38, 4); }
      else { s.shaded(18, 8, 60, 34, type === 'medTruck' ? KH : VIO); if (type === 'medTruck') { s.rect(45, 14, 6, 20, STEEL[1]); s.rect(38, 21, 20, 6, STEEL[1]); } }
      zone('hull', 6, 6, 84, 56, 1);
    }
  }
  return { pix: s.done(), zones: Z };
}

const scopeCache = new Map();
export function vehicleScopeSprite(type, view) {
  const np = Art.painter('scopeVehicle', type);
  const key = (np ? 'new|' : '') + type + view;
  let s = scopeCache.get(key);
  if (s) return s;
  if (np) { s = np(view); scopeCache.set(key, s); return s; }
  const base = view === 'left' ? 'right' : view;
  const r = scopeVehicle(type, base);
  let pix = r.pix, zones = r.zones;
  if (view === 'left') { pix = pix.mirrored(); zones = zones.map((z) => ({ ...z, x: 96 - z.x - z.w })); }
  const P = pix;
  s = { get canvas() { return this._c || (this._c = P.toCanvas()); }, _c: null, zones, w: 96, h: 64, ax: 48, ay: 62 };
  scopeCache.set(key, s);
  return s;
}

let shipCache = null;
/** GOD dropship (top-down), khaki with steel-blue canopy and engine glow. */
export function dropshipSprite() {
  if (shipCache) return shipCache;
  const p = new Pix(48, 36);
  const cx = 24;
  for (let y = 0; y < 36; y++) for (let x = 0; x < 48; x++) {
    const dx = x + 0.5 - cx;
    let c = null;
    if (Math.abs(dx) < 5 && y > 2 && y < 34) c = y < 10 ? (Math.abs(dx) < 3 ? '#9FD8FF' : '#6FA2C8') : dx < -2 ? '#C4B687' : dx < 2 ? '#A89968' : '#7C7049';
    else if (y > 13 && y < 22 && Math.abs(dx) < 23 - (y - 13) * 0.6) c = y === 14 ? '#C4B687' : '#7C7049';
    else if (y > 27 && y < 33 && Math.abs(dx) < 11) c = '#5C6B3A';
    if (Math.abs(Math.abs(dx) - 16) < 3 && y > 11 && y < 25) c = Math.abs(Math.abs(dx) - 16) < 1.5 ? '#3A3F42' : '#5A6166';
    if (c) p.set(x, y, c);
  }
  p.rect(8, 23, 3, 2, '#9FD8FF'); p.rect(37, 23, 3, 2, '#9FD8FF');
  p.outline('#141612');
  const P = p;
  shipCache = { get canvas() { return this._c || (this._c = P.toCanvas()); }, _c: null, w: 48, h: 36, ax: 24, ay: 18 };
  return shipCache;
}
