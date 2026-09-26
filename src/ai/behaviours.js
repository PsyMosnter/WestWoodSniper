// @ts-check
import { dirIndex, dir8ToAngle } from '../world/tiles.js';

/**
 * Unaware behaviours (SPEC §9.3): patrol(loop|pingpong), sentry(facings, interval), camp(area),
 * guardPost(building), follow (squad member keeping a formation offset).
 */
export function updateBehaviour(u, dt) {
  const b = u.behaviour;
  switch (b.kind) {
    case 'patrol': return patrol(u, dt, b);
    case 'camp': return camp(u, dt, b);
    case 'follow': return follow(u, dt, b);
    case 'convoy': case 'mounted': case 'remount': return;   // driven by NotConvoy (src/missions/convoy.js)
    case 'guardPost':
    case 'sentry':
    default: return sentry(u, dt, b);
  }
}

function lookAt(u, look) { if (look) u.targetAngle = dir8ToAngle(dirIndex(look)); }

function patrol(u, dt, b) {
  const pts = u.world.data.paths?.[b.path];
  if (!pts || !pts.length) return sentry(u, dt, b);
  // at Caution, patrols add a search waypoint at the last point of interest (SPEC §8.4)
  if (u.extraWaypoint) {
    if (!u.path.length) {
      const ew = u.extraWaypoint;
      if (Math.hypot(ew.x + 0.5 - u.x, ew.y + 0.5 - u.y) < 0.6) { u.extraWaypoint = null; u.waitT = 2; }
      else if (!u.goTo(ew.x, ew.y, 'walk')) u.extraWaypoint = null;
    }
    return;
  }
  if (u.waitT > 0) {
    u.waitT -= dt;
    // idle look-around during waits
    if (u.lookSweep) u.targetAngle = u.lookSweep.base + Math.sin(u.stateT * 1.3) * 0.7;
    return;
  }
  if (u.path.length) return;
  const wp = pts[u.pathIdx];
  if (Math.hypot(wp.x + 0.5 - u.x, wp.y + 0.5 - u.y) < 0.6) {
    // arrived at waypoint
    u.waitT = wp.wait || 0;
    lookAt(u, wp.look);
    u.lookSweep = wp.wait ? { base: u.targetAngle } : null;
    if (b.mode === 'pingpong') {
      if (u.pathIdx + u.pathDir >= pts.length || u.pathIdx + u.pathDir < 0) u.pathDir *= -1;
      u.pathIdx += u.pathDir;
    } else u.pathIdx = (u.pathIdx + 1) % pts.length;
    return;
  }
  if (!u.goTo(wp.x, wp.y, 'walk')) { u.pathIdx = (u.pathIdx + 1) % pts.length; u.waitT = 1; }
}

function sentry(u, dt, b) {
  const h = u.home;
  if (Math.hypot(h.x - u.x, h.y - u.y) > 0.6) {
    if (!u.path.length) u.goTo(Math.floor(h.x), Math.floor(h.y), 'walk');
    return;
  }
  const facings = b.facings && b.facings.length ? b.facings : null;
  if (!facings) { u.targetAngle = h.angle; return; }
  u.sentryT = (u.sentryT || 0) + dt;
  const interval = b.interval || 4;
  const i = Math.floor(u.sentryT / interval) % facings.length;
  u.targetAngle = dir8ToAngle(dirIndex(facings[i]));
}

function camp(u, dt, b) {
  u.visionMult = 0.8; // relaxed
  u.campT = (u.campT ?? u.world.rng.range(1, 5)) - dt;
  if (u.path.length) return;
  if (u.campT > 0) {
    if (u.idleLook === undefined || u.world.rng.chance(dt * 0.3)) u.idleLook = u.world.rng.range(-Math.PI, Math.PI);
    u.targetAngle = u.idleLook;
    return;
  }
  u.campT = u.world.rng.range(3, 8);
  const a = b.area ? u.world.data.areas?.[b.area] : null;
  const m = u.world.map;
  for (let k = 0; k < 6; k++) {
    let x, y;
    if (a) { x = a.x + u.world.rng.int(0, a.w - 1); y = a.y + u.world.rng.int(0, a.h - 1); }
    else { x = Math.floor(u.home.x) + u.world.rng.int(-3, 3); y = Math.floor(u.home.y) + u.world.rng.int(-3, 3); }
    if (m.walkable(x, y) && m.elevAt(x, y) === m.elevAt(Math.floor(u.home.x), Math.floor(u.home.y))) { u.goTo(x, y, 'walk'); break; }
  }
}

function follow(u, dt, b) {
  const L = u.world.units.find((x) => x.id === b.leader);
  if (!L || L.dead || L.state !== 'unaware') { u.behaviour = { kind: 'sentry' }; u.home = { x: u.x, y: u.y, angle: u.angle }; return; }
  // formation offset rotated with the leader's heading
  const ca = Math.cos(L.angle), sa = Math.sin(L.angle);
  const ox = b.dx * ca - b.dy * sa, oy = b.dx * sa + b.dy * ca;
  const tx = Math.floor(L.x + ox), ty = Math.floor(L.y + oy);
  if (Math.hypot(tx + 0.5 - u.x, ty + 0.5 - u.y) > 1.2) {
    if (!u.path.length || (u.followRe = (u.followRe || 0) - dt) <= 0) { u.followRe = 0.6; u.goTo(tx, ty, 'walk'); }
  } else if (!L.moving) { u.path = []; u.targetAngle = L.angle; }
}
