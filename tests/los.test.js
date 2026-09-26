// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSee, visibleTiles, supercover } from '../src/world/los.js';
import { makeMap } from './helpers.js';

test('open ground is visible within range, not beyond', () => {
  const m = makeMap({ elevation: Array(5).fill('0'.repeat(20)) });
  assert.equal(canSee(m, 0, 2, 10, 2, { radius: 10 }), true);
  assert.equal(canSee(m, 0, 2, 11, 2, { radius: 10 }), false);
});

test('high-ground rule: higher tiles are never visible (except adjacent peek)', () => {
  const m = makeMap({ elevation: ['0001111', '0001111', '0001111'] });
  assert.equal(canSee(m, 0, 1, 5, 1), false, 'cannot see up onto the plateau');
  assert.equal(canSee(m, 2, 1, 3, 1), true, 'adjacent higher tile is visible (peek)');
  assert.equal(canSee(m, 2, 1, 3, 0), true, 'diagonal adjacent peek (<=1.5)');
  assert.equal(canSee(m, 5, 1, 0, 1), true, 'from the plateau you can see the valley');
});

test('a ridge between blocks the view', () => {
  const m = makeMap({ elevation: ['0010000'] });
  assert.equal(canSee(m, 0, 0, 5, 0), false);
});

test('dense forest blocks from level 0 and level 1, not from level 2', () => {
  const ov = ['...F...'];
  assert.equal(canSee(makeMap({ elevation: ['0000000'], overlay: ov }), 0, 0, 6, 0), false);
  assert.equal(canSee(makeMap({ elevation: ['1000000'], overlay: ov }), 0, 0, 6, 0), false, '0 + 1.5 > 1');
  assert.equal(canSee(makeMap({ elevation: ['2000000'], overlay: ov }), 0, 0, 6, 0), true, '0 + 1.5 < 2');
});

test('soft light trees: one does not block, two do; level 1 sees over them', () => {
  assert.equal(canSee(makeMap({ overlay: ['..f....'] }), 0, 0, 6, 0), true);
  assert.equal(canSee(makeMap({ overlay: ['..ff...'] }), 0, 0, 6, 0), false);
  assert.equal(canSee(makeMap({ overlay: ['..f.f..'] }), 0, 0, 6, 0), false);
  assert.equal(canSee(makeMap({ elevation: ['1000000'], overlay: ['..fff..'] }), 0, 0, 6, 0), true);
});

test('low cover (sandbags, crates, rocks, wrecks) never blocks LOS', () => {
  assert.equal(canSee(makeMap({ overlay: ['.bkqy..'] }), 0, 0, 6, 0), true);
});

test('walls and boulders block at ground level', () => {
  assert.equal(canSee(makeMap({ overlay: ['...v...'] }), 0, 0, 6, 0), false);
  assert.equal(canSee(makeMap({ overlay: ['...o...'] }), 0, 0, 6, 0), false);
  assert.equal(canSee(makeMap({ elevation: ['1000000'], overlay: ['...v...'] }), 0, 0, 6, 0), true, 'wall 1.0 not > 1');
});

test('buildings block unless the observer is on level 3 (default building blockH 2.5, DECISIONS.md)', () => {
  for (const [e, expect] of [['1', false], ['2', false], ['3', true]]) {
    const m = makeMap({ elevation: [e + '000000'] });
    m.setStructure(0, 3, 0, 1, 1, 2.5);
    assert.equal(canSee(m, 0, 0, 6, 0), expect, `from level ${e}`);
  }
});

test('supercover visits corner-adjacent tiles on exact diagonals', () => {
  const seen = [];
  supercover(0, 0, 3, 3, (x, y) => { seen.push(`${x},${y}`); return false; });
  assert.ok(seen.includes('1,1') && seen.includes('2,2'));
  assert.ok(seen.includes('1,0') && seen.includes('0,1'));
});

test('visibleTiles agrees with the rules: forest shadow, plateau hidden', () => {
  const m = makeMap({
    elevation: ['0000000000', '0000000000', '0000001111', '0000001111', '0000000000'],
    overlay: ['..........', '...F......', '..........', '..........', '..........'],
  });
  const vis = new Set();
  visibleTiles(m, 0, 1, 12, (i) => vis.add(i));
  assert.ok(vis.has(1 * 10 + 3), 'the forest tile itself is visible');
  assert.ok(!vis.has(1 * 10 + 6), 'behind the forest is hidden');
  assert.ok(!vis.has(2 * 10 + 8), 'plateau top hidden from below');
  assert.ok(vis.has(4 * 10 + 0) && vis.has(4 * 10 + 4), 'open ground visible');
  assert.ok(!vis.has(4 * 10 + 9), 'ground behind the plateau ridge is hidden');
});
