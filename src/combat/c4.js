// @ts-check
import { BALANCE } from '../config/balance.js';
import { C } from '../config/palette.js';
import { TILE } from '../core/camera.js';
import { Time } from '../core/time.js';
import { explode } from './explosions.js';
import { drawText } from '../render/font.js';
import { canObserve } from '../ai/perception.js';

const K = BALANCE.c4;

/**
 * C4 demolition (SPEC §13): plant on a structure, a disabled vehicle or a demolishable bridge tile.
 * Walk to an adjacent tile → 2.5 s plant (interrupted by damage or a new order; the charge isn't used)
 * → 10 s fuse (or remote detonation) → destroys the target, radius 2.5 / 200 damage, noise 20.
 */
export class C4System {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    /** @type {{x:number,y:number,target:any,t:number,remote:boolean}[]} */
    this.charges = [];
    this.pending = null; // target awaiting confirmation
  }
  get remote() { return !!this.game.settings.remoteC4; }
  /** Can this be a C4 target? */
  targetAt(tx, ty) {
    const w = this.world, m = w.map;
    if (!m.inb(tx, ty)) return null;
    const si = m.structure[m.idx(tx, ty)];
    if (si >= 0) {
      const s = w.structures[si];
      if (s && !s.dead && s.def.c4 && !(s.type === 'hiveSpire' && s.hardened)) return { kind: 'structure', s, x: s.cx, y: s.cy, name: s.def.name };
    }
    for (const v of w.units) if (v.kind === 'vehicle' && v.disabled && !v.dead && Math.floor(v.x) === tx && Math.floor(v.y) === ty) return { kind: 'vehicle', v, x: v.x, y: v.y, name: v.name };
    if (m.demolishable[m.idx(tx, ty)]) return { kind: 'bridge', x: tx + 0.5, y: ty + 0.5, tx, ty, name: 'Bridge' };
    if (m.breach[m.idx(tx, ty)]) return { kind: 'breach', x: tx + 0.5, y: ty + 0.5, tx, ty, name: 'Cracked rock' };
    return null;
  }
  /** tiles adjacent to the target the Operative could plant from */
  plantTile(target) {
    const w = this.world, m = w.map, op = w.operative;
    let cand = [];
    if (target.kind === 'structure') {
      const s = target.s;
      for (let y = s.y - 1; y <= s.y + s.h; y++) for (let x = s.x - 1; x <= s.x + s.w; x++) {
        if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) continue;
        cand.push({ x, y });
      }
    } else {
      const cx = Math.floor(target.x), cy = Math.floor(target.y);
      for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) if (x !== cx || y !== cy) cand.push({ x, y });
      if (target.kind === 'bridge') cand.push({ x: cx, y: cy });
    }
    cand = cand.filter((c) => m.walkable(c.x, c.y));
    if (!cand.length) return null;
    const field = w.pf.field(op.tx, op.ty, 200);
    cand.sort((a, b) => field[m.idx(a.x, a.y)] - field[m.idx(b.x, b.y)]);
    return field[m.idx(cand[0].x, cand[0].y)] < Infinity ? cand[0] : null;
  }
  /** first tap on a target: ask for confirmation (SPEC §5.1 "confirm button appears") */
  propose(target) { this.pending = target; this.pendingT = 5; }
  confirm() {
    const t = this.pending; this.pending = null;
    if (t) this.plant(t);
  }
  plant(target) {
    const g = this.game, w = this.world, op = w.operative;
    if (op.c4 <= 0) { g.hud.toast('NO C4 LEFT', C.uiAlert); return false; }
    const tile = this.plantTile(target);
    if (!tile) { g.hud.toast("CAN'T REACH IT", C.uiGrey); return false; }
    const begin = () => {
      op.busy = {
        kind: 'plant', t: 0, dur: K.plantTime, target,
        onDone: () => this._placed(target),
        onCancel: () => g.hud.toast('PLANT INTERRUPTED', C.uiAmber),
      };
      op.facing = Math.round(((Math.atan2(target.y - op.y, target.x - op.x) + Math.PI / 2) / (Math.PI / 4)) + 8) % 8;
      g.audio?.play?.('plant');
    };
    if (tile.x === op.tx && tile.y === op.ty && !op.moving) begin();
    else op.orderMove(tile.x, tile.y, 'walk', begin);
    g.hud.toast('PLANTING C4 ON ' + target.name.toUpperCase(), C.uiAmber, 1.2);
    return true;
  }
  _placed(target) {
    const g = this.game, op = this.world.operative;
    op.c4--;
    const x = (op.x + target.x) / 2, y = (op.y + target.y) / 2;
    const c = { x, y, target, t: this.remote ? Infinity : K.fuse, remote: this.remote, beep: 0 };
    this.charges.push(c);
    if (this.remote) g.remoteArmed = true;
    g.hud.say('Charge set.');
  }
  detonateRemote() {
    for (const c of this.charges) if (c.remote) c.t = 0;
    this.game.remoteArmed = false;
  }
  update(dt) {
    const w = this.world, op = w.operative;
    if (this.pending && (this.pendingT -= dt) <= 0) this.pending = null;
    // while planting: count as Crouch; guard-post guards with LOS detect instantly
    if (op.busy?.kind === 'plant') {
      for (const u of w.units) {
        if (u.dead || u.behaviour?.kind !== 'guardPost') continue;
        const tgt = op.busy.target;
        if (tgt.kind !== 'structure' || u.behaviour.building !== tgt.s.id) continue;
        if (canObserve(u, op, w).visible) { u.det = 1; this.game.enemies.enterCombat(u); }
      }
    }
    for (const c of this.charges) {
      c.t -= dt;
      c.beep -= dt;
      if (c.beep <= 0 && Number.isFinite(c.t)) { c.beep = c.t < 3 ? 0.25 : 0.8; this.game.audio?.play?.('beep'); }
    }
    const due = this.charges.filter((c) => c.t <= 0);
    this.charges = this.charges.filter((c) => c.t > 0);
    for (const c of due) this.detonate(c);
    if (!this.charges.some((c) => c.remote)) this.game.remoteArmed = false;
  }
  detonate(c) {
    const g = this.game, w = this.world, t = c.target;
    if (t.kind === 'structure' && !t.s.dead) g.structures.destroy(t.s, { by: 'c4' });
    if (t.kind === 'vehicle' && !t.v.dead) g.vehicles.destroy(t.v, { by: 'c4' });
    if (t.kind === 'bridge') g.structures?.demolishBridge?.(t.tx, t.ty);
    if (t.kind === 'breach') g.structures?.blastBreach?.(t.tx, t.ty);
    explode(g.combat, c.x, c.y, K.radius, K.damage, { source: 'player', noise: K.noise, buildingMult: 0.5 });
    w.noise(c.x, c.y, K.noise, 'c4');
    // base alert: at least Caution; Alarm if inside a base footprint
    for (const [id, grp] of w.alerts.groups) {
      const area = grp.cfg?.area ? w.data.areas?.[grp.cfg.area] : null;
      const inside = area && c.x >= area.x && c.y >= area.y && c.x < area.x + area.w && c.y < area.y + area.h;
      const near = w.units.some((u) => !u.dead && u.alertGroup === id && Math.hypot(u.x - c.x, u.y - c.y) <= K.noise);
      if (inside) w.alerts.raise(id, 'alarm', 'c4');
      else if (near) w.alerts.raise(id, 'caution', 'c4');
    }
  }
  /** world-space UI: charges with countdown, the pending-target marker */
  draw(ctx, r) {
    const z = r.cam.zoom;
    for (const c of this.charges) {
      const X = Math.round(r.sx(c.x)), Y = Math.round(r.sy(c.y));
      ctx.fillStyle = '#07090A'; ctx.fillRect(X - 3 * z, Y - 2 * z, 6 * z, 4 * z);
      ctx.fillStyle = '#A6F03C'; ctx.fillRect(X - 2 * z, Y - z, 4 * z, 2 * z);
      if (Math.floor(Time.realTime * (c.t < 3 ? 8 : 3)) & 1) { ctx.fillStyle = C.uiAlert; ctx.fillRect(X, Y - 2 * z, z, z); }
      const txt = c.remote ? 'ARMED' : Math.max(0, c.t).toFixed(1);
      drawText(ctx, txt, X, Y - 12 * z, { font: '3x5', color: c.t < 3 ? C.uiAlert : C.uiAmber, align: 'center', shadow: '#000' });
    }
    if (this.pending) {
      const p = this.pending;
      const X = Math.round(r.sx(p.x)), Y = Math.round(r.sy(p.y));
      const k = (Time.realTime * 2) % 1;
      ctx.strokeStyle = C.uiAmber; ctx.lineWidth = 1;
      ctx.strokeRect(X - 14 - k * 3, Y - 14 - k * 3, 28 + k * 6, 28 + k * 6);
    }
  }
}
