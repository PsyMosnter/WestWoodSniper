// @ts-check
/**
 * Art style switch (playtest feedback): today's sprites are kept as "Classic" and stay the default.
 * Redesigned sprites ("New") register here per kind and type, and are drawn only while the New style
 * is on — sprite by sprite, falling back to Classic wherever no new design exists yet, so switching
 * back is always one setting away. Settings → ART STYLE, or ?art=classic|new for a quick comparison.
 *
 * Kinds: 'unit' (map infantry: (pose, dir, frame, variant) → Sprite), 'vehicle' ((dir, state) → Sprite),
 * 'scopeUnit' / 'scopeVehicle' ((view) → scope sprite with hit zones).
 */
/** @typedef {'unit'|'vehicle'|'scopeUnit'|'scopeVehicle'} ArtKind */

const NEW = { unit: new Map(), vehicle: new Map(), scopeUnit: new Map(), scopeVehicle: new Map() };
const listeners = [];

export const ART_STYLES = ['classic', 'new'];

export const Art = {
  style: 'classic',
  /** @param {string} s */
  setStyle(s) {
    const next = s === 'new' ? 'new' : 'classic';
    if (next === this.style) return;
    this.style = next;
    for (const f of listeners) f(next);
  },
  /** @param {(style: string) => void} f */
  onChange(f) { listeners.push(f); },
  /**
   * The New-style painter for a sprite, or null when Classic should be drawn.
   * @param {ArtKind} kind @param {string} type
   */
  painter(kind, type) { return this.style === 'new' ? NEW[kind].get(type) || null : null; },
  /** @param {ArtKind} kind @param {string} type @param {Function} painter */
  register(kind, type, painter) { NEW[kind].set(type, painter); },
  /** How many sprites have a New design (for the settings screen). */
  count() { return Object.values(NEW).reduce((n, m) => n + m.size, 0); },
};
