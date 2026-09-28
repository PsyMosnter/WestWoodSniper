// @ts-check
/**
 * The illustrated cutscene shots. Each shot paints a whole frame at time t (seconds into the shot) into an Ink
 * canvas of the display's size; st carries who is speaking and the mouth shape of the moment.
 * Shots are composed for a 480×270 frame (letterboxed to 480×216) and scale to the display's height.
 */
import { INK, rng, vgrad, cloud, streakPts, cloudPts, forest, reeds, rim, crescent, screen, clamp01 } from './paint.js';
import { wrenHead, wrenBody, wrenRodArm, WC } from './wren.js';
import { vraskShot } from './vrask.js';
import { tentShot } from './tent.js';

/** mouth shape for a speaker at this moment */
const mouthOf = (st, who) => (st.speaking && st.speaking.who === who ? st.mouth || 'closed' : 'closed');

/** fit the 480×270 composition into the frame (by height), centred */
function frame(k, fn) { k.save(); const s = k.h / 270; k.translate((k.w - 480 * s) / 2, 0); k.scale(s); fn(s); k.restore(); }

export const SHOTS = {
  /** Intro: GOD field HQ — the general leans over the map table at us. */
  tent: {
    demo: [[0.6, 'GOD COMMAND', "We can't send an army across that river."]],
    draw(k, t, st) { frame(k, () => tentShot(k, t, st)); return st; },
  },
  /** M3 cutaway: Vrask from the snow at his boots, arms folded, the storm and his Husks behind him. */
  vrask: {
    demo: [[0.5, 'OVERWATCH', "With the mesa dark they can't radio orders. Vrask is driving the passes himself."], [5.4, 'OVERWATCH', 'He only gets out at the outposts.']],
    draw(k, t, st) { frame(k, () => vraskShot(k, t, st)); return st; },
  },
  /** Dawn on the Varna: WREN fishing off the jetty; the field radio crackles in the foreground. */
  dock: {
    demo: [[0.6, 'OVERWATCH', "WREN, you're up."], [3.0, 'WREN', "I'm retired."], [5.0, 'OVERWATCH', "You're bored."]],
    draw(k, t, st) {
      frame(k, () => {
        // --- sky, sun, clouds
        k.rect(-60, -10, 600, 190, { fill: { grad: [[0, '#1E1840'], [0.28, '#3E2A5E'], [0.52, '#8E466C'], [0.72, '#D8705C'], [0.87, '#F4A866'], [1, '#FCDC98']], from: [0, 0], to: [0, 172 * k.h / 270] } });
        k.tint(k.ellipse(412, 168, 38, 26, 0, { paint: false }), '#FFD890', 0.5);
        k.tint(k.ellipse(412, 168, 24, 17, 0, { paint: false }), '#FFF0C0', 0.75);
        k.ellipse(412, 170, 13, 13, 0, { fill: '#FFF8DC' });
        const drift = t * 1.2;
        cloud(k, streakPts(120 + drift, 62, 260, 14, 3), ['#F29A78', '#B25A74', '#6E3E6C', '#4E3060'], [0, -3]);
        cloud(k, streakPts(360 + drift, 44, 220, 10, 5), ['#F2A07A', '#A8546E', '#5E3664'], [0, -3]);
        cloud(k, streakPts(250 + drift * 0.8, 104, 300, 9, 7), ['#FFC08A', '#E08070', '#9E4E6C'], [0, -2]);
        cloud(k, cloudPts(60 + drift * 0.6, 142, 150, 34, 11, 6), ['#FFB888', '#D4786E', '#94506E', '#5E3A62'], [2, -4]);
        cloud(k, streakPts(430 + drift * 0.7, 132, 160, 7, 9), ['#FFE0A8', '#F2A07A', '#C06A6E'], [0, -2]);
        // birds
        for (const [bx, by, s] of [[182, 84, 1], [196, 90, 0.8], [206, 80, 0.7]]) { const f = Math.sin(t * 6 + bx) * 1.5; k.stroke([[bx - 4 * s, by - f], [bx, by + 1], [bx + 4 * s, by - f]], 1, '#3A2440'); }
        // --- far bank: pines, mist
        forest(k, -40, 520, 170, 4, { fill: '#5A3A66', hmin: 8, hmax: 32, hill: 10, step: 7, leafy: 0.45 });
        // on the far bank: where the NOT came down — a faint lime glow and a thread of smoke
        for (const [gx, gy] of [[150, 160], [214, 163]]) {
          k.tint(k.ellipse(gx, gy, 10, 5, 0, { paint: false }), '#C6FF5A', 0.3);
          for (let i = 0; i < 7; i++) { const q = ((t * 0.12 + i / 7) % 1), px = gx + Math.sin(q * 5 + gx) * 3 + q * 16, py = gy - 4 - q * 46; k.tint(k.ellipse(px, py, 2 + q * 5, 1.6 + q * 3, 0, { paint: false }), '#B89AB0', 0.5 * (1 - q)); }
        }
        forest(k, -40, 520, 172, 9, { fill: '#3A2646', hmin: 4, hmax: 16, hill: 5, step: 4 });
        k.tint(k.rect(-40, 160, 600, 12, { paint: false }), '#F4B8A0', 0.3);
        // --- the river: sky reflected, pines upside down, the sun's broken path, ripples
        k.rect(-60, 172, 600, 110, { fill: { grad: [[0, '#F0A474'], [0.15, '#C8706A'], [0.45, '#6E3E62'], [1, '#261C40']], from: [0, 172 * k.h / 270], to: [0, k.h] } });
        k.save(); k.translate(0, 344); k.scale(1, -1.1); const refl = forest(k, -40, 520, 170, 4, { paint: false, depth: 0, hmin: 8, hmax: 32, hill: 10, step: 7, leafy: 0.45 }); k.restore();
        k.tint(refl, '#3A2448', 0.5);
        const R = rng(21);
        for (let i = 0; i < 34; i++) { const y = 175 + i * i * 0.075, len = 3 + i * 0.9, x = 412 - len / 2 + Math.sin(t * 2.2 + i * 1.9) * (1 + i * 0.25); k.stroke([[x, y], [x + len, y]], 1, i < 14 ? '#FFF2C0' : '#F4B070'); }
        for (let i = 0; i < 60; i++) { const y = 176 + R() * 100, x = ((R() * 560 + t * (4 + (y - 170) * 0.06)) % 580) - 40, len = 4 + (y - 170) * 0.12; k.stroke([[x, y], [x + len, y]], 1, y < 200 ? '#E8906E' : '#9A5A78'); }
        // the float, bobbing on the line
        const bob = Math.sin(t * 2.6) * 1.2;
        k.stroke([[482, 2], [468, 110], [456, 205 + bob]], 1, '#E8E0D0');
        k.ellipse(456, 206 + bob, 3, 3.6, 0, { fill: '#F2F0E6', line: INK, lw: 1 });
        k.rect(453, 203 + bob, 6, 3, { fill: '#E8462E' });
        k.stroke([[447, 210], [465, 210]], 1, '#FFD0A0');
        // --- WREN
        const WX = 290, WY = 116, WS = 1.06, HS = 1.16;
        k.save(); k.translate(WX, WY); k.scale(WS);
        const lid = blink(t, 1.3) ? 1 : 0.46;
        const gleam = ((t + 2.2) % 5.2) < 0.55 ? ((t + 2.2) % 5.2) / 0.55 : -1;
        wrenBody(k, { sun: [1, -0.2] });
        const talkingW = st.speaking?.who === 'WREN';
        k.save(); k.translate(0, 8); k.scale(HS); k.translate(0, -8);                                  // a big head, LucasArts proportions
        const head = wrenHead(k, { sun: [1, -0.2], mouth: mouthOf(st, 'WREN'), lids: lid, brow: talkingW ? -0.2 : st.speaking?.who === 'OVERWATCH' && st.speaking.lt > 0.8 ? 0.6 : 0, look: st.speaking?.who === 'OVERWATCH' ? -1 : 0.3, gleam });
        k.restore();
        wrenRodArm(k, { t });
        k.restore();
        st.talkers = st.talkers || {};
        st.talkers.WREN = [WX + head.top[0] * WS * HS, WY + (8 + (head.top[1] - 8) * HS) * WS];
        // --- the field radio in the foreground
        const on = st.speaking?.who === 'OVERWATCH';
        radio(k, 18, 150, t, on);
        st.talkers.OVERWATCH = [96, 58];
        // reeds in the near corner
        reeds(k, -10, 30, 272, 40, 110, ['#2A1A30', '#3A2438', '#1E1426'], 5, 8, 14);
      });
      return st;
    },
  },
};

