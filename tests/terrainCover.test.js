// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { TerrainTrails, coverKind } from '../src/render/terrainCover.js';

function setup(row) {
  const h = 6;
  const data = {
    id: 't', size: { w: row.length, h }, time: 'day', terrain: Array(h).fill(row), elevation: Array(h).fill('0'.repeat(row.length)), overlay: Array(h).fill('.'.repeat(row.length)),
    units: [], structures: [], paths: {}, areas: {}, alertGroups: {}, friendlies: [], objectives: [], player: { x: 1, y: 3, facing: 'E', loadout: {} },
  };
  const game = /** @type {any} */ ({ world: new World(data, { seed: 1 }) });
  game.trails = new TerrainTrails(game);
  return game;
}
const walk = (g, secs) => { for (let t = 0; t < secs; t += 1 / 30) { g.world.time += 1 / 30; g.world.operative.update(1 / 30); g.trails.update(1 / 30); } };

test('cover terrain: tall grass and shallow water hide the lower half; other ground does not', () => {
  const g = setup('gtwWg'), m = g.world.map;
  assert.deepEqual([0, 1, 2, 3, 4].map((x) => coverKind(m, x, 2)), [null, 'grass', 'water', null, null]);
});

test('WREN leaves a trail only in grass/water, a few tiles long, and it springs back', () => {
  const g = setup('g'.repeat(6) + 't'.repeat(26) + 'gg'), op = g.world.operative;
  op.orderMove(31, 3, 'walk');
  walk(g, 1);
  assert.equal(g.trails.pts.length, 0, 'no trail on plain ground');
  walk(g, 12);
  assert.ok(g.trails.pts.length > 0 && g.trails.pts.length <= 16, `${g.trails.pts.length} points`);
  assert.ok(g.trails.pts.every((p) => p.kind === 'grass'));
  op.stop();
  walk(g, 7);                                   // standing still: the grass springs back within 6 s
  assert.equal(g.trails.pts.length, 0);
});
