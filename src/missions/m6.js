// @ts-check
/** Mission 6 — "Ghost Walk" (SPEC §16, Mission 6). Map: tools/mapgen/m6.js. Night, rain, searchlights. */
import data from './data/m6.js';

const tut = (key, title, text) => ({ type: 'tutorial', key, title, text });

const triggers = [
  { when: { type: 'timer', seconds: 1.5 }, do: [{ type: 'say', text: 'Saint Ives. Searchlights sweep the squares — one step in a beam and they see you. Shoot the lens if you have to.' }] },
  { when: { type: 'timer', seconds: 5 }, do: [tut('night', 'Night', 'At night everyone sees 35% less — except searchlights. Campfires and glowing spore crystals light the ground around them: stay out of the light.')] },
  { when: { type: 'custom', fn: 'firstFreed' }, do: [{ type: 'custom', fn: 'startShiftChange' }, { type: 'say', text: 'First cell\'s open. The guard shift changes in 60 seconds — they\'ll find the empty cells and sound the alarm.', prio: true }, tut('escort', 'Escort', 'Freed scientists follow you and hide when you crouch. Tap one to make them HOLD or FOLLOW. They are slow and can\'t run long.')] },
  { when: { type: 'objectivesDone', ids: ['o1'] }, do: [{ type: 'revealObjective', id: 'o2' }, { type: 'custom', fn: 'checkpoint' }, { type: 'say', text: 'All three are with you. North gate, the causeway, then the LZ knoll — or the old culvert under the west wall.', prio: true }] },
  { when: { type: 'custom', fn: 'shiftChangeDue' }, do: [{ type: 'setAlert', group: 'town', level: 'alarm' }, { type: 'say', text: 'Shift change — they found the empty cells! Alarm!', prio: true }] },
  { when: { type: 'custom', fn: 'nearCulvert' }, do: [{ type: 'say', text: 'The old sewer culvert. It comes out beyond the west wall — something\'s breathing down there.' }] },
];

export default { ...data, triggers, intel: '~65 NOT in and around Saint Ives. Four searchlight towers, two MG nests on the gates. On Alarm: two Brutes and two Crawlers from the Vehicle Bay. The culvert under the west wall is a way out.', custom: {
  firstFreed(r) { return r.world.friendlies.some((f) => f.type === 'scientist' && !f.captive); },
  startShiftChange(r) { r.flags.shiftAt = r.world.time + 60; r.game.countdown = { label: 'SHIFT CHANGE', until: r.world.time + 60 }; },
  shiftChangeDue(r) { return r.flags.shiftAt !== undefined && r.world.time >= r.flags.shiftAt; },
  checkpoint(r) { r.game.saveCheckpoint?.('rescued'); },
  nearCulvert(r) { const t = r.data.tunnels?.[0]; const op = r.world.operative; return !!t && Math.hypot(op.x - t.a.x, op.y - t.a.y) < 3; },
} };
