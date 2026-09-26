// @ts-check
import { World } from '../world/world.js';
import { Camera, TILE } from '../core/camera.js';
import { Gestures } from '../core/input.js';
import { Renderer, ellipse } from '../render/renderer.js';
import { Hud } from '../ui/hud.js';
import { Time } from '../core/time.js';
import { BALANCE } from '../config/balance.js';
import { KEYS } from '../config/keys.js';
import { C } from '../config/palette.js';
import { drawText } from '../render/font.js';
import { panel } from '../ui/widgets.js';
import { TERRAIN, OVERLAY } from '../world/tiles.js';
import { canSee } from '../world/los.js';
import { Objectives } from '../missions/objectives.js';
import '../render/spriteData/notUnits.js';
import { EnemySystem } from '../ai/enemies.js';
import { CombatSystem } from '../combat/system.js';
import { Scope } from '../scope/scope.js';
import { Engage } from '../combat/engage.js';
import { installUnitRendering } from '../render/unitRenderer.js';
import { unitSprite } from '../render/sprites.js';
import { StructureSystem } from '../entities/structure.js';
import { VehicleSystem } from '../entities/vehicle.js';
import { PropSystem } from '../entities/props.js';
import { C4System } from '../combat/c4.js';
import { MissionRunner } from '../missions/runner.js';
import { dropshipSprite } from '../render/spriteData/vehicles.js';
import { STRUCT_ZONES } from '../render/spriteData/structures.js';
import '../render/spriteData/godUnits.js';
import { FriendlySystem } from '../entities/friendly.js';
import { Weather } from '../world/weather.js';
import { NotConvoy } from '../missions/convoy.js';
import { wrapText, measureText } from '../render/font.js';
import { Particles } from '../render/particles.js';
import { Lighting } from '../render/lighting.js';
import { StrikeSystem } from '../strike/strike.js';
import { TunnelSystem } from '../world/tunnels.js';
import { snapshot, restore } from '../missions/checkpoint.js';
import { NoiseIndicator } from '../ui/noise.js';
import { TerrainTrails } from '../render/terrainCover.js';
import { Takedown } from '../combat/takedown.js';

/**
 * The in-mission scene: world simulation, camera, input → commands, renderer and HUD.
 */
