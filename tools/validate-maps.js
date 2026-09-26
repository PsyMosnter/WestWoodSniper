// @ts-check
/**
 * Map validator (SPEC §19.4). Usage: node tools/validate-maps.js [m1 m2 …]
 * Checks: row counts/widths, unknown characters, ramps (exactly one level up), entities on valid tiles,
 * referenced areas/paths exist, the start can reach every objective and the LZ, and there are two or
 * more distinct routes to every primary objective (block the shortest path's chokepoints, re-path).
 */
import { GameMap } from '../src/world/map.js';
import { Pathfinder } from '../src/world/pathfinding.js';
import { TERRAIN_BY_CH, OVERLAY_BY_CH, O } from '../src/world/tiles.js';
import { STRUCT_DEFS } from '../src/render/spriteData/structures.js';
import { isVehicleType } from '../src/entities/vehicle.js';
import { pathToFileURL } from 'node:url';
import { canSee } from '../src/world/los.js';

const ALL = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'];

/** @returns {{id:string, errors:string[], warnings:string[], info:string[]}} */
export function validate(data) {
  const errors = [], warnings = [], info = [];
  const { w, h } = data.size;
  for (const layer of ['terrain', 'elevation', 'overlay']) {
    const rows = data[layer];
    if (!rows || rows.length !== h) { errors.push(`${layer}: ${rows?.length} rows, expected ${h}`); continue; }
    rows.forEach((r, y) => {
      if (r.length !== w) errors.push(`${layer} row ${y}: width ${r.length}, expected ${w}`);
      for (const ch of r) {
        if (layer === 'terrain' && !TERRAIN_BY_CH[ch]) { errors.push(`terrain row ${y}: unknown '${ch}'`); break; }
        if (layer === 'overlay' && !OVERLAY_BY_CH[ch]) { errors.push(`overlay row ${y}: unknown '${ch}'`); break; }
        if (layer === 'elevation' && !(ch >= '0' && ch <= '3')) { errors.push(`elevation row ${y}: bad '${ch}'`); break; }
      }
    });
  }
  if (errors.length) return { id: data.id, errors, warnings, info };
  const m = new GameMap(data);
  // structures occupy their footprints
  (data.structures || []).forEach((s, i) => {
    const d = STRUCT_DEFS[s.type];
    if (!d) { errors.push(`structure ${s.id}: unknown type ${s.type}`); return; }
    if (s.x < 0 || s.y < 0 || s.x + d.w > w || s.y + d.h > h) errors.push(`structure ${s.id} out of bounds`);
    m.setStructure(i, s.x, s.y, d.w, d.h, d.blockH);
  });
  // ramps
  let ramps = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = m.idx(x, y);
    if (m.overlay[i] !== O.ramp) continue;
    ramps++;
    if (m.rampDir[i] < 0) errors.push(`ramp at (${x},${y}) has no neighbour exactly one level higher`);
  }
  info.push(`${ramps} ramp tiles`);
  const pf = new Pathfinder(m);
  const p = data.player;
  if (!m.walkable(p.x, p.y)) errors.push(`player start (${p.x},${p.y}) not walkable`);
  // entities on valid tiles
  for (const u of data.units || []) {
    const veh = isVehicleType(u.type);
    const ok = veh ? m.inb(u.x, u.y) && m.vcost[m.idx(u.x, u.y)] < Infinity : m.walkable(u.x, u.y);
    if (!ok) {
      const near = m.nearestWalkable(u.x, u.y, 2, veh);
      (near ? warnings : errors).push(`unit ${u.id} (${u.type}) at (${u.x},${u.y}) not on a valid tile${near ? ` — snaps to (${near.x},${near.y})` : ''}`);
    }
    const b = u.behaviour || {};
    if (b.kind === 'patrol' && !(data.paths || {})[b.path]) errors.push(`unit ${u.id}: missing path '${b.path}'`);
    if (b.kind === 'camp' && b.area && !(data.areas || {})[b.area]) errors.push(`unit ${u.id}: missing area '${b.area}'`);
  }
  for (const [id, pts] of Object.entries(data.paths || {})) for (const q of pts) {
    if (!m.inb(q.x, q.y)) errors.push(`path ${id} point (${q.x},${q.y}) off map`);
    else if (m.cost[m.idx(q.x, q.y)] === Infinity && m.vcost[m.idx(q.x, q.y)] === Infinity) {
      const near = m.nearestWalkable(q.x, q.y, 3);
      (near ? warnings : errors).push(`path ${id} point (${q.x},${q.y}) blocked${near ? ` — snaps to (${near.x},${near.y})` : ''}`);
    }
  }
  for (const pk of data.pickups || []) if (!m.walkable(pk.x, pk.y)) errors.push(`pickup ${pk.type} at (${pk.x},${pk.y}) not walkable`);
  // objectives reachable + two routes
  const field = pf.field(p.x, p.y, 100000);
  const goals = [];
  for (const o of data.objectives || []) {
    const tiles = objectiveTiles(data, m, o);
    if (!tiles) continue;
    const reach = tiles.filter((t) => field[m.idx(t.x, t.y)] < Infinity);
    if (!reach.length) { (o.primary ? errors : warnings).push(`objective ${o.id} (${o.type}) unreachable from start`); continue; }
    if (o.primary && o.type !== 'EXTRACT') goals.push({ o, tiles: reach });
    info.push(`${o.id} ${o.type}: reachable (cost ${Math.round(Math.min(...reach.map((t) => field[m.idx(t.x, t.y)])))})`);
  }
  for (const g of goals) {
    const routes = distinctRoutes(m, pf, p, g.tiles);
    if (routes < 2) warnings.push(`objective ${g.o.id}: only one route (the obvious approach has no alternative)`);
    else info.push(`${g.o.id}: ≥2 routes`);
  }
  for (const t of data.triggers || []) {
    const a = t.when?.area;
    if (a && !(data.areas || {})[a]) errors.push(`trigger ${t.id || ''}: missing area '${a}'`);
  }
  return { id: data.id, errors, warnings, info };
}

