// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rle, unrle } from '../src/missions/checkpoint.js';
import { Audio } from '../src/audio/sfx.js';

test('fog in saves is run-length encoded and comes back identical', () => {
  const a = new Uint8Array(5000);
  for (let i = 0; i < a.length; i++) a[i] = (i % 97 < 40 || (i > 3000 && i < 3200)) ? 1 : 0;
  const s = rle(a);
  assert.ok(s.length < 1200, `compact (${s.length} chars for 5000 tiles)`);
  assert.deepEqual(Array.from(unrle(s, a.length)), Array.from(a));
  assert.deepEqual(Array.from(unrle(rle(new Uint8Array(10).fill(1)), 10)), Array(10).fill(1));
});

test('audio is silent and harmless until a user gesture creates the context (and headless)', () => {
  const a = new Audio();
  a.play('rifle'); a.music('mission'); a.setIntensity(2); a.sting('win'); a.click(); a.setVolumes(0.5, 0.2);
  assert.equal(a.ctx, null);
  assert.equal(a.intensity, 1, 'clamped');
  assert.equal(a.want, 'mission', 'the wanted track starts once unlocked');
  a.unlock();                         // no AudioContext in node: stays silent
  assert.equal(a.ctx, null);
});
