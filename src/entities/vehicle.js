// @ts-check
import { BALANCE } from '../config/balance.js';
import { Unit } from './unit.js';
import { startSearch } from '../ai/fsm.js';
import { explode } from '../combat/explosions.js';
import { drive } from './steering.js';

const U = BALANCE.units;

/** Vehicle definitions (SPEC §12.2, §11.2). */
export const VEHICLE_TYPES = {
  skitter:    { name: 'Skitter', kind: 'vehicle', ...U.skitter, profile: 'buggy', scope: 'skitter', open: true },
  hauler:     { name: 'Hauler', kind: 'vehicle', ...U.hauler, profile: 'buggy', scope: 'hauler' },
  fuelHauler: { name: 'Fuel Hauler', kind: 'vehicle', ...U.fuelHauler, profile: 'buggy', scope: 'fuelHauler' },
  crawler:    { name: 'Crawler', kind: 'vehicle', ...U.crawler, profile: 'armour', scope: 'crawler', armoured: true },
  brute:      { name: 'Brute', kind: 'vehicle', ...U.brute, profile: 'armour', scope: 'brute', armoured: true },
  juggernaut: { name: 'Juggernaut', kind: 'vehicle', ...U.juggernaut, profile: 'armour', scope: 'juggernaut', armoured: true },
};
export const isVehicleType = (t) => !!VEHICLE_TYPES[t];

export class Vehicle extends Unit {
  constructor(world, spec) {
    super(world, spec);
    this.def = VEHICLE_TYPES[spec.type];
    this.kind = 'vehicle';
    this.profile = this.def.profile;
    this.hp = this.maxHp = this.def.hp;
    this.disabled = false;
    this.passengers = spec.passengers ?? this.def.passengers ?? 0;
    this.passengerType = spec.passengerType || 'husk';
    this.dismountT = -1;
    this.blood = { main: '#3A3F42', shade: '#23262A', hi: '#5A6166' };
    this.name = spec.name || this.def.name;
  }
  speed() {
    if (this.disabled) return 0;
    const m = this.world.map;
    const i = m.idx(this.tx, this.ty);
    let s = this.def.speed / Math.max(0.5, m.vcost[i] === Infinity ? 1 : m.vcost[i]);
    const g = this.world.alerts?.group(this.alertGroup);
    if (g && g.level !== 'calm') s *= BALANCE.ai.cautionSpeed;
    return s * (this.moveMode === 'run' ? 1.25 : 1);
  }
  goTo(tx, ty, mode = 'walk') {
    if (this.disabled) { this.path = []; return false; }
    const m = this.world.map;
    const goal = m.inb(tx, ty) && m.vcost[m.idx(tx, ty)] < Infinity ? { x: tx, y: ty } : m.nearestWalkable(tx, ty, 4, true);
    if (!goal) return false;
    if (goal.x === this.tx && goal.y === this.ty) { this.path = []; return true; }
    const p = this.world.pf.find(this.tx, this.ty, goal.x, goal.y, { veh: true, partial: true, maxIter: 8000 });
    if (!p) return false;
    this.path = this.world.smoothPath(this.x, this.y, p, true);
    this.moveMode = mode;
    this.goal = { x: goal.x + 0.5, y: goal.y + 0.5 };
    return true;
  }
  /** something (another vehicle, WREN, a friendly) sits right in front: wait for it */
  blockedAhead() {
    // "ahead" is where it wants to go (the next waypoint), not where the bonnet points — otherwise a
    // vehicle parked beside it would block a car that is about to turn away from it
    const wp = this.path[0];
    const ang = wp ? Math.atan2(wp.y + 0.5 - this.y, wp.x + 0.5 - this.x) : this.angle;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const w = this.world;
    const test = (o, r) => {
      const dx = o.x - this.x, dy = o.y - this.y, d = Math.hypot(dx, dy);
      return d < r && d > 1e-3 && (dx * ca + dy * sa) / d > 0.35;
    };
    if (!(this.ghostT > 0)) for (const o of w.units) if (o !== this && !o.dead && o.kind === 'vehicle' && test(o, 1.9)) return true;
    if (!w.operative.dead && !w.operative.hidden && test(w.operative, 1.3)) return true;
    for (const f of w.friendlies || []) if (!f.dead && test(f, 1.3)) return true;
    return false;
  }
  step(dt) {
    this.px = this.x; this.py = this.y;
    if (!this.path.length || this.disabled) {
      // parked: swing round to face what it's looking at (aiming) — tracked hulls pivot, wheels creep round slowly
      let da = this.targetAngle - this.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (this.disabled && !this.def.armoured) return false;
      const turn = (this.def.armoured ? 1.6 : 1.0) * dt;
      this.angle += Math.abs(da) <= turn ? da : Math.sign(da) * turn;
      return false;
    }
    // hunting vehicles pull up a few tiles short of the point they are closing on (no ramming WREN)
    if (this.state === 'investigating' || this.state === 'alerted' || this.state === 'combat') {
      const op = this.world.operative;
      const nearGoal = this.goal && Math.hypot(this.goal.x - this.x, this.goal.y - this.y) < U.vehicleStopShort;
      const nearOp = !op.dead && !op.hidden && Math.hypot(op.x - this.x, op.y - this.y) < U.vehicleStopShort;
      if (nearGoal || nearOp) { this.path = []; return true; }
    }
    if (this.ghostT > 0) this.ghostT -= dt;
    if (this.blockedAhead()) {
      // (blockT, not waitT: patrols use waitT for their pauses at waypoints and would count it back down)
      this.blockT = (this.blockT || 0) + dt;
      // two vehicles nose to nose would wait forever: after a moment one squeezes past (brief overlap)
      if (this.blockT > 2 + (this.id.length % 3) * 0.4) { this.ghostT = 2.5; this.blockT = 0; }
      return false;
    }
    this.blockT = 0;
    // drive like a car: roll forward, arc round corners, slow for sharp turns (no turning on the spot)
    const done = drive(this, dt, this.speed(), this.world.map, { radius: this.def.armoured ? 0.6 : 0.9 });
    this.targetAngle = this.angle;
    this.animT += dt;
    return done;
  }
  pose() { return { pose: this.dead ? 'wreck' : 'ok', frame: 0 }; }
}

