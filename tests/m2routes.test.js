// @ts-check
// Mission 2 ways in (playtest): cracked rock → C4 ramp, generator-fed gate turrets, goat path to the base.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import m2 from '../src/missions/m2.js';
import { World } from '../src/world/world.js';
import { CombatSystem } from '../src/combat/system.js';
import { StructureSystem } from '../src/entities/structure.js';
import { VehicleSystem } from '../src/entities/vehicle.js';
import { EnemySystem } from '../src/ai/enemies.js';

function setup() {
  const said = [];
  const game = {
    app: { params: new URLSearchParams(), save: {}, persist() {} }, settings: {}, awareness: null, cam: { shake() {} },
    hud: { say(t) { said.push(t); }, toast() {}, peekObjectives() {} }, said,
  };
  game.world = new World(m2, { seed: 7 });
  game.combat = new CombatSystem(game);
  game.vehicles = new VehicleSystem(game);
  game.structures = new StructureSystem(game);
  game.enemies = new EnemySystem(game);
  return game;
}
const reach = (g, x, y) => g.world.pf.field(m2.player.x, m2.player.y, 1e5)[g.world.map.idx(x, y)] < Infinity;

test('M2: C4 on the cracked canyon rock opens a ramp onto the mesa top', () => {
  const g = setup(), m = g.world.map;
  assert.equal(m.breach[m.idx(46, 24)], 1);
  assert.equal(m.canStep(45, 24, 46, 24), false, 'rock blocks before the blast');
  g.structures.blastBreach(46, 24);
  assert.equal(m.breach[m.idx(46, 25)], 0, 'both cracked tiles go');
  assert.ok(m.canStep(45, 24, 46, 24) && m.canStep(46, 24, 47, 24), 'canyon → ramp → mesa top');
  assert.ok(reach(g, 48, 24));
  assert.deepEqual(g.world.breached, [[46, 24]], 'remembered for saves');
});

test('M2: the goat path reaches the base from the north plain', () => {
  const g = setup(), m = g.world.map;
  assert.ok(m.canStep(58, 3, 58, 4), 'north ramp climbs onto the shelf');
  const f = g.world.pf.field(58, 1, 1e5);
  assert.ok(f[m.idx(70, 13)] < Infinity, 'shelf → goat path → ramp → base');
});

test('M2: blowing the generator blinds the gate turrets but not the plant', () => {
  const g = setup();
  const s = (id) => g.world.structures.find((q) => q.id === id);
  g.structures.update(1 / 30);
  assert.ok(!s('tu1').st.unpowered && !s('tu2').st.unpowered);
  g.structures.destroy(s('gen'), { by: 'c4' });
  g.structures.update(1 / 30);
  assert.ok(s('tu1').st.unpowered && s('tu2').st.unpowered, 'turrets dark');
  assert.ok(!s('pp').dead);
});
