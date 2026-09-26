// @ts-check
import { Pix, pack, shade } from '../pixel.js';
import { Rng } from '../../core/rng.js';

/**
 * Procedural flora sprites (SPEC §4.5, §16.4 rule 6: ≥3 variants per biome).
 * Each generator returns { pix, ax, ay } where (ax, ay) is the ground anchor (trunk base).
 */

function canopyTree(seed, o) {
  const r = new Rng(seed);
  const W = o.w || 20, H = o.h || 22;
  const p = new Pix(W, H);
  const ax = W >> 1, ay = H - 2;
  // trunk
  const th = o.trunkH ?? 5;
  for (let y = ay - th; y <= ay; y++) {
    p.set(ax - 1, y, o.bark[1]); p.set(ax, y, o.bark[0]);
  }
  p.set(ax - 2, ay, o.bark[1]); p.set(ax + 1, ay, o.bark[0]);
  // canopy: cluster of blobs
  const cy = ay - th - (o.rad || 6) + 2;
  const R = o.rad || 6;
  const blobs = [[0, 0, R, R * 0.85]];
  const n = o.lobes ?? 4;
  for (let i = 0; i < n; i++) {
    const a = r.range(0, Math.PI * 2);
    blobs.push([Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.45 - 1, R * r.range(0.5, 0.7), R * r.range(0.45, 0.6)]);
  }
  blobs.sort((a, b) => a[1] - b[1]);
  const rnd = () => r.next();
  for (const [bx, by, rx, ry] of blobs) p.blob(ax + bx, cy + by, rx, ry, o.leaf, rnd);
  // leafy highlight clusters
  for (let i = 0; i < (o.hl ?? 6); i++) {
    const x = ax + r.int(-R + 2, 1), y = cy + r.int(-R + 2, 0);
    if (p.alphaAt(x, y)) { p.set(x, y, o.leaf[3] || o.leaf[2]); if (r.chance(0.5)) p.set(x + 1, y, o.leaf[2]); }
  }
  // dark leaf gaps
  for (let i = 0; i < 8; i++) {
    const x = ax + r.int(-R + 1, R - 1), y = cy + r.int(-2, R - 1);
    if (p.alphaAt(x, y)) p.set(x, y, o.leaf[0]);
  }
  if (o.snow) for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    if (p.alphaAt(x, y) && !p.alphaAt(x, y - 1) && r.chance(0.8)) { p.set(x, y, '#F2F8FA'); if (r.chance(0.5)) p.set(x, y + 1, '#D2E0E8'); }
  }
  if (o.fruit) for (let i = 0; i < 4; i++) { const x = ax + r.int(-R + 2, R - 2), y = cy + r.int(-R + 2, R - 3); if (p.alphaAt(x, y)) p.set(x, y, o.fruit); }
  p.outline(o.outline || '#16200F');
  return { pix: p, ax, ay };
}

function pineTree(seed, o) {
  const r = new Rng(seed);
  const W = o.w || 16, H = o.h || 24;
  const p = new Pix(W, H);
  const ax = W >> 1, ay = H - 2;
  for (let y = ay - 3; y <= ay; y++) { p.set(ax - 1, y, o.bark[1]); p.set(ax, y, o.bark[0]); }
  const tiers = o.tiers || 4;
  const top = 1, bottom = ay - 3;
  const span = bottom - top;
  for (let t = 0; t < tiers; t++) {
    const y0 = top + Math.floor((span * t) / tiers);
    const y1 = top + Math.floor((span * (t + 1.35)) / tiers);
    const halfMax = 2 + ((W / 2 - 2) * (t + 1)) / tiers;
    for (let y = y0; y <= Math.min(y1, bottom); y++) {
      const k = (y - y0) / Math.max(1, y1 - y0);
      const hw = Math.max(1, Math.round(halfMax * (0.35 + 0.65 * k)));
      for (let x = ax - hw; x <= ax + hw - 1; x++) {
        const side = (x - ax + 0.5) / hw;
        let c = side < -0.35 ? o.leaf[2] : side < 0.3 ? o.leaf[1] : o.leaf[0];
        if (y === y1 || (y > y0 && r.chance(0.12))) c = o.leaf[0];
        p.set(x, y, c);
      }
    }
    if (o.snow) {
      for (let x = ax - Math.round(halfMax * 0.8); x <= ax + Math.round(halfMax * 0.5); x++) if (p.alphaAt(x, y0 + 1) && r.chance(0.75)) p.set(x, y0 + 1 + (r.chance(0.3) ? 1 : 0), '#EEF6FA');
    }
  }
  p.set(ax - 1, top, o.leaf[2]); p.set(ax, top, o.leaf[1]);
  p.outline(o.outline || '#0E1A10');
  return { pix: p, ax, ay };
}

