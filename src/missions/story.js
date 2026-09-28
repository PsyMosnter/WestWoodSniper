// @ts-check
/**
 * The story (a 90s action-movie campaign in seven missions) as cutscene scripts, played by
 * src/scenes/cutscene.js. Every mission intro follows the same beats:
 *   1. a nature close-up (grass, leaves, an insect going about its day),
 *   2. something arrives in that close-up — either the NOT (a Skitter runs the beetle over, a patrol
 *      tramples through, a Sniffer noses in, a tank rolls over it all) or WREN (crawling through the
 *      grass, or a leaf settling on the rifle scope),
 *   3. an establishing shot: WREN in the foreground, the biome and the mission target beyond, the title card,
 *   4. the briefing, acted out LucasArts style: WREN in close-up with whoever is on the radio on a green field
 *      screen beside him (or a cutaway to whoever they're talking about); speech appears above the speaker.
 * Shots: { kind, dur, ...params }; lines: [time (s from the cut's start), speaker, text].
 * Stage shots ('stage', 'closeup') are painted at full resolution by src/scenes/cutStage.js.
 */

/** @typedef {{kind: string, dur: number, [k: string]: any}} Shot */
/** @typedef {{shots: Shot[], lines: [number, string, string][], music?: string}} Cut */

const MACRO = 8.2;                 // close-up + arrival
const EST = 4.0;                   // establishing shot with the title card
const LINE = (text) => 1.5 + text.length * 0.045;

/**
 * @param {{n: number, title: string, biome: string, time: string, weather?: string, bug: string,
 *   approach: string, establish: string, wren: string, lines?: [string, string][],
 *   talk?: {shot?: object, lines: [string, string][]}[], radio?: string}} m
 * @returns {Cut}
 */
function mission(m) {
  const env = { biome: m.biome, time: m.time, weather: m.weather };
  const talk = m.talk || [{ lines: m.lines || [] }];
  const shots = [
    { kind: 'macro', dur: MACRO, ...env, bug: m.bug, approach: m.approach },
    { kind: 'establish', dur: EST, ...env, scene: m.establish, wren: m.wren, title: m.title, n: m.n },
  ];
  const lines = [];
  let t = MACRO + EST;
  talk.forEach((beat, i) => {
    const t0 = t;
    if (i === 0) t += 0.5;                              // a beat to take in the close-up
    for (const [who, text] of beat.lines) { lines.push([t, who, text]); t += LINE(text); }
    if (i === talk.length - 1) t += 0.9;
    shots.push({ kind: 'closeup', dur: t - t0, ...env, who: 'WREN', listen: 'radio', inset: m.radio || 'OVERWATCH', ...beat.shot });
  });
  return { shots, lines };
}

