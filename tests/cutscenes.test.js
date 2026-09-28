// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUTS, cutLength } from '../src/missions/story.js';
import { CAST_OF, speakingAt, mouthAt, speakLen, figure } from '../src/scenes/cutStage.js';
import { SHOTS as INK_SHOTS } from '../src/scenes/cutArt/shots.js';
import { renderChibi, bustBox, figureBox, CUT_POSE_NAMES } from '../src/render/spriteData/chibiInfantry.js';

const ACTED = new Set(['stage', 'closeup']);
const shotSpans = (c) => { let t0 = 0; return c.shots.map((s) => { const r = { s, t0, t1: t0 + s.dur }; t0 += s.dur; return r; }); };

test('every mission briefing is acted out: WREN in close-up, the voice on the radio screen beside him', () => {
  for (let n = 1; n <= 7; n++) {
    const c = CUTS['m' + n], spans = shotSpans(c);
    const close = spans.filter((x) => x.s.kind === 'closeup');
    assert.ok(close.length >= 1, `m${n}: a close-up`);
    assert.ok(close.some((x) => x.s.who === 'WREN' && x.s.inset), `m${n}: WREN with someone on the radio`);
    for (const [t, who] of c.lines) {
      const sp = spans.find((x) => t >= x.t0 && t < x.t1);
      assert.ok(sp && sp.s.kind === 'closeup', `m${n}: "${who}" speaks during a close-up`);
      assert.ok(sp.s.who === who || sp.s.inset === who || !sp.s.inset, `m${n}: ${who} is on screen (or it's a voice-over)`);
      assert.ok(t + speakLen('x'.repeat(10)) < cutLength(c) + 1);
    }
  }
  assert.equal(shotSpans(CUTS.m3).find((x) => x.s.who === 'VRASK')?.s.inset, null, 'M3 cuts away to Vrask while Overwatch talks about him');
  assert.equal(CUTS.m7.shots.find((s) => s.kind === 'closeup')?.inset, 'DR. ADLER');
});

test('the intro and the ending stage their scenes: HQ tent, the dock at dawn, the ride home', () => {
  const sets = (c) => c.shots.filter((s) => s.kind === 'stage').map((s) => s.set);
  assert.deepEqual([...new Set(CUTS.intro.shots.filter((s) => s.kind === 'ink').map((s) => s.id))], ['meteors', 'tent', 'pin', 'dock'], 'the intro is hand-inked');
  for (const s of CUTS.intro.shots.filter((x) => x.kind === 'ink')) assert.ok(INK_SHOTS[s.id], `ink shot ${s.id} exists`);
  assert.ok(CUTS.intro.lines.some(([, who]) => who === 'SECRETARY') && CUTS.intro.lines.some(([, , l]) => /Global Operative Defences/.test(l)), 'the Colonel and his secretary explain GOD');
  assert.deepEqual(sets(CUTS.ending), ['cabin']);
  for (const c of Object.values(CUTS)) for (const s of c.shots.filter((x) => ACTED.has(x.kind))) {
    for (const who of [s.who, s.inset, ...(s.actors || []).map((a) => a.who)].filter(Boolean)) assert.ok(CAST_OF[who], `${who} is in the cast`);
    for (const a of s.actors || []) for (const p of [a.pose, ...(a.beats || []).map((b) => b.pose)].filter(Boolean)) assert.ok(CUT_POSE_NAMES.includes(p) || ['walk', 'idle'].includes(p), `pose ${p}`);
  }
  const wrenLine = CUTS.ending.lines.find((l) => l[1] === 'WREN');
  const span = shotSpans(CUTS.ending).find((x) => wrenLine[0] >= x.t0 && wrenLine[0] < x.t1);
  assert.equal(span?.s.set, 'cabin', 'WREN says his last line on screen');
});

test('lip-sync: the speaker is known for the length of a line; vowels open the mouth, spaces close it', () => {
  const lines = [[1, 'OVERWATCH', "WREN, you're up."], [4, 'WREN', "I'm retired."]];
  assert.equal(speakingAt(lines, 0.5), null);
  assert.equal(speakingAt(lines, 1.2)?.who, 'OVERWATCH');
  assert.equal(speakingAt(lines, 1 + speakLen(lines[0][2]) + 0.01), null, 'quiet between lines');
  assert.equal(speakingAt(lines, 4.3)?.who, 'WREN');
  assert.equal(mouthAt('AAAA', 0.1), 2);
  assert.equal(mouthAt('A A', 1 / 16 + 0.001), 0);
  assert.equal(mouthAt('HI', 5), 0, 'closed after the line');
  const shapes = new Set(Array.from({ length: 40 }, (_, i) => mouthAt('They came down on the east bank of the Varna.', i * 0.05)));
  assert.deepEqual([...shapes].sort(), [0, 1, 2]);
});

test('cutscene figures: every cast member, whole and in close-up, renders in frame with face anchors', () => {
  for (const type of new Set(Object.values(CAST_OF))) {
    for (const [pose, bust] of [['stand', true], ['talk', true], ['stand', false], ['talk', false]]) for (const dir of [3, 4, 5]) {
      const zoom = bust ? 8 : 4, box = bust ? bustBox(type, zoom) : figureBox(type, zoom);
      const r = renderChibi(type, pose, dir, 1, '', { zoom, box, ink: 1, brow: 0, tilt: -0.3 });
      let n = 0, edge = 0;
      for (let i = 0; i < r.pix.data.length; i++) if (r.pix.data[i] >>> 24) { n++; const x = i % r.w, y = Math.floor(i / r.w); if (x === 0 || x === r.w - 1 || y === 0 || (!bust && y === r.h - 1)) edge++; }
      assert.ok(n > 500, `${type} ${pose} ${bust ? 'bust' : 'figure'} visible`);
      assert.equal(edge, 0, `${type} ${pose} dir ${dir} ${bust ? 'bust' : 'figure'} fits its box`);
      assert.ok(r.anch && Number.isFinite(r.anch.top[1]), `${type}: head-top anchor for speech`);
      if (type !== 'vrask') assert.ok(r.anch.mouth, `${type} dir ${dir}: a mouth to move`);
    }
  }
  for (const pose of CUT_POSE_NAMES) assert.ok(renderChibi('operative', pose, 3, 0, '', { zoom: 4, box: figureBox('operative', 4) }).pix.data.some((v) => v >>> 24), pose);
  const rod = renderChibi('operative', 'fish', 3, 0, '', { zoom: 4, box: figureBox('operative', 4) });
  assert.ok(rod.anch.rodTip, 'the fishing rod has a tip for the line');
  const f = figure('operative', 'stand', 4, 0, 4);
  assert.equal(figure('operative', 'stand', 4, 0, 4), f, 'renders are cached');
});