function deadTree(seed, o) {
  const r = new Rng(seed);
  const W = o.w || 16, H = o.h || 20;
  const p = new Pix(W, H);
  const ax = W >> 1, ay = H - 2;
  const trunkTop = ay - (o.trunkH || 9);
  for (let y = trunkTop; y <= ay; y++) { p.set(ax, y, o.bark[0]); if (y > trunkTop + 3) p.set(ax - 1, y, o.bark[1]); }
  const branch = (x, y, dx, len) => {
    for (let i = 0; i < len; i++) { x += dx; y -= r.chance(0.6) ? 1 : 0; p.set(x, y, o.bark[i % 2]); }
    return [x, y];
  };
  const b1 = branch(ax, trunkTop + 3, -1, r.int(3, 5));
  branch(b1[0], b1[1], -1, 2);
  const b2 = branch(ax, trunkTop + 1, 1, r.int(3, 5));
  branch(b2[0], b2[1], 1, 2);
  branch(ax, trunkTop, r.sign(), 2);
  if (o.leaves) for (let i = 0; i < 10; i++) { const x = ax + r.int(-5, 5), y = trunkTop + r.int(-2, 4); if (p.alphaAt(x, y) || r.chance(0.3)) p.set(x, y, r.pick(o.leaves)); }
  p.outline(o.outline || '#1A1210');
  return { pix: p, ax, ay };
}

function palmTree(seed, o) {
  const r = new Rng(seed);
  const W = 22, H = 26;
  const p = new Pix(W, H);
  const ax = 11, ay = H - 2;
  const lean = r.sign();
  let x = ax, y = ay;
  const top = 8;
  for (let i = 0; y > top; i++) {
    p.set(x, y, i % 3 === 0 ? o.bark[1] : o.bark[0]); p.set(x + 1, y, o.bark[1]);
    y--; if (i % 5 === 4) x += lean;
  }
  const cx = x, cy = y;
  const fronds = [[-1, 0], [1, 0], [-0.7, -0.7], [0.7, -0.7], [-0.8, 0.6], [0.8, 0.6], [0, -1]];
  for (const [dx, dy] of fronds) {
    let fx = cx, fy = cy;
    const len = r.int(6, 9);
    for (let i = 0; i < len; i++) {
      fx += dx; fy += dy * 0.6 + (i > len / 2 ? 0.4 : 0);
      p.set(fx, fy, o.leaf[1]); p.set(fx, fy + 1, o.leaf[0]);
      if (i % 2 === 0) p.set(fx, fy - 1, o.leaf[2]);
    }
  }
  p.set(cx, cy + 1, '#6B4A20'); p.set(cx + 1, cy + 1, '#8A6428');
  p.outline(o.outline || '#0E1A0C');
  return { pix: p, ax, ay };
}

