// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { falloff, explode } from '../src/combat/explosions.js';
import { World } from '../src/world/world.js';
import { EnemySystem } from '../src/ai/enemies.js';
import { CombatSystem } from '../src/combat/system.js';
import { StructureSystem } from '../src/entities/structure.js';
import { VehicleSystem } from '../src/entities/vehicle.js';
import { PropSystem } from '../src/entities/props.js';
import { BALANCE } from '../src/config/balance.js';

test('linear falloff: full at centre, 25 % at the edge, 0 beyond', () => {
  assert.equal(falloff(100, 2, 0), 100);
  assert.equal(falloff(100, 2, 2), 25);
  assert.equal(falloff(100, 2, 1), 62.5);
  assert.equal(falloff(100, 2, 2.01), 0);
});

function setup(extra = {}) {
  const w = 30, h = 20, row = (c) => c.repeat(w);
  const overlay = Array(h).fill(row('.'));
  if (extra.barrels) overlay[10] = row('.').slice(0, 10) + 'xx' + row('.').slice(12);
  const data = {
    id: 't', size: { w, h }, terrain: Array(h).fill(row('g')), elevation: Array(h).fill(row('0')), overlay,
    units: extra.units || [], structures: extra.structures || [], paths: {}, areas: {}, alertGroups: {},
    player: { x: 28, y: 18, facing: 'W', loadout: { rifle: 20 } },
  };
  const game = { app: { params: new URLSearchParams(), save: {} }, hud: { say() {}, toast() {} }, settings: {}, awareness: null, cam: { shake() {} } };
  game.world = new World(data, { seed: 5 });
  game.combat = new CombatSystem(game);
  game.vehicles = new VehicleSystem(game);
  game.structures = new StructureSystem(game);
  game.enemies = new EnemySystem(game);
  game.props = new PropSystem(game);
  return game;
}

test('damage multipliers: infantry ×1.0, vehicles ×0.7, buildings ×0.5', () => {
  const g = setup({
    units: [{ id: 'i', type: 'husk', x: 5, y: 5, alertGroup: 'a' }, { id: 'v', type: 'brute', x: 12, y: 5, alertGroup: 'a' }],
    structures: [{ id: 'b', type: 'barracks', x: 20, y: 4, alertGroup: 'a' }],
  });
  const inf = g.world.units.find((u) => u.id === 'i'), veh = g.world.units.find((u) => u.id === 'v');
  const bld = g.world.structures[0];
  explode(g.combat, inf.x, inf.y, 2, 40, {});
  assert.equal(inf.maxHp - inf.hp, 40);
  const vhp = veh.hp; explode(g.combat, veh.x, veh.y, 2, 100, {});
  assert.equal(vhp - veh.hp, 70);
  const bhp = bld.hp; explode(g.combat, bld.cx, bld.y + bld.h + 0.01, 2, 100, {});
  assert.ok(Math.abs((bhp - bld.hp) - 50) < 1, `building took ${bhp - bld.hp}`);
});

test('chain reaction: barrels in a blast detonate 0.2 s later', () => {
  const g = setup({ barrels: true });
  const [b1, b2] = g.world.props.filter((p) => p.kind === 'barrel');
  g.props.detonate(b1);
  assert.equal(b1.dead, true);
  assert.equal(b2.dead, false, 'not instantly');
  for (let t = 0; t < 0.15; t += 1 / 30) { g.props.update(1 / 30); g.combat.update(1 / 30); }
  assert.equal(b2.dead, false, 'still waiting at 0.15 s');
  for (let t = 0; t < 0.1; t += 1 / 30) { g.props.update(1 / 30); g.combat.update(1 / 30); }
  assert.equal(b2.dead, true, 'went off by 0.25 s');
});

test('fuel depot chains inside a blast', () => {
  const g = setup({ structures: [{ id: 'fd', type: 'fuelDepot', x: 10, y: 10, alertGroup: 'a' }] });
  explode(g.combat, 9, 11, BALANCE.explosions.barrel.radius, BALANCE.explosions.barrel.damage, {});
  for (let t = 0; t < 0.3; t += 1 / 30) g.combat.update(1 / 30);
  assert.equal(g.world.structures[0].dead, true);
});
