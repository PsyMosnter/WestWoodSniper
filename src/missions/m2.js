// @ts-check
/** Mission 2 — "Blackout" (SPEC §16, Mission 2). Map & forces: tools/mapgen/m2.js. */
import data from './data/m2.js';

const tut = (key, title, text) => ({ type: 'tutorial', key, title, text });

const triggers = [
  { when: { type: 'timer', seconds: 1.5 }, do: [{ type: 'say', text: 'Anvil Mesa, north-east. The road in is their front door — towers, turrets, a nest. Find another way up.' }] },
  { when: { type: 'timer', seconds: 6 }, do: [tut('c4', 'C4', 'Long-press a building to plant C4: WREN walks over and sets a 10-second charge. Get clear before it blows. (A quick tap on a building opens the scope on its weak points instead.)')] },
  { when: { type: 'enterArea', area: 'ridgeTop' }, do: [tut('hunkerRange', 'Overwatch', 'The West Ridge sees into the base\'s west half. Hunkered, your rifle reaches 10 tiles. Their fuel depot sits on the mesa edge — one barrel is all it takes.'), { type: 'say', text: 'Good perch. The plant is behind that wall — you can\'t see it from here.' }] },
  { when: { type: 'enterArea', area: 'goatPath' }, do: [{ type: 'say', text: 'Goat path. A Warden walks it with two Sniffers — they smell a hunkered man at three tiles.' }] },
  { when: { type: 'enterArea', area: 'gateApproach' }, do: [{ type: 'say', text: 'That gate is a killing floor while the turrets have power.' }] },
  { when: { type: 'structureDestroyed', id: 'cm' }, do: [{ type: 'say', text: 'Comms array down. Their alarm can\'t reach the whole base now.' }] },
  { when: { type: 'structureDestroyed', id: 'fd' }, do: [{ type: 'say', text: 'Fuel depot gone. They\'ll see that from orbit.' }] },
  { when: { type: 'structureDestroyed', id: 'pp' }, do: [
    { type: 'revealObjective', id: 'o2' },
    { type: 'say', text: 'Power\'s out — every turret up there just went blind. Exfil south-east. They\'re coming!', prio: true },
    { type: 'setAlert', group: 'base', level: 'alarm' },
  ] },
];

export default { ...data, triggers, intel: '~55 NOT. The south switchback: gate, 2 guard towers, 2 powered gun turrets, an MG nest. North cliff: a one-tile goat path through boulders, walked by a Warden and a Sniffer pair. The West Ridge overlooks the fuel depot. A Brute will roll out of the vehicle bay on Alarm.', custom: {} };
