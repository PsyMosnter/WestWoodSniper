// @ts-check
/** Mission 1 — "First Light" (SPEC §16, Mission 1). Temperate river valley, 96×72. */
import { MapGen } from './lib.js';

const SCHEMATIC = [
  'X.ttTTTT..~~.....,,,TTTT',
  '..tTTTT...HH==O*..,,,.TT',
  '.tTTT.....~~..=...,*,,.T',
  'tTT..,,...~~..=....,,...',
  'TT..,,,...~~..=....1111.',
  'T..,,,....~~..=...11A*1.',
  '..,,,..tt.--..=...1/111.',
  '.,,,..tTT.~~..=....1111.',
  ',,...tTTT.~~..=.........',
  ',...tTTT..~~..==========',
  '...tTT....HH==O.....tTTT',
  '..tTT.oo..~~.......tTTTT',
  '.tTT..oo..~~.,,,..tTTTTT',
  'tTT.......~~.,,,,.TTTTTT',
  'TT...,,...~~..,,..TTTTTT',
  'T...,,,...~~.....TTTTTTT',
  'P..,,,,...~~....TTTTTTTT',
  '..,,,,....~~...TTTTTTTTT',
];

const P = (x, y, wait = 0, look = null) => (look ? { x, y, wait, look } : wait ? { x, y, wait } : { x, y });
// Patrol loops are 30–120 s and neighbouring patrols have different periods (SPEC §16.4 rule 4).
const PATHS = {
  // the hilltop loop keeps to the south half so the goat trail (north face) has a quiet top
  hillLoop: [P(77, 24, 3, 'W'), P(86, 24, 3, 'E'), P(88, 27, 3, 'SE'), P(78, 29, 4, 'S')],
  keshLoop: [P(59, 5, 3, 'W'), P(62, 3, 2, 'N'), P(67, 6, 4, 'E'), P(62, 8, 2, 'S')],
  // the spore loop keeps to the north edge: the tall grass south of the field is the observer's seat
  sporeLoop: [P(69, 4, 3, 'W'), P(83, 4, 2, 'N'), P(84, 7, 3, 'E'), P(70, 7, 4, 'N')],
  southLoop: [P(59, 39, 3, 'W'), P(63, 39, 2, 'N'), P(64, 43, 3, 'E'), P(59, 43, 2, 'S')],
  // the road walker guards the obvious way up (the track to the west ramp), not the whole road:
  // north of y 18 the road is only swept by the Skitter's slow round trips
  roadNS: [P(57, 24, 6, 'E'), P(57, 36, 6, 'S')],
  roadE: [P(61, 37, 3, 'W'), P(91, 37, 3, 'E')],
  // the east-bank walkers stay out of rifle earshot (12 tiles) of the west-bank spit, so the tutorial's
  // first shot doesn't bring a search party across, and clear of the ford once its sentry is down
  eastBankN: [P(50, 10, 4, 'W'), P(50, 14, 5, 'W')],
  eastBankS: [P(50, 36, 5, 'W'), P(50, 39, 3, 'SW')],
  hillFoot: [P(67, 27, 3, 'W'), P(67, 33, 3, 'SW')],
  skitterNS: [P(57, 9, 14, 'N'), P(57, 40, 12, 'S')],
  skitterE: [P(60, 37, 4, 'W'), P(93, 37, 6, 'E')],
};
const U = (id, type, x, y, group, behaviour, extra = {}) => ({ id, type, x, y, alertGroup: group, behaviour, ...extra });
const sentry = (facings, interval = 5) => ({ kind: 'sentry', facings, interval });
const patrol = (path, mode = 'loop') => ({ kind: 'patrol', path, mode });
const camp = (area) => ({ kind: 'camp', area });
const UNITS = [
  // the lone sentry at the ford — the tutorial's first scope shot
  U('ford1', 'husk', 49, 25, 'ford', sentry(['W', 'SW', 'NW'], 5), { facing: 'W', important: true, name: 'Ford Sentry' }),
  // Cherry Hill radio outpost
  U('h1', 'husk', 73, 24, 'hill', sentry(['W', 'SW'], 6), { facing: 'W' }),
  U('h2', 'husk', 74, 28, 'hill', sentry(['SW', 'W', 'S'], 4), { facing: 'SW' }),
  U('h3', 'husk', 76, 20, 'hill', patrol('hillLoop')),
  U('h4', 'lobber', 82, 22, 'hill', camp('hillCamp')),
  U('h5', 'husk', 85, 20, 'hill', sentry(['E', 'NE', 'N'], 6), { facing: 'E' }),
  U('hf1', 'husk', 67, 21, 'hill', patrol('hillFoot', 'pingpong')),
  U('tr1', 'husk', 64, 25, 'hill', sentry(['W', 'NW', 'SW'], 6), { facing: 'W' }),
  // Motor pool at the north bridge — Warden Kesh
  U('kesh', 'warden', 59, 5, 'motorpool', patrol('keshLoop'), { important: true, name: 'Warden Kesh' }),
  U('m1', 'husk', 51, 4, 'motorpool', sentry(['W', 'NW'], 5), { facing: 'W' }),
  U('m2', 'husk', 51, 8, 'motorpool', sentry(['W', 'SW'], 6), { facing: 'W' }),
  U('m3', 'husk', 61, 6, 'motorpool', camp('mpCamp')),
  U('m4', 'lobber', 67, 4, 'motorpool', sentry(['E', 'NE'], 6), { facing: 'E' }),
  U('m5', 'husk', 65, 6, 'motorpool', camp('mpCamp')),
  // Spore field
  U('hv1', 'harvester', 72, 7, 'spore', camp('sporeField')),
  U('hv2', 'harvester', 77, 9, 'spore', camp('sporeField')),
  U('hv3', 'harvester', 80, 6, 'spore', camp('sporeField')),
  U('s1', 'husk', 69, 4, 'spore', patrol('sporeLoop')),
  U('s2', 'husk', 83, 9, 'spore', sentry(['NW', 'N', 'E'], 5), { facing: 'N' }),
  // South outpost at the south bridge
  U('w2', 'warden', 59, 39, 'south', patrol('southLoop')),
  U('so1', 'husk', 51, 40, 'south', sentry(['W', 'NW'], 5), { facing: 'W' }),
  U('so2', 'husk', 51, 43, 'south', sentry(['W', 'SW'], 7), { facing: 'W' }),
  U('so3', 'husk', 61, 41, 'south', camp('southCamp')),
  U('so4', 'lobber', 63, 45, 'south', sentry(['S', 'SW'], 6), { facing: 'S' }),
  // Road patrols (pairs) and east-bank watchers
  U('r1', 'husk', 57, 24, 'road', patrol('roadNS', 'pingpong')),
  U('r3', 'husk', 61, 37, 'road', patrol('roadE', 'pingpong')),
  U('r4', 'husk', 62, 38, 'road', { kind: 'follow', leader: 'r3', dx: -1.2, dy: -1 }),
  U('e1', 'husk', 50, 10, 'road', patrol('eastBankN', 'pingpong')),
  U('e2', 'husk', 50, 36, 'road', patrol('eastBankS', 'pingpong')),
  U('rs1', 'husk', 80, 34, 'road', sentry(['N', 'W', 'E'], 6), { facing: 'N' }),
  U('l1', 'lobber', 90, 35, 'road', camp('eastCamp')),
  // vehicles: two Skitter road patrols, a Hauler and a Skitter parked at the motor pool
  U('sk1', 'skitter', 57, 9, 'road', patrol('skitterNS', 'pingpong')),
  U('sk2', 'skitter', 60, 37, 'road', patrol('skitterE', 'pingpong')),
  U('hl1', 'hauler', 60, 7, 'motorpool', sentry(['W']), { facing: 'W', passengers: 0 }),
  U('sk3', 'skitter', 66, 1, 'motorpool', sentry(['E']), { facing: 'E' }),
];

