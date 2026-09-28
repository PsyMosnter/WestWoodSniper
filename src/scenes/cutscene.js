// @ts-check
import { drawText, wrapText } from '../render/font.js';
import { makeCanvas } from '../render/pixel.js';
import { renderVehicle } from '../render/spriteData/newVehicles.js';
import { renderChibi } from '../render/spriteData/chibiInfantry.js';
import { makeStageShots, preloadStage, drawSpeech } from './cutStage.js';
import { drawLogo } from './menus.js';
import { CUTS, FAILED_LINES, CREDITS, cutLength } from '../missions/story.js';

/**
 * Cutscene player (story intro, mission intros, mission failed, campaign ending). Nature close-ups and
 * establishing shots are drawn procedurally into a low-resolution buffer (half the display, so they read as
 * pixel art) and scaled up; the acted scenes — painted sets and big talking heads, LucasArts style — are drawn at
 * full resolution (cutStage.js). The cast are the Chibi-style 3D models rendered big; vehicles are the New-style
 * models. Speech appears above the speaker's head in their colour; voices from off screen get a subtitle bar.
 * Tap / Esc / Enter / Space skips. Reduced motion: no shake, flashes or drift.
 */

// ------------------------------------------------------------------ palettes
const SKY = {
  day: ['#4F86B4', '#76A8CC', '#A9D0E2', '#D6EAF0'],
  dawn: ['#2E3A66', '#6A5A7E', '#C8866A', '#F2C68A'],
  dusk: ['#1E1A40', '#5A2E5E', '#B0566A', '#EC9A5A'],
  night: ['#04060C', '#080C18', '#0E1426', '#182038'],
};
const BIOME = {
  temperate: { g: ['#16301A', '#244A22', '#346A2C', '#4E8A36', '#76A84A'], ground: '#2E4A1E', far: ['#3A5A4A', '#56786A', '#7E9A8A'], soil: '#4A3A24' },
  arid: { g: ['#4A3A1C', '#6E5A2C', '#94803E', '#B8A052', '#D8C27A'], ground: '#9A7E4A', far: ['#7A4632', '#9C5E40', '#C47E52'], soil: '#8A6A3E' },
  alpine: { g: ['#2A3632', '#44524C', '#6A7A76', '#A8BAC2', '#E2ECF0'], ground: '#C8D8E0', far: ['#7A8E9C', '#9AB0BC', '#C4D4DC'], soil: '#A8BAC4', snow: true },
  desert: { g: ['#4A2A16', '#6E3E20', '#94562E', '#B8743E', '#DA9A5E'], ground: '#A8633F', far: ['#6A3424', '#8A4E34', '#B06A46'], soil: '#8A4E30' },
  jungle: { g: ['#0A1C0C', '#123014', '#1C461C', '#2A6026', '#3E7E34'], ground: '#1A3A18', far: ['#16301E', '#22442A', '#34603A'], soil: '#2E2A18' },
  swamp: { g: ['#141A10', '#222A1A', '#323C24', '#46522E', '#5E6C3C'], ground: '#262E1C', far: ['#1C2418', '#2A3424', '#3A4632'], soil: '#2A2618' },
  volcanic: { g: ['#0E0A0A', '#1A1414', '#2A2020', '#3E302C', '#56443C'], ground: '#241C1C', far: ['#1A1416', '#2A2224', '#3E3234'], soil: '#1E1616', embers: true },
};
const SPEAKER = { OVERWATCH: '#7CFF7A', WREN: '#FFE08A', 'GOD COMMAND': '#8FC2F0', 'DR. ADLER': '#C8A8FF' };
/** shots drawn at full resolution (the acted scenes) */
const HIRES = new Set(['stage', 'closeup']);
const BILE = ['#E8D43A', '#8E7F12', '#FFF6A0'];

// ------------------------------------------------------------------ helpers
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

/** Stepped vertical bands between colour stops (a posterised gradient), with a dithered seam. */
function bands(g, x, y0, y1, w, cols) {
  const n = cols.length, hgt = y1 - y0;
  for (let i = 0; i < n; i++) {
    const a = Math.round(y0 + (hgt * i) / n), b = Math.round(y0 + (hgt * (i + 1)) / n);
    g.fillStyle = cols[i]; g.fillRect(x, a, w, b - a);
    if (i < n - 1) { g.fillStyle = cols[i + 1]; for (let xx = x + (a & 1); xx < x + w; xx += 2) g.fillRect(xx, b - 1, 1, 1); }
  }
}
/** Noise ridge silhouette filled down to `bottom`. */
function ridge(g, w, base, amp, seed, col, bottom, step = 3, flat = 0) {
  const R = rng(seed);
  const k = [R() * 6, R() * 6, R() * 6];
  g.fillStyle = col;
  g.beginPath(); g.moveTo(0, bottom);
  for (let x = 0; x <= w + step; x += step) {
    let y = base - amp * (0.5 + 0.3 * Math.sin(x * 0.021 + k[0]) + 0.15 * Math.sin(x * 0.057 + k[1]) + 0.08 * Math.sin(x * 0.13 + k[2]));
    if (flat) y = Math.min(y, base - amp * flat);
    g.lineTo(x, Math.round(y));
  }
  g.lineTo(w, bottom); g.closePath(); g.fill();
}
/** A tapered grass blade from (x, y) up by h, bending by `bend` at the tip. */
function blade(g, x, y, h, wd, bend, col) {
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(x - wd / 2, y);
  g.quadraticCurveTo(x - wd * 0.3 + bend * 0.4, y - h * 0.6, x + bend, y - h);
  g.quadraticCurveTo(x + wd * 0.3 + bend * 0.4, y - h * 0.6, x + wd / 2, y);
  g.closePath(); g.fill();
}
function disc(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2); g.fill(); }
function ell(g, x, y, rx, ry, rot, col) { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2); g.fill(); }

// big 3D-model sprites for close-ups, cached across cutscenes
const SPR = new Map();
function inf(type, pose, dir, frame, zoom) {
  const key = `i|${type}|${pose}|${dir}|${frame}|${zoom}`;
  let s = SPR.get(key);
  if (!s) {
    const box = { w: Math.round(64 * zoom), h: Math.round(52 * zoom), ax: Math.round(32 * zoom), ay: Math.round(40 * zoom) };
    const r = renderChibi(type, pose, dir, frame, '', { zoom: zoom * 0.8, box, ink: zoom >= 3 ? 1 : 0 });
    s = { c: r.pix.toCanvas(), ax: r.ax, ay: r.ay, w: r.w, h: r.h }; SPR.set(key, s);
  }
  return s;
}
function veh(type, dir, zoom) {
  const key = `v|${type}|${dir}|${zoom}`;
  let s = SPR.get(key);
  if (!s) { const r = renderVehicle(type, dir, 'ok', zoom); s = { c: r.pix.toCanvas(), ax: r.ax, ay: r.ay, w: r.w, h: r.h }; SPR.set(key, s); }
  return s;
}
function put(g, s, x, y, alpha = 1) {
  if (alpha < 1) g.globalAlpha = alpha;
  g.drawImage(s.c, Math.round(x - s.ax), Math.round(y - s.ay));
  g.globalAlpha = 1;
}
/** Sprites a shot needs, rendered up front (a few tens of milliseconds each). */
function preload(shot, H) {
  if (HIRES.has(shot.kind)) { preloadStage(shot, H); return; }
  const walk = (type, dir, z) => { for (let f = 0; f < 6; f++) inf(type, 'walk', dir, f, z); };
  if (shot.kind === 'macro') {
    const a = shot.approach;
    if (a === 'crawl') { for (let f = 0; f < 4; f++) inf('operative', 'crawl', 2, f, 4); inf('operative', 'prone', 2, 0, 4); }
    if (a === 'skitter') veh('skitter', 2, 3);
    if (a === 'tracks') veh('juggernaut', 2, 2);
    if (a === 'infantry') { walk('husk', 2, 5); walk('lobber', 2, 4); }
    if (a === 'pods') walk('husk', 2, 5);
    if (a === 'sniffer') { walk('sniffer', 6, 5); inf('sniffer', 'idle', 6, 0, 5); }
    if (a === 'scatter') for (let f = 0; f < 6; f++) { inf('husk', 'run', 6, f, 3); inf('lobber', 'run', 6, f, 2); }
  }
  if (shot.kind === 'establish') {
    if (shot.wren === 'crouch') inf('operative', 'crouch', 0, 0, 3);
    if (shot.wren === 'prone') inf('operative', 'prone', 0, 0, 3);
    if (shot.wren === 'sit') inf('operative', 'crouch', 2, 0, 3);
    if (shot.scene === 'canyonPatrol') for (let f = 0; f < 6; f++) inf('husk', 'walk', 6, f, 1);
  }
}

