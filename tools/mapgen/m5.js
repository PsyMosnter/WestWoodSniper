// @ts-check
/** Mission 5 — "Sunhammer" (SPEC §16, Mission 5). Tropical jungle river delta, 128×112. */
import { MapGen } from './lib.js';
import { fbm } from '../../src/core/rng.js';
import { STRUCT_DEFS } from '../../src/render/spriteData/structures.js';

const P = (x, y, wait = 0, look = null) => ({ x, y, ...(wait ? { wait } : {}), ...(look ? { look } : {}) });
const U = (id, type, x, y, group, behaviour, extra = {}) => ({ id, type, x, y, alertGroup: group, behaviour, ...extra });
const sentry = (facings, interval = 5) => ({ kind: 'sentry', facings, interval });
const patrol = (path, mode = 'loop') => ({ kind: 'patrol', path, mode });
const camp = (area) => ({ kind: 'camp', area });
const follow = (leader, dx, dy) => ({ kind: 'follow', leader, dx, dy });

// Delta Island compound (walled) in the centre
const CX0 = 33, CY0 = 46, CX1 = 78, CY1 = 80;

const PATHS = {
  hillLoop: [P(8, 12, 4, 'N'), P(16, 10, 3, 'E'), P(15, 21, 4, 'S'), P(7, 22, 3, 'W')],
  northJungle: [P(40, 14, 4, 'W'), P(70, 12, 4, 'E'), P(62, 26, 4, 'S')],
  kennelNE: [P(106, 8, 4, 'N'), P(120, 20, 4, 'E'), P(106, 32, 4, 'S')],
  kennelSW: [P(12, 88, 4, 'W'), P(30, 96, 4, 'S'), P(20, 104, 4, 'E')],
  templeLoop: [P(106, 56, 4, 'W'), P(122, 58, 4, 'E'), P(118, 75, 4, 'S'), P(104, 74, 3, 'W')],
  compoundN: [P(38, 50, 3, 'N'), P(73, 50, 3, 'N')],
  compoundS: [P(38, 76, 3, 'S'), P(73, 76, 3, 'S')],
  compoundW: [P(37, 52, 3, 'W'), P(37, 74, 3, 'W')],
  compoundE: [P(74, 52, 3, 'E'), P(74, 74, 3, 'E')],
  harvest: [P(46, 60, 4), P(64, 70, 4)],
  southShore: [P(40, 98, 4, 'S'), P(90, 100, 4, 'S')],
  skitterN: [P(40, 20, 4, 'W'), P(80, 20, 4, 'E')],
  skitterS: [P(30, 96, 4, 'W'), P(96, 96, 4, 'E')],
  bruteLoop: [P(40, 62, 4), P(70, 62, 4)],
};

