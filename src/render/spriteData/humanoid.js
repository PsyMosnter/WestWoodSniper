// @ts-check
import { Pix, pack } from '../pixel.js';

/**
 * Infantry sprites (SPEC §4.5): palette-indexed upper-body grids per view (authored here),
 * legs/arms/weapons composed procedurally per animation frame, auto-outlined.
 * Views: S, SE, E, NE, N — W-facing directions are mirrored by the sprite compiler.
 * Frame canvas: 17×20, ground anchor at (8, 17).
 */
export const HW = 17, HH = 20, HAX = 8, HAY = 17;

/** GOD Operative "WREN" */
export const OPERATIVE = {
  palette: 'GOD',
  legLen: 4,
  pants: 'q', pantsD: 'p', boots: 'd', gun: 'g', gunL: 'G',
  outline: 'k',
  views: {
    S: [
      '.OOoo.',
      'OOooop',
      '.vvvv.',
      '.psSp.',
      'KbKKbq',
      'KKbbKq',
      'sKKKKs',
      '.pddp.',
    ],
    SE: [
      '.OOo..',
      'OOooop',
      '.pvvv.',
      '..pss.',
      'KKbKbq',
      'KKKbKq',
      '.sKKKs',
      '.pddp.',
    ],
    E: [
      '.OOo..',
      'OOoooo',
      '.ppvv.',
      '..pss.',
      '.pKKb.',
      '.pKKK.',
      '.pKsK.',
      '..dd..',
    ],
    NE: [
      '..OOo.',
      'pOoooO',
      '.poovv',
      '.pqq..',
      'qpppKK',
      'qpOpKK',
      'sppKKs',
      '.pddp.',
    ],
    N: [
      '.OOoo.',
      'OoooOp',
      '.pooop',
      '.pqqp.',
      'KpppKq',
      'KpOpKq',
      'sKppKs',
      '.pddp.',
    ],
  },
};

/** NOT Husk base (other NOT infantry add gear overlays) */
export const HUSK = {
  palette: 'NOT',
  legLen: 5,
  pants: 'c', pantsD: 'k', boots: 'C', gun: 'g', gunL: 'l',
  outline: 'k',
  views: {
    S: [
      '..cc..',
      '.cCCc.',
      '.ceec.',
      '..cc..',
      'vCccCv',
      'cClLCc',
      'c.cc.c',
      'l.cc.l',
      '..LL..',
    ],
    SE: [
      '..cc..',
      '.cCCc.',
      '.cCee.',
      '..cc..',
      'vCccCv',
      'cCClLc',
      '.c.cc.c',
      '.l.cc.l',
      '..LL..',
    ],
    E: [
      '..cc..',
      '.cCCc.',
      '..cCe.',
      '..cc..',
      '.vCcv.',
      '.cCCl.',
      '.c.cc.',
      '.l.cc.',
      '..LL..',
    ],
    NE: [
      '..cc..',
      '.cCCc.',
      '.cCCe.',
      '..cc..',
      'vcCCcv',
      'ccvCcc',
      'c.cc.c',
      'l.cc.l',
      '..LL..',
    ],
    N: [
      '..cc..',
      '.cCCc.',
      '.cCCc.',
      '..cc..',
      'vcCCcv',
      'ccvvcc',
      'c.cc.c',
      'l.cc.l',
      '..LL..',
    ],
  },
};

const VIEW_OF_DIR = ['N', 'NE', 'E', 'SE', 'S', 'SE', 'E', 'NE']; // index by dir 0..7
export function viewForDir(d) { return VIEW_OF_DIR[d]; }
export function mirroredDir(d) { return d >= 5; } // SW, W, NW

function put(p, pal, x, y, ch) { const c = pal[ch]; if (c) p.set(x, y, c); }

/**
 * @param {any} def  unit def (OPERATIVE / HUSK)
 * @param {Record<string,string>} pal palette
 * @param {string} pose  idle|walk|run|crouch|cover|prone|pistol|dead|fire
 * @param {string} view  S|SE|E|NE|N
 * @param {number} frame
 * @param {{weapon?: string, gear?: (p:Pix, ctx:any)=>void}} [opt]
 */
