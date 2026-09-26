// @ts-check
import { TERRAIN, TERRAIN_BY_CH, OVERLAY, OVERLAY_BY_CH, O, T, DIRS4 } from './tiles.js';
import { computeAutotile } from './autotile.js';

/**
 * Decoded map (SPEC §19.3). All layers are flat typed arrays indexed y*w+x.
 */
export class GameMap {
  /** @param {any} data mission module data */
  constructor(data) {
    this.data = data;
    this.id = data.id;
    this.biome = data.biome || 'temperate';
    this.w = data.size.w; this.h = data.size.h;
    const N = this.w * this.h;
    this.terrain = new Uint8Array(N);
    this.elev = new Uint8Array(N);
    this.overlay = new Uint8Array(N);
    this.rampDir = new Int8Array(N).fill(-1);   // 0 N 1 E 2 S 3 W: direction of the higher tile
    this.cliff = new Uint8Array(N);             // 1 = impassable cliff edge (S or E face)
    this.blockH = new Float32Array(N);
    this.soft = new Uint8Array(N);
    this.cost = new Float32Array(N);            // infantry
    this.vcost = new Float32Array(N);           // vehicles (Infinity = no)
    this.conceal = new Float32Array(N);
    this.structure = new Int32Array(N).fill(-1); // structure index occupying tile
    this.blocked = new Uint8Array(N);           // dynamic blockers (crater, fire…)
    this.coverObj = new Uint8Array(N);          // low cover object
    this.coverTile = new Uint8Array(N);         // walkable tile that counts as "in/adjacent to cover"
    this.demolishable = new Uint8Array(N);
    this.version = 0;                           // bump when passability changes
    this.decode(data);
    computeAutotile(this);
    this.recompute();
  }
  idx(x, y) { return y * this.w + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  decode(data) {
    const { w, h } = this;
    for (let y = 0; y < h; y++) {
      const tr = data.terrain[y] || '', er = data.elevation[y] || '', or = data.overlay[y] || '';
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const td = TERRAIN_BY_CH[tr[x]] || TERRAIN[0];
        this.terrain[i] = td.id;
        const e = er.charCodeAt(x) - 48;
        this.elev[i] = e >= 0 && e <= 3 ? e : 0;
        const od = OVERLAY_BY_CH[or[x]] || OVERLAY[0];
        this.overlay[i] = od.id;
      }
    }
    for (const b of data.demolishable || []) this.demolishable[this.idx(b.x, b.y)] = 1;
  }
  /** Recompute derived per-tile properties (after terrain/overlay/structure changes). */
  recompute() {
    const N = this.w * this.h;
    for (let i = 0; i < N; i++) this.recomputeTile(i);
    // cover tiles: walkable tiles adjacent (8-neigh) to a cover object, or rubble
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.recomputeCover(x, y);
    this.version++;
  }
  recomputeTile(i) {
    const td = TERRAIN[this.terrain[i]];
    const od = OVERLAY[this.overlay[i]];
    let cost = td.cost;
    if (od.cost) cost = Math.max(cost, od.cost);
    if (od.id === O.bridge) cost = 1.0;
    if (od.id === O.ramp) cost = 1.1;
    if (!od.passable || this.cliff[i] || this.structure[i] >= 0 || this.blocked[i]) cost = Infinity;
    this.cost[i] = cost;
    let vc = Infinity;
    const vehOk = (td.veh || od.id === O.bridge) && od.veh !== false && od.passable && !this.cliff[i] && this.structure[i] < 0 && !this.blocked[i];
    if (vehOk) vc = od.id === O.bridge ? 1 / 1.3 : 1 / (td.vehMult || 1);
    this.vcost[i] = vc;
    let bh = od.blockH;
    if (this.structure[i] >= 0 && this.structBlockH) bh = Math.max(bh, this.structBlockH[i] || 0);
    this.blockH[i] = bh;
    this.soft[i] = od.soft ? 1 : 0;
    this.conceal[i] = Math.min(td.conceal, od.conceal ?? 1);
    this.coverObj[i] = od.cover ? 1 : 0;
  }
  recomputeCover(x, y) {
    const i = this.idx(x, y);
    const od = OVERLAY[this.overlay[i]];
    let c = od.coverTile ? 1 : 0;
    if (!c && this.cost[i] < Infinity) {
      for (let dy = -1; dy <= 1 && !c; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (!this.inb(nx, ny)) continue;
        const j = this.idx(nx, ny);
        if ((this.coverObj[j] || this.structure[j] >= 0 || OVERLAY[this.overlay[j]].id === O.wall) && this.elev[j] === this.elev[i]) { c = 1; break; }
      }
    }
    this.coverTile[i] = c;
  }
  /** Set a structure footprint. */
  setStructure(sIndex, x, y, w, h, blockH) {
    if (!this.structBlockH) this.structBlockH = new Float32Array(this.w * this.h);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (!this.inb(xx, yy)) continue;
      const i = this.idx(xx, yy);
      this.structure[i] = sIndex;
      this.structBlockH[i] = blockH;
      this.recomputeTile(i);
    }
    for (let yy = y - 1; yy <= y + h; yy++) for (let xx = x - 1; xx <= x + w; xx++) if (this.inb(xx, yy)) this.recomputeCover(xx, yy);
    this.version++;
  }
  clearStructure(x, y, w, h, rubble = true) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (!this.inb(xx, yy)) continue;
      const i = this.idx(xx, yy);
      this.structure[i] = -1;
      if (this.structBlockH) this.structBlockH[i] = 0;
      if (rubble) this.overlay[i] = O.rubble;
      this.recomputeTile(i);
    }
    for (let yy = y - 1; yy <= y + h; yy++) for (let xx = x - 1; xx <= x + w; xx++) if (this.inb(xx, yy)) this.recomputeCover(xx, yy);
    this.version++;
  }
  setTerrain(x, y, ch) {
    const i = this.idx(x, y);
    this.terrain[i] = (TERRAIN_BY_CH[ch] || TERRAIN[0]).id;
    this.recomputeTile(i);
    for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (this.inb(xx, yy)) this.recomputeCover(xx, yy);
    this.version++;
  }
  setOverlay(x, y, ch) {
    const i = this.idx(x, y);
    this.overlay[i] = OVERLAY_BY_CH[ch].id;
    this.recomputeTile(i);
    for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (this.inb(xx, yy)) this.recomputeCover(xx, yy);
    this.version++;
  }
  setBlocked(x, y, v) {
    if (!this.inb(x, y)) return;
    const i = this.idx(x, y);
    this.blocked[i] = v ? 1 : 0;
    this.recomputeTile(i);
    this.version++;
  }
  walkable(x, y) { return this.inb(x, y) && this.cost[this.idx(x, y)] < Infinity; }
  elevAt(x, y) { return this.inb(x, y) ? this.elev[this.idx(x, y)] : 0; }
  terrainAt(x, y) { return TERRAIN[this.terrain[this.idx(x, y)]]; }
  overlayAt(x, y) { return OVERLAY[this.overlay[this.idx(x, y)]]; }
  isRoad(x, y) { return this.inb(x, y) && this.terrain[this.idx(x, y)] === T.road; }
  /**
   * Can a unit step from tile a to adjacent tile b? (ramps are the only way between levels)
   * @param {boolean} [veh] use vehicle passability
   */
  canStep(ax, ay, bx, by, veh = false) {
    if (!this.inb(bx, by)) return false;
    const bi = this.idx(bx, by), ai = this.idx(ax, ay);
    if ((veh ? this.vcost[bi] : this.cost[bi]) === Infinity) return false;
    const dx = bx - ax, dy = by - ay;
    const ea = this.elev[ai], eb = this.elev[bi];
    if (ea === eb) {
      if (dx && dy) {
        // no corner cutting: both orthogonals must be passable & same level
        const i1 = this.idx(ax + dx, ay), i2 = this.idx(ax, ay + dy);
        const c1 = veh ? this.vcost[i1] : this.cost[i1], c2 = veh ? this.vcost[i2] : this.cost[i2];
        if (c1 === Infinity || c2 === Infinity) return false;
        if (this.elev[i1] !== ea || this.elev[i2] !== ea) return false;
      }
      return true;
    }
    if (dx && dy) return false;
    if (Math.abs(ea - eb) !== 1) return false;
    const d = dy === -1 ? 0 : dx === 1 ? 1 : dy === 1 ? 2 : 3;
    if (eb === ea + 1) return this.rampDir[ai] === d;            // walking up the ramp
    return this.rampDir[bi] === ((d + 2) & 3);                   // walking down onto the ramp
  }
  /** Find the nearest walkable tile to (x,y) (optionally same elevation), BFS by ring. */
  nearestWalkable(x, y, maxR = 8, veh = false, elev = -1) {
    x = Math.max(0, Math.min(this.w - 1, Math.round(x))); y = Math.max(0, Math.min(this.h - 1, Math.round(y)));
    const ok = (xx, yy) => this.inb(xx, yy) && (veh ? this.vcost : this.cost)[this.idx(xx, yy)] < Infinity && (elev < 0 || this.elev[this.idx(xx, yy)] === elev);
    if (ok(x, y)) return { x, y };
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = Infinity;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (ok(x + dx, y + dy)) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { x: x + dx, y: y + dy }; } }
      }
      if (best) return best;
    }
    return null;
  }
}
export { DIRS4 };
