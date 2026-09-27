// @ts-check
/**
 * Art proposal "RTS" (playtest 2 → art pass): sprite studies in the style of 1990s top-down RTS infantry and
 * vehicles — small chunky figures, flat 3-tone material ramps lit from the top-left, self-coloured dark edges
 * ("sel-out") instead of a black line, saturated team colour on muted ground. Dev-only (tools/art-lab);
 * nothing here is wired into the game yet.
 */

// ------------------------------------------------------------------ palettes
export const PAL = {
  // GOD — WREN keeps the Classic read: olive helmet, blue visor band, khaki vest with blue straps
  wren: {
    j: '#343D1B', h: '#56642A', H: '#7B8C3B', I: '#A5B75E',
    v: '#2A69A0', V: '#86D0FA',
    S: '#94603D', s: '#D49C6B',
    q: '#6F6236', k: '#A29152', K: '#CBB974', X: '#EBDD9F',
    b: '#2C5A88', B: '#5E98CC',
    o: '#30371A', p: '#4D5828', P: '#6B7A38',
    d: '#262019', D: '#4A3E2E',
    g: '#1C1F21', G: '#4E565C', n: '#9AA3A8',
  },
  // NOT — charcoal carapace, violet team plates, lime eyes/core/knees
  husk: {
    a: '#15171A', A: '#2C3035', B: '#474D55', C: '#6C747E',
    t: '#381964', T: '#6A33B3', U: '#A26DEE',
    l: '#4F8E12', L: '#AEEB38', E: '#F0FFA8',
    g: '#1C1F21', G: '#4E565C', e: '#C6FF5A',
  },
};
// Warden = Husk + violet cape & radio; Lobber = Husk + orange grenade pods
PAL.warden = { ...PAL.husk, r: '#8A5A1E', R: '#E0A43A' };
PAL.lobber = { ...PAL.husk, r: '#8A4A12', R: '#F09A2A', Y: '#FFE07A' };

// ------------------------------------------------------------------ tiny image type
/** @typedef {{w:number,h:number,px:(string|null)[]}} Img */
/** @returns {Img} */
export function blank(w, h) { return { w, h, px: new Array(w * h).fill(null) }; }
export function fromRows(rows, pal) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const img = blank(w, h);
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const c = pal[r[x]]; if (c) img.px[y * w + x] = c; } });
  return img;
}
const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const darken = (c, f) => toHex(hex(c).map((v) => v * f));
export const mixc = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };

/** Self-coloured outline: every empty pixel touching the figure takes a very dark shade of its neighbour. */
export function selout(src, f = 0.32) {
  const out = blank(src.w + 2, src.h + 2);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) out.px[(y + 1) * out.w + x + 1] = src.px[y * src.w + x];
  const res = { ...out, px: out.px.slice() };
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    if (out.px[y * out.w + x]) continue;
    let n = null;
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= out.w || yy >= out.h) continue;
      const c = out.px[yy * out.w + xx]; if (c) { n = c; break; }
    }
    if (n) res.px[y * out.w + x] = mixc(darken(n, f), '#0B0C0A', 0.35);
  }
  return res;
}
export function mirror(img) { const o = blank(img.w, img.h); for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) o.px[y * img.w + (img.w - 1 - x)] = img.px[y * img.w + x]; return o; }
/** paste b onto a at (dx, dy) */
export function paste(a, b, dx, dy) { for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const c = b.px[y * b.w + x]; const X = x + dx, Y = y + dy; if (c && X >= 0 && Y >= 0 && X < a.w && Y < a.h) a.px[Y * a.w + X] = c; } return a; }
/** nearest-neighbour rotation about (cx, cy), into a canvas of the same size */
export function rotate(img, deg, cx, cy, W = img.w, H = img.h, ox = 0, oy = 0) {
  const o = blank(W, H), a = (-deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = x - ox - cx, Y = y - oy - cy;
    const sx = Math.round(cx + X * ca - Y * sa), sy = Math.round(cy + X * sa + Y * ca);
    if (sx >= 0 && sy >= 0 && sx < img.w && sy < img.h) o.px[y * W + x] = img.px[sy * img.w + sx];
  }
  return o;
}
export function tint(img, col, t) { return { ...img, px: img.px.map((c) => (c ? mixc(c, col, t) : c)) }; }
export function toCanvas(img) {
  const c = document.createElement('canvas'); c.width = img.w; c.height = img.h;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const d = g.createImageData(img.w, img.h);
  img.px.forEach((col, i) => { if (!col) return; const [r, gg, b] = hex(col); d.data.set([r, gg, b, 255], i * 4); });
  g.putImageData(d, 0, 0);
  return c;
}

