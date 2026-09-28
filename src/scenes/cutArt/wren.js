// @ts-check
/**
 * WREN, inked: a lean, deadpan veteran in an olive helmet, round steel glasses and a khaki field jacket with the
 * blue sling strap. Drawn in local units (head ≈ 120 tall, origin between the eyes), 3/4 view facing right; the
 * caller places and scales him. Expression parameters: mouth ('closed' | 'o' | 'a' | 'e' | 'smirk'), lids (0 open …
 * 1 shut; his resting look is half-lidded), brow (−1 cross … +1 raised), look (pupils: −1 left … +1 right),
 * gleam (0…1 the sun sweeping across the lenses, or −1).
 */
import { INK, rim, crescent } from './paint.js';

export const WC = {
  skin: ['#FFE0B4', '#EFB184', '#C27A5C', '#8A4C46'],
  helmet: ['#C8CC7A', '#86903E', '#59612E', '#353B1E'],
  jacket: ['#EAD8A0', '#BBA66A', '#86733F', '#554827'],
  strap: ['#7AB8E8', '#2F6FA6', '#1B3F63'],
  shirt: ['#6E7A44', '#4A5230'],
  frame: '#2C2A30', lens: '#B6DCF2', white: '#F6F0E2', eye: '#2A1C1E', stubble: '#B98468',
};

/** The head. Light comes from `sun` (a unit vector in screen space, default: low sun to the right). */
export function wrenHead(k, o = {}) {
  const C = WC, S = o.sun || [1, -0.25];
  const lids = o.lids ?? 0.42, brow = o.brow ?? 0, look = o.look ?? 0;
  // ear (behind the face line)
  const ear = k.shape([[-21, -6], [-29, -10], [-36, -3], [-36, 10], [-30, 20], [-20, 22]], { fill: C.skin[1], line: INK, lw: 2 });
  k.save(); k.clip(ear); crescent(k, ear, 4, 0, C.skin[2]); k.restore();
  k.stroke([[-25, -3], [-31, 1], [-30, 11], [-25, 14]], [1.4, 1.1, 0.6], C.skin[3]);
  // face: long, lantern-jawed, a chin that means it
  const face = [[-26, -24], [-26, -4], [-24, 16], [-19, 32], [-8, 44], [8, 52], [24, 56], [35, 54], [41, 47], [41, 40], [38, 33], [40, 27], [41, 20], [42, 12], [40, 4], [42, -4], [43, -14], [38, -26]];
  const fm = k.shape(face, { fill: C.skin[1], line: INK, lw: 2 });
  k.save(); k.clip(fm);
  k.shape([[-26, 20], [-6, 30], [14, 40], [30, 38], [44, 40], [40, 60], [-10, 60], [-28, 40]], { fill: { dither: [C.skin[1], C.stubble], level: 0.38 } });   // stubble
  crescent(k, fm, Math.round(S[0] * 22), Math.round(S[1] * 22), C.skin[2]);
  k.shape([[-30, -30], [50, -30], [50, -13], [26, -11], [4, -8], [-30, -5]], { fill: C.skin[2] });                                // helmet shadow
  k.shape([[-30, -30], [50, -30], [50, -17], [20, -15], [-30, -12]], { fill: C.skin[3] });
  rim(k, fm, Math.round(S[0] * 2), Math.round(S[1] * 2), C.skin[0]);
  k.stroke([[18, 47], [28, 50], [36, 47]], [0.8, 1.6, 0.8], C.skin[2]);                    // chin cleft shadow
  k.stroke([[33, 19], [27, 26], [22, 35]], [1.8, 1.4, 0.6], C.skin[2]);                     // cheek fold
  k.stroke([[-4, -1], [-9, -3]], [1.2, 0.5], C.skin[3]); k.stroke([[-4, 4], [-9, 6]], [1.2, 0.5], C.skin[3]);   // crow's feet
  k.restore();
  mouth(k, o.mouth || 'closed', C);
  // nose: a proper beak
  const nose = k.shape([[29, -3], [36, 5], [45, 13], [50, 19, 1], [45, 23], [37, 24], [32, 21], [33, 12]], { fill: C.skin[1], line: INK, lw: 1 });
  k.save(); k.clip(nose); crescent(k, nose, 6, -3, C.skin[2]); k.shape([[30, 19], [52, 19], [52, 28], [30, 28]], { fill: C.skin[2] }); rim(k, nose, 1, -1, C.skin[0]); k.restore();
  k.stroke([[36, 20], [39, 22], [42, 21]], [1, 1.2, 0.8], C.skin[3]);
  // eyes behind the glasses
  const eyeN = eye(k, 9, 1, 6, 4, lids, look, C);
  const eyeF = eye(k, 35, 0.5, 3.4, 3.8, lids, look, C);
  // brows: heavy, the near one does the acting
  const bz = -brow * 3;
  k.stroke([[-3, -11 + bz * 0.5], [8, -15 + bz + (brow < 0 ? 3 : 0)], [20, -13 + bz + (brow < 0 ? 4 : 0)]], [3.6, 4.2, 2], C.helmet[3]);
  k.stroke([[30, -12 + bz + (brow < 0 ? 4 : 0)], [36, -14 + bz], [42, -12 + bz * 0.6]], [2.8, 2.8, 1.2], C.helmet[3]);
  // glasses: round steel frames, pale lenses, a small glare — and the sun sweeping across on a gleam
  const lensN = k.ellipse(10, 1, 10.5, 10.5, 0, { paint: false }), lensF = k.ellipse(36, 0.5, 5.2, 9.6, 0, { paint: false });
  for (const L of [lensN, lensF]) {
    k.tint(L, C.lens, 0.25);
    k.save(); k.clip(L);
    k.stroke([[12, -7], [16, -5], [18, -1]], [1, 1.6, 1], '#FFFFFF'); k.stroke([[38, -6], [39, -3]], 1.2, '#FFFFFF');
    if ((o.gleam ?? -1) >= 0) { const gx = -14 + o.gleam * 60; k.stroke([[gx - 8, 14], [gx + 8, -14]], 7, '#FFFFFF'); k.stroke([[gx + 3, 14], [gx + 15, -12]], 2, '#FFF6D8'); }
    k.restore();
  }
  k.ellipse(10, 1, 10.5, 10.5, 0, { line: C.frame, lw: 2 });
  k.ellipse(36, 0.5, 5.2, 9.6, 0, { line: C.frame, lw: 2 });
  k.stroke([[20, -1], [26, -4], [31, -2]], 2, C.frame);                                      // bridge
  k.stroke([[-1, -2], [-12, -3], [-22, -1]], [2, 1.6], C.frame);                             // temple arm to the ear
  if ((o.gleam ?? -1) > 0.35 && o.gleam < 0.8) star(k, 44, -8, 5 * Math.sin(((o.gleam - 0.35) / 0.45) * Math.PI));
  helmet(k, C, S);
  return { top: [4, -70], mouth: [30, 35], eyes: [eyeN, eyeF] };
}

