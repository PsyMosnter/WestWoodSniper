// @ts-check
import { Pix } from '../pixel.js';
import { Rng } from '../../core/rng.js';

/**
 * NOT structure sprites (SPEC §12.3), procedural 3/4-view art. A building of height Hb standing on a
 * w×h-tile footprint is drawn as a roof (footprint shifted up by Hb) plus a south face.
 * Sprite origin: footprint top-left sits at (0, Hb) in sprite px. Zones (snipeable parts) are in sprite px.
 */
const CH = ['#141618', '#22262A', '#343A3F', '#4C545A', '#66707A'];
const LIME = ['#4E8A1C', '#7CC42E', '#A6F03C', '#E4FF6A'];
const VIO = ['#3A1A60', '#6A34A8', '#9B5AE0', '#C9A0FF'];
const RUST = ['#3A2A1E', '#5A4030', '#7A5840'];
const OR = ['#7A3A10', '#C0621E', '#E8923A', '#FFD27A'];
const SAND = ['#6E6040', '#9A8A5E', '#B8A878', '#CFC094'];
const MET = ['#23262A', '#3A3F42', '#5A6166', '#8A949A', '#B4BCC0'];
const OUT = '#08090A';

class B {
  constructor(w, h, Hb, extraW = 0) {
    this.W = w * 16 + extraW; this.D = h * 16; this.Hb = Hb;
    this.p = new Pix(this.W, this.D + Hb);
    this.ox = Math.floor(extraW / 2);
  }
  px(x, y, c) { this.p.set(this.ox + x, y, c); }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  /** Box: roof rect (x,y,w,d) at sprite coords + south face of height hb below it, with bevels. */
  box(x, y, w, d, hb, roof, face, o = {}) {
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      let c = roof[2];
      if (j === 0 || i === 0) c = roof[3];
      else if (i === w - 1) c = roof[1];
      else if (o.plates && ((i % o.plates === 0) || (j % o.plates === 0))) c = roof[1];
      this.px(x + i, y + j, c);
    }
    for (let j = 0; j < hb; j++) for (let i = 0; i < w; i++) {
      let c = j === 0 ? face[3] : j === hb - 1 ? face[0] : face[1];
      if (i === 0) c = face[2]; else if (i === w - 1) c = face[0];
      if (o.ribs && i % o.ribs === 0 && j > 0 && j < hb - 1) c = face[0];
      this.px(x + i, y + d + j, c);
    }
  }
  light(x, y, col = LIME[3]) { this.px(x, y, col); this.px(x + 1, y, col); }
  done() { this.p.outline(OUT); return this.p; }
}

/** building spec table: size, height, blockH, painter */
export const STRUCT_DEFS = {
  commandNexus: { w: 4, h: 3, Hb: 18, blockH: 2.5, hpKey: 'large', c4: true, name: 'Command Nexus' },
  powerPlant: { w: 3, h: 3, Hb: 16, blockH: 2.5, hpKey: 'large', c4: true, name: 'Power Plant' },
  barracks: { w: 3, h: 2, Hb: 12, blockH: 2.5, hpKey: 'small', c4: true, name: 'Barracks' },
  vehicleBay: { w: 4, h: 3, Hb: 14, blockH: 2.5, hpKey: 'large', c4: true, name: 'Vehicle Bay' },
  refinery: { w: 4, h: 4, Hb: 20, blockH: 2.5, hpKey: 'large', c4: true, name: 'Spore Refinery' },
  silo: { w: 2, h: 2, Hb: 22, blockH: 2.5, hpKey: 'small', c4: true, name: 'Spore Silo', explodes: 'silo' },
  commsArray: { w: 2, h: 2, Hb: 26, blockH: 1.0, hpKey: 'small', c4: true, name: 'Comms Array' },
  jammer: { w: 2, h: 2, Hb: 28, blockH: 1.0, hpKey: 'small', c4: true, name: 'Jammer Tower' },
  guardTower: { w: 1, h: 1, Hb: 30, blockH: 1.0, hpKey: 'guardTower', c4: true, name: 'Guard Tower', gunner: true },
  gunTurret: { w: 1, h: 1, Hb: 8, blockH: 1.0, hpKey: 'gunTurret', c4: true, name: 'Gun Turret', turret: true, needsPower: true },
  mgNest: { w: 2, h: 1, Hb: 5, blockH: 0, hpKey: 'mgNest', c4: false, name: 'MG Nest', gunner: true, cover: true },
  alarmPylon: { w: 1, h: 1, Hb: 22, blockH: 0.5, hpKey: 'alarmPylon', c4: true, name: 'Alarm Pylon' },
  detentionBlock: { w: 3, h: 3, Hb: 14, blockH: 2.5, hpKey: 'large', c4: false, name: 'Detention Block' },
  fuelDepot: { w: 2, h: 2, Hb: 8, blockH: 0.5, hpKey: 'small', c4: true, name: 'Fuel Depot', explodes: 'fuelDepot' },
  shieldGenerator: { w: 2, h: 2, Hb: 18, blockH: 2.5, hpKey: 'small', c4: true, name: 'Shield Generator' },
  hiveSpire: { w: 4, h: 4, Hb: 84, blockH: 3, hpKey: 'spire', c4: true, name: 'Hive Spire' },
  gate: { w: 1, h: 1, Hb: 9, blockH: 1.0, hpKey: 'wall', c4: true, name: 'Gate' },
};

