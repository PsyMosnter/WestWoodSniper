// @ts-check
/** Mission 7 — "Hive Heart" (SPEC §16, Mission 7). Volcanic badlands, lava rivers, the Hive Spire, 128×128. */
import { MapGen } from './lib.js';
import { fbm, Rng } from '../../src/core/rng.js';
import { STRUCT_DEFS } from '../../src/render/spriteData/structures.js';

const P = (x, y, wait = 0, look = null) => ({ x, y, ...(wait ? { wait } : {}), ...(look ? { look } : {}) });
const U = (id, type, x, y, group, behaviour, extra = {}) => ({ id, type, x, y, alertGroup: group, behaviour, ...extra });
const sentry = (facings, interval = 5) => ({ kind: 'sentry', facings, interval });
const patrol = (path, mode = 'loop') => ({ kind: 'patrol', path, mode });
const camp = (area) => ({ kind: 'camp', area });
const follow = (leader, dx, dy) => ({ kind: 'follow', leader, dx, dy });

const SPIRE = { x: 61, y: 50 };  // 4×4 → centre (63, 52); the Ash Needle is 11 tiles east

const PATHS = {
  calderaLoop: [P(52, 44, 3), P(66, 44, 3), P(68, 60, 3), P(52, 62, 3)],
  jugA: [P(50, 50, 5, 'W'), P(56, 62, 5, 'S')],
  jugB: [P(58, 44, 5, 'N'), P(66, 58, 5, 'E')],
  terraceN: [P(40, 26, 4, 'N'), P(80, 24, 4, 'N')],
  terraceS: [P(40, 80, 4, 'S'), P(80, 83, 4, 'S')],
  terraceW: [P(30, 40, 4, 'W'), P(30, 70, 4, 'W')],
  terraceE: [P(86, 34, 4, 'E'), P(88, 72, 4, 'E')],
  campW: [P(14, 56, 3), P(22, 64, 3)],
  campE: [P(100, 64, 3), P(108, 74, 3)],
  campN: [P(34, 10, 3), P(46, 14, 3)],
  southRoad: [P(62, 108, 4, 'S'), P(62, 124, 4, 'S')],
  ashField: [P(20, 112, 5, 'W'), P(44, 118, 5, 'S')],
  skitterT: [P(36, 30, 4), P(88, 30, 4)],
  bruteT: [P(34, 78, 4), P(84, 78, 4)],
};

