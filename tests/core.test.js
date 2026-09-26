// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/rng.js';
import { computeLayout } from '../src/core/display.js';
import { BALANCE } from '../src/config/balance.js';

test('seeded RNG is deterministic', () => {
  const a = new Rng(123), b = new Rng(123);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  assert.notEqual(new Rng(1).next(), new Rng(2).next());
});

test('display uses integer device-pixel scaling within logical bounds', () => {
  for (const [w, h, dpr] of [[844, 390, 3], [844, 340, 3], [915, 412, 2.625], [667, 375, 2], [1440, 810, 1], [1920, 960, 1], [2560, 1440, 2]]) {
    const L = computeLayout(w, h, dpr);
    assert.equal(L.scale, Math.round(L.scale), `${w}x${h}@${dpr} integer scale`);
    assert.ok(L.W >= BALANCE.display.minW && L.W <= BALANCE.display.maxW, `W ${L.W}`);
    assert.ok(L.H >= BALANCE.display.minH && L.H <= BALANCE.display.maxH, `H ${L.H}`);
    assert.ok(L.cssW <= w + 0.01 && L.cssH <= h + 0.01, 'fits the screen');
  }
});

test('balance.js has every spec section', () => {
  for (const k of ['operative', 'stances', 'weapons', 'detection', 'noise', 'ai', 'scope', 'explosions', 'units', 'structures', 'c4', 'strike', 'difficulty']) assert.ok(BALANCE[k], k);
});
