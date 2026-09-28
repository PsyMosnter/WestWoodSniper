// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ink, fillPoly, smoothPath } from '../src/render/ink.js';
import { SHOTS } from '../src/scenes/cutArt/shots.js';
import { talkState } from '../src/scenes/cutArt/talk.js';

test('Ink: crisp fills (pixel centres), outline-only shapes paint just the ring, tapered strokes', () => {
  const m = fillPoly([[2, 2], [12, 2], [12, 7], [2, 7]], 20, 20);
  assert.equal(m.d.reduce((a, b) => a + b, 0), 50, 'a 10×5 rectangle covers 50 pixels');
  const k = new Ink(40, 40);
  k.ellipse(20, 20, 10, 10, 0, { line: '#000000', lw: 2 });
  assert.equal(k.pix.data[20 * 40 + 20] >>> 24, 0, 'the inside stays empty');
  assert.ok(k.pix.data[20 * 40 + 9] >>> 24, 'the ring is inked');
  const k2 = new Ink(40, 40);
  const s = k2.stroke([[4, 20], [36, 20]], [1, 7], '#FFFFFF');
  let left = 0, right = 0;
  for (let y = 0; y < s.h; y++) { left += s.d[y * s.w + 2]; right += s.d[y * s.w + s.w - 4]; }
  assert.ok(right > left, 'the line thickens along its length');
  const P = smoothPath([[0, 0], [10, 0, 1], [10, 10]], false);
  assert.ok(P.some(([x, y]) => x === 10 && y === 0), 'a corner point stays sharp');
});

test('illustrated shots: deterministic frames, full coverage, speech anchors on screen', () => {
  for (const [id, shot] of Object.entries(SHOTS)) {
    const render = (t) => { const k = new Ink(480, 270); const st = shot.draw(k, t, talkState(shot.demo || [], t)); return { k, st }; };
    const a = render(1.3), b = render(1.3), c = render(2.9);
    assert.deepEqual(a.k.pix.data, b.k.pix.data, `${id} renders the same frame twice`);
    assert.notDeepEqual(a.k.pix.data, c.k.pix.data, `${id} animates`);
    assert.ok(a.k.pix.data.every((v) => v >>> 24), `${id} paints every pixel`);
    for (const [who, [x, y]] of Object.entries(a.st.talkers || {})) assert.ok(x >= 0 && x <= 480 && y >= 0 && y <= 270, `${id}: ${who} speaks from on screen`);
  }
});
