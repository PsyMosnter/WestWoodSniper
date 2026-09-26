// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { EnemySystem } from '../src/ai/enemies.js';
import { CombatSystem } from '../src/combat/system.js';
import { StructureSystem } from '../src/entities/structure.js';
import { VehicleSystem } from '../src/entities/vehicle.js';
import { PropSystem } from '../src/entities/props.js';
import { FriendlySystem } from '../src/entities/friendly.js';
import { Weather } from '../src/world/weather.js';
import { NotConvoy } from '../src/missions/convoy.js';
import { BALANCE } from '../src/config/balance.js';

const DT = 1 / 30;

function setup(extra = {}) {
  const w = extra.w || 40, h = extra.h || 30, row = (c) => c.repeat(w);
  const data = {
    id: 't', size: { w, h }, terrain: Array(h).fill(row(extra.ground || 'g')), elevation: Array(h).fill(row('0')), overlay: Array(h).fill(row('.')),
    units: extra.units || [], structures: [], paths: extra.paths || {}, areas: extra.areas || {}, alertGroups: extra.alertGroups || {},
    friendlies: extra.friendlies || [], weather: extra.weather || null, convoyPath: extra.convoyPath,
    objectives: [],
    player: { x: extra.px ?? 5, y: extra.py ?? 5, facing: 'E', loadout: { rifle: 20 } },
  };
  const said = [];
  const game = {
    app: { params: new URLSearchParams(), save: {}, persist() {} }, settings: {}, awareness: null, cam: { shake() {} },
    hud: { say(t) { said.push(t); }, toast() {}, peekObjectives() {} }, said,
  };
  game.world = new World(data, { seed: 7 });
  game.combat = new CombatSystem(game);
  game.vehicles = new VehicleSystem(game);
  game.structures = new StructureSystem(game);
  game.enemies = new EnemySystem(game);
  game.props = new PropSystem(game);
  game.friendlies = new FriendlySystem(game);
  if (data.weather) game.weather = new Weather(game);
  return game;
}
const tick = (g, secs, fn = () => {}) => {
  for (let t = 0; t < secs; t += DT) {
    g.world.time += DT;
    g.world.operative.update(DT);
    g.friendlies.update(DT);
    g.convoy?.update(DT);
    g.notConvoy?.update(DT);
    g.enemies.update(DT);
    g.weather?.update(DT);
    g.world.fog.update(g.world.visionSources());
    fn();
  }
};

test('a captive is freed after WREN stands next to them for 2 s, then follows 1–3 tiles behind', () => {
  const g = setup({ friendlies: [{ id: 'p', type: 'pilot', x: 6, y: 5, captive: true }] });
  const f = g.world.friendlies[0];
  tick(g, 1.0);
  assert.equal(f.captive, true, 'not yet');
  tick(g, 1.2);
  assert.equal(f.captive, false);
  assert.equal(f.mode, 'follow');
  g.world.operative.orderMove(20, 5, 'walk');
  tick(g, 12);
  const d = Math.hypot(f.x - g.world.operative.x, f.y - g.world.operative.y);
  assert.ok(d <= BALANCE.friendly.followMax + 1, `follower ${d.toFixed(1)} tiles behind`);
});

test('medical trucks drive to the next checkpoint on ADVANCE and wait there', () => {
  const g = setup({
    w: 60, h: 12, px: 2, py: 2,
    friendlies: [{ id: 't1', type: 'medTruck', x: 4, y: 6, slot: 0 }, { id: 't2', type: 'medTruck', x: 1, y: 6, slot: 1 }],
    paths: { convoy: [{ x: 20, y: 6, checkpoint: 1 }, { x: 40, y: 6, checkpoint: 2 }] }, convoyPath: 'convoy',
  });
  const cv = g.convoy;
  assert.ok(cv, 'convoy created from the trucks');
  tick(g, 3);
  assert.ok(g.world.friendlies[0].x < 5, 'waits for the order');
  cv.toggle();
  tick(g, 15);
  assert.equal(cv.checkpoint, 1);
  assert.equal(cv.advancing, false, 'holds at the checkpoint');
  const lead = g.world.friendlies[0];
  assert.ok(Math.abs(lead.x - 20.5) < 1.5, `lead at ${lead.x.toFixed(1)}`);
  const t2 = g.world.friendlies[1];
  assert.ok(lead.x - t2.x > 1.5, 'second truck keeps its distance');
});

