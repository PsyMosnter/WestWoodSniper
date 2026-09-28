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
  if (!m.rampsWidened) { m.rampsWidened = true; m.origRamp = new Set(); for (let i = 0; i < m.overlay.length; i++) if (m.overlay[i] === O.ramp) m.origRamp.add(i); widenRamps(m); }
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
 * Ramps are one tile wide in the map data; the game wants passes 3–4 tiles wide (a one-tile gap is only for
 * hidden passes and C4 breaches). Each ramp group grows from its ends, one tile a side per pass, up to RAMP_WIDTH:
 * over open ground that meets the same step up; where the edge sits a tile further back, that tile is raised so the
 * step lines up; where the plateau juts out beside it, that edge tile is carved down. Buildings, spawn points,
 * other ramps and their landings are never touched; anything that ends up without its step is undone.
 */
export const RAMP_WIDTH = 4;
export function widenRamps(m) {
  const { w } = m, res = m.reserved || new Set(), changed = new Map();   // tile → original elevation
  const step = (d) => [DIRS[d][0], DIRS[d][1]];
  const at = (x, y) => (m.inb(x, y) ? y * w + x : -1);
  const open = (i) => i >= 0 && !res.has(i) && m.overlay[i] === O.none && !TERRAIN[m.terrain[i]]?.water;
  const spots = m.spots || new Set();
  const setElev = (i, v) => { if (!changed.has(i)) changed.set(i, m.elev[i]); m.elev[i] = v; };
  for (let pass = 0; pass < RAMP_WIDTH; pass++) {
    rampDirs(m);
    const landing = new Set();
    for (let i = 0; i < m.rampDir.length; i++) if (m.rampDir[i] >= 0) { const [sx, sy] = step(m.rampDir[i]); landing.add(at(i % w + sx, ((i / w) | 0) + sy)); }
    const isRamp = (i, d) => i >= 0 && m.rampDir[i] === d;
    for (let i = 0; i < m.rampDir.length; i++) {
      const d = m.rampDir[i];
      if (d < 0) continue;
      const x = i % w, y = (i / w) | 0, e = m.elev[i], [sx, sy] = step(d), [px, py] = d === 0 || d === 2 ? [1, 0] : [0, 1];
      let lo = 0, hi = 0;
      while (isRamp(at(x - px * (lo + 1), y - py * (lo + 1)), d)) lo++;
      while (isRamp(at(x + px * (hi + 1), y + py * (hi + 1)), d)) hi++;
      if (lo + hi + 1 >= RAMP_WIDTH) continue;
      for (const s of [-1, 1]) {
        if ((s < 0 && lo) || (s > 0 && hi)) continue;                                  // grow from the ends only
        const jx = x + px * s, jy = y + py * s, j = at(jx, jy), u = at(jx + sx, jy + sy);
        if (!open(j) || landing.has(j) || m.rampDir[j] >= 0 || u < 0 || landing.has(u) || m.rampDir[u] >= 0) continue;
        if (m.overlay[u] !== O.none && m.overlay[u] !== O.trees) continue;
        let ok = false;
        if (m.elev[j] === e && m.elev[u] === e + 1) ok = true;
        else if (m.elev[j] === e && m.elev[u] === e && !res.has(u) && !spots.has(u)) {
          const uu = at(jx + 2 * sx, jy + 2 * sy);
          if (uu >= 0 && m.elev[uu] === e + 1) { setElev(u, e + 1); ok = true; }          // the step sits back a tile: bring it forward
        } else if (m.elev[j] === e + 1 && m.elev[u] === e + 1 && !spots.has(j)) {
          const b = at(jx - sx, jy - sy);
          if (b >= 0 && m.elev[b] === e && !res.has(b)) { setElev(j, e); ok = true; }    // the plateau juts out: carve it back
        }
        if (ok) { m.overlay[j] = O.ramp; m.rampDir[j] = d; }
      }
    }
  }
  // undo anything left without a step to climb
  rampDirs(m);
  for (let i = 0; i < m.rampDir.length; i++) {
    if (m.overlay[i] === O.ramp && m.rampDir[i] < 0 && !m.origRamp?.has(i)) { if (changed.has(i)) m.elev[i] = changed.get(i); m.overlay[i] = O.none; }
  }
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
