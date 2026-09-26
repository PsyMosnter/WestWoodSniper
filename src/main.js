// @ts-check
/**
 * Westwood Sniper — bootstrap & scene manager wiring (SPEC §19.1).
 * URL params: ?map=m1 (jump to a mission) · ?seed=123 · ?debug=1 · ?reveal=1 · ?skip=1 (skip title)
 */
import { Display } from './core/display.js';
import { Input } from './core/input.js';
import { Loop } from './core/loop.js';
import { SceneManager } from './core/scenes.js';
import { Time } from './core/time.js';
import { seedFromUrl } from './core/rng.js';
import { loadSave, writeSave } from './save.js';
import { GameScene } from './scenes/gameScene.js';
import { PauseScene, TitleScene, CreditsScene, FailedScene } from './scenes/menus.js';
import { SettingsScene } from './scenes/settings.js';
import { Audio } from './audio/sfx.js';
import { loadManifest } from './render/sprites.js';
import { BriefingScene } from './ui/briefing.js';
import { CutsceneScene } from './scenes/cutscene.js';
import { DebriefScene } from './ui/debrief.js';
import { Art } from './render/artStyle.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
const params = new URLSearchParams(location.search);

const app = {
  params,
  seed: seedFromUrl(1234),
  debug: params.get('debug') === '1',
  save: loadSave(),
  /** @type {any} */ settings: null,
  /** mid-mission checkpoint for the current run: { mission, key, snap } (memory only, SPEC §17.8) */
  /** @type {any} */ checkpoint: null,
  display: new Display(canvas),
  /** @type {Input} */ input: /** @type {any} */ (null),
  /** @type {SceneManager} */ scenes: /** @type {any} */ (null),
  audio: new Audio(),
  hasScene(name) { return this.scenes.registry.has(name); },
  /** missions with content so far */
  available: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'],
  missionExists(id) { return this.available.includes(id); },
  startCampaign() {
    if (this.hasScene('campaign')) this.scenes.go('campaign', {});
    else this.scenes.go('briefing', { mission: 'm1' });
  },
  continueCampaign() { this.startCampaign(); },
  /** cutscenes off for debug/automated runs (?nocut=1 or ?debug=1) */
  cutsOn() { return params.get('nocut') !== '1' && !this.debug; },
  /**
   * Play cutscene `id`, then run `next` (skipped straight to `next` when cutscenes are off).
   * `firstTimeOnly`: only if this cutscene hasn't been watched yet (it can always be replayed).
   */
  playCut(id, next, firstTimeOnly = false) {
    if (!this.cutsOn() || (firstTimeOnly && this.save.seenCuts?.[id])) { next(); return; }
    this.scenes.go('cutscene', { id, next });
  },
  applySettings() {
    this.audio.setVolumes(this.settings.sfx, this.settings.music);
    Art.setStyle(this.settings.artStyle);
    this.scenes.resize(this.display.W, this.display.H);
  },
  vibrate(ms) { try { navigator.vibrate?.(ms); } catch (e) { /* ignore */ } },
  persist() { writeSave(this.save); },
};
app.settings = app.save.settings;
// ?art=classic|new: compare the art styles without touching the saved setting (Settings still wins once changed)
if (params.get('art')) app.settings = { ...app.settings, artStyle: params.get('art') === 'new' ? 'new' : 'classic' };
Art.setStyle(app.settings.artStyle);
app.input = new Input(canvas, app.display);
app.scenes = new SceneManager(app);
app.input.handler = app.scenes;
app.input.onUnlock(() => app.audio.unlock());

app.scenes.register('title', (a) => new TitleScene(a));
app.scenes.register('game', (a) => new GameScene(a));
app.scenes.register('pause', (a) => new PauseScene(a));
app.scenes.register('settings', (a) => new SettingsScene(a));
app.scenes.register('credits', (a) => new CreditsScene(a));
app.scenes.register('failed', (a) => new FailedScene(a));
app.scenes.register('briefing', (a) => new BriefingScene(a));
app.scenes.register('debrief', (a) => new DebriefScene(a));
app.scenes.register('cutscene', (a) => new CutsceneScene(a));

app.display.onResize((d) => app.scenes.resize(d.W, d.H));

const loop = new Loop({
  update: (dt) => app.scenes.update(dt),
  frame: (dt) => app.scenes.frame(dt),
  render: (alpha) => {
    const ctx = app.display.ctx;
    ctx.imageSmoothingEnabled = false;
    app.scenes.render(ctx, alpha);
  },
});

// @ts-ignore expose for debugging / automated tests
window.__app = app;

(async () => {
  await loadManifest();
  document.getElementById('boot')?.remove();
  const map = params.get('map');
  if (params.get('cut')) app.scenes.go('cutscene', { id: params.get('cut'), next: () => app.scenes.go('title', {}) });
  else if (map) app.scenes.go('game', { mission: map });
  else if (params.get('skip') === '1') app.startCampaign();
  else app.scenes.go('title', {});
  Time.scale = 1;
  loop.start();
})();
