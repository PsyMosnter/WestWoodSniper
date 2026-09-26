// @ts-check
/** Mission 6 — "Ghost Walk" (SPEC §16, Mission 6). Night swamp & ruined river town, rain, 112×112. */
import { MapGen } from './lib.js';
import { fbm, Rng } from '../../src/core/rng.js';
import { STRUCT_DEFS } from '../../src/render/spriteData/structures.js';

const P = (x, y, wait = 0, look = null) => ({ x, y, ...(wait ? { wait } : {}), ...(look ? { look } : {}) });
const U = (id, type, x, y, group, behaviour, extra = {}) => ({ id, type, x, y, alertGroup: group, behaviour, ...extra });
const sentry = (facings, interval = 5) => ({ kind: 'sentry', facings, interval });
const patrol = (path, mode = 'loop') => ({ kind: 'patrol', path, mode });
const camp = (area) => ({ kind: 'camp', area });
const follow = (leader, dx, dy) => ({ kind: 'follow', leader, dx, dy });

const TX0 = 18, TY0 = 36, TX1 = 86, TY1 = 88;   // town walls (on a level-1 rise)

const PATHS = {
  wallN: [P(22, 40, 3, 'N'), P(82, 40, 3, 'N')],
  wallS: [P(22, 84, 3, 'S'), P(82, 84, 3, 'S')],
  squareW: [P(28, 50, 3), P(36, 60, 3), P(28, 72, 3), P(24, 60, 3)],
  squareE: [P(70, 50, 3), P(78, 60, 3), P(70, 72, 3), P(64, 60, 3)],
  centre: [P(44, 52, 3, 'N'), P(58, 54, 3, 'E'), P(58, 66, 3, 'S'), P(44, 66, 3, 'W')],
  swampN: [P(20, 20, 5, 'W'), P(44, 14, 4, 'N'), P(84, 18, 5, 'E')],
  swampW: [P(6, 40, 5, 'W'), P(8, 90, 5, 'S')],
  swampE: [P(100, 30, 5, 'E'), P(102, 90, 5, 'S')],
  causeway: [P(52, 30, 4, 'N'), P(52, 12, 5, 'N')],
  roadS: [P(52, 92, 4, 'S'), P(52, 108, 4, 'S')],
};