// ------------------------------------------------------------------ the scene
export class CutsceneScene {
  constructor(app) { this.app = app; }
  /** @param {{id: string, next?: () => void, fromReplay?: boolean}} p */
  enter(p) {
    this.id = p.id;
    this.cut = CUTS[p.id] || CUTS.failed;
    this.next = p.next || (() => this.app.scenes.go('title', {}));
    this.len = cutLength(this.cut);
    this.t = 0;
    this.done = false;
    this.reduced = !!this.app.settings?.reducedMotion;
    this.failedLine = FAILED_LINES[Math.floor(Math.random() * FAILED_LINES.length)];
    if (p.id === 'failed') { this.app.audio?.music?.(null); this.app.audio?.sting?.('fail'); }
    else this.app.audio?.music?.('theme');
    this.shake = 0;
    for (const s of this.cut.shots) preload(s, this.app.display.H);
    const save = this.app.save;
    if (save) { save.seenCuts = save.seenCuts || {}; save.seenCuts[p.id] = true; this.app.persist?.(); }
    this.resize(this.app.display.W, this.app.display.H);
  }
  resize(W, H) {
    this.P0 = W >= 400 ? 2 : 1;
    this.bufs = this.bufs || {};
    for (const P of new Set([this.P0, 1])) {
      const bw = Math.ceil(W / P), bh = Math.ceil(H / P), b = this.bufs[P];
      if (!b || b.w !== bw || b.h !== bh) { const c = makeCanvas(bw, bh); this.bufs[P] = { c, g: /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), w: bw, h: bh }; }
    }
  }
  finish() {
    if (this.done) return;
    this.done = true;
    this.next();
  }
  frame(dt) {
    this.t += dt;
    if (this.t >= this.len) this.finish();
  }
  onPointerDown() { if (this.t > 0.35) this.finish(); }
  onKeyDown(code) { if (code === 'Escape' || code === 'Enter' || code === 'Space') this.finish(); }
  /** the shot playing at time t, and its local time */
  shotAt(t) {
    let t0 = 0;
    for (const s of this.cut.shots) { if (t < t0 + s.dur) return { s, lt: t - t0 }; t0 += s.dur; }
    const s = this.cut.shots[this.cut.shots.length - 1];
    return { s, lt: s.dur };
  }
  render(ctx) {
    const { W, H } = this.app.display;
    const { s, lt } = this.shotAt(this.t);
    if (!this.bufs[1] || this.bufs[1].w !== W || this.bufs[1].h !== H) this.resize(W, H);
    this.P = HIRES.has(s.kind) ? 1 : this.P0;
    const B = this.bufs[this.P], g = B.g, w = B.w, h = B.h;
    this.overlay = [];
    this.talkers = {};
    this.shake = 0;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const S = { w, h, t: lt, dur: s.dur, shot: s, reduced: this.reduced, T: this.t };
    const painter = SHOTS[s.kind];
    if (painter) painter.call(this, g, S);
    // fades between shots
    const fin = clamp01(lt / 0.5), fout = clamp01((s.dur - lt) / 0.35);
    const k = Math.min(fin, fout);
    if (k < 1) { g.fillStyle = `rgba(0,0,0,${(1 - k).toFixed(3)})`; g.fillRect(0, 0, w, h); }
    // letterbox
    const lb = Math.round(h * 0.1);
    g.fillStyle = '#000'; g.fillRect(0, 0, w, lb); g.fillRect(0, h - lb, w, lb);
    // to the screen (with a little shake on impacts)
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const sh = this.reduced ? 0 : this.shake;
    const ox = sh ? Math.round((Math.random() - 0.5) * sh * 2) * this.P : 0, oy = sh ? Math.round((Math.random() - 0.5) * sh * 2) * this.P : 0;
    ctx.drawImage(B.c, ox, oy, w * this.P, h * this.P);
    for (const o of this.overlay) o(ctx, W, H);
    this._subtitles(ctx, W, H, lb * this.P);
    if (this.t > 0.35) drawText(ctx, 'TAP TO SKIP >', W - 6, H - 10, { font: '3x5', color: '#5A625C', align: 'right' });
  }
  _subtitles(ctx, W, H, lbPx) {
    const lines = this.cut.lines;
    for (let i = 0; i < lines.length; i++) {
      const [at, who, raw] = lines[i];
      const text = raw === '*' ? this.failedLine : raw;
      const end = Math.min(i + 1 < lines.length ? lines[i + 1][0] : Infinity, at + 1.6 + text.length * 0.05);
      if (this.t < at || this.t >= end) continue;
      const n = Math.floor((this.t - at) * 45);
      const shown = text.slice(0, n);
      const on = this.talkers?.[who];
      if (on) { drawSpeech(ctx, shown, on[0] * this.P, on[1] * this.P, SPEAKER[who] || '#E8F0E0', W, lbPx, on[2] ? on[2] * this.P : undefined); continue; }
      const maxW = Math.min(W - 24, 420);
      const rows = wrapText(shown, maxW - measureSpeaker(who));
      const y0 = H - lbPx - 4 - rows.length * 9;
      const x0 = Math.round((W - maxW) / 2);
      ctx.fillStyle = 'rgba(4,6,5,0.72)';
      ctx.fillRect(x0 - 4, y0 - 3, maxW + 8, rows.length * 9 + 5);
      drawText(ctx, who + ':', x0, y0, { color: SPEAKER[who] || '#E8F0E0', shadow: '#000' });
      rows.forEach((r, j) => drawText(ctx, r, x0 + measureSpeaker(who), y0 + j * 9, { color: '#E8F0E0', shadow: '#000' }));
    }
  }
}
function measureSpeaker(who) { return (who.length + 2) * 6; }

