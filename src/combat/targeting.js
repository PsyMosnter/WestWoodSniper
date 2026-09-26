// @ts-check
import { canSee } from '../world/los.js';

/**
 * Sight & distance to a rifle target, shared by the engage planner and the scope.
 * Units are points. A structure target (`kind: 'structure'`, e.g. a Fuel Depot's barrels) is its
 * footprint: it is in sight when any footprint tile is — its own footprint must not hide it (seen
 * side-on, the near column used to block the line to the centre column) — and range is measured to
 * the nearest edge of the footprint, where the parts you actually shoot at are.
 */
const footprintOf = (t) => (t.kind === 'structure' && t.structure) || null;

function anyFootprintTile(s, fn) {
  for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) if (fn(x, y)) return true;
  return false;
}

/** Can a shooter on tile (x, y) see target t? */
export function seesTarget(map, x, y, t) {
  const s = footprintOf(t);
  return s ? anyFootprintTile(s, (fx, fy) => canSee(map, x, y, fx, fy, {})) : canSee(map, x, y, t.tx, t.ty, {});
}

/** Is target t currently visible to the player (not in fog)? */
export function targetVisible(fog, t) {
  const s = footprintOf(t);
  return s ? anyFootprintTile(s, (fx, fy) => fog.isVisible(fx, fy)) : fog.isVisible(t.tx, t.ty);
}

/** Distance in tiles from point (x, y) to target t. */
export function targetDist(x, y, t) {
  const s = footprintOf(t);
  return s ? s.distTo(x, y) : Math.hypot(t.x - x, t.y - y);
}
