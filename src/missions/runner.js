// @ts-check
import { BALANCE } from '../config/balance.js';
import { C } from '../config/palette.js';

/**
 * Mission runner (SPEC §16.1, §19.3): triggers (conditions → actions), tutorial prompts,
 * extraction dropship, win/lose, stars & medals bookkeeping.
 */
export class MissionRunner {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.data = game.world.data;
    this.custom = game.missionModule?.custom || {};
    this.triggers = (this.data.triggers || []).map((t, i) => ({ ...t, id: t.id || 't' + i, fired: false, timer: 0 }));
    this.flags = {};
    this.tutorial = null;          // active prompt {key, title, text, t}
    this.tutQueue = [];            // prompts waiting for the current one to go
    this.tutorialSeen = new Set(game.app.save.tutorialSeen || []);
    this.extract = { state: 'idle', t: 0, ship: null };
    this.ended = false;
    this.observedAreas = new Set();
    const w = this.world;
    w.events.on('unitKilled', (e) => this._onKill(e));
    w.events.on('structureDestroyed', (e) => { this.flags['destroyed:' + e.structure.id] = true; });
    w.events.on('pickup', (e) => { this.flags['pickup:' + e.type] = true; });
    w.events.on('objectiveDone', (o) => { if (o.area) this.observedAreas.add(o.area); });
    w.events.on('alert', (e) => { if (e.level === 'alarm') this.flags.alarm = true; });
    this.custom.init?.(this);
  }
  _onKill({ unit, cause }) {
    const s = this.world.stats;
    if (!unit.killedByPlayer && unit.kind !== 'emplacement') { this.flags['dead:' + unit.id] = true; return; }
    this.flags['dead:' + unit.id] = true;
    // "Pacifist-ish": only mission targets and units that had detected WREN
    const target = unit.important || this.game.objectives.list().some((o) => o.type === 'KILL' && o.unit === unit.id);
    if (!target && !(unit.state === 'combat' || unit.det >= 1 || unit.hadDetected)) s.unneededKills = (s.unneededKills || 0) + 1;
    if (cause.by === 'rifle') { if (cause.zone === 'head') s.rifleHeadshots = (s.rifleHeadshots || 0) + 1; }
  }

  // ---------------------------------------------------------------- triggers
  cond(c) {
    const w = this.world, op = w.operative, areas = this.data.areas || {};
    switch (c.type) {
      case 'enterArea': { const a = areas[c.area]; return !!a && op.x >= a.x && op.y >= a.y && op.x < a.x + a.w && op.y < a.y + a.h; }
      case 'unitDead': return (c.ids || [c.id]).every((id) => this.flags['dead:' + id]);
      case 'structureDestroyed': return (c.ids || [c.id]).every((id) => this.flags['destroyed:' + id]);
      case 'objectivesDone': return c.ids.every((id) => this.game.objectives.get(id)?.done);
      case 'alertLevel': { const g = w.alerts.group(c.group); return c.level === 'alarm' ? g.level === 'alarm' : g.level !== 'calm'; }
      case 'timer': return w.time >= c.seconds;
      case 'observed': return this.observedAreas.has(c.area);
      case 'pickup': return !!this.flags['pickup:' + c.pickup];
      case 'detected': return this.game.awareness?.state === 'detected';
      case 'scopeOpen': return !!this.game.scopeOpen;
      case 'flag': return !!this.flags[c.flag];
      case 'custom': return !!this.custom[c.fn]?.(this, c);
      case 'and': return c.all.every((x) => this.cond(x));
      default: return false;
    }
  }
  act(a) {
    const g = this.game, w = this.world, hud = g.hud;
    switch (a.type) {
      case 'say': hud.say(a.text, !!a.prio); break;
      case 'tutorial': this.showTutorial(a.key, a.title, a.text); break;
      case 'setObjective': { const o = g.objectives.get(a.id); if (o) Object.assign(o, a.set || {}); break; }
      case 'revealObjective': g.objectives.reveal(a.id); break;
      case 'completeObjective': g.objectives.complete(a.id); break;
      case 'spawn': for (const u of a.units || [a.unit]) (g.vehicles && u.vehicle ? g.vehicles : g.enemies).spawn(u); break;
      case 'setBehaviour': { const u = w.units.find((x) => x.id === a.id); if (u) { u.behaviour = a.behaviour; u.setState?.('unaware'); } break; }
      case 'reveal': w.fog.reveal(a.x, a.y, a.r || 6, a.t || 10); break;
      case 'grant': { const op = w.operative; for (const [k, v] of Object.entries(a.items || {})) { if (k === 'rifle') op.rifleReserve += v; else op[k] = (op[k] || 0) + v; } break; }
      case 'setAlert': w.alerts.raise(a.group, a.level, 'script'); break;
      case 'cameraPan': g.cam.panTo(a.x, a.y, a.dur || 1.2); break;
      case 'flag': this.flags[a.flag] = true; break;
      case 'win': this.win(); break;
      case 'lose': this.lose(a.reason || 'Mission failed.'); break;
      case 'custom': this.custom[a.fn]?.(this, a); break;
      default: break;
    }
  }
  update(dt) {
    if (this.ended) return;
    for (const t of this.triggers) {
      if (t.fired && t.once !== false) continue;
      if (t.cooldown && t.cd > 0) { t.cd -= dt; continue; }
      if (!this.cond(t.when)) continue;
      if (t.delay) { t.timer += dt; if (t.timer < t.delay) continue; }
      t.fired = true; t.cd = t.cooldown || 0;
      for (const a of t.do) this.act(a);
    }
    this.custom.update?.(this, dt);
    const tut = this.tutorial;
    if (tut && !this.game.scopeOpen) {
      tut.t += dt;
      if (tut.t >= 3) this._markSeen(tut.key);           // only counts as seen once it was up long enough to read
      if (tut.t >= 18) this.dismissTutorial();
    }
    if (!this.tutorial && this.tutQueue.length && !this.game.scopeOpen) { this.tutorial = this.tutQueue.shift(); this.game.audio?.play?.('squelch'); }
    this._extraction(dt);
    // STEALTH objective completes at the end if no alarm (checked in win); fails on alarm (game scene)
  }

  // ---------------------------------------------------------------- tutorial prompts
  showTutorial(key, title, text) {
    if (this.tutorialSeen.has(key) || this.game.settings.tutorials === false) return;
    if (this.tutorial?.key === key || this.tutQueue.some((q) => q.key === key)) return;
    const t = { key, title, text, t: 0 };
    if (this.tutorial) { this.tutQueue.push(t); return; }
    this.tutorial = t;
    this.game.audio?.play?.('squelch');
  }
  _markSeen(key) {
    if (this.tutorialSeen.has(key)) return;
    this.tutorialSeen.add(key);
    if (this.game.debugRun) return;
    this.game.app.save.tutorialSeen = [...this.tutorialSeen];
    this.game.app.persist?.();
  }
  dismissTutorial() {
    const t = this.tutorial;
    if (t && t.t >= 1) this._markSeen(t.key);
    this.tutorial = null;
    const next = this.tutQueue.shift();
    if (next) { this.tutorial = next; this.game.audio?.play?.('squelch'); }
  }

  // ---------------------------------------------------------------- extraction (SPEC §15.4)
  extractObjective() { return this.game.objectives.list().find((o) => o.type === 'EXTRACT' && !o.hidden && !o.done); }
  inLZ(x, y) {
    const o = this.extractObjective();
    const a = o && this.data.areas?.[o.area];
    return !!a && x >= a.x && y >= a.y && x < a.x + a.w && y < a.y + a.h;
  }
  _extraction(dt) {
    const w = this.world, op = w.operative, ex = this.extract, X = BALANCE.extraction;
    const obj = this.extractObjective();
    if (!obj || op.dead) return;
    const a = this.data.areas[obj.area];
    const lzx = a.x + a.w / 2, lzy = a.y + a.h / 2;
    const escorts = this.game.escortsForExtraction?.() || [];
    const escortsIn = escorts.every((f) => this.inLZ(f.x, f.y));
    const here = this.inLZ(op.x, op.y) && escortsIn;
    const hot = () => w.units.some((u) => !u.dead && !u.hidden && u.kind !== 'structure' && Math.hypot(u.x - lzx, u.y - lzy) <= X.clearRadius && (u.state === 'combat' || u.state === 'alerted' || w.fog.isVisible(u.tx, u.ty)));
    const smoked = () => !!this.game.smokeActiveNear?.(lzx, lzy);
    // keep the dropship over the map: approach from the map interior, orbit clamped inside
    const inside = (x, y, m = 8) => ({ x: Math.max(m, Math.min(w.map.w - m, x)), y: Math.max(m, Math.min(w.map.h - m, y)) });
    switch (ex.state) {
      case 'idle': {
        ex.t = here ? ex.t + dt : 0;
        obj.progress = Math.min(1, ex.t / X.callTime) * 0.15;
        if (ex.t >= X.callTime) {
          const dx = w.map.w / 2 - lzx, dy = w.map.h / 2 - lzy, d = Math.hypot(dx, dy) || 1;
          const s = inside(lzx + (dx / d) * 26, lzy + (dy / d) * 26, 4);
          ex.state = 'inbound'; ex.t = X.arrive; ex.from = s;
          ex.ship = { x: s.x, y: s.y, alt: 60 };
          this.game.hud.say('Dropship inbound. Hold the LZ.', true, true);
        }
        break;
      }
      case 'inbound': {
        ex.t -= dt;
        const k = 1 - Math.max(0, ex.t) / X.arrive, e = k * k * (3 - 2 * k);
        ex.ship.x = ex.from.x + (lzx - ex.from.x) * e; ex.ship.y = ex.from.y + (lzy - ex.from.y) * e; ex.ship.alt = 60 - 28 * e;
        obj.progress = 0.15 + 0.45 * k;
        if (ex.t <= 0) {
          if (hot() && !smoked()) { ex.state = 'circling'; ex.t = 0; ex.cfrom = { x: ex.ship.x, y: ex.ship.y }; this.game.hud.say('LZ is hot! Clear it or pop smoke — we\'re circling.', true, true); }
          else { ex.state = 'landing'; this.game.hud.say('Touching down. Get aboard!', true, true); }
        }
        break;
      }
      case 'circling': {
        ex.t += dt;
        const c = inside(lzx, lzy, 10);
        const ox = c.x + Math.cos(ex.t * 0.7 - Math.PI / 2) * 8, oy = c.y + Math.sin(ex.t * 0.7 - Math.PI / 2) * 5;
        const b = Math.min(1, ex.t / 3), e = b * b * (3 - 2 * b), f = ex.cfrom || { x: ox, y: oy };
        ex.ship.x = f.x + (ox - f.x) * e; ex.ship.y = f.y + (oy - f.y) * e; ex.ship.alt = 34;
        if (!hot() || smoked()) { ex.state = 'landing'; this.game.hud.say(smoked() ? 'Smoke seen. Coming in through it.' : 'LZ clear. Coming in.', true, true); }
        break;
      }
      case 'landing':
        ex.ship.x += (lzx - ex.ship.x) * Math.min(1, dt * 2); ex.ship.y += (lzy - ex.ship.y) * Math.min(1, dt * 2);
        ex.ship.alt = Math.max(0, ex.ship.alt - dt * 22);
        if (Math.random() < dt * 25) this.game.combat.particles.dust(lzx + (Math.random() - 0.5) * 5, lzy + (Math.random() - 0.5) * 3, 3, '#B8A878');
        obj.progress = 0.6 + 0.2 * (1 - ex.ship.alt / 34);
        if (ex.ship.alt <= 0) { ex.state = 'landed'; ex.t = X.land; this.game.hud.say('On the ground — five seconds. Move!', true, true); }
        break;
      case 'landed':
        ex.t -= dt;
        obj.progress = 0.8;
        if (this.inLZ(op.x, op.y) && escortsIn) {
          ex.state = 'boarding';
          op.orderMove(Math.floor(ex.ship.x), Math.floor(ex.ship.y), 'run');
          for (const f of escorts) f.goTo?.(Math.floor(ex.ship.x), Math.floor(ex.ship.y));
        } else if (ex.t <= 0) ex.t = 0; // keep waiting on the ground for WREN
        break;
      case 'boarding':
        obj.progress = 0.9;
        if (Math.hypot(op.x - ex.ship.x, op.y - ex.ship.y) < 1.6 || !op.moving) {
          ex.state = 'liftoff'; ex.t = 2.2;
          op.hidden = true; for (const f of escorts) f.hidden = true;
          this.game.hud.say('WREN aboard. Lifting off.', true, true);
        }
        break;
      case 'liftoff':
        ex.t -= dt; ex.ship.alt += dt * 26; ex.ship.y -= dt * 3;
        if (ex.t <= 0) { ex.state = 'boarded'; this.game.objectives.complete(obj.id); this.win(); }
        break;
      default: break;
    }
  }
  /** world-space UI for the LZ (visible through fog once the EXTRACT objective is active) */
  drawLZ(ctx, r) {
    const obj = this.extractObjective();
    if (!obj) return;
    const a = this.data.areas[obj.area];
    const z = r.cam.zoom;
    const x0 = Math.round(r.sx(a.x)), y0 = Math.round(r.sy(a.y)), x1 = Math.round(r.sx(a.x + a.w)), y1 = Math.round(r.sy(a.y + a.h));
    const blink = Math.floor(performance.now() / 300) & 1;
    ctx.fillStyle = blink ? '#7CFF7A' : '#FFB23A';
    for (let x = x0; x < x1; x += 4 * z) { ctx.fillRect(x, y0, 2 * z, z); ctx.fillRect(x, y1 - z, 2 * z, z); }
    for (let y = y0; y < y1; y += 4 * z) { ctx.fillRect(x0, y, z, 2 * z); ctx.fillRect(x1 - z, y, z, 2 * z); }
    // green marker smoke: a column of puffs rising and drifting from the pad (visible through fog)
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, T = performance.now() / 1000;
    for (let i = 0; i < 9; i++) {
      const k = ((T * 0.35 + i / 9) % 1), rise = k * 46 * z / 2;
      const px = Math.round(cx + Math.sin(T * 1.3 + i * 1.7) * 3 * k * z + k * 10 * z), py = Math.round(cy - rise);
      const s = Math.max(2, Math.round((2 + k * 5) * z / 2));
      ctx.globalAlpha = 0.85 * (1 - k);
      ctx.fillStyle = k < 0.25 ? '#C8FFB0' : '#7CE06A';
      ctx.fillRect(px - s, py - s, 2 * s, 2 * s);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(7,9,10,0.8)'; ctx.fillRect(Math.round((x0 + x1) / 2) - 8, y0 - 10, 16, 8);
    r._lzLabel = { x: (x0 + x1) / 2, y: y0 - 9 };
  }

  // ---------------------------------------------------------------- end
  win() {
    if (this.ended) return;
    this.ended = true;
    const g = this.game;
    for (const o of g.objectives.list()) if (o.type === 'STEALTH' && !o.failed) g.objectives.complete(o.id);
    g.hud.say('Mission accomplished. Come home.', true);
    this.world.events.emit('missionWon');
    g.endMission(true);
  }
  lose(reason) {
    if (this.ended) return;
    this.ended = true;
    this.game.hud.say(reason, true);
    this.game.endMission(false, reason);
  }
  /** Stars & medals (SPEC §16.2) */
  results(won) {
    const s = this.world.stats, objs = this.game.objectives.list();
    const stars = won ? 1 + (s.alarms === 0 ? 1 : 0) + (s.time <= (this.data.par || 900) ? 1 : 0) : 0;
    const medals = [];
    if (won) {
      if (s.rifleKills > 0 && (s.rifleHeadshots || 0) >= s.rifleKills) medals.push('Surgeon');
      if (s.timesDetected === 0) medals.push('Phantom');
      if (!(s.unneededKills > 0)) medals.push('Pacifist-ish');
      const sec = objs.filter((o) => !o.primary && o.type !== 'STEALTH');
      if (sec.length && sec.every((o) => o.done)) medals.push('Demolitions');
    }
    return { stars, medals };
  }
}
