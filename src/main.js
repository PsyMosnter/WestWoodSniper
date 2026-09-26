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
import { DebriefScene } from './ui/debrief.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
const params = new URLSearchParams(location.search);

const app = {
  params,
  seed: seedFromUrl(1234),
  debug: params.get('debug') === '1',
  save: loadSave(),
  /** @type {any} */ settings: null,
  display: new Display(canvas),
  /** @type {Input} */ input: /** @type {any} */ (null),
  /** @type {SceneManager} */ scenes: /** @type {any} */ (null),
  audio: new Audio(),
  hasScene(name) { return this.scenes.registry.has(name); },
  /** missions with content so far */
  available: ['m1', 'm2', 'm3', 'm4'],
  missionExists(id) { return this.available.includes(id); },
  startCampaign() {
    if (this.hasScene('campaign')) this.scenes.go('campaign', {});
    else this.scenes.go('briefing', { mission: 'm1' });
  },
  continueCampaign() { this.startCampaign(); },
  applySettings() {
    this.audio.setVolumes(this.settings.sfx, this.settings.music);
    this.scenes.resize(this.display.W, this.display.H);
  },
  vibrate(ms) { try { navigator.vibrate?.(ms); } catch (e) { /* ignore */ } },
  persist() { writeSave(this.save); },
};
app.settings = app.save.settings;
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
  if (map) app.scenes.go('game', { mission: map });
  else if (params.get('skip') === '1') app.startCampaign();
  else app.scenes.go('title', {});
  Time.scale = 1;
  loop.start();
})();
