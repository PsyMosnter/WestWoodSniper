// @ts-check
import { makeCanvas, BAYER4 } from './pixel.js';
import { TILE } from '../core/camera.js';

const SUB = 8; // cells per tile (each cell = 2 logical px)

/**
 * Draws shroud (#07090A) and fog (50% black) with dithered 1-tile edges (SPEC §4.4).
 * Only rebuilt when the camera's tile origin or the fog state changes.
 */
export class FogRenderer {
  constructor(map, fog) {
    this.map = map; this.fog = fog;
    this.canvas = null; this.ctx = null; this.img = null;
    this.key = '';
    this.darkBuf = null;
  }
  draw(ctx, cam) {
    const z = cam.zoom;
    const tx0 = Math.floor(cam.left / TILE) - 1, ty0 = Math.floor(cam.top / TILE) - 1;
    const cols = Math.ceil(cam.viewW / z / TILE) + 3, rows = Math.ceil(cam.viewH / z / TILE) + 3;
    const key = `${tx0},${ty0},${cols},${rows},${this.fog.version},${this.fog.revealAll}`;
    if (key !== this.key) { this.key = key; this.rebuild(tx0, ty0, cols, rows); }
    ctx.drawImage(/** @type {HTMLCanvasElement} */ (this.canvas),
      Math.round((tx0 * TILE - cam.left) * z), Math.round((ty0 * TILE - cam.top) * z), cols * TILE * z, rows * TILE * z);
  }
  rebuild(tx0, ty0, cols, rows) {
    const W = cols * SUB, H = rows * SUB;
    if (!this.canvas || this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas = makeCanvas(W, H);
      this.ctx = /** @type {CanvasRenderingContext2D} */ (this.canvas.getContext('2d'));
      this.img = this.ctx.createImageData(W, H);
    }
    const m = this.map, fog = this.fog;
    // darkness per tile with 1-tile apron
    const DW = cols + 2, DH = rows + 2;
    if (!this.darkBuf || this.darkBuf.length < DW * DH) this.darkBuf = new Float32Array(DW * DH);
    const D = this.darkBuf;
    for (let j = 0; j < DH; j++) for (let i = 0; i < DW; i++) {
      const x = tx0 + i - 1, y = ty0 + j - 1;
      let d = 1;
      if (x >= 0 && y >= 0 && x < m.w && y < m.h) {
        const s = fog.state(y * m.w + x);
        d = s === 2 ? 0 : s === 1 ? 0.5 : 1;
      } else {
        // outside the map: mirror nearest edge tile so map borders aren't black walls
        const cx = Math.max(0, Math.min(m.w - 1, x)), cy = Math.max(0, Math.min(m.h - 1, y));
        const s = fog.state(cy * m.w + cx);
        d = s === 2 ? 0.5 : s === 1 ? 0.5 : 1;
      }
      D[j * DW + i] = d;
    }
    const out = new Uint32Array(/** @type {ImageData} */ (this.img).data.buffer);
    const CLEAR = 0, FOG = (128 << 24) >>> 0, SHROUD = ((255 << 24) | (0x0a << 16) | (0x09 << 8) | 0x07) >>> 0;
    for (let cy = 0; cy < H; cy++) {
      const fy = (cy + 0.5) / SUB - 0.5 + 1; // in D coords (apron offset 1)
      const j0 = Math.floor(fy), b = fy - j0;
      for (let cx = 0; cx < W; cx++) {
        const fx = (cx + 0.5) / SUB - 0.5 + 1;
        const i0 = Math.floor(fx), a = fx - i0;
        const d00 = D[j0 * DW + i0], d10 = D[j0 * DW + i0 + 1], d01 = D[(j0 + 1) * DW + i0], d11 = D[(j0 + 1) * DW + i0 + 1];
        let v;
        if (d00 === d10 && d00 === d01 && d00 === d11) v = d00;
        else {
          // sharpen the ramp so the dithered band is ~1 tile wide centred on the edge
          v = (d00 * (1 - a) + d10 * a) * (1 - b) + (d01 * (1 - a) + d11 * a) * b;
        }
        const bay = BAYER4[(cy & 3) * 4 + (cx & 3)];
        let px;
        if (v <= 0.0001) px = CLEAR;
        else if (v <= 0.5) px = v * 2 > bay ? FOG : CLEAR;
        else px = (v - 0.5) * 2 > bay ? SHROUD : FOG;
        out[cy * W + cx] = px;
      }
    }
    /** @type {CanvasRenderingContext2D} */ (this.ctx).putImageData(/** @type {ImageData} */ (this.img), 0, 0);
  }
}
