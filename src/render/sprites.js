// @ts-check
import { PALETTES } from '../config/palette.js';
import { Pix, makeCanvas } from './pixel.js';
import { drawHumanoid, drawDeath, viewForDir, mirroredDir, OPERATIVE, HUSK, HAX, HAY } from './spriteData/humanoid.js';

/**
 * Sprite compiler & cache (SPEC §4.5): builds canvases from palette-indexed data or procedural
 * painters, creates mirror variants for west-facing directions, palette swaps and white hit-flash
 * silhouettes. The manifest allows any sprite key to be replaced by a PNG later without code changes.
 */

/** Optional PNG overrides: key → { url, ax, ay }. Loaded at boot if present. */
export const MANIFEST = {};
const pngCache = new Map();

const cache = new Map();
const whiteCache = new WeakMap();

/** @typedef {{canvas: HTMLCanvasElement, ax: number, ay: number, w: number, h: number}} Sprite */

/** Registry of unit definitions → humanoid base + gear painter */
const UNIT_DEFS = {
  operative: { base: OPERATIVE, pal: 'GOD', weapon: 'rifle' },
};
export function registerUnitDef(type, def) { UNIT_DEFS[type] = def; }

/**
 * @param {string} type unit type (operative, husk, …)
 * @param {string} pose idle|walk|run|crouch|cover|prone|pistol|fire|dead
 * @param {number} dir 0..7
 * @param {number} frame
 * @returns {Sprite}
 */
export function unitSprite(type, pose, dir, frame = 0, variant = '') {
  const key = `${type}|${pose}|${dir}|${frame}|${variant}`;
  let s = cache.get(key);
  if (s) return s;
  const png = pngCache.get(key);
  if (png) return png;
  const def = UNIT_DEFS[type] || UNIT_DEFS.operative;
  if (def.custom) {
    s = def.custom(pose, dir, frame, variant);
  } else {
    const pal = PALETTES[def.pal];
    const view = viewForDir(dir);
    let pix;
    if (pose === 'dead') pix = drawDeath(def.base, pal, view, frame);
    else {
      const weapon = pose === 'pistol' ? 'pistol' : def.weapon;
      pix = drawHumanoid(def.base, pal, pose, view, frame, { weapon, gear: def.gear });
    }
    if (mirroredDir(dir)) pix = pix.mirrored();
    s = { canvas: pix.toCanvas(), ax: HAX, ay: HAY, w: pix.w, h: pix.h };
  }
  cache.set(key, s);
  return s;
}

/** Generic cached sprite from a builder returning {pix, ax, ay}. */
export function sprite(key, builder) {
  let s = cache.get(key);
  if (s) return s;
  const png = pngCache.get(key);
  if (png) return png;
  const r = builder();
  s = { canvas: r.pix.toCanvas(), ax: r.ax ?? 0, ay: r.ay ?? 0, w: r.pix.w, h: r.pix.h };
  cache.set(key, s);
  return s;
}

/** Build a sprite from a palette-indexed grid {palette, w, h, px[]} */
export function gridSprite(key, data, ax = 0, ay = 0) {
  return sprite(key, () => {
    const p = new Pix(data.w, data.h);
    p.grid(data.px, PALETTES[data.palette] || data.pal);
    if (data.outline) p.outline(data.outline);
    return { pix: p, ax, ay };
  });
}

/** White silhouette of a canvas (hit flash) */
export function whiteOf(canvas) {
  let w = whiteCache.get(canvas);
  if (w) return w;
  w = makeCanvas(canvas.width, canvas.height);
  const ctx = /** @type {CanvasRenderingContext2D} */ (w.getContext('2d'));
  ctx.drawImage(canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w.width, w.height);
  whiteCache.set(canvas, w);
  return w;
}

/** Tinted silhouette (e.g. x-ray outline of the Operative behind trees) */
const tintCache = new Map();
export function tintOf(canvas, color) {
  let m = tintCache.get(color);
  if (!m) { m = new WeakMap(); tintCache.set(color, m); }
  let w = m.get(canvas);
  if (w) return w;
  w = makeCanvas(canvas.width, canvas.height);
  const ctx = /** @type {CanvasRenderingContext2D} */ (w.getContext('2d'));
  ctx.drawImage(canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w.width, w.height);
  m.set(canvas, w);
  return w;
}

/** Draw a sprite at world-anchored screen position. */
export function drawSprite(ctx, s, x, y, flash = false) {
  const dx = Math.round(x - s.ax), dy = Math.round(y - s.ay);
  ctx.drawImage(flash ? whiteOf(s.canvas) : s.canvas, dx, dy);
}

/** Load PNG overrides listed in MANIFEST (optional). */
export async function loadManifest() {
  const entries = Object.entries(MANIFEST);
  await Promise.all(entries.map(([key, m]) => new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = makeCanvas(img.width, img.height);
      c.getContext('2d')?.drawImage(img, 0, 0);
      pngCache.set(key, { canvas: c, ax: m.ax || 0, ay: m.ay || 0, w: img.width, h: img.height });
      res(null);
    };
    img.onerror = () => res(null);
    img.src = m.url;
  })));
}

export { HUSK, OPERATIVE };