// ------------------------------------------------------------------ shots
/** @type {Record<string, (this: CutsceneScene, g: CanvasRenderingContext2D, S: any) => void>} */
const SHOTS = {
  caption(g, S) {
    const { t } = S;
    this.overlay.push((ctx, W, H) => {
      const n = Math.floor(t * 18);
      drawText(ctx, S.shot.text.slice(0, n), W / 2, H / 2 - 6, { color: '#D8CA98', align: 'center', scale: 2, shadow: '#000' });
    });
  },

  /** Nature close-up, then something arrives in it. */
  macro(g, S) {
    const { w, h, t, shot, reduced } = S;
    const B = BIOME[shot.biome] || BIOME.temperate;
    const R = rng(shot.biome.length * 977 + (shot.approach || '').length * 131);
    const gy = Math.round(h * 0.8);
    const sway = reduced ? 0.25 : 1;
    const drift = reduced ? 0 : t * 1.6;
    const tA = t - (shot.lead ?? 3.0);               // arrival clock
    const night = shot.time === 'night';
    // out-of-focus background: sky, far foliage bokeh, ground
    bands(g, 0, 0, gy - 18, w, SKY[shot.time] || SKY.day);
    if (night) { const Rs = rng(7); for (let i = 0; i < 40; i++) { g.fillStyle = Rs() < 0.5 ? '#9AA6C8' : '#5A6488'; g.fillRect(Math.floor(Rs() * w), Math.floor(Rs() * (gy - 30)), 1, 1); } }
    for (let i = 0; i < 26; i++) {
      const x = (R() * (w + 60) - 30 - drift * (0.3 + R() * 0.3)) % (w + 60), y = gy - 30 + R() * 34, r = 6 + R() * 14;
      g.globalAlpha = 0.35 + R() * 0.3; disc(g, x < -30 ? x + w + 60 : x, y, r, B.far[Math.floor(R() * 3)]); g.globalAlpha = 1;
    }
    g.fillStyle = B.ground; g.fillRect(0, gy - 6, w, h - gy + 6);
    g.fillStyle = B.soil; for (let i = 0; i < 70; i++) g.fillRect(Math.floor(R() * w), gy - 4 + Math.floor(R() * (h - gy)), 1 + Math.floor(R() * 2), 1);
    if (B.snow) { g.fillStyle = '#E8F0F4'; g.fillRect(0, gy - 6, w, 3); }
    // squashed / flattened state (vehicle arrivals)
    const bugX = Math.round(w * 0.56);
    let crush = -1;                                  // x of the crushing front edge, if any
    let squashed = false;
    const ap = shot.approach;
    let vx = 0, vs = null;
    if ((ap === 'skitter' || ap === 'tracks') && tA > 0) {
      vs = ap === 'skitter' ? veh('skitter', 2, 3) : veh('juggernaut', 2, 2);
      const span = ap === 'skitter' ? 1.9 : 4.2, t0 = ap === 'skitter' ? 0.5 : 0.2;
      vx = lerp(-vs.w * 0.6, w + vs.w * 0.6, clamp01((tA - t0) / span));
      crush = vx + vs.w * 0.3;
      squashed = crush > bugX;
      if (Math.abs(vx - w / 2) < w * 0.6 && tA > t0) this.shake = ap === 'skitter' ? 1.2 : 2;
    }
    // back blades
    for (let i = 0; i < 70; i++) {
      const x = R() * w, hh = 26 + R() * 50, wd = 2 + R() * 3, ph = R() * 6;
      let bend = Math.sin(S.T * 1.3 + ph) * (2 + R() * 3) * sway;
      if (crush > x && crush - x < 180) bend = 18;   // pushed flat behind the wheels
      blade(g, x, gy + R() * 6, crush > x && crush - x < 180 ? hh * 0.35 : hh, wd, bend, B.g[1 + Math.floor(R() * 2)]);
    }
    // a broad leaf on the ground with dew
    ell(g, bugX - 26, gy + 4, 30, 6, -0.08, B.g[2]);
    ell(g, bugX - 26, gy + 3, 28, 3, -0.08, B.g[3]);
    g.fillStyle = B.g[1]; g.fillRect(bugX - 54, gy + 4, 56, 1);
    for (const [dx, dy] of [[-40, 1], [-18, 0], [-6, 2]]) { disc(g, bugX + dx, gy + dy, 1.5, '#CFE8F0'); g.fillStyle = '#FFFFFF'; g.fillRect(bugX + dx - 1, gy + dy - 1, 1, 1); }
    // the bug
    bug.call(this, g, S, shot.bug, bugX, gy, tA, ap, squashed);
    // arrivals (between the back and front layers)
    arrive.call(this, g, S, ap, tA, gy, bugX, vs, vx);
    // front blades, close and dark (framing) — the camera racks focus past them for a scope close-up
    const RF = rng(99 + shot.biome.length);
    const scopeCU = (ap === 'leaf' || ap === 'needle') && tA > 0.3;
    for (let i = 0; i < (scopeCU ? 0 : 12); i++) {
      const left = i < 6, x = left ? RF() * w * 0.22 : w - RF() * w * 0.22, hh = 60 + RF() * 70, wd = 6 + RF() * 7, ph = RF() * 6;
      blade(g, x, h + 4, hh, wd, (left ? 8 : -8) + Math.sin(S.T * 0.9 + ph) * 4 * sway, B.g[0]);
    }
    weather(g, S, shot, B);
  },

  /** Wide establishing shot: WREN in the foreground, the mission beyond. */
  establish(g, S) {
    const { w, h, t, shot, reduced } = S;
    const B = BIOME[shot.biome] || BIOME.temperate;
    const hy = Math.round(h * 0.44);
    bands(g, 0, 0, hy + 6, w, SKY[shot.time] || SKY.day);
    const night = shot.time === 'night';
    if (night) { const Rs = rng(11); for (let i = 0; i < 70; i++) { g.fillStyle = Rs() < 0.4 ? '#C8D0E8' : '#5A6488'; g.fillRect(Math.floor(Rs() * w), Math.floor(Rs() * hy), 1, 1); } disc(g, w * 0.8, h * 0.18, 7, '#D8DCE8'); disc(g, w * 0.8 + 3, h * 0.18 - 2, 6, SKY.night[1]); }
    else { const sx = shot.time === 'day' ? w * 0.75 : w * 0.62, sy = shot.time === 'day' ? h * 0.16 : hy - 4; g.globalAlpha = 0.35; disc(g, sx, sy, 16, '#FFE8B0'); g.globalAlpha = 1; disc(g, sx, sy, 8, shot.time === 'day' ? '#FFF6D8' : '#FFD27A'); }
    const pan = reduced ? 0 : t * 0.8;
    ridge(g, w, hy + 4, 30, 3 + shot.biome.length, B.far[0], hy + 30, 3);
    ridge(g, w, hy + 12, 20, 9 + shot.biome.length, B.far[1], hy + 40, 3);
    const scene = SCENES[shot.scene];
    if (scene) scene.call(this, g, S, B, hy, pan);
    // foreground ledge + WREN
    if (shot.wren && shot.wren !== 'none') {
      const fx = Math.round(w * 0.24), fy = Math.round(h * 0.86);
      g.fillStyle = B.g[0];
      g.beginPath(); g.moveTo(0, h); g.lineTo(0, fy - 12); g.quadraticCurveTo(fx - 10, fy - 6, fx + 40, fy - 2); g.quadraticCurveTo(fx + 90, fy + 4, fx + 120, h); g.closePath(); g.fill();
      const Rg = rng(5);
      for (let i = 0; i < 26; i++) blade(g, Rg() * (fx + 90), fy - 4 + Rg() * 20, 6 + Rg() * 12, 2, Math.sin(S.T * 1.2 + i) * (reduced ? 0.3 : 1.5), B.g[1]);
      const s = shot.wren === 'prone' ? inf('operative', 'prone', 0, 0, 3) : shot.wren === 'sit' ? inf('operative', 'crouch', 2, 0, 3) : inf('operative', 'crouch', 0, 0, 3);
      if (shot.wren === 'sit') {
        // against a pine at the tree line
        g.fillStyle = '#2A1E14'; g.fillRect(fx - 14, h * 0.2, 9, fy - h * 0.2 + 4);
        g.fillStyle = '#3E2C1C'; g.fillRect(fx - 12, h * 0.2, 3, fy - h * 0.2 + 4);
      }
      put(g, s, fx, fy);
      for (let i = 0; i < 10; i++) blade(g, fx - 30 + Rg() * 70, fy + 6, 5 + Rg() * 9, 2, Math.sin(S.T + i) * (reduced ? 0.3 : 1.2), B.g[0]);
    }
    weather(g, S, shot, B);
    // title card
    if (shot.title) {
      const k = Math.min(clamp01((t - 0.4) / 0.4), clamp01((3.0 - t) / 0.5));
      if (k > 0) this.overlay.push((ctx, W, H) => {
        ctx.globalAlpha = k;
        drawText(ctx, `MISSION ${shot.n}`, W / 2, H * 0.22, { font: '3x5', color: '#FFB23A', align: 'center', scale: 2, shadow: '#000' });
        drawText(ctx, shot.title, W / 2, H * 0.22 + 14, { color: '#E8E0B8', align: 'center', scale: 3, bold: true, shadow: '#000' });
        ctx.globalAlpha = 1;
      });
    }
  },

  mapTable(g, S) {
    const { w, h, t } = S;
    g.fillStyle = '#1A120C'; g.fillRect(0, 0, w, h);
    // the map
    const mx = w * 0.14, my = h * 0.16, mw = w * 0.72, mh = h * 0.68;
    g.fillStyle = '#C8B888'; g.fillRect(mx, my, mw, mh);
    g.fillStyle = '#B4A474'; for (let i = 0; i < 6; i++) g.fillRect(mx, my + (mh * i) / 6, mw, 1);
    const Rm = rng(21);
    g.fillStyle = '#6E8A4A';
    for (let i = 0; i < 90; i++) { const x = mx + Rm() * mw * 0.45, y = my + Rm() * mh; g.fillRect(x, y, 2, 2); }   // West Wood
    g.strokeStyle = '#4A7FA8'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(mx + mw * 0.55, my); g.bezierCurveTo(mx + mw * 0.45, my + mh * 0.4, mx + mw * 0.65, my + mh * 0.6, mx + mw * 0.52, my + mh); g.stroke();   // the Varna
    // NOT landings appear on the east bank
    const Rn = rng(44);
    for (let i = 0; i < 14; i++) {
      const x = mx + mw * (0.66 + Rn() * 0.3), y = my + mh * (0.1 + Rn() * 0.8);
      if (t > 0.4 + i * 0.12) { disc(g, x, y, 2.2, '#7A3FC0'); g.fillStyle = '#A6F03C'; g.fillRect(Math.round(x), Math.round(y) - 1, 1, 1); }
    }
    // one khaki pin on the west bank
    const pinT = clamp01((t - 2.6) / 0.35);
    if (pinT > 0) {
      const px = mx + mw * 0.36, py = my + mh * 0.52 - (1 - pinT) * 30;
      g.fillStyle = '#3A3424'; g.fillRect(px, py, 1, 8);
      disc(g, px, py, 3, '#D8CA98'); disc(g, px - 1, py - 1, 1, '#FFF6D8');
      if (pinT >= 1 && !S.reduced && t < 3.1) this.shake = 1;
    }
    // lamp light and vignette
    const lg = g.createRadialGradient(w * 0.5, h * 0.45, 10, w * 0.5, h * 0.45, w * 0.6);
    lg.addColorStop(0, 'rgba(255,220,150,0.12)'); lg.addColorStop(1, 'rgba(0,0,0,0.65)');
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
  },

  titleSlam(g, S) {
    const { w, h, t, reduced } = S;
    bands(g, 0, 0, h, w, SKY.dawn);
    ridge(g, w, h * 0.72, 30, 77, '#10180E', h, 2);
    const k = reduced ? 1 : ease(t / 0.28);
    if (!reduced && t > 0.25 && t < 0.55) this.shake = 3;
    this.overlay.push((ctx, W, H) => {
      const sc = reduced ? 3 : Math.max(3, Math.round(lerp(7, 3, k)));
      if (!reduced && t > 0.25 && t < 0.4) { ctx.fillStyle = 'rgba(255,241,168,0.5)'; ctx.fillRect(0, 0, W, H); }
      drawLogo(ctx, W / 2, H * 0.28 - (sc - 3) * 10, sc);
      if (t > 0.9) drawText(ctx, 'MISSION 1: FIRST LIGHT', W / 2, H * 0.72, { color: '#FFB23A', align: 'center', shadow: '#000' });
    });
  },

  static(g, S) {
    const { w, h, t, reduced } = S;
    const img = g.createImageData(w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = reduced ? 30 : Math.random() * 90; d[i] = v; d[i + 1] = v * 1.05; d[i + 2] = v; d[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    if (!reduced) { const by = Math.floor((t * 40) % h); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, by, w, 6); }
    const on = reduced || Math.floor(t * 6) % 3 !== 0;
    this.overlay.push((ctx, W, H) => { if (on) drawText(ctx, 'SIGNAL LOST', W / 2, H * 0.4, { color: '#FF5A3A', align: 'center', scale: 3, bold: true, shadow: '#000' }); });
  },

  credits(g, S) {
    const { w, h, t } = S;
    g.fillStyle = '#07090A'; g.fillRect(0, 0, w, h);
    this.overlay.push((ctx, W, H) => {
      const y0 = H * 0.9 - t * 22;
      drawLogo(ctx, W / 2, y0, 2);
      CREDITS.forEach(([a, b], i) => {
        const y = y0 + 70 + i * 22;
        if (y < -10 || y > H) return;
        if (b === 'note') drawText(ctx, a, W / 2, Math.max(H * 0.45, y), { color: '#FFB23A', align: 'center', shadow: '#000' });
        else if (b === 'title') drawText(ctx, a, W / 2, y, { color: '#E8E0B8', align: 'center', scale: 2, bold: true });
        else if (a) { drawText(ctx, a, W / 2, y, { color: '#E8F0E0', align: 'center' }); drawText(ctx, b, W / 2, y + 9, { font: '3x5', color: '#8A948A', align: 'center' }); }
      });
    });
  },
};

Object.assign(SHOTS, makeStageShots({ BIOME, SKY, bands, ridge, blade, disc, ell, rng, weather, clamp01, ease, lerp }));

// ------------------------------------------------------------------ the insect of the day
function bug(g, S, kind, bx, gy, tA, ap, squashed) {
  const T = S.T;
  if (kind === 'none') return;
  if (squashed) {
    // it had a good run
    for (const [dx, dy, r, c] of [[0, 0, 3, 0], [-5, 1, 1.5, 1], [4, 0, 1.2, 0], [7, 1, 1, 1], [-8, 0, 1, 2]]) disc(g, bx + dx, gy + dy, r, BILE[c]);
    return;
  }
  const flee = (ap === 'infantry' || ap === 'pods' || ap === 'crawl' || ap === 'sniffer') && tA > 0.6 ? (tA - 0.6) : 0;
  if (kind === 'beetle') {
    const x = bx - 24 + Math.min(1, S.t / 3) * 22 - flee * 70, y = gy - 1;
    const step = Math.floor(T * 12) & 1;
    ell(g, x, y - 3, 6, 4, 0, '#1A2A30');
    ell(g, x - 1, y - 4, 4.5, 2.5, 0, '#2E5A64');
    g.fillStyle = '#8AD4E0'; g.fillRect(Math.round(x - 3), Math.round(y - 6), 2, 1);
    disc(g, x + 6, y - 3, 2.2, '#10181C');
    g.fillStyle = '#10181C';
    for (let i = -1; i <= 1; i++) { g.fillRect(Math.round(x + i * 3), Math.round(y) + (step ^ (i & 1) ? 0 : 1), 1, 2); }
    g.fillRect(Math.round(x + 8), Math.round(y - 5), 2, 1);
  } else {
    // flyers hover near the leaf, then leave when something arrives
    const up = flee ? flee * 40 : 0;
    const x = bx - 10 + Math.sin(T * 1.7) * 14 + (flee ? flee * 50 : 0), y = gy - 26 + Math.sin(T * 2.9) * 5 - up;
    const flap = Math.sin(T * (kind === 'butterfly' || kind === 'moth' ? 14 : 40));
    if (kind === 'firefly') {
      const glow = 0.5 + 0.5 * Math.sin(T * 5);
      g.globalAlpha = 0.25 * glow; disc(g, x, y, 5, '#E4FF6A'); g.globalAlpha = 1;
      disc(g, x, y, 1.2, glow > 0.3 ? '#F4FFC0' : '#8A9A3A');
      return;
    }
    if (kind === 'dragonfly') {
      g.fillStyle = '#1E6A5A'; g.fillRect(Math.round(x - 7), Math.round(y), 12, 1);
      g.fillStyle = 'rgba(200,230,255,0.6)';
      g.fillRect(Math.round(x - 2), Math.round(y - 3 - flap), 7, 2); g.fillRect(Math.round(x - 2), Math.round(y + 1 + flap), 7, 2);
      disc(g, x + 5, y, 1.5, '#2A8A6A');
      return;
    }
    const col = kind === 'moth' ? ['#C8C0A8', '#8A806A'] : ['#E8923A', '#5A2A0C'];
    ell(g, x - 3, y - 2, 4, 3 + flap * 2, -0.4, col[0]);
    ell(g, x + 3, y - 2, 4, 3 + flap * 2, 0.4, col[0]);
    g.fillStyle = col[1]; g.fillRect(Math.round(x), Math.round(y - 4), 1, 6);
  }
}

// ------------------------------------------------------------------ arrivals
function arrive(g, S, ap, tA, gy, bugX, vs, vx) {
  const { w, h, reduced } = S;
  if (tA < 0) return;
  if (ap === 'skitter' || ap === 'tracks') {
    if (!vs) return;
    // dust behind
    for (let i = 0; i < 6; i++) {
      const age = (tA * 3 + i * 0.37) % 1.4;
      g.globalAlpha = 0.35 * (1 - age / 1.4); disc(g, vx - vs.w * 0.35 - i * 10, gy - 4 - age * 12, 5 + age * 10, ap === 'tracks' ? '#3A3230' : '#9A8A6A'); g.globalAlpha = 1;
    }
    put(g, vs, vx, gy + 2);
    if (ap === 'tracks' && !reduced) for (let i = 0; i < 8; i++) { const a = (tA * 2 + i * 0.13) % 1; g.fillStyle = a < 0.5 ? '#FFC24A' : '#C23F12'; g.fillRect(Math.round(vx - 40 + i * 12), Math.round(gy - a * 30), 1, 1); }
    return;
  }
  if (ap === 'infantry' || ap === 'pods') {
    if (ap === 'pods') {
      // spore pods streak down; one lands behind the grass
      for (let i = 0; i < 4; i++) {
        const p = tA * 0.9 - i * 0.35;
        if (p < 0 || p > 1) continue;
        const x0 = w * (0.2 + i * 0.2), x = x0 + p * 60, y = -10 + p * (gy - 30);
        g.strokeStyle = i % 2 ? '#A6F03C' : '#A36BE6'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x - 18, y - 30); g.lineTo(x, y); g.stroke();
        disc(g, x, y, 2.5, '#E4FF6A');
      }
      const boom = tA - 1.4;
      if (boom > 0 && boom < 1.2) {
        g.globalAlpha = clamp01(1 - boom); disc(g, w * 0.62, gy - 24, 10 + boom * 70, '#C4FF5A'); g.globalAlpha = 1;
        if (boom < 0.5) this.shake = 2;
      }
    }
    const t0 = ap === 'pods' ? 2.6 : 0.2;
    const walkers = ap === 'pods' ? [['husk', 5, 0]] : [['lobber', 4, 1.1], ['husk', 5, 0]];
    for (const [type, z, delay] of walkers) {
      const tt = tA - t0 - delay;
      if (tt < 0) continue;
      const x = -60 + tt * (z === 5 ? 95 : 80), fr = Math.floor(tt * 7.5) % 6;
      if (x > w + 80) continue;
      put(g, inf(type, 'walk', 2, fr, z), x, gy + (z === 5 ? 14 : 2));
    }
    return;
  }
  if (ap === 'sniffer') {
    // noses in from the right, sniffs at the leaf, pads off left
    const tt = tA - 0.2;
    if (tt < 0) return;
    let x, sniff = false;
    if (tt < 1.8) x = lerp(w + 70, w * 0.62, tt / 1.8);
    else if (tt < 3.4) { x = w * 0.62; sniff = true; }
    else x = w * 0.62 - (tt - 3.4) * 90;
    const s = sniff ? inf('sniffer', 'idle', 6, 0, 5) : inf('sniffer', 'walk', 6, Math.floor(tt * 9) % 6, 5);
    put(g, s, x, gy + 12 + (sniff && !reduced ? Math.round(Math.sin(tt * 18)) : 0));
    if (sniff) { g.globalAlpha = 0.25 + 0.25 * Math.sin(tt * 9); disc(g, x - 40, gy - 22, 4, '#E4FF6A'); g.globalAlpha = 1; }
    return;
  }
  if (ap === 'crawl') {
    // WREN low-crawls into frame, then goes still
    const tt = tA - 0.1, stop = 3.6;
    if (tt < 0) return;
    const x = lerp(-80, w * 0.44, clamp01(tt / stop));
    const s = tt < stop ? inf('operative', 'crawl', 2, Math.floor(tt * 4) & 3, 4) : inf('operative', 'prone', 2, 0, 4);
    put(g, s, x, gy + 4);
    return;
  }
  if (ap === 'leaf' || ap === 'needle') { scopeShot.call(this, g, S, ap, tA); return; }
  if (ap === 'scatter') {
    // the NOT stop dead, then run
    const run = tA > 1.2;
    for (const [type, z, x0, y0, d] of [['husk', 3, 0.7, 0, 0], ['lobber', 2, 0.45, -18, 0.3], ['husk', 3, 0.95, 4, 0.5], ['lobber', 2, 0.2, -22, 0.8]]) {
      const tt = Math.max(0, tA - 1.2 - d);
      const x = w * x0 - (run ? tt * 120 : 0);
      if (x < -60) continue;
      const s = run && tt > 0 ? inf(type, 'run', 6, Math.floor(tt * 10) % 6, z) : inf(type, 'run', 6, 1, z);
      put(g, s, x, gy + 8 + y0);
    }
  }
}

