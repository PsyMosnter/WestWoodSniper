// @ts-check
/**
 * Chibi style — trees at the soldiers' scale, drawn with the Ink illustrator: round cel-shaded crowns made of
 * overlapping lobes (each lobe shades the one behind it), tiered pines with droopy scalloped skirts (snow-capped
 * in the Alpine), flat-topped acacias, palms, dead trees; dark ink outlines. Returns the same { pix, ax, ay } as the
 * classic generators.
 */
import { Ink } from '../ink.js';
import { Rng } from '../../core/rng.js';

const OUT = '#121A0E';

/** pal: [darkest … lightest] foliage; bark: [dark, light] */
function broadleaf(seed, pal, bark, o = {}) {
  const r = new Rng(seed), W = o.w || 44, H = o.h || 48, k = new Ink(W, H);
  const ax = W / 2, ay = H - 3, R = (o.rad || 11) + 2;
  // a short, stout trunk with a root flare, disappearing into a big crown
  k.stroke([[ax, ay], [ax + r.range(-1, 1), ay - 7], [ax + r.range(-1.5, 1.5), ay - 14]], [8, 6, 4.5], OUT);
  k.stroke([[ax, ay], [ax + r.range(-1, 1), ay - 7], [ax + r.range(-1.5, 1.5), ay - 14]], [6, 4.2, 3], bark[1]);
  k.stroke([[ax - 4, ay], [ax + 4, ay]], 2, bark[0]);
  const cy = ay - 9 - R;
  const lobes = [[0, 0, R]];
  for (let i = 0, n = o.lobes || 6; i < n; i++) {
    const a = -Math.PI * (0.1 + (0.8 * i) / (n - 1)) + r.range(-0.2, 0.2);
    lobes.push([Math.cos(a) * R * 0.75, Math.sin(a) * R * 0.55 + R * 0.2, R * r.range(0.5, 0.68)]);
  }
  lobes.sort((p, q) => q[1] - p[1]);                                     // back (top) lobes first? draw low ones last
  lobes.reverse();
  for (const [dx, dy, rr] of lobes) k.ellipse(ax + dx, cy + dy, rr + 2, rr * 0.92 + 2, 0, { fill: OUT });
  for (const [dx, dy, rr] of lobes) {
    const m = k.ellipse(ax + dx, cy + dy, rr, rr * 0.92, 0, { fill: pal[2] });
    k.save(); k.clip(m);
    k.ellipse(ax + dx + rr * 0.35, cy + dy + rr * 0.35, rr, rr, 0, { fill: pal[1] });           // shade on the lower right
    k.ellipse(ax + dx - rr * 0.25, cy + dy - rr * 0.3, rr * 0.55, rr * 0.45, 0, { fill: pal[3] });  // sun on the upper left
    k.ellipse(ax + dx - rr * 0.35, cy + dy - rr * 0.45, rr * 0.22, rr * 0.16, 0, { fill: pal[4] });
    k.stroke([[ax + dx - rr * 0.8, cy + dy + rr * 0.15], [ax + dx, cy + dy + rr * 0.65], [ax + dx + rr * 0.8, cy + dy + rr * 0.2]], 1, pal[0]);
    k.restore();
  }
  return { pix: k.pix, ax: Math.round(ax), ay };
}

