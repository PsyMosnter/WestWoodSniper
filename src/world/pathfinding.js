// @ts-check
/** Elevation-aware A* and Dijkstra fields (SPEC §7.2). Ramps are the only links between levels. */

const SQ2 = Math.SQRT2;
const NB = [[0, -1, 1], [1, 0, 1], [0, 1, 1], [-1, 0, 1], [1, -1, SQ2], [1, 1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

class Heap {
  constructor(n) { this.items = new Int32Array(n); this.keys = new Float32Array(n); this.size = 0; }
  clear() { this.size = 0; }
  push(item, key) {
    if (this.size >= this.items.length) {
      const ni = new Int32Array(this.items.length * 2); ni.set(this.items); this.items = ni;
      const nk = new Float32Array(this.keys.length * 2); nk.set(this.keys); this.keys = nk;
    }
    let i = this.size++;
    const it = this.items, k = this.keys;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      it[i] = it[p]; k[i] = k[p]; i = p;
    }
    it[i] = item; k[i] = key;
  }
  pop() {
    const it = this.items, k = this.keys;
    const top = it[0];
    const lastI = it[--this.size], lastK = k[this.size];
    let i = 0;
    const n = this.size;
    while (true) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && k[c + 1] < k[c]) c++;
      if (k[c] >= lastK) break;
      it[i] = it[c]; k[i] = k[c]; i = c;
    }
    it[i] = lastI; k[i] = lastK;
    return top;
  }
}

export class Pathfinder {
  /** @param {import('./map.js').GameMap} map */
  constructor(map) {
    this.map = map;
    const N = map.w * map.h;
    this.g = new Float32Array(N);
    this.parent = new Int32Array(N);
    this.open = new Uint32Array(N);
    this.closed = new Uint32Array(N);
    this.gen = 1;
    this.heap = new Heap(1024);
  }
  _stepCost(ai, bi, veh, diag, extra) {
    const m = this.map;
    let c = veh ? m.vcost[bi] : m.cost[bi];
    if (!veh && m.elev[bi] > m.elev[ai]) c = Math.max(c, 1.2); // uphill ramp
    if (extra) c += extra(bi);
    return c * diag;
  }
  /**
   * @param {{veh?: boolean, partial?: boolean, maxIter?: number, extra?: (i:number)=>number}} [opts]
   * @returns {{x:number,y:number}[] | null} path excluding the start tile
   */
  find(sx, sy, tx, ty, opts = {}) {
    const m = this.map, w = m.w;
    sx |= 0; sy |= 0; tx |= 0; ty |= 0;
    if (!m.inb(sx, sy) || !m.inb(tx, ty)) return null;
    const veh = !!opts.veh;
    const maxIter = opts.maxIter ?? 40000;
    const gen = ++this.gen;
    const start = sy * w + sx, goal = ty * w + tx;
    if (start === goal) return [];
    const minC = veh ? 0.76 : 0.8;
    const hfn = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return (Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy)) * minC; };
    const heap = this.heap; heap.clear();
    this.g[start] = 0; this.open[start] = gen; this.parent[start] = -1;
    heap.push(start, hfn(sx, sy));
    let best = start, bestH = hfn(sx, sy);
    let iter = 0;
    while (heap.size) {
      const cur = heap.pop();
      if (this.closed[cur] === gen) continue;
      this.closed[cur] = gen;
      if (cur === goal) { best = cur; break; }
      if (++iter > maxIter) break;
      const cx = cur % w, cy = (cur / w) | 0;
      const hc = hfn(cx, cy);
      if (hc < bestH) { bestH = hc; best = cur; }
      for (let k = 0; k < 8; k++) {
        const nx = cx + NB[k][0], ny = cy + NB[k][1];
        if (!m.canStep(cx, cy, nx, ny, veh)) continue;
        const ni = ny * w + nx;
        if (this.closed[ni] === gen) continue;
        const ng = this.g[cur] + this._stepCost(cur, ni, veh, NB[k][2], opts.extra);
        if (this.open[ni] !== gen || ng < this.g[ni]) {
          this.open[ni] = gen; this.g[ni] = ng; this.parent[ni] = cur;
          heap.push(ni, ng + hfn(nx, ny));
        }
      }
    }
    if (best !== goal && opts.partial === false) return null;
    if (best === start) return best === goal ? [] : null;
    const out = [];
    for (let c = best; c !== start && c >= 0; c = this.parent[c]) out.push({ x: c % w, y: (c / w) | 0 });
    out.reverse();
    return out;
  }
  /** Path cost of the last successful search to tile i (valid right after find()). */
  lastCost(i) { return this.g[i]; }
  /**
   * Dijkstra distance field from (sx,sy) up to maxCost. Returns Float32Array (Infinity = unreached).
   * @param {{veh?: boolean}} [opts]
   */
  field(sx, sy, maxCost = 60, opts = {}) {
    const m = this.map, w = m.w, N = w * m.h;
    const dist = new Float32Array(N).fill(Infinity);
    // settled tiles are final: without this, a stale duplicate pop re-relaxes its neighbours, and
    // because `dist` rounds to float32 (sometimes upward) those re-pushes cascade without end
    const done = new Uint8Array(N);
    const heap = new Heap(512);
    const s = sy * w + sx;
    dist[s] = 0; heap.push(s, 0);
    const veh = !!opts.veh;
    while (heap.size) {
      const cur = heap.pop();
      if (done[cur]) continue;
      done[cur] = 1;
      const d = dist[cur];
      const cx = cur % w, cy = (cur / w) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + NB[k][0], ny = cy + NB[k][1];
        if (!m.canStep(cx, cy, nx, ny, veh)) continue;
        const ni = ny * w + nx;
        if (done[ni]) continue;
        const nd = Math.fround(d + this._stepCost(cur, ni, veh, NB[k][2]));
        if (nd < dist[ni] && nd <= maxCost) { dist[ni] = nd; heap.push(ni, nd); }
      }
    }
    return dist;
  }
}
