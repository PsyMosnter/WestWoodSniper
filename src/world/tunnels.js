// @ts-check
import { BALANCE } from '../config/balance.js';
import { C } from '../config/palette.js';
import { Time } from '../core/time.js';
import { drawText } from '../render/font.js';

/**
 * Tunnels (SPEC §16 Mission 6): enter at one end, emerge at the other after `time` seconds.
 * WREN is hidden (and safe) inside; following escorts come through behind him.
 * A tunnel may have a `guard` (a unit living in the dark, hidden from the map): going through
 * while it lives costs a scuffle underground — extra time and one bite — and it doesn't come out.
 */
export class TunnelSystem {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.tunnels = (this.world.data.tunnels || []).map((t) => ({ ...t }));
    this.transit = null; // {tunnel, from, to, t, guard, fightAt}
    for (const t of this.tunnels) {
      const g = this.guardOf(t);
      if (g) { g.hidden = true; g.inTunnel = t.id; }
    }
  }
  guardOf(t) {
    if (!t.guard) return null;
    const g = this.world.units.find((u) => u.id === t.guard);
    return g && !g.dead ? g : null;
  }
  endAt(tx, ty) {
    for (const t of this.tunnels) {
      if (Math.abs(t.a.x - tx) <= 1 && Math.abs(t.a.y - ty) <= 1) return { tunnel: t, from: t.a, to: t.b };
      if (Math.abs(t.b.x - tx) <= 1 && Math.abs(t.b.y - ty) <= 1) return { tunnel: t, from: t.b, to: t.a };
    }
    return null;
  }
  /** tap on a (discovered) tunnel mouth → walk there and go through */
  tap(tx, ty) {
    const e = this.endAt(tx, ty);
    if (!e || !this.world.fog.isSeen(e.from.x, e.from.y)) return false;
    const op = this.world.operative;
    if (!op.orderMove(e.from.x, e.from.y, 'walk', () => this.enter(e))) return false;
    this.game.hud.toast('INTO THE CULVERT', C.uiText, 1.2);
    return true;
  }
  enter(e) {
    const op = this.world.operative;
    if (this.transit || op.dead) return;
    if (Math.hypot(op.x - (e.from.x + 0.5), op.y - (e.from.y + 0.5)) > 1.6) return;   // a partial path stopped short
    const time = e.tunnel.time || 4, guard = this.guardOf(e.tunnel);
    this.transit = { ...e, t: time + (guard ? BALANCE.tunnel.guardFight : 0), guard, fightAt: time / 2 + (guard ? BALANCE.tunnel.guardFight : 0) };
    op.hidden = true; op.path = [];
    this.game.engage?.cancel?.();
    this.game.audio?.play?.('splash');
  }
  update(dt) {
    const tr = this.transit;
    if (!tr) return;
    tr.t -= dt;
    const w = this.world, op = w.operative;
    if (tr.guard && tr.t <= tr.fightAt) this._fight(tr);
    if (op.dead) { this.transit = null; return; }
    if (tr.t <= 0) {
      this.transit = null;
      op.hidden = false;
      op.x = op.px = tr.to.x + 0.5; op.y = op.py = tr.to.y + 0.5;
      op.stance = 'crouch';
      for (const f of w.friendlies) {
        if (f.dead || f.captive || f.mode !== 'follow') continue;
        const spot = w.map.nearestWalkable(tr.to.x + w.rng.range(-1, 1), tr.to.y + w.rng.range(-1, 1), 2) || tr.to;
        f.x = f.px = spot.x + 0.5; f.y = f.py = spot.y + 0.5; f.path = [];
      }
      this.game.cam.follow = true;
      this.game.hud.toast('OUT OF THE CULVERT', C.uiText, 1.2);
    }
  }
  /** The guard in the dark: one bite, then it's dealt with. Nobody above hears or finds it. */
  _fight(tr) {
    const g = tr.guard, w = this.world;
    tr.guard = null;
    if (g.dead) return;
    const cause = { by: 'knife', source: 'player' };
    g.dead = true; g.hp = 0; g.state = 'dead'; g.deathT = 99; g.path = []; g.tag = null;
    g.killedBy = cause.by; g.killedByPlayer = true;
    w.stats.kills++;
    w.events.emit('unitKilled', { unit: g, cause });
    this.game.combat?.damageOp(BALANCE.tunnel.guardDamage, null, 'bite');
    this.game.hud.toast('SOMETHING IN THE DARK!', C.uiAlert, 1.6);
    this.game.hud.say('Contact in the culvert… it\'s down. Keep moving.', true);
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
    if (this.transit) drawText(ctx, `IN THE CULVERT… ${Math.max(0, this.transit.t).toFixed(1)}`, r.cam.viewW / 2, r.cam.viewH / 2 - 30, { color: C.uiText, align: 'center', shadow: '#000' });
  }
}
