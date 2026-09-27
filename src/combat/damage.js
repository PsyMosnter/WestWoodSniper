// @ts-check
import { BALANCE } from '../config/balance.js';
import { bloodDecal } from '../render/decals.js';

/**
 * Damage application (SPEC §6.6, §11). `sys` is the CombatSystem.
 */

/** Damage the Operative: white flash, shake, directional indicator, low-HP pulse; death fails the mission. */
export function damageOperative(sys, dmg, from, kind = 'bullet') {
  const w = sys.world, op = w.operative;
  if (op.dead || sys.godMode) return 0;
  if (kind === 'fire' || kind === 'fallout') {
    // damage over time arrives in per-tick slivers: bank it and apply whole points (rounding each
    // sliver up to 1 would turn 4 dps into 30 dps at the 30 Hz sim rate)
    op.dotBank = (op.dotBank || 0) + dmg;
    if (op.dotBank < 1) return 0;
    dmg = Math.floor(op.dotBank); op.dotBank -= dmg;
  } else dmg = Math.max(1, Math.round(dmg));
  op.hp = Math.max(0, op.hp - dmg);
  op.flashT = BALANCE.operative.hitFlash;
  op.hurtT = BALANCE.scope.swayHurtTime;
  op.lastHit = dmg;
  sys.game.cam?.shake(Math.min(4, 1 + dmg / 12));
  if (from) sys.game.hitIndicator?.(from.x, from.y);
  w.events.emit('opHit', { dmg, from, kind });
  // interrupts
  if (op.busy && op.busy.kind !== 'medkit') { op.busy.onCancel?.(); op.busy = null; }
  else if (op.busy && op.busy.kind === 'medkit') { op.busy = null; }
  if (op.hp <= 0) {
    // a mission script may catch it (Boot Camp: your own C4 sends you back to the last marker)
    if (sys.game.runner?.custom?.saveFromDeath?.(sys.game.runner, { from, kind })) return dmg;
    op.dead = true;
    op.path = [];
    w.events.emit('opDead', { from, kind });
  }
  return dmg;
}

/**
 * Damage a NOT unit.
 * @param {{by:string, zone?:string, dir?:number, silent?:boolean, source?:any}} cause
 */
export function damageUnit(sys, u, dmg, cause) {
  if (u.dead) return;
  u.hp -= dmg;
  u.flashT = 0.12;
  if (u.hp <= 0) { killUnit(sys, u, cause); return; }
  if (u.state !== 'combat' && cause.by !== 'explosion') {
    // wounded units react to where the shot came from
    const op = sys.world.operative;
    sys.enemies?.alertFromHit(u, op);
  }
}

/** Kill a unit: death animation, blood splat decal, witnesses (SPEC §8.3 bodies). */
export function killUnit(sys, u, cause) {
  if (u.dead) return;
  if (u.kind === 'vehicle') { sys.game.vehicles?.destroy(u, cause); sys.enemies?.onKill(u, cause); return; }
  if (u.invulnerable) return;
  u.dead = true; u.deathT = 0; u.hp = 0; u.path = [];
  u.flashT = 0; u.tag = null; u.staggerT = 0;
  u.fallDir = Math.cos(cause.dir ?? 0) >= 0 ? 1 : -1;
  u.state = 'dead';
  u.killedBy = cause.by;
  const w = sys.world;
  u.killedByPlayer = cause.source !== 'enemy' && cause.by !== 'friendly';
  if (u.killedByPlayer) {
    w.stats.kills++;
    if (cause.zone === 'head') w.stats.headshots++;
    if (cause.by === 'rifle') w.stats.rifleKills++;
  }
  if (u.structure) {
    u.structure.st = { ...u.structure.st, gunnerDead: true };
    sys.particles.blood(u.x, u.y - 0.8, { main: '#5BD13A', shade: '#2E7A1C', hi: '#B8F27A' }, 10, cause.dir ?? null);
    w.events.emit('unitKilled', { unit: u, cause });
    sys.enemies?.onKill(u, cause);
    return;
  }
  if (u.def.kind !== 'vehicle' && u.kind !== 'vehicle') {
    sys.particles.blood(u.x, u.y - 0.4, u.blood, cause.zone === 'head' ? 18 : 12, cause.dir ?? null, cause.zone === 'head' ? 1.3 : 1);
    const seed = (u.id.length * 31 + Math.floor(u.x * 7 + u.y * 13)) | 0;
    sys.game.renderer?.terrain.addDecal(bloodDecal(u.x + 0.1, u.y + 0.05, u.blood, cause.by === 'explosion' ? 1.6 : 1.2, seed));
    w.corpses.push({ x: u.x, y: u.y, unit: u, discovered: false, t: w.time, byPlayer: u.killedByPlayer });
  }
  w.events.emit('unitKilled', { unit: u, cause });
  sys.enemies?.onKill(u, cause);
}
