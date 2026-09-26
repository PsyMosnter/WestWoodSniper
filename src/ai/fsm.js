// @ts-check
import { BALANCE } from '../config/balance.js';
import { updateBehaviour } from './behaviours.js';
import { canSee } from '../world/los.js';

const A = BALANCE.ai;

/**
 * Per-unit finite state machine (SPEC §9.1):
 * UNAWARE → SUSPICIOUS → INVESTIGATING → ALERTED (searching) → COMBAT → RETURNING → UNAWARE
 * plus FLEEING for unarmed harvesters.
 * @param {import('../entities/unit.js').Unit} u
 * @param {number} dt
 * @param {any} sys EnemySystem
 */
export function updateAI(u, dt, sys) {
  u.stateT += dt;
  if (u.blindT > 0) u.blindT -= dt;
  if (u.staggerT > 0) u.staggerT -= dt;
  if (u.firingT > 0) u.firingT -= dt;
  if (u.tag && (u.tag.t -= dt) <= 0) u.tag = null;
  if (u.bodyRadioT > 0) {
    u.bodyRadioT -= dt;
    if (u.bodyRadioT <= 0) sys.bodyReported(u);
  }
  if (u.visionMult !== 1 && u.behaviour.kind !== 'camp') u.visionMult = 1;
  if (u.state !== 'unaware' && u.behaviour.kind === 'camp') u.visionMult = 1;

  switch (u.state) {
    case 'unaware': updateBehaviour(u, dt); break;
    case 'suspicious': suspicious(u, dt, sys); break;
    case 'investigating': investigating(u, dt, sys); break;
    case 'alerted': alerted(u, dt, sys); break;
    case 'combat': sys.combat(u, dt); break;
    case 'returning': returning(u, dt, sys); break;
    case 'fleeing': fleeing(u, dt, sys); break;
    default: u.setState('unaware');
  }
}

/** Become suspicious of a stimulus point (face it, stop patrolling). */
export function makeSuspicious(u, x, y) {
  if (u.dead || u.state === 'combat') return;
  if (u.def.flees) { startFlee(u, x, y); return; }
  u.poi = { x, y };
  u.poiSoft = false;
  if (u.state === 'alerted') { startSearch(u, x, y); return; }
  if (u.state !== 'suspicious') { u.setState('suspicious'); u.path = []; }
  u.face(x, y);
}

export function investigate(u, x, y) {
  if (u.dead || u.state === 'combat') return;
  if (u.def.flees) { startFlee(u, x, y); return; }
  u.poi = { x, y };
  u.arrived = false;
  u.poiSoft = false;
  u.setState('investigating');
  u.goTo(Math.floor(x), Math.floor(y), 'walk');
}

/** Search expanding rings (2,4,6 tiles) around a point for 30 s (SPEC §8.5). */
export function startSearch(u, x, y) {
  if (u.dead || u.state === 'combat') return;
  if (u.def.flees) { startFlee(u, x, y); return; }
  const pts = [];
  const m = u.world.map;
  const rng = u.world.rng;
  pts.push({ x: Math.floor(x), y: Math.floor(y) });
  for (const r of BALANCE.detection.lkpRings) {
    const n = 3;
    const a0 = rng.range(0, Math.PI * 2);
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2;
      const t = m.nearestWalkable(x + Math.cos(a) * r, y + Math.sin(a) * r, 2);
      if (t) pts.push(t);
    }
  }
  u.search = { pts, i: 0, t: 0, waitT: 0, cx: x, cy: y };
  u.setState('alerted');
  u.goTo(pts[0].x, pts[0].y, 'run');
}

function suspicious(u, dt, sys) {
  u.path = [];
  if (u.poi) u.face(u.poi.x, u.poi.y);
  if (u.stateT >= A.suspiciousToInvestigate) {
    const p = u.poi || { x: u.x, y: u.y };
    const soft = u.poiSoft;
    investigate(u, p.x, p.y);
    u.poiSoft = soft;
  }
}

