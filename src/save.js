// @ts-check
/** Persistence (SPEC §17.8): localStorage key 'westwood-sniper:v1', wrapped in try/catch. */
const KEY = 'westwood-sniper:v1';

export const DEFAULT_SETTINGS = {
  music: 0.6, sfx: 0.8, difficulty: 'operative', assistedAim: false, reducedMotion: false,
  colourBlind: false, handedness: 'right', scanlines: true, remoteC4: false, autoRunGun: true,
  artStyle: 'chibi',     // 'chibi' (the final look, the default) | 'newest' | 'new' | 'classic' (the original sprites)
};

export function loadSave() {
  let d = null;
  try { const raw = localStorage.getItem(KEY); if (raw) d = JSON.parse(raw); } catch (e) { d = null; }
  if (!d || typeof d !== 'object') d = {};
  const settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  // v2: New art became the default; v3: Chibi is the final look. Older saves only hold the default of their day,
  // so they move to Chibi once; anyone who picks another style afterwards keeps it.
  if (!(d.v >= 3)) settings.artStyle = 'chibi';
  return {
    v: 3,
    unlocked: typeof d.unlocked === 'number' ? d.unlocked : 1,
    missions: d.missions && typeof d.missions === 'object' ? d.missions : {},
    settings,
    /** cutscenes already watched (they play in full once, then only from the replay buttons) */
    seenCuts: d.seenCuts && typeof d.seenCuts === 'object' ? d.seenCuts : {},
    /** mid-mission saves, one per mission: { mission, key, kind: 'auto'|'quick', at, name, snap } */
    resume: d.resume && typeof d.resume === 'object' ? d.resume : {},
    /** tips already read (each shows once per save) — was written but dropped on load until playtest 2 */
    tutorialSeen: Array.isArray(d.tutorialSeen) ? d.tutorialSeen : [],
    /** Boot Camp: 'done' | 'skipped' | null (the campaign map asks once while null) */
    bootCamp: d.bootCamp === 'done' || d.bootCamp === 'skipped' ? d.bootCamp : null,
  };
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); return true; } catch (e) { return false; }
}
