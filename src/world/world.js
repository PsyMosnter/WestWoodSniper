// @ts-check
import { GameMap } from './map.js';
import { Pathfinder } from './pathfinding.js';
import { Fog } from './fog.js';
import { Events } from '../core/events.js';
import { Rng } from '../core/rng.js';
import { BALANCE } from '../config/balance.js';
import { Operative } from '../entities/operative.js';

/**
 * The live game world: map, entities (arrays by category + spatial hash), fog, pathfinding.
 * Systems (AI, combat, missions) attach to it.
 */
export class World {
  constructor(data, opts = {}) {
    this.data = data;
    this.map = new GameMap(data);
    this.pf = new Pathfinder(this.map);
    this.fog = new Fog(this.map);
    this.events = new Events();
    this.rng = new Rng(opts.seed ?? 1234);
    this.fxRng = new Rng((opts.seed ?? 1234) ^ 0x5bd1e995);
    this.settings = opts.settings || {};
    this.difficulty = BALANCE.difficulty[opts.difficulty || 'operative'];
    /** enemy damage scale: difficulty × mission (M1 is a gentler tutorial) */
    this.enemyDamage = this.difficulty.damage * (data.enemyDamageMult ?? 1);
    this.time = 0;
    this.units = [];        // NOT units (infantry + vehicles)
    this.structures = [];
    this.props = [];        // barrels, pickups…
    this.friendlies = [];
    this.projectiles = [];
    this.noises = [];       // recent noise events (debug / AI)
    this.systems = [];      // {update(dt)} extra systems
    this.operative = new Operative(this, data.player);
    this.fogT = 0;
    this.hash = new SpatialHash(this.map.w, this.map.h, 8);
    this.timeOfDay = data.time || 'day';
    this.corpses = [];
    this.stats = { kills: 0, headshots: 0, rifleKills: 0, rifleShots: 0, rifleHits: 0, pistolShots: 0, timesDetected: 0, alarms: 0, time: 0 };
  }
  /**
   * Where should a unit at (fx,fy) go when the player taps (tx,ty)? Walkable → itself. Otherwise the
   * nearby walkable tile that is both close to the tap and cheap to reach (so tapping water or a cliff
   * face doesn't trigger a detour to the far side).
   */
  resolveGoal(fx, fy, tx, ty, veh = false) {
    const m = this.map;
    if (!m.inb(tx, ty)) return null;
    if ((veh ? m.vcost : m.cost)[m.idx(tx, ty)] < Infinity) return { x: tx, y: ty };
    const field = this.pf.field(fx, fy, 400, { veh });
    let best = null, bs = Infinity;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = tx + dx, y = ty + dy;
      if (!m.inb(x, y)) continue;
      const i = m.idx(x, y);
      if (field[i] === Infinity) continue;
      const sc = Math.hypot(dx, dy) * 3 + field[i] * 0.15;
      if (sc < bs) { bs = sc; best = { x, y }; }
    }
    return best;
  }
  /** Straight-line path smoothing (any-angle walking where the line is clear). */
  smoothPath(sx, sy, path, veh = false) {
    if (path.length < 2) return path;
    const m = this.map;
    const out = [];
    let cx = sx, cy = sy;
    let i = 0;
    while (i < path.length) {
      let j = path.length - 1;
      // farthest reachable waypoint in a straight line (limit look-ahead for speed)
      const maxJ = Math.min(path.length - 1, i + 12);
      j = maxJ;
      for (; j > i; j--) if (this.lineWalkable(cx, cy, path[j].x + 0.5, path[j].y + 0.5, path, i, j, veh)) break;
      out.push(path[j]);
      cx = path[j].x + 0.5; cy = path[j].y + 0.5;
      i = j + 1;
    }
    return out;
  }
  lineWalkable(x0, y0, x1, y1, path, i0, i1, veh) {
    const m = this.map;
    let maxCost = 0;
    for (let k = i0; k <= i1; k++) maxCost = Math.max(maxCost, (veh ? m.vcost : m.cost)[m.idx(path[k].x, path[k].y)]);
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(d / 0.2);
    let px = Math.floor(x0), py = Math.floor(y0);
    // require a clearance margin so units don't clip corners
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      for (const [ox, oy] of [[0, 0], [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) {
        const tx = Math.floor(x + ox), ty = Math.floor(y + oy);
        if (!m.inb(tx, ty)) return false;
        const c = (veh ? m.vcost : m.cost)[m.idx(tx, ty)];
        if (c === Infinity || c > maxCost + 0.01) return false;
        if (m.elev[m.idx(tx, ty)] !== m.elev[m.idx(px, py)] && !(tx === px && ty === py)) {
          if (!m.canStep(px, py, tx, ty, veh)) return false;
        }
      }
      const tx = Math.floor(x), ty = Math.floor(y);
      if (tx !== px || ty !== py) {
        if (Math.abs(tx - px) > 1 || Math.abs(ty - py) > 1) return false;
        if (!m.canStep(px, py, tx, ty, veh)) return false;
        px = tx; py = ty;
      }
    }
    return true;
  }
  /** Emit a noise event (SPEC §8.2). AI listens via events. */
  noise(x, y, radius, kind, source = null, extra = null) {
    const n = { x, y, radius, kind, t: this.time, source, ...(extra || {}) };
    this.noises.push(n);
    if (this.noises.length > 40) this.noises.shift();
    this.events.emit('noise', n);
  }
  visionSources() {
    const op = this.operative;
    const m = this.map;
    const src = [];
    if (!op.dead) {
      let r = BALANCE.operative.visionTiles + op.elev * BALANCE.operative.visionPerElev;
      if (this.weather === 'blizzard' && this.blizzard) r *= BALANCE.ai.blizzardVision;
      src.push({ x: op.tx, y: op.ty, r: Math.round(r * 10) / 10 });
    }
    for (const f of this.friendlies) if (!f.dead && f.vision !== 0) src.push({ x: Math.floor(f.x), y: Math.floor(f.y), r: f.vision ?? BALANCE.units.friendlyVision });
    return src;
  }
  update(dt) {
    this.time += dt;
    this.operative.update(dt);
    for (const s of this.systems) s.update(dt);
    this.fog.tick(dt);
    this.fogT -= dt;
    const opTile = this.operative.ty * this.map.w + this.operative.tx;
    if (this.fogT <= 0 || opTile !== this.lastOpTile) {
      this.fogT = 1 / BALANCE.sim.fogHz;
      this.lastOpTile = opTile;
      this.fog.update(this.visionSources());
    }
  }
}