function bush(seed, o) {
  const r = new Rng(seed);
  const W = o.w || 14, H = o.h || 11;
  const p = new Pix(W, H);
  const ax = W >> 1, ay = H - 2;
  const rnd = () => r.next();
  p.blob(ax, ay - 3, W / 2 - 1.5, 3.8, o.leaf, rnd);
  p.blob(ax - 2, ay - 4, 3, 2.8, o.leaf, rnd);
  p.blob(ax + 2, ay - 4, 3, 2.6, o.leaf, rnd);
  if (o.berries) for (let i = 0; i < 3; i++) { const x = ax + r.int(-3, 3), y = ay - r.int(2, 5); if (p.alphaAt(x, y)) p.set(x, y, o.berries); }
  p.outline(o.outline || '#16200F');
  return { pix: p, ax, ay };
}

function succulent(seed, o) {
  const r = new Rng(seed);
  const p = new Pix(14, 14);
  const ax = 7, ay = 12;
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.33 + r.range(-0.1, 0.1);
    const len = r.int(4, 7);
    for (let j = 0; j < len; j++) p.set(ax + Math.cos(a) * j, ay + Math.sin(a) * j, j > len - 2 ? o.leaf[2] : o.leaf[1]);
  }
  p.set(ax, ay, o.leaf[0]);
  p.outline(o.outline || '#1A2010');
  return { pix: p, ax, ay };
}

function crystalSpire(seed, o) {
  const r = new Rng(seed);
  const p = new Pix(14, 20);
  const ax = 7, ay = 18;
  const shards = [[0, 14, 2], [-3, 9, 2], [3, 10, 2], [-5, 5, 1], [5, 6, 1]];
  for (const [dx, h, w] of shards) {
    const hh = h + r.int(-2, 2);
    for (let y = 0; y < hh; y++) {
      const ww = Math.max(0, Math.round(w * (1 - y / hh) + 0.4));
      for (let x = -ww; x <= ww; x++) p.set(ax + dx + x, ay - y, x < 0 ? o.leaf[2] : x === 0 ? o.leaf[1] : o.leaf[0]);
    }
    p.set(ax + dx, ay - hh, o.leaf[3]);
  }
  p.outline(o.outline || '#1A0A26');
  return { pix: p, ax, ay };
}

