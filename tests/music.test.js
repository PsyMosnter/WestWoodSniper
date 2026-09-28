// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SONGS, songStep, tempo, moods, degree } from '../src/audio/music.js';

/** a stand-in Audio that counts what each step would play */
function fake(level) {
  const n = { voice: 0, bass: 0, kick: 0, snare: 0, hat: 0, tom: 0, bell: 0 };
  const a = /** @type {any} */ ({ level, hz: (m) => 440 * Math.pow(2, (m - 69) / 12) });
  for (const k of Object.keys(n)) a[k] = () => { n[k]++; };
  return { a, n };
}
const play = (name, level, steps = 128) => { const { a, n } = fake(level); const tr = { name, gain: null, mood: null, chord: null }; for (let s = 0; s < steps; s++) songStep(a, tr, s, s * 0.1); return { n, tr }; };

test('every stage has a song with three 2-bar sections of 16 eighths, and it plays', () => {
  for (const id of ['title', 'bc', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']) {
    const S = SONGS[id];
    assert.ok(S, id);
    for (const k of ['A', 'B', 'C']) assert.equal(S[k].length, 16, `${id}.${k}`);
    assert.equal(S.prog.length, 8);
    assert.ok(play(id, 0).n.voice > 20, `${id} makes music`);
  }
});

test('awareness drives the mood: calm has no drums, suspicious ticks, detected is full and faster', () => {
  const calm = play('m1', 0), sus = play('m1', 0.5), det = play('m1', 1);
  assert.equal(calm.tr.mood, 'calm'); assert.equal(sus.tr.mood, 'sus'); assert.equal(det.tr.mood, 'det');
  assert.equal(calm.n.kick + calm.n.snare, 0);
  assert.ok(det.n.kick > 10 && det.n.snare > 4 && det.n.hat > 20);
  assert.ok(tempo(0) < tempo(0.5) && tempo(0.5) < tempo(1));
  assert.deepEqual(moods(0), { s: 0, d: 0 });
  assert.equal(degree('aeolian', 7), 12); assert.equal(degree('harmonic', 6), 11); assert.equal(degree('dorian', -1), -2);
});
