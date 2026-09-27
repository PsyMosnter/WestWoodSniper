// @ts-check
/**
 * Boot Camp (playtest 2) — optional ~3-minute training course before Mission 1. Lt. Idris Vale (the
 * dropship pilot) is the drill sergeant. Map & dummies: tools/mapgen/bc.js.
 *
 * Stations, one after another (each reveals the next objective and its tip):
 *   walk → run → tall grass → hunker & crawl → silent takedown → shoot a driver → C4 a vehicle → C4 a hut.
 * The dummies (`training: true`) never shoot. If one spots WREN, Vale sends him back to the last marker
 * and the dummies reset; a dummy that has done its job packs up (hidden) so it can't spoil the next lesson.
 * Tips here always show (`alwaysTips`), however often the course is replayed.
 */
import data from './data/bc.js';

const tut = (key, title, text, at) => ({ type: 'tutorial', key, title, text, at });
const say = (text, prio = true) => ({ type: 'say', text, prio });

const triggers = [
  { when: { type: 'timer', seconds: 0.8 }, do: [
    say("Morning, WREN. Today I'm your drill sergeant. Three minutes — don't embarrass me."),
    tut('bc_walk', 'Walk', 'Tap the ground to walk there. WREN crouches whenever he stops. Walk to the marker.', { area: 'mA' }),
  ] },
  { when: { type: 'objectivesDone', ids: ['b1'] }, do: [
    { type: 'revealObjective', id: 'b2' }, { type: 'custom', fn: 'checkpoint', area: 'mA' },
    tut('bc_run', 'Run', 'Double-tap the ground to run: fast, but loud — the NOISE meter (bottom left) shows how far you carry. Run to the next marker. Move it!', { area: 'mB' }),
  ] },
  { when: { type: 'objectivesDone', ids: ['b2'] }, do: [
    { type: 'revealObjective', id: 'b3' }, { type: 'custom', fn: 'checkpoint', area: 'mB' },
    say('Dummy on the far side of the field. Pretend he bites.'),
    tut('bc_grass', 'Tall grass & vision cones', "The faint outer dots are as far as he can see. The filled inner cone is how far he can spot YOU right now — it shrinks when you walk in tall grass, crouch, crawl or hunker. Walk through the grass to the marker and watch it shrink. Step out of the grass and he'll see you.", 'd1'),
  ] },
  { when: { type: 'objectivesDone', ids: ['b3'] }, do: [
    { type: 'revealObjective', id: 'b4' }, { type: 'custom', fn: 'checkpoint', area: 'mC' }, { type: 'custom', fn: 'retire', id: 'd1' },
    tut('bc_crawl', 'Hunker & crawl', 'Nothing to hide behind in that lane, and there is a dummy behind the fence. Press HUNKER to go flat, then tap the ground to low-crawl: slow, quiet, very hard to spot. Crawl to the far end. Walk it, and he has you.', { button: 'hunker' }),
  ] },
  { when: { type: 'objectivesDone', ids: ['b4'] }, do: [
    { type: 'revealObjective', id: 'b5' }, { type: 'custom', fn: 'checkpoint', area: 'mD' }, { type: 'custom', fn: 'retire', id: 'd2' },
    tut('bc_takedown', 'Silent takedown', "That one has his back to you. Stand up (HUNKER again), sneak up behind him — he can't see behind him — and when TAKEDOWN lights up, press it or tap him. No ammo, barely a sound.", 'd3'),
  ] },
  { when: { type: 'objectivesDone', ids: ['b5'] }, do: [
    { type: 'revealObjective', id: 'b6' }, { type: 'custom', fn: 'checkpoint', at: 'op' },
    say('Clean. Now the motor pool.'),
    tut('bc_driver', 'Vehicles: the driver', 'Tap the Skitter: WREN finds a firing spot and raises the scope. Drag to aim, lift your finger to fire (click with a mouse). Put one through the driver — he sits high on an open buggy. No driver, no vehicle.', 'sk'),
  ] },
  { when: { type: 'objectivesDone', ids: ['b6'] }, do: [
    { type: 'revealObjective', id: 'b7' },
    tut('bc_c4v', 'C4 on a vehicle', 'A disabled vehicle takes C4. Long-press the Skitter to plant a charge (2.5 s). Then get clear: 10-second fuse — or hit BOOM.', 'sk'),
  ] },
  { when: { type: 'objectivesDone', ids: ['b7'] }, do: [
    { type: 'revealObjective', id: 'b8' },
    say('Now THAT is how you park a buggy.'),
    tut('bc_c4b', 'C4 on a building', "Same trick on the hut at the top of the yard: long-press it, plant, walk away. Don't look back — it's cooler that way.", 'hut'),
  ] },
  { when: { type: 'objectivesDone', ids: ['b8'] }, delay: 1.5, do: [
    say("Course complete. Not bad for a retiree. The NOT won't be dummies, WREN — they shoot back. Wheels up.", true),
  ] },
  { when: { type: 'objectivesDone', ids: ['b8'] }, delay: 5, do: [{ type: 'win' }] },
];

