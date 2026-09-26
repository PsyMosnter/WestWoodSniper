// @ts-check
/** Terrain & overlay definitions (SPEC §7.1, §7.3, §19.3). */

/**
 * @typedef {Object} TerrainDef
 * @property {number} id
 * @property {string} ch
 * @property {string} name
 * @property {number} cost      infantry move cost (Infinity = impassable)
 * @property {boolean} veh      vehicles may drive
 * @property {number} vehMult   vehicle speed multiplier
 * @property {number} conceal   concealment factor (1 = none)
 * @property {number} vis       extra visibility multiplier
 * @property {number} noise     walking noise radius (0 = silent)
 * @property {boolean} [tracks]
 * @property {boolean} [lit]
 * @property {boolean} [water]
 * @property {number} prio      draw priority for edge blending
 */

/** @type {TerrainDef[]} */
export const TERRAIN = [
  { id: 0, ch: 'g', name: 'ground', cost: 1.0, veh: true, vehMult: 1, conceal: 1, vis: 1, noise: 0, prio: 5 },
  { id: 1, ch: 'd', name: 'dirt', cost: 1.0, veh: true, vehMult: 1, conceal: 1, vis: 1, noise: 0, prio: 3 },
  { id: 2, ch: 's', name: 'sand', cost: 1.0, veh: true, vehMult: 1, conceal: 1, vis: 1, noise: 0, prio: 2 },
  { id: 3, ch: 'r', name: 'road', cost: 0.8, veh: true, vehMult: 1.3, conceal: 1, vis: 1.1, noise: 0, prio: 8 },
  { id: 4, ch: 't', name: 'tallgrass', cost: 1.1, veh: true, vehMult: 1, conceal: 0.5, vis: 1, noise: 0, prio: 6 },
  { id: 5, ch: 'w', name: 'shallow', cost: 2.0, veh: true, vehMult: 0.5, conceal: 1, vis: 1, noise: 3, water: true, prio: 1 },
  { id: 6, ch: 'W', name: 'deep', cost: Infinity, veh: false, vehMult: 0, conceal: 1, vis: 1, noise: 0, water: true, prio: 0 },
  { id: 7, ch: 'n', name: 'snow', cost: 1.5, veh: true, vehMult: 1, conceal: 1, vis: 1.1, noise: 1, tracks: true, prio: 7 },
  { id: 8, ch: 'm', name: 'swamp', cost: 1.8, veh: false, vehMult: 0, conceal: 0.8, vis: 1, noise: 2, prio: 1 },
  { id: 9, ch: 'c', name: 'concrete', cost: 0.9, veh: true, vehMult: 1, conceal: 1, vis: 1, noise: 0, prio: 9 },
  { id: 10, ch: 'l', name: 'lava', cost: Infinity, veh: false, vehMult: 0, conceal: 1, vis: 1, noise: 0, lit: true, prio: 0 },
  { id: 11, ch: 'i', name: 'ice', cost: 1.0, veh: true, vehMult: 1, conceal: 1, vis: 1.2, noise: 0, prio: 1 },
  { id: 12, ch: 'a', name: 'ash', cost: 1.1, veh: true, vehMult: 1, conceal: 1, vis: 1, noise: 0, prio: 4 },
  { id: 13, ch: 'p', name: 'gravel', cost: 1.0, veh: true, vehMult: 1, conceal: 1, vis: 1, noise: 1, prio: 4 },
];
export const T = Object.fromEntries(TERRAIN.map((t) => [t.name, t.id]));
export const TERRAIN_BY_CH = Object.fromEntries(TERRAIN.map((t) => [t.ch, t]));

/**
 * @typedef {Object} OverlayDef
 * @property {number} id
 * @property {string} ch
 * @property {string} name
 * @property {number} blockH     LOS blocker height
 * @property {boolean} [soft]    soft LOS blocker (light trees)
 * @property {boolean} passable
 * @property {number} [cost]     infantry move cost override (max with terrain)
 * @property {boolean} [veh]     vehicles allowed
 * @property {number} [conceal]
 * @property {boolean} [cover]   low cover object (impassable, gives cover to adjacent tiles)
 * @property {boolean} [coverTile] walkable tile that counts as cover itself
 */

/** @type {OverlayDef[]} */
export const OVERLAY = [
  { id: 0, ch: '.', name: 'none', blockH: 0, passable: true, veh: true },
  { id: 1, ch: 'f', name: 'trees', blockH: 1.0, soft: true, passable: true, cost: 1.3, veh: false, conceal: 0.7 },
  { id: 2, ch: 'F', name: 'forest', blockH: 1.5, passable: true, cost: 1.6, veh: false, conceal: 0.4 },
  { id: 3, ch: 'o', name: 'boulder', blockH: 1.0, passable: false },
  { id: 4, ch: 'R', name: 'ramp', blockH: 0, passable: true, veh: true },
  { id: 5, ch: 'b', name: 'sandbags', blockH: 0, passable: false, cover: true },
  { id: 6, ch: 'x', name: 'barrel', blockH: 0, passable: false, cover: true },   // converted to a prop entity at load
  { id: 7, ch: 'k', name: 'crate', blockH: 0, passable: false, cover: true },
  { id: 8, ch: 'h', name: 'bridge', blockH: 0, passable: true, veh: true },
  { id: 9, ch: 'v', name: 'wall', blockH: 1.0, passable: false },
  { id: 10, ch: 'e', name: 'fence', blockH: 0, passable: false },
  { id: 11, ch: 'q', name: 'rocks', blockH: 0, passable: false, cover: true },
  { id: 12, ch: 'u', name: 'rubble', blockH: 0, passable: true, cost: 1.2, veh: false, coverTile: true },
  { id: 13, ch: 'y', name: 'wreck', blockH: 0, passable: false, cover: true },
  { id: 14, ch: 'j', name: 'bush', blockH: 0, passable: true, cost: 1.1, veh: true, conceal: 0.6 },
  { id: 15, ch: 'z', name: 'crystal', blockH: 0, passable: false, cover: true },
  { id: 16, ch: 'P', name: 'pine', blockH: 1.5, passable: true, cost: 1.6, veh: false, conceal: 0.4 },
];
export const O = Object.fromEntries(OVERLAY.map((o) => [o.name, o.id]));
export const OVERLAY_BY_CH = Object.fromEntries(OVERLAY.map((o) => [o.ch, o]));

export const DIRS4 = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W
export const DIRS8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]; // N NE E SE S SW W NW
export const DIR_NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function dirIndex(name) { const i = DIR_NAMES.indexOf(name); return i < 0 ? 4 : i; }
/** angle (radians, 0 = east, y down) → 8-dir index */
export function angleToDir8(a) {
  // N=0 corresponds to angle -PI/2
  let d = Math.round((a + Math.PI / 2) / (Math.PI / 4));
  return ((d % 8) + 8) % 8;
}
export function dir8ToAngle(d) { return d * Math.PI / 4 - Math.PI / 2; }
