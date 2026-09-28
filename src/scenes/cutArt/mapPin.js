// @ts-check
/**
 * Intro: the map table from above, under the lamp. The Varna runs down the middle; the east bank bristles with
 * violet NOT markers. The Colonel's hand comes in with one khaki pin — and stabs it into the west bank: one soldier.
 */
import { INK, rng, rim, crescent, glow, clamp01, ease, lerp } from './paint.js';

const PAPER = ['#F4E8C0', '#DCCC98', '#B8A674', '#8A7A50'];
const SLEEVE = ['#A6AC74', '#747C4C', '#50562F'];
const SKIN = ['#FFD8B8', '#EAA084', '#BA6A5A', '#80403E'];

export function pinShot(k, t, st, shot) {
  const R = rng(4), slam = shot?.slam ?? 6.2;
  // the table, then the map on it (a little skewed, weighted at the corners)
  k.rect(-60, -10, 600, 290, { fill: '#2A1A0E' });
  for (let i = 0; i < 9; i++) k.stroke([[-60, 20 + i * 30], [540, 24 + i * 30]], 1, '#3A2616');
  const map = k.shape([[40, 30], [452, 22], [462, 250], [30, 256]], { fill: PAPER[0], line: INK, lw: 2 });
  k.save(); k.clip(map);
  for (let x = 40; x < 470; x += 34) k.stroke([[x, 20], [x + 4, 260]], 1, PAPER[1]);
  for (let y = 40; y < 260; y += 34) k.stroke([[30, y], [470, y - 4]], 1, PAPER[1]);
  // west bank forests, a road, the river, the east bank's burnt marks
  for (let i = 0; i < 60; i++) { const x = 50 + R() * 150, y = 40 + R() * 200; k.ellipse(x, y, 3 + R() * 3, 2 + R() * 2, 0, { fill: i % 3 ? '#8FA86A' : '#6E8A4E' }); }
  k.stroke([[40, 210], [120, 190], [180, 200], [236, 176]], 3, '#C09A6A');
  const river = [[262, 16], [246, 70], [268, 120], [244, 172], [258, 220], [248, 262]];
  k.stroke(river, 20, '#3E6E98'); k.stroke(river, 14, '#6A9CC8'); k.stroke(river.map(([x, y]) => [x - 3, y]), 2, '#A8CCE8');
  for (let i = 0; i < 26; i++) { const x = 300 + R() * 150, y = 40 + R() * 200; k.ellipse(x, y, 5 + R() * 5, 3 + R() * 3, R() * 3, { fill: '#C8B488' }); }
  crescent(k, map, 10, 8, PAPER[1]);
  k.restore();
  // coffee ring and a pencil
  k.ellipse(110, 70, 16, 14, 0, { line: '#9A7A4A', lw: 1 });
  k.stroke([[380, 236], [440, 206]], 4, INK); k.stroke([[380, 236], [440, 206]], 2.4, '#E8B838'); k.stroke([[436, 208], [442, 205]], 2.4, '#F2D0B0');
  // the NOT markers massed on the east bank
  for (let i = 0; i < 22; i++) {
    const x = 296 + R() * 150, y = 44 + R() * 190;
    k.stroke([[x, y], [x - 2, y - 9]], 1.4, INK);
    k.ellipse(x - 2, y - 10, 3.4, 3.4, 0, { fill: '#7A3FC0', line: INK, lw: 1 });
    k.rect(Math.round(x - 3), Math.round(y - 11), 1, 1, { fill: '#C6FF5A' });
  }
  // the lamp's pool of light, dark at the edges
  const all = k.rect(-60, -10, 600, 290, { paint: false });
  const c0 = k.T([250, 140]);
  k.tint(all, '#0C0906', (X, Y) => Math.min(0.75, Math.max(0, (Math.hypot((X - c0[0]) / 1.4, Y - c0[1]) - 100 * k.k) / (170 * k.k))));
  glow(k, 250, 140, 200, 130, '#FFE0A0', 0.16);
  // --- the hand with the one pin: comes in, hovers, SLAMS it into the west bank, lifts away
  const target = [212, 150];
  const enter = ease(clamp01(t / 1.4)), leave = ease(clamp01((t - slam - 0.9) / 1.2)), down = clamp01((t - slam + 0.18) / 0.18);
  const hover = [lerp(560, 300, enter) + leave * 260, lerp(-80, 70, enter) - leave * 150 + Math.sin(t * 2.1) * 3];
  const tip = t < slam ? [lerp(hover[0] - 90, target[0], down), lerp(hover[1] + 60, target[1], down)] : target;
  const pinStuck = t >= slam;
  if (pinStuck) {
    k.stroke([[target[0], target[1]], [target[0] - 3, target[1] - 16]], 2, INK);
    k.ellipse(target[0] - 3, target[1] - 17, 4.5, 4.5, 0, { fill: '#C8B070', line: INK, lw: 1 });
    const fl = k.shape([[target[0] - 2, target[1] - 16, 1], [target[0] + 14, target[1] - 13, 1], [target[0] - 1, target[1] - 9, 1]], { fill: '#7C8A44', line: INK, lw: 1, smooth: false });
    void fl;
    if (t < slam + 0.5) { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, r = 6 + (t - slam) * 40; k.stroke([[target[0] + Math.cos(a) * r * 0.6, target[1] + Math.sin(a) * r * 0.35], [target[0] + Math.cos(a) * r, target[1] + Math.sin(a) * r * 0.6]], 1.5, '#FFF0C8'); } st.shake = 2; }
  }
  if (leave < 1) {
    const hx = pinStuck ? hover[0] - 60 : tip[0] + 38, hy = pinStuck ? hover[1] + 20 : tip[1] - 34;
    // the sleeve from off the top right, gold at the cuff
    const sl = k.stroke([[hx + 160, hy - 150], [hx + 70, hy - 50], [hx + 26, hy - 12]], [60, 52, 44], SLEEVE[1]);
    k.save(); k.clip(sl); crescent(k, sl, -10, -10, SLEEVE[2]); rim(k, sl, -2, -2, SLEEVE[0]); k.restore();
    k.stroke([[hx + 44, hy - 34], [hx + 12, hy + 2]], 9, '#E2B444');
    // the hand, pinching the pin between finger and thumb
    const hand = k.shape([[hx - 20, hy - 8], [hx - 4, hy - 26], [hx + 22, hy - 20], [hx + 30, hy + 2], [hx + 12, hy + 22], [hx - 14, hy + 20], [hx - 28, hy + 8]], { fill: SKIN[1], line: INK, lw: 3 });
    k.save(); k.clip(hand); crescent(k, hand, -8, -8, SKIN[2]); rim(k, hand, -2, -2, SKIN[0]); for (let i = 0; i < 3; i++) k.stroke([[hx - 6 + i * 9, hy - 14], [hx - 2 + i * 9, hy + 12]], [1, 1.8, 1], SKIN[2]); k.restore();
    if (!pinStuck) {
      k.stroke([[tip[0], tip[1]], [hx - 22, hy + 10]], 2, INK);
      k.ellipse(hx - 22, hy + 9, 4.5, 4.5, 0, { fill: '#C8B070', line: INK, lw: 1 });
      k.shape([[hx - 21, hy + 10, 1], [hx - 5, hy + 13, 1], [hx - 20, hy + 17, 1]], { fill: '#7C8A44', line: INK, lw: 1, smooth: false });
    }
    const th = k.shape([[hx - 30, hy + 4], [hx - 20, hy - 2], [hx - 14, hy + 10], [hx - 24, hy + 16]], { fill: SKIN[1], line: INK, lw: 2 });
    k.save(); k.clip(th); rim(k, th, -1, -1, SKIN[0]); k.restore();
  }
  // cigar smoke drifting across the light
  for (let i = 0; i < 7; i++) { const q = (t * 0.06 + i / 7) % 1; k.tint(k.ellipse(480 - q * 560, 60 + Math.sin(q * 6 + i) * 20 + i * 8, 30 + q * 20, 8 + q * 6, 0.1, { paint: false }), '#D8D0C0', 0.18 * Math.sin(q * Math.PI)); }
  st.talkers = { COLONEL: [360, 40], SECRETARY: [120, 40] };
  return st;
}
