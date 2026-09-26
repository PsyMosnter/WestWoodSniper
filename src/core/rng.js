// @ts-check
/** Seeded RNG (mulberry32). All gameplay randomness goes through this (SPEC §3). */
export class Rng {
  /** @param {number} seed */
  constructor(seed = 1) { this.seed(seed); }
  /** @param {number} s */
  seed(s) { this.s = (s >>> 0) || 0x9e3779b9; }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** float in [a, b) */
  range(a, b) { return a + (b - a) * this.next(); }
  /** integer in [a, b] */
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  /** @template T @param {T[]} arr @returns {T} */
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  fork() { return new Rng((this.next() * 4294967296) >>> 0); }
}

/** Stateless integer hash → [0,1). Used for tile variation (render-only). */
export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0,1). */
export function valueNoise(x, y, s = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, s), b = hash2(x0 + 1, y0, s), c = hash2(x0, y0 + 1, s), d = hash2(x0 + 1, y0 + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Fractal value noise, 0..1 */
export function fbm(x, y, s = 0, oct = 3) {
  let v = 0, amp = 0.5, f = 1, tot = 0;
  for (let i = 0; i < oct; i++) { v += amp * valueNoise(x * f, y * f, s + i * 17); tot += amp; amp *= 0.5; f *= 2; }
  return v / tot;
}

export function seedFromUrl(def = 1234) {
  try {
    const p = new URLSearchParams(location.search).get('seed');
    if (p) return parseInt(p, 10) >>> 0;
  } catch (e) { /* node */ }
  return def;
}
