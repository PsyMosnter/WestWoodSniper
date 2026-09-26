// @ts-check
import { GameMap } from '../src/world/map.js';

/**
 * Build a GameMap from compact rows. Each row is a string of cells "t e o" packed as
 * three parallel arrays. Unspecified layers default to grass / level 0 / none.
 */
export function makeMap({ terrain, elevation, overlay }) {
  const h = (terrain || elevation || overlay).length;
  const w = (terrain || elevation || overlay)[0].length;
  const fill = (ch) => Array.from({ length: h }, () => ch.repeat(w));
  return new GameMap({
    id: 'test', size: { w, h },
    terrain: terrain || fill('g'), elevation: elevation || fill('0'), overlay: overlay || fill('.'),
  });
}
