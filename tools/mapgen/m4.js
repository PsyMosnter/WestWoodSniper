// @ts-check
/** Mission 4 — "Lifeline" (SPEC §16, Mission 4). Desert canyon escort, 128×72 (long west→east). */
import { MapGen } from './lib.js';
import { fbm } from '../../src/core/rng.js';
import { STRUCT_DEFS } from '../../src/render/spriteData/structures.js';

const P = (x, y, wait = 0, look = null, extra = {}) => ({ x, y, ...(wait ? { wait } : {}), ...(look ? { look } : {}), ...extra });
const U = (id, type, x, y, group, behaviour, extra = {}) => ({ id, type, x, y, alertGroup: group, behaviour, ...extra });
const sentry = (facings, interval = 5) => ({ kind: 'sentry', facings, interval });
const patrol = (path, mode = 'loop') => ({ kind: 'patrol', path, mode });
const camp = (area) => ({ kind: 'camp', area });
const follow = (leader, dx, dy) => ({ kind: 'follow', leader, dx, dy });

// canyon floor y≈24..48, road along y≈33–36; rims (level 2) above/below with a level-1 ledge
const ROAD = [[0, 34.5], [16, 34.5], [30, 32.5], [44, 33.5], [56, 33.5], [64, 35.5], [84, 35.5], [96, 33.5], [110, 33.5], [127, 33.5]];
// the blown bridge (gap over the gully at x 66–78): the convoy detours through the dry riverbed
const DETOUR = [[58, 34], [60, 40], [66, 43], [72, 44], [80, 42], [86, 36]];

const PATHS = {
  convoy: [
    P(11, 34), P(20, 34),
    P(29, 33, 0, null, { checkpoint: 1 }), P(40, 33, 0, null, { checkpoint: 2 }),
    P(56, 33), P(60, 40), P(66, 43), P(72, 44), P(80, 42), P(86, 36, 0, null, { checkpoint: 3 }),
    P(96, 33), P(108, 33, 0, null, { checkpoint: 4 }), P(125, 33, 0, null, { fort: true }),
  ],
  northRim1: [P(10, 12, 4, 'S'), P(30, 12, 4, 'S')],
  northRim2: [P(52, 10, 4, 'S'), P(80, 12, 5, 'S')],
  southRim1: [P(20, 58, 4, 'N'), P(46, 58, 4, 'N')],
  southRim2: [P(90, 58, 4, 'N'), P(118, 58, 5, 'N')],
  floorW: [P(24, 40, 4, 'E'), P(38, 44, 4, 'S')],
  sideCanyon: [P(56, 60, 4, 'S'), P(56, 68, 4, 'N')],
  skitter1: [P(50, 34, 4, 'W'), P(96, 34, 5, 'E')],
  skitter2: [P(100, 30, 4, 'E'), P(120, 42, 4, 'S')],
};

