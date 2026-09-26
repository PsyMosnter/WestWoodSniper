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
import { Lighting } from '../src/render/lighting.js';
import { StrikeSystem } from '../src/strike/strike.js';
import { TunnelSystem } from '../src/world/tunnels.js';
import { BALANCE } from '../src/config/balance.js';

const DT = 1 / 30;

function setup(extra = {}) {
  const w = extra.w || 60, h = extra.h || 40, row = (c) => c.repeat(w);
  const data = {
    id: 't', size: { w, h }, time: extra.time || 'day', terrain: Array(h).fill(row('g')), elevation: Array(h).fill(row('0')), overlay: Array(h).fill(row('.')),
    units: extra.units || [], structures: extra.structures || [], paths: {}, areas: {}, alertGroups: extra.alertGroups || {},
    friendlies: extra.friendlies || [], lights: extra.lights || [], tunnels: extra.tunnels || [], objectives: [],
    player: { x: extra.px ?? 5, y: extra.py ?? 5, facing: 'E', loadout: { rifle: 20, designator: 1 } },
  };
  const said = [];
  const game = {
    app: { params: new URLSearchParams(), save: {}, persist() {} }, settings: {}, awareness: null, mode: 'normal',
    cam: { shake() {}, follow: true }, audio: null,
    hud: { say(t) { said.push(t); }, toast(t) { said.push('TOAST ' + t); }, peekObjectives() {} }, said,
  };
  game.world = new World(data, { seed: 11 });
  game.combat = new CombatSystem(game);
  game.vehicles = new VehicleSystem(game);
  game.structures = new StructureSystem(game);
  game.enemies = new EnemySystem(game);
  game.props = new PropSystem(game);
  game.friendlies = new FriendlySystem(game);
  game.lighting = new Lighting(game);
  game.strike = new StrikeSystem(game);
  game.tunnels = new TunnelSystem(game);
  return game;
}
const tick = (g, secs, fn = () => {}) => {
  for (let t = 0; t < secs; t += DT) {
    g.world.time += DT;
    g.world.operative.update(DT);
    g.enemies.update(DT); g.structures.update(DT); g.combat.update(DT);
    g.strike.update(DT); g.tunnels.update(DT);
    g.world.fog.update(g.world.visionSources());
    fn();
  }
};

test('night: campfires light the ground around them (walls cast darkness); day has no lighting', () => {
  const day = setup({});
  assert.equal(day.world.isLit(10, 10), false);
  const g = setup({ time: 'night', lights: [{ x: 20, y: 20, r: 3 }] });
  assert.equal(g.world.isLit(20, 20), true);
  assert.equal(g.world.isLit(22, 20), true);
  assert.equal(g.world.isLit(26, 20), false);
});

test('night: a lit target fills the detection meter faster than one in the dark', async () => {
  const { fillRate, visionOf } = await import('../src/ai/perception.js');
  const g = setup({ time: 'night', lights: [{ x: 20, y: 20, r: 3 }], units: [{ id: 'e', type: 'husk', x: 20, y: 15, alertGroup: 'a', facing: 'S' }] });
  const u = g.world.units[0];
  const vis = visionOf(u, g.world);
  const lit = fillRate(u, { x: 20.5, y: 19.5, visibilityFactor: () => 1 }, 4.5, vis, g.world);
  const dark = fillRate(u, { x: 24.5, y: 19.5, visibilityFactor: () => 1 }, 4.5, vis, g.world);
  assert.ok(lit > dark * 1.3, `lit ${lit.toFixed(3)} vs dark ${dark.toFixed(3)}`);
});

test('designator: blocked inside jammer coverage, allowed outside, spends the charge only on completion', () => {
  const g = setup({ px: 15, py: 20, structures: [{ id: 'j', type: 'jammer', x: 30, y: 5, alertGroup: 'a' }] });
  const op = g.world.operative;
  g.world.fog.revealAll = true; g.world.fog.update(g.world.visionSources());
  op.stance = 'crouch';
  g.strike.toggleTargeting();
  assert.equal(g.strike.state, 'targeting');
  g.strike.tapTarget(22, 12);                     // within 14 tiles of the jammer
  assert.notEqual(g.strike.state, 'channel');
  assert.ok(g.said.some((s) => /JAMMER/.test(s)));
  g.strike.state = 'targeting';
  g.strike.tapTarget(12, 30);                     // clear of the jammer, in range and LOS
  assert.equal(g.strike.state, 'channel');
  assert.equal(op.designator, 1, 'not spent while channelling');
  tick(g, BALANCE.strike.channel + 0.2);
  assert.equal(op.designator, 0);
  assert.equal(g.strike.state, 'inbound');
});

