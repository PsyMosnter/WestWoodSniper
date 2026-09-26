// @ts-check
import { T } from '../world/tiles.js';
import { BIOMES } from './tileArt.js';
import { Time } from '../core/time.js';

/**
 * Standing in tall grass or shallow water (playtest feedback): the lower half of a soldier is hidden —
 * waist-deep in water (cut at the waterline, with ripples), or behind swaying grass blades in the
 * biome's own grass colours — so it reads at a glance that they're harder to see. WREN also leaves a
 * short, fading trail: flattened grass that springs back, or a spreading wake. Purely visual; the
 * gameplay side is concealment in perception (tall grass 0.5, still/crouched in shallow water).
 */

/** 'grass' | 'water' | null for the terrain at a tile. */
export function coverKind(map, tx, ty) {
  if (!map.inb(tx, ty)) return null;
  const t = map.terrain[map.idx(tx, ty)];
  return t === T.tallgrass ? 'grass' : t === T.shallow ? 'water' : null;
}

const WATER = { swamp: ['#364432', '#5E7040'], desert: ['#8E7A50', '#C4B080'] };
const FOAM = '#DDF4FF';
function waterCols(biome) { return WATER[biome] || ['#337A9C', '#A9D6E6']; }
function grassCols(biome) { return (BIOMES[biome] || BIOMES.temperate).tall; }

/** First and last opaque rows of a sprite canvas, and its opaque column span (cached per canvas). */
const bounds = new WeakMap();
function spriteBounds(canvas) {
  let b = bounds.get(canvas);
  if (b) return b;
  const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const d = c.getImageData(0, 0, canvas.width, canvas.height).data;
  let top = canvas.height, bottom = -1, left = canvas.width, right = -1;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    if (d[(y * canvas.width + x) * 4 + 3] < 8) continue;
    top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x);
  }
  b = bottom < 0 ? { top: 0, bottom: canvas.height - 1, left: 0, right: canvas.width - 1 } : { top, bottom, left, right };
  bounds.set(canvas, b);
  return b;
}
const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

/**
 * Draw a sprite (canvas `img`, geometry from sprite `s`) with its top-left at screen (X, Y), covered by
 * the terrain `kind`. `seed` keeps each unit's grass clump stable; `moving` parts the blades.
 */
export function drawCovered(ctx, z, img, s, X, Y, kind, biome, seed = 0, moving = false) {
  const b = spriteBounds(s.canvas);
  const feet = Math.min(s.ay, b.bottom + 1);
  if (kind === 'water') {
    // waist-deep: only the rows above the waterline show
    const wl = Math.max(b.top + 3, Math.round(b.top + (feet - b.top) * 0.62));   // the waist
    ctx.drawImage(img, 0, 0, s.w, wl, X, Y, s.w * z, wl * z);
    const [deep, light] = waterCols(biome);
    const y = Y + wl * z;
    // a darker band just under the surface, the foam line, and ripples spreading from the waist
    ctx.fillStyle = deep; ctx.globalAlpha = 0.55;
    ctx.fillRect(X + (b.left - 1) * z, y, (b.right - b.left + 3) * z, z);
    ctx.globalAlpha = 1; ctx.fillStyle = FOAM;
    for (let x = b.left - 1; x <= b.right + 1; x++) if ((x + Math.floor(Time.realTime * 4)) % 3) ctx.fillRect(X + x * z, y - z, z, z);
    const cx = X + ((b.left + b.right + 1) / 2) * z, ph = (Time.realTime * (moving ? 1.6 : 0.7) + seed) % 1;
    ctx.fillStyle = light; ctx.globalAlpha = 0.8 * (1 - ph);
    const R = (4 + ph * 5) * z;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (Math.sin(a) < -0.2) continue;                  // the back of the ring is hidden behind the body
      ctx.fillRect(Math.round(cx + Math.cos(a) * R), Math.round(y + Math.sin(a) * R * 0.4), z, z);
    }
    ctx.globalAlpha = 1;
    return;
  }
  // tall grass: the whole soldier, then a clump of blades in front, tallest in the middle (about the hips)
  ctx.drawImage(img, X, Y, s.w * z, s.h * z);
  const cols = grassCols(biome);
  const reach = (feet - b.top) * 0.55;                   // tallest blade height
  const mid = (b.left + b.right) / 2, half = Math.max(2, (b.right - b.left) / 2 + 1);
  const t = Time.realTime;
  for (let x = b.left - 1; x <= b.right + 1; x++) {
    const hv = hash(seed * 31 + x), hv2 = hash(seed * 17 + x * 3 + 1);
    if (hv < 0.22) continue;                             // gaps between blades let the body show through
    const edge = Math.min(1, Math.abs(x - mid) / half);
    const bh = Math.max(2, Math.round(reach * (0.45 + 0.55 * hv) * (1 - 0.55 * edge)));
    const lean = hv2 < 0.3 ? -1 : hv2 > 0.7 ? 1 : 0;
    const sway = Math.sin(t * 2.2 + x * 0.8 + seed) * (moving ? 1.4 : 0.6);
    const body = hv2 < 0.5 ? cols[1] : cols[2];
    for (let j = 0; j <= bh; j++) {
      const k = j / bh;
      const dx = Math.round((lean + sway) * k * k);
      ctx.fillStyle = j === bh ? cols[3] : j === 0 ? cols[0] : body;
      ctx.fillRect(X + (x + dx) * z, Y + (feet - j) * z, z, z);
    }
  }
}

