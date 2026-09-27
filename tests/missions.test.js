// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { EnemySystem } from '../src/ai/enemies.js';
import { CombatSystem } from '../src/combat/system.js';
import { StructureSystem } from '../src/entities/structure.js';
import { VehicleSystem } from '../src/entities/vehicle.js';
import { PropSystem } from '../src/entities/props.js';
import { FriendlySystem } from '../src/entities/friendly.js';
import { Lighting } from '../src/render/lighting.js';

const DT = 1 / 30;

/**
 * Every mission runs headless for 90 s with WREN out of sight (patrols, sentries, vehicles on their
 * rounds): nothing throws, and no vehicle that has somewhere to go sits still for long (playtest 2:
 * a vehicle parked beside another one could wait forever) or pivots on the spot most of the time.
 */
for (const id of ['bc', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']) {
  test(`${id}: 90 s of patrols — no errors, vehicles keep driving and arc round corners`, async () => {
    const mod = (await import(`../src/missions/${id}.js`)).default;
    const g = /** @type {any} */ ({
      app: { params: new URLSearchParams(), save: {}, persist() {} }, settings: {}, mode: 'normal', missionModule: mod,
      cam: { shake() {} }, hud: { say() {}, toast() {}, peekObjectives() {} },
    });
    g.world = new World(mod, { seed: 11 });
    g.combat = new CombatSystem(g); g.vehicles = new VehicleSystem(g); g.structures = new StructureSystem(g);
    g.enemies = new EnemySystem(g); g.props = new PropSystem(g); g.friendlies = new FriendlySystem(g); g.lighting = new Lighting(g);
    const w = g.world;
    w.operative.hidden = true;
    const st = new Map();
    for (let t = 0; t < 90; t += DT) {
      w.time += DT;
      const before = w.units.filter((u) => u.kind === 'vehicle' && !u.dead && !u.disabled).map((v) => ({ v, x: v.x, y: v.y, a: v.angle, p: v.path.length }));
      g.structures.update(DT); g.enemies.update(DT); g.vehicles.update(DT); g.combat.update(DT);
      for (const b of before) {
        const s = st.get(b.v.id) || { ticks: 0, pivot: 0, still: 0, maxStill: 0 };
        if (b.p > 0) {
          const moved = Math.hypot(b.v.x - b.x, b.v.y - b.y) > 1e-4;
          s.ticks++;
          if (!moved && Math.abs(b.v.angle - b.a) > 1e-3) s.pivot++;
          s.still = moved ? 0 : s.still + 1; s.maxStill = Math.max(s.maxStill, s.still);
        }
        st.set(b.v.id, s);
      }
    }
    for (const [vid, s] of st) {
      if (!s.ticks) continue;
      assert.ok(s.maxStill * DT < 8, `${vid} stalled ${(s.maxStill * DT).toFixed(1)} s with a path`);
      assert.ok(s.pivot / s.ticks < 0.1, `${vid} turned on the spot ${(100 * s.pivot / s.ticks).toFixed(0)} % of its driving time`);
    }
  });
}
