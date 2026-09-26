// @ts-check
import { C } from '../config/palette.js';
import { Rng, hash2 } from '../core/rng.js';
import { pack, shade, mix, unpack, packRgba } from './pixel.js';
import { T } from '../world/tiles.js';

/** Procedural biome textures (SPEC §4.5, §4.6). Textures are 64×64, tileable, generated once per biome. */
export const TEX = 64;

function tnoise(size, cell, seed) {
  const n = size / cell;
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x / cell, fy = y / cell;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const h = (a, b) => hash2(((a % n) + n) % n, ((b % n) + n) % n, seed);
    const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
    out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  return out;
}
function fbmTex(size, seed, cells = [16, 8, 4]) {
  const layers = cells.map((c, i) => tnoise(size, c, seed + i * 31));
  const out = new Float32Array(size * size);
  let tot = 0;
  cells.forEach((c, i) => { const amp = 1 / (i + 1); tot += amp; for (let k = 0; k < out.length; k++) out[k] += layers[i][k] * amp; });
  for (let k = 0; k < out.length; k++) out[k] /= tot;
  return out;
}

class Tex {
  constructor(seed) { this.d = new Uint32Array(TEX * TEX); this.r = new Rng(seed); }
  set(x, y, c) { this.d[(((y % TEX) + TEX) % TEX) * TEX + (((x % TEX) + TEX) % TEX)] = pack(c); }
  get(x, y) { return this.d[(((y % TEX) + TEX) % TEX) * TEX + (((x % TEX) + TEX) % TEX)]; }
  base(cols, noise, th) {
    for (let i = 0; i < TEX * TEX; i++) {
      const v = noise[i];
      let k = 0; while (k < th.length && v > th[k]) k++;
      this.d[i] = pack(cols[k]);
    }
  }
  speck(col, count, len = 1, vertical = false) {
    for (let i = 0; i < count; i++) {
      const x = this.r.int(0, TEX - 1), y = this.r.int(0, TEX - 1);
      for (let j = 0; j < len; j++) this.set(vertical ? x : x + j, vertical ? y - j : y, col);
    }
  }
  blades(light, dark, count, h = 2) {
    for (let i = 0; i < count; i++) {
      const x = this.r.int(0, TEX - 1), y = this.r.int(0, TEX - 1);
      this.set(x, y, dark);
      for (let j = 1; j <= h; j++) this.set(x + (j === h && this.r.chance(0.3) ? this.r.sign() : 0), y - j, light);
    }
  }
  pebble(light, dark, count) {
    for (let i = 0; i < count; i++) {
      const x = this.r.int(0, TEX - 1), y = this.r.int(0, TEX - 1);
      this.set(x, y, light); if (this.r.chance(0.5)) this.set(x + 1, y, light);
      this.set(x, y + 1, dark); this.set(x + 1, y + 1, dark);
    }
  }
}