const PAINT = {
  commandNexus(b) {
    b.box(0, 0, 64, 48, 18, CH, CH, { plates: 8, ribs: 6 });
    // dome
    for (let y = 8; y < 36; y++) for (let x = 14; x < 50; x++) { const dx = (x - 32) / 18, dy = (y - 22) / 13; const d = dx * dx + dy * dy; if (d < 1) b.px(x, y, d < 0.3 ? CH[4] : -dx - dy > 0.4 ? CH[3] : CH[2]); }
    for (let x = 18; x < 46; x += 4) b.light(x, 22, LIME[2]);
    for (let y = 0; y < 12; y++) { b.px(10, y, MET[3]); b.px(54, y, MET[3]); }
    b.px(10, 0, LIME[3]); b.px(54, 0, VIO[3]);
    for (let x = 4; x < 60; x += 8) { b.rect(x, 52, 4, 5, LIME[1]); b.px(x + 1, 53, LIME[3]); }
    b.rect(28, 55, 8, 11, CH[0]);
  },
  powerPlant(b, st) {
    b.box(0, 8, 48, 32, 16, CH, CH, { plates: 6, ribs: 5 });
    // cooling stacks
    for (const cx of [12, 34]) {
      for (let y = 0; y < 24; y++) for (let x = cx - 6; x <= cx + 6; x++) { const dx = (x - cx) / 6; if (Math.abs(dx) <= 1 - y / 60) b.px(x, y, dx < -0.3 ? CH[4] : dx < 0.4 ? CH[3] : CH[2]); }
      for (let x = cx - 5; x <= cx + 5; x++) b.px(x, 0, CH[0]);
      b.px(cx, 1, LIME[2]);
    }
    // exposed coolant cell (snipeable) on the east face
    if (!st?.cellDead) { b.rect(40, 50, 6, 9, LIME[1]); b.rect(41, 51, 4, 7, LIME[2]); b.px(42, 52, LIME[3]); b.rect(40, 49, 6, 1, MET[3]); }
    else { b.rect(40, 50, 6, 9, CH[0]); }
    for (let x = 4; x < 36; x += 6) b.light(x, 54, VIO[2]);
  },
  barracks(b) {
    b.box(0, 0, 48, 32, 12, CH, CH, { plates: 12, ribs: 8 });
    for (let x = 6; x < 44; x += 10) { b.rect(x, 6, 5, 3, MET[1]); b.px(x + 2, 7, LIME[2]); }
    b.rect(20, 34, 8, 10, CH[0]); b.rect(21, 35, 6, 1, LIME[1]);
    for (let x = 4; x < 46; x += 8) b.px(x, 38, LIME[3]);
    for (let x = 0; x < 48; x++) b.px(x, 31, VIO[1]);
  },
  vehicleBay(b) {
    b.box(0, 0, 64, 48, 14, CH, CH, { plates: 8 });
    for (let x = 2; x < 62; x++) for (const y of [8, 16, 24, 32]) b.px(x, y, CH[1]);
    b.rect(16, 49, 32, 13, MET[1]);
    for (let y = 50; y < 62; y += 2) for (let x = 17; x < 47; x++) b.px(x, y, MET[0]);
    b.light(12, 51, OR[3]); b.light(50, 51, OR[3]);
  },
  refinery(b) {
    b.box(0, 20, 64, 44, 20, CH, CH, { plates: 8, ribs: 7 });
    for (const [cx, cy, r] of [[14, 22, 10], [44, 18, 12], [30, 36, 8]]) {
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) { const dx = (x - cx) / r, dy = (y - cy) / r; const d = dx * dx + dy * dy; if (d < 1) b.px(x, y, d > 0.8 ? CH[1] : -dx - dy > 0.5 ? CH[4] : CH[3]); }
      b.px(cx, cy, LIME[3]); b.px(cx - 1, cy, LIME[2]);
    }
    for (let x = 4; x < 60; x += 3) b.px(x, 70, LIME[x % 2 ? 1 : 2]);
    for (let i = 0; i < 20; i++) b.px(24 + i, 10 + (i >> 2), MET[3]);
  },
  silo(b) {
    for (let y = 0; y < 54; y++) for (let x = 2; x < 30; x++) {
      const dx = (x - 16) / 14;
      if (y < 8 && (x - 16) ** 2 / 196 + (y - 8) ** 2 / 64 > 1) continue;
      b.px(x, y, dx < -0.5 ? CH[4] : dx < 0.2 ? CH[3] : dx < 0.7 ? CH[2] : CH[1]);
    }
    for (const y of [16, 30, 44]) for (let x = 3; x < 29; x++) b.px(x, y, LIME[1]);
    b.px(16, 1, LIME[3]);
  },
  commsArray(b, st) {
    b.box(4, 28, 24, 24, 6, CH, CH);
    // mast
    for (let y = 6; y < 30; y++) { b.px(15, y, MET[3]); b.px(16, y, MET[1]); }
    // dish (snipeable)
    if (!st?.dishDown) {
      for (let y = 0; y < 14; y++) for (let x = 6; x < 26; x++) { const dx = (x - 16) / 10, dy = (y - 7) / 7; if (dx * dx + dy * dy < 1) b.px(x, y, dx * dx + dy * dy < 0.4 ? MET[4] : dx < 0 ? MET[3] : MET[2]); }
      b.px(16, 7, LIME[3]);
    } else { for (let x = 8; x < 24; x++) b.px(x, 24 - (x >> 2), MET[1]); }
    b.light(8, 40, LIME[2]); b.light(22, 40, VIO[2]);
  },
  jammer(b, st) {
    b.box(6, 30, 20, 24, 6, CH, CH);
    for (let y = 0; y < 34; y++) { b.px(15, y, MET[3]); b.px(16, y, MET[2]); }
    for (const y of [4, 12, 20]) for (let x = 8; x < 24; x++) { const on = !st?.unpowered; b.px(x, y, on ? VIO[(x + y) % 3 + 1] : CH[2]); }
    if (!st?.unpowered) b.px(16, 0, VIO[3]);
  },
  guardTower(b, st) {
    // legs
    for (let y = 18; y < 46; y++) { b.px(2 + ((y - 18) >> 3), y, MET[2]); b.px(13 - ((y - 18) >> 3), y, MET[1]); }
    for (let x = 3; x < 13; x++) { b.px(x, 30, MET[1]); b.px(x, 40, MET[1]); }
    // cabin
    b.box(0, 4, 16, 8, 8, CH, CH);
    for (let x = 1; x < 15; x++) b.px(x, 2, CH[3]);
    // roof rail & corner posts: a readable tower silhouette against any ground
    for (let x = 0; x < 16; x++) b.px(x, 0, MET[3]);
    for (const x of [0, 5, 10, 15]) { b.px(x, 1, MET[2]); b.px(x, 2, MET[1]); b.px(x, 3, MET[1]); }
    // gunner (snipeable) visible in the window
    if (!st?.gunnerDead) { b.rect(6, 12, 4, 4, CH[2]); b.px(6, 12, LIME[3]); b.px(8, 12, LIME[3]); b.rect(10, 13, 5, 1, MET[3]); }
    else b.rect(6, 12, 4, 4, CH[0]);
    // searchlight
    if (!st?.lightDead) { b.rect(1, 5, 3, 2, MET[4]); b.px(0, 5, '#FFF6C0'); }
  },
  gunTurret(b, st) {
    b.box(1, 6, 14, 12, 6, MET, MET);
    // dome with a dark outline
    for (let y = 1; y < 13; y++) for (let x = 2; x < 14; x++) { const dx = (x - 8) / 6, dy = (y - 8) / 7; const d = dx * dx + dy * dy; if (d < 1) b.px(x, y, d > 0.72 ? MET[0] : -dx - dy > 0.3 ? MET[3] : MET[2]); }
    // long twin barrel, outlined
    for (let x = 8; x < 16; x++) { b.px(x, 6, MET[0]); b.px(x, 7, MET[3]); b.px(x, 8, MET[1]); b.px(x, 9, MET[0]); }
    b.px(15, 7, '#1A1C1E'); b.px(15, 8, '#1A1C1E');
    b.px(6, 6, st?.unpowered ? CH[1] : LIME[3]);
  },
  mgNest(b, st) {
    for (let j = 0; j < 12; j++) { b.px(0, 9 + j, SAND[2]); b.px(1, 9 + j, SAND[1]); b.px(31, 9 + j, SAND[1]); b.px(30, 9 + j, SAND[2]); }
    if (!st?.gunnerDead) { b.rect(13, 8, 5, 7, CH[2]); b.px(14, 9, LIME[3]); b.px(16, 9, LIME[3]); }
    for (let i = 0; i < 32; i++) for (let j = 0; j < 6; j++) {
      const c = j === 0 ? SAND[3] : j < 3 ? SAND[2] : SAND[1];
      if ((i % 6 === 0) && j > 0) b.px(i, 15 + j, SAND[0]); else b.px(i, 15 + j, c);
    }
    for (let x = 16; x < 27; x++) b.px(x, 13, MET[1]);
    b.px(26, 13, MET[3]);
  },
  alarmPylon(b, st) {
    for (let y = 6; y < 38; y++) { b.px(7, y, MET[3]); b.px(8, y, MET[1]); }
    if (!st?.sirenDead) { b.rect(3, 2, 10, 5, MET[2]); b.rect(4, 3, 8, 3, OR[2]); b.px(7, 0, OR[3]); b.px(8, 0, OR[3]); }
    else b.rect(3, 2, 10, 5, CH[0]);
    b.box(3, 34, 10, 4, 0, CH, CH);
  },
  detentionBlock(b) {
    b.box(0, 0, 48, 48, 14, ['#1E2226', '#2E3438', '#40484E', '#5A646A'], CH, { plates: 8, ribs: 4 });
    for (let x = 4; x < 44; x += 8) for (let y = 50; y < 57; y++) b.px(x, y, MET[3]);
    b.rect(20, 51, 8, 11, CH[0]);
    b.light(6, 4, OR[2]); b.light(40, 4, OR[2]);
  },
  fuelDepot(b, st) {
    const rng = new Rng(4);
    for (const [cx, cy] of [[7, 12], [18, 10], [27, 15], [10, 24], [22, 26], [30, 30]]) {
      for (let y = cy - 4; y <= cy + 5; y++) for (let x = cx - 4; x <= cx + 4; x++) { const dx = (x - cx) / 4; if (Math.abs(dx) <= 1) b.px(x, y, y < cy - 2 ? OR[3] : dx < -0.3 ? OR[2] : dx < 0.4 ? OR[1] : OR[0]); }
      b.px(cx, cy - 4, MET[3]);
      if (rng.chance(0.5)) for (let x = cx - 4; x <= cx + 4; x++) b.px(x, cy + 1, '#1A1A1A');
    }
  },
  shieldGenerator(b, st) {
    b.box(0, 12, 32, 20, 18, CH, CH, { plates: 8 });
    for (let y = 0; y < 22; y++) for (let x = 8; x < 24; x++) { const dx = (x - 16) / 8; if (Math.abs(dx) < 1 - y / 26 + 0.1) b.px(x, 21 - y, st?.unpowered ? CH[3] : VIO[1 + ((x + y) % 3)]); }
    if (!st?.unpowered) b.px(16, 0, VIO[3]);
  },
  hiveSpire(b, st) {
    const rng = new Rng(9);
    const W = 64, top = 0, base = 84 + 64;
    for (let y = 0; y < base; y++) {
      const k = y / base;
      const hw = 6 + k * k * 28;
      for (let x = Math.floor(32 - hw); x <= Math.ceil(32 + hw); x++) {
        const dx = (x - 32) / hw;
        let c = dx < -0.5 ? CH[4] : dx < 0 ? CH[3] : dx < 0.6 ? CH[2] : CH[1];
        if (((y + Math.floor(dx * 6)) % 9) === 0) c = VIO[1];
        b.px(x, y, c);
      }
    }
    for (let i = 0; i < 26; i++) { const y = 10 + i * 5, x = 32 + Math.round(Math.sin(i * 1.7) * (4 + i * 0.9)); b.px(x, y, st?.unpowered ? LIME[1] : LIME[3]); b.px(x + 1, y, LIME[2]); }
    b.px(32, 0, VIO[3]); b.px(31, 1, VIO[2]);
  },
  gate(b) {
    b.box(0, 0, 16, 16, 9, MET, MET, { ribs: 3 });
    for (let x = 2; x < 14; x += 3) for (let y = 17; y < 24; y++) b.px(x, y, MET[0]);
    b.px(7, 1, OR[3]);
  },
};

