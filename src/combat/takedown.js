// @ts-check
import { BALANCE } from '../config/balance.js';
import { C } from '../config/palette.js';
import { Time } from '../core/time.js';
import { angleToDir8 } from '../world/tiles.js';
import { unitSprite, unitVariant, markerLift } from '../render/sprites.js';

const K = BALANCE.takedown;

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
  /** Take u down (returns false and says why if it can't be done). */
  perform(u = this.target()) {
    const g = this.game, w = this.world, op = w.operative;
    const why = u ? this.blocker(u) : 'no target';
    if (why) { g.hud?.toast(why === 'they see you' ? 'THEY SEE YOU' : 'NO ONE IN REACH', C.uiAmber, 1.2); return false; }
    const a = Math.atan2(u.y - op.y, u.x - op.x);
    op.path = []; op.pendingMove = null;
    op.angle = a; op.facing = angleToDir8(a);
    op.busy = { kind: 'takedown', t: 0, dur: K.time, target: u };
    g.engage?.cancel?.();
    g.combat.kill(u, { by: 'knife', source: 'player', dir: a });
    w.noise(u.x, u.y, BALANCE.noise.takedown, 'takedown', op);
    w.stats.takedowns = (w.stats.takedowns || 0) + 1;
    g.hud?.toast('SILENT TAKEDOWN', C.uiText, 1.2);
    return true;
  }
  /** A pulsing amber bracket over the enemy WREN can take down right now (world space, over the fog). */
  draw(ctx, r) {
    if (this.game.scopeOpen) return;
    const u = this.target();
    if (!u) return;
    const { pose, frame } = u.pose();
    const lift = markerLift(unitSprite(u.type, pose, u.dir, frame, unitVariant(u)), 17);
    const z = r.cam.zoom, x = Math.round(r.sx(u.x)), y = Math.round(r.sy(u.y) - lift * z);
    const bob = (Math.floor(Time.realTime * 4) & 1) * z;
    ctx.fillStyle = '#07090A'; ctx.fillRect(x - 5 * z, y - 2 * z - bob, 11 * z, 5 * z);
    ctx.fillStyle = C.uiAmber;
    // ▼ with side ticks: "this one"
    ctx.fillRect(x - 4 * z, y - z - bob, z, 3 * z); ctx.fillRect(x + 4 * z, y - z - bob, z, 3 * z);
    ctx.fillRect(x - 2 * z, y - z - bob, 5 * z, z); ctx.fillRect(x - z, y - bob, 3 * z, z); ctx.fillRect(x, y + z - bob, z, z);
  }
}