test('designator: moving breaks the channel and keeps the charge', () => {
  const g = setup({ px: 5, py: 20 });
  const op = g.world.operative;
  g.world.fog.revealAll = true; g.world.fog.update(g.world.visionSources());
  op.stance = 'crouch';
  g.strike.toggleTargeting();
  g.strike.tapTarget(14, 20);
  tick(g, 2);
  op.orderMove(8, 25, 'walk');
  tick(g, 0.5);
  assert.equal(g.strike.state, 'idle');
  assert.equal(op.designator, 1);
});

test('strike impact: inner radius destroys, outer kills infantry, the flash blinds further out', () => {
  const g = setup({
    px: 2, py: 38,
    units: [{ id: 'a', type: 'husk', x: 30, y: 20, alertGroup: 'g' }, { id: 'b', type: 'husk', x: 36, y: 20, alertGroup: 'g' }, { id: 'c', type: 'husk', x: 40, y: 20, alertGroup: 'g' }],
    structures: [{ id: 'bar', type: 'barracks', x: 29, y: 22, alertGroup: 'g' }],
  });
  g.strike.target = { x: 30.5, y: 20.5 };
  g.strike.impact();
  const [a, b, c] = g.world.units.filter((u) => ['a', 'b', 'c'].includes(u.id));
  assert.equal(a.dead, true);
  assert.equal(b.dead, true);
  assert.equal(c.dead, false);
  assert.ok(c.blindT > 0, 'flash-blinded');
  assert.equal(g.world.structures[0].dead, true);
});

test('culvert tunnel: WREN is hidden in transit and comes out the other end', () => {
  const g = setup({ px: 10, py: 10, tunnels: [{ id: 'cv', a: { x: 10, y: 10 }, b: { x: 30, y: 10 }, time: 4 }] });
  const op = g.world.operative;
  const e = g.tunnels.endAt(10, 10);
  g.tunnels.enter(e);
  assert.equal(op.hidden, true);
  tick(g, 4.2);
  assert.equal(op.hidden, false);
  assert.ok(Math.abs(op.x - 30.5) < 0.1 && Math.abs(op.y - 10.5) < 0.1);
});

test('checkpoint: snapshot → fresh mission → restore brings back deaths, rubble, rescued friendlies and objectives', async () => {
  const { MissionRunner } = await import('../src/missions/runner.js');
  const { Objectives } = await import('../src/missions/objectives.js');
  const { snapshot, restore } = await import('../src/missions/checkpoint.js');
  const mk = () => {
    const g = setup({
      px: 5, py: 5,
      units: [{ id: 'a', type: 'husk', x: 20, y: 20, alertGroup: 'g' }, { id: 'b', type: 'husk', x: 25, y: 20, alertGroup: 'g' }],
      structures: [{ id: 'silo', type: 'silo', x: 40, y: 10, alertGroup: 'g' }],
      friendlies: [{ id: 'sci', type: 'scientist', x: 10, y: 10, captive: true }],
    });
    g.world.data.objectives = [{ id: 'o1', type: 'RESCUE', units: ['sci'], primary: true }];
    g.objectives = new Objectives(g, g.world.data.objectives);
    g.runner = new MissionRunner(g);
    return g;
  };
  const g1 = mk();
  g1.combat.kill(g1.world.units.find((u) => u.id === 'a'), { by: 'rifle', source: 'player' });
  g1.structures.destroy(g1.world.structures[0], { by: 'c4' });
  const f = g1.world.friendlies[0]; f.captive = false; f.mode = 'follow'; f.x = 12.5;
  g1.objectives.complete('o1');
  g1.world.operative.x = 30.5; g1.world.operative.y = 30.5;
  const snap = JSON.parse(JSON.stringify(snapshot(g1)));
  const g2 = mk();
  restore(g2, snap);
  assert.equal(g2.world.units.find((u) => u.id === 'a').dead, true);
  assert.equal(g2.world.units.find((u) => u.id === 'b').dead, false);
  assert.equal(g2.world.structures[0].dead, true);
  assert.equal(g2.world.friendlies[0].captive, false);
  assert.equal(g2.objectives.get('o1').done, true);
  assert.equal(g2.world.operative.x, 30.5);
});

test('night: a tower\'s own searchlight on WREN is instant detection; with the lens shot out it is not', () => {
  const mk = (lightDead) => {
    // 9 tiles south of the tower: outside its night vision (10 × 0.65) but inside the 10-tile beam
    const g = setup({ time: 'night', px: 20, py: 19, structures: [{ id: 'tw', type: 'guardTower', x: 20, y: 10, alertGroup: 'a', facing: 'S' }] });
    if (lightDead) g.world.structures[0].st = { ...g.world.structures[0].st, lightDead: true };
    g.world.operative.stance = 'crouch';
    const gunner = g.world.units.find((u) => u.id === 'tw:gunner');
    gunner.percT = 0;
    tick(g, 0.1);
    return gunner;
  };
  const lit = mk(false), dark = mk(true);
  assert.equal(lit.det, 1);
  assert.equal(lit.state, 'combat');
  assert.equal(dark.det, 0);
});

