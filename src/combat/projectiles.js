// @ts-check
import { TILE } from '../core/camera.js';
import { explode } from './explosions.js';
import { damageOperative } from './damage.js';

/**
 * Grenades (arcing, 1 s flight) and rockets (straight). World-time updated.
 */
export class Projectiles {
  constructor(sys) { this.sys = sys; /** @type {any[]} */ this.list = []; }
  grenade(fx, fy, tx, ty, W, owner) {
    this.list.push({ kind: 'grenade', fx, fy, tx, ty, t: 0, dur: W.flight || 1, W, owner, spin: 0 });
    this.sys.game.audio?.play?.('throw', { x: fx, y: fy });
  }
  rocket(fx, fy, tx, ty, W, owner) {
    const d = Math.hypot(tx - fx, ty - fy);
    this.list.push({ kind: 'rocket', fx, fy, tx, ty, t: 0, dur: Math.max(0.15, d / 12), W, owner });
    this.sys.game.audio?.play?.('rocket', { x: fx, y: fy });
  }
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.t += dt;
      if (p.kind === 'rocket') this.sys.particles.smoke(p.fx + (p.tx - p.fx) * (p.t / p.dur), p.fy + (p.ty - p.fy) * (p.t / p.dur), 1, 0.5, '#8A8A84');
      if (p.t >= p.dur) {
        L.splice(i, 1);
        const W = p.W;
        explode(this.sys, p.tx, p.ty, W.radius || 1.2, W.damage, { source: 'enemy', noise: 10, vehicleDamage: W.vsVehicle });
      }
    }
  }
  draw(ctx, cam) {
    const z = cam.zoom;
    for (const p of this.list) {
      const k = Math.min(1, p.t / p.dur);
      const x = p.fx + (p.tx - p.fx) * k, y = p.fy + (p.ty - p.fy) * k;
      const h = p.kind === 'grenade' ? Math.sin(k * Math.PI) * 22 + 6 : 7;
      const X = Math.round((x * TILE - cam.left) * z), Y = Math.round((y * TILE - h - cam.top) * z);
      if (p.kind === 'grenade') {
        // shadow
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(Math.round((x * TILE - cam.left) * z), Math.round((y * TILE - cam.top) * z), 2 * z, z);
        ctx.fillStyle = '#1A1C1E'; ctx.fillRect(X - z, Y - z, 3 * z, 3 * z);
        ctx.fillStyle = '#E8923A'; ctx.fillRect(X, Y - z, z, z); ctx.fillRect(X, Y, z, z);
      } else {
        ctx.fillStyle = '#FFF1A8'; ctx.fillRect(X - z, Y, 3 * z, z);
        ctx.fillStyle = '#5A6166'; ctx.fillRect(X - 3 * z, Y, 2 * z, z);
      }
    }
  }
}

/** Short flame cone (Scorcher): damages the Operative if inside the cone. */
export function flameAttack(sys, u, W, target) {
  const dx = target.x - u.x, dy = target.y - u.y;
  const d = Math.hypot(dx, dy);
  for (let i = 0; i < 6; i++) {
    const a = u.angle + sys.world.fxRng.range(-0.35, 0.35), r = sys.world.fxRng.range(0.3, W.range);
    sys.particles.fire(u.x + Math.cos(a) * r, u.y + Math.sin(a) * r, 1);
  }
  if (d > W.range) return;
  let a = Math.atan2(dy, dx) - u.angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  if (Math.abs(a) > (W.cone * Math.PI) / 360) return;
  if (target === sys.world.operative) damageOperative(sys, W.damage * (sys.world.enemyDamage ?? 1), { x: u.x, y: u.y }, 'flame');
  else sys.damageFriendly?.(target, W.damage, { x: u.x, y: u.y });
}
