// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { EnemySystem } from '../src/ai/enemies.js';
import { CombatSystem } from '../src/combat/system.js';
import { StructureSystem } from '../src/entities/structure.js';
import { VehicleSystem } from '../src/entities/vehicle.js';
import { Takedown } from '../src/combat/takedown.js';
import { BALANCE } from '../src/config/balance.js';

const DT = 1 / 30;

function setup(o = {}) {
  const w = 40, h = 20;
  const data = {
    id: 't', size: { w, h }, time: 'day', terrain: Array(h).fill((o.row || 'g').repeat(w).slice(0, w)), elevation: Array(h).fill('0'.repeat(w)),
    overlay: o.overlay || Array(h).fill('.'.repeat(w)), units: o.units || [], structures: [], paths: {}, areas: {}, alertGroups: {}, friendlies: [], objectives: [],
    player: { x: o.px ?? 5, y: o.py ?? 10, facing: 'E', loadout: { rifle: 20 } },
  };
  const g = /** @type {any} */ ({
    app: { params: new URLSearchParams(), save: {}, persist() {} }, settings: {}, mode: 'normal', cam: { shake() {} },
    hud: { say() {}, toast(t) { g.toasts.push(t); } }, toasts: [], noises: [],
  });
  g.world = new World(data, { seed: 5 });
  g.combat = new CombatSystem(g); g.vehicles = new VehicleSystem(g); g.structures = new StructureSystem(g); g.enemies = new EnemySystem(g);
  g.takedown = new Takedown(g);
  g.world.events.on('noise', (n) => g.noises.push(n));
  return g;
}
const tick = (g, secs) => { for (let t = 0; t < secs; t += DT) { g.world.time += DT; g.world.operative.update(DT); g.enemies.update(DT); } };
const flat = (g) => { g.world.operative.toggleHunker(); tick(g, BALANCE.stances.hunker.enter + 0.1); };

test('low crawl: a move order while hunkered keeps WREN flat, very slow, low-visibility and silent', () => {
  const g = setup(), op = g.world.operative;
  flat(g);
  assert.equal(op.stance, 'hunker');
  assert.ok(op.orderMove(15, 10, 'crawl'));
  tick(g, 2);
  assert.equal(op.crawling, true);
  assert.equal(op.hunkered, true, 'still flat: vehicles and turrets still cannot see him');
  assert.ok(Math.abs(op.x - (5.5 + 2 * BALANCE.stances.crawl.speed)) < 0.15, `crawled to ${op.x.toFixed(2)}`);
  assert.equal(op.visibilityFactor(null), BALANCE.stances.crawl.vis);
  assert.equal(g.noises.filter((n) => n.kind === 'step').length, 0, 'no footsteps on dry ground');
  tick(g, 30);
  assert.equal(op.moving, false);
  assert.equal(op.stance, 'hunker', 'a crawl ends flat');
});

test('shallow water: too deep to go flat, and a crawl that reaches water gets up and wades', () => {
  const wet = setup({ row: 'w' }), op = wet.world.operative;
  assert.equal(op.toggleHunker(), 'water');
  tick(wet, 1);
  assert.notEqual(op.stance, 'hunker');
  const g = setup({ row: 'g'.repeat(7) + 'w'.repeat(33) }), op2 = g.world.operative;
  flat(g);
  op2.orderMove(12, 10, 'crawl');
  tick(g, 8);
  assert.ok(op2.x > 7, 'in the water');
  assert.notEqual(op2.stance, 'hunker');
  assert.notEqual(op2.mode, 'crawl');
});

test('takedown ring: flat WREN crawls up on an unaware soldier and takes them down in reach', () => {
  const g = setup({ units: [{ id: 'h', type: 'husk', x: 11, y: 10, alertGroup: 'a', facing: 'E' }] }), op = g.world.operative;
  const u = g.world.units[0];
  assert.equal(g.takedown.ringTargets().length, 0, 'no rings while standing');
  flat(g);
  g.world.fog.revealAll = true;
  assert.deepEqual(g.takedown.ringTargets(), [u]);
  assert.equal(g.takedown.ringAt(u.x - 1.5, u.y), u, 'a tap on the donut');
  assert.equal(g.takedown.ringAt(u.x + 4, u.y), null);
  g.takedown.stalk(u);
  for (let t = 0; t < 30 && !u.dead; t += DT) { g.world.time += DT; op.update(DT); g.takedown.update(DT); }
  assert.ok(u.dead, 'taken down');
  assert.equal(g.takedown.stalking, null);
  assert.equal(op.stance, 'hunker', 'stayed low all the way');
});