const UNITS = [];
const add = (...a) => UNITS.push(U(...a));
// town garrison
add('t1', 'husk', 22, 40, 'town', patrol('wallN', 'pingpong'));
add('t2', 'husk', 23, 41, 'town', follow('t1', -1, 1));
add('t3', 'husk', 22, 84, 'town', patrol('wallS', 'pingpong'));
add('t4', 'husk', 28, 50, 'town', patrol('squareW'));
add('t5', 'husk', 70, 50, 'town', patrol('squareE'));
add('t6', 'warden', 44, 52, 'town', patrol('centre'));
add('t7', 'husk', 45, 53, 'town', follow('t6', -1, 1));
add('t8', 'scorcher', 48, 56, 'town', sentry(['N', 'W'], 6), { facing: 'N' });
add('t9', 'scorcher', 55, 64, 'town', sentry(['S', 'E'], 6), { facing: 'S' });
add('t10', 'scorcher', 30, 64, 'town', sentry(['W', 'S'], 6), { facing: 'W' });
add('t11', 'scorcher', 74, 64, 'town', sentry(['E', 'N'], 6), { facing: 'E' });
add('t12', 'lobber', 36, 46, 'town', camp('campNW'));
add('t13', 'husk', 38, 47, 'town', camp('campNW'));
add('t14', 'lobber', 66, 75, 'town', camp('campSE'));
add('t15', 'husk', 68, 77, 'town', camp('campSE'));
add('t16', 'warden', 76, 44, 'town', sentry(['N', 'E'], 6), { facing: 'N' });
add('t17', 'warden', 28, 80, 'town', sentry(['S', 'W'], 6), { facing: 'S' });
add('t18', 'husk', 50, 42, 'town', sentry(['N'], 6), { facing: 'N' });
add('t19', 'husk', 54, 42, 'town', sentry(['N'], 7), { facing: 'N' });
add('t20', 'husk', 50, 82, 'town', sentry(['S'], 6), { facing: 'S' });
add('t21', 'husk', 54, 82, 'town', sentry(['S'], 7), { facing: 'S' });
add('t22', 'sniffer', 42, 70, 'town', camp('campCentre'));
add('t23', 'sniffer', 60, 47, 'town', camp('campCentre'));
add('t24', 'husk', 62, 58, 'town', sentry(['E', 'S'], 5), { facing: 'E' });
add('t25', 'husk', 40, 60, 'town', sentry(['W', 'N'], 6), { facing: 'W' });
add('t26', 'lobber', 80, 56, 'town', sentry(['E'], 6), { facing: 'E' });
add('t27', 'husk', 24, 56, 'town', sentry(['W'], 6), { facing: 'W' });
add('t28', 'husk', 82, 70, 'town', sentry(['E', 'S'], 6), { facing: 'E' });
add('t29', 'scorcher', 60, 70, 'town', sentry(['S'], 6), { facing: 'S' });
add('t30', 'scorcher', 36, 56, 'town', sentry(['N'], 6), { facing: 'N' });
// swamp patrols & causeway
add('s1', 'husk', 20, 20, 'swamp', patrol('swampN'));
add('s2', 'husk', 21, 21, 'swamp', follow('s1', -1, 1));
add('s3', 'sniffer', 22, 20, 'swamp', follow('s1', -2, -1));
add('s4', 'husk', 6, 40, 'swamp', patrol('swampW', 'pingpong'));
add('s5', 'husk', 100, 30, 'swamp', patrol('swampE', 'pingpong'));
add('s6', 'sniffer', 101, 31, 'swamp', follow('s5', -1.5, 1));
add('s7', 'lobber', 30, 12, 'swamp', sentry(['S', 'W'], 6), { facing: 'S' });
add('s8', 'husk', 52, 30, 'causeway', patrol('causeway', 'pingpong'));
add('s9', 'husk', 53, 31, 'causeway', follow('s8', -1, 1));
add('s10', 'warden', 48, 22, 'causeway', sentry(['N', 'S'], 6), { facing: 'N' });
add('s11', 'husk', 60, 18, 'causeway', sentry(['W', 'N'], 6), { facing: 'W' });
add('s12', 'lobber', 70, 26, 'swamp', sentry(['S'], 6), { facing: 'S' });
add('s13', 'husk', 88, 12, 'swamp', sentry(['W'], 7), { facing: 'W' });
add('s14', 'husk', 10, 100, 'swamp', sentry(['N', 'E'], 6), { facing: 'N' });
add('s15', 'warden', 52, 100, 'road', patrol('roadS', 'pingpong'));
add('s16', 'husk', 53, 101, 'road', follow('s15', -1, 1));
add('s17', 'husk', 94, 100, 'swamp', sentry(['W', 'N'], 6), { facing: 'W' });
add('s18', 'husk', 96, 60, 'swamp', sentry(['W'], 6), { facing: 'W' });
add('cv1', 'sniffer', 14, 62, 'culvert', sentry(['E', 'W'], 4), { facing: 'E', inTunnel: 'culvert' });
add('sk1', 'skitter', 52, 96, 'road', sentry(['N']), { facing: 'N' });
add('sk2', 'skitter', 59, 30, 'causeway', sentry(['N']), { facing: 'N' });

const STRUCTURES = [
  { id: 'cells', type: 'detentionBlock', x: 46, y: 58, alertGroup: 'town' },
  { id: 'vbay', type: 'vehicleBay', x: 66, y: 66, alertGroup: 'town', spawnOnAlarm: 'brute' },
  { id: 'bar', type: 'barracks', x: 30, y: 68, alertGroup: 'town' },
  { id: 'sl1', type: 'guardTower', x: 28, y: 44, alertGroup: 'town', facing: 'SE', searchlight: true },
  { id: 'sl2', type: 'guardTower', x: 76, y: 46, alertGroup: 'town', facing: 'SW', searchlight: true },
  { id: 'sl3', type: 'guardTower', x: 28, y: 78, alertGroup: 'town', facing: 'NE', searchlight: true },
  { id: 'sl4', type: 'guardTower', x: 76, y: 78, alertGroup: 'town', facing: 'NW', searchlight: true },
  { id: 'mg1', type: 'mgNest', x: 55, y: 39, alertGroup: 'town', facing: 'N' },
  { id: 'mg2', type: 'mgNest', x: 55, y: 84, alertGroup: 'town', facing: 'S' },
  { id: 'gateN', type: 'gate', x: 51, y: TY0, alertGroup: 'town' },
];

