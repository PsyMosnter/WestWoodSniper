// @ts-check
import { BALANCE } from '../config/balance.js';
import { C } from '../config/palette.js';
import { STRUCT_DEFS, structureSprite } from '../render/spriteData/structures.js';
import { TILE } from '../core/camera.js';
import { Time } from '../core/time.js';
import { explode } from '../combat/explosions.js';
import { dir8ToAngle, dirIndex } from '../world/tiles.js';
import { startSearch } from '../ai/fsm.js';
import { drawText } from '../render/font.js';
import { tintOf } from '../render/sprites.js';

const SB = BALANCE.structures;

/**
 * A NOT structure (SPEC §12.3): footprint on the map, HP, destruction → rubble + burning debris,
 * power/comms dependencies, gunner emplacements, reinforcements, alarm pylons.
 */
export class Structure {
  constructor(world, spec, index) {
    this.world = world;
    this.id = spec.id;
    this.type = spec.type;
    this.def = STRUCT_DEFS[spec.type] || STRUCT_DEFS.barracks;
    this.x = spec.x; this.y = spec.y;
    this.w = this.def.w; this.h = this.def.h;
    this.index = index;
    this.alertGroup = spec.alertGroup || 'default';
    this.maxHp = spec.hp ?? (SB[this.def.hpKey] ?? SB.small);
    this.hp = this.maxHp;
    this.dead = false;
    this.hardened = !!spec.hardened;
    this.st = {};                 // art state flags: gunnerDead, dishDown, unpowered, sirenDead, lightDead, cellDead
    this.seen = false;            // ever seen by the player
    this.seenDead = false;        // last known state (fog shows it)
    this.burnT = 0;
    this.dishT = 0;
    this.spawnOnAlarm = spec.spawnOnAlarm || null;
    this.kind = 'structure';
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get bottom() { return this.y + this.h - 1; }
  /** closest point of the footprint to (x,y) */
  distTo(x, y) {
    const dx = Math.max(this.x - x, 0, x - (this.x + this.w)), dy = Math.max(this.y - y, 0, y - (this.y + this.h));
    return Math.hypot(dx, dy);
  }
}

/** Static gunner / turret "unit" living in world.units (kind 'emplacement'). */
function makeEmplacement(world, s) {
  const turret = !!s.def.turret;
  const gx = s.type === 'mgNest' ? s.x + 1 : s.x + 0.5, gy = s.y + 0.5;
  const facing = dir8ToAngle(dirIndex(s.spec.facing || 'S'));
  return {
    id: s.id + ':gunner', type: s.type, world, kind: turret ? 'turret' : 'emplacement',
    name: turret ? 'Gun Turret' : s.type === 'guardTower' ? 'Tower Gunner' : 'MG Gunner',
    aimLift: s.type === 'guardTower' ? 1.3 : s.type === 'mgNest' ? 0.45 : 0.3,
    path: [], moving: false, speedMult: 1, dir: 4, staggerT: 0, wounded: false, behaviour: { kind: 'static' },
    stop() {}, goTo() { return false; }, step() { return false; },
    def: { name: turret ? 'Gun Turret' : s.type === 'guardTower' ? 'Tower Gunner' : 'MG Gunner', kind: 'infantry', weapon: turret ? 'turretCannon' : 'towerMG', emplacement: true, scope: null },
    profile: turret ? 'turret' : s.type === 'guardTower' ? 'tower' : 'infantry',
    x: gx, y: gy, px: gx, py: gy, angle: facing, baseAngle: facing, targetAngle: facing,
    alertGroup: s.alertGroup, state: 'unaware', stateT: 0, det: 0, seesOp: false, percT: Math.random() * 0.1,
    dead: false, structure: s, fireT: 1, burstLeft: 0, burstT: 0, hp: 50, maxHp: 50, blood: null,
    // elevated gunners look from higher up (tower +1 level)
    elevBonus: s.type === 'guardTower' ? 1 : 0,
    get tx() { return Math.floor(this.x); }, get ty() { return Math.floor(this.y); },
    get elev() { return world.map.elevAt(this.tx, this.ty) + this.elevBonus; },
    visionMult: 1, blindT: 0, flashT: 0, tag: null,
    setState(st) { if (this.state !== st) { this.state = st; this.stateT = 0; } },
    pose() { return { pose: 'idle', frame: 0 }; },
    face(x, y) { this.targetAngle = Math.atan2(y - this.y, x - this.x); },
  };
}

export class StructureSystem {
  constructor(game) {
    this.game = game;
    const w = this.world = game.world;
    w.structures = [];
    this.fires = [];     // burning tiles {x,y,t,dps}
    for (const spec of w.data.structures || []) this.add(spec);
    w.events.on('alert', (e) => this.onAlert(e));
    this.reinforceT = new Map();
  }
  add(spec) {
    const w = this.world;
    const s = new Structure(w, spec, w.structures.length);
    s.spec = spec;
    w.structures.push(s);
    w.map.setStructure(s.index, s.x, s.y, s.w, s.h, s.def.blockH);
    if (s.def.gunner || s.def.turret) {
      s.gunner = makeEmplacement(w, s);
      w.units.push(s.gunner);
    }
    return s;
  }
  byId(id) { return this.world.structures.find((s) => s.id === id); }
  groupHas(group, type) { return this.world.structures.some((s) => s.alertGroup === group && s.type === type); }
  powered(group) {
    const plants = this.world.structures.filter((s) => s.alertGroup === group && s.type === 'powerPlant');
    if (!plants.length) return !this.world.powerCut?.[group];
    return plants.some((p) => !p.dead) && !this.world.powerCut?.[group];
  }

