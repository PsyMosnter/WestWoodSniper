// @ts-check
/**
 * Satellite recon (owner playtest 4). From mission 2 WREN carries one recon uplink: press RECON, tap anywhere on
 * the map, and a satellite sweeps a screen-sized area — for a few seconds everything in it is visible, as if WREN
 * stood in the middle of it; then it falls back to fog (explored, not visible).
 *
 * Field rewards: from mission 3, intel taken off the enemy earns more recon — a Warden's radio codes, a comms
 * array or jammer brought down, a string of clean kills (takedowns, or unseen headshots from range). From mission
 * 5 the big sabotage (power, fuel, shield generator, heavy armour) earns a tactical strike instead.
 */
import { BALANCE } from '../config/balance.js';
import { C } from '../config/palette.js';
import { TILE } from '../core/camera.js';
import { Time } from '../core/time.js';
import { drawText } from '../render/font.js';

const R = BALANCE.recon;

/** campaign level of a mission id ('m3' → 3; Boot Camp and test maps → 0) */
export const missionLevel = (id) => { const m = /^m(\d+)$/.exec(id || ''); return m ? +m[1] : 0; };

export class ReconSystem {
  constructor(game) {
    this.game = game;
    this.state = 'idle';
    /** @type {{x:number,y:number}|null} */ this.hover = null;
    /** @type {{cx:number,cy:number,rect:any,t:number,revealed:boolean}|null} */ this.scan = null;
    this.cleanKills = 0;
    const w = game.world, lvl = missionLevel(game.missionId);
    if (w.operative.recon === undefined) w.operative.recon = lvl >= R.fromLevel ? R.start : 0;
    w.events.on('unitKilled', (e) => this.onKill(e.unit, e.cause));
    w.events.on('structureDestroyed', (e) => this.onDestroyed(e.structure));
  }
  get level() { return missionLevel(this.game.missionId); }
  /** the screen-sized area centred on (x, y), in tiles */
  area(x, y) {
    const c = this.game.cam, w = c.viewW / c.zoom / TILE, h = c.viewH / c.zoom / TILE;
    return { x0: Math.floor(x - w / 2), y0: Math.floor(y - h / 2), x1: Math.ceil(x + w / 2), y1: Math.ceil(y + h / 2) };
  }
  toggleTargeting() {
    const g = this.game;
    if (this.state === 'targeting') { this.state = 'idle'; g.mode = 'normal'; return; }
    if (!(g.world.operative.recon > 0)) { g.hud.toast('NO SATELLITE UPLINK', C.uiAmber); return; }
    if (this.scan) { g.hud.toast('SATELLITE BUSY', C.uiAmber); return; }
    if (g.strike?.state === 'targeting') g.strike.toggleTargeting();
    this.state = 'targeting'; g.mode = 'recon';
    g.hud.toast('TAP AN AREA TO SCAN', C.uiAmber, 1.8);
  }
  tapTarget(x, y) {
    const g = this.game, op = g.world.operative;
    if (this.state !== 'targeting' || !(op.recon > 0)) return;
    op.recon--;
    this.state = 'idle'; g.mode = 'normal';
    this.scan = { cx: x + 0.5, cy: y + 0.5, rect: this.area(x + 0.5, y + 0.5), t: 0, revealed: false };
    g.hud.toast('SATELLITE RECON — UPLINK', '#9CFF8A', 2);
    g.audio?.play?.('laser');
  }
  update(dt) {
    const s = this.scan;
    if (!s) return;
    s.t += dt;
    if (!s.revealed && s.t >= R.sweep) {
      s.revealed = true;
      this.game.world.fog.revealArea(Math.floor(s.cx), Math.floor(s.cy), s.rect, R.show);
    }
    if (s.t >= R.sweep + R.show) this.scan = null;
  }
  // ---------------------------------------------------------------- rewards
  grant(kind, why) {
    const g = this.game, op = g.world.operative;
    if (kind === 'recon') { if ((op.recon || 0) >= R.max) return; op.recon = (op.recon || 0) + 1; g.hud.toast(`${why}: +1 SATELLITE RECON`, '#9CFF8A', 2.6); }
    else { if ((op.designator || 0) >= R.maxStrikes) return; op.designator = (op.designator || 0) + 1; g.hud.toast(`${why}: +1 TACTICAL STRIKE`, C.uiAlert, 2.6); }
    g.audio?.play?.('pickup');
  }
  onKill(u, cause = {}) {
    const lvl = this.level, op = this.game.world.operative;
    if (lvl < R.rewardsFrom || cause.source !== 'player') return;
    if (u.type === 'warden') { this.grant('recon', "WARDEN'S RADIO CODES"); return; }
    if ((u.type === 'juggernaut' || u.type === 'crawler') && lvl >= R.strikesFrom) { this.grant('strike', 'HEAVY ARMOUR DOWN'); return; }
    // clean kills: taken down, or shot in the head from range by someone who never saw it coming
    const far = Math.hypot(u.x - op.x, u.y - op.y) >= R.cleanRange;
    const clean = cause.by === 'knife' || (cause.zone === 'head' && far && u.state !== 'combat');
    if (clean && ++this.cleanKills % R.cleanChain === 0) this.grant('recon', `${R.cleanChain} CLEAN KILLS`);
  }
  onDestroyed(s) {
    const lvl = this.level;
    if (lvl < R.rewardsFrom) return;
    if (['commsArray', 'jammer'].includes(s.type)) this.grant('recon', 'ENEMY NETWORK CUT');
    else if (['powerPlant', 'fuelDepot', 'shieldGenerator', 'generator'].includes(s.type)) this.grant(lvl >= R.strikesFrom ? 'strike' : 'recon', 'SABOTAGE');
  }
  // ---------------------------------------------------------------- drawing
  draw(ctx, r) {
    const z = r.cam.zoom, blink = Math.floor(Time.realTime * 3) & 1;
    const box = (rc, col, dash) => {
      const x = Math.round(r.sx(rc.x0)), y = Math.round(r.sy(rc.y0)), w = Math.round((rc.x1 - rc.x0) * TILE * z), h = Math.round((rc.y1 - rc.y0) * TILE * z);
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      if (dash) ctx.setLineDash([4, 3]);
      ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      ctx.setLineDash([]);
      // corner brackets
      ctx.fillStyle = col;
      for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) { ctx.fillRect(cx, cy, 8 * sx, 2 * sy); ctx.fillRect(cx, cy, 2 * sx, 8 * sy); }
      return { x, y, w, h };
    };
    if (this.state === 'targeting') {
      const c = r.cam, p = this.hover || { x: (c.left + c.viewW / c.zoom / 2) / TILE, y: (c.top + c.viewH / c.zoom / 2) / TILE };
      const b = box(this.area(p.x, p.y), blink ? '#9CFF8A' : '#4E9A4A', true);
      drawText(ctx, 'SATELLITE RECON — TAP TO SCAN', b.x + b.w / 2, b.y + 6, { font: '3x5', color: '#9CFF8A', align: 'center', shadow: '#000' });
    }
    const s = this.scan;
    if (s) {
      const b = box(s.rect, s.revealed ? 'rgba(156,255,138,0.55)' : '#9CFF8A', false);
      if (!s.revealed) {
        // the sweep: a bright scanline running down the area over a faint grid
        const k = s.t / R.sweep, y = b.y + Math.round(b.h * k);
        ctx.fillStyle = 'rgba(156,255,138,0.08)'; ctx.fillRect(b.x, b.y, b.w, Math.max(0, y - b.y));
        ctx.fillStyle = 'rgba(156,255,138,0.2)';
        for (let gx = b.x; gx < b.x + b.w; gx += 16 * z) ctx.fillRect(Math.round(gx), b.y, 1, Math.max(0, y - b.y));
        ctx.fillStyle = '#C8FFB8'; ctx.fillRect(b.x, y, b.w, 2);
      } else {
        const left = Math.max(0, R.sweep + R.show - s.t);
        drawText(ctx, `RECON ${left.toFixed(1)}s`, b.x + 4, b.y + 4, { font: '3x5', color: '#9CFF8A', shadow: '#000' });
      }
    }
  }
}
