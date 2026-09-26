// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gorePalette, hexToRgb, rgbToHue, BLOOD } from '../src/config/palette.js';

test('no red or red-adjacent hue (330°–20°) in any gore colour (SPEC §2)', () => {
  for (const hex of gorePalette()) {
    const h = rgbToHue(hexToRgb(hex));
    assert.ok(!(h >= 330 || h <= 20), `${hex} has hue ${h.toFixed(1)}°`);
  }
});

test('exactly four blood colours with main/shade/highlight', () => {
  assert.equal(BLOOD.length, 4);
  for (const b of BLOOD) for (const k of ['main', 'shade', 'hi']) assert.match(b[k], /^#[0-9A-F]{6}$/i);
});