export function build() {
  const g = new MapGen(96, 72, 101, 'g');
  g.schematic(SCHEMATIC, 4, {
    '.': null,
    ',': { t: 't' },
    't': (x, y, r) => r.chance(0.5) ? { o: 'f' } : r.chance(0.12) ? { o: 'j' } : null,
    'T': (x, y, r) => r.chance(0.86) ? { o: 'F' } : { o: 'f' },
    'o': (x, y, r) => r.chance(0.3) ? { o: 'o' } : r.chance(0.3) ? { o: 'q' } : null,
  }, 4.5);

  // --- Cherry Hill (level 1) and the west-bank overwatch knoll
  g.ellipse(81, 24, 10, 7.5, { e: 1 }, 0.35, 21);
  g.ellipse(31, 21, 5.5, 4.2, { e: 1 }, 0.25, 22);
  g.each((x, y, c) => { if (c.e === 1 && c.o === 'F') g.set(x, y, { o: 'f' }); });
  // hilltop clearing for the outpost
  g.clear(76, 18, 12, 10);

  // --- River Varna (deep, meandering) with shallow banks
  const river = [[44, -2], [43, 10], [45, 22], [43, 34], [44, 48], [43, 60], [44, 74]];
  g.polyline(river, 9, { t: 'w', o: '.', e: 0 }, 2.5, 31);
  g.polyline(river, 6, { t: 'W', o: '.', e: 0 }, 2.5, 31);
  g.roughenWater();
  // ford (centre): a shallow crossing, a west-bank spit with scrub for the tutorial's first shot,
  // and a dry east shore where the lone sentry stands (7 tiles across — inside crouch range 8)
  g.ellipse(45, 25.5, 4.5, 2.2, { t: 'w', o: '.' }, 0.2, 33);
  g.ellipse(39.5, 25.5, 3.2, 3.2, { t: 'g', o: '.', e: 0 }, 0.15, 34);
  g.set(41, 24, { o: 'j' }); g.set(40, 27, { o: 'j' }); g.set(41, 26, { t: 't' }); g.set(42, 25, { t: 't' }); g.set(42, 26, { t: 't' }); g.set(41, 25, { t: 't' });
  g.rect(49, 23, 3, 5, { t: 'g', o: '.', e: 0 });

  // --- Roads (east bank) & tracks
  const wet = (x, y) => g.inb(x, y) && (g.t[y][x] === 'W' || g.t[y][x] === 'w');
  const road = (x, y) => wet(x, y) ? { o: 'h' } : { t: 'r', o: '.' };
  const track = (x, y) => wet(x, y) ? null : { t: 'd', o: '.' };
  g.polyline([[36, 5.5], [57.5, 5.5], [57.5, 37.5], [97, 37.5]], 2.2, road);
  g.polyline([[36, 41.5], [57.5, 41.5], [57.5, 37.5]], 2.2, road);
  g.polyline([[57.5, 25.5], [69, 25.5]], 1.6, track);
  // west-bank tracks
  g.polyline([[36, 41.5], [28, 44], [20, 52], [10, 60], [4, 66]], 1.6, track, 1.2, 41);
  g.polyline([[36, 5.5], [28, 9], [20, 10]], 1.4, track, 1, 42);

  // ramps: Cherry Hill west ramp (main), goat trail from the north; knoll ramp
  g.clear(66, 24, 6, 4);
  g.ramp(70, 25, 'E', 2, 0);
  // the quieter goat trail: a one-tile ramp up the north face into the plateau interior
  g.clear(78, 11, 5, 6);
  g.ramp(80, 16, 'S', 1, 0);
  g.set(80, 17, { o: '.' }); g.set(80, 18, { o: '.' });
  // scrub on the plateau's north side: concealment for a quiet observer
  for (const [x, y] of [[78, 18], [82, 18], [77, 19], [83, 17]]) g.set(x, y, { o: 'j' });
  g.ellipse(80, 13, 4, 2.5, { t: 't' }, 0.2, 23);
  g.ramp(25, 21, 'E', 1, 0);
  g.clear(22, 20, 4, 3);

  // --- Motor pool (objective B) at the north bridge
  g.rect(59, 1, 10, 9, { t: 'c', o: '.' });
  g.rect(58, 1, 1, 9, { t: 'c' });
  g.scatter(59, 1, 10, 9, 0.02, { o: 'k' }, (x, y, c) => c.o === '.');
  for (const [x, y] of [[60, 2], [61, 2], [66, 8], [67, 8]]) g.set(x, y, { o: 'k' });
  for (let x = 62; x <= 65; x++) g.set(x, 9, { o: 'b' });
  g.set(68, 2, { o: 'x' }); g.set(68, 3, { o: 'x' });

  // --- Spore field (objective C) in tall grass with crystal clusters
  g.ellipse(76, 8.5, 8, 4.5, { t: 't' }, 0.3, 51);
  for (const [x, y] of [[73, 7], [78, 6], [80, 10], [75, 11], [71, 9], [82, 8]]) g.set(x, y, { o: 'z' });

  // --- Cherry Hill outpost (objective A): radio mast area
  g.rect(79, 19, 7, 6, { t: 'c' });
  for (let x = 79; x <= 85; x++) if (x !== 82) g.set(x, 25, { o: 'b' });

  // --- South outpost at the south bridge
  g.rect(59, 39, 6, 5, { t: 'd' });
  g.set(60, 44, { o: 'b' }); g.set(61, 44, { o: 'b' }); g.set(62, 44, { o: 'b' });
  g.set(64, 39, { o: 'k' }); g.set(64, 40, { o: 'x' });

  // LZ clearing (NW) and player start clearing (SW)
  g.clear(0, 0, 8, 8, 'g');
  g.clear(0, 63, 7, 8);

  // wreck & props for flavour
  g.set(52, 30, { o: 'y' });
  g.set(20, 30, { o: 'q' }); g.set(21, 31, { o: 'q' });

  const layers = g.layers();
  return {
    id: 'm1',
    name: 'First Light',
    kind: 'Reconnaissance · tutorial',
    biome: 'temperate',
    size: { w: 96, h: 72 },
    time: 'day',
    weather: null,
    ...layers,
    structures: [
      { id: 'radio1', type: 'commsArray', x: 82, y: 20, alertGroup: 'hill' },
      { id: 'tower1', type: 'guardTower', x: 80, y: 22, alertGroup: 'hill' },
      { id: 'bx1', type: 'barracks', x: 64, y: 3, alertGroup: 'motorpool' },
      { id: 'nest1', type: 'mgNest', x: 61, y: 45, alertGroup: 'south' },
    ],
    units: UNITS,
    friendlies: [],
    paths: PATHS,
    areas: {
      lz: { x: 1, y: 1, w: 5, h: 5 },
      obsA: { x: 79, y: 19, w: 7, h: 6 },
      obsB: { x: 59, y: 1, w: 10, h: 9 },
      obsC: { x: 70, y: 5, w: 13, h: 8 },
      tut_ford: { x: 32, y: 21, w: 11, h: 9 },
      tut_grass: { x: 6, y: 56, w: 16, h: 15 },
      tut_knoll: { x: 26, y: 17, w: 10, h: 9 },
      start: { x: 0, y: 62, w: 8, h: 9 },
      hillCamp: { x: 80, y: 21, w: 5, h: 3 },
      baseHill: { x: 71, y: 17, w: 20, h: 14 },
      baseMotorpool: { x: 52, y: 0, w: 18, h: 11 },
      baseSouth: { x: 52, y: 38, w: 14, h: 9 },
      mpCamp: { x: 60, y: 5, w: 6, h: 3 },
      sporeField: { x: 70, y: 5, w: 12, h: 7 },
      southCamp: { x: 60, y: 40, w: 4, h: 3 },
      eastCamp: { x: 87, y: 33, w: 6, h: 3 },
    },
    alertGroups: {
      hill: { barracks: null, reinforceCap: 0, area: 'baseHill' },
      motorpool: { barracks: 'bx1', reinforceCap: 6, area: 'baseMotorpool' },
      south: { barracks: null, reinforceCap: 0, area: 'baseSouth' },
      spore: { barracks: null, reinforceCap: 0 },
      ford: { barracks: null, reinforceCap: 0 },
      road: { barracks: null, reinforceCap: 0 },
    },
    pickups: [
      { type: 'ammo', x: 21, y: 32, amount: 10 },
    ],
    player: { x: 3, y: 66, facing: 'N', loadout: { rifle: 20, c4: 0, medkit: 1, designator: 0, smoke: 1 } },
    enemyDamageMult: 0.75, // tutorial mission: gentler enemy fire (DECISIONS.md)
    objectives: [
      { id: 'o1', type: 'OBSERVE', area: 'obsA', seconds: 4, primary: true, text: 'Observe the radio outpost on Cherry Hill' },
      { id: 'o2', type: 'OBSERVE', area: 'obsB', seconds: 4, primary: true, text: 'Observe the motor pool at the north bridge' },
      { id: 'o3', type: 'OBSERVE', area: 'obsC', seconds: 4, primary: true, text: 'Observe the spore field' },
      { id: 'o4', type: 'EXTRACT', area: 'lz', primary: true, hidden: true, text: 'Extract at the NW landing zone' },
      { id: 's1', type: 'KILL', unit: 'kesh', primary: false, text: 'Kill Warden Kesh' },
      { id: 's2', type: 'STEALTH', primary: false, text: 'No base alarm' },
    ],
    triggers: [],
    briefing: {
      text: "The NOT have crossed the Varna River. We don't know how many. WREN, find out and get out. No heroics.",
      preview: { x: 48, y: 36, zoom: 0.25 },
    },
    par: 900,
  };
}