const UNITS = [];
let n = 0;
const add = (type, x, y, group, behaviour, extra = {}) => UNITS.push(U(`${group}${n++}`, type, x, y, group, behaviour, extra));
// inner compound (caldera, level 3): 3 Juggernauts + elite infantry
UNITS.push(U('jug1', 'juggernaut', 50, 50, 'hive', patrol('jugA', 'pingpong')));
UNITS.push(U('jug2', 'juggernaut', 58, 44, 'hive', patrol('jugB', 'pingpong')));
UNITS.push(U('jug3', 'juggernaut', 60, 64, 'hive', sentry(['S'], 8), { facing: 'S' }));
add('warden', 52, 44, 'hive', patrol('calderaLoop'));
for (const [t, x, y, f] of [['scorcher', 56, 48, 'N'], ['scorcher', 66, 56, 'E'], ['scorcher', 54, 60, 'S'], ['launcher', 58, 58, 'S'], ['launcher', 66, 48, 'E'], ['husk', 50, 56, 'W'], ['husk', 62, 46, 'N'], ['husk', 64, 62, 'S'], ['lobber', 56, 54, 'W'], ['husk', 52, 64, 'S']]) add(t, x, y, 'hive', sentry([f, 'S'], 6), { facing: f });
// terrace (level 2): barracks & vehicle bays, patrols
add('husk', 40, 26, 'terrace', patrol('terraceN', 'pingpong'));
add('husk', 41, 27, 'terrace', follow(UNITS[UNITS.length - 1].id, -1, 1));
add('husk', 40, 80, 'terrace', patrol('terraceS', 'pingpong'));
add('husk', 41, 81, 'terrace', follow(UNITS[UNITS.length - 1].id, -1, -1));
add('husk', 30, 40, 'terrace', patrol('terraceW', 'pingpong'));
add('sniffer', 31, 41, 'terrace', follow(UNITS[UNITS.length - 1].id, -1.5, 1));
add('husk', 86, 34, 'terrace', patrol('terraceE', 'pingpong'));
add('sniffer', 87, 35, 'terrace', follow(UNITS[UNITS.length - 1].id, -1.5, 1));
for (const [t, x, y, f] of [['warden', 44, 34, 'N'], ['warden', 76, 72, 'S'], ['lobber', 36, 50, 'W'], ['lobber', 84, 52, 'E'], ['scorcher', 44, 70, 'S'], ['scorcher', 78, 32, 'N'], ['launcher', 34, 62, 'W'], ['launcher', 86, 62, 'E'], ['launcher', 60, 30, 'N'], ['launcher', 60, 76, 'S'], ['husk', 50, 32, 'N'], ['husk', 70, 31, 'N'], ['husk', 50, 76, 'S'], ['husk', 70, 76, 'S'], ['husk', 38, 56, 'W'], ['husk', 82, 44, 'E'], ['lobber', 64, 34, 'N'], ['husk', 42, 44, 'W'], ['husk', 80, 64, 'E'], ['scorcher', 56, 80, 'S']]) add(t, x, y, 'terrace', sentry([f, 'S', 'E'], 6), { facing: f });
// outer camps (level 1) — the three intel points
for (const [grp, path, cx, cy] of [['campW', 'campW', 16, 58], ['campE', 'campE', 102, 68], ['campN', 'campN', 38, 12]]) {
  add('husk', cx, cy, grp, patrol(path, 'pingpong'));
  add('husk', cx + 2, cy + 2, grp, camp(grp + 'A'));
  add('lobber', cx - 2, cy + 3, grp, camp(grp + 'A'));
  add('husk', cx + 4, cy - 2, grp, sentry(['N', 'E', 'W'], 6), { facing: 'N' });
  add('warden', cx, cy + 5, grp, sentry(['S', 'W'], 6), { facing: 'S' });
  add('sniffer', cx + 1, cy + 4, grp, camp(grp + 'A'));
  add('scorcher', cx - 3, cy - 1, grp, sentry(['W'], 6), { facing: 'W' });
}
// jammer guards
for (const [x, y] of [[56, 10], [104, 48], [18, 90]]) { add('husk', x, y, 'jammers', sentry(['S', 'W', 'E'], 5), { facing: 'S' }); add('launcher', x + 3, y, 'jammers', sentry(['S'], 6), { facing: 'S' }); }
// the escape: south road, ash field, lava bridge
add('husk', 62, 108, 'south', patrol('southRoad', 'pingpong'));
add('husk', 63, 109, 'south', follow(UNITS[UNITS.length - 1].id, -1, 1));
add('husk', 20, 112, 'south', patrol('ashField', 'pingpong'));
add('lobber', 40, 120, 'south', sentry(['N', 'W'], 6), { facing: 'N' });
add('husk', 90, 116, 'south', sentry(['W', 'N'], 6), { facing: 'W' });
add('launcher', 100, 108, 'south', sentry(['N'], 6), { facing: 'N' });
// vehicles: Brutes, Crawlers, Skitters on the terrace roads
UNITS.push(U('br1', 'brute', 34, 78, 'terrace', patrol('bruteT', 'pingpong')));
UNITS.push(U('br2', 'brute', 88, 40, 'terrace', sentry(['E'], 8), { facing: 'E' }));
UNITS.push(U('br3', 'brute', 36, 36, 'terrace', sentry(['W'], 8), { facing: 'W' }));
UNITS.push(U('cr1', 'crawler', 44, 86, 'terrace', sentry(['S'], 8), { facing: 'S', passengers: 4 }));
UNITS.push(U('cr2', 'crawler', 78, 86, 'terrace', sentry(['S'], 8), { facing: 'S', passengers: 4 }));
UNITS.push(U('cr3', 'crawler', 60, 24, 'terrace', sentry(['N'], 8), { facing: 'N', passengers: 4 }));
UNITS.push(U('sk1', 'skitter', 36, 30, 'terrace', patrol('skitterT', 'pingpong')));
UNITS.push(U('sk2', 'skitter', 62, 112, 'south', sentry(['S'], 8), { facing: 'S' }));
UNITS.push(U('sk3', 'skitter', 104, 86, 'campE', sentry(['W'], 8), { facing: 'W' }));

