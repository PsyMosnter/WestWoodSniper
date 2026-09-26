// @ts-check
import { PALETTES } from '../../config/palette.js';
import { OPERATIVE } from './humanoid.js';
import { registerUnitDef } from '../sprites.js';

/**
 * GOD non-combatants (SPEC §15.3): a downed pilot (orange flight suit, white helmet, dark visor)
 * and a scientist (white field coat, bare head). Both reuse the Operative body with palette swaps
 * and carry no weapon, so they read as "someone to protect" at a glance.
 */
PALETTES.PILOT = {
  ...PALETTES.GOD,
  O: '#E4E6E0', o: '#B8BCB6', p: '#6E746E',   // helmet
  v: '#2E3A44',                                 // visor
  K: '#D07A36', q: '#8E4E24', b: '#E0C040',   // flight suit + harness
  d: '#2A2622',
};
PALETTES.SCIENTIST = {
  ...PALETTES.GOD,
  O: '#7A5A3E', o: '#5A3E2A', p: '#3E2A1E',   // hair
  v: '#C99C74',                                 // no visor: face
  K: '#E6E8E0', q: '#A8ACA2', b: '#6FA2C8',   // coat + ID badge
  d: '#2A2622',
};

registerUnitDef('pilot', { base: OPERATIVE, pal: 'PILOT', weapon: 'none' });
registerUnitDef('scientist', { base: OPERATIVE, pal: 'SCIENTIST', weapon: 'none' });
