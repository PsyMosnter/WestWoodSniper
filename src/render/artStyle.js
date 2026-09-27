// @ts-check
/**
 * Art style switch (playtest feedback): the original sprites are kept as "Classic". Redesigns register here
 * per style, kind and type, and are drawn only while their style is on — sprite by sprite, falling back to
 * the previous style wherever a redesign doesn't exist (Chibi → Newest → New → Classic), so switching back is
 * always one setting away. Settings → ART STYLE, or ?art=classic|new|newest|chibi for a quick comparison.
 *
 * Styles:
 *  - classic — the original palette-grid sprites.
 *  - new     — ray-cast 3D models (src/render/spriteData/newInfantry.js, newVehicles.js).
 *  - newest  — 1990s-RTS look (playtest 2 art pass): ~11 px pixel infantry with 8 facings, 6-frame walks and
 *              12-frame deaths (src/render/spriteData/rtsInfantry.js); New vehicles through the RTS filter
 *              (rtsVehicles.js).
 *  - chibi   — detailed anime-chibi infantry (big heads, cel shading, WREN's glasses gleam) ray-cast from 3D
 *              models (src/render/spriteData/chibiInfantry.js); vehicles as in Newest.
 * Every style but Classic draws explosions as fireballs with ballistic debris (src/render/rtsBlast.js).
 *
 * Kinds: 'unit' (map infantry: (pose, dir, frame, variant) → Sprite), 'vehicle' ((dir, state) → Sprite),
 * 'scopeUnit' / 'scopeVehicle' ((view) → scope sprite with hit zones).
 */
/** @typedef {'unit'|'vehicle'|'scopeUnit'|'scopeVehicle'} ArtKind */

const mk = () => ({ unit: new Map(), vehicle: new Map(), scopeUnit: new Map(), scopeVehicle: new Map() });
const REG = { new: mk(), newest: mk(), chibi: mk() };
/** where each style looks for a painter, in order (anything not found falls back to Classic) */
const CHAIN = { classic: [], new: ['new'], newest: ['newest', 'new'], chibi: ['chibi', 'newest', 'new'] };
const listeners = [];

export const ART_STYLES = ['classic', 'new', 'newest', 'chibi'];
/** frames per animation cycle in each style (the pose code asks, so Classic keeps its 4-frame cycles) */
const FRAMES = {
  classic: { walk: 4, run: 4, pistol: 4, crawl: 4, dead: 4, deadStep: 0.12 },
  new: { walk: 4, run: 4, pistol: 4, crawl: 4, dead: 4, deadStep: 0.12 },
  newest: { walk: 6, run: 6, pistol: 6, crawl: 4, dead: 12, deadStep: 0.09 },
  chibi: { walk: 6, run: 6, pistol: 6, crawl: 4, dead: 12, deadStep: 0.09 },
};

export const Art = {
  style: 'classic',
  /** @param {string} s */
  setStyle(s) {
    const next = ART_STYLES.includes(s) ? s : 'classic';
    if (next === this.style) return;
    this.style = next;
    for (const f of listeners) f(next);
  },
  /** @param {(style: string) => void} f */
  onChange(f) { listeners.push(f); },
  /**
   * The painter for a sprite in the current style (along its fallback chain), or null when Classic is drawn.
   * @param {ArtKind} kind @param {string} type
   */
  painter(kind, type) {
    for (const st of CHAIN[this.style]) { const p = REG[st][kind].get(type); if (p) return p; }
    return null;
  },
  /** Which registry supplied the painter (for cache keys): 'chibi' | 'newest' | 'new' | '' */
  source(kind, type) {
    for (const st of CHAIN[this.style]) if (REG[st][kind].has(type)) return st;
    return '';
  },
  /** Register a New-style painter. @param {ArtKind} kind @param {string} type @param {Function} painter */
  register(kind, type, painter) { REG.new[kind].set(type, painter); },
  /** Register a Newest-style painter. @param {ArtKind} kind @param {string} type @param {Function} painter */
  registerNewest(kind, type, painter) { REG.newest[kind].set(type, painter); },
  /** Register a Chibi-style painter. @param {ArtKind} kind @param {string} type @param {Function} painter */
  registerChibi(kind, type, painter) { REG.chibi[kind].set(type, painter); },
  /** The New painter for a sprite regardless of the current style (Newest wraps New vehicles). */
  newPainter(kind, type) { return REG.new[kind].get(type) || null; },
  /** How many sprites have a New (or, with 'newest', a Newest) design — for the settings screen. */
  count(style = 'new') { return Object.values(REG[style] || REG.new).reduce((n, m) => n + m.size, 0); },
  /** frames in a cycle of `pose` in the current style */
  frames(pose) { return FRAMES[this.style][pose] ?? 4; },
  /** seconds per death-animation frame in the current style */
  get deadStep() { return FRAMES[this.style].deadStep; },
};
