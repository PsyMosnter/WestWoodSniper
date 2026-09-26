// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Art } from '../src/render/artStyle.js';
import { Model, rasterize, ZONES, Z, Z_PASS, ELEV } from '../src/render/model3d.js';
import { renderInfantry, INFANTRY, NW, NH, NAX, NAY } from '../src/render/spriteData/newInfantry.js';
import { unitSprite, markerLift, warmQueue, warmStep } from '../src/render/sprites.js';
import { zoneAtMap, magnifiedSprite } from '../src/render/spriteData/scopeSprites.js';
import { World } from '../src/world/world.js';
import { EnemySystem } from '../src/ai/enemies.js';
import { CombatSystem } from '../src/combat/system.js';
import { Scope } from '../src/scope/scope.js';
import { Time } from '../src/core/time.js';

/** hit-zone pixel counts of one frame */
function zonesOf(type, pose, dir, frame = 0, variant = '') {
  const r = renderInfantry(type, pose, dir, frame, variant), c = {};
  for (const z of r.zone) if (z) c[ZONES[z]] = (c[ZONES[z]] || 0) + 1;
  return c;
}
// facing dir indices: 0 = north (away from the camera), 2 = east, 4 = south (towards the camera), 6 = west
const AWAY = 0, EAST = 2, TOWARDS = 4, WEST = 6;

test('every New infantry frame renders inside its canvas (nothing clipped at the edges)', () => {
  const poses = [['idle', 1], ['walk', 4], ['run', 4], ['crouch', 1], ['cover', 1], ['fire', 2], ['pistol', 4], ['prone', 1], ['crawl', 4], ['dead', 4]];
  for (const type of Object.keys(INFANTRY)) for (const [pose, frames] of poses) for (let f = 0; f < frames; f++) for (let d = 0; d < 8; d++) {
    const { pix, zone, w, h } = renderInfantry(type, pose, d, f);
    assert.equal(zone.length, w * h);
    let edge = 0, body = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!(pix.data[y * w + x] >>> 24)) continue;
      body++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge++;
    }
    assert.ok(body > 20, `${type} ${pose}${f} dir ${d} is visible`);
    assert.equal(edge, 0, `${type} ${pose}${f} dir ${d} touches the canvas edge`);
  }
});

test("WREN hunkered: a flat sniper under a ghillie scrim; crawling cycles through four different frames", () => {
  for (let d = 0; d < 8; d++) {
    const prone = renderInfantry('operative', 'prone', d, 0), stand = renderInfantry('operative', 'crouch', d, 0);
    const rows = (s) => { let top = s.h, bot = 0; for (let i = 0; i < s.zone.length; i++) if (s.pix.data[i] >>> 24) { const y = Math.floor(i / s.w); top = Math.min(top, y); bot = Math.max(bot, y); } return s.ay - top; };
    assert.ok(rows(prone) < rows(stand), `dir ${d}: lower than kneeling`);
    const frames = [0, 1, 2, 3].map((f) => Array.from(renderInfantry('operative', 'crawl', d, f).pix.data).join(','));
    assert.equal(new Set(frames).size, 4, `dir ${d}: four distinct crawl frames`);
    assert.ok(zonesOf('operative', 'crawl', d).head > 0);
  }
});

test('every standing figure shows a head from all eight directions', () => {
  for (const type of Object.keys(INFANTRY)) for (let d = 0; d < 8; d++) {
    assert.ok(zonesOf(type, 'idle', d).head > 0, `${type} dir ${d}`);
  }
});

