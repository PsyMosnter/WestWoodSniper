// @ts-check
import { BALANCE } from '../config/balance.js';
import { C } from '../config/palette.js';
import { Time } from '../core/time.js';
import { angleToDir8 } from '../world/tiles.js';
import { unitSprite, unitVariant, markerLift } from '../render/sprites.js';
import { TILE } from '../core/camera.js';

const K = BALANCE.takedown;
const RING_IN = 0.8, RING_RANGE = 12;   // takedown ring: inner radius (the target's own space) and who gets one (tiles)

/**
 * Silent takedown (playtest feedback): crawl (or sneak) up to an infantry target that hasn't noticed
 * WREN and finish them by hand — no ammunition, barely a sound (a 1.5-tile scuffle). The body stays
 * where it falls and can still be found; anyone who *sees* it happen is a witness as usual.
 */
export class Takedown {
  constructor(game) {
    this.game = game;
    this.world = game.world;
  }
  /** Why target u can't be taken down right now (null = it can). */
  blocker(u) {
    const w = this.world, op = w.operative, m = w.map;
    if (!u || u.dead || u.hidden || op.dead || op.hidden || op.busy) return 'busy';
    if (u.kind === 'vehicle' || u.kind === 'emplacement' || u.kind === 'turret' || u.kind === 'structure' || u.def?.kind !== 'infantry') return 'not infantry';
    if (u.invulnerable) return 'untouchable';
    if (Math.hypot(u.x - op.x, u.y - op.y) > K.reach) return 'too far';
    if (m.elevAt(u.tx, u.ty) !== m.elevAt(op.tx, op.ty)) return 'different level';
    if (u.state === 'combat' || (u.seesOp && u.det >= K.awareDet)) return 'they see you';
    return null;
  }
  /** The nearest enemy WREN could take down right now, if any. */
  target() {
    const op = this.world.operative;
    let best = null, bd = Infinity;
    for (const u of this.world.units) {
      if (this.blocker(u)) continue;
      const d = Math.hypot(u.x - op.x, u.y - op.y);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }
  /** WREN is flat (hunkered, crawling or getting down): the takedown rings show. */
  flat() { const op = this.world.operative; return !op.dead && (op.stance === 'hunker' || op.trans?.to === 'hunker'); }
  /** Enemies that get a takedown ring: seen, unaware, on WREN's level, within RING_RANGE tiles. */
  ringTargets() {
    if (!this.flat()) return [];
    const w = this.world, op = w.operative;
    return w.units.filter((u) => { const why = this.blocker(u); return (!why || why === 'too far') && w.fog.isVisible(u.tx, u.ty) && Math.hypot(u.x - op.x, u.y - op.y) <= RING_RANGE; });
  }
  /** The enemy whose ring (the donut between RING_IN and reach) covers world point (fx, fy), if any. */
  ringAt(fx, fy) {
    let best = null, bd = Infinity;
    for (const u of this.ringTargets()) {
      const d = Math.hypot(fx - u.x, fy - u.y);
      if (d >= RING_IN * 0.6 && d <= K.reach + 0.35 && d < bd) { bd = d; best = u; }
    }
    return best;
  }
  /** Crawl up on u and take them down once in reach (a tap on their ring). */
  stalk(u) {
    this.stalking = { u, t: 0 };
    this.game.hud?.toast('STALKING — STAY LOW', C.uiAmber, 1.2);
    this.update(0);
  }
  update(dt) {
    const s = this.stalking;
    if (!s) return;
    const op = this.world.operative, u = s.u;
    if (!this.flat() || !u || u.dead || u.hidden) { this.stalking = null; return; }
    const why = this.blocker(u);
    if (!why) { this.stalking = null; this.perform(u); return; }
    if (why === 'busy') return;
    if (why !== 'too far') { this.stalking = null; this.game.hud?.toast(why === 'they see you' ? 'THEY SEE YOU' : 'TAKEDOWN LOST', C.uiAmber, 1.2); return; }
    // keep crawling at them, re-aimed now and then (they walk their patrols)
    if ((s.t -= dt) <= 0 || !op.moving) {
      s.t = 0.6;
      if (!op.trans && !op.orderMove(u.tx, u.ty, 'crawl')) { this.stalking = null; this.game.hud?.toast("CAN'T REACH THEM", C.uiGrey, 1); }
    }
  }
  /** Take u down (returns false and says why if it can't be done). */
  perform(u = this.target()) {
    const g = this.game, w = this.world, op = w.operative;
    const why = u ? this.blocker(u) : 'no target';
    if (why) { g.hud?.toast(why === 'they see you' ? 'THEY SEE YOU' : 'NO ONE IN REACH', C.uiAmber, 1.2); return false; }
    const a = Math.atan2(u.y - op.y, u.x - op.x);
    op.path = []; op.pendingMove = null;
    op.angle = a; op.facing = angleToDir8(a);
    op.busy = { kind: 'takedown', t: 0, dur: K.time, target: u };
    // close the gap: a quick lunge to arm's length (reach is 2 tiles, the knife is not), if the ground allows
    const d = Math.hypot(u.x - op.x, u.y - op.y), m = w.map;
    if (d > K.lunge) {
      const x1 = u.x - Math.cos(a) * K.lunge, y1 = u.y - Math.sin(a) * K.lunge;
      const ok = m.inb(Math.floor(x1), Math.floor(y1)) && m.cost[m.idx(Math.floor(x1), Math.floor(y1))] < Infinity && m.elevAt(Math.floor(x1), Math.floor(y1)) === m.elevAt(op.tx, op.ty);
      if (ok) op.busy.lunge = { x0: op.x, y0: op.y, x1, y1, dur: Math.min(K.time * 0.6, 0.35) };
    }
    g.engage?.cancel?.();
    g.combat.kill(u, { by: 'knife', source: 'player', dir: a });
    w.noise(u.x, u.y, BALANCE.noise.takedown, 'takedown', op);
    g.audio?.play?.('takedown');
    w.stats.takedowns = (w.stats.takedowns || 0) + 1;
    g.hud?.toast('SILENT TAKEDOWN', C.uiText, 1.2);
    return true;
  }
  /**
   * Flat: a takedown ring (a donut, reach wide) around each enemy WREN could crawl up on — tap it to stalk.
   * Plus a pulsing amber bracket over the enemy he can take down right now (world space, over the fog).
   */
  draw(ctx, r) {
    if (this.game.scopeOpen) return;
    const z = r.cam.zoom, T = TILE, t = Time.realTime;
    for (const v of this.ringTargets()) {
      const cx = Math.round(r.sx(v.x)), cy = Math.round(r.sy(v.y)), R = K.reach * T * z, Ri = RING_IN * T * z;
      const hot = this.stalking?.u === v || !this.blocker(v);
      ctx.fillStyle = hot ? 'rgba(255,178,58,0.2)' : 'rgba(255,178,58,0.1)';
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.arc(cx, cy, Ri, 0, Math.PI * 2, true); ctx.fill();
      // outer edge: marching dashes; inner edge: a thin solid line
      const n = Math.round(R / (3 * z)), off = (t * 1.5) % 1;
      ctx.fillStyle = C.uiAmber;
      for (let i = 0; i < n; i++) {
        if ((i & 3) === 3) continue;
        const a = ((i + off) / n) * Math.PI * 2;
        ctx.fillRect(Math.round(cx + Math.cos(a) * R - z / 2), Math.round(cy + Math.sin(a) * R - z / 2), z, z);
      }
      ctx.globalAlpha = 0.6;
      const m = Math.round(Ri / z) * 3;
      for (let i = 0; i < m; i++) { const a = (i / m) * Math.PI * 2; ctx.fillRect(Math.round(cx + Math.cos(a) * Ri - z / 2), Math.round(cy + Math.sin(a) * Ri - z / 2), z, z); }
      ctx.globalAlpha = 1;
    }
    const u = this.target();
    if (!u) return;
    const { pose, frame } = u.pose();
    const lift = markerLift(unitSprite(u.type, pose, u.dir, frame, unitVariant(u)), 17);
    const x = Math.round(r.sx(u.x)), y = Math.round(r.sy(u.y) - lift * z);
    const bob = (Math.floor(Time.realTime * 4) & 1) * z;
    ctx.fillStyle = '#07090A'; ctx.fillRect(x - 5 * z, y - 2 * z - bob, 11 * z, 5 * z);
    ctx.fillStyle = C.uiAmber;
    // ▼ with side ticks: "this one"
    ctx.fillRect(x - 4 * z, y - z - bob, z, 3 * z); ctx.fillRect(x + 4 * z, y - z - bob, z, 3 * z);
    ctx.fillRect(x - 2 * z, y - z - bob, 5 * z, z); ctx.fillRect(x - z, y - bob, 3 * z, z); ctx.fillRect(x, y + z - bob, z, z);
  }
}
