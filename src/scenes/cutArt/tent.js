// @ts-check
/**
 * GOD field HQ, night: the general leans over the map table at us, fists planted on the Varna, the lamp swinging
 * over his cap; Overwatch hunched at the radio in the green glow behind him.
 */
import { INK, rng, rim, crescent, glow } from './paint.js';

export const GC = {
  canvas: ['#6E6844', '#524C30', '#3A3620', '#24200F'],
  uniform: ['#A6AC74', '#747C4C', '#50562F', '#32361C'],
  gold: ['#FFEEA8', '#E2B444', '#9A7020', '#5E4410'],
  skin: ['#FFD8B8', '#EAA084', '#BA6A5A', '#80403E'],
  tache: ['#FAFAF2', '#CFCFC6', '#94948C', '#5E5E58'],
  wood: ['#9A6A3E', '#74482A', '#4E2E1A', '#2E1A0E'],
  paper: ['#F2E6BC', '#DACA96', '#B4A474', '#857650'],
};

export function tentShot(k, t, st) {
  const R = rng(5);
  const swing = Math.sin(t * 1.25) * 0.12;
  const talking = st.speaking?.who === 'GOD COMMAND', mouth = talking ? st.mouth : 'closed';
  // --- the tent: canvas walls with sagging seams, a pole, a map pinned up, crates
  k.rect(-60, -10, 600, 290, { fill: GC.canvas[3] });
  const wall = k.shape([[-60, 8], [540, 8], [540, 210], [-60, 210]], { fill: { grad: [[0, GC.canvas[3]], [0.35, GC.canvas[2]], [0.8, GC.canvas[1]], [1, GC.canvas[2]]], from: [0, 0], to: [0, 210 * k.h / 270] }, smooth: false });
  k.save(); k.clip(wall);
  for (let i = -1; i < 9; i++) {
    const x = i * 64 + 18, sag = 6;
    k.stroke([[x, 8], [x + 3, 100], [x + 6, 210]], [2, 3, 3], GC.canvas[3]);
    k.stroke([[x + 4, 8], [x + 7, 100], [x + 10, 210]], [1, 1.4, 1.4], GC.canvas[0]);
    k.stroke([[x + 10, 40], [x + 26, 40 + sag], [x + 44, 38]], [0.6, 1.6, 0.6], GC.canvas[3]);    // sag folds
  }
  k.restore();
  // roof panels meeting at the ridge
  k.shape([[-60, 8], [540, 8], [540, -10], [-60, -10]], { fill: GC.canvas[3] });
  k.stroke([[-60, 14], [240, 2], [540, 14]], 3, GC.canvas[3]);
  // the pole, left of centre
  k.rect(104, -10, 12, 230, { fill: GC.wood[2], line: INK, lw: 2 });
  k.rect(106, -10, 3, 230, { fill: GC.wood[1] });
  // the map pinned to the canvas
  const wm = k.shape([[14, 52], [98, 46], [100, 116], [16, 122]], { fill: GC.paper[1], line: INK, lw: 2 });
  k.save(); k.clip(wm);
  k.stroke([[60, 44], [52, 76], [64, 98], [56, 124]], 3, '#4A7FA8');
  for (let i = 0; i < 12; i++) k.ellipse(24 + R() * 26, 56 + R() * 58, 1.6, 1.6, 0, { fill: '#5E7E3A' });
  for (let i = 0; i < 9; i++) k.ellipse(70 + R() * 24, 54 + R() * 58, 2, 2, 0, { fill: '#7A3FC0' });
  crescent(k, wm, 6, 6, GC.paper[2]);
  k.restore();
  for (const [px, py] of [[18, 54], [94, 50], [96, 112], [20, 118]]) k.ellipse(px, py, 1.8, 1.8, 0, { fill: GC.gold[1], line: INK, lw: 1 });
  // crates, stencilled
  for (const [x, y, w, h] of [[-6, 150, 92, 66], [8, 108, 70, 44]]) {
    const c = k.shape([[x, y, 1], [x + w, y, 1], [x + w, y + h, 1], [x, y + h, 1]], { fill: GC.wood[1], line: INK, lw: 2, smooth: false });
    k.save(); k.clip(c); k.rect(x, y, w, 5, { fill: GC.wood[0] }); for (let i = 1; i < 3; i++) k.stroke([[x, y + (h * i) / 3], [x + w, y + (h * i) / 3]], 1, GC.wood[2]); crescent(k, c, 10, -4, GC.wood[2]); k.restore();
    k.stroke([[x + w * 0.3, y + h * 0.45], [x + w * 0.42, y + h * 0.45]], 3, GC.wood[2]);
  }
  // --- Overwatch at the radio desk, in the glow of the dials (background right)
  radioDesk(k, t, st);
  // --- the lamp's light falls on him
  glow(k, 214, 70, 170, 150, '#FFD890', 0.28);
  // --- THE GENERAL
  general(k, t, mouth, talking);
  // --- the table in front: the map of the Varna, pins, a mug, his fists
  const table = k.shape([[-60, 214], [540, 208], [540, 290], [-60, 290]], { fill: GC.wood[1], line: INK, lw: 2 });
  k.save(); k.clip(table); k.stroke([[-60, 216], [540, 210]], 2, GC.wood[0]); k.restore();
  const map = k.shape([[70, 218], [410, 212], [450, 290], [30, 290]], { fill: GC.paper[0], line: INK, lw: 2 });
  k.save(); k.clip(map);
  k.shape([[70, 218], [410, 212], [412, 226], [66, 232]], { fill: GC.paper[1] });
  k.stroke([[250, 212], [236, 236], [262, 256], [248, 290]], 5, '#4A7FA8');
  k.stroke([[250, 212], [236, 236], [262, 256], [248, 290]], 2, '#78AED4');
  for (let i = 0; i < 16; i++) k.ellipse(90 + R() * 120, 222 + R() * 60, 2, 1.4, 0, { fill: '#6E8A46' });
  for (let i = 0; i < 12; i++) k.ellipse(280 + R() * 120, 222 + R() * 60, 2.4, 1.6, 0, { fill: '#7A3FC0' });
  k.restore();
  fist(k, 150, 226, -1);
  fist(k, 336, 224, 1);
  // a mug of coffee, steaming
  const mug = k.shape([[404, 190], [428, 190], [430, 222], [402, 222]], { fill: '#E8E0C8', line: INK, lw: 2 });
  k.save(); k.clip(mug); crescent(k, mug, 8, 0, '#B8B098'); k.restore();
  k.stroke([[430, 198], [440, 202], [430, 214]], 3, INK); k.stroke([[430, 198], [440, 202], [430, 214]], 1.4, '#E8E0C8');
  for (let i = 0; i < 4; i++) { const q = (t * 0.5 + i / 4) % 1; k.tint(k.ellipse(416 + Math.sin(q * 6 + i) * 4, 184 - q * 40, 3 + q * 5, 2 + q * 3, 0, { paint: false }), '#D8D0C0', 0.5 * (1 - q)); }
  // lamp-lit: the corners fall away into the dark
  const all = k.rect(-60, -10, 600, 290, { paint: false });
  const c0 = k.T([220, 120]);
  k.tint(all, '#0C0906', (X, Y) => Math.min(0.7, Math.max(0, (Math.hypot((X - c0[0]) / 1.3, Y - c0[1]) - 130 * k.k) / (180 * k.k))));
  // the lamp itself, swinging on its flex, in front of it all
  const lx = 214 + Math.sin(swing) * 60, ly = 22;
  k.stroke([[214, -10], [lx, ly]], 1.4, INK);
  const shade = k.shape([[lx - 7, ly, 1], [lx + 7, ly, 1], [lx + 20, ly + 16, 1], [lx - 20, ly + 16, 1]], { fill: '#2E3226', line: INK, lw: 2, smooth: false });
  k.save(); k.clip(shade); rim(k, shade, 0, -2, '#6E765A'); k.restore();
  k.ellipse(lx, ly + 17, 7, 3, 0, { fill: '#FFF6C8' });
  glow(k, lx, ly + 18, 30, 16, '#FFF0C0', 0.5);
  st.talkers = st.talkers || {};
  st.talkers['GOD COMMAND'] = [240, 30];
  st.talkers.OVERWATCH = [404, 88];
  return st;
}