function eye(k, cx, cy, rx, ry, lids, look, C) {
  const w = k.ellipse(cx, cy, rx, ry, 0, { fill: C.white });
  k.save(); k.clip(w);
  k.ellipse(cx + 1 + look * rx * 0.5, cy + 0.6, Math.min(rx * 0.42, 2.8), ry * 0.62, 0, { fill: C.eye });
  k.ellipse(cx + 1.8 + look * rx * 0.5, cy - 0.6, 0.8, 0.8, 0, { fill: '#FFFFFF' });
  // the lid comes down from above (his resting half-lidded, unimpressed look)
  if (lids > 0) k.shape([[cx - rx - 2, cy - ry - 3], [cx + rx + 2, cy - ry - 3], [cx + rx + 2, cy - ry + ry * 2 * lids], [cx, cy - ry + ry * 2 * lids + 1], [cx - rx - 2, cy - ry + ry * 2 * lids]], { fill: C.skin[2] });
  k.restore();
  const ly = cy - ry + ry * 2 * Math.max(0.08, lids);
  k.stroke([[cx - rx - 1, ly + 1], [cx, ly - 0.5], [cx + rx + 1, ly + 0.5]], [1.4, 2, 1.2], INK);
  return w;
}

function mouth(k, shape, C) {
  if (shape === 'closed' || shape === 'smirk') {
    const up = shape === 'smirk' ? -3 : 0;
    k.stroke([[21, 37], [28, 36.5], [34, 35.5], [39, 34 + up]], [1.2, 2.2, 1.8, 1], INK);
    k.stroke([[27, 41], [34, 40.5]], [0.6, 1.4, 0.6], C.skin[2]);
    return;
  }
  const open = { o: [4.5, 5], a: [8, 7], e: [9, 3.4] }[shape] || [6, 4];
  const m = k.ellipse(31, 37, open[0], open[1], -0.08, { fill: '#4A1C1C', line: INK, lw: 1 });
  k.save(); k.clip(m);
  k.rect(20, 37 - open[1] - 2, 24, 3, { fill: '#F6F0E2' });
  k.ellipse(31, 37 + open[1], open[0] * 0.8, open[1] * 0.6, 0, { fill: '#B85252' });
  k.restore();
}

