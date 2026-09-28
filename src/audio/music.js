// @ts-check
/**
 * The song book (sound pass): a title theme and one tune per stage, each in three moods that follow the
 * awareness meter — CALM (the melody, soft), SUSPICIOUS (a notch faster, the melody turns into a tense
 * staccato figure over a ticking arpeggio) and DETECTED (faster again: full drums, driving bass, the melody
 * an octave up on a bright pulse). 8-bit voices: pulse waves (12.5 / 25 / 50 %), triangle bass, noise drums.
 *
 * Melodies are written in scale degrees, one token per 8th note, 16 tokens (two bars) per section:
 * a number is a degree (7 = the octave, negative = below the root), '-' holds, '.' rests. A phrase is
 * eight bars: A B A C, over an eight-bar chord progression (scale degrees of the chord roots).
 */

export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11],
};

/** drum kits: per mood, 16-step lines for kick / snare / hat / tom ('x' hit, 'o' accent) */
const KITS = {
  march: {
    sus: { h: 'x.x.x.x.x.x.x.x.', s: '....x.......x.x.' },
    det: { k: 'x...x...x...x...', s: '..x.x.x...x.xxxx', h: 'xxxxxxxxxxxxxxxx' },
  },
  rock: {
    sus: { h: 'x.x.x.x.x.x.x.x.', k: 'x.......x.......' },
    det: { k: 'x.....x.x.x.....', s: '....o.......o...', h: 'x.x.x.x.x.x.x.x.' },
  },
  tribal: {
    sus: { t: 'x..x..x...x..x..', h: '..x...x...x...x.' },
    det: { k: 'x..x..x.x..x..x.', t: '..x.x...x.x.x.xx', s: '....o.......o...', h: 'x.xxx.xxx.xxx.xx' },
  },
  halftime: {
    sus: { k: 'x...............', h: '....x.......x...' },
    det: { k: 'x.....x...x.....', s: '........o.......', h: 'x.x.x.x.x.x.x.x.' },
  },
  shuffle: {
    sus: { h: 'x..x..x.x..x..x.', k: 'x.......x.......' },
    det: { k: 'x..x..x.x..x..x.', s: '....o.......o..x', h: 'x.xx.xx.x.xx.xx.' },
  },
  electro: {
    sus: { k: 'x.......x.......', h: '..x...x...x...x.' },
    det: { k: 'x...x...x...x...', s: '....o.......o...', h: '..x.x.x...x.x.xx', t: '..............xx' },
  },
};

/**
 * root: MIDI note of the tonic (lead octave is +12) · lead / tense / bright: pulse duty of the lead in each mood
 * calm: 'arp' (8th-note chord plucks) | 'bells' (sparse high bells) | 'pad' (held chords only)
 */