test('tower gunners do not see WREN while he is hidden (in a culvert, aboard the dropship)', () => {
  const g = setup({ px: 20, py: 14, structures: [{ id: 'tw', type: 'guardTower', x: 20, y: 10, alertGroup: 'a', facing: 'S' }] });
  const gunner = g.world.units.find((u) => u.id === 'tw:gunner');
  g.world.operative.hidden = true;
  tick(g, 1);
  assert.equal(gunner.seesOp, false);
  assert.equal(gunner.det, 0);
  g.world.operative.hidden = false;
  let saw = false;
  tick(g, 6, () => { saw ||= gunner.seesOp; });          // one full sweep of the tower
  assert.equal(saw, true, 'control: in plain sight he is seen');
});

test('culvert guard: going through while it lives costs a bite and extra time; it dies unseen', () => {
  const g = setup({
    px: 10, py: 10,
    units: [{ id: 'cv1', type: 'sniffer', x: 20, y: 10, alertGroup: 'c' }],
    tunnels: [{ id: 'cv', a: { x: 10, y: 10 }, b: { x: 30, y: 10 }, time: 4, guard: 'cv1' }],
  });
  const guard = g.world.units.find((u) => u.id === 'cv1'), op = g.world.operative, hp0 = op.hp;
  assert.equal(guard.hidden, true, 'the guard lives in the dark, not on the map');
  g.tunnels.enter(g.tunnels.endAt(10, 10));
  tick(g, 4.2);
  assert.equal(op.hidden, true, 'the scuffle takes longer than a clear run');
  assert.equal(guard.dead, true);
  assert.equal(op.hp, hp0 - BALANCE.tunnel.guardDamage);
  tick(g, BALANCE.tunnel.guardFight);
  assert.equal(op.hidden, false);
  assert.ok(Math.abs(op.x - 30.5) < 0.1);
  assert.equal(g.world.stats.kills, 1);
  assert.equal(g.world.corpses.length, 0, 'no body for patrols to find');
});

test('strike: a hardened structure takes a quarter of its max HP (the multiplier is applied once)', () => {
  const g = setup({ px: 2, py: 38, structures: [{ id: 'sp', type: 'hiveSpire', x: 30, y: 18, alertGroup: 'g', hardened: true }] });
  const sp = g.world.structures[0];
  g.strike.target = { x: sp.cx, y: sp.cy };
  g.strike.impact();
  assert.equal(sp.dead, false);
  assert.ok(Math.abs(sp.hp - sp.maxHp * (1 - BALANCE.strike.hardenedMult)) < 1, `hp ${sp.hp} of ${sp.maxHp}`);
  sp.hardened = false;
  g.strike.target = { x: sp.cx, y: sp.cy };
  g.strike.impact();
  assert.equal(sp.dead, true, 'unshielded, one strike destroys it');
});

test('strike fallout hurts 4 HP a second (damage over time is not rounded up every tick)', () => {
  const g = setup({ px: 20, py: 20 });
  const op = g.world.operative, hp0 = op.hp;
  g.strike.fallout.push({ x: 20.5, y: 20.5, t: 60 });
  tick(g, 5);
  const lost = hp0 - op.hp;
  assert.ok(lost >= 19 && lost <= 21, `lost ${lost} HP in 5 s`);
});

test('checkpoint: strike craters and the mission clock survive a restore', async () => {
  const { MissionRunner } = await import('../src/missions/runner.js');
  const { Objectives } = await import('../src/missions/objectives.js');
  const { snapshot, restore } = await import('../src/missions/checkpoint.js');
  const mk = () => { const g = setup({}); g.objectives = new Objectives(g, []); g.runner = new MissionRunner(g); return g; };
  const g1 = mk();
  g1.strike.crater(30.5, 20.5);
  g1.countdown = { label: 'SHIFT CHANGE', until: 75 };
  const snap = JSON.parse(JSON.stringify(snapshot(g1)));
  const g2 = mk();
  assert.equal(g2.world.map.walkable(30, 20), true);
  restore(g2, snap);
  assert.equal(g2.world.map.walkable(30, 20), false, 'crater centre is impassable again');
  assert.deepEqual(g2.countdown, { label: 'SHIFT CHANGE', until: 75 });
});

test('strike flash blinds a tower gunner for 5 s, then it sees again', () => {
  const g = setup({ px: 2, py: 38, structures: [{ id: 'tw', type: 'guardTower', x: 40, y: 20, alertGroup: 'g', facing: 'W' }] });
  const gunner = g.world.units.find((u) => u.id === 'tw:gunner');
  g.strike.target = { x: 30.5, y: 20.5 };            // 10 tiles away: inside the flash radius, outside the blast
  g.strike.impact();
  assert.equal(gunner.dead, false);
  assert.ok(gunner.blindT > 0, 'flash-blinded');
  tick(g, BALANCE.strike.blindTime + 0.2);
  assert.equal(gunner.blindT, 0, 'the flash wears off');
});
