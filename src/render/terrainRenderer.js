// @ts-check
import { Art } from './artStyle.js';
import { TERRAIN, OVERLAY, T, O } from '../world/tiles.js';
import { LEVEL_BRIGHT, buildTextures, BIOMES, TEX, EDGE_NOISE, EDGE_NOISE2 } from './tileArt.js';
import { pack, shade, mix, unpack, packRgba, makeCanvas, Pix } from './pixel.js';
import { hash2, valueNoise } from '../core/rng.js';
import { floraSprite } from './spriteData/flora.js';
import { TILE } from '../core/camera.js';

const CH = 16;              // chunk size in tiles
const CPX = CH * TILE;      // chunk size in px
const M = 3;                // apron for shoreline pass

const N8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

/**
 * Bakes the static ground layer (terrain, transitions, cliffs, ramps, shores, low props,
 * decorations, decals) into 256×256 chunk canvases (SPEC §4.2–4.3).
 */
export class TerrainRenderer {
  /** @param {import('../world/map.js').GameMap} map */
  constructor(map) {
    this.map = map;
    this.biome = BIOMES[map.biome] ? map.biome : 'temperate';
    this.chibi = Art.style === 'chibi';
    this.B = BIOMES[this.biome];
    this.tuft = this.B.tall ? [pack(this.B.tall[1]), pack(this.B.tall[2] || this.B.tall[1])] : null;
    this.tex = buildTextures(this.biome);
    this.cw = Math.ceil(map.w / CH); this.ch = Math.ceil(map.h / CH);
    /** @type {(HTMLCanvasElement|null)[]} */
    this.chunks = new Array(this.cw * this.ch).fill(null);
    this.dirty = new Uint8Array(this.cw * this.ch);
    this.decals = [];      // {x,y (world px), draw(ctx) }
    this.rock = this.B.rock.map((c) => pack(c));
    this.waterTiles = [];  // per chunk list of tile idx for sparkle animation
    this.treeList = null;
  }
  chunkIndexForTile(x, y) { return Math.floor(y / CH) * this.cw + Math.floor(x / CH); }
  invalidateTile(x, y) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (!this.map.inb(xx, yy)) continue;
      const ci = this.chunkIndexForTile(xx, yy);
      this.dirty[ci] = 1;
    }
  }
  /** Build every chunk now (loading screen). Yields via callback for progress. */
  *buildAll() {
    for (let i = 0; i < this.chunks.length; i++) {
      this.chunks[i] = this.buildChunk(i % this.cw, Math.floor(i / this.cw));
      yield (i + 1) / this.chunks.length;
    }
  }
  getChunk(cx, cy) {
    const i = cy * this.cw + cx;
    if (!this.chunks[i] || this.dirty[i]) { this.chunks[i] = this.buildChunk(cx, cy); this.dirty[i] = 0; }
    return this.chunks[i];
  }
  /** Draw visible chunks. */
  draw(ctx, cam) {
    const z = cam.zoom;
    const L = cam.left, Tp = cam.top;
    const x0 = Math.max(0, Math.floor(L / CPX)), y0 = Math.max(0, Math.floor(Tp / CPX));
    const x1 = Math.min(this.cw - 1, Math.floor((L + cam.viewW / z) / CPX));
    const y1 = Math.min(this.ch - 1, Math.floor((Tp + cam.viewH / z) / CPX));
    let rebuilt = 0;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const i = cy * this.cw + cx;
      if ((!this.chunks[i] || this.dirty[i]) && rebuilt < 2) { this.chunks[i] = this.buildChunk(cx, cy); this.dirty[i] = 0; rebuilt++; }
      const c = this.chunks[i];
      if (!c) continue;
      ctx.drawImage(c, Math.round((cx * CPX - L) * z), Math.round((cy * CPX - Tp) * z), CPX * z, CPX * z);
    }
  }
  /** Paint a decal into the ground (persists across chunk rebuilds). */
  addDecal(d) {
    this.decals.push(d);
    const tx0 = Math.floor((d.x - d.r) / TILE), tx1 = Math.floor((d.x + d.r) / TILE);
    const ty0 = Math.floor((d.y - d.r) / TILE), ty1 = Math.floor((d.y + d.r) / TILE);
    const done = new Set();
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (!this.map.inb(tx, ty)) continue;
      const ci = this.chunkIndexForTile(tx, ty);
      if (done.has(ci)) continue; done.add(ci);
      const c = this.chunks[ci];
      if (!c || this.dirty[ci]) continue;
      const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
      const ox = (ci % this.cw) * CPX, oy = Math.floor(ci / this.cw) * CPX;
      ctx.save(); ctx.translate(-ox, -oy); d.draw(ctx); ctx.restore();
    }
  }

  /** Tiles that carry sortable flora sprites (trees). Built once. */
  getTrees() {
    if (this.treeList) return this.treeList;
    const m = this.map, list = [];
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const o = m.overlay[y * m.w + x];
      if (o === O.trees || o === O.forest || o === O.pine) {
        const h = hash2(x, y, 5);
        const kind = o === O.trees ? 'trees' : 'forest';
        const spr = floraSprite(this.biome, o === O.pine ? 'forest' : kind, h);
        const jx = Math.round((hash2(x, y, 6) - 0.5) * (o === O.trees ? 6 : 4));
        const jy = Math.round((hash2(x, y, 7) - 0.5) * 3);
        list.push({ tx: x, ty: y, spr, px: x * TILE + 8 + jx, py: y * TILE + 13 + jy, i: y * m.w + x });
      }
    }
    this.treeList = list;
    // bucket by row for fast y-sorted drawing
    this.treeRows = Array.from({ length: m.h }, () => []);
    for (const t of list) this.treeRows[t.ty].push(t);
    return list;
  }

  buildChunk(cx, cy) {
    const m = this.map, tex = this.tex, B = this.B;
    const W = m.w, H = m.h;
    const PW = CPX + 2 * M;
    const pxT = new Uint8Array(PW * PW);      // terrain id per pixel (with apron)
    const buf = new Uint32Array(CPX * CPX);
    const ox = cx * CPX, oy = cy * CPX;
    const tile = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : y * W + x;
    const prio = TERRAIN.map((t) => t.prio);

    // --- relief: a smooth per-pixel height field (rounded corners, ramps as gradients), with a margin
    const MG = RELIEF_MG, LW = CPX + 2 * MG;
    const lvB = new Float32Array(LW * LW);
    for (let y = 0; y < LW; y++) for (let x = 0; x < LW; x++) lvB[y * LW + x] = this._levelAt(ox + x - MG, oy + y - MG);
    const lvAt = (px, py) => lvB[(py + MG) * LW + (px + MG)];

    // --- pass 1: per-pixel terrain with organic transitions
    for (let py = -M; py < CPX + M; py++) {
      const wy = oy + py;
      const ty = Math.floor(wy / TILE);
      for (let px = -M; px < CPX + M; px++) {
        const wx = ox + px;
        const tx = Math.floor(wx / TILE);
        const ti = tile(tx, ty);
        let t = 0;
        if (ti >= 0) {
          t = m.terrain[ti];
          let e = m.elev[ti];
          // where the rounded height edge has moved this pixel onto a neighbouring level, it wears that tile's ground
          const er = Math.round(lvAt(px, py));
          if (er !== e && m.rampDir[ti] < 0) {
            let bd = 1e9;
            for (let k = 0; k < 8; k++) {
              const nj = tile(tx + N8[k][0], ty + N8[k][1]);
              if (nj < 0 || m.elev[nj] !== er) continue;
              const d = Math.hypot(tx * TILE + 8 + N8[k][0] * TILE - wx, ty * TILE + 8 + N8[k][1] * TILE - wy);
              if (d < bd) { bd = d; t = m.terrain[nj]; }
            }
            if (bd < 1e9) e = er;
          }
          const lx = wx - tx * TILE, ly = wy - ty * TILE;
          // every terrain type gets soft, rounded shapes: the pixel takes whichever type dominates among the four
          // tiles around it (bilinear weights, a little wobble), counting only tiles on its own level
          const jx = (EDGE_NOISE[(wy & 63) * TEX + (wx & 63)] - 0.5) * 5, jy = (EDGE_NOISE2[(wx & 63) * TEX + (wy & 63)] - 0.5) * 5;
          const gx = (wx + jx) / TILE - 0.5, gy = (wy + jy) / TILE - 0.5, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
          let bt = -1, bw = -1, t1 = -1, w1 = 0, t2 = -1, w2 = 0, t3 = -1, w3 = 0, t4 = -1, w4 = 0;
          for (let q = 0; q < 4; q++) {
            const nx = x0 + (q & 1), ny = y0 + (q >> 1), nj = tile(nx, ny);
            const wq = ((q & 1) ? fx : 1 - fx) * ((q >> 1) ? fy : 1 - fy);
            const tq = nj >= 0 && m.elev[nj] === e ? m.terrain[nj] : t;
            if (tq === t1 || t1 < 0) { t1 = tq; w1 += wq; } else if (tq === t2 || t2 < 0) { t2 = tq; w2 += wq; } else if (tq === t3 || t3 < 0) { t3 = tq; w3 += wq; } else { t4 = tq; w4 += wq; }
          }
          for (const [tq, wq] of [[t1, w1], [t2, w2], [t3, w3], [t4, w4]]) if (tq >= 0 && wq + prio[tq] * 0.001 > bw) { bw = wq + prio[tq] * 0.001; bt = tq; }
          if (bt >= 0) t = bt;
          void lx; void ly;
        }
        pxT[(py + M) * PW + (px + M)] = t;
        if (px >= 0 && py >= 0 && px < CPX && py < CPX) {
          // the ground's tone follows the smooth height field: higher is lighter; ramps dither from one to the next
          const lvl = Math.max(0, Math.min(3, lvAt(px, py))), l0 = Math.floor(lvl), fr = lvl - l0;
          const e = Math.min(3, l0);
          const band = fr > 0.02 && fr < 0.98 ? Math.min(3, Math.floor(fr * 4) + 1) : 0;   // a ramp: 4 tone bands, low → high
          // anti-tiling: large noise regions sample the (tileable) texture at different offsets,
          // with dithered borders, so the 64-px period never lines up into a visible grid
          const rn = valueNoise(wx / 52, wy / 52, 91) + (EDGE_NOISE2[(wy & 63) * TEX + (wx & 63)] - 0.5) * 0.18;
          const sx = rn > 0.62 ? wx + 29 : rn < 0.36 ? wx + 47 : wx, sy = rn > 0.62 ? wy + 43 : rn < 0.36 ? wy + 17 : wy;
          let c0 = tex[t][e][(sy & 63) * TEX + (sx & 63)];
          if (band) c0 = shade(c0, 0.8 + band * 0.13);                                     // dark at the foot → lit at the crest
          buf[py * CPX + px] = c0;
        }
      }
    }

    // --- macro brightness variation (breaks up texture repetition)
    for (let by = 0; by < CPX; by += 4) for (let bx = 0; bx < CPX; bx += 4) {
      const n = valueNoise((ox + bx) / 88, (oy + by) / 88, 77) * 0.7 + valueNoise((ox + bx) / 31, (oy + by) / 31, 78) * 0.3;
      const f = 0.93 + n * 0.14;
      if (Math.abs(f - 1) < 0.012) continue;
      for (let y = by; y < by + 4; y++) for (let x = bx; x < bx + 4; x++) {
        const t = pxT[(y + M) * PW + (x + M)];
        if (t === T.deep || t === T.lava) continue;
        buf[y * CPX + x] = shade(buf[y * CPX + x], f);
      }
    }

    // --- pass 2: shorelines (foam on water next to land, wet darkening on land next to water)
    const isWater = (t) => t === T.shallow || t === T.deep;
    const foam = pack('#9FCDE0'), foam2 = pack('#6FAECB');
    const sandShore = pack(this.biome === 'swamp' ? '#3A4430' : '#8A7A58');
    for (let py = 0; py < CPX; py++) for (let px = 0; px < CPX; px++) {
      const t = pxT[(py + M) * PW + (px + M)];
      const at = (dx, dy) => pxT[(py + M + dy) * PW + (px + M + dx)];
      if (t === T.lava) {
        // cooled crust at lava edges
        let edge = false;
        for (let k = 0; k < 8 && !edge; k++) if (at(N8[k][0], N8[k][1]) !== T.lava) edge = true;
        if (edge) buf[py * CPX + px] = pack('#3A1A10');
        continue;
      }
      if (isWater(t)) {
        let dmin = 9;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          if (!isWater(at(dx, dy)) && at(dx, dy) !== T.ice) { const d = Math.max(Math.abs(dx), Math.abs(dy)); if (d < dmin) dmin = d; }
        }
        const wx = ox + px, wy = oy + py;
        // a desert "shallow" is a dry, damp riverbed: darker sandy banks instead of white foam
        if (t === T.shallow && this.biome === 'desert') { if (dmin <= 2) buf[py * CPX + px] = mix(buf[py * CPX + px], pack('#6E5A3C'), dmin === 1 ? 0.55 : 0.25); continue; }
        if (dmin === 1) buf[py * CPX + px] = ((wx + wy) & 3) ? foam : foam2;
        else if (dmin === 2) buf[py * CPX + px] = mix(buf[py * CPX + px], foam2, 0.45);
        else if (dmin === 3 && t === T.deep) buf[py * CPX + px] = mix(buf[py * CPX + px], pack('#2B6A8C'), 0.5);
      } else {
        let near = false;
        for (let k = 0; k < 8; k++) if (isWater(at(N8[k][0], N8[k][1]))) { near = true; break; }
        if (near) buf[py * CPX + px] = mix(buf[py * CPX + px], sandShore, 0.55);
      }
    }

    const P = new ChunkPainter(buf, CPX, ox, oy);

    // --- pass 3: per-tile features: forest floor, cliffs, ramps, lips, shadows
    const tx0 = cx * CH, ty0 = cy * CH;
    for (let ty = ty0 - 1; ty < ty0 + CH + 1; ty++) for (let tx = tx0 - 1; tx < tx0 + CH + 1; tx++) {
      const ti = tile(tx, ty);
      if (ti < 0) continue;
      const inChunk = tx >= tx0 && ty >= ty0 && tx < tx0 + CH && ty < ty0 + CH;
      const e = m.elev[ti];
      const o = m.overlay[ti];
      const X = tx * TILE, Y = ty * TILE;
      if (!inChunk) continue;
      if (o === O.forest || o === O.pine) {
        const floor = B.forestFloor.map((c) => pack(c));
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const n = EDGE_NOISE2[((Y + y) & 63) * TEX + ((X + x) & 63)];
          if (n < 0.62) P.mulPx(X + x, Y + y, 0.72);
          if (hash2(X + x, Y + y, 3) < 0.05) P.px(X + x, Y + y, floor[(hash2(X + x, Y + y, 4) * 3) | 0]);
        }
      }
    }

    // --- relief: rock faces, side walls, lips and feet, all read off the height field
    this._relief(buf, lvAt, ox, oy);

    // --- pass 4: decorations and low overlays
    for (let ty = ty0; ty < Math.min(H, ty0 + CH); ty++) for (let tx = tx0; tx < Math.min(W, tx0 + CH); tx++) {
      const ti = ty * W + tx;
      const o = m.overlay[ti], t = m.terrain[ti];
      const X = tx * TILE, Y = ty * TILE;
      const nUp = ty > 0 ? ti - W : -1, wUp = tx > 0 ? ti - 1 : -1;
      const underRock = false; void nUp; void wUp;
      if (o === O.none && !m.cliff[ti] && !underRock) this._decorate(P, tx, ty, t);
      if (o === O.trees || o === O.forest || o === O.pine) {
        // tree shadow (baked)
        const jx = Math.round((hash2(tx, ty, 6) - 0.5) * (o === O.trees ? 6 : 4));
        P.shadowEllipse(X + 10 + jx, Y + 13, o === O.trees ? 6 : 8, 3, 0.62);
      }
      switch (o) {
        case O.boulder: this._boulder(P, X, Y, tx, ty); if (m.breach?.[ti]) this._cracks(P, X, Y, tx, ty); break;
        case O.sandbags: this._sandbags(P, X, Y, tx, ty); break;
        case O.crate: this._crate(P, X, Y, tx, ty); break;
        case O.rocks: this._rocks(P, X, Y, tx, ty); break;
        case O.rubble: this._rubble(P, X, Y, tx, ty); break;
        case O.wreck: this._wreck(P, X, Y, tx, ty); break;
        case O.fence: this._fence(P, X, Y, tx, ty); break;
        case O.wall: this._wall(P, X, Y, tx, ty); break;
        case O.bridge: this._bridge(P, X, Y, tx, ty); break;
        case O.bush: this._sprite(P, floraSprite(this.biome, 'bush', hash2(tx, ty, 8)), X + 8, Y + 14); break;
        case O.crystal: this._crystal(P, X, Y, tx, ty); break;
        default: break;
      }
    }

    const c = makeCanvas(CPX, CPX);
    const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    const img = ctx.createImageData(CPX, CPX);
    new Uint32Array(img.data.buffer).set(buf);
    ctx.putImageData(img, 0, 0);
    // decals
    if (this.decals.length) {
      ctx.save(); ctx.translate(-ox, -oy);
      for (const d of this.decals) {
        if (d.x + d.r < ox || d.y + d.r < oy || d.x - d.r > ox + CPX || d.y - d.r > oy + CPX) continue;
        d.draw(ctx);
      }
      ctx.restore();
    }
    return c;
  }

  /**
   * The ground's height at a world pixel, smoothed: tile corners are rounded (outer corners cut back, inner corners
   * filled in, radius ~8 px) and every edge wobbles a little, so nothing reads as a ruler line; a ramp is a fraction
   * between its levels, rising towards the level it leads to.
   */
  _levelAt(wx, wy) {
    const m = this.map, W = m.w;
    const x = wx + (EDGE_NOISE[(wy & 63) * TEX + (wx & 63)] - 0.5) * 3, y = wy + (EDGE_NOISE2[(wx & 63) * TEX + (wy & 63)] - 0.5) * 3;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!m.inb(tx, ty)) return 0;
    const i = ty * W + tx, base = m.elev[i], fx = x - tx * TILE, fy = y - ty * TILE;
    // a ramp rises over two tiles: its foot tile takes the first part of the climb, the ramp the rest
    const alongOf = (d) => (d === 0 ? 1 - fy / TILE : d === 2 ? fy / TILE : d === 1 ? fx / TILE : 1 - fx / TILE);
    if (m.rampDir[i] >= 0) return base + RAMP_FOOT + (1 - RAMP_FOOT) * Math.max(0, Math.min(1, alongOf(m.rampDir[i])));
    for (let d = 0; d < 4; d++) {
      const nx = tx + [0, 1, 0, -1][d], ny = ty + [-1, 0, 1, 0][d];
      if (!m.inb(nx, ny)) continue;
      const j = ny * W + nx;
      if (m.rampDir[j] === d && m.elev[j] === base) return base + RAMP_FOOT * Math.max(0, Math.min(1, alongOf(d)));
    }
    const lv = (x2, y2) => { if (!m.inb(x2, y2)) return base; const j = y2 * W + x2; return m.rampDir[j] >= 0 ? NaN : m.elev[j]; };
    const qx = fx < 8 ? -1 : 1, qy = fy < 8 ? -1 : 1;
    const h = lv(tx + qx, ty), v = lv(tx, ty + qy);
    if (Number.isNaN(h) || Number.isNaN(v)) return base;
    const dx = qx < 0 ? fx : TILE - fx, dy = qy < 0 ? fy : TILE - fy, Rr = 8;
    if (dx < Rr && dy < Rr && (Rr - dx) ** 2 + (Rr - dy) ** 2 > Rr * Rr) {
      if (h < base && v < base) return Math.max(h, v);                                   // an outer corner, rounded off
      const dg = lv(tx + qx, ty + qy);
      if (h > base && v > base && !(dg < Math.min(h, v))) return Math.min(h, v);        // an inner corner, filled in
    }
    return base;
  }

  /**
   * Rock and ramps from the height field. Where the ground drops away to the south, a rock face rises from the
   * (rounded) edge into the higher ground — about a tile tall per level — made of lit boulders, a bright lip on
   * top, and a foot that melts into the ground below (no band at the tile's bottom). Drops to the east and west
   * show narrower side walls; along a ramp the drop shrinks, so its walls taper to nothing. North edges get a
   * dark line and a lit rim. Ramps carry faint contour lines.
   */
  _relief(buf, lvAt, ox, oy) {
    const R = this.rock, snowy = this.biome === 'alpine', FACE = RELIEF_FACE, EPS = 0.12;
    const tuft = this.tuft;
    for (let py = 0; py < CPX; py++) for (let px = 0; px < CPX; px++) {
      const i = py * CPX + px, L = lvAt(px, py), wx = ox + px, wy = oy + py;
      // south face: look down for the edge
      let face = -1, depth = 0, foot = 0;
      // only an abrupt drop is an edge; a ramp's gentle slope is not
      for (let k = 1, prev = L; k <= RELIEF_MG - 2; k++) {
        const q = lvAt(px, py + k);
        if (q > prev + EDGE_STEP) break;                                                    // higher ground below: not an edge of ours
        if (q < prev - EDGE_STEP) {
          const Hf = (L - q) * FACE + (EDGE_NOISE[((wy >> 1) & 63) * TEX + (wx & 63)] - 0.5) * 5;
          if (k <= Hf) { face = 0; depth = 1 - k / Hf; foot = k; }
          break;
        }
        prev = q;
      }
      // side walls: a drop to the east (shaded) or west (sunlit), narrower than south faces
      if (face < 0 && Math.abs(L - Math.round(L)) < 0.03) {   // (a ramp's own surface grows no walls)
        let pe = L, pw = L, se = false, sw = false;
        for (let j = 1; j <= SIDE_E + 3 && !(se && sw); j++) {
          const qe = lvAt(px + j, py), qw = lvAt(px - j, py);
          if (!se && qe > pe + EDGE_STEP) se = true;
          if (!sw && qw > pw + EDGE_STEP) sw = true;
          const wob = (EDGE_NOISE2[((wy >> 1) & 63) * TEX + ((wx >> 2) & 63)] - 0.5) * 4;
          if (!se && qe < pe - EDGE_STEP) { const wd = (L - qe) * SIDE_E + wob; if (L - qe > 0.35 && j <= wd) { face = 1; depth = j / wd; break; } se = true; }
          if (!sw && qw < pw - EDGE_STEP) { const wd = (L - qw) * SIDE_W + wob; if (L - qw > 0.35 && j <= wd) { face = 2; depth = j / wd; break; } sw = true; }
          pe = qe; pw = qw;
        }
      }
      if (face >= 0) {
        const wpx = (EDGE_NOISE[(wy & 63) * TEX + ((wx * 3) & 63)] - 0.5) * 7, wpy = (EDGE_NOISE2[((wy * 3) & 63) * TEX + (wx & 63)] - 0.5) * 5;
        const big = valueNoise(wx / 40, wy / 30, 55) > 0.5;
        let ri = rockCell(Math.round(wx + wpx), Math.round(wy + wpy), big ? 13 : 7, big ? 10 : 6);
        if (face === 0) {
          // lit crown, mid-tone body, shaded base; now and then a deep vertical crack
          if (depth < 0.1) ri = 4;
          else {
            if (depth < 0.35 && ri > 0) ri = Math.min(4, ri + 1);
            if (depth > 0.6 && ri > 0) ri--;
            if (depth > 0.85 && ri > 0) ri--;
            if (depth > 0.25 && hash2(wx >> 1, Math.floor(wy / 12), 41) < 0.07) ri = 0;
          }
        } else if (face === 1) ri = Math.max(0, ri - 1 - (depth > 0.6 ? 1 : 0));
        else if (depth > 0.7 && ri > 0) ri--;
        let c = R[Math.max(0, Math.min(4, ri))];
        if (snowy && face === 0 && depth < 0.22) c = depth < 0.1 ? pack('#FFFFFF') : pack('#DCE8EE');
        // the foot melts into the ground below it
        if (face === 0 && foot <= 3) { const g = shade(buf[Math.min(CPX - 1, py + foot) * CPX + px], 0.62); c = mix(c, g, (4 - foot) * 0.22); }
        buf[i] = c;
        continue;
      }
      // ground: a dark line where a higher edge begins just below (north edges), a lit rim on top of it
      const below = lvAt(px, py + 1), above = lvAt(px, py - 1);
      if (below > L + EPS && below - L > 0.5) { buf[i] = shade(buf[i], 0.62); continue; }
      if (above < L - EPS && L - above > 0.5) { buf[i] = shade(buf[i], 1.22); continue; }
      // at the foot of a face: scree, tufts and a soft contact shadow (no hard band)
      let up = 0;
      for (let k = 1; k <= 4; k++) if (lvAt(px, py - k) > L + 0.5) { up = k; break; }
      if (up) {
        let c = shade(buf[i], 0.78 + up * 0.05);
        if (hash2(wx, wy, 15) < 0.18) c = R[2];
        if (!snowy && tuft && up <= 2 && hash2(wx, wy >> 2, 33) < 0.2) c = tuft[up & 1];
        buf[i] = c;
        continue;
      }
      // ramps: at each band edge a lit step with a shadow under it, so the slope's direction reads
      const frac = L - Math.floor(L), fb = lvAt(px, py + 1) - Math.floor(lvAt(px, py + 1));
      if (frac > 0.02 && frac < 0.98 && Math.floor(frac * 4) !== Math.floor(fb * 4) && Math.abs(frac - fb) < 0.3) { buf[i] = shade(buf[i], frac > fb ? 1.3 : 0.7); if (py + 1 < CPX) buf[i + CPX] = shade(buf[i + CPX], frac > fb ? 0.75 : 1.2); }
    }
  }

  _decorate(P, tx, ty, t) {
    const h = hash2(tx, ty, 21);
    const X = tx * TILE, Y = ty * TILE;
    const B = this.B;
    const x = X + 2 + Math.floor(hash2(tx, ty, 22) * 11), y = Y + 3 + Math.floor(hash2(tx, ty, 23) * 10);
    if (t === T.ground) {
      if (h < 0.07) { // flowers
        const col = B.flowers[Math.floor(hash2(tx, ty, 24) * B.flowers.length)];
        P.px(x, y, pack(col)); P.px(x + 2, y + 1, pack(col)); P.px(x + 1, y + 2, pack(col));
        P.px(x, y + 1, pack(B.groundDark)); P.px(x + 2, y + 2, pack(B.groundDark));
      } else if (h < 0.13) { // pebble
        P.px(x, y, this.rock[3]); P.px(x + 1, y, this.rock[2]); P.px(x, y + 1, this.rock[1]); P.px(x + 1, y + 1, this.rock[0]);
      } else if (h < 0.19) { // tuft
        const l = pack(B.groundLight), dk = pack(B.groundDark);
        P.px(x, y, l); P.px(x + 1, y - 1, l); P.px(x + 2, y, l); P.px(x - 1, y - 1, l); P.px(x + 1, y + 1, dk); P.px(x, y + 1, dk);
      } else if (h < 0.205 && (this.biome === 'arid' || this.biome === 'desert' || this.biome === 'volcanic')) { // bones
        const b = pack('#E8E0C8'), bd = pack('#A89E84');
        P.px(x, y, b); P.px(x + 1, y, b); P.px(x + 2, y, b); P.px(x + 3, y, b); P.px(x - 1, y - 1, b); P.px(x - 1, y + 1, b); P.px(x + 4, y - 1, b); P.px(x + 4, y + 1, b); P.px(x + 1, y + 1, bd); P.px(x + 2, y + 1, bd);
      } else if (h < 0.2065 && this.biome === 'temperate') { // fallen log
        const w0 = pack('#4A3520'), w1 = pack('#6B4D2E'), w2 = pack('#8C6A42');
        for (let i = 0; i < 7; i++) { P.px(x + i - 2, y, w1); P.px(x + i - 2, y + 1, w0); P.px(x + i - 2, y - 1, w2); }
        P.px(x + 5, y, pack('#A88A5A'));
      }
    } else if (t === T.road && h < 0.1) {
      // tyre tracks
      const dk = shade(P.get(x, y), 0.85);
      for (let i = 0; i < 5; i++) P.px(x + i, y + ((i >> 1) & 1), dk);
    } else if (t === T.snow && h < 0.08) {
      P.px(x, y, this.rock[2]); P.px(x + 1, y, this.rock[1]); P.px(x, y - 1, pack('#FFFFFF'));
    } else if (t === T.shallow && this.biome === 'swamp' && h < 0.25) { // lily pads & reeds
      const g1 = pack('#4E7A34'), g2 = pack('#6E9A48');
      P.px(x, y, g1); P.px(x + 1, y, g2); P.px(x, y + 1, g2); P.px(x + 1, y + 1, g1);
      P.px(x + 5, y + 2, pack('#7C8850')); P.px(x + 5, y + 1, pack('#7C8850')); P.px(x + 5, y, pack('#9CA860'));
    } else if (t === T.ash && h < 0.06) {
      P.px(x, y, pack('#FF7A1A')); P.px(x + 1, y, pack('#6A2A10'));
    }
  }

  _sprite(P, spr, ax, ay) {
    const pix = spr.pix;
    for (let y = 0; y < pix.h; y++) for (let x = 0; x < pix.w; x++) {
      const v = pix.data[y * pix.w + x];
      if (v >>> 24) P.px(ax - spr.ax + x, ay - spr.ay + y, v);
    }
  }

  /** cracked rock (a C4 breach point): dark zig-zag fissures and pale chips at the foot */
  _cracks(P, X, Y, tx, ty) {
    const R = this.rock;
    for (const [sx, len, dir] of [[5, 9, 1], [10, 7, -1]]) {
      let x = X + sx, y = Y + 4;
      for (let i = 0; i < len; i++) { P.px(x, y, R[0]); if (i % 2) x += dir * (hash2(tx + i, ty, 33) > 0.4 ? 1 : 0); else y++; P.px(x + 1, y, R[1]); }
    }
    for (const [dx, dy] of [[3, 14], [7, 15], [12, 14], [14, 15]]) P.px(X + dx, Y + dy, R[4]);
  }
  _boulder(P, X, Y, tx, ty) {
    const R = this.rock;
    const r = hash2(tx, ty, 31);
    const cx = X + 8 + (r - 0.5) * 2, cy = Y + 9;
    const rx = 7 + r * 1.2, ry = 5.5 + r;
    P.shadowEllipse(cx + 2, cy + 4, rx, 3, 0.55);
    for (let y = -Math.ceil(ry) - 1; y <= Math.ceil(ry); y++) for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
      const dx = x / rx, dy = y / ry;
      const dd = dx * dx + dy * dy + (hash2(X + x, Y + y, 32) - 0.5) * 0.25;
      if (dd > 1) continue;
      const l = -(dx * 0.6 + dy * 0.8) + (1 - dd) * 0.3;
      let c = l > 0.55 ? R[4] : l > 0.1 ? R[3] : l > -0.4 ? R[2] : R[1];
      if (dd > 0.82) c = R[0];
      P.px(cx + x, cy + y, c);
    }
    // crack
    P.px(cx - 1, cy, R[1]); P.px(cx, cy + 1, R[1]); P.px(cx + 1, cy + 1, R[1]);
  }

  _sandbags(P, X, Y, tx, ty) {
    const m = this.map;
    const nb = (dx, dy) => m.inb(tx + dx, ty + dy) && m.overlay[(ty + dy) * m.w + tx + dx] === O.sandbags;
    const vertical = (nb(0, -1) || nb(0, 1)) && !(nb(-1, 0) || nb(1, 0));
    const c0 = pack('#6E6040'), c1 = pack('#9A8A5E'), c2 = pack('#B8A878'), c3 = pack('#CFC094'), k = pack('#3A3322');
    const bag = (bx, by, w) => {
      for (let x = 0; x < w; x++) for (let y = 0; y < 4; y++) {
        let c = y === 0 ? c3 : y === 1 ? c2 : y === 2 ? c1 : c0;
        if (x === 0 || x === w - 1) c = y === 3 ? k : c0;
        P.px(bx + x, by + y, c);
      }
      P.px(bx, by + 3, k); P.px(bx + w - 1, by + 3, k);
    };
    P.shadowEllipse(X + 9, Y + 14, 8, 2, 0.6);
    if (vertical) {
      for (let r = 0; r < 4; r++) bag(X + 4 + (r & 1), Y + r * 4, 7);
    } else {
      bag(X, Y + 9, 6); bag(X + 5, Y + 9, 6); bag(X + 10, Y + 9, 6);
      bag(X + 2, Y + 6, 6); bag(X + 8, Y + 6, 6);
      if (this.chibi) { bag(X, Y + 3, 6); bag(X + 5, Y + 3, 6); bag(X + 10, Y + 3, 6); bag(X + 3, Y, 6); bag(X + 8, Y, 6); }   // stacked high for chibi-sized soldiers
    }
  }

  _crate(P, X, Y, tx, ty) {
    const w0 = pack('#4A3520'), w1 = pack('#7A5A36'), w2 = pack('#9A7A4E'), w3 = pack('#B89A68'), k = pack('#241A10');
    P.shadowEllipse(X + 9, Y + 14, 7, 2, 0.55);
    const x0 = X + 2, y0 = Y + 3;
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      let c = y < 4 ? w3 : w1;
      if (y >= 4 && (x === 0 || x === 11 || y === 11 || y === 4)) c = w0;
      if (y < 4 && (y === 0 || x === 0 || x === 11)) c = w2;
      if (y >= 4 && x === y - 4 + 1) c = w2;
      P.px(x0 + x, y0 + y, c);
    }
    P.px(x0, y0 + 11, k); P.px(x0 + 11, y0 + 11, k);
  }

  _rocks(P, X, Y, tx, ty) {
    const R = this.rock;
    const n = 2 + Math.floor(hash2(tx, ty, 41) * 2);
    for (let i = 0; i < n; i++) {
      const cx = X + 3 + Math.floor(hash2(tx, ty, 42 + i) * 10), cy = Y + 6 + Math.floor(hash2(tx, ty, 50 + i) * 7);
      const rr = 2 + hash2(tx, ty, 60 + i) * 2;
      P.shadowEllipse(cx + 1, cy + 2, rr, 1.5, 0.6);
      for (let y = -rr; y <= rr * 0.7; y++) for (let x = -rr; x <= rr; x++) {
        if ((x * x) / (rr * rr) + (y * y) / (rr * rr * 0.6) > 1) continue;
        P.px(cx + x, cy + y, y < -rr * 0.3 ? R[3] : x > rr * 0.3 ? R[1] : R[2]);
      }
    }
  }

  _rubble(P, X, Y, tx, ty) {
    const c = [pack('#4C4F4B'), pack('#62665F'), pack('#7A7E76'), pack('#949890'), pack('#3A302A')];
    // scorched footprint under the debris
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (hash2(X + x, Y + y, 160) < 0.75) P.mulPx(X + x, Y + y, 0.62 + hash2(X + x, Y + y, 161) * 0.18);
    const plate = [pack('#2A2D30'), pack('#43484C'), pack('#A6F03C')];
    for (let i = 0; i < 3; i++) {
      const x = X + 2 + Math.floor(hash2(tx, ty, 170 + i) * 11), y = Y + 2 + Math.floor(hash2(tx, ty, 180 + i) * 11);
      P.px(x, y, plate[0]); P.px(x + 1, y, plate[1]); P.px(x + 2, y, plate[1]); P.px(x + 1, y + 1, plate[0]);
      if (i === 0 && hash2(tx, ty, 190) < 0.4) P.px(x + 2, y + 1, plate[2]);
    }
    for (let i = 0; i < 14; i++) {
      const x = X + Math.floor(hash2(tx, ty, 70 + i) * 15), y = Y + Math.floor(hash2(tx, ty, 90 + i) * 14);
      const s = hash2(tx, ty, 110 + i);
      P.px(x, y, c[3]); P.px(x + 1, y, c[2]);
      if (s > 0.4) { P.px(x, y + 1, c[1]); P.px(x + 1, y + 1, c[0]); }
      if (s > 0.8) { P.px(x + 2, y, c[2]); P.px(x + 2, y + 1, c[0]); }
    }
    for (let i = 0; i < 8; i++) P.mulPx(X + Math.floor(hash2(tx, ty, 130 + i) * 16), Y + Math.floor(hash2(tx, ty, 140 + i) * 16), 0.7);
  }

  _wreck(P, X, Y, tx, ty) {
    const k = pack('#1A1816'), m0 = pack('#3A3530'), m1 = pack('#524A40'), m2 = pack('#6E5E4A'), rust = pack('#7A4E2E');
    P.shadowEllipse(X + 9, Y + 13, 8, 3, 0.55);
    for (let y = 4; y < 14; y++) for (let x = 1; x < 15; x++) {
      let c = y < 7 ? m2 : y < 11 ? m1 : m0;
      if (hash2(X + x, Y + y, 150) < 0.2) c = rust;
      if (x === 1 || x === 14 || y === 13) c = k;
      P.px(X + x, Y + y, c);
    }
    for (let x = 4; x < 11; x++) P.px(X + x, Y + 3, m1);
    P.px(X + 5, Y + 6, k); P.px(X + 6, Y + 6, k); P.px(X + 9, Y + 6, k);
  }

  _fence(P, X, Y, tx, ty) {
    const m = this.map;
    const nb = (dx, dy) => m.inb(tx + dx, ty + dy) && (m.overlay[(ty + dy) * m.w + tx + dx] === O.fence || m.overlay[(ty + dy) * m.w + tx + dx] === O.wall);
    const post = pack('#5A5046'), postL = pack('#8A7E70'), wire = pack('#A8A8A0');
    const vert = (nb(0, -1) || nb(0, 1)) && !(nb(-1, 0) || nb(1, 0));
    if (vert) {
      for (let y = 0; y < 16; y++) { if (y % 3 === 0) P.px(X + 7, Y + y, wire); P.px(X + 9, Y + y, (y % 3 === 1) ? wire : P.get(X + 9, Y + y)); }
      for (const py of [2, 10]) { for (let y = 0; y < 6; y++) P.px(X + 8, Y + py + y, y === 0 ? postL : post); P.shadowEllipse(X + 9, Y + py + 6, 1.5, 1, 0.6); }
    } else {
      for (let x = 0; x < 16; x++) { P.px(X + x, Y + 8, wire); P.px(X + x, Y + 11, wire); }
      for (const px of [1, 9]) { for (let y = 5; y < 14; y++) P.px(X + px, Y + y, y === 5 ? postL : post); P.px(X + px + 1, Y + 14, pack('#00000055')); }
    }
  }

  _wall(P, X, Y, tx, ty) {
    const m = this.map;
    const isW = (dx, dy) => m.inb(tx + dx, ty + dy) && m.overlay[(ty + dy) * m.w + tx + dx] === O.wall;
    const top = [pack('#8A8C84'), pack('#A0A298'), pack('#B4B6AC')];
    const face = [pack('#4A4C46'), pack('#5E605A'), pack('#6E7068')];
    const k = pack('#26282A');
    const sOpen = !isW(0, 1);
    const faceH = sOpen ? 7 : 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c;
      if (y >= 16 - faceH) {
        const fy = y - (16 - faceH);
        c = face[1];
        if (fy === 0) c = face[2];
        if ((fy === 3) || ((x + (fy > 3 ? 4 : 0)) % 8 === 0 && fy > 0)) c = face[0];
        if (fy === faceH - 1) c = k;
      } else {
        c = top[1];
        if (hash2(X + x, Y + y, 160) < 0.15) c = top[0];
        if (hash2(X + x, Y + y, 161) < 0.08) c = top[2];
        if (!isW(0, -1) && y === 0) c = top[2];
        if (!isW(-1, 0) && x === 0) c = top[2];
        if (!isW(1, 0) && x === 15) c = face[0];
      }
      P.px(X + x, Y + y, c);
    }
    if (sOpen) for (let x = 0; x < 16; x++) P.mulPx(X + x, Y + 16, 0.6);
  }

  _bridge(P, X, Y, tx, ty) {
    const m = this.map;
    const isB = (dx, dy) => m.inb(tx + dx, ty + dy) && m.overlay[(ty + dy) * m.w + tx + dx] === O.bridge;
    const land = (dx, dy) => m.inb(tx + dx, ty + dy) && !TERRAIN[m.terrain[(ty + dy) * m.w + tx + dx]].water;
    const horiz = isB(1, 0) || isB(-1, 0) || land(1, 0) || land(-1, 0);
    const w0 = pack('#3E2C1A'), w1 = pack('#6B4D2E'), w2 = pack('#8C6A42'), w3 = pack('#A8865A'), k = pack('#1E160E');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const along = horiz ? x : y, across = horiz ? y : x;
      let c = (along % 4 === 3) ? w0 : (hash2(X + (horiz ? (x >> 2) : x), Y + (horiz ? y : y >> 2), 170) < 0.3 ? w1 : w2);
      if (along % 4 === 0) c = w3;
      P.px(X + x, Y + y, c);
      if (!(horiz ? isB(0, -1) : isB(-1, 0)) && across <= 1) P.px(X + x, Y + y, across === 0 ? w3 : k);
      if (!(horiz ? isB(0, 1) : isB(1, 0)) && across >= 14) P.px(X + x, Y + y, across === 15 ? k : w1);
    }
    if (!(horiz ? isB(0, 1) : isB(1, 0))) {
      // shadow on water below the bridge edge
      if (horiz) for (let x = 0; x < 16; x++) { P.mulPx(X + x, Y + 16, 0.55); P.mulPx(X + x, Y + 17, 0.75); }
    }
  }

  _crystal(P, X, Y, tx, ty) {
    const spr = floraSprite('volcanic', 'bush', hash2(tx, ty, 180));
    P.shadowEllipse(X + 9, Y + 14, 5, 2, 0.55);
    this._sprite(P, spr, X + 8, Y + 15);
  }
}

