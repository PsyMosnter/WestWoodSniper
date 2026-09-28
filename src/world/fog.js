// @ts-check
import { visibleTiles } from './los.js';

/**
 * Fog of war (SPEC §4.4): 0 = shroud (never seen), 1 = fog (seen before), 2 = visible now.
 * Recomputed at 10 Hz or when a vision source changes tile.
 */
export class Fog {
  /** @param {import('./map.js').GameMap} map */
  constructor(map) {
    this.map = map;
    const N = map.w * map.h;
    this.seen = new Uint8Array(N);
    this.visGen = new Uint32Array(N);
    this.gen = 1;
    this.version = 0;
    /** @type {{x:number,y:number,r:number,t:number}[]} */
    this.reveals = [];
    this.revealAll = false;
    this.lastKey = '';
  }
  state(i) { return this.revealAll ? 2 : this.visGen[i] === this.gen ? 2 : this.seen[i] ? 1 : 0; }
  isVisible(x, y) { if (!this.map.inb(x, y)) return false; return this.revealAll || this.visGen[y * this.map.w + x] === this.gen; }
  isSeen(x, y) { if (!this.map.inb(x, y)) return false; return this.revealAll || this.seen[y * this.map.w + x] === 1; }
  /**
   * Satellite recon: for t seconds, everything inside rect that someone standing at (x, y) could see.
   * @param {{x0:number,y0:number,x1:number,y1:number}} rect
   */
  revealArea(x, y, rect, t) { this.reveals.push({ x, y, r: Math.hypot(rect.x1 - rect.x0, rect.y1 - rect.y0) / 2 + 1, t, rect }); this.lastKey = ''; }
  /** Temporary reveal (flares, scripts, strike flash). */
  reveal(x, y, r, t) { this.reveals.push({ x, y, r, t }); this.lastKey = ''; }
  tick(dt) {
    let changed = false;
    for (const rv of this.reveals) { rv.t -= dt; if (rv.t <= 0) changed = true; }
    if (changed) { this.reveals = this.reveals.filter((r) => r.t > 0); this.lastKey = ''; }
  }
  /**
   * @param {{x:number,y:number,r:number,elev?:number}[]} sources tile coords (integers)
   * @param {boolean} force
   */
  update(sources, force = false) {
    const key = sources.map((s) => `${s.x},${s.y},${s.r}`).join('|') + '|' + this.reveals.length;
    if (!force && key === this.lastKey) return false;
    this.lastKey = key;
    this.gen++;
    const gen = this.gen, vis = this.visGen, seen = this.seen;
    const mark = (i) => { vis[i] = gen; seen[i] = 1; };
    for (const s of sources) visibleTiles(this.map, s.x, s.y, s.r, mark, s.elev);
    const { w, h } = this.map;
    for (const rv of this.reveals) {
      if (rv.rect) {
        const q = rv.rect, cx = Math.max(0, Math.min(w - 1, rv.x)), cy = Math.max(0, Math.min(h - 1, rv.y));
        visibleTiles(this.map, cx, cy, rv.r, (i) => { const x = i % w, y = (i / w) | 0; if (x >= q.x0 && x < q.x1 && y >= q.y0 && y < q.y1) mark(i); });
        continue;
      }
      const r2 = rv.r * rv.r;
      for (let y = Math.max(0, Math.floor(rv.y - rv.r)); y <= Math.min(h - 1, Math.ceil(rv.y + rv.r)); y++)
        for (let x = Math.max(0, Math.floor(rv.x - rv.r)); x <= Math.min(w - 1, Math.ceil(rv.x + rv.r)); x++)
          if ((x - rv.x) ** 2 + (y - rv.y) ** 2 <= r2) mark(y * w + x);
    }
    this.version++;
    return true;
  }
}
