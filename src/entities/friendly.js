// @ts-check
import { BALANCE } from '../config/balance.js';
import { C } from '../config/palette.js';
import { TILE } from '../core/camera.js';
import { Time } from '../core/time.js';
import { unitSprite, whiteOf } from '../render/sprites.js';
import { vehicleSprite } from '../render/spriteData/vehicles.js';
import { drawText } from '../render/font.js';
import { angleToDir8 } from '../world/tiles.js';

const F = BALANCE.friendly;

/** GOD friendlies (SPEC §15): pilots/scientists (rescue, follow/hold, hide) and medical trucks (convoy). */
export const FRIENDLY_TYPES = {
  pilot: { name: 'Pilot', kind: 'person', hp: BALANCE.units.pilot.hp, speed: BALANCE.units.pilot.speed, runLimit: BALANCE.units.pilot.runLimit },
  scientist: { name: 'Scientist', kind: 'person', hp: BALANCE.units.scientist.hp, speed: BALANCE.units.scientist.speed, runLimit: BALANCE.units.scientist.runLimit },
  medTruck: { name: 'Medical Truck', kind: 'vehicle', hp: BALANCE.units.medTruck.hp, speed: BALANCE.units.medTruck.speed },
};

export class Friendly {
  constructor(world, spec) {
    this.world = world;
    this.id = spec.id; this.type = spec.type;
    this.def = FRIENDLY_TYPES[spec.type] || FRIENDLY_TYPES.pilot;
    this.kind = this.def.kind;
    this.team = 'GOD';
    this.name = spec.name || this.def.name;
    this.x = spec.x + 0.5; this.y = spec.y + 0.5; this.px = this.x; this.py = this.y;
    this.angle = Math.PI / 2;
    this.hp = this.maxHp = this.def.hp;
    this.dead = false;
    this.captive = !!spec.captive || !!spec.downed;
    this.downed = !!spec.downed;
    this.freeT = 0;
    this.mode = this.captive ? 'captive' : this.kind === 'vehicle' ? 'convoy' : 'follow';
    this.hiding = this.captive;
    this.hideT = 0;
    this.runT = 0;
    this.path = [];
    this.animT = 0;
    this.flashT = 0;
    this.vision = this.captive ? 0 : BALANCE.units.friendlyVision;
    this.slot = spec.slot ?? 0;
    this.critical = !!spec.critical;
    this.hurtBy = null;
  }
  get tx() { return Math.floor(this.x); }
  get ty() { return Math.floor(this.y); }
  get elev() { return this.world.map.elevAt(this.tx, this.ty); }
  get hunkered() { return this.hiding && this.kind === 'person'; }
  get moving() { return this.path.length > 0; }
  /** stanceFactor: civilians 1.0 walking, 0.5 hiding; trucks are big */
  visibilityFactor() { return this.kind === 'vehicle' ? 1.2 : this.hiding ? 0.5 : 1.0; }
  goTo(tx, ty, veh = false) {
    const w = this.world, m = w.map;
    const goal = (veh ? m.vcost : m.cost)[m.idx(tx, ty)] < Infinity ? { x: tx, y: ty } : m.nearestWalkable(tx, ty, 3, veh);
    if (!goal) return false;
    const p = w.pf.find(this.tx, this.ty, goal.x, goal.y, { veh, partial: true, maxIter: 8000 });
    if (!p) return false;
    this.path = w.smoothPath(this.x, this.y, p, veh);
    return true;
  }
  step(dt, speed) {
    this.px = this.x; this.py = this.y;
    if (!this.path.length) return;
    const m = this.world.map;
    const veh = this.kind === 'vehicle';
    const c = (veh ? m.vcost : m.cost)[m.idx(this.tx, this.ty)];
    let budget = speed / Math.max(0.5, Math.min(3, c === Infinity ? 1 : c)) * dt;
    while (budget > 0 && this.path.length) {
      const wp = this.path[0];
      const dx = wp.x + 0.5 - this.x, dy = wp.y + 0.5 - this.y, d = Math.hypot(dx, dy);
      if (d > 1e-4) {
        const ta = Math.atan2(dy, dx);
        if (veh) {
          let da = ta - this.angle; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
          this.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, da));
          if (Math.abs(da) > 1) return;
        } else this.angle = ta;
      }
      if (d <= budget) { this.x = wp.x + 0.5; this.y = wp.y + 0.5; budget -= d; this.path.shift(); }
      else { this.x += (dx / d) * budget; this.y += (dy / d) * budget; budget = 0; }
    }
    this.animT += dt;
  }
}

