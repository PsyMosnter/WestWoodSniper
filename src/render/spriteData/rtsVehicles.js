// @ts-check
/**
 * Art style "Newest" — vehicles (playtest 2 art pass, approved in tools/art-lab "option B"): the New ray-cast
 * vehicle sprites run through an "RTS" filter — brightness posterised to four tones per material, grey metal
 * lifted to a light gunmetal, colours saturated, and a self-coloured dark edge around the silhouette. Same
 * canvas and anchor as the New sprite, so its per-pixel hit zones (the scope's zoneMap) still line up, and all
 * eight facings, wrecks and empty seats come for free.
 */
import { Art } from '../artStyle.js';
import { Pix, unpack, packRgba } from '../pixel.js';
import { VEHICLE_TYPES } from './newVehicles.js';

const LEVELS = [0.22, 0.42, 0.66, 0.9];

/** Filter a New vehicle Pix into a new Pix (same size). */
export function rtsFilterPix(src, { lift = 1.35, sat = 1.35 } = {}) {
  const w = src.w, h = src.h, out = new Pix(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = src.data[i];
    const [R, G, B, A] = unpack(v);
    if (A < 128) continue;
    const r = R / 255, g = G / 255, b = B / 255;
    const Y = 0.3 * r + 0.59 * g + 0.11 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const y2 = Math.min(1, Y * (chroma < 0.12 ? lift : 1.1));
    const q = LEVELS.reduce((best, l) => (Math.abs(l - y2) < Math.abs(best - y2) ? l : best), LEVELS[0]);
    const k = Y > 0.001 ? q / Y : 0;
    const c = (x) => Math.max(0, Math.min(255, Math.round((Y + (x - Y) * sat) * k * 255)));
    out.data[i] = packRgba(c(r), c(g), c(b), 255);
  }
  // self-coloured dark edge: empty pixels touching the silhouette take a very dark shade of their neighbour
  const edged = Pix.from(out);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (out.data[i] >>> 24) continue;
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const n = out.data[yy * w + xx];
      if (!(n >>> 24)) continue;
      const [nr, ng, nb] = unpack(n);
      edged.data[i] = packRgba(Math.round(nr * 0.32 * 0.65 + 11 * 0.35), Math.round(ng * 0.32 * 0.65 + 12 * 0.35), Math.round(nb * 0.32 * 0.65 + 10 * 0.35), 255);
      break;
    }
  }
  return edged;
}

for (const type of VEHICLE_TYPES) {
  Art.registerNewest('vehicle', type, (dir, state) => {
    const base = Art.newPainter('vehicle', type)?.(dir, state);
    if (!base?.pix) return base;
    const P = rtsFilterPix(base.pix);
    return { get canvas() { return this._c || (this._c = P.toCanvas()); }, _c: null, ax: base.ax, ay: base.ay, w: base.w, h: base.h, zoneMap: base.zoneMap, top: base.top, pix: P };
  });
}
