// @ts-check
/**
 * Intro: the night they came. Over the Varna, NOT pods fall like meteors — lime heads, violet tails — and burst
 * on the far bank; the glow lights the undersides of the clouds and the river, smoke climbs from the tree line.
 * From the near bank: a lone signpost, reeds, a fence.
 */
import { INK, rng, cloud, streakPts, forest, reeds, glow, clamp01 } from './paint.js';

/** meteors: [start time, from x, from y, to x (impact), size] */
const FALL = [[0.2, 520, -30, 330, 1], [0.8, 470, -40, 190, 0.8], [1.3, 560, 10, 408, 1.3], [1.9, 500, -50, 250, 0.9], [2.4, 440, -30, 140, 0.7], [2.9, 540, -20, 300, 1.1], [3.5, 480, -40, 370, 0.8], [4.1, 530, -30, 220, 1], [4.6, 460, -50, 120, 0.7], [5.2, 560, -10, 440, 0.9], [5.9, 500, -40, 280, 1.2], [6.6, 470, -30, 170, 0.8]];
const TRAVEL = 1.1, HORIZON = 168;

export function meteorShot(k, t, st) {
  const R = rng(9);
  // --- the night sky, warmed from below by the burning bank
  const heat = clamp01(t / 4);
  k.rect(-60, -10, 600, 190, { fill: { grad: [[0, '#05060F'], [0.45, '#10122A'], [0.8, '#241E46'], [1, heat > 0.3 ? '#4A2A5E' : '#2E2848']], from: [0, 0], to: [0, HORIZON * k.h / 270] } });
  for (let i = 0; i < 120; i++) { const x = R() * 480, y = R() * 150, tw = Math.sin(t * 3 + i) > 0.6; k.rect(Math.round(x), Math.round(y), 1, 1, { fill: tw ? '#FFFFFF' : i % 3 ? '#8A90C0' : '#C8CCF0' }); }
  // the moon, half hidden
  glow(k, 96, 58, 40, 40, '#9AA6D8', 0.25);
  k.ellipse(96, 58, 13, 13, 0, { fill: '#E8ECF8' });
  k.ellipse(102, 54, 12, 12, 0, { fill: '#10122A' });
  // clouds, lit violet underneath by the fire
  const d = t * 1.5;
  cloud(k, streakPts(150 + d, 96, 300, 12, 3), ['#6A3E7A', '#3A2A56', '#1E1A38'], [0, -3]);
  cloud(k, streakPts(380 + d, 70, 260, 10, 8), ['#7A4A86', '#3E2E5C', '#1C1834'], [0, -3]);
  cloud(k, streakPts(300 + d * 0.7, 132, 360, 9, 13), ['#A0588A', '#58386A', '#2A2244'], [0, -2]);
  // --- the far bank: impact glows behind the trees, then the tree line, smoke
  for (const [s0, , , ix, sz] of FALL) {
    const q = t - s0 - TRAVEL;
    if (q < 0) continue;
    glow(k, ix, HORIZON - 4, 70 * sz, 40 * sz, q < 0.3 ? '#F4FFC0' : '#A6F03C', q < 0.3 ? 0.9 : Math.max(0.3, 0.65 - q * 0.06));
    // fires: flickering tongues of lime and orange climbing over the tree line
    for (let i = 0; i < 7; i++) { const fx = ix + (i - 3) * 6 * sz, fh = (10 + Math.abs(Math.sin(t * 7 + i * 1.7 + ix)) * 14) * sz * Math.min(1, q * 2); k.stroke([[fx, HORIZON + 2], [fx + Math.sin(t * 5 + i) * 2, HORIZON - fh * 0.6], [fx + Math.sin(t * 4 + i) * 3, HORIZON - fh]], [4 * sz, 3 * sz, 0.5], i % 2 ? '#C6FF5A' : '#FFB23A'); }
  }
  forest(k, -40, 520, HORIZON, 17, { fill: '#0C0A18', hmin: 8, hmax: 28, hill: 8, step: 6, leafy: 0.4 });
  for (const [s0, , , ix, sz] of FALL) {
    const q = t - s0 - TRAVEL;
    if (q < 0.2) continue;
    for (let i = 0; i < 8; i++) { const u = ((q * 0.18 + i / 8) % 1), sx = ix + Math.sin(u * 5 + ix) * 5 + u * 26, sy = HORIZON - 10 - u * 90 * sz; k.tint(k.ellipse(sx, sy, (3 + u * 10) * sz, (2 + u * 6) * sz, 0, { paint: false }), '#2A2236', 0.6 * (1 - u)); }
  }
  // --- the river: the fire and the falling lights in it
  k.rect(-60, HORIZON, 600, 110, { fill: { grad: [[0, '#2A1E42'], [0.4, '#141430'], [1, '#080A18']], from: [0, HORIZON * k.h / 270], to: [0, k.h] } });
  for (const [s0, , , ix, sz] of FALL) {
    const q = t - s0 - TRAVEL;
    if (q < 0) continue;
    for (let i = 0; i < 10; i++) { const y = HORIZON + 3 + i * i * 0.5, len = (6 + i * 2) * sz; k.stroke([[ix - len / 2 + Math.sin(t * 3 + i) * 3, y], [ix + len / 2 + Math.sin(t * 3 + i) * 3, y]], 1, i < 4 ? '#C6FF5A' : '#6A8A3A'); }
  }
  for (let i = 0; i < 40; i++) { const y = HORIZON + 6 + R() * 90, x = ((R() * 560 + t * 5) % 580) - 40; k.stroke([[x, y], [x + 4 + (y - HORIZON) * 0.1, y]], 1, '#2A2A52'); }
  // --- the meteors themselves: a white-lime head, a tapering violet tail, a flash and a ring on impact
  let shake = 0;
  for (const [s0, fx, fy, ix, sz] of FALL) {
    const p = (t - s0) / TRAVEL;
    if (p < 0) continue;
    if (p < 1) {
      const x = fx + (ix - fx) * p, y = fy + (HORIZON - 6 - fy) * p * p;
      const tx = fx + (ix - fx) * Math.max(0, p - 0.35), ty = fy + (HORIZON - 6 - fy) * Math.max(0, p - 0.35) ** 2;
      k.stroke([[tx, ty], [(tx + x) / 2, (ty + y) / 2], [x, y]], [0.5, 5 * sz, 8 * sz], '#6A36BA');
      k.stroke([[tx + (x - tx) * 0.4, ty + (y - ty) * 0.4], [x, y]], [0.5, 5 * sz], '#A6F03C');
      glow(k, x, y, 16 * sz, 16 * sz, '#E4FF6A', 0.7);
      k.ellipse(x, y, 3.5 * sz, 3.5 * sz, 0, { fill: '#FFFFFF' });
    } else {
      const q = t - s0 - TRAVEL;
      if (q < 0.6) {
        const r = 8 + q * 90;
        k.stroke([[ix - r, HORIZON - 6], [ix - r * 0.7, HORIZON - 6 - r * 0.35], [ix, HORIZON - 6 - r * 0.5], [ix + r * 0.7, HORIZON - 6 - r * 0.35], [ix + r, HORIZON - 6]], [1, 2.5 * (1 - q / 0.6) + 0.5, 1], '#F4FFC0');
        if (q < 0.25) shake = Math.max(shake, 2.2 * sz);
      }
    }
  }
  // --- the near bank in silhouette: grass, reeds, a fence, a signpost — someone's quiet little country
  const bank = k.shape([[-40, 236], [80, 222], [200, 228], [300, 220], [420, 226], [540, 218], [540, 290], [-40, 290]], { fill: '#06070C' });
  void bank;
  reeds(k, -20, 180, 236, 20, 60, ['#06070C', '#0A0B14'], 3, 6, 28);
  reeds(k, 330, 500, 230, 20, 70, ['#06070C', '#0A0B14'], 5, -4, 26);
  for (let i = 0; i < 5; i++) { const x = 200 + i * 26; k.stroke([[x, 232], [x + 1, 208]], 3, '#06070C'); }
  k.stroke([[196, 214], [310, 212]], 2, '#06070C'); k.stroke([[196, 222], [310, 220]], 2, '#06070C');
  k.stroke([[392, 230], [390, 186]], 3, '#06070C');
  k.shape([[372, 188, 1], [424, 184, 1], [428, 196, 1], [374, 200, 1]], { fill: '#0A0B12', line: INK, lw: 1, smooth: false });
  k.stroke([[380, 192], [420, 190]], 1, '#3A3A5A');                                       // (the sign: VARNA 2 km)
  st.shake = shake;
  return st;
}