export default {
  ...data,
  triggers,
  intel: 'GOD training range in the West Wood. Four dummies — one on a Skitter — and a hut nobody will miss. Nothing here shoots back.',
  custom: {
    init(r) {
      r.cp = { x: r.world.operative.x, y: r.world.operative.y };
      r.world.events.on('unitKilled', ({ unit, cause }) => {
        if (unit.id.startsWith('d3')) {
          if (cause.by === 'knife') r.flags.tookDown = true;
          else if (!r.flags.tookDown) r.flags.loudKill = true;
        }
      });
      r.world.events.on('vehicleDisabled', ({ vehicle }) => { if (vehicle.id === 'sk') r.flags.skDisabled = true; });
    },
    /** b2: at the second marker, having run on the way */
    ranToB(r) {
      const op = r.world.operative, a = r.data.areas.mB;
      if (op.moving && op.mode === 'run') r.flags.ran = true;
      const inB = op.x >= a.x && op.y >= a.y && op.x < a.x + a.w && op.y < a.y + a.h;
      if (inB && !r.flags.ran && !r.flags.walkNag) { r.flags.walkNag = true; r.game.hud.say('I said RUN, WREN. Double-tap. Go back and do it again.', true); }
      if (!inB) r.flags.walkNag = false;
      return inB && r.flags.ran;
    },
    tookDown(r) { return !!r.flags.tookDown; },
    skitterDisabled(r) { return !!r.flags.skDisabled; },
    /** remember where to send WREN back to if a dummy spots him */
    checkpoint(r, a) {
      const op = r.world.operative;
      if (a.area) { const q = r.data.areas[a.area]; r.cp = { x: q.x + q.w / 2, y: q.y + q.h / 2 }; } else r.cp = { x: op.x, y: op.y };
    },
    /** a dummy that has done its job packs up */
    retire(r, a) {
      const u = r.world.units.find((q) => q.id === a.id);
      if (u) { u.hidden = true; u.seesOp = false; u.det = 0; }
    },
    update(r, dt) {
      const w = r.world, op = w.operative, g = r.game;
      if (r.resetT > 0) { r.resetT -= dt; return; }
      // spotted by a dummy: back to the last marker, dummies reset
      const spotter = w.units.find((u) => u.training && !u.dead && !u.hidden && (u.state === 'combat' || u.det >= 1));
      if (spotter) {
        g.hud.say(spotter.kind === 'vehicle' ? "The buggy saw you. You're dead. Again — from behind this time." : "SPOTTED. In a real op you'd be dead. Back to the marker — again.", true, true);
        g.hud.toast('SPOTTED — RESET', '#FF5A3A', 1.6);
        r.resetT = 1;
        resetDummies(r);
        op.path = []; op.pendingMove = null; op.onArrive = null; op.busy = null; op.trans = null;
        op.x = op.px = r.cp.x; op.y = op.py = r.cp.y; op.stance = 'crouch'; op.mode = 'walk';
        g.cam.centreOn?.(op.x, op.y);
        return;
      }
      // the takedown dummy was shot instead: a fresh one steps up
      if (r.flags.loudKill) {
        r.flags.loudKill = false;
        g.hud.say('Loud. VERY loud. Knife work, WREN. Again.', true, true);
        const n = (r.d3n = (r.d3n || 0) + 1);
        const spec = data.units.find((u) => u.id === 'd3');
        g.enemies.spawn({ ...spec, id: 'd3_' + n });
        r.resetT = 1;
        resetDummies(r);
      }
    },
  },
};

/** every live dummy forgets WREN, returns to its post and blinks for a moment */
function resetDummies(r) {
  const w = r.world;
  for (const u of w.units) {
    if (!u.training || u.dead || u.hidden) continue;
    u.det = 0; u.seesOp = false; u.lastKnown = null; u.poi = null; u.search = null; u.tag = null;
    u.setState('unaware');
    u.path = [];
    u.x = u.px = u.home.x; u.y = u.py = u.home.y; u.angle = u.targetAngle = u.home.angle;
    u.blindT = 1.5;
  }
  const g = w.alerts.group('range');
  g.level = 'calm'; g.t = 0; g.twitch = 0;
  w.lkp = null;
  if (r.game.enemies) { r.game.enemies.detecting = 0; r.game.enemies.spotters = []; }
}