/** Snipeable parts in sprite px (world scale). */
export const STRUCT_ZONES = {
  guardTower: [{ name: 'gunner', x: 5, y: 11, w: 6, h: 6, prio: 5 }, { name: 'searchlight', x: 0, y: 4, w: 4, h: 4, prio: 4 }, { name: 'hull', x: 0, y: 0, w: 16, h: 46, prio: 1 }],
  mgNest: [{ name: 'gunner', x: 12, y: 7, w: 7, h: 8, prio: 5 }, { name: 'hull', x: 0, y: 9, w: 32, h: 12, prio: 1 }],
  powerPlant: [{ name: 'coolant', x: 39, y: 48, w: 8, h: 12, prio: 5 }, { name: 'hull', x: 0, y: 0, w: 48, h: 64, prio: 1 }],
  commsArray: [{ name: 'dish', x: 5, y: 0, w: 22, h: 15, prio: 5 }, { name: 'hull', x: 0, y: 0, w: 32, h: 58, prio: 1 }],
  alarmPylon: [{ name: 'siren', x: 2, y: 0, w: 12, h: 8, prio: 5 }, { name: 'hull', x: 0, y: 0, w: 16, h: 38, prio: 1 }],
  fuelDepot: [{ name: 'barrel', x: 0, y: 4, w: 36, h: 32, prio: 5 }],
};

const cache = new Map();
/**
 * @param {string} type
 * @param {any} [st] state flags affecting the art (gunnerDead, dishDown, unpowered…)
 * @returns {{canvas: HTMLCanvasElement, w:number, h:number, Hb:number, ox:number, zones:any[]}}
 */
export function structureSprite(type, st = {}) {
  const key = type + JSON.stringify(st);
  let s = cache.get(key);
  if (s) return s;
  const d = STRUCT_DEFS[type];
  const b = new B(d.w, d.h, d.Hb, type === 'hiveSpire' ? 0 : 0);
  (PAINT[type] || PAINT.barracks)(b, st);
  const pix = b.done();
  s = { get canvas() { return this._c || (this._c = pix.toCanvas()); }, _c: null, w: pix.w, h: pix.h, Hb: d.Hb, ox: b.ox, zones: STRUCT_ZONES[type] || [{ name: 'hull', x: 0, y: 0, w: pix.w, h: pix.h, prio: 1 }], pix };
  cache.set(key, s);
  return s;
}
