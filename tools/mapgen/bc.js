// @ts-check
/**
 * Boot Camp (playtest 2) — the optional ~3-minute training course before Mission 1, run by Lt. Idris Vale.
 * A 58×34 GOD training range (in a 72×42 map: forest margins), west to east: walk → run → tall-grass field (dummy d1 watching it) →
 * fenced crawl lane (dummy d2 watching it through the fence) → sentry d3 with his back turned (takedown) →
 * parked Skitter (shoot the driver, then C4) → hut by the south fence (C4). Script: src/missions/bc.js.
 */
import { MapGen } from './lib.js';

export function build() {
  // the course sits in the west 58×34; forest margins east and south let the camera centre the east-side
  // stations clear of the HUD (the view can't scroll far past a map edge)
  const W = 72, H = 42;
  const g = new MapGen(W, H, 404, 'g');

  // tree line round the range (looks like a clearing in the West Wood), thinner inside
  g.each((x, y) => {
    const edge = Math.min(x, y, 57 - x, 35 - y);
    if (x > 57 || y > 35) g.set(x, y, { o: g.rng.chance(0.8) ? 'F' : 'f' });
    else if (edge < 2) g.set(x, y, { o: 'F' });
    else if (edge < 3 && g.rng.chance(0.55)) g.set(x, y, { o: 'f' });
  });

  // start clearing and the track east (walk & run stations)
  g.clear(2, 14, 8, 9);
  g.polyline([[3, 18.5], [24, 18.5]], 2, { t: 'd' });
  // the field of tall grass; its east lobe reaches the crawl lane's mouth
  g.ellipse(30.5, 18, 6.5, 7, { t: 't' }, 0.25, 21);
  g.rect(33, 19, 4, 5, { t: 't' });

  // the crawl lane: wall to the north, fence to the south (the dummy behind it sees through a fence)
  for (let x = 37; x <= 46; x++) { g.set(x, 22, { o: 'v', t: 'g' }); g.set(x, 26, { o: 'e', t: 'g' }); }
  g.rect(37, 23, 10, 3, { t: 'g', o: '.' });
  g.clear(38, 27, 9, 3);
  // …and he stands in a walled pen, so there is no strolling round behind him instead of crawling the lane
  for (let x = 37; x <= 47; x++) g.set(x, 30, { o: 'v', t: 'g' });
  for (let y = 26; y <= 30; y++) { g.set(37, y, { o: 'v', t: 'g' }); g.set(47, y, { o: 'v', t: 'g' }); }
  // a raised watch platform (one level up = one more tile of sight): walking the lane is in his reach for
  // ~7 tiles, a low crawl stays out of it (see tests/bootcamp.test.js)
  g.level(38, 27, 9, 4, 1);           // (its south row is the cliff face)
  g.rect(38, 27, 9, 3, { t: 'c' });
  // no way round the north of the lane: a boulder spill from the wall to the tree line
  for (let y = 0; y <= 21; y++) g.set(46, y, { o: y % 3 === 0 ? 'q' : 'o' });
  for (let x = 37; x <= 46; x++) g.set(x, 21, { o: 'o' });

  // …nor round the south of the pen: its east wall runs on to the tree line
  for (let y = 30; y < H; y++) g.set(47, y, { o: 'v', t: 'g' });

  // takedown yard, motor pool and the hut (east), concrete pad for the Skitter
  g.clear(48, 15, 9, 19);
  g.rect(49, 29, 7, 4, { t: 'c' });
  for (const [x, y] of [[48, 29], [48, 32], [56, 28]]) g.set(x, y, { o: 'k' });

  // the hut at the top of the yard (C4 on a building) with a sandbag ring
  g.rect(49, 15, 7, 4, { t: 'd' });
  for (const [x, y] of [[49, 18], [55, 18]]) g.set(x, y, { o: 'b' });
  // a sandbag firing point south of the field (flavour)
  g.clear(25, 26, 12, 8);
  for (const [x, y] of [[26, 28], [27, 28], [28, 28]]) g.set(x, y, { o: 'b' });

  // a few crates and targets along the track
  for (const [x, y] of [[13, 15], [14, 15], [17, 22], [8, 22]]) g.set(x, y, { o: 'k' });

  const layers = g.layers();
  return {
    id: 'bc',
    name: 'Boot Camp',
    kind: 'Training · optional',
    biome: 'temperate',
    size: { w: W, h: H },
    time: 'day',
    weather: null,
    ...layers,
    radioName: 'LT. VALE',
    alwaysTips: true,
    revealMap: true,
    training: true,        // no autosaves, no 'Objective complete.' radio chatter (Vale has his own lines)
    structures: [
      { id: 'hut', type: 'barracks', x: 51, y: 15, alertGroup: 'range' },
    ],
    units: [
      { id: 'd1', type: 'husk', x: 39, y: 18, alertGroup: 'range', facing: 'W', behaviour: { kind: 'sentry' }, training: true },
      { id: 'd2', type: 'husk', x: 42, y: 29, alertGroup: 'range', facing: 'N', behaviour: { kind: 'sentry' }, training: true },
      { id: 'd3', type: 'husk', x: 53, y: 23, alertGroup: 'range', facing: 'E', behaviour: { kind: 'sentry' }, training: true },
      { id: 'sk', type: 'skitter', x: 52, y: 31, alertGroup: 'range', facing: 'E', behaviour: { kind: 'sentry' }, training: true },
    ],
    friendlies: [],
    paths: {},
    areas: {
      mA: { x: 9, y: 17, w: 3, h: 3 },
      mB: { x: 20, y: 17, w: 3, h: 3 },
      mC: { x: 34, y: 20, w: 3, h: 3 },
      mD: { x: 47, y: 22, w: 2, h: 4 },
      start: { x: 2, y: 15, w: 5, h: 7 },
    },
    alertGroups: { range: { barracks: null, reinforceCap: 0 } },
    pickups: [],
    player: { x: 4, y: 18, facing: 'E', loadout: { rifle: 15, c4: 3, medkit: 0, designator: 0, smoke: 0 } },
    objectives: [
      { id: 'b1', type: 'REACH', area: 'mA', primary: true, marker: true, text: 'Walk to the marker' },
      { id: 'b2', type: 'CUSTOM', fn: 'ranToB', area: 'mB', primary: true, marker: true, hidden: true, text: 'Run to the next marker' },
      { id: 'b3', type: 'REACH', area: 'mC', primary: true, marker: true, hidden: true, text: 'Cross the tall grass unseen' },
      { id: 'b4', type: 'REACH', area: 'mD', primary: true, marker: true, hidden: true, text: 'Crawl down the lane unseen' },
      { id: 'b5', type: 'CUSTOM', fn: 'tookDown', primary: true, hidden: true, text: 'Silent takedown on the sentry' },
      { id: 'b6', type: 'CUSTOM', fn: 'skitterDisabled', primary: true, hidden: true, text: 'Shoot the Skitter\'s driver' },
      { id: 'b7', type: 'DESTROY', entity: 'sk', primary: true, hidden: true, text: 'C4 the disabled Skitter' },
      { id: 'b8', type: 'DESTROY', entity: 'hut', primary: true, hidden: true, text: 'C4 the hut' },
    ],
    triggers: [],
    briefing: {
      text: "Name's Idris Vale, GOD air wing. I fly the dropships — today I'm also your drill sergeant. Three minutes on my range: move, hide, crawl, knife, scope, C4. The dummies don't shoot back. The NOT will.",
      preview: { x: 30, y: 18, zoom: 0.4 },
    },
    par: 240,
  };
}
