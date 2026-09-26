// @ts-check
import { BALANCE } from '../config/balance.js';

const A = BALANCE.ai;
const RANK = { calm: 0, caution: 1, alarm: 2 };

/**
 * Per-alertGroup shared alert level (SPEC §8.4): Calm → Caution → Alarm, with decay,
 * "twitchiness", comms-array locality and reinforcement bookkeeping.
 */
export class AlertManager {
  constructor(world) {
    this.world = world;
    /** @type {Map<string, any>} */
    this.groups = new Map();
    for (const [id, g] of Object.entries(world.data.alertGroups || {})) this._make(id, g);
    this.anyAlarm = false;
  }
  _make(id, cfg = {}) {
    const g = { id, level: 'calm', t: 0, twitch: 0, detectedT: 0, sinceDetect: 0, cfg, reinforced: 0, reinforceT: 0, commsDown: false, alarmCount: 0 };
    this.groups.set(id, g);
    return g;
  }
  group(id) { return this.groups.get(id || 'default') || this._make(id || 'default'); }
  level(id) { return this.group(id).level; }
  /**
   * Raise a group's level (never lowers). Returns true if it changed.
   * @param {{x:number,y:number}} [origin] the unit raising it (for comms-down locality)
   */
  raise(id, level, reason = '', origin = null) {
    const g = this.group(id);
    g.t = 0;
    if (RANK[level] <= RANK[g.level]) {
      if (level === 'alarm') g.sinceDetect = 0;
      return false;
    }
    if (level === 'caution' && g.level === 'calm') g.twitch = Math.min(A.twitchMax, g.twitch + A.twitchPerCaution);
    g.level = level;
    if (level === 'alarm') { g.sinceDetect = 0; g.alarmCount++; this.anyAlarm = true; g.local = g.commsDown && origin ? { x: origin.x, y: origin.y, r: A.commsLocalRadius } : null; }
    this.world.events.emit('alert', { group: id, level, reason, local: g.local || null });
    return true;
  }
  /** Map-wide alarm (strategic strike, scripted). */
  raiseAll(level, reason = '') { for (const id of this.groups.keys()) this.raise(id, level, reason); }
  maxLevel() {
    let r = 0; for (const g of this.groups.values()) r = Math.max(r, RANK[g.level]);
    return ['calm', 'caution', 'alarm'][r];
  }
  update(dt) {
    const decay = this.world.difficulty?.alarmDecay ?? A.alarmDecay;
    for (const g of this.groups.values()) {
      g.t += dt;
      if (g.level === 'alarm') {
        g.sinceDetect += dt;
        if (g.sinceDetect >= decay) { g.level = 'caution'; g.t = 0; this.world.events.emit('alert', { group: g.id, level: 'caution', reason: 'decay' }); }
      } else if (g.level === 'caution' && g.t >= A.cautionDecay) {
        g.level = 'calm';
        this.world.events.emit('alert', { group: g.id, level: 'calm', reason: 'decay' });
      }
    }
  }
  /** Called while a member of the group has WREN Detected (keeps Alarm alive, counts toward auto-Alarm). */
  noteDetected(id, dt) {
    const g = this.group(id);
    g.sinceDetect = 0; g.t = 0;
    // auto-Alarm only when WREN stays Detected for 3 s *inside the base footprint* (SPEC §8.4)
    const area = g.cfg?.area ? this.world.data.areas?.[g.cfg.area] : null;
    const op = this.world.operative;
    const inside = area && op.x >= area.x && op.y >= area.y && op.x < area.x + area.w && op.y < area.y + area.h;
    if (!inside) { g.detectedT = 0; return; }
    g.detectedT += dt;
    if (g.detectedT >= BALANCE.detection.alarmDetectedTime && g.level !== 'alarm') this.raise(id, 'alarm', 'detected', op);
  }
  /** Does this group have reinforcements to call? */
  /** Will this group's Alarm actually bring reinforcements? (barracks standing, comms up, cap not reached) */
  hasBarracks(id) {
    const g = this.group(id), cfg = g.cfg || {};
    if (!cfg.barracks || !((cfg.reinforceCap ?? 0) > g.reinforced) || g.commsDown || g.local) return false;
    const b = this.world.structures?.find((s) => s.id === cfg.barracks);
    return !!b && !b.dead;
  }
  clearDetected(id) { this.group(id).detectedT = 0; }
}
