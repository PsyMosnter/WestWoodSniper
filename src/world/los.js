// @ts-check
/**
 * Line of sight (SPEC §7.3). Pure functions over a map-like object:
 * { w, h, elev: ArrayLike<number>, blockH: ArrayLike<number>, soft: ArrayLike<number> }
 */

/**
 * Supercover line between tile centres (all tiles the segment touches), excluding endpoints.
 * Calls fn(x, y) for each; stop early if fn returns true.
 */
export function supercover(x0, y0, x1, y1, fn) {
  let dx = x1 - x0, dy = y1 - y0;
  const nx = Math.abs(dx), ny = Math.abs(dy);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  let x = x0, y = y0;
  let ix = 0, iy = 0;
  while (ix < nx || iy < ny) {
    const dec = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (dec === 0) {
      // passes exactly through a corner: touch both side tiles, then diagonal
      if (!(x + sx === x1 && y === y1) && fn(x + sx, y)) return true;
      if (!(x === x1 && y + sy === y1) && fn(x, y + sy)) return true;
      x += sx; y += sy; ix++; iy++;
    } else if (dec < 0) { x += sx; ix++; }
    else { y += sy; iy++; }
    if (x === x1 && y === y1) return false;
    if (fn(x, y)) return true;
  }
  return false;
}

/**
 * Can observer tile O see tile T? (rules 1–3; the cone check is done by perception)
 * @param {any} map
 * @param {{radius?: number, elevO?: number}} [opts]
 */
export function canSee(map, ox, oy, tx, ty, opts = {}) {
  const w = map.w;
  const dx = tx - ox, dy = ty - oy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (opts.radius !== undefined && dist > opts.radius) return false;
  if (dist <= 1.5) return true; // adjacent tiles are always visible (includes the high-ground peek)
  const eO = opts.elevO ?? map.elev[oy * w + ox];
  const eT = map.elev[ty * w + tx];
  if (eT > eO && dist > 1.5) return false;
  const top = Math.max(eO, eT);
  let softCount = 0;
  const blocked = supercover(ox, oy, tx, ty, (x, y) => {
    const i = y * w + x;
    const e = map.elev[i];
    if (e > eO) return true;
    if (e + map.blockH[i] > top) {
      if (map.soft[i]) { softCount++; return softCount >= 2; }
      return true;
    }
    return false;
  });
  return !blocked;
}

/**
 * Mark every tile visible from O within radius. Ray-casts to every perimeter tile.
 * @param {any} map
 * @param {(i:number)=>void} mark  called with tile index for every visible tile (may repeat)
 */
export function visibleTiles(map, ox, oy, radius, mark, elevO) {
  const { w, h } = map;
  const eO = elevO ?? map.elev[oy * w + ox];
  const r = Math.ceil(radius);
  const r2 = radius * radius;
  mark(oy * w + ox);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = ox + dx, y = oy + dy;
    if (x >= 0 && y >= 0 && x < w && y < h) mark(y * w + x);
  }
  const cast = (tx, ty) => {
    let softCount = 0;
    const sdx = tx - ox, sdy = ty - oy;
    // walk the supercover towards the perimeter tile; the endpoint is included by extending
    const visit = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return true;
      const dx = x - ox, dy = y - oy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) return true;
      const i = y * w + x;
      const e = map.elev[i];
      if (e > eO) {
        if (d2 <= 2.25) mark(i); // adjacency peek
        return true;
      }
      // tile itself is visible if nothing before it blocked
      mark(i);
      if (e + map.blockH[i] > eO) {
        if (map.soft[i]) { softCount++; if (softCount >= 2) return true; }
        else return true;
      }
      return false;
    };
    // supercover excludes the endpoint; cast to the doubled point (same slope) so the perimeter tile is included
    return supercover(ox, oy, ox + sdx * 2, oy + sdy * 2, visit);
  };
  for (let i = -r; i <= r; i++) {
    cast(ox + i, oy - r); cast(ox + i, oy + r);
    cast(ox - r, oy + i); cast(ox + r, oy + i);
  }
}
