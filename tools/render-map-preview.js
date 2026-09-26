// @ts-check
/**
 * Writes an overview image of a map (SPEC §19.4): colour by terrain/elevation, dots for units.
 * Usage: node tools/render-map-preview.js m1 [scale] [out.png]
 */
import { writeFileSync } from 'node:fs';
import { encodePNG } from './png.js';
import { GameMap } from '../src/world/map.js';
import { O } from '../src/world/tiles.js';

const id = process.argv[2] || 'm1';
const S = +(process.argv[3] || 4);
const out = process.argv[4] || `preview-${id}.png`;
const data = (await import(`../src/missions/data/${id}.js`)).default;
const m = new GameMap(data);
const COL = {
  ground: [94, 126, 54], dirt: [122, 100, 64], sand: [194, 165, 106], road: [160, 140, 100], tallgrass: [140, 170, 70],
  shallow: [80, 150, 190], deep: [31, 78, 107], snow: [230, 238, 242], swamp: [61, 70, 48], concrete: [130, 134, 126],
  lava: [255, 122, 26], ice: [182, 214, 228], ash: [60, 50, 50], gravel: [120, 115, 110],
};
const W = m.w * S, H = m.h * S;
const px = new Uint8Array(W * H * 4);
const put = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255; };
for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
  const i = y * m.w + x;
  const t = m.terrainAt(x, y).name;
  let c = [...(COL[t] || [255, 0, 255])];
  const o = m.overlay[i];
  if (o === O.forest || o === O.pine) c = [30, 60, 30];
  else if (o === O.trees) c = [50, 90, 40];
  else if (o === O.boulder) c = [110, 105, 100];
  else if (o === O.bridge) c = [140, 100, 60];
  else if (o === O.wall) c = [170, 170, 160];
  else if (o === O.ramp) c = [230, 200, 60];
  else if (o === O.sandbags || o === O.crate || o === O.rocks) c = [180, 160, 110];
  const f = 1 + 0.18 * m.elev[i];
  c = c.map((v) => Math.min(255, v * f));
  if (m.cliff[i]) c = [70, 64, 60];
  for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) put(x * S + dx, y * S + dy, c);
}
const dot = (x, y, c, r = 1) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) put(Math.round(x * S + dx), Math.round(y * S + dy), c); };
for (const s of data.structures || []) for (let dy = 0; dy < (s.h || 2) * S; dy++) for (let dx = 0; dx < (s.w || 2) * S; dx++) put(s.x * S + dx, s.y * S + dy, [200, 60, 200]);
for (const u of data.units || []) dot(u.x + 0.5, u.y + 0.5, [230, 255, 106], Math.max(1, S >> 2));
for (const a of Object.values(data.areas || {})) {
  for (let x = a.x * S; x < (a.x + a.w) * S; x++) { put(x, a.y * S, [255, 178, 58]); put(x, (a.y + a.h) * S - 1, [255, 178, 58]); }
  for (let y = a.y * S; y < (a.y + a.h) * S; y++) { put(a.x * S, y, [255, 178, 58]); put((a.x + a.w) * S - 1, y, [255, 178, 58]); }
}
dot(data.player.x + 0.5, data.player.y + 0.5, [255, 255, 255], Math.max(1, S >> 1));
writeFileSync(out, encodePNG(W, H, px));
console.log('wrote', out, W + 'x' + H);
