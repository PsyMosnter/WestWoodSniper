// @ts-check
/**
 * Overseer Vrask, inked — the low-angle villain shot: seen from the snow at his boots, arms folded, cape cracking
 * in the wind, the lime visor lighting him from below; a storm of jagged clouds overhead and his column of Husks
 * trudging along the ridge behind.
 */
import { rng, rim, crescent, forest, glow } from './paint.js';
import { subtract } from '../../render/ink.js';

const INK = '#0E0A16';
export const VC = {
  body: ['#6A7482', '#434B56', '#2A3038', '#171A20'],
  plate: ['#D0A8FF', '#A066EE', '#6E36BA', '#3E1C70'],
  lime: ['#F4FFC0', '#C6FF5A', '#8CD83A', '#4E8A1E'],
  cape: ['#7A58AA', '#52307E', '#341A58', '#1E0E36'],
  snow: ['#FFFFFF', '#DCE6F4', '#AAB8D2', '#7A88A8'],
};

/** jagged storm clouds (DOTT-like): an angular band with zig-zag edges, three tones */
function stormBand(k, y, h, seed, cols, t) {
  const R = rng(seed), top = [], bot = [];
  const drift = t * 6;
  for (let x = -80; x <= 580; x += 14 + R() * 18) {
    top.push([x + drift, y - h * (0.3 + R() * 0.7), 1]);
    bot.push([x + drift + 6, y + h * (0.1 + R() * 0.5), 1]);
  }
  const pts = [...top, ...bot.reverse()];
  const m = k.shape(pts, { fill: cols[0], smooth: false });
  k.save(); k.clip(m);
  k.save(); k.translate(3, 5); k.shape(pts, { fill: cols[1], smooth: false }); k.restore();
  k.save(); k.translate(6, 11); k.shape(pts, { fill: cols[2], smooth: false }); k.restore();
  k.restore();
  return m;
}

