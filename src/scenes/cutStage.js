// @ts-check
/**
 * LucasArts-style scenes for the cutscene player (think Day of the Tentacle / Full Throttle): the chibi cast acted
 * out on painted sets at full resolution, big talking-head close-ups, and speech typed in the speaker's colour above
 * their head instead of a subtitle bar.
 *
 *  - 'stage'   — a painted set (tent, dock, cabin) with actors: chibi figures with a comic-book ink line who walk,
 *                gesture while they talk, blink, and move their mouths to the letters of their line.
 *  - 'closeup' — one character's head and shoulders, big, on a painted backdrop of the mission's biome; whoever is
 *                on the radio appears on a green field-radio screen beside them (or nobody, for a voice-over).
 *
 * The figures are the in-game Chibi models (chibiInfantry.js) ray-cast at 4–8× with extra cutscene poses (sit, fish,
 * point, lean, talk…), eyebrows and a turnable head. Lip-sync, blinks and WREN's glasses gleam are cheap 2D
 * overlays on cached renders, so a shot needs only a handful of renders.
 */
import { renderChibi, bustBox, figureBox, addGleam } from '../render/spriteData/chibiInfantry.js';
import { Pix } from '../render/pixel.js';
import { drawText, wrapText, measureText } from '../render/font.js';

/** script speaker → cast member (chibi type) */
export const CAST_OF = { WREN: 'operative', OVERWATCH: 'overwatch', 'GOD COMMAND': 'general', 'DR. ADLER': 'adler', VRASK: 'vrask', VALE: 'pilot' };
const SKIN = { operative: '#E8A878', overwatch: '#A8704A', general: '#DCA482', adler: '#E8A878', pilot: '#E8A878', scientist: '#E8A878' };

// ------------------------------------------------------------------ figures (cached renders)
const FIG = new Map();
/**
 * A cutscene figure: whole ('fig') or head and shoulders ('bust') at `zoom` px per model unit, inked.
 * @returns {{c: HTMLCanvasElement|any, pix: Pix, ax: number, ay: number, w: number, h: number, anch: any, type: string, zoom: number, gl: any[], green?: any}}
 */
export function figure(type, pose, dir, frame, zoom, o = {}) {
  const frameKey = `${type}|${pose}|${dir}|${frame}|${zoom}|${o.bust ? 'b' : 'f'}|${o.brow ?? ''}|${o.yaw ?? ''}|${o.tilt ?? ''}`;
  let f = FIG.get(frameKey);
  if (f) return f;
  const box = o.bust ? bustBox(type, zoom) : figureBox(type, zoom);
  const r = renderChibi(type, pose, dir, frame, '', { zoom, box, ink: zoom >= 3 ? 1 : 0, brow: o.brow ?? 0, yaw: o.yaw, tilt: o.tilt });
  f = { get c() { return this._c || (this._c = this.pix.toCanvas()); }, _c: null, pix: r.pix, ax: r.ax, ay: r.ay, w: r.w, h: r.h, anch: r.anch, type, zoom, gl: [] };
  FIG.set(frameKey, f);
  return f;
}
/** WREN's glasses catching the light (step 0–4) on a cached figure. */
function gleamOf(f, step) {
  if (!f.gl[step]) { const p = Pix.from(f.pix); addGleam(p, (step + 1) / 6, f.zoom); f.gl[step] = p.toCanvas(); }
  return f.gl[step];
}
/** The figure as seen on a green field-radio screen (monochrome, 5 levels). */
function greenOf(f) {
  if (f.green) return f.green;
  const G = [0xFF162E0E, 0xFF2A5A1E, 0xFF489A3E, 0xFF7AE08E, 0xFFC8FFD8];
  const p = Pix.from(f.pix);
  for (let i = 0; i < p.data.length; i++) {
    const v = p.data[i];
    if (!(v >>> 24)) continue;
    const l = (0.3 * (v & 255) + 0.55 * ((v >>> 8) & 255) + 0.15 * ((v >>> 16) & 255)) / 255;
    p.data[i] = G[Math.min(4, Math.floor(Math.pow(l, 0.8) * 5.2))];
  }
  return (f.green = p.toCanvas());
}