export function drawHumanoid(def, pal, pose, view, frame, opt = {}) {
  const p = new Pix(HW, HH);
  const ax = HAX, ay = HAY;
  const rows = def.views[view];
  const gh = rows.length;
  const legLen = def.legLen;
  const weapon = opt.weapon ?? 'rifle';

  if (pose === 'prone') { drawProne(p, def, pal, view, weapon); p.outline(pal[def.outline]); return p; }

  const crouch = pose === 'crouch' || pose === 'cover';
  const drop = crouch ? (pose === 'cover' ? 3 : 2) : 0;
  let bob = 0, lean = 0;
  if (pose === 'walk' || pose === 'pistol') bob = (frame & 1) ? -1 : 0;
  if (pose === 'run') { bob = (frame & 1) ? -1 : 0; lean = view === 'E' || view === 'SE' || view === 'NE' ? 1 : 0; }
  if (pose === 'cover') lean = (view === 'E' || view === 'SE' || view === 'NE') ? 1 : 0;
  const hipY = ay - legLen + drop;
  const gx = ax - 3 + lean;
  const gy = hipY - gh + 1 + bob;
  const side = view === 'E' || view === 'SE' || view === 'NE';
  const back = view === 'N' || view === 'NE';
  const ctx = { gx, gy, ax, ay, hipY, view, pose, frame, side, back, crouch, pal };

  // weapon behind the body for back views
  if (back) drawWeapon(p, def, pal, ctx, weapon, pose);

  // legs
  drawLegs(p, def, pal, ctx);

  // upper body grid
  for (let y = 0; y < gh; y++) {
    const r = rows[y];
    for (let x = 0; x < r.length; x++) {
      const ch = r[x];
      if (ch === '.') continue;
      put(p, pal, gx + x, gy + y, ch);
    }
  }
  // arm swing on walk/run for front/back views
  if ((pose === 'walk' || pose === 'run') && !side) {
    const sw = frame === 0 ? 1 : frame === 2 ? -1 : 0;
    if (sw) {
      const armRow = gy + gh - 3;
      const lx = gx, rx = gx + 5;
      if (sw > 0) { p.clear(lx, armRow + 1); put(p, pal, lx, armRow - 0, rows[gh - 3][0] === '.' ? def.pants : rows[gh - 3][0]); }
      else { p.clear(rx, armRow + 1); }
    }
  }
  if (opt.gear) opt.gear(p, ctx);
  if (!back) drawWeapon(p, def, pal, ctx, weapon, pose);
  p.outline(pal[def.outline]);
  if (pose === 'fire') muzzle(p, ctx, weapon);
  return p;
}

function legLine(p, pal, def, x0, y0, x1, y1, near) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / steps), y = Math.round(y0 + (y1 - y0) * i / steps);
    const last = i === steps;
    put(p, pal, x, y, last ? def.boots : near ? def.pants : def.pantsD);
    if (def.legLen <= 4) put(p, pal, x + 1, y, last ? def.boots : def.pantsD);
  }
}

function drawLegs(p, def, pal, c) {
  const { ax, ay, hipY, view, pose, frame, side, crouch } = c;
  const thin = def.legLen > 4; // NOT: thin, jointed legs
  if (crouch) {
    if (side) {
      // one knee forward, one foot back
      legLine(p, pal, def, ax, hipY + 1, ax + 2, ay - 1, true);
      put(p, pal, ax + 2, ay, def.boots);
      legLine(p, pal, def, ax - 1, hipY + 1, ax - 2, ay, false);
    } else {
      legLine(p, pal, def, ax - 2, hipY + 1, ax - 3, ay, true);
      legLine(p, pal, def, ax + 1, hipY + 1, ax + 2, ay, true);
    }
    return;
  }
  const moving = pose === 'walk' || pose === 'run' || pose === 'pistol';
  if (side) {
    let spread = 0;
    if (moving) spread = pose === 'run' ? [3, 1, -3, -1][frame & 3] : [2, 0, -2, 0][frame & 3];
    const diag = view !== 'E';
    const dy = diag ? (view === 'SE' ? 1 : -1) : 0;
    const f1x = ax + spread, f2x = ax - spread - (spread === 0 ? 1 : 0);
    const f1y = ay - (diag && spread ? (spread > 0 ? 0 : 1) : 0), f2y = ay - (diag && spread ? (spread > 0 ? 1 : 0) : 0);
    if (thin) {
      // backward-kinked knees (too many joints)
      const kx = (fx) => Math.round((ax + fx) / 2) - 1;
      const ky = hipY + Math.ceil(def.legLen / 2);
      legLine(p, pal, def, ax - 1, hipY + 1, kx(f2x), ky, false); legLine(p, pal, def, kx(f2x), ky, f2x, f2y, false);
      legLine(p, pal, def, ax, hipY + 1, kx(f1x), ky, true); legLine(p, pal, def, kx(f1x), ky, f1x, f1y, true);
    } else {
      legLine(p, pal, def, ax - 1, hipY + 1, f2x - (dy < 0 ? 0 : 0), f2y, false);
      legLine(p, pal, def, ax, hipY + 1, f1x, f1y, true);
    }
    return;
  }
  // front/back: alternate lifting
  const liftL = moving && (frame & 3) === 0 ? 1 : 0;
  const liftR = moving && (frame & 3) === 2 ? 1 : 0;
  const run = pose === 'run' ? 1 : 0;
  if (thin) {
    legLine(p, pal, def, ax - 1, hipY + 1, ax - 2, ay - liftL - run * liftL, true);
    legLine(p, pal, def, ax + 1, hipY + 1, ax + 2, ay - liftR - run * liftR, true);
  } else {
    legLine(p, pal, def, ax - 2, hipY + 1, ax - 2, ay - liftL - run * liftL, true);
    legLine(p, pal, def, ax, hipY + 1, ax, ay - liftR - run * liftR, true);
  }
}

