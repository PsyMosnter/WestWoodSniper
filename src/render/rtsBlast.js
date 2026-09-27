// @ts-check
/**
 * Art style "Newest" — explosions (playtest 2 art pass, approved in tools/art-lab): a cluster of fire puffs (each
 * a hot core inside a cooler rim, cooling white → yellow → orange → red-brown, then smoke that rises and thins by
 * dithering), a dust ring, a scorch, and chunks thrown on ballistic arcs that tumble, bounce once, settle, and
 * sometimes keep smoking. Deterministic per seed. Vehicle blasts throw gunmetal and violet scraps; building blasts
 * more, heavier grey and tan chunks. All sizes scale with `k` (≈ blast radius in tiles / 1.6).
 */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const FIRE = ['#FFFBE0', '#FFE27A', '#FFB23A', '#EE7422', '#B8421A', '#6E2A16'];
const SMOKE = ['#6A625C', '#4E4844', '#36322F'];
const G = 240;                                            // px/s² — debris gravity
/** how long a blast is drawn, seconds */
export const BLAST_LIFE = 3.4;

const dark = (c, f) => { const n = parseInt(c.slice(1), 16); const ch = (s) => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, '0'); return '#' + ch(16) + ch(8) + ch(0); };

/**
 * @param {'vehicle'|'building'} kind
 * @param {number} seed
 * @param {number} k  size factor
 * @returns {(g: CanvasRenderingContext2D, x: number, y: number, t: number) => void}  draws at (x, y) in sprite pixels
 */
export function createBlast(kind, seed = 3, k = 1) {
  let s = (seed % 2147483646) + 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const big = kind === 'building';
  const debrisCols = big ? ['#8D96A0', '#5E6670', '#9A8A6A', '#353B42'] : ['#8D96A0', '#6A33B3', '#5E6670', '#C4CCD4'];
  const sq = Math.sqrt(k);
  const chunks = Array.from({ length: Math.round((big ? 20 : 12) * Math.min(2, sq)) }, () => {
    const a = rnd() * Math.PI * 2, sp = ((big ? 22 : 28) + rnd() * 34) * sq;
    return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: (70 + rnd() * (big ? 90 : 110)) * Math.min(1.4, sq), size: 1 + Math.floor(rnd() * (big ? 3 : 2.2)), col: debrisCols[Math.floor(rnd() * debrisCols.length)], spin: 6 + rnd() * 10, smoke: rnd() < 0.45 };
  });
  const nP = Math.round((big ? 16 : 10) * Math.min(2, sq));
  const puffs = Array.from({ length: nP }, (_, i) => ({
    dx: (rnd() - 0.5) * (big ? 26 : 16) * k, dy: (rnd() - 0.5) * (big ? 10 : 6) * k, r: ((big ? 4 : 3) + rnd() * (big ? 5 : 3.5)) * sq,
    t0: (i / nP) * (big ? 0.45 : 0.3), life: (big ? 1.4 : 1.1) + rnd() * 0.6, rise: ((big ? 20 : 14) + rnd() * 12) * sq,
  }));
  return (g, x, y, t) => {
    x = Math.round(x); y = Math.round(y);
    // scorch
    if (t > 0.05) {
      const rx = Math.round((big ? 16 : 10) * k), ry = Math.max(2, Math.round((big ? 7 : 4) * k));
      g.fillStyle = 'rgba(20,14,10,0.45)';
      for (let yy = -ry; yy <= ry; yy++) { const w = Math.round(rx * Math.sqrt(1 - (yy * yy) / (ry * ry))); g.fillRect(x - w, y + yy, 2 * w + 1, 1); }
    }
    // dust ring
    if (t < 0.6) {
      const R = (4 + t * (big ? 70 : 50)) * k;
      g.globalAlpha = 1 - t / 0.6; g.fillStyle = '#E2CFA2';
      for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; g.fillRect(Math.round(x + Math.cos(a) * R), Math.round(y + Math.sin(a) * R * 0.45), 2, 1); }
      g.globalAlpha = 1;
    }
    // debris: ballistic arcs over the ground, one bounce, then settled (drawn before the fire)
    for (const c of chunks) {
      let z = 0, tt = t, gx = 0, gy = 0, bounce = 0;
      const t1 = (2 * c.vz) / G;
      if (tt < t1) { z = c.vz * tt - 0.5 * G * tt * tt; gx = c.vx * tt; gy = c.vy * tt; }
      else {
        gx = c.vx * t1; gy = c.vy * t1; tt -= t1;
        const v2 = c.vz * 0.3, t2 = (2 * v2) / G;
        if (tt < t2) { z = v2 * tt - 0.5 * G * tt * tt; gx += c.vx * 0.35 * tt; gy += c.vy * 0.35 * tt; bounce = 1; }
        else { gx += c.vx * 0.35 * t2; gy += c.vy * 0.35 * t2; bounce = 2; }
      }
      const X = Math.round(x + gx), Y = Math.round(y + gy), Zh = Math.round(z);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(X, Y, c.size, 1);                       // its shadow on the ground
      const ph = bounce < 2 ? Math.floor(t * c.spin) % 3 : 0;                             // tumbling: wide → square → tall
      const w = ph === 0 ? c.size + 1 : ph === 1 ? c.size : Math.max(1, c.size - 1), h = ph === 2 ? c.size + 1 : ph === 1 ? c.size : Math.max(1, c.size - 1);
      g.fillStyle = '#141210'; g.fillRect(X + 1, Y - Zh + 1, w, h);                        // dark lower-right edge
      g.fillStyle = bounce === 2 ? dark(c.col, 0.6) : c.col; g.fillRect(X, Y - Zh, w, h);
      if (bounce < 2 && t < 0.6) { g.fillStyle = '#FFE27A'; g.fillRect(X, Y - Zh, 1, 1); }  // still glowing
      if (c.smoke && t < 3) {                                                                // a smoking scrap
        g.fillStyle = SMOKE[1];
        for (let q = 0; q < 3; q++) { const f = (t * 1.5 + q / 3) % 1; if (BAYER[(q * 5 + Math.floor(t * 8)) & 15] > 1 - f) continue; g.fillRect(X + Math.round(Math.sin(f * 6 + q) * 1.5), Y - Zh - 2 - Math.round(f * 8), 2, 2); }
      }
    }
    // fire → smoke puffs: a hot core inside a cooler rim; later dithered smoke that rises and thins
    for (const p of puffs) {
      const u = (t - p.t0) / p.life;
      if (u < 0 || u > 1) continue;
      const r = Math.max(1, Math.round(p.r * (0.6 + Math.min(1, u * 2.2) * 0.8)));
      const cx = Math.round(x + p.dx * (0.7 + u * 0.6)), cy = Math.round(y - 3 + p.dy - u * p.rise);
      const smoke = u > 0.5, hot = Math.min(FIRE.length - 1, Math.floor(u * 2 * FIRE.length));
      for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
        const dd = Math.sqrt(xx * xx + yy * yy) / r;
        if (dd > 1) continue;
        const X = cx + xx, Y = cy + yy;
        if (smoke) {
          const fade = (u - 0.5) / 0.5;
          if (BAYER[((Y & 3) * 4) + (X & 3)] < fade * 0.9 + dd * 0.25) continue;
          g.fillStyle = SMOKE[Math.min(2, Math.floor(dd * 2 + fade))];
        } else g.fillStyle = FIRE[Math.min(FIRE.length - 1, hot + (dd > 0.72 ? 2 : dd > 0.4 ? 1 : 0))];
        g.fillRect(X, Y, 1, 1);
      }
    }
  };
}
