// @ts-check
/**
 * Procedural audio (SPEC §16): every sound effect and all music are synthesised with Web Audio — no
 * sample files. The context is created on the first user gesture (browser autoplay rules); before that,
 * and in headless tests, every call is a silent no-op.
 *
 * SFX: play(name). Music: music('theme' | 'mission' | null) picks the track; setIntensity(0..1) makes
 * the mission track build up (bass, arpeggio, drums) as the enemy becomes aware of WREN;
 * sting('win' | 'fail') plays a short cue.
 *
 * Sound pass: 'theme' (the intro tune) keeps its own sequencer below; the title and every stage play from the
 * song book in music.js (calm / suspicious / detected). Footsteps on water, snow, grass and the low crawl are
 * played on the music's own 8th-note grid and tuned to its chord, so they sit inside the groove (setMove).
 */

import { SONGS, songStep, tempo } from './music.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI note → Hz

// chord progressions (MIDI roots and triads) — A minor, the 90s way
const PROG = {
  theme: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],      // Am F C G
  mission: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]],    // Am F Dm E
};
// theme lead melody: 16 steps per bar, 4 bars (null = rest)
const LEAD = [
  [76, null, null, 76, 74, null, 72, null, 74, null, null, null, 76, null, 79, null],
  [77, null, null, 76, 74, null, 72, null, 69, null, null, null, 72, null, 74, null],
  [76, null, null, 76, 79, null, 76, null, 74, null, 72, null, 71, null, 72, null],
  [74, null, null, null, 71, null, 67, null, 69, null, null, null, null, null, null, null],
];