function drawWeapon(p, def, pal, c, weapon, pose) {
  if (weapon === 'none') return;
  const { gx, gy, view, crouch } = c;
  const G = def.gun, GL = def.gunL;
  const line = (pts, col = G) => { for (const [x, y] of pts) put(p, pal, gx + x, gy + y, col); };
  const aim = crouch || pose === 'fire' || pose === 'aim';
  if (weapon === 'pistol' || pose === 'pistol') {
    // rifle slung across the back, pistol in hand forward
    if (view === 'S') { line([[5, 1], [6, 0]]); line([[4, 7], [4, 8]], G); }
    else if (view === 'SE') { line([[0, 1], [-1, 0]]); line([[5, 6], [6, 6], [6, 7]]); }
    else if (view === 'E') { line([[0, 2], [-1, 1]]); line([[4, 5], [5, 5], [6, 5]]); }
    else if (view === 'NE') { line([[5, 5], [6, 4]]); }
    else { line([[0, 7], [1, 6], [2, 5], [3, 4], [4, 3], [5, 2], [6, 1]]); }
    return;
  }
  if (weapon === 'launcher') {
    if (view === 'S') line([[5, 2], [5, 3], [5, 4], [5, 5], [5, 6]], G), line([[5, 1]], GL);
    else if (view === 'E' || view === 'SE') line([[-1, 3], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3]], G), line([[7, 3]], GL);
    else line([[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]], G), line([[0, 0]], GL);
    return;
  }
  if (weapon === 'grenade') {
    if (view === 'S' || view === 'SE') line([[5, 6]], 'o');
    else if (view === 'E') line([[4, 6]], 'o');
    return;
  }
  if (weapon === 'claw') return;
  const long = weapon === 'rifle';
  if (aim) {
    if (view === 'S') line(long ? [[3, 4], [3, 5], [3, 6], [3, 7]] : [[3, 5], [3, 6]]), line([[2, 4]], GL);
    else if (view === 'SE') line(long ? [[3, 4], [4, 5], [5, 5], [6, 6], [7, 6]] : [[4, 5], [5, 5], [6, 6]]), line([[4, 4]], GL);
    else if (view === 'E') { line(long ? [[1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4]] : [[3, 4], [4, 4], [5, 4], [6, 4]]); line([[3, 3], [4, 3]], GL); }
    else if (view === 'NE') line(long ? [[3, 4], [4, 3], [5, 3], [6, 2], [7, 1]] : [[4, 3], [5, 3], [6, 2]]);
    else line(long ? [[3, 3], [3, 2], [3, 1], [3, 0], [3, -1], [3, -2]] : [[3, 1], [3, 0], [3, -1]]);
  } else {
    if (view === 'S') line(long ? [[0, 7], [1, 6], [2, 6], [3, 5], [4, 5], [5, 4], [6, 3]] : [[1, 6], [2, 6], [3, 5], [4, 5]]), line([[3, 4]], GL);
    else if (view === 'SE') line(long ? [[1, 6], [2, 6], [3, 6], [4, 5], [5, 5], [6, 5], [7, 4]] : [[2, 6], [3, 6], [4, 5], [5, 5]]), line([[4, 4]], GL);
    else if (view === 'E') line(long ? [[0, 6], [1, 6], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 4]] : [[2, 5], [3, 5], [4, 5], [5, 5], [6, 5]]), line([[3, 4]], GL);
    else if (view === 'NE') line(long ? [[0, 6], [1, 5], [2, 5], [3, 4], [4, 3], [5, 3], [6, 2]] : [[1, 5], [2, 5], [3, 4], [4, 3]]);
    else line(long ? [[0, 7], [1, 6], [2, 5], [3, 4], [4, 3], [5, 2], [6, 1], [7, 0]] : [[1, 6], [2, 5], [3, 4], [4, 3]]);
  }
}