test('double-tap (run) or HUNKER gets up out of a crawl', () => {
  const g = setup(), op = g.world.operative;
  flat(g);
  op.orderMove(30, 10, 'crawl'); tick(g, 1);
  op.upgradeRun();
  tick(g, BALANCE.stances.hunker.exit + 0.3);
  assert.equal(op.mode, 'run');
  assert.equal(op.stance, 'run');
  const g2 = setup(), op2 = g2.world.operative;
  flat(g2);
  op2.orderMove(30, 10, 'crawl'); tick(g2, 1);
  op2.toggleHunker();
  tick(g2, BALANCE.stances.hunker.exit + 0.1);
  assert.equal(op2.moving, false, 'HUNKER stops the crawl where it is');
  assert.equal(op2.stance, 'crouch');
});

test('silent takedown: an unaware soldier within reach dies without a shot; the scuffle carries 1.5 tiles', () => {
  const g = setup({ units: [{ id: 'h', type: 'husk', x: 6, y: 10, alertGroup: 'a', facing: 'E' }] });
  const op = g.world.operative, u = g.world.units[0], ammo = op.rifleMag + op.rifleReserve;
  assert.equal(g.takedown.target(), u);
  assert.ok(g.takedown.perform());
  assert.equal(u.dead, true);
  assert.equal(u.killedByPlayer, true);
  assert.equal(op.rifleMag + op.rifleReserve, ammo, 'no ammunition used');
  assert.equal(g.world.stats.kills, 1);
  const n = g.noises.at(-1);
  assert.equal(n.kind, 'takedown');
  assert.equal(n.radius, BALANCE.noise.takedown);
  assert.equal(g.world.corpses.length, 1, 'the body stays and can be found');
});

test('no takedown when out of reach, when they have seen WREN, or on vehicles', () => {
  const far = setup({ units: [{ id: 'h', type: 'husk', x: 8, y: 10, alertGroup: 'a', facing: 'E' }] });
  assert.equal(far.takedown.target(), null);
  assert.equal(far.takedown.blocker(far.world.units[0]), 'too far');
  const seen = setup({ units: [{ id: 'h', type: 'husk', x: 6, y: 10, alertGroup: 'a', facing: 'W' }] });
  const u = seen.world.units[0];
  u.seesOp = true; u.det = 0.8;
  assert.equal(seen.takedown.blocker(u), 'they see you');
  assert.equal(seen.takedown.perform(u), false);
  assert.equal(u.dead, false);
  const veh = setup({ units: [{ id: 'v', type: 'skitter', x: 6, y: 10, alertGroup: 'a', facing: 'E' }] });
  assert.equal(veh.takedown.blocker(veh.world.units[0]), 'not infantry');
});

test('a takedown in plain view of another soldier is witnessed; one out of sight and earshot is not', () => {
  // watcher 6 tiles away looking at the victim; a same-group mate 5 tiles away behind a wall
  const wall = Array(20).fill('.'.repeat(40)).map((r, y) => (y >= 7 && y <= 13 ? r.slice(0, 9) + 'v' + r.slice(10) : r));
  const g = setup({ overlay: wall, units: [
    { id: 'victim', type: 'husk', x: 6, y: 10, alertGroup: 'a', facing: 'E' },
    { id: 'mate', type: 'husk', x: 11, y: 10, alertGroup: 'a', facing: 'E' },
    { id: 'watcher', type: 'husk', x: 6, y: 16, alertGroup: 'b', facing: 'N' },
  ] });
  const [victim, mate, watcher] = g.world.units;
  g.takedown.perform(victim);
  assert.equal(victim.dead, true);
  assert.notEqual(watcher.state, 'unaware', 'saw it happen');
  assert.equal(mate.state, 'unaware', 'behind the wall and 5 tiles off: heard nothing');
});

test('a move ordered while WREN is getting up from hunker is carried out once he is up', () => {
  const g = setup(), op = g.world.operative;
  flat(g);
  op.toggleHunker();                 // getting up (0.7 s)…
  tick(g, 0.25);
  assert.ok(op.orderMove(15, 10, 'walk'), 'order accepted mid get-up');
  tick(g, BALANCE.stances.hunker.exit + 1.5);
  assert.ok(op.x > 6.5, `he walked off (x ${op.x.toFixed(2)})`);
});
