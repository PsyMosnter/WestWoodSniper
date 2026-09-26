// @ts-check
/** Mission 2 — "Blackout" (SPEC §16, Mission 2). Arid scrubland, red-rock mesas, 112×80. */
import { MapGen } from './lib.js';
import { fbm } from '../../src/core/rng.js';
import { STRUCT_DEFS } from '../../src/render/spriteData/structures.js';

const P = (x, y, wait = 0, look = null) => (look ? { x, y, wait, look } : wait ? { x, y, wait } : { x, y });
const U = (id, type, x, y, group, behaviour, extra = {}) => ({ id, type, x, y, alertGroup: group, behaviour, ...extra });
const sentry = (facings, interval = 5) => ({ kind: 'sentry', facings, interval });
const patrol = (path, mode = 'loop') => ({ kind: 'patrol', path, mode });
const camp = (area) => ({ kind: 'camp', area });
const follow = (leader, dx, dy) => ({ kind: 'follow', leader, dx, dy });

const PATHS = {
  // the north goat path: a Warden and two Sniffers on a ~60 s pingpong (SPEC: 60 s loop)
  northLoop: [P(50, 6, 4, 'W'), P(80, 6, 3, 'E')],
  plantLoop: [P(58, 20, 3, 'N'), P(64, 20, 2, 'E'), P(64, 27, 3, 'S'), P(58, 27, 2, 'W')],
  eastLoop: [P(80, 14, 3, 'N'), P(97, 15, 3, 'E'), P(97, 33, 4, 'SE'), P(81, 34, 3, 'S')],
  wallWalk: [P(59, 37, 3, 'S'), P(92, 37, 4, 'S')],
  gateRoad: [P(75, 50, 3, 'S'), P(62, 58, 4, 'SW')],
  canyon: [P(43, 15, 5, 'N'), P(44, 41, 5, 'S')],
  plainsA: [P(30, 54, 4, 'W'), P(52, 60, 3, 'E'), P(38, 68, 4, 'S')],
  plainsB: [P(84, 55, 3, 'N'), P(100, 62, 4, 'E'), P(88, 68, 3, 'S')],
  skitterRoad: [P(34, 74, 5, 'SW'), P(75, 51, 5, 'N')],
  skitterEast: [P(80, 57, 4, 'W'), P(104, 64, 6, 'E')],
  ridgeFoot: [P(18, 16, 4, 'N'), P(16, 40, 4, 'S')],
};

