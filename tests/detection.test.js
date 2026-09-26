// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillRate, instantDetect, canObserve, visionOf } from '../src/ai/perception.js';
import { BALANCE } from '../src/config/balance.js';
import { makeMap } from './helpers.js';

function world(map, extra = {}) {
  return { map, timeOfDay: 'day', difficulty: BALANCE.difficulty.operative, alerts: null, ...extra };
}
const obs = (o = {}) => ({ x: 0.5, y: 2.5, angle: 0, profile: 'infantry', kind: 'infantry', def: {}, state: 'unaware', ...o });
const tgt = (o = {}) => ({ x: 4.5, y: 2.5, stanceFactor: 1, hunkered: false, ...o });

test('fill formula: base × stance × terrain × light × proximity × difficulty (SPEC §8.1)', () => {
  const m = makeMap({ elevation: Array(5).fill('0'.repeat(12)) });
  const w = world(m);
  const o = obs(), t = tgt({ stanceFactor: 0.6 });
  const vis = visionOf(o, w);
  const dist = 4;
  const expect = 1.0 * 0.6 * 1 * 1 * (1 - 0.7 * (dist / 7)) * 1.0;
  assert.ok(Math.abs(fillRate(o, t, dist, vis, w) - expect) < 1e-9);
  // night × 0.6, suspicious × 1.3
  assert.ok(Math.abs(fillRate(o, t, dist, vis, world(m, { timeOfDay: 'night' })) - expect * 0.6) < 1e-9);
  assert.ok(Math.abs(fillRate(obs({ state: 'suspicious' }), t, dist, vis, w) - expect * 1.3) < 1e-9);
});

test('vehicles and turrets cannot detect a hunkered target at all', () => {
  const m = makeMap({ elevation: Array(5).fill('0'.repeat(12)) });
  const w = world(m);
  const v = obs({ kind: 'vehicle', profile: 'armour' });
  assert.equal(fillRate(v, tgt({ hunkered: true, stanceFactor: 0.25 }), 3, visionOf(v, w), w), 0);
  assert.ok(fillRate(obs(), tgt({ hunkered: true, stanceFactor: 0.25 }), 3, visionOf(obs(), w), w) > 0);
});

test('tall grass rule: invisible beyond 3 tiles, visible within', () => {
  const m = makeMap({ terrain: ['gggggggggggg', 'gggggggggggg', 'ggggggtggggg', 'gggggggggggg', 'gggggggggggg'] });
  const w = world(m);
  assert.equal(canObserve(obs(), tgt({ x: 6.5 }), w).visible, false, '6 tiles away in tall grass');
  assert.equal(canObserve(obs({ x: 3.5 }), tgt({ x: 6.5 }), w).visible, true, '3 tiles away');
});

test('instant detection within 1.2 tiles unless hunkered in concealment', () => {
  const m = makeMap({ terrain: ['ggggg', 'ggtgg'] });
  const w = world(m);
  assert.equal(instantDetect(obs(), tgt({ x: 1.5, y: 1.5 }), 1.0, w), true);
  assert.equal(instantDetect(obs(), tgt({ x: 2.5, y: 1.5, hunkered: true }), 1.0, w), false, 'hunkered in tall grass');
  assert.equal(instantDetect(obs(), tgt({ x: 1.5, y: 0.5, hunkered: true }), 1.0, w), true, 'hunkered in the open');
  assert.equal(instantDetect(obs(), tgt({ x: 1.5 }), 1.5, w), false, 'too far');
  assert.equal(instantDetect(obs({ kind: 'vehicle' }), tgt({ x: 1.5 }), 1.0, w), false, 'vehicles never instant-detect');
});

test('vision cone and peripheral radius', () => {
  const m = makeMap({ elevation: Array(9).fill('0'.repeat(12)) });
  const w = world(m);
  const o = obs({ x: 4.5, y: 4.5, angle: 0 }); // facing east
  assert.equal(canObserve(o, tgt({ x: 8.5, y: 4.5 }), w).visible, true, 'ahead');
  assert.equal(canObserve(o, tgt({ x: 0.5, y: 4.5 }), w).visible, false, 'behind');
  assert.equal(canObserve(o, tgt({ x: 3.5, y: 4.5 }), w).visible, true, 'behind but within peripheral 1.5');
});

test('sniffer smell ignores concealment and hunker within 3 tiles', () => {
  const m = makeMap({ terrain: ['gggggggg', 'ggggtggg'] });
  const w = world(m);
  const s = obs({ profile: 'sniffer', def: { smell: true }, x: 1.5, y: 1.5 });
  const t = tgt({ x: 4.5, y: 1.5, hunkered: true, stanceFactor: 0.25 });
  const vis = visionOf(s, w);
  const r = fillRate(s, t, 3, vis, w);
  const expect = 1.5 * BALANCE.stances.crouch.vis * 1 * 1 * (1 - 0.7 * (3 / 6));
  assert.ok(Math.abs(r - expect) < 1e-9, `${r} vs ${expect}`);
});

test('shallow water: still (or crouched) only head & shoulders show — slower fill; wading keeps full fill', () => {
  const m = makeMap({ terrain: ['gggggggggggg', 'gggggggggggg', 'ggggwggggggg', 'gggggggggggg', 'gggggggggggg'] });
  const w = world(m), o = obs(), vis = visionOf(o, w);
  const still = fillRate(o, tgt({ moving: false }), 4, vis, w);
  const wading = fillRate(o, tgt({ moving: true }), 4, vis, w);
  assert.ok(Math.abs(still / wading - BALANCE.detection.waterStill) < 1e-9, `still ${still} vs wading ${wading}`);
  const dry = fillRate(o, tgt({ x: 6.5, moving: false }), 4, vis, w);
  assert.ok(Math.abs(dry - wading) < 1e-9, 'no bonus out of the water');
});