test('trucks stop on their own when a visible enemy is within 6 tiles of the lead', () => {
  const g = setup({
    w: 60, h: 12, px: 10, py: 6,
    friendlies: [{ id: 't1', type: 'medTruck', x: 4, y: 6, slot: 0 }],
    units: [{ id: 'e', type: 'husk', x: 14, y: 3, alertGroup: 'a', facing: 'N' }],
    paths: { convoy: [{ x: 40, y: 6, checkpoint: 1 }] }, convoyPath: 'convoy',
  });
  g.convoy.toggle();
  tick(g, 6);
  assert.equal(g.convoy.halted, true);
  const lead = g.world.friendlies[0];
  assert.ok(Math.hypot(lead.x - 14, lead.y - 3) > BALANCE.friendly.convoyStopDist - 1.2, 'stopped short of the enemy');
});

test('NOT troops shoot at friendlies they can see (not only at WREN)', () => {
  const g = setup({
    px: 35, py: 25,
    friendlies: [{ id: 'p', type: 'pilot', x: 12, y: 10 }],
    units: [{ id: 'e', type: 'husk', x: 12, y: 5, alertGroup: 'a', facing: 'S' }],
  });
  const f = g.world.friendlies[0];
  f.mode = 'hold';
  tick(g, 20);
  const e = g.world.units[0];
  assert.equal(e.state, 'combat');
  assert.ok(f.hp < f.maxHp || f.dead, 'the pilot took fire');
});

test('snow tracks: WREN leaves prints in snow; a patrol crossing fresh prints turns suspicious; a blizzard wipes them', () => {
  const g = setup({ ground: 'n', weather: 'blizzard', px: 3, py: 25, units: [{ id: 'e', type: 'husk', x: 14, y: 7, alertGroup: 'a', facing: 'N', behaviour: { kind: 'sentry' } }] });
  g.world.operative.orderMove(12, 25, 'walk');
  tick(g, 6);
  assert.ok(g.weather.tracks.length > 5, `WREN's own prints: ${g.weather.tracks.length}`);
  g.weather.tracks = [];
  for (let x = 10; x <= 18; x += 0.5) g.world.events.emit('track', { x, y: 10.5, a: 0 });
  tick(g, 1.5);
  const e = g.world.units[0];
  assert.ok(['suspicious', 'investigating'].includes(e.state), `patrol state ${e.state}`);
  g.weather.t = BALANCE.terrain.blizzardEvery - BALANCE.terrain.blizzardLength + 0.1;
  tick(g, 0.1);
  assert.equal(g.world.blizzard, true);
  assert.equal(g.weather.tracks.length, 0);
});

test('NOT convoy: riders dismount at a stop and the VIP walks his inspection route', () => {
  const g = setup({
    w: 60, h: 14, px: 2, py: 12,
    units: [
      { id: 'cv', type: 'crawler', x: 4, y: 6, alertGroup: 'convoy', behaviour: { kind: 'convoy', path: 'route', slot: 0 } },
      { id: 'vrask', type: 'vrask', x: 4, y: 6, alertGroup: 'convoy', behaviour: { kind: 'mounted', vehicle: 'cv' }, important: true },
    ],
    paths: { route: [{ x: 4, y: 6 }, { x: 20, y: 6, stop: 5, inspect: 'insp' }, { x: 40, y: 6 }], insp: [{ x: 22, y: 9 }, { x: 18, y: 9 }] },
    alertGroups: { convoy: {} },
  });
  g.notConvoy = new NotConvoy(g, 'route');
  const v = g.world.units.find((u) => u.id === 'vrask');
  assert.equal(v.hidden, true, 'rides inside');
  tick(g, 14, () => g.vehicles.update(DT));
  assert.equal(g.notConvoy.state === 'stop' || !v.hidden, true, `convoy ${g.notConvoy.state}`);
  assert.equal(v.hidden, false, 'Vrask got out');
});
