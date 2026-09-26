// @ts-check
import { Pix } from '../pixel.js';
import { Art } from '../artStyle.js';
import { ZONES, ZONE_PRIO } from '../model3d.js';

/**
 * Scope close-up sprites (SPEC §4.5, §10.3): ~40×64 px for infantry, 4 views (front, back, left, right;
 * left = mirrored right). Hit zones live next to the art, in scope-sprite pixel space:
 * { name, x, y, w, h, prio } — higher prio wins where zones overlap.
 */
export const SW = 40, SH = 64, SAX = 20, SAY = 63;

const CH = ['#141618', '#22262A', '#343A3F', '#4C545A', '#66707A']; // charcoal ramp
const LIME = ['#4E8A1C', '#7CC42E', '#A6F03C', '#D8FF8A'];
const VIO = ['#4A2078', '#6A34A8', '#9B5AE0', '#C9A0FF'];
const ORANGE = ['#7A3A10', '#C0621E', '#E8923A', '#FFD27A'];
const METAL = ['#23262A', '#3A3F42', '#5A6166', '#8A949A'];
const OUT = '#0A0B0C';
const EYE = '#E4FF6A';

function darkHex(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.round(((n >> 16) & 255) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`;
}

class SP {
  constructor(w = SW, h = SH) { this.p = new Pix(w, h); this.w = w; this.h = h; }
  /** shaded ellipse lit from top-left */
  ell(cx, cy, rx, ry, ramp, o = {}) {
    const p = this.p;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const l = -(dx * 0.55 + dy * 0.75) + (1 - d) * 0.5 + (o.bias || 0);
      const i = l > 0.75 ? 4 : l > 0.35 ? 3 : l > -0.05 ? 2 : l > -0.5 ? 1 : 0;
      p.set(x, y, ramp[Math.min(ramp.length - 1, i)]);
    }
  }
  /** shaded rounded rectangle, vertical light */
  rect(x, y, w, h, ramp, o = {}) {
    const p = this.p;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (o.round && ((i === 0 || i === w - 1) && (j === 0 || j === h - 1))) continue;
      const lx = i / Math.max(1, w - 1), ly = j / Math.max(1, h - 1);
      const l = (1 - lx) * 0.6 + (1 - ly) * 0.5;
      const k = l > 0.85 ? 3 : l > 0.55 ? 2 : l > 0.25 ? 1 : 0;
      p.set(x + i, y + j, ramp[Math.min(ramp.length - 1, k + (o.bright || 0))]);
    }
  }
  /** thick limb line with round joints */
  limb(x0, y0, x1, y1, t, ramp) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      this.ell(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, t / 2, t / 2, ramp);
    }
  }
  px(x, y, c) { this.p.set(x, y, c); }
  glow(cx, cy, r, col) {
    const [R, G, B] = [parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16)];
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y) / r;
      if (d > 1) continue;
      this.p.set(cx + x, cy + y, `rgba(${R},${G},${B},${(0.35 * (1 - d)).toFixed(2)})`);
    }
  }
  done() { this.p.outline(OUT); return this.p; }
}

/**
 * Build a NOT humanoid close-up.
 * @param {'front'|'back'|'right'} view
 * @param {string} kind husk|lobber|scorcher|launcher|warden|harvester|vrask
 */
function notHumanoid(view, kind) {
  const s = new SP();
  const zones = [];
  const Z = (name, x, y, w, h, prio) => zones.push({ name, x, y, w, h, prio });
  const armour = kind === 'harvester' ? ['#2E3236', '#44494E', '#5E656C', '#7A838C', '#98A2AA'] : CH;
  const big = kind === 'vrask';
  const hy = big ? 10 : 9;

  if (view === 'front' || view === 'back') {
    const front = view === 'front';
    // back-mounted gear drawn first in front view
    if (front && kind === 'scorcher') { s.rect(10, 20, 20, 5, ORANGE, { round: true }); }
    // legs
    s.limb(16, 42, 13, 52, 5, armour); s.limb(13, 52, 15, 62, 4, armour); s.ell(13, 52, 2.5, 2.5, VIO);
    s.limb(24, 42, 27, 52, 5, armour); s.limb(27, 52, 25, 62, 4, armour); s.ell(27, 52, 2.5, 2.5, VIO);
    s.rect(11, 61, 6, 3, METAL); s.rect(23, 61, 6, 3, METAL);
    // torso
    s.rect(12, 20, 16, 21, armour, { round: true });
    for (const y of [26, 31, 36]) for (let x = 13; x < 27; x++) s.px(x, y, armour[0]);
    if (front) { s.ell(20, 27, 2.5, 2.5, LIME); s.glow(20, 27, 5, LIME[3]); }
    else { for (let y = 21; y < 40; y++) s.px(20, y, VIO[y % 3 === 0 ? 2 : 1]); for (const y of [23, 28, 33]) { s.px(19, y, VIO[2]); s.px(21, y, VIO[2]); } }
    // belt
    s.rect(13, 39, 14, 3, [LIME[0], LIME[1], LIME[1], LIME[2]]);
    // shoulders (carapace plates)
    s.ell(10, 22, 6, 4, armour); s.ell(30, 22, 6, 4, armour);
    for (let x = 5; x <= 15; x++) s.px(x, 25, VIO[1]); for (let x = 25; x <= 35; x++) s.px(x, 25, VIO[1]);
    // arms: long, double-jointed
    if (kind === 'harvester' || kind === 'warden' || kind === 'vrask') {
      s.limb(7, 25, 5, 33, 4, armour); s.ell(5, 33, 2, 2, VIO); s.limb(5, 33, 7, 41, 3, armour); s.ell(7, 41, 1.8, 1.8, VIO); s.limb(7, 41, 9, 46, 3, armour);
      s.limb(33, 25, 35, 33, 4, armour); s.ell(35, 33, 2, 2, VIO); s.limb(35, 33, 33, 41, 3, armour); s.ell(33, 41, 1.8, 1.8, VIO); s.limb(33, 41, 31, 46, 3, armour);
      if (kind !== 'harvester' && front) { s.rect(29, 44, 6, 3, METAL); s.px(34, 44, LIME[3]); }
    } else {
      s.limb(7, 25, 6, 33, 4, armour); s.ell(6, 33, 2, 2, VIO); s.limb(6, 33, 13, 38, 3, armour);
      s.limb(33, 25, 34, 32, 4, armour); s.ell(34, 32, 2, 2, VIO); s.limb(34, 32, 27, 35, 3, armour);
      if (front) {
        // rifle held across the body
        for (let i = 0; i < 28; i++) { const x = 7 + i, y = Math.round(41 - i * 0.42); s.px(x, y, METAL[2]); s.px(x, y + 1, METAL[1]); s.px(x, y + 2, METAL[0]); }
        s.px(34, 29, LIME[3]); s.px(35, 29, LIME[2]);
      } else {
        for (let i = 0; i < 20; i++) { const x = 30 - i, y = 18 + i; s.px(x, y, METAL[2]); s.px(x + 1, y, METAL[1]); }
      }
    }
    // neck & head
    s.rect(18, 15, 4, 5, armour);
    s.ell(20, hy, big ? 7 : 5.5, big ? 8.5 : 7.5, armour);
    if (front) {
      for (const ex of [16, 22]) { s.px(ex, hy + 1, EYE); s.px(ex + 1, hy + 1, EYE); s.px(ex + 2, hy + 1, LIME[2]); }
      s.glow(17, hy + 1, 3, EYE); s.glow(23, hy + 1, 3, EYE);
      for (let x = 17; x <= 23; x++) s.px(x, hy + 5, armour[0]);
    }
    for (let y = hy - 7; y <= hy - 2; y++) { s.px(19, y, VIO[2]); s.px(20, y, VIO[1]); }
    if (big) { for (let y = hy - 12; y <= hy - 6; y++) { s.px(19, y, VIO[3]); s.px(20, y, VIO[2]); s.px(21, y, VIO[1]); } s.ell(20, hy - 3, 7.5, 3, METAL); }
    if (kind === 'warden') { for (let y = hy - 11; y <= hy - 6; y++) { s.px(20, y, VIO[3]); s.px(21, y, VIO[2]); } }

    Z('head', big ? 12 : 14, big ? 0 : 1, big ? 16 : 12, big ? 19 : 18, 5);
    Z('torso', 11, 17, 18, 25, 3);
    Z('limb', 3, 22, 9, 26, 1); Z('limb', 28, 22, 9, 26, 1); Z('limb', 11, 42, 18, 22, 1);

    // gear
    if (kind === 'lobber' && front) {
      for (let i = 0; i < 5; i++) { s.ell(13 + i * 3.6, 40.5, 1.8, 2.3, ORANGE); s.px(13 + i * 3.6, 38, METAL[3]); }
      Z('grenadeBelt', 11, 37, 18, 7, 4);
    }
    if (kind === 'scorcher' && !front) {
      s.rect(11, 19, 18, 24, ORANGE, { round: true });
      for (let y = 21; y < 42; y += 4) for (let x = 12; x < 28; x++) if (((x + y) >> 1) % 2 === 0) s.px(x, y, '#1A1A1A');
      s.ell(20, 19, 8, 2, ORANGE);
      s.rect(18, 15, 4, 4, METAL);
      Z('fuelTank', 10, 17, 20, 27, 4);
    }
    if (kind === 'scorcher' && front) { s.limb(12, 22, 9, 40, 2, ORANGE); s.rect(27, 33, 8, 3, METAL); s.px(35, 34, ORANGE[3]); }
    if (kind === 'launcher') {
      if (!front) {
        s.rect(2, 10, 12, 12, METAL); for (let i = 0; i < 3; i++) s.ell(5 + i * 3.5, 12, 1.3, 1.3, ORANGE);
        Z('rocketPod', 1, 9, 14, 14, 4);
      }
    }
    if (kind === 'warden' && !front) {
      s.rect(13, 21, 14, 15, METAL); for (let y = 23; y < 34; y += 3) for (let x = 15; x < 25; x += 2) s.px(x, y, METAL[0]);
      s.px(16, 24, LIME[3]); s.px(18, 24, ORANGE[2]);
      for (let y = 2; y < 21; y++) s.px(25, y, METAL[3]); s.px(25, 1, LIME[3]);
      Z('radio', 12, 20, 16, 17, 4);
    }
    if (kind === 'harvester' && !front) {
      s.rect(11, 19, 18, 18, ['#3A2E1E', '#5A4630', '#7A6040', '#947A54']);
      for (const [x, y] of [[14, 17], [19, 15], [24, 17], [17, 19], [22, 19]]) { s.ell(x, y, 1.6, 3, LIME); s.glow(x, y, 3, LIME[3]); }
    }
    if (kind === 'vrask' && !front) { for (let y = 20; y < 50; y++) for (let x = 10 - (y - 20) / 6; x < 30 + (y - 20) / 6; x++) if (s.p.alphaAt(Math.round(x), y) === 0 || y > 40) s.px(Math.round(x), y, (x + y) % 5 ? VIO[1] : VIO[0]); }
  } else {
    // RIGHT profile (facing right). Back is on the left.
    if (kind === 'scorcher') { s.rect(8, 19, 8, 24, ORANGE, { round: true }); for (let y = 21; y < 42; y += 4) for (let x = 9; x < 15; x++) if (((x + y) >> 1) % 2 === 0) s.px(x, y, '#1A1A1A'); Z('fuelTank', 7, 18, 10, 26, 4); }
    if (kind === 'warden') { s.rect(10, 22, 6, 13, METAL); for (let y = 3; y < 22; y++) s.px(12, y, METAL[3]); s.px(12, 2, LIME[3]); }
    if (kind === 'harvester') { s.rect(8, 19, 8, 17, ['#3A2E1E', '#5A4630', '#7A6040', '#947A54']); for (const y of [16, 19]) { s.ell(11, y, 1.5, 2.8, LIME); } }
    if (kind === 'vrask') { for (let y = 20; y < 52; y++) for (let x = 9 - (y - 20) / 5; x < 16; x++) s.px(Math.round(x), y, (x + y) % 5 ? VIO[1] : VIO[0]); }
    // far leg (darker), near leg: backward-kinked "too many joints"
    const dark = armour.map((c) => darkHex(c, 0.7));
    s.limb(19, 42, 15, 50, 4, dark); s.limb(15, 50, 18, 57, 3, dark); s.limb(18, 57, 16, 62, 3, dark);
    s.limb(21, 42, 25, 50, 5, armour); s.ell(25, 50, 2.3, 2.3, VIO); s.limb(25, 50, 20, 57, 4, armour); s.ell(20, 57, 1.8, 1.8, VIO); s.limb(20, 57, 23, 62, 3, armour);
    s.rect(21, 61, 7, 3, METAL); s.rect(13, 61, 6, 3, METAL);
    // torso (narrow) with carapace
    s.rect(15, 20, 12, 21, armour, { round: true });
    for (const y of [26, 31, 36]) for (let x = 16; x < 26; x++) s.px(x, y, armour[0]);
    s.ell(24, 27, 1.8, 2.2, LIME);
    s.rect(15, 39, 12, 3, [LIME[0], LIME[1], LIME[1], LIME[2]]);
    s.ell(19, 22, 6, 4, armour); for (let x = 14; x <= 24; x++) s.px(x, 25, VIO[1]);
    // neck + elongated head with jaw
    s.rect(19, 15, 4, 6, armour);
    s.ell(22, hy, big ? 7 : 6, big ? 7.5 : 6.5, armour);
    s.ell(27, hy + 3, 3.5, 2.5, armour);
    s.px(25, hy - 1, EYE); s.px(26, hy - 1, EYE); s.px(27, hy - 1, LIME[2]); s.glow(26, hy - 1, 3, EYE);
    for (let x = 16; x <= 22; x++) s.px(x, hy - 6, VIO[2]);
    if (big) { for (let x = 14; x <= 24; x++) s.px(x, hy - 8, VIO[2]); s.ell(21, hy - 4, 7, 2.5, METAL); }
    if (kind === 'warden') for (let x = 17; x <= 21; x++) s.px(x, hy - 8, VIO[3]);
    // near arm holding weapon forward
    s.limb(21, 24, 25, 32, 4, armour); s.ell(25, 32, 2, 2, VIO); s.limb(25, 32, 30, 35, 3, armour);
    if (kind === 'lobber') {
      for (let i = 0; i < 3; i++) s.ell(17 + i * 4, 40.5, 1.8, 2.3, ORANGE);
      s.ell(31, 34, 2, 2.5, ORANGE);
      Z('grenadeBelt', 15, 37, 13, 7, 4);
    } else if (kind === 'launcher') {
      s.rect(10, 12, 22, 6, METAL); s.px(31, 14, ORANGE[3]); s.ell(11, 15, 2, 2, ORANGE);
      Z('rocketPod', 9, 11, 24, 8, 4);
    } else if (kind !== 'harvester') {
      const len = kind === 'husk' ? 18 : 10;
      for (let i = 0; i < len; i++) { s.px(22 + i, 34, METAL[2]); s.px(22 + i, 35, METAL[1]); }
      s.px(22 + len, 34, LIME[3]);
      if (kind === 'scorcher') s.px(22 + len, 34, ORANGE[3]);
    }
    Z('head', 15, 1, 16, 18, 5);
    Z('torso', 14, 17, 14, 25, 3);
    Z('limb', 13, 42, 16, 22, 1); Z('limb', 22, 22, 10, 16, 1);
  }
  return { pix: s.done(), zones };
}

function snifferScope(view) {
  const s = new SP();
  const zones = [];
  const Z = (name, x, y, w, h, prio) => zones.push({ name, x, y, w, h, prio });
  if (view === 'right') {
    s.limb(9, 48, 7, 62, 4, CH); s.limb(15, 48, 16, 62, 4, CH); s.limb(25, 48, 23, 62, 4, CH); s.limb(30, 48, 31, 62, 4, CH);
    s.ell(19, 44, 14, 8, CH);
    for (const x of [10, 15, 20, 25]) { s.ell(x, 37, 1.5, 2.5, VIO); }
    s.ell(32, 40, 7, 6, CH); s.ell(37, 43, 3, 2.5, CH);
    s.px(34, 38, EYE); s.px(35, 38, EYE); s.px(33, 40, EYE); s.glow(34, 38, 3, EYE);
    for (let x = 34; x < 40; x += 2) s.px(x, 45, '#E8F0E0');
    s.limb(6, 42, 2, 38, 2, CH);
    Z('head', 26, 33, 14, 14, 5); Z('body', 4, 36, 24, 22, 3);
  } else if (view === 'front') {
    s.ell(20, 44, 13, 9, CH);
    s.limb(10, 48, 9, 62, 4, CH); s.limb(30, 48, 31, 62, 4, CH);
    s.ell(20, 38, 9, 8, CH);
    for (const [x, y] of [[16, 36], [24, 36], [18, 34], [22, 34]]) { s.px(x, y, EYE); s.glow(x, y, 2, EYE); }
    s.ell(20, 44, 5, 3, ['#1A0A0A', '#2A1414', '#3A2020', '#4A2A2A']);
    for (let x = 16; x <= 24; x += 2) { s.px(x, 42, '#E8F0E0'); s.px(x + 1, 46, '#E8F0E0'); }
    Z('head', 10, 29, 20, 18, 5); Z('body', 6, 44, 28, 16, 3);
  } else {
    s.ell(20, 44, 13, 9, CH);
    for (let y = 36; y < 52; y++) s.px(20, y, VIO[2]);
    s.limb(10, 48, 9, 62, 4, CH); s.limb(30, 48, 31, 62, 4, CH);
    s.ell(20, 36, 7, 5, CH); s.limb(20, 50, 20, 58, 3, CH);
    Z('head', 12, 30, 16, 12, 5); Z('body', 6, 38, 28, 22, 3);
  }
  return { pix: s.done(), zones };
}

/** Pick the scope view for a target facing `facingAngle`, seen from the Operative at angle `toOp` (radians). */
export function scopeView(facingAngle, toOp) {
  let d = toOp - facingAngle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const a = Math.abs(d);
  if (a <= Math.PI / 4) return 'front';
  if (a >= Math.PI * 3 / 4) return 'back';
  // the target's right side faces us when the Operative is clockwise (+) of its facing (y-down screen)
  return d > 0 ? 'right' : 'left';
}

const cache = new Map();
/**
 * @returns {{canvas: HTMLCanvasElement, zones: {name:string,x:number,y:number,w:number,h:number,prio:number}[], w:number, h:number, ax:number, ay:number}}
 */
export function scopeSprite(type, view) {
  const np = Art.painter('scopeUnit', type);
  const key = (np ? 'new|' : '') + type + view;
  let s = cache.get(key);
  if (s) return s;
  if (np) { s = np(view); cache.set(key, s); return s; }
  const baseView = view === 'left' ? 'right' : view;
  const r = type === 'sniffer' ? snifferScope(baseView) : notHumanoid(/** @type {any} */ (baseView), type);
  let pix = r.pix, zones = r.zones;
  if (view === 'left') {
    pix = pix.mirrored();
    zones = zones.map((z) => ({ ...z, x: SW - z.x - z.w }));
  }
  // canvas is created lazily so hit-zone logic also runs headless (tests)
  const P = pix;
  s = { get canvas() { return this._c || (this._c = P.toCanvas()); }, zones, w: pix.w, h: pix.h, ax: SAX, ay: SAY, _c: null };
  cache.set(key, s);
  return s;
}

/**
 * The New art style's scope close-up: the unit's own map sprite (same pose, direction and frame)
 * magnified `scale`× — nothing is redrawn — with its per-pixel hit zones.
 * @param {{canvas: any, ax: number, ay: number, w: number, h: number, zoneMap: Uint8Array}} m map sprite
 */
export function magnifiedSprite(m, scale) {
  let s = magCache.get(m);
  if (!s) magCache.set(m, (s = { get canvas() { return m.canvas; }, w: m.w * scale, h: m.h * scale, ax: m.ax * scale, ay: m.ay * scale, zones: [], zoneMap: m.zoneMap, mapW: m.w, mapH: m.h, scale }));
  return s;
}
const magCache = new WeakMap();

/**
 * Hit zone at scope-sprite-local (x, y) of a magnified sprite. Assisted aim (sizeMult > 1) also accepts
 * a zone within a small radius, preferring the most important one — like growing the classic boxes.
 */
export function zoneAtMap(s, x, y, sizeMult = 1) {
  const at = (sx, sy) => {
    const px = Math.floor(sx / s.scale), py = Math.floor(sy / s.scale);
    if (px < 0 || py < 0 || px >= s.mapW || py >= s.mapH) return 0;
    return s.zoneMap[py * s.mapW + px];
  };
  let z = at(x, y);
  if (sizeMult > 1) {
    const d = (sizeMult - 1) * 2.5 * s.scale;
    for (const [dx, dy] of [[-d, 0], [d, 0], [0, -d], [0, d], [-d, -d], [d, -d], [-d, d], [d, d]]) {
      const q = at(x + dx, y + dy);
      if (q && (!z || ZONE_PRIO[q] > ZONE_PRIO[z])) z = q;
    }
  }
  return z ? { name: ZONES[z], prio: ZONE_PRIO[z] } : null;
}

/** Resolve a hit at sprite-local (x,y): highest-priority zone containing the point, with size multiplier. */
export function resolveZone(zones, x, y, sizeMult = 1) {
  let best = null;
  for (const z of zones) {
    const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
    const hw = (z.w / 2) * sizeMult, hh = (z.h / 2) * sizeMult;
    if (x >= cx - hw && x < cx + hw && y >= cy - hh && y < cy + hh) {
      if (!best || z.prio > best.prio) best = z;
    }
  }
  return best;
}