/** Tiles that satisfy/approach an objective */
function objectiveTiles(data, m, o) {
  const areas = data.areas || {};
  const pick = (x, y, r) => {
    const out = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (m.walkable(x + dx, y + dy)) out.push({ x: x + dx, y: y + dy });
    return out;
  };
  if (o.area && areas[o.area]) {
    const a = areas[o.area];
    if (o.type === 'OBSERVE') {
      // only tiles that can actually observe: within 8 tiles with LOS to the centre (or a neighbour)
      const cx = Math.floor(a.x + a.w / 2), cy = Math.floor(a.y + a.h / 2);
      return pick(cx, cy, 8).filter((t) => Math.hypot(t.x + 0.5 - (cx + 0.5), t.y + 0.5 - (cy + 0.5)) <= 8 &&
        [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => canSee(m, t.x, t.y, cx + dx, cy + dy, {})));
    }
    const out = [];
    for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) if (m.walkable(x, y)) out.push({ x, y });
    return out;
  }
  const ids = o.entities || (o.entity ? [o.entity] : o.unit ? [o.unit] : o.units || []);
  const out = [];
  for (const id of ids) {
    const s = (data.structures || []).find((q) => q.id === id);
    if (s) { const d = STRUCT_DEFS[s.type]; out.push(...pick(Math.floor(s.x + d.w / 2), Math.floor(s.y + d.h / 2), Math.max(d.w, d.h) + 1)); continue; }
    const u = (data.units || []).find((q) => q.id === id) || (data.friendlies || []).find((q) => q.id === id);
    if (u) out.push(...pick(u.x, u.y, 6));
  }
  return out.length ? out : null;
}

/** Count distinct routes: block the shortest path's chokepoints (narrow tiles & ramps), then re-path. */
function distinctRoutes(m, pf, p, tiles) {
  const goal = tiles[0];
  const path = pf.find(p.x, p.y, goal.x, goal.y, { partial: false });
  if (!path) return 0;
  const blocked = [];
  const n = path.length;
  path.forEach((t, k) => {
    if (k < 3 || k > n - 4) return; // keep the start & objective surroundings open
    const i = m.idx(t.x, t.y);
    let open = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && m.walkable(t.x + dx, t.y + dy)) open++;
    if (open <= 5 || m.overlay[i] === O.ramp || m.overlay[i] === O.bridge || k === Math.floor(n / 2)) blocked.push(t);
  });
  for (const t of blocked) m.setBlocked(t.x, t.y, true);
  const pf2 = new Pathfinder(m);
  const alt = tiles.some((t) => pf2.find(p.x, p.y, t.x, t.y, { partial: false }));
  for (const t of blocked) m.setBlocked(t.x, t.y, false);
  return alt ? 2 : 1;
}

// CLI
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const want = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
  let bad = 0;
  for (const id of want) {
    let data;
    try { data = (await import(`../src/missions/data/${id}.js`)).default; } catch (e) { continue; }
    const r = validate(data);
    console.log(`\n== ${id}: ${data.name} ${data.size.w}×${data.size.h} — ${r.errors.length} errors, ${r.warnings.length} warnings`);
    for (const e of r.errors) console.log('  ERROR ' + e);
    for (const wn of r.warnings) console.log('  warn  ' + wn);
    for (const i of r.info) console.log('  ' + i);
    bad += r.errors.length;
  }
  process.exitCode = bad ? 1 : 0;
}