// ------------------------------------------------------------------ WREN (GOD operative)
// 11 px wide, 18 tall before the outline (Classic: 9×14) — bigger, not busier: the same few colour blocks
const WREN_TOP = {
  S: [
    '...IHHh....',
    '..IHHHHhj..',
    '.IHHHHhhhj.',
    '.hhhhhhhhj.',
    '..VVVVvvv..',
    '..ssssssS..',
    '...sssSS...',
    '.XKKKbkkkq.',
    'XKKKkkbkkqq',
    'XKKKkkkbkqq',
    'sKKKkkkgGqS',
    '.KKKkkgkkq.',
    '.KBBkgkkkq.',
    '.KBBgkkkkq.',
  ],
  E: [
    '..IHHh.....',
    '.IHHHHhj...',
    '.HHHHhhhj..',
    '..hhhhjVVv.',
    '...sssSsS..',
    '....ssSS...',
    '....XKkq...',
    '...XKKkkq..',
    '...KKKkkq..',
    '...KKsgggGGn',
    '...kKKkkq..',
    '...KbBkkq..',
    '...Kkkkkq..',
    '...kkkkqq..',
  ],
  N: [
    '...IHHh....',
    '..IHHHHhj..',
    '.IHHHHhhhj.',
    '.hHHhhhhhj.',
    '..hhhhhhj..',
    '...sssSS...',
    '.XKKKkkkkq.',
    'XKbbKkkbbqq',
    'XKbbKkkbbqq',
    'sKKkkkkkgqS',
    '.KKkkkkgkq.',
    '.KKkkkgkkq.',
    '.KkkkgkkGq.',
    '.Kkkkkkkkq.',
  ],
};
const WREN_LEGS = {
  idle: ['..pPP.ppo..', '..pPP.ppo..', '..pPP.ppo..', '..DDD.ddd..'],
  S0: ['..pPP.ppo..', '..pPP.ppo..', '..DDD.ppo..', '......ddd..'],
  S2: ['..pPP.ppo..', '..pPP.ppo..', '..pPP.ddd..', '..DDD......'],
  E: [
    ['...pPPo....', '..pP..Po...', '.pP....Po..', '.DD....dd..'],
    ['...pPPo....', '....pPo....', '....pPo....', '....DDd....'],
    ['...pPPo....', '..Po..pP...', '.Po....pP..', '.dd....DD..'],
    ['...pPPo....', '....Pop....', '....Pop....', '....ddD....'],
  ],
};
/** @param {'S'|'E'|'N'} view @param {'idle'|'walk'} pose */
export function wren(view, pose = 'idle', frame = 0) {
  let legs;
  if (pose === 'walk') legs = view === 'E' ? WREN_LEGS.E[frame & 3] : (frame & 1 ? WREN_LEGS.idle : (frame & 2 ? WREN_LEGS.S2 : WREN_LEGS.S0));
  else legs = WREN_LEGS.idle;
  const bob = pose === 'walk' && (frame & 1) ? -1 : 0;
  const img = blank(12, 19);
  paste(img, fromRows(legs, PAL.wren), 0, 15);
  paste(img, fromRows(WREN_TOP[view], PAL.wren), 0, 1 + bob);
  return selout(img);
}