function helmet(k, C, S) {
  const shell = [[-46, 4, 1], [-50, -18], [-44, -44], [-26, -62], [0, -70], [26, -64], [44, -48], [52, -28], [56, -14, 1], [40, -16], [16, -18], [-12, -12], [-34, -4]];
  const hm = k.shape(shell, { fill: C.helmet[1], line: INK, lw: 2 });
  k.save(); k.clip(hm);
  crescent(k, hm, Math.round(S[0] * 16), Math.round(S[1] * 16) - 6, C.helmet[2]);
  crescent(k, hm, Math.round(S[0] * 34), Math.round(S[1] * 34) - 10, C.helmet[3]);
  k.stroke([[-8, -58], [14, -62], [32, -54]], [1, 3.5, 1], C.helmet[0]);                  // sky glint along the dome
  rim(k, hm, Math.round(S[0] * 2), Math.round(S[1] * 2) - 1, '#F2C27A');
  // a cloth band round the helmet
  k.shape([[-52, -24], [-20, -32], [20, -34], [58, -30], [58, -22], [20, -26], [-20, -24], [-52, -16]], { fill: C.helmet[2] });
  k.stroke([[-48, -18], [-20, -26], [20, -28], [56, -24]], 1, C.helmet[3]);
  k.restore();
  // the rim lip catching the light, and the chin strap hanging loose
  k.stroke([[-44, 2], [-20, -8], [14, -16], [40, -15], [56, -13]], [2.5, 3, 3, 2], C.helmet[0]);
  k.stroke([[-44, 2], [-20, -8], [14, -16], [40, -15], [56, -13]], [1, 1.2, 1.2, 1], INK);
  k.stroke([[-34, 0], [-31, 18], [-24, 34], [-12, 44]], [2.2, 2.2, 1.6], C.jacket[3]);
}

function star(k, x, y, r) {
  if (r < 0.5) return;
  k.stroke([[x - r, y], [x + r, y]], [0.5, 2, 0.5], '#FFFFFF');
  k.stroke([[x, y - r * 1.3], [x, y + r * 1.3]], [0.5, 2, 0.5], '#FFFFFF');
}

/** The jacket from the collar down (below the head's origin; 3/4 facing right). */
export function wrenBody(k, o = {}) {
  const C = WC, S = o.sun || [1, -0.25];
  // the neck first, so the collar sits over it
  const neck = k.shape([[-18, 24], [18, 40], [20, 80], [-24, 80]], { fill: C.skin[2], line: INK, lw: 2 });
  k.save(); k.clip(neck); k.shape([[-30, 20], [30, 36], [30, 62], [-30, 54]], { fill: C.skin[3] }); k.restore();
  const jacket = [[-26, 62], [-62, 72], [-96, 96], [-112, 150], [-118, 240], [112, 240], [104, 150], [90, 100], [58, 70], [18, 58]];
  const jm = k.shape(jacket, { fill: C.jacket[1], line: INK, lw: 3 });
  k.save(); k.clip(jm);
  crescent(k, jm, Math.round(S[0] * 40), Math.round(S[1] * 40), C.jacket[2]);
  k.shape([[-44, 110], [-22, 126], [-32, 240], [-64, 240]], { fill: C.jacket[2] });
  rim(k, jm, Math.round(S[0] * 2), Math.round(S[1] * 2), C.jacket[0]);
  k.stroke([[-80, 120], [-60, 150], [-66, 200]], [1, 2, 1], C.jacket[3]);
  k.stroke([[40, 110], [56, 150], [50, 190]], [1, 1.8, 1], C.jacket[2]);
  k.shape([[18, 118], [58, 114], [60, 160], [22, 164]], { fill: C.jacket[1], line: C.jacket[3], lw: 1 });   // chest pocket
  k.shape([[16, 112, 1], [60, 108, 1], [62, 124, 1], [40, 128, 1], [18, 128, 1]], { fill: C.jacket[2], line: C.jacket[3], lw: 1 });
  k.ellipse(39, 121, 2.4, 2.4, 0, { fill: C.jacket[3] });
  // button placket, shoulder seam and epaulette
  k.stroke([[2, 96], [6, 150], [8, 240]], [1.2, 1.6, 1.6], C.jacket[3]);
  for (const by of [112, 150, 190]) { k.ellipse(12 + by * 0.02, by, 3, 3, 0, { fill: C.jacket[3] }); k.ellipse(11.5 + by * 0.02, by - 0.8, 1.4, 1.4, 0, { fill: C.jacket[0] }); }
  k.stroke([[-58, 74], [-66, 96], [-72, 124]], [1, 1.6, 1], C.jacket[3]);
  k.shape([[-60, 70, 1], [-94, 88, 1], [-98, 100, 1], [-64, 82, 1]], { fill: C.jacket[2], line: INK, lw: 1, smooth: false });
  k.ellipse(-68, 80, 2.4, 2.4, 0, { fill: C.jacket[0], line: INK, lw: 1 });
  k.restore();
  // shirt in the open collar, then pointed lapels
  k.shape([[-12, 58], [16, 56], [6, 92]], { fill: C.shirt[0], line: INK, lw: 1 });
  const cl = k.shape([[-24, 56, 1], [-58, 70], [-44, 104, 1], [-8, 76, 1]], { fill: C.jacket[1], line: INK, lw: 2 });
  k.save(); k.clip(cl); crescent(k, cl, 8, -4, C.jacket[2]); k.restore();
  const cr = k.shape([[16, 53, 1], [52, 64], [40, 100, 1], [6, 72, 1]], { fill: C.jacket[1], line: INK, lw: 2 });
  k.save(); k.clip(cr); rim(k, cr, 2, 0, C.jacket[0]); crescent(k, cr, 6, 0, C.jacket[2]); k.restore();
  // the blue sling strap across the chest
  const path = [[-92, 96], [-40, 136], [10, 184], [46, 240]];
  k.stroke(path, [22, 20, 18], INK);
  const st2 = k.stroke(path, [18, 16, 14], C.strap[1]);
  k.save(); k.clip(st2); crescent(k, st2, 0, -5, C.strap[2]); rim(k, st2, 1, -2, C.strap[0]); k.restore();
  k.rect(-34, 128, 12, 14, { fill: '#9A9A96', line: INK, lw: 1 });
}