export function vraskShot(k, t, st) {
  const R = rng(3);
  // --- sky: pale and cold, a storm of jagged cloud bands
  k.rect(-60, -10, 600, 290, { fill: { grad: [[0, '#5E6690'], [0.35, '#9AA6C8'], [0.7, '#D0DAEC'], [1, '#E8EEF6']], from: [0, 0], to: [0, 220 * k.h / 270] } });
  stormBand(k, 40, 26, 5, ['#E4EAF6', '#8A88AE', '#56527A'], t * 0.6);
  stormBand(k, 96, 20, 9, ['#EEF2FA', '#A2A2C2', '#6E6A92'], t * 0.9);
  stormBand(k, 142, 14, 13, ['#F2F4FA', '#B8BCD4', '#8A8AAA'], t * 1.2);
  // --- far peaks with snow caps
  const peaks = [];
  for (let x = -40, i = 0; x <= 540; x += 22 + R() * 26, i++) peaks.push([x, i % 2 ? 150 + R() * 14 : 112 + R() * 26, 1]);
  const pts = [[560, 260, 1], [-60, 260, 1], ...peaks];
  const pm = k.shape(pts, { fill: '#8290B2', smooth: false });
  k.save(); k.clip(pm);
  k.save(); k.translate(0, 16); k.shape(pts, { fill: '#6E7CA0', smooth: false }); k.restore();
  k.save(); k.translate(-6, -10); k.shape(pts, { fill: '#8290B2', smooth: false }); k.restore();
  const cm = k.shape([[560, 260, 1], [-60, 260, 1], ...peaks.map(([x, y]) => [x, y + 14, 1])], { paint: false, smooth: false });
  k.paint(subtract(pm, cm), VC.snow[1]);
  rim(k, pm, -2, -1, '#FFFFFF');
  k.restore();
  // --- an outpost mast, its warning light blinking lime
  k.stroke([[430, 196], [436, 84]], 2, '#3A4058');
  for (let y = 96; y < 196; y += 12) k.stroke([[430 + (196 - y) * 0.055, y], [438 + (196 - y) * 0.0, y + 8]], 1, '#3A4058');
  if (Math.floor(t * 2) % 2 === 0) { k.tint(k.ellipse(436, 82, 7, 7, 0, { paint: false }), VC.lime[1], 0.6); k.ellipse(436, 82, 2.5, 2.5, 0, { fill: VC.lime[0] }); }
  // --- the ridge with his column of Husks trudging along it
  const ridge = forest(k, -40, 540, 206, 21, { fill: '#6A769A', hmin: 0, hmax: 0, hill: 12, step: 40 });
  k.save(); k.clip(ridge); rim(k, ridge, 0, -2, VC.snow[1]); k.restore();
  for (let i = 0; i < 5; i++) {
    const x = 6 + i * 30 + ((t * 6) % 30) - 30, y = 200 - Math.sin((x + 40) * 0.011) * 4, st2 = Math.sin(t * 5 + i * 1.3), bob = Math.abs(st2) * 1.2;
    k.stroke([[x - 1, y - 2], [x - 3 - st2 * 2, y + 7]], 2, '#2E3450'); k.stroke([[x + 1, y - 2], [x + 3 + st2 * 2, y + 7]], 2, '#2E3450');
    k.shape([[x - 4, y - 1], [x - 4, y - 9 - bob], [x - 1, y - 12 - bob], [x + 3, y - 12 - bob], [x + 5, y - 8 - bob], [x + 4, y - 1]], { fill: '#2E3450' });
    k.ellipse(x + 0.5, y - 15 - bob, 3.2, 4, 0, { fill: '#2E3450' });
    k.stroke([[x + 4, y - 9 - bob], [x + 10, y - 13 - bob]], 1.2, '#2E3450');                 // rifle on the shoulder
    k.rect(Math.round(x + 1), Math.round(y - 16 - bob), 2, 1, { fill: VC.lime[1] });
    k.ellipse(x - 3, y - 11 - bob, 2, 1.5, 0, { fill: '#5E3A92' });
  }
  // --- the snowy ledge he stands on
  const ledge = k.shape([[-40, 234], [60, 226], [150, 232], [240, 226], [330, 230], [420, 222], [540, 230], [540, 290], [-40, 290]], { fill: VC.snow[1], line: INK, lw: 2 });
  k.save(); k.clip(ledge); crescent(k, ledge, 0, 8, VC.snow[2]); k.restore();

  // --- VRASK, from the snow at his boots (a dutch tilt): a lanky alien officer, arms folded, sneering down at us
  k.save(); k.translate(210, 34); k.scale(1.12); k.rotate(-0.05); k.translate(-210, 12);           // from the knees up, looming
  const flap = (i) => Math.sin(t * 9 + i * 0.8) * (3 + i * 0.9);
  const capePts = [[246, 88], [288, 94], [330, 102 + flap(1)], [372, 112 + flap(2)], [414, 126 + flap(3)], [462, 140 + flap(4), 1], [448, 160 + flap(4)], [462, 184 + flap(5), 1], [424, 184 + flap(4)], [414, 210 + flap(5), 1], [374, 194 + flap(3)], [336, 212 + flap(2), 1], [298, 190], [246, 170]];
  const cape = k.shape(capePts, { fill: VC.cape[1], line: INK, lw: 3 });
  k.save(); k.clip(cape);
  crescent(k, cape, -14, -10, VC.cape[2]);
  for (let i = 0; i < 4; i++) k.stroke([[288 + i * 6, 100 + i * 4], [336 + i * 20, 142 + flap(i + 1) + i * 6], [376 + i * 22, 190 + flap(i + 2)]], [1, 4, 1], VC.cape[3]);
  rim(k, cape, 0, -2, VC.cape[0]);
  k.restore();
  const SKYRIM = '#9AA6C8';
  // legs: long and thin, spread wide, growing towards us — thigh, knee guard, shin, boot
  for (const [hip, knee, ankle, w0, w1, w2] of [[[193, 136], [180, 190], [162, 236], 30, 22, 26], [[225, 136], [239, 190], [258, 236], 30, 22, 26]]) {
    const leg = k.stroke([hip, knee, ankle], [w0 + 4, w1 + 4, w2 + 4], INK);
    void leg;
    const lm = k.stroke([hip, knee, ankle], [w0, w1, w2], VC.body[2]);
    k.save(); k.clip(lm); crescent(k, lm, -9, 0, VC.body[3]); rim(k, lm, -2, -1, SKYRIM); k.restore();
    const [kx, ky] = knee;
    const kg = k.shape([[kx - 11, ky - 2, 1], [kx, ky - 12, 1], [kx + 11, ky - 2, 1], [kx + 6, ky + 9, 1], [kx - 6, ky + 9, 1]], { fill: VC.plate[1], line: INK, lw: 2, smooth: false });
    k.save(); k.clip(kg); crescent(k, kg, -3, -3, VC.plate[3]); rim(k, kg, -1, -1, VC.plate[0]); k.restore();
    const [bx, by] = ankle;
    const boot = k.shape([[bx - 16, by - 8], [bx + 16, by - 8], [bx + 22, by + 22, 1], [bx - 22, by + 22, 1]], { fill: VC.body[3], line: INK, lw: 3 });
    k.save(); k.clip(boot); rim(k, boot, -1, -2, SKYRIM); k.stroke([[bx - 18, by + 4], [bx + 18, by + 4]], 2, VC.plate[2]); k.restore();
  }
  // a drift of snow over his boots
  const drift = k.shape([[120, 244], [150, 234], [176, 240], [210, 236], [246, 240], [276, 232], [304, 242], [304, 262], [120, 262]], { fill: VC.snow[0], line: INK, lw: 2 });
  k.save(); k.clip(drift); crescent(k, drift, 0, 5, VC.snow[2]); k.restore();
  // torso: narrow waist, belt, a chest that widens to pointed pauldrons
  const torso = k.shape([[186, 140], [234, 140], [252, 98], [210, 86], [168, 98]], { fill: VC.body[2], line: INK, lw: 3 });
  k.save(); k.clip(torso); crescent(k, torso, -14, -6, VC.body[3]); rim(k, torso, -2, -1, SKYRIM);
  const cp = k.shape([[178, 96], [242, 96], [228, 118], [210, 128], [192, 118]], { fill: VC.plate[2], line: INK, lw: 2 });
  k.save(); k.clip(cp); rim(k, cp, -1, -2, VC.plate[0]); crescent(k, cp, -6, -4, VC.plate[3]); k.restore();
  k.shape([[204, 104, 1], [216, 104, 1], [210, 116, 1]], { fill: VC.lime[1], line: INK, lw: 1, smooth: false });   // the emblem
  k.restore();
  const belt = k.shape([[184, 128], [236, 128], [236, 140], [184, 140]], { fill: VC.body[3], line: INK, lw: 2 });
  void belt;
  k.rect(206, 129, 8, 10, { fill: VC.lime[2], line: INK, lw: 1 });
  for (const px of [188, 222]) k.rect(px, 130, 9, 11, { fill: VC.body[1], line: INK, lw: 1 });
  // arms folded: upper arms down the sides, forearms crossed over the chest, long gauntleted hands
  for (const [sh, el, sd] of [[[168, 96], [160, 126], -1], [[252, 96], [262, 124], 1]]) {
    k.stroke([sh, el], [18, 15], INK);
    const ua = k.stroke([sh, el], [14, 11], VC.body[2]);
    k.save(); k.clip(ua); rim(k, ua, -2, 0, SKYRIM); k.restore();
    void sd;
  }
  for (const [el, hand, sd] of [[[160, 126], [238, 112], 1], [[262, 124], [184, 108], -1]]) {
    k.stroke([el, hand], [17, 14], INK);
    const fa = k.stroke([el, hand], [13, 10], VC.body[1]);
    k.save(); k.clip(fa); crescent(k, fa, 0, -5, VC.body[2]); rim(k, fa, 0, -2, VC.lime[2]); k.restore();
    const g = k.shape([[el[0] + (hand[0] - el[0]) * 0.45, el[1] + (hand[1] - el[1]) * 0.45 - 7], [el[0] + (hand[0] - el[0]) * 0.75, el[1] + (hand[1] - el[1]) * 0.75 - 7], [el[0] + (hand[0] - el[0]) * 0.75, el[1] + (hand[1] - el[1]) * 0.75 + 6], [el[0] + (hand[0] - el[0]) * 0.45, el[1] + (hand[1] - el[1]) * 0.45 + 7]], { fill: VC.plate[2], line: INK, lw: 2 });
    k.save(); k.clip(g); rim(k, g, 0, -2, VC.plate[0]); k.restore();
    // long fingers wrapped over the other arm
    for (let i = 0; i < 3; i++) k.stroke([[hand[0], hand[1] - 3 + i * 3], [hand[0] + sd * 7, hand[1] - 4 + i * 3.5], [hand[0] + sd * 9, hand[1] + i * 3.5]], [2.6, 2.2, 1.6], INK);
  }
  // pauldrons: angular, swept up into points
  for (const [cx, cy, sd] of [[166, 92, -1], [254, 92, 1]]) {
    for (const [dy, sc, col] of [[9, 0.8, VC.plate[2]], [0, 1, VC.plate[1]]]) {
      const p = k.shape([[cx - sd * 14 * sc, cy + 10 + dy, 1], [cx + sd * 30 * sc, cy + 12 + dy, 1], [cx + sd * 38 * sc, cy - 14 * sc + dy, 1], [cx + sd * 16 * sc, cy - 8 * sc + dy], [cx - sd * 12 * sc, cy - 4 + dy]], { fill: col, line: INK, lw: 3 });
      k.save(); k.clip(p); crescent(k, p, sd < 0 ? 8 : -10, -6, VC.plate[3]); rim(k, p, -1, -2, VC.plate[0]); k.restore();
    }
    k.stroke([[cx - sd * 10, cy + 12], [cx + sd * 28, cy + 14]], 2, VC.lime[2]);
  }
  // neck and head from below: a pointed jaw, a sneer, slit eyes glowing, the tall swept-back crest
  k.shape([[200, 90], [220, 90], [222, 74], [198, 74]], { fill: VC.body[3], line: INK, lw: 2 });
  const face = k.shape([[193, 56], [227, 56], [230, 68], [220, 82], [210, 88, 1], [200, 82], [190, 68]], { fill: VC.body[2], line: INK, lw: 2 });
  k.save(); k.clip(face); crescent(k, face, 0, -5, VC.body[3]); rim(k, face, 0, 2, VC.lime[3]); rim(k, face, -2, 0, SKYRIM); k.restore();
  k.stroke([[202, 78], [210, 76], [217, 79]], [1, 1.8, 1.2], INK);                                   // the sneer
  k.shape([[213, 77.5], [215, 81, 1], [216.5, 77.5]], { fill: '#F4F0E0', smooth: false });           // a fang
  const narrow = st.eyesNarrow ?? 0;
  for (const [x0, x1, sd] of [[196, 207, 1], [213, 224, -1]]) {
    const top = sd > 0 ? [[x0, 63 + narrow], [x1, 66 + narrow]] : [[x0, 66 + narrow], [x1, 63 + narrow]];
    const e = k.shape([top[0], top[1], [sd > 0 ? x1 - 1 : x1, 70], [sd > 0 ? x0 : x0 + 1, 69]], { fill: VC.lime[1], line: INK, lw: 1, smooth: false });
    k.save(); k.clip(e); k.stroke([[x0 + 2, 67], [x1 - 2, 67]], 1, VC.lime[0]); k.restore();
  }
  // the crest: a swept blade of a fin, ridged
  const crest = k.shape([[204, 28, 1], [214, 10, 1], [236, -4, 1], [262, -12, 1], [246, 2, 1], [238, 20, 1], [228, 30, 1]], { fill: VC.plate[2], line: INK, lw: 3, smooth: false });
  k.save(); k.clip(crest); rim(k, crest, -1, -2, VC.plate[0]); for (let i = 0; i < 4; i++) k.stroke([[212 + i * 7, 26 - i * 2], [224 + i * 9, 4 - i * 4]], 1, VC.plate[3]); k.restore();
  const helmet = k.shape([[186, 60, 1], [186, 42], [194, 30], [210, 24], [226, 26], [236, 34], [236, 48], [234, 60, 1], [222, 54], [198, 54]], { fill: VC.plate[1], line: INK, lw: 3 });
  k.save(); k.clip(helmet); crescent(k, helmet, -8, -5, VC.plate[2]); rim(k, helmet, -2, -2, VC.plate[0]);
  k.stroke([[194, 40], [206, 30], [222, 28]], [1, 2.4, 1], VC.plate[0]);
  k.restore();
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  const visor = k.shape([[188, 52], [233, 52], [234, 58], [187, 58]], { fill: VC.lime[1], line: INK, lw: 2 });
  k.save(); k.clip(visor); k.stroke([[190, 54], [230, 54]], 1.2, VC.lime[0]); k.restore();
  glow(k, 210, 64, 40, 22, VC.lime[1], 0.16 + pulse * 0.14);
  glow(k, 210, 134, 10, 8, VC.lime[1], 0.2);
  k.restore();

  // --- snow: far flakes drifting, near ones streaking past
  const S = rng(77);
  for (let i = 0; i < 90; i++) {
    const near = i < 24, sp = near ? 420 : 160, x = ((S() * 560 + t * sp) % 580) - 50, y = ((S() * 300 + t * sp * 0.35) % 300) - 10;
    if (near) k.stroke([[x, y], [x - 9, y - 3]], [2, 1], '#FFFFFF');
    else k.rect(Math.round(x), Math.round(y), 1, 1, { fill: '#F4F8FF' });
  }
  return st;
}
