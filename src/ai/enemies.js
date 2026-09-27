// @ts-check
import { BALANCE } from '../config/balance.js';
import { perceiveFriendlies, combatTarget } from './targets.js';
import { Unit } from '../entities/unit.js';
import { Vehicle, isVehicleType } from '../entities/vehicle.js';
import { AlertManager } from './alert.js';
import { canObserve, fillRate, instantDetect } from './perception.js';
import { updateAI, makeSuspicious, investigate, startSearch, startFlee, seesPoint } from './fsm.js';
import { enemyShoot } from '../combat/weapons.js';
import { flameAttack } from '../combat/projectiles.js';
import { damageOperative } from '../combat/damage.js';
import { canSee } from '../world/los.js';

const D = BALANCE.detection;
const EW = BALANCE.enemyWeapons;

/**
 * Enemy system: spawns NOT units from mission data, runs perception (10 Hz, staggered),
 * the per-unit FSM, enemy weapons, noise reactions, kill witnesses, bodies and the LKP (SPEC §8–9).
 */
export class EnemySystem {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    const w = this.world;
    w.alerts = new AlertManager(w);
    this.alerts = w.alerts;
    w.corpses = w.corpses || [];
    this.snapPaths();
    for (const spec of w.data.units || []) this.spawn(spec);
    this.detecting = 0;          // number of units currently seeing WREN with det ≥ 1
    this.wasDetected = false;
    w.lkp = null;
    this.corpseT = 0;
    w.events.on('noise', (n) => this.onNoise(n));
    this.lastState = 'hidden';
  }
  /** the CombatSystem */
  get cs() { return this.game.combat; }
  snapPaths() {
    const w = this.world, m = w.map;
    for (const pts of Object.values(w.data.paths || {})) {
      for (const p of pts) { const t = m.nearestWalkable(p.x, p.y, 4); if (t) { p.x = t.x; p.y = t.y; } }
    }
  }
  spawn(spec) {
    const w = this.world, m = w.map;
    const t = m.nearestWalkable(spec.x, spec.y, 4);
    const veh = isVehicleType(spec.type);
    const tv = veh ? m.nearestWalkable(spec.x, spec.y, 5, true) : t;
    const s = { ...spec, x: tv ? tv.x : spec.x, y: tv ? tv.y : spec.y };
    const u = veh ? new Vehicle(w, s) : new Unit(w, s);
    if (u.behaviour.kind === 'patrol') {
      const pts = w.data.paths?.[u.behaviour.path];
      if (pts) {
        let bi = 0, bd = Infinity;
        pts.forEach((p, i) => { const d = Math.hypot(p.x - s.x, p.y - s.y); if (d < bd) { bd = d; bi = i; } });
        u.pathIdx = bi;
      }
    }
    w.units.push(u);
    // `hunt`: arrive already looking for WREN (reinforcements, counter-attacks)
    if (spec.behaviour?.kind === 'hunt') {
      const op = w.operative;
      const lk = spec.huntTarget || w.lkp || this.lastSeenPos || { x: op.x, y: op.y };
      u.behaviour = { kind: 'sentry' };
      u.setState('alerted'); startSearch(u, lk.x, lk.y);
    }
    return u;
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    const w = this.world, op = w.operative;
    this.alerts.update(dt);
    let detecting = 0, maxDet = 0;
    const groupsDetecting = new Set();
    for (const u of w.units) {
      if (u.dead) { u.deathT += dt; u.px = u.x; u.py = u.y; continue; }
      if (u.kind === 'structure') continue;
      if (u.hidden) { u.px = u.x; u.py = u.y; u.seesOp = false; continue; } // riding inside a vehicle / in a bunker
      if (u.scripted) { u.step(dt); if (u.flashT > 0) u.flashT -= dt; continue; }          // scripted run (VIP to the bunker, riders remounting)
      if (u.kind === 'emplacement' || u.kind === 'turret') {
        this.updateEmplacement(u, dt);
        if (u.seesOp && u.det >= 1 && !u.dead) { detecting++; groupsDetecting.add(u.alertGroup); }
        if (!u.dead && u.det > maxDet) maxDet = u.det;
        continue;
      }
      u.percT -= dt;
      if (u.percT <= 0) { u.percT += 1 / BALANCE.sim.perceptionHz; this.perceive(u, 1 / BALANCE.sim.perceptionHz); }
      updateAI(u, dt, this);
      u.step(dt);
      if (u.flashT > 0) u.flashT -= dt;
      if (u.seesOp && u.det >= 1) { detecting++; groupsDetecting.add(u.alertGroup); }
      if (u.det > maxDet) maxDet = u.det;
    }
    for (const g of this.alerts.groups.values()) {
      if (groupsDetecting.has(g.id)) this.alerts.noteDetected(g.id, dt); else this.alerts.clearDetected(g.id);
    }
    // LKP: WREN slipped out of the sight of every enemy that had him — but only if one of them is
    // still alive (killing the lone spotter is "contact down", not "they lost you")
    if (this.detecting > 0 && detecting === 0 && !op.dead) {
      const survivors = (this.spotters || []).filter((u) => !u.dead);
      if (survivors.length) {
        w.lkp = { x: this.lastSeenPos?.x ?? op.x, y: this.lastSeenPos?.y ?? op.y, t: D.lkpSearchTime };
        this.game.hud?.say('They lost you. Stay low.');
      } else this.game.hud?.say('Contact down.');
    }
    if (detecting > 0) {
      this.lastSeenPos = { x: op.x, y: op.y }; w.lkp = null;
      this.spotters = w.units.filter((u) => !u.dead && u.seesOp && u.det >= 1);
    }
    if (w.lkp) { w.lkp.t -= dt; if (w.lkp.t <= 0) w.lkp = null; }
    this.detecting = detecting;
    // awareness indicator (SPEC §8.7)
    const state = detecting > 0 ? 'detected' : maxDet >= 0.1 ? 'suspicious' : 'hidden';
    this.game.awareness = { state, fill: maxDet };
    if (state === 'detected' && this.lastState !== 'detected') {
      w.stats.timesDetected++;
      this.game.hud?.say("You've been spotted.", true);
      w.events.emit('detected');
    }
    this.lastState = state;
    // bodies
    this.corpseT -= dt;
    if (this.corpseT <= 0) { this.corpseT = 0.5; this.checkCorpses(); }
  }

  perceive(u, dt) {
    this._perceiveOp(u, dt);
    // GOD friendlies are targets too (SPEC §15.1) — WREN takes priority when he is in sight
    if (!u.seesOp) perceiveFriendlies(this, u, dt); else u.seesTarget = false;
  }
  _perceiveOp(u, dt) {
    const w = this.world, op = w.operative;
    if (op.dead || op.hidden) { u.seesOp = false; u.det = Math.max(0, u.det - D.decay * dt); return; }
    const r = canObserve(u, op, w);
    u.seesOp = r.visible;
    if (r.visible) {
      if (instantDetect(u, op, r.dist, w)) u.det = 1;
      else u.det = Math.min(1, u.det + fillRate(u, op, r.dist, r.vis, w) * dt);
      u.lastKnown = { x: op.x, y: op.y };
      if (u.det >= D.detected) this.enterCombat(u);
      else if (u.det >= D.suspicious && (u.state === 'unaware' || u.state === 'returning' || u.state === 'investigating' || u.state === 'alerted')) {
        if (u.def.flees) startFlee(u, op.x, op.y);
        else if (u.state === 'alerted' || u.state === 'investigating') {
          if (!u.poiSoft || u.state === 'alerted') {
            const p = this.fuzzyPoint(u, op);
            u.poi = p; u.arrived = false; u.setState('investigating'); u.poiSoft = true;
            u.goTo(Math.floor(p.x), Math.floor(p.y), 'walk');
          }
        }
        else { const p = this.fuzzyPoint(u, op); makeSuspicious(u, p.x, p.y); u.poiSoft = true; }
      } else if (u.state === 'suspicious' && !u.poiSoft) { u.poi = this.fuzzyPoint(u, op); u.poiSoft = true; }
    } else if (u.state !== 'combat') {
      u.det = Math.max(0, u.det - D.decay * dt);
    }
  }

  /** A glimpse doesn't give the exact tile: pick a point 1.5–2.5 tiles off WREN, biased toward the observer. */
  fuzzyPoint(u, op) {
    const rng = this.world.rng;
    const toObs = Math.atan2(u.y - op.y, u.x - op.x);
    const a = toObs + rng.range(-1.2, 1.2), r = rng.range(1.5, 2.5);
    const t = this.world.map.nearestWalkable(op.x + Math.cos(a) * r, op.y + Math.sin(a) * r, 2);
    return t ? { x: t.x + 0.5, y: t.y + 0.5 } : { x: op.x, y: op.y };
  }
  enterCombat(u, target = null) {
    if (u.state === 'combat') return;
    if (u.def.flees) { startFlee(u, u.lastKnown?.x ?? u.x, u.lastKnown?.y ?? u.y); return; }
    u.setState('combat');
    u.det = 1;
    u.hadDetected = true;
    u.lostT = 0;
    u.coverSpot = null; u.coverTried = false;
    u.tag = { text: '!', t: 2 };
    u.fireT = Math.max(u.fireT, 0.35 + this.world.rng.next() * 0.4); // reaction time
    this.alerts.raise(u.alertGroup, 'caution', 'contact', u);
    // squadmates within earshot join in
    for (const o of this.world.units) {
      if (o === u || o.dead || o.alertGroup !== u.alertGroup || o.state === 'combat' || o.kind === 'emplacement' || o.kind === 'turret') continue;
      if (Math.hypot(o.x - u.x, o.y - u.y) < 7 && u.lastKnown) startSearch(o, u.lastKnown.x, u.lastKnown.y);
    }
  }

  /** A unit got shot but survived: it turns toward the shooter and searches. */
  alertFromHit(u, op) {
    if (u.dead || u.state === 'combat') return;
    if (u.kind === 'emplacement' || u.kind === 'turret') { u.lastKnown = { x: op.x, y: op.y }; u.setState('alerted'); u.tag = { text: '!', t: 1.5 }; this.alerts.raise(u.alertGroup, 'caution', 'shot at', u); return; }
    if (u.def.flees) { startFlee(u, op.x, op.y); return; }
    u.tag = { text: '!', t: 1.5 };
    const dx = op.x - u.x, dy = op.y - u.y, d = Math.hypot(dx, dy) || 1;
    // they know the direction, not the spot
    const guess = { x: u.x + (dx / d) * Math.min(d, 6), y: u.y + (dy / d) * Math.min(d, 6) };
    startSearch(u, guess.x, guess.y);
    u.face(op.x, op.y);
    this.alerts.raise(u.alertGroup, 'caution', 'wounded', u);
  }

  // ------------------------------------------------------------------ combat behaviour
  combat(u, dt) {
    const w = this.world, op = w.operative;
    const def = u.def;
    const { tgt, vis } = combatTarget(u, w);
    if (u.training) { if (vis) u.face(tgt.x, tgt.y); return; }   // Boot Camp dummies never shoot
    if (vis) { u.lastKnown = { x: tgt.x, y: tgt.y }; u.lostT = 0; }
    else u.lostT = (u.lostT || 0) + dt;
    if (tgt === op && op.dead) { u.setState('returning'); return; }
    if (u.lostT > 3) {
      // lost contact: search the expanding rings around the last known position (SPEC §8.5)
      const lk = u.lastKnown || { x: u.x, y: u.y };
      u.det = 0.5;
      u.setState('alerted');
      startSearch(u, lk.x, lk.y);
      return;
    }
    if (def.unarmed) { startFlee(u, tgt.x, tgt.y); return; }
    // Warden radio call → Alarm (3 s), unless the radio pack was shot
    if (def.radio && u.hasRadio && this.alerts.level(u.alertGroup) !== 'alarm') {
      if (u.radioT === 0) this.game.hud?.say('Officer on the radio! Take him out!', true);
      u.radioT += dt;
      u.path = [];
      u.tag = { text: 'RADIO', t: 0.2 };
      if (u.lastKnown) u.face(u.lastKnown.x, u.lastKnown.y);
      if (u.radioT >= BALANCE.ai.officerRadioTime) {
        u.radioT = 0;
        if (this.alerts.raise(u.alertGroup, 'alarm', 'officer radio', u)) this.game.hud?.say(this.alerts.hasBarracks(u.alertGroup) ? 'Alarm raised. Reinforcements incoming.' : 'Alarm raised. Get out of there.', true);
      }
      return;
    }
    const W = EW[def.weapon] || EW.huskRifle;
    const dist = Math.hypot(tgt.x - u.x, tgt.y - u.y);
    // seek cover once (infantry)
    if (!u.coverTried && def.kind === 'infantry' && !def.flamer) {
      u.coverTried = true;
      const c = this.findCover(u, tgt);
      if (c) { u.coverSpot = c; u.goTo(c.x, c.y, 'run'); }
    }
    if (u.lastKnown) u.face(u.lastKnown.x, u.lastKnown.y);
    const inRange = dist <= W.range;
    if (vis) {
      if (!inRange && !(u.coverSpot && u.path.length)) {
        u.repathT = (u.repathT || 0) - dt;
        if (u.repathT <= 0 || !u.path.length) { u.repathT = 1; u.coverSpot = null; u.goTo(tgt.tx, tgt.ty, 'run'); }
      } else if (inRange && !u.coverSpot && u.path.length && !def.smell) u.path = [];
      if (def.smell && u.path.length === 0 && dist > W.range) u.goTo(tgt.tx, tgt.ty, 'run');
    } else {
      // no LOS: grenadiers lob at the LKP, others close in on it
      const lk = u.lastKnown;
      if (def.grenadier && lk && Math.hypot(lk.x - u.x, lk.y - u.y) <= EW.grenade.range && !this.alliesNear(lk.x, lk.y, EW.grenade.radius + 0.7, u)) {
        u.fireT -= dt;
        if (u.fireT <= 0) { u.fireT = EW.grenade.interval; this.cs.projectiles.grenade(u.x, u.y, lk.x, lk.y, EW.grenade, u); u.firingT = 0.3; }
        return;
      }
      if (lk && !u.path.length) u.goTo(Math.floor(lk.x), Math.floor(lk.y), 'run');
      return;
    }
    if (!inRange) return;
    // fire
    if (u.staggerT > 0 || u.silenced) return;
    if (W === EW.flame) {
      u.fireT -= dt;
      if (u.fireT <= 0) { u.fireT = W.interval; flameAttack(this.cs, u, W, tgt); }
      return;
    }
    if (W === EW.bite) {
      u.fireT -= dt;
      if (dist <= 1.3 && u.fireT <= 0) {
        u.fireT = W.interval; u.firingT = 0.2;
        if (tgt === op) damageOperative(this.cs, W.damage * (w.enemyDamage ?? 1), { x: u.x, y: u.y }, 'bite');
        else this.cs.damageFriendly(tgt, W.damage, { x: u.x, y: u.y });
      }
      if (dist > 1.1) { if (!u.path.length) u.goTo(tgt.tx, tgt.ty, 'run'); }
      return;
    }
    if (W === EW.grenade) {
      u.fireT -= dt;
      if (this.alliesNear(tgt.x, tgt.y, W.radius + 0.7, u)) return;
      if (u.fireT <= 0) { u.fireT = W.interval; this.cs.projectiles.grenade(u.x, u.y, tgt.x, tgt.y, W, u); u.firingT = 0.3; }
      return;
    }
    if (W === EW.lightCannon || W === EW.heavyCannon || W === EW.turretCannon) {
      u.fireT -= dt;
      if (u.fireT <= 0) { u.fireT = W.interval; this.fireShell(u, W, tgt); }
      return;
    }
    if (W === EW.rocket) {
      u.fireT -= dt;
      if (u.fireT <= 0) { u.fireT = W.interval; this.cs.projectiles.rocket(u.x, u.y, tgt.x, tgt.y, { ...W, radius: 1.2 }, u); u.firingT = 0.3; }
      return;
    }
    // bullets: bursts
    if (u.burstLeft > 0) {
      u.burstT -= dt;
      if (u.burstT <= 0) { u.burstT = W.burstGap || 0.12; u.burstLeft--; enemyShoot(this.cs, u, W, tgt); }
      return;
    }
    u.fireT -= dt;
    if (u.fireT <= 0) {
      u.fireT = W.interval;
      u.burstLeft = W.burst || 1;
      u.burstT = 0;
    }
  }

  /** any living NOT unit (other than `self`) within r of (x, y)? */
  alliesNear(x, y, r, self) {
    for (const o of this.world.units) if (o !== self && !o.dead && !o.hidden && o.kind !== 'emplacement' && o.kind !== 'turret' && Math.hypot(o.x - x, o.y - y) <= r) return true;
    return false;
  }
  fireShell(u, W, tgt) {
    const rng = this.world.rng;
    const d = Math.hypot(tgt.x - u.x, tgt.y - u.y);
    const spread = Math.max(0.3, d * 0.12) * (tgt.hunkered ? 1.6 : 1) * (tgt.stance === 'cover' ? 1.4 : 1);
    const tx = tgt.x + rng.range(-spread, spread), ty = tgt.y + rng.range(-spread, spread);
    this.cs.particles.muzzle(u.x + Math.cos(u.angle) * 0.8, u.y + Math.sin(u.angle) * 0.8, 9);
    this.cs.projectiles.rocket(u.x, u.y, tx, ty, { ...W, radius: W.radius || 1 }, u);
    this.world.noise(u.x, u.y, 12, 'enemyShot', u);
    this.game.cam?.shake(1);
  }

  /** Static gunners & turrets: sweep, perceive, fire (SPEC §9.2 tower sweep ±60° over 6 s). */
  updateEmplacement(u, dt) {
    u.px = u.x; u.py = u.y;
    if (u.dead) return;
    u.stateT += dt;
    if (u.flashT > 0) u.flashT -= dt;
    if (u.blindT > 0) u.blindT = Math.max(0, u.blindT - dt);   // strike flash wears off (power loss re-sets it every frame)
    if (u.tag && (u.tag.t -= dt) <= 0) u.tag = null;
    u.percT -= dt;
    const op = this.world.operative;
    if (u.percT <= 0) {
      u.percT += 0.1;
      const gone = op.dead || op.hidden || u.blindT > 0;          // down, underground/aboard, or flash-blinded
      const r = canObserve(u, op, this.world);
      // at night a tower's own searchlight on WREN is instant detection (SPEC §8.1)
      const inBeam = !gone && !!this.game.lighting?.beamOn(u, op.x, op.y);
      u.seesOp = !gone && (r.visible || inBeam);
      if (u.seesOp) {
        if (inBeam || instantDetect(u, op, r.dist, this.world)) u.det = 1;
        else u.det = Math.min(1, u.det + fillRate(u, op, r.dist, r.vis, this.world) * 0.1);
        u.lastKnown = { x: op.x, y: op.y };
        if (u.det >= 1 && u.state !== 'combat') this.enterCombat(u);
        else if (u.det >= D.suspicious && u.state === 'unaware') { u.setState('suspicious'); u.poi = { x: op.x, y: op.y }; u.tag = { text: '?', t: 1 }; }
      } else if (u.state !== 'combat') u.det = Math.max(0, u.det - D.decay * 0.1);
    }
    const prof = BALANCE.ai.vision[u.profile];
    if (u.state === 'combat') {
      if (u.seesOp) u.lostT = 0; else u.lostT = (u.lostT || 0) + dt;
      if (u.lostT > 4) { u.setState('alerted'); u.det = 0.4; }
      else if (u.lastKnown) {
        u.targetAngle = Math.atan2(u.lastKnown.y - u.y, u.lastKnown.x - u.x);
        const W = EW[u.def.weapon];
        const dist = Math.hypot(op.x - u.x, op.y - u.y);
        if (u.seesOp && dist <= W.range && !(u.blindT > 0)) {
          if (W === EW.turretCannon) { u.fireT -= dt; if (u.fireT <= 0) { u.fireT = W.interval; this.fireShell(u, W, op); } }
          else if (u.burstLeft > 0) { u.burstT -= dt; if (u.burstT <= 0) { u.burstT = W.burstGap || 0.15; u.burstLeft--; enemyShoot(this.cs, u, W, op); } }
          else { u.fireT -= dt; if (u.fireT <= 0) { u.fireT = W.interval; u.burstLeft = W.burst || 1; u.burstT = 0; } }
        }
      }
    } else if (u.state === 'suspicious') {
      if (u.poi) u.targetAngle = Math.atan2(u.poi.y - u.y, u.poi.x - u.x);
      if (u.stateT > 5 && u.det < D.suspicious) u.setState('unaware');
    } else if (u.state === 'alerted') {
      const base = u.lastKnown ? Math.atan2(u.lastKnown.y - u.y, u.lastKnown.x - u.x) : u.baseAngle;
      u.targetAngle = base + Math.sin(u.stateT * 1.3) * 0.9;
      if (u.stateT > 20) u.setState('unaware');
    } else {
      const sweep = ((prof.sweep ?? 40) * Math.PI) / 180, period = prof.sweepPeriod ?? 8;
      u.targetAngle = u.baseAngle + Math.sin((u.stateT / period) * Math.PI * 2) * sweep;
    }
    let da = u.targetAngle - u.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const turn = (u.state === 'combat' ? 3 : 1.2) * dt;
    u.angle += Math.abs(da) <= turn ? da : Math.sign(da) * turn;
  }

  findCover(u, threat) {
    const m = this.world.map;
    let best = null, bs = Infinity;
    const R = BALANCE.ai.coverSearch;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = u.tx + dx, y = u.ty + dy;
      if (!m.inb(x, y)) continue;
      const i = m.idx(x, y);
      if (!m.coverTile[i] || m.cost[i] === Infinity || m.elev[i] !== m.elev[m.idx(u.tx, u.ty)]) continue;
      // cover object should be between the tile and the threat
      let facing = -1;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const j = m.idx(Math.max(0, Math.min(m.w - 1, x + ox)), Math.max(0, Math.min(m.h - 1, y + oy)));
        if (!(m.coverObj[j] || m.structure[j] >= 0)) continue;
        const tx = threat.x - (x + 0.5), ty = threat.y - (y + 0.5), d = Math.hypot(tx, ty) || 1;
        facing = Math.max(facing, (tx * ox + ty * oy) / (d * Math.hypot(ox, oy)));
      }
      if (facing < 0.3) continue;
      const s = Math.hypot(dx, dy) - facing * 2;
      if (s < bs) { bs = s; best = { x, y }; }
    }
    return best;
  }

  // ------------------------------------------------------------------ events
  onNoise(n) {
    const w = this.world;
    if (n.kind === 'enemyShot') {
      // comrades hear the firefight and come to look where the shooter is aiming
      const shooter = n.source;
      for (const u of w.units) {
        if (u.dead || u === shooter || u.kind === 'emplacement' || u.kind === 'turret' || u.state === 'combat' || u.state === 'alerted') continue;
        if (Math.hypot(u.x - n.x, u.y - n.y) > n.radius) continue;
        const lk = shooter?.lastKnown || { x: n.x, y: n.y };
        if (u.def.flees) startFlee(u, n.x, n.y); else startSearch(u, lk.x, lk.y);
      }
      return;
    }
    const shot = n.kind === 'rifle' || n.kind === 'pistol' || n.kind === 'explosion' || n.kind === 'c4';
    for (const u of w.units) {
      if (u.dead || u.state === 'combat') continue;
      if (u.kind === 'emplacement' || u.kind === 'turret') {
        if (Math.hypot(u.x - n.x, u.y - n.y) <= n.radius && n.source !== u) { u.lastKnown = { x: n.x, y: n.y }; u.setState('alerted'); }
        continue;
      }
      const d = Math.hypot(u.x - n.x, u.y - n.y);
      if (d > n.radius) continue;
      if (n.source && n.source === u) continue;
      if (n.excludeGroup && u.alertGroup === n.excludeGroup) continue; // kill-witness logic handles the victim's group
      const off = n.kind === 'rifle' ? w.rng.range(BALANCE.noise.rifleOffset[0], BALANCE.noise.rifleOffset[1]) : BALANCE.noise.otherOffset;
      const a = w.rng.range(0, Math.PI * 2);
      const px = n.x + Math.cos(a) * off, py = n.y + Math.sin(a) * off;
      if (u.def.flees) { startFlee(u, n.x, n.y); continue; }
      u.tag = { text: '?', t: 1.2 };
      if (u.state === 'alerted') { startSearch(u, px, py); continue; }
      makeSuspicious(u, px, py);
      u.stateT = Math.max(u.stateT, 1.4); // a noise pushes them to investigate quickly
      if (shot) this.alerts.raise(u.alertGroup, n.kind === 'c4' ? 'caution' : 'caution', 'heard ' + n.kind, u);
    }
  }

  /** Kill witnesses (DECISIONS.md: the spec's "§9.5" search logic). */
  onKill(v, cause) {
    const w = this.world;
    const radius = cause.by === 'rifle' ? BALANCE.noise.rifle : cause.by === 'pistol' ? BALANCE.noise.pistol : cause.by === 'knife' ? BALANCE.noise.takedown : BALANCE.noise.explosion;
    let witnessed = false;
    for (const u of w.units) {
      if (u.dead || u === v || u.kind === 'emplacement' || u.kind === 'turret' || u.state === 'combat') continue;
      const d = Math.hypot(u.x - v.x, u.y - v.y);
      const sameGroup = u.alertGroup === v.alertGroup;
      const saw = d <= 10 && seesPoint(u, v.x, v.y, 10);
      if (!(sameGroup && d <= radius) && !saw) continue;
      witnessed = true;
      if (u.alertGroup !== v.alertGroup) this.alerts.raise(u.alertGroup, 'caution', 'kill witnessed', u);
      if (u.def.flees) { startFlee(u, v.x, v.y); continue; }
      u.tag = { text: '!', t: 1.5 };
      startSearch(u, v.x, v.y);
      if (saw) {
        const corpse = w.corpses.find((c) => c.unit === v);
        if (corpse) corpse.discovered = true;
      }
    }
    if (witnessed) this.alerts.raise(v.alertGroup, 'caution', 'kill witnessed', v);
  }

  /** Unaware enemies whose LOS passes over a corpse discover it (once). */
  checkCorpses() {
    const w = this.world;
    for (const c of w.corpses) {
      if (c.discovered) continue;
      for (const u of w.units) {
        if (u.dead || u.kind === 'vehicle' || u.kind === 'emplacement' || u.kind === 'turret' || !(u.state === 'unaware' || u.state === 'returning')) continue;
        if (Math.hypot(u.x - c.x, u.y - c.y) > 7) continue;
        if (!seesPoint(u, c.x, c.y, 7)) continue;
        c.discovered = true;
        u.examine = c;
        u.tag = { text: '!', t: 1.5 };
        u.bodyRadioT = BALANCE.ai.corpseRadioTime;
        investigate(u, c.x, c.y);
        break;
      }
    }
  }
  bodyReported(u) {
    if (u.dead) return;
    if (this.alerts.raise(u.alertGroup, 'caution', 'body', u)) this.game.hud?.say("They've found a body.");
  }
}