/** @type {Record<string, Cut>} */
export const CUTS = {
  intro: {
    // hand-inked (cutArt/): the night they came · the Colonel explains · one pin · WREN, fishing
    shots: [
      { kind: 'caption', dur: 2.8, text: 'THE CONTINENT. 199X.' },
      { kind: 'ink', id: 'meteors', dur: 9.0, card: { at: 5.0, dur: 3.8, text: 'NULL OBJECTION TARGETS' } },
      { kind: 'ink', id: 'tent', dur: 13.3 },
      { kind: 'ink', id: 'pin', dur: 8.4, slam: 7.2 },
      { kind: 'ink', id: 'dock', dur: 12.0, gag: 7.2 },
      { kind: 'titleSlam', dur: 3.4 },
    ],
    lines: [
      [3.4, 'OVERWATCH', 'They came down on the east bank of the Varna. Hundreds of them...'],
      [12.2, 'COLONEL', "...because the whole world agrees that we don't like them very much."],
      [16.8, 'SECRETARY', "Yeah, they're not too nice, are they?"],
      [20.0, 'COLONEL', "So it's OK to shoot them."],
      [22.6, 'SECRETARY', 'Yeah. Shoot them.'],
      [25.4, 'COLONEL', 'So we organised the Global Operative Defences, to shoot them.'],
      [29.7, 'COLONEL', "But we can't send a whole army across the river."],
      [34.6, 'OVERWATCH', "WREN, you're up."],
      [37.0, 'WREN', "I'm retired."],
      [39.0, 'OVERWATCH', "You're bored."],
    ],
  },
  m1: mission({
    n: 1, title: 'FIRST LIGHT', biome: 'temperate', time: 'dawn', bug: 'beetle', approach: 'crawl', establish: 'riverBase', wren: 'crouch',
    talk: [{ lines: [['OVERWATCH', 'First light over the Varna. Something crossed last night.'], ['OVERWATCH', 'Find out what crossed. Then get out.'], ['WREN', 'Quiet in, quiet out.']] }],
  }),
  m2: mission({
    n: 2, title: 'BLACKOUT', biome: 'arid', time: 'day', bug: 'beetle', approach: 'skitter', establish: 'mesaBase', wren: 'prone',
    talk: [{ shot: { brow: 0.3, beats: [{ t: 7.6, brow: 1 }, { t: 10.2, brow: -0.6 }] }, lines: [['OVERWATCH', 'Every order from Cherry Hill runs through Anvil Mesa. The mesa runs on one power plant.'], ['OVERWATCH', 'Pull the plug.'], ['WREN', 'On a whole army?'], ['OVERWATCH', 'On their turrets. Start small.']] }],
  }),
  m3: mission({
    n: 3, title: 'NEEDLE', biome: 'alpine', time: 'day', weather: 'blizzard', bug: 'moth', approach: 'needle', establish: 'convoyPass', wren: 'prone',
    talk: [
      // cutaway: the man himself, in the snow
      { shot: { who: 'VRASK', inset: null, listen: 'stand', dir: 4 }, lines: [['OVERWATCH', "With the mesa dark they can't radio orders. Vrask is driving the passes himself."], ['OVERWATCH', 'He only gets out at the outposts.']] },
      { shot: { brow: -0.6 }, lines: [['WREN', "Then that's where I'll be."]] },
    ],
  }),
  m4: mission({
    n: 4, title: 'LIFELINE', biome: 'desert', time: 'dusk', bug: 'butterfly', approach: 'infantry', establish: 'canyonPatrol', wren: 'crouch',
    talk: [{ shot: { beats: [{ t: 7.8, brow: -0.8 }] }, lines: [['OVERWATCH', 'Fort Dawn is cut off with its wounded. Three medical trucks are going through.'], ['OVERWATCH', 'They drive. You walk the rims. Nobody dies.'], ['WREN', 'Nobody of ours.']] }],
  }),
  m5: mission({
    n: 5, title: 'SUNHAMMER', biome: 'jungle', time: 'day', weather: 'haze', bug: 'dragonfly', approach: 'leaf', establish: 'island', wren: 'crouch',
    talk: [{ shot: { side: 'right', beats: [{ t: 8.0, brow: 0.9 }, { t: 10.4, brow: -0.5 }] }, lines: [['OVERWATCH', 'Recon found the source: a spore refinery on Delta Island.'], ['OVERWATCH', 'You get the designator. Point. Wait. Boom.'], ['WREN', 'Which part is mine?'], ['OVERWATCH', 'Mostly the waiting.']] }],
  }),
  m6: mission({
    n: 6, title: 'GHOST WALK', biome: 'swamp', time: 'night', weather: 'rain', bug: 'firefly', approach: 'sniffer', establish: 'prison', wren: 'crouch',
    talk: [{ lines: [['OVERWATCH', 'Three scientists at Saint Ives. The only people who understand that shield.'], ['OVERWATCH', "They're not soldiers. Keep them in the dark."], ['WREN', 'Dark I can do.']] }],
  }),
  m7: mission({
    n: 7, title: 'HIVE HEART', biome: 'volcanic', time: 'dusk', bug: 'beetle', approach: 'tracks', establish: 'spire', wren: 'crouch', radio: 'DR. ADLER',
    talk: [{ shot: { side: 'right', beats: [{ t: 6.6, brow: 0.8 }] }, lines: [['DR. ADLER', 'Three jammers, one shield generator...'], ['DR. ADLER', '...then the Spire is just a very ugly tower.'], ['WREN', 'Where are they?'], ['DR. ADLER', "That's the part we don't know."]] }],
  }),
  failed: {
    shots: [{ kind: 'static', dur: 4.2 }],
    lines: [[0.9, 'OVERWATCH', '*']],        // '*' = one of FAILED_LINES, picked when it plays
  },
  ending: {
    shots: [
      { kind: 'establish', dur: 7.0, biome: 'volcanic', time: 'dusk', scene: 'spireFalls', wren: 'crouch' },
      { kind: 'macro', dur: 5.6, biome: 'volcanic', time: 'dawn', bug: 'none', approach: 'scatter', lead: 0.6 },
      { kind: 'establish', dur: 3.8, biome: 'temperate', time: 'dawn', scene: 'dropship', wren: 'none' },
      // the ride home: WREN on the bench, and then not for long awake
      { kind: 'stage', dur: 6.2, set: 'cabin', seatX: 0.5, seatY: 0.84, actors: [
        { who: 'WREN', x: 0.5, y: 0.84, dir: 3, pose: 'sit', brow: 0.4, beats: [{ t: 2.8, pose: 'doze', tilt: 0.55, brow: 0, zzz: true }] },
      ] },
      { kind: 'credits', dur: 13 },
    ],
    lines: [
      [1.2, 'OVERWATCH', 'Strike inbound. Get your head down, WREN.'],
      [4.4, 'OVERWATCH', 'Direct hit. The Spire is going over.'],
      [8.0, 'OVERWATCH', "They've stopped. All of them. ...They're running."],
      [13.4, 'OVERWATCH', "It's over, WREN."],
      [16.8, 'WREN', 'Wake me up for the sequel.'],
    ],
  },
};

export const FAILED_LINES = ['WREN? ...WREN, respond.', 'Overwatch to WREN. Come in.', '...Somebody get me a new sniper.'];

export const CREDITS = [
  ['WESTWOOD SNIPER', 'title'],
  ['', ''],
  ['WREN', 'the one soldier'],
  ['OVERWATCH', 'the voice in the ear'],
  ['DRS ADLER, OKAFOR & LIND', 'the shield people'],
  ['LT. IDRIS VALE', 'still owes WREN a drink'],
  ['THE COLONEL', 'organised the whole thing'],
  ['HIS SECRETARY', 'agreed'],
  ['OVERSEER VRASK', 'should have stayed in the Crawler'],
  ['', ''],
  ['Inspired by the real-time strategy games of the 1990s.', 'note'],
];

/** Total running time of a cut (seconds). */
export function cutLength(cut) { return cut.shots.reduce((s, x) => s + x.dur, 0); }