const UNITS = [
  // checkpoint 1: Launcher ambush on the north rim (3 Launchers + Warden) — they target the trucks
  U('a1', 'launcher', 27, 26, 'ambush', sentry(['S'], 8), { facing: 'S', targetsTrucks: true }),
  U('a2', 'launcher', 32, 26, 'ambush', sentry(['S', 'SE'], 7), { facing: 'S', targetsTrucks: true }),
  U('a3', 'launcher', 36, 26, 'ambush', sentry(['S', 'SW'], 6), { facing: 'S', targetsTrucks: true }),
  U('a4', 'warden', 32, 23, 'ambush', sentry(['S', 'W', 'E'], 6), { facing: 'S' }),
  U('a5', 'husk', 24, 25, 'ambush', sentry(['S', 'E'], 5), { facing: 'S' }),
  // checkpoint 2: the roadblock — Brute (facing west), sandbags, Fuel Hauler parked beside it
  U('rb_brute', 'brute', 46, 34, 'roadblock', sentry(['W']), { facing: 'W', important: true, name: 'Roadblock Brute' }),
  U('rb_fuel', 'fuelHauler', 47, 37, 'roadblock', sentry(['W']), { facing: 'W' }),
  U('rb1', 'husk', 44, 31, 'roadblock', sentry(['W', 'NW'], 5), { facing: 'W' }),
  U('rb2', 'husk', 44, 38, 'roadblock', sentry(['W', 'SW'], 6), { facing: 'W' }),
  U('rb3', 'lobber', 49, 31, 'roadblock', camp('rbCamp')),
  U('rb4', 'husk', 50, 39, 'roadblock', camp('rbCamp')),
  U('rb5', 'launcher', 48, 28, 'roadblock', sentry(['W', 'S'], 6), { facing: 'W', targetsTrucks: true }),
  // checkpoint 3: Lobber nest on the south rim over the riverbed detour
  U('ln1', 'lobber', 70, 51, 'lobbers', sentry(['N'], 6), { facing: 'N', targetsTrucks: true }),
  U('ln2', 'lobber', 74, 51, 'lobbers', sentry(['N', 'NW'], 7), { facing: 'N', targetsTrucks: true }),
  U('ln3', 'lobber', 78, 51, 'lobbers', sentry(['N', 'NE'], 5), { facing: 'N', targetsTrucks: true }),
  U('ln4', 'husk', 72, 53, 'lobbers', camp('lobberCamp')),
  U('ln5', 'warden', 76, 53, 'lobbers', sentry(['N', 'E'], 6), { facing: 'N' }),
  U('ln6', 'launcher', 82, 51, 'lobbers', sentry(['N', 'W'], 6), { facing: 'N', targetsTrucks: true }),
  // rim patrols and floor pickets
  U('n1', 'husk', 10, 12, 'north', patrol('northRim1', 'pingpong')),
  U('n2', 'husk', 11, 13, 'north', follow('n1', -1, 1)),
  U('n3', 'husk', 52, 10, 'north', patrol('northRim2', 'pingpong')),
  U('n4', 'launcher', 60, 22, 'north', sentry(['S', 'E'], 6), { facing: 'S', targetsTrucks: true }),
  U('n5', 'husk', 90, 20, 'north', sentry(['S', 'W'], 6), { facing: 'S' }),
  U('n6', 'launcher', 100, 24, 'north', sentry(['S'], 6), { facing: 'S', targetsTrucks: true }),
  U('s1', 'husk', 20, 58, 'south', patrol('southRim1', 'pingpong')),
  U('s2', 'husk', 90, 58, 'south', patrol('southRim2', 'pingpong')),
  U('s3', 'husk', 36, 48, 'south', sentry(['N', 'E'], 6), { facing: 'N' }),
  U('s4', 'lobber', 104, 50, 'south', sentry(['N'], 6), { facing: 'N', targetsTrucks: true }),
  U('s5', 'husk', 118, 54, 'south', sentry(['N', 'W'], 6), { facing: 'N' }),
  U('f1', 'husk', 24, 40, 'floor', patrol('floorW', 'pingpong')),
  U('f2', 'husk', 62, 30, 'floor', sentry(['W', 'E'], 6), { facing: 'W' }),
  U('f3', 'husk', 92, 40, 'floor', sentry(['W', 'S'], 6), { facing: 'W' }),
  U('f4', 'warden', 112, 28, 'floor', sentry(['W', 'S'], 6), { facing: 'W' }),
  U('f5', 'husk', 114, 38, 'floor', sentry(['W'], 6), { facing: 'W' }),
  U('f6', 'launcher', 104, 44, 'floor', sentry(['W', 'N'], 6), { facing: 'W', targetsTrucks: true }),
  // side canyon (downed pilot)
  U('sc1', 'husk', 56, 60, 'side', patrol('sideCanyon', 'pingpong')),
  U('sc2', 'husk', 60, 66, 'side', sentry(['W', 'N'], 6), { facing: 'W' }),
  U('sc3', 'husk', 52, 66, 'side', sentry(['E', 'N'], 7), { facing: 'E' }),
  // Skitters
  U('sk1', 'skitter', 50, 34, 'floor', patrol('skitter1', 'pingpong')),
  U('sk2', 'skitter', 100, 30, 'floor', patrol('skitter2', 'pingpong')),
];

