// @ts-check
/**
 * Painting kit for the illustrated cutscenes: skies, clouds, forests, water, reeds, and the two cel-shading
 * tricks everything uses — a rim light (the edge of a shape facing the light) and a crescent shadow (the part of a
 * shape not covered by itself moved towards the light).
 */
import { subtract, shift } from '../../render/ink.js';

export const INK = '#140C12';
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

/** Draw in screen pixels whatever the current transform. */
export function screen(k, fn) { k.save(); k.m = [1, 0, 0, 1, 0, 0]; fn(); k.restore(); }

/** A dithered vertical gradient band across the frame. */
export function vgrad(k, y0, y1, stops) { screen(k, () => k.rect(-2, y0, k.w + 4, y1 - y0, { fill: { grad: stops, from: [0, y0], to: [0, y1] } })); }

/** The edge of a mask that faces direction (dx, dy): a rim light / sun edge. */
export function rim(k, m, dx, dy, color) { k.paint(subtract(m, shift(m, -dx, -dy)), color); }
/** The side of a mask facing away from (dx, dy) by d pixels: a cel shadow that follows the shape. */
export function crescent(k, m, dx, dy, color) { k.paint(subtract(m, shift(m, dx, dy)), color); }

/** Outline of a cumulus: a flattish base and scalloped top (local units). */
export function cloudPts(cx, cy, w, h, seed, bumps = 5) {
  const R = rng(seed), B = [];
  for (let i = 0; i < bumps; i++) {
    B.push({ c: (i + 0.5) / bumps + (R() - 0.5) * 0.1, r: (0.6 + R() * 0.55) / bumps, hh: h * (0.4 + R() * 0.6) * (0.45 + 0.55 * Math.sin((Math.PI * (i + 0.5)) / bumps)) });
  }
  const top = (u) => { let v = 0; for (const b of B) { const d = (u - b.c) / b.r; if (Math.abs(d) < 1) v = Math.max(v, b.hh * Math.sqrt(1 - d * d)); } return v; };
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push([cx - w / 2 + (w * i) / 8, cy + Math.sin(i * 1.7 + seed) * h * 0.05]);
  for (let i = 40; i >= 0; i--) { const u = i / 40; pts.push([cx - w / 2 + w * u, cy - Math.max(h * 0.1, top(u))]); }
  return pts;
}
/** A long thin evening cloud streak, tapered at both ends. */
export function streakPts(cx, cy, w, h, seed) {
  const R = rng(seed), top = [], bot = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12, taper = Math.sin(u * Math.PI) ** 0.7;
    top.push([cx - w / 2 + w * u, cy - h * taper * (0.6 + R() * 0.5)]);
    bot.push([cx - w / 2 + w * u, cy + h * 0.35 * taper]);
  }
  return [...bot, ...top.reverse()];
}
/**
 * A cloud lit from one side: cols = [lit edge, mid, shadowed body …]; each band is the cloud moved away from the
 * light by `step` more, so the bands hug the shape.
 */
export function cloud(k, pts, cols, step = [0, -3]) {
  const m = k.shape(pts, { fill: cols[0] });
  k.save(); k.clip(m);
  for (let i = 1; i < cols.length; i++) { k.save(); k.translate(step[0] * i, step[1] * i); k.shape(pts, { fill: cols[i] }); k.restore(); }
  k.restore();
  return m;
}

/** A row of pines as one jagged silhouette (local units); returns the mask. */
export function pines(k, x0, x1, base, hmin, hmax, fill, seed, o = {}) {
  const R = rng(seed), pts = [[x1 + 10, base + (o.depth ?? 40), 1], [x0 - 10, base + (o.depth ?? 40), 1]];
  let x = x0 - 10;
  while (x < x1 + 10) {
    const hh = hmin + R() * (hmax - hmin), w = hh * (0.34 + R() * 0.12), tiers = 3 + Math.floor(R() * 3);
    const lx = x, cx = x + w / 2, rx = x + w;
    pts.push([lx, base - hh * 0.08 + R() * 3, 1]);
    for (let j = 1; j < tiers; j++) { const f = j / tiers, y = base - hh * f; pts.push([lx + (w / 2) * f + w * 0.1, y + 2, 1], [lx + (w / 2) * f - w * 0.02, y - 1, 1]); }
    pts.push([cx, base - hh, 1]);
    for (let j = tiers - 1; j >= 1; j--) { const f = j / tiers, y = base - hh * f; pts.push([rx - (w / 2) * f + w * 0.02, y - 1, 1], [rx - (w / 2) * f - w * 0.1, y + 2, 1]); }
    pts.push([rx, base - hh * 0.08 + R() * 3, 1]);
    x += w * (0.55 + R() * 0.5);
  }
  return k.shape(pts, { fill, smooth: false, line: o.line, lw: o.lw, paint: o.paint });
}