test('weak spots show where SPEC §12.1 puts them: tank/pod/radio from behind and the sides, belt from the front', () => {
  for (const [type, spot] of [['scorcher', 'fuelTank'], ['launcher', 'rocketPod'], ['warden', 'radio']]) {
    assert.ok(!zonesOf(type, 'idle', TOWARDS)[spot], `${type}: no ${spot} facing the camera`);
    assert.ok(zonesOf(type, 'idle', AWAY)[spot] > 4, `${type}: ${spot} from behind`);
    assert.ok(zonesOf(type, 'idle', EAST)[spot] > 4 && zonesOf(type, 'idle', WEST)[spot] > 4, `${type}: ${spot} from the sides`);
  }
  assert.ok(zonesOf('lobber', 'idle', TOWARDS).grenadeBelt > 4, 'belt from the front');
  assert.ok(zonesOf('lobber', 'idle', EAST).grenadeBelt > 0 && zonesOf('lobber', 'idle', WEST).grenadeBelt > 0, 'belt from the sides');
  for (const t of ['husk', 'harvester']) for (let d = 0; d < 8; d++) {
    const z = zonesOf(t, 'idle', d);
    assert.ok(!z.grenadeBelt && !z.fuelTank && !z.rocketPod && !z.radio, `${t} carries no weak spot`);
  }
});

test("Vrask's helmet takes the first head shot, and is gone in the 'nohelm' variant", () => {
  for (let d = 0; d < 8; d++) assert.ok(zonesOf('vrask', 'idle', d).helmet > 0, `helmet dir ${d}`);
  const bare = zonesOf('vrask', 'idle', 4, 0, 'nohelm');
  assert.ok(!bare.helmet && bare.head > 0);
});

