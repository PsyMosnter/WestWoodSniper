// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { EnemySystem } from '../src/ai/enemies.js';
import { CombatSystem } from '../src/combat/system.js';
import { StructureSystem } from '../src/entities/structure.js';
import { VehicleSystem } from '../src/entities/vehicle.js';
import { Engage } from '../src/combat/engage.js';
import { canSee } from '../src/world/los.js';
import { seesTarget, targetDist } from '../src/combat/targeting.js';

const DT = 1 / 30;

/** Two level-2 plateaus with a level-1 canyon between (x 13–20); a Fuel Depot on the east rim.
 *  The west plateau's walkable rim is x 11 (x 12 is its cliff face): 9.5 tiles from the depot. */
function canyon(px, py) {
  const w = 40, h = 20;
  const row = '2'.repeat(13) + '1'.repeat(8) + '2'.repeat(w - 21);
  const data = {
    id: 't', size: { w, h }, time: 'day', terrain: Array(h).fill('g'.repeat(w)), elevation: Array(h).fill(row), overlay: Array(h).fill('.'.repeat(w)),
    units: [], structures: [{ id: 'fd', type: 'fuelDepot', x: 21, y: 9, alertGroup: 'g' }], paths: {}, areas: {}, alertGroups: {}, friendlies: [], objectives: [],
    player: { x: px, y: py, facing: 'E', loadout: { rifle: 20 } },
  };
  const g = /** @type {any} */ ({
    app: { params: new URLSearchParams(), save: {}, persist() {} }, settings: {}, mode: 'normal', cam: { shake() {} },
    hud: { say() {}, toast(t) { g.toasts.push(t); } }, toasts: [], renderer: { addMarker() {} },
    scope: { openOn(t) { g.scoped = t; return true; } },
  });
  g.world = new World(data, { seed: 3 });
  g.combat = new CombatSystem(g); g.vehicles = new VehicleSystem(g); g.structures = new StructureSystem(g); g.enemies = new EnemySystem(g);
  g.engage = new Engage(g);
  const s = g.world.structures[0];
  // the pseudo-target GameScene.structureTarget() builds for a building's snipeable parts
  g.target = { kind: 'structure', structure: s, x: s.cx, y: s.y + s.h - 0.2, get tx() { return Math.floor(this.x); }, get ty() { return Math.floor(this.y); }, get dead() { return s.dead; }, name: s.def.name };
  return g;
}

test('a building seen side-on is not hidden by its own footprint (M2 Fuel Depot from the West Ridge)', () => {
  const g = canyon(11, 10), m = g.world.map, t = g.target;
  assert.equal(canSee(m, 11, 10, t.tx, t.ty, {}), false, 'the line to the centre column crosses the near column');
  assert.equal(seesTarget(m, 11, 10, t), true, 'but the near column is in plain sight');
  assert.ok(Math.abs(targetDist(11.5, 10.5, t) - 9.5) < 1e-6, 'range is measured to the near edge');
});

test('a long shot (in hunker range only) walks nowhere: WREN hunkers, then the scope opens', () => {
  const g = canyon(11, 10), op = g.world.operative;
  g.engage.engage(g.target, { force: true });
  assert.equal(g.engage.needHunker, true);
  assert.ok(g.toasts.some((s) => /HUNKER/.test(s)));
  for (let t = 0; t < 2.5 && !g.scoped; t += DT) { g.world.time += DT; op.update(DT); g.engage.update(DT); }
  assert.equal(op.stance, 'hunker');
  assert.equal(op.tx, 11, 'no need to move');
  assert.equal(g.scoped, g.target);
});

test('out of hunker range: the planner walks to a rim tile and hunkers there', () => {
  const g = canyon(3, 10), op = g.world.operative;
  g.engage.engage(g.target, { force: true });
  assert.equal(g.engage.dest?.x, 11, `dest ${JSON.stringify(g.engage.dest)}`);
  for (let t = 0; t < 12 && !g.scoped; t += DT) { g.world.time += DT; op.update(DT); g.engage.update(DT); }
  assert.equal(g.scoped, g.target);
  assert.equal(op.stance, 'hunker');
  assert.ok(targetDist(op.x, op.y, g.target) <= 10);
});
