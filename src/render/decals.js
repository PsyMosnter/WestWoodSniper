// @ts-check
import { TILE } from '../core/camera.js';
import { hash2 } from '../core/rng.js';

/**
 * Ground decals (SPEC §4.3): baked into terrain chunks (blood pools, craters, scorch, rubble)
 * or drawn per frame when they fade (snow tracks).
 */

/** Blood pool / splat in the unit's colours (never red). */
export function bloodDecal(xT, yT, blood, size = 1, seed = 0) {
  const x = xT * TILE, y = yT * TILE;
  const r = 5 * size;
  return {
    x, y, r: r + 2,
    draw(ctx) {
      const n = Math.round(10 * size);
      for (let i = 0; i < n; i++) {
        const a = hash2(i, seed, 1) * Math.PI * 2, d = hash2(i, seed, 2) * r;
        const px = Math.round(x + Math.cos(a) * d), py = Math.round(y + Math.sin(a) * d * 0.6);
        const s = hash2(i, seed, 3) < 0.4 ? 2 : 1;
        ctx.fillStyle = hash2(i, seed, 4) < 0.25 ? blood.hi : hash2(i, seed, 5) < 0.6 ? blood.main : blood.shade;
        ctx.fillRect(px, py, s, s);
      }
      ctx.fillStyle = blood.shade;
      ctx.fillRect(Math.round(x - 2 * size), Math.round(y - 1), Math.round(4 * size), 2);
      ctx.fillStyle = blood.main;
      ctx.fillRect(Math.round(x - 1 * size), Math.round(y - 1), Math.round(3 * size), 1);
    },
  };
}

/** Single droplet landing (from particles). */
export function dropDecal(xPx, yPx, col) {
  return { x: xPx, y: yPx, r: 1, draw(ctx) { ctx.fillStyle = col; ctx.fillRect(Math.round(xPx), Math.round(yPx), 1, 1); } };
}

/**
 * Explosion crater: a round bowl — a lit rim (light from the upper left), a shadowed inside with a darker floor,
 * then a ragged ring of ejecta and scorch streaks thinning out to the edge. Pixel by pixel, drawn once into
 * the terrain chunk.
 */
export function craterDecal(xT, yT, radiusT, seed = 0) {
  const x = xT * TILE, y = yT * TILE, R = radiusT * TILE;
  return {
    x, y, r: R + 2,
    draw(ctx) {
      const bowl = 0.42, rim = 0.56, sq = 0.78;               // (squashed a little: the map's 3/4 view)
      for (let py = -R; py <= R; py++) for (let px = -R; px <= R; px++) {
        const a = Math.atan2(py / sq, px);
        const wob = 1 + (hash2(Math.floor((a + Math.PI) * 5), seed, 21) - 0.5) * 0.18;   // not a perfect circle
        const d = Math.hypot(px, py / sq) / (R * wob);
        if (d > 1) continue;
        const n = hash2(px + 999, py + 999, seed), lit = (-px - py) / R;   // lit towards the upper left
        let col = null;
        if (d < bowl) {
          // inside: the far (lower-right) wall catches the light, the near wall is in shade; a dark floor
          const k = d / bowl, face = (px + py) / R;
          col = k < 0.45 ? (n < 0.5 ? '#141110' : '#1C1715') : face > 0.05 ? (n < 0.6 ? '#4A3C32' : '#3A2F28') : (n < 0.6 ? '#221C18' : '#2C241F');
        } else if (d < rim) {
          col = lit > 0.1 ? (n < 0.55 ? '#7A6650' : '#6A5846') : lit < -0.1 ? (n < 0.6 ? '#3A2F28' : '#302722') : '#54463A';
        } else {
          // ejecta and scorch: denser near the rim, in radial streaks
          const streak = hash2(Math.floor((a + Math.PI) * 9), seed, 22) > 0.55 ? 0.35 : 0;
          const p = (1 - (d - rim) / (1 - rim)) * 0.8 + streak;
          if (n < p * 0.55) col = n < p * 0.2 ? 'rgba(20,16,14,0.8)' : hash2(px, py, seed + 7) < 0.3 ? 'rgba(110,92,72,0.7)' : 'rgba(34,28,24,0.55)';
        }
        if (col) { ctx.fillStyle = col; ctx.fillRect(Math.round(x + px), Math.round(y + py), 1, 1); }
      }
    },
  };
}
