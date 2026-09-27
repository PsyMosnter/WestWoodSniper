// @ts-check
/**
 * Boot Camp (playtest 2) — optional ~3-minute training course before Mission 1. Lt. Idris Vale (the
 * dropship pilot) is the drill sergeant. Map & dummies: tools/mapgen/bc.js.
 *
 * Stations, one after another (each reveals the next objective and its tip):
 *   walk → run → tall grass → hunker & crawl → silent takedown → shoot a driver → C4 a vehicle → C4 a hut.
 * A station's tip opens a beat after its objective completes (TIP_DELAY), so the payoff — the takedown,
 * the explosion, the OBJECTIVE COMPLETE toast — plays out before the game pauses for the next lesson.
 * The dummies (`training: true`) never shoot. If one spots WREN, or his own C4 would kill him, Vale sends
 * him back to the last marker; a dummy that has done its job packs up (retired: hidden, deaf). A takedown
 * dummy that gets shot, or a Skitter blown up before its driver was shot, is replaced by a fresh one.
 * Tips here always show (`alwaysTips`), however often the course is replayed.
 */
import data from './data/bc.js';
import { BALANCE } from '../config/balance.js';

const TIP_DELAY = 1.8;
const tut = (key, title, text, at) => ({ type: 'tutorial', key, title, text, at });
const say = (text, prio = true) => ({ type: 'say', text, prio });
const custom = (fn, extra = {}) => ({ type: 'custom', fn, ...extra });
/** a station: `done` completes → at once `now` (bookkeeping), a beat later `then` (next objective, lines, tip) */
const station = (done, now, then) => [
  { when: { type: 'objectivesDone', ids: [done] }, do: now },
  { when: { type: 'objectivesDone', ids: [done] }, delay: TIP_DELAY, do: then },
];

