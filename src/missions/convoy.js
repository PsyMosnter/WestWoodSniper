// @ts-check
import { startSearch } from '../ai/fsm.js';

/**
 * NOT vehicle convoy (SPEC §9.3 `convoy`, Mission 3): vehicles in a column with 3-tile spacing
 * follow a road route with stops. Units with behaviour `mounted` ride inside a vehicle (hidden);
 * at `stop` waypoints they dismount and walk the `inspect` route, then remount.
 * On alarm the convoy rushes to the `bunker` waypoint; the VIP hides there for 2 minutes.
 */
export class NotConvoy {
  constructor(game, pathId) {
    this.game = game; this.world = game.world;
    const w = this.world;
    this.route = w.data.paths?.[pathId] || [];
    this.vehicles = w.units.filter((u) => u.behaviour?.kind === 'convoy' && u.behaviour.path === pathId).sort((a, b) => a.behaviour.slot - b.behaviour.slot);
    this.riders = w.units.filter((u) => u.behaviour?.kind === 'mounted');
    for (const r of this.riders) { r.hidden = true; r.mountedIn = r.behaviour.vehicle; }
    this.idx = 1;
    this.state = 'drive';      // drive | stop | remount | rush | bunker | halted
    this.t = 0;
    this.trail = [];
    this.vip = w.units.find((u) => u.id === 'vrask');
    this.alarmed = false;
    this.bunkerT = 0;
  }
  get lead() { return this.vehicles.find((v) => !v.dead && !v.disabled); }
  vehicleOf(r) { return this.world.units.find((u) => u.id === r.mountedIn); }
  update(dt) {
    const w = this.world;
    const lead = this.lead;
    // alarm: any convoy member fighting, or the VIP hurt / helmet gone → rush to the bunker
    if (!this.alarmed && (w.alerts.level('convoy') === 'alarm' || this.vip && (!this.vip.helmet || this.vip.state === 'combat' || this.vip.wounded) || this.vehicles.some((v) => v.state === 'combat'))) {
      this.alarmed = true;
      w.alerts.raise('convoy', 'alarm', 'convoy attacked');
      this.game.hud?.say('The convoy is running for the summit bunker!', true);
      this.rush();
    }
    // mounted riders ride along (or dismount if their vehicle is stopped for good)
    for (const r of this.riders) {
      if (r.dead) continue;
      const v = this.vehicleOf(r);
      if (r.hidden) {
        if (v && !v.dead) { r.x = r.px = v.x; r.y = r.py = v.y; }
        if (!v || v.dead) { this.killRider(r); continue; }
        if (v.disabled) this.dismount(r, v, true);
      }
    }
    if (this.state === 'bunker') {
      this.bunkerT -= dt;
      if (this.bunkerT <= 0 && this.vip && !this.vip.dead) {
        const b = this.route.find((p) => p.bunker);
        if (b) { const t = this.world.map.nearestWalkable(b.x, b.y + 1, 3); if (t) { this.vip.x = this.vip.px = t.x + 0.5; this.vip.y = this.vip.py = t.y + 0.5; } }
        this.vip.hidden = false; this.vip.invulnerable = false; this.vip.scripted = false; this.vip.mountedIn = null;
        this.vip.setState('alerted'); startSearch(this.vip, this.vip.x, this.vip.y + 3);
        this.game.hud?.say('Vrask is coming out of the bunker.', true);
        this.state = 'halted';
      }
      return;
    }
    if (this.state === 'halted') return;
    if (!lead) { this.state = 'halted'; return; }
    if (this.state === 'stop') {
      this._followers(dt, lead);
      // riders get out once their own vehicle has pulled up behind the lead (or after 4 s)
      this.stopT = (this.stopT || 0) + dt;
      for (const r of this.riders) {
        if (r.dead || !r.hidden || r.stayIn) continue;
        const v = this.vehicleOf(r);
        if (v && (v.path.length && this.stopT < 4)) continue;
        this.dismount(r, v, false);
        if (r.id === 'vrask' && this.stopWp?.inspect) { r.behaviour = { kind: 'patrol', path: this.stopWp.inspect, mode: 'loop' }; r.pathIdx = 0; }
        else if (r.behaviour.escort) r.behaviour = { kind: 'follow', leader: r.behaviour.escort, dx: r.behaviour.dx ?? -1, dy: r.behaviour.dy ?? 1 };
      }
      this.t -= dt;
      if (this.t <= 0) this.beginRemount();
      return;
    }
    if (this.state === 'remount') {
      const waiting = this.riders.filter((r) => !r.dead && !r.hidden && r.mountedIn && !r.fledOnFoot);
      for (const r of waiting) {
        const v = this.vehicleOf(r);
        if (!v || v.dead) { r.mountedIn = null; continue; }
        r.scripted = true;   // walking back to the vehicle: the FSM doesn't steer them
        if (Math.hypot(r.x - v.x, r.y - v.y) < 1.6) { r.hidden = true; r.path = []; r.scripted = false; }
        else if (!r.path.length) r.goTo(v.tx, v.ty, this.alarmed ? 'run' : 'walk');
      }
      if (!waiting.length || this.t < -45) {
        for (const r of waiting) { r.scripted = false; r.mountedIn = null; r.behaviour = { kind: 'sentry' }; r.home = { x: r.x, y: r.y, angle: r.angle }; }
        this.state = this.alarmed ? 'rush' : 'drive';
      }
      this.t -= dt;
      return;
    }
    // drive / rush: lead follows the route; followers keep 3-tile spacing on the breadcrumb trail
    const wp = this.route[this.idx];
    if (!wp) { this.idx = 0; return; }
    if (!lead.path.length) {
      if (Math.hypot(wp.x + 0.5 - lead.x, wp.y + 0.5 - lead.y) < 1.3) {
        if (this.state === 'rush' && wp.bunker) { this.enterBunker(wp); return; }
        if (wp.stop && this.state === 'drive') { this.beginStop(wp); this.idx = (this.idx + 1) % this.route.length; return; }
        this.idx = (this.idx + 1) % this.route.length;
      } else if (!lead.goTo(wp.x, wp.y, this.state === 'rush' ? 'run' : 'walk') || this._unreachable(lead, wp)) {
        // route blocked (e.g. the bridge is gone): halt and send the VIP out to look
        this.state = 'halted';
        this.game.hud?.say('The convoy is stuck — Vrask is getting out to look.', true);
        for (const v of this.vehicles) v.path = [];
        for (const r of this.riders) if (!r.dead && r.hidden) {
          this.dismount(r, this.vehicleOf(r), false);
          r.mountedIn = null; r.behaviour = { kind: 'sentry' }; r.home = { x: r.x, y: r.y, angle: r.angle };
        }
        if (this.vip && !this.vip.dead) { const b = this.route.find((p) => p.bunker); this.vip.behaviour = { kind: 'patrol', path: this.route.find((p) => p.inspect)?.inspect, mode: 'loop' }; if (!this.vip.behaviour.path) this.vip.behaviour = { kind: 'sentry' }; }
        return;
      }
    }
    for (const v of this.vehicles) { v.behaviour.kind === 'convoy' && (v.moveMode = this.state === 'rush' ? 'run' : 'walk'); }
    this._followers(dt, lead);
  }
  /** a partial path that ends far from the waypoint means the road is cut */
  _unreachable(lead, wp) {
    const last = lead.path[lead.path.length - 1];
    return !!last && Math.hypot(last.x - wp.x, last.y - wp.y) > 2.5;
  }
  /** followers keep 3-tile spacing on the lead's breadcrumb trail */
  _followers(dt, lead) {
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - lead.x, last.y - lead.y) > 0.5) { this.trail.push({ x: lead.x, y: lead.y }); if (this.trail.length > 240) this.trail.shift(); }
    let k = 0;
    for (const v of this.vehicles) {
      if (v === lead || v.dead || v.disabled || v.state === 'combat') continue;
      k++;
      const crumb = this.trail[Math.max(0, this.trail.length - 1 - Math.round((3 * k) / 0.5))];
      if (crumb && Math.hypot(crumb.x - v.x, crumb.y - v.y) > 1.2 && (!v.path.length || (v.retrail = (v.retrail || 0) - dt) <= 0)) { v.retrail = 0.6; v.goTo(Math.floor(crumb.x), Math.floor(crumb.y), lead.moveMode); }
    }
  }
  beginStop(wp) {
    this.state = 'stop';
    this.t = wp.stop;
    this.stopT = 0;
    this.stopWp = wp;
    const l = this.lead; if (l) l.path = [];
  }
  beginRemount() {
    this.state = 'remount'; this.t = 0;
    for (const r of this.riders) if (!r.dead && !r.hidden && r.mountedIn) {
      r.setState('unaware'); r.behaviour = { ...r.behaviour, kind: 'remount' };
      const v = this.vehicleOf(r);
      r.path = []; if (v) r.goTo(v.tx, v.ty, this.alarmed ? 'run' : 'walk');
    }
  }
  dismount(r, v, alerted) {
    r.hidden = false;
    const a = Math.random() * Math.PI * 2;
    const t = this.world.map.nearestWalkable((v?.x ?? r.x) + Math.cos(a) * 1.4, (v?.y ?? r.y) + Math.sin(a) * 1.4, 3);
    if (t) { r.x = r.px = t.x + 0.5; r.y = r.py = t.y + 0.5; }
    r.path = [];
    if (alerted) {
      r.mountedIn = null; r.fledOnFoot = true;
      const lk = this.world.lkp || this.game.enemies.lastSeenPos || { x: r.x, y: r.y };
      r.setState('alerted'); startSearch(r, lk.x, lk.y);
      if (r === this.vip) this.vipRunForBunker();
    } else r.behaviour = { ...r.behaviour };
  }
  vipRunForBunker() {
    const b = this.route.find((p) => p.bunker);
    if (!b || !this.vip) return;
    this.vip.behaviour = { kind: 'sentry' };
    this.vip.scripted = true;            // he runs; he doesn't stop to fight
    this.vip.setState('alerted');
    this.vip.goTo(b.x, b.y, 'run');
    this.vip.runningToBunker = b;
  }
  killRider(r) { if (!r.dead) this.game.combat.kill(r, { by: 'explosion' }); }
  rush() {
    this.state = 'rush';
    // the VIP: if out on foot and far from the Crawler, he runs for the bunker himself
    const vip = this.vip;
    if (vip && !vip.dead && !vip.hidden) {
      const v = this.vehicleOf(vip);
      if (!v || v.dead || v.disabled || Math.hypot(v.x - vip.x, v.y - vip.y) > 8) this.vipRunForBunker();
      else { this.state = 'remount'; this.t = 0; }
    }
    const bi = this.route.findIndex((p) => p.bunker);
    if (bi >= 0) this.idx = bi;
    for (const v of this.vehicles) v.path = [];
  }
  enterBunker() {
    this.state = 'bunker';
    this.bunkerT = 120;
    if (this.vip && !this.vip.dead && this.vip.hidden) { this.vip.invulnerable = true; this.game.hud?.say('Vrask made it into the bunker. Two minutes before he shows his face again.', true); }
  }
  /** called every tick for a VIP running to the bunker on foot */
  checkVipOnFoot() {
    const vip = this.vip, b = vip?.runningToBunker;
    if (!vip || vip.dead || !b) return;
    if (!vip.path.length && Math.hypot(b.x + 0.5 - vip.x, b.y + 0.5 - vip.y) >= 1.5) vip.goTo(b.x, b.y, 'run');
    if (Math.hypot(b.x + 0.5 - vip.x, b.y + 0.5 - vip.y) < 1.5) {
      vip.hidden = true; vip.invulnerable = true; vip.runningToBunker = null; vip.scripted = false;
      this.state = 'bunker'; this.bunkerT = 120;
      this.game.hud?.say('Vrask made it into the bunker. Two minutes before he shows his face again.', true);
    }
  }
}