const STRUCTURES = [
  { id: 'spire', type: 'hiveSpire', x: SPIRE.x, y: SPIRE.y, alertGroup: 'hive', hardened: true, shield: 'shield' },
  { id: 'shield', type: 'shieldGenerator', x: 50, y: 58, alertGroup: 'hive' },
  { id: 'jamN', type: 'jammer', x: 56, y: 6, alertGroup: 'powerNE' },
  { id: 'jamE', type: 'jammer', x: 104, y: 44, alertGroup: 'powerNE' },
  { id: 'jamS', type: 'jammer', x: 16, y: 88, alertGroup: 'jamS' },
  { id: 'plantNE', type: 'powerPlant', x: 92, y: 18, alertGroup: 'powerNE' },
  { id: 'barW', type: 'barracks', x: 30, y: 46, alertGroup: 'terrace' },
  { id: 'barE', type: 'barracks', x: 86, y: 56, alertGroup: 'terrace' },
  { id: 'vb1', type: 'vehicleBay', x: 36, y: 22, alertGroup: 'terrace', spawnOnAlarm: 'brute' },
  { id: 'vb2', type: 'vehicleBay', x: 78, y: 80, alertGroup: 'terrace', spawnOnAlarm: 'crawler' },
  { id: 'tu1', type: 'gunTurret', x: 48, y: 42, alertGroup: 'hive', facing: 'NW' },
  { id: 'tu2', type: 'gunTurret', x: 69, y: 42, alertGroup: 'hive', facing: 'NE' },
  { id: 'tu3', type: 'gunTurret', x: 48, y: 66, alertGroup: 'hive', facing: 'SW' },
  { id: 'tu4', type: 'gunTurret', x: 69, y: 66, alertGroup: 'hive', facing: 'SE' },
  { id: 'tw1', type: 'guardTower', x: 26, y: 30, alertGroup: 'terrace', facing: 'NW' },
  { id: 'tw2', type: 'guardTower', x: 94, y: 30, alertGroup: 'terrace', facing: 'NE' },
  { id: 'tw3', type: 'guardTower', x: 26, y: 78, alertGroup: 'terrace', facing: 'SW' },
  { id: 'tw4', type: 'guardTower', x: 94, y: 78, alertGroup: 'terrace', facing: 'SE' },
  { id: 'silo', type: 'silo', x: 40, y: 62, alertGroup: 'terrace' },
];

