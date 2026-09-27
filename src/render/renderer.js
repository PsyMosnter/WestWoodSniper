// @ts-check
import { TerrainRenderer } from './terrainRenderer.js';
import { FogRenderer } from './fogRenderer.js';
import { unitSprite, whiteOf, tintOf, markerLift, drawGroundShadow } from './sprites.js';
import { TILE } from '../core/camera.js';
import { Time } from '../core/time.js';
import { hash2 } from '../core/rng.js';
import { T, O } from '../world/tiles.js';
import { coverKind, drawCovered } from './terrainCover.js';

/**
 * World renderer (SPEC §4.3 draw order): terrain → decals → cliff faces (baked) →
 * objects & units sorted by (tile y, elevation, sub-tile y) → projectiles/effects → fog/shroud →
 * world-space UI. The HUD draws itself afterwards.
 */
export class Renderer {
  constructor(world, cam) {
    this.world = world; this.cam = cam;
    this.terrain = new TerrainRenderer(world.map);
    this.fogR = new FogRenderer(world.map, world.fog);
    this.terrain.getTrees();
    this.rowBuckets = [];
    this.layers = { ground: [], sorted: [], effects: [], overFog: [], ui: [] }; // pluggable drawers
    this.markers = []; // transient world markers {x,y,t,kind}
    this.xray = true;
  }
  /** world tile coords → screen px (interpolated input) */
  sx(x) { return (x * TILE - this.cam.left) * this.cam.zoom; }
  sy(y) { return (y * TILE - this.cam.top) * this.cam.zoom; }

  draw(ctx, alpha) {
    const cam = this.cam, w = this.world, m = w.map;
    const z = cam.zoom;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#07090A';
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);
    this.terrain.draw(ctx, cam);

    const tx0 = Math.max(0, Math.floor(cam.left / TILE) - 1);
    const ty0 = Math.max(0, Math.floor(cam.top / TILE) - 1);
    const tx1 = Math.min(m.w - 1, Math.ceil((cam.left + cam.viewW / z) / TILE) + 1);
    const ty1 = Math.min(m.h - 1, Math.ceil((cam.top + cam.viewH / z) / TILE) + 2);

    this._water(ctx, tx0, ty0, tx1, ty1);
    for (const f of this.layers.ground) f(ctx, this, alpha);
    this._groundUI(ctx, alpha);

    // --- sorted pass by rows
    const rows = this.rowBuckets;
    for (let y = ty0; y <= ty1 + 2; y++) rows[y] = rows[y] ? (rows[y].length = 0, rows[y]) : [];
    const push = (e, row) => { if (row >= ty0 && row <= ty1 + 2) rows[row].push(e); };
    for (const f of this.layers.sorted) f(push, this, alpha);
    const op = w.operative;
    const opx = op.px + (op.x - op.px) * alpha, opy = op.py + (op.y - op.py) * alpha;
    if (!op.hidden) push({ kind: 'op', x: opx, y: opy, e: op }, Math.floor(opy));

