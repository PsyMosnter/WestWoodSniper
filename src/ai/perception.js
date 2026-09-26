// @ts-check
import { BALANCE } from '../config/balance.js';
import { canSee } from '../world/los.js';
import { T } from '../world/tiles.js';

const D = BALANCE.detection;

/**
 * Effective vision profile for an observer right now (SPEC §9.2 + modifiers).
 * @param {any} obs  unit-like: { def, profile, x, y, state, angle, visionMult, blindT, kind }
 * @param {any} world
 */
export function visionOf(obs, world) {
  const prof = BALANCE.ai.vision[obs.profile];
  const m = world.map;
  let radius = prof.radius + m.elevAt(Math.floor(obs.x), Math.floor(obs.y)) + (obs.elevBonus || 0);
  let mult = obs.visionMult ?? 1;
  const g = world.alerts?.group(obs.alertGroup);
  if (g) {
    if (g.level !== 'calm') mult *= 1 + BALANCE.ai.cautionVision;
    mult *= 1 + g.twitch;
  }
  if (obs.state === 'alerted' || obs.state === 'combat') mult *= 1 + BALANCE.ai.alertedVision;
  if (world.timeOfDay === 'night' && obs.profile !== 'searchlight') mult *= BALANCE.ai.nightVision;
  else if (world.timeOfDay === 'dusk') mult *= BALANCE.ai.duskVision;
  if (world.blizzard) mult *= BALANCE.ai.blizzardVision;
  if (obs.disabledVision) mult *= obs.disabledVision;
  if (obs.blindT > 0) mult = 0;
  return { radius: radius * mult, cone: (prof.cone * Math.PI) / 180, peripheral: prof.peripheral ?? 1, rate: prof.rate ?? 1 };
}

/**
 * Can observer see target this instant (range, cone/peripheral, LOS, tall-grass rule)?
 * @returns {{visible:boolean, dist:number, vis:any}}
 */
export function canObserve(obs, target, world) {
  const vis = visionOf(obs, world);
  const dx = target.x - obs.x, dy = target.y - obs.y;
  const dist = Math.hypot(dx, dy);
  if (dist > vis.radius || vis.radius <= 0) return { visible: false, dist, vis };
  const m = world.map;
  const tx = Math.floor(target.x), ty = Math.floor(target.y);
  let a = Math.atan2(dy, dx) - obs.angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  const inCone = Math.abs(a) <= vis.cone / 2;
  if (!inCone) {
    if (dist > vis.peripheral) return { visible: false, dist, vis };
    // peripheral glance can't pick out a hunkered target in concealment (sniffers still smell it)
    if (target.hunkered && m.conceal[m.idx(tx, ty)] < 1 && !obs.def?.smell) return { visible: false, dist, vis };
  }
  // tall grass: invisible beyond 3 tiles, whatever else applies
  if (m.terrain[m.idx(tx, ty)] === T.tallgrass && dist > D.tallGrassMaxDist && !(obs.def?.smell && dist <= D.sniffer.smellDist)) return { visible: false, dist, vis };
  if (world.smokeAt && world.smokeAt(tx, ty) && dist > 1.5) return { visible: false, dist, vis };
  const ox = Math.floor(obs.x), oy = Math.floor(obs.y);
  const ok = canSee(m, ox, oy, tx, ty, obs.elevBonus ? { elevO: m.elev[oy * m.w + ox] + obs.elevBonus } : {});
  return { visible: ok, dist, vis };
}

/**
 * Detection fill per second (SPEC §8.1).
 * @param {any} obs
 * @param {any} target  the Operative or a friendly: needs visibilityFactor(obs) or stanceFactor, and hunkered flag
 * @param {number} dist
 * @param {any} vis  from visionOf
 * @param {any} world
 */
export function fillRate(obs, target, dist, vis, world) {
  const m = world.map;
  const tx = Math.floor(target.x), ty = Math.floor(target.y);
  const vehicleObs = obs.kind === 'vehicle' || obs.kind === 'turret';
  const hunkered = !!target.hunkered;
  let stance = target.visibilityFactor ? target.visibilityFactor(obs) : (target.stanceFactor ?? 1);
  if (vehicleObs && hunkered) return 0;                  // vehicles & turrets can't see a hunkered target
  let terrain = m.conceal[m.idx(tx, ty)];
  // waist-deep in shallow water and not moving: harder to pick out (wading itself splashes — §8.2 noise)
  if (m.terrain[m.idx(tx, ty)] === T.shallow && !target.moving) terrain = Math.min(terrain, D.waterStill);
  if (obs.def?.smell && dist <= D.sniffer.smellDist) {
    terrain = 1;                                          // smell ignores concealment…
    if (hunkered) stance = Math.max(stance, BALANCE.stances.crouch.vis); // …and hunker
  }
  let light = world.timeOfDay === 'night' ? D.light.night : world.timeOfDay === 'dusk' ? D.light.dusk : D.light.day;
  if (world.isLit && world.isLit(tx, ty)) light = D.light.lit;
  const prox = 1 - D.proximityFalloff * Math.min(1, dist / Math.max(0.01, vis.radius));
  const diff = world.difficulty?.detection ?? 1;
  let rate = vis.rate * stance * terrain * light * prox * diff;
  if (obs.state === 'suspicious') rate *= D.suspiciousFill;
  return rate;
}

/** Instant detection within 1.2 tiles of an infantry observer, unless hunkered in concealment. */
export function instantDetect(obs, target, dist, world) {
  if (obs.kind === 'vehicle' || obs.kind === 'turret') return false;
  if (dist > D.instantDist) return false;
  const m = world.map;
  const conceal = m.conceal[m.idx(Math.floor(target.x), Math.floor(target.y))];
  if (target.hunkered && conceal < 1 && !obs.def?.smell) return false;
  return true;
}
