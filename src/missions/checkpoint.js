// @ts-check
/**
 * Mid-mission checkpoints (SPEC §20 M9; Missions 6 & 7): a compact snapshot of the mission state
 * taken at a scripted moment, restored on "RETRY FROM CHECKPOINT" onto a freshly loaded mission.
 * Kept in memory for the session (a checkpoint is for the current attempt, not the save file).
 */

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const clone = (v) => JSON.parse(JSON.stringify(v ?? null));

export function snapshot(game) {
  const w = game.world, op = w.operative;
  return {
    time: w.time,
    stats: clone(w.stats),
    op: pick(op, ['x', 'y', 'hp', 'rifleMag', 'rifleReserve', 'c4', 'medkits', 'designator', 'smoke', 'facing']),
    units: w.units.filter((u) => u.kind !== 'emplacement' && u.kind !== 'turret' && u.kind !== 'structure').map((u) => ({
      id: u.id, type: u.type, x: u.x, y: u.y, hp: u.hp, dead: !!u.dead, hidden: !!u.hidden, helmet: u.helmet,
      alertGroup: u.alertGroup, behaviour: clone(u.behaviour), disabled: !!u.disabled, angle: u.angle, home: clone(u.home),
    })),
    gunners: w.units.filter((u) => u.kind === 'emplacement' || u.kind === 'turret').map((u) => ({ id: u.id, dead: !!u.dead })),
    structures: w.structures.map((s) => ({ id: s.id, dead: !!s.dead, hp: s.hp, st: clone(s.st), hardened: !!s.hardened })),
    friendlies: w.friendlies.map((f) => pick(f, ['id', 'x', 'y', 'hp', 'dead', 'captive', 'mode', 'downed'])),
    props: (w.props || []).map((p) => ({ dead: !!p.dead })),
    corpses: w.corpses.filter((c) => c.unit).map((c) => ({ id: c.unit.id, discovered: c.discovered, byPlayer: c.byPlayer })),
    objectives: game.objectives.items.map((o) => pick(o, ['id', 'done', 'failed', 'hidden', 'progress', 'elapsed'])),
    flags: clone(game.runner.flags),
    fired: game.runner.triggers.map((t) => t.fired),
    alerts: [...w.alerts.groups.values()].map((g) => pick(g, ['id', 'level', 't', 'reinforced', 'commsDown', 'alarmCount'])),
    seen: Array.from(w.fog.seen),
    craters: clone(game.strike?.craters || []),
    fallout: clone(game.strike?.fallout || []),
    scene: clone(pick(game, ['countdown', 'intelMarked'])),
  };
}

/** Destroy a structure without explosions, radio lines or particles (it was destroyed before the checkpoint). */
function quietDestroy(game, s) {
  const w = game.world;
  s.dead = true; s.hp = 0; s.seen = true; s.seenDead = true;
  w.map.clearStructure(s.x, s.y, s.w, s.h, true);
  if (s.gunner) s.gunner.dead = true;
  if (s.type === 'commsArray') w.alerts.group(s.alertGroup).commsDown = true;
  if (s.type === 'powerPlant') w.events.emit('powerLost', { group: s.alertGroup, quiet: true });
}

export function restore(game, snap) {
  const w = game.world, op = w.operative;
  w.time = snap.time;
  Object.assign(w.stats, snap.stats);
  Object.assign(op, snap.op);
  op.px = op.x; op.py = op.y; op.path = []; op.stance = 'crouch';
  // structures first (map passability), then units
  for (const ss of snap.structures) {
    const s = w.structures.find((q) => q.id === ss.id);
    if (!s) continue;
    Object.assign(s.st, ss.st || {});
    s.hardened = ss.hardened;
    if (ss.dead && !s.dead) quietDestroy(game, s); else s.hp = ss.hp;
  }
  for (const gg of snap.gunners) { const u = w.units.find((q) => q.id === gg.id); if (u && gg.dead) u.dead = true; }
  const known = new Set(snap.units.map((u) => u.id));
  for (const u of w.units) if (u.kind !== 'emplacement' && u.kind !== 'turret' && !known.has(u.id)) { u.dead = true; u.hidden = true; }
  for (const su of snap.units) {
    let u = w.units.find((q) => q.id === su.id);
    if (!u && !su.dead) u = game.enemies.spawn({ id: su.id, type: su.type, x: Math.floor(su.x), y: Math.floor(su.y), alertGroup: su.alertGroup, behaviour: su.behaviour || { kind: 'sentry' } });
    if (!u) continue;
    u.x = u.px = su.x; u.y = u.py = su.y; u.hp = su.hp; u.hidden = su.hidden; u.angle = u.targetAngle = su.angle ?? u.angle;
    if (su.helmet !== undefined) u.helmet = su.helmet;
    if (su.behaviour) u.behaviour = su.behaviour;
    if (su.home) u.home = su.home;
    u.path = [];
    u.setState?.('unaware');
    if (su.disabled && !u.disabled) game.vehicles?.disable(u, 'driver');
    if (su.dead) { u.dead = true; u.deathT = 99; u.flashT = 0; u.tag = null; }
  }
  for (const c of snap.corpses) {
    const u = w.units.find((q) => q.id === c.id);
    if (u && u.dead && !u.hidden) w.corpses.push({ x: u.x, y: u.y, unit: u, discovered: c.discovered, t: w.time, byPlayer: c.byPlayer });
  }
  for (const sf of snap.friendlies) {
    const f = w.friendlies.find((q) => q.id === sf.id);
    if (!f) continue;
    Object.assign(f, sf);
    f.px = f.x; f.py = f.y; f.path = [];
    if (!f.captive) { f.vision = f.vision || 6; f.hiding = false; }
  }
  (w.props || []).forEach((p, i) => { if (snap.props[i]?.dead) p.dead = true; });
  for (const so of snap.objectives) { const o = game.objectives.get(so.id); if (o) Object.assign(o, so); }
  Object.assign(game.runner.flags, snap.flags || {});
  game.runner.triggers.forEach((t, i) => { t.fired = !!snap.fired[i]; });
  for (const sg of snap.alerts) Object.assign(w.alerts.group(sg.id), sg);
  w.fog.seen.set(snap.seen);
  for (const c of snap.craters || []) game.strike?.crater(c.x, c.y);
  if (game.strike) game.strike.fallout = snap.fallout || [];
  Object.assign(game, snap.scene || {});
  w.lkp = null;
  game.cam?.centreOn?.(op.x, op.y);
}