function pine(seed, pal, bark, o = {}) {
  const r = new Rng(seed), W = o.w || 30, H = o.h || 50, k = new Ink(W, H);
  const ax = W / 2, ay = H - 3, tiers = o.tiers || 4;
  k.rect(ax - 2, ay - 8, 4, 8, { fill: bark[1], line: OUT, lw: 1 });
  const top = 4, bottom = ay - 6;
  const tier = (i) => {
    const f = i / tiers, y0 = top + (bottom - top) * (i / (tiers + 0.4)), y1 = top + (bottom - top) * ((i + 1.4) / (tiers + 0.4));
    const hw = 4 + (W / 2 - 3) * ((i + 1) / tiers) * r.range(0.9, 1);
    const pts = [[ax, y0 - 2, 1]];
    const n = 4;
    for (let j = 0; j <= n; j++) { const u = j / n, x = ax + hw - 2 * hw * u; pts.push([x, y1 + (j % 2 ? -2 : 1) + Math.sin(u * Math.PI) * 2, j % 2 ? 0 : 1]); }
    void f;
    return pts.slice(0, 1).concat(pts.slice(1));
  };
  for (let i = tiers - 1; i >= 0; i--) k.shape(tier(i), { fill: OUT, smooth: false, line: OUT, lw: 1 });
  for (let i = 0; i < tiers; i++) {
    const m = k.shape(tier(i), { fill: pal[1 + (i % 2)], smooth: false });
    k.save(); k.clip(m);
    k.shape([[ax, 0], [W, 0], [W, H], [ax, H]], { fill: pal[0], smooth: false });            // shade side
    k.shape([[ax - 1, 0], [ax - W / 2, H], [ax - W / 3, H], [ax + 1, 0]], { fill: pal[3], smooth: false });   // sunlit flank
    if (o.snow) k.stroke(tier(i).slice(1).map(([x, y]) => [x, y - 3]), 2, '#F4FAFF');
    k.restore();
  }
  if (o.snow) k.ellipse(ax, top + 1, 2.5, 2, 0, { fill: '#FFFFFF' });
  return { pix: k.pix, ax: Math.round(ax), ay };
}

function acacia(seed, pal, bark) {
  const r = new Rng(seed), W = 64, H = 62, k = new Ink(W, H), ax = W / 2, ay = H - 3;
  k.scale(1.45); k.translate(-(ax - ax / 1.45), -(ay - ay / 1.45));
  for (const [dx, h2] of [[-9, 20], [8, 22]]) { k.stroke([[ax, ay], [ax + dx * 0.4, ay - 10], [ax + dx, ay - h2]], [4, 3, 2], OUT); k.stroke([[ax, ay], [ax + dx * 0.4, ay - 10], [ax + dx, ay - h2]], [2.4, 1.8, 1], bark[1]); }
  const crown = [[ax - 20, ay - 22], [ax - 12, ay - 30 - r.range(0, 3)], [ax, ay - 32], [ax + 12, ay - 31], [ax + 20, ay - 24], [ax + 10, ay - 20], [ax - 10, ay - 20]];
  const m = k.shape(crown, { fill: pal[2], line: OUT, lw: 2 });
  k.save(); k.clip(m); k.shape(crown.map(([x, y]) => [x + 2, y + 4]), { fill: pal[1] }); k.stroke([[ax - 14, ay - 28], [ax + 6, ay - 31]], 2, pal[3]); k.restore();
  return { pix: k.pix, ax: Math.round(ax), ay };
}

function palm(seed, pal, bark) {
  const r = new Rng(seed), W = 44, H = 50, k = new Ink(W, H), ax = W / 2, ay = H - 3, lean = r.range(-5, 5);
  const top = [ax + lean, 16];
  k.stroke([[ax, ay], [ax + lean * 0.3, ay - 16], top], [6, 5, 4], OUT);
  k.stroke([[ax, ay], [ax + lean * 0.3, ay - 16], top], [4, 3.2, 2.4], bark[1]);
  for (let y = ay - 4; y > 20; y -= 4) k.stroke([[ax + lean * (1 - (y - 16) / (ay - 16)) - 2, y], [ax + lean * (1 - (y - 16) / (ay - 16)) + 2, y]], 1, bark[0]);
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI + (i / 5) * Math.PI + r.range(-0.15, 0.15), len = r.range(14, 19);
    const tip = [top[0] + Math.cos(a) * len, top[1] + Math.sin(a) * len * 0.5 + len * 0.45];
    const mid = [top[0] + Math.cos(a) * len * 0.55, top[1] + Math.sin(a) * len * 0.5 - 3];
    k.stroke([top, mid, tip], [5, 6, 1], OUT);
    k.stroke([top, mid, tip], [3, 4, 0.6], pal[2 + (i % 2)]);
  }
  k.ellipse(top[0], top[1] + 2, 3, 2.5, 0, { fill: bark[0], line: OUT, lw: 1 });
  return { pix: k.pix, ax: Math.round(ax), ay };
}