test('a shot through an arm held across the chest counts as a chest hit; a part far in front does not pass', () => {
  const mat = { ramp: ['#222222', '#444444', '#666666', '#888888'] };
  const at = (m) => { const r = rasterize(m, { w: 21, h: 21, ax: 10, ay: 14, outline: '#000000', soft: Z.limb }); return ZONES[r.zone[10 * 21 + 10]]; };
  // a torso ball; things placed along the line of sight towards the camera cover its centre pixel
  const C = [0, 0, 4.8], V = [0, Math.cos(ELEV), Math.sin(ELEV)];
  const toCam = (d) => [C[0], C[1] + V[1] * d, C[2] + V[2] * d];
  const along = (d) => [[toCam(d)[0] - 3, toCam(d)[1], toCam(d)[2]], [toCam(d)[0] + 3, toCam(d)[1], toCam(d)[2]]];
  const torso = () => new Model().ellipsoid(C, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [4, 4, 4], mat, Z.torso);
  assert.equal(at(torso()), 'torso');
  assert.equal(at(torso().capsule(...along(5), 1, mat, Z.limb)), 'torso', 'an arm across the chest');
  assert.equal(at(torso().capsule(...along(10), 1, mat, Z.limb)), 'limb', 'well clear of the body: an arm hit');
  // a weapon never takes the hit itself
  assert.equal(at(torso().box(toCam(5), [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [3, 0.5, 0.5], mat, Z_PASS)), 'torso');
});

test('magnified sprites resolve hits per pixel; assisted aim reaches a little further', () => {
  const r = renderInfantry('husk', 'idle', 4, 0);
  const m = { canvas: null, ax: r.ax, ay: r.ay, w: r.w, h: r.h, zoneMap: r.zone };
  const s = magnifiedSprite(m, 4);
  assert.deepEqual([s.w, s.h, s.ax, s.ay], [NW * 4, NH * 4, NAX * 4, NAY * 4]);
  // topmost head pixel: hit in its middle, miss just above it unless the zone grows
  let hx = -1, hy = -1;
  for (let i = 0; i < r.zone.length && hx < 0; i++) if (ZONES[r.zone[i]] === 'head') { hx = i % NW; hy = Math.floor(i / NW); }
  assert.equal(zoneAtMap(s, hx * 4 + 2, hy * 4 + 2)?.name, 'head');
  assert.equal(zoneAtMap(s, hx * 4 + 2, hy * 4 - 1), null);
  assert.equal(zoneAtMap(s, hx * 4 + 2, hy * 4 - 1, 1.2)?.name, 'head');
});

test('overhead markers rise with taller New figures; Classic keeps the tuned heights', () => {
  assert.equal(markerLift(null, 20), 20);
  assert.equal(markerLift({ top: 10 }, 20), 20);
  assert.equal(markerLift({ top: 22 }, 20), 28);
});

test('warm-up queue: nothing to do in Classic; in New the common frames come first', () => {
  Art.setStyle('classic');
  assert.equal(warmQueue([{ type: 'husk', poses: [['idle', 1], ['walk', 4]] }]).length, 0);
  Art.setStyle('new');
  const q = warmQueue([{ type: 'husk', poses: [['idle', 1], ['dead', 4]] }, { type: 'lobber', poses: [['idle', 1]] }]);
  assert.equal(q.length, 8 + 32 + 8);
  assert.deepEqual(q.slice(0, 16).map((j) => j[2]), Array(16).fill('idle'), 'both types idle before any death frame');
  warmStep(q, 1000);
  assert.equal(q.length, 0);
  assert.ok(unitSprite('husk', 'dead', 3, 2).zoneMap, 'frames are cached as New sprites');
  Art.setStyle('classic');
});

test('New scope: a round on a head pixel of the magnified map sprite is a headshot', () => {
  Art.setStyle('new');
  const w = 30, h = 20, row = (c) => c.repeat(w);
  const data = {
    id: 't', size: { w, h }, terrain: Array(h).fill(row('g')), elevation: Array(h).fill(row('0')), overlay: Array(h).fill(row('.')),
    units: [{ id: 'a', type: 'husk', x: 12, y: 10, facing: 'E', alertGroup: 'x', behaviour: { kind: 'sentry' } }],
    paths: {}, areas: {}, alertGroups: {}, player: { x: 18, y: 10, facing: 'W', loadout: { rifle: 20 } },
  };
  const stub = { toast() {}, say() {}, dim: 0 };
  const g = /** @type {any} */ ({ app: { params: new URLSearchParams() }, hud: stub, settings: {}, awareness: { state: 'hidden' }, cam: { shake() {} }, audio: null });
  g.world = new World(data, { seed: 3 });
  g.world.update(0.1);
  g.combat = new CombatSystem(g);
  g.enemies = new EnemySystem(g);
  g.scope = new Scope(g);
  g.scope.D = 260;
  const u = g.world.units[0], s = g.scope;
  const spr = s.spriteFor(u);
  assert.ok(spr.zoneMap, 'the scope magnifies the New map sprite');
  // centre of the head pixels, in map-sprite pixels
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < spr.zoneMap.length; i++) if (ZONES[spr.zoneMap[i]] === 'head') { sx += i % spr.mapW + 0.5; sy += Math.floor(i / spr.mapW) + 0.5; n++; }
  assert.ok(s.openOn(u));
  s.openT = 1; s.sway = { x: 0, y: 0 };
  s.aim = { x: u.x + (sx / n - NAX) / 16, y: u.y + (sy / n - NAY) / 16 };
  s.shoot();
  assert.equal(u.dead, true, 'headshot kills');
  assert.equal(g.world.stats.headshots, 1);
  Time.scale = 1;
  Art.setStyle('classic');
});

// ------------------------------------------------------------------ vehicles
import { renderVehicle, VEHICLE_TYPES } from '../src/render/spriteData/newVehicles.js';
import { VehicleSystem } from '../src/entities/vehicle.js';

function vzones(type, dir, state = 'ok') {
  const r = renderVehicle(type, dir, state), c = {};
  for (const z of r.zone) if (z) c[ZONES[z]] = (c[ZONES[z]] || 0) + 1;
  return c;
}

test('every New vehicle renders inside its canvas, in all facings and states', () => {
  for (const type of VEHICLE_TYPES) for (const state of ['ok', 'nodriver', 'wreck']) for (let d = 0; d < 8; d++) {
    const { pix, w, h } = renderVehicle(type, d, state);
    let edge = 0, body = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!(pix.data[y * w + x] >>> 24)) continue;
      body++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge++;
    }
    assert.ok(body > 150, `${type} ${state} dir ${d} is visible`);
    assert.equal(edge, 0, `${type} ${state} dir ${d} touches the canvas edge`);
  }
});

