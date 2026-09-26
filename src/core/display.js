// @ts-check
import { BALANCE } from '../config/balance.js';

/**
 * Integer-scaled pixel display (SPEC §3). The canvas backing store is the logical
 * resolution; CSS scales it by an integer number of *device* pixels.
 * Logical size flexes (400–560 × 240–300) so phones aren't heavily letterboxed —
 * see DECISIONS.md.
 */
export class Display {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { alpha: false }));
    this.W = 480; this.H = 270; this.scale = 1; this.dpr = 1;
    this.cssLeft = 0; this.cssTop = 0; this.cssW = 480; this.cssH = 270;
    this.cssPerPx = 1;
    this.safe = { l: 0, r: 0, t: 0, b: 0 };
    this.listeners = [];
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    window.visualViewport?.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', () => setTimeout(this.resize, 200));
    this.resize();
  }
  onResize(fn) { this.listeners.push(fn); }
  resize() {
    const vv = window.visualViewport;
    const cssW = vv ? vv.width : window.innerWidth;
    const cssH = vv ? vv.height : window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const L = computeLayout(cssW, cssH, dpr);
    this.W = L.W; this.H = L.H; this.scale = L.scale; this.dpr = dpr;
    this.cssW = L.cssW; this.cssH = L.cssH; this.cssLeft = L.left; this.cssTop = L.top;
    this.cssPerPx = L.cssW / L.W;
    // safe-area insets (notch / Dynamic Island / home indicator) → logical px inside the canvas
    const probe = document.getElementById('safe');
    let sl = 0, sr = 0, st = 0, sb = 0;
    if (probe) {
      const cs = getComputedStyle(probe);
      sl = parseFloat(cs.paddingLeft) || 0; sr = parseFloat(cs.paddingRight) || 0;
      st = parseFloat(cs.paddingTop) || 0; sb = parseFloat(cs.paddingBottom) || 0;
    }
    // fallback for notched phones in browsers that report no insets: keep ~32 CSS px off the long edges
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    if (coarse && cssW / cssH >= 2.0) { sl = Math.max(sl, 32); sr = Math.max(sr, 32); sb = Math.max(sb, 12); }
    const k = 1 / this.cssPerPx;
    this.safe = {
      l: Math.ceil(Math.max(0, sl - L.left) * k), r: Math.ceil(Math.max(0, sr - (cssW - L.left - L.cssW)) * k),
      t: Math.ceil(Math.max(0, st - L.top) * k), b: Math.ceil(Math.max(0, sb - (cssH - L.top - L.cssH)) * k),
    };
    const c = this.canvas;
    if (c.width !== L.W || c.height !== L.H) { c.width = L.W; c.height = L.H; }
    c.style.width = L.cssW + 'px';
    c.style.height = L.cssH + 'px';
    c.style.left = L.left + 'px';
    c.style.top = L.top + 'px';
    this.ctx.imageSmoothingEnabled = false;
    for (const fn of this.listeners) fn(this);
  }
  /** Minimum HUD button size in logical px so it is ≥ 44 CSS px. */
  get buttonSize() {
    const need = Math.ceil(BALANCE.display.minButtonCss / this.cssPerPx);
    return Math.max(30, Math.min(44, need));
  }
  /** Convert client (CSS) coords → logical px */
  toLogical(clientX, clientY) {
    return {
      x: (clientX - this.cssLeft) / this.cssW * this.W,
      y: (clientY - this.cssTop) / this.cssH * this.H,
    };
  }
}

/** Pure layout computation (unit-testable). */
export function computeLayout(cssW, cssH, dpr) {
  const D = BALANCE.display;
  const devW = Math.round(cssW * dpr), devH = Math.round(cssH * dpr);
  let best = 0, bestCost = Infinity;
  for (let s = 1; s <= 12; s++) {
    const lw = devW / s, lh = devH / s;
    if (lw < D.minW || lh < D.minH) break;
    const cost = Math.abs(lh - D.baseH) + (lh > D.maxH ? (lh - D.maxH) * 0.5 : 0);
    if (cost < bestCost) { bestCost = cost; best = s; }
  }
  let W, H, scale, cssOutW, cssOutH;
  if (best === 0) {
    // Tiny window: fall back to non-integer downscale of the base resolution.
    W = D.baseW; H = D.baseH;
    const f = Math.min(cssW / W, cssH / H);
    cssOutW = W * f; cssOutH = H * f; scale = f * dpr;
  } else {
    scale = best;
    W = Math.min(D.maxW, Math.floor(devW / scale));
    H = Math.min(D.maxH, Math.floor(devH / scale));
    cssOutW = (W * scale) / dpr; cssOutH = (H * scale) / dpr;
  }
  const left = Math.floor(((cssW - cssOutW) / 2) * dpr) / dpr;
  const top = Math.floor(((cssH - cssOutH) / 2) * dpr) / dpr;
  return { W, H, scale, cssW: cssOutW, cssH: cssOutH, left, top };
}
