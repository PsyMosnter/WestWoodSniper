// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReconSystem, missionLevel } from '../src/strike/recon.js';
import { Fog } from '../src/world/fog.js';
import { BALANCE } from '../src/config/balance.js';

function fakeGame(missionId) {
  const handlers = {};
  const toasts = [];
  const world = { operative: { x: 5, y: 5, designator: 0 }, events: { on: (k, f) => (handlers[k] = f) } };
  const game = /** @type {any} */ ({ world, missionId, mode: 'normal', hud: { toast: (m) => toasts.push(m) }, cam: { viewW: 480, viewH: 270, zoom: 1, left: 0, top: 0 } });
  return { game, handlers, toasts };
}

test('recon: one uplink from mission 2, none before; a tap spends it and sweeps a screen-sized area', () => {
  assert.deepEqual([missionLevel('m1'), missionLevel('m2'), missionLevel('m7'), missionLevel('bc')], [1, 2, 7, 0]);
  assert.equal(new ReconSystem(fakeGame('m1').game).game.world.operative.recon, 0);
  const { game } = fakeGame('m2');
  const r = new ReconSystem(game);
  assert.equal(game.world.operative.recon, 1);
  const revealed = [];
  game.world.fog = { revealArea: (x, y, rect, t) => revealed.push({ x, y, rect, t }) };
  r.toggleTargeting();
  assert.equal(game.mode, 'recon');
  r.tapTarget(40, 30);
  assert.equal(game.world.operative.recon, 0);
  assert.equal(game.mode, 'normal');
  r.update(BALANCE.recon.sweep + 0.01);
  assert.equal(revealed.length, 1, 'revealed after the sweep');
  const q = revealed[0].rect;
  assert.ok(q.x1 - q.x0 >= 30 && q.x1 - q.x0 <= 31 && q.y1 - q.y0 >= 17 && q.y1 - q.y0 <= 18, 'one screen (30×17 tiles) around the tap');
  r.update(BALANCE.recon.show + 0.1);
  assert.equal(r.scan, null, 'the scan ends');
});

test('recon reveal: visible inside the rect for a few seconds (line of sight from its middle), explored afterwards', () => {
  const w = 20, h = 20, N = w * h;
  const map = /** @type {any} */ ({ w, h, elev: new Uint8Array(N), blockH: new Float32Array(N), soft: new Uint8Array(N), inb: (x, y) => x >= 0 && y >= 0 && x < w && y < h });
  const fog = new Fog(map);
  fog.revealArea(10, 10, { x0: 6, y0: 6, x1: 14, y1: 14 }, 3);
  fog.update([], true);
  assert.ok(fog.isVisible(7, 7) && fog.isVisible(13, 13));
  assert.ok(!fog.isVisible(15, 10) && !fog.isVisible(5, 5), 'only inside the area');
  fog.tick(3.1); fog.update([], true);
  assert.ok(!fog.isVisible(7, 7) && fog.isSeen(7, 7), 'back to fog: explored, not visible');
});

test('field rewards: recon from mission 3 (Warden, comms, clean kills), tactical strikes from mission 5', () => {
  const m2 = fakeGame('m2'); new ReconSystem(m2.game);
  m2.handlers.unitKilled({ unit: { type: 'warden', x: 0, y: 0 }, cause: { source: 'player' } });
  assert.equal(m2.game.world.operative.recon, 1, 'no rewards before mission 3');
  const m3 = fakeGame('m3'); new ReconSystem(m3.game);
  m3.handlers.unitKilled({ unit: { type: 'warden', x: 0, y: 0 }, cause: { source: 'player' } });
  m3.handlers.structureDestroyed({ structure: { type: 'commsArray' } });
  assert.equal(m3.game.world.operative.recon, 3);
  m3.handlers.structureDestroyed({ structure: { type: 'powerPlant' } });
  assert.equal(m3.game.world.operative.recon, 3, 'capped');
  assert.equal(m3.game.world.operative.designator, 0, 'no strikes before mission 5');
  const m5 = fakeGame('m5'); new ReconSystem(m5.game);
  m5.handlers.structureDestroyed({ structure: { type: 'fuelDepot' } });
  m5.handlers.unitKilled({ unit: { type: 'juggernaut', x: 0, y: 0 }, cause: { source: 'player' } });
  assert.equal(m5.game.world.operative.designator, 2);
  const chain = fakeGame('m4'); new ReconSystem(chain.game);
  for (let i = 0; i < 3; i++) chain.handlers.unitKilled({ unit: { type: 'husk', x: 30, y: 5, state: 'patrol' }, cause: { source: 'player', by: 'rifle', zone: 'head' } });
  assert.equal(chain.game.world.operative.recon, 2, 'three unseen long headshots earn one');
});
