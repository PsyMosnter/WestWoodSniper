// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { EnemySystem } from '../src/ai/enemies.js';
import { CombatSystem } from '../src/combat/system.js';
import { StructureSystem } from '../src/entities/structure.js';
import { VehicleSystem } from '../src/entities/vehicle.js';
import { PropSystem } from '../src/entities/props.js';
import { C4System } from '../src/combat/c4.js';
import { MissionRunner } from '../src/missions/runner.js';
import { Objectives } from '../src/missions/objectives.js';
import { visionOf } from '../src/ai/perception.js';
import { BALANCE } from '../src/config/balance.js';

const DT = 1 / 30;

function setup(extra = {}) {
  const w = 40, h = 30, row = (c) => c.repeat(w);
  const data = {
    id: 't', size: { w, h }, terrain: Array(h).fill(row('g')), elevation: Array(h).fill(row('0')), overlay: Array(h).fill(row('.')),
    units: extra.units || [], structures: extra.structures || [], paths: {}, areas: extra.areas || {}, alertGroups: {},
    objectives: extra.objectives || [],
    player: { x: extra.px ?? 35, y: extra.py ?? 25, facing: 'W', loadout: { rifle: 20, c4: 2 } },
  };
  const said = [];
  const game = {
    app: { params: new URLSearchParams(), save: {}, persist() {} }, settings: {}, awareness: null, cam: { shake() {} },
    hud: { say(t) { said.push(t); }, toast() {}, peekObjectives() {} }, said,
  };
  game.world = new World(data, { seed: 3 });
  game.combat = new CombatSystem(game);
  game.vehicles = new VehicleSystem(game);
  game.structures = new StructureSystem(game);
  game.enemies = new EnemySystem(game);
  game.props = new PropSystem(game);
  game.c4 = new C4System(game);
  game.objectives = new Objectives(game, data.objectives);
  return game;
}
const run = (g, secs, fn = () => {}) => { for (let t = 0; t < secs; t += DT) { g.world.operative.update(DT); g.combat.update(DT); g.c4.update(DT); fn(); } };

test('view-slit hit leaves a vehicle with a 3-tile vision radius that survives FSM resets', () => {
  const g = setup({ units: [{ id: 'v', type: 'brute', x: 10, y: 10, alertGroup: 'a' }] });
  const v = g.world.units.find((u) => u.id === 'v');
  g.vehicles.disable(v, 'slit');
  v.visionMult = 1; // the FSM resets this every state change
  const after = visionOf(v, g.world).radius;
  const dv = v.disabledVision; v.disabledVision = 0;
  const full = visionOf(v, g.world).radius; v.disabledVision = dv;
  assert.ok(Math.abs(after / full - 3 / BALANCE.ai.vision.armour.radius) < 1e-6, `slit ${after} vs full ${full}`);
  assert.equal(v.disabled, true);
  assert.equal(v.speed(), 0);
});

test('a fuel hauler that dies explodes and hurts what is next to it', () => {
  const g = setup({ units: [{ id: 'f', type: 'fuelHauler', x: 10, y: 10, alertGroup: 'a' }, { id: 'h', type: 'husk', x: 11, y: 11, alertGroup: 'a' }] });
  const f = g.world.units.find((u) => u.id === 'f'), h = g.world.units.find((u) => u.id === 'h');
  g.vehicles.destroy(f, { by: 'damage', source: 'player' });
  assert.equal(h.hp, h.maxHp, 'the blast is queued, not instant');
  run(g, 0.1);
  assert.ok(h.dead || h.hp < h.maxHp, 'neighbour caught in the fuel blast');
});

test('C4: walk, plant for 2.5 s, fuse, the structure is destroyed and a charge is used', () => {
  const g = setup({ structures: [{ id: 'b', type: 'barracks', x: 20, y: 10, alertGroup: 'a' }], px: 26, py: 16 });
  const s = g.world.structures[0], op = g.world.operative;
  const tgt = g.c4.targetAt(s.x, s.y);
  assert.ok(tgt && tgt.kind === 'structure');
  assert.ok(g.c4.plant(tgt));
  run(g, 12, () => {});
  assert.ok(op.c4 === 1, `c4 left ${op.c4}`);
  assert.equal(g.c4.charges.length > 0 || s.dead, true);
  run(g, BALANCE.c4.fuse + 0.5);
  assert.equal(s.dead, true);
  assert.equal(g.c4.charges.length, 0);
});

test('C4: a new move order interrupts planting and keeps the charge', () => {
  const g = setup({ structures: [{ id: 'b', type: 'barracks', x: 20, y: 10, alertGroup: 'a' }], px: 26, py: 16 });
  const s = g.world.structures[0], op = g.world.operative;
  g.c4.plant(g.c4.targetAt(s.x, s.y));
  run(g, 20, () => { if (op.busy?.kind === 'plant' && op.busy.t > 1) op.orderMove(30, 20, 'walk'); });
  assert.equal(op.c4, 2);
  assert.equal(g.c4.charges.length, 0);
  assert.equal(s.dead, false);
});

test('extraction: stand in the LZ → inbound → lands → boards → mission won', () => {
  const g = setup({
    areas: { lz: { x: 30, y: 20, w: 5, h: 5 } }, px: 32, py: 22,
    objectives: [{ id: 'x', type: 'EXTRACT', area: 'lz', text: 'Extract' }],
  });
  g.smokeActiveNear = () => false;
  const r = new MissionRunner(g);
  let won = false;
  r.win = () => { won = true; };
  for (let t = 0; t < 40 && !won; t += DT) { g.world.operative.update(DT); g.combat.update(DT); r._extraction(DT); }
  assert.equal(won, true, `stuck in ${r.extract.state}`);
  assert.equal(g.world.operative.hidden, true, 'WREN is aboard');
});

test('extraction: a hot LZ makes the dropship circle until it is clear', () => {
  const g = setup({
    areas: { lz: { x: 30, y: 20, w: 5, h: 5 } }, px: 32, py: 22,
    objectives: [{ id: 'x', type: 'EXTRACT', area: 'lz', text: 'Extract' }],
    units: [{ id: 'e', type: 'husk', x: 26, y: 22, alertGroup: 'a' }],
  });
  g.smokeActiveNear = () => false;
  g.world.update(0);
  const r = new MissionRunner(g);
  r.win = () => {};
  for (let t = 0; t < BALANCE.extraction.callTime + BALANCE.extraction.arrive + 1; t += DT) r._extraction(DT);
  assert.equal(r.extract.state, 'circling');
  g.world.units[0].dead = true;
  r._extraction(DT);
  assert.equal(r.extract.state, 'landing');
});

test('tutorial prompts queue instead of replacing each other, and are only "seen" once read', () => {
  const g = setup({});
  const r = new MissionRunner(g);
  g.scopeOpen = false;
  r.showTutorial('a', 'A', 'first');
  r.showTutorial('b', 'B', 'second');
  assert.equal(r.tutorial.key, 'a');
  assert.equal(r.tutQueue.length, 1);
  r.dismissTutorial(); // dismissed immediately: not marked seen
  assert.equal(r.tutorialSeen.has('a'), false);
  assert.equal(r.tutorial.key, 'b');
  r.update(3.1);
  assert.equal(r.tutorialSeen.has('b'), true);
});
