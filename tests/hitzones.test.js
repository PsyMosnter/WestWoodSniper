// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopeView, resolveZone } from '../src/render/spriteData/scopeSprites.js';

const E = 0, S = Math.PI / 2, W = Math.PI, N = -Math.PI / 2;

test('view selection by angle between facing and direction to the Operative', () => {
  assert.equal(scopeView(E, E), 'front', 'facing the Operative');
  assert.equal(scopeView(E, E + 0.7), 'front', 'within ±45°');
  assert.equal(scopeView(E, W), 'back');
  assert.equal(scopeView(N, E), 'right', 'facing north, seen from the east → right side');
  assert.equal(scopeView(N, W), 'left');
  assert.equal(scopeView(S, S + Math.PI * 0.9), 'back');
});

test('priority resolution: higher priority wins where zones overlap', () => {
  const zones = [
    { name: 'torso', x: 0, y: 0, w: 20, h: 20, prio: 3 },
    { name: 'grenadeBelt', x: 0, y: 15, w: 20, h: 5, prio: 4 },
    { name: 'head', x: 5, y: -10, w: 10, h: 10, prio: 5 },
  ];
  assert.equal(resolveZone(zones, 10, 17)?.name, 'grenadeBelt');
  assert.equal(resolveZone(zones, 10, 5)?.name, 'torso');
  assert.equal(resolveZone(zones, 10, -5)?.name, 'head');
  assert.equal(resolveZone(zones, 30, 30), null);
});

test('zone size multiplier (assisted aim +20%) grows zones about their centre', () => {
  const zones = [{ name: 'head', x: 10, y: 10, w: 10, h: 10, prio: 5 }];
  assert.equal(resolveZone(zones, 20.5, 15, 1), null);
  assert.equal(resolveZone(zones, 20.5, 15, 1.2)?.name, 'head');
});

import { vehicleScopeSprite } from '../src/render/spriteData/vehicles.js';

test('armour view slits exist only in the front view', () => {
  for (const t of ['crawler', 'brute', 'juggernaut']) {
    assert.ok(vehicleScopeSprite(t, 'front').zones.some((z) => z.name === 'slit'), `${t} front has a slit`);
    for (const v of ['back', 'left', 'right']) assert.ok(!vehicleScopeSprite(t, v).zones.some((z) => z.name === 'slit'), `${t} ${v} has no slit`);
  }
  // slit is tiny: 3×2 (tanks) / 4×2 (APC) scope px
  const s = vehicleScopeSprite('brute', 'front').zones.find((z) => z.name === 'slit');
  assert.deepEqual([s.w, s.h], [3, 2]);
});

test('drivers are hittable from the front and sides, not from behind', () => {
  for (const t of ['skitter', 'hauler']) {
    for (const v of ['front', 'left', 'right']) assert.ok(vehicleScopeSprite(t, v).zones.some((z) => z.name === 'driver'), `${t} ${v}`);
    assert.ok(!vehicleScopeSprite(t, 'back').zones.some((z) => z.name === 'driver'));
  }
  assert.ok(vehicleScopeSprite('skitter', 'back').zones.some((z) => z.name === 'jerrycan'));
});