export class GameScene {
  constructor(app) {
    this.app = app;
    this.settings = app.settings;
    this.audio = app.audio;
  }
  enter(params) {
    this.params = params;
    this.missionId = params.mission || 'm1';
    this.loading = true;
    this.loadProgress = 0;
    this.mode = 'normal';
    this.awareness = { state: 'hidden', fill: 0 };
    this.reloadT = 0;
    this.infoRing = null;
    this.debug = !!this.app.debug;
    // test/debug runs (?god ?at ?reveal ?debug ?map) never write progress or tutorial flags
    this.debugRun = ['god', 'at', 'reveal', 'debug', 'map'].some((k) => this.app.params.has(k));
    this.keyPan = { x: 0, y: 0 };
    this._load();
  }
  async _load() {
    const mod = await import(`../missions/${this.missionId === 'test' ? 'test' : this.missionId}.js`).catch(() => import(`../missions/data/${this.missionId}.js`));
    const data = mod.default;
    this.data = data;
    this.missionModule = data;
    this.world = new World(data, { seed: this.app.seed, settings: this.settings, difficulty: this.settings.difficulty });
    this.cam = new Camera();
    this.cam.setMap(data.size.w, data.size.h);
    this.cam.reducedMotion = !!this.settings.reducedMotion;
    this.renderer = new Renderer(this.world, this.cam);
    this.objectives = new Objectives(this, data.objectives || []);
    this.hud = new Hud(this);
    this.combat = new CombatSystem(this);
    this.vehicles = new VehicleSystem(this);
    this.structures = new StructureSystem(this);
    this.enemies = new EnemySystem(this);
    this.props = new PropSystem(this);
    this.friendlies = new FriendlySystem(this);          // GOD pilots / scientists / medical trucks (+ this.convoy)
    this.weather = new Weather(this);                    // snow tracks, blizzards, tint
    // NOT vehicle convoys (Mission 3): one per route used by `convoy` units
    const routes = [...new Set(this.world.units.filter((u) => u.behaviour?.kind === 'convoy').map((u) => u.behaviour.path))];
    this.notConvoys = routes.map((p) => new NotConvoy(this, p));
    this.c4 = new C4System(this);
    this.lighting = new Lighting(this);                  // night/dusk darkness, light pools, searchlights (answers world.isLit)
    this.strike = new StrikeSystem(this);                // laser designator (SPEC §14)
    this.tunnels = new TunnelSystem(this);               // culverts (M6) — hides their guards
    this.noise = new NoiseIndicator(this);               // noise rings + HUD meter (how far a sound carries)
    this.trails = new TerrainTrails(this);               // WREN's fading trail through tall grass / shallow water
    this.takedown = new Takedown(this);                  // silent takedown of an unaware soldier within reach
    this.scope = new Scope(this);
    this.engage = new Engage(this);
    this.hitMarks = [];
    this.world.smokes = [];
    this.world.smokeAt = (tx, ty) => this.world.smokes.some((k) => Math.abs(tx + 0.5 - k.x) <= 1.6 && Math.abs(ty + 0.5 - k.y) <= 1.6);
    this.runner = new MissionRunner(this);
    installUnitRendering(this);
    this.renderer.layers.sorted.push((push, r) => this.structures.sortedLayer(push, r));
    this.renderer.layers.sorted.push((push, r) => this.props.sortedLayer(push, r));
    this.renderer.layers.sorted.push((push, r) => this.friendlies.sortedLayer(push, r));
    this.renderer.layers.ground.push((ctx, r) => this.weather.drawTracks(ctx, r));
    this.renderer.layers.ground.push((ctx, r) => this.trails.draw(ctx, r));
    this.renderer.layers.effects.push((ctx, r) => this.combat.draw(ctx, r));
    this.renderer.layers.overFog.push((ctx, r) => this.c4.draw(ctx, r));
    this.renderer.layers.overFog.push((ctx, r) => { this.runner.drawLZ(ctx, r); if (r._lzLabel) drawText(ctx, 'LZ', r._lzLabel.x, r._lzLabel.y, { font: '3x5', color: '#7CFF7A', align: 'center' }); r._lzLabel = null; });
    this.renderer.layers.overFog.push((ctx, r) => this._drawDropship(ctx, r));
    this.renderer.layers.effects.push((ctx, r) => this._drawSmoke(ctx, r));
    // darkness goes over the sprites but under muzzle flashes, tracers and explosions
    this.renderer.layers.effects.unshift((ctx, r) => this.lighting.draw(ctx, r));
    this.renderer.layers.overFog.push((ctx, r) => { this.noise.draw(ctx, r); this.tunnels.draw(ctx, r); this.strike.draw(ctx, r); this.takedown.draw(ctx, r); });
    this.gestures = new Gestures(this._gestureHandlers());
    this.resize(this.app.display.W, this.app.display.H);
    const cp = this.params.checkpoint && this.app.checkpoint;
    if (cp && cp.mission === this.missionId) { restore(this, cp.snap); this.fromCheckpoint = cp.key; }
    else if (!this.params.checkpoint) this.app.checkpoint = null;   // a fresh attempt drops the old checkpoint
    const op = this.world.operative;
    const at = this.app.params.get('at');
    if (at) { const [ax, ay] = at.split(',').map(Number); const t = this.world.map.nearestWalkable(ax, ay, 6); if (t) { op.x = op.px = t.x + 0.5; op.y = op.py = t.y + 0.5; } }
    this.cam.centreOn(op.x, op.y);
    this.world.fog.revealAll = !!this.app.params.get('reveal');
    this.world.update(0);
    // bake terrain progressively
    const gen = this.renderer.terrain.buildAll();
    const step = () => {
      const t0 = performance.now();
      let r;
      while (performance.now() - t0 < 24) { r = gen.next(); if (r.done) break; this.loadProgress = r.value; }
      if (r && r.done) { this.loading = false; this._start(); }
      else requestAnimationFrame(step);
    };
    step();
  }
  _start() {
    this.hud.say(this.fromCheckpoint ? 'Back at the checkpoint, WREN. Carry on.' : "WREN, OVERWATCH. You're on the ground.");
    this.world.events.on('toast', (t) => this.hud.toast(t.text, t.color));
    this.world.events.on('runGunOff', () => this.hud.toast('RUN & GUN OFF'));
    this.world.events.on('opDead', () => {
      this.engage.cancel();
      this.runner.lose('WREN is down. Mission failed.');
    });
    this.world.events.on('alert', (e) => {
      if (e.level === 'alarm' && e.reason !== 'officer radio') {
        this.hud.say(this.enemies.alerts.hasBarracks(e.group) ? 'Alarm raised. Reinforcements incoming.' : 'Alarm raised. Get out of there.', true);
      }
      if (e.level === 'alarm') {
        // a map-wide alarm (strike inbound, the Spire falling) raises every group at once: count it once
        const key = `${e.reason}@${this.world.time}`;
        if (key !== this._lastAlarmKey) this.world.stats.alarms++;
        this._lastAlarmKey = key;
        this.objectives.items.filter((o) => o.type === 'STEALTH').forEach((o) => this.objectives.fail(o.id));
      }
    });
    this.world.events.on('objectiveDone', (o) => { this.hud.say('Objective complete.'); this.hud.toast('OBJECTIVE COMPLETE', '#7CFF7A'); this.hud.peekObjectives(4); });
    window.__game = this;
  }
  resize(W, H) {
    if (!this.cam) return;
    this.cam.setView(W, H);
    this.hud.layout(W, H, this.app.display.buttonSize, this.settings.handedness === 'left', this.app.display.safe);
    this.scope.layout(W, H, this.app.display.buttonSize, this.app.display.safe);
  }

  // ---------------------------------------------------------------- commands
  cmd(name, arg) {
    const w = this.world, op = w.operative;
    switch (name) {
      case 'cover': op.takeCover(); break;
      case 'hunker': {
        const r = op.toggleHunker();
        this.hud.toast(r === 'on' ? 'HUNKER DOWN' : 'HUNKER OFF', C.uiText, 0.9);
        break;
      }
      case 'runGun':
        op.runGun = !op.runGun;
        if (!op.runGun) this.combat.pistol.tapped = null;
        if (op.runGun && (op.stance === 'hunker' || op.trans?.to === 'hunker')) op.toggleHunker();
        this.hud.toast(op.runGun ? 'RUN & GUN ON' : 'RUN & GUN OFF', op.runGun ? C.uiAmber : C.uiText, 0.9);
        break;
      case 'centre': this.cam.follow = true; this.cam.pan = null; break;
      case 'pause': this.app.scenes.push('pause', { game: this }); break;
      case 'medkit':
        if (op.medkits <= 0) { this.hud.toast('NO MEDKITS'); break; }
        if (op.hp >= op.maxHp) { this.hud.toast('HEALTH FULL', C.uiText); break; }
        if (op.moving) { this.hud.toast('STOP TO USE MEDKIT'); break; }
        op.busy = { kind: 'medkit', t: 0, dur: BALANCE.operative.medkitTime, onDone: () => { op.medkits--; op.hp = Math.min(op.maxHp, op.hp + BALANCE.operative.medkitHeal); this.hud.toast('+40 HP', C.uiText); } };
        break;
      case 'c4':
        if (op.c4 <= 0) { this.hud.toast('NO C4 LEFT'); break; }
        if (this.strike.state === 'targeting') this.strike.state = 'idle';
        this.mode = this.mode === 'c4' ? 'normal' : 'c4';
        if (this.mode === 'c4') this.hud.toast('TAP A BUILDING, DISABLED VEHICLE OR BRIDGE', C.uiAmber, 2.2);
        break;
      case 'plantConfirm': this.c4.confirm(); break;
      case 'smoke':
        if (op.smoke <= 0) { this.hud.toast('NO SMOKE'); break; }
        op.smoke--;
        this.world.smokes.push({ x: op.x, y: op.y, t: BALANCE.extraction.smokeTime });
        this.hud.toast('SMOKE OUT', C.uiText);
        this.world.noise(op.x, op.y, 3, 'smoke');
        break;
      case 'detonate': this.c4.detonateRemote(); break;
      case 'designator': this.strike.toggleTargeting(); break;
      case 'takedown': this.takedown.perform(); break;
      case 'convoy': this.convoy?.toggle(); break;
      case 'followAll': this.friendlies.toggleAll(); break;
      default:
        this.hud.toast(name.toUpperCase() + ' — NOT YET AVAILABLE', C.uiGrey);
    }
  }