function radioDesk(k, t, st) {
  const on = st.speaking?.who === 'OVERWATCH';
  // desk and set
  const desk = k.shape([[330, 166], [490, 162], [490, 176], [330, 180]], { fill: GC.wood[2], line: INK, lw: 2 });
  void desk;
  k.rect(338, 180, 8, 40, { fill: GC.wood[3] });
  const set = k.shape([[430, 112, 1], [488, 110, 1], [490, 164, 1], [430, 166, 1]], { fill: '#3E4430', line: INK, lw: 2, smooth: false });
  k.save(); k.clip(set); rim(k, set, -2, 0, '#6E7650'); k.restore();
  for (let i = 0; i < 3; i++) { k.ellipse(442 + i * 15, 126, 5, 5, 0, { fill: '#1E2218', line: INK, lw: 1 }); k.ellipse(442 + i * 15, 126, 3, 3, 0, { fill: on && (Math.floor(t * 8) + i) % 3 === 0 ? '#C8FF9A' : '#5E9A4A' }); }
  k.rect(438, 140, 40, 10, { fill: on ? '#B8F08A' : '#6E9A52', line: INK, lw: 1 });
  glow(k, 456, 136, 60, 40, '#9CFF8A', on ? 0.3 : 0.16);
  // Overwatch: seated, turned to the set, headset on, lit green from the dials
  const OC = ['#8FC4B8', '#46707A', '#2A4A52', '#16282E'];
  const body = k.shape([[372, 170], [370, 128], [384, 108], [404, 106], [416, 120], [420, 170]], { fill: OC[2], line: INK, lw: 2 });
  k.save(); k.clip(body); rim(k, body, 2, 0, '#7ACF8A'); k.restore();
  k.stroke([[410, 126], [424, 138], [436, 134]], [7, 6, 5], INK); k.stroke([[410, 126], [424, 138], [436, 134]], [5, 4, 3], OC[1]);   // arm to the dial
  k.ellipse(437, 134, 3.5, 3, 0, { fill: '#8A5A3E', line: INK, lw: 1 });
  const head = k.shape([[386, 84], [400, 76], [414, 82], [418, 96], [412, 108], [396, 110], [386, 100]], { fill: '#8A5A3E', line: INK, lw: 2 });
  k.save(); k.clip(head); rim(k, head, 2, 0, '#9CE08A'); crescent(k, head, 6, 0, '#5A3626'); k.restore();
  k.shape([[382, 100], [382, 80], [392, 70], [406, 69], [416, 76], [416, 84], [404, 80], [392, 84], [390, 102]], { fill: '#1E1410', line: INK, lw: 2 });   // hair, a short bob
  k.stroke([[388, 88], [400, 72], [412, 80]], 2.4, '#2A2E34');                                         // headset band
  k.ellipse(412, 92, 4, 5, 0, { fill: '#2A2E34', line: INK, lw: 1 });
  k.stroke([[414, 96], [420, 104], [416, 106]], 1.4, '#2A2E34');                                       // mic
  if (on) k.stroke([[414, 100], [417, 104]], 1.2, '#1E1410');
}

