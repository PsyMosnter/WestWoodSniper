// @ts-check
import { BALANCE } from '../config/balance.js';
import { canSee } from '../world/los.js';
import { damageOperative, damageUnit, killUnit } from './damage.js';

const H = BALANCE.ai.hit;

/** Enemy hit chance vs the Operative (SPEC §9.4). */
export function enemyHitChance(u, target, dist, range) {
  let p = dist <= H.nearDist ? H.near : H.near + (H.far - H.near) * Math.min(1, (dist - H.nearDist) / Math.max(0.1, range - H.nearDist));
  if (target.stance === 'cover' && !target.trans && target.coverBetween?.(u)) p *= H.cover;
  if (target.hunkered) p *= BALANCE.stances.hunker.hitMult;
  if (target.moving && target.mode === 'run') p *= H.running;
  const eu = u.elev ?? 0, et = target.elev ?? 0;
  if (eu > et) p *= H.highGround; else if (eu < et) p *= H.lowGround;
  return Math.max(0, Math.min(0.95, p));
}

/** One enemy round at a target (tracer, roll, damage). */
export function enemyShoot(sys, u, W, target) {
  const w = sys.world, rng = w.rng;
  const dist = Math.hypot(target.x - u.x, target.y - u.y);
  const p = enemyHitChance(u, target, dist, W.range);
  const hit = rng.next() < p;
  const mx = u.x + Math.cos(u.angle) * 0.4, my = u.y + Math.sin(u.angle) * 0.4 - 0.1;
  sys.particles.muzzle(mx, my, 8);
  u.firingT = 0.12;
  if (hit) {
    sys.particles.tracer(mx, my, target.x, target.y, '#E4FF6A');
    const dmg = W.damage * (w.enemyDamage ?? 1);
    if (target === w.operative) damageOperative(sys, dmg, { x: u.x, y: u.y }, 'bullet');
    else sys.damageFriendly?.(target, dmg, { x: u.x, y: u.y });
  } else {
    const ox = target.x + rng.range(-0.8, 0.8), oy = target.y + rng.range(-0.8, 0.8);
    sys.particles.tracer(mx, my, ox, oy, '#E4FF6A');
    // half the misses against a covered target smack into the cover
    if (target.stance === 'cover' && target.coverFrom && rng.chance(0.5)) sys.particles.sparks(target.coverFrom.x + 0.5, target.coverFrom.y + 0.5, 4, 3);
    else sys.particles.dust(ox, oy, 3);
  }
  sys.game.audio?.play?.('enemyShot', { x: u.x, y: u.y });
  w.noise(u.x, u.y, 8, 'enemyShot', u);
}

/**
 * The Operative's service pistol, used only through Run & Gun (SPEC §6.3–6.4).
 */
export class PlayerPistol {
  constructor(sys) {
    this.sys = sys;
    this.mag = BALANCE.weapons.pistol.mag;
    this.reloadT = 0; this.cool = 0;
    this.tapped = null;
  }
  get P() { return BALANCE.weapons.pistol; }
  canFire() {
    const op = this.sys.world.operative;
    if (!op.runGun || op.dead) return false;
    if (op.moving && op.mode === 'run') return false;
    if (op.stance === 'hunker' || (op.trans && op.trans.to === 'hunker')) return false;
    if (this.sys.game.scopeOpen) return false;
    return true;
  }
  valid(u, op) {
    if (u.dead || u.def.kind === 'vehicle' && u.type !== 'skitter') return false;
    if (u.def.kind === 'structure' || u.kind === 'turret' || (u.kind === 'emplacement' && u.type === 'guardTower')) return false;
    const d = Math.hypot(u.x - op.x, u.y - op.y);
    if (d > this.P.range) return false;
    if (!this.sys.world.fog.isVisible(u.tx, u.ty)) return false;
    return canSee(this.sys.world.map, op.tx, op.ty, u.tx, u.ty, {});
  }
  pick() {
    const w = this.sys.world, op = w.operative;
    if (this.tapped && this.valid(this.tapped, op)) return this.tapped;
    let best = null, bs = Infinity;
    for (const u of w.units) {
      if (!this.valid(u, op)) continue;
      const d = Math.hypot(u.x - op.x, u.y - op.y);
      let s = d;
      const inf = u.def.kind === 'infantry' || u.def.kind === 'beast';
      if (inf && (u.state === 'combat' || u.state === 'suspicious')) s -= 100;
      else if (!inf) s += 100; // skitters last
      if (s < bs) { bs = s; best = u; }
    }
    return best;
  }
  update(dt) {
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.mag = this.P.mag;
      return;
    }
    this.cool -= dt;
    if (!this.canFire() || this.cool > 0) return;
    const t = this.pick();
    if (!t) return;
    this.fire(t);
  }
  fire(t) {
    const sys = this.sys, w = sys.world, op = w.operative, P = this.P;
    this.cool = P.interval;
    this.mag--;
    if (this.mag <= 0) this.reloadT = P.reload;
    op.facing = Math.round(((Math.atan2(t.y - op.y, t.x - op.x) + Math.PI / 2) / (Math.PI / 4)) + 8) % 8;
    op.firingT = 0.15;
    op.exposure = P.exposure; op.exposureT = P.exposureTime;
    w.stats.pistolShots++;
    const mx = op.x, my = op.y - 0.2;
    sys.particles.muzzle(mx, my, 7);
    sys.particles.tracer(mx, my, t.x, t.y, '#FFF1A8');
    sys.game.audio?.play?.('pistol');
    w.noise(op.x, op.y, P.noise, 'pistol', op);
    if (t.type === 'skitter') {
      if (w.rng.chance(P.buggyDriverChance)) sys.disableVehicle?.(t, 'driver');
      else sys.particles.sparks(t.x, t.y - 0.2, 3);
      return;
    }
    // Kill rule: every shot at infantry in range hits; each target needs 1 or 2 (boss 4)
    if (!t.pistolHits) t.pistolHits = t.def.boss ? P.bossHits : (w.rng.chance(P.oneShotChance) ? 1 : 2);
    t.pistolHits--;
    const dir = Math.atan2(t.y - op.y, t.x - op.x);
    if (t.pistolHits <= 0) killUnit(sys, t, { by: 'pistol', dir });
    else {
      sys.particles.blood(t.x, t.y - 0.4, t.blood, 5, dir, 0.7);
      t.staggerT = 0.3; t.flashT = 0.12;
      damageUnit(sys, t, 0, { by: 'pistol', dir });
    }
  }
}