  update(dt) {
    const w = this.world;
    for (const s of w.structures) {
      // fog: last-known state
      if (!s.seen || w.time - (s.checkT || 0) > 0.25) {
        s.checkT = w.time;
        let vis = false;
        for (let yy = s.y; yy < s.y + s.h && !vis; yy++) for (let xx = s.x; xx < s.x + s.w; xx++) if (w.fog.isVisible(xx, yy)) { vis = true; break; }
        if (vis) { s.seen = true; s.seenDead = s.dead; s.seenSt = { ...s.st }; }
      }
      if (s.dead) {
        if (s.burnT > 0) { s.burnT -= dt; if (Math.random() < dt * 8) this.game.combat.particles.fire(s.x + Math.random() * s.w, s.y + Math.random() * s.h, 1); if (Math.random() < dt * 3) this.game.combat.particles.smoke(s.cx, s.cy, 1, 1.4); }
        continue;
      }
      // power-dependent parts
      if (s.def.needsPower || s.type === 'jammer' || s.type === 'shieldGenerator') {
        const on = this.powered(s.alertGroup);
        if (!!s.st.unpowered === on) s.st = { ...s.st, unpowered: !on };
        if (s.gunner) s.gunner.blindT = on ? 0 : 999;
      }
      if (s.type === 'commsArray') {
        if (s.dishT > 0) { s.dishT -= dt; if (s.dishT <= 0) { s.st = { ...s.st, dishDown: false }; } }
        w.alerts.group(s.alertGroup).commsDown = !!s.st.dishDown;
      }
      // re-manning a dead gunner post
      if (s.gunner && s.gunner.dead && s.def.gunner) this._reman(s, dt);
    }
    // comms array destroyed → alarm stays local
    for (const s of w.structures) if (s.type === 'commsArray' && s.dead) w.alerts.group(s.alertGroup).commsDown = true;
    this._reinforce(dt);
    // fire tiles
    for (const f of this.fires) {
      f.t -= dt;
      if (Math.random() < dt * 6) this.game.combat.particles.fire(f.x + 0.5, f.y + 0.5, 1);
      const op = w.operative;
      if (op.tx === f.x && op.ty === f.y) this.game.combat.damageOp?.(f.dps * dt, { x: f.x + 0.5, y: f.y + 0.5 }, 'fire');
      for (const u of w.units) if (!u.dead && u.tx === f.x && u.ty === f.y && u.kind !== 'emplacement') { u.hp -= f.dps * dt; if (u.hp <= 0) this.game.combat.kill(u, { by: 'fire' }); }
    }
    if (this.fires.some((f) => f.t <= 0)) {
      for (const f of this.fires) if (f.t <= 0) w.map.setBlocked(f.x, f.y, false);
      this.fires = this.fires.filter((f) => f.t > 0);
    }
  }
  spawnFire(x, y, radius, time) {
    const E = BALANCE.explosions.fuelTank;
    for (let yy = Math.floor(y - radius); yy <= Math.ceil(y + radius); yy++) for (let xx = Math.floor(x - radius); xx <= Math.ceil(x + radius); xx++) {
      if (!this.world.map.inb(xx, yy) || Math.hypot(xx + 0.5 - x, yy + 0.5 - y) > radius * 0.8) continue;
      if (this.world.map.cost[this.world.map.idx(xx, yy)] === Infinity) continue;
      this.fires.push({ x: xx, y: yy, t: time, dps: E.fireDps });
    }
  }
  _reman(s, dt) {
    const w = this.world;
    const g = s.gunner;
    // an Alerted infantry unit of the group walks to the post and re-mans it after 10 s there
    if (!s.remanner || s.remanner.dead) {
      s.remanner = w.units.find((u) => !u.dead && u.kind === 'infantry' && u.def.kind === 'infantry' && u.alertGroup === s.alertGroup && (u.state === 'alerted' || u.state === 'combat') && !u.def.officer && !u.remanning);
      if (s.remanner) { s.remanner.remanning = s; s.remanT = 0; }
      return;
    }
    const r = s.remanner;
    if (s.distTo(r.x, r.y) > 1.6) { if (!r.path.length) r.goTo(Math.floor(s.cx), s.y + s.h, 'run'); r.state = 'alerted'; r.search = null; return; }
    r.path = [];
    s.remanT += dt;
    r.tag = { text: 'MANNING', t: 0.3 };
    if (s.remanT >= BALANCE.ai.remanTime) {
      // the infantry unit becomes the new gunner
      r.dead = true; r.hidden = true; r.remanning = null;
      w.units.splice(w.units.indexOf(r), 1);
      g.dead = false; g.hp = 50; g.state = 'alerted'; g.det = 0.5;
      s.st = { ...s.st, gunnerDead: false };
      s.remanner = null;
    }
  }
  _reinforce(dt) {
    const w = this.world;
    for (const g of w.alerts.groups.values()) {
      if (g.level !== 'alarm' || g.local) continue;
      const cfg = g.cfg || {};
      const bar = cfg.barracks ? this.byId(cfg.barracks) : null;
      if (!bar || bar.dead || g.reinforced >= (cfg.reinforceCap || 0)) continue;
      const t = (this.reinforceT.get(g.id) ?? 2) - dt;
      if (t > 0) { this.reinforceT.set(g.id, t); continue; }
      this.reinforceT.set(g.id, BALANCE.ai.alarmReinforceEvery);
      const n = Math.min(2, (cfg.reinforceCap || 0) - g.reinforced);
      for (let i = 0; i < n; i++) {
        const u = this.game.enemies.spawn({ id: `${g.id}-r${g.reinforced}`, type: i === 1 && g.reinforced % 3 === 1 ? 'lobber' : 'husk', x: Math.floor(bar.cx) + i, y: bar.y + bar.h, alertGroup: g.id, behaviour: { kind: 'sentry' }, facing: 'S' });
        g.reinforced++;
        const lk = w.lkp || this.game.enemies.lastSeenPos || { x: bar.cx, y: bar.cy + 3 };
        u.setState('alerted'); startSearch(u, lk.x, lk.y);
      }
    }
  }
  onAlert(e) {
    if (e.level !== 'alarm') return;
    const w = this.world;
    // vehicle bay: one vehicle per Alarm
    for (const s of w.structures) {
      if (s.dead || s.alertGroup !== e.group || !s.spawnOnAlarm) continue;
      if (s.spawnedFor === w.alerts.group(e.group).alarmCount) continue;
      s.spawnedFor = w.alerts.group(e.group).alarmCount;
      this.game.vehicles?.spawn({ id: `${s.id}-v${s.spawnedFor}`, type: s.spawnOnAlarm, x: Math.floor(s.cx), y: s.y + s.h + 1, alertGroup: e.group, behaviour: { kind: 'hunt' }, facing: 'S' });
    }
  }