/** Close-up of WREN's rifle scope; a leaf (or a pine needle) drifts down onto it, a glove brushes it off. */
function scopeShot(g, S, ap, tA) {
  const { w, h, reduced } = S;
  const rise = ease(tA / 1.0);
  const y = Math.round(h * 0.62 + (1 - rise) * 60), x0 = Math.round(w * 0.12), x1 = w + 10;
  // barrel under the scope, then the scope tube, mount rings, turrets, objective bell and lens
  g.fillStyle = '#15171A'; g.fillRect(x0 + 20, y + 16, x1 - x0, 6);
  g.fillStyle = '#23272B'; g.fillRect(x0 + 34, y, x1 - x0, 18);
  g.fillStyle = '#343A3F'; g.fillRect(x0 + 34, y + 2, x1 - x0, 4);
  g.fillStyle = '#4C545A'; g.fillRect(x0 + 34, y + 3, x1 - x0, 1);
  for (const rx of [x0 + 70, x0 + 150]) { g.fillStyle = '#15171A'; g.fillRect(rx, y - 2, 12, 24); g.fillStyle = '#343A3F'; g.fillRect(rx + 2, y - 2, 3, 24); }
  g.fillStyle = '#1E2124'; g.fillRect(x0 + 104, y - 12, 16, 12); g.fillStyle = '#434A50'; g.fillRect(x0 + 106, y - 12, 12, 2);
  g.fillStyle = '#1E2124'; g.beginPath(); g.moveTo(x0 + 34, y - 4); g.lineTo(x0, y - 10); g.lineTo(x0, y + 28); g.lineTo(x0 + 34, y + 22); g.closePath(); g.fill();
  ell(g, x0, y + 9, 5, 19, 0, '#3F77A2'); ell(g, x0 + 1, y + 4, 2, 8, 0, '#9FD8FF');
  // the thing that falls
  const land = 2.6, fall = clamp01(tA / land), lx = x0 + 120 + Math.sin(tA * 3) * (1 - fall) * 30, ly = lerp(-10, y - 3, ease(fall));
  const brush = tA - 4.0;
  let bx = lx, by = ly, rot = (1 - fall) * tA * 4;
  if (brush > 0) { bx = lx + brush * 160; by = ly - brush * 60 + brush * brush * 30; rot = brush * 12; }
  if (ap === 'needle') {
    g.strokeStyle = '#2A4A2A'; g.lineWidth = 1;
    for (const a of [-0.25, 0.25]) { g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(rot + a) * 12, by + Math.sin(rot + a) * 12); g.stroke(); }
    g.fillStyle = '#5A3A20'; g.fillRect(Math.round(bx) - 1, Math.round(by) - 1, 2, 2);
  } else {
    ell(g, bx, by, 9, 4, rot, '#5E8A2A'); ell(g, bx - 1, by - 1, 6, 2, rot, '#86B04A');
    g.strokeStyle = '#3A5A1A'; g.lineWidth = 1; g.beginPath(); g.moveTo(bx - Math.cos(rot) * 9, by - Math.sin(rot) * 9); g.lineTo(bx + Math.cos(rot) * 11, by + Math.sin(rot) * 11); g.stroke();
  }
  // the glove
  if (brush > -0.4 && brush < 1.2) {
    const gx = lerp(w + 30, x0 + 100, ease((brush + 0.4) / 0.5)) + Math.max(0, brush) * 200;
    ell(g, gx, y - 6, 16, 9, -0.2, '#302820'); ell(g, gx - 12, y - 8, 7, 4, -0.2, '#43392C');
    g.fillStyle = '#968A5E'; g.fillRect(Math.round(gx + 10), Math.round(y - 12), 30, 12);
  }
  if (!reduced && fall >= 1 && tA < land + 0.15) this.shake = 0.6;
}

