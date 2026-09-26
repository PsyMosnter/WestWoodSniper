// @ts-check
import { BALANCE } from '../config/balance.js';
import { valueNoise } from '../core/rng.js';

const S = BALANCE.scope;

/** Smooth two-axis sway curve (sum of sines + low-frequency noise), unit amplitude. */
export function swayCurve(t) {
  const x = Math.sin(t * 1.13) * 0.55 + Math.sin(t * 2.71 + 1.3) * 0.25 + (valueNoise(t * 0.45, 3.7, 9) - 0.5) * 0.9;
  const y = Math.sin(t * 0.87 + 0.6) * 0.5 + Math.sin(t * 2.29 + 2.1) * 0.25 + (valueNoise(t * 0.4, 8.1, 11) - 0.5) * 0.9;
  return { x, y };
}

/**
 * Sway amplitude in scope px (SPEC §10.4).
 * @param {{stance:string, distRatio:number, lowHp:boolean, hurt:boolean, breath:'hold'|'gasp'|'normal', assisted:boolean, difficulty:number}} o
 */
export function swayAmplitude(o) {
  let a = S.swayBase * (S.swayStance[o.stance] ?? 1);
  const k = Math.max(0, Math.min(1, (o.distRatio - 0.5) / 0.5));
  a *= 1 + (S.swayFarMult - 1) * k;                // 1.0 at ≤ 50 % of max range → 1.5 at max
  if (o.lowHp) a *= S.swayLowHp;
  if (o.hurt) a *= S.swayHurt;
  if (o.breath === 'hold') a *= S.breathMult;
  else if (o.breath === 'gasp') a *= S.gaspMult;
  if (o.assisted) a *= S.assistSway;
  a *= o.difficulty ?? 1;
  return a;
}

/** Shot dispersion radius in scope px: 0 up to 70 % of max range, rising to 3 px at max range. */
export function dispersion(distRatio) {
  if (distRatio <= S.dispersionStart) return 0;
  return S.dispersionMax * Math.min(1, (distRatio - S.dispersionStart) / (1 - S.dispersionStart));
}
