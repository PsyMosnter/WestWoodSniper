// @ts-check
import { BALANCE } from '../config/balance.js';
import { TILE } from '../core/camera.js';
import { makeCanvas } from './pixel.js';
import { T } from '../world/tiles.js';
import { canSee } from '../world/los.js';

/**
 * Night & dusk lighting (SPEC §16 M6/M7): a darkness layer over the world with stepped light
 * pools (campfires, spore crystals, lava, fires) and searchlight beams from guard towers.
 * Also answers `world.isLit(tx, ty)` for the detection formula: a lit target is seen at full
 * daytime range and without the night light penalty.
 */
export class Lighting {
  constructor(game) {
    this.game = game;
    const w = this.world = game.world;
    const d = w.data;
    this.mode = d.time === 'night' ? 'night' : d.time === 'dusk' ? 'dusk' : null;
    this.dark = this.mode === 'night' ? 0.64 : this.mode === 'dusk' ? 0.26 : 0;
    this.tone = this.mode === 'night' ? [8, 12, 30] : [40, 18, 30];
    const m = w.map;
    /** static light pools: data lights + lava (every few tiles) */
    this.pools = (d.lights || []).map((l) => ({ x: l.x + 0.5, y: l.y + 0.5, r: l.r || 3, warm: l.color || '#FFB45A', flicker: true }));
    for (let y = 1; y < m.h; y += 3) for (let x = 1; x < m.w; x += 3) {
      if (m.terrain[m.idx(x, y)] === T.lava) this.pools.push({ x: x + 0.5, y: y + 0.5, r: 2.4, warm: '#FF6A1A', flicker: false });
    }
    // precomputed lit grid for static pools (LOS from the light so walls cast darkness)
    this.lit = new Uint8Array(m.w * m.h);
    for (const p of this.pools) {
      const r = Math.ceil(p.r);
      for (let yy = Math.floor(p.y) - r; yy <= Math.floor(p.y) + r; yy++) for (let xx = Math.floor(p.x) - r; xx <= Math.floor(p.x) + r; xx++) {
        if (!m.inb(xx, yy) || Math.hypot(xx + 0.5 - p.x, yy + 0.5 - p.y) > p.r) continue;
        if (canSee(m, Math.floor(p.x), Math.floor(p.y), xx, yy, {})) this.lit[m.idx(xx, yy)] = 1;
      }
    }
    this.canvas = null;
    w.isLit = (tx, ty) => this.isLit(tx, ty);
  }
  /** Active searchlight beams: guard towers with a working light and a living gunner. */
  beams() {
    if (this.mode !== 'night') return [];
    const out = [];
    const S = BALANCE.ai.vision.searchlight;
    for (const u of this.world.units) {
      if (u.dead || u.kind !== 'emplacement' || u.type !== 'guardTower') continue;
      const s = u.structure;
      if (!s || s.dead || s.st?.lightDead || s.st?.unpowered) continue;
      out.push({ x: u.x, y: u.y, a: u.angle, len: S.radius, half: (S.cone * Math.PI) / 360, u });
    }
    return out;
  }
  inBeam(b, x, y) {
    const dx = x - b.x, dy = y - b.y, d = Math.hypot(dx, dy);
    if (d > b.len || d < 0.5) return false;
    let a = Math.atan2(dy, dx) - b.a;
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return Math.abs(a) <= b.half;
  }
  isLit(tx, ty) {
    if (!this.mode) return false;
    const m = this.world.map;
    if (!m.inb(tx, ty)) return false;
    if (this.lit[m.idx(tx, ty)]) return true;
    for (const b of this.beams()) if (this.inBeam(b, tx + 0.5, ty + 0.5) && canSee(m, Math.floor(b.x), Math.floor(b.y), tx, ty, { elevO: m.elevAt(Math.floor(b.x), Math.floor(b.y)) + 1 })) return true;
    // burning ground (structure fires) lights its surroundings
    for (const f of this.game.structures?.fires || []) if (Math.abs(f.x - tx) <= 2 && Math.abs(f.y - ty) <= 2) return true;
    return false;
  }
  /** Draw the darkness layer with light holes (called between the sprites and the effects). */
  draw(ctx, r) {
    if (!this.mode) return;
    const cam = r.cam, z = cam.zoom;
    const W = Math.ceil(cam.viewW), H = Math.ceil(cam.viewH);
    if (!this.canvas || this.canvas.width !== W || this.canvas.height !== H) { this.canvas = makeCanvas(W, H); this.cx = /** @type {CanvasRenderingContext2D} */ (this.canvas.getContext('2d')); }
    const c = this.cx;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, W, H);
    c.fillStyle = `rgba(${this.tone[0]},${this.tone[1]},${this.tone[2]},${this.dark})`;
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'destination-out';
    const t = performance.now() / 1000;
    const vis = (x, y, pad) => { const sx = r.sx(x), sy = r.sy(y); return sx > -pad && sy > -pad && sx < W + pad && sy < H + pad; };
    // stepped (pixel-style) pools: three concentric discs
    for (const p of this.pools) {
      const R = p.r * TILE * z * (p.flicker ? 1 + Math.sin(t * 9 + p.x) * 0.04 : 1);
      if (!vis(p.x, p.y, R)) continue;
      const sx = Math.round(r.sx(p.x)), sy = Math.round(r.sy(p.y));
      for (const [k, a] of [[1, 0.35], [0.72, 0.4], [0.45, 0.6]]) { c.fillStyle = `rgba(0,0,0,${a})`; c.beginPath(); c.arc(sx, sy, R * k, 0, Math.PI * 2); c.fill(); }
    }
    for (const f of this.game.structures?.fires || []) {
      const sx = Math.round(r.sx(f.x + 0.5)), sy = Math.round(r.sy(f.y + 0.5));
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.arc(sx, sy, 2.2 * TILE * z, 0, Math.PI * 2); c.fill();
    }
    // searchlight beams (clipped by walls via short rays)
    const beams = this.beams();
    for (const b of beams) {
      const sx = r.sx(b.x), sy = r.sy(b.y);
      c.fillStyle = 'rgba(0,0,0,0.9)';
      c.beginPath(); c.moveTo(sx, sy);
      const n = 8;
      for (let i = 0; i <= n; i++) {
        const a = b.a - b.half + (2 * b.half * i) / n;
        const len = this._ray(b, a) * TILE * z;
        c.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len);
      }
      c.closePath(); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.canvas, 0, 0);
    // warm glow on pools and a pale wash inside beams (additive feel without blend modes)
    for (const p of this.pools) {
      if (!vis(p.x, p.y, p.r * TILE * z)) continue;
      ctx.globalAlpha = 0.10 + (p.flicker ? Math.sin(t * 7 + p.y) * 0.02 : 0);
      ctx.fillStyle = p.warm; ctx.beginPath(); ctx.arc(Math.round(r.sx(p.x)), Math.round(r.sy(p.y)), p.r * TILE * z * 0.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 0.13; ctx.fillStyle = '#FFF4C8';
    for (const b of beams) {
      const sx = r.sx(b.x), sy = r.sy(b.y);
      ctx.beginPath(); ctx.moveTo(sx, sy);
      for (let i = 0; i <= 8; i++) { const a = b.a - b.half + (2 * b.half * i) / 8; const len = this._ray(b, a) * TILE * z; ctx.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len); }
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  /** beam length along angle a until a wall/structure blocks it */
  _ray(b, a) {
    const m = this.world.map;
    for (let d = 0.8; d <= b.len; d += 0.5) {
      const tx = Math.floor(b.x + Math.cos(a) * d), ty = Math.floor(b.y + Math.sin(a) * d);
      if (!m.inb(tx, ty)) return d;
      if (m.blockH[m.idx(tx, ty)] >= 2 || m.structure[m.idx(tx, ty)] >= 0 && m.structure[m.idx(tx, ty)] !== b.u.structure?.index) return d;
    }
    return b.len;
  }
}