/** Biome colour sets for base ground, tall grass, cliffs etc. */
export const BIOMES = {
  temperate: {
    ground: [C.grass1, C.grass2, C.grass3], groundDark: C.grass0, groundLight: C.grass4,
    tall: ['#4A6428', '#62822F', '#8DAA48', '#B8CC6A'], rock: [C.rock0, C.rock1, C.rock2, C.rock3, C.rock4],
    forestFloor: ['#2F4420', '#3A5227', '#46612E'], flowers: ['#F2E96B', '#EDEDE0', '#B79BE8', '#F2B8D0'],
    trees: 'temperate', light: 1.0, tint: null,
  },
  arid: {
    ground: ['#A9855A', '#B8946A', '#C4A274'], groundDark: '#8C6B45', groundLight: '#D4B488',
    tall: ['#8E7A48', '#A48E54', '#6E6A38', '#B8A060'], rock: ['#4A2A1E', '#6E3E2A', '#8A4E34', '#A8633F', '#C47E52'],
    forestFloor: ['#8C6B45', '#9A7A50', '#A88A5C'], flowers: ['#E8D080', '#D8C8A8'],
    trees: 'arid', light: 1.0, tint: 'rgba(255,170,90,0.06)',
  },
  alpine: {
    ground: [C.snow1, '#D2DFE6', C.snow2], groundDark: C.snow0, groundLight: '#F4F8FA',
    tall: ['#9BAE9C', '#B4C4B4', '#7C8F7E', '#CAD8CC'], rock: ['#2C3036', '#454B52', '#626A72', '#838B92', '#A9B1B6'],
    forestFloor: ['#A9BCC6', '#BDCDD6', '#CCD9E0'], flowers: ['#FFFFFF'],
    trees: 'alpine', light: 1.0, tint: null,
  },
  desert: {
    ground: [C.sand0, C.sand1, '#CDB078'], groundDark: '#94784A', groundLight: C.sand2,
    tall: ['#9A8850', '#B09C5E', '#7E7040', '#C4B070'], rock: ['#4E2E1C', '#74442A', '#9A5E38', '#B87848', '#D4955E'],
    forestFloor: ['#A08050', '#B09060', '#C0A070'], flowers: ['#F0E0A0'],
    trees: 'desert', light: 1.0, tint: 'rgba(255,150,80,0.05)',
  },
  jungle: {
    ground: [C.jungle1, C.jungle2, '#386B30'], groundDark: C.jungle0, groundLight: C.jungle3,
    tall: [C.jungle1, C.jungle3, '#4E9442', '#62AA50'], rock: ['#1E2A1C', '#34422E', '#4E5E46', '#6A7A5E', '#8A9A7A'],
    forestFloor: ['#16301A', '#1E3B20', '#264826'], flowers: ['#F26BD0', '#F2E96B', '#FFFFFF', '#6BD0F2'],
    trees: 'jungle', light: 1.0, tint: 'rgba(200,255,180,0.04)',
  },
  swamp: {
    ground: [C.swamp1, '#46503A', C.swamp2], groundDark: C.swamp0, groundLight: '#5E6A44',
    tall: ['#3A4430', '#56623E', '#6A7648', '#7C8850'], rock: ['#1C1E1A', '#2E322A', '#44483E', '#5A5E52', '#74786A'],
    forestFloor: ['#262C1E', '#2E3624', '#38402C'], flowers: ['#C8C080'],
    trees: 'swamp', light: 1.0, tint: null,
  },
  volcanic: {
    ground: [C.ash1, '#352D2E', C.ash2], groundDark: C.ash0, groundLight: C.ash3,
    tall: ['#3A3230', '#4E4440', '#5E5450', '#6E625C'], rock: ['#141011', '#241C1C', '#3A2E2C', '#54443E', '#6E5C54'],
    forestFloor: ['#1E1818', '#262020', '#2E2626'], flowers: ['#FF7A1A'],
    trees: 'volcanic', light: 1.0, tint: 'rgba(255,90,30,0.05)',
  },
};

/**
 * Build all terrain textures for a biome. Returns textures[terrainId][level] = Uint32Array(TEX*TEX)
 */
