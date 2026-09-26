// @ts-check
/** 128×128 stress/test map (SPEC §20 M1 acceptance): every terrain, 3 elevation levels, ramps, forests. */
import { MapGen } from './lib.js';
import { fbm } from '../../src/core/rng.js';

export function build() {
  const g = new MapGen(128, 128, 7, 'g');
  g.each((x, y) => {
    const n = fbm(x * 0.06, y * 0.06, 3);
    const m = fbm(x * 0.1, y * 0.1, 9);
    if (n > 0.62) g.set(x, y, { o: 'F' });
    else if (n > 0.56) g.set(x, y, { o: g.rng.chance(0.5) ? 'f' : '.' });
    if (m > 0.66) g.set(x, y, { t: 't' });
    else if (m < 0.28) g.set(x, y, { t: 'd' });
  });
  g.ellipse(40, 40, 18, 14, { e: 1 }, 0.3, 1);
  g.ellipse(42, 40, 10, 8, { e: 2 }, 0.3, 2);
  g.ellipse(43, 40, 4, 3, { e: 3 }, 0.2, 3);
  g.ellipse(95, 90, 16, 12, { e: 1 }, 0.3, 4);
  g.each((x, y, c) => { if (c.e >= 2 && c.o === 'F') g.set(x, y, { o: 'f' }); });
  g.ramp(21, 40, 'E', 2, 0);
  g.ramp(31, 40, 'E', 2, 1);
  g.ramp(38, 40, 'E', 1, 2);
  g.ramp(95, 102, 'N', 2, 0);
  const river = [[70, -2], [66, 30], [72, 64], [64, 100], [68, 130]];
  g.polyline(river, 10, { t: 'w', o: '.', e: 0 }, 3, 5);
  g.polyline(river, 7, { t: 'W', o: '.', e: 0 }, 3, 5);
  g.polyline([[0, 70], [128, 72]], 2.2, (x, y) => (g.t[y]?.[x] === 'W' || g.t[y]?.[x] === 'w') ? { o: 'h' } : { t: 'r', o: '.' });
  g.rect(10, 100, 20, 12, { t: 'n', o: '.' });
  g.rect(34, 100, 12, 12, { t: 'm', o: '.' });
  g.rect(50, 108, 10, 10, { t: 'c', o: '.' });
  g.rect(100, 10, 14, 10, { t: 's', o: '.' });
  g.rect(100, 24, 10, 8, { t: 'l', o: '.' });
  g.rect(112, 24, 10, 8, { t: 'a', o: '.' });
  g.rect(100, 36, 10, 8, { t: 'i', o: '.' });
  g.rect(112, 36, 10, 8, { t: 'p', o: '.' });
  for (let x = 50; x < 60; x++) g.set(x, 106, { o: 'v' });
  for (let x = 50; x < 60; x += 2) g.set(x, 118, { o: 'b' });
  g.scatter(80, 20, 20, 20, 0.05, { o: 'o' });
  g.clear(4, 118, 6, 6);
  // live-fire range near the start: a small NOT outpost for C4 / vehicle / power tests
  g.rect(12, 104, 30, 18, { t: 'c', o: '.', e: 0 });
  g.clear(10, 100, 36, 24);
  g.polyline([[8, 112], [44, 112]], 2, { t: 'r', o: '.' });
  return {
    id: 'test', name: 'Test Range', biome: 'temperate', size: { w: 128, h: 128 }, time: 'day', weather: null,
    ...g.layers(),
    structures: [
      { id: 'pp', type: 'powerPlant', x: 14, y: 104, alertGroup: 'range' },
      { id: 'tur', type: 'gunTurret', x: 22, y: 106, alertGroup: 'range', facing: 'S' },
      { id: 'bar', type: 'barracks', x: 26, y: 104, alertGroup: 'range' },
      { id: 'fd', type: 'fuelDepot', x: 32, y: 105, alertGroup: 'range' },
      { id: 'tw', type: 'guardTower', x: 38, y: 108, alertGroup: 'range', facing: 'W' },
      { id: 'mg', type: 'mgNest', x: 18, y: 116, alertGroup: 'range', facing: 'W' },
      { id: 'cm', type: 'commsArray', x: 36, y: 115, alertGroup: 'range' },
    ],
    units: [
      { id: 'b1', type: 'brute', x: 40, y: 112, alertGroup: 'range', behaviour: { kind: 'patrol', path: 'rd', mode: 'pingpong' } },
      { id: 'k1', type: 'skitter', x: 30, y: 112, alertGroup: 'range', behaviour: { kind: 'sentry' }, facing: 'W' },
      { id: 'c1', type: 'crawler', x: 24, y: 113, alertGroup: 'range', behaviour: { kind: 'sentry' }, facing: 'W', passengers: 4 },
      { id: 'fh', type: 'fuelHauler', x: 34, y: 113, alertGroup: 'range', behaviour: { kind: 'sentry' }, facing: 'W' },
      { id: 'g1', type: 'husk', x: 28, y: 109, alertGroup: 'range', behaviour: { kind: 'sentry', facings: ['S', 'W'] } },
      { id: 'g2', type: 'scorcher', x: 20, y: 110, alertGroup: 'range', behaviour: { kind: 'sentry', facings: ['W'] } },
      { id: 'g3', type: 'launcher', x: 33, y: 110, alertGroup: 'range', behaviour: { kind: 'sentry', facings: ['SW'] } },
      { id: 'g4', type: 'sniffer', x: 16, y: 112, alertGroup: 'range', behaviour: { kind: 'camp' } },
    ],
    friendlies: [], paths: { rd: [{ x: 40, y: 112, wait: 3 }, { x: 12, y: 112, wait: 3 }] },
    areas: { lz: { x: 4, y: 4, w: 4, h: 4 }, range: { x: 12, y: 104, w: 30, h: 18 } },
    alertGroups: { range: { barracks: 'bar', reinforceCap: 4, area: 'range' } }, pickups: [{ type: 'ammo', x: 8, y: 118, amount: 10 }, { type: 'c4', x: 9, y: 118 }],
    player: { x: 6, y: 120, facing: 'N', loadout: { rifle: 30, c4: 4, medkit: 2, designator: 2, smoke: 1 } },
    objectives: [{ id: 'o1', type: 'REACH', area: 'lz', primary: true, text: 'Reach the test LZ' }],
    triggers: [], briefing: { text: 'Test range.', preview: { x: 64, y: 64, zoom: 0.2 } }, par: 600,
  };
}
