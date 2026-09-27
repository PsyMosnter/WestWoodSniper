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
import { C4System } from '../src/combat/c4.js';
import { Takedown } from '../src/combat/takedown.js';
import { Objectives } from '../src/missions/objectives.js';
import { MissionRunner } from '../src/missions/runner.js';
import { BALANCE } from '../src/config/balance.js';
import bc from '../src/missions/bc.js';
import { damageOperative } from '../src/combat/damage.js';

const DT = 1 / 30;

/** Boot Camp, headless: the real systems in GameScene's update order; tips are read at once. */
function boot() {
  const g = /** @type {any} */ ({
    app: { params: new URLSearchParams(), save: {}, persist() {} }, settings: {}, mode: 'normal', missionModule: bc, data: bc,
    cam: { shake() {}, centreOn() {} }, lines: [], won: false,
    hud: { say(t) { g.lines.push(t); }, toast() {} },
    endMission(won) { g.won = won; },
  });
  g.world = new World(bc, { seed: 3 });
  g.combat = new CombatSystem(g); g.vehicles = new VehicleSystem(g); g.structures = new StructureSystem(g);
  g.enemies = new EnemySystem(g); g.props = new PropSystem(g); g.friendlies = new FriendlySystem(g);
  g.c4 = new C4System(g); g.takedown = new Takedown(g);
  g.objectives = new Objectives(g, bc.objectives);
  g.runner = new MissionRunner(g);
  return g;
}
function tick(g, secs, until = null) {
  for (let t = 0; t < secs; t += DT) {
    if (g.runner.tutorial) g.runner.dismissTutorial();
    const w = g.world;
    w.update(DT); g.structures.update(DT); g.enemies.update(DT); g.vehicles.update(DT); g.c4.update(DT);
    g.combat.update(DT); g.objectives.update(DT); g.runner.update(DT);
    if (until && until()) return true;
  }
  return false;
}
const done = (g, id) => !!g.objectives.get(id)?.done;
/** walk/run/crawl to a tile and wait until WREN gets there (or `secs` run out) */
function go(g, x, y, mode = 'walk', secs = 40) {
  const op = g.world.operative;
  op.orderMove(x, y, mode);
  return tick(g, secs, () => !op.moving && !op.trans && !op.pendingMove);
}
const spotted = (g) => g.lines.some((l) => l.startsWith('SPOTTED'));

test('Boot Camp: walk and run stations; walking to the run marker does not count', () => {
  const g = boot();
  go(g, 10, 18);
  assert.ok(done(g, 'b1'), 'walked to the first marker');
  assert.equal(g.objectives.get('b2').hidden, true, 'the next station waits a beat (the payoff plays first)');
  tick(g, 2);
  assert.equal(g.objectives.get('b2').hidden, false, 'next station revealed');
  go(g, 21, 18, 'walk');
  assert.equal(done(g, 'b2'), false, 'walked, not ran');
  assert.ok(g.lines.some((l) => l.includes('I said RUN')));
  go(g, 15, 18, 'walk');
  g.world.operative.orderMove(21, 18, 'walk'); g.world.operative.upgradeRun();
  tick(g, 6, () => done(g, 'b2'));
  assert.ok(done(g, 'b2'), 'ran to the second marker');
});

test('Boot Camp: walking through the tall grass stays unseen; walking the crawl lane is spotted, crawling it is not', () => {
  const g = boot(), op = g.world.operative, w = g.world;
  for (const id of ['b1', 'b2']) g.objectives.complete(id);
  tick(g, 2);
  op.x = op.px = 21.5; op.y = op.py = 18.5;
  go(g, 29, 19); go(g, 35, 21);
  assert.ok(done(g, 'b3'), 'crossed the grass');
  assert.equal(spotted(g), false, 'the field dummy never saw him in the grass');
  tick(g, 2);
  assert.equal(w.units.find((u) => u.id === 'd1').hidden, true, 'field dummy packed up');
  // walking down the lane: the dummy behind the fence has him → back to the lane's mouth
  const d2 = w.units.find((u) => u.id === 'd2');
  op.orderMove(42, 24, 'walk');
  tick(g, 20, () => spotted(g));
  assert.ok(d2.state !== 'unaware' || spotted(g));
  assert.ok(spotted(g), 'walking the lane gets him spotted');
  assert.ok(Math.hypot(op.x - 35.5, op.y - 21.5) < 1, `sent back to the last marker (at ${op.x.toFixed(1)}, ${op.y.toFixed(1)})`);
  tick(g, 1.2);
  g.lines.length = 0;
  // hunker and crawl it
  op.toggleHunker(); tick(g, BALANCE.stances.hunker.enter + 0.1);
  go(g, 37, 24, 'crawl', 30); go(g, 47, 24, 'crawl', 40);
  assert.equal(spotted(g), false, 'crawling the lane stays unseen');
  assert.ok(done(g, 'b4'), 'reached the end of the lane');
});