export function buildTextures(biomeName) {
  const B = BIOMES[biomeName] || BIOMES.temperate;
  const nA = fbmTex(TEX, 11, [16, 8, 4]);
  const nB = fbmTex(TEX, 23, [32, 8, 2]);
  const nC = fbmTex(TEX, 37, [8, 4, 2]);
  const out = [];
  const mk = (seed) => new Tex(seed);

  // ground
  const g = mk(1);
  const nG = fbmTex(TEX, 51, [8, 4, 2]);
  g.base(B.ground, nG, [0.34, 0.68]);
  if (biomeName === 'temperate' || biomeName === 'jungle' || biomeName === 'swamp') {
    g.blades(B.groundLight, B.groundDark, 90, 2);
    g.speck(B.groundDark, 60);
  } else if (biomeName === 'alpine') {
    g.speck(B.groundDark, 30); g.speck('#FFFFFF', 40);
  } else if (biomeName === 'volcanic') {
    g.pebble(B.groundLight, B.groundDark, 30); g.speck('#1A1414', 50);
  } else {
    g.pebble(B.groundLight, B.groundDark, 25); g.speck(B.groundDark, 45);
    // dry cracks
    for (let i = 0; i < 6; i++) { let x = g.r.int(0, 63), y = g.r.int(0, 63); for (let j = 0; j < 6; j++) { g.set(x, y, B.groundDark); x += g.r.int(0, 1); y += g.r.sign(); } }
  }
  out[T.ground] = g;

  // dirt
  const d = mk(2);
  d.base([C.dirt0, C.dirt1, C.dirt2], nB, [0.3, 0.62]);
  d.pebble(C.dirt3, C.dirt0, 30); d.speck(C.dirt0, 40);
  out[T.dirt] = d;

  // road (compacted gravel with tyre-rut streak noise)
  const r = mk(3);
  const roadCols = biomeName === 'alpine' ? ['#8C8478', '#9E978B', '#B0AA9E'] : biomeName === 'volcanic' ? ['#3E3634', '#4C4240', '#5A4E4A'] : [C.dirt1, C.dirt2, '#9C8660'];
  r.base(roadCols, nC, [0.35, 0.65]);
  r.pebble(C.rock3, C.rock1, 40); r.speck(shadeCol(roadCols[0], 0.8), 50);
  out[T.road] = r;

  // sand
  const s = mk(4);
  s.base([C.sand0, C.sand1, C.sand2], nA, [0.35, 0.68]);
  for (let y = 0; y < TEX; y += 5) for (let x = 0; x < TEX; x++) if (nB[((y + (x >> 3)) % TEX) * TEX + x] > 0.55) s.set(x, y + Math.round(Math.sin(x / 5) * 1.2), C.sand0);
  s.speck(C.sand2, 40);
  out[T.sand] = s;

  // tall grass / scrub
  const tg = mk(5);
  tg.base([B.tall[0], B.tall[1]], nC, [0.45]);
  for (let row = 0; row < TEX; row += 3) {
    for (let x = 0; x < TEX; x += 1) {
      if (!tg.r.chance(0.55)) continue;
      const y = row + tg.r.int(0, 2), h = tg.r.int(3, 5);
      tg.set(x, y + 1, B.groundDark);
      tg.set(x, y, B.tall[0]);
      const lean = tg.r.chance(0.35) ? tg.r.sign() : 0;
      for (let j = 1; j <= h; j++) tg.set(x + (j >= h - 1 ? lean : 0), y - j, j >= h - 1 ? B.tall[3] : B.tall[2]);
    }
  }
  out[T.tallgrass] = tg;

  // shallow water
  const sw = mk(6);
  sw.base([C.water2, '#337A9C', '#3C86A8'], nA, [0.45, 0.7]);
  for (let i = 0; i < 40; i++) { const x = sw.r.int(0, 63), y = sw.r.int(0, 63), l = sw.r.int(2, 4); for (let j = 0; j < l; j++) sw.set(x + j, y, C.water3); }
  if (biomeName === 'swamp') { sw.base(['#2E3A2C', '#364432', '#3E4E38'], nA, [0.45, 0.7]); sw.speck('#5E7040', 40); }
  if (biomeName === 'desert') { sw.base(['#9A8458', '#8E7A50', '#A89060'], nA, [0.45, 0.7]); sw.pebble(C.sand2, '#7A6440', 30); }
  out[T.shallow] = sw;

  // deep water
  const dw = mk(7);
  dw.base([C.water0, C.water1, '#245A7A'], nB, [0.35, 0.7]);
  for (let i = 0; i < 30; i++) { const x = dw.r.int(0, 63), y = dw.r.int(0, 63); dw.set(x, y, C.water2); dw.set(x + 1, y - 1, C.water2); dw.set(x + 2, y - 1, C.water2); dw.set(x + 3, y, C.water2); }
  if (biomeName === 'swamp') dw.base(['#1C2620', '#223028', '#283830'], nB, [0.35, 0.7]);
  out[T.deep] = dw;

  // deep snow
  const sn = mk(8);
  sn.base([C.snow1, '#D8E4EA', C.snow2], nA, [0.35, 0.6]);
  sn.speck('#FFFFFF', 60); sn.speck(C.snow0, 12);
  out[T.snow] = sn;

  // swamp
  const sm = mk(9);
  sm.base([C.swamp0, C.swamp1, C.swamp2], nB, [0.4, 0.62]);
  for (let i = 0; i < TEX * TEX; i++) if (nC[i] < 0.3) sm.d[i] = pack('#243028');
  sm.blades('#6A7A48', C.swamp0, 60, 3);
  out[T.swamp] = sm;

  // concrete: slabs
  const cc = mk(10);
  cc.base([C.conc1, C.conc2], nC, [0.55]);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    if (x % 16 === 0 || y % 16 === 0) cc.set(x, y, C.conc0);
    else if (x % 16 === 1 || y % 16 === 1) cc.set(x, y, C.conc3);
  }
  cc.speck(C.conc0, 40); cc.speck(C.conc3, 20);
  for (let i = 0; i < 4; i++) { let x = cc.r.int(0, 63), y = cc.r.int(0, 63); for (let j = 0; j < 8; j++) { cc.set(x, y, C.conc0); x += cc.r.int(0, 1); y += cc.r.int(0, 1); } }
  out[T.concrete] = cc;

  // lava
  const lv = mk(11);
  lv.base(['#6A1A08', C.lava0, C.lava1, C.lava2], nA, [0.35, 0.55, 0.72]);
  for (let i = 0; i < TEX * TEX; i++) if (nC[i] > 0.72) lv.d[i] = pack('#FFE890');
  out[T.lava] = lv;

  // ice
  const ic = mk(12);
  ic.base([C.ice0, '#A0C6D8', C.ice1], nB, [0.4, 0.65]);
  for (let i = 0; i < 10; i++) { let x = ic.r.int(0, 63), y = ic.r.int(0, 63); const dx = ic.r.sign(); for (let j = 0; j < 10; j++) { ic.set(x, y, '#7AA2B6'); x += dx * ic.r.int(0, 1); y += ic.r.int(0, 1); } }
  ic.speck('#E8F6FF', 40);
  out[T.ice] = ic;

  // ash
  const as = mk(13);
  as.base([C.ash0, C.ash1, C.ash2], nA, [0.38, 0.66]);
  as.pebble(C.ash3, C.ash0, 30); as.speck('#6A3A2A', 12);
  out[T.ash] = as;

  // gravel
  const gr = mk(14);
  gr.base([B.rock[1], B.rock[2]], nC, [0.5]);
  gr.pebble(B.rock[3], B.rock[0], 120); gr.speck(B.rock[4], 30);
  out[T.gravel] = gr;

  // Bake brightness levels (+6% per elevation level, SPEC §4.2) and optional biome tint
  const tint = B.tint ? unpack(pack(B.tint)) : null;
  const res = [];
  for (let t = 0; t < out.length; t++) {
    const src = out[t]?.d;
    if (!src) continue;
    res[t] = [];
    for (let lv2 = 0; lv2 < 4; lv2++) {
      const f = 1 + LEVEL_BRIGHT * lv2;
      const dst = new Uint32Array(TEX * TEX);
      for (let i = 0; i < dst.length; i++) {
        let v = shade(src[i], f);
        if (lv2 > 0) v = mix(v, WARM, 0.04 * lv2);            // plateau tops read warmer/lighter
        if (tint) v = mix(v, packRgba(tint[0], tint[1], tint[2], 255), tint[3] / 255);
        dst[i] = v;
      }
      res[t][lv2] = dst;
    }
  }
  return res;
}

function shadeCol(hex, f) { const [r, g, b] = unpack(pack(hex)); return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`; }

/** Brightness step per elevation level (spec default 6%; raised for readability — DECISIONS.md) */
export const LEVEL_BRIGHT = 0.09;
const WARM = pack('#F0E0A0');

/** Tileable jagged-edge noise used for organic terrain transitions */
export const EDGE_NOISE = tnoise(TEX, 4, 99);
export const EDGE_NOISE2 = tnoise(TEX, 8, 199);
