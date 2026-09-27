// @ts-check
import { BALANCE } from '../config/balance.js';
import { dirIndex, angleToDir8, TERRAIN, T as TT } from '../world/tiles.js';
import { stanceRange } from '../ai/perception.js';

const S = BALANCE.stances;

/**
 * The Operative "WREN" (SPEC §6). Positions are in tiles (float); (x, y) is the ground point.
 * Stances: walk, run (moving) · crouch, cover, hunker (stationary; low-crawls when ordered to move).
 */
export class Operative {
  constructor(world, spec) {
    this.world = world;
    this.id = 'wren';
    this.type = 'operative';
    this.team = 'GOD';
    this.x = spec.x + 0.5; this.y = spec.y + 0.5;
    this.px = this.x; this.py = this.y;
    this.facing = dirIndex(spec.facing || 'N');
    this.angle = -Math.PI / 2;
    this.hp = BALANCE.operative.hp;
    this.maxHp = BALANCE.operative.hp;
    this.stance = 'crouch';
    /** @type {{from:string,to:string,t:number,dur:number,then?:Function|null}|null} */
    this.trans = null;
    /** @type {{x:number,y:number}[]} */
    this.path = [];
    this.mode = 'walk';
    this.animT = 0;
    this.runGun = false;
    this.dest = null;
    this.onArrive = null;
    this.pendingMove = null;
    this.noiseT = 0;
    this.exposure = 1; this.exposureT = 0;
    this.flashT = 0;
    this.hurtT = 0;
    this.dead = false;
    this.busy = null; // {kind, t, dur, onDone} — medkit, planting, freeing…
    const lo = spec.loadout || {};
    this.rifleMag = Math.min(BALANCE.weapons.rifle.mag, lo.rifle ?? 20);
    this.rifleReserve = Math.max(0, (lo.rifle ?? 20) - this.rifleMag);
    this.c4 = lo.c4 ?? 0; this.medkits = lo.medkit ?? 0; this.designator = lo.designator ?? 0; this.smoke = lo.smoke ?? 0;
    this.pistolMag = BALANCE.weapons.pistol.mag;
    this.lastTile = -1;
    this.coverFrom = null; // tile of the cover object used
  }
  get tx() { return Math.floor(this.x); }
  get ty() { return Math.floor(this.y); }
  get elev() { return this.world.map.elevAt(this.tx, this.ty); }
  get moving() { return this.path.length > 0 && !this.blockingTrans; }
  get blockingTrans() { return !!this.trans && (this.trans.from === 'hunker' || this.trans.to === 'hunker'); }
  get isStill() { return !this.moving; }
  /** Low-crawling: moving while staying flat (hunker stance, crawl mode). */
  get crawling() { return this.moving && this.mode === 'crawl'; }
  get hunkered() { return this.stance === 'hunker' && !this.trans; }
  get inScopeStance() { return !this.moving && !this.trans && (this.stance === 'crouch' || this.stance === 'cover' || this.stance === 'hunker'); }

  /** Effective stance for visibility: during a change, the higher-visibility one (SPEC §6.2). */
  visibilityFactor(observer) {
    const f = (st) => {
      if (st === 'cover') {
        if (observer && this.coverFrom && this.coverBetween(observer)) return S.cover.vis;
        return S.cover.visUncovered;
      }
      return S[st]?.vis ?? 1;
    };
    let v = this.crawling ? S.crawl.vis : f(this.stance);
    if (this.trans) v = Math.max(f(this.trans.from), f(this.trans.to));
    return v * (this.exposureT > 0 ? this.exposure : 1);
  }
  /**
   * Share of an enemy's sight radius at which WREN can be picked out now (the inner vision cone):
   * stance/movement and the tile's concealment; during a stance change the larger; a shot's exposure
   * (muzzle flash) blows it out to the full radius.
   */
  rangeFactor(observer, conceal = 1) {
    const f = (st) => {
      if (st === 'cover') return stanceRange(observer && this.coverFrom && this.coverBetween(observer) ? 'cover' : 'coverUncovered', conceal);
      return stanceRange(st, conceal);
    };
    let v = this.crawling ? stanceRange('crawl', conceal) : f(this.stance);
    if (this.trans) v = Math.max(f(this.trans.from), f(this.trans.to));
    if (this.exposureT > 0 && this.exposure > 1) v = 1;
    return Math.min(1, v);
  }
  /** Is the cover object between the Operative and an observer? */
  coverBetween(obs) {
    const c = this.coverFrom;
    if (!c) return false;
    const ox = obs.x - this.x, oy = obs.y - this.y;
    const cx = c.x + 0.5 - this.x, cy = c.y + 0.5 - this.y;
    const d = Math.hypot(ox, oy) || 1;
    return (ox * cx + oy * cy) / d > 0.35;
  }