function fist(k, x, y, side) {
  k.save(); k.translate(x, y);
  // the arm straight down from the shoulder, the cuff with its gold stripe
  const sleeve = k.shape([[-28, -70, 1], [26, -74, 1], [34, -8], [-34, -6]], { fill: GC.uniform[1], line: INK, lw: 3 });
  k.save(); k.clip(sleeve); crescent(k, sleeve, side * 12, -4, GC.uniform[2]); rim(k, sleeve, -side * 2, 0, GC.uniform[0]); k.stroke([[side * -8, -64], [side * -4, -30], [side * -10, -10]], [1, 2, 1], GC.uniform[3]); k.restore();
  k.shape([[-35, -18], [35, -20], [35, -8], [-35, -6]], { fill: GC.uniform[2], line: INK, lw: 2 });
  k.stroke([[-34, -13], [34, -15]], 2, GC.gold[1]);
  // the fist, knuckles to us: four curled fingers side by side, the thumb folded across in front
  const f = k.shape([[-30, -9], [-10, -12], [12, -12], [30, -9], [34, 6], [30, 20], [-30, 20], [-34, 6]], { fill: GC.skin[1], line: INK, lw: 3 });
  k.save(); k.clip(f);
  k.shape([[-40, 10], [40, 10], [40, 24], [-40, 24]], { fill: GC.skin[2] });                     // fingertips curled under, in shade
  for (let i = 0; i < 4; i++) { const fx = -30 + i * 15; k.ellipse(fx + 7.5, -6, 6, 4, 0, { fill: GC.skin[0] }); if (i) k.stroke([[fx, -10], [fx + 1, 8], [fx, 20]], [2, 1.6, 1], GC.skin[3]); }
  rim(k, f, 0, -2, GC.skin[0]);
  k.restore();
  const th = k.shape([[side * -36, 0], [side * -14, -2], [side * 4, 4], [side * 6, 12], [side * -6, 16], [side * -34, 14]], { fill: GC.skin[1], line: INK, lw: 2 });
  k.save(); k.clip(th); crescent(k, th, 0, -4, GC.skin[2]); rim(k, th, 0, -2, GC.skin[0]); k.restore();
  k.ellipse(side * 1, 8, 3.5, 3, 0, { fill: '#F2D8C8', line: GC.skin[3], lw: 1 });              // thumbnail
  k.restore();
}

