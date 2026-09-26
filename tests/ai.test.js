// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { EnemySystem } from '../src/ai/enemies.js';
import { CombatSystem } from '../src/combat/system.js';

function setup(units, opts = {}) {
  const w = 30, h = 20;
  const row = (ch) => ch.repeat(w);
  const overlay = Array.from({ length: h }, (_, y) => (opts.wall && y < 19 ? row('.').slice(0, 15) + 'v' + row('.').slice(16) : row('.')));
  const data = {
    id: 't', size: { w, h }, terrain: Array(h).fill(row('g')), elevation: Array(h).fill(row('0')), overlay,
    units, paths: opts.paths || {}, areas: opts.areas || {}, alertGroups: opts.alertGroups || {},
    player: { x: opts.opX ?? 25, y: opts.opY ?? 10, facing: 'W', loadout: { rifle: 20 } },
  };
  const game = { app: { params: new URLSearchParams() }, hud: null, settings: {}, awareness: null };
  game.world = new World(data, { seed: 7 });
  game.combat = new CombatSystem(game);
  game.enemies = new EnemySystem(game);
  return game;
}
const run = (g, secs, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) { g.world.update(dt); g.enemies.update(dt); g.combat.update(dt); } };

test('combat → alerted (search rings) → returning when WREN is lost (SPEC §8.5)', () => {
  const g = setup([{ id: 'a', type: 'husk', x: 5, y: 10, facing: 'E', alertGroup: 'x', behaviour: { kind: 'sentry' } }], { wall: true });
  const u = g.world.units[0];
  u.lastKnown = { x: 12, y: 10 };
  g.enemies.enterCombat(u);
  assert.equal(u.state, 'combat');
  run(g, 4);
  assert.equal(u.state, 'alerted', 'searches after losing contact for 3 s');
  assert.ok(u.search && u.search.pts.length >= 4, 'has search ring waypoints');
  run(g, 32);
  assert.ok(u.state === 'returning' || u.state === 'unaware', `gives up after 30 s (state ${u.state})`);
});

test('a patrol group without a base area never auto-escalates to Alarm', () => {
  const g = setup([{ id: 'a', type: 'husk', x: 20, y: 10, facing: 'E', alertGroup: 'road', behaviour: { kind: 'sentry' } }], { opX: 23, opY: 10 });
  run(g, 8);
  const u = g.world.units[0];
  assert.equal(u.state, 'combat');
  assert.notEqual(g.enemies.alerts.level('road'), 'alarm');
});

test('detected inside a base footprint for 3 s raises the Alarm', () => {
  const g = setup([{ id: 'a', type: 'husk', x: 20, y: 10, facing: 'E', alertGroup: 'base', behaviour: { kind: 'sentry' } }],
    { opX: 23, opY: 10, areas: { b: { x: 15, y: 5, w: 14, h: 10 } }, alertGroups: { base: { area: 'b' } } });
  run(g, 8);
  assert.equal(g.enemies.alerts.level('base'), 'alarm');
});