const UNITS = [];
const add = (...a) => UNITS.push(U(...a));
// Monkey Hill (Jammer West)
add('mh1', 'husk', 8, 12, 'hill', patrol('hillLoop'));
add('mh2', 'husk', 9, 13, 'hill', follow('mh1', -1, 1));
add('mh3', 'warden', 12, 16, 'hill', sentry(['E', 'S'], 6), { facing: 'E' });
add('mh4', 'lobber', 14, 19, 'hill', sentry(['S', 'E'], 6), { facing: 'S' });
add('mh5', 'husk', 8, 27, 'hill', sentry(['S', 'E'], 6), { facing: 'S' });   // (playtest 2: was (5,26) facing S/W — it stared down the quiet west way up)
add('mh6', 'scorcher', 11, 10, 'hill', sentry(['N', 'W'], 6), { facing: 'N' });
// north jungle island
add('nj1', 'husk', 40, 14, 'north', patrol('northJungle'));
add('nj2', 'husk', 41, 15, 'north', follow('nj1', -1, 1));
add('nj3', 'launcher', 58, 8, 'north', sentry(['S', 'E'], 6), { facing: 'S' });
add('nj4', 'husk', 48, 26, 'north', sentry(['S'], 6), { facing: 'S' });
add('nj5', 'lobber', 66, 24, 'north', camp('northCamp'));
add('nj6', 'husk', 70, 26, 'north', camp('northCamp'));
// kennels: 8 Sniffers in 2 kennels with handlers
add('k1h', 'warden', 106, 8, 'kennelNE', patrol('kennelNE'));
for (let i = 0; i < 4; i++) add(`k1s${i}`, 'sniffer', 107 + (i % 2), 9 + (i >> 1), 'kennelNE', follow('k1h', -1.5 - (i % 2), (i >> 1) * 2 - 1));
add('k2h', 'husk', 12, 88, 'kennelSW', patrol('kennelSW'));
for (let i = 0; i < 4; i++) add(`k2s${i}`, 'sniffer', 13 + (i % 2), 89 + (i >> 1), 'kennelSW', follow('k2h', -1.5 - (i % 2), (i >> 1) * 2 - 1));
// Old Temple (overwatch) — lightly held
add('ot1', 'husk', 106, 56, 'temple', patrol('templeLoop'));
add('ot2', 'husk', 116, 66, 'temple', sentry(['W', 'N'], 7), { facing: 'W' });
add('ot3', 'scorcher', 110, 72, 'temple', sentry(['S'], 6), { facing: 'S' });
// compound garrison
const cg = (id, t, x, y, b, f) => add(id, t, x, y, 'compound', b, f ? { facing: f } : {});
cg('c1', 'husk', 38, 50, patrol('compoundN', 'pingpong'));
cg('c2', 'husk', 39, 51, follow('c1', -1, 1));
cg('c3', 'husk', 38, 76, patrol('compoundS', 'pingpong'));
cg('c4', 'husk', 39, 77, follow('c3', -1, -1));
cg('c5', 'husk', 37, 52, patrol('compoundW', 'pingpong'));
cg('c6', 'husk', 74, 52, patrol('compoundE', 'pingpong'));
cg('c7', 'scorcher', 52, 56, sentry(['N', 'W'], 6), 'N');
cg('c8', 'scorcher', 60, 72, sentry(['S', 'E'], 6), 'S');
cg('c9', 'scorcher', 66, 58, sentry(['E', 'N'], 6), 'E');
cg('c10', 'warden', 56, 64, sentry(['S', 'W', 'E'], 5), 'S');
cg('c11', 'warden', 48, 70, sentry(['W', 'S'], 6), 'W');
cg('c12', 'lobber', 44, 58, camp('cCampW'));
cg('c13', 'lobber', 70, 70, camp('cCampE'));
cg('c14', 'launcher', 58, 50, sentry(['N'], 6), 'N');
cg('c15', 'launcher', 58, 78, sentry(['S'], 6), 'S');
cg('c16', 'husk', 44, 66, camp('cCampW'));
cg('c17', 'husk', 68, 66, camp('cCampE'));
cg('c18', 'husk', 52, 74, sentry(['S', 'W'], 6), 'S');
cg('c19', 'husk', 64, 52, sentry(['N', 'E'], 6), 'N');
cg('c20', 'husk', 48, 52, sentry(['N', 'W'], 5), 'N');
for (let i = 0; i < 3; i++) cg(`hv${i}`, 'harvester', 46 + i * 7, 62 + (i % 2) * 6, camp('refineryYard'));
// south shore & fords
add('ss1', 'husk', 40, 98, 'south', patrol('southShore', 'pingpong'));
add('ss2', 'husk', 41, 99, 'south', follow('ss1', -1, 1));
add('ss3', 'husk', 57, 91, 'south', sentry(['N', 'S'], 6), { facing: 'N' });
add('ss4', 'lobber', 72, 100, 'south', sentry(['S', 'N'], 7), { facing: 'N' });
add('ss5', 'husk', 90, 100, 'south', sentry(['W', 'S'], 6), { facing: 'W' });
add('ss6', 'warden', 22, 72, 'west', sentry(['E', 'N'], 6), { facing: 'E' });
add('ss7', 'husk', 24, 60, 'west', sentry(['E'], 6), { facing: 'E' });
add('ss8', 'husk', 90, 44, 'east', sentry(['W', 'S'], 6), { facing: 'W' });
add('ss9', 'husk', 90, 82, 'east', sentry(['W'], 6), { facing: 'W' });
add('ss10', 'launcher', 88, 64, 'east', sentry(['W'], 6), { facing: 'W' });
add('ss11', 'husk', 100, 40, 'east', sentry(['S', 'W'], 6), { facing: 'S' });
add('ss12', 'husk', 30, 33, 'north', sentry(['S', 'E'], 6), { facing: 'S' });
// vehicles
add('sk1', 'skitter', 40, 20, 'north', patrol('skitterN', 'pingpong'));
add('sk2', 'skitter', 30, 96, 'south', patrol('skitterS', 'pingpong'));
add('br1', 'brute', 40, 62, 'compound', patrol('bruteLoop', 'pingpong'));
add('br2', 'brute', 70, 60, 'compound', sentry(['E'], 8), { facing: 'E' });

