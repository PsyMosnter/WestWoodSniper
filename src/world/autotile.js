// @ts-check
import { O } from './tiles.js';

/**
 * Derive ramp directions and cliff tiles from the elevation layer (SPEC §4.2, §7.2).
 * - A ramp tile ('R') sits on the LOWER level; its direction points to the cardinal
 *   neighbour exactly one level higher.
 * - A tile is a cliff (impassable, draws a rock face) when its south or east neighbour
 *   is lower — unless that neighbour is a ramp leading up into it.
 * @param {import('./map.js').GameMap} m
 */
export function computeAutotile(m) {
  const { w, h } = m;
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    m.rampDir[i] = -1;
    if (m.overlay[i] !== O.ramp) continue;
    const e = m.elev[i];
    for (let d = 0; d < 4; d++) {
      const nx = x + dirs[d][0], ny = y + dirs[d][1];
      if (!m.inb(nx, ny)) continue;
      const j = ny * w + nx;
      if (m.elev[j] === e + 1 && m.overlay[j] !== O.ramp) { m.rampDir[i] = d; break; }
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    m.cliff[i] = 0;
    if (m.overlay[i] === O.ramp) continue;
    const e = m.elev[i];
    if (e === 0) continue;
    const s = y + 1 < h ? (y + 1) * w + x : -1;
    const east = x + 1 < w ? y * w + x + 1 : -1;
    let c = false;
    if (s >= 0 && m.elev[s] < e && !(m.rampDir[s] === 0 && m.elev[s] === e - 1)) c = true;
    if (east >= 0 && m.elev[east] < e && !(m.rampDir[east] === 3 && m.elev[east] === e - 1)) c = true;
    // a tile that a ramp leads into is always walkable (landing)
    const west = x > 0 ? i - 1 : -1, north = y > 0 ? i - w : -1;
    if ((west >= 0 && m.rampDir[west] === 1 && m.elev[west] === e - 1) || (north >= 0 && m.rampDir[north] === 2 && m.elev[north] === e - 1) ||
      (s >= 0 && m.rampDir[s] === 0 && m.elev[s] === e - 1) || (east >= 0 && m.rampDir[east] === 3 && m.elev[east] === e - 1)) c = false;
    m.cliff[i] = c ? 1 : 0;
  }
}
