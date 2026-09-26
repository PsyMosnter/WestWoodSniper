// @ts-check
/**
 * The story (a 90s action-movie campaign in seven missions) as cutscene scripts, played by
 * src/scenes/cutscene.js. Every mission intro follows the same three beats:
 *   1. a nature close-up (grass, leaves, an insect going about its day),
 *   2. something arrives in that close-up — either the NOT (a Skitter runs the beetle over, a patrol
 *      tramples through, a Sniffer noses in, a tank rolls over it all) or WREN (crawling through the
 *      grass, or a leaf settling on the rifle scope),
 *   3. an establishing shot: WREN in the foreground, the biome and the mission target beyond,
 *      the title card and a few lines of radio.
 * Shots: { kind, dur, ...params }; lines: [time (s from the cut's start), speaker, text].
 */

/** @typedef {{kind: string, dur: number, [k: string]: any}} Shot */
/** @typedef {{shots: Shot[], lines: [number, string, string][], music?: string}} Cut */

const MACRO = 8.2;                 // close-up + arrival
const TITLE = 2.6;                 // title card at the start of the establishing shot
const LINE = (text) => 1.5 + text.length * 0.045;

/**
 * @param {{n: number, title: string, biome: string, time: string, weather?: string, bug: string,
 *   approach: string, establish: string, wren: string, lines: [string, string][]}} m
 * @returns {Cut}
 */
function mission(m) {
  const lines = [];
  let t = MACRO + TITLE;
  for (const [who, text] of m.lines) { lines.push([t, who, text]); t += LINE(text); }
  const est = t - MACRO + 0.8;
  return {
    shots: [
      { kind: 'macro', dur: MACRO, biome: m.biome, time: m.time, weather: m.weather, bug: m.bug, approach: m.approach },
      { kind: 'establish', dur: est, biome: m.biome, time: m.time, weather: m.weather, scene: m.establish, wren: m.wren, title: m.title, n: m.n },
    ],
    lines,
  };
}