const STRUCTURES = [
  { id: 'fort_tw1', type: 'guardTower', x: 6, y: 16, alertGroup: 'north', facing: 'S' },
];

export function build() {
  const g = new MapGen(128, 72, 404, 's');
  // canyon floor: sand & gravel & dry scrub; rims level 2 with a level-1 ledge
  g.each((x, y) => {
    const n = fbm(x * 0.08, y * 0.08, 7);
    if (n > 0.64) g.set(x, y, { t: 't' });
    else if (n < 0.3) g.set(x, y, { t: 'p' });
    const top = 22 + Math.round((fbm(x * 0.07, 3, 17) - 0.5) * 6) + (x < 30 ? 1 : 0);
    const bot = 49 + Math.round((fbm(x * 0.07, 9, 18) - 0.5) * 6);
    if (y <= top) g.set(x, y, { e: y <= top - 2 ? 2 : 1, t: 'g' });
    if (y >= bot) g.set(x, y, { e: y >= bot + 2 ? 2 : 1, t: 'g' });
  });
  // side canyon cutting south at x≈52–62 (downed pilot) — floor level 0
  g.rect(52, 50, 11, 22, { e: 0, t: 's', o: '.' });
  // the gully under the blown bridge (impassable ravine) — the road is cut
  g.polyline([[70, 20], [71, 30], [72, 38]], 3.2, { t: 'W', o: '.', e: 0 }, 0.6, 21);
  // dry riverbed detour (shallow sand-water, slow) south around the gully
  g.polyline([[60, 40], [66, 43], [72, 44], [80, 42], [86, 38]], 3.2, { t: 'w', o: '.' }, 0.4, 22);
  // broken bridge stubs (wrecks) either side of the gully
  g.set(68, 35, { o: 'y' }); g.set(75, 35, { o: 'y' });
  // road
  const road = (x, y) => (g.t[y]?.[x] === 'W' ? null : { t: 'r', o: '.' });
  g.polyline(ROAD, 2.3, road, 0.5, 31);
  g.polyline(DETOUR, 2, (x, y) => (g.t[y]?.[x] === 'W' ? null : { t: 'd', o: '.' }));
  // rim ramps every ~25 tiles (north and south), two steps (0→1→2)
  for (const x of [14, 32, 58, 84, 108]) {
    for (const [y0, dir] of [[null, 'N'], [null, 'S']]) {
      // find ledge edge at this column
      if (dir === 'N') {
        let y = 30; while (y > 0 && g.e[y][x] === 0) y--;         // first non-zero going up
        g.ramp(x, y + 1, 'N', 2, 0); g.ramp(x, y - 1, 'N', 2, 1);
      } else {
        let y = 40; while (y < 71 && g.e[y][x] === 0) y++;
        g.ramp(x, y - 1, 'S', 2, 0); g.ramp(x, y + 1, 'S', 2, 1);
      }
    }
  }
  // rim cover: rocks, scrub, dead trees
  g.scatter(0, 0, 128, 20, 0.05, { o: 'q' }, (x, y, c) => c.e === 2 && c.o === '.');
  g.scatter(0, 52, 128, 20, 0.05, { o: 'q' }, (x, y, c) => c.e === 2 && c.o === '.');
  g.scatter(0, 0, 128, 72, 0.012, { o: 'f' }, (x, y, c) => c.o === '.' && c.t !== 'r');
  g.scatter(0, 24, 128, 26, 0.02, { o: 'o' }, (x, y, c) => c.e === 0 && c.t !== 'r' && c.t !== 'w' && c.t !== 'd' && Math.abs(y - 34) > 3);
  // roadblock: sandbags across the road beside the Brute
  for (const [x, y] of [[43, 30], [43, 31], [43, 37], [43, 38], [44, 39]]) g.set(x, y, { o: 'b' });
  g.rect(45, 30, 8, 11, { t: 'c' });
  // ambush ledge above checkpoint 1 is rocky cover
  for (const x of [26, 30, 34, 38]) g.set(x, 27, { o: 'q' });
  // Fort Dawn (east edge): GOD walls with a gate on the road
  g.rect(118, 22, 10, 26, { t: 'c', o: '.', e: 0 });
  for (let y = 22; y <= 47; y++) if (y < 32 || y > 36) g.set(118, y, { o: 'v' });
  for (let x = 118; x <= 127; x++) { g.set(x, 22, { o: 'v' }); g.set(x, 47, { o: 'v' }); }
  g.clear(0, 30, 15, 8, 's');
  for (const s of STRUCTURES) { const d = STRUCT_DEFS[s.type]; g.clear(s.x, s.y, d.w, d.h); }
  return {
    id: 'm4', name: 'Lifeline', kind: 'Escort', biome: 'desert', size: { w: 128, h: 72 }, time: 'dusk', weather: null,
    tint: 'rgba(255,140,70,0.08)', dusk: true,
    ...g.layers(),
    structures: STRUCTURES,
    units: UNITS,
    friendlies: [
      { id: 'truck1', type: 'medTruck', x: 11, y: 34, convoy: true, slot: 0 },
      { id: 'truck2', type: 'medTruck', x: 7, y: 34, convoy: true, slot: 1 },
      { id: 'truck3', type: 'medTruck', x: 3, y: 34, convoy: true, slot: 2 },
      { id: 'pilot', type: 'pilot', x: 57, y: 69, captive: false, downed: true, name: 'Lt. Idris Vale' },
    ],
    paths: PATHS,
    areas: {
      fort: { x: 119, y: 23, w: 8, h: 24 },
      gate: { x: 108, y: 28, w: 12, h: 12 },
      rbCamp: { x: 46, y: 31, w: 6, h: 8 },
      lobberCamp: { x: 70, y: 52, w: 10, h: 3 },
      sidePilot: { x: 53, y: 62, w: 9, h: 9 },
      cp1: { x: 22, y: 28, w: 14, h: 12 },
      cp2: { x: 36, y: 28, w: 14, h: 12 },
      cp3: { x: 58, y: 36, w: 30, h: 12 },
      cp4: { x: 100, y: 26, w: 18, h: 16 },
    },
    alertGroups: { ambush: {}, roadblock: {}, lobbers: {}, north: {}, south: {}, floor: {}, side: {} },
    pickups: [{ type: 'ammo', x: 40, y: 12, amount: 10 }, { type: 'medkit', x: 60, y: 70 }, { type: 'ammo', x: 96, y: 60, amount: 10 }],
    player: { x: 13, y: 31, facing: 'E', loadout: { rifle: 30, c4: 2, medkit: 1, designator: 0, smoke: 0 } },
    objectives: [
      { id: 'o1', type: 'ESCORT', units: ['truck1', 'truck2', 'truck3'], area: 'fort', minCount: 2, primary: true, text: 'Escort at least 2 of 3 medical trucks to Fort Dawn' },
      { id: 'o2', type: 'SURVIVE', seconds: 60, primary: true, hidden: true, text: 'Hold the fort gate for 60 seconds' },
      { id: 's1', type: 'RESCUE', units: ['pilot'], primary: false, text: 'Rescue the downed pilot in the side canyon' },
      { id: 's2', type: 'CUSTOM', fn: 'bruteClean', primary: false, text: 'Destroy the roadblock Brute before the convoy takes damage' },
    ],
    triggers: [],
    briefing: { text: 'Three medical trucks. One canyon. The NOT own the rims. You walk the high ground and keep them alive.', preview: { x: 64, y: 36, zoom: 0.25 } },
    par: 1100,
  };
}