function deadTree(seed, bark) {
  const r = new Rng(seed), W = 32, H = 44, k = new Ink(W, H), ax = W / 2, ay = H - 3;
  const trunk = [[ax, ay], [ax + r.range(-2, 2), ay - 16], [ax + r.range(-3, 3), ay - 30]];
  k.stroke(trunk, [6, 4.5, 2], OUT); k.stroke(trunk, [4, 3, 1], bark[1]);
  for (let i = 0; i < 4; i++) {
    const y = ay - 12 - i * 5, sd = i % 2 ? 1 : -1, b = [[ax, y], [ax + sd * r.range(5, 9), y - r.range(4, 8)], [ax + sd * r.range(9, 13), y - r.range(8, 13)]];
    k.stroke(b, [3.4, 2, 0.8], OUT); k.stroke(b, [1.8, 1, 0.5], bark[1]);
  }
  return { pix: k.pix, ax: Math.round(ax), ay };
}

const BARK = ['#3A2616', '#6A4A2C'];
const GREEN = ['#1C3A18', '#2E5E24', '#4A8A30', '#7CBC4A', '#B8E478'];
const PINE = ['#122A1A', '#1E4428', '#2C5E36', '#4E8A4A'];
/** biome → kind → generators (seed → sprite) */
export const CHIBI_FLORA = {
  temperate: { trees: [(s) => broadleaf(s, GREEN, BARK), (s) => broadleaf(s, GREEN, BARK, { rad: 10, lobes: 5 })], forest: [(s) => pine(s, PINE, BARK), (s) => broadleaf(s, ['#183414', '#28521E', '#3E7A28', '#6AA83E', '#A0D466'], BARK, { rad: 12 })] },
  arid: { trees: [(s) => broadleaf(s, ['#34341A', '#52522A', '#747238', '#9C9A4E', '#C8C47A'], BARK, { rad: 9, lobes: 5 })], forest: [(s) => pine(s, ['#26301A', '#3A4A26', '#546834', '#7A904A'], BARK)] },
  alpine: { trees: [(s) => pine(s, PINE, BARK, { snow: true })], forest: [(s) => pine(s, ['#0E2218', '#183A24', '#24522E', '#3E7040'], BARK, { snow: true, tiers: 5, h: 54 })] },
  desert: { trees: [(s) => acacia(s, ['#3E3A1A', '#5E5A28', '#88823C', '#B4AC5A'], ['#3A2616', '#7A5A36'])], forest: [(s) => acacia(s, ['#3A361A', '#585426', '#807A38', '#ACA456'], ['#3A2616', '#7A5A36'])] },
  jungle: { trees: [(s) => palm(s, ['#0E2A10', '#1A4418', '#2E6A26', '#4E9A3A'], ['#3A2A18', '#7A6040'])], forest: [(s) => broadleaf(s, ['#0C2410', '#164018', '#246424', '#3E8E36', '#6CBC52'], BARK, { rad: 13, lobes: 7, h: 50, w: 42 }), (s) => palm(s, ['#0E2A10', '#1A4418', '#2E6A26', '#4E9A3A'], ['#3A2A18', '#7A6040'])] },
  swamp: { trees: [(s) => broadleaf(s, ['#1A2614', '#2A3A1E', '#3E5428', '#5E7438', '#86984E'], ['#2A2218', '#4A3E2A'], { rad: 11 })], forest: [(s) => broadleaf(s, ['#141E10', '#22301A', '#344824', '#526634', '#788A48'], ['#2A2218', '#4A3E2A'], { rad: 12, lobes: 7 })] },
  volcanic: { trees: [(s) => deadTree(s, ['#141010', '#2E2424'])], forest: [(s) => deadTree(s, ['#141010', '#2E2424'])] },
};
