// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUTS, CREDITS, FAILED_LINES, cutLength } from '../src/missions/story.js';

const BANNED = /\b(Kane|GDI|Nod|Tiberium|EVA|Obelisk|Mammoth|Orca|Commando|Ghost unit|Nuclear launch detected)\b/;

test('every mission has an intro: nature close-up, an arrival, then the establishing shot with its title', () => {
  const nature = ['beetle', 'moth', 'butterfly', 'dragonfly', 'firefly'];
  const arrivals = { not: ['skitter', 'infantry', 'sniffer', 'tracks'], wren: ['crawl', 'leaf', 'needle'] };
  for (let n = 1; n <= 7; n++) {
    const c = CUTS['m' + n];
    assert.ok(c, `m${n} has a cutscene`);
    const [macro, est] = c.shots;
    assert.equal(macro.kind, 'macro');
    assert.ok(nature.includes(macro.bug), `m${n}: an insect in the close-up`);
    assert.ok([...arrivals.not, ...arrivals.wren].includes(macro.approach), `m${n}: the NOT or WREN arrive`);
    assert.equal(est.kind, 'establish');
    assert.ok(est.title && est.wren && est.scene, `m${n}: title, WREN and the target`);
    assert.ok(c.lines.length >= 2);
    const len = cutLength(c);
    assert.ok(len > 12 && len < 30, `m${n} runs ${len.toFixed(1)} s`);
    for (const [t] of c.lines) assert.ok(t >= macro.dur && t < len, 'radio lines play over the establishing shot');
  }
});

test('the story intro, the failure sting and the ending exist; the credits carry the required line', () => {
  for (const id of ['intro', 'failed', 'ending']) assert.ok(CUTS[id]?.shots.length, id);
  assert.ok(CREDITS.some(([a]) => a === 'Inspired by the real-time strategy games of the 1990s.'));
  assert.ok(cutLength(CUTS.failed) < 6, 'a failure is a short sting');
});

test('no borrowed names anywhere in the script', () => {
  const all = [...Object.values(CUTS).flatMap((c) => c.lines.map((l) => l[1] + ' ' + l[2])), ...FAILED_LINES, ...CREDITS.flat()];
  for (const s of all) assert.ok(!BANNED.test(s), s);
});

test('save v3: Chibi becomes the default once, a later Classic choice sticks, watched cutscenes are remembered', async () => {
  const { loadSave } = await import('../src/save.js');
  const store = {};
  // @ts-ignore
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  store['westwood-sniper:v1'] = JSON.stringify({ unlocked: 3, settings: { artStyle: 'classic', music: 0.2 } });
  const old = loadSave();
  assert.equal(old.settings.artStyle, 'chibi', 'an old save moves to Chibi');
  assert.equal(old.settings.music, 0.2);
  assert.deepEqual(old.seenCuts, {});
  store['westwood-sniper:v1'] = JSON.stringify({ v: 3, unlocked: 3, settings: { artStyle: 'classic' }, seenCuts: { intro: true } });
  const now = loadSave();
  assert.equal(now.settings.artStyle, 'classic', 'chosen after the switch: kept');
  assert.equal(now.seenCuts.intro, true);
  // @ts-ignore
  delete globalThis.localStorage;
});
