// @ts-check
import { TILE } from '../core/camera.js';

/**
 * Lightweight particle & tracer system in world px (SPEC §11.3 visuals, §2 gore colours).
 * Particles have a height (z) so blood arcs and falls; gore uses the victim's blood colours only.
 */
export class Particles {
  constructor(rng) {
    this.rng = rng;
    /** @type {any[]} */ this.list = [];
    /** @type {any[]} */ this.tracers = [];
    /** @type {any[]} */ this.flashes = [];
    /** @type {any[]} */ this.texts = [];
    this.max = 900;
  }
  add(p) { if (this.list.length < this.max) this.list.push(p); }
  /** Blood spurt in the unit's colours (never red). dir: radians of the bullet travel. */
  blood(xT, yT, blood, n = 10, dir = null, power = 1) {
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      const a = dir === null ? r.range(0, Math.PI * 2) : dir + r.range(-0.7, 0.7);
      const s = r.range(15, 55) * power;
      this.add({ x: xT * TILE, y: yT * TILE, z: r.range(5, 9), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: r.range(10, 40) * power,
        life: r.range(0.4, 0.9), t: 0, col: r.chance(0.2) ? blood.hi : r.chance(0.5) ? blood.main : blood.shade, size: r.chance(0.3) ? 2 : 1, kind: 'blood', grav: 160 });
    }
  }
  dust(xT, yT, n = 6, col = '#A8987A') {
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      const a = r.range(0, Math.PI * 2);
      this.add({ x: xT * TILE + r.range(-2, 2), y: yT * TILE + r.range(-2, 2), z: 1, vx: Math.cos(a) * r.range(4, 14), vy: Math.sin(a) * r.range(2, 8), vz: r.range(8, 22),
        life: r.range(0.4, 0.8), t: 0, col, size: r.chance(0.4) ? 2 : 1, kind: 'dust', grav: 30 });
    }
  }
  sparks(xT, yT, n = 6, z = 6) {
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      const a = r.range(0, Math.PI * 2);
      this.add({ x: xT * TILE, y: yT * TILE, z, vx: Math.cos(a) * r.range(20, 60), vy: Math.sin(a) * r.range(10, 40), vz: r.range(10, 50),
        life: r.range(0.15, 0.35), t: 0, col: r.chance(0.5) ? '#FFF1A8' : '#FFC24A', size: 1, kind: 'spark', grav: 120 });
    }
  }
  smoke(xT, yT, n = 5, big = 1, col = null) {
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      this.add({ x: xT * TILE + r.range(-3, 3) * big, y: yT * TILE + r.range(-3, 3) * big, z: r.range(2, 8), vx: r.range(-5, 5), vy: r.range(-4, 2), vz: r.range(8, 20) * big,
        life: r.range(0.9, 2.2) * big, t: 0, col: col || (r.chance(0.5) ? '#4A4A46' : '#6A6A64'), size: Math.round(r.range(2, 4) * big), kind: 'smoke', grav: -2 });
    }
  }
  fire(xT, yT, n = 4) {
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      this.add({ x: xT * TILE + r.range(-5, 5), y: yT * TILE + r.range(-4, 4), z: r.range(0, 4), vx: r.range(-4, 4), vy: r.range(-3, 3), vz: r.range(12, 30),
        life: r.range(0.3, 0.7), t: 0, col: r.chance(0.4) ? '#FFF1A8' : r.chance(0.5) ? '#FFC24A' : '#FF7A1A', size: r.chance(0.5) ? 2 : 1, kind: 'fire', grav: -10 });
    }
  }
  debris(xT, yT, n = 10, cols = ['#4A4038', '#6A5A48', '#2A2420']) {
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      const a = r.range(0, Math.PI * 2), s = r.range(20, 80);
      this.add({ x: xT * TILE, y: yT * TILE, z: r.range(2, 8), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: r.range(30, 90),
        life: r.range(0.6, 1.2), t: 0, col: r.pick(cols), size: r.chance(0.5) ? 2 : 1, kind: 'debris', grav: 200 });
    }
  }
  tracer(x0, y0, x1, y1, col = '#FFE08A', life = 0.1, w = 2) { this.tracers.push({ x0: x0 * TILE, y0: y0 * TILE, x1: x1 * TILE, y1: y1 * TILE, t: 0, life, col, w }); }
  muzzle(xT, yT, z = 8) { this.flashes.push({ x: xT * TILE, y: yT * TILE - z, t: 0, life: 0.09 }); }
  text(xT, yT, text, col = '#FFFFFF', life = 1.2) { this.texts.push({ x: xT * TILE, y: yT * TILE - 18, text, col, t: 0, life }); }
  /** world-time update (respects slow-mo) */
  update(dt, onLand) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.t += dt;
      if (p.t >= p.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.grav * dt;
      if (p.z <= 0 && p.grav > 0) {
        p.z = 0;
        if (p.kind === 'blood' && onLand) { onLand(p); L[i] = L[L.length - 1]; L.pop(); continue; }
        p.vx *= 0.3; p.vy *= 0.3; p.vz = 0;
      }
      if (p.kind === 'smoke') { p.vx *= 0.98; }
    }
    for (const a of [this.tracers, this.flashes, this.texts]) {
      for (let i = a.length - 1; i >= 0; i--) { a[i].t += dt; if (a[i].t >= a[i].life) a.splice(i, 1); }
    }
  }
  draw(ctx, cam, scopeView = false) {
    const z = cam.zoom, L = cam.left, T = cam.top;
    for (const p of this.list) {
      if (scopeView && (p.kind === 'blood' || p.kind === 'spark')) continue; // the scope draws its own fine spray
      const k = p.t / p.life;
      if (p.kind === 'smoke') ctx.globalAlpha = 0.55 * (1 - k);
      else if (p.kind === 'dust') ctx.globalAlpha = 0.8 * (1 - k);
      ctx.fillStyle = p.col;
      const s = p.kind === 'smoke' ? Math.round(p.size * (1 + k)) : p.size;
      ctx.fillRect(Math.round((p.x - L) * z), Math.round((p.y - p.z - T) * z), s * z, s * z);
      ctx.globalAlpha = 1;
    }
    for (const t of this.tracers) {
      ctx.strokeStyle = t.col;
      ctx.globalAlpha = 1 - t.t / t.life;
      ctx.lineWidth = Math.max(1, z) * (t.w || 1);
      ctx.beginPath();
      ctx.moveTo(Math.round((t.x0 - L) * z) + 0.5, Math.round((t.y0 - 7 - T) * z) + 0.5);
      ctx.lineTo(Math.round((t.x1 - L) * z) + 0.5, Math.round((t.y1 - 6 - T) * z) + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const f of this.flashes) {
      const X = Math.round((f.x - L) * z), Y = Math.round((f.y - T) * z);
      const big = f.t < f.life * 0.5;
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(X - z, Y - z, 3 * z, 3 * z);
      ctx.fillStyle = '#FFC24A';
      const r = big ? 3 : 2;
      ctx.fillRect(X - r * z, Y, z, z); ctx.fillRect(X + r * z, Y, z, z); ctx.fillRect(X, Y - r * z, z, z); ctx.fillRect(X, Y + r * z, z, z);
      if (big) { ctx.fillStyle = 'rgba(255,241,168,0.35)'; ctx.fillRect(X - 3 * z, Y - 3 * z, 7 * z, 7 * z); }
    }
  }
}