function investigating(u, dt, sys) {
  const p = u.poi;
  if (!p) { u.setState('returning'); return; }
  if (!u.arrived) {
    const d = Math.hypot(p.x - u.x, p.y - u.y);
    // sight-based suspicion: stop ~2 tiles short and look around (they only glimpsed something)
    const veh = u.kind === 'vehicle';
    const stopAt = veh ? BALANCE.units.vehicleStopShort + 0.2 : u.poiSoft ? 2.0 : 1.3;
    if (d < stopAt || (!u.path.length && d < (veh ? stopAt + 1 : 2.5))) { u.arrived = true; u.lookT = 0; u.path = []; u.lookBase = Math.atan2(p.y - u.y, p.x - u.x); }
    else if (!u.path.length) {
      if (!u.goTo(Math.floor(p.x), Math.floor(p.y), 'walk') || !u.path.length) { u.arrived = true; u.lookT = 0; u.lookBase = u.angle; }
    }
    return;
  }
  u.lookT += dt;
  u.targetAngle = u.lookBase + Math.sin(u.lookT * 1.6) * 1.4;
  if (u.examine) u.tag = { text: '?', t: 0.3 };
  if (u.lookT >= A.investigateLook) {
    // found nothing (or examined a body): base goes to Caution
    sys.alerts.raise(u.alertGroup, 'caution', u.examine ? 'body' : 'investigated', u);
    u.examine = null;
    const g = sys.alerts.group(u.alertGroup);
    if (g.level !== 'calm' && u.behaviour.kind === 'patrol') u.extraWaypoint = { x: Math.floor(p.x), y: Math.floor(p.y) };
    u.setState('returning');
  }
}

function alerted(u, dt, sys) {
  const s = u.search;
  if (!s) { u.setState('returning'); return; }
  s.t += dt;
  if (s.t >= BALANCE.detection.lkpSearchTime) { u.search = null; u.setState('returning'); return; }
  if (u.path.length) return;
  if (s.waitT > 0) {
    s.waitT -= dt;
    u.targetAngle = (u.sweepBase ?? u.angle) + Math.sin(s.t * 2.2) * 1.2;
    return;
  }
  s.i++;
  if (s.i >= s.pts.length) s.i = 1 + Math.floor(u.world.rng.next() * (s.pts.length - 1 || 1));
  const p = s.pts[s.i % s.pts.length];
  s.waitT = 1.2;
  u.sweepBase = u.angle;
  u.goTo(p.x, p.y, 'walk');
}

function returning(u, dt, sys) {
  u.moveMode = 'walk';
  const b = u.behaviour;
  let tx = u.home.x, ty = u.home.y;
  if (b.kind === 'patrol') {
    const pts = u.world.data.paths?.[b.path];
    if (pts && pts.length) {
      // resume at the nearest waypoint
      let bi = 0, bd = Infinity;
      pts.forEach((p, i) => { const d = Math.hypot(p.x - u.x, p.y - u.y); if (d < bd) { bd = d; bi = i; } });
      if (u.stateT < 0.05) u.pathIdx = bi;
      tx = pts[u.pathIdx].x + 0.5; ty = pts[u.pathIdx].y + 0.5;
    }
  }
  if (b.kind === 'camp' || b.kind === 'follow') { u.setState('unaware'); return; }
  const d = Math.hypot(tx - u.x, ty - u.y);
  if (d < 0.7) { u.setState('unaware'); u.targetAngle = u.home.angle; return; }
  if (!u.path.length) {
    if (!u.goTo(Math.floor(tx), Math.floor(ty), 'walk') || !u.path.length) u.setState('unaware');
  }
}

export function startFlee(u, fx, fy) {
  if (u.state === 'fleeing') return;
  u.setState('fleeing');
  u.fleeFrom = { x: fx, y: fy };
  const dx = u.x - fx, dy = u.y - fy, d = Math.hypot(dx, dy) || 1;
  const t = u.world.map.nearestWalkable(u.x + (dx / d) * 8, u.y + (dy / d) * 8, 4);
  if (t) u.goTo(t.x, t.y, 'run');
  u.tag = { text: '!', t: 1.5 };
  u.world.alerts?.raise(u.alertGroup, 'caution', 'harvester fled', u);
}
function fleeing(u, dt, sys) {
  if (!u.path.length && u.stateT > 6) u.setState('returning');
  else if (!u.path.length && u.fleeFrom) {
    u.face(u.fleeFrom.x, u.fleeFrom.y);
  }
}

/** Would this unit notice the corpse (in vision cone & LOS)? */
export function seesPoint(u, x, y, radius) {
  const dx = x - u.x, dy = y - u.y;
  const d = Math.hypot(dx, dy);
  if (d > radius) return false;
  let a = Math.atan2(dy, dx) - u.angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  const cone = (BALANCE.ai.vision[u.profile].cone * Math.PI) / 180;
  if (Math.abs(a) > cone / 2 && d > 1.5) return false;
  return canSee(u.world.map, u.tx, u.ty, Math.floor(x), Math.floor(y), {});
}