export class Audio {
  constructor() {
    /** @type {any} */ this.ctx = null;
    this.sfxVol = 0.8; this.musicVol = 0.6;
    this.want = null;          // track to play once unlocked
    this.track = null;
    this.intensity = 0; this.level = 0;
    this.last = new Map();
    this.timer = null;
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume?.(); return; }
    const AC = globalThis.AudioContext || /** @type {any} */ (globalThis).webkitAudioContext;
    if (!AC) return;
    try {
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = 0.9;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(c.destination);
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.sfxVol; this.sfxBus.connect(this.master);
      this.musicBus = c.createGain(); this.musicBus.gain.value = this.musicVol * 0.55; this.musicBus.connect(this.master);
      // outdoor echo for gunshots and blasts
      this.echo = c.createDelay(1); this.echo.delayTime.value = 0.21;
      const fb = c.createGain(); fb.gain.value = 0.28;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
      this.echo.connect(lp); lp.connect(fb); fb.connect(this.echo); lp.connect(this.sfxBus);
      // a second of white noise, reused by every noisy sound
      const buf = c.createBuffer(1, c.sampleRate, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      // an outdoor space: a generated 2.6 s impulse response (dark, stereo) for shots, blasts and bells
      const len = Math.floor(c.sampleRate * 2.6), ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const o = ir.getChannelData(ch); let lp = 0;
        for (let i = 0; i < len; i++) { const k = i / len; lp += (Math.random() * 2 - 1 - lp) * (0.5 - 0.4 * k); o[i] = lp * Math.pow(1 - k, 3) * (i < c.sampleRate * 0.012 ? 0 : 1); }
      }
      this.verb = c.createConvolver(); this.verb.buffer = ir;
      const vg = c.createGain(); vg.gain.value = 0.55; this.verb.connect(vg); vg.connect(this.master);
      // 8-bit pulse waves (12.5 / 25 / 50 % duty)
      this.waves = {};
      for (const duty of [0.125, 0.25, 0.5]) {
        const n = 40, re = new Float32Array(n), im = new Float32Array(n);
        for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
        this.waves[duty] = c.createPeriodicWave(re, im);
      }
      // a soft clipper for blasts
      this.drive = c.createWaveShaper();
      const cv = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; cv[i] = Math.tanh(x * 3.2); }
      this.drive.curve = cv; this.drive.connect(this.sfxBus);
      if (this.want) this.music(this.want);
    } catch (e) { this.ctx = null; }
  }
  setVolumes(sfx, music) {
    this.sfxVol = sfx; this.musicVol = music;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(music * 0.55, t, 0.05);
  }

  // ---------------------------------------------------------------- synthesis primitives
  /** oscillator voice with a pitch glide and a percussive envelope */
  tone(type, f0, f1, t, dur, vol, dest = this.sfxBus, attack = 0.004) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    return g;
  }
  /** filtered noise burst with a sweeping cutoff */
  noise(t, dur, vol, type, f0, f1, q = 0.8, dest = this.sfxBus, attack = 0.003) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    return g;
  }
  click(freq = 1400, vol = 0.08) { if (!this.ctx) return; this.tone('square', freq, freq, this.ctx.currentTime, 0.025, vol * this.sfxVolume()); }
  tick() { this.click(2200, 0.05); }
  squelch() { this.play('squelch'); }
  sfxVolume() { return 1; }

  // ---------------------------------------------------------------- sound effects
  /** @param {string} name */
  play(name) {
    const c = this.ctx;
    if (!c) return;
    const now = c.currentTime;
    if (now - (this.last.get(name) ?? -1) < 0.035) return;     // no machine-gun stacking of the same sound
    this.last.set(name, now);
    const f = SFX[name];
    if (f) { try { f.call(this, now); } catch (e) { /* never let audio break the game */ } }
  }

  // ---------------------------------------------------------------- music
  /** @param {string|null} name */
  music(name) {
    this.want = name;
    if (!this.ctx) return;
    if (name && name !== 'theme' && !SONGS[name]) name = 'm1';
    if (this.track?.name === name) return;
    const c = this.ctx;
    if (this.track) {
      const old = this.track;
      old.gain.gain.setTargetAtTime(0.0001, c.currentTime, 0.4);
      setTimeout(() => { try { old.gain.disconnect(); } catch (e) { /* gone */ } }, 2500);
    }
    this.track = null;
    if (!name) return;
    const gain = c.createGain(); gain.gain.value = 0.0001; gain.connect(this.musicBus);
    gain.gain.setTargetAtTime(1, c.currentTime + 0.2, 0.6);
    this.track = { name, gain, step: 0, next: c.currentTime + 0.15, bpm: name === 'theme' ? 104 : SONGS[name].bpm, mood: 'calm', chord: null };
    if (!this.timer) this.timer = setInterval(() => this._schedule(), 25);
  }
  setIntensity(x) { this.intensity = Math.max(0, Math.min(1, x)); }
  sting(name) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + 0.05, bus = this.musicBus;
    if (name === 'win') {
      [60, 64, 67, 72, 76].forEach((n, i) => this.tone('square', NOTE(n), NOTE(n), t + i * 0.11, 0.5, 0.07, bus));
      for (const n of [48, 60, 64, 67]) this.tone('triangle', NOTE(n), NOTE(n), t + 0.55, 1.6, 0.08, bus, 0.05);
    } else if (name === 'fail') {
      [64, 60, 57, 52].forEach((n, i) => this.tone('triangle', NOTE(n), NOTE(n) * 0.97, t + i * 0.22, 0.6, 0.09, bus));
      this.noise(t + 0.9, 1.4, 0.05, 'bandpass', 1800, 900, 1.5, bus);
    }
  }
  _schedule() {
    const c = this.ctx, tr = this.track;
    if (!c || !tr) return;
    while (tr.next < c.currentTime + 0.12) {
      this.level += (this.intensity - this.level) * 0.08;
      const song = tr.name !== 'theme' && SONGS[tr.name];
      if (song) songStep(this, tr, tr.step, tr.next); else this._step(tr, tr.step, tr.next);
      this._footstep(tr, tr.step, tr.next);
      tr.next += 60 / (song ? tr.bpm * (song.always ? 1 : tempo(this.level)) : tr.bpm) / 4;   // 16th notes
      tr.step++;
    }
  }
  /** one 16th-note step of the current track */
  _step(tr, step, t) {
    const out = tr.gain, s16 = step % 16, bar = Math.floor(step / 16);
    const theme = tr.name === 'theme';
    const prog = PROG[theme ? 'theme' : 'mission'];
    const chord = prog[Math.floor(bar / (theme ? 1 : 2)) % prog.length];
    const L = theme ? 1 : this.level;
    const spb = 60 / tr.bpm;
    // pad: the chord, swelling in at the start of each chord
    if (s16 === 0 && (theme || bar % 2 === 0)) {
      const len = spb * 4 * (theme ? 1 : 2);
      for (const n of chord) this.tone('triangle', NOTE(n), NOTE(n), t, len, theme ? 0.045 : 0.05, out, len * 0.35);
    }
    // bass: whole notes when calm, driving 8ths when tense (and in the theme)
    const root = NOTE(chord[0] - 24);
    if (theme || L > 0.35) { if (s16 % 2 === 0) this._bass(root * (s16 === 6 || s16 === 14 ? 1.5 : 1), t, spb * 0.45, 0.11, out); }
    else if (s16 === 0 && bar % 2 === 0) this._bass(root, t, spb * 7, 0.09, out);
    // arpeggio (tension)
    if (!theme && L > 0.3 && s16 % 2 === 1) {
      const n = chord[(s16 >> 1) % 3] + 12;
      this.tone('square', NOTE(n), NOTE(n), t, spb * 0.2, 0.025 * Math.min(1, (L - 0.3) * 2), out);
    }
    // drums: in the theme, and when WREN is spotted
    if (theme || L > 0.6) {
      const dv = theme ? 1 : Math.min(1, (L - 0.6) * 2.5);
      if (s16 === 0 || s16 === 8 || s16 === 10) this._kick(t, 0.5 * dv, out);
      if (s16 === 4 || s16 === 12) this.noise(t, 0.16, 0.16 * dv, 'bandpass', 1800, 1200, 0.7, out);
      if (s16 % 2 === 0) this.noise(t, 0.04, 0.05 * dv, 'highpass', 7000, 7000, 0.7, out);
    } else if (s16 === 0 && bar % 4 === 3) {
      // calm: a lone, distant ping every few bars — somebody out there is listening
      this.tone('sine', NOTE(88), NOTE(88), t, 1.4, 0.03, out);
    }
    // the theme's lead line
    if (theme && bar % 8 >= 4) {
      const n = LEAD[bar % 4][s16];
      if (n) this.tone('square', NOTE(n), NOTE(n), t, spb * 0.45, 0.045, out);
    }
  }
  /** a mechanical clack: a resonant click with an optional low knock */
  _clack(t, f, vol, low = 0) {
    this.noise(t, 0.03, vol, 'bandpass', f, f * 0.8, 4);
    if (low) this.tone('sine', low * 1.6, low, t, 0.06, vol * 0.6);
  }

  // ---------------------------------------------------------------- 8-bit voices (music.js)
  hz(n) { return NOTE(n); }
  /** a pulse (or triangle) note: gentle attack, a little vibrato on long notes */
  voice(duty, f, t, dur, vol, out, o = {}) {
    const c = this.ctx, osc = c.createOscillator(), g = c.createGain();
    if (o.tri) osc.type = 'triangle'; else osc.setPeriodicWave(this.waves[duty] || this.waves[0.5]);
    osc.frequency.setValueAtTime(f, t);
    const a = o.attack ?? 0.006, end = t + Math.max(dur, a + 0.02);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, Math.max(t + a, end - 0.04)); g.gain.linearRampToValueAtTime(0.0001, end);
    if (o.vib) {
      const l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.35, dur));
      l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(end + 0.05);
    }
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(end + 0.05);
  }
  bass(f, t, dur, vol, out) { this._bass(f, t, dur, vol, out); }
  kick(t, vol, out) { this._kick(t, vol, out); }
  snare(t, vol, out) { this.noise(t, 0.14, vol, 'bandpass', 2200, 1400, 0.8, out); this.tone('triangle', 200, 130, t, 0.08, vol * 0.8, out); }
  hat(t, vol, out) { this.noise(t, 0.03, vol, 'highpass', 8000, 8000, 0.7, out); }
  tom(f, t, vol, out) { this.tone('sine', f * 2, f, t, 0.2, vol, out, 0.002); }
  /** a bell: two inharmonic partials ringing into the reverb */
  bell(f, t, vol, out) {
    const g1 = this.tone('sine', f, f, t, 1.4, vol, out, 0.002), g2 = this.tone('sine', f * 2.76, f * 2.76, t, 0.6, vol * 0.35, out, 0.002);
    g1.connect(this.verb); g2.connect(this.verb);
  }

  // ---------------------------------------------------------------- footsteps, on the beat
  /** what WREN's feet are doing: kind 'crawl' | 'water' | 'snow' | 'grass' | null, mode 'crawl' | 'walk' | 'run' */
  setMove(kind, mode) { this.move = kind ? { kind, mode } : null; }
  _footstep(tr, step, t) {
    const mv = this.move;
    if (!mv) return;
    const every = mv.mode === 'crawl' ? 4 : 2;
    if (step % every) return;
    const side = (step / every) & 1, ch = tr.chord || [57, 60, 64];
    const tone = NOTE(ch[side ? 2 : 0] + 24), loud = mv.mode === 'run' ? 1.5 : 1, b = this.sfxBus;
    if (mv.kind === 'crawl') {
      // cloth and elbows dragging over the ground: a soft 'shhh', faintly pitched to the chord
      this.noise(t, 0.26, 0.05, 'lowpass', 1100, 400, 0.7, b, 0.06);
      this.noise(t + 0.02, 0.2, 0.022, 'bandpass', tone, tone, 6, b, 0.05);
    } else if (mv.kind === 'water') {
      this.noise(t, 0.24, 0.07 * loud, 'lowpass', 1800, 260, 0.8, b, 0.01);
      this.tone('sine', tone * 2, tone * 3, t + 0.03, 0.07, 0.02 * loud, b);        // a bubble, in key
    } else if (mv.kind === 'snow') {
      for (let i = 0; i < 5; i++) this.noise(t + i * 0.013, 0.018, 0.075 * loud, 'bandpass', 1600 + Math.random() * 1400, 1500, 3, b, 0.001);
      this.noise(t, 0.07, 0.04 * loud, 'lowpass', 320, 200, 0.7, b);
    } else if (mv.kind === 'grass') {
      this.noise(t, 0.14, 0.025 * loud, 'bandpass', 3200, 2200, 1, b, 0.02);
    }
  }

  /** a clean kill (nobody noticed): a little fanfare on the next 8th, in the key of the current tune */
  cleanKill() {
    const c = this.ctx;
    if (!c) return;
    const tr = this.track, ch = tr?.chord || [69, 72, 76];
    let t = c.currentTime + 0.03;
    if (tr && tr.next > c.currentTime && tr.next - c.currentTime < 0.4) t = tr.next + (tr.step & 1 ? 60 / tr.bpm / 4 : 0);   // on the next 8th
    const b = this.sfxBus, n = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24];
    n.forEach((m, i) => this.voice(0.125, NOTE(m), t + i * 0.075, 0.12, 0.07, b));
    this.voice(0.25, NOTE(ch[2] + 24), t + 0.3, 0.45, 0.05, b, { vib: true });
    this.bell(NOTE(ch[0] + 36), t + 0.3, 0.05, b);
  }

  _bass(f, t, dur, vol, out) {
    const c = this.ctx, o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(900, t); fl.frequency.exponentialRampToValueAtTime(160, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }
  _kick(t, vol, out) { this.tone('sine', 140, 38, t, 0.28, vol, out, 0.002); }
}