// ------------------------------------------------------------------ NOT Husk (and variants)
// a head taller than WREN and much leaner: long skull, lime eyes, violet pauldrons, thin arms apart from
// the body, lime core, long reverse-kneed legs with lime knee joints
const HUSK_TOP = {
  S: [
    '....BCB....',
    '...BCCBA...',
    '...BCBBA...',
    '...AEAEa...',
    '...aAAAa...',
    '....aAa....',
    '.UUTaBAaTt.',
    'UUTtABLAtTt',
    'T..aABAAa.t',
    'B..aAAAAa.a',
    'B...aAAa..a',
    'G...aTTa..a',
    'g...tTTt...',
  ],
  E: [
    '....BCB....',
    '...BCCBB...',
    '...BCBBEE..',
    '...aBAAEe..',
    '...aAAAa...',
    '....aAa....',
    '...UTBAa...',
    '...TtBLa...',
    '...aBBAa...',
    '...aABAagg.',
    '...aAAGGGGe',
    '....aAa....',
    '....tTt....',
  ],
  N: [
    '....BCB....',
    '...BCCBA...',
    '...BCBBA...',
    '...ABBBa...',
    '...aAAAa...',
    '....aAa....',
    '.UUTaAAaTt.',
    'UUTtAAAAtTt',
    'T..aAlAAa.t',
    'B..aAAAAa.a',
    'B...aAAa..a',
    'B...aAAa..G',
    '....tTTt..g',
  ],
};
const HUSK_LEGS = {
  idle: ['....A.a....', '...AA.aa...', '...AL.La...', '...A...a...', '..AA...aa..', '..A.....a..', '..AA...aa..', '.BBB...aaa.'],
  // side view: the knee bends BACKWARDS (to the left when facing east)
  E: [
    ['....Aa.....', '...AL.a....', '..AL...a...', '...A....a..', '....A...a..', '.....A..aa.', '....BB...aa', '...........'],
    ['....Aa.....', '...ALa.....', '...ALa.....', '....Aa.....', '....Aa.....', '.....Aa....', '....BBaa...', '...........'],
    ['....aA.....', '...aL.A....', '..aL...A...', '...a....A..', '....a...A..', '.....a..AA.', '....aa...BB', '...........'],
    ['....aA.....', '...aLA.....', '...aLA.....', '....aA.....', '....aA.....', '.....aA....', '....aaBB...', '...........'],
  ],
  Eidle: ['....Aa.....', '...AL.a....', '...AL.a....', '....A.a....', '....A..a...', '.....A.a...', '....BB.aa..', '...........'],
};
/** @param {'husk'|'warden'|'lobber'} type */
export function husk(view, pose = 'idle', frame = 0, type = 'husk') {
  const legs = view === 'E' ? (pose === 'walk' ? HUSK_LEGS.E[frame & 3] : HUSK_LEGS.Eidle) : HUSK_LEGS.idle;
  const bob = pose === 'walk' && (frame & 1) ? -1 : 0;
  const pal = PAL[type];
  const img = blank(12, 23);
  paste(img, fromRows(legs, pal), 0, 14);
  paste(img, fromRows(HUSK_TOP[view], pal), 0, 2 + bob);
  if (type === 'warden') {
    // violet crest, radio mast, cape down the back
    paste(img, fromRows(view === 'E' ? ['.....Ut....'] : ['....UUt....'], pal), 0, 1 + bob);
    if (view === 'N') paste(img, fromRows(['...TTTTt...', '...TTUTt...', '...tTTTt...', '...tTTtt...', '...tTttt...'], pal), 0, 9 + bob);
    else if (view === 'E') paste(img, fromRows(['..T', '..T', '.tT', '.tt'], pal), 0, 9 + bob);
    paste(img, fromRows(view === 'E' ? ['..l', '..G', '..G'] : ['.........l', '.........G', '.........G'], pal), 0, 3 + bob);
  }
  if (type === 'lobber') paste(img, fromRows(view === 'E' ? ['...RYrR....'] : ['..RYrRYrR..'], pal), 0, 13 + bob);
  return selout(img);
}