/** Medical-truck convoy (SPEC §15.2): ADVANCE/HOLD, checkpoint to checkpoint, auto-stop on contact. */
export class TruckConvoy {
  constructor(game, trucks, pathId) {
    this.game = game; this.world = game.world;
    this.trucks = trucks.sort((a, b) => a.slot - b.slot);
    this.path = (this.world.data.paths?.[pathId] || []).map((p) => ({ ...p }));
    this.idx = 0;               // next waypoint index for the lead
    this.checkpoint = 0;
    this.advancing = false;     // player's order
    this.moving = false;        // actually rolling
    this.halted = false;        // auto-stop because of contact
    this.gateOpen = false;
    this.trail = [];            // lead breadcrumbs for spacing
    this.haltSaid = 0;
  }
  get lead() { return this.trucks.find((t) => !t.dead); }
  toggle() {
    this.advancing = !this.advancing;
    if (this.advancing) this.game.hud.say(this.halted ? 'Convoy holding — contact within six tiles.' : 'Convoy, advance.', true);
    else this.game.hud.say('Convoy, hold.', true);
  }
  update(dt) {
    const lead = this.lead;
    if (!lead) return;
    const w = this.world;
    // auto-stop: a visible enemy within 6 tiles of the lead truck
    this.halted = w.units.some((u) => !u.dead && !u.hidden && Math.hypot(u.x - lead.x, u.y - lead.y) <= F.convoyStopDist && w.fog.isVisible(u.tx, u.ty));
    if (this.halted && this.advancing && w.time - this.haltSaid > 8) { this.haltSaid = w.time; this.game.hud.say('Trucks are stopping — contact ahead.'); }
    const wp = this.path[this.idx];
    const canGo = this.advancing && !this.halted && wp && !(wp.fort && !this.gateOpen);
    this.moving = !!canGo;
    if (this.gateOpen && wp && wp.fort) { this.advancing = true; this.moving = !this.halted || true; }
    if (this.moving) {
      if (!lead.path.length) {
        const arrived = Math.hypot(wp.x + 0.5 - lead.x, wp.y + 0.5 - lead.y) < 1.2;
        if (arrived) {
          if (wp.checkpoint) { this.checkpoint = wp.checkpoint; this.advancing = false; this.game.hud.say(`Checkpoint ${wp.checkpoint}. Holding for your word.`); }
          this.idx++;
        } else lead.goTo(wp.x, wp.y, true);
      }
      lead.step(dt, lead.def.speed);
    } else lead.px = lead.x, lead.py = lead.y;
    // breadcrumb trail for followers (3-tile spacing)
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - lead.x, last.y - lead.y) > 0.5) { this.trail.push({ x: lead.x, y: lead.y, a: lead.angle }); if (this.trail.length > 200) this.trail.shift(); }
    let k = 0;
    for (const t of this.trucks) {
      if (t === lead || t.dead) continue;
      k++;
      const back = Math.round((3 * k) / 0.5);
      const crumb = this.trail[Math.max(0, this.trail.length - 1 - back)];
      t.px = t.x; t.py = t.y;
      if (!crumb) continue;
      const dx = crumb.x - t.x, dy = crumb.y - t.y, d = Math.hypot(dx, dy);
      // followers close up to their spacing even after the lead has stopped (checkpoints, the fort)
      if (d > 0.2 && (this.moving || !this.halted)) {
        const s = Math.min(d, t.def.speed * 1.15 * dt);
        t.x += (dx / d) * s; t.y += (dy / d) * s;
        t.angle = Math.atan2(dy, dx);
      }
    }
  }
}

