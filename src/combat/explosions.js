// @ts-check
import { BALANCE } from '../config/balance.js';
import { damageOperative, damageUnit } from './damage.js';
import { craterDecal } from '../render/decals.js';

const E = BALANCE.explosions;

/** Linear falloff from centre value to 25 % at the edge of the radius (SPEC §11.3). */
export function falloff(damage, radius, dist) {
  if (dist > radius) return 0;
  return damage * (1 - (1 - E.edgeFactor) * (dist / radius));
}

/**
 * Explosion at (x, y) tiles. Damages infantry ×1.0, vehicles ×0.7, buildings ×0.5, the Operative,
 * chains barrels/fuel after 0.2 s, makes noise, shakes the camera by distance.
 * @param {{noise?:number, kind?:string, source?:any, buildingMult?:number, vehicleMult?:number, fire?:number}} [o]
 */
export function explode(sys, x, y, radius, damage, o = {}) {
  const w = sys.world;
  const P = sys.particles;
  // visuals
  sys.effects.push({ kind: 'explosion', x, y, r: radius, t: 0, life: 0.7 + radius * 0.12 });
  if (radius >= 1.5) sys.effects.push({ kind: 'column', x, y, r: radius, t: 0, life: 3 + radius * 1.5 });
  P.debris(x, y, Math.round(8 + radius * 6));
  P.smoke(x, y, Math.round(4 + radius * 3), 1 + radius * 0.25);
  P.fire(x, y, Math.round(4 + radius * 3));
  sys.game.renderer?.terrain.addDecal(craterDecal(x, y, Math.max(0.6, radius * 0.45), Math.floor(x * 17 + y * 31)));
  const cam = sys.game.cam;
  if (cam) {
    const op = w.operative;
    const d = Math.hypot(op.x - x, op.y - y);
    cam.shake(Math.max(0.5, Math.min(6, radius * 3 - d * 0.25)));
  }
  sys.game.audio?.play?.('explosion', { x, y, big: radius > 2 });
  w.noise(x, y, o.noise ?? BALANCE.noise.explosion, 'explosion', o.source || null);
  // damage units
  for (const u of w.units) {
    if (u.dead || u.kind === 'emplacement' || u.kind === 'turret') continue;
    const d = Math.hypot(u.x - x, u.y - y);
    if (d > radius) continue;
    const veh = u.kind === 'vehicle';
    const mult = veh ? (o.vehicleMult ?? E.mult.vehicle) : E.mult.infantry;
    damageUnit(sys, u, falloff(veh && o.vehicleDamage ? o.vehicleDamage : damage, radius, d) * mult, { by: 'explosion', dir: Math.atan2(u.y - y, u.x - x), source: o.source });
  }
  // friendlies
  for (const f of w.friendlies) {
    if (f.dead) continue;
    const d = Math.hypot(f.x - x, f.y - y);
    if (d <= radius) sys.damageFriendly?.(f, falloff(f.kind === 'vehicle' && o.vehicleDamage ? o.vehicleDamage : damage, radius, d) * (f.kind === 'vehicle' ? E.mult.vehicle : 1), { x, y });
  }
  // operative
  const op = w.operative;
  const dop = Math.hypot(op.x - x, op.y - y);
  if (dop <= radius) damageOperative(sys, falloff(damage, radius, dop) * (o.source === 'enemy' ? (w.enemyDamage ?? 1) : 1), { x, y }, 'explosion');
  // structures & props (chain reactions) — handled by structure system if present
  sys.onExplosion?.(x, y, radius, damage, o);
}