const UNITS = [
  // --- base on Anvil Mesa (one alert group; its footprint is the mesa top)
  U('b1', 'husk', 58, 20, 'base', patrol('plantLoop')),
  U('b2', 'husk', 59, 21, 'base', follow('b1', -1.2, 1)),
  U('b3', 'scorcher', 63, 25, 'base', sentry(['S', 'W', 'N'], 6), { facing: 'W' }),
  U('b4', 'scorcher', 59, 25, 'base', sentry(['W', 'S'], 5), { facing: 'W' }),
  U('b5', 'husk', 80, 14, 'base', patrol('eastLoop')),
  U('b6', 'husk', 59, 37, 'base', patrol('wallWalk', 'pingpong')),
  U('b7', 'husk', 68, 30, 'base', sentry(['S', 'E'], 6), { facing: 'S' }),
  U('b8', 'lobber', 72, 29, 'base', camp('baseCamp')),
  U('b9', 'husk', 76, 28, 'base', camp('baseCamp')),
  U('b10', 'husk', 88, 24, 'base', sentry(['S', 'W'], 5), { facing: 'S' }),
  U('b11', 'scorcher', 85, 26, 'base', sentry(['W', 'N'], 6), { facing: 'W' }),
  U('b12', 'warden', 71, 34, 'base', sentry(['S', 'E', 'W'], 5), { facing: 'S' }),
  U('b13', 'husk', 96, 30, 'base', sentry(['E', 'S'], 6), { facing: 'E' }),
  U('b14', 'lobber', 90, 36, 'base', sentry(['S'], 6), { facing: 'S' }),
  U('b15', 'husk', 55, 12, 'base', sentry(['N', 'W'], 6), { facing: 'N' }),
  U('b16', 'husk', 50, 32, 'base', sentry(['W', 'SW'], 6), { facing: 'W' }),
  // gate (south switchback) — towers, turrets, MG nest are structures
  U('g1', 'husk', 73, 40, 'base', sentry(['S', 'SW'], 5), { facing: 'S' }),
  U('g2', 'husk', 78, 40, 'base', sentry(['S', 'SE'], 6), { facing: 'S' }),
  U('g3', 'husk', 75, 50, 'base', patrol('gateRoad', 'pingpong')),
  U('g4', 'husk', 76, 51, 'base', follow('g3', -1.2, 1)),
  U('g5', 'lobber', 81, 44, 'base', sentry(['S'], 6), { facing: 'S' }),
  U('g6', 'warden', 76, 45, 'base', sentry(['S', 'W', 'E'], 6), { facing: 'S' }),
  // north goat path
  U('n1', 'warden', 50, 6, 'north', patrol('northLoop', 'pingpong')),
  U('n2', 'sniffer', 51, 7, 'north', follow('n1', -1.5, -1)),
  U('n3', 'sniffer', 51, 5, 'north', follow('n1', -1.5, 1)),
  U('n4', 'husk', 71, 12, 'north', sentry(['E', 'S'], 7), { facing: 'E' }),
  // canyon & West Ridge surroundings
  U('c1', 'husk', 43, 15, 'canyon', patrol('canyon', 'pingpong')),
  U('c2', 'husk', 44, 16, 'canyon', follow('c1', 1, 1.2)),
  U('c3', 'lobber', 42, 44, 'canyon', camp('canyonCamp')),
  U('c4', 'husk', 18, 16, 'canyon', patrol('ridgeFoot', 'pingpong')),
  U('c5', 'husk', 45, 33, 'canyon', sentry(['W', 'NW'], 6), { facing: 'W' }),
  // southern plains outposts and road patrols
  U('p1', 'husk', 40, 60, 'plains', camp('outpostA')),
  U('p2', 'husk', 42, 61, 'plains', camp('outpostA')),
  U('p3', 'scorcher', 41, 62, 'plains', sentry(['S', 'W'], 6), { facing: 'S' }),
  U('p4', 'husk', 30, 54, 'plains', patrol('plainsA')),
  U('p5', 'husk', 90, 60, 'plains', camp('outpostB')),
  U('p6', 'lobber', 92, 61, 'plains', camp('outpostB')),
  U('p7', 'husk', 84, 55, 'plains', patrol('plainsB')),
  U('p8', 'husk', 85, 56, 'plains', follow('p7', -1, 1)),
  U('p9', 'warden', 60, 70, 'plains', sentry(['S', 'W', 'E'], 6), { facing: 'S' }),
  U('p10', 'husk', 66, 72, 'plains', sentry(['W', 'S'], 5), { facing: 'W' }),
  U('p11', 'lobber', 24, 44, 'plains', sentry(['S', 'W'], 6), { facing: 'S' }),
  U('p12', 'husk', 100, 50, 'plains', sentry(['S', 'E'], 6), { facing: 'S' }),
  U('p13', 'husk', 102, 67, 'plains', sentry(['W', 'N'], 6), { facing: 'W' }),
  U('p14', 'husk', 52, 50, 'plains', sentry(['N', 'W'], 6), { facing: 'N' }),
  U('p15', 'husk', 12, 58, 'plains', sentry(['E', 'N'], 7), { facing: 'E' }),
  // vehicles
  U('sk1', 'skitter', 34, 74, 'plains', patrol('skitterRoad', 'pingpong')),
  U('sk2', 'skitter', 80, 57, 'plains', patrol('skitterEast', 'pingpong')),
];