/** Weather over any shot. */
function weather(g, S, shot, B) {
  const { w, h, T, reduced } = S;
  const Rw = rng(3);
  if (shot.weather === 'blizzard' || B.snow) {
    const n = shot.weather === 'blizzard' ? 140 : 40, sp = shot.weather === 'blizzard' ? 90 : 25;
    g.fillStyle = '#EEF4F8';
    for (let i = 0; i < n; i++) {
      const x = (Rw() * w + T * sp * (reduced ? 0.3 : 1)) % w, y = (Rw() * h + T * (sp * 0.6 + Rw() * 20) * (reduced ? 0.3 : 1)) % h;
      g.fillRect(Math.floor(x), Math.floor(y), Rw() < 0.3 ? 2 : 1, 1);
    }
    if (shot.weather === 'blizzard') { g.fillStyle = 'rgba(220,232,240,0.18)'; g.fillRect(0, 0, w, h); }
  }
  if (shot.weather === 'rain') {
    g.strokeStyle = 'rgba(160,190,220,0.45)'; g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < 90; i++) { const x = (Rw() * w + T * 30) % w, y = (Rw() * h + T * 260) % h; g.moveTo(x, y); g.lineTo(x - 2, y + 6); }
    g.stroke();
  }
  if (shot.weather === 'haze') { g.fillStyle = 'rgba(200,210,170,0.16)'; g.fillRect(0, 0, w, h); }
  if (B.embers) for (let i = 0; i < 26; i++) { const x = (Rw() * w + Math.sin(T + i) * 6) % w, y = h - ((Rw() * h + T * (12 + Rw() * 16)) % h); g.fillStyle = Rw() < 0.5 ? '#FF7A1A' : '#FFC24A'; g.fillRect(Math.floor(x), Math.floor(y), 1, 1); }
  if (shot.time === 'night') { g.fillStyle = 'rgba(4,8,20,0.25)'; g.fillRect(0, 0, w, h); }
}

