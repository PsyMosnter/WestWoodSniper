// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Art } from '../src/render/artStyle.js';
import { ZONES } from '../src/render/model3d.js';
import '../src/render/spriteData/newInfantry.js';
import { renderVehicle } from '../src/render/spriteData/newVehicles.js';
import { renderMini, MINI, FW, FH, FAX, FAY } from '../src/render/spriteData/rtsInfantry.js';
import { rtsFilterPix } from '../src/render/spriteData/rtsVehicles.js';
import { createBlast, BLAST_LIFE } from '../src/render/rtsBlast.js';
import { unitSprite, unitVariant } from '../src/render/sprites.js';
import { vehicleSprite } from '../src/render/spriteData/vehicles.js';
import { zoneAtMap, magnifiedSprite } from '../src/render/spriteData/scopeSprites.js';
import { BLOOD } from '../src/config/palette.js';
import { World } from '../src/world/world.js';
import { EnemySystem } from '../src/ai/enemies.js';
import { CombatSystem } from '../src/combat/system.js';

const AWAY = 0, EAST = 2, TOWARDS = 4, WEST = 6;
function zonesOf(type, pose, dir, frame = 0, variant = '') {
  const r = renderMini(type, pose, dir, frame, variant), c = {};
  for (const z of r.zone) if (z && z !== 255) c[ZONES[z]] = (c[ZONES[z]] || 0) + 1;
  return c;
}
const humanoids = Object.keys(MINI).filter((t) => !MINI[t].beast);

test('Newest: its own painters where it has them, New where it does not, nothing in Classic; per-style frame counts', () => {
  Art.setStyle('classic');
  assert.equal(Art.painter('unit', 'husk'), null);
  assert.deepEqual([Art.frames('walk'), Art.frames('dead')], [4, 4]);
  Art.setStyle('newest');
  assert.equal(Art.source('unit', 'husk'), 'newest');
  assert.equal(Art.source('vehicle', 'skitter'), 'newest');
  assert.deepEqual([Art.frames('walk'), Art.frames('run'), Art.frames('pistol'), Art.frames('dead')], [6, 6, 6, 12]);
  const s = unitSprite('husk', 'idle', 4, 0);
  assert.deepEqual([s.w, s.h, s.ax, s.ay], [FW, FH, FAX, FAY], '64×48 frames, feet at (32, 36)');
  assert.ok(s.zoneMap && s.shadow, 'hit zones and its own ground shadow');
  Art.setStyle('new');
  assert.notEqual(unitSprite('husk', 'idle', 4, 0).w, FW, 'the New sprite again (separately cached)');
  Art.setStyle('classic');
});

test('Newest infantry: every frame of every type renders inside its 64×48 frame', () => {
  const poses = [['idle', 1], ['walk', 6], ['run', 6], ['crouch', 1], ['cover', 1], ['fire', 2], ['pistol', 6], ['prone', 1], ['crawl', 4], ['dead', 12]];
  for (const type of Object.keys(MINI)) for (const [pose, frames] of poses) for (let f = 0; f < frames; f++) for (let d = 0; d < 8; d++) {
    for (const v of pose === 'dead' ? ['dk-shot', 'dk-takedown', 'dk-explosion'] : ['']) {
      const r = renderMini(type, pose, d, f, v);
      let body = 0, edge = 0;
      for (let i = 0; i < r.px.length; i++) if (r.px[i]) { body++; const x = i % r.w, y = Math.floor(i / r.w); if (x === 0 || y === 0 || x === r.w - 1 || y === r.h - 1) edge++; }
      assert.ok(body >= 8, `${type} ${pose}${f} dir ${d} ${v} is visible`);
      assert.equal(edge, 0, `${type} ${pose}${f} dir ${d} ${v} touches the frame edge`);
    }
  }
});