/** Biome flora tables: kind → generator + options. Variants are seeds. */
const FLORA = {
  temperate: {
    trees: [
      (s) => canopyTree(s, { leaf: ['#2E4A1E', '#41652A', '#5A8336', '#7AA646'], bark: ['#4A3520', '#6B4D2E'], rad: 7, w: 20, h: 22 }),
      (s) => canopyTree(s, { leaf: ['#3A5424', '#517532', '#6D9442', '#96BA5A'], bark: ['#C8C4B0', '#8C887A'], rad: 5, w: 16, h: 20, lobes: 3 }),
      (s) => pineTree(s, { leaf: ['#1E3A22', '#2C5230', '#3E6C3E'], bark: ['#4A3520', '#6B4D2E'], w: 14, h: 22 }),
      (s) => canopyTree(s, { leaf: ['#2E4A1E', '#41652A', '#5A8336', '#7AA646'], bark: ['#4A3520', '#6B4D2E'], rad: 6, w: 18, h: 20, fruit: '#F2E96B' }),
    ],
    forest: [
      (s) => canopyTree(s, { leaf: ['#1F3515', '#2E4A1E', '#41652A', '#5A8336'], bark: ['#3A2A18', '#5A4028'], rad: 8, w: 22, h: 22, trunkH: 3 }),
      (s) => pineTree(s, { leaf: ['#16301A', '#224426', '#2F5A32'], bark: ['#3A2A18', '#5A4028'], w: 16, h: 24, tiers: 5 }),
      (s) => canopyTree(s, { leaf: ['#1F3515', '#2A4418', '#3C5E26', '#557E34'], bark: ['#3A2A18', '#5A4028'], rad: 7, w: 20, h: 21, trunkH: 3 }),
    ],
    bush: [(s) => bush(s, { leaf: ['#2E4A1E', '#41652A', '#5A8336', '#7AA646'] }), (s) => bush(s, { leaf: ['#2E4A1E', '#41652A', '#5A8336', '#7AA646'], berries: '#B79BE8' })],
  },
  arid: {
    trees: [
      (s) => deadTree(s, { bark: ['#5A4030', '#7A5A40'], leaves: ['#7A7A3A', '#8E8E48'] }),
      (s) => succulent(s, { leaf: ['#3E5A30', '#5E7E44', '#8EA860'] }),
      (s) => canopyTree(s, { leaf: ['#4A5228', '#606A34', '#7A8442', '#949E56'], bark: ['#4A3520', '#6B4D2E'], rad: 5, w: 16, h: 18, lobes: 5 }),
    ],
    forest: [
      (s) => canopyTree(s, { leaf: ['#3E4622', '#545E2E', '#6C763A', '#848E4C'], bark: ['#4A3520', '#6B4D2E'], rad: 6, w: 18, h: 19 }),
      (s) => deadTree(s, { bark: ['#5A4030', '#7A5A40'], leaves: ['#6E7438', '#848A44'] }),
    ],
    bush: [(s) => bush(s, { leaf: ['#5A5A2A', '#727236', '#8A8A44', '#A4A058'] }), (s) => succulent(s, { leaf: ['#3E5A30', '#5E7E44', '#8EA860'] })],
  },
  alpine: {
    trees: [
      (s) => pineTree(s, { leaf: ['#1A3024', '#264434', '#345A44'], bark: ['#3A2A1E', '#5A4230'], w: 14, h: 22, snow: true }),
      (s) => pineTree(s, { leaf: ['#1A3024', '#264434', '#345A44'], bark: ['#3A2A1E', '#5A4230'], w: 12, h: 18, tiers: 3, snow: true }),
      (s) => deadTree(s, { bark: ['#4A3A30', '#6A5646'], leaves: ['#EEF6FA'] }),
    ],
    forest: [
      (s) => pineTree(s, { leaf: ['#14261C', '#1E3828', '#2A4A36'], bark: ['#3A2A1E', '#5A4230'], w: 16, h: 26, tiers: 5, snow: true }),
      (s) => pineTree(s, { leaf: ['#14261C', '#1E3828', '#2A4A36'], bark: ['#3A2A1E', '#5A4230'], w: 14, h: 22, tiers: 4, snow: true }),
    ],
    bush: [(s) => bush(s, { leaf: ['#3A4E40', '#4E6452', '#687E6A', '#EEF6FA'] })],
  },
  desert: {
    trees: [
      (s) => deadTree(s, { bark: ['#5A3E28', '#7E5A3A'] }),
      (s) => succulent(s, { leaf: ['#4A5A2E', '#6A7A3E', '#9AA858'] }),
      (s) => canopyTree(s, { leaf: ['#4A4A26', '#5E5E30', '#76763C', '#8E8E4C'], bark: ['#5A3E28', '#7E5A3A'], rad: 4, w: 14, h: 16, lobes: 5 }),
    ],
    forest: [(s) => canopyTree(s, { leaf: ['#3E4422', '#50582C', '#687238', '#7E8848'], bark: ['#5A3E28', '#7E5A3A'], rad: 6, w: 18, h: 19 })],
    bush: [(s) => bush(s, { leaf: ['#6A6030', '#82763C', '#9A8C4A', '#B0A05A'] })],
  },
  jungle: {
    trees: [
      (s) => palmTree(s, { leaf: ['#1E4A1E', '#2E6A2A', '#4A8A3A'], bark: ['#5A4A2A', '#7A643A'] }),
      (s) => canopyTree(s, { leaf: ['#123012', '#1E4A1E', '#2E6A2A', '#4A8A3A'], bark: ['#3A2A18', '#5A4028'], rad: 8, w: 22, h: 23, fruit: '#F26BD0' }),
      (s) => bush(s, { leaf: ['#1A4A1A', '#2A6A26', '#3E8A34', '#5AA848'], w: 16, h: 12 }),
    ],
    forest: [
      (s) => canopyTree(s, { leaf: ['#0E260E', '#183E18', '#265A24', '#3A7A32'], bark: ['#2E2214', '#4A3620'], rad: 9, w: 24, h: 24, trunkH: 3 }),
      (s) => palmTree(s, { leaf: ['#163E16', '#245A22', '#3A7A30'], bark: ['#4A3A20', '#6A5430'] }),
      (s) => canopyTree(s, { leaf: ['#0E260E', '#183E18', '#265A24', '#3A7A32'], bark: ['#2E2214', '#4A3620'], rad: 8, w: 22, h: 22, fruit: '#F2E96B' }),
    ],
    bush: [(s) => bush(s, { leaf: ['#1A4A1A', '#2A6A26', '#3E8A34', '#5AA848'], berries: '#F26BD0' }), (s) => succulent(s, { leaf: ['#1E4A1E', '#2E6A2A', '#4E9A40'] })],
  },
  swamp: {
    trees: [
      (s) => canopyTree(s, { leaf: ['#1E2A18', '#2C3C22', '#3E5230', '#52683E'], bark: ['#2E2A20', '#4A4232'], rad: 7, w: 20, h: 22, lobes: 6 }),
      (s) => deadTree(s, { bark: ['#2E2A22', '#4A4436'], leaves: ['#4A5A38'] }),
      (s) => pineTree(s, { leaf: ['#1A2618', '#263824', '#344A30'], bark: ['#2E2A20', '#4A4232'], w: 12, h: 20, tiers: 3 }),
    ],
    forest: [
      (s) => canopyTree(s, { leaf: ['#161E12', '#222E1A', '#324226', '#445832'], bark: ['#2A261C', '#423C2E'], rad: 8, w: 22, h: 22, lobes: 6 }),
      (s) => deadTree(s, { bark: ['#2E2A22', '#4A4436'], leaves: ['#3E4E30', '#4A5A38'] }),
    ],
    bush: [(s) => bush(s, { leaf: ['#222E1A', '#324226', '#445832', '#56703E'] })],
  },
  volcanic: {
    trees: [
      (s) => deadTree(s, { bark: ['#1A1414', '#2E2424'], leaves: ['#FF7A1A'] }),
      (s) => crystalSpire(s, { leaf: ['#4E8A1C', '#7CC42E', '#A6F03C', '#E4FF6A'] }),
      (s) => crystalSpire(s, { leaf: ['#4A2078', '#6A34A8', '#9B5AE0', '#D7A6FF'] }),
    ],
    forest: [
      (s) => deadTree(s, { bark: ['#141010', '#241C1C'], w: 18, h: 22, trunkH: 11 }),
      (s) => crystalSpire(s, { leaf: ['#4E8A1C', '#7CC42E', '#A6F03C', '#E4FF6A'] }),
    ],
    bush: [(s) => crystalSpire(s, { leaf: ['#4A2078', '#6A34A8', '#9B5AE0', '#D7A6FF'] })],
  },
};

const cache = new Map();
/** @returns {{canvas: HTMLCanvasElement, ax:number, ay:number, w:number, h:number}} */
export function floraSprite(biome, kind, variantHash) {
  const table = (FLORA[biome] || FLORA.temperate)[kind] || FLORA.temperate[kind];
  const gi = Math.floor(variantHash * table.length * 3);
  const gen = table[gi % table.length];
  const seed = (gi * 7919 + 13) | 0;
  const key = biome + kind + gi;
  let s = cache.get(key);
  if (!s) {
    const r = gen(seed);
    s = { canvas: r.pix.toCanvas(), ax: r.ax, ay: r.ay, w: r.pix.w, h: r.pix.h, pix: r.pix };
    cache.set(key, s);
  }
  return s;
}
export { FLORA };
