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
  if (obs.disabledVision != null) mult *= obs.disabledVision;   // (0 = blind: a buggy whose driver is shot)
  if (obs.blindT > 0) mult = 0;
  return { radius: radius * mult, cone: (prof.cone * Math.PI) / 180, peripheral: prof.peripheral ?? 1, rate: prof.rate ?? 1 };
}

/**
 * Share of an observer's sight radius at which a target with this stance on this tile can be picked out
 * (playtest 2 — the inner cone): run 1 … hunker 0.3, shrunk further by concealment (tall grass, swamp).
 * @param {string} stance  run | walk | crouch | cover | coverUncovered | crawl | hunker
 * @param {number} conceal terrain concealment of the target's tile (1 = none)
 */
export function stanceRange(stance, conceal = 1) {
  const R = D.range;
  return (R[stance] ?? 1) * (1 - (1 - conceal) * R.concealK);
}

/**
 * How far (tiles) observer `obs` can pick out `target` right now — the inner cone. Targets without a
 * `rangeFactor` (friendlies, probes) are seen out to the full radius.
 */
export function detectRange(obs, target, world, vis = visionOf(obs, world)) {
  if (!target.rangeFactor) return vis.radius;
  const m = world.map;
  const tx = Math.floor(target.x), ty = Math.floor(target.y);
  let r = vis.radius * target.rangeFactor(obs, m.conceal[m.idx(tx, ty)]);
  if (m.terrain[m.idx(tx, ty)] === T.tallgrass) r = Math.min(r, D.tallGrassMaxDist);
  if (obs.def?.smell) r = Math.max(r, Math.min(vis.radius, D.sniffer.smellDist));   // smell ignores stance & cover
  if ((obs.kind === 'vehicle' || obs.kind === 'turret') && target.hunkered) r = 0;       // they can't see a hunkered target
  return r;
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
  if (target.rangeFactor && dist > detectRange(obs, target, world, vis)) return { visible: false, dist, vis };
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

/** Is world point (x, y) inside observer `obs`'s view cone (direction only — not range or LOS)? */
export function inViewCone(obs, x, y) {
  const prof = BALANCE.ai.vision[obs.profile];
  if (!prof) return false;
  let a = Math.atan2(y - obs.y, x - obs.x) - obs.angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return Math.abs(a) <= (prof.cone * Math.PI) / 360;
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
  // close and in the cone: up to ×(1 + closeK) at contact
  if (dist < D.closeDist && !vehicleObs && inViewCone(obs, target.x, target.y)) rate *= 1 + D.closeK * (1 - dist / D.closeDist);
  // staring at a glimpse: faster, but never so fast there's no time to slip out of the cone
  if (obs.state === 'suspicious') rate = Math.min(rate * D.suspiciousFill, D.stareFillMax);
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
