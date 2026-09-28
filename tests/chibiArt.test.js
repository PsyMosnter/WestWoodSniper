// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Art } from '../src/render/artStyle.js';
import { ZONES } from '../src/render/model3d.js';
import '../src/render/spriteData/newInfantry.js';
import '../src/render/spriteData/rtsInfantry.js';
import { renderChibi, addGleam, CHIBI, STAND, LIE } from '../src/render/spriteData/chibiInfantry.js';
import { unitSprite } from '../src/render/sprites.js';
import { zoneAtMap, magnifiedSprite } from '../src/render/spriteData/scopeSprites.js';
import { glassesGleam } from '../src/render/renderer.js';
import { BLOOD } from '../src/config/palette.js';

const AWAY = 0, EAST = 2, TOWARDS = 4, WEST = 6;
function zonesOf(type, pose, dir, frame = 0, variant = '') {
  const r = renderChibi(type, pose, dir, frame, variant), c = {};
  for (const z of r.zone) if (z && z !== 255) c[ZONES[z]] = (c[ZONES[z]] || 0) + 1;
  return c;
}
const colours = (r) => { const s = new Set(); for (const v of r.pix.data) if (v >>> 24) s.add(v); return s; };
const hex = (v) => '#' + [v & 255, (v >>> 8) & 255, (v >>> 16) & 255].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
const humanoids = Object.keys(CHIBI).filter((t) => !CHIBI[t].beast);

test('Chibi: its own infantry, Newest/New vehicles through the fallback chain, Newest frame counts', () => {
  Art.setStyle('chibi');
  assert.equal(Art.source('unit', 'husk'), 'chibi');
  assert.equal(Art.source('unit', 'sniffer'), 'chibi');
  assert.deepEqual([Art.frames('walk'), Art.frames('run'), Art.frames('pistol'), Art.frames('dead')], [6, 6, 6, 12]);
  const s = unitSprite('husk', 'idle', 4, 0);
  assert.deepEqual([s.w, s.h, s.ax, s.ay], [STAND.w, STAND.h, STAND.ax, STAND.ay]);
  assert.ok(s.zoneMap && s.shadow && s.top > 20, 'hit zones, a ground shadow and a tall figure (overhead markers clear it)');
  Art.setStyle('newest');
  assert.notEqual(unitSprite('husk', 'idle', 4, 0).w, STAND.w, 'Newest sprite again (separately cached)');
  Art.setStyle('classic');
});

test('Chibi infantry: every frame of every type renders inside its frame', () => {
  const poses = [['idle', 1], ['walk', 6], ['run', 6], ['crouch', 1], ['cover', 1], ['fire', 2], ['pistol', 6], ['prone', 1], ['crawl', 4], ['dead', 12]];
  for (const type of Object.keys(CHIBI)) for (const [pose, frames] of poses) for (let f = 0; f < frames; f++) for (let d = 0; d < 8; d++) {
    for (const v of pose === 'dead' ? ['dk-shot', 'dk-takedown', 'dk-explosion'] : ['']) {
      const r = renderChibi(type, pose, d, f, v);
      let body = 0, edge = 0;
      for (let i = 0; i < r.pix.data.length; i++) if (r.pix.data[i] >>> 24) { body++; const x = i % r.w, y = Math.floor(i / r.w); if (x === 0 || y === 0 || x === r.w - 1 || y === r.h - 1) edge++; }
      assert.ok(body >= 40, `${type} ${pose}${f} dir ${d} ${v} is visible`);
      assert.equal(edge, 0, `${type} ${pose}${f} dir ${d} ${v} touches the frame edge`);
    }
  }
});

test('Chibi: 8 real facings, 6 distinct walk and run frames, a head from every direction', () => {
  for (const t of ['operative', 'husk']) for (const pose of ['walk', 'run']) {
    assert.equal(new Set([0, 1, 2, 3, 4, 5].map((f) => renderChibi(t, pose, EAST, f).pix.data.join())).size, 6, `${t} ${pose}`);
  }
  assert.equal(new Set([0, 1, 2, 3, 4, 5, 6, 7].map((d) => renderChibi('operative', 'idle', d).pix.data.join())).size, 8);
  for (const t of humanoids) for (let d = 0; d < 8; d++) assert.ok(zonesOf(t, 'idle', d).head > 0, `${t} dir ${d}`);
  for (let d = 0; d < 8; d++) assert.ok(zonesOf('sniffer', 'idle', d).head > 0, `sniffer dir ${d}`);
});