    const treeRows = this.terrain.treeRows;
    const fog = w.fog;
    let opOccluded = false;
    for (let y = ty0; y <= ty1 + 2 && y < m.h; y++) {
      // trees on this row
      const tr = treeRows[y];
      for (let k = 0; k < tr.length; k++) {
        const t = tr[k];
        if (t.tx < tx0 - 1 || t.tx > tx1 + 1) continue;
        if (fog.state(t.i) === 0) continue;
        const s = t.spr;
        ctx.drawImage(s.canvas, Math.round((t.px - s.ax - cam.left) * z), Math.round((t.py - s.ay - cam.top) * z), s.w * z, s.h * z);
        if (!opOccluded && y > Math.floor(opy) && y <= Math.floor(opy) + 2 && Math.abs(t.px / TILE - opx) < 0.9) opOccluded = true;
      }
      const list = rows[y];
      if (!list || !list.length) continue;
      list.sort((a, b) => (a.elev || 0) - (b.elev || 0) || a.y - b.y);
      for (const e of list) {
        if (e.kind === 'op') this._drawOperative(ctx, e.e, e.x, e.y);
        else e.draw(ctx, this);
      }
    }
    // x-ray silhouette of the Operative when hidden behind trees/buildings
    if (!opOccluded) for (const s of w.structures || []) {
      if (s.dead || !s.seen) continue;
      const top = s.y - (s.def.Hb || 0) / TILE - 0.6;
      if (opy < s.y + s.h && opy > top && opx > s.x - 0.4 && opx < s.x + s.w + 0.4) { opOccluded = true; break; }
    }
    if (this.xray && !op.hidden && (opOccluded || m.overlay[op.ty * m.w + op.tx] === O.forest)) {
      const { pose, frame } = op.pose();
      const s = unitSprite('operative', pose, op.facing, frame);
      ctx.globalAlpha = 0.45;
      ctx.drawImage(tintOf(s.canvas, '#9FD8FF'), Math.round(this.sx(opx) - s.ax * z), Math.round(this.sy(opy) - s.ay * z), s.w * z, s.h * z);
      ctx.globalAlpha = 1;
    }
    for (const f of this.layers.effects) f(ctx, this, alpha);
    this.fogR.draw(ctx, cam);
    // progress bar for timed actions (planting C4, medkit, freeing a captive)
    if (!op.dead && !op.hidden && op.busy && op.busy.dur > 0 && op.busy.kind !== 'takedown' && this._opCx !== undefined) {
      const k = Math.min(1, op.busy.t / op.busy.dur);
      const bx = this._opCx - 10, by = this._opCy - markerLift(this._opSprite, 26) * z;
      ctx.fillStyle = '#07090A'; ctx.fillRect(bx - 1, by - 1, 22, 5);
      ctx.fillStyle = '#26302A'; ctx.fillRect(bx, by, 20, 3);
      ctx.fillStyle = op.busy.kind === 'plant' ? '#FFB23A' : '#7CFF7A'; ctx.fillRect(bx, by, Math.round(20 * k), 3);
    }
    // locator chevron above WREN (always on top of fog/trees)
    if (!op.dead && !op.hidden && this._opCx !== undefined) {
      const bob = Math.round(Math.sin(Time.realTime * 5) * 1);
      const hx = this._opCx, hy = this._opCy - markerLift(this._opSprite, 19) * z + bob;
      ctx.fillStyle = '#07090A';
      ctx.fillRect(hx - 3 * z, hy - z, 7 * z, z); ctx.fillRect(hx - 2 * z, hy, 5 * z, z); ctx.fillRect(hx - z, hy + z, 3 * z, z); ctx.fillRect(hx, hy + 2 * z, z, z);
      ctx.fillStyle = '#9CFF8A';
      ctx.fillRect(hx - 2 * z, hy - z, 5 * z, z); ctx.fillRect(hx - z, hy, 3 * z, z); ctx.fillRect(hx, hy + z, z, z);
      // stance badge: shield in cover, down-bars when hunkered
      const st = op.trans ? op.trans.to : op.stance;
      if (st === 'cover' || st === 'hunker') {
        const bx = hx + 5 * z, by = hy - 2 * z;
        ctx.fillStyle = '#07090A'; ctx.fillRect(bx - z, by - z, 7 * z, 7 * z);
        ctx.fillStyle = st === 'cover' ? '#6FA2C8' : '#FFB23A';
        if (st === 'cover') { ctx.fillRect(bx, by, 5 * z, 3 * z); ctx.fillRect(bx + z, by + 3 * z, 3 * z, z); ctx.fillRect(bx + 2 * z, by + 4 * z, z, z); }
        else { ctx.fillRect(bx, by + z, 5 * z, z); ctx.fillRect(bx, by + 3 * z, 5 * z, z); }
      }
    }
    for (const f of this.layers.overFog) f(ctx, this, alpha);
    this._markers(ctx);
    for (const f of this.layers.ui) f(ctx, this, alpha);
  }

  _drawOperative(ctx, op, x, y) {
    const { pose, frame } = op.pose();
    const s = unitSprite('operative', pose, op.facing, frame);
    this._opSprite = s;
    const z = this.cam.zoom;
    const X = Math.round(this.sx(x) - s.ax * z), Y = Math.round(this.sy(y) - s.ay * z);
    const m = this.world.map, cover = coverKind(m, op.tx, op.ty);
    if (cover !== 'water') drawGroundShadow(ctx, s, this.sx(x), this.sy(y), z);
    const flash = op.flashT > 0 && (Math.floor(Time.realTime * 30) & 1) === 0;
    const img = flash ? whiteOf(s.canvas) : s.canvas;
    // tall grass / shallow water hide the lower half (harder to see — SPEC §7.1 concealment)
    if (cover) drawCovered(ctx, z, img, s, X, Y, cover, m.biome, 7, op.moving);
    else ctx.drawImage(img, X, Y, s.w * z, s.h * z);
  }

  _groundUI(ctx, alpha) {
    const w = this.world, op = w.operative, z = this.cam.zoom;
    const x = op.px + (op.x - op.px) * alpha, y = op.py + (op.y - op.py) * alpha;
    const cx = Math.round(this.sx(x)), cy = Math.round(this.sy(y));
    // selection ring under the Operative (double ring so it reads on any terrain)
    const pulse = 0.75 + 0.25 * Math.sin(Time.realTime * 4);
    ellipse(ctx, cx, cy + 1, 7 * z, 3.5 * z, 'rgba(7,9,10,0.6)');
    ctx.globalAlpha = pulse;
    ellipse(ctx, cx, cy, 7 * z, 3.5 * z, '#9CFF8A');
    ctx.globalAlpha = 1;
    this._opCx = cx; this._opCy = cy;
    // destination marker
    if (op.path.length && op.dest) {
      const dx = Math.round(this.sx(op.dest.x + 0.5)), dy = Math.round(this.sy(op.dest.y + 0.5));
      const k = (Time.realTime * 2) % 1;
      const r = Math.round((5 - 2 * k) * z);
      const col = op.mode === 'run' ? '#FFB23A' : '#7CFF7A';
      ctx.fillStyle = col;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.fillRect(dx + sx * r - (sx < 0 ? 0 : z), dy + sy * r - (sy < 0 ? 0 : z), z, z);
        ctx.fillRect(dx + sx * r - (sx < 0 ? 0 : z) - sx * z, dy + sy * r - (sy < 0 ? 0 : z), z, z);
        ctx.fillRect(dx + sx * r - (sx < 0 ? 0 : z), dy + sy * r - (sy < 0 ? 0 : z) - sy * z, z, z);
      }
      // dotted path
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.5;
      let px = x, py = y;
      const t0 = (Time.realTime * 3) % 1;
      for (const wp of op.path) {
        const qx = wp.x + 0.5, qy = wp.y + 0.5;
        const d = Math.hypot(qx - px, qy - py);
        const n = Math.floor(d / 0.5);
        for (let i = 1; i <= n; i++) {
          const t = (i - t0) / (d / 0.5);
          if (t < 0 || t > 1) continue;
          ctx.fillRect(Math.round(this.sx(px + (qx - px) * t)), Math.round(this.sy(py + (qy - py) * t)), z, z);
        }
        px = qx; py = qy;
      }
      ctx.globalAlpha = 1;
    }
  }

  addMarker(x, y, kind = 'tap', color = '#7CFF7A') { this.markers.push({ x, y, t: 0, kind, color }); }
  _markers(ctx) {
    const z = this.cam.zoom;
    for (const mk of this.markers) {
      mk.t += 1 / 60;
      const k = mk.t / 0.4;
      if (k >= 1) continue;
      const r = (3 + k * 8) * z;
      ctx.globalAlpha = 1 - k;
      ellipse(ctx, Math.round(this.sx(mk.x)), Math.round(this.sy(mk.y)), r, r * 0.6, mk.color);
      ctx.globalAlpha = 1;
    }
    this.markers = this.markers.filter((m) => m.t < 0.4);
  }

  _water(ctx, tx0, ty0, tx1, ty1) {
    const m = this.world.map, z = this.cam.zoom, t = Time.realTime;
    ctx.fillStyle = '#A9D6E6';
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const i = y * m.w + x;
      const tr = m.terrain[i];
      if ((tr !== T.deep && tr !== T.shallow) || m.overlay[i] === O.bridge) continue;
      for (let k = 0; k < 2; k++) {
        const h = hash2(x, y, 300 + k);
        const ph = Math.sin(t * (1.5 + h) + h * 40);
        if (ph < 0.8) continue;
        const px = x * 16 + 2 + Math.floor(hash2(x, y, 310 + k) * 12), py = y * 16 + 2 + Math.floor(hash2(x, y, 320 + k) * 12);
        const X = Math.round((px - this.cam.left) * z), Y = Math.round((py - this.cam.top) * z);
        ctx.fillRect(X, Y, 2 * z, z);
        if (ph > 0.93) ctx.fillRect(X + z, Y - z, z, z);
      }
      if (tr === T.lava) { /* handled by effects */ }
    }
    // lava glow pulse
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const i = y * m.w + x;
      if (m.terrain[i] !== T.lava) continue;
      const h = hash2(x, y, 330);
      const a = 0.1 + 0.1 * Math.sin(t * 2 + h * 20);
      ctx.fillStyle = `rgba(255,200,80,${a.toFixed(3)})`;
      ctx.fillRect(Math.round((x * 16 - this.cam.left) * z), Math.round((y * 16 - this.cam.top) * z), 16 * z, 16 * z);
    }
  }
}

/** Pixel ellipse outline (no anti-aliasing). */
export function ellipse(ctx, cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  const n = Math.max(12, Math.round((rx + ry) * 1.6));
  let lx = -999, ly = -999;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
    if (x === lx && y === ly) continue;
    ctx.fillRect(x, y, 1, 1);
    lx = x; ly = y;
  }
}
