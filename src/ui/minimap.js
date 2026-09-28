// @ts-check
import { makeCanvas } from '../render/pixel.js';
import { O, T } from '../world/tiles.js';
import { TILE } from '../core/camera.js';
import { Time } from '../core/time.js';
import { C } from '../config/palette.js';
import { panel } from './widgets.js';
import { BIOMES } from '../render/tileArt.js';

const TCOL = {
  [T.ground]: null, [T.dirt]: [122, 100, 64], [T.sand]: [194, 165, 106], [T.road]: [150, 132, 96],
  [T.tallgrass]: null, [T.shallow]: [70, 140, 180], [T.deep]: [31, 78, 107], [T.snow]: [226, 234, 240],
  [T.swamp]: [61, 70, 48], [T.concrete]: [120, 124, 116], [T.lava]: [255, 122, 26], [T.ice]: [170, 205, 222],
  [T.ash]: [52, 44, 44], [T.gravel]: [110, 105, 100],
};
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

/**
 * Sidebar-style minimap (SPEC §17.2): explored terrain, Operative (white), friendlies (blue),
 * visible enemies (NOT lime), objectives (pulsing amber), jammer coverage (violet hatch).
 */
export class Minimap {
  constructor(world) {
    this.world = world;
    const m = world.map;
    this.base = makeCanvas(m.w, m.h);
    this.fogC = makeCanvas(m.w, m.h);
    this.fogVersion = -1;
    this.x = 0; this.y = 0; this.w = 96; this.h = 72;
    this.buildBase();
  }
  buildBase() {
    const m = this.world.map;
    const B = BIOMES[m.biome] || BIOMES.temperate;
    const g = hexRgb(B.ground[1]), tall = hexRgb(B.tall[1]);
    const ctx = /** @type {CanvasRenderingContext2D} */ (this.base.getContext('2d'));
    const img = ctx.createImageData(m.w, m.h);
    const d = img.data;
    for (let i = 0; i < m.w * m.h; i++) {
      let c = TCOL[m.terrain[i]] || (m.terrain[i] === T.tallgrass ? tall : g);
      const o = m.overlay[i];
      if (o === O.forest || o === O.pine) c = m.biome === 'alpine' ? [38, 64, 50] : [34, 58, 30];
      else if (o === O.trees) c = m.biome === 'alpine' ? [60, 88, 72] : [52, 84, 40];
      else if (o === O.boulder || o === O.rocks) c = [110, 104, 98];
      else if (o === O.bridge) c = [140, 104, 64];
      else if (o === O.wall) c = [170, 172, 162];
      else if (o === O.ramp) c = [150, 130, 90];
      const f = 1 + 0.12 * m.elev[i];
      let r = c[0] * f, gg = c[1] * f, b = c[2] * f;
      if (m.cliff[i]) { r = 70; gg = 64; b = 60; }
      d[i * 4] = Math.min(255, r); d[i * 4 + 1] = Math.min(255, gg); d[i * 4 + 2] = Math.min(255, b); d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  updateFog() {
    const w = this.world, m = w.map, fog = w.fog;
    if (fog.version === this.fogVersion) return;
    this.fogVersion = fog.version;
    const ctx = /** @type {CanvasRenderingContext2D} */ (this.fogC.getContext('2d'));
    const img = ctx.createImageData(m.w, m.h);
    const u = new Uint32Array(img.data.buffer);
    const SH = ((255 << 24) | (0x0a << 16) | (0x09 << 8) | 0x07) >>> 0, FG = (110 << 24) >>> 0;
    for (let i = 0; i < m.w * m.h; i++) { const s = fog.state(i); u[i] = s === 0 ? SH : s === 1 ? FG : 0; }
    ctx.putImageData(img, 0, 0);
  }
  layout(x, y, w, h) { this.x = x; this.y = y; this.w = w; this.h = h; }
  /** map rect inside the minimap panel preserving aspect */
  get rect() {
    const m = this.world.map;
    const s = Math.min((this.w - 4) / m.w, (this.h - 4) / m.h);
    const rw = Math.floor(m.w * s), rh = Math.floor(m.h * s);
    return { x: this.x + Math.floor((this.w - rw) / 2), y: this.y + Math.floor((this.h - rh) / 2), w: rw, h: rh, s };
  }
  hit(px, py) { return px >= this.x && py >= this.y && px < this.x + this.w && py < this.y + this.h; }
  /** minimap px → tile */
  toTile(px, py) { const r = this.rect; return { x: (px - r.x) / r.s, y: (py - r.y) / r.s }; }
  draw(ctx, cam, extras = []) {
    this.updateFog();
    panel(ctx, this.x - 2, this.y - 2, this.w + 4, this.h + 4, { rivets: false, fill: '#0D0F0E', alpha: 0.95 });
    const r = this.rect;
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, r.x, r.y, r.w, r.h);
    ctx.drawImage(this.fogC, r.x, r.y, r.w, r.h);
    const t = Time.realTime;
    const dot = (x, y, col, size = 1) => { ctx.fillStyle = col; ctx.fillRect(Math.round(r.x + x * r.s - size / 2), Math.round(r.y + y * r.s - size / 2), size, size); };
    for (const e of extras) {
      if (e.kind === 'area') {
        if ((Math.floor(t * 3) & 1) && !e.solid) continue;
        ctx.strokeStyle = e.color; ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(r.x + e.x * r.s) + 0.5, Math.round(r.y + e.y * r.s) + 0.5, Math.max(2, Math.round(e.w * r.s) - 1), Math.max(2, Math.round(e.h * r.s) - 1));
      } else if (e.kind === 'hatch') {
        ctx.fillStyle = e.color;
        const R = e.r * r.s;
        const cx = r.x + e.x * r.s, cy = r.y + e.y * r.s;
        for (let yy = -R; yy <= R; yy += 1) for (let xx = -R; xx <= R; xx += 1) {
          if (xx * xx + yy * yy > R * R) continue;
          if (((Math.round(cx + xx) + Math.round(cy + yy)) & 3) === 0) ctx.fillRect(Math.round(cx + xx), Math.round(cy + yy), 1, 1);
        }
      } else if (e.kind === 'target') {
        // an objective: a pulsing ring round a dot
        const cx = Math.round(r.x + e.x * r.s), cy = Math.round(r.y + e.y * r.s), R = 3 + (Math.floor(t * 3) & 1);
        ctx.fillStyle = '#0D0F0E'; ctx.fillRect(cx - 1, cy - 1, 3, 3);
        ctx.fillStyle = e.color; ctx.fillRect(cx, cy, 1, 1);
        ctx.strokeStyle = e.color; ctx.lineWidth = 1; ctx.strokeRect(cx - R + 0.5, cy - R + 0.5, R * 2, R * 2);
      } else dot(e.x, e.y, e.color, e.size || 2);
    }
    const op = this.world.operative;
    dot(op.x, op.y, '#0D0F0E', 4); dot(op.x, op.y, (Math.floor(t * 3) & 1) ? '#FFFFFF' : '#9FD8FF', 2);
    // camera view rect
    const vx = cam.left / TILE, vy = cam.top / TILE, vw = cam.viewW / cam.zoom / TILE, vh = cam.viewH / cam.zoom / TILE;
    ctx.strokeStyle = 'rgba(124,255,122,0.8)';
    ctx.strokeRect(Math.round(r.x + vx * r.s) + 0.5, Math.round(r.y + vy * r.s) + 0.5, Math.round(vw * r.s), Math.round(vh * r.s));
    ctx.restore();
  }
}