export class FriendlySystem {
  constructor(game) {
    this.game = game;
    const w = this.world = game.world;
    w.friendlies = (w.data.friendlies || []).map((s) => {
      const t = w.map.nearestWalkable(s.x, s.y, 4, s.type === 'medTruck');
      return new Friendly(w, t ? { ...s, x: t.x, y: t.y } : s);
    });
    const trucks = w.friendlies.filter((f) => f.kind === 'vehicle');
    if (trucks.length) game.convoy = new TruckConvoy(game, trucks, w.data.convoyPath || 'convoy');
  }
  get persons() { return this.world.friendlies.filter((f) => f.kind === 'person' && !f.dead); }
  followers() { return this.persons.filter((f) => !f.captive && f.mode === 'follow'); }
  escortsForExtraction() { return this.persons.filter((f) => !f.captive); }
  toggle(f) {
    if (f.captive || f.kind !== 'person') return;
    f.mode = f.mode === 'follow' ? 'hold' : 'follow';
    f.path = [];
    this.game.hud.toast(`${f.name.toUpperCase()}: ${f.mode === 'follow' ? 'FOLLOWING' : 'HOLDING'}`, C.uiText);
  }
  toggleAll() {
    const all = this.persons.filter((f) => !f.captive);
    const mode = all.some((f) => f.mode === 'follow') ? 'hold' : 'follow';
    for (const f of all) { f.mode = mode; f.path = []; }
    this.game.hud.toast(mode === 'follow' ? 'ALL: FOLLOW' : 'ALL: HOLD', C.uiText);
  }
  holding() { return this.persons.filter((f) => !f.captive).every((f) => f.mode === 'hold'); }
  damage(f, dmg, from) {
    if (f.dead) return;
    f.hp -= dmg; f.flashT = 0.15;
    f.hurtBy = from;
    if (f.kind === 'person') { f.hideT = F.hideTime; this._seekCover(f, from); }
    if (f.kind === 'vehicle') this.game.runner && (this.game.runner.flags.convoyHurt = true);
    if (f.hp <= 0) {
      f.dead = true; f.hp = 0; f.path = [];
      this.world.events.emit('friendlyDead', { friendly: f });
      this.game.hud.say(f.kind === 'vehicle' ? `${f.name} destroyed!` : `${f.name} is down!`, true);
      if (f.critical) this.game.runner?.lose(`${f.name} was killed. Mission failed.`);
    }
  }
  _seekCover(f, from) {
    const m = this.world.map;
    let best = null, bd = Infinity;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = f.tx + dx, y = f.ty + dy;
      if (!m.inb(x, y) || !m.coverTile[m.idx(x, y)] || m.cost[m.idx(x, y)] === Infinity) continue;
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (best) f.goTo(best.x, best.y);
  }
  update(dt) {
    const w = this.world, op = w.operative;
    for (const f of w.friendlies) {
      if (f.dead) { f.px = f.x; f.py = f.y; continue; }
      if (f.flashT > 0) f.flashT -= dt;
      if (f.kind === 'vehicle') continue; // convoy moves trucks
      if (f.captive) {
        f.px = f.x; f.py = f.y;
        const near = Math.hypot(op.x - f.x, op.y - f.y) <= 1.6 && !op.moving && !op.dead;
        f.freeT = near ? f.freeT + dt : Math.max(0, f.freeT - dt);
        if (f.freeT >= F.freeTime) {
          f.captive = false; f.mode = 'follow'; f.hiding = false; f.vision = BALANCE.units.friendlyVision;
          this.world.events.emit('rescued', { friendly: f });
          this.game.hud.say(`${f.name} is free. Stay close — follow WREN.`, true);
        }
        continue;
      }
      if (f.hideT > 0) { f.hideT -= dt; f.hiding = true; f.step(dt, f.def.speed); continue; }
      if (f.mode === 'hold') { f.hiding = true; f.path = []; f.px = f.x; f.py = f.y; continue; }
      // follow: stay 1–3 tiles behind WREN, copy crouch/hunker as "hide"
      const d = Math.hypot(op.x - f.x, op.y - f.y);
      f.hiding = !op.moving && (op.stance === 'crouch' || op.stance === 'cover' || op.stance === 'hunker') && d <= F.followMax + 0.5;
      if (d > F.followMax) {
        f.repathT = (f.repathT || 0) - dt;
        if (!f.path.length || f.repathT <= 0) {
          f.repathT = 0.7;
          const back = op.angle + Math.PI;
          const tx = Math.floor(op.x + Math.cos(back) * 1.5), ty = Math.floor(op.y + Math.sin(back) * 1.5);
          f.goTo(tx, ty);
        }
      } else if (d < F.followMin) f.path = [];
      // can't run for more than 3 s at a time (exhausted)
      const wantRun = d > 5 && op.mode === 'run';
      f.runT = wantRun ? f.runT + dt : Math.max(0, f.runT - dt * 0.5);
      const sp = wantRun && f.runT < f.def.runLimit ? f.def.speed * 1.7 : f.def.speed;
      f.step(dt, sp);
    }
  }
  // ---------------------------------------------------------------- rendering
  sortedLayer(push, r) {
    const w = this.world;
    for (const f of w.friendlies) {
      if (!w.fog.isSeen(f.tx, f.ty)) continue;
      const x = f.px + (f.x - f.px) * Time.alpha, y = f.py + (f.y - f.py) * Time.alpha;
      push({ y, elev: 0, draw: (ctx) => this.drawOne(ctx, r, f, x, y) }, Math.floor(y));
    }
  }
  drawOne(ctx, r, f, x, y) {
    const z = r.cam.zoom;
    const X0 = Math.round(r.sx(x)), Y0 = Math.round(r.sy(y));
    if (f.kind === 'vehicle') {
      const s = vehicleSprite('medTruck', angleToDir8(f.angle), f.dead ? 'wreck' : 'ok');
      ctx.drawImage(f.flashT > 0 ? whiteOf(s.canvas) : s.canvas, X0 - s.ax * z, Y0 - s.ay * z, s.w * z, s.h * z);
    } else {
      const pose = f.dead ? 'dead' : f.captive ? (f.downed ? 'prone' : 'crouch') : f.moving ? 'walk' : f.hiding ? 'crouch' : 'idle';
      const frame = f.dead ? 3 : Math.floor(f.animT * 5) & 3;
      const s = unitSprite(f.type, pose, angleToDir8(f.angle), frame);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(X0 - 3 * z, Y0, 7 * z, z);
      ctx.drawImage(f.flashT > 0 ? whiteOf(s.canvas) : s.canvas, X0 - s.ax * z, Y0 - s.ay * z, s.w * z, s.h * z);
    }
    if (f.dead) return;
    // steel-blue friendly ring + HP pip + state
    ctx.fillStyle = C.godSteelL;
    ctx.fillRect(X0 - 3 * z, Y0 + 2 * z, 7 * z, z);
    const hpw = Math.round(12 * (f.hp / f.maxHp));
    ctx.fillStyle = '#07090A'; ctx.fillRect(X0 - 6, Y0 - 18 * z, 13, 3);
    ctx.fillStyle = f.hp / f.maxHp < 0.35 ? C.uiAlert : C.godSteelL; ctx.fillRect(X0 - 5, Y0 - 18 * z + 1, hpw, 1);
    if (f.captive) {
      const k = f.freeT / F.freeTime;
      drawText(ctx, f.downed ? 'HELP UP' : 'FREE', X0, Y0 - 26 * z, { font: '3x5', color: C.uiAmber, align: 'center', shadow: '#000' });
      if (k > 0) { ctx.fillStyle = '#26302A'; ctx.fillRect(X0 - 8, Y0 - 20 * z, 16, 2); ctx.fillStyle = C.uiAmber; ctx.fillRect(X0 - 8, Y0 - 20 * z, Math.round(16 * k), 2); }
    } else if (f.kind === 'person' && f.mode === 'hold') drawText(ctx, 'HOLD', X0, Y0 - 26 * z, { font: '3x5', color: C.godSteelL, align: 'center', shadow: '#000' });
  }
}