const STRUCTURES = [
  { id: 'jamW', type: 'jammer', x: 10, y: 14, alertGroup: 'hill' },
  { id: 'jamE', type: 'jammer', x: 64, y: 54, alertGroup: 'compound' },
  { id: 'refinery', type: 'refinery', x: 52, y: 60, alertGroup: 'compound' },
  { id: 'silo1', type: 'silo', x: 44, y: 56, alertGroup: 'compound' },
  { id: 'silo2', type: 'silo', x: 64, y: 66, alertGroup: 'compound' },
  { id: 'plant', type: 'powerPlant', x: 40, y: 68, alertGroup: 'compound' },
  { id: 'vbay', type: 'vehicleBay', x: 66, y: 72, alertGroup: 'compound', spawnOnAlarm: 'brute' },
  { id: 'bar', type: 'barracks', x: 44, y: 49, alertGroup: 'compound' },
  { id: 'tw1', type: 'guardTower', x: CX0, y: CY0, alertGroup: 'compound', facing: 'NW' },
  { id: 'tw2', type: 'guardTower', x: CX1, y: CY0, alertGroup: 'compound', facing: 'NE' },
  { id: 'tw3', type: 'guardTower', x: CX1, y: CY1, alertGroup: 'compound', facing: 'SE' },
  { id: 'tu1', type: 'gunTurret', x: 55, y: CY0, alertGroup: 'compound', facing: 'N' },
  { id: 'tu2', type: 'gunTurret', x: 55, y: CY1, alertGroup: 'compound', facing: 'S' },
];