// ------------------------------------------------------------------ talking
const VOWEL = /[AEIOUY]/i, QUIET = /[\s.,!?'"\-…]/;
/** How long a line is spoken (mouth moving), s. */
export const speakLen = (text) => 0.35 + text.length * 0.05;
/**
 * Who is speaking at time T (s from the cut's start) and how far into the line.
 * @returns {{who: string, lt: number, text: string} | null}
 */
export function speakingAt(lines, T, failedLine = '') {
  for (let i = lines.length - 1; i >= 0; i--) {
    const [at, who, raw] = lines[i];
    if (T < at) continue;
    const text = raw === '*' ? failedLine : raw;
    return T - at < speakLen(text) ? { who, lt: T - at, text } : null;
  }
  return null;
}
/** Mouth shape for a moment of a line: 0 closed, 1 half open, 2 open (vowels). */
export function mouthAt(text, lt) {
  const i = Math.floor(lt * 16);
  if (lt < 0 || i >= text.length) return 0;
  const ch = text[i];
  if (QUIET.test(ch)) return 0;
  return VOWEL.test(ch) ? 2 : i & 1 ? 1 : 0;
}
const blinking = (T, seed) => ((T + seed * 1.37) % 3.7) < 0.13;

/** Mouth, blink and glow overlays on a drawn figure at (x0, y0) = its sprite's top-left. */
function face(g, f, x0, y0, st) {
  const a = f.anch;
  if (!a) return;
  const z = f.zoom, green = !!st.green;
  if (a.mouth && st.mouth) {
    const [mx, my] = [x0 + a.mouth[0], y0 + a.mouth[1]];
    const ry = (st.mouth === 2 ? 0.95 : 0.5) * z, rx = (st.mouth === 2 ? 0.95 : 1.1) * z;
    oval(g, mx, my + ry * 0.35, rx, ry, green ? '#0A1A08' : '#3A1612');
    if (st.mouth === 2 && z >= 4) oval(g, mx, my + ry * 0.8, rx * 0.6, ry * 0.4, green ? '#2A5A1E' : '#C8645A');
  }
  if (a.eyes === 'anime' && st.blink && a.eyeL) {
    for (const e of [a.eyeL, a.eyeR]) {
      const ex = x0 + e[0], ey = y0 + e[1];
      oval(g, ex, ey, 1.35 * z, 1.9 * z, green ? '#489A3E' : SKIN[f.type] || '#E8A878');
      g.fillStyle = green ? '#0A1A08' : '#241C10'; g.fillRect(Math.round(ex - 1.2 * z), Math.round(ey + 0.4 * z), Math.round(2.4 * z), Math.max(1, Math.round(0.35 * z)));
    }
  }
  if (a.eyes === 'glow' && st.talking && a.eyeL) {
    g.globalAlpha = 0.25 + 0.2 * Math.sin(st.T * 18);
    for (const e of [a.eyeL, a.eyeR]) oval(g, x0 + e[0], y0 + e[1], 2.6 * z, 2.2 * z, '#C6FF5A');
    g.globalAlpha = 1;
  }
}
function oval(g, x, y, rx, ry, col) { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2); g.fill(); }

/**
 * Draw an actor (figure + face overlays) with its feet (or bust anchor) at (x, y); registers where their speech goes.
 * @param {any} scene the CutsceneScene (talkers are registered on it)
 */
function drawActor(scene, g, S, who, f, x, y, o = {}) {
  const x0 = Math.round(x - f.ax), y0 = Math.round(y - f.ay);
  const sp = speakingAt(scene.cut.lines, S.T, scene.failedLine);
  const talking = !!sp && sp.who === who;
  let img = o.green ? greenOf(f) : f.c;
  if (!o.green && f.type === 'operative' && f.anch?.eyeL) {                 // the sun in WREN's glasses
    const q = (S.T + 0.9) % 3.2;
    if (q < 0.4 && !S.reduced) img = gleamOf(f, Math.min(4, Math.floor(q / 0.08)));
  }
  g.drawImage(img, x0, y0);
  face(g, f, x0, y0, { mouth: talking ? mouthAt(sp.text, sp.lt) : 0, blink: !S.reduced && blinking(S.T, who.length), talking, T: S.T, green: o.green });
  if (f.anch) scene.talkers[who] = [x0 + f.anch.top[0], Math.max(0, y0 + f.anch.top[1])];
  return { x0, y0, talking };
}

// ------------------------------------------------------------------ speech (SCUMM style)
/** Speech typed out above a speaker's head, in their colour with a black outline, kept on screen. */
export function drawSpeech(ctx, text, x, y, color, W, top) {
  const maxW = Math.min(W - 16, 230);
  const rows = wrapText(text, maxW);
  const lh = 9;
  let yy = Math.max(top + 2, y - 6 - rows.length * lh);
  for (const row of rows) {
    const rw = measureText(row);
    const cx = Math.max(rw / 2 + 4, Math.min(W - rw / 2 - 4, x));
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) drawText(ctx, row, cx + dx, yy + dy, { color: '#000', align: 'center' });
    drawText(ctx, row, cx, yy, { color, align: 'center' });
    yy += lh;
  }
}

// ------------------------------------------------------------------ shots
/**
 * The two new shot kinds, built on the cutscene player's painting kit.
 * @param {any} K {BIOME, SKY, bands, ridge, blade, disc, ell, rng, weather, clamp01, ease, lerp}
 */
