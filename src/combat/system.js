// @ts-check
import { Particles } from '../render/particles.js';
import { Projectiles } from './projectiles.js';
import { PlayerPistol } from './weapons.js';
import { dropDecal } from '../render/decals.js';
import { Pix } from '../render/pixel.js';
import { TILE } from '../core/camera.js';
import { Rng } from '../core/rng.js';
import { BALANCE } from '../config/balance.js';
import { damageOperative, killUnit, damageUnit } from './damage.js';
import { explode } from './explosions.js';
import { createBlast } from '../render/rtsBlast.js';

/**
 * Combat glue: particles, projectiles, player pistol, explosion visuals, rifle reload.
 */
export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.particles = new Particles(this.world.fxRng);
    this.projectiles = new Projectiles(this);
    this.pistol = new PlayerPistol(this);
    /** @type {any[]} */ this.effects = [];
    /** @type {{t:number, fn:Function}[]} */ this.delayed = [];
    this.godMode = !!game.app.params.get('god');
  }
  get enemies() { return this.game.enemies; }
  /** run fn after t seconds of *world* time (respects slow-mo & pause) */
  later(t, fn) { this.delayed.push({ t, fn }); }
  damageOp(dmg, from, kind) { return damageOperative(this, dmg, from, kind); }
  kill(u, cause) { killUnit(this, u, cause); }
  damageFriendly(f, dmg, from) { this.game.friendlies?.damage?.(f, dmg, from); }
  disableVehicle(v, why) { this.game.vehicles?.disable(v, why); }
  /** explosion side-effects: structures take ×0.5, barrels & fuel chain after 0.2 s */
  onExplosion(x, y, radius, damage, o) {
    const g = this.game, E = BALANCE.explosions;
    g.props?.chain(x, y, radius);
    for (const v of this.world.units) {
      if (v.dead || v.kind !== 'vehicle' || v.exploded || !(v.type === 'fuelHauler' || v.type === 'skitter')) continue;
      if (Math.hypot(v.x - x, v.y - y) > radius) continue;
      v.exploded = true;
      this.later(BALANCE.explosions.chainDelay, () => { if (!v.dead) g.vehicles.hitZone(v, v.type === 'fuelHauler' ? 'tank' : 'jerrycan'); else { const X = BALANCE.explosions; const big = v.type === 'fuelHauler'; this.later(0, () => g.vehicles && explodeAt(this, v, big)); } });
    }
    for (const s of this.world.structures || []) {
      if (s.dead) continue;
      const d = s.distTo(x, y);
      if (d > radius) continue;
      const dmg = damage * (1 - (1 - E.edgeFactor) * (d / radius)) * (o.buildingMult ?? E.mult.building);
      if (s.def.explodes && d <= radius) { this.later(BALANCE.explosions.chainDelay, () => g.structures?.destroy(s, { by: 'chain' })); continue; }
      g.structures?.damage(s, dmg, { by: 'explosion' });
      if (s.gunner && !s.gunner.dead && d < radius * 0.7) { s.gunner.dead = true; s.st = { ...s.st, gunnerDead: true }; }
    }
    if (o.fire) g.structures?.spawnFire(x, y, radius, o.fire);
  }
  update(dt) {
    if (this.delayed.length) {
      for (const d of this.delayed) d.t -= dt;
      const due = this.delayed.filter((d) => d.t <= 0);
      this.delayed = this.delayed.filter((d) => d.t > 0);
      for (const d of due) d.fn();
    }
    this.pistol.update(dt);
    this.projectiles.update(dt);
    const terrain = this.game.renderer?.terrain;
    this.particles.update(dt, (p) => { if (terrain && this.world.rng) terrain.addDecal(dropDecal(p.x, p.y, p.col)); });
    for (const e of this.effects) {
      e.t += dt;
      // a rising smoke column after big blasts
      if (e.kind === 'column' && Math.random() < dt * (10 + e.r * 4) * (1 - e.t / e.life)) this.particles.smoke(e.x + (Math.random() - 0.5) * e.r * 0.6, e.y - 0.2, 1, 1.2 + e.r * 0.2, Math.random() < 0.5 ? '#3A3634' : '#56504C');
      if (e.kind === 'column' && Math.random() < dt * 4 * (1 - e.t / e.life)) this.particles.fire(e.x, e.y, 1);
    }
    this.effects = this.effects.filter((e) => e.t < e.life);
    const op = this.world.operative;
    if (op.firingT > 0) op.firingT -= dt;
    // rifle reload happens outside the scope
    if (this.game.reloadT > 0 && !this.game.scopeOpen) {
      this.game.reloadT -= dt;
      if (this.game.reloadT <= 0) {
        const need = BALANCE.weapons.rifle.mag - op.rifleMag;
        const take = Math.min(need, op.rifleReserve);
        op.rifleMag += take; op.rifleReserve -= take;
        this.game.audio?.play?.('reloadDone');
      }
    }
  }
  startReload() {
    const op = this.world.operative;
    if (this.game.reloadT > 0 || op.rifleReserve <= 0 || op.rifleMag >= BALANCE.weapons.rifle.mag) return;
    this.game.reloadT = BALANCE.weapons.rifle.reload;
    this.game.audio?.play?.('reload');
  }
  /** effects layer (after sorted sprites, before fog) */
  draw(ctx, renderer) {
    const cam = renderer.cam, z = cam.zoom;
    for (const e of this.effects) {
      if (e.kind === 'rtsBlast') {
        // (sprite-pixel units, scaled by the zoom — integer, so it stays crisp)
        e.fn = e.fn || createBlast(e.big ? 'building' : 'vehicle', e.seed, Math.max(0.8, e.r / 1.6));
        ctx.save();
        ctx.translate(Math.round((e.x * TILE - cam.left) * z), Math.round((e.y * TILE - cam.top) * z));
        ctx.scale(z, z);
        e.fn(ctx, 0, 0, e.t);
        ctx.restore();
        continue;
      }
      if (e.kind !== 'explosion') continue;
      const frames = explosionFrames(Math.max(8, Math.round(e.r * TILE * 0.9)));
      const k = Math.min(frames.length - 1, Math.floor((e.t / e.life) * frames.length));
      const f = frames[k];
      ctx.drawImage(f, Math.round((e.x * TILE - cam.left) * z - (f.width / 2) * z), Math.round((e.y * TILE - cam.top) * z - f.height * 0.62 * z), f.width * z, f.height * z);
    }
    this.projectiles.draw(ctx, cam);
    this.particles.draw(ctx, cam);
  }
}

