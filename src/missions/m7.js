// @ts-check
/** Mission 7 — "Hive Heart" (SPEC §16, Mission 7). Map: tools/mapgen/m7.js. Phased final assault. */
import data from './data/m7.js';

const tut = (key, title, text) => ({ type: 'tutorial', key, title, text });

const triggers = [
  { when: { type: 'timer', seconds: 1.5 }, do: [{ type: 'say', text: 'Phase one: recon. Observe the three outer camps and we\'ll know where their jammers and the shield are.' }] },
  { when: { type: 'objectivesDone', ids: ['p1', 'p2', 'p3'] }, do: [
    { type: 'revealObjective', id: 'j1' }, { type: 'revealObjective', id: 'j2' }, { type: 'revealObjective', id: 'j3' },
    { type: 'custom', fn: 'markIntel' },
    { type: 'say', text: 'Phase two: three jammers — North, East, South. One power plant feeds North and East.', prio: true },
  ] },
  { when: { type: 'objectivesDone', ids: ['j1', 'j2', 'j3'] }, do: [{ type: 'revealObjective', id: 'b1' }, { type: 'say', text: 'Jammers are down. Phase three: the shield generator is inside the caldera. It needs C4.', prio: true }] },
  { when: { type: 'objectivesDone', ids: ['b1'] }, do: [{ type: 'revealObjective', id: 'k1' }, { type: 'custom', fn: 'shieldDown' }, { type: 'say', text: 'Shield\'s down — the Spire is soft. Paint it. The Ash Needle, east, is eleven tiles out.', prio: true }] },
  { when: { type: 'objectivesDone', ids: ['k1'] }, do: [{ type: 'revealObjective', id: 'e1' }, { type: 'custom', fn: 'escape' }, { type: 'say', text: 'The Hive Spire is gone! Everything they have is coming — get to the south-west LZ. Not the old road: the vents are going!', prio: true }] },
  { when: { type: 'enterArea', area: 'ashNeedle' }, do: [{ type: 'say', text: 'The Ash Needle. From here you can paint the Spire — once the shield is down.' }] },
];

export default { ...data, triggers, intel: '~90 NOT units: 3 Juggernauts and 4 gun turrets in the caldera, barracks and vehicle bays on the terrace, three jammers (the NE power plant feeds North & East). Shielded, the Spire shrugs off 75% of a strike. A supply cache in the north-east holds a third strike.', custom: {
  init(r) {
    // secondary "stealth through the breach": any Alarm while phase 3 (the breach) is active spoils it
    r.world.events.on('alert', (e) => {
      const b1 = r.game.objectives.get('b1');
      if (e.level === 'alarm' && b1 && !b1.hidden && !b1.done) r.flags.alarmBeforeBreach = true;
    });
  },
  jammerDown(r, o) { const j = r.world.structures.find((s) => s.id === (o.arg || o)); return !!j && (j.dead || !!j.st.unpowered); },
  cacheFound(r) { return !!r.flags['pickup:designator']; },
  stealthBreach(r) { return r.game.objectives.get('b1')?.done && !r.flags.alarmBeforeBreach; },
  markIntel(r) { r.game.intelMarked = true; },
  shieldDown(r) { const sp = r.world.structures.find((s) => s.id === 'spire'); if (sp) sp.hardened = false; r.game.saveCheckpoint?.('shieldDown'); },
  escape(r) {
    const a = r.data.areas.vents;
    r.game.structures?.spawnFire(a.x + a.w / 2, a.y + a.h / 2, 12, 120);
    r.world.alerts.raiseAll('alarm', 'spire destroyed');
    r.game.objectives.reveal('e1');
  },
} };
