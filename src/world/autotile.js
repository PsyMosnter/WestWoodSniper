// @ts-check
import { O, TERRAIN } from './tiles.js';

/**
 * Derive ramp directions and cliff tiles from the elevation layer (SPEC §4.2, §7.2).
 * - A ramp tile ('R') sits on the LOWER level; its direction points to the cardinal
 *   neighbour exactly one level higher.
 * - A tile is a cliff (impassable, draws a rock face) when its south or east neighbour
 *   is lower — unless that neighbour is a ramp leading up into it.
 * @param {import('./map.js').GameMap} m
 */
export function computeAutotile(m) {
  if (!m.rampsWidened) { m.rampsWidened = true; rampDirs(m); widenRamps(m); }
  rampDirs(m);
  cliffs(m);
}

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
function rampDirs(m) {
  const { w, h } = m, dirs = DIRS;
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
}

/**
 * Ramps are drawn one tile wide in the map data; the chibi-scale world reads (and plays) better with broad ones.
 * Every ramp grows one tile to each side wherever the ground there is open, on the same level, and meets the
 * same step up — so a 1-tile ramp becomes 3 wide.
 */
export function widenRamps(m) {
  const { w } = m, add = [];
  for (let i = 0; i < m.rampDir.length; i++) {
    const d = m.rampDir[i];
    if (d < 0) continue;
    const x = i % w, y = (i / w) | 0, e = m.elev[i];
    for (const s of [-1, 1]) {
      const [px, py] = d === 0 || d === 2 ? [x + s, y] : [x, y + s];
      if (!m.inb(px, py)) continue;
      const j = py * w + px, [ux, uy] = [px + DIRS[d][0], py + DIRS[d][1]];
      if (m.elev[j] !== e || m.overlay[j] !== O.none || TERRAIN[m.terrain[j]]?.water || !m.inb(ux, uy)) continue;
      const u = uy * w + ux;
      if (m.elev[u] !== e + 1 || (m.overlay[u] !== O.none && m.overlay[u] !== O.trees)) continue;
      add.push(j);
    }
  }
  for (const j of add) m.overlay[j] = O.ramp;
}

function cliffs(m) {
  const { w, h } = m;
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
