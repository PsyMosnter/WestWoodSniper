// @ts-check
import { Pix } from '../pixel.js';
import { PALETTES } from '../../config/palette.js';
import { HUSK, HW, HH, HAX, HAY } from './humanoid.js';
import { registerUnitDef } from '../sprites.js';

/**
 * NOT infantry world sprites (SPEC §12.1): tall, lanky, too many joints, glowing eyes, plated carapace,
 * charcoal with lime & violet trim. All share the Husk body; gear overlays distinguish roles.
 */
const pal = PALETTES.NOT;
const P = (p, x, y, ch) => { const c = pal[ch] || ch; if (c) p.set(x, y, c); };

function gearLobber(p, c) {
  // grenade belt (orange pods) at the waist, front and sides
  const { gx, gy, view } = c;
  const row = gy + 8;
  if (view !== 'N') for (const x of view === 'E' ? [2, 3, 4] : [0, 2, 3, 5]) P(p, gx + x, row, 'o');
  else P(p, gx + 1, row, 'o'), P(p, gx + 4, row, 'o');
}
function gearScorcher(p, c) {
  const { gx, gy, view } = c;
  if (view === 'N' || view === 'NE') {
    for (let y = 4; y <= 8; y++) for (let x = 1; x <= 4; x++) P(p, gx + x, gy + y, y === 4 ? 'O' : x === 1 ? 'O' : 'o');
    P(p, gx + 2, gy + 3, 'm');
  } else if (view === 'E' || view === 'SE') {
    for (let y = 4; y <= 8; y++) { P(p, gx - 1, gy + y, 'o'); P(p, gx, gy + y, y === 4 ? 'O' : 'o'); }
    P(p, gx + 5, gy + 6, 'm'); P(p, gx + 6, gy + 6, 'f');
  } else {
    P(p, gx - 1, gy + 5, 'o'); P(p, gx + 6, gy + 5, 'o'); P(p, gx + 3, gy + 7, 'm'); P(p, gx + 3, gy + 8, 'f');
  }
}
function gearWarden(p, c) {
  const { gx, gy, view, back } = c;
  // violet crest on the head
  P(p, gx + 2, gy - 1, 'V'); P(p, gx + 3, gy - 1, 'v'); P(p, gx + 3, gy - 2, 'v');
  if (back) { for (let y = 4; y <= 6; y++) { P(p, gx + 2, gy + y, 'G'); P(p, gx + 3, gy + y, 'G'); } P(p, gx + 4, gy + 2, 'm'); P(p, gx + 4, gy + 1, 'm'); P(p, gx + 4, gy, 'l'); }
  else if (view === 'E' || view === 'SE') { P(p, gx, gy + 5, 'G'); P(p, gx, gy + 3, 'm'); P(p, gx, gy + 2, 'l'); }
}
function gearLauncher(p, c) { /* launcher tube drawn by weapon 'launcher' */ }
function gearHarvester(p, c) {
  const { gx, gy, view, back } = c;
  // spore basket with lime crystals
  if (back || view === 'E' || view === 'SE') {
    const bx = back ? gx + 1 : gx - 2;
    for (let y = 4; y <= 7; y++) for (let x = 0; x <= (back ? 3 : 2); x++) P(p, bx + x, gy + y, y === 4 ? 'l' : 'G');
    P(p, bx + 1, gy + 3, 'e');
  } else { P(p, gx - 1, gy + 4, 'G'); P(p, gx - 1, gy + 3, 'l'); }
}
function gearVrask(p, c) {
  const { gx, gy, view, back } = c;
  // tall helmet crest + cape
  for (let y = -3; y <= -1; y++) P(p, gx + 3, gy + y, y === -3 ? 'l' : 'v');
  P(p, gx + 2, gy - 1, 'v');
  const capeX = back ? [0, 1, 2, 3, 4, 5] : view === 'E' || view === 'SE' ? [0, 1] : [0, 5];
  for (const x of capeX) for (let y = 5; y <= 10; y++) P(p, gx + x, gy + y, (x + y) % 3 ? 'v' : 'V');
}

