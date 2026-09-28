// @ts-check
/** Mission 2 — "Blackout" (SPEC §16, Mission 2). Map & forces: tools/mapgen/m2.js. */
import data from './data/m2.js';

const tut = (key, title, text, at) => ({ type: 'tutorial', key, title, text, at });

const triggers = [
  { when: { type: 'timer', seconds: 1.5 }, do: [{ type: 'say', text: 'Anvil Mesa, north-east. The road in is their front door — towers, turrets, a nest. Find another way up.' }, { type: 'say', text: 'Options: the goat path up the north cliff, the cracked rock in the canyon wall, or kill the gate turrets\' generator on the south-east plain.' }] },
  { when: { type: 'timer', seconds: 6 }, do: [tut('c4', 'C4', 'Long-press a building to plant C4: WREN walks over and sets a 10-second charge. Get clear before it blows. (A quick tap on a building opens the scope on its weak points instead.)')] },
  { when: { type: 'enterArea', area: 'ridgeTop' }, do: [tut('hunkerRange', 'Overwatch', 'The West Ridge sees into the base\'s west half. Hunkered, your rifle reaches 10 tiles. Their fuel depot sits on the mesa edge — one barrel is all it takes.'), { type: 'say', text: 'Good perch. The plant is behind that wall — you can\'t see it from here.' }] },
  { when: { type: 'enterArea', area: 'goatPath' }, do: [{ type: 'say', text: 'Goat path. A Warden walks it with two Sniffers — they smell a hunkered man at three tiles.' }] },
  { when: { type: 'enterArea', area: 'canyonWall' }, do: [tut('breach', 'Cracked rock', 'That rock face is split. Long-press it to plant C4 — the blast opens a ramp up to the mesa top, right below their fuel depot. It will be loud: be gone before the dust settles.', { x: 46.5, y: 25 })] },
  { when: { type: 'enterArea', area: 'generatorYard' }, do: [tut('generator', 'Generator', 'This generator feeds the gate turrets. Blow it (C4) and they go blind. The gate guards and towers stay — pull the guards away with a noise (those fuel barrels east of the gate road carry 16 tiles), then slip past or pick them off.', { x: 105, y: 55 })] },
  { when: { type: 'structureDestroyed', id: 'gen' }, do: [{ type: 'say', text: 'Generator\'s down — the gate turrets are blind. Now draw those guards off the gate.', prio: true }] },
  { when: { type: 'enterArea', area: 'gateApproach' }, do: [{ type: 'say', text: 'That gate is a killing floor while the turrets have power.' }] },
  { when: { type: 'structureDestroyed', id: 'cm' }, do: [{ type: 'say', text: 'Comms array down. Their alarm can\'t reach the whole base now.' }] },
  { when: { type: 'structureDestroyed', id: 'fd' }, do: [{ type: 'say', text: 'Fuel depot gone. They\'ll see that from orbit.' }] },
  { when: { type: 'structureDestroyed', id: 'pp' }, do: [
    { type: 'revealObjective', id: 'o2' },
    { type: 'say', text: 'Power\'s out — every turret up there just went blind. Exfil south-east. They\'re coming!', prio: true },
    { type: 'setAlert', group: 'base', level: 'alarm' },
  ] },
];

export default { ...data, triggers, intel: '~55 NOT units. The south switchback: gate, 2 guard towers, 2 gun turrets fed by a generator on the south-east plain, an MG nest. North cliff: a one-tile goat path through boulders up to the back of the base, walked by a Warden and a Sniffer pair. Canyon wall: cracked rock below the fuel depot — C4 opens a ramp. The West Ridge overlooks the fuel depot. A Brute will roll out of the vehicle bay on Alarm.', custom: {} };