export const SONGS = {
  title: { bpm: 100, root: 57, mode: 'aeolian', kit: 'rock', calm: 'arp', lead: 0.25, prog: [0, 5, 2, 6, 0, 5, 3, 4],
    A: '0 - 4 - 7 - - 6 5 - 4 - 2 - 4 -', B: '5 - 7 - 9 - - 8 7 - 6 - 4 - 6 -', C: '7 - 6 - 5 - 4 - 3 - 2 - 0 - - -', always: true },
  bc: { bpm: 112, root: 55, mode: 'mixolydian', kit: 'march', calm: 'arp', lead: 0.5, prog: [0, 3, 6, 0, 0, 3, 4, 0],
    A: '4 . 4 5 4 . 2 . 0 . 2 . 4 - - .', B: '3 . 3 4 3 . 1 . -1 . 0 . 1 - - .', C: '4 . 5 . 6 . 7 . 6 . 4 . 0 - - -' },
  m1: { bpm: 86, root: 57, mode: 'dorian', kit: 'rock', calm: 'arp', lead: 0.25, prog: [0, 3, 0, 3, 2, 3, 4, 0],
    A: '0 - 2 4 - 3 2 - 4 - - 5 4 2 0 -', B: '3 - 5 7 - 6 5 - 4 - - 3 2 - . .', C: '2 - 4 5 - 4 2 - 1 - - -1 0 - - -' },
  m2: { bpm: 94, root: 52, mode: 'phrygian', kit: 'shuffle', calm: 'arp', lead: 0.125, vib: 1, prog: [0, 1, 0, 6, 0, 1, 5, 6],
    A: '0 . 1 . 0 - 4 - 3 1 0 . -1 - 0 -', B: '4 . 5 . 4 - 7 - 6 5 4 . 3 - 1 -', C: '0 . 1 . 3 - 4 - 5 4 1 . 0 - - -' },
  m3: { bpm: 80, root: 50, mode: 'aeolian', kit: 'halftime', calm: 'bells', lead: 0.5, prog: [0, 5, 2, 6, 0, 5, 3, 4],
    A: '4 - - 7 - - 6 - 4 - - - 2 - - -', B: '5 - - 4 - - 2 - 0 - - - -1 - - -', C: '4 - - 7 - - 9 - 8 - 7 - 7 - - -' },
  m4: { bpm: 98, root: 55, mode: 'harmonic', kit: 'shuffle', calm: 'arp', lead: 0.25, prog: [0, 5, 3, 4, 0, 5, 1, 4],
    A: '0 2 4 - 7 - 6 4 5 - 4 - 2 - - .', B: '3 5 7 - 8 - 7 5 6 - 7 - 4 - - .', C: '0 2 4 - 7 - 6 4 3 - 2 - 0 - - -' },
  m5: { bpm: 102, root: 54, mode: 'dorian', kit: 'tribal', calm: 'arp', lead: 0.125, prog: [0, 3, 0, 3, 6, 3, 4, 4],
    A: '0 . 2 0 . 4 . 2 3 . 2 . 0 . . .', B: '4 . 6 4 . 7 . 6 5 . 4 . 3 . 2 .', C: '0 . 2 0 . 4 . 5 6 . 5 . 7 - - -' },
  m6: { bpm: 76, root: 47, mode: 'aeolian', kit: 'halftime', calm: 'pad', lead: 0.5, vib: 1, prog: [0, 0, 5, 5, 3, 3, 4, 4],
    A: '4 - - - 5 - 4 - 2 - - - . . . .', B: '4 - - - 5 - 7 - 6 - - 5 4 - - -', C: '2 - - - 3 - 1 - 0 - - - . . . .' },
  m7: { bpm: 108, root: 48, mode: 'harmonic', kit: 'electro', calm: 'arp', lead: 0.25, prog: [0, 5, 3, 4, 0, 5, 1, 4],
    A: '0 - 0 2 3 - 4 - 5 - 4 3 4 - - -', B: '7 - 7 6 5 - 4 - 3 - 4 5 6 - - -', C: '7 - 8 7 6 - 5 - 4 - 6 - 7 - - -' },
};
for (const s of Object.values(SONGS)) for (const k of ['A', 'B', 'C']) s[k] = s[k].split(' ');

