// @ts-check
import { TERRAIN, OVERLAY, T, O } from '../world/tiles.js';
import { buildTextures, BIOMES, TEX, EDGE_NOISE, EDGE_NOISE2 } from './tileArt.js';
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
    this.B = BIOMES[this.biome];
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
          const e = m.elev[ti];
          const lx = wx - tx * TILE, ly = wy - ty * TILE;
          let bestP = prio[t];
          const thr = 1.5 + 4.5 * EDGE_NOISE[(wy & 63) * TEX + (wx & 63)];
          for (let k = 0; k < 8; k++) {
            const nj = tile(tx + N8[k][0], ty + N8[k][1]);
            if (nj < 0) continue;
            const nt = m.terrain[nj];
            if (prio[nt] <= bestP || m.elev[nj] !== e) continue;
            const dx = N8[k][0], dy = N8[k][1];
            let d;
            const ddx = dx > 0 ? 15.5 - lx : dx < 0 ? lx + 0.5 : 0;
            const ddy = dy > 0 ? 15.5 - ly : dy < 0 ? ly + 0.5 : 0;
            if (dx && dy) d = Math.hypot(ddx, ddy); else d = dx ? ddx : ddy;
            if (d < thr) { bestP = prio[nt]; t = nt; }
          }
        }
        pxT[(py + M) * PW + (px + M)] = t;
        if (px >= 0 && py >= 0 && px < CPX && py < CPX) {
          const e = ti >= 0 ? m.elev[ti] : 0;
          // anti-tiling: large noise regions sample the (tileable) texture at different offsets,
          // with dithered borders, so the 64-px period never lines up into a visible grid
          const rn = valueNoise(wx / 52, wy / 52, 91) + (EDGE_NOISE2[(wy & 63) * TEX + (wx & 63)] - 0.5) * 0.18;
          const sx = rn > 0.62 ? wx + 29 : rn < 0.36 ? wx + 47 : wx, sy = rn > 0.62 ? wy + 43 : rn < 0.36 ? wy + 17 : wy;
          buf[py * CPX + px] = tex[t][e][(sy & 63) * TEX + (sx & 63)];
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
      // cliff faces
      if (m.cliff[ti]) this._cliff(P, tx, ty, e);
      // lips on N / W plateau edges and creases on the lower side
      const n = tile(tx, ty - 1), wv = tile(tx - 1, ty);
      if (n >= 0 && m.elev[n] < e && m.overlay[n] !== O.ramp) {
        for (let x = 0; x < 16; x++) { P.mulPx(X + x, Y, 1.42); P.mulPx(X + x, Y + 1, 1.2); P.mulPx(X + x, Y + 2, 1.07); }
      }
      if (wv >= 0 && m.elev[wv] < e && m.overlay[wv] !== O.ramp && !m.cliff[ti]) {
        for (let y = 0; y < 16; y++) { P.mulPx(X, Y + y, 1.38); P.mulPx(X + 1, Y + y, 1.16); P.mulPx(X + 2, Y + y, 1.05); }
      }
      const s = tile(tx, ty + 1), ev = tile(tx + 1, ty);
      if (s >= 0 && m.elev[s] > e && m.overlay[ti] !== O.ramp) for (let x = 0; x < 16; x++) { P.mulPx(X + x, Y + 15, 0.5); P.mulPx(X + x, Y + 14, 0.8); }
      if (ev >= 0 && m.elev[ev] > e && m.overlay[ti] !== O.ramp) for (let y = 0; y < 16; y++) { P.mulPx(X + 15, Y + y, 0.55); P.mulPx(X + 14, Y + y, 0.85); }
      // drop shadow SE from cliffs onto lower ground
      if (n >= 0 && m.elev[n] > e && m.cliff[n]) for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) P.mulPx(X + x, Y + y, 0.5 + y * 0.12);
      if (wv >= 0 && m.elev[wv] > e && m.cliff[wv]) for (let x = 0; x < 3; x++) for (let y = 0; y < 16; y++) P.mulPx(X + x, Y + y, 0.58 + x * 0.13);
      if (o === O.ramp) this._ramp(P, tx, ty, e);
    }

    // --- pass 4: decorations and low overlays
    for (let ty = ty0; ty < Math.min(H, ty0 + CH); ty++) for (let tx = tx0; tx < Math.min(W, tx0 + CH); tx++) {
      const ti = ty * W + tx;
      const o = m.overlay[ti], t = m.terrain[ti];
      const X = tx * TILE, Y = ty * TILE;
      if (o === O.none && !m.cliff[ti]) this._decorate(P, tx, ty, t);
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

  _cliff(P, tx, ty, e) {
    const m = this.map, W = m.w;
    const X = tx * TILE, Y = ty * TILE;
    const s = ty + 1 < m.h ? (ty + 1) * W + tx : -1;
    const ev = tx + 1 < W ? ty * W + tx + 1 : -1;
    const R = this.rock;
    const snowy = this.biome === 'alpine';
    const sDiff = s >= 0 ? e - m.elev[s] : 0;
    const eDiff = ev >= 0 ? e - m.elev[ev] : 0;
    const grassDark = pack(this.B.groundDark);
    if (sDiff > 0) {
      const faceH = sDiff >= 2 ? 15 : 13;
      for (let x = 0; x < 16; x++) {
        const wx = X + x;
        const jag = Math.round(EDGE_NOISE2[(Y & 63) * TEX + (wx & 63)] * 4 + EDGE_NOISE[(Y & 63) * TEX + (wx & 63)] * 1.5) - 2;
        const top = 16 - faceH + jag;
        const crack = hash2(wx, ty, 11) < 0.16;
        const band = hash2(wx >> 2, ty, 13);
        for (let y = Math.max(0, top - 1); y < 16; y++) {
          const wy = Y + y;
          const k = y - top;
          let c;
          if (k === -1) c = snowy ? pack('#FFFFFF') : grassDark;          // overhanging turf
          else if (k === 0) c = snowy ? pack('#EEF6FA') : R[4];          // lit rim
          else {
            const depth = k / Math.max(1, 16 - top);
            const ri = rockCell(wx, wy);
            c = R[ri];
            if (depth > 0.65 && ri > 1) c = R[ri - 1];
            if (depth > 0.85) c = ri === 0 ? R[0] : R[1];
            if (crack && k > 2 && ri < 2) c = R[0];
            if (snowy && k === 1 && hash2(wx, wy, 14) < 0.6) c = pack('#C8D6DE');
            if (snowy && ri === 4 && hash2(wx, wy, 17) < 0.5) c = pack('#DDE8EE');
          }
          P.px(wx, wy, c);
        }
        // scree at the foot of the cliff (on the tile below)
        if (hash2(wx, ty, 15) < 0.35) { P.px(wx, Y + 16 + (hash2(wx, ty, 16) < 0.5 ? 0 : 1), R[2]); }
      }
    }
    if (eDiff > 0) {
      const faceW = eDiff >= 2 ? 8 : 6;
      for (let y = 0; y < 16; y++) {
        const wy = Y + y;
        const jag = Math.round(EDGE_NOISE2[(wy & 63) * TEX + (X & 63)] * 2);
        const left = 16 - faceW + jag - 1;
        for (let x = Math.max(0, left - 1); x < 16; x++) {
          const k = x - left;
          const wx = X + x;
          let c;
          if (k === -1) c = snowy ? pack('#FFFFFF') : grassDark;
          else if (k === 0) c = R[3];
          else {
            const n = EDGE_NOISE[((wy >> 1) & 63) * TEX + ((wx >> 1) & 63)];
            const ri = rockCell(wx, wy, 4, 6);
            c = R[Math.max(0, ri - 1)];
            if (n < 0.25) c = R[0];
            if (x === 15) c = R[0];
          }
          if (sDiff > 0 && y >= 16 - (sDiff >= 2 ? 15 : 13) && k > 0) c = R[0];
          P.px(wx, wy, c);
        }
      }
    }
  }

  _ramp(P, tx, ty, e) {
    const m = this.map, W = m.w;
    const d = m.rampDir[ty * W + tx];
    const X = tx * TILE, Y = ty * TILE;
    const R = this.rock;
    const dirt = [pack('#5E4E36'), pack('#7A6646'), pack('#927C56')];
    const vertical = d === 0 || d === 2;
    // side walls where the ramp is flanked by higher ground
    const sideHigh = (sx, sy) => { const nx = tx + sx, ny = ty + sy; return m.inb(nx, ny) && m.elev[ny * W + nx] > e; };
    const wallA = vertical ? sideHigh(-1, 0) : sideHigh(0, -1);
    const wallB = vertical ? sideHigh(1, 0) : sideHigh(0, 1);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const along = d === 0 ? 1 - y / 15 : d === 2 ? y / 15 : d === 1 ? x / 15 : 1 - x / 15;
      const across = vertical ? x : y;
      const stepPos = vertical ? y : x;
      let c = P.get(X + x, Y + y);
      c = mix(c, dirt[1], 0.55);
      if (hash2(X + x, Y + y, 190) < 0.12) c = dirt[2];
      if (stepPos % 4 === 0) c = mix(c, dirt[0], 0.22);
      c = shade(c, 0.9 + along * 0.2);
      if ((across <= 1 && wallA) || (across >= 14 && wallB)) c = across === 0 || across === 15 ? R[0] : R[2];
      P.px(X + x, Y + y, c);
    }
    // chevrons pointing uphill (subtle)
    const cx = X + 8, cy = Y + 8;
    const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][d] || [0, -1];
    for (let k = -2; k <= 2; k++) {
      const px = cx + dx * (2 - Math.abs(k)) + (vertical ? k : 0), py = cy + dy * (2 - Math.abs(k)) + (vertical ? 0 : k);
      P.px(px, py, dirt[2]);
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