const expCache = new Map();
/** 8-frame pixel explosion (fire & smoke — orange/yellow, never gore colours). */
export function explosionFrames(R) {
  let f = expCache.get(R);
  if (f) return f;
  f = [];
  const rng = new Rng(R * 7 + 1);
  const W = R * 2 + 8, H = R * 2 + 12;
  const cx = W / 2, cy = H * 0.62;
  const cols = ['#FFFFFF', '#FFF1A8', '#FFC24A', '#FF9A2A', '#E8601A', '#8A3A18', '#4A4440', '#2A2826'];
  for (let k = 0; k < 8; k++) {
    const p = new Pix(W, H);
    const grow = [0.45, 0.75, 0.95, 1.0, 1.0, 0.95, 0.9, 0.85][k];
    const r = R * grow;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) * 1.15 + (k >= 4 ? (k - 3) * 1.5 : 0);
      const n = rng.next() * 0.25;
      const d = Math.hypot(dx, dy) / r + n - 0.1;
      if (d > 1) continue;
      let c;
      if (k === 0) c = d < 0.6 ? cols[0] : cols[1];
      else if (k === 1) c = d < 0.4 ? cols[0] : d < 0.75 ? cols[1] : cols[2];
      else if (k <= 3) c = d < 0.3 ? cols[1] : d < 0.6 ? cols[2] : d < 0.85 ? cols[3] : cols[4];
      else if (k <= 5) c = d < 0.35 ? cols[3] : d < 0.6 ? cols[4] : d < 0.8 ? cols[5] : cols[6];
      else { if (rng.next() < (k - 5) * 0.3) continue; c = d < 0.5 ? cols[6] : cols[7]; }
      p.set(x, y, c);
    }
    f.push(p.toCanvas());
  }
  expCache.set(R, f);
  return f;
}

/** blast for a fuel vehicle that was already wrecked when the chain reached it */
function explodeAt(sys, v, big) {
  const X = BALANCE.explosions;
  explode(sys, v.x, v.y, big ? X.fuelTruck.radius : X.buggyJerrycan.radius, big ? X.fuelTruck.damage : X.buggyJerrycan.damage, { source: 'player', fire: big ? 6 : 0 });
}