/** semitone offset of scale degree d (any octave) in mode */
export function degree(mode, d) {
  const sc = MODES[mode], o = Math.floor(d / 7), i = ((d % 7) + 7) % 7;
  return o * 12 + sc[i];
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
/** mood weights from the smoothed awareness level: suspicious 0..1, detected 0..1 */
export function moods(L) { return { s: clamp01((L - 0.2) / 0.3), d: clamp01((L - 0.7) / 0.25) }; }
/** tempo multiplier: a notch faster when suspicious, faster again when spotted */
export function tempo(L) { const { s, d } = moods(L); return 1 + 0.1 * s + 0.16 * d; }

/**
 * Play one 16th-note step of song `tr.song` at time t. `a` is the Audio (voices, drums, bus); tr keeps the
 * chosen mood per two-bar section so the tune changes on phrase lines, not mid-note.
 */
export function songStep(a, tr, step, t) {
  const S = SONGS[tr.name], out = tr.gain, s16 = step % 16, bar = Math.floor(step / 16);
  const spb = 60 / (S.bpm * (S.always ? 1 : tempo(a.level)));
  const { s, d } = S.always ? { s: 0, d: 0.75 } : moods(a.level);
  const N = (deg, oct = 0) => S.root + degree(S.mode, deg) + oct * 12;
  const chordDeg = S.prog[bar % 8];
  const chord = [chordDeg, chordDeg + 2, chordDeg + 4];
  tr.chord = chord.map((c) => N(c));                                       // (footsteps and the clean-kill jingle tune to it)
  // the mood is picked at each section line (every two bars) — a spotted-now flip waits at most a bar
  if (s16 === 0 && (bar % 2 === 0 || d > 0.5 && tr.mood !== 'det')) tr.mood = d > 0.5 ? 'det' : s > 0.5 ? 'sus' : 'calm';
  const mood = S.always ? 'det' : tr.mood || 'calm';

  // --- pad: the chord, held over the bar (softer as the drums come in)
  if (s16 === 0) for (const n of chord) a.voice(0.5, a.hz(N(n)), t, spb * 4, mood === 'det' ? 0.018 : 0.026, out, { attack: spb * 0.8, tri: mood === 'calm' });
  // --- bass
  const root = a.hz(N(chordDeg, -2));
  if (mood === 'calm') { if (s16 === 0 || s16 === 8) a.bass(root, t, spb * 1.8, 0.1, out); if (s16 === 14 && bar % 2) a.bass(root * 1.5, t, spb * 0.45, 0.07, out); }
  else if (mood === 'sus') { if (s16 % 2 === 0) a.bass(s16 % 8 === 6 ? root * 2 : root, t, spb * 0.4, 0.1, out); }
  else if (s16 % 2 === 0) a.bass(s16 % 4 === 2 ? root * 2 : root, t, spb * 0.42, 0.12, out);
  // --- calm colour: plucked arpeggio, bells or nothing
  if (mood === 'calm') {
    if (S.calm === 'arp' && s16 % 2 === 0) { const n = chord[[0, 1, 2, 1][(s16 >> 1) % 4]] + 7; a.voice(0.25, a.hz(N(n)), t, spb * 0.3, 0.016, out); }
    if (S.calm === 'bells' && (s16 === 6 || s16 === 14 && bar % 2)) a.bell(a.hz(N(chord[bar % 3] + 14)), t, 0.05, out);
  } else if (s16 % (mood === 'sus' ? 1 : 2) === 0) {
    // ticking arpeggio: the clock is running
    const n = chord[s16 % 3] + 7;
    a.voice(0.125, a.hz(N(n)), t, spb * 0.12, mood === 'sus' ? 0.02 : 0.014, out);
  }
  // --- lead
  const sec = ['A', 'B', 'A', 'C'][Math.floor((bar % 8) / 2)];
  const toks = S[sec], i = (bar % 2) * 8 + (s16 >> 1);
  const tok = toks[i], onBeat = s16 % 2 === 0;
  const breathe = mood === 'calm' && Math.floor(bar / 8) % 2 === 1 && !S.always;   // every other calm phrase: room to breathe
  if (onBeat && tok !== '-' && tok !== '.' && !breathe) {
    let len = 1; while (toks[i + len] === '-' && i + len < 16) len++;
    const deg = +tok;
    if (mood === 'calm') a.voice(S.lead, a.hz(N(deg, 1)), t, spb * 0.5 * len * 0.95, 0.035, out, { vib: S.vib || len >= 3, tri: S.lead === 0.5 && !S.vib });
    else if (mood === 'sus') {
      // tense: only the notes on the beat, staccato and low, each leaning in from a semitone above
      if (s16 % 4 === 0) { a.voice(0.125, a.hz(N(deg) + 1), t, spb * 0.08, 0.026, out); a.voice(0.125, a.hz(N(deg)), t + spb * 0.1, spb * 0.3, 0.034, out); }
    } else {
      a.voice(S.lead, a.hz(N(deg, 2)), t, spb * 0.5 * len * 0.9, 0.034, out, { vib: len >= 2 });
      a.voice(0.5, a.hz(N(deg, 1)), t, spb * 0.5 * len * 0.9, 0.02, out);
    }
  }
  // --- drums
  const kit = KITS[S.kit][mood === 'calm' ? '' : mood];
  if (kit) {
    const dv = mood === 'det' ? 1 : 0.6;
    for (const [k, line] of Object.entries(kit)) {
      const c = line[s16];
      if (c === '.') continue;
      const acc = c === 'o' ? 1.25 : 1;
      if (k === 'k') a.kick(t, 0.42 * dv, out);
      else if (k === 's') a.snare(t, 0.13 * dv * acc, out);
      else if (k === 'h') a.hat(t, 0.035 * dv, out);
      else if (k === 't') a.tom(a.hz(N(chord[0], -1)), t, 0.2 * dv, out);
    }
  } else if (s16 === 0 && bar % 4 === 3 && S.calm !== 'bells') a.bell(a.hz(N(chord[2] + 14)), t, 0.025, out);   // a lone distant ping
}
