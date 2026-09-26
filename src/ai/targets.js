// @ts-check
import { BALANCE } from '../config/balance.js';
import { canObserve, fillRate, instantDetect } from './perception.js';

const D = BALANCE.detection;

/**
 * GOD friendlies as NOT targets (SPEC §15.1): the NOT detect and attack pilots, scientists and
 * medical trucks with the same rules as WREN. Each enemy keeps one extra meter (`fdet`) for the
 * friendly it currently sees best; WREN always takes priority when he is visible.
 */
export function perceiveFriendlies(sys, u, dt) {
  const w = sys.world;
  u.seesTarget = false;
  if (!w.friendlies?.length || u.def.flees) return;
  let best = null, bd = Infinity, bestR = null;
  for (const f of w.friendlies) {
    if (f.dead || f.hidden || f.captive) continue;
    // Launchers wait for trucks to come close (M4: "they only fire at trucks within 7 tiles")
    const dx = f.x - u.x, dy = f.y - u.y, d = Math.hypot(dx, dy);
    if (u.targetsTrucks && f.kind === 'vehicle' && d > BALANCE.friendly.truckAmbushRange) continue;
    const r = canObserve(u, f, w);
    if (!r.visible) continue;
    if (d < bd) { bd = d; best = f; bestR = r; }
  }
  if (!best) {
    if (u.state !== 'combat') u.fdet = Math.max(0, (u.fdet || 0) - D.decay * dt);
    return;
  }
  u.seesTarget = u.target === best;
  if (best.kind === 'vehicle' || instantDetect(u, best, bd, w)) u.fdet = 1;
  else u.fdet = Math.min(1, (u.fdet || 0) + fillRate(u, best, bd, bestR.vis, w) * dt * 1.5);
  if (u.fdet >= 1 && !u.seesOp) {
    if (u.state !== 'combat' || !u.target || u.target.dead || u.target === w.operative && !u.seesOp) {
      u.target = best; u.seesTarget = true;
      u.lastKnown = { x: best.x, y: best.y };
      if (u.state !== 'combat') sys.enterCombat(u, best);
    }
  }
}

/** Whom a fighting enemy engages this tick, and can it see them? */
export function combatTarget(u, w) {
  const op = w.operative;
  if (u.seesOp || !u.target || u.target === op || u.target.dead || u.target.hidden || u.target.captive) return { tgt: op, vis: u.seesOp && !op.dead };
  return { tgt: u.target, vis: !!u.seesTarget };
}
