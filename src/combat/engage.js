// @ts-check
import { BALANCE } from '../config/balance.js';
import { C } from '../config/palette.js';
import { canSee } from '../world/los.js';

const ST = BALANCE.stances;

function inCone(u, x, y) {
  const prof = BALANCE.ai.vision[u.profile];
  let a = Math.atan2(y - u.y, x - u.x) - u.angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return Math.abs(a) <= (prof.cone * Math.PI) / 360;
}

/**
 * Engage logic when tapping an enemy (SPEC §5.3): Run & Gun close-in with the pistol, or the
 * sniper approach — choose the best firing tile, walk (or run), auto-crouch, open the scope.
 */
export class Engage {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.target = null;
    this.mode = null;       // 'pistol' | 'sniper'
    this.replans = 0;
    this.checkT = 0;
    this.dest = null;
    this.waitScope = false;
  }
  cancel() { this.target = null; this.mode = null; this.waitScope = false; this.game.combat.pistol.tapped = null; }
  rangeFrom(tx, ty, target, hunker = false) {
    const m = this.world.map;
    const adv = Math.max(0, Math.min(ST.elevRangeBonusMax, m.elevAt(tx, ty) - m.elevAt(target.tx, target.ty)));
    return (hunker ? ST.hunker.range : ST.crouch.range) + adv * ST.elevRangeBonus;
  }
  inRangeNow(target) {
    const op = this.world.operative, m = this.world.map;
    const d = Math.hypot(target.x - op.x, target.y - op.y);
    return d <= this.rangeFrom(op.tx, op.ty, target, op.stance === 'hunker') && canSee(m, op.tx, op.ty, target.tx, target.ty, {});
  }
  /**
   * @param {any} target
   * @param {{force?: boolean, run?: boolean}} [o]
   */
  engage(target, o = {}) {
    const g = this.game, op = this.world.operative;
    if (op.dead || !target || target.dead) return;
    this.target = target;
    this.replans = 0;
    this.checkT = 1;
    if (op.runGun && !o.force) {
      this.mode = 'pistol';
      g.combat.pistol.tapped = target;
      this._pistolApproach(o.run);
      return;
    }
    this.mode = 'sniper';
    g.combat.pistol.tapped = null;
    // already braced and in range → scope immediately (this is what makes hunkering useful)
    if (op.inScopeStance && this.inRangeNow(target)) { this._open(); return; }
    if (op.stance === 'hunker' && !this.inRangeNow(target)) g.hud.toast('OUT OF RANGE — MOVING', C.uiAmber, 1);
    this._plan(o.run);
  }
  _pistolApproach(run) {
    const op = this.world.operative, t = this.target;
    const d = Math.hypot(t.x - op.x, t.y - op.y);
    if (d <= 3) { op.stop(); return; }
    // head for a point ~2.5 tiles short of the target (pistol range is 4), never onto it
    const k = Math.max(0, (d - 2.5) / d);
    const gx = Math.floor(op.x + (t.x - op.x) * k), gy = Math.floor(op.y + (t.y - op.y) * k);
    const goal = this.world.resolveGoal(op.tx, op.ty, gx, gy);
    if (goal) op.orderMove(goal.x, goal.y, run ? 'run' : 'walk');
  }
  _plan(run) {
    const w = this.world, m = w.map, op = w.operative, t = this.target;
    const field = w.pf.field(op.tx, op.ty, 90);
    const known = w.units.filter((u) => !u.dead && u !== t && u.kind !== 'structure' && w.time - u.seenByPlayerT < 12);
    const R = 12;
    let best = null, bs = Infinity;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = t.tx + dx, y = t.ty + dy;
      if (!m.inb(x, y)) continue;
      const i = m.idx(x, y);
      if (field[i] === Infinity || m.cost[i] === Infinity) continue;
      const d = Math.hypot(t.x - (x + 0.5), t.y - (y + 0.5));
      const range = this.rangeFrom(x, y, t);
      if (d > range - 0.3 || d < 2.2) continue;
      if (!canSee(m, x, y, t.tx, t.ty, {})) continue;
      let score = field[i];
      let seen = 0;
      for (const u of known) {
        const ud = Math.hypot(u.x - (x + 0.5), u.y - (y + 0.5));
        if (ud < 7.5 && canSee(m, u.tx, u.ty, x, y, {})) { seen = 1; break; }
      }
      score += 3 * seen;
      // the target's own cone counts too (don't pick a tile it is staring at)
      if (t.profile && inCone(t, x + 0.5, y + 0.5) && Math.hypot(t.x - (x + 0.5), t.y - (y + 0.5)) < 7.5) score += 4;
      if (m.conceal[i] < 1) score -= 2;
      if (m.coverTile[i]) score -= 2;
      score -= 3 * Math.max(0, m.elev[i] - m.elev[m.idx(t.tx, t.ty)]);
      // prefer not to stand closer than necessary to the target
      score += Math.max(0, 5 - d) * 0.6;
      if (score < bs) { bs = score; best = { x, y }; }
    }
    if (!best) { this.game.hud.toast('NO FIRING POSITION', C.uiAmber); this.cancel(); return; }
    this.dest = best;
    if (best.x === op.tx && best.y === op.ty && op.inScopeStance) { this._open(); return; }
    op.orderMove(best.x, best.y, run ? 'run' : 'walk', () => { this.waitScope = true; });
    this.game.renderer.addMarker(best.x + 0.5, best.y + 0.5, 'tap', C.uiAmber);
  }
  _open() {
    const t = this.target;
    this.waitScope = false;
    if (!t || t.dead) { this.cancel(); return; }
    if (this.game.scope.openOn(t)) this.mode = null;
    this.target = this.mode ? this.target : null;
  }
  update(dt) {
    const t = this.target, op = this.world.operative;
    if (!t) return;
    if (t.dead || op.dead) {
      // target down: stop closing in (don't walk out onto the body)
      if (this.mode === 'pistol' && op.moving) op.stop();
      this.cancel();
      return;
    }
    if (this.mode === 'pistol') {
      this.checkT -= dt;
      if (this.checkT <= 0) { this.checkT = 1; if (Math.hypot(t.x - op.x, t.y - op.y) > 3) this._pistolApproach(op.mode === 'run'); else { op.stop(); } }
      if (!op.runGun) this.cancel();
      return;
    }
    if (this.mode !== 'sniper') return;
    if (this.waitScope) {
      if (op.inScopeStance) {
        if (this.inRangeNow(t)) this._open();
        else this._replan();
      }
      return;
    }
    // approaching: if the target moves out of range of our destination, re-plan once per second
    if (!op.moving && !op.trans && !this.waitScope) {
      if (op.path.length === 0 && op.stance !== 'walk' && op.stance !== 'run') { this.waitScope = true; }
      return;
    }
    this.checkT -= dt;
    if (this.checkT <= 0 && this.dest) {
      this.checkT = 1;
      const d = Math.hypot(t.x - (this.dest.x + 0.5), t.y - (this.dest.y + 0.5));
      if (d > this.rangeFrom(this.dest.x, this.dest.y, t) || !canSee(this.world.map, this.dest.x, this.dest.y, t.tx, t.ty, {})) this._replan();
    }
  }
  _replan() {
    this.replans++;
    this.waitScope = false;
    if (this.replans > 3) { this.game.hud.toast('TARGET LOST', C.uiAmber); this.cancel(); return; }
    this._plan(this.world.operative.mode === 'run');
  }
}