// ------------------------------------------------------------------ deaths (Husk, facing east)
/** a Husk "lying" image: the standing figure rotated flat (exact 90°) */
function lying(view = 'E', dirSign = -1) {
  const st = husk(view);
  return rotate(st, dirSign * 90, st.w / 2, st.h - 2, 22, 13, 6 - (dirSign < 0 ? 0 : 0), -8);
}
const BLOOD = { main: '#5BD13A', shade: '#2E7A1C', hi: '#B8F27A' };   // slime (never red — SPEC §2)
function splat(img, x, y, n, seed = 1) {
  const cols = [BLOOD.main, BLOOD.shade, BLOOD.hi];
  for (let i = 0; i < n; i++) {
    const a = (i * 2.4 + seed) % (Math.PI * 2), r = (i % 3) + 1;
    const X = Math.round(x + Math.cos(a) * r), Y = Math.round(y + Math.sin(a) * r * 0.6);
    if (X >= 0 && Y >= 0 && X < img.w && Y < img.h) img.px[Y * img.w + X] = cols[i % 3];
  }
}
/**
 * @param {'shot'|'takedown'|'explosion'} kind
 * @returns {Img[]} frames on a 44×30 canvas, feet anchored at (22, 26)
 */
export function huskDeath(kind) {
  const W = 44, H = 30, fx = 22, fy = 26;
  const st = husk('E');
  const kneel = kneeling();
  const frames = [];
  /** rotate `img` by deg about (pivot x = centre, pivotY) and put that pivot at (fx + dx, fy + dy) */
  const put = (img, deg, dx = 0, dy = 0, pivotY = img.h - 2) => {
    const f = blank(W, H);
    return paste(f, rotate(img, deg, img.w / 2, pivotY, W, H, fx - img.w / 2 + dx, fy - pivotY + dy), 0, 0);
  };
  if (kind === 'shot') {
    // hit in the chest: snaps back, staggers, knees go, falls on his back, bounces once, settles; rifle drops
    const seq = [[-10, -1, 0, st], [-18, -2, 0, st], [-12, -2, 0, kneel], [-40, -3, 0, kneel], [-80, -4, -1, st], [-90, -4, -2, st], [-90, -4, 0, st], [-90, -4, 0, st]];
    seq.forEach(([deg, dx, dy, img], i) => {
      const f = put(img, deg, dx, dy);
      if (i <= 2) splat(f, fx + 3 + i, fy - 13 + i * 2, 4 + i * 2, i);
      if (i >= 5) splat(f, fx - 8, fy + 1, 7 + i, 2);
      if (i >= 4) paste(f, fromRows(['ggGGGe'], PAL.husk), fx + 3, fy - (i === 4 ? 4 : i === 5 ? 2 : 0));
      frames.push(f);
    });
  } else if (kind === 'takedown') {
    // grabbed from behind: jerks upright, sags, drops to his knees, slumps forward, face down
    const seq = [[-6, 0, -1, st], [4, 0, 0, st], [0, 0, 0, kneel], [12, 1, 0, kneel], [35, 2, 0, kneel], [65, 3, 0, kneel], [90, 3, 0, st], [90, 3, 0, st]];
    seq.forEach(([deg, dx, dy, img]) => frames.push(put(img, deg, dx, dy)));
    splat(frames[6], fx + 12, fy, 5, 3); splat(frames[7], fx + 12, fy, 8, 3);
  } else {
    // blast: thrown up and back, tumbling about his middle, lands, bounces, settles charred
    const mid = st.h / 2;
    const seq = [[-15, -2, -12], [-60, -5, -18], [-120, -8, -21], [-180, -10, -19], [-240, -12, -12], [-270, -13, -5], [-265, -13, -8], [-270, -13, -5]];
    seq.forEach(([deg, dx, dy], i) => {
      const f = put(st, deg, dx, dy, mid);
      frames.push(tint(f, '#1A120C', i < 2 ? 0.25 : 0.5));
    });
  }
  return frames;
}
/** the Husk on his knees (legs folded under him) */
function kneeling() {
  const pal = PAL.husk;
  const img = blank(12, 18);
  paste(img, fromRows(['...ALaa....', '..AAL.aa...', '.BBBB..aa..'], pal), 0, 14);
  paste(img, fromRows(HUSK_TOP.E, pal), 0, 1);
  return selout(img);
}