/** @type {Record<string, (this: Audio, t: number) => void>} */
const SFX = {
  // WREN's rifle: firing-pin tick, supersonic crack, a heavy boom, and the report rolling back off the hills
  rifle(t) {
    this.tone('square', 2600, 2600, t, 0.012, 0.05);
    this.noise(t, 0.025, 1.0, 'highpass', 3000, 3000);
    this.noise(t, 0.09, 0.75, 'bandpass', 4200, 1900, 1.2);
    const body = this.noise(t, 0.7, 0.95, 'lowpass', 2800, 160);
    body.connect(this.verb); body.connect(this.echo);
    this.tone('sine', 115, 32, t, 0.5, 1.0, this.sfxBus, 0.002);
    this.noise(t + 0.38, 1.0, 0.16, 'lowpass', 700, 110, 0.7, this.sfxBus, 0.12).connect(this.verb);
    this.noise(t + 0.95, 1.3, 0.08, 'lowpass', 520, 90, 0.7, this.sfxBus, 0.2);
  },
  pistol(t) { this.noise(t, 0.14, 0.55, 'lowpass', 5000, 1200); this.tone('sine', 190, 70, t, 0.12, 0.4); },
  enemyShot(t) { this.tone('sawtooth', 1400, 260, t, 0.13, 0.12); this.noise(t, 0.09, 0.22, 'bandpass', 2400, 1400, 1.2); },
  // bolt-action cycle: lift, draw back, the brass tinkles away, push home, lock
  bolt(t) {
    this._clack(t, 2600, 0.12); this.noise(t + 0.05, 0.12, 0.13, 'bandpass', 1200, 2800, 2);
    this.tone('sine', 5200, 5100, t + 0.26, 0.07, 0.035); this.tone('sine', 6900, 6800, t + 0.38, 0.05, 0.025);
    this.noise(t + 0.45, 0.1, 0.13, 'bandpass', 2800, 1200, 2); this._clack(t + 0.56, 900, 0.3, 190);
  },
  // magazine change: release, out, a rummage in the pouch, in, seated with a slap
  reload(t) {
    this._clack(t, 2200, 0.1); this.noise(t + 0.08, 0.2, 0.12, 'bandpass', 900, 500, 2);
    this.noise(t + 0.55, 0.3, 0.06, 'lowpass', 1400, 600, 0.7, this.sfxBus, 0.05);
    this.noise(t + 1.15, 0.13, 0.12, 'bandpass', 500, 1000, 2); this._clack(t + 1.3, 1300, 0.34, 150);
    this._clack(t + 1.5, 2400, 0.08);
  },
  reloadDone(t) { this.noise(t, 0.12, 0.13, 'bandpass', 1200, 2800, 2); this.noise(t + 0.16, 0.1, 0.13, 'bandpass', 2800, 1200, 2); this._clack(t + 0.26, 900, 0.32, 190); },
  dry(t) { this.tone('square', 900, 700, t, 0.03, 0.1); },
  scopeIn(t) { this.noise(t, 0.28, 0.18, 'bandpass', 400, 1800, 1.5); this.tone('square', 2600, 2600, t + 0.26, 0.02, 0.06); },
  scopeOut(t) { this.noise(t, 0.22, 0.14, 'bandpass', 1800, 400, 1.5); },
  headshot(t) { this.tone('sine', 1760, 1700, t + 0.05, 0.4, 0.16); this.tone('triangle', 2640, 2600, t + 0.05, 0.25, 0.06); },
  // a blast: the crack, an overdriven boom, a sub-bass punch, debris raining down and the valley answering
  explosion(t) {
    this.noise(t, 0.06, 0.9, 'highpass', 1500, 1500);
    const b = this.noise(t, 2.2, 1.1, 'lowpass', 3200, 70, 0.7, this.drive, 0.004);
    b.connect(this.verb); b.connect(this.echo);
    this.tone('sine', 62, 22, t, 1.5, 1.0, this.sfxBus, 0.004);
    for (let i = 0; i < 16; i++) this.noise(t + 0.25 + Math.random() * 1.5, 0.03, 0.04 + Math.random() * 0.08, 'bandpass', 1400 + Math.random() * 3200, 1200, 4, this.sfxBus, 0.001);
    this.noise(t + 0.7, 1.6, 0.14, 'lowpass', 500, 80, 0.7, this.sfxBus, 0.25).connect(this.verb);
  },
  nuke(t) {
    this.noise(t, 4.5, 1.1, 'lowpass', 900, 50, 0.7, this.sfxBus, 0.05);
    this.tone('sine', 48, 22, t, 3.5, 1.0, this.sfxBus, 0.05);
    this.noise(t + 0.3, 3.0, 0.2, 'bandpass', 600, 200, 0.8);
  },
  rocket(t) { this.noise(t, 0.9, 0.45, 'bandpass', 700, 3200, 1.2); this.tone('sawtooth', 220, 90, t, 0.4, 0.08); },
  throw(t) { this.noise(t, 0.22, 0.2, 'bandpass', 500, 1600, 1); },
  plant(t) { this.tone('square', 1000, 1000, t, 0.06, 0.1); this.tone('square', 1000, 1000, t + 0.14, 0.06, 0.1); },
  beep(t) { this.tone('square', 880, 880, t, 0.08, 0.1); },
  whistle(t) { this.tone('sine', 1500, 480, t, 1.3, 0.14, this.sfxBus, 0.1); },
  laser(t) { this.tone('sine', 620, 640, t, 0.45, 0.08, this.sfxBus, 0.03); this.tone('sine', 1240, 1250, t, 0.45, 0.03, this.sfxBus, 0.03); },
  pickup(t) { [660, 880, 1320].forEach((f, i) => this.tone('square', f, f, t + i * 0.06, 0.07, 0.08)); },
  gasp(t) { this.noise(t, 0.55, 0.28, 'bandpass', 900, 600, 1.2, this.sfxBus, 0.15); },
  splash(t) { this.noise(t, 0.4, 0.3, 'lowpass', 2600, 300); },
  squelch(t) { this.noise(t, 0.12, 0.14, 'bandpass', 2200, 2000, 2.5); this.tone('square', 1500, 1500, t + 0.1, 0.02, 0.04); },
  objective(t) { [72, 76, 79, 84].forEach((n, i) => this.tone('triangle', NOTE(n), NOTE(n), t + i * 0.08, 0.3, 0.12)); },
  save(t) { this.tone('square', 1200, 1200, t, 0.05, 0.07); this.tone('square', 1600, 1600, t + 0.08, 0.07, 0.07); },
  alarm(t) { for (let i = 0; i < 3; i++) { this.tone('sawtooth', 520, 820, t + i * 0.5, 0.25, 0.1); this.tone('sawtooth', 820, 520, t + i * 0.5 + 0.25, 0.25, 0.1); } },
  spotted(t) { this.tone('square', 220, 220, t, 0.35, 0.1); this.tone('square', 233, 233, t, 0.35, 0.1); this.noise(t, 0.2, 0.12, 'highpass', 3000, 3000); },
  // silent takedown: a grab, the knife's hiss, a thud, a muffled grunt, the body let down
  takedown(t) {
    this.noise(t, 0.18, 0.22, 'bandpass', 900, 600, 1, this.sfxBus, 0.02);
    this.noise(t + 0.12, 0.14, 0.2, 'bandpass', 3500, 7500, 3);
    this.tone('sine', 3150, 3050, t + 0.14, 0.28, 0.04);
    this.noise(t + 0.2, 0.12, 0.5, 'lowpass', 700, 140); this.tone('sine', 95, 45, t + 0.2, 0.15, 0.5);
    const c = this.ctx, f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 2.2; f.connect(this.sfxBus);
    this.tone('sawtooth', 150, 88, t + 0.23, 0.24, 0.3, f, 0.02);
    this.noise(t + 0.6, 0.26, 0.4, 'lowpass', 420, 80); this.tone('sine', 72, 36, t + 0.6, 0.2, 0.4);
    this.noise(t + 0.78, 0.14, 0.14, 'lowpass', 380, 90);
  },
};