const triggers = [
  { when: { type: 'timer', seconds: 0.8 }, do: [
    say("Morning, WREN. Today I'm your drill sergeant. Three minutes — don't embarrass me."),
    tut('bc_walk', 'Walk', 'Tap the ground to walk there. WREN crouches whenever he stops. Walk to the marker.', { area: 'mA' }),
  ] },
  ...station('b1', [custom('checkpoint', { area: 'mA' })], [
    { type: 'revealObjective', id: 'b2' },
    tut('bc_run', 'Run', 'Double-tap the ground to run: fast, but loud — the NOISE meter (bottom left) shows how far you carry. Run to the next marker. Move it!', { area: 'mB' }),
  ]),
  ...station('b2', [custom('checkpoint', { area: 'mB' })], [
    { type: 'revealObjective', id: 'b3' },
    say('Dummy on the far side of the field. Pretend he bites.'),
    tut('bc_grass', 'Tall grass & vision cones', "The faint outer dots are as far as he can see. The filled inner cone is how far he can spot YOU right now — it shrinks when you walk in tall grass, crouch, crawl or hunker. Walk through the grass to the marker and watch it shrink. Step out of the grass and he'll see you.", 'd1'),
  ]),
  ...station('b3', [custom('checkpoint', { area: 'mC' }), custom('retire', { id: 'd1' })], [
    { type: 'revealObjective', id: 'b4' },
    tut('bc_crawl', 'Hunker & crawl', 'Nothing to hide behind in that lane, and the dummy on the platform watches it through the fence. Press HUNKER to go flat, then tap the ground to low-crawl: slow, quiet, very hard to spot. Crawl to the far end. Walk it, and he has you.', 'd2'),
  ]),
  ...station('b4', [custom('checkpoint', { area: 'mD' }), custom('retire', { id: 'd2' })], [
    { type: 'revealObjective', id: 'b5' },
    tut('bc_takedown', 'Silent takedown', "That one has his back to you. Stand up (HUNKER again), sneak up behind him — he can't see behind him — and when TAKEDOWN lights up, press it or tap him. No ammo, barely a sound.", 'd3'),
  ]),
  ...station('b5', [custom('checkpoint', { at: 'op' })], [
    { type: 'revealObjective', id: 'b6' },
    say('Clean. Now the motor pool.'),
    tut('bc_driver', 'Vehicles: the driver', 'Tap the Skitter: WREN finds a firing spot and raises the scope. Drag to aim, lift your finger to fire (click with a mouse). Put one through the driver — he sits high on an open buggy. No driver, no vehicle.', 'sk'),
  ]),
  ...station('b6', [], [
    { type: 'revealObjective', id: 'b7' },
    tut('bc_c4v', 'C4 on a vehicle', 'A disabled vehicle takes C4. Long-press the Skitter to plant a charge (2.5 s). Then get clear — at least three tiles: 10-second fuse, or hit BOOM.', 'sk'),
  ]),
  ...station('b7', [], [
    { type: 'revealObjective', id: 'b8' },
    say('Now THAT is how you park a buggy.'),
    tut('bc_c4b', 'C4 on a building', "Same trick on the hut at the top of the yard: long-press it, plant, walk away. Don't look back — it's cooler that way.", 'hut'),
  ]),
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
      r.world.stats.resets = 0;
      r.world.events.on('unitKilled', ({ unit, cause }) => {
        if (unit.id.startsWith('d3')) {
          if (cause.by === 'knife') r.flags.tookDown = true;
          else if (!r.flags.tookDown) r.flags.loudKill = true;
        }
        // blown up (jerrycan, fuel tank…) before its driver was shot: that lesson needs a fresh buggy
        if (unit.id === skitterId(r) && !r.flags.skDisabled) r.flags.skBlown = true;
      });
      r.world.events.on('vehicleDisabled', ({ vehicle }) => { if (vehicle.id === skitterId(r)) r.flags.skDisabled = true; });
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
    /** b5: the knife, and only once WREN has finished the move */
    tookDown(r) { return !!r.flags.tookDown && !r.world.operative.busy; },
    skitterDisabled(r) { return !!r.flags.skDisabled; },
    /** remember where to send WREN back to */
    checkpoint(r, a) {
      const op = r.world.operative;
      if (a.area) { const q = r.data.areas[a.area]; r.cp = { x: q.x + q.w / 2, y: q.y + q.h / 2 }; } else r.cp = { x: op.x, y: op.y };
    },
    /** a dummy that has done its job packs up: out of sight, deaf and blind */
    retire(r, a) {
      const u = r.world.units.find((q) => q.id === a.id);
      if (u) { u.hidden = true; u.retired = true; u.seesOp = false; u.det = 0; u.tag = null; u.setState('unaware'); }
    },
    /** his own C4 (or anything else) would kill him: training — back to the last marker, charge refunded */
    saveFromDeath(r) {
      const op = r.world.operative;
      op.hp = op.maxHp;
      op.c4 = Math.max(op.c4, 2);
      r.game.hud.say("That's a closed casket, WREN. Three tiles from the charge — minimum. Again.", true, true);
      sendBack(r, 'CAUGHT IN THE BLAST — RESET');
      return true;
    },
    update(r, dt) {
      const w = r.world, op = w.operative, g = r.game;
      // standing next to a live charge: say so, loudly
      if ((r.clearT = (r.clearT || 0) - dt) <= 0 && g.c4?.charges?.some((c) => c.t < BALANCE.c4.fuse - 0.5 && Math.hypot(c.x - op.x, c.y - op.y) < BALANCE.c4.radius + 0.5)) {
        r.clearT = 1.5;
        g.hud.toast('GET CLEAR!', '#FF5A3A', 1.2);
      }
      if (r.resetT > 0) { r.resetT -= dt; return; }
      // spotted by a dummy: back to the last marker, dummies reset
      const spotter = w.units.find((u) => u.training && !u.dead && !u.hidden && (u.state === 'combat' || u.det >= 1));
      if (spotter) {
        g.hud.say(spotter.kind === 'vehicle' ? "The buggy saw you. You're dead. Again — from behind this time." : "SPOTTED. In a real op you'd be dead. Back to the marker — again.", true, true);
        sendBack(r, 'SPOTTED — RESET');
        return;
      }
      // the takedown dummy was shot instead: a fresh one steps up
      if (r.flags.loudKill) {
        r.flags.loudKill = false;
        g.hud.say('Loud. VERY loud. Knife work, WREN. Again.', true, true);
        const spec = data.units.find((u) => u.id === 'd3');
        g.enemies.spawn({ ...spec, id: 'd3_' + (r.d3n = (r.d3n || 0) + 1) });
        r.resetT = 1;
        resetDummies(r);
      }
      // the Skitter went up before its driver was shot: a fresh one rolls up
      if (r.flags.skBlown) {
        r.flags.skBlown = false;
        g.hud.say("That's one way to stop a buggy. Now the DRIVER, WREN — here's another one.", true, true);
        const spec = data.units.find((u) => u.id === 'sk');
        const id = 'sk_' + (r.skn = (r.skn || 0) + 1);
        g.vehicles.spawn({ ...spec, id, x: spec.x - 2, y: spec.y + 1 });
        r.skId = id;
        const o = g.objectives.get('b7'); if (o) o.entity = id;
        r.resetT = 1;
      }
    },
  },
};

/** the Skitter the driver/C4 lessons are about right now (a fresh one replaces a blown one) */
function skitterId(r) { return r.skId || 'sk'; }

/** WREN back to the last marker, standing, orders cancelled; the dummies forget him */
function sendBack(r, toast) {
  const op = r.world.operative, g = r.game;
  g.hud.toast(toast, '#FF5A3A', 1.6);
  r.world.stats.resets = (r.world.stats.resets || 0) + 1;
  r.resetT = 1;
  resetDummies(r);
  op.path = []; op.pendingMove = null; op.onArrive = null; op.busy = null; op.trans = null;
  op.x = op.px = r.cp.x; op.y = op.py = r.cp.y; op.stance = 'crouch'; op.mode = 'walk';
  g.cam?.centreOn?.(op.x, op.y);
  if (g.cam) g.cam.follow = true;
}

/** every live dummy forgets WREN, returns to its post and blinks for a moment */
function resetDummies(r) {
  const w = r.world;
  for (const u of w.units) {
    if (!u.training || u.dead || u.hidden) continue;
    u.det = 0; u.seesOp = false; u.lastKnown = null; u.poi = null; u.search = null; u.tag = null;
    u.setState('unaware');
    u.path = [];
    if (u.kind !== 'vehicle') { u.x = u.px = u.home.x; u.y = u.py = u.home.y; }
    u.angle = u.targetAngle = u.home.angle;
    u.blindT = 1.5;
  }
  const g = w.alerts.group('range');
  g.level = 'calm'; g.t = 0; g.twitch = 0;
  w.lkp = null;
  if (r.game.enemies) { r.game.enemies.detecting = 0; r.game.enemies.spotters = []; }
}
