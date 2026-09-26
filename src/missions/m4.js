// @ts-check
/** Mission 4 — "Lifeline" (SPEC §16, Mission 4). Map & forces: tools/mapgen/m4.js. Convoy: src/entities/friendly.js */
import data from './data/m4.js';

const tut = (key, title, text) => ({ type: 'tutorial', key, title, text });

const triggers = [
  { when: { type: 'timer', seconds: 1.5 }, do: [{ type: 'say', text: 'Trucks are rolling on your word, WREN. Walk the rims ahead of them.' }] },
  { when: { type: 'timer', seconds: 4 }, do: [tut('convoy', 'Convoy', 'Press ADVANCE and the trucks drive to the next checkpoint, then wait. They stop on their own if they see NOT within 6 tiles. Clear each stretch before you wave them on.')] },
  { when: { type: 'enterArea', area: 'cp1' }, do: [{ type: 'say', text: 'Checkpoint one. Launchers on the north rim — they\'re waiting for the trucks.' }] },
  { when: { type: 'custom', fn: 'convoyAt', arg: 2 }, do: [{ type: 'say', text: 'Roadblock ahead: a Brute facing us, fuel truck beside it. Its view slit is facing the convoy — or light up that tanker.' }] },
  { when: { type: 'custom', fn: 'convoyAt', arg: 3 }, do: [{ type: 'say', text: 'Bridge is out. Trucks will take the dry riverbed — slow going, under a Lobber nest on the south rim.' }] },
  { when: { type: 'custom', fn: 'convoyAt', arg: 4 }, do: [
    { type: 'revealObjective', id: 'o2' },
    { type: 'say', text: 'Fort Dawn\'s gate is jammed shut — hold them off for sixty seconds!', prio: true },
    { type: 'custom', fn: 'counterattack' },
  ] },
  { when: { type: 'objectivesDone', ids: ['o2'] }, do: [{ type: 'custom', fn: 'openGate' }, { type: 'say', text: 'Gate\'s open — get them inside!' }] },
  { when: { type: 'objectivesDone', ids: ['o1'] }, do: [{ type: 'win' }] },
  { when: { type: 'custom', fn: 'tooManyTrucksLost' }, do: [{ type: 'lose', reason: 'Two trucks lost. The convoy failed.' }] },
];

export default { ...data, triggers, intel: '~50 NOT. 3 Launchers + a Warden on the north rim (checkpoint 1); a roadblock Brute and a parked Fuel Hauler (checkpoint 2); a Lobber nest over the riverbed detour (checkpoint 3); a Crawler counter-attack at Fort Dawn\'s gate. Launchers only shoot at trucks within 7 tiles.', custom: {
  convoyAt(r, c) { return (r.game.convoy?.checkpoint ?? 0) >= c.arg && !r.game.convoy?.moving; },
  tooManyTrucksLost(r) { return r.world.friendlies.filter((f) => f.type === 'medTruck' && f.dead).length >= 2; },
  counterattack(r) {
    const s = (u) => r.game.enemies.spawn(u);
    s({ id: 'ca_apc1', type: 'crawler', x: 104, y: 2, alertGroup: 'counter', behaviour: { kind: 'hunt' }, huntTarget: { x: 110, y: 32 }, passengers: 4, facing: 'S' });
    s({ id: 'ca_apc2', type: 'crawler', x: 112, y: 2, alertGroup: 'counter', behaviour: { kind: 'hunt' }, huntTarget: { x: 110, y: 32 }, passengers: 4, facing: 'S' });

  },
  openGate(r) { r.game.convoy && (r.game.convoy.gateOpen = true); },
  bruteClean(r) { const b = r.world.units.find((u) => u.id === 'rb_brute'); return !!b && b.dead && !r.flags.convoyHurtBeforeBrute; },
  update(r) {
    const b = r.world.units.find((u) => u.id === 'rb_brute');
    if (r.flags.convoyHurt && b && !b.dead) r.flags.convoyHurtBeforeBrute = true;
  },
} };
