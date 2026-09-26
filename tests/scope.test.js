// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { EnemySystem } from '../src/ai/enemies.js';
import { CombatSystem } from '../src/combat/system.js';
import { Scope } from '../src/scope/scope.js';
import { Time } from '../src/core/time.js';

function setup() {
  const w = 30, h = 20, row = (c) => c.repeat(w);
  const data = {
    id: 't', size: { w, h }, terrain: Array(h).fill(row('g')), elevation: Array(h).fill(row('0')), overlay: Array(h).fill(row('.')),
    units: [{ id: 'a', type: 'husk', x: 12, y: 10, facing: 'E', alertGroup: 'x', behaviour: { kind: 'sentry' } }],
    paths: {}, areas: {}, alertGroups: {}, player: { x: 18, y: 10, facing: 'W', loadout: { rifle: 20 } },
  };
  const stub = { toast() {}, say() {}, dim: 0 };
  const game = { app: { params: new URLSearchParams() }, hud: stub, settings: {}, awareness: { state: 'hidden' }, cam: { shake() {} }, audio: null };
  game.world = new World(data, { seed: 3 });
  game.world.update(0.1);
  game.combat = new CombatSystem(game);
  game.enemies = new EnemySystem(game);
  game.scope = new Scope(game);
  game.scope.D = 260; // layout() needs a DOM; set the scope diameter directly
  return game;
}

test('with no sway and no dispersion the round lands exactly on the reticle (head → headshot)', () => {
  const g = setup();
  const u = g.world.units[0];
  const s = g.scope;
  assert.ok(s.openOn(u));
  s.openT = 1; s.sway = { x: 0, y: 0 };
  // aim at the centre of the head zone (front view: head zone centre is ~ (20, 10) in sprite px; anchor (20, 63))
  s.aim = { x: u.x, y: u.y - (63 - 10) / (4 * 16) };
  s.shoot();
  assert.equal(u.dead, true, 'headshot kills');
  assert.equal(g.world.stats.headshots, 1);
  Time.scale = 1;
});

test('aiming at the upper chest wounds, it does not headshot', () => {
  const g = setup();
  const u = g.world.units[0];
  const s = g.scope;
  s.openOn(u); s.openT = 1; s.sway = { x: 0, y: 0 };
  s.aim = { x: u.x - 3 / 64, y: u.y - (63 - 30) / 64 };
  s.shoot();
  assert.equal(u.dead, false);
  assert.equal(u.wounded, true);
  Time.scale = 1;
});