export function build() {
  const g = new MapGen(112, 112, 606, 'm');
  const rng = new Rng(66);
  // swamp basin: mud, reeds (tall grass), pools (shallow), dead trees & willows
  g.each((x, y) => {
    const n = fbm(x * 0.09, y * 0.09, 3), p = fbm(x * 0.13, y * 0.13, 7);
    if (p < 0.3) g.set(x, y, { t: 'w' });
    else if (n > 0.55) g.set(x, y, { t: 't' });
    else if (n < 0.34) g.set(x, y, { t: 'g' });
  });
  g.scatter(0, 0, 112, 112, 0.05, { o: 'f' }, (x, y, c) => c.t !== 'w');
  g.scatter(0, 0, 112, 112, 0.03, { o: 'F' }, (x, y, c) => c.t === 'm');
  // --- town rise (level 1) with walls, two gates, ruined houses
  g.rect(TX0 - 3, TY0 - 3, TX1 - TX0 + 7, TY1 - TY0 + 7, { e: 1, t: 'g', o: '.' });
  g.ellipse((TX0 + TX1) / 2, (TY0 + TY1) / 2, (TX1 - TX0) / 2 + 6, (TY1 - TY0) / 2 + 6, { e: 1 }, 0.1, 71);
  g.each((x, y, c) => { if (c.e === 1) g.set(x, y, { t: fbm(x * 0.3, y * 0.3, 9) > 0.62 ? 'p' : 'g', o: c.o === 'F' ? '.' : c.o }); });
  for (let x = TX0; x <= TX1; x++) { if (Math.abs(x - 51.5) > 2) g.set(x, TY0, { o: 'v' }); if (Math.abs(x - 51.5) > 2) g.set(x, TY1, { o: 'v' }); }
  for (let y = TY0; y <= TY1; y++) { if (Math.abs(y - 62) > 0) g.set(TX0, y, { o: 'v' }); g.set(TX1, y, { o: 'v' }); }
  // ruined houses: broken wall squares with rubble inside (hard LOS blockers everywhere)
  const houses = [[24, 42], [34, 40], [62, 40], [70, 42], [22, 50], [80, 50], [34, 52], [66, 52], [22, 66], [80, 64], [36, 74], [62, 76], [24, 76], [72, 82], [40, 82], [56, 48]];
  for (const [hx, hy] of houses) {
    const w = 4 + rng.int(0, 2), h = 3 + rng.int(0, 2);
    for (let x = hx; x < hx + w; x++) for (let y = hy; y < hy + h; y++) {
      const edge = x === hx || y === hy || x === hx + w - 1 || y === hy + h - 1;
      if (edge && rng.chance(0.78)) g.set(x, y, { o: 'v' });
      else if (!edge && rng.chance(0.35)) g.set(x, y, { o: 'u' });
    }
  }
  // cobbled squares
  g.ellipse(30, 60, 5, 4, { t: 'c', o: '.' }, 0.2, 72);
  g.ellipse(72, 60, 5, 4, { t: 'c', o: '.' }, 0.2, 73);
  g.rect(42, 54, 14, 14, { t: 'c', o: '.' });
  // campfires & spore crystals are light sources at night
  for (const [x, y] of [[36, 48], [68, 78], [52, 70]]) g.set(x, y, { o: 'k' });
  for (const [x, y] of [[20, 30], [90, 40], [40, 96], [70, 100], [100, 80]]) g.set(x, y, { o: 'z' });
  // --- roads: sunken causeway north to the LZ knoll, road south
  const road = { t: 'r', o: '.' };
  g.polyline([[52, 36], [52, 8]], 2.2, road);
  g.polyline([[52, 88], [52, 112]], 2.2, road);
  g.polyline([[52, 36], [52, 88]], 2, { t: 'c', o: '.' });
  // LZ knoll (level 1) north
  g.ellipse(52, 5, 10, 5, { e: 1, t: 'g', o: '.' }, 0.15, 74);
  // gates & ramps (town rise and knoll)
  g.autoRamps([[52.5, 110], [52.5, 88]], 2);
  g.autoRamps([[52.5, 36], [52.5, 20]], 2);
  g.autoRamps([[52.5, 20], [52.5, 4]], 2);
  for (let x = 50; x <= 53; x++) { g.set(x, TY0, { o: '.' }); g.set(x, TY1, { o: '.' }); }
  // the old sewer culvert: tunnel under the west wall (entrances marked by rubble)
  g.set(TX0 + 2, 62, { o: 'u' }); g.set(TX0 - 6, 62, { o: 'u' });
  // start & LZ clearings
  g.clear(0, 100, 8, 12, 'g');
  g.clear(48, 2, 9, 6, 'g');
  for (const s of STRUCTURES) { const d = STRUCT_DEFS[s.type]; g.clear(s.x, s.y, d.w, d.h, 'c'); }
  return {
    id: 'm6', name: 'Ghost Walk', kind: 'Rescue · exfiltration', biome: 'swamp', size: { w: 112, h: 112 }, time: 'night', weather: 'rain',
    tint: 'rgba(20,30,60,0.28)',
    ...g.layers(),
    structures: STRUCTURES,
    units: UNITS,
    friendlies: [
      { id: 'adler', type: 'scientist', x: 45, y: 60, captive: true, name: 'Dr. Adler' },
      { id: 'okafor', type: 'scientist', x: 49, y: 62, captive: true, name: 'Dr. Okafor' },
      { id: 'lind', type: 'scientist', x: 47, y: 57, captive: true, name: 'Dr. Lind' },
    ],
    tunnels: [{ id: 'culvert', a: { x: TX0 + 2, y: 62 }, b: { x: TX0 - 6, y: 62 }, time: 4, guard: 'cv1' }],
    lights: [{ x: 36, y: 48, r: 3 }, { x: 68, y: 78, r: 3 }, { x: 52, y: 70, r: 3 }],
    paths: PATHS,
    areas: {
      lz: { x: 48, y: 2, w: 9, h: 6 },
      town: { x: TX0, y: TY0, w: TX1 - TX0 + 1, h: TY1 - TY0 + 1 },
      cells: { x: 44, y: 56, w: 8, h: 8 },
      campNW: { x: 34, y: 44, w: 6, h: 5 },
      campSE: { x: 64, y: 74, w: 7, h: 6 },
      campCentre: { x: 40, y: 48, w: 24, h: 24 },
    },
    alertGroups: { town: { barracks: 'bar', reinforceCap: 6, area: 'town' }, swamp: {}, causeway: {}, road: {}, culvert: {} },
    pickups: [{ type: 'ammo', x: 12, y: 80, amount: 10 }, { type: 'medkit', x: 96, y: 50 }],
    player: { x: 3, y: 106, facing: 'N', loadout: { rifle: 25, c4: 2, medkit: 2, designator: 1, smoke: 1 } },
    objectives: [
      { id: 'o1', type: 'RESCUE', units: ['adler', 'okafor', 'lind'], primary: true, text: 'Free Dr. Adler, Dr. Okafor and Dr. Lind' },
      { id: 'o2', type: 'EXTRACT', area: 'lz', primary: true, hidden: true, text: 'Bring all three to the north LZ and extract' },
      { id: 's1', type: 'DESTROY', entities: ['vbay'], primary: false, text: 'Destroy the Vehicle Bay' },
      { id: 's2', type: 'STEALTH', primary: false, text: 'No base alarm' },
    ],
    triggers: [],
    checkpoint: { when: 'rescued', note: 'after the rescue' },
    briefing: { text: "Three of our scientists are in the NOT detention block at Saint Ives. Bring them home. They're not soldiers — keep them in the dark.", preview: { x: 56, y: 56, zoom: 0.25 } },
    par: 1500,
  };
}