function general(k, t, mouth, talking) {
  const C = GC, bounce = talking ? Math.abs(Math.sin(t * 13)) * 1.2 : 0;
  // broad shoulders, the olive tunic, epaulettes and a chest of ribbons
  const torso = k.shape([[118, 214], [130, 170], [168, 150], [206, 144], [274, 144], [312, 150], [350, 170], [362, 214]], { fill: C.uniform[1], line: INK, lw: 3 });
  k.save(); k.clip(torso); crescent(k, torso, 0, -14, C.uniform[2]); rim(k, torso, 0, -2, C.uniform[0]);
  k.stroke([[240, 150], [240, 214]], 2, C.uniform[3]);
  for (const by of [170, 190, 208]) k.ellipse(248, by, 3, 3, 0, { fill: C.gold[1], line: INK, lw: 1 });
  const rib = [['#2F6FA6', C.gold[1], '#3E8A4A'], [C.gold[1], '#2F6FA6', '#8A3A8A'], ['#3E8A4A', '#C8C8C0', '#2F6FA6']];
  rib.forEach((row, j) => row.forEach((c, i) => k.rect(262 + i * 12, 164 + j * 8, 11, 6, { fill: c, line: INK, lw: 1 })));
  k.ellipse(280, 196, 5, 5, 0, { fill: C.gold[1], line: INK, lw: 1 });
  k.restore();
  for (const [x0, sd] of [[132, -1], [300, 1]]) {
    const ep = k.shape([[x0, 150, 1], [x0 + 48, 150, 1], [x0 + 44 + sd * 4, 164, 1], [x0 + 4 - sd * 4, 164, 1]], { fill: C.gold[1], line: INK, lw: 2, smooth: false });
    k.save(); k.clip(ep); rim(k, ep, 0, -2, C.gold[0]); k.restore();
    for (let i = 0; i < 8; i++) k.stroke([[x0 + 6 + i * 5, 164], [x0 + 6 + i * 5 + sd, 172]], 1.6, C.gold[2]);
  }
  // collar and neck
  k.shape([[208, 128], [272, 128], [274, 148], [206, 148]], { fill: C.skin[2], line: INK, lw: 2 });
  for (const sd of [-1, 1]) k.shape([[240 + sd * 4, 150, 1], [240 + sd * 34, 138, 1], [240 + sd * 30, 154, 1]], { fill: C.uniform[1], line: INK, lw: 2, smooth: false });
  // ears
  for (const sd of [-1, 1]) { const e = k.ellipse(240 + sd * 50, 106, 9, 12, 0, { fill: C.skin[1], line: INK, lw: 2 }); k.save(); k.clip(e); crescent(k, e, -sd * 4, 0, C.skin[2]); k.restore(); }
  // the face: broad, ruddy, jowly
  const face = k.shape([[196, 84], [284, 84], [292, 108], [286, 128], [272, 144], [240, 152], [208, 144], [194, 128], [188, 108]], { fill: C.skin[1], line: INK, lw: 3 });
  k.save(); k.clip(face);
  crescent(k, face, 0, -12, C.skin[2]);
  k.shape([[180, 80], [300, 80], [300, 104], [240, 110], [180, 104]], { fill: C.skin[3] });          // the cap's shadow over the eyes
  k.shape([[180, 80], [300, 80], [300, 97], [240, 102], [180, 97]], { fill: '#5A2E2E' });
  k.speckle(k.shape([[200, 124], [280, 124], [276, 148], [240, 156], [204, 148]], { paint: false }), C.skin[2], 0.3, 4);   // stubble
  k.restore();
  // eyes glinting out of the shadow, under bristling brows
  for (const sd of [-1, 1]) {
    const ex = 240 + sd * 19;
    k.ellipse(ex, 100, 6, 3, 0, { fill: '#E8D8C8' });
    k.ellipse(ex - sd * 1, 100.5, 2.4, 2.6, 0, { fill: INK });
    k.rect(ex - sd * 1 - 1, 99, 1, 1, { fill: '#FFFFFF' });
    const brow = k.shape([[ex - sd * 16, 88], [ex + sd * 12, 92], [ex + sd * 8, 99], [ex - sd * 2, 97], [ex - sd * 16, 96]], { fill: C.tache[1], line: INK, lw: 2 });
    k.save(); k.clip(brow); rim(k, brow, 0, -2, C.tache[0]); for (let i = 0; i < 4; i++) k.stroke([[ex - sd * (12 - i * 6), 90], [ex - sd * (8 - i * 6), 96]], 1, C.tache[2]); k.restore();
  }
  // a big red nose? a big nose, anyway
  const nose = k.shape([[232, 102], [248, 102], [256, 118], [250, 128], [230, 128], [224, 118]], { fill: C.skin[1], line: INK, lw: 2 });
  k.save(); k.clip(nose); crescent(k, nose, 0, -6, C.skin[2]); k.ellipse(244, 112, 3, 4, 0, { fill: C.skin[0] }); k.restore();
  k.stroke([[232, 124], [236, 126]], 1.6, C.skin[3]); k.stroke([[248, 124], [244, 126]], 1.6, C.skin[3]);
  // the mouth under the moustache (it opens when he barks)
  const open = { closed: 0, e: 3, o: 5, a: 8 }[mouth] ?? 0;
  if (open) { const m = k.ellipse(240, 140 + open * 0.3, 12, open, 0, { fill: '#3A1414', line: INK, lw: 1 }); k.save(); k.clip(m); k.rect(226, 136, 28, 3, { fill: '#F2ECDC' }); k.restore(); }
  else k.stroke([[228, 142], [240, 143], [252, 142]], [1, 2, 1], INK);
  // the walrus moustache
  k.save(); k.translate(0, -bounce);
  const tache = k.shape([[240, 124], [256, 124], [276, 128], [284, 142], [278, 146], [262, 138], [248, 138], [240, 136], [232, 138], [218, 138], [202, 146], [196, 142], [204, 128], [224, 124]], { fill: C.tache[1], line: INK, lw: 2 });
  k.save(); k.clip(tache); crescent(k, tache, 0, -5, C.tache[2]); rim(k, tache, 0, -2, C.tache[0]);
  for (let i = 0; i < 9; i++) { const x = 206 + i * 9; k.stroke([[x, 128], [x + (x < 240 ? -3 : 3), 140]], 1, C.tache[2]); }
  k.restore();
  k.restore();
  // the cigar, clamped in the corner, smouldering
  k.stroke([[262, 140], [296, 150]], [7, 6], INK); k.stroke([[262, 140], [296, 150]], [5, 4], '#6A3E22'); k.stroke([[266, 139], [292, 147]], 1, '#9A6A42');
  k.ellipse(297, 150, 3, 3, 0, { fill: Math.sin(t * 3) > 0 ? '#FFB23A' : '#E8743A' });
  for (let i = 0; i < 5; i++) { const q = (t * 0.4 + i / 5) % 1; k.tint(k.ellipse(300 + Math.sin(q * 7 + i) * 6 + q * 10, 146 - q * 70, 2 + q * 7, 1.5 + q * 4, 0, { paint: false }), '#C8C0B0', 0.55 * (1 - q)); }
  // the peaked cap: crown, band, badge, a shining black peak
  const crown = k.shape([[180, 70], [186, 48], [212, 34], [268, 34], [294, 48], [300, 70], [292, 80], [188, 80]], { fill: C.uniform[1], line: INK, lw: 3 });
  k.save(); k.clip(crown); crescent(k, crown, 0, -10, C.uniform[2]); rim(k, crown, 0, -2, C.uniform[0]); k.stroke([[196, 50], [240, 40], [284, 50]], [1, 2.5, 1], C.uniform[0]); k.restore();
  const band = k.shape([[186, 72], [294, 72], [296, 86], [184, 86]], { fill: C.uniform[3], line: INK, lw: 2 });
  k.save(); k.clip(band); k.stroke([[186, 78], [294, 78]], 2, C.gold[1]); k.restore();
  // the badge: a winged star
  k.shape([[240, 48, 1], [244, 56, 1], [253, 56, 1], [246, 61, 1], [249, 70, 1], [240, 64, 1], [231, 70, 1], [234, 61, 1], [227, 56, 1], [236, 56, 1]], { fill: C.gold[1], line: INK, lw: 1, smooth: false });
  for (const sd of [-1, 1]) k.shape([[240 + sd * 10, 58], [240 + sd * 30, 52], [240 + sd * 28, 60], [240 + sd * 12, 64]], { fill: C.gold[1], line: INK, lw: 1 });
  const peak = k.shape([[182, 84], [298, 84], [292, 94], [240, 102], [188, 94]], { fill: '#18181C', line: INK, lw: 2 });
  k.save(); k.clip(peak); k.stroke([[204, 88], [240, 92], [270, 88]], [1, 2.5, 1], '#7A7A86'); k.restore();
}
