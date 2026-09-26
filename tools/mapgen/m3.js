// @ts-check
/** Mission 3 — "Needle" (SPEC §16, Mission 3). Alpine pass, pine forests, frozen lake, 120×88. */
import { MapGen } from './lib.js';
import { fbm } from '../../src/core/rng.js';
import { STRUCT_DEFS } from '../../src/render/spriteData/structures.js';

const P = (x, y, wait = 0, look = null, extra = {}) => ({ x, y, ...(wait ? { wait } : {}), ...(look ? { look } : {}), ...extra });
const U = (id, type, x, y, group, behaviour, extra = {}) => ({ id, type, x, y, alertGroup: group, behaviour, ...extra });
const sentry = (facings, interval = 5) => ({ kind: 'sentry', facings, interval });
const patrol = (path, mode = 'loop') => ({ kind: 'patrol', path, mode });
const camp = (area) => ({ kind: 'camp', area });
const follow = (leader, dx, dy) => ({ kind: 'follow', leader, dx, dy });

/**
 * Vrask's convoy loops the serpentine road (~4 min). At `stop` points it halts for 30 s and Vrask
 * walks the `inspect` route before remounting. The summit stop is the bunker.
 */
const PATHS = {
  convoy: [
    P(18, 75), P(40, 72), P(47, 70), P(56, 70), P(62, 70), P(66, 64),
    P(60, 57), P(40, 57, 0, null, { stop: 30, inspect: 'inspect1' }),
    P(60, 57), P(67, 50), P(67, 44), P(60, 38), P(48, 37, 0, null, { stop: 30, inspect: 'inspect2' }),
    P(60, 38), P(70, 32), P(72, 24), P(72, 16), P(73, 11), P(64, 11, 0, null, { stop: 30, inspect: 'inspect3', bunker: true }), P(73, 11),
    P(72, 16), P(72, 24), P(70, 32), P(67, 44), P(67, 50), P(66, 64), P(62, 70), P(47, 70), P(40, 72),
  ],
  inspect1: [P(38, 55, 3, 'W'), P(34, 58, 4, 'S'), P(38, 60, 3, 'E')],
  inspect2: [P(46, 35, 3, 'N'), P(42, 38, 4, 'W'), P(46, 40, 3, 'S')],
  inspect3: [P(62, 13, 3, 'E'), P(58, 14, 3, 'S')],
  o1Loop: [P(30, 54, 3, 'W'), P(40, 53, 3, 'N'), P(40, 61, 3, 'E'), P(30, 62, 3, 'S')],
  o2Loop: [P(40, 33, 4, 'N'), P(50, 33, 3, 'E'), P(50, 42, 3, 'S'), P(40, 42, 4, 'W')],
  summitLoop: [P(52, 6, 4, 'N'), P(70, 7, 3, 'E'), P(68, 14, 3, 'S'), P(50, 14, 3, 'W')],
  lakeShore: [P(88, 57, 4, 'N'), P(112, 57, 5, 'E')],
  valleyW: [P(10, 58, 4, 'N'), P(26, 80, 4, 'S')],
  forestN: [P(12, 20, 4, 'W'), P(30, 12, 4, 'N'), P(20, 36, 4, 'S')],
  roadE: [P(72, 26, 4, 'E'), P(66, 64, 4, 'S')],
  skitterValley: [P(18, 76, 5, 'W'), P(60, 70, 5, 'E')],
  skitterEast: [P(66, 62, 4, 'S'), P(72, 18, 4, 'N')],
};

