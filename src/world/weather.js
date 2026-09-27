// @ts-check
import { BALANCE } from '../config/balance.js';
import { TILE } from '../core/camera.js';
import { Time } from '../core/time.js';
import { T } from './tiles.js';
import { canSee } from './los.js';
import { makeSuspicious } from '../ai/fsm.js';
import { drawSwath } from '../render/terrainCover.js';

/**
 * Snow tracks (SPEC §8.6) and weather (blizzard in Mission 3; rain/haze tint elsewhere).
 * Tracks: footprints in deep snow fade after 60 s; a patrol that crosses fresh tracks becomes
 * Suspicious and follows them in the direction they lead (up to 10 tiles). Blizzards wipe them.
 */
export class Weather {
  constructor(game) {
    this.game = game;
    const w = this.world = game.world;
    this.kind = w.data.weather || null;
    w.weather = this.kind;
    w.blizzard = false;
    this.t = 0;
    this.tracks = [];
    this.checkT = 0;
    this.flakes = Array.from({ length: 140 }, (_, i) => ({ x: (i * 97) % 560, y: (i * 53) % 300, s: 0.6 + ((i * 7) % 10) / 10 }));
    w.events.on('track', (e) => this.addTrack(e));
  }
  addTrack(e) {
    const last = this.tracks[this.tracks.length - 1];
    if (last && Math.hypot(last.x - e.x, last.y - e.y) < 0.4) return;
    this.tracks.push({ x: e.x, y: e.y, a: e.a, t: 0, side: (this.tracks.length & 1) ? 1 : -1 });
    if (this.tracks.length > 400) this.tracks.shift();
  }
  update(dt) {
    const w = this.world, B = BALANCE.terrain;
    this.t += dt;
    if (this.kind === 'blizzard') {
      const phase = this.t % B.blizzardEvery;
      const on = phase > B.blizzardEvery - B.blizzardLength;
      if (on && !w.blizzard) { this.tracks = []; this.game.hud?.say('Blizzard! Visibility dropping.', true); }
      if (!on && w.blizzard) this.game.hud?.say('Blizzard is passing.');
      w.blizzard = on;
    }
    for (const t of this.tracks) t.t += dt;
    if (this.tracks.length && this.tracks[0].t > B.snowTrackLife) this.tracks = this.tracks.filter((t) => t.t <= B.snowTrackLife);
    // patrols notice fresh tracks
    this.checkT -= dt;
    if (this.checkT <= 0 && this.tracks.length) {
      this.checkT = 0.5;
      for (const u of w.units) {
        if (u.dead || u.hidden || u.kind !== 'infantry' || !(u.state === 'unaware' || u.state === 'returning')) continue;
        for (let i = this.tracks.length - 1; i >= 0; i -= 2) {
          const tr = this.tracks[i];
          if (tr.t > 45) break;
          const d = Math.hypot(tr.x - u.x, tr.y - u.y);
          if (d > 4) continue;
          if (!canSee(w.map, u.tx, u.ty, Math.floor(tr.x), Math.floor(tr.y), {})) continue;
          // follow the direction the tracks lead (toward newer prints), up to 10 tiles
          const newer = this.tracks[this.tracks.length - 1];
          const dx = newer.x - tr.x, dy = newer.y - tr.y, dd = Math.hypot(dx, dy) || 1;
          const k = Math.min(10, dd);
          makeSuspicious(u, tr.x + (dx / dd) * k, tr.y + (dy / dd) * k);
          u.tag = { text: '?', t: 1.5 };
          u.stateT = 1.5;
          break;
        }
      }
    }
  }
  /** footprints: a tile-wide trough through the snow with boot prints (drawn on the ground, under sprites) */
  drawTracks(ctx, r) {
    if (this.tracks.length) drawSwath(ctx, r, this.tracks, 'snow', this.world.map.biome, BALANCE.terrain.snowTrackLife, null);
  }
  /** screen-space weather overlay (above the world, below the HUD) */
  drawOverlay(ctx, W, H) {
    const w = this.world;
    if (w.data.tint) { ctx.fillStyle = w.data.tint; ctx.fillRect(0, 0, W, H); }
    if (this.kind === 'blizzard') {
      const k = w.blizzard ? 1 : 0.25;
      if (w.blizzard) { ctx.fillStyle = 'rgba(220,232,240,0.22)'; ctx.fillRect(0, 0, W, H); }
      ctx.fillStyle = 'rgba(245,250,255,0.85)';
      const t = Time.realTime;
      const n = Math.floor(this.flakes.length * k);
      for (let i = 0; i < n; i++) {
        const f = this.flakes[i];
        const x = ((f.x + t * 90 * f.s * (w.blizzard ? 2.4 : 0.6)) % (W + 20)) - 10;
        const y = ((f.y + t * 40 * f.s) % (H + 10)) - 5;
        ctx.fillRect(Math.round(x), Math.round(y), w.blizzard ? 3 : 1, 1);
      }
    }
    if (this.kind === 'rain') {
      ctx.fillStyle = 'rgba(160,190,210,0.5)';
      const t = Time.realTime;
      for (let i = 0; i < 120; i++) {
        const f = this.flakes[i];
        const x = ((f.x - t * 60 * f.s) % (W + 20) + W + 20) % (W + 20) - 10, y = ((f.y + t * 260 * f.s) % (H + 10)) - 5;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 3);
      }
    }
  }
}
