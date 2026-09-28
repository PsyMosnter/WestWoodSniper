// @ts-check
/** Mission 3 — "Needle" (SPEC §16, Mission 3). Map & forces: tools/mapgen/m3.js. Convoy logic: src/missions/convoy.js */
import data from './data/m3.js';

const tut = (key, title, text) => ({ type: 'tutorial', key, title, text });

const triggers = [
  { when: { type: 'timer', seconds: 1.5 }, do: [{ type: 'say', text: 'Vrask\'s convoy loops the pass: valley outpost, Outpost Ridge, then the summit radar.' }] },
  { when: { type: 'timer', seconds: 5 }, do: [tut('tracks', 'Snow tracks', 'Deep snow keeps your footprints for a minute. A patrol that crosses fresh tracks will follow them. Roads and rock don\'t take tracks — and blizzards wipe them.')] },
  { when: { type: 'custom', fn: 'blizzardOn' }, cooldown: 60, once: false, do: [{ type: 'say', text: 'Blizzard rolling in. Everyone\'s half blind — you too.' }] },
  { when: { type: 'custom', fn: 'vraskDismounted' }, do: [tut('vrask', 'The target', 'Vrask is out of the Crawler for his inspection. His helmet will stop the first headshot — make the second count, or hit him somewhere it hurts.')] },
  { when: { type: 'enterArea', area: 'overwatch' }, do: [{ type: 'say', text: 'Lake cliffs. You can see the valley road from up here.' }] },
  { when: { type: 'observed', area: 'pilotCell' }, do: [{ type: 'revealObjective', id: 's1' }, { type: 'say', text: 'That\'s one of ours in the cell on Outpost Ridge! Get him out if you can.' }] },
  { when: { type: 'custom', fn: 'pilotSeen' }, do: [{ type: 'revealObjective', id: 's1' }, { type: 'say', text: 'That\'s one of ours in the cell on Outpost Ridge! Get him out if you can.' }] },
  { when: { type: 'unitDead', id: 'vrask' }, do: [{ type: 'revealObjective', id: 'o2' }, { type: 'say', text: 'Vrask is down. Get to the lake — the dropship is on its way.', prio: true }] },
];

export default { ...data, triggers, intel: '~60 NOT units on the pass. Vrask rides a Crawler between a Skitter lead and a Brute rear guard (~4 min loop), stops 30 s at each outpost to inspect. Crawler view slit: front only. The valley bridge can be demolished. Blizzards every 3 minutes.', custom: {
  blizzardOn(r) { return !!r.world.blizzard; },
  vraskDismounted(r) { const v = r.world.units.find((u) => u.id === 'vrask'); return !!v && !v.dead && !v.hidden && r.world.fog.isVisible(v.tx, v.ty); },
  pilotSeen(r) { const p = r.world.friendlies.find((f) => f.id === 'pilot'); return !!p && r.world.fog.isVisible(Math.floor(p.x), Math.floor(p.y)); },
} };