test('Newest: 8 real facings, 6 distinct run and walk frames, a head from every direction', () => {
  for (const t of ['operative', 'husk']) for (const pose of ['walk', 'run']) {
    assert.equal(new Set([0, 1, 2, 3, 4, 5].map((f) => renderMini(t, pose, EAST, f).px.join())).size, 6, `${t} ${pose}`);
  }
  // W is drawn, not mirrored: it differs from the mirror image of E
  const E = renderMini('operative', 'run', EAST, 1), W = renderMini('operative', 'run', WEST, 1);
  const mirrorE = E.px.map((_, i) => E.px[Math.floor(i / E.w) * E.w + (E.w - 1 - (i % E.w))]);
  assert.notEqual(W.px.join(), mirrorE.join());
  for (const t of humanoids) for (let d = 0; d < 8; d++) assert.ok(zonesOf(t, 'idle', d).head > 0, `${t} dir ${d}`);
});

test('Newest weak spots follow SPEC §12.1: tank/pod/radio from behind and the sides, never from the front; belt from the front', () => {
  for (const [type, spot] of [['scorcher', 'fuelTank'], ['launcher', 'rocketPod'], ['warden', 'radio']]) {
    assert.ok(!zonesOf(type, 'idle', TOWARDS)[spot], `${type}: no ${spot} facing the camera`);
    assert.ok(zonesOf(type, 'idle', AWAY)[spot] > 0, `${type}: ${spot} from behind`);
    assert.ok(zonesOf(type, 'idle', EAST)[spot] > 0 && zonesOf(type, 'idle', WEST)[spot] > 0, `${type}: ${spot} from the sides`);
  }
  assert.ok(zonesOf('lobber', 'idle', TOWARDS).grenadeBelt > 1, 'belt from the front');
  assert.ok(zonesOf('lobber', 'idle', EAST).grenadeBelt > 0 && zonesOf('lobber', 'idle', WEST).grenadeBelt > 0, 'belt from the sides');
  for (const t of ['husk', 'harvester']) for (let d = 0; d < 8; d++) {
    const z = zonesOf(t, 'idle', d);
    assert.ok(!z.grenadeBelt && !z.fuelTank && !z.rocketPod && !z.radio, `${t} carries no weak spot`);
  }
  for (let d = 0; d < 8; d += 2) assert.ok(zonesOf('vrask', 'idle', d).helmet > 0, `Vrask's helmet, dir ${d}`);
  const bare = zonesOf('vrask', 'idle', TOWARDS, 0, 'nohelm');
  assert.ok(!bare.helmet && bare.head > 0, 'without the helmet the head is bare');
});

