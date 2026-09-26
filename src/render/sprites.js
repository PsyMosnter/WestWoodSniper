// @ts-check
import { PALETTES } from '../config/palette.js';
import { Pix, makeCanvas } from './pixel.js';
import { drawHumanoid, drawDeath, viewForDir, mirroredDir, OPERATIVE, HUSK, HAX, HAY } from './spriteData/humanoid.js';
import { Art } from './artStyle.js';
import { vehicleSprite } from './spriteData/vehicles.js';

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
  const np = Art.painter('unit', type);                  // New art style, if this type has a redesign
  const key = `${np ? 'new|' : ''}${type}|${pose}|${dir}|${frame}|${variant}`;
  let s = cache.get(key);
  if (s) return s;
  const png = pngCache.get(key);
  if (png) return png;
  const def = UNIT_DEFS[type] || UNIT_DEFS.operative;
  if (np) {
    s = np(pose, dir, frame, variant);
  } else if (def.custom) {
    s = def.custom(pose, dir, frame, variant);
  } else {
    const pal = PALETTES[def.pal];
    const view = viewForDir(dir);
    if (pose === 'crawl') pose = 'prone';            // Classic has one flat pose for hunker and crawl
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

/** Sprite variant for a unit's current state (Overseer Vrask once his helmet has been shot off). */
export function unitVariant(u) { return u.def?.helmet && !u.helmet ? 'nohelm' : ''; }

/** Height (sprite px) of a Classic figure's head above its feet — overhead markers were placed for it. */
const CLASSIC_TOP = 14;
/**
 * How far above the ground (sprite px) an overhead marker goes: `base` was tuned for Classic figures;
 * taller New figures (which report `top`, the height of their highest pixel) push it up by the difference.
 * @param {{top?: number}|null|undefined} s @param {number} base
 */
export function markerLift(s, base) { return s?.top == null ? base : base + Math.max(0, s.top - CLASSIC_TOP); }

/**
 * Background sprite warm-up for the New art style: New frames are rendered on first use (a couple of
 * milliseconds each), so the mission queues the frames its units will need and draws a few per frame
 * instead of all at once when a squad starts running. Classic sprites need no warm-up.
 * @param {{type: string, poses?: [string, number][], vehicle?: boolean}[]} specs  infantry types with the
 *   poses/frame counts they use, and vehicle types (all eight facings)
 * @returns {any[][]} queue of ['unit', type, pose, dir, frame] / ['vehicle', type, dir, state]
 */
export function warmQueue(specs) {
  const q = [];
  for (const { type, vehicle } of specs) {
    if (vehicle && Art.painter('vehicle', type)) for (let d = 0; d < 8; d++) q.push(['vehicle', type, d, 'ok']);
  }
  // the most common views first: every type's idle/walk before anyone's death animation
  const maxPoses = Math.max(0, ...specs.map((s) => s.poses?.length || 0));
  for (let i = 0; i < maxPoses; i++) {
    for (const { type, poses } of specs) {
      if (!poses?.[i] || !Art.painter('unit', type)) continue;
      const [pose, frames] = poses[i];
      for (let f = 0; f < frames; f++) for (let d = 0; d < 8; d++) q.push(['unit', type, pose, d, f]);
    }
  }
  return q;
}
/** Render queued frames until `budgetMs` is spent. */
export function warmStep(q, budgetMs) {
  const t0 = performance.now();
  while (q.length && performance.now() - t0 < budgetMs) {
    const j = q.shift();
    if (j[0] === 'vehicle') { if (Art.painter('vehicle', j[1])) vehicleSprite(j[1], j[2], j[3]); }
    else if (Art.painter('unit', j[1])) unitSprite(j[1], j[2], j[3], j[4]);
  }
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
