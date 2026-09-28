// @ts-check
/**
 * Mission 1 — "First Light" (SPEC §16, Mission 1). Map & forces: tools/mapgen/m1.js.
 * Tutorial prompts are area/event triggered and dismissible; each is shown once per save.
 */
import data from './data/m1.js';

const tut = (key, title, text) => ({ type: 'tutorial', key, title, text });

const triggers = [
  { when: { type: 'timer', seconds: 1.2 }, do: [tut('move', 'Moving', 'Tap the ground to walk. Double-tap to run — fast, but loud. WREN crouches whenever he stops. Drag to look around; tap the minimap to jump there.')] },
  { when: { type: 'enterArea', area: 'tut_grass' }, do: [tut('grass', 'Tall grass & hunker', 'Tall grass hides you beyond 3 tiles. HUNKER goes flat: very hard to spot — vehicles and turrets cannot see you at all. Flat, a tap low-crawls: slow, but quiet enough to reach a sentry unseen.')] },
  { when: { type: 'custom', fn: 'enemySeen' }, do: [tut('cones', 'Reading vision cones', 'The faint outer dots are as far as a NOT unit can see. The filled inner cone is how far it can spot you right now: it shrinks when you walk, crouch, crawl or hunker, and in tall grass. Inside it the ? meter fills; at ! you are detected.'), { type: 'say', text: 'Contact. Watch their cones.' }] },
  { when: { type: 'enterArea', area: 'tut_knoll' }, do: [tut('highground', 'High ground', "From the hill you'll see them. They won't see you. Up here your rifle also reaches one tile further per level.")] },
  { when: { type: 'enterArea', area: 'tut_ford' }, do: [{ type: 'say', text: 'Lone sentry at the ford. Take him quietly.' }] },
  { when: { type: 'custom', fn: 'fordSentryVisible' }, do: [tut('scope', 'First shot', 'Tap the sentry: WREN picks a firing spot, crouches and opens the scope. Drag to aim and hold BREATH to steady; lift your finger to fire (click, or FIRE, with a mouse). Pinch or release on ✕ to lower the rifle. Headshots kill instantly.')] },
  { when: { type: 'unitDead', id: 'ford1' }, do: [{ type: 'say', text: 'Target down.' }] },
  // the noise lesson comes with the first rifle shot (a silent takedown makes none)
  { when: { type: 'custom', fn: 'firedRifle' }, do: [tut('noise', 'Noise', 'Every rifle shot carries 12 tiles — the ring shows how far. Anyone inside it comes looking: relocate, or hunker and let them pass. Running and wading are noisy too: watch the NOISE meter, bottom left.')] },
  { when: { type: 'custom', fn: 'bodyFound' }, do: [tut('bodies', 'Bodies', 'They found a body: that base is on CAUTION — sharper eyes, faster patrols. Drop targets where patrols won\'t walk past.')] },
  { when: { type: 'detected' }, do: [tut('detected', 'Spotted', 'Break line of sight! They will search your last known position (the grey ghost) in widening rings.')] },
  { when: { type: 'custom', fn: 'nearObserve' }, do: [tut('observe', 'Observe', 'Recon objective: stay still (crouched, in cover or hunkered) with a clear view of the marked area, within 8 tiles, until the bar fills.')] },
  { when: { type: 'objectivesDone', ids: ['o1', 'o2', 'o3'] }, do: [{ type: 'revealObjective', id: 'o4' }, { type: 'say', text: 'Good work, WREN. Get to the LZ.', prio: true }, tut('extract', 'Extraction', 'Reach the landing zone in the north-west and stand in it for 3 seconds to call the dropship. It will not land while the LZ is hot.')] },
  { when: { type: 'unitDead', id: 'kesh' }, do: [{ type: 'say', text: 'Warden Kesh is down. Nice.' }] },
];

export default {
  ...data,
  triggers,
  intel: 'Estimated 40 NOT units east of the Varna: rifle patrols, grenadiers, two Wardens, a guard tower on Cherry Hill, Skitter buggies on the roads. The west bank is quiet — use its forests and tall grass. The ford is shallow but watched.',
  custom: {
    firedRifle(r) { return (r.world.stats.rifleShots || 0) > 0; },
    enemySeen(r) { return r.world.units.some((u) => !u.dead && u.kind !== 'structure' && r.world.fog.isVisible(u.tx, u.ty)); },
    bodyFound(r) { return r.world.corpses.some((c) => c.discovered && c.byPlayer); },
    fordSentryVisible(r) { const u = r.world.units.find((x) => x.id === 'ford1'); return !!u && !u.dead && r.world.fog.isVisible(u.tx, u.ty) && Math.hypot(u.x - r.world.operative.x, u.y - r.world.operative.y) < 16; },
    nearObserve(r) {
      const op = r.world.operative;
      return r.game.objectives.list().some((o) => o.type === 'OBSERVE' && !o.done && (() => { const a = r.data.areas[o.area]; return a && Math.hypot(a.x + a.w / 2 - op.x, a.y + a.h / 2 - op.y) < 11; })());
    },
  },
};