// ------------------------------------------------------------------ Skitter (NOT buggy)
// like the reference vehicles: a light gunmetal body with a bright top edge, violet team panels, a lime
// headlight, fat dark tyres, orange jerrycans on the rear deck; the driver sits up high (the weak spot)
PAL.veh = { ...PAL.husk, m: '#353B42', M: '#5E6670', N: '#8D96A0', W: '#C4CCD4', r: '#8A4A12', R: '#E8922A' };
const SKITTER_E = [
  '...........aBCBa..........',
  '..........aBCEEe..........',
  '...mm.....aTUTa...........',
  '..mNNm...mmTTTmmmm........',
  '.mRRrmmmmMNNNNNNNNWWm.....',
  '.mRRrmNNNNNNNNNNNNNNNWm...',
  '.mmmmMMMMTTTTTTTTMMMMMNm..',
  '.mMMMMMMMUUUUUUUUMMMMMMLm.',
  '..mmmmmmmtttttttmmmmmmmm..',
  '...gGGGg..........gGGGg...',
  '..gGWGGGg........gGWGGGg..',
  '..gGGGGGg........gGGGGGg..',
  '...ggggg..........ggggg...',
];
export function skitter() { return selout(fromRows(SKITTER_E, PAL.veh)); }
export function skitterWreck() { return tint(skitter(), '#1A1410', 0.62); }

/**
 * Option B for vehicles (8 facings for free): run an existing New (ray-cast) sprite through an "RTS" filter —
 * brightness posterised to 3 tones per material, metal lifted to light gunmetal, saturation boosted, then a
 * self-coloured dark edge. @param {HTMLCanvasElement} canvas
 */
export function rtsFilter(canvas, { lift = 1.35, sat = 1.35, levels = [0.22, 0.42, 0.66, 0.9] } = {}) {
  const w = canvas.width, h = canvas.height;
  const d = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).getImageData(0, 0, w, h).data;
  const img = blank(w, h);
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] < 128) continue;
    let r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255;
    const Y = 0.3 * r + 0.59 * g + 0.11 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    // grey metal: lift it toward light gunmetal; coloured parts keep their hue, saturated
    let y2 = Math.min(1, Y * (chroma < 0.12 ? lift : 1.1));
    const q = levels.reduce((best, v) => (Math.abs(v - y2) < Math.abs(best - y2) ? v : best), levels[0]);
    const k = Y > 0.001 ? q / Y : 0;
    const m = (Y + (r - Y) * sat) * k, n = (Y + (g - Y) * sat) * k, o = (Y + (b - Y) * sat) * k;
    img.px[i] = toHex([m * 255, n * 255, o * 255].map((v) => Math.max(0, Math.min(255, v))));
  }
  return selout(img);
}

// ------------------------------------------------------------------ explosions with debris (vehicle / building)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const FIRE = ['#FFFBE0', '#FFE27A', '#FFB23A', '#EE7422', '#B8421A', '#6E2A16'];
const SMOKE = ['#6A625C', '#4E4844', '#36322F'];
/**
 * A deterministic little physics sim: a cluster of fire puffs (each a hot core inside a cooler rim, cooling
 * white → yellow → orange → red-brown, then turning to smoke that rises and thins by dithering), a dust
 * ring, and chunks of the vehicle/building thrown on ballistic arcs — they tumble, bounce once, settle, and
 * some keep smoking. Returns a function that draws time t (s) with the blast centred on (x, y).
 * @param {'vehicle'|'building'} kind
 */