test('Newest deaths: shot, takedown and explosion play differently; blood is the unit\'s own colour and never red', () => {
  const last = (k) => renderMini('husk', 'dead', EAST, 11, 'dk-' + k).px.join();
  assert.equal(new Set([last('shot'), last('takedown'), last('explosion')]).size, 3);
  assert.equal(new Set(Array.from({ length: 12 }, (_, f) => renderMini('husk', 'dead', EAST, f, 'dk-shot').px.join())).size, 12, 'twelve distinct frames');
  const coolant = BLOOD.find((b) => b.name === 'coolant');
  const mid = renderMini('husk', 'dead', EAST, 3, 'dk-shot|bl-coolant').px;
  assert.ok(mid.includes(coolant.main) || mid.includes(coolant.hi), 'coolant-blue spray for a coolant-blooded unit');
  const red = (c) => { const n = parseInt(c.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return r > 150 && g < 80 && b < 80; };
  for (const k of ['shot', 'explosion']) for (let f = 0; f < 12; f++) assert.ok(!renderMini('husk', 'dead', EAST, f, 'dk-' + k).px.some((c) => c && red(c)), `no red, ${k} ${f}`);
  assert.equal(renderMini('husk', 'dead', EAST, 5, 'dk-takedown').px.some((c) => BLOOD.some((b) => b.main === c)), false, 'a takedown sprays nothing');
});

test('kills record how the unit died and which way it falls; the sprite variant carries it', () => {
  const w = 30, h = 20, row = (c) => c.repeat(w);
  const data = {
    id: 't', size: { w, h }, terrain: Array(h).fill(row('g')), elevation: Array(h).fill(row('0')), overlay: Array(h).fill(row('.')),
    units: [{ id: 'a', type: 'husk', x: 10, y: 10, alertGroup: 'x' }, { id: 'b', type: 'husk', x: 14, y: 10, alertGroup: 'x' }, { id: 'c', type: 'husk', x: 18, y: 10, alertGroup: 'x' }],
    paths: {}, areas: {}, alertGroups: {}, player: { x: 4, y: 10, facing: 'E', loadout: { rifle: 20 } },
  };
  const g = /** @type {any} */ ({ app: { params: new URLSearchParams() }, hud: { toast() {}, say() {} }, settings: {}, cam: { shake() {} } });
  g.world = new World(data, { seed: 3 });
  g.combat = new CombatSystem(g); g.enemies = new EnemySystem(g);
  const [a, b, c] = g.world.units;
  g.combat.kill(a, { by: 'rifle', source: 'player', dir: 0 });              // shot from the west, travelling east
  g.combat.kill(b, { by: 'knife', source: 'player', dir: 0 });              // taken down from behind (the west)
  g.combat.kill(c, { by: 'explosion', source: 'player', dir: Math.PI });    // blast from the east
  assert.deepEqual([a.deathKind, b.deathKind, c.deathKind], ['shot', 'takedown', 'explosion']);
  assert.deepEqual([a.deathDir, b.deathDir, c.deathDir], [WEST, EAST, EAST], 'faces the shot and falls back; slumps forward from a takedown');
  assert.match(unitVariant(a), /dk-shot\|bl-\w+/);
});

test('Newest vehicles: the New sprite through the RTS filter — same size and hit zones, every facing', () => {
  Art.setStyle('newest');
  for (const type of ['skitter', 'hauler', 'crawler', 'brute', 'juggernaut', 'medTruck']) for (let d = 0; d < 8; d++) {
    const s = vehicleSprite(type, d, 'ok'), n = renderVehicle(type, d, 'ok');
    assert.deepEqual([s.w, s.h], [n.w, n.h], `${type} ${d}`);
    assert.ok(s.zoneMap, `${type} ${d}: scope hit zones kept`);
  }
  const base = renderVehicle('skitter', 2, 'ok').pix, f = rtsFilterPix(base);
  let a = 0, b = 0;
  for (let i = 0; i < base.data.length; i++) { if (base.data[i] >>> 24) a++; if (f.data[i] >>> 24) b++; }
  assert.ok(b > a, 'the silhouette gains its dark edge');
  Art.setStyle('classic');
});

test('Newest blasts: deterministic, the debris settles, and it all stays near the blast', () => {
  const calls = (seed, t) => {
    const out = [];
    const g = /** @type {any} */ ({ fillStyle: '', globalAlpha: 1, fillRect(x, y, w, h) { out.push([x, y, w, h, this.fillStyle]); } });
    createBlast('building', seed, 1.5)(g, 0, 0, t);
    return out;
  };
  assert.deepEqual(calls(7, 0.4), calls(7, 0.4));
  assert.notDeepEqual(calls(7, 0.4), calls(8, 0.4));
  const late = calls(7, BLAST_LIFE - 0.1);
  assert.ok(late.length > 0 && late.every(([x, y]) => Math.abs(x) < 140 && Math.abs(y) < 90), 'debris lies within reach of the blast');
});

test('Newest scope: a round on a head pixel of the magnified map sprite is a head hit', () => {
  const r = renderMini('husk', 'idle', TOWARDS, 0);
  const s = magnifiedSprite({ canvas: null, ax: r.ax, ay: r.ay, w: r.w, h: r.h, zoneMap: r.zone }, 4);
  let hx = -1, hy = -1;
  for (let i = 0; i < r.zone.length && hx < 0; i++) if (ZONES[r.zone[i]] === 'head') { hx = i % r.w; hy = Math.floor(i / r.w); }
  assert.equal(zoneAtMap(s, hx * 4 + 2, hy * 4 + 2)?.name, 'head');
});