/** His right arm raised in front, the fishing rod in his fist (tip far off to the upper right). */
export function wrenRodArm(k, o = {}) {
  const C = WC, t = o.t || 0, yank = o.yank || 0;
  const sway = Math.sin(t * 0.9) * 1.5 - yank * 20;
  const rod = [[40, 250], [112, 128 - yank * 10], [168 + sway * 0.4, 20 - yank * 20], [232 + sway, -120 - yank * 10]];
  k.stroke(rod, [8, 6, 4, 3], INK);
  k.stroke(rod, [6, 4, 2.4, 1.4], '#3A3036');
  k.stroke([[70, 200], [96, 156]], 6, '#C8905A');                                            // cork grip
  k.ellipse(88, 176, 8, 9, 0.5, { fill: '#6E7072', line: INK, lw: 1 });                       // reel
  k.ellipse(88, 176, 3.5, 4, 0.5, { fill: '#A8AAAE' });
  // the forearm in its sleeve, rising from below
  const sl = k.shape([[70, 250], [84, 170], [100, 138 - yank * 10], [128, 146 - yank * 10], [124, 190], [116, 250]], { fill: C.jacket[1], line: INK, lw: 3 });
  k.save(); k.clip(sl); crescent(k, sl, 10, -2, C.jacket[2]); rim(k, sl, 2, -1, C.jacket[0]); k.stroke([[92, 200], [104, 180], [118, 196]], [1, 2, 1], C.jacket[3]); k.restore();
  k.shape([[96, 146 - yank * 10], [128, 150 - yank * 10], [126, 160 - yank * 10], [98, 158 - yank * 10]], { fill: C.jacket[2], line: INK, lw: 2 });   // cuff
  // the fist round the rod
  k.save(); k.translate(113, 128 - yank * 10); k.rotate(-0.95);
  const h = k.shape([[-14, -10], [2, -15], [16, -12], [20, 0], [16, 12], [2, 15], [-12, 12], [-17, 1]], { fill: C.skin[1], line: INK, lw: 2 });
  k.save(); k.clip(h); crescent(k, h, 6, -4, C.skin[2]); rim(k, h, 1, -2, C.skin[0]); k.restore();
  for (const fy of [-7, -1, 5]) k.stroke([[4, fy], [12, fy + 0.5], [18, fy + 1.5]], [0.6, 1.3, 0.6], C.skin[3]);
  k.stroke([[-12, -8], [-2, -14], [8, -13]], [1.2, 2.2, 1.2], C.skin[2]);                     // thumb over the top
  k.restore();
  return { tip: [232 + sway, -120 - yank * 10] };
}
