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

/** Explosion crater + scorch ring. */
export function craterDecal(xT, yT, radiusT, seed = 0) {
  const x = xT * TILE, y = yT * TILE, R = radiusT * TILE;
  return {
    x, y, r: R + 2,
    draw(ctx) {
      for (let i = 0; i < 90 * radiusT; i++) {
        const a = hash2(i, seed, 11) * Math.PI * 2, d = Math.sqrt(hash2(i, seed, 12)) * R;
        const px = Math.round(x + Math.cos(a) * d), py = Math.round(y + Math.sin(a) * d * 0.75);
        ctx.fillStyle = d < R * 0.35 ? '#1A1614' : d < R * 0.7 ? 'rgba(30,24,20,0.7)' : 'rgba(30,24,20,0.35)';
        ctx.fillRect(px, py, 2, 2);
      }
      ctx.fillStyle = '#0E0C0A';
      ctx.fillRect(Math.round(x - R * 0.2), Math.round(y - R * 0.12), Math.max(2, Math.round(R * 0.4)), Math.max(1, Math.round(R * 0.24)));
    },
  };
}