function muzzle(p, c, weapon) {
  const { gx, gy, view } = c;
  const tip = { S: [3, 8], SE: [8, 7], E: [9, 4], NE: [8, 0], N: [3, -3] }[view];
  const [x, y] = [gx + tip[0], gy + tip[1]];
  p.set(x, y, '#FFF1A8'); p.set(x + 1, y, '#FFC24A'); p.set(x - 1, y, '#FFC24A'); p.set(x, y - 1, '#FFC24A'); p.set(x, y + 1, '#FF7A1A');
}

/** Prone / hunkered: a body drawn along the facing vector (works for all views). */
function drawProne(p, def, pal, view, weapon) {
  const ang = { S: Math.PI / 2, SE: Math.PI / 4, E: 0, NE: -Math.PI / 4, N: -Math.PI / 2 }[view];
  const fx = Math.cos(ang), fy = Math.sin(ang) * 0.75;
  const px = -Math.sin(ang), py = Math.cos(ang) * 0.75;
  const cx = HAX + 0.5, cy = HAY - 2.5;
  const seg = (a, b, w, col) => {
    for (let t = a; t <= b; t += 0.5) for (let k = -w; k <= w; k += 0.5) put(p, pal, cx + fx * t + px * k, cy + fy * t + py * k, col);
  };
  const isNot = def.palette === 'NOT';
  const leg = (off, col) => { for (let t = -6; t <= -2; t += 0.5) put(p, pal, cx + fx * t + px * (off + (t + 2) * 0.12 * Math.sign(off)), cy + fy * t + py * (off + (t + 2) * 0.12 * Math.sign(off)), col); };
  leg(-1, def.pants); leg(1, def.pantsD);
  put(p, pal, cx + fx * -6.5 + px * -1.8, cy + fy * -6.5 + py * -1.8, def.boots); put(p, pal, cx + fx * -6.5 + px * 1.8, cy + fy * -6.5 + py * 1.8, def.boots);
  seg(-2, 2, 1.8, isNot ? 'c' : 'K');          // torso
  seg(-1.5, 1.5, 0.6, isNot ? 'v' : 'b');      // straps / trim
  seg(3, 4.5, 1.3, isNot ? 'c' : 'o');         // head / helmet
  seg(3.5, 4, 0.5, isNot ? 'C' : 'O');
  if (!isNot && (view === 'S' || view === 'SE' || view === 'E')) put(p, pal, cx + fx * 4.5, cy + fy * 4.5, 'v');
  if (isNot) put(p, pal, cx + fx * 4.5, cy + fy * 4.5, 'e');
  if (weapon === 'rifle') for (let t = 2; t <= 8; t += 0.5) put(p, pal, cx + fx * t + px * 1.6, cy + fy * t + py * 1.6, def.gun);
}

/** Corpse frames (death animation 4 frames, last is the lying corpse). */
export function drawDeath(def, pal, view, frame) {
  if (frame < 2) {
    const p = drawHumanoid(def, pal, frame === 0 ? 'idle' : 'crouch', view, 0, { weapon: 'none' });
    return p;
  }
  const p = new Pix(HW, HH);
  const tilt = frame === 2;
  const isNot = def.palette === 'NOT';
  const cy = HAY - 2;
  // lying sideways, limbs splayed
  for (let x = 2; x <= 14; x++) {
    const t = (x - 2) / 12;
    const y = cy + (tilt ? Math.round((1 - t) * 3) - 2 : 0);
    const col = x < 6 ? def.pants : x < 11 ? (isNot ? 'c' : 'K') : (isNot ? 'C' : 'o');
    put(p, pal, x, y, col); put(p, pal, x, y - 1, x < 6 ? def.pantsD : col);
  }
  if (!tilt) { put(p, pal, 7, cy - 2, isNot ? 'c' : 'K'); put(p, pal, 8, cy - 3, isNot ? 'c' : 's'); put(p, pal, 4, cy + 1, def.boots); put(p, pal, 13, cy - 2, isNot ? 'e' : 'v'); }
  p.outline(pal[def.outline]);
  return p;
}