/** WREN's fading trail through tall grass (flattened blades) and shallow water (spreading wake). */
export class TerrainTrails {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.biome = this.world.map.biome;
    this.pts = [];                  // {x, y, a, t, kind, side}
    this.side = 1;
  }
  update(dt) {
    const op = this.world.operative;
    for (const p of this.pts) p.t += dt;
    this.pts = this.pts.filter((p) => p.t < (p.kind === 'grass' ? 6 : 1.8));
    if (!op.moving || op.hidden || op.dead) return;
    const kind = coverKind(this.world.map, op.tx, op.ty);
    if (!kind) return;
    const last = this.pts[this.pts.length - 1];
    if (last && Math.hypot(op.x - last.x, op.y - last.y) < 0.35) return;
    this.side = -this.side;
    this.pts.push({ x: op.x, y: op.y, a: op.angle || 0, t: 0, kind, side: this.side });
    if (this.pts.length > 16) this.pts.shift();         // a few tiles long (16 × 0.35)
  }
  /** ground layer: under the sprites */
  draw(ctx, r) {
    const z = r.cam.zoom, fog = this.world.fog;
    const grass = grassCols(this.biome);
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[i];
      if (!fog.isVisible(Math.floor(p.x), Math.floor(p.y))) continue;
      const X = r.sx(p.x), Y = r.sy(p.y);
      if (p.kind === 'grass') {
        // a trodden streak back to the previous point, with a few bent blades — springs back over 6 s
        const fade = Math.min(1, 1.3 * (1 - p.t / 6));
        const q = this.pts[i + 1] && this.pts[i + 1].kind === 'grass' ? this.pts[i + 1] : null;
        ctx.fillStyle = grass[0]; ctx.globalAlpha = 0.7 * fade;
        if (q) {
          const QX = r.sx(q.x), QY = r.sy(q.y), n = Math.max(1, Math.round(Math.hypot(QX - X, QY - Y) / z));
          for (let k = 0; k <= n; k++) { const x = X + ((QX - X) * k) / n, y = Y + ((QY - Y) * k) / n; ctx.fillRect(Math.round(x - z), Math.round(y - z / 2), 3 * z, 2 * z); }
        } else ctx.fillRect(Math.round(X - z), Math.round(Y - z / 2), 3 * z, 2 * z);
        const ca = Math.cos(p.a), sa = Math.sin(p.a), off = p.side * 2.5;
        const bx = X - sa * off * z, by = Y + ca * off * z;
        ctx.globalAlpha = 0.9 * fade;
        ctx.fillStyle = grass[1]; ctx.fillRect(Math.round(bx), Math.round(by), z, z); ctx.fillRect(Math.round(bx + ca * z), Math.round(by + sa * z), z, z);
        ctx.fillStyle = grass[3]; ctx.fillRect(Math.round(bx + ca * 2 * z), Math.round(by + sa * 2 * z), z, z);
      } else {
        // a wake ring spreading out behind WREN
        const k = p.t / 1.8, R = (2 + k * 7) * z;
        ctx.globalAlpha = 0.75 * (1 - k);
        ctx.fillStyle = FOAM;
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          ctx.fillRect(Math.round(X + Math.cos(a) * R), Math.round(Y + Math.sin(a) * R * 0.45), z, z);
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}