/**
 * Cellular "stacked boulders" rock shading for cliff faces. Returns 0..4 index into rock palette.
 */
function rockCell(wx, wy, cw = 6, ch = 5) {
  const cx = Math.floor(wx / cw), cy = Math.floor(wy / ch);
  let d1 = 1e9, d2 = 1e9, bx = 0, by = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = cx + i, gy = cy + j;
    const px = (gx + 0.15 + hash2(gx, gy, 401) * 0.7) * cw, py = (gy + 0.15 + hash2(gx, gy, 402) * 0.7) * ch;
    const dx = wx + 0.5 - px, dy = wy + 0.5 - py;
    const d = dx * dx + dy * dy * 1.4;
    if (d < d1) { d2 = d1; d1 = d; bx = dx; by = dy; } else if (d < d2) d2 = d;
  }
  const edge = Math.sqrt(d2) - Math.sqrt(d1);
  if (edge < 0.9) return 0;
  const l = -(bx * 0.55 + by * 0.85) / cw;
  return l > 0.28 ? 4 : l > 0.02 ? 3 : l > -0.3 ? 2 : 1;
}

/** Relief: rock-face height per level (px) and the margin of height field a chunk needs around it. */
const RELIEF_FACE = 22, RELIEF_MG = 50;
const RAMP_FOOT = 0.4;
const EDGE_STEP = 0.3;
const SIDE_E = 13, SIDE_W = 10;   // side-wall width per level (px): east-facing (shaded), west-facing (lit)   // a drop this sudden between neighbouring pixels is an edge (a ramp climbs more gently)   // share of a ramp's climb drawn on the tile at its foot
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** Minimal painter on a chunk buffer using world px coordinates. */
class ChunkPainter {
  constructor(buf, size, ox, oy) { this.buf = buf; this.size = size; this.ox = ox; this.oy = oy; }
  px(x, y, c) {
    x = Math.round(x) - this.ox; y = Math.round(y) - this.oy;
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const v = typeof c === 'number' ? c : pack(c);
    const a = v >>> 24;
    if (a === 255) { this.buf[y * this.size + x] = v; return; }
    if (a === 0) return;
    this.buf[y * this.size + x] = mix(this.buf[y * this.size + x], v | 0xff000000, a / 255);
  }
  get(x, y) {
    x = Math.round(x) - this.ox; y = Math.round(y) - this.oy;
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return 0xff000000;
    return this.buf[y * this.size + x];
  }
  mulPx(x, y, f) {
    x = Math.round(x) - this.ox; y = Math.round(y) - this.oy;
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.buf[y * this.size + x] = shade(this.buf[y * this.size + x], f);
  }
  shadowEllipse(cx, cy, rx, ry, f) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.mulPx(x, y, f);
    }
  }
}
export { CPX, CH };