  startTrans(to, dur, then = null) {
    const from = this.trans ? this.trans.to : this.stance;
    this.trans = { from, to, t: 0, dur, then };
  }

  /**
   * Walk/run to a tile. Instant response; hunker exits first (0.7 s) — except a 'crawl' order, which
   * keeps WREN flat and low-crawls there (from any other stance a crawl order is a normal walk).
   * @param {'walk'|'run'|'crawl'} mode
   */
  orderMove(tx, ty, mode = 'walk', onArrive = null) {
    if (this.dead) return false;
    if (this.busy) { const b = this.busy; this.busy = null; b.onCancel?.(); }
    const m = this.world.map;
    const goal = this.world.resolveGoal(this.tx, this.ty, tx, ty);
    if (!goal) return false;
    const goingFlat = !!this.trans && this.trans.to === 'hunker';
    if (mode === 'crawl' && (this.stance === 'hunker' || goingFlat)) {
      if (goingFlat) {
        // still getting down: crawl as soon as WREN is flat
        this.pendingMove = { tx: goal.x, ty: goal.y, mode, onArrive };
        const tr = this.trans, then = tr.then;
        tr.then = () => { then?.(); this._consumePending(); };
        return true;
      }
      if (this.trans) return false;                     // getting up: ignore
      const path = this.world.pf.find(this.tx, this.ty, goal.x, goal.y, { partial: true });
      if (!path) return false;
      this.path = this.world.smoothPath(this.x, this.y, path);
      this.mode = 'crawl';
      this.dest = goal;
      this.onArrive = onArrive;
      this.coverFrom = null;
      if (!this.path.length) this._arrive();
      return true;
    }
    if (mode === 'crawl') mode = 'walk';
    if (this.stance === 'hunker' || goingFlat) {
      this.pendingMove = { tx: goal.x, ty: goal.y, mode, onArrive };
      if (!this.trans || this.trans.to === 'hunker') this.startTrans('crouch', S.hunker.exit, () => this._consumePending());
      return true;
    }
    const path = this.world.pf.find(this.tx, this.ty, goal.x, goal.y, { partial: true });
    if (!path) return false;
    this.path = this.world.smoothPath(this.x, this.y, path);
    this.mode = mode;
    this.dest = goal;
    this.onArrive = onArrive;
    this.coverFrom = null;
    this.stance = mode;
    this.trans = null;
    if (!this.path.length) this._arrive();
    return true;
  }
  _consumePending() {
    const p = this.pendingMove; this.pendingMove = null;
    if (p) this.orderMove(p.tx, p.ty, p.mode, p.onArrive);
  }
  /** Upgrade a just-issued walk to a run (double tap). From a crawl, WREN gets up first (0.7 s). */
  upgradeRun() {
    if (this.pendingMove) { this.pendingMove.mode = 'run'; return; }
    if (this.mode === 'crawl' && this.path.length && this.dest) {
      const d = this.dest, cb = this.onArrive;
      this.path = []; this.onArrive = null;
      this.orderMove(d.x, d.y, 'run', cb);
      return;
    }
    if (this.path.length) { this.mode = 'run'; this.stance = 'run'; }
  }
  stop() {
    this.path = []; this.pendingMove = null;
    if (this.stance === 'walk' || this.stance === 'run') this._arrive(false);
  }
  _arrive(callback = true) {
    this.path = [];
    if (this.mode === 'crawl') this.stance = 'hunker';   // a crawl ends flat
    else {
      this.stance = 'crouch';
      this.startTrans('crouch', S.crouchAnim);
      this.trans.from = this.mode;
    }
    const cb = this.onArrive; this.onArrive = null;
    if (callback && cb) cb();
  }