  /** Damage a structure (explosions ×0.5, C4 destroys outright). */
  damage(s, dmg, cause = {}) {
    if (s.dead) return;
    if (s.hardened) dmg *= BALANCE.strike.hardenedMult;
    s.hp -= dmg;
    s.flashT = 0.15;
    if (s.hp <= 0) this.destroy(s, cause);
  }
  destroy(s, cause = {}) {
    if (s.dead) return;
    const w = this.world;
    s.dead = true; s.hp = 0;
    s.burnT = BALANCE.structures.rubbleBurn;
    w.map.clearStructure(s.x, s.y, s.w, s.h, true);
    for (let yy = s.y - 1; yy <= s.y + s.h; yy++) for (let xx = s.x - 1; xx <= s.x + s.w; xx++) this.game.renderer?.terrain.invalidateTile(xx, yy);
    if (s.gunner && !s.gunner.dead) { s.gunner.dead = true; }
    this.game.combat.particles.debris(s.cx, s.cy, 30, ['#2A2D30', '#43484C', '#5A6166', '#A6F03C']);
    this.game.combat.particles.smoke(s.cx, s.cy, 12, 2);
    this.game.cam?.shake(4);
    w.events.emit('structureDestroyed', { structure: s, cause });
    this.game.hud?.say('Structure destroyed.');
    const X = BALANCE.explosions;
    if (s.def.explodes === 'silo') this.game.combat.later(0, () => explode(this.game.combat, s.cx, s.cy, X.silo.radius, X.silo.damage, { source: 'player' }));
    if (s.def.explodes === 'fuelDepot') this.game.combat.later(0, () => explode(this.game.combat, s.cx, s.cy, X.fuelDepot.radius, X.fuelDepot.damage, { source: 'player', fire: 6 }));
    if (s.type === 'powerPlant') w.events.emit('powerLost', { group: s.alertGroup });
    if (s.type === 'jammer') this.game.hud?.say('Jammer offline.');
  }
  /** C4 on a demolishable bridge: every connected bridge tile drops into the water (SPEC §13, Mission 3). */
  demolishBridge(tx, ty) {
    const w = this.world, m = w.map;
    const seen = new Set(), stack = [[tx, ty]];
    while (stack.length) {
      const [x, y] = stack.pop();
      const k = y * m.w + x;
      if (!m.inb(x, y) || seen.has(k) || !m.demolishable[k]) continue;
      seen.add(k);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    for (const k of seen) {
      const x = k % m.w, y = Math.floor(k / m.w);
      m.demolishable[k] = 0;
      m.setOverlay(x, y, '.');
      m.setTerrain(x, y, 'W');
      this.game.combat.particles.debris(x + 0.5, y + 0.5, 6, ['#5A4632', '#7A5E3E', '#3A2E22']);
      this.game.combat.particles.smoke(x + 0.5, y + 0.5, 2, 1.2);
    }
    for (const k of seen) { const x = k % m.w, y = Math.floor(k / m.w); for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) this.game.renderer?.terrain.invalidateTile(xx, yy); }
    // anything standing on it goes into the river
    for (const u of w.units) if (!u.dead && seen.has(Math.floor(u.y) * m.w + Math.floor(u.x))) this.game.combat.kill(u, { by: 'c4', source: 'player' });
    w.events.emit('bridgeDown', { x: tx, y: ty, tiles: seen.size });
    this.game.hud?.say('Bridge is down.', true);
  }
  /** Sniper hit on a structure part (SPEC §11.1). */
  hitPart(s, zone) {
    const sys = this.game.combat, w = this.world;
    switch (zone) {
      case 'gunner':
        if (s.gunner && !s.gunner.dead) { s.gunner.dead = true; s.st = { ...s.st, gunnerDead: true }; sys.particles.blood(s.gunner.x, s.gunner.y - 1, { main: '#5BD13A', shade: '#2E7A1C', hi: '#B8F27A' }, 10); w.stats.kills++; w.stats.headshots++; w.stats.rifleKills++; w.events.emit('unitKilled', { unit: s.gunner, cause: { by: 'rifle', zone: 'head' } }); this.game.enemies.onKill(s.gunner, { by: 'rifle' }); return 'GUNNER DOWN'; }
        return null;
      case 'searchlight': s.st = { ...s.st, lightDead: true }; sys.particles.sparks(s.x + 0.2, s.y - 1.5, 10, 20); w.noise(s.cx, s.cy, 6, 'glass'); return 'LIGHT OUT';
      case 'coolant': s.st = { ...s.st, cellDead: true }; explode(sys, s.x + 2.7, s.y + s.h - 0.3, BALANCE.explosions.coolantCell.radius, BALANCE.explosions.coolantCell.damage, { source: 'player' }); this.damage(s, s.maxHp * BALANCE.explosions.coolantCell.buildingFrac); return 'COOLANT CELL';
      case 'dish': s.st = { ...s.st, dishDown: true }; s.dishT = SB.commsDishDisable; sys.particles.sparks(s.cx, s.y - 1, 12, 20); this.game.hud?.say('Comms dish down. Their radio is deaf for a minute.'); return 'DISH DOWN';
      case 'siren': s.st = { ...s.st, sirenDead: true }; sys.particles.sparks(s.cx, s.y - 1, 8, 20); return 'SIREN DOWN';
      case 'barrel': explode(sys, s.cx, s.cy, BALANCE.explosions.fuelDepot.radius, BALANCE.explosions.fuelDepot.damage, { source: 'player' }); this.destroy(s); return 'FUEL DEPOT';
      default: sys.particles.sparks(s.cx, s.cy, 4, 8); return null;
    }
  }