  // ---------------------------------------------------------------- input
  _gestureHandlers() {
    return {
      tap: (x, y, info) => this._tap(x, y, info),
      doubleTap: (x, y) => this._doubleTap(x, y),
      longPress: (x, y) => this._longPress(x, y),
      longPressEnd: () => { if (this.infoRing) this.infoRing.hold = 2; },
      dragStart: () => { this.dragging = true; },
      drag: (dx, dy) => this.cam.panBy(-dx, -dy),
      dragEnd: () => { this.dragging = false; },
      pinch: (f) => this._zoom(this.cam.zoom * f),
    };
  }
  _zoom(z) {
    const nz = z > 1.5 ? 2 : 1;
    if (nz !== this.cam.zoom) { this.cam.zoom = nz; this.cam.clamp(); }
  }
  worldTile(sx, sy) { const t = this.cam.screenToTile(sx, sy); return { x: Math.floor(t.x), y: Math.floor(t.y), fx: t.x, fy: t.y }; }
  _tap(sx, sy, info) {
    const t = this.worldTile(sx, sy);
    if (!this.world.map.inb(t.x, t.y)) return;
    const op = this.world.operative;
    if (this.tunnels.transit) return;                     // WREN is underground
    if (this.onTapWorld && this.onTapWorld(t, info)) return;
    if (this.mode === 'designator') { this.strike.tapTarget(t.x, t.y); return; }
    // C4 targeting mode / tapping a C4-able target
    const c4t = this.c4.targetAt(t.x, t.y) || this.structureTargetNear(t.fx, t.fy);
    if (this.mode === 'c4') {
      this.mode = 'normal';
      if (c4t) { this.c4.plant(c4t); return; }
      this.hud.toast('NOT A C4 TARGET', C.uiGrey);
      return;
    }
    if (c4t && op.c4 > 0 && !this.unitAt(sx, sy)) {
      if (this.c4.pending && this.c4.pending.name === c4t.name && Math.hypot(this.c4.pending.x - c4t.x, this.c4.pending.y - c4t.y) < 0.5) this.c4.confirm();
      else {
        this.c4.propose(c4t); this.hud.toast('PLANT C4? TAP AGAIN OR PRESS PLANT', C.uiAmber, 2);
        if (c4t.s && STRUCT_ZONES[c4t.s.type]) this.runner.showTutorial('structs', 'Buildings', 'Tap a building to plant C4. To shoot it instead — its gunner, searchlight or tanks — long-press it to open the scope.');
      }
      return;
    }
    // GOD friendlies: tap a follower to toggle FOLLOW/HOLD; tap a captive to go and free them
    const fr = this.friendlyAt(sx, sy);
    if (fr && fr.kind === 'person') {
      if (fr.captive) {
        const m = this.world.map;
        const spot = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dy]) => ({ x: fr.tx + dx, y: fr.ty + dy })).filter((q) => m.walkable(q.x, q.y))
          .sort((a, b) => Math.hypot(a.x - op.x, a.y - op.y) - Math.hypot(b.x - op.x, b.y - op.y))[0];
        if (spot && op.orderMove(spot.x, spot.y, 'walk')) { this.hud.toast(fr.downed ? `HELPING ${fr.name.toUpperCase()} UP — STAY STILL` : `FREEING ${fr.name.toUpperCase()} — STAY STILL`, C.uiAmber, 2); this.renderer.addMarker(spot.x + 0.5, spot.y + 0.5, 'tap', '#7CFF7A'); }
        return;
      }
      this.friendlies.toggle(fr);
      return;
    }
    const unit = this.unitAt(sx, sy);
    // a building with snipeable parts and no C4 to plant (or not C4-able): tap aims the rifle at it
    const st = !unit && this.structureAt(t.fx, t.fy);
    if (st && STRUCT_ZONES[st.type] && (op.c4 <= 0 || !st.def.c4)) {
      this.engage.engage(this.structureTarget(st), { force: true });
      return;
    }
    if (c4t && op.c4 <= 0 && !unit) this.runner.showTutorial('structs', 'Buildings', 'No C4 left. Long-press a building to aim at its weak points with the rifle — gunners, searchlights, dishes, coolant tanks.');
    if (unit && !this.takedown.blocker(unit)) { this.takedown.perform(unit); return; }   // within reach & unaware: silent
    if (unit) {
      this.engage.engage(unit, { force: !!info?.shift });
      this.renderer.addMarker(unit.x, unit.y, 'tap', '#FF5A3A');
      this.lastTapUnit = unit;
      return;
    }
    this.lastTapUnit = null;
    this.engage.cancel();
    if (this.tunnels.tap(t.x, t.y)) { this.renderer.addMarker(t.x + 0.5, t.y + 0.5, 'tap', '#7CFF7A'); return; }
    // flat (hunkered, or getting down): a tap low-crawls there; double-tap / HUNKER gets up
    const flat = op.stance === 'hunker' || (!!op.trans && op.trans.to === 'hunker');
    const ok = op.orderMove(t.x, t.y, flat ? 'crawl' : 'walk');
    if (ok && flat) this.runner.showTutorial('crawl', 'Low crawl', 'Flat on the ground, a tap crawls: very slow, still flat and all but silent. Get close enough to an unaware soldier and you can take them down without a shot. Double-tap or press HUNKER to get up.');
    if (ok) {
      this.renderer.addMarker(t.x + 0.5, t.y + 0.5, 'tap', '#7CFF7A');
      this.audio?.tick?.();
    } else this.hud.toast("CAN'T GO THERE", C.uiGrey, 0.8);
    this.lastTapTile = t;
  }
  /** A seen, living structure whose sprite covers world point (fx, fy) tiles. */
  structureAt(fx, fy) {
    for (const s of this.world.structures) {
      if (s.dead || !s.seen) continue;
      const top = s.y - s.def.Hb / 16;
      if (fx >= s.x - 0.2 && fx < s.x + s.w + 0.2 && fy >= top && fy < s.y + s.h + 0.2) return s;
    }
    return null;
  }
  structureTargetNear(fx, fy) {
    const s = this.structureAt(fx, fy);
    return s && s.def.c4 ? { kind: 'structure', s, x: s.cx, y: s.cy, name: s.def.name } : null;
  }
  /** Pseudo-target so the engage planner & scope can aim at a structure's parts. */
  structureTarget(s) {
    const spr = this.structures.sprite(s);
    const best = [...spr.zones].sort((a, b) => b.prio - a.prio)[0];
    const lift = best ? Math.max(0.3, (spr.Hb - (best.y + best.h / 2)) / TILE - (s.h - 0.8)) : 0.5;
    return {
      aimLift: lift,
      kind: 'structure', structure: s, x: s.cx, y: s.y + s.h - 0.2, get tx() { return Math.floor(this.x); }, get ty() { return Math.floor(this.y); },
      get dead() { return s.dead; }, name: s.def.name, angle: Math.PI / 2, def: {}, profile: null, alertGroup: s.alertGroup,
    };
  }
  /** Visible living enemy under a screen point (generous touch slop). */
  unitAt(sx, sy) {
    const w = this.world, z = this.cam.zoom;
    let best = null, bd = 18;
    for (const u of w.units) {
      if (u.dead || u.hidden || u.kind === 'structure' || !w.fog.isVisible(u.tx, u.ty)) continue;
      const p = this.cam.tileToScreen(u.x, u.y);
      const lift = u.type === 'guardTower' ? 26 : u.kind === 'vehicle' ? 4 : 6;
      const d = Math.hypot(sx - p.x, (sy - (p.y - lift * z)) * 0.8);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }
  hitIndicator(x, y) {
    const op = this.world.operative;
    this.hitMarks.push({ a: Math.atan2(y - op.y, x - op.x), t: 1 });
    if (this.hitMarks.length > 4) this.hitMarks.shift();
  }
  _doubleTap(sx, sy) {
    const op = this.world.operative;
    if (this.tunnels.transit || this.mode === 'designator') return;
    if (this.onDoubleTapWorld && this.onDoubleTapWorld(this.worldTile(sx, sy))) return;
    op.upgradeRun();
    const t = this.worldTile(sx, sy);
    this.renderer.addMarker(t.x + 0.5, t.y + 0.5, 'tap', '#FFB23A');
  }
  _longPress(sx, sy) {
    const t = this.worldTile(sx, sy);
    if (this.tunnels.transit) return;
    if (this.mode === 'designator') { this.strike.tapTarget(t.x, t.y); return; }
    if (this.onLongPressWorld && this.onLongPressWorld(t)) return;
    const unit = this.unitAt(sx, sy);
    if (unit) { this.engage.engage(unit, { force: true }); this.app.vibrate?.(15); return; }
    // long-press a structure: scope its snipeable parts (dish, coolant cell, siren, fuel barrels…)
    const st = this.structureAt(t.fx, t.fy);
    if (st) { this.engage.engage(this.structureTarget(st), { force: true }); this.app.vibrate?.(15); return; }
    if (!this.world.map.inb(t.x, t.y)) return;
    this.infoRing = { x: t.x, y: t.y, hold: -1, sx, sy };
    this.app.vibrate?.(10);
  }
  overlayDown(p) { return this.scope.open ? this.scope.down(p) : false; }
  overlayMove(p) { return this.scope.open ? this.scope.move(p) : false; }
  overlayUp(p) { return this.scope.open ? this.scope.up(p) : false; }
  onHover(x, y) { if (this.scope?.open) this.scope.hover(x, y); else if (this.scope) this.scope.hoverLast = null; }
  onPointerDown(p) {
    if (this.loading) return;
    if (this.scope.open) { this.scope.down(p); return; }
    const tr = this.tutRect;
    if (this.runner?.tutorial && tr && p.x >= tr.x && p.y >= tr.y && p.x < tr.x + tr.w && p.y < tr.y + tr.h) {
      if (tr.collapsed) this.runner.tutorial.t = 0.2; else this.runner.dismissTutorial();   // banner → expand again
      return;
    }
    if (this.hud.down(p)) return;
    if (this.overlayDown && this.overlayDown(p)) return;
    p.owner = 'world';
    this.gestures.down(p);
  }
  onPointerMove(p) {
    if (this.loading) return;
    if (this.scope.open || this.scope.active.has(p.id)) { this.scope.move(p); return; }
    if (this.hud.move(p)) return;
    if (this.overlayMove && this.overlayMove(p)) return;
    if (p.owner === 'world') this.gestures.move(p);
  }
  onPointerUp(p, cancel) {
    if (this.loading) return;
    if (this.scope.active.has(p.id)) { this.scope.up(p); return; }
    if (this.hud.up(p)) return;
    if (this.overlayUp && this.overlayUp(p)) return;
    if (p.owner === 'world') this.gestures.up(p, cancel);
  }
  onWheel(d) { if (!this.loading) this._zoom(d < 0 ? 2 : 1); }
  onKeyUp(code) { if (this.scope?.open) this.scope.key(code, false); }
  onKeyDown(code, e) {
    if (this.loading) return;
    if (this.scope.open) { this.scope.key(code, true); return; }
    if (this.overlayKey && this.overlayKey(code, e)) return;
    const K = KEYS;
    if (code === K.cover) this.cmd('cover');
    else if (code === K.hunker) this.cmd('hunker');
    else if (code === K.runGun) this.cmd('runGun');
    else if (code === K.c4) this.cmd('c4');
    else if (code === K.designator) this.cmd('designator');
    else if (code === K.centre) this.cmd('centre');
    else if (code === K.pause && this.mode === 'designator') this.strike.toggleTargeting();   // Esc leaves targeting first
    else if (code === K.pause) this.cmd('pause');
    else if (code === K.medkit) this.cmd('medkit');
    else if (code === K.takedown) this.cmd('takedown');
    else if (code === K.debug) this.debug = !this.debug;
    else if (code === 'KeyR' && this.debug) this.world.fog.revealAll = !this.world.fog.revealAll;
  }

  // ---------------------------------------------------------------- loop
  update(dt) {
    if (this.loading) return;
    this.world.update(dt);
    this.structures.update(dt);
    this.enemies.update(dt);
    this.vehicles.update(dt);
    this.friendlies.update(dt);
    this.convoy?.update(dt);
    for (const c of this.notConvoys) { c.update(dt); c.checkVipOnFoot(); }
    this.weather.update(dt);
    this.props.update(dt);
    this.c4.update(dt);
    this.strike.update(dt);
    this.tunnels.update(dt);
    this.noise.update(dt);
    if (!this._takedownTip && this.takedown.target()) { this._takedownTip = true; this.runner.showTutorial('takedown', 'Silent takedown', 'Within reach and they haven\'t seen you: press TAKEDOWN (or tap them). No ammo, barely a sound — but the body stays where it falls, and anyone watching sees it happen.'); }
    this.trails.update(dt);
    this.combat.update(dt);
    this.engage.update(dt);
    this.objectives.update(dt);
    this.runner.update(dt);
    for (const k of this.world.smokes) k.t -= dt;
    this.world.smokes = this.world.smokes.filter((k) => k.t > 0);
    if (!this.runner.ended) this.world.stats.time += dt;
  }
  frame(dt) {
    if (this.loading) return;
    this.gestures.update();
    // keyboard / edge panning (desktop)
    const inp = this.app.input, K = KEYS;
    let kx = 0, ky = 0;
    if (inp.isDown(K.panLeft) || inp.isDown(K.panLeft2)) kx -= 1;
    if (inp.isDown(K.panRight) || inp.isDown(K.panRight2)) kx += 1;
    if (inp.isDown(K.panUp) || inp.isDown(K.panUp2)) ky -= 1;
    if (inp.isDown(K.panDown) || inp.isDown(K.panDown2)) ky += 1;
    const mouse = inp.mouse;
    if (!inp.usedTouch && mouse.inside && !this.app.scenes.stack.some((s) => s.name === 'pause')) {
      const e = BALANCE.input.edgeScrollPx;
      if (mouse.x < e) kx -= 1; else if (mouse.x > this.app.display.W - e) kx += 1;
      if (mouse.y < e) ky -= 1; else if (mouse.y > this.app.display.H - e) ky += 1;
    }
    if (kx || ky) this.cam.panBy(kx * BALANCE.input.keyPanSpeed * dt, ky * BALANCE.input.keyPanSpeed * dt);
    this.frameDt = dt;
    this.lastRealDt = dt;
    if (this.pendingDebrief) { this.endT -= dt; if (this.endT <= 0) { const p = this.pendingDebrief; this.pendingDebrief = null; this.app.scenes.go('debrief', p); return; } }
    this.hud.update(dt);
    this.scope.update(dt);
    for (const h of this.hitMarks) h.t -= dt;
    this.hitMarks = this.hitMarks.filter((h) => h.t > 0);
  }
  render(ctx, alpha) {
    const D = this.app.display;
    if (this.loading) { this._drawLoading(ctx, D.W, D.H); return; }
    // camera follows the *same* interpolated position the renderer draws (no alpha mismatch)
    const op = this.world.operative;
    const tx = (op.px + (op.x - op.px) * alpha) * TILE, ty = (op.py + (op.y - op.py) * alpha) * TILE;
    this._autoFollow(tx, ty);
    this.cam.update(this.frameDt || 0, { x: tx, y: ty });
    this.frameDt = 0;
    this.renderer.draw(ctx, alpha);
    this.weather.drawOverlay(ctx, D.W, D.H);
    this.strike.drawScreen(ctx, D.W, D.H);
    if (this.infoRing) {
      if (this.infoRing.hold >= 0) { this.infoRing.hold -= this.lastRealDt || 0.016; if (this.infoRing.hold <= 0) this.infoRing = null; }
      if (this.infoRing) this._drawInfoRing(ctx);
    }
    this.hud.draw(ctx);
    this._drawEdgeArrows(ctx);
    this._drawTutorial(ctx);
    this._drawHitMarks(ctx);
    this.scope.render(ctx);
    if (this.world.operative.dead) {
      ctx.fillStyle = 'rgba(40,0,0,0.25)'; ctx.fillRect(0, 0, D.W, D.H);
    }
    if (this.debug) this._drawDebug(ctx);
  }
  // ---------------------------------------------------------------- friendlies (SPEC §15)
  escortCount() { return this.friendlies.persons.filter((f) => !f.captive).length; }
  escortsHolding() { return this.friendlies.holding(); }
  escortsForExtraction() { return this.friendlies.escortsForExtraction(); }
  /** The friendly under a screen point (persons and trucks), if seen. */
  friendlyAt(sx, sy) {
    const w = this.world;
    let best = null, bd = 16;
    for (const f of w.friendlies) {
      if (f.dead || !w.fog.isSeen(f.tx, f.ty)) continue;
      const p = this.cam.tileToScreen(f.x, f.y - (f.kind === 'vehicle' ? 0.3 : 0.5));
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }
  /** Screen-edge arrows toward the LZ (once active) and the incoming dropship when off-screen. */
  _drawEdgeArrows(ctx) {
    if (this.scopeOpen) return;
    const W = this.app.display.W, H = this.app.display.H;
    const targets = [];
    const obj = this.runner?.extractObjective?.();
    if (obj) { const a = this.world.data.areas[obj.area]; targets.push({ x: a.x + a.w / 2, y: a.y + a.h / 2, label: 'LZ', col: '#7CFF7A' }); }
    const sh = this.runner?.extract?.ship;
    if (sh && this.runner.extract.state !== 'boarded') targets.push({ x: sh.x, y: sh.y, label: 'SHIP', col: C.godSteelL });
    for (const t of targets) {
      const p = this.cam.tileToScreen(t.x, t.y);
      if (p.x >= 20 && p.y >= 20 && p.x <= W - 20 && p.y <= H - 20) continue;
      // arrows live in the clear play area: below the objectives, left of the minimap, above the bars
      const hud = this.hud, x0 = hud.L + 14, x1 = hud.minimap.x - 14, y0 = hud.T + 44, y1 = hud.Bot - 60;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, dx = p.x - cx, dy = p.y - cy;
      const k = Math.min((x1 - x0) / 2 / Math.abs(dx || 1e-3), (y1 - y0) / 2 / Math.abs(dy || 1e-3));
      const ax = Math.round(cx + dx * k), ay = Math.round(cy + dy * k), ang = Math.atan2(dy, dx);
      ctx.fillStyle = '#07090A'; ctx.fillRect(ax - 9, ay - 9, 18, 18);
      ctx.fillStyle = t.col;
      for (let i = 0; i < 6; i++) for (let j = -i; j <= i; j++) {
        const u = 5 - i, v = j * 0.8;
        ctx.fillRect(Math.round(ax + Math.cos(ang) * u - Math.sin(ang) * v), Math.round(ay + Math.sin(ang) * u + Math.cos(ang) * v), 1, 1);
      }
      drawText(ctx, t.label, ax, ay + 10, { font: '3x5', color: t.col, align: 'center', shadow: '#000' });
    }
  }
  /** Mid-mission checkpoint (SPEC §17.8: M6 after the rescue, M7 once the shield is down) — this run only. */
  saveCheckpoint(key) {
    if (this.world.operative.dead || this.runner.ended) return;
    this.app.checkpoint = { mission: this.missionId, key, snap: JSON.parse(JSON.stringify(snapshot(this))) };
    this.hud.toast('CHECKPOINT', '#7CFF7A', 1.8);
  }
  /** End of mission → debrief after a short beat. */
  endMission(won, reason = '') {
    const res = this.runner.results(won);
    const debugRun = this.debugRun;
    const payload = { mission: this.missionId, name: this.data.name, won, reason, stars: res.stars, medals: res.medals, stats: { ...this.world.stats }, par: this.data.par || 900, debugRun };
    this.endT = won ? 1.2 : 1.8;
    this.pendingDebrief = payload;
  }
  _drawTutorial(ctx) {
    const tut = this.runner?.tutorial;
    this.tutRect = null;
    if (!tut || this.scopeOpen) return;
    const W = this.app.display.W;
    const mm = this.hud.minimap;
    const left = this.hud.L + 8, right = mm.x - 8;
    const k = Math.min(1, tut.t * 5);
    // after a few seconds — or as soon as an enemy is on to WREN — the tip folds into a one-line banner
    const threat = this.awareness?.state && this.awareness.state !== 'hidden';
    tut.collapsed = tut.t > 6 || (threat && tut.t > 2.5);
    if (tut.collapsed) {
      const more = this.runner.tutQueue.length;
      const label = `TIP · ${(tut.title || '').toUpperCase()}${more ? `  +${more}` : ''}  ▸`;
      const pw = Math.min(right - left, measureText(label, { font: '3x5' }) + 16), ph = 13;
      const px = Math.max(left, Math.round(W / 2 - pw / 2)), py = this.hud.T + 2;
      panel(ctx, px, py, pw, ph, { alpha: 0.9, fill: '#141A15' });
      ctx.fillStyle = C.uiAmber; ctx.fillRect(px, py, 2, ph);
      drawText(ctx, label, px + 7, py + 4, { font: '3x5', color: C.uiAmber });
      this.tutRect = { x: px, y: py, w: pw, h: ph, collapsed: true };
      return;
    }
    const pw = Math.min(300, right - left);
    const lines = wrapText(tut.text, pw - 14);
    const ph = 18 + lines.length * 9 + 10;
    this.hud.objPeek = 0; this.hud.objOpen = false; // collapse objectives while a tip is up
    const px = Math.max(left, Math.min(right - pw, Math.round(W / 2 - pw / 2))), py = this.hud.T + 20;
    ctx.globalAlpha = k;
    panel(ctx, px, py, pw, ph, { alpha: 0.94, fill: '#141A15' });
    ctx.fillStyle = C.uiAmber; ctx.fillRect(px, py, 3, ph);
    drawText(ctx, 'OVERWATCH TIP · ' + (tut.title || '').toUpperCase(), px + 8, py + 5, { color: C.uiAmber, font: '3x5' });
    lines.forEach((l, i) => drawText(ctx, l, px + 8, py + 15 + i * 9, { color: C.uiText }));
    const more = this.runner.tutQueue.length;
    drawText(ctx, (more ? `+${more} MORE · ` : '') + 'TAP TO DISMISS', px + pw - 6, py + ph - 8, { font: '3x5', color: C.uiGrey, align: 'right' });
    ctx.globalAlpha = 1;
    this.tutRect = { x: px, y: py, w: pw, h: ph };
    if (tut.t > 16) this.runner.dismissTutorial();
  }
  _drawDropship(ctx, r) {
    const ex = this.runner?.extract;
    if (!ex || !ex.ship) return;
    const s = dropshipSprite();
    const z = r.cam.zoom, sh = ex.ship;
    const gx = Math.round(r.sx(sh.x)), gy = Math.round(r.sy(sh.y));
    // shadow on the ground, then the ship at altitude
    ctx.globalAlpha = 0.35; ctx.drawImage(this._shipShadow || (this._shipShadow = tintCanvas(s.canvas)), gx - s.ax * z + 6 * z, gy - s.ay * z + 4 * z, s.w * z, s.h * z); ctx.globalAlpha = 1;
    ctx.drawImage(s.canvas, gx - s.ax * z, gy - s.ay * z - sh.alt * z, s.w * z, s.h * z);
    if (Math.floor(Time.realTime * 6) & 1) { ctx.fillStyle = '#9FD8FF'; ctx.fillRect(gx - 18 * z, gy - sh.alt * z + 6 * z, 2 * z, 2 * z); ctx.fillRect(gx + 16 * z, gy - sh.alt * z + 6 * z, 2 * z, 2 * z); }
  }
  /** Is a smoke cloud covering (x, y)'s surroundings? (the dropship lands through smoke, SPEC §15.4) */
  smokeActiveNear(x, y) { return this.world.smokes.some((k) => Math.hypot(k.x - x, k.y - y) <= 4); }
  _drawSmoke(ctx, r) {
    const z = r.cam.zoom;
    for (const k of this.world.smokes) {
      const fade = Math.min(1, k.t / 2), grow = Math.min(1, (BALANCE.extraction.smokeTime - k.t) / 1.5);
      // a dense 3×3-tile cloud: layered puffs with dithered edges
      for (let i = 0; i < 26; i++) {
        const ang = i * 2.39996 + Time.realTime * (0.15 + (i % 3) * 0.05), rad = (4 + (i % 5) * 5) * grow;
        const x = r.sx(k.x) + Math.cos(ang) * rad * z, y = r.sy(k.y) + Math.sin(ang) * rad * 0.75 * z - (4 + (i % 4) * 3) * z;
        const s = (10 + (i % 3) * 4) * z;
        ctx.fillStyle = i % 4 === 0 ? `rgba(236,240,232,${(0.75 * fade).toFixed(2)})` : `rgba(196,202,192,${(0.62 * fade).toFixed(2)})`;
        ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 3), Math.round(s), Math.round(s * 0.66));
      }
    }
  }
  /** Directional hit indicators at the screen edge (SPEC §6.6). */
  _drawHitMarks(ctx) {
    const W = this.app.display.W, H = this.app.display.H;
    for (const h of this.hitMarks) {
      const a = h.a;
      const cx = W / 2, cy = H / 2;
      const r = Math.min(W, H) * 0.42;
      const x = cx + Math.cos(a) * r * (W / H) * 0.9, y = cy + Math.sin(a) * r;
      ctx.globalAlpha = Math.min(1, h.t * 1.5);
      ctx.fillStyle = C.uiAlert;
      const px = -Math.sin(a), py = Math.cos(a);
      for (let i = -6; i <= 6; i++) {
        const w2 = 3 - Math.abs(i) / 3;
        ctx.fillRect(Math.round(x + px * i - Math.cos(a) * w2), Math.round(y + py * i - Math.sin(a) * w2), 2, 2);
      }
      ctx.globalAlpha = 1;
    }
  }
  /** Minimap overlays: visible enemies, objective areas, LKP. */
  minimapExtras() {
    const w = this.world, out = [];
    for (const f of w.friendlies) if (!f.dead && w.fog.isSeen(f.tx, f.ty)) out.push({ kind: 'dot', x: f.x, y: f.y, color: C.godSteelL, size: f.kind === 'vehicle' ? 3 : 2 });
    for (const u of w.units) if (!u.dead && !u.hidden && u.kind !== 'structure' && w.fog.isVisible(u.tx, u.ty)) out.push({ kind: 'dot', x: u.x, y: u.y, color: u.state === 'combat' ? C.uiAlert : '#A6F03C', size: u.kind === 'vehicle' ? 3 : 2 });
    for (const st of w.structures) if (st.seen && !st.seenDead) out.push({ kind: 'dot', x: st.cx, y: st.cy, color: '#C9A0FF', size: Math.max(2, Math.min(4, st.w + 1)) });
    for (const o of this.objectives.list()) {
      if (o.done || o.hidden || !o.area) continue;
      const a = w.data.areas?.[o.area];
      if (a) out.push({ kind: 'area', x: a.x, y: a.y, w: a.w, h: a.h, color: o.primary ? C.uiAmber : '#C8A060' });
    }
    if (w.lkp) out.push({ kind: 'dot', x: w.lkp.x, y: w.lkp.y, color: '#B8C0B8', size: 2 });
    // jammer coverage (known jammers) + recon intel (M7 phase 1 marks the jammers, shield and Spire)
    const intel = ['jammer', 'shieldGenerator', 'hiveSpire', 'powerPlant'];
    for (const st of w.structures) {
      if (st.dead || !(st.seen || (this.intelMarked && intel.includes(st.type)))) continue;
      if (st.type === 'jammer' && !st.st.unpowered) out.push({ kind: 'hatch', x: st.cx, y: st.cy, r: BALANCE.strike.jammerRadius, color: 'rgba(155,90,224,0.7)' });
      if (!st.seen) out.push({ kind: 'dot', x: st.cx, y: st.cy, color: (Math.floor(Time.realTime * 2) & 1) ? '#C9A0FF' : '#FFFFFF', size: 3 });
    }
    return out;
  }
  /** Resume following when WREN is about to leave the view (panned planning view is kept otherwise). */
  _autoFollow(tx, ty) {
    const c = this.cam;
    if (c.follow || c.pan) return;
    if (!this.world.operative.moving) return;
    const s = c.tileToScreen(tx / TILE, ty / TILE);
    const m = 36;
    if (s.x < m || s.y < m || s.x > c.viewW - m || s.y > c.viewH - m) c.follow = true;
  }
  _drawLoading(ctx, W, H) {
    ctx.fillStyle = '#07090A'; ctx.fillRect(0, 0, W, H);
    drawText(ctx, 'DEPLOYING', W / 2, H / 2 - 16, { align: 'center', color: C.uiText });
    const bw = 160;
    panel(ctx, W / 2 - bw / 2 - 2, H / 2 - 2, bw + 4, 10, { rivets: false });
    ctx.fillStyle = C.uiText; ctx.fillRect(W / 2 - bw / 2, H / 2, Math.round(bw * this.loadProgress), 6);
    const name = this.data ? this.data.name.toUpperCase() : '';
    drawText(ctx, name, W / 2, H / 2 + 16, { align: 'center', color: C.uiAmber, font: '3x5' });
  }
  _drawInfoRing(ctx) {
    const { x, y } = this.infoRing;
    const m = this.world.map;
    const i = y * m.w + x;
    const r = this.renderer;
    const cx = Math.round(r.sx(x + 0.5)), cy = Math.round(r.sy(y + 0.5));
    const z = this.cam.zoom;
    ellipse(ctx, cx, cy, 8 * z, 5 * z, C.uiAmber);
    ellipse(ctx, cx, cy, 9 * z, 6 * z, '#0D0F0E');
    const td = TERRAIN[m.terrain[i]], od = OVERLAY[m.overlay[i]];
    const known = this.world.fog.isSeen(x, y);
    const lines = known ? [
      `ELEV ${m.elev[i]}${m.overlay[i] === 4 ? ' RAMP' : ''}${m.cliff[i] ? ' CLIFF' : ''}`,
      `${(od.name !== 'none' ? od.name : td.name).toUpperCase()}`,
      `CONCEAL ${m.conceal[i] < 1 ? Math.round((1 - m.conceal[i]) * 100) + '%' : 'NONE'}`,
      `COVER ${m.coverTile[i] ? 'YES' : 'NO'}${m.cost[i] === Infinity ? ' · BLOCKED' : ''}`,
    ] : ['UNEXPLORED'];
    const pw = 78, ph = lines.length * 7 + 6;
    // place away from the finger: to the side facing screen centre, and above
    const W = this.app.display.W;
    let px = cx < W / 2 ? cx + 30 : cx - pw - 30;
    let py = cy - ph - 22;
    if (py < 2) py = cy + 22;
    px = Math.max(2, Math.min(W - pw - 2, px));
    panel(ctx, px, py, pw, ph, { alpha: 0.9 });
    lines.forEach((l, k) => drawText(ctx, l, px + 4, py + 4 + k * 7, { font: '3x5', color: k === 0 ? C.uiAmber : C.uiText }));
  }
  _drawDebug(ctx) {
    const w = this.world, op = w.operative;
    // elevation overlay: tint + digit per tile, ramps marked
    const cam = this.cam, m = w.map, z = cam.zoom;
    const tx0 = Math.max(0, Math.floor(cam.left / TILE)), ty0 = Math.max(0, Math.floor(cam.top / TILE));
    const tx1 = Math.min(m.w - 1, Math.ceil((cam.left + cam.viewW / z) / TILE)), ty1 = Math.min(m.h - 1, Math.ceil((cam.top + cam.viewH / z) / TILE));
    const tints = ['rgba(0,0,0,0)', 'rgba(255,200,60,0.10)', 'rgba(255,140,40,0.16)', 'rgba(255,80,40,0.22)'];
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const i = y * m.w + x;
      const sx = Math.round((x * TILE - cam.left) * z), sy = Math.round((y * TILE - cam.top) * z);
      if (m.elev[i]) { ctx.fillStyle = tints[m.elev[i]]; ctx.fillRect(sx, sy, TILE * z, TILE * z); }
      if (m.elev[i] || m.rampDir[i] >= 0) drawText(ctx, m.rampDir[i] >= 0 ? 'R' + '^>v<'[m.rampDir[i]] : String(m.elev[i]), sx + 2, sy + 2, { font: '3x5', color: m.cliff[i] ? '#FF5A3A' : '#FFE08A', shadow: '#000' });
    }
    const lines = [
      `FPS ${Time.fps.toFixed(0)}  TS ${Time.scale}  ZOOM ${this.cam.zoom}`,
      `OP ${op.x.toFixed(2)},${op.y.toFixed(2)} E${op.elev} ${op.stance}${op.trans ? '>' + op.trans.to : ''}`,
      `UNITS ${w.units.length} STRUCT ${w.structures.length} PROPS ${w.props.length}`,
      `MAP ${w.map.w}x${w.map.h} SEED ${this.app.seed}  [R] REVEAL`,
    ];
    panel(ctx, 4, this.app.display.H - 90, 190, lines.length * 7 + 6, { alpha: 0.85 });
    lines.forEach((l, k) => drawText(ctx, l, 8, this.app.display.H - 87 + k * 7, { font: '3x5', color: C.uiText }));
    // LOS ray from the mouse to the Operative
    const mouse = this.app.input.mouse;
    if (mouse.inside) {
      const t = this.worldTile(mouse.x, mouse.y);
      if (w.map.inb(t.x, t.y)) {
        const vis = canSee(w.map, t.x, t.y, op.tx, op.ty, {});
        ctx.strokeStyle = vis ? '#7CFF7A' : '#FF5A3A';
        ctx.beginPath();
        ctx.moveTo(this.renderer.sx(t.x + 0.5), this.renderer.sy(t.y + 0.5));
        ctx.lineTo(this.renderer.sx(op.x), this.renderer.sy(op.y));
        ctx.stroke();
        drawText(ctx, `E${w.map.elevAt(t.x, t.y)} ${vis ? 'SEES WREN' : 'NO LOS'}`, mouse.x + 6, mouse.y - 8, { font: '3x5', color: vis ? '#7CFF7A' : '#FF5A3A', shadow: '#000' });
      }
    }
  }
}

function tintCanvas(src) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
  return c;
}