// ------------------------------------------------------------------ establishing-shot targets
/** @type {Record<string, (this: CutsceneScene, g: CanvasRenderingContext2D, S: any, B: any, hy: number, pan: number) => void>} */
const SCENES = {
  treeline(g, S, B, hy) {
    const { w, h } = S;
    for (let i = 0; i < 26; i++) { const x = (i * 23) % (w + 20) - 10, ph = 34 + ((i * 37) % 22); pine(g, x, hy + 30, ph, '#14241A'); }
    g.fillStyle = B.g[1]; g.fillRect(0, hy + 30, w, h - hy - 30);
    g.fillStyle = '#6A7E8A'; g.fillRect(w * 0.55, hy + 36, w * 0.45, 3);    // the Varna, far off
  },
  riverBase(g, S, B, hy, pan) {
    const { w, h, T } = S;
    const ry0 = Math.round(h * 0.56), ry1 = Math.round(h * 0.68);
    g.fillStyle = B.g[2]; g.fillRect(0, hy + 20, w, ry0 - hy - 20);
    // Cherry Hill with the radio outpost
    const cx = w * 0.66 - pan;
    ell(g, cx, hy + 26, 60, 18, 0, B.g[1]);
    bunker(g, cx - 30, hy + 14, 16, 7); bunker(g, cx + 10, hy + 12, 14, 6);
    g.fillStyle = '#23272B'; g.fillRect(cx - 6, hy - 22, 2, 34);                      // radio mast
    for (let i = 0; i < 4; i++) g.fillRect(cx - 6 - i, hy - 18 + i * 8, 2 + i * 2, 1);
    if (Math.floor(T * 2) & 1) { g.fillStyle = '#C4FF5A'; g.fillRect(cx - 6, hy - 24, 2, 2); }
    tower(g, cx + 40, hy + 18);
    // the river
    g.fillStyle = '#1F4E6B'; g.fillRect(0, ry0, w, ry1 - ry0);
    g.fillStyle = '#2B6A8C'; g.fillRect(0, ry0, w, 2);
    for (let i = 0; i < 18; i++) { const x = ((i * 53 + T * 14) % (w + 40)) - 20; g.fillStyle = '#5FA3C4'; g.fillRect(Math.round(x), ry0 + 4 + (i % 4) * 5, 8, 1); }
    g.fillStyle = B.ground; g.fillRect(0, ry1, w, h - ry1);
  },
  mesaBase(g, S, B, hy, pan) {
    const { w, h, T } = S;
    const x0 = w * 0.32 - pan, x1 = w * 0.98 - pan, top = hy + 6;
    g.fillStyle = B.far[2]; g.beginPath(); g.moveTo(x0 - 30, hy + 40); g.lineTo(x0, top); g.lineTo(x1, top); g.lineTo(x1 + 30, hy + 40); g.closePath(); g.fill();
    g.fillStyle = B.far[1]; for (let i = 1; i < 5; i++) g.fillRect(x0 - i * 6, top + i * 11, x1 - x0 + i * 12, 1);
    // power plant: stacks with smoke, pylons, turrets on the rim
    for (const sx of [x0 + 50, x0 + 70]) {
      g.fillStyle = '#353B40'; g.beginPath(); g.moveTo(sx - 7, top); g.lineTo(sx - 4, top - 26); g.lineTo(sx + 4, top - 26); g.lineTo(sx + 7, top); g.closePath(); g.fill();
      for (let i = 0; i < 4; i++) { const a = (T * 0.4 + i * 0.25) % 1; g.globalAlpha = 0.5 * (1 - a); disc(g, sx + a * 16, top - 30 - a * 26, 4 + a * 8, '#8A8A84'); g.globalAlpha = 1; }
    }
    for (const tx of [x0 + 12, x0 + 110, x1 - 20]) { ell(g, tx, top - 2, 6, 4, 0, '#262A2E'); g.fillStyle = '#15171A'; g.fillRect(tx, top - 4, 10, 2); g.fillStyle = '#C4FF5A'; g.fillRect(tx - 1, top - 3, 1, 1); }
    g.strokeStyle = '#23272B'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0 + 90, top); g.lineTo(x0 + 90, top - 18); g.lineTo(x1 - 40, top - 16); g.lineTo(x1 - 40, top); g.stroke();
    g.fillStyle = B.ground; g.fillRect(0, hy + 40, w, h);
  },
  convoyPass(g, S, B, hy, pan) {
    const { w, h, T } = S;
    ridge(g, w, hy + 30, 50, 61, '#6A7E8C', hy + 70, 2);
    g.fillStyle = B.ground; g.fillRect(0, hy + 60, w, h);
    // the road winds down the pass; the convoy's headlights crawl along it
    const road = (u) => [w * (0.95 - u * 0.8) - pan, hy + 32 + Math.sin(u * 5) * 6 + u * 26];
    g.fillStyle = '#9AAAB2';
    for (let u = 0; u <= 1; u += 0.01) { const [x, y] = road(u); g.fillRect(Math.round(x), Math.round(y), 4, 2); }
    for (let i = 0; i < 4; i++) {
      const u = (0.15 + i * 0.09 + T * 0.012) % 1, [x, y] = road(u), big = i === 1;
      g.fillStyle = big ? '#353B40' : '#262A2E'; g.fillRect(Math.round(x) - 3, Math.round(y) - 3, big ? 9 : 6, big ? 5 : 4);
      if (big) { g.fillStyle = '#6630A8'; g.fillRect(Math.round(x) - 3, Math.round(y) - 3, 9, 1); }
      g.globalAlpha = 0.35; disc(g, x - 6, y, 5, '#E4FF6A'); g.globalAlpha = 1;
      g.fillStyle = '#F4FFC0'; g.fillRect(Math.round(x) - 4, Math.round(y) - 1, 1, 1);
    }
  },
  canyonPatrol(g, S, B, hy, pan) {
    const { w, h, T } = S;
    // looking down from the rim: canyon walls, the floor road, a patrol walking it
    const fl = hy + 28;
    g.fillStyle = B.far[0]; g.fillRect(0, hy + 10, w, h);
    g.fillStyle = B.g[2]; g.beginPath(); g.moveTo(w * 0.35, hy + 10); g.lineTo(w, hy + 6); g.lineTo(w, h); g.lineTo(w * 0.55, h); g.closePath(); g.fill();
    g.fillStyle = B.g[1]; for (let i = 0; i < 6; i++) g.fillRect(w * 0.45 + i * 8, hy + 14 + i * 9, w, 1);
    g.fillStyle = B.soil; g.fillRect(0, fl, w, 14);
    g.fillStyle = B.g[3]; g.fillRect(0, fl + 6, w, 1);
    for (let i = 0; i < 4; i++) {
      const x = w * 0.95 - ((T * 10 + i * 12) % (w * 0.5)) - pan;
      put(g, inf('husk', 'walk', 6, (Math.floor(T * 7.5) + i) % 6, 1), x, fl + 10);
    }
    // the trucks, far off at the canyon mouth, dust behind them
    for (let i = 0; i < 3; i++) { const x = w * 0.5 + i * 12 - pan; g.fillStyle = '#968A5E'; g.fillRect(Math.round(x), fl + 2, 9, 4); g.fillStyle = '#4A7FA8'; g.fillRect(Math.round(x) + 3, fl + 2, 3, 1); g.globalAlpha = 0.25; disc(g, x - 6, fl + 4, 5, '#C4A07A'); g.globalAlpha = 1; }
  },
  island(g, S, B, hy, pan) {
    const { w, h, T } = S;
    g.fillStyle = '#1F4E6B'; g.fillRect(0, hy + 18, w, h);
    for (let i = 0; i < 24; i++) { const x = ((i * 41 + T * 8) % (w + 30)) - 15; g.fillStyle = '#2B6A8C'; g.fillRect(Math.round(x), hy + 22 + (i % 6) * 7, 10, 1); }
    // Delta Island and the refinery
    const cx = w * 0.64 - pan;
    ell(g, cx, hy + 22, 70, 9, 0, B.g[2]);
    for (const [dx, hh] of [[-40, 22], [-22, 30], [10, 26], [36, 18]]) { g.fillStyle = '#353B40'; g.fillRect(cx + dx, hy + 16 - hh, 6, hh); g.fillStyle = '#6630A8'; g.fillRect(cx + dx, hy + 16 - hh, 6, 1); }
    for (const dx of [-8, 22]) { ell(g, cx + dx, hy + 12, 8, 5, 0, '#C0661E'); ell(g, cx + dx, hy + 10, 6, 2, 0, '#E8923A'); }
    g.fillStyle = '#23272B'; g.fillRect(cx + 54, hy - 20, 2, 36);
    const f = 3 + Math.sin(T * 12) * 1.5; disc(g, cx + 55, hy - 22 - f, f, '#FFC24A'); disc(g, cx + 55, hy - 21, 2, '#FFF1A8');
  },
  prison(g, S, B, hy, pan) {
    const { w, h, T, reduced } = S;
    g.fillStyle = B.ground; g.fillRect(0, hy + 20, w, h);
    const x0 = w * 0.34 - pan, x1 = w * 0.96 - pan, wy = hy + 8;
    g.fillStyle = '#2A2E32'; g.fillRect(x0, wy, x1 - x0, 14);
    g.fillStyle = '#3A4045'; g.fillRect(x0, wy, x1 - x0, 2);
    for (const bx of [x0 + 20, x0 + 70, x0 + 120]) { g.fillStyle = '#23272B'; g.fillRect(bx, wy - 14, 30, 14); for (let i = 0; i < 4; i++) if ((i * 7 + Math.floor(bx)) % 3) { g.fillStyle = '#FFB23A'; g.fillRect(bx + 4 + i * 7, wy - 9, 2, 2); } }
    for (const tx of [x0 - 4, x1 - 6]) {
      g.fillStyle = '#23272B'; g.fillRect(tx, wy - 26, 8, 40);
      const a = reduced ? 0.3 : Math.sin(T * 0.8 + tx) * 0.6;
      g.fillStyle = 'rgba(255,240,180,0.13)'; g.beginPath(); g.moveTo(tx + 4, wy - 24); g.lineTo(tx + 4 + Math.sin(a) * 90 - 18, wy + 60); g.lineTo(tx + 4 + Math.sin(a) * 90 + 18, wy + 60); g.closePath(); g.fill();
      g.fillStyle = '#FFF1A8'; g.fillRect(tx + 3, wy - 25, 3, 2);
    }
  },
  spire(g, S, B, hy, pan) { spire(g, S, B, hy, pan, 0); },
  spireFalls(g, S, B, hy, pan) {
    const t = S.t;
    const fallT = clamp01((t - 2.4) / 2.8);
    spire(g, S, B, hy, 0, ease(fallT));
    const { w, h, reduced } = S;
    if (t > 1.6 && t < 2.6) { if (!reduced) { g.fillStyle = `rgba(255,241,168,${(1 - (t - 1.6)).toFixed(2)})`; g.fillRect(0, 0, w, h); this.shake = 3; } }
    if (t > 1.8) { const k = clamp01((t - 1.8) / 3); for (let i = 0; i < 5; i++) { g.globalAlpha = 0.5 * (1 - k * 0.5); disc(g, w * 0.66, hy - 10 - i * 10 * k, 10 + i * 4 * k + k * 10, i % 2 ? '#8A6A5A' : '#5A4A44'); } g.globalAlpha = 1; }
  },
  dropship(g, S, B, hy) {
    const { w, h, t } = S;
    for (let i = 0; i < 30; i++) { const x = (i * 19) % (w + 20) - 10, ph = 30 + ((i * 29) % 20); pine(g, x, hy + 34, ph, '#10200E'); }
    g.fillStyle = '#0E1A0C'; g.fillRect(0, hy + 34, w, h);
    const k = ease(clamp01((t - 0.8) / 5.4));
    const x = lerp(w * 0.4, w * 1.2, k * k), y = lerp(hy + 22, h * 0.12, k);
    dropship(g, x, y, t);
  },
};