const HUSK_HARV = { ...HUSK, pants: 'C', gun: 'g', gunL: 'l' };

registerUnitDef('husk', { base: HUSK, pal: 'NOT', weapon: 'rifle' });
registerUnitDef('lobber', { base: HUSK, pal: 'NOT', weapon: 'grenade', gear: gearLobber });
registerUnitDef('scorcher', { base: HUSK, pal: 'NOT', weapon: 'short', gear: gearScorcher });
registerUnitDef('launcher', { base: HUSK, pal: 'NOT', weapon: 'launcher', gear: gearLauncher });
registerUnitDef('warden', { base: HUSK, pal: 'NOT', weapon: 'short', gear: gearWarden });
registerUnitDef('harvester', { base: HUSK_HARV, pal: 'NOT', weapon: 'none', gear: gearHarvester });
registerUnitDef('vrask', { base: HUSK, pal: 'NOT', weapon: 'short', gear: gearVrask });

/** Sniffer beast: a low, fast quadruped (custom sprite). */
function sniffer(pose, dir, frame) {
  const p = new Pix(HW, HH);
  const ax = HAX, ay = HAY;
  const side = dir === 2 || dir === 6 || dir === 1 || dir === 3 || dir === 5 || dir === 7;
  const flip = dir >= 5;
  const k = 'k', c = 'c', C = 'C', v = 'v', e = 'e', l = 'l';
  if (pose === 'dead') {
    for (let x = 3; x <= 13; x++) { P(p, x, ay - 1, c); P(p, x, ay - 2, x < 6 ? C : c); }
    P(p, 13, ay - 3, e);
    p.outline(pal[k]);
    return p;
  }
  const moving = pose === 'walk' || pose === 'run';
  const f = frame & 3;
  if (side) {
    // body horizontal
    for (let x = 4; x <= 12; x++) for (let y = ay - 6; y <= ay - 3; y++) P(p, x, y, y === ay - 6 ? C : (x % 3 === 0 ? v : c));
    // spine ridges
    for (const x of [5, 7, 9]) P(p, x, ay - 7, v);
    // head forward
    for (let x = 12; x <= 15; x++) for (let y = ay - 7; y <= ay - 4; y++) P(p, x, y, c);
    P(p, 15, ay - 6, e); P(p, 14, ay - 6, e); P(p, 16, ay - 4, l); P(p, 15, ay - 3, 'w');
    // legs (4) with gait
    const legs = [[5, 0], [7, 2], [10, 1], [12, 3]];
    for (const [lx, ph] of legs) {
      const off = moving ? [1, 0, -1, 0][(f + ph) & 3] : 0;
      P(p, lx + off, ay - 2, c); P(p, lx + off, ay - 1, c); P(p, lx + off * 2, ay, k);
    }
    P(p, 3, ay - 6, c); P(p, 2, ay - 7, c); // tail
  } else {
    const front = dir === 4;
    for (let x = ax - 3; x <= ax + 3; x++) for (let y = ay - 8; y <= ay - 2; y++) P(p, x, y, x === ax - 3 || x === ax + 3 ? v : c);
    for (let x = ax - 2; x <= ax + 2; x++) P(p, x, ay - 9, C);
    if (front) { P(p, ax - 1, ay - 7, e); P(p, ax + 1, ay - 7, e); P(p, ax, ay - 4, l); P(p, ax - 1, ay - 3, 'w'); P(p, ax + 1, ay - 3, 'w'); }
    else { P(p, ax, ay - 9, v); P(p, ax, ay - 10, c); }
    const off = moving ? (f & 1) : 0;
    P(p, ax - 3, ay - 1 + off, c); P(p, ax + 3, ay - 1 - off + 1, c); P(p, ax - 2, ay, k); P(p, ax + 2, ay, k);
  }
  p.outline(pal[k]);
  return flip ? p.mirrored() : p;
}
registerUnitDef('sniffer', {
  custom: (pose, dir, frame) => {
    const pix = sniffer(pose, dir, frame);
    return { canvas: pix.toCanvas(), ax: HAX, ay: HAY, w: pix.w, h: pix.h };
  },
});
