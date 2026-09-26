// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pathfinder } from '../src/world/pathfinding.js';
import { makeMap } from './helpers.js';

test('levels connect only through ramps', () => {
  // plateau on the right (level 1). Ramp at (4,2) pointing east.
  const elevation = ['00000111', '00000111', '00000111', '00000111', '00000111'];
  const overlay = ['........', '........', '........', '........', '........'];
  const noRamp = makeMap({ elevation, overlay });
  assert.equal(new Pathfinder(noRamp).find(0, 2, 7, 2, { partial: false }), null, 'cliff blocks without a ramp');
  const withRamp = makeMap({ elevation, overlay: ['........', '........', '....R...', '........', '........'] });
  assert.equal(withRamp.rampDir[2 * 8 + 4], 1, 'ramp points east (to the higher tile)');
  const p = new Pathfinder(withRamp).find(0, 2, 7, 2, { partial: false });
  assert.ok(p && p.length);
  assert.ok(p.some((t) => t.x === 4 && t.y === 2), 'path goes over the ramp');
});

test('cliff edge tiles (south/east faces) are impassable', () => {
  const m = makeMap({ elevation: ['1111', '1111', '0000'] });
  assert.equal(m.cliff[1 * 4 + 1], 1, 'south edge of the plateau is a cliff');
  assert.equal(m.walkable(1, 1), false);
  assert.equal(m.walkable(1, 0), true);
});

test('terrain cost preference: roads over forest', () => {
  const m = makeMap({
    terrain: ['gggggggggg', 'rrrrrrrrrr', 'gggggggggg'],
    overlay: ['FFFFFFFFFF', '..........', 'FFFFFFFFFF'],
  });
  const p = new Pathfinder(m).find(0, 0, 9, 0, { partial: false });
  assert.ok(p);
  assert.ok(p.filter((t) => t.y === 1).length >= 6, 'detours along the road');
});

test('vehicles cannot enter forest, swamp or deep water; bridges ok', () => {
  const m = makeMap({ terrain: ['gggWgg', 'gmgggg'], overlay: ['...h..', '..F...'] });
  const pf = new Pathfinder(m);
  assert.ok(pf.find(0, 0, 5, 0, { veh: true, partial: false }), 'bridge is drivable');
  assert.equal(m.vcost[1 * 6 + 1], Infinity, 'swamp');
  assert.equal(m.vcost[1 * 6 + 2], Infinity, 'forest');
  const m2 = makeMap({ terrain: ['gggWgg'] });
  assert.equal(new Pathfinder(m2).find(0, 0, 5, 0, { veh: true, partial: false }), null);
});

test('no diagonal corner cutting past obstacles', () => {
  const m = makeMap({ overlay: ['.o', 'o.'] });
  assert.equal(new Pathfinder(m).find(0, 0, 1, 1, { partial: false }), null);
});

test('distance field settles each tile once and matches A* costs (Mission 5 used to hang it)', { timeout: 10000 }, async () => {
  const { GameMap } = await import('../src/world/map.js');
  const data = (await import('../src/missions/data/m5.js')).default;
  const m = new GameMap(data);
  const pf = new Pathfinder(m);
  const { x, y } = data.player;
  const field = pf.field(x, y, 400);
  const reached = [];
  for (let i = 0; i < field.length; i++) if (field[i] < Infinity) reached.push(i);
  assert.ok(reached.length > 5000, `reached ${reached.length}`);
  for (let k = 0; k < 20; k++) {
    const i = reached[Math.floor((k + 0.5) * reached.length / 20)];
    const tx = i % m.w, ty = Math.floor(i / m.w);
    assert.ok(pf.find(x, y, tx, ty, { partial: false }), `A* reaches (${tx},${ty})`);
    assert.ok(Math.abs(pf.lastCost(i) - field[i]) < 0.05, `(${tx},${ty}) field ${field[i]} vs A* ${pf.lastCost(i)}`);
  }
});