export function build() {
  const g = new MapGen(128, 112, 505, 'g');
  // jungle everywhere: dense forest with clearings, tall ferns
  g.each((x, y) => {
    const n = fbm(x * 0.07, y * 0.07, 3), m = fbm(x * 0.12, y * 0.12, 8);
    if (n > 0.46) g.set(x, y, { o: n > 0.53 ? 'F' : 'f' });
    else if (m > 0.62) g.set(x, y, { t: 't' });
  });
  // --- river channels (deep) with shallow banks: they split the delta into five islands
  const river = (pts, w = 7, seed = 1) => { g.polyline(pts, w + 3, { t: 'w', o: '.', e: 0 }, 1.5, seed); g.polyline(pts, w, { t: 'W', o: '.', e: 0 }, 1.5, seed); };
  river([[28, -2], [26, 16], [22, 34], [18, 50], [16, 70], [18, 90], [22, 114]], 6, 11);   // west channel
  river([[92, -2], [94, 20], [92, 40], [94, 60], [92, 80], [96, 114]], 6, 12);              // east channel
  river([[20, 38], [50, 36], [80, 38], [94, 40]], 6, 13);                                  // north channel
  river([[16, 86], [50, 88], [80, 86], [94, 88]], 6, 14);                                  // south channel
  river([[-2, 104], [40, 108], [80, 106], [130, 108]], 7, 15);                             // sea inlet (boat LZ)
  g.roughenWater(61, 0.62);
  // --- fords (shallow) and rope bridges (3)
  g.ellipse(24, 26, 4, 2, { t: 'w', o: '.' }, 0.2, 21);     // ford NW (hill ↔ north island)
  g.ellipse(52, 87, 3, 4, { t: 'w', o: '.' }, 0.2, 22);     // ford south (delta ↔ south shore)
  const bridge = (pts) => g.polyline(pts, 1.6, (x, y) => (g.t[y]?.[x] === 'W' || g.t[y]?.[x] === 'w') ? { o: 'h' } : { t: 'd', o: '.' });
  bridge([[38, 30], [38, 44]]);                              // north island → delta
  bridge([[86, 60], [100, 60]]);                             // delta → temple island
  bridge([[8, 60], [26, 60]]);                               // west (start) → delta west shore
  // --- Monkey Hill (level 2) NW with ramps
  g.ellipse(12, 16, 9, 10, { e: 1, o: '.' }, 0.2, 31);
  g.ellipse(12, 16, 6, 7, { e: 2 }, 0.15, 32);
  g.each((x, y, c) => { if (c.e > 0 && c.o === 'F') g.set(x, y, { o: 'f' }); });
  g.clear(8, 12, 9, 9);
  g.ramp(12, 27, 'N', 2, 0);
  g.ramp(12, 23, 'N', 1, 1);
  g.clear(11, 22, 4, 7);
  // --- Old Temple ruin (level 2) SE: a sightline of ~10 tiles into the compound over the river
  g.ellipse(112, 64, 13, 14, { e: 1, o: '.' }, 0.18, 33);
  g.ellipse(110, 64, 8, 9, { e: 2 }, 0.14, 34);
  g.each((x, y, c) => { if (c.e > 0 && (c.o === 'F' || c.o === 'f') && fbm(x * 0.3, y * 0.3, 4) < 0.5) g.set(x, y, { o: '.' }); });
  g.scatter(103, 56, 15, 17, 0.12, { o: 'u' }, (x, y, c) => c.e === 2);
  g.scatter(103, 56, 15, 17, 0.04, { o: 'q' }, (x, y, c) => c.e === 2 && c.o === '.');
  g.ramp(118, 64, 'W', 2, 1);
  g.ramp(124, 64, 'W', 1, 0);
  g.clear(116, 62, 10, 5);
  // --- Delta Island compound: walls with two gates, concrete yard
  g.rect(CX0 - 2, CY0 - 3, CX1 - CX0 + 5, CY1 - CY0 + 6, { o: '.', e: 0 });
  g.rect(CX0, CY0, CX1 - CX0 + 1, CY1 - CY0 + 1, { t: 'c', o: '.' });
  for (let x = CX0; x <= CX1; x++) { if (Math.abs(x - 38) > 1) g.set(x, CY0, { o: 'v' }); if (Math.abs(x - 52) > 1) g.set(x, CY1, { o: 'v' }); }
  for (let y = CY0; y <= CY1; y++) { if (Math.abs(y - 60) > 1) { g.set(CX0, y, { o: 'v' }); g.set(CX1, y, { o: 'v' }); } }
  for (const [x, y] of [[48, 66], [49, 66], [60, 56], [70, 64], [71, 64]]) g.set(x, y, { o: 'k' });
  for (const [x, y] of [[62, 60], [62, 61], [50, 76]]) g.set(x, y, { o: 'x' });
  // spore crystals in the refinery yard
  for (const [x, y] of [[47, 63], [58, 68], [70, 58], [42, 74]]) g.set(x, y, { o: 'z' });
  // jungle paths (dirt) — the Sniffer kennels walk them
  g.polyline([[4, 60], [8, 60]], 1.4, { t: 'd', o: '.' });
  g.polyline([[36, 20], [60, 16], [80, 22]], 1.6, { t: 'd', o: '.' }, 2, 41);
  g.polyline([[100, 10], [118, 20], [104, 34]], 1.4, { t: 'd', o: '.' }, 1.5, 42);
  g.polyline([[10, 90], [28, 98], [20, 104]], 1.4, { t: 'd', o: '.' }, 1.5, 43);
  g.polyline([[26, 96], [96, 96]], 1.6, { t: 'd', o: '.' }, 1.5, 44);
  // start clearing (west island) & boat LZ on a sandbar in the inlet
  g.clear(0, 56, 6, 10, 'g');
  g.rect(58, 94, 10, 7, { t: 's', o: '.', e: 0 });
  // Monkey Hill: a second, quieter way up from the west
  g.ramp(2, 16, 'E', 1, 0); g.ramp(5, 16, 'E', 1, 1); g.clear(0, 14, 7, 5);
  for (const s of STRUCTURES) { const d = STRUCT_DEFS[s.type]; g.clear(s.x, s.y, d.w, d.h, 'c'); }
  g.set(CX0, CY0, { o: '.' }); g.set(CX1, CY0, { o: '.' }); g.set(CX1, CY1, { o: '.' });
  return {
    id: 'm5', name: 'Sunhammer', kind: 'Sabotage · strike', biome: 'jungle', size: { w: 128, h: 112 }, time: 'day', weather: 'haze',
    tint: 'rgba(200,255,190,0.05)',
    ...g.layers(),
    structures: STRUCTURES,
    units: UNITS,
    friendlies: [],
    paths: PATHS,
    areas: {
      lz: { x: 59, y: 95, w: 8, h: 5 },
      compound: { x: CX0, y: CY0, w: CX1 - CX0 + 1, h: CY1 - CY0 + 1 },
      monkeyHill: { x: 4, y: 6, w: 17, h: 21 },
      temple: { x: 100, y: 52, w: 20, h: 25 },
      northCamp: { x: 62, y: 22, w: 10, h: 6 },
      cCampW: { x: 42, y: 56, w: 6, h: 12 },
      cCampE: { x: 66, y: 62, w: 8, h: 10 },
      refineryYard: { x: 44, y: 60, w: 22, h: 12 },
      westShore: { x: 26, y: 52, w: 6, h: 16 },
    },
    alertGroups: {
      compound: { barracks: 'bar', reinforceCap: 6, area: 'compound' },
      hill: { area: 'monkeyHill' }, temple: {}, kennelNE: {}, kennelSW: {}, north: {}, south: {}, west: {}, east: {},
    },
    pickups: [{ type: 'ammo', x: 6, y: 40, amount: 10 }, { type: 'c4', x: 118, y: 40 }, { type: 'medkit', x: 104, y: 90 }],
    player: { x: 2, y: 60, facing: 'E', loadout: { rifle: 25, c4: 3, medkit: 1, designator: 1, smoke: 0 } },
    objectives: [
      { id: 'o1', type: 'DESTROY', entities: ['jamW'], primary: true, text: 'Destroy Jammer Tower West (Monkey Hill)' },
      { id: 'o2', type: 'CUSTOM', fn: 'jamEastDown', primary: true, text: 'Take Jammer Tower East offline (or cut the island power)' },
      { id: 'o3', type: 'DESTROY', entities: ['refinery', 'silo1', 'silo2', 'plant', 'vbay'], minCount: 4, primary: true, text: 'Destroy 80% of the Spore Refinery complex' },
      { id: 'o4', type: 'EXTRACT', area: 'lz', primary: true, hidden: true, text: 'Extract at the boat LZ (south)' },
    ],
    triggers: [],
    briefing: { text: 'High Command has cleared you for a strategic strike. The NOT Spore Refinery sits on Delta Island under two jammer towers. Kill the jammers. Paint the target. Get clear.', preview: { x: 64, y: 56, zoom: 0.25 } },
    par: 1500,
  };
}