export function build() {
  const g = new MapGen(128, 128, 707, 'a');
  // badlands: ash, basalt ground, gravel, dead trees, crystal clusters
  g.each((x, y) => {
    const n = fbm(x * 0.07, y * 0.07, 3), m = fbm(x * 0.11, y * 0.11, 9);
    if (n > 0.62) g.set(x, y, { t: 'g' }); else if (m < 0.32) g.set(x, y, { t: 'p' });
  });
  g.scatter(0, 0, 128, 128, 0.02, { o: 'f' }, (x, y, c) => c.o === '.');
  g.scatter(0, 0, 128, 128, 0.012, { o: 'z' }, (x, y, c) => c.o === '.');
  g.scatter(0, 0, 128, 128, 0.02, { o: 'o' }, (x, y, c) => c.o === '.');
  // --- foothills (1), terrace (2), caldera (3)
  g.ellipse(60, 52, 50, 46, { e: 1 }, 0.18, 11);
  g.ellipse(60, 53, 35, 36, { e: 2 }, 0.14, 12);
  g.ellipse(58, 54, 13, 15, { e: 3 }, 0.08, 13);
  g.each((x, y, c) => { if (c.e === 3) g.set(x, y, { t: 'c', o: '.' }); if (c.e === 2 && c.o === 'o') g.set(x, y, { o: 'q' }); });
  // --- Ash Needle: a lone level-3 pillar 11 tiles east of the Spire, one narrow ramp
  g.ellipse(74.5, 52.5, 2.2, 3.2, { e: 3, t: 'p', o: '.' }, 0, 14);
  g.rect(71, 46, 2, 14, { e: 2, o: '.' });                 // a gap of terrace between caldera and needle
  g.ramp(74, 57, 'N', 1, 2); g.clear(73, 57, 3, 3);
  // --- caldera walls with two gates (N & S); the east rim is open cliff (the Needle looks in)
  g.each((x, y, c) => {
    if (c.e !== 3) return;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (g.e[y + dy]?.[x + dx] ?? 0) < 3);
    if (edge && x < 68 && !((x >= 57 && x <= 59) && (y < 45 || y > 63))) g.set(x, y, { o: 'v' });
  });
  // --- lava rivers: the southern river (road bridge + cooled-lava ford in the west) and a NW flow
  g.polyline([[-2, 101], [30, 100], [62, 103], [96, 100], [130, 102]], 5, { t: 'l', o: '.', e: 0 }, 2, 21);
  g.polyline([[-2, 30], [10, 38], [16, 50]], 3, { t: 'l', o: '.', e: 0 }, 1.5, 22);
  g.polyline([[118, -2], [112, 12], [108, 26]], 3, { t: 'l', o: '.' }, 1.5, 23);
  g.rect(10, 97, 5, 8, { t: 'p', o: '.' });                // the cooled-lava ford (west)
  // --- roads: the old road north from the bridge through the gates
  const road = (x, y) => (g.t[y]?.[x] === 'l' ? { o: 'h' } : { t: 'r', o: '.' });
  const R = [[124, 120], [96, 118], [62, 116], [62, 96], [62, 86], [58, 70], [58, 64]];
  g.polyline(R, 2.3, road, 0.6, 31);
  g.polyline([[58, 44], [58, 30], [60, 12]], 2.2, road, 0.6, 32);
  g.polyline([[62, 116], [30, 118], [4, 120]], 2, (x, y) => ({ t: 'r', o: '.' }), 1, 33);
  // ramps: 3 to level 2 (N, W, S road), 2 to level 3 (the gates), foothill ramps
  g.autoRamps(R, 2);
  g.autoRamps([[58, 44], [58, 30], [60, 12]], 2);
  g.autoRamps([[4, 56], [30, 52]], 2);                     // west approach
  g.autoRamps([[124, 60], [96, 58]], 2);                   // east approach
  // --- outer camps & jammer pads
  for (const [x, y] of [[12, 54], [98, 64], [34, 8], [54, 4], [102, 42], [14, 86]]) g.rect(x, y, 8, 7, { t: 'p', o: '.' });
  // supply cache (+1 designator) in the NE badlands
  g.clear(114, 36, 4, 4);
  // start (SE) & LZ (SW) clearings, south of the lava river
  g.clear(118, 114, 10, 12, 'a');
  g.clear(0, 114, 10, 12, 'a');
  for (const s of STRUCTURES) { const d = STRUCT_DEFS[s.type]; g.clear(s.x, s.y, d.w, d.h, 'c'); }
  return {
    id: 'm7', name: 'Hive Heart', kind: 'Final assault', biome: 'volcanic', size: { w: 128, h: 128 }, time: 'dusk', weather: null,
    tint: 'rgba(255,90,40,0.10)',
    ...g.layers(),
    structures: STRUCTURES,
    units: UNITS,
    friendlies: [],
    paths: PATHS,
    areas: {
      lz: { x: 1, y: 116, w: 7, h: 7 },
      intelW: { x: 12, y: 54, w: 8, h: 7 }, intelE: { x: 98, y: 64, w: 8, h: 7 }, intelN: { x: 34, y: 8, w: 8, h: 7 },
      campWA: { x: 12, y: 56, w: 8, h: 6 }, campEA: { x: 98, y: 66, w: 8, h: 6 }, campNA: { x: 34, y: 10, w: 8, h: 6 },
      caldera: { x: 45, y: 39, w: 27, h: 31 }, terrace: { x: 25, y: 17, w: 72, h: 72 },
      ashNeedle: { x: 72, y: 49, w: 5, h: 8 }, cache: { x: 114, y: 36, w: 4, h: 4 },
      vents: { x: 58, y: 86, w: 8, h: 30 },
    },
    alertGroups: {
      hive: { area: 'caldera' }, terrace: { barracks: 'barW', reinforceCap: 8, area: 'terrace' },
      powerNE: {}, jamS: {}, jammers: {}, campW: { area: 'intelW' }, campE: { area: 'intelE' }, campN: { area: 'intelN' }, south: {},
    },
    pickups: [{ type: 'designator', x: 115, y: 37 }, { type: 'ammo', x: 10, y: 80, amount: 10 }, { type: 'medkit', x: 110, y: 90 }, { type: 'c4', x: 22, y: 20 }],
    player: { x: 123, y: 120, facing: 'W', loadout: { rifle: 30, c4: 4, medkit: 2, designator: 2, smoke: 1 } },
    objectives: [
      { id: 'p1', type: 'OBSERVE', area: 'intelW', seconds: 4, primary: true, text: 'Recon: observe the western camp' },
      { id: 'p2', type: 'OBSERVE', area: 'intelE', seconds: 4, primary: true, text: 'Recon: observe the eastern camp' },
      { id: 'p3', type: 'OBSERVE', area: 'intelN', seconds: 4, primary: true, text: 'Recon: observe the northern camp' },
      { id: 'j1', type: 'CUSTOM', fn: 'jammerDown', arg: 'jamN', primary: true, hidden: true, text: 'Take Jammer North offline' },
      { id: 'j2', type: 'CUSTOM', fn: 'jammerDown', arg: 'jamE', primary: true, hidden: true, text: 'Take Jammer East offline' },
      { id: 'j3', type: 'CUSTOM', fn: 'jammerDown', arg: 'jamS', primary: true, hidden: true, text: 'Take Jammer South offline' },
      { id: 'b1', type: 'DESTROY', entities: ['shield'], primary: true, hidden: true, text: 'Breach: destroy the Shield Generator (C4)' },
      { id: 'k1', type: 'DESTROY', entities: ['spire'], primary: true, hidden: true, text: 'Strike: designate the Hive Spire' },
      { id: 'e1', type: 'EXTRACT', area: 'lz', primary: true, hidden: true, text: 'Escape to the south-west LZ' },
      { id: 's1', type: 'CUSTOM', fn: 'cacheFound', primary: false, text: 'Find the supply cache (+1 strike)' },
      { id: 's2', type: 'CUSTOM', fn: 'stealthBreach', primary: false, text: 'Stealth through the breach (no alarm)' },
    ],
    triggers: [],
    checkpoint: { when: 'shieldDown', note: 'after the shield is down' },
    briefing: { text: 'The Hive Spire coordinates every NOT army on the continent. It sits under a shield, behind three jammers, on top of a volcano. Two strikes are prepped. Make them count.', preview: { x: 64, y: 60, zoom: 0.25 } },
    par: 2100,
  };
}