const UNITS = [
  // convoy: Skitter lead, Crawler carrying Vrask + 2 bodyguards, Brute rear
  U('cv_lead', 'skitter', 20, 75, 'convoy', { kind: 'convoy', path: 'convoy', slot: 0 }),
  U('cv_apc', 'crawler', 17, 75, 'convoy', { kind: 'convoy', path: 'convoy', slot: 1 }, { passengers: 0, carries: ['vrask', 'bg1', 'bg2'] }),
  U('cv_tank', 'brute', 14, 75, 'convoy', { kind: 'convoy', path: 'convoy', slot: 2 }),
  U('vrask', 'vrask', 17, 75, 'convoy', { kind: 'mounted', vehicle: 'cv_apc' }, { important: true, name: 'Overseer Vrask' }),
  U('bg1', 'husk', 17, 75, 'convoy', { kind: 'mounted', vehicle: 'cv_apc', escort: 'vrask', dx: -1, dy: 1 }),
  U('bg2', 'launcher', 17, 75, 'convoy', { kind: 'mounted', vehicle: 'cv_apc', escort: 'vrask', dx: 1, dy: 1 }),
  // outpost 1 (valley shelf, level 1)
  U('o1a', 'husk', 30, 54, 'out1', patrol('o1Loop')),
  U('o1b', 'husk', 36, 58, 'out1', sentry(['W', 'S'], 5), { facing: 'W' }),
  U('o1c', 'lobber', 34, 60, 'out1', camp('camp1')),
  U('o1d', 'warden', 38, 56, 'out1', sentry(['E', 'S', 'N'], 6), { facing: 'E' }),
  U('o1e', 'sniffer', 31, 60, 'out1', camp('camp1')),
  U('o1f', 'husk', 26, 66, 'out1', sentry(['S', 'W'], 6), { facing: 'S' }),
  U('o1g', 'launcher', 44, 60, 'out1', sentry(['E', 'S'], 6), { facing: 'E' }),
  // outpost 2 — "Outpost Ridge" (level 2), holds the captured pilot
  U('o2a', 'husk', 40, 33, 'out2', patrol('o2Loop')),
  U('o2b', 'husk', 41, 34, 'out2', follow('o2a', -1.2, 1)),
  U('o2c', 'warden', 44, 36, 'out2', sentry(['S', 'E'], 6), { facing: 'S' }),
  U('o2d', 'lobber', 47, 40, 'out2', camp('camp2')),
  U('o2e', 'husk', 43, 41, 'out2', camp('camp2')),
  U('o2f', 'sniffer', 39, 38, 'out2', camp('camp2')),
  U('o2g', 'launcher', 50, 36, 'out2', sentry(['E', 'N'], 6), { facing: 'E' }),
  U('o2h', 'husk', 36, 30, 'out2', sentry(['W', 'N'], 6), { facing: 'W' }),
  // summit radar & bunker (level 3)
  U('s1', 'husk', 52, 6, 'summit', patrol('summitLoop')),
  U('s2', 'husk', 58, 15, 'summit', sentry(['S', 'W'], 6), { facing: 'S' }),
  U('s3', 'warden', 66, 9, 'summit', sentry(['E', 'S'], 6), { facing: 'E' }),
  U('s4', 'lobber', 60, 13, 'summit', camp('camp3')),
  U('s5', 'husk', 70, 13, 'summit', sentry(['E', 'SE'], 5), { facing: 'E' }),
  U('s6', 'launcher', 64, 15, 'summit', sentry(['S'], 6), { facing: 'S' }),
  U('s7', 'husk', 47, 12, 'summit', sentry(['W', 'S'], 6), { facing: 'W' }),
  // road & valley patrols
  U('r1', 'husk', 72, 26, 'road', patrol('roadE', 'pingpong')),
  U('r2', 'husk', 73, 27, 'road', follow('r1', -1, 1)),
  U('r3', 'husk', 60, 68, 'road', sentry(['W', 'S'], 6), { facing: 'W' }),
  U('r4', 'husk', 45, 68, 'road', sentry(['W', 'N'], 5), { facing: 'W' }),
  U('r5', 'husk', 10, 58, 'road', patrol('valleyW', 'pingpong')),
  U('r6', 'sniffer', 11, 59, 'road', follow('r5', -1.4, 1)),
  U('r7', 'warden', 56, 72, 'road', sentry(['S', 'E'], 6), { facing: 'S' }),
  U('r8', 'lobber', 64, 66, 'road', sentry(['S'], 6), { facing: 'S' }),
  U('r9', 'husk', 12, 20, 'forest', patrol('forestN')),
  U('r10', 'husk', 13, 21, 'forest', follow('r9', 1, 1)),
  U('r11', 'launcher', 80, 40, 'road', sentry(['E', 'S'], 6), { facing: 'E' }),
  // lake shore (the overwatch shelf is quiet, the shore below is not)
  U('l1', 'husk', 88, 57, 'lake', patrol('lakeShore', 'pingpong')),
  U('l2', 'husk', 100, 64, 'lake', sentry(['S', 'W'], 6), { facing: 'S' }),
  U('l3', 'husk', 110, 66, 'lake', sentry(['W', 'S'], 6), { facing: 'W' }),
  U('l4', 'husk', 94, 74, 'lake', sentry(['N', 'W'], 7), { facing: 'N' }),
  U('l5', 'husk', 82, 70, 'lake', sentry(['E', 'N'], 6), { facing: 'E' }),
  U('l6', 'husk', 78, 50, 'lake', sentry(['S', 'E'], 6), { facing: 'S' }),
  // skitter patrols
  U('sk1', 'skitter', 18, 75, 'road', patrol('skitterValley', 'pingpong')),
  U('sk2', 'skitter', 66, 62, 'road', patrol('skitterEast', 'pingpong')),
];