const STRUCTURES = [
  { id: 'pp', type: 'powerPlant', x: 60, y: 22, alertGroup: 'base' },
  { id: 'bar', type: 'barracks', x: 64, y: 30, alertGroup: 'base' },
  { id: 'cm', type: 'commsArray', x: 70, y: 32, alertGroup: 'base' },
  { id: 'fd', type: 'fuelDepot', x: 47, y: 28, alertGroup: 'base' },
  { id: 'vb', type: 'vehicleBay', x: 86, y: 19, alertGroup: 'base', spawnOnAlarm: 'brute' },
  { id: 'ap', type: 'alarmPylon', x: 75, y: 17, alertGroup: 'base' },
  { id: 'tw1', type: 'guardTower', x: 72, y: 39, alertGroup: 'base', facing: 'S' },
  { id: 'tw2', type: 'guardTower', x: 79, y: 39, alertGroup: 'base', facing: 'S' },
  { id: 'tu1', type: 'gunTurret', x: 67, y: 39, alertGroup: 'base', facing: 'S' },
  { id: 'tu2', type: 'gunTurret', x: 84, y: 39, alertGroup: 'base', facing: 'S' },
  { id: 'mg1', type: 'mgNest', x: 69, y: 41, alertGroup: 'base', facing: 'S' },
];