  // ------------------------------------------------------------------ rendering
  sprite(s) { return structureSprite(s.type, s.seenSt || s.st); }
  /** Push drawables for the renderer's y-sorted pass. */
  sortedLayer(push, r) {
    const w = this.world;
    for (const s of w.structures) {
      if (!s.seen) continue;
      if (s.seenDead) continue; // rubble is part of the terrain
      push({ y: s.bottom + 0.99, elev: 0, draw: (ctx) => this.drawOne(ctx, r.cam, s) }, s.bottom);
    }
  }
  drawOne(ctx, cam, s, zoom = cam.zoom) {
    const spr = this.sprite(s);
    const X = Math.round((s.x * TILE - cam.left) * zoom - spr.ox * zoom), Y = Math.round((s.y * TILE - spr.Hb - cam.top) * zoom);
    const fogged = !this.anyVisible(s);
    // cast shadow (south-east) for depth
    ctx.globalAlpha = 0.32;
    ctx.drawImage(tintOf(spr.canvas, '#000000'), X + 4 * zoom, Y + 3 * zoom, spr.w * zoom, spr.h * zoom);
    ctx.globalAlpha = fogged ? 0.75 : 1;
    ctx.drawImage(spr.canvas, X, Y, spr.w * zoom, spr.h * zoom);
    ctx.globalAlpha = 1;
    // blinking lights: powered structures pulse a lime beacon
    if (!fogged && !s.st.unpowered && (Math.floor(Time.realTime * 2 + s.index) & 1)) {
      ctx.fillStyle = C.notLime; ctx.fillRect(X + Math.round(spr.w * zoom / 2), Y, zoom, zoom);
    }
  }
  anyVisible(s) {
    const f = this.world.fog;
    for (let yy = s.y; yy < s.y + s.h; yy++) for (let xx = s.x; xx < s.x + s.w; xx++) if (f.isVisible(xx, yy)) return true;
    return false;
  }
  /** Scope pass: draw structures on row y at scope zoom */
  drawRow(b, scam, y) {
    for (const s of this.world.structures) if (s.seen && !s.seenDead && s.bottom === y) this.drawOne(b, scam, s, scam.zoom);
  }
  /** Which structure part is at world px (ix, iy)? */
  resolve(ix, iy, sizeMult = 1) {
    let best = null;
    for (const s of this.world.structures) {
      if (s.dead || !this.anyVisible(s)) continue;
      const spr = this.sprite(s);
      const left = s.x * TILE - spr.ox, top = s.y * TILE - spr.Hb;
      const lx = ix - left, ly = iy - top;
      if (lx < 0 || ly < 0 || lx >= spr.w || ly >= spr.h) continue;
      const a = spr.pix.alphaAt(Math.floor(lx), Math.floor(ly));
      for (const z of spr.zones) {
        const cx = z.x + z.w / 2, cy = z.y + z.h / 2, hw = (z.w / 2) * (z.prio > 1 ? sizeMult : 1), hh = (z.h / 2) * (z.prio > 1 ? sizeMult : 1);
        if (lx < cx - hw || lx >= cx + hw || ly < cy - hh || ly >= cy + hh) continue;
        if (z.name === 'hull' && !a) continue;
        if (z.name === 'gunner' && s.st.gunnerDead) continue;
        if (!best || z.prio > best.zone.prio) best = { structure: s, zone: z };
      }
    }
    return best;
  }
  /** Burning-debris & C4-able outline hint drawn over fog */
  overlay(ctx, r) {}
}
