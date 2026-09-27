// @ts-check

/**
 * Car-like driving along a waypoint path (playtest 2: vehicles no longer stop and turn on the spot).
 * The vehicle always rolls forward along its heading; the heading turns toward the next waypoint at a
 * rate limited by speed (a minimum turning radius), and the vehicle slows for sharp turns, so it arcs
 * round corners. It only pivots on the spot as a fallback: when the arc would leave drivable ground, or
 * when a waypoint sits inside its turning circle and it has already circled once.
 *
 * `v` needs { x, y, angle, path: [{x, y}] (tile waypoints, centres at +0.5) }. Returns true when the
 * path finished this tick.
 * @param {any} v
 * @param {number} dt
 * @param {number} speed  tiles/s on the current tile
 * @param {any} map
 * @param {{radius?: number, minTurn?: number}} [o]  turning radius in tiles; slowest turn rate (rad/s)
 */
export function drive(v, dt, speed, map, o = {}) {
  const R = o.radius ?? 0.9, minTurn = o.minTurn ?? 1.4;
  if (!v.path.length) return false;
  let wp = v.path[0], dx = wp.x + 0.5 - v.x, dy = wp.y + 0.5 - v.y, d = Math.hypot(dx, dy);
  // pass intermediate waypoints early so the vehicle starts its turn before the corner
  while (v.path.length > 1 && d < 0.6) {
    v.path.shift(); v.steerSpin = 0;
    wp = v.path[0]; dx = wp.x + 0.5 - v.x; dy = wp.y + 0.5 - v.y; d = Math.hypot(dx, dy);
  }
  const last = v.path.length === 1;
  if (last && d < 0.12) { v.x = wp.x + 0.5; v.y = wp.y + 0.5; v.path.shift(); v.steerSpin = 0; return true; }
  let da = Math.atan2(dy, dx) - v.angle;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  // slow for the turn (full speed within ~20°, a third for a hairpin) and for the final approach
  let s = speed * Math.max(0.35, Math.min(1, Math.cos(da) + 0.1));
  if (last) s *= Math.min(1, 0.35 + d / 1.5);
  const pivot = (v.steerSpin || 0) > Math.PI * 2;          // circled a waypoint inside the turning circle
  const rate = Math.max(minTurn, s / R) * dt;
  const turn = Math.abs(da) <= rate ? da : Math.sign(da) * rate;
  v.angle += turn;
  v.steerSpin = (v.steerSpin || 0) + Math.abs(turn);
  if (pivot && Math.abs(da) > 0.3) return false;           // fallback: line up first, then drive
  if (pivot) v.steerSpin = 0;
  // roll forward along the (new) heading; never further than the waypoint on the final leg
  const step = Math.min(s * dt, last ? d : Infinity);
  const nx = v.x + Math.cos(v.angle) * step, ny = v.y + Math.sin(v.angle) * step;
  const ax = Math.floor(v.x), ay = Math.floor(v.y), bx = Math.floor(nx), by = Math.floor(ny);
  if ((ax !== bx || ay !== by) && !map.canStep(ax, ay, bx, by, true)) {
    // the arc would leave the road: turn harder on the spot until the waypoint is dead ahead
    v.angle += Math.sign(da) * Math.min(Math.abs(da - turn), minTurn * dt);
    if (Math.abs(da) < 0.15) { v.x += (dx / d) * Math.min(step, d); v.y += (dy / d) * Math.min(step, d); }
    return false;
  }
  v.x = nx; v.y = ny;
  if (v.angle > Math.PI) v.angle -= Math.PI * 2; else if (v.angle < -Math.PI) v.angle += Math.PI * 2;
  return false;
}
