// @ts-check
/** Persistence (SPEC §17.8): localStorage key 'westwood-sniper:v1', wrapped in try/catch. */
const KEY = 'westwood-sniper:v1';

export const DEFAULT_SETTINGS = {
  music: 0.6, sfx: 0.8, difficulty: 'operative', assistedAim: false, reducedMotion: false,
  colourBlind: false, handedness: 'right', scanlines: true, remoteC4: false,
  artStyle: 'new',       // 'new' (ray-cast redesigns, the default) | 'classic' (the original sprites)
};

export function loadSave() {
  let d = null;
  try { const raw = localStorage.getItem(KEY); if (raw) d = JSON.parse(raw); } catch (e) { d = null; }
  if (!d || typeof d !== 'object') d = {};
  const settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  // v2: New art became the default. Saves from before stored 'classic' only because it was the
  // default then, so they move to New once; anyone who picks Classic afterwards keeps it.
  if (!(d.v >= 2)) settings.artStyle = 'new';
  return {
    v: 2,
    unlocked: typeof d.unlocked === 'number' ? d.unlocked : 1,
    missions: d.missions && typeof d.missions === 'object' ? d.missions : {},
    settings,
    /** cutscenes already watched (they play in full once, then only from the replay buttons) */
    seenCuts: d.seenCuts && typeof d.seenCuts === 'object' ? d.seenCuts : {},
    /** mid-mission saves, one per mission: { mission, key, kind: 'auto'|'quick', at, name, snap } */
    resume: d.resume && typeof d.resume === 'object' ? d.resume : {},
  };
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); return true; } catch (e) { return false; }
}