test("vehicle weak spots: the Skitter's driver is big from every side, truck drivers hide from behind, tanks show their slit only head-on", () => {
  for (let d = 0; d < 8; d++) assert.ok(vzones('skitter', d).driver >= 25, `skitter driver dir ${d}`);
  assert.ok(vzones('skitter', AWAY).jerrycan > 10, 'jerrycans from behind');
  assert.ok(!vzones('skitter', TOWARDS, 'nodriver').driver, 'shot driver: empty seat');
  for (const t of ['hauler', 'fuelHauler']) {
    for (const d of [TOWARDS, EAST, WEST]) assert.ok(vzones(t, d).driver > 5, `${t} driver dir ${d}`);
    assert.ok(!vzones(t, AWAY).driver, `${t}: no driver from behind`);
  }
  for (const d of [AWAY, EAST, WEST]) assert.ok(vzones('fuelHauler', d).tank > 50, `fuel tank dir ${d}`);
  for (const t of ['crawler', 'brute', 'juggernaut']) {
    const s = vzones(t, TOWARDS).slit;
    assert.ok(s > 0 && s <= 8, `${t}: a tiny slit head-on (${s})`);
    for (const d of [AWAY, EAST, WEST]) assert.ok(!vzones(t, d).slit, `${t}: no slit from dir ${d}`);
  }
  for (const t of ['brute', 'juggernaut']) assert.ok(vzones(t, EAST).turret > 30);
  for (let d = 0; d < 8; d++) assert.ok(!vzones('medTruck', d).driver, 'the GOD truck is not a target');
});

test('New scope: a round on the Skitter driver disables the buggy', () => {
  Art.setStyle('new');
  const w = 30, h = 20, row = (c) => c.repeat(w);
  const data = {
    id: 't', size: { w, h }, terrain: Array(h).fill(row('g')), elevation: Array(h).fill(row('0')), overlay: Array(h).fill(row('.')),
    units: [{ id: 'v', type: 'skitter', x: 12, y: 10, facing: 'S', alertGroup: 'x', behaviour: { kind: 'sentry' } }],
    paths: {}, areas: {}, alertGroups: {}, player: { x: 18, y: 10, facing: 'W', loadout: { rifle: 20 } },
  };
  const stub = { toast() {}, say() {}, dim: 0 };
  const g = /** @type {any} */ ({ app: { params: new URLSearchParams() }, hud: stub, settings: {}, awareness: { state: 'hidden' }, cam: { shake() {} }, audio: null });
  g.world = new World(data, { seed: 3 });
  g.world.update(0.1);
  g.combat = new CombatSystem(g);
  g.vehicles = new VehicleSystem(g);
  g.enemies = new EnemySystem(g);
  g.scope = new Scope(g);
  g.scope.D = 260;
  const v = g.world.units[0], s = g.scope;
  const spr = s.spriteFor(v);
  assert.ok(spr.zoneMap, 'magnified New vehicle sprite');
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < spr.zoneMap.length; i++) if (ZONES[spr.zoneMap[i]] === 'driver') { sx += i % spr.mapW + 0.5; sy += Math.floor(i / spr.mapW) + 0.5; n++; }
  assert.ok(s.openOn(v));
  s.openT = 1; s.sway = { x: 0, y: 0 };
  s.aim = { x: v.x + (sx / n - spr.ax / 4) / 16, y: v.y + (sy / n - spr.ay / 4) / 16 };
  s.shoot();
  assert.equal(v.disabled, true, 'driver down');
  assert.equal(v.driverDown, true);
  assert.equal(s.spriteFor(v).zoneMap.some((z) => ZONES[z] === 'driver'), false, 'the seat is empty now');
  Time.scale = 1;
  Art.setStyle('classic');
});