/** Reeds and grass blades: tapered strokes leaning with the wind. */
export function reeds(k, x0, x1, base, hmin, hmax, cols, seed, lean = 0, n = 30) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * (x1 - x0), hh = hmin + R() * (hmax - hmin), bend = lean + (R() - 0.5) * 10, w = 1.5 + R() * 2.5;
    k.stroke([[x, base], [x + bend * 0.3, base - hh * 0.5], [x + bend, base - hh]], [w, w * 0.6, 0.6], cols[Math.floor(R() * cols.length)]);
    if (R() < 0.25) { const tx = x + bend, ty = base - hh; k.ellipse(tx, ty + 4, 1.6, 5, bend * 0.02, { fill: cols[0] }); }
  }
}

/**
 * A forest skyline: a rolling ridge with pines of all sizes standing on it, as one silhouette (local units).
 * o: hmin, hmax (tree heights), step (spacing), hill (ridge height), fill, paint, line, lw. Returns the mask.
 */
export function forest(k, x0, x1, base, seed, o = {}) {
  const R = rng(seed), hmin = o.hmin ?? 8, hmax = o.hmax ?? 30, step = o.step ?? 6, hill = o.hill ?? 8;
  const n = Math.ceil(x1 - x0) + 1, H = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = x0 + i; H[i] = hill * (0.55 + 0.3 * Math.sin(x * 0.011 + seed) + 0.15 * Math.sin(x * 0.037 + seed * 2)); }
  for (let x = x0 + R() * step; x < x1; x += step * (0.5 + R())) {
    const cluster = 0.55 + 0.45 * Math.sin(x * 0.02 + seed * 3);
    const th = hmin + (hmax - hmin) * cluster * (0.3 + R() * 0.7), round = R() < (o.leafy ?? 0.3);
    const w = round ? th * (0.7 + R() * 0.4) : th * (0.34 + R() * 0.12), tiers = 3 + Math.floor(R() * 3);
    const cx = x - x0, baseH = H[Math.max(0, Math.min(n - 1, Math.round(cx)))];
    for (let dx = -Math.ceil(w / 2); dx <= Math.ceil(w / 2); dx++) {
      const i = Math.round(cx + dx);
      if (i < 0 || i >= n) continue;
      const f = 1 - Math.abs(dx) / (w / 2);
      if (f <= 0) continue;
      // pines are notched cones; broadleaf trees are round crowns
      const hgt = round ? th * 0.8 * Math.sqrt(f * (2 - f)) : th * Math.max(0, f - ((f * tiers) % 1) * 0.12) + (dx === 0 ? 1.5 : 0);
      H[i] = Math.max(H[i], baseH * 0.8 + hgt);
    }
  }
  const pts = [[x1, base + (o.depth ?? 40), 1], [x0, base + (o.depth ?? 40), 1]];
  for (let i = 0; i < n; i++) pts.push([x0 + i, base - H[i], 1]);
  return k.shape(pts, { fill: o.fill, smooth: false, line: o.line, lw: o.lw, paint: o.paint });
}

/** A soft glow: colour mixed in with a radial falloff (dithered steps). */
export function glow(k, cx, cy, rx, ry, color, strength = 0.5) {
  const m = k.ellipse(cx, cy, rx, ry, 0, { paint: false });
  const c = k.T([cx, cy]), sx = rx * k.k, sy = ry * k.k;
  k.tint(m, color, (X, Y) => { const d = Math.hypot((X + 0.5 - c[0]) / sx, (Y + 0.5 - c[1]) / sy); return strength * Math.max(0, 1 - d) ** 1.4; });
}
