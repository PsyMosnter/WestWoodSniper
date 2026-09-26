// @ts-check
import { canSee } from '../world/los.js';

/**
 * Objective engine (SPEC §16.1). Types: OBSERVE, DESTROY, KILL, REACH, ESCORT, RESCUE, EXTRACT,
 * SURVIVE, STEALTH, CUSTOM. Objectives can be primary/secondary and hidden until revealed.
 */
export class Objectives {
  constructor(game, defs) {
    this.game = game;
    this.world = game.world;
    this.items = defs.map((d) => ({ ...d, done: false, failed: false, progress: 0, hidden: !!d.hidden }));
    this.listeners = [];
  }
  list() { return this.items; }
  get(id) { return this.items.find((o) => o.id === id); }
  reveal(id) { const o = this.get(id); if (o && o.hidden) { o.hidden = false; this.game.hud?.toast('NEW OBJECTIVE', '#FFB23A'); } }
  complete(id) {
    const o = this.get(id);
    if (!o || o.done || o.failed) return;
    o.done = true; o.progress = 1;
    this.world.events.emit('objectiveDone', o);
  }
  fail(id) { const o = this.get(id); if (o && !o.done) { o.failed = true; this.world.events.emit('objectiveFailed', o); } }
  primaryDone() { return this.items.filter((o) => o.primary && o.type !== 'EXTRACT').every((o) => o.done); }
  allDone(ids) { return ids.every((id) => this.get(id)?.done); }
  update(dt) {
    const w = this.world, op = w.operative, areas = w.data.areas || {};
    for (const o of this.items) {
      if (o.done || o.failed || o.hidden) continue;
      switch (o.type) {
        case 'OBSERVE': {
          const a = areas[o.area];
          if (!a) break;
          const cx = Math.floor(a.x + a.w / 2), cy = Math.floor(a.y + a.h / 2);
          const d = Math.hypot(cx + 0.5 - op.x, cy + 0.5 - op.y);
          // LOS to the area's centre (or one of its 4 neighbours, so a single post can't block it)
          const los = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => canSee(w.map, op.tx, op.ty, cx + dx, cy + dy, {}));
          const ok = !op.dead && op.inScopeStance && d <= 8 && !(this.game.awareness?.state === 'detected') && los;
          o.observing = ok;
          if (ok) {
            o.progress = Math.min(1, o.progress + dt / (o.seconds || 4));
            if (o.progress >= 1) this.complete(o.id);
          }
          break;
        }
        case 'REACH': {
          const a = areas[o.area];
          if (a && op.x >= a.x && op.y >= a.y && op.x < a.x + a.w && op.y < a.y + a.h) this.complete(o.id);
          break;
        }
        case 'KILL': {
          const u = w.units.find((x) => x.id === o.unit);
          if (u && u.dead) this.complete(o.id);
          break;
        }
        case 'DESTROY': {
          const ids = o.entities || [o.entity];
          const n = ids.filter((id) => { const s = w.structures.find((x) => x.id === id) || w.units.find((x) => x.id === id); return s && s.dead; }).length;
          o.progress = n / (o.minCount || ids.length);
          if (n >= (o.minCount || ids.length)) this.complete(o.id);
          break;
        }
        case 'ESCORT': {
          const a = areas[o.area];
          const fs = (o.units || []).map((id) => w.friendlies.find((f) => f.id === id)).filter(Boolean);
          const alive = fs.filter((f) => !f.dead);
          const inside = a ? alive.filter((f) => f.x >= a.x && f.y >= a.y && f.x < a.x + a.w && f.y < a.y + a.h) : [];
          const need = o.minCount || fs.length;
          o.progress = Math.min(1, inside.length / need);
          o.count = `${inside.length}/${need}`;
          if (alive.length < need) this.fail(o.id);
          else if (inside.length >= need) this.complete(o.id);
          break;
        }
        case 'RESCUE': {
          const fs = (o.units || []).map((id) => w.friendlies.find((f) => f.id === id)).filter(Boolean);
          if (fs.some((f) => f.dead)) { this.fail(o.id); break; }
          const freed = fs.filter((f) => !f.captive).length;
          o.progress = fs.length ? freed / fs.length : 0;
          if (fs.length && freed === fs.length) this.complete(o.id);
          break;
        }
        case 'CUSTOM': {
          const r = this.game.runner;
          if (r && r.custom[o.fn]?.(r, o)) this.complete(o.id);
          break;
        }
        case 'SURVIVE': {
          o.elapsed = (o.elapsed || 0) + dt;
          o.progress = Math.min(1, o.elapsed / o.seconds);
          if (o.elapsed >= o.seconds) this.complete(o.id);
          break;
        }
        default: break;
      }
    }
  }
}