/** Spatial hash with 8×8-tile buckets (SPEC §19.2). */
export class SpatialHash {
  constructor(w, h, cell) {
    this.cell = cell; this.cw = Math.ceil(w / cell); this.ch = Math.ceil(h / cell);
    this.buckets = Array.from({ length: this.cw * this.ch }, () => new Set());
    this.where = new Map();
  }
  update(e) {
    const bx = Math.max(0, Math.min(this.cw - 1, Math.floor(e.x / this.cell)));
    const by = Math.max(0, Math.min(this.ch - 1, Math.floor(e.y / this.cell)));
    const b = by * this.cw + bx;
    const old = this.where.get(e);
    if (old === b) return;
    if (old !== undefined) this.buckets[old].delete(e);
    this.buckets[b].add(e);
    this.where.set(e, b);
  }
  remove(e) { const old = this.where.get(e); if (old !== undefined) { this.buckets[old].delete(e); this.where.delete(e); } }
  /** entities within radius (tiles) */
  query(x, y, r, out = []) {
    const c = this.cell;
    const x0 = Math.max(0, Math.floor((x - r) / c)), x1 = Math.min(this.cw - 1, Math.floor((x + r) / c));
    const y0 = Math.max(0, Math.floor((y - r) / c)), y1 = Math.min(this.ch - 1, Math.floor((y + r) / c));
    const r2 = r * r;
    for (let by = y0; by <= y1; by++) for (let bx = x0; bx <= x1; bx++) {
      for (const e of this.buckets[by * this.cw + bx]) if ((e.x - x) ** 2 + (e.y - y) ** 2 <= r2) out.push(e);
    }
    return out;
  }
}
