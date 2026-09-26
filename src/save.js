// @ts-check
/** Persistence (SPEC §17.8): localStorage key 'westwood-sniper:v1', wrapped in try/catch. */
const KEY = 'westwood-sniper:v1';

export const DEFAULT_SETTINGS = {
  music: 0.6, sfx: 0.8, difficulty: 'operative', assistedAim: false, reducedMotion: false,
  colourBlind: false, handedness: 'right', scanlines: true, remoteC4: false,
};

export function loadSave() {
  let d = null;
  try { const raw = localStorage.getItem(KEY); if (raw) d = JSON.parse(raw); } catch (e) { d = null; }
  if (!d || typeof d !== 'object') d = {};
  return {
    unlocked: typeof d.unlocked === 'number' ? d.unlocked : 1,
    missions: d.missions && typeof d.missions === 'object' ? d.missions : {},
    settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
  };
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); return true; } catch (e) { return false; }
}
