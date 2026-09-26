// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { NoiseIndicator, SPLASH } from '../src/ui/noise.js';
import { BALANCE } from '../src/config/balance.js';

function setup(terrainRow = 'g') {
  const w = 30, h = 10;
  const data = {
    id: 't', size: { w, h }, time: 'day', terrain: Array(h).fill(terrainRow.repeat(w)), elevation: Array(h).fill('0'.repeat(w)), overlay: Array(h).fill('.'.repeat(w)),
    units: [], structures: [], paths: {}, areas: {}, alertGroups: {}, friendlies: [], objectives: [], player: { x: 3, y: 5, facing: 'E', loadout: {} },
  };
  const game = /** @type {any} */ ({ world: new World(data, { seed: 1 }) });
  game.noise = new NoiseIndicator(game);
  return game;
}
const run = (g, secs) => { for (let t = 0; t < secs; t += 1 / 30) { g.world.time += 1 / 30; g.world.operative.update(1 / 30); g.noise.update(1 / 30); } };

test('noise meter: silent when still, QUIET running, rings mark each footstep', () => {
  const g = setup(), op = g.world.operative;
  assert.equal(g.noise.reading().word, 'SILENT');
  op.orderMove(25, 5, 'run');
  run(g, 1);
  const r = g.noise.reading();
  assert.equal(r.word, 'QUIET');
  assert.equal(r.lv, BALANCE.noise.run);
  assert.ok(g.noise.rings.length >= 1, 'footstep rings');
});

test('noise meter: wading is noisy even at a walk; the ring is splash-white', () => {
  const g = setup('w'), op = g.world.operative;
  op.orderMove(25, 5, 'walk');
  run(g, 1);
  assert.equal(g.noise.reading().lv, 3);
  assert.equal(g.noise.rings.at(-1)?.col, SPLASH);
});

test('a rifle shot reads VERY LOUD with a 12-tile ring, then fades; enemy gunfire draws no ring', () => {
  const g = setup(), op = g.world.operative;
  g.world.noise(op.x, op.y, BALANCE.noise.rifle, 'rifle', op);
  assert.equal(g.noise.reading().word, 'VERY LOUD');
  assert.equal(g.noise.rings.at(-1)?.r, 12);
  run(g, 1);
  assert.equal(g.noise.reading().lv, 12, 'the meter holds the true reach for a moment');
  run(g, 1);
  assert.equal(g.noise.reading().word, 'SILENT');
  assert.equal(g.noise.rings.length, 0);
  g.world.noise(10, 5, 8, 'enemyShot', {});
  assert.equal(g.noise.rings.length, 0);
});