export function build() {
  const g = new MapGen(112, 80, 202, 'g');
  // scrub & sand variation
  g.each((x, y) => {
    const n = fbm(x * 0.07, y * 0.07, 5), s2 = fbm(x * 0.05, y * 0.05, 9);
    if (n > 0.63) g.set(x, y, { t: 't' });
    else if (s2 < 0.3) g.set(x, y, { t: 's' });
    else if (s2 > 0.7) g.set(x, y, { t: 'd' });
  });
  // --- Anvil Mesa: level 1 shelf and level 2 top
  g.ellipse(74, 25, 37, 21, { e: 1 }, 0.22, 11);
  g.ellipse(75, 26, 29, 16, { e: 2 }, 0.16, 12);
  g.each((x, y, c) => { if (c.e === 2) g.set(x, y, { t: fbm(x * 0.2, y * 0.2, 3) > 0.55 ? 'p' : 'g' }); });
  // --- West Ridge overwatch (separate plateau)
  g.ellipse(31, 27, 10, 14, { e: 1 }, 0.18, 13);
  g.ellipse(34, 27, 6, 10, { e: 2 }, 0.12, 14);
  // keep a level-1 canyon between the ridge and the mesa
  g.each((x, y, c) => { if (x >= 41 && x <= 45 && y >= 12 && y <= 44 && c.e === 2) g.set(x, y, { e: 1 }); });

  // --- base on the mesa
  g.rect(57, 12, 42, 26, { t: 'c', o: '.' });
  for (let y = 14; y <= 34; y++) if (y !== 18 && y !== 31) g.set(56, y, { o: 'v', t: 'c' });   // inner west wall (hides the plant from the ridge)
  for (let x = 58; x <= 93; x++) if (x < 74 || x > 77) g.set(x, 39, { o: 'v', t: 'c' });            // south wall with the gate gap
  g.set(58, 39, { o: 'v' });
  // crates, sandbags and barrels inside
  for (const [x, y] of [[66, 15], [67, 15], [93, 30], [93, 31], [79, 25], [80, 25]]) g.set(x, y, { o: 'k' });
  for (let x = 58; x <= 62; x++) g.set(x, 28, { o: 'b' });
  for (const [x, y] of [[83, 29], [84, 29], [66, 26]]) g.set(x, y, { o: 'x' });

  // --- roads: the switchback from the south up through the gate
  const road = { t: 'r', o: '.' };
  g.polyline([[28, 80], [34, 74], [44, 66], [60, 61], [70, 56], [75.5, 52], [75.5, 46]], 2.2, road, 1.2, 21);
  g.polyline([[75.5, 46], [75.5, 12]], 2.2, road);
  g.polyline([[70, 56], [84, 56], [98, 60], [106, 66]], 2, road, 1, 22);
  // ramps: 0→1 on the shelf's south edge, 1→2 onto the mesa (road width), goat path, ridge ramps
  g.ramp(75, 48, 'N', 2, 0); g.set(75, 48, { t: 'r' }); g.set(76, 48, { t: 'r' });
  g.ramp(75, 43, 'N', 2, 1); g.set(75, 43, { t: 'r' }); g.set(76, 43, { t: 'r' });
  // north shelf band + boulder-choked goat path, ramp 1→2 one tile wide
  g.ramp(58, 3, 'S', 1, 0);
  g.scatter(46, 4, 44, 6, 0.2, { o: 'o' }, (x, y, c) => c.e === 1 && c.o === '.' && Math.abs(y - 6) >= 1);
  g.clear(46, 6, 44, 1);
  g.clear(69, 7, 3, 3);
  g.ramp(70, 9, 'S', 1, 1);
  // ridge ramps (west side)
  g.ramp(20, 31, 'E', 1, 0);
  g.ramp(27, 27, 'E', 1, 1);
  g.clear(18, 29, 3, 5);
  // --- boulder fields & dead trees on the plains
  g.scatter(4, 20, 14, 18, 0.07, { o: 'o' }, (x, y, c) => c.e === 0 && c.o === '.');
  g.scatter(46, 64, 12, 10, 0.08, { o: 'o' }, (x, y, c) => c.e === 0 && c.t !== 'r');
  g.scatter(86, 70, 14, 8, 0.07, { o: 'q' }, (x, y, c) => c.e === 0 && c.t !== 'r');
  g.scatter(0, 40, 112, 40, 0.012, { o: 'f' }, (x, y, c) => c.e === 0 && c.t !== 'r' && c.o === '.');
  g.scatter(0, 40, 112, 40, 0.01, { o: 'j' }, (x, y, c) => c.e === 0 && c.t !== 'r' && c.o === '.');
  // outposts on the plains
  g.rect(38, 58, 6, 6, { t: 'd', o: '.' });
  for (let x = 38; x <= 43; x++) g.set(x, 64, { o: 'b' });
  g.rect(88, 58, 6, 5, { t: 'd', o: '.' });
  for (let y = 58; y <= 62; y++) g.set(94, y, { o: 'b' });
  // start & LZ clearings
  g.clear(0, 64, 7, 12, 'g');
  g.clear(100, 68, 10, 10, 's');
  for (const s of STRUCTURES) { const d = STRUCT_DEFS[s.type]; g.clear(s.x, s.y, d.w, d.h, 'c'); }
  // gate gap stays open after structure clearing
  for (let x = 74; x <= 77; x++) g.set(x, 39, { o: '.', t: 'r' });

  return {
    id: 'm2', name: 'Blackout', kind: 'Sabotage', biome: 'arid', size: { w: 112, h: 80 }, time: 'day', weather: null,
    tint: 'rgba(255,170,80,0.07)',
    ...g.layers(),
    structures: STRUCTURES,
    units: UNITS,
    friendlies: [],
    paths: PATHS,
    areas: {
      lz: { x: 101, y: 69, w: 6, h: 6 },
      mesa: { x: 46, y: 10, w: 58, h: 33 },
      baseCamp: { x: 71, y: 26, w: 7, h: 4 },
      canyonCamp: { x: 40, y: 42, w: 5, h: 4 },
      outpostA: { x: 38, y: 58, w: 6, h: 6 },
      outpostB: { x: 88, y: 58, w: 6, h: 5 },
      ridgeTop: { x: 29, y: 18, w: 11, h: 19 },
      goatPath: { x: 46, y: 3, w: 44, h: 7 },
      gateApproach: { x: 68, y: 44, w: 16, h: 12 },
    },
    alertGroups: {
      base: { barracks: 'bar', reinforceCap: 6, area: 'mesa' },
      north: {}, canyon: {}, plains: {},
    },
    pickups: [
      { type: 'ammo', x: 34, y: 19, amount: 10 },
      { type: 'medkit', x: 47, y: 6 },
      { type: 'c4', x: 98, y: 44 },
    ],
    player: { x: 3, y: 70, facing: 'N', loadout: { rifle: 25, c4: 3, medkit: 0, designator: 0, smoke: 0 } },
    objectives: [
      { id: 'o1', type: 'DESTROY', entities: ['pp'], primary: true, text: 'Destroy the Power Plant on Anvil Mesa' },
      { id: 'o2', type: 'EXTRACT', area: 'lz', primary: true, hidden: true, text: 'Extract at the south-east LZ' },
      { id: 's1', type: 'DESTROY', entities: ['fd'], primary: false, text: 'Destroy the Fuel Depot' },
      { id: 's2', type: 'DESTROY', entities: ['cm'], primary: false, text: 'Destroy the Comms Array (before the plant)' },
    ],
    triggers: [],
    briefing: { text: 'Their forward base on Anvil Mesa runs on one Power Plant. Take it down and every turret up there goes blind.', preview: { x: 56, y: 40, zoom: 0.25 } },
    par: 1200,
  };
}