const STRUCTURES = [
  { id: 'bunker', type: 'commandNexus', x: 54, y: 7, alertGroup: 'summit' },
  { id: 'radar', type: 'commsArray', x: 62, y: 4, alertGroup: 'summit' },
  { id: 'tw1', type: 'guardTower', x: 69, y: 11, alertGroup: 'summit', facing: 'SE' },
  { id: 'tw2', type: 'guardTower', x: 37, y: 36, alertGroup: 'out2', facing: 'W' },
  { id: 'tw3', type: 'guardTower', x: 42, y: 62, alertGroup: 'out1', facing: 'S' },
  { id: 'cell', type: 'detentionBlock', x: 42, y: 30, alertGroup: 'out2' },
];

export function build() {
  const g = new MapGen(120, 88, 303, 'n');
  // base: deep snow valley with packed-snow ground ('g' in the alpine biome) patches
  g.each((x, y) => { const n = fbm(x * 0.06, y * 0.06, 3); if (n > 0.55) g.set(x, y, { t: 'g' }); });
  // --- the massif: level 1 → 2 → 3 (summit)
  g.ellipse(50, 50, 30, 18, { e: 1 }, 0.2, 31);
  g.ellipse(54, 30, 24, 14, { e: 1 }, 0.2, 32);
  g.ellipse(56, 30, 19, 11, { e: 2 }, 0.16, 33);
  g.ellipse(58, 12, 18, 9, { e: 2 }, 0.16, 34);
  g.ellipse(59, 10, 14, 7, { e: 3 }, 0.12, 35);
  g.each((x, y, c) => { if (c.e >= 1) g.set(x, y, { t: fbm(x * 0.2, y * 0.2, 7) > 0.6 ? 'p' : 'g' }); });
  // --- pine forests (dense) around the valley sides; lighter pines on slopes
  g.each((x, y, c) => {
    const n = fbm(x * 0.08, y * 0.08, 41);
    if (c.e === 0 && n > 0.55) g.set(x, y, { o: n > 0.62 ? 'P' : 'f' });
    else if (c.e >= 1 && c.e <= 2 && n > 0.66) g.set(x, y, { o: 'f' });
  });
  // --- frozen lake (SE) with a level-1 cliff shelf on its north shore for overwatch
  g.ellipse(100, 74, 17, 11, { t: 'i', o: '.', e: 0 }, 0.2, 51);
  g.ellipse(100, 55, 18, 5, { e: 1, o: '.' }, 0.2, 52);
  g.scatter(86, 51, 30, 8, 0.12, { o: 'q' }, (x, y, c) => c.e === 1);
  // --- mountain stream from the massif foot south to the map edge (deep, icy)
  const river = [[50, 67], [49, 74], [51, 80], [50, 90]];
  g.polyline(river, 6, { t: 'w', o: '.', e: 0 }, 1.2, 61);
  g.polyline(river, 3.5, { t: 'W', o: '.', e: 0 }, 1.2, 61);
  // --- serpentine road
  const wet = (x, y) => g.inb(x, y) && (g.t[y][x] === 'W' || g.t[y][x] === 'w');
  const road = (x, y) => wet(x, y) ? { o: 'h' } : { t: 'r', o: '.' };
  const route = [[4, 76], [18, 75], [40, 72], [47, 70], [56, 70], [62, 70], [66, 64], [67, 58], [67, 50], [67, 44], [70, 32], [72, 24], [72, 16], [73, 11], [66, 11]];
  g.polyline(route, 2.3, road, 0.8, 71);
  g.polyline([[66, 58], [60, 57], [40, 57]], 2, road);      // spur to outpost 1
  g.polyline([[67, 44], [60, 38], [48, 37]], 2, road);      // spur to outpost 2
  // ramps wherever the road changes level (road-width 2 so vehicles can use them)
  g.autoRamps(route, 2);
  g.autoRamps([[66, 58], [60, 57], [40, 57]], 2);
  g.autoRamps([[67, 44], [60, 38], [48, 37]], 2);
  // the summit switchback: a two-lane ramp from the level-2 shelf up onto the bunker plateau (vehicles too)
  g.ramp(72, 15, 'N', 2, 1);
  g.ramp(72, 10, 'W', 2, 2);
  // --- the demolishable bridge on the valley road
  const bridge = [];
  g.each((x, y, c) => { if (c.o === 'h') bridge.push({ x, y }); });
  // --- outposts: pads & sandbags
  g.rect(33, 55, 9, 7, { t: 'c', o: '.' });
  for (let x = 33; x <= 41; x++) if (x !== 37 && x !== 38) g.set(x, 62, { o: 'b' });
  g.rect(40, 34, 11, 8, { t: 'c', o: '.' });
  for (let y = 34; y <= 41; y++) if (y !== 37 && y !== 38) g.set(51, y, { o: 'b' });
  g.rect(50, 5, 20, 12, { t: 'c', o: '.' });
  // overwatch shelf access ramp from the west shore
  g.ramp(82, 56, 'E', 1, 0);
  g.clear(79, 55, 4, 4, 'g');
  // start clearing & LZ on the ice
  g.clear(0, 72, 8, 10, 'g');
  g.clear(96, 78, 7, 6, 'i');
  for (const s of STRUCTURES) { const d = STRUCT_DEFS[s.type]; g.clear(s.x, s.y, d.w, d.h, 'c'); }
  return {
    id: 'm3', name: 'Needle', kind: 'Assassination', biome: 'alpine', size: { w: 120, h: 88 }, time: 'day', weather: 'blizzard',
    ...g.layers(),
    demolishable: bridge,
    structures: STRUCTURES,
    units: UNITS,
    friendlies: [{ id: 'pilot', type: 'pilot', x: 45, y: 33, captive: true, name: 'Lt. Mara Osei' }],
    paths: PATHS,
    areas: {
      lz: { x: 96, y: 78, w: 6, h: 5 },
      camp1: { x: 33, y: 56, w: 8, h: 5 },
      camp2: { x: 41, y: 38, w: 8, h: 3 },
      camp3: { x: 56, y: 12, w: 8, h: 4 },
      summit: { x: 45, y: 3, w: 29, h: 15 },
      out1: { x: 28, y: 52, w: 18, h: 13 },
      out2: { x: 36, y: 29, w: 18, h: 14 },
      overwatch: { x: 84, y: 50, w: 32, h: 9 },
      pilotCell: { x: 41, y: 29, w: 6, h: 6 },
    },
    alertGroups: { convoy: {}, out1: { area: 'out1' }, out2: { area: 'out2' }, summit: { area: 'summit' }, road: {}, forest: {}, lake: {} },
    pickups: [{ type: 'ammo', x: 104, y: 52, amount: 10 }, { type: 'medkit', x: 20, y: 40 }],
    player: { x: 3, y: 77, facing: 'E', loadout: { rifle: 25, c4: 2, medkit: 1, designator: 0, smoke: 0 } },
    objectives: [
      { id: 'o1', type: 'KILL', unit: 'vrask', primary: true, text: 'Kill Overseer Vrask' },
      { id: 'o2', type: 'EXTRACT', area: 'lz', primary: true, hidden: true, text: 'Extract at the frozen-lake LZ' },
      { id: 's1', type: 'RESCUE', units: ['pilot'], primary: false, hidden: true, text: 'Rescue the captured GOD pilot' },
    ],
    triggers: [],
    briefing: { text: 'Overseer Vrask inspects the pass garrisons daily in an armoured Crawler. He never leaves it except at the outposts. One shot, WREN.', preview: { x: 60, y: 44, zoom: 0.25 } },
    par: 1500,
  };
}