export function explosion(kind, seed = 3) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const big = kind === 'building';
  const debrisCols = big ? ['#8D96A0', '#5E6670', '#9A8A6A', '#353B42'] : ['#8D96A0', '#6A33B3', '#5E6670', '#C4CCD4'];
  const chunks = Array.from({ length: big ? 20 : 12 }, () => {
    const a = rnd() * Math.PI * 2, sp = (big ? 22 : 28) + rnd() * 34;
    return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: 70 + rnd() * (big ? 90 : 110), size: 1 + Math.floor(rnd() * (big ? 3 : 2.2)), col: debrisCols[Math.floor(rnd() * debrisCols.length)], spin: 6 + rnd() * 10, smoke: rnd() < 0.45 };
  });
  const puffs = Array.from({ length: big ? 16 : 10 }, (_, i) => ({
    dx: (rnd() - 0.5) * (big ? 26 : 16), dy: (rnd() - 0.5) * (big ? 10 : 6), r: (big ? 4 : 3) + rnd() * (big ? 5 : 3.5),
    t0: (i / (big ? 16 : 10)) * (big ? 0.45 : 0.3), life: (big ? 1.4 : 1.1) + rnd() * 0.6, rise: (big ? 20 : 14) + rnd() * 12,
  }));
  const G = 240;
  /** @param {CanvasRenderingContext2D} g */
  return (g, x, y, t) => {
    // scorch
    if (t > 0.05) {
      const rx = big ? 16 : 10, ry = big ? 7 : 4;
      g.fillStyle = 'rgba(20,14,10,0.45)';
      for (let yy = -ry; yy <= ry; yy++) { const w = Math.round(rx * Math.sqrt(1 - (yy * yy) / (ry * ry))); g.fillRect(x - w, y + yy, 2 * w + 1, 1); }
    }
    // dust ring
    if (t < 0.6) {
      const R = 4 + t * (big ? 70 : 50);
      g.globalAlpha = 1 - t / 0.6; g.fillStyle = '#E2CFA2';
      for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; g.fillRect(Math.round(x + Math.cos(a) * R), Math.round(y + Math.sin(a) * R * 0.45), 2, 1); }
      g.globalAlpha = 1;
    }
    // debris (drawn before the fire so the fireball hides the launch)
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
      const X = Math.round(x + gx), Y = Math.round(y + gy), Z = Math.round(z);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(X, Y, c.size, 1);                    // ground shadow
      // tumbling: the chunk's footprint cycles wide → square → tall
      const ph = bounce < 2 ? Math.floor(t * c.spin) % 3 : 0;
      const w = ph === 0 ? c.size + 1 : ph === 1 ? c.size : Math.max(1, c.size - 1), h = ph === 2 ? c.size + 1 : ph === 1 ? c.size : Math.max(1, c.size - 1);
      g.fillStyle = '#141210'; g.fillRect(X + 1, Y - Z + 1, w, h);                     // dark lower-right edge
      g.fillStyle = bounce === 2 ? darken(c.col, 0.6) : c.col; g.fillRect(X, Y - Z, w, h);
      if (bounce < 2 && t < 0.6) { g.fillStyle = '#FFE27A'; g.fillRect(X, Y - Z, 1, 1); } // still glowing
      if (c.smoke && t < 3) {                                                            // a smoking scrap
        g.fillStyle = SMOKE[1];
        for (let k = 0; k < 3; k++) { const q = ((t * 1.5 + k / 3) % 1); if (BAYER[(k * 5 + Math.floor(t * 8)) & 15] > 1 - q) continue; g.fillRect(X + Math.round(Math.sin(q * 6 + k) * 1.5), Y - Z - 2 - Math.round(q * 8), 2, 2); }
      }
    }
    // fire → smoke puffs: a hot core inside a cooler rim; later dithered smoke that rises and thins
    for (const p of puffs) {
      const k = (t - p.t0) / p.life;
      if (k < 0 || k > 1) continue;
      const r = Math.max(1, Math.round(p.r * (0.6 + Math.min(1, k * 2.2) * 0.8)));
      const cx = Math.round(x + p.dx * (0.7 + k * 0.6)), cy = Math.round(y - 3 + p.dy - k * p.rise);
      const smoke = k > 0.5;
      const hot = Math.min(FIRE.length - 1, Math.floor(k * 2 * FIRE.length));
      for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
        const d = Math.sqrt(xx * xx + yy * yy) / r;
        if (d > 1) continue;
        const X = cx + xx, Y = cy + yy;
        if (smoke) {
          const fade = (k - 0.5) / 0.5;                                   // 0 → 1: thin it out by dithering
          if (BAYER[(Y & 3) * 4 + (X & 3)] < fade * 0.9 + d * 0.25) continue;
          g.fillStyle = SMOKE[Math.min(2, Math.floor(d * 2 + fade))];
        } else {
          g.fillStyle = FIRE[Math.min(FIRE.length - 1, hot + (d > 0.72 ? 2 : d > 0.4 ? 1 : 0))];
        }
        g.fillRect(X, Y, 1, 1);
      }
    }
  };
}
