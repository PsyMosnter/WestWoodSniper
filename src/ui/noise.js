// @ts-check
import { BALANCE } from '../config/balance.js';
import { C } from '../config/palette.js';
import { TILE } from '../core/camera.js';
import { TERRAIN } from '../world/tiles.js';

/**
 * Noise indicator (playtest feedback). Noise never fills the detection meter; it pulls enemies in:
 * anyone within a noise's radius comes to look where it came from (SPEC §8.2). So every noise the
 * NOT can react to is drawn as a ring with its true reach — anyone inside it heard it — and the HUD
 * meter shows how loud WREN is being right now (running, wading, shooting…).
 */
const EXPAND = 0.35;                       // s for a ring to reach full size
const HOLD = 1.5;                          // s the HUD meter keeps showing the last sound's reach
export const SPLASH = '#DDF4FF';           // wading: near-white reads as spray on any water

function colourFor(n, world) {
  if (n.kind === 'step') {
    const m = world.map, tx = Math.floor(n.x), ty = Math.floor(n.y);
    return m.inb(tx, ty) && TERRAIN[m.terrain[m.idx(tx, ty)]].water ? SPLASH : '#E8F0E0';
  }
  if (n.kind === 'explosion' || n.kind === 'c4') return C.uiAlert;
  if (n.radius >= 6) return C.uiAmber;     // shots, breaking glass, ricochets
  return '#E8F0E0';
}

export class NoiseIndicator {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.rings = [];                       // {x, y, r, t, life, col, loud}
    this.peak = 0; this.peakT = 99;        // WREN's last noise (radius, age) for the HUD meter
    this.world.events.on('noise', (n) => this.onNoise(n));
  }
  /** Did WREN make this noise (steps, own shots, own smoke/C4)? */
  isMine(n) {
    const op = this.world.operative;
    return n.source === op || n.kind === 'step' || n.kind === 'smoke' || n.kind === 'c4' || n.kind === 'rifle' || n.kind === 'pistol';
  }
  onNoise(n) {
    // the enemy's own gunfire and the map-wide strike roar aren't WREN's to manage
    if (n.kind === 'enemyShot' || n.radius > 40) return;
    const loud = n.radius >= 6;
    this.rings.push({ x: n.x, y: n.y, r: n.radius, t: 0, life: loud ? 1.4 : 0.8, col: colourFor(n, this.world), loud });
    if (this.rings.length > 24) this.rings.shift();
    if (this.isMine(n) && n.radius >= this.level()) { this.peak = n.radius; this.peakT = 0; }
  }
  update(dt) {
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    this.peakT += dt;
  }
  /** How far WREN's noise carries right now (tiles): footsteps while moving, or the last sound for a moment. */
  level() {
    const op = this.world.operative, m = this.world.map;
    let cur = 0;
    if (op.moving && !op.hidden && !op.dead) {
      if (op.mode === 'run') cur = BALANCE.noise.run;
      cur = Math.max(cur, TERRAIN[m.terrain[m.idx(op.tx, op.ty)]].noise || 0);
    }
    return Math.max(cur, this.peakT < HOLD ? this.peak : 0);
  }
  /** HUD reading: 0–5 lit segments, a word and its colour. */
  reading() {
    const lv = this.level();
    const segs = [0.5, 2, 4, 8, 14].filter((th) => lv >= th).length;
    if (lv < 0.5) return { lv, segs, word: 'SILENT', col: C.uiTextD };
    if (lv <= 3.5) return { lv, segs, word: 'QUIET', col: C.uiText };
    if (lv <= 8) return { lv, segs, word: 'LOUD', col: C.uiAmber };
    return { lv, segs, word: 'VERY LOUD', col: C.uiAlert };
  }
  /** World-space rings (drawn over the fog: a sound carries into places you can't see). */
  draw(ctx, rend) {
    const z = rend.cam.zoom;
    for (const ring of this.rings) {
      const grow = Math.min(1, ring.t / EXPAND), ease = 1 - (1 - grow) * (1 - grow);
      const fade = ring.t <= EXPAND ? 1 : Math.max(0, 1 - (ring.t - EXPAND) / (ring.life - EXPAND));
      const cx = rend.sx(ring.x), cy = rend.sy(ring.y), R = ring.r * TILE * z;
      ctx.fillStyle = ring.col;
      ctx.globalAlpha = (ring.loud ? 0.9 : 0.75) * fade;
      dotted(ctx, cx, cy, R * ease, z, 2);
      // loud noises: a couple of trailing echoes inside the wave front
      if (ring.loud) {
        ctx.globalAlpha = 0.4 * fade; dotted(ctx, cx, cy, R * ease * 0.72, z, 3);
        ctx.globalAlpha = 0.22 * fade; dotted(ctx, cx, cy, R * ease * 0.46, z, 4);
      }
    }
    ctx.globalAlpha = 1;
  }
}

/** Pixel-dotted circle: one dot every `gap` dots of circumference. */
function dotted(ctx, cx, cy, R, z, gap) {
  if (R < 1) return;
  const n = Math.max(12, Math.round((2 * Math.PI * R) / (z * gap)));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(a) * R), Math.round(cy + Math.sin(a) * R * 0.92), z, z);
  }
}