test('Boot Camp: a takedown from behind; shooting the dummy instead brings a fresh one', () => {
  const g = boot(), op = g.world.operative, w = g.world;
  for (const id of ['b1', 'b2', 'b3', 'b4']) g.objectives.complete(id);
  tick(g, 2);
  op.x = op.px = 48.5; op.y = op.py = 23.5;
  const d3 = w.units.find((u) => u.id === 'd3');
  // loud first: a rifle kill doesn't count
  g.combat.kill(d3, { by: 'rifle', source: 'player' });
  tick(g, 1.5);
  assert.equal(done(g, 'b5'), false);
  const fresh = w.units.find((u) => u.id.startsWith('d3_') && !u.dead);
  assert.ok(fresh, 'a fresh dummy stepped up');
  tick(g, 1);
  // sneak up behind him (he faces east) and take him down from 2 tiles
  go(g, 51, 23);
  assert.equal(spotted(g), false);
  assert.ok(Math.hypot(fresh.x - op.x, fresh.y - op.y) <= BALANCE.takedown.reach, `in reach (${Math.hypot(fresh.x - op.x, fresh.y - op.y).toFixed(2)} tiles)`);
  assert.ok(g.takedown.perform(fresh));
  tick(g, 1);
  assert.ok(done(g, 'b5'), 'silent takedown done');
  assert.ok(Math.hypot(fresh.x - op.x, fresh.y - op.y) <= BALANCE.takedown.lunge + 0.05, 'WREN lunged to arm\'s length');
});

test('Boot Camp: driver shot → C4 on the Skitter → C4 on the hut → course complete', () => {
  const g = boot(), op = g.world.operative, w = g.world;
  for (const id of ['b1', 'b2', 'b3', 'b4', 'b5']) g.objectives.complete(id);
  tick(g, 2);
  const sk = w.units.find((u) => u.id === 'sk');
  op.x = op.px = 50.5; op.y = op.py = 27.5;
  g.vehicles.hitZone(sk, 'driver');
  tick(g, 0.5);
  assert.ok(done(g, 'b6'), 'driver down');
  tick(g, 2);
  assert.equal(sk.disabled, true);
  assert.equal(spotted(g), false, 'a disabled Skitter does not count as spotting him');
  assert.ok(g.c4.plant(g.c4.targetAt(sk.tx, sk.ty)), 'long-press the Skitter: plant C4');
  assert.ok(tick(g, 15, () => g.c4.charges.length > 0), 'charge set');
  assert.equal(sk.seesOp, false, 'a driverless buggy is blind: planting next to it is safe');
  go(g, 51, 21, 'run');
  tick(g, BALANCE.c4.fuse + 1, () => done(g, 'b7'));
  assert.ok(done(g, 'b7'), 'Skitter destroyed');
  tick(g, 2);
  const hut = w.structures.find((s) => s.id === 'hut');
  assert.ok(g.c4.plant(g.c4.targetAt(hut.x + 1, hut.y + 1)), 'long-press the hut: plant C4');
  assert.ok(tick(g, 15, () => g.c4.charges.length > 0), 'charge set');
  go(g, 52, 28, 'run');
  tick(g, BALANCE.c4.fuse + 8, () => g.won);
  assert.ok(done(g, 'b8'), 'hut destroyed');
  assert.equal(g.won, true, 'course complete');
});

test('Boot Camp: the takedown lesson closes only after the lunge; the next tip waits a beat', () => {
  const g = boot(), op = g.world.operative, w = g.world;
  for (const id of ['b1', 'b2', 'b3', 'b4']) g.objectives.complete(id);
  tick(g, 2);
  const d3 = w.units.find((u) => u.id === 'd3');
  op.x = op.px = d3.x - 1.8; op.y = op.py = d3.y;
  assert.ok(g.takedown.perform(d3));
  g.runner.update(DT); g.objectives.update(DT);
  assert.equal(done(g, 'b5'), false, 'not while WREN is still mid-takedown');
  tick(g, BALANCE.takedown.time + 0.1);
  assert.ok(done(g, 'b5'));
  assert.equal(g.objectives.get('b6').hidden, true, 'the driver lesson waits');
  tick(g, 2);
  assert.equal(g.objectives.get('b6').hidden, false);
});

test('Boot Camp: blowing the Skitter up before its driver is shot brings a fresh one; the course still completes', () => {
  const g = boot(), w = g.world;
  for (const id of ['b1', 'b2', 'b3', 'b4', 'b5']) g.objectives.complete(id);
  tick(g, 2);
  const sk = w.units.find((u) => u.id === 'sk');
  g.vehicles.hitZone(sk, 'jerrycan');
  tick(g, 1);
  assert.ok(g.lines.some((l) => l.includes('another one')));
  const fresh = w.units.find((u) => u.id.startsWith('sk_') && !u.dead);
  assert.ok(fresh, 'a fresh Skitter rolled up');
  g.vehicles.hitZone(fresh, 'driver');
  tick(g, 2.5);
  assert.ok(done(g, 'b6'), 'driver lesson done on the fresh one');
  assert.equal(g.objectives.get('b7').entity, fresh.id, 'the C4 lesson is about the fresh one');
});

test('Boot Camp: caught in your own C4 blast — reset to the last marker, not a failed course', () => {
  const g = boot(), op = g.world.operative;
  for (const id of ['b1', 'b2', 'b3', 'b4', 'b5']) g.objectives.complete(id);
  tick(g, 2);
  const cp = { ...g.runner.cp };
  op.x = op.px = 50.5; op.y = op.py = 30.5;
  damageOperative(g.combat, 500, { x: op.x, y: op.y }, 'explosion');
  assert.equal(op.dead, false, 'WREN lives (training)');
  assert.equal(op.hp, op.maxHp);
  assert.ok(Math.hypot(op.x - cp.x, op.y - cp.y) < 0.01, 'back at the last marker');
  assert.equal(g.won, false);
  assert.ok(g.lines.some((l) => l.includes('closed casket')));
});