  toggleHunker() {
    if (this.dead) return;
    if (this.stance === 'hunker' || (this.trans && this.trans.to === 'hunker')) {
      this.path = []; this.pendingMove = null; this.onArrive = null;   // stops a crawl where it is
      this.startTrans('crouch', S.hunker.exit, () => { this.stance = 'crouch'; });
      return 'off';
    }
    this.path = []; this.pendingMove = null; this.onArrive = null;
    if (this.runGun) { this.runGun = false; this.world.events.emit('runGunOff'); }
    this.stance = this.stance === 'walk' || this.stance === 'run' ? 'crouch' : this.stance;
    this.startTrans('hunker', S.hunker.enter, () => { this.stance = 'hunker'; });
    return 'on';
  }

  /** Cover button (SPEC §6.2): walk to the best cover tile within 3 tiles, or crouch. */
  takeCover() {
    if (this.dead) return false;
    const w = this.world, m = w.map;
    const threat = w.nearestKnownThreat ? w.nearestKnownThreat(this) : null;
    const field = w.pf.field(this.tx, this.ty, S.coverSearchRadius + 0.6);
    let best = null, bestScore = Infinity;
    const R = S.coverSearchRadius;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = this.tx + dx, y = this.ty + dy;
      if (!m.inb(x, y)) continue;
      const i = y * m.w + x;
      if (!m.coverTile[i] || field[i] === Infinity) continue;
      const obj = findCoverObject(m, x, y, threat);
      let score = field[i];
      if (threat && obj) {
        // prefer cover that sits between the tile and the threat
        const tx = threat.x - (x + 0.5), ty = threat.y - (y + 0.5);
        const cx = obj.x - x, cy = obj.y - y;
        const d = Math.hypot(tx, ty) || 1;
        score -= 2 * ((tx * cx + ty * cy) / d);
      }
      if (score < bestScore) { bestScore = score; best = { x, y, obj }; }
    }
    if (!best) {
      if (this.stance === 'walk' || this.stance === 'run') this.stop();
      w.events.emit('toast', { text: 'NO COVER NEARBY', color: '#FFB23A' });
      return false;
    }
    const enter = () => {
      this.coverFrom = findCoverObject(m, this.tx, this.ty, threat) || best.obj;
      if (this.coverFrom) this.facing = angleToDir8(Math.atan2(this.coverFrom.y + 0.5 - this.y, this.coverFrom.x + 0.5 - this.x));
      this.stance = 'cover';
      this.startTrans('cover', S.crouchAnim);
      this.trans.from = 'crouch';
      w.events.emit('stance', 'cover');
    };
    if (best.x === this.tx && best.y === this.ty) { this.path = []; if (this.stance === 'hunker') { this.startTrans('crouch', S.hunker.exit, enter); } else enter(); return true; }
    this.orderMove(best.x, best.y, 'walk', enter);
    return true;
  }

  update(dt) {
    this.px = this.x; this.py = this.y;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.exposureT > 0) this.exposureT -= dt;
    if (this.dead) return;
    if (this.trans) {
      this.trans.t += dt;
      if (this.trans.t >= this.trans.dur) {
        const tr = this.trans; this.trans = null;
        if (tr.to !== 'walk' && tr.to !== 'run') this.stance = tr.to;
        tr.then?.();
      }
    }
    if (this.busy) {
      this.busy.t += dt;
      const L = this.busy.lunge;
      if (L) { const k = Math.min(1, this.busy.t / L.dur); this.x = L.x0 + (L.x1 - L.x0) * k; this.y = L.y0 + (L.y1 - L.y0) * k; }
      if (this.busy.t >= this.busy.dur) { const b = this.busy; this.busy = null; b.onDone?.(); }
    }
    if (this.path.length && !this.blockingTrans) this._move(dt);
  }

  _move(dt) {
    const m = this.world.map;
    const tileCost = m.cost[m.idx(this.tx, this.ty)];
    const base = this.mode === 'run' ? S.run.speed : this.mode === 'crawl' ? S.crawl.speed : S.walk.speed;
    const speed = base / Math.max(0.5, Math.min(3, tileCost === Infinity ? 1 : tileCost));
    let budget = speed * dt;
    while (budget > 0 && this.path.length) {
      const wp = this.path[0];
      const tx = wp.x + 0.5, ty = wp.y + 0.5;
      const dx = tx - this.x, dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-4) {
        this.angle = Math.atan2(dy, dx);
        this.facing = angleToDir8(this.angle);
      }
      if (d <= budget) { this.x = tx; this.y = ty; budget -= d; this.path.shift(); }
      else { this.x += (dx / d) * budget; this.y += (dy / d) * budget; budget = 0; }
    }
    this.animT += dt * (this.mode === 'run' ? 1.25 : 1) * speed / base;
    // noise from footsteps (running, or walking on noisy terrain)
    this.noiseT -= dt;
    if (this.noiseT <= 0) {
      this.noiseT = 0.5;
      const td = TERRAIN[m.terrain[m.idx(this.tx, this.ty)]];
      let r = 0;
      if (this.mode === 'run') r = BALANCE.noise.run;
      if (td.noise) r = Math.max(r, td.noise * (this.mode === 'crawl' ? S.crawl.noiseMult : 1));
      if (r > 0) this.world.noise(this.x, this.y, r, 'step');
    }
    // deep snow keeps footprints: one every 0.4 tiles, at any speed (a continuous trough)
    if (TERRAIN[m.terrain[m.idx(this.tx, this.ty)]].tracks && Math.hypot(this.x - (this.trackX ?? -9), this.y - (this.trackY ?? -9)) >= 0.4) {
      this.trackX = this.x; this.trackY = this.y;
      this.world.events.emit('track', { x: this.x, y: this.y, a: this.angle });
    }
    if (!this.path.length) this._arrive();
  }

  /** Current sprite pose/frame for rendering */
  pose() {
    let pose = 'crouch', frame = 0;
    const st = this.trans ? this.trans.to : this.stance;
    if (this.dead) return { pose: 'dead', frame: 3 };
    if (this.busy?.kind === 'takedown') return { pose: 'crouch', frame: 0 };   // up off the ground for the takedown
    if (this.moving) {
      if (this.mode === 'crawl') { pose = 'crawl'; frame = Math.floor(this.animT * 4) & 3; }
      else if (this.mode === 'run') { pose = 'run'; frame = Math.floor(this.animT * 7) & 3; }
      else { pose = this.runGun ? 'pistol' : 'walk'; frame = Math.floor(this.animT * 5) & 3; }
    } else if (this.trans) {
      const k = this.trans.t / this.trans.dur;
      if (this.trans.to === 'hunker') pose = k < 0.5 ? 'crouch' : 'prone';
      else if (this.trans.from === 'hunker') pose = k < 0.5 ? 'prone' : 'crouch';
      else if (this.trans.from === 'walk' || this.trans.from === 'run') pose = k < 0.5 ? 'idle' : 'crouch';
      else pose = st === 'cover' ? 'cover' : 'crouch';
    } else if (this.stance === 'hunker') pose = 'prone';
    else if (this.stance === 'cover') pose = 'cover';
    else pose = 'crouch';
    if (this.firingT > 0 && (pose === 'crouch' || pose === 'cover')) pose = 'fire';
    return { pose, frame };
  }
}

/** Find the adjacent cover object tile (prefers the one facing the threat). */
export function findCoverObject(m, x, y, threat) {
  let best = null, bs = -Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (!m.inb(nx, ny)) continue;
    const j = ny * m.w + nx;
    if (!(m.coverObj[j] || m.structure[j] >= 0 || m.overlay[j] === 9)) continue;
    let s = dx && dy ? 0 : 0.5;
    if (threat) {
      const tx = threat.x - (x + 0.5), ty = threat.y - (y + 0.5);
      const d = Math.hypot(tx, ty) || 1;
      s += (tx * dx + ty * dy) / d;
    }
    if (s > bs) { bs = s; best = { x: nx, y: ny }; }
  }
  return best;
}
