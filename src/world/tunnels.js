// @ts-check
import { C } from '../config/palette.js';
import { Time } from '../core/time.js';
import { drawText } from '../render/font.js';

/**
 * Tunnels (SPEC §16 Mission 6): enter at one end, emerge at the other after `time` seconds.
 * WREN is hidden (and safe) inside; following escorts come through behind him.
 */
export class TunnelSystem {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.tunnels = (this.world.data.tunnels || []).map((t) => ({ ...t }));
    this.transit = null; // {tunnel, from, to, t}
  }
  endAt(tx, ty) {
    for (const t of this.tunnels) {
      if (Math.abs(t.a.x - tx) <= 1 && Math.abs(t.a.y - ty) <= 1) return { tunnel: t, from: t.a, to: t.b };
      if (Math.abs(t.b.x - tx) <= 1 && Math.abs(t.b.y - ty) <= 1) return { tunnel: t, from: t.b, to: t.a };
    }
    return null;
  }
  /** tap on a tunnel mouth → walk there and go through */
  tap(tx, ty) {
    const e = this.endAt(tx, ty);
    if (!e) return false;
    const op = this.world.operative;
    op.orderMove(e.from.x, e.from.y, 'walk', () => this.enter(e));
    this.game.hud.toast('INTO THE CULVERT', C.uiText, 1.2);
    return true;
  }
  enter(e) {
    const op = this.world.operative;
    if (this.transit || op.dead) return;
    this.transit = { ...e, t: e.tunnel.time || 4 };
    op.hidden = true; op.path = [];
    this.game.audio?.play?.('splash');
  }
  update(dt) {
    const tr = this.transit;
    if (!tr) return;
    tr.t -= dt;
    const op = this.world.operative;
    if (tr.t <= 0) {
      this.transit = null;
      op.hidden = false;
      op.x = op.px = tr.to.x + 0.5; op.y = op.py = tr.to.y + 0.5;
      op.stance = 'crouch';
      for (const f of this.world.friendlies) if (!f.dead && !f.captive && f.mode === 'follow') { f.x = f.px = tr.to.x + 0.5 + (Math.random() - 0.5); f.y = f.py = tr.to.y + 0.5 + (Math.random() - 0.5); f.path = []; }
      this.game.cam.follow = true;
      this.game.hud.toast('OUT OF THE CULVERT', C.uiText, 1.2);
    }
  }
  draw(ctx, r) {
    const z = r.cam.zoom;
    for (const t of this.tunnels) for (const p of [t.a, t.b]) {
      if (!this.world.fog.isSeen(p.x, p.y)) continue;
      const X = Math.round(r.sx(p.x + 0.5)), Y = Math.round(r.sy(p.y + 0.5));
      ctx.fillStyle = '#07090A'; ctx.fillRect(X - 4 * z, Y - 3 * z, 8 * z, 5 * z);
      ctx.fillStyle = '#3A3F42'; ctx.fillRect(X - 5 * z, Y - 4 * z, 10 * z, z);
      if (Math.floor(Time.realTime * 2) & 1) drawText(ctx, 'CULVERT', X, Y - 12 * z, { font: '3x5', color: C.uiTextD, align: 'center', shadow: '#000' });
    }
    if (this.transit) drawText(ctx, `IN THE CULVERT… ${this.transit.t.toFixed(1)}`, r.cam.viewW / 2, r.cam.viewH / 2 - 30, { color: C.uiText, align: 'center', shadow: '#000' });
  }
}
