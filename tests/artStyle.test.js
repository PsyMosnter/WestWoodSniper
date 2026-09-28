// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Art } from '../src/render/artStyle.js';
import { DEFAULT_SETTINGS } from '../src/save.js';
import { scopeSprite } from '../src/render/spriteData/scopeSprites.js';

test('art style: New is the players\' default; the module starts Classic; New draws a redesign only where one is registered', () => {
  assert.equal(DEFAULT_SETTINGS.artStyle, 'chibi', 'Chibi is the default for players');
  assert.equal(Art.style, 'classic');
  const painter = () => ({ zones: [{ name: 'head', x: 0, y: 0, w: 1, h: 1, prio: 5 }], w: 1, h: 1, ax: 0, ay: 0 });
  Art.register('scopeUnit', 'testDummy', painter);
  assert.equal(Art.painter('scopeUnit', 'testDummy'), null, 'Classic ignores redesigns');
  const seen = [];
  Art.onChange((s) => seen.push(s));
  Art.setStyle('new');
  assert.equal(Art.painter('scopeUnit', 'testDummy'), painter);
  assert.equal(Art.painter('scopeUnit', 'husk'), null, 'no redesign yet → Classic');
  assert.equal(Art.painter('unit', 'testDummy'), null, 'registered per kind');
  // the scope lookup picks the redesign while New is on, and the Classic sprite again after switching back
  assert.equal(scopeSprite('testDummy', 'front').w, 1);
  Art.setStyle('bogus');
  assert.equal(Art.style, 'classic', 'anything unknown means Classic');
  assert.notEqual(scopeSprite('testDummy', 'front').w, 1);
  assert.deepEqual(seen, ['new', 'classic']);
});