export function makeStageShots(K) {
  const { BIOME, SKY, bands, ridge, blade, disc, rng, weather, clamp01, lerp } = K;

  /** where an actor is at local time t: its base merged with the beats reached so far; moves interpolate */
  function actorAt(a, t) {
    const st = { ...a, walking: false };
    for (const b of a.beats || []) {
      if (t < b.t) break;
      const fromX = st.x, { t: t0, walk, ...rest } = b;
      Object.assign(st, rest);
      if (walk && b.x != null) { const k = clamp01((t - t0) / walk); st.x = lerp(fromX, b.x, k); st.walking = k < 1; }
    }
    return st;
  }

  /** a stage actor → figure for this moment (talk gestures while speaking, a walk cycle while moving) */
  function actorFig(scene, S, a) {
    const st = actorAt(a, S.t);
    const sp = speakingAt(scene.cut.lines, S.T, scene.failedLine);
    const talking = sp && sp.who === a.who;
    let pose = st.pose || 'stand', frame = 0;
    if (st.walking) { pose = 'walk'; frame = Math.floor(S.t * 9) % 6; }
    else if (talking && (pose === 'stand' || pose === 'talk')) { pose = 'talk'; frame = Math.floor(sp.lt / 0.45) % 3; }
    else if (pose === 'fish') frame = Math.floor(S.t * 1.5) & 1;
    else if (pose === 'point') frame = talking ? Math.floor(sp.lt / 0.3) & 1 : 0;
    const bob = st.walking || S.reduced ? 0 : Math.round(Math.sin(S.T * 2.1 + a.who.length) * 0.6);
    return { st, f: figure(CAST_OF[a.who] || a.who, pose, st.dir ?? 4, frame, a.zoom || 4, { brow: st.brow ?? 0, yaw: st.yaw, tilt: st.tilt ?? -0.18 }), bob };
  }

  // ---------------------------------------------------------------- sets: back layer, actors, front layer
  const SETS = {
    /** GOD field HQ at night: canvas walls, a swinging lamp, a radio desk, the big table in front */
    tent: {
      back(g, S) {
        const { w, h, T, reduced } = S;
        const swing = reduced ? 0 : Math.sin(T * 1.3) * 0.14;
        g.fillStyle = '#231F12'; g.fillRect(0, 0, w, h);
        // canvas walls with seams that lean in (the tent sags a little)
        bands(g, 0, h * 0.24, h * 0.8, w, ['#3A3420', '#443D25', '#4E462A', '#453E26']);
        g.fillStyle = '#2E2A18';
        for (let i = 0; i <= 8; i++) { const x = (w * i) / 8; g.beginPath(); g.moveTo(x - 2, h * 0.24); g.lineTo(x + 2 + (x - w / 2) * 0.05, h * 0.8); g.lineTo(x + 4 + (x - w / 2) * 0.05, h * 0.8); g.lineTo(x, h * 0.24); g.fill(); }
        // the roof: two sloping panels from the ridge pole
        g.fillStyle = '#2A2616'; g.beginPath(); g.moveTo(0, h * 0.26); g.lineTo(w * 0.5, 0); g.lineTo(w, h * 0.26); g.lineTo(w, 0); g.lineTo(0, 0); g.fill();
        g.fillStyle = '#353020'; g.beginPath(); g.moveTo(0, h * 0.26); g.lineTo(w * 0.5, h * 0.02); g.lineTo(w, h * 0.26); g.lineTo(w, h * 0.28); g.lineTo(w * 0.5, h * 0.05); g.lineTo(0, h * 0.28); g.fill();
        // the pole, a map pinned to the canvas, crates, the radio desk
        g.fillStyle = '#2A1C10'; g.fillRect(w * 0.5 - 3, 0, 6, h * 0.8); g.fillStyle = '#4A3420'; g.fillRect(w * 0.5 - 2, 0, 2, h * 0.8);
        const mx = w * 0.14, my = h * 0.3, mw = w * 0.24, mh = h * 0.24;
        g.fillStyle = '#1A1408'; g.fillRect(mx + 3, my + 3, mw, mh);
        g.fillStyle = '#C8B888'; g.beginPath(); g.moveTo(mx, my + 2); g.lineTo(mx + mw, my); g.lineTo(mx + mw - 2, my + mh); g.lineTo(mx + 2, my + mh + 2); g.fill();
        g.strokeStyle = '#4A7FA8'; g.lineWidth = 2; g.beginPath(); g.moveTo(mx + mw * 0.55, my + 2); g.bezierCurveTo(mx + mw * 0.45, my + mh * 0.4, mx + mw * 0.66, my + mh * 0.6, mx + mw * 0.5, my + mh); g.stroke();
        const Rm = rng(3); for (let i = 0; i < 9; i++) disc(g, mx + mw * (0.66 + Rm() * 0.28), my + mh * (0.12 + Rm() * 0.76), 1.6, '#7A3FC0');
        for (let i = 0; i < 16; i++) disc(g, mx + mw * (0.05 + Rm() * 0.36), my + mh * (0.1 + Rm() * 0.8), 1.4, '#5E7E3A');
        for (const [cx, cy, cw, ch] of [[w * 0.02, h * 0.56, w * 0.13, h * 0.24], [w * 0.05, h * 0.42, w * 0.1, h * 0.15]]) {
          g.fillStyle = '#3A3018'; g.fillRect(cx, cy, cw, ch); g.fillStyle = '#56482A'; g.fillRect(cx, cy, cw, 3); g.fillStyle = '#2A2210'; g.fillRect(cx + cw - 3, cy, 3, ch);
          drawText(g, 'GOD', cx + cw / 2, cy + ch / 2 - 3, { color: '#7A6A40', align: 'center' });
        }
        // radio desk on the right: a big field set with glowing dials and a needle that dances when it speaks
        const rx = w * 0.72, ry = h * 0.5;
        g.fillStyle = '#2E2616'; g.fillRect(rx - 6, ry + h * 0.14, w * 0.3, h * 0.2);
        g.fillStyle = '#1E2220'; g.fillRect(rx, ry, w * 0.2, h * 0.15); g.fillStyle = '#2E3430'; g.fillRect(rx, ry, w * 0.2, 3);
        const talking = S.speaking?.who === 'OVERWATCH';
        for (let i = 0; i < 3; i++) { disc(g, rx + 14 + i * 22, ry + h * 0.07, 6, '#0E1A12'); disc(g, rx + 14 + i * 22, ry + h * 0.07, 4, talking && (Math.floor(T * 8) + i) % 3 === 0 ? '#9CFF8A' : '#3E7A3A'); }
        g.fillStyle = '#FFB23A'; g.fillRect(rx + w * 0.2 - 10, ry + 6, 4, 3);
        // the hanging lamp and its warm, swinging pool of light
        const lx = w * 0.5 + Math.sin(swing) * h * 0.2, ly = h * 0.2;
        g.strokeStyle = '#141008'; g.lineWidth = 1; g.beginPath(); g.moveTo(w * 0.5, 0); g.lineTo(lx, ly); g.stroke();
        g.fillStyle = '#1A1A14'; g.beginPath(); g.moveTo(lx - 12, ly + 8); g.lineTo(lx + 12, ly + 8); g.lineTo(lx + 5, ly); g.lineTo(lx - 5, ly); g.fill();
        disc(g, lx, ly + 9, 3, '#FFF1A8');
        S.lamp = [lx, ly + 9];
      },
      front(g, S) {
        const { w, h } = S;
        const [lx, ly] = S.lamp;
        // the map table across the front, in a tilted, cartoon perspective
        g.fillStyle = '#2A1A0C'; g.beginPath(); g.moveTo(-10, h * 0.8); g.lineTo(w + 10, h * 0.76); g.lineTo(w + 10, h); g.lineTo(-10, h); g.fill();
        g.fillStyle = '#5A3A1E'; g.beginPath(); g.moveTo(-10, h * 0.8); g.lineTo(w + 10, h * 0.76); g.lineTo(w + 10, h * 0.79); g.lineTo(-10, h * 0.83); g.fill();
        g.fillStyle = '#C8B888'; g.beginPath(); g.moveTo(w * 0.22, h * 0.815); g.lineTo(w * 0.7, h * 0.79); g.lineTo(w * 0.74, h * 0.9); g.lineTo(w * 0.18, h * 0.93); g.fill();
        g.fillStyle = '#A89868'; for (let i = 1; i < 4; i++) g.fillRect(w * (0.22 + i * 0.12), h * 0.8, 1, h * 0.12);
        // a mug of coffee, steaming
        const cx = w * 0.84, cy = h * 0.8;
        g.fillStyle = '#E8E0C8'; g.fillRect(cx, cy - 12, 10, 12); g.fillStyle = '#B8B098'; g.fillRect(cx + 7, cy - 12, 3, 12); g.fillRect(cx + 10, cy - 9, 3, 5);
        if (!S.reduced) for (let i = 0; i < 3; i++) { const q = (S.T * 0.6 + i / 3) % 1; g.globalAlpha = 0.35 * (1 - q); disc(g, cx + 5 + Math.sin(q * 6 + i) * 3, cy - 14 - q * 18, 2 + q * 2, '#D8D0C0'); g.globalAlpha = 1; }
        // lamp light: warm glow on the table, darkness towards the corners
        const lg = g.createRadialGradient(lx, h * 0.7, 10, lx, h * 0.6, w * 0.62);
        lg.addColorStop(0, 'rgba(255,214,140,0.22)'); lg.addColorStop(0.45, 'rgba(255,190,110,0.06)'); lg.addColorStop(1, 'rgba(0,0,0,0.62)');
        g.fillStyle = lg; g.fillRect(0, 0, w, h);
        g.globalAlpha = 0.18; disc(g, lx, ly, 22, '#FFE8A0'); g.globalAlpha = 1;
      },
    },

    /** Dawn on the Varna: a jetty, a crate to sit on, a radio, reeds — and whatever is on the end of the line */
    dock: {
      back(g, S) {
        const { w, h, T, reduced } = S;
        const hy = Math.round(h * 0.47);
        bands(g, 0, 0, hy, w, ['#2E3A66', '#5A4E7A', '#A0647A', '#D8866A', '#F2B27A']);
        // flat stylised clouds and the low sun
        for (const [cx, cy, cw] of [[0.18, 0.16, 70], [0.5, 0.1, 50], [0.8, 0.2, 90], [0.64, 0.3, 40]]) { const x = ((cx * w + (reduced ? 0 : T * 3)) % (w + 120)) - 60; g.fillStyle = '#E8A088'; g.fillRect(x, cy * h, cw, 5); g.fillStyle = '#C87A7A'; g.fillRect(x + 8, cy * h + 5, cw - 16, 3); }
        g.globalAlpha = 0.3; disc(g, w * 0.7, hy - 6, 30, '#FFE0A0'); g.globalAlpha = 1; disc(g, w * 0.7, hy - 6, 13, '#FFE6A8');
        // far bank: pines and a mist band
        ridge(g, w, hy + 2, 16, 41, '#3A2E48', hy + 6, 2);
        g.fillStyle = '#2A2238';
        const Rp = rng(9);
        for (let x = 0; x < w; x += 7 + Rp() * 9) { const ph = 12 + Rp() * 22; g.beginPath(); g.moveTo(x, hy + 2); g.lineTo(x + 4, hy - ph); g.lineTo(x + 8, hy + 2); g.fill(); }
        g.globalAlpha = 0.35; g.fillStyle = '#F2C8A8'; g.fillRect(0, hy - 6, w, 6); g.globalAlpha = 1;
        // the river: sky colours reflected in bands, the sun's broken path, drifting ripples
        bands(g, 0, hy, h, w, ['#C8806A', '#8A5A6E', '#5A4A6A', '#3A3A5A', '#2A2E48']);
        for (let i = 0; i < 26; i++) { const y = hy + 3 + i * i * 0.28, len = 4 + i * 1.3, x = w * 0.7 - len / 2 + Math.sin(T * 2 + i * 1.7) * (2 + i * 0.4); g.fillStyle = i < 12 ? '#FFE0A0' : '#E8A878'; g.fillRect(Math.round(x), Math.round(y), Math.round(len), 1); }
        const Rr = rng(15); g.fillStyle = '#6A5A7E';
        for (let i = 0; i < 40; i++) { const y = hy + 6 + Rr() * (h - hy), x = (Rr() * w + (reduced ? 0 : T * (6 + (y - hy) * 0.08))) % w; g.fillRect(Math.round(x), Math.round(y), 3 + Math.round((y - hy) * 0.06), 1); }
        // the jetty, from the near left out into the river
        const fy = h * 0.62, nl = -20, nr = w * 0.62, fl = w * 0.1, fr = w * 0.42;
        // posts under the far end, the dark side of the deck, then the deck: boards running out, seams across
        for (const px of [fl + 6, fr - 10, (fl + fr) / 2]) { g.fillStyle = '#1E1208'; g.fillRect(px, fy, 5, 18); g.fillStyle = '#6A5A7E'; g.fillRect(px - 2, fy + 16, 9, 1); }
        g.fillStyle = '#24160A'; g.beginPath(); g.moveTo(nr, h); g.lineTo(fr, fy); g.lineTo(fr, fy + 7); g.lineTo(nr, h + 10); g.fill();
        g.fillStyle = '#2E1C0E'; g.fillRect(fl, fy, fr - fl, 5);
        g.fillStyle = '#5E4226'; g.beginPath(); g.moveTo(nl, h); g.lineTo(nr, h); g.lineTo(fr, fy); g.lineTo(fl, fy); g.fill();
        for (let i = 1; i < 7; i++) {                      // boards (lines converging on the far end)
          const k = i / 7; g.strokeStyle = '#3E2A16'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(lerp(nl, nr, k), h); g.lineTo(lerp(fl, fr, k), fy); g.stroke();
        }
        g.fillStyle = '#7A5A34';
        for (let i = 0; i < 7; i++) { const k = i / 7, y = lerp(fy, h, Math.pow(k, 1.6)); g.fillRect(Math.round(lerp(fl, nl, Math.pow(k, 1.6))), Math.round(y), Math.round(lerp(fr - fl, nr - nl, Math.pow(k, 1.6))), 1); }
        g.fillStyle = '#7A5A34'; g.beginPath(); g.moveTo(fl, fy); g.lineTo(fr, fy); g.lineTo(fr, fy + 1); g.lineTo(fl, fy + 1); g.fill();
        // WREN's seat (an upturned crate), the radio on another, his rifle leaning on it
        const sx = S.seat[0], sy = S.seat[1], sz = S.seatH;
        g.fillStyle = '#4A3218'; g.fillRect(sx - 14, sy - sz, 28, sz); g.fillStyle = '#6E4E2A'; g.fillRect(sx - 14, sy - sz, 28, 3); g.fillStyle = '#2E1E0E'; g.fillRect(sx + 11, sy - sz, 3, sz);
        const rx = sx - 58, ry = sy - 4;
        g.fillStyle = '#4A3218'; g.fillRect(rx - 16, ry - 22, 32, 22); g.fillStyle = '#6E4E2A'; g.fillRect(rx - 16, ry - 22, 32, 3);
        g.fillStyle = '#343A2E'; g.fillRect(rx - 12, ry - 38, 24, 16); g.fillStyle = '#4A5240'; g.fillRect(rx - 12, ry - 38, 24, 3);
        g.fillStyle = '#16181A'; g.fillRect(rx - 8, ry - 33, 10, 8);
        const on = S.speaking?.who === 'OVERWATCH';
        disc(g, rx + 7, ry - 30, 2, on && Math.floor(T * 10) & 1 ? '#9CFF8A' : '#2E4A2A');
        const sway = reduced ? 0 : Math.sin(T * 1.6) * 2;
        g.strokeStyle = '#16181A'; g.lineWidth = 1; g.beginPath(); g.moveTo(rx + 9, ry - 38); g.quadraticCurveTo(rx + 11, ry - 60, rx + 14 + sway, ry - 80); g.stroke();
        if (on && !reduced) { g.strokeStyle = '#E8F0E0'; for (let i = 0; i < 3; i++) { const q = (T * 2 + i / 3) % 1; g.globalAlpha = 1 - q; g.beginPath(); g.arc(rx, ry - 30, 14 + q * 16, -0.9, -0.2); g.stroke(); } g.globalAlpha = 1; }
        S.radio = [rx, ry - 40];
        g.strokeStyle = '#1A1C1E'; g.lineWidth = 3; g.beginPath(); g.moveTo(sx + 22, sy); g.lineTo(sx + 30, sy - 46); g.stroke();
        g.fillStyle = '#2E3336'; g.fillRect(sx + 25, sy - 36, 4, 12);
      },
      front(g, S, scene) {
        const { w, h, t, T, reduced } = S;
        // the fishing line: rod tip → float, which bobs, dips, then the line snaps up with a boot on it
        const tip = S.rodTip, fx = w * 0.72, fy = h * 0.7, gag = S.shot.gag ?? 99;
        const dip = t > gag && t < gag + 0.5, yank = t >= gag + 0.5;
        if (tip && !yank) {
          const bob = reduced ? 0 : Math.sin(T * 3) * 1.2 + (dip ? 4 : 0);
          g.strokeStyle = 'rgba(230,230,210,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(tip[0], tip[1]); g.quadraticCurveTo((tip[0] + fx) / 2, fy - 10, fx, fy + bob); g.stroke();
          g.fillStyle = '#E8E0C8'; g.fillRect(fx - 1, fy + bob - 4, 3, 3); g.fillStyle = '#FFB23A'; g.fillRect(fx - 1, fy + bob - 1, 3, 3);
          if (dip) { g.globalAlpha = 0.5; g.strokeStyle = '#F2D2B0'; g.beginPath(); g.ellipse(fx, fy + 3, 6 + (t - gag) * 20, 2 + (t - gag) * 5, 0, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
        }
        if (yank) {
          // the catch of the day: an old boot, up in an arc, down on the planks with a bounce
          const q = t - gag - 0.5, fl = Math.min(1, q / 1.1);
          const bx = lerp(fx, w * 0.46, fl), by = fl < 1 ? lerp(fy, h * 0.78, fl) - Math.sin(fl * Math.PI) * h * 0.42 : h * 0.78 - Math.abs(Math.sin(Math.min(1, (q - 1.1) / 0.4) * Math.PI)) * 8 * (q < 1.5 ? 1 : 0);
          if (tip && q < 1.3) { g.strokeStyle = 'rgba(230,230,210,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(tip[0], tip[1]); g.lineTo(bx, by - 8); g.stroke(); }
          const rot = fl < 1 ? q * 7 : 0.2;
          g.save(); g.translate(bx, by); g.rotate(rot);
          g.fillStyle = '#2A1C10'; g.fillRect(-7, -12, 8, 12); g.fillRect(-7, -3, 16, 6); g.fillStyle = '#4A3420'; g.fillRect(-6, -11, 3, 10); g.fillStyle = '#6A8A3A'; g.fillRect(2, -4, 5, 2);
          g.restore();
          if (q < 0.6) for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI - Math.PI; disc(g, fx + Math.cos(a) * q * 40, fy - Math.sin(-a) * q * 30 + q * q * 60, 1.5, '#E8D8C8'); }
          if (fl >= 1 && q < 1.8 && !reduced) scene.shake = 0.8;
        }
        // reeds in the near right corner
        const Rg = rng(21);
        for (let i = 0; i < 30; i++) { const x = w * 0.78 + Rg() * w * 0.26, hh = 26 + Rg() * 40; blade(g, x, h + 2, hh, 3, Math.sin(T * 1.1 + i) * (reduced ? 0.4 : 3), i & 1 ? '#3A3A1E' : '#4E4A26'); }
        const lg = g.createRadialGradient(w * 0.7, h * 0.4, 20, w * 0.5, h * 0.6, w * 0.7);
        lg.addColorStop(0, 'rgba(255,220,160,0.10)'); lg.addColorStop(1, 'rgba(20,10,30,0.45)');
        g.fillStyle = lg; g.fillRect(0, 0, w, h);
      },
    },

    /** Inside the dropship going home: ribbed walls, portholes with the dawn streaming past, a bench */
    cabin: {
      back(g, S) {
        const { w, h, T, reduced } = S;
        g.fillStyle = '#1C2024'; g.fillRect(0, 0, w, h);
        bands(g, 0, h * 0.12, h * 0.74, w, ['#23282C', '#2A3034', '#30373C', '#2A3034']);
        for (let i = 0; i < 7; i++) { const x = (w * (i + 0.5)) / 7; g.fillStyle = '#1A1E22'; g.fillRect(x - 4, 0, 8, h * 0.76); g.fillStyle = '#3E464C'; g.fillRect(x - 4, 0, 2, h * 0.76); for (let y = 12; y < h * 0.74; y += 14) { g.fillStyle = '#4E565C'; g.fillRect(x + 1, y, 2, 2); } }
        // portholes: the dawn going by
        for (let i = 0; i < 3; i++) {
          const cx = w * (0.22 + i * 0.28), cy = h * 0.34, R = h * 0.1;
          disc(g, cx, cy, R + 5, '#11141A'); disc(g, cx, cy, R + 3, '#4E565C');
          g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
          bands(g, cx - R, cy - R, cy + R, R * 2, ['#5A4E7A', '#A0647A', '#D8866A', '#F2B27A']);
          const Rc = rng(30 + i);
          for (let k = 0; k < 4; k++) { const x = cx + R - (((reduced ? 0 : T * 60) + Rc() * 200) % (R * 2 + 40)) + 20, y = cy - R + Rc() * R * 2; g.fillStyle = '#F2C8A8'; g.fillRect(x, y, 16 + Rc() * 12, 3); }
          g.restore();
        }
        // the jump light, amber, blinking
        disc(g, w * 0.92, h * 0.16, 4, Math.floor(T * 1.5) & 1 ? '#FFB23A' : '#5A3A10');
        // bench
        g.fillStyle = '#34401E'; g.fillRect(0, S.seat[1] - S.seatH, w, S.seatH);
        g.fillStyle = '#4A5A2A'; g.fillRect(0, S.seat[1] - S.seatH, w, 3);
        g.fillStyle = '#15181A'; g.fillRect(0, S.seat[1], w, h - S.seat[1]);
      },
      front(g, S) {
        const { w, h, T, reduced } = S;
        // a strap handle swinging from the ceiling rail
        const sw = reduced ? 0 : Math.sin(T * 1.7) * 4;
        g.strokeStyle = '#0E1012'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.76, 0); g.lineTo(w * 0.76 + sw, h * 0.2); g.stroke();
        g.strokeStyle = '#2E3336'; g.lineWidth = 3; g.beginPath(); g.arc(w * 0.76 + sw, h * 0.2 + 6, 6, 0, Math.PI * 2); g.stroke();
        const lg = g.createRadialGradient(w * 0.5, h * 0.5, 30, w * 0.5, h * 0.5, w * 0.7);
        lg.addColorStop(0, 'rgba(255,200,150,0.06)'); lg.addColorStop(1, 'rgba(0,0,0,0.5)');
        g.fillStyle = lg; g.fillRect(0, 0, w, h);
      },
    },
  };

  /** Close-up backdrop: the mission's sky and hills, big out-of-focus foliage, light shafts, its weather */
  function backdrop(g, S, shot) {
    const { w, h, T, reduced } = S;
    const B = BIOME[shot.biome] || BIOME.temperate;
    const hy = Math.round(h * 0.6);
    bands(g, 0, 0, hy + 10, w, SKY[shot.time] || SKY.day);
    const pan = reduced ? 0 : S.t * 2;
    ridge(g, w, hy - 10, 40, 5 + shot.biome.length, B.far[1], hy + 30, 3);
    ridge(g, w, hy + 10, 30, 13 + shot.biome.length, B.far[0], h, 3);
    const R = rng(shot.biome.length * 31 + 7);
    for (let i = 0; i < 22; i++) {                       // out-of-focus foliage: soft discs with a lighter core
      const x = R() * (w + 80) - 40 - pan * (0.5 + R()), y = h * 0.3 + R() * h * 0.6, r = 8 + R() * 16, c = B.g[1 + Math.floor(R() * 3)];
      g.globalAlpha = 0.12 + R() * 0.12; disc(g, x, y, r, c); g.globalAlpha *= 0.8; disc(g, x - r * 0.2, y - r * 0.2, r * 0.6, B.g[4]); g.globalAlpha = 1;
    }
    // a frame of dark leaves hanging into the corner opposite the speaker
    const lx = shot.side === 'right' ? 0 : w, sgn = shot.side === 'right' ? 1 : -1;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * 1.3 + 0.2, len = 30 + R() * 30, x = lx + sgn * (Math.cos(a) * len * 0.8), y = -6 + Math.sin(a) * len + Math.sin(T * 0.8 + i) * (reduced ? 0 : 1.5);
      g.fillStyle = i & 1 ? B.g[0] : B.g[1];
      g.beginPath(); g.ellipse(x, y, 16 + R() * 8, 6 + R() * 3, sgn * (a - 0.2), 0, Math.PI * 2); g.fill();
    }
    if (shot.time !== 'night') {
      g.globalAlpha = 0.07; g.fillStyle = '#FFF4D0';
      for (let i = 0; i < 4; i++) { const x = w * (0.1 + i * 0.28) + Math.sin(T * 0.3 + i) * 8; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 40, 0); g.lineTo(x - 60, h); g.lineTo(x - 110, h); g.fill(); }
      g.globalAlpha = 1;
    }
    weather(g, S, shot, B);
  }

  /** A field-radio screen with whoever is on the other end, in green */
  function radioScreen(scene, g, S, who, x, y, pw, ph) {
    const { T, reduced } = S;
    g.fillStyle = '#0C0E0C'; g.fillRect(x - 5, y - 5, pw + 10, ph + 20);
    g.fillStyle = '#2A2E2A'; g.fillRect(x - 4, y - 4, pw + 8, ph + 18);
    g.fillStyle = '#3E443E'; g.fillRect(x - 4, y - 4, pw + 8, 2);
    for (const [sx, sy] of [[x - 2, y - 2], [x + pw, y - 2], [x - 2, y + ph + 10], [x + pw, y + ph + 10]]) { g.fillStyle = '#6A706A'; g.fillRect(sx, sy, 2, 2); }
    g.fillStyle = '#0A1A0C'; g.fillRect(x, y, pw, ph);
    g.save(); g.beginPath(); g.rect(x, y, pw, ph); g.clip();
    g.fillStyle = '#10280F'; for (let i = 0; i < 6; i++) g.fillRect(x, y + (ph * i) / 6, pw, 1);
    const type = CAST_OF[who] || who;
    const sp = S.speaking, talking = sp && sp.who === who;
    const f = figure(type, talking ? 'talk' : 'stand', 4, talking ? Math.floor(sp.lt / 0.45) % 3 : 0, 4.2, { bust: true, brow: 0, tilt: -0.3 });
    const jitter = !reduced && talking && Math.floor(T * 13) % 11 === 0 ? 2 : 0;
    drawActor(scene, g, S, who, f, x + pw / 2 + jitter, y + ph + f.ay - f.h + 4, { green: true });
    for (let yy = 0; yy < ph; yy += 2) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, y + yy, pw, 1); }
    if (!reduced) { const by = y + ((T * 30) % (ph + 20)) - 10; g.fillStyle = 'rgba(160,255,160,0.08)'; g.fillRect(x, by, pw, 6); }
    g.restore();
    // the label strip and signal bars under the screen
    drawText(g, who, x + 2, y + ph + 3, { font: '3x5', color: '#9CFF8A' });
    for (let i = 0; i < 4; i++) { const on = talking ? (Math.floor(T * 9) + i) % 4 !== 0 : i < 2; g.fillStyle = on ? '#9CFF8A' : '#2E4A2A'; g.fillRect(x + pw - 18 + i * 4, y + ph + 8 - i * 2, 3, 2 + i * 2); }
    // speech goes above the screen
    scene.talkers[who] = [x + pw / 2, y - 2];
  }

  return {
    stage(g, S) {
      const { w, h, shot } = S;
      const set = SETS[shot.set];
      S.speaking = speakingAt(this.cut.lines, S.T, this.failedLine);
      S.seat = [Math.round(w * (shot.seatX ?? 0.34)), Math.round(h * (shot.seatY ?? 0.86))];
      const zoom = shot.zoom || 4;
      S.seatH = Math.round(1.7 * 2.3 * 0.83 * zoom);
      if (set) set.back(g, S);
      // actors, back to front
      const acts = (shot.actors || []).map((a) => ({ a, ...actorFig(this, S, { zoom, ...a }) })).sort((p, q) => (p.st.y ?? 0.9) - (q.st.y ?? 0.9));
      for (const { a, st, f, bob } of acts) {
        const x = Math.round(w * st.x), y = Math.round(h * (st.y ?? 0.9)) + bob;
        const { x0, y0 } = drawActor(this, g, S, a.who, f, x, y);
        if (f.anch?.rodTip) S.rodTip = [x0 + f.anch.rodTip[0], y0 + f.anch.rodTip[1]];
        if (st.zzz && !S.reduced) for (let i = 0; i < 3; i++) { const q = (S.t * 0.5 + i / 3) % 1; g.globalAlpha = 1 - q; drawText(g, 'z', x0 + f.anch.top[0] + 10 + q * 14 + Math.sin(q * 6) * 3, y0 + f.anch.top[1] + 16 - q * 30, { color: '#E8F0E0', scale: 1 + Math.round(q), shadow: '#000' }); g.globalAlpha = 1; }
      }
      // off-screen voices come from a prop (the radio on the dock)
      if (shot.radio && S.radio) this.talkers[shot.radio] = S.radio;
      if (set) set.front(g, S, this);
    },

    closeup(g, S) {
      const { w, h, shot, t } = S;
      S.speaking = speakingAt(this.cut.lines, S.T, this.failedLine);
      backdrop(g, S, shot);
      const who = shot.who, type = CAST_OF[who] || who;
      const talking = S.speaking?.who === who;
      const listen = shot.listen || 'stand';
      const pose = talking ? 'talk' : listen, frame = talking ? Math.floor(S.speaking.lt / 0.45) % 3 : 0;
      const zoom = shot.zoom || Math.max(6, Math.round(h / 34));
      const brow = (shot.beats || []).reduce((b, x) => (t >= x.t && x.brow != null ? x.brow : b), shot.brow ?? 0);
      const f = figure(type, pose, shot.dir ?? (shot.side === 'right' ? 5 : 3), frame, zoom, { bust: true, brow, yaw: shot.yaw, tilt: shot.tilt ?? -0.32 });
      const lb = Math.round(h * 0.1);
      const cx = shot.inset ? (shot.side === 'right' ? w * 0.7 : w * 0.3) : w * 0.5;
      const breath = S.reduced ? 0 : Math.round(Math.sin(S.T * 1.8) * 1);
      drawActor(this, g, S, who, f, cx, h - lb + f.ay - f.h + 2 + breath);
      if (shot.inset) {
        const pw = Math.round(Math.min(w * 0.36, 190)), ph = Math.round(Math.min(h * 0.44, 118));
        const x = shot.side === 'right' ? Math.round(w * 0.06) : Math.round(w - pw - w * 0.06), y = Math.round(h * 0.2);
        radioScreen(this, g, S, shot.inset, x, y, pw, ph);
      }
    },
  };
}

/** Everything a cut's stage and close-up shots will render, done up front (a few tens of ms each). */
export function preloadStage(shot, h) {
  if (shot.kind === 'closeup') {
    const type = CAST_OF[shot.who] || shot.who, zoom = shot.zoom || Math.max(6, Math.round(h / 34)), dir = shot.dir ?? (shot.side === 'right' ? 5 : 3);
    const o = { bust: true, brow: shot.brow ?? 0, yaw: shot.yaw, tilt: shot.tilt ?? -0.32 };
    figure(type, shot.listen || 'stand', dir, 0, zoom, o);
    for (let f = 0; f < 3; f++) figure(type, 'talk', dir, f, zoom, o);
    if (shot.inset) for (const [p, fr] of [['stand', 0], ['talk', 0], ['talk', 1], ['talk', 2]]) figure(CAST_OF[shot.inset] || shot.inset, p, 4, fr, 4.2, { bust: true, brow: 0, tilt: -0.3 });
  }
}
