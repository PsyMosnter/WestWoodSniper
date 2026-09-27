// @ts-check
/**
 * Stealth-route report: how watched is a mission, and how clean is the quietest way to each objective?
 * Runs the real enemy AI headless for `secs` (WREN hidden, so nobody reacts), samples every enemy's
 * vision each 0.25 s and records per tile the share of time a crouched soldier there would be in
 * someone's sight (cone, range, LOS, tall grass, night…). Then finds the least-exposed walking route
 * from the start to the tiles each primary objective needs (OBSERVE vantage points, targets, areas).
 *
 * Usage: node tools/stealth-report.js m1 [secs=180] [out.png]   (env: STANCE=walk KILL=ford1 SCALE=8 CROP=x0,y0,x1,y1)
 * Numbers per objective: route length (tiles), watched tiles on it (> 20 % of the time), mean and peak
 * watch share. Lower = easier to sneak. The PNG shows the watch heatmap (red) and the routes (white).
 */
import { writeFileSync } from 'node:fs';
import { encodePNG } from './png.js';
import { World } from '../src/world/world.js';
import { EnemySystem } from '../src/ai/enemies.js';
import { CombatSystem } from '../src/combat/system.js';
import { StructureSystem } from '../src/entities/structure.js';
import { VehicleSystem } from '../src/entities/vehicle.js';
import { PropSystem } from '../src/entities/props.js';
import { FriendlySystem } from '../src/entities/friendly.js';
import { Lighting } from '../src/render/lighting.js';
import { canObserve, stanceRange } from '../src/ai/perception.js';
import { canSee } from '../src/world/los.js';
import { O } from '../src/world/tiles.js';

const id = process.argv[2] || 'm1';
const SECS = +(process.argv[3] || 180);
const out = process.argv[4] || `stealth-${id}.png`;
const mod = (await import(`../src/missions/${id}.js`)).default;

const game = {
  app: { params: new URLSearchParams(), save: {}, persist() {} }, settings: {}, awareness: null, mode: 'normal',
  cam: { shake() {}, follow: true }, audio: null, missionModule: mod,
  hud: { say() {}, toast() {}, peekObjectives() {} },
};
const g = /** @type {any} */ (game);
g.world = new World(mod, { seed: 7 });
g.combat = new CombatSystem(g); g.vehicles = new VehicleSystem(g); g.structures = new StructureSystem(g);
g.enemies = new EnemySystem(g); g.props = new PropSystem(g); g.friendlies = new FriendlySystem(g); g.lighting = new Lighting(g);
const w = g.world, m = w.map, op = w.operative;
op.hidden = true;
// optional env KILL=id,id — measure the map as it is after those units are down (e.g. M1's ford sentry)
for (const kid of (process.env.KILL || '').split(',').filter(Boolean)) { const u = w.units.find((q) => q.id === kid); if (u) { u.dead = true; u.hidden = true; } }

// --- sample vision
const watched = new Float32Array(m.w * m.h);
const watchers = new Map();       // tile → Map(unit id → samples)  (env DETAIL=1 lists them per hot tile)
// the probe moves like WREN would cross the map (env STANCE: walk | crawl | crouch | run; default walk):
// seen only inside that stance's detection range (the inner cone), shrunk by the tile's concealment
const STANCE = process.env.STANCE || 'walk';
const probe = { x: 0, y: 0, hunkered: STANCE === 'crawl' || STANCE === 'hunker', stanceFactor: 0.6, rangeFactor: (_o, conceal) => stanceRange(STANCE, conceal) };
const DT = 1 / 30, SAMPLE = 0.25;
let samples = 0, acc = 0;
for (let t = 0; t < SECS; t += DT) {
  w.time += DT;
  g.structures.update(DT); g.enemies.update(DT); g.vehicles.update(DT); g.combat.update(DT);
  if ((acc += DT) < SAMPLE) continue;
  acc = 0; samples++;
  const seen = new Uint8Array(m.w * m.h);
  for (const u of w.units) {
    if (u.dead || u.hidden || u.kind === 'structure' || u.def?.unarmed) continue;
    const R = 12;
    for (let y = Math.max(0, Math.floor(u.y - R)); y <= Math.min(m.h - 1, Math.floor(u.y + R)); y++) {
      for (let x = Math.max(0, Math.floor(u.x - R)); x <= Math.min(m.w - 1, Math.floor(u.x + R)); x++) {
        const i = y * m.w + x;
        if (seen[i] || !m.walkable(x, y)) continue;
        probe.x = x + 0.5; probe.y = y + 0.5;
        if (canObserve(u, probe, w).visible) {
          seen[i] = 1;
          if (process.env.DETAIL) { let q = watchers.get(i); if (!q) watchers.set(i, (q = new Map())); q.set(u.id, (q.get(u.id) || 0) + 1); }
        }
      }
    }
  }
  for (let i = 0; i < seen.length; i++) watched[i] += seen[i];
}
for (let i = 0; i < watched.length; i++) watched[i] /= samples;