function blink(t, seed) { return ((t + seed * 1.7) % 3.9) < 0.12; }

function radio(k, x, y, t, on) {
  // antenna whip (swaying, buzzing when it talks)
  const buzz = on ? Math.sin(t * 40) * 1.2 : 0, sway = Math.sin(t * 1.1) * 3;
  k.stroke([[x + 112, y + 6], [x + 116 + sway * 0.4, y - 50], [x + 124 + sway + buzz, y - 108]], [4, 3, 2], INK);
  k.stroke([[x + 112, y + 6], [x + 116 + sway * 0.4, y - 50], [x + 124 + sway + buzz, y - 108]], [2, 1.4, 1], '#5A5C5E');
  k.ellipse(x + 124 + sway + buzz, y - 110, 2.5, 2.5, 0, { fill: '#2A2A2E', line: INK, lw: 1 });
  if (on) for (let i = 0; i < 3; i++) {
    const q = (t * 2.4 + i / 3) % 1, r = 8 + q * 22, cx = x + 124 + sway, cy = y - 104;
    k.stroke([[cx + r * 0.6, cy - r * 0.8], [cx + r, cy], [cx + r * 0.6, cy + r * 0.8]], 1.5 * (1 - q) + 0.5, '#FFF0C8');
    k.stroke([[cx - r * 0.6, cy - r * 0.8], [cx - r, cy], [cx - r * 0.6, cy + r * 0.8]], 1.5 * (1 - q) + 0.5, '#FFF0C8');
  }
  // the set: an olive steel case in perspective, dials, a handset on its cord
  const top = k.shape([[x, y + 14, 1], [x + 26, y - 4, 1], [x + 150, y - 2, 1], [x + 132, y + 18, 1]], { fill: '#8A9254', line: INK, lw: 2, smooth: false });
  void top;
  const front = k.shape([[x, y + 14, 1], [x + 132, y + 18, 1], [x + 136, y + 140, 1], [x - 4, y + 140, 1]], { fill: '#5E6636', line: INK, lw: 2, smooth: false });
  k.save(); k.clip(front);
  k.shape([[x - 10, y + 60], [x + 150, y + 68], [x + 150, y + 150], [x - 10, y + 150]], { fill: '#4A5028' });
  rim(k, front, 0, -2, '#98A060');
  k.restore();
  const side = k.shape([[x + 132, y + 18, 1], [x + 150, y - 2, 1], [x + 152, y + 116, 1], [x + 136, y + 140, 1]], { fill: '#454B26', line: INK, lw: 2, smooth: false });
  k.save(); k.clip(side); rim(k, side, 2, 0, '#D8A870'); k.restore();
  // dials and knobs
  for (const [dx, dy, r] of [[28, 44, 11], [66, 46, 8], [100, 44, 9]]) {
    k.ellipse(x + dx, y + dy, r, r * 0.95, 0, { fill: '#2A2C24', line: INK, lw: 1 });
    k.ellipse(x + dx - 1, y + dy - 1, r * 0.72, r * 0.7, 0, { fill: '#3E4234' });
    k.stroke([[x + dx, y + dy], [x + dx + r * 0.55, y + dy - r * 0.45]], 1.5, '#D8D2B8');
  }
  // the frequency window, glowing, with a needle that dances on transmission
  k.rect(x + 14, y + 66, 64, 18, { fill: '#1E2418', line: INK, lw: 1 });
  k.rect(x + 16, y + 68, 60, 14, { fill: on ? '#B8F08A' : '#6E8A52' });
  for (let i = 0; i < 9; i++) k.stroke([[x + 20 + i * 6.5, y + 70], [x + 20 + i * 6.5, y + 74]], 1, '#2E3A22');
  const nx = x + 46 + (on ? Math.sin(t * 17) * 10 : 0);
  k.stroke([[nx, y + 69], [nx, y + 81]], 1.4, '#C8402E');
  k.ellipse(x + 104, y + 76, 4, 4, 0, { fill: on && Math.floor(t * 8) % 2 ? '#FFF0A0' : '#6E5A2A', line: INK, lw: 1 });
  // stencil and speaker grille
  for (let i = 0; i < 5; i++) k.stroke([[x + 16, y + 98 + i * 6], [x + 70, y + 99 + i * 6]], 1.6, '#2C3018');
  k.stroke([[x + 86, y + 104], [x + 120, y + 105]], 2, '#B0B480');
  k.stroke([[x + 86, y + 112], [x + 112, y + 113]], 2, '#B0B480');
  // the handset hanging off the side on its coiled cord
  const hs = k.shape([[x + 138, y + 30], [x + 150, y + 26], [x + 160, y + 60], [x + 158, y + 96], [x + 146, y + 100], [x + 142, y + 64]], { fill: '#2E3228', line: INK, lw: 2 });
  k.save(); k.clip(hs); rim(k, hs, 2, 0, '#8A7A5A'); k.restore();
  for (let i = 0; i < 8; i++) k.ellipse(x + 142 - i * 0.5, y + 104 + i * 4, 3, 1.6, 0, { line: INK, lw: 1, fill: '#3A3E32' });
}

export { WC, INK, vgrad, screen, clamp01 };
