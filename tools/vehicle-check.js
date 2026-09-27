// @ts-check
/**
 * Vehicle driving check: runs a mission headless (WREN hidden) and reports, per vehicle, how far it drove,
 * how many ticks it spent turning on the spot while it had somewhere to go, and whether it got stuck.
 * Usage: node tools/vehicle-check.js m1 [secs=240]
 */
import { World } from '../src/world/world.js';
import { EnemySystem } from '../src/ai/enemies.js';
import { CombatSystem } from '../src/combat/system.js';
import { StructureSystem } from '../src/entities/structure.js';
import { VehicleSystem } from '../src/entities/vehicle.js';
import { PropSystem } from '../src/entities/props.js';
import { FriendlySystem } from '../src/entities/friendly.js';
import { Lighting } from '../src/render/lighting.js';

const id = process.argv[2] || 'm1';
const SECS = +(process.argv[3] || 240);
const mod = (await import(`../src/missions/${id}.js`)).default;
const g = /** @type {any} */ ({
  app: { params: new URLSearchParams(), save: {}, persist() {} }, settings: {}, awareness: null, mode: 'normal',
  cam: { shake() {}, follow: true }, audio: null, missionModule: mod, hud: { say() {}, toast() {}, peekObjectives() {} },
});
g.world = new World(mod, { seed: 7 });
g.combat = new CombatSystem(g); g.vehicles = new VehicleSystem(g); g.structures = new StructureSystem(g);
g.enemies = new EnemySystem(g); g.props = new PropSystem(g); g.friendlies = new FriendlySystem(g); g.lighting = new Lighting(g);
const w = g.world;
w.operative.hidden = true;
const DT = 1 / 30;
const stats = new Map();
for (let t = 0; t < SECS; t += DT) {
  w.time += DT;
  const before = w.units.filter((u) => u.kind === 'vehicle').map((v) => ({ v, x: v.x, y: v.y, a: v.angle, p: v.path.length }));
  g.structures.update(DT); g.enemies.update(DT); g.vehicles.update(DT); g.combat.update(DT);
  for (const b of before) {
    const v = b.v, s = stats.get(v.id) || { dist: 0, pivot: 0, moving: 0, still: 0, maxStill: 0 };
    const moved = Math.hypot(v.x - b.x, v.y - b.y);
    let da = Math.abs(v.angle - b.a); if (da > Math.PI) da = Math.PI * 2 - da;
    s.dist += moved;
    if (b.p > 0 && !v.dead && !v.disabled) {
      s.moving++;
      if (moved < 1e-4 && da > 1e-3) s.pivot++;
      if (moved < 1e-4) { s.still++; s.maxStill = Math.max(s.maxStill, s.still); } else s.still = 0;
    }
    stats.set(v.id, s);
  }
}
console.log(`${id}: ${stats.size} vehicles, ${SECS} s`);
for (const [vid, s] of stats) {
  const v = w.units.find((u) => u.id === vid);
  console.log(`  ${vid.padEnd(10)} ${v.type.padEnd(10)} drove ${s.dist.toFixed(0).padStart(4)} tiles · pivot ticks ${String(s.pivot).padStart(4)} / ${s.moving} · longest stall ${(s.maxStill * DT).toFixed(1)} s`);
}
