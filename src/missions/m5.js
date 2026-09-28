// @ts-check
/** Mission 5 — "Sunhammer" (SPEC §16, Mission 5). Map: tools/mapgen/m5.js. The designator arrives. */
import data from './data/m5.js';

const tut = (key, title, text) => ({ type: 'tutorial', key, title, text });

const triggers = [
  { when: { type: 'timer', seconds: 1.5 }, do: [{ type: 'say', text: 'Strike package is live. Two jammers stand between you and a clean paint.' }] },
  { when: { type: 'custom', fn: 'designatorSelected' }, do: [tut('designator', 'Strategic strike', 'Crouch or hunker, then tap a point you can see: the dashed ring is your range (12 + 1 per level of height). Violet hatching is jammer coverage — no strikes there. Hold the laser 6 s without moving. Impact 8 s later: everything within 5 tiles is gone, 8 tiles is hurt — stay outside the ring!')] },
  { when: { type: 'structureDestroyed', id: 'jamW' }, do: [{ type: 'say', text: 'Jammer West is down.' }] },
  { when: { type: 'custom', fn: 'jamEastDown' }, do: [{ type: 'say', text: 'Jammer East is offline. The whole compound is paintable now.' }] },
  { when: { type: 'enterArea', area: 'temple' }, do: [{ type: 'say', text: 'The Old Temple. Ten tiles of clear sightline into the compound — the best seat in the house.' }] },
  { when: { type: 'objectivesDone', ids: ['o3'] }, do: [{ type: 'revealObjective', id: 'o4' }, { type: 'say', text: 'Refinery destroyed. Boat\'s waiting on the south shore — move!', prio: true }] },
];

export default { ...data, triggers, intel: '~70 NOT units across five islands; channels crossable only at 3 rope bridges and 2 fords. Two Sniffer kennels walk the jungle paths. Jammer West sits on Monkey Hill; Jammer East inside the walled compound — the island Power Plant also feeds it.', custom: {
  designatorSelected(r) { return r.game.mode === 'designator'; },
  jamEastDown(r) { const j = r.world.structures.find((s) => s.id === 'jamE'); return !!j && (j.dead || !!j.st.unpowered); },
} };