function pine(g, x, base, hh, col) {
  g.fillStyle = col;
  for (let i = 0; i < 4; i++) { const y = base - hh + i * hh * 0.22, wd = 4 + i * 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x - wd, y + hh * 0.3); g.lineTo(x + wd, y + hh * 0.3); g.closePath(); g.fill(); }
  g.fillRect(x - 1, base - 4, 3, 5);
}
function bunker(g, x, y, bw, bh) { g.fillStyle = '#262A2E'; g.fillRect(x, y, bw, bh); g.fillStyle = '#353B40'; g.fillRect(x, y, bw, 1); g.fillStyle = '#C4FF5A'; g.fillRect(x + 3, y + 2, bw - 6, 1); }
function tower(g, x, y) { g.fillStyle = '#23272B'; g.fillRect(x, y - 20, 1, 20); g.fillRect(x + 8, y - 20, 1, 20); g.fillRect(x - 2, y - 26, 13, 6); g.fillStyle = '#6630A8'; g.fillRect(x - 2, y - 26, 13, 1); }
function spire(g, S, B, hy, pan, fall) {
  const { w, h, T } = S;
  // the volcano, lava at the rim
  const cx = w * 0.66 - pan, base = hy + 40;
  g.fillStyle = '#1A1416'; g.beginPath(); g.moveTo(cx - 110, base); g.lineTo(cx - 26, hy - 6); g.lineTo(cx + 26, hy - 6); g.lineTo(cx + 110, base); g.closePath(); g.fill();
  g.fillStyle = '#C23F12'; g.fillRect(cx - 24, hy - 6, 48, 2); g.fillStyle = '#FF7A1A'; g.fillRect(cx - 16, hy - 5, 32, 1);
  // the Hive Spire, violet with lime veins
  g.save();
  g.translate(cx, hy - 6);
  g.rotate(fall * 1.2);
  g.fillStyle = '#3A1A60'; g.beginPath(); g.moveTo(-9, 0); g.lineTo(-3, -50); g.lineTo(3, -50); g.lineTo(9, 0); g.closePath(); g.fill();
  g.fillStyle = '#6630A8'; g.fillRect(-5, -48, 3, 46);
  g.fillStyle = '#A6F03C'; for (let i = 0; i < 4; i++) g.fillRect(i % 2 ? 1 : -3, -9 - i * 10, 2, 5);
  if (fall < 0.05) { g.globalAlpha = 0.4 + 0.3 * Math.sin(T * 3); disc(g, 0, -52, 4, '#E4FF6A'); g.globalAlpha = 1; }
  g.restore();
  // the shield dome shimmers (gone once the strike has landed)
  if (fall === 0 && S.shot.scene === 'spire') {
    g.strokeStyle = `rgba(164,108,230,${(0.35 + 0.15 * Math.sin(T * 2)).toFixed(2)})`; g.lineWidth = 1;
    for (let r = 0; r < 3; r++) { g.beginPath(); g.arc(cx, hy - 6, 62 - r * 3, Math.PI, 0); g.stroke(); }
  }
  // jammer masts on the ridges
  for (const jx of [cx - 150, cx + 140, cx - 60]) { g.fillStyle = '#23272B'; g.fillRect(jx, hy + 4, 2, 22); if (Math.floor(T * 3 + jx) & 1) { g.fillStyle = '#FF5A3A'; g.fillRect(jx, hy + 2, 2, 2); } }
  g.fillStyle = B.ground; g.fillRect(0, base, w, h);
}
function dropship(g, x, y, t) {
  // side view: khaki fuselage, steel-blue canopy, two engine pods glowing
  ell(g, x, y, 26, 7, -0.05, '#A89968');
  ell(g, x, y - 2, 24, 4, -0.05, '#C4B687');
  ell(g, x + 16, y - 3, 7, 3, -0.05, '#6FA2C8');
  g.fillStyle = '#7C7049'; g.fillRect(Math.round(x - 30), Math.round(y - 6), 8, 3);
  for (const dx of [-12, 6]) { ell(g, x + dx, y + 7, 6, 3, 0, '#5A6166'); g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 20); disc(g, x + dx, y + 11, 3, '#9FD8FF'); g.globalAlpha = 1; }
}
