// @ts-check
import { BALANCE } from '../config/balance.js';
import { C } from '../config/palette.js';
import { Time } from '../core/time.js';
import { TILE } from '../core/camera.js';
import { makeCanvas, Pix } from '../render/pixel.js';
import { drawText, measureText } from '../render/font.js';
import { Button } from '../ui/widgets.js';
import { unitSprite, whiteOf } from '../render/sprites.js';
import { FogRenderer } from '../render/fogRenderer.js';
import { scopeSprite, scopeView, resolveZone } from './hitzones.js';
import { vehicleScopeSprite, vehicleSprite } from '../render/spriteData/vehicles.js';
import { swayCurve, swayAmplitude, dispersion } from './sway.js';
import { canSee } from '../world/los.js';
import { killUnit, damageUnit } from '../combat/damage.js';
import { explode } from '../combat/explosions.js';

const S = BALANCE.scope;
const Z = S.zoom;

/**
 * The scope minigame (SPEC §10): a circular 4× view at world timeScale 0.2 with sway, breath,
 * dispersion, per-view hit zones, bolt cycle and rich hit feedback.
 */
export class Scope {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.open = false;
    this.fire = new Button({ id: 'fire', icon: 'fire', label: 'FIRE', big: true, color: C.uiAmber, onPress: () => this.shoot() });
    this.breath = new Button({ id: 'breath', icon: 'lungs', label: 'BREATH', hold: true, onPress: () => { this.holding = true; }, onRelease: () => { this.holding = false; } });
    this.exit = new Button({ id: 'exit', icon: 'close', label: '', onPress: () => this.close('exit') });
    this.reloadBtn = null;
    this.fogR = new FogRenderer(game.world.map, game.world.fog);
    this.active = new Map();
    this.world.events.on('opHit', (e) => { if (this.open && e.dmg > S.autoCloseDamage) this.close('hit'); });
    this.world.events.on('opDead', () => { if (this.open) this.close('dead'); });
  }
  layout(W, H, B, safe) {
    this.W = W; this.H = H;
    this.D = Math.round(H * 0.9) & ~1;
    this.cx = Math.round(W / 2); this.cy = Math.round(H / 2);
    const m = 6;
    const FB = Math.max(B + 10, 44);
    const L = safe.l + m, R = W - safe.r - m, Bt = H - safe.b - m;
    this.fire.place(R - FB, Bt - FB, FB, FB);
    this.breath.place(L, Bt - FB, FB, FB);
    this.exit.place(R - B, safe.t + m, B, B);
    this.mask = circleMask(this.D);
    this.ring = ringArt(this.D);
    this.buf = makeCanvas(this.D, this.D);
    this.bctx = /** @type {CanvasRenderingContext2D} */ (this.buf.getContext('2d'));
  }

  // ------------------------------------------------------------------ open / close
  canScope() {
    const op = this.world.operative;
    return op.inScopeStance && !op.dead && op.rifleMag + op.rifleReserve > 0;
  }
  maxRange(target) {
    const op = this.world.operative;
    const st = op.stance === 'hunker' ? BALANCE.stances.hunker.range : BALANCE.stances.crouch.range;
    const adv = Math.max(0, Math.min(BALANCE.stances.elevRangeBonusMax, op.elev - (target ? this.world.map.elevAt(target.tx, target.ty) : 0)));
    return st + adv * BALANCE.stances.elevRangeBonus;
  }
  openOn(target) {
    const op = this.world.operative;
    if (op.rifleMag <= 0) {
      if (op.rifleReserve > 0) { this.game.combat.startReload(); this.game.hud.toast('RELOADING'); }
      else this.game.hud.toast('OUT OF AMMO', C.uiAlert);
      return false;
    }
    this.open = true;
    this.game.scopeOpen = true;
    this.target = target;
    this.anchor = { x: target.x, y: target.y };
    this.aim = { x: target.x, y: target.y - (target.aimLift ?? (target.kind === 'vehicle' ? 0.35 : 0.45)) };
    this.openT = 0;
    this.t = Math.random() * 100;
    this.holding = false;
    this.breathLeft = S.breathMax; this.gaspT = 0; this.breathCool = 0;
    this.bolt = 0; this.kick = 0;
    this.freezeT = 0;
    this.stamps = [];
    this.flashT = 0; this.crack = 0;
    this.closeT = -1;
    this.rimFlash = null;
    this.topple = new Map();
    this.sprays = [];
    this.lastAware = this.game.awareness?.state;
    Time.scale = BALANCE.sim.scopeTimeScale;
    op.facing = Math.round(((Math.atan2(target.y - op.y, target.x - op.x) + Math.PI / 2) / (Math.PI / 4)) + 8) % 8;
    this.game.audio?.play?.('scopeIn');
    this.game.hud.dim = 1;
    return true;
  }
  close(reason = '') {
    if (!this.open) return;
    this.open = false;
    this.game.scopeOpen = false;
    this.active.clear();
    this.holding = false;
    Time.scale = this.game.paused ? 0 : 1;
    this.game.hud.dim = 0;
    const op = this.world.operative;
    if (op.rifleMag <= 0) this.game.combat.startReload();
    if (reason === 'lost') this.game.hud.toast('TARGET LOST', C.uiAmber);
    this.game.audio?.play?.('scopeOut');
  }

  // ------------------------------------------------------------------ helpers
  viewCenter() {
    const sw = this.sway || { x: 0, y: 0 };
    return { x: this.aim.x + sw.x / (Z * TILE), y: this.aim.y + (sw.y - this.kick * 10) / (Z * TILE) };
  }
  distRatio() {
    const op = this.world.operative, t = this.target;
    const d = Math.hypot(t.x - op.x, t.y - op.y);
    return d / this.maxRange(t);
  }
  candidates() {
    const w = this.world, fog = w.fog;
    const v = this.viewCenter();
    const R = this.D / 2 / (Z * TILE) + 1.5;
    return w.units.filter((u) => !u.dead && !u.hidden && u.def.scope && fog.isVisible(u.tx, u.ty) && Math.abs(u.x - v.x) < R && Math.abs(u.y - v.y) < R + 1);
  }
  spriteFor(u) {
    const op = this.world.operative;
    const view = scopeView(u.angle, Math.atan2(op.y - u.y, op.x - u.x));
    return u.kind === 'vehicle' ? vehicleScopeSprite(u.type, view) : scopeSprite(u.def.scope, view);
  }

  // ------------------------------------------------------------------ fire
  shoot() {
    const w = this.world, op = w.operative, g = this.game;
    if (!this.open || this.openT < S.openTime * 0.8 || this.closeT >= 0) return;
    if (this.bolt > 0) { g.audio?.play?.('dry'); return; }
    if (op.rifleMag <= 0) { this.close('empty'); return; }
    // the impact point is where the reticle is NOW — sample it before the recoil kick is applied
    const v = this.viewCenter();
    op.rifleMag--;
    w.stats.rifleShots++;
    this.bolt = BALANCE.weapons.rifle.bolt;
    this.kick = 1;
    op.firingT = 0.2;
    op.exposure = BALANCE.weapons.rifle.exposure; op.exposureT = BALANCE.weapons.rifle.exposureTime;
    g.audio?.play?.('rifle');
    g.cam.shake(1);
    g.combat.particles.muzzle(op.x + Math.cos(Math.atan2(this.target.y - op.y, this.target.x - op.x)) * 0.5, op.y - 0.2, 6);
    // impact point: crosshair (view centre) + dispersion
    const r = dispersion(this.distRatio());
    const a = w.rng.range(0, Math.PI * 2), rr = Math.sqrt(w.rng.next()) * r;
    const ix = v.x * TILE + (Math.cos(a) * rr) / Z, iy = v.y * TILE + (Math.sin(a) * rr) / Z; // world px
    const hit = this.resolve(ix, iy);
    let excludeGroup = null;
    if (hit && hit.structure) {
      w.stats.rifleHits++;
      this.spray(ix, iy, null, 14);
      const txt = g.structures.hitPart(hit.structure, hit.zone.name);
      if (txt) this.stamp(txt, hit.zone.name === 'gunner' ? '#FFFFFF' : C.uiAmber, 1.0, hit.zone.name === 'gunner');
      else this.stamp('ARMOUR', C.uiGrey, 0.6);
      if (hit.zone.name === 'coolant' || hit.zone.name === 'barrel') this.bigFlash(txt || 'BOOM');
      if (hit.zone.name === 'gunner') this.freezeT = S.headshotFreeze;
    } else if (hit && hit.prop) {
      w.stats.rifleHits++;
      this.bigFlash(hit.prop.kind === 'gas' ? 'GAS CYLINDER' : 'BARREL');
      g.props.detonate(hit.prop);
    } else if (hit && hit.unit.kind === 'vehicle') {
      w.stats.rifleHits++;
      const txt = g.vehicles.hitZone(hit.unit, hit.zone.name);
      this.spray(ix, iy, null, 12);
      if (hit.zone.name === 'driver' || hit.zone.name === 'slit') { this.crack = 1; this.stamp('DISABLED', C.uiAmber, 1.2, true); if (hit.unit.def.open) this.spray(ix, iy, { main: '#5BD13A', shade: '#2E7A1C', hi: '#B8F27A' }, 16); }
      else if (hit.zone.name === 'jerrycan' || hit.zone.name === 'tank') this.bigFlash(txt);
      else this.stamp('ARMOUR — NO EFFECT', C.uiGrey, 0.8);
    } else if (hit) {
      w.stats.rifleHits++;
      if (hit.zone.name !== 'radio') this.spray(ix, iy, hit.unit.blood, hit.zone.name === 'head' ? 44 : 24);
      else this.spray(ix, iy, null, 10);
      excludeGroup = this.applyHit(hit.unit, hit.zone, ix / TILE, iy / TILE);
    } else {
      // miss: dust puff on terrain (spark on metal/rock)
      const tx = Math.floor(ix / TILE), ty = Math.floor(iy / TILE);
      const m = w.map;
      const hard = m.inb(tx, ty) && (m.coverObj[m.idx(tx, ty)] || m.structure[m.idx(tx, ty)] >= 0 || m.overlay[m.idx(tx, ty)] === 3 || m.cliff[m.idx(tx, ty)]);
      if (hard) g.combat.particles.sparks(ix / TILE, iy / TILE, 6, 2); else g.combat.particles.dust(ix / TILE, iy / TILE, 7);
      this.stamp('MISS', C.uiGrey, 0.6);
      // a near miss spooks the target
      const t = this.target;
      if (t && !t.dead && Math.hypot(t.x - ix / TILE, t.y - iy / TILE) < 1.5) g.enemies.alertFromHit(t, op);
    }
    w.noise(op.x, op.y, BALANCE.noise.rifle, 'rifle', op, excludeGroup ? { excludeGroup } : null);
  }
  /** highest-priority zone at world px (ix, iy) across visible units in view */
  resolve(ix, iy) {
    const mult = (this.game.settings.assistedAim ? S.assistZone : 1) * (this.world.difficulty?.zone ?? 1);
    let best = null;
    for (const u of this.candidates()) {
      const s = this.spriteFor(u);
      const left = u.x * TILE - s.ax / Z, top = u.y * TILE - s.ay / Z;
      const lx = (ix - left) * Z, ly = (iy - top) * Z;
      if (lx < -4 || ly < -4 || lx > s.w + 4 || ly > s.h + 4) continue;
      const z = resolveZone(s.zones, lx, ly, mult);
      if (!z) continue;
      if (!best || z.prio > best.zone.prio || (z.prio === best.zone.prio && u.y > best.unit.y)) best = { unit: u, zone: z };
    }
    const g = this.game;
    const sh = g.structures?.resolve(ix, iy, mult);
    if (sh && (!best || sh.zone.prio > best.zone.prio)) best = { structure: sh.structure, zone: sh.zone };
    const ph = g.props?.resolve(ix, iy);
    if (ph && (!best || ph.zone.prio >= best.zone.prio)) best = { prop: ph.prop, zone: ph.zone };
    return best;
  }
  /** Apply a zone effect (SPEC §11.1). Returns the victim's alertGroup if it died. */
  applyHit(u, zone, x, y) {
    const g = this.game, sys = g.combat, op = this.world.operative;
    const dir = Math.atan2(u.y - op.y, u.x - op.x);
    const E = BALANCE.explosions;
    switch (zone.name) {
      case 'head':
        if (u.helmet) {
          u.helmet = false;
          sys.particles.sparks(u.x, u.y - 0.9, 8, 10);
          this.stamp('HELMET OFF', C.uiAmber, 0.9);
          g.enemies.alertFromHit(u, op);
          return null;
        }
        killUnit(sys, u, { by: 'rifle', zone: 'head', dir });
        this.freezeT = S.headshotFreeze;
        this.stamp('HEADSHOT', '#FFFFFF', 1.0, true);
        g.audio?.play?.('headshot');
        return u.alertGroup;
      case 'torso': case 'body':
        if (u.wounded) { killUnit(sys, u, { by: 'rifle', zone: 'torso', dir }); this.stamp('KILL', '#FFFFFF', 0.8); return u.alertGroup; }
        u.hp = Math.floor(u.hp / 2);
        u.wounded = true; u.speedMult *= BALANCE.units.wounded.speedMult;
        u.staggerT = 0.6;
        sys.particles.blood(u.x, u.y - 0.5, u.blood, 9, dir, 0.9);
        u.tag = { text: 'WOUNDED', t: 2 };
        this.stamp('WOUNDED', C.uiAmber, 0.8);
        damageUnit(sys, u, 0, { by: 'rifle', zone: 'torso', dir });
        return null;
      case 'limb':
        u.speedMult *= BALANCE.units.limbSpeedMult;
        u.staggerT = 0.4;
        sys.particles.blood(u.x, u.y - 0.3, u.blood, 5, dir, 0.6);
        u.tag = { text: 'HIT', t: 1.5 };
        this.stamp('LIMB HIT', C.uiAmber, 0.7);
        damageUnit(sys, u, 0, { by: 'rifle', zone: 'limb', dir });
        return null;
      case 'grenadeBelt':
        this.bigFlash('BELT DETONATED');
        explode(sys, u.x, u.y, E.grenadeBelt.radius, E.grenadeBelt.damage, { source: 'player' });
        if (!u.dead) killUnit(sys, u, { by: 'explosion', zone: 'belt' });
        return u.alertGroup;
      case 'fuelTank':
        this.bigFlash('FUEL TANK');
        explode(sys, u.x, u.y, E.fuelTank.radius, E.fuelTank.damage, { source: 'player', fire: E.fuelTank.fireTime });
        g.structures?.spawnFire?.(u.x, u.y, E.fuelTank.radius, E.fuelTank.fireTime);
        if (!u.dead) killUnit(sys, u, { by: 'explosion', zone: 'tank' });
        return u.alertGroup;
      case 'rocketPod':
        this.bigFlash('ROCKET POD');
        explode(sys, u.x, u.y, E.rocketPod.radius, E.rocketPod.damage, { source: 'player' });
        if (!u.dead) killUnit(sys, u, { by: 'explosion', zone: 'pod' });
        return u.alertGroup;
      case 'radio':
        u.hasRadio = false; u.radioT = 0;
        sys.particles.sparks(u.x, u.y - 0.5, 10, 8);
        u.tag = { text: 'NO RADIO', t: 2.5 };
        this.stamp('RADIO DESTROYED', C.uiAmber, 1.0);
        g.enemies.alertFromHit(u, op);
        return null;
      default:
        return null;
    }
  }
  bigFlash(text) {
    this.flashT = 0.35;
    this.stamp(text, C.uiAmber, 0.8, true);
    this.closeT = 0.35; // auto-close to show the explosion at world scale
  }
  /** Fine 1-px blood spray drawn in scope space at the exact impact point (gore colours; sparks if blood is null). */
  spray(ixPx, iyPx, blood, n) {
    const rng = this.world.fxRng;
    const op = this.world.operative;
    const dir = Math.atan2(iyPx / TILE - op.y, ixPx / TILE - op.x);
    this.sprays = this.sprays || [];
    for (let i = 0; i < n; i++) {
      const a = dir + rng.range(-0.9, 0.9), sp = rng.range(20, 90);
      const col = blood ? (rng.chance(0.25) ? blood.hi : rng.chance(0.55) ? blood.main : blood.shade) : (rng.chance(0.5) ? '#FFF1A8' : '#FFC24A');
      this.sprays.push({ wx: ixPx, wy: iyPx, x: 0, y: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 25, t: 0, life: rng.range(0.45, 0.9), col, s: rng.chance(0.45) ? 3 : 2, edge: blood ? blood.shade : '#8A3A18' });
    }
  }
  stamp(text, color, life = 0.9, big = false) { this.stamps.push({ text, color, t: 0, life, big }); }

  // ------------------------------------------------------------------ update (real time)
  update(dt) {
    if (!this.open) return;
    const w = this.world, op = w.operative, g = this.game;
    this.openT += dt;
    this.t += dt;
    if (this.freezeT > 0) { this.freezeT -= dt; Time.scale = this.freezeT > 0 ? 0 : BALANCE.sim.scopeTimeScale; }
    // breath (SPEC §10.4)
    let breath = 'normal';
    if (this.gaspT > 0) { this.gaspT -= dt; breath = 'gasp'; }
    if (this.breathCool > 0) this.breathCool -= dt;
    if (this.holding && this.breathCool <= 0 && this.breathLeft > 0) {
      breath = 'hold';
      this.breathLeft -= dt;
      if (this.breathLeft <= 0) { this.gaspT = S.gaspTime; this.breathCool = S.breathCooldown; this.holding = false; g.audio?.play?.('gasp'); }
    } else if (!this.holding && this.breathCool <= 0) this.breathLeft = Math.min(S.breathMax, this.breathLeft + dt * 0.8);
    if (this.breathCool > 0 && this.breathCool < S.breathCooldown - S.gaspTime) this.breathLeft = Math.min(S.breathMax, this.breathLeft + dt * 0.75);
    this.breathState = breath;
    this.breath.enabled = this.breathCool <= 0;
    this.breath.active = breath === 'hold';
    this.breath.progress = this.breathLeft / S.breathMax;
    // sway
    const amp = swayAmplitude({
      stance: op.stance, distRatio: this.distRatio(), lowHp: op.hp < BALANCE.operative.lowHp, hurt: op.hurtT > 0,
      breath, assisted: !!g.settings.assistedAim, difficulty: w.difficulty?.sway ?? 1,
    });
    this.amp = amp;
    const c = swayCurve(this.t * (breath === 'gasp' ? 1.8 : 1));
    this.sway = { x: c.x * amp, y: c.y * amp };
    // bolt & kick
    if (this.bolt > 0) { this.bolt -= dt; if (this.bolt <= 0) g.audio?.play?.('bolt'); }
    this.kick = Math.max(0, this.kick - dt * 3);
    this.fire.enabled = this.bolt <= 0 && op.rifleMag > 0;
    this.fire.progress = this.bolt > 0 ? 1 - this.bolt / BALANCE.weapons.rifle.bolt : -1;
    for (const [u, t] of this.topple) this.topple.set(u, t + dt);
    if (this.sprays) {
      for (const p of this.sprays) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt; }
      this.sprays = this.sprays.filter((p) => p.t < p.life);
    }
    for (const s of this.stamps) s.t += dt;
    this.stamps = this.stamps.filter((s) => s.t < s.life);
    if (this.flashT > 0) this.flashT -= dt;
    // awareness change → rim flash
    const aw = g.awareness?.state;
    if (aw !== this.lastAware && aw !== 'hidden') this.rimFlash = { col: aw === 'detected' ? C.uiAlert : C.uiAmber, t: 0.8 };
    this.lastAware = aw;
    if (this.rimFlash && (this.rimFlash.t -= dt) <= 0) this.rimFlash = null;
    // keep the pan within ±2 tiles of the target
    const t = this.target;
    if (t && !t.dead) {
      // ease the pan anchor toward the (new) target so re-targeting never snaps the view
      const f = 1 - Math.exp(-dt * 6);
      this.anchor.x += (t.x - this.anchor.x) * f; this.anchor.y += (t.y - this.anchor.y) * f;
      if (this.retarget) {
        this.aim.x += (t.x - this.aim.x) * f; this.aim.y += (t.y - 0.45 - this.aim.y) * f;
        if (Math.hypot(t.x - this.aim.x, t.y - 0.45 - this.aim.y) < 0.1) this.retarget = false;
      }
    }
    const L = S.panLimitTiles;
    this.aim.x = Math.max(this.anchor.x - L, Math.min(this.anchor.x + L, this.aim.x));
    const lift = t?.aimLift ?? 0.5;
    this.aim.y = Math.max(this.anchor.y - L - lift, Math.min(this.anchor.y + L, this.aim.y));
    // auto-close conditions
    if (this.closeT >= 0) { this.closeT -= dt; if (this.closeT < 0) this.close('explosion'); return; }
    if (this.bolt <= 0 && op.rifleMag <= 0) { this.close('empty'); return; }
    if (t && t.dead) {
      this.deadT = (this.deadT || 0) + dt;
      if (this.deadT > 1.1) {
        const others = this.candidates().filter((u) => canSee(w.map, op.tx, op.ty, u.tx, u.ty, {}) && Math.hypot(u.x - op.x, u.y - op.y) <= this.maxRange(u));
        if (!others.length) { this.close('done'); return; }
        this.target = others.sort((a, b) => Math.hypot(a.x - this.aim.x, a.y - this.aim.y) - Math.hypot(b.x - this.aim.x, b.y - this.aim.y))[0];
        this.retarget = true;
        this.deadT = 0;
      }
    } else if (t) {
      this.deadT = 0;
      if (!canSee(w.map, op.tx, op.ty, t.tx, t.ty, {}) || !w.fog.isVisible(t.tx, t.ty) || Math.hypot(t.x - op.x, t.y - op.y) > this.maxRange(t) + 1.5) {
        this.lostT = (this.lostT || 0) + dt;
        if (this.lostT > 0.4) { this.close('lost'); return; }
      } else this.lostT = 0;
    }
    if (!op.inScopeStance) this.close('stance');
  }

  // ------------------------------------------------------------------ input
  down(p) {
    for (const b of [this.fire, this.breath, this.exit]) {
      if (b.hit(p.x, p.y)) { b.pressed = true; this.active.set(p.id, b); if (b.enabled) b.onPress?.(); return true; }
    }
    if (p.button === 2) { this.close('exit'); return true; }
    this.active.set(p.id, 'aim');
    this.game.app.input.mouse.scopeLast = { x: p.x, y: p.y };
    return true;
  }
  move(p) {
    const a = this.active.get(p.id);
    if (a === 'aim') {
      const dx = p.x - p.lastX, dy = p.y - p.lastY;
      this.nudge(dx, dy);
      return true;
    }
    if (a) { a.pressed = a.hit(p.x, p.y); return true; }
    return true;
  }
  up(p) {
    const a = this.active.get(p.id);
    this.active.delete(p.id);
    if (a && a !== 'aim') { a.pressed = false; a.onRelease?.(); }
    // desktop: a click (no drag) anywhere in the scope fires
    if (a === 'aim' && p.type === 'mouse' && Math.hypot(p.x - p.startX, p.y - p.startY) < 3 && performance.now() - p.t0 < 350) this.shoot();
    return true;
  }
  hover(x, y) {
    const last = this.hoverLast;
    this.hoverLast = { x, y };
    if (last) this.nudge(x - last.x, y - last.y);
  }
  /** move the crosshair by screen px (1:1 in scope px) */
  nudge(dx, dy) { this.aim.x += dx / (Z * TILE); this.aim.y += dy / (Z * TILE); }
  key(code, down) {
    if (code === 'ShiftLeft' || code === 'ShiftRight') { this.holding = down; return true; }
    if (!down) return false;
    if (code === 'Escape') { this.close('exit'); return true; }
    if (code === 'Space' || code === 'Enter' || code === 'KeyF') { this.shoot(); return true; }
    const step = 4;
    if (code === 'KeyA' || code === 'ArrowLeft') this.nudge(-step, 0);
    if (code === 'KeyD' || code === 'ArrowRight') this.nudge(step, 0);
    if (code === 'KeyW' || code === 'ArrowUp') this.nudge(0, -step);
    if (code === 'KeyS' || code === 'ArrowDown') this.nudge(0, step);
    return true;
  }

  // ------------------------------------------------------------------ render
  render(ctx) {
    if (!this.open) return;
    const { W, H, D, cx, cy } = this;
    const g = this.game, w = this.world, op = w.operative;
    const k = Math.min(1, this.openT / S.openTime);
    // dim world + HUD outside the scope
    ctx.fillStyle = `rgba(4,6,5,${(0.82 * k).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    // zoomed view into the buffer
    const b = this.bctx;
    const v = this.viewCenter();
    const scam = { left: v.x * TILE - D / Z / 2, top: v.y * TILE - D / Z / 2, zoom: Z, viewW: D, viewH: D };
    b.globalCompositeOperation = 'source-over';
    b.imageSmoothingEnabled = false;
    b.fillStyle = '#07090A'; b.fillRect(0, 0, D, D);
    g.renderer.terrain.draw(b, scam);
    this.fogR.draw(b, scam);          // fog under the objects: sprites are never dithered in the lens
    this._objects(b, scam);
    g.combat.particles.draw(b, scam, true);
    if (this.sprays) for (const p of this.sprays) {
      b.globalAlpha = Math.min(1, 1.6 * (1 - p.t / p.life));
      const X = Math.round((p.wx - scam.left) * Z + p.x), Y = Math.round((p.wy - scam.top) * Z + p.y);
      b.fillStyle = '#07090A'; b.fillRect(X + 1, Y + 1, p.s, p.s);   // dark edge so it reads on same-coloured ground
      b.fillStyle = p.edge; b.fillRect(X, Y, p.s, p.s);
      b.fillStyle = p.col; b.fillRect(X, Y, p.s - 1, p.s - 1);
      b.globalAlpha = 1;
    }
    // lens tint + edge vignette
    b.fillStyle = 'rgba(40,70,60,0.10)'; b.fillRect(0, 0, D, D);
    if (this.flashT > 0) { b.fillStyle = `rgba(255,241,168,${Math.min(1, this.flashT * 4).toFixed(2)})`; b.fillRect(0, 0, D, D); }
    b.globalCompositeOperation = 'destination-in';
    const r = Math.max(2, Math.round(D * (0.15 + 0.85 * k)));
    b.drawImage(this.mask, Math.round(D / 2 - r / 2), Math.round(D / 2 - r / 2), r, r);
    b.globalCompositeOperation = 'source-over';
    const X0 = cx - D / 2, Y0 = cy - D / 2;
    ctx.drawImage(this.buf, X0, Y0);
    if (k < 1) return;
    ctx.drawImage(this.ring, X0 - 6, Y0 - 6);
    this._reticle(ctx);
    if (this.crack > 0) this._crack(ctx);
    // rim flash when awareness changes
    if (this.rimFlash && (Math.floor(Time.realTime * 10) & 1)) {
      ctx.strokeStyle = this.rimFlash.col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, D / 2 + 2, 0, Math.PI * 2); ctx.stroke();
    }
    // readouts
    const t = this.target;
    const dist = t ? Math.hypot(t.x - op.x, t.y - op.y) : 0;
    drawText(ctx, `RNG ${dist.toFixed(1)}`, cx, cy + D / 2 - 26, { font: '3x5', color: C.uiText, align: 'center', shadow: '#000' });
    drawText(ctx, `MAX ${this.maxRange(t).toFixed(0)}`, cx, cy + D / 2 - 19, { font: '3x5', color: C.uiTextD, align: 'center', shadow: '#000' });
    // sway meter
    const sx = cx - D / 2 + 22, sy = cy - D / 2 + 34;
    drawText(ctx, 'SWAY', sx, sy, { font: '3x5', color: C.uiTextD, shadow: '#000' });
    const lv = Math.min(6, Math.round(this.amp / 2));
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i < lv ? (i > 3 ? C.uiAlert : i > 1 ? C.uiAmber : C.uiText) : '#26302A'; ctx.fillRect(sx + i * 4, sy + 7, 3, 3); }
    // target label
    if (t && !t.dead) {
      const view = scopeView(t.angle, Math.atan2(op.y - t.y, op.x - t.x));
      drawText(ctx, `${t.name.toUpperCase()} · ${view.toUpperCase()}`, cx, cy - D / 2 + 12, { font: '3x5', color: C.uiAmber, align: 'center', shadow: '#000' });
    }
    // buttons & ammo
    for (const bt of [this.fire, this.breath, this.exit]) { ctx.fillStyle = '#0D0F0E'; ctx.fillRect(bt.x - 2, bt.y - 2, bt.w + 4, bt.h + 4); bt.draw(ctx); }
    const ammo = `${op.rifleMag}/${BALANCE.weapons.rifle.mag} | ${op.rifleReserve}`;
    drawText(ctx, ammo, this.fire.x + this.fire.w / 2, this.fire.y - 10, { color: op.rifleMag ? C.uiText : C.uiAlert, align: 'center', shadow: '#000' });
    if (this.bolt > 0) drawText(ctx, 'BOLT', this.fire.x + this.fire.w / 2, this.fire.y - 18, { font: '3x5', color: C.uiAmber, align: 'center' });
    const bl = this.breathCool > 0 ? (this.gaspT > 0 ? 'GASP!' : 'RECOVER') : this.breathState === 'hold' ? 'HOLDING' : 'HOLD';
    drawText(ctx, bl, this.breath.x + this.breath.w / 2, this.breath.y - 10, { font: '3x5', color: this.breathCool > 0 ? C.uiAlert : C.uiText, align: 'center', shadow: '#000' });
    // stamps: top of the scope circle, clear of where the follow-up shot is aimed
    let yy = cy - D / 2 + 24;
    for (const s of this.stamps) {
      const a = 1 - s.t / s.life;
      ctx.globalAlpha = Math.min(1, a * 2);
      const j = s.big && s.t < 0.15 ? Math.round((Math.random() - 0.5) * 3) : 0;
      drawText(ctx, s.text, cx + j, yy + j, { color: s.color, align: 'center', bold: true, scale: s.big ? 2 : 1, shadow: '#000' });
      ctx.globalAlpha = 1;
      yy += s.big ? 20 : 11;
    }
    if (this.game.settings.scanlines !== false) {
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      for (let y = Y0; y < Y0 + D; y += 2) ctx.fillRect(X0, y, D, 1);
    }
  }
  _objects(b, scam) {
    const w = this.world, g = this.game, fog = w.fog, m = w.map;
    const ty0 = Math.max(0, Math.floor(scam.top / TILE) - 1), ty1 = Math.min(m.h - 1, Math.ceil((scam.top + scam.viewH / Z) / TILE) + 4);
    const tx0 = Math.floor(scam.left / TILE) - 2, tx1 = Math.ceil((scam.left + scam.viewW / Z) / TILE) + 2;
    const rows = g.renderer.terrain.treeRows;
    const units = w.units.filter((u) => !u.hidden && u.tx >= tx0 && u.tx <= tx1 && u.ty >= ty0 && u.ty <= ty1 && (fog.isVisible(u.tx, u.ty)));
    units.sort((a, c) => a.y - c.y);
    let ui = 0;
    for (let y = ty0; y <= ty1; y++) {
      for (const t of rows[y]) {
        if (t.tx < tx0 || t.tx > tx1 || fog.state(t.i) === 0) continue;
        const s = t.spr;
        b.drawImage(s.canvas, Math.round((t.px - s.ax - scam.left) * Z), Math.round((t.py - s.ay - scam.top) * Z), s.w * Z, s.h * Z);
      }
      g.structures?.drawRow?.(b, scam, y);
      g.props?.drawRow?.(b, scam, y);
      while (ui < units.length && units[ui].ty <= y) {
        const u = units[ui++];
        const X = (u.px + (u.x - u.px) * Time.alpha) * TILE, Y = (u.py + (u.y - u.py) * Time.alpha) * TILE;
        if (u.dead && u.def.scope) {
          // the close-up topples over (rotates about its feet, real time) instead of swapping sprites
          const s = this.spriteFor(u);
          if (!this.topple.has(u)) this.topple.set(u, 0);
          const k = Math.min(1, this.topple.get(u) / 0.4);
          const ang = (u.fallDir ?? 1) * k * k * Math.PI / 2;
          b.save();
          b.translate(Math.round((X - scam.left) * Z), Math.round((Y - scam.top) * Z));
          b.rotate(ang);
          b.globalAlpha = 1 - k * 0.25;
          b.drawImage(s.canvas, -s.ax, -s.ay);
          b.restore();
          b.globalAlpha = 1;
          continue;
        }
        if (u.kind === 'emplacement' || u.kind === 'turret') continue;
        if (u.kind === 'vehicle' && u.dead) {
          const vs = vehicleSprite(u.type, u.dir, 'wreck');
          b.drawImage(vs.canvas, Math.round((X - scam.left) * Z - vs.ax * Z), Math.round((Y - scam.top) * Z - vs.ay * Z), vs.w * Z, vs.h * Z);
          continue;
        }
        if (u.dead || !u.def.scope) {
          const { pose, frame } = u.pose();
          const s = unitSprite(u.type, pose, u.dir, frame);
          b.drawImage(s.canvas, Math.round((X - s.ax - scam.left) * Z), Math.round((Y - s.ay - scam.top) * Z), s.w * Z, s.h * Z);
          continue;
        }
        const s = this.spriteFor(u);
        const bob = u.moving ? Math.round(Math.sin(u.animT * 10) * 1) : 0;
        // stagger: the close-up shudders when hit
        const jit = u.staggerT > 0 ? Math.round(Math.sin(Time.realTime * 70) * 2) : 0;
        const sx = Math.round((X - scam.left) * Z - s.ax) + jit, sy = Math.round((Y - scam.top) * Z - s.ay) + bob;
        b.drawImage(u.flashT > 0 ? whiteOf(s.canvas) : s.canvas, sx, sy);
        if (u.tag) drawText(b, u.tag.text, sx + s.w / 2, sy - 8, { font: '3x5', color: u.tag.text === 'WOUNDED' ? C.uiAmber : '#FFFFFF', align: 'center', shadow: '#000' });
      }
      // the Operative is never inside his own scope view unless targets are adjacent — skip
    }
  }
  /** cracked-glass overlay (vehicle stopped) */
  _crack(ctx) {
    const { cx, cy, D } = this;
    ctx.strokeStyle = 'rgba(220,240,255,0.55)'; ctx.lineWidth = 1;
    const ox = cx + D * 0.18, oy = cy - D * 0.2;
    const rays = [[-1, -0.3], [0.6, -1], [1, 0.2], [0.2, 1], [-0.8, 0.7], [-0.3, -1]];
    ctx.beginPath();
    for (const [dx, dy] of rays) { ctx.moveTo(ox, oy); ctx.lineTo(ox + dx * D * 0.22, oy + dy * D * 0.2); ctx.lineTo(ox + dx * D * 0.3 + dy * 6, oy + dy * D * 0.28 - dx * 6); }
    ctx.stroke();
  }
  _reticle(ctx) {
    const { cx, cy, D } = this;
    const R = D / 2;
    const col = 'rgba(8,10,9,0.92)';
    ctx.fillStyle = col;
    // duplex: thick outer posts, thin centre lines
    ctx.fillRect(cx - R, cy - 1, R - 30, 3); ctx.fillRect(cx + 30, cy - 1, R - 30, 3);
    ctx.fillRect(cx - 1, cy + 30, 3, R - 30); ctx.fillRect(cx - 1, cy - R, 3, R - 30);
    ctx.fillRect(cx - 30, cy, 26, 1); ctx.fillRect(cx + 5, cy, 26, 1);
    ctx.fillRect(cx, cy - 30, 1, 26); ctx.fillRect(cx, cy + 5, 1, 26);
    // mil-dots
    for (let i = 1; i <= 4; i++) {
      const d = i * 7;
      ctx.fillRect(cx - d, cy - 1, 1, 3); ctx.fillRect(cx + d, cy - 1, 1, 3);
      ctx.fillRect(cx - 1, cy - d, 3, 1); ctx.fillRect(cx - 1, cy + d, 3, 1);
    }
    // centre point (amber when the bolt is ready)
    ctx.fillStyle = this.bolt > 0 ? 'rgba(8,10,9,0.9)' : C.uiAmber;
    ctx.fillRect(cx, cy, 1, 1);
    // breath arc under the reticle
    const k = this.breathLeft / S.breathMax;
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 0.62 + (i / (n - 1)) * Math.PI * 0.76;
      const x = Math.round(cx + Math.cos(a) * 44), y = Math.round(cy + Math.sin(a) * 44);
      ctx.fillStyle = i / n < k ? (this.breathCool > 0 ? C.uiAlert : this.breathState === 'hold' ? '#9FD8FF' : 'rgba(124,255,122,0.7)') : 'rgba(20,30,24,0.6)';
      ctx.fillRect(x, y, 2, 2);
    }
  }
}

/** Pixel-perfect circle mask (opaque inside). */
function circleMask(D) {
  const p = new Pix(D, D);
  const r = D / 2;
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) if ((x + 0.5 - r) ** 2 + (y + 0.5 - r) ** 2 <= r * r) p.data[y * D + x] = 0xff000000;
  return p.toCanvas();
}
/** Scope tube ring with bevel + inner vignette (dithered). */
function ringArt(D) {
  const S2 = D + 12;
  const p = new Pix(S2, S2);
  const c = S2 / 2, r = D / 2;
  for (let y = 0; y < S2; y++) for (let x = 0; x < S2; x++) {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
    if (d > r + 6) continue;
    if (d > r) {
      const k = d - r;
      const lit = (x - c) * -0.6 + (y - c) * -0.8 > 0;
      p.set(x, y, k < 1.5 ? (lit ? '#5A625C' : '#1A1E1C') : k < 4.5 ? '#141816' : '#0A0C0B');
    } else if (d > r - 10) {
      // inner vignette: dithered darkening near the rim
      const k = (d - (r - 10)) / 10;
      if (((x + y) & 1) === 0 && k > 0.3) p.set(x, y, `rgba(0,0,0,${(k * 0.55).toFixed(2)})`);
      if (k > 0.75) p.set(x, y, `rgba(0,0,0,${(k * 0.5).toFixed(2)})`);
    }
  }
  // lens glint
  for (let a = 0; a < 16; a++) {
    const ang = -2.35 + a * 0.035;
    p.set(c + Math.cos(ang) * (r - 14), c + Math.sin(ang) * (r - 14), 'rgba(255,255,255,0.35)');
  }
  return p.toCanvas();
}