/** @type {Record<string, Cut>} */
export const CUTS = {
  intro: {
    shots: [
      { kind: 'caption', dur: 2.8, text: 'THE CONTINENT. 199X.' },
      { kind: 'macro', dur: 8.4, biome: 'temperate', time: 'night', bug: 'firefly', approach: 'pods' },
      { kind: 'mapTable', dur: 5.6 },
      { kind: 'establish', dur: 7.2, biome: 'temperate', time: 'dawn', scene: 'treeline', wren: 'sit' },
      { kind: 'titleSlam', dur: 3.4 },
    ],
    lines: [
      [3.6, 'OVERWATCH', 'They came down on the east bank of the Varna. Hundreds of them.'],
      [11.6, 'GOD COMMAND', "We can't send an army across that river."],
      [14.2, 'GOD COMMAND', 'We can send one soldier.'],
      [17.4, 'OVERWATCH', "WREN, you're up."],
      [19.4, 'WREN', "I'm retired."],
      [21.2, 'OVERWATCH', "You're bored."],
    ],
  },
  m1: mission({
    n: 1, title: 'FIRST LIGHT', biome: 'temperate', time: 'dawn', bug: 'beetle', approach: 'crawl', establish: 'riverBase', wren: 'crouch',
    lines: [['OVERWATCH', 'First light over the Varna. Something crossed last night.'], ['OVERWATCH', 'Find out what crossed. Then get out.'], ['WREN', 'Quiet in, quiet out.']],
  }),
  m2: mission({
    n: 2, title: 'BLACKOUT', biome: 'arid', time: 'day', bug: 'beetle', approach: 'skitter', establish: 'mesaBase', wren: 'prone',
    lines: [['OVERWATCH', 'Every order from Cherry Hill runs through Anvil Mesa. The mesa runs on one power plant.'], ['OVERWATCH', 'Pull the plug.'], ['WREN', 'On a whole army?'], ['OVERWATCH', 'On their turrets. Start small.']],
  }),
  m3: mission({
    n: 3, title: 'NEEDLE', biome: 'alpine', time: 'day', weather: 'blizzard', bug: 'moth', approach: 'needle', establish: 'convoyPass', wren: 'prone',
    lines: [['OVERWATCH', "With the mesa dark they can't radio orders. Vrask is driving the passes himself."], ['OVERWATCH', 'He only gets out at the outposts.'], ['WREN', "Then that's where I'll be."]],
  }),
  m4: mission({
    n: 4, title: 'LIFELINE', biome: 'desert', time: 'dusk', bug: 'butterfly', approach: 'infantry', establish: 'canyonPatrol', wren: 'crouch',
    lines: [['OVERWATCH', 'Fort Dawn is cut off with its wounded. Three medical trucks are going through.'], ['OVERWATCH', 'They drive. You walk the rims. Nobody dies.'], ['WREN', 'Nobody of ours.']],
  }),
  m5: mission({
    n: 5, title: 'SUNHAMMER', biome: 'jungle', time: 'day', weather: 'haze', bug: 'dragonfly', approach: 'leaf', establish: 'island', wren: 'crouch',
    lines: [['OVERWATCH', 'Recon found the source: a spore refinery on Delta Island.'], ['OVERWATCH', 'You get the designator. Point. Wait. Boom.'], ['WREN', 'Which part is mine?'], ['OVERWATCH', 'Mostly the waiting.']],
  }),
  m6: mission({
    n: 6, title: 'GHOST WALK', biome: 'swamp', time: 'night', weather: 'rain', bug: 'firefly', approach: 'sniffer', establish: 'prison', wren: 'crouch',
    lines: [['OVERWATCH', 'Three scientists at Saint Ives. The only people who understand that shield.'], ['OVERWATCH', "They're not soldiers. Keep them in the dark."], ['WREN', 'Dark I can do.']],
  }),
  m7: mission({
    n: 7, title: 'HIVE HEART', biome: 'volcanic', time: 'dusk', bug: 'beetle', approach: 'tracks', establish: 'spire', wren: 'crouch',
    lines: [['DR. ADLER', 'Three jammers, one shield generator...'], ['DR. ADLER', '...then the Spire is just a very ugly tower.'], ['WREN', 'Where are they?'], ['DR. ADLER', "That's the part we don't know."]],
  }),
  failed: {
    shots: [{ kind: 'static', dur: 4.2 }],
    lines: [[0.9, 'OVERWATCH', '*']],        // '*' = one of FAILED_LINES, picked when it plays
  },
  ending: {
    shots: [
      { kind: 'establish', dur: 7.0, biome: 'volcanic', time: 'dusk', scene: 'spireFalls', wren: 'crouch' },
      { kind: 'macro', dur: 5.6, biome: 'volcanic', time: 'dawn', bug: 'none', approach: 'scatter', lead: 0.6 },
      { kind: 'establish', dur: 7.4, biome: 'temperate', time: 'dawn', scene: 'dropship', wren: 'none' },
      { kind: 'credits', dur: 13 },
    ],
    lines: [
      [1.2, 'OVERWATCH', 'Strike inbound. Get your head down, WREN.'],
      [4.4, 'OVERWATCH', 'Direct hit. The Spire is going over.'],
      [8.0, 'OVERWATCH', "They've stopped. All of them. ...They're running."],
      [13.4, 'OVERWATCH', "It's over, WREN."],
      [15.8, 'WREN', 'Wake me up for the sequel.'],
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
  ['OVERSEER VRASK', 'should have stayed in the Crawler'],
  ['', ''],
  ['Inspired by the real-time strategy games of the 1990s.', 'note'],
];

/** Total running time of a cut (seconds). */
export function cutLength(cut) { return cut.shots.reduce((s, x) => s + x.dur, 0); }