export class VehicleSystem {
  constructor(game) { this.game = game; this.world = game.world; }
  spawn(spec) {
    const w = this.world, m = w.map;
    const t = m.nearestWalkable(spec.x, spec.y, 5, true);
    const v = new Vehicle(w, { ...spec, x: t ? t.x : spec.x, y: t ? t.y : spec.y });
    if (spec.behaviour?.kind === 'patrol') {
      const pts = w.data.paths?.[spec.behaviour.path];
      if (pts) { let bi = 0, bd = Infinity; pts.forEach((p, i) => { const d = Math.hypot(p.x - v.x, p.y - v.y); if (d < bd) { bd = d; bi = i; } }); v.pathIdx = bi; }
    }
    if (spec.behaviour?.kind === 'hunt') {
      const lk = w.lkp || this.game.enemies.lastSeenPos || { x: v.x, y: v.y + 4 };
      v.setState('alerted'); startSearch(v, lk.x, lk.y); v.behaviour = { kind: 'sentry' };
    }
    w.units.push(v);
    return v;
  }
  /** Driver shot / view slit: the vehicle stops permanently; passengers dismount after 2 s. */
  disable(v, why) {
    if (v.disabled || v.dead) return;
    v.disabled = true;
    if (why === 'driver') v.driverDown = true;     // New art draws the seat empty
    v.path = [];
    v.tag = { text: 'DISABLED', t: 3 };
    // turret keeps working with vision radius 3 (slit) — stored apart from visionMult, which the FSM resets
    if (why === 'slit') v.disabledVision = 3 / Math.max(1, BALANCE.ai.vision[v.profile].radius);
    else if (why === 'driver' && !v.def.armoured) { v.disabledVision = 0; v.silenced = true; v.det = 0; }
    if (v.passengers > 0) v.dismountT = U.dismountDelay;
    this.world.events.emit('vehicleDisabled', { vehicle: v, why });
    this.game.enemies.alertFromHit(v, this.world.operative);
  }
  destroy(v, cause = {}) {
    if (v.dead) return;
    v.dead = true; v.deathT = 0; v.hp = 0; v.path = [];
    v.flashT = 0; v.tag = null;
    // fuel vehicles go up when they die (tank / jerrycan)
    if (!v.exploded && (v.type === 'fuelHauler' || v.type === 'skitter') && cause.by !== 'tank' && cause.by !== 'jerrycan') {
      v.exploded = true;
      const X = BALANCE.explosions, big = v.type === 'fuelHauler';
      this.game.combat.later(0, () => explode(this.game.combat, v.x, v.y, big ? X.fuelTruck.radius : X.buggyJerrycan.radius, big ? X.fuelTruck.damage : X.buggyJerrycan.damage, { source: cause.source === 'enemy' ? 'enemy' : 'player', fire: big ? 6 : 0 }));
    }
    this.world.map.setBlocked(v.tx, v.ty, true);
    this.world.events.emit('unitKilled', { unit: v, cause });
    this.world.stats.kills++;
    this.game.combat.particles.smoke(v.x, v.y, 10, 1.6);
    if (v.passengers > 0 && !v.dismounted) { v.passengers = Math.floor(v.passengers / 2); this.dismount(v); }
  }
  dismount(v) {
    v.dismounted = true;
    const w = this.world;
    for (let i = 0; i < v.passengers; i++) {
      const a = (i / Math.max(1, v.passengers)) * Math.PI * 2;
      const u = this.game.enemies.spawn({ id: `${v.id}-p${i}`, type: i % 3 === 2 ? 'lobber' : v.passengerType, x: Math.floor(v.x + Math.cos(a) * 1.5), y: Math.floor(v.y + Math.sin(a) * 1.5), alertGroup: v.alertGroup, behaviour: { kind: 'sentry' } });
      const lk = w.lkp || this.game.enemies.lastSeenPos || { x: w.operative.x, y: w.operative.y };
      u.setState('alerted'); startSearch(u, lk.x, lk.y);
    }
    v.passengers = 0;
  }
  update(dt) {
    for (const v of this.world.units) {
      if (v.kind !== 'vehicle' || v.dead) continue;
      if (v.dismountT > 0) { v.dismountT -= dt; if (v.dismountT <= 0) this.dismount(v); }
      if (v.hp <= 0) this.destroy(v, { by: 'damage' });
    }
  }
  /** Sniper hit on a vehicle zone (SPEC §11.1). Returns a stamp text. */
  hitZone(v, zone) {
    const sys = this.game.combat, X = BALANCE.explosions;
    switch (zone) {
      case 'driver': this.disable(v, 'driver'); return 'DRIVER DOWN';
      case 'slit': this.disable(v, 'slit'); return 'VIEW SLIT';
      case 'jerrycan': v.exploded = true; explode(sys, v.x, v.y, X.buggyJerrycan.radius, X.buggyJerrycan.damage, { source: 'player' }); this.destroy(v, { by: 'jerrycan' }); return 'JERRYCAN';
      case 'tank': v.exploded = true; explode(sys, v.x, v.y, X.fuelTruck.radius, X.fuelTruck.damage, { source: 'player', fire: 6 }); this.destroy(v, { by: 'tank' }); return 'FUEL TANK';
      default: sys.particles.sparks(v.x, v.y - 0.3, 6, 8); this.world.noise(v.x, v.y, 6, 'ricochet'); this.game.enemies.alertFromHit(v, this.world.operative); return null;
    }
  }
}