test('Chibi weak spots follow SPEC §12.1: tank/pod/radio from behind and the sides, never from the front; belt from the front', () => {
  for (const [type, spot] of [['scorcher', 'fuelTank'], ['launcher', 'rocketPod'], ['warden', 'radio']]) {
    assert.ok(!zonesOf(type, 'idle', TOWARDS)[spot], `${type}: no ${spot} facing the camera`);
    assert.ok(zonesOf(type, 'idle', AWAY)[spot] > 0, `${type}: ${spot} from behind`);
    assert.ok(zonesOf(type, 'idle', EAST)[spot] > 0 && zonesOf(type, 'idle', WEST)[spot] > 0, `${type}: ${spot} from the sides`);
  }
  assert.ok(zonesOf('lobber', 'idle', TOWARDS).grenadeBelt > 1, 'belt from the front');
  for (const t of ['husk', 'harvester', 'operative']) for (let d = 0; d < 8; d++) {
    const z = zonesOf(t, 'idle', d);
    assert.ok(!z.grenadeBelt && !z.fuelTank && !z.rocketPod && !z.radio, `${t} carries no weak spot`);
  }
  for (let d = 0; d < 8; d += 2) assert.ok(zonesOf('vrask', 'idle', d).helmet > 0, `Vrask's helmet, dir ${d}`);
  const bare = zonesOf('vrask', 'idle', TOWARDS, 0, 'nohelm');
  assert.ok(!bare.helmet && bare.head > 0, 'without the helmet the head is bare');
});

test('Chibi deaths: shot, takedown and explosion differ; blood is the unit\'s own colour and never red', () => {
  const last = (k) => renderChibi('husk', 'dead', EAST, 11, 'dk-' + k).pix.data.join();
  assert.equal(new Set([last('shot'), last('takedown'), last('explosion')]).size, 3);
  assert.equal(new Set(Array.from({ length: 12 }, (_, f) => renderChibi('husk', 'dead', EAST, f, 'dk-shot').pix.data.join())).size, 12, 'twelve distinct frames');
  const coolant = BLOOD.find((b) => b.name === 'coolant');
  const mid = [...colours(renderChibi('husk', 'dead', EAST, 3, 'dk-shot|bl-coolant'))].map(hex);
  assert.ok(mid.includes(coolant.main) || mid.includes(coolant.hi), 'coolant-blue spray for a coolant-blooded unit');
  const red = (v) => { const r = v & 255, g = (v >>> 8) & 255, b = (v >>> 16) & 255; return r > 150 && g < 80 && b < 80; };
  for (const t of ['husk', 'operative']) for (const k of ['shot', 'explosion']) for (let f = 0; f < 12; f += 2) assert.ok(![...colours(renderChibi(t, 'dead', EAST, f, 'dk-' + k))].some(red), `no red, ${t} ${k} ${f}`);
  const td = [...colours(renderChibi('husk', 'dead', EAST, 5, 'dk-takedown|bl-coolant'))].map(hex);
  assert.ok(!td.includes(coolant.main), 'a takedown sprays nothing');
  assert.ok(renderChibi('husk', 'dead', EAST, 11, 'dk-shot').lying && !renderChibi('husk', 'idle', EAST).lying);
  assert.deepEqual([renderChibi('husk', 'dead', EAST, 11).w, renderChibi('husk', 'dead', EAST, 11).h], [LIE.w, LIE.h]);
});

test('Chibi: the sun catches WREN\'s glasses — a white band sweeps the lenses, only WREN, only now and then', () => {
  const plain = renderChibi('operative', 'idle', TOWARDS), white = (r) => r.pix.data.filter((v) => v === 0xFFFFFFFF).length;
  const sweep = [0, 1, 2, 3, 4].map((g) => renderChibi('operative', 'idle', TOWARDS, 0, 'gl-' + g));
  assert.ok(sweep.every((r) => white(r) > white(plain)), 'every step brightens the lenses');
  assert.equal(new Set(sweep.map((r) => r.pix.data.join())).size, 5, 'the band moves');
  assert.equal(renderChibi('husk', 'idle', TOWARDS, 0, 'gl-2').pix.data.join(), renderChibi('husk', 'idle', TOWARDS).pix.data.join(), 'no glasses, no gleam');
  assert.equal(glassesGleam(0.1), 'gl-1');
  assert.equal(glassesGleam(1.5), '');
  const lit = Array.from({ length: 320 }, (_, i) => glassesGleam(i * 0.01)).filter(Boolean).length;
  assert.ok(lit > 30 && lit < 50, 'about an eighth of the time');
  const p = renderChibi('operative', 'idle', AWAY).pix, before = p.data.join();
  addGleam(p, 0.5);
  assert.equal(p.data.join(), before, 'from behind the lenses are hidden: nothing to catch the sun');
});

test('Chibi scope: a round on a head pixel of the magnified map sprite is a head hit; the rifle lets it through', () => {
  const r = renderChibi('husk', 'idle', TOWARDS, 0);
  const s = magnifiedSprite({ canvas: null, ax: r.ax, ay: r.ay, w: r.w, h: r.h, zoneMap: r.zone }, 4);
  let hx = -1, hy = -1;
  for (let i = 0; i < r.zone.length && hx < 0; i++) if (ZONES[r.zone[i]] === 'head') { hx = i % r.w; hy = Math.floor(i / r.w); }
  assert.equal(zoneAtMap(s, hx * 4 + 2, hy * 4 + 2)?.name, 'head');
  const side = renderChibi('husk', 'idle', EAST);
  assert.ok(side.zone.some((z, i) => !z && side.pix.data[i] >>> 24), 'the rifle sticking out ahead carries no hit zone');
});