// --- least-exposed routes (Dijkstra; exposure is heavily penalised)
function route(goals) {
  const N = m.w * m.h, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const s = op.ty * m.w + op.tx; dist[s] = 0;
  const open = [[0, s]];
  const goal = new Set(goals.map((q) => q.y * m.w + q.x));
  while (open.length) {
    let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
    const [d, cur] = open.splice(bi, 1)[0];
    if (d > dist[cur]) continue;
    if (goal.has(cur)) { const path = []; for (let c = cur; c >= 0; c = prev[c]) path.push(c); return path.reverse(); }
    const cx = cur % m.w, cy = (cur / m.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!m.canStep(cx, cy, nx, ny, false)) continue;
      const ni = ny * m.w + nx;
      const nd = d + Math.hypot(dx, dy) * m.cost[ni] * (1 + 60 * watched[ni]);
      if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = cur; open.push([nd, ni]); }
    }
  }
  return null;
}
function goalTiles(o) {
  const areas = mod.areas || {};
  const near = (cx, cy, r, ok) => { const outT = []; for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (m.inb(x, y) && m.walkable(x, y) && ok(x, y)) outT.push({ x, y }); return outT; };
  if (o.area && areas[o.area]) {
    const a = areas[o.area], cx = Math.floor(a.x + a.w / 2), cy = Math.floor(a.y + a.h / 2);
    if (o.type === 'OBSERVE') return near(cx, cy, 8, (x, y) => Math.hypot(x - cx, y - cy) <= 8 && [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => canSee(m, x, y, cx + dx, cy + dy, {})));
    return near(cx, cy, Math.max(a.w, a.h), (x, y) => x >= a.x && y >= a.y && x < a.x + a.w && y < a.y + a.h);
  }
  if (o.area && areas[o.area]) { const a = areas[o.area]; return near(a.x, a.y, Math.max(a.w, a.h), (x, y) => x >= a.x && y >= a.y && x < a.x + a.w && y < a.y + a.h); }
  const ids = o.entities || (o.entity ? [o.entity] : o.unit ? [o.unit] : o.units || []);
  const tiles = [];
  for (const eid of ids) {
    const st = w.structures.find((q) => q.id === eid);
    // a building: the tiles around its footprint (where the C4 goes)
    if (st) { tiles.push(...near(st.x - 1, st.y - 1, Math.max(st.w, st.h) + 2, (x, y) => x >= st.x - 1 && y >= st.y - 1 && x <= st.x + st.w && y <= st.y + st.h)); continue; }
    const e = w.units.find((q) => q.id === eid) || w.friendlies.find((q) => q.id === eid);
    if (e) tiles.push(...near(Math.floor(e.x), Math.floor(e.y), 8, (x, y) => canSee(m, x, y, Math.floor(e.x), Math.floor(e.y), {})));
  }
  return tiles;
}
const routes = [];
console.log(`${id} "${mod.name}" — ${w.units.filter((u) => !u.dead).length} enemies, ${SECS} s sampled, probe ${STANCE}`);
for (const o of mod.objectives || []) {
  if (!o.primary || o.type === 'EXTRACT' || o.type === 'STEALTH') continue;
  const goals = goalTiles(o);
  if (!goals.length) { console.log(`  ${o.id} ${o.type}: (no map target — scripted objective)`); continue; }
  const p = route(goals);
  if (!p) { console.log(`  ${o.id} ${o.type}: NO ROUTE`); continue; }
  routes.push(p);
  const ws = p.map((i) => watched[i]);
  const hot = ws.filter((v) => v > 0.2).length;
  const mean = ws.reduce((a, b) => a + b, 0) / ws.length;
  if (process.env.DETAIL) for (const i of p) if (watched[i] > 0.2) console.log(`      (${i % m.w},${(i / m.w) | 0}) ${(watched[i] * 100).toFixed(0)}% — ${[...(watchers.get(i) || new Map())].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${(v / samples * 100).toFixed(0)}%`).join(', ')}`);
  console.log(`  ${o.id} ${o.type.padEnd(7)} route ${String(p.length).padStart(3)} tiles · watched tiles ${String(hot).padStart(2)} · mean ${(mean * 100).toFixed(1).padStart(4)} % · peak ${(Math.max(...ws) * 100).toFixed(0).padStart(3)} %  — ${o.text}`);
}

// --- heatmap
// optional env: SCALE=8 (px per tile), CROP=x0,y0,x1,y1 (tiles)
const S = +(process.env.SCALE || 4);
const [cx0, cy0, cx1, cy1] = (process.env.CROP || `0,0,${m.w},${m.h}`).split(',').map(Number);
const W = (cx1 - cx0) * S, H = (cy1 - cy0) * S, px = new Uint8Array(W * H * 4);
const put = (x, y, c) => { x -= cx0 * S; y -= cy0 * S; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255; };
for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
  const i = y * m.w + x, o = m.overlay[i], t = m.terrainAt(x, y).name;
  let c = t === 'deep' ? [30, 70, 100] : t === 'shallow' ? [70, 130, 160] : o === O.forest || o === O.pine ? [28, 52, 30] : [70, 92, 56];
  if (m.elev[i]) c = c.map((v) => v * (1 + 0.2 * m.elev[i]));
  if (m.cost[i] === Infinity && t !== 'deep') c = [60, 56, 52];
  const k = Math.min(1, watched[i] * 1.5);
  c = [c[0] + (235 - c[0]) * k, c[1] * (1 - k * 0.8), c[2] * (1 - k * 0.8)];
  for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) put(x * S + dx, y * S + dy, c);
}
for (const p of routes) for (const i of p) { const x = i % m.w, y = (i / m.w) | 0; for (let d = 1; d < 3; d++) for (let e = 1; e < 3; e++) put(x * S + d, y * S + e, [255, 255, 255]); }
for (const u of mod.units || []) for (let d = 0; d < 3; d++) for (let e = 0; e < 3; e++) put(u.x * S + d, u.y * S + e, [255, 230, 60]);
writeFileSync(out, encodePNG(W, H, px));
console.log('  heatmap →', out);
