// @ts-check
import { BALANCE } from '../config/balance.js';
import { Time } from './time.js';

export const TILE = 16;

/** World camera. Positions in world px; x,y is the view centre. */
export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.viewW = 480; this.viewH = 270;
    this.zoom = 1;
    this.mapW = 0; this.mapH = 0; // px
    this.follow = true;
    this.target = null; // {x,y} in tiles (interpolated getter supplied)
    this.shakeAmt = 0; this.shakeX = 0; this.shakeY = 0;
    this.pan = null; // scripted pan {x,y,t,dur,sx,sy}
  }
  setView(w, h) { this.viewW = w; this.viewH = h; this.clamp(); }
  setMap(wTiles, hTiles) { this.mapW = wTiles * TILE; this.mapH = hTiles * TILE; }
  get halfW() { return this.viewW / 2 / this.zoom; }
  get halfH() { return this.viewH / 2 / this.zoom; }
  /** top-left in world px (integer, including shake) */
  get left() { return Math.round((this.x - this.halfW + this.shakeX) * this.zoom) / this.zoom; }
  get top() { return Math.round((this.y - this.halfH + this.shakeY) * this.zoom) / this.zoom; }
  centreOn(xTiles, yTiles) { this.x = xTiles * TILE; this.y = yTiles * TILE; this.clamp(); }
  panBy(dxPx, dyPx) { this.x += dxPx / this.zoom; this.y += dyPx / this.zoom; this.follow = false; this.pan = null; this.clamp(); }
  panTo(xTiles, yTiles, dur = 1.0) { this.pan = { sx: this.x, sy: this.y, x: xTiles * TILE, y: yTiles * TILE, t: 0, dur }; this.follow = false; }
  shake(amount) {
    if (this.reducedMotion) return;
    this.shakeAmt = Math.min(8, Math.max(this.shakeAmt, amount));
  }
  clamp() {
    const hw = this.halfW, hh = this.halfH;
    const margin = 24; // allow a little over-scroll past the map edge for HUD overlap
    if (this.mapW <= hw * 2) this.x = this.mapW / 2; else this.x = Math.max(hw - margin, Math.min(this.mapW - hw + margin, this.x));
    if (this.mapH <= hh * 2) this.y = this.mapH / 2; else this.y = Math.max(hh - margin, Math.min(this.mapH - hh + margin, this.y));
  }
  /** per-frame, real dt */
  update(dt, targetPx) {
    if (this.pan) {
      const p = this.pan; p.t += dt;
      const k = Math.min(1, p.t / p.dur); const e = k * k * (3 - 2 * k);
      this.x = p.sx + (p.x - p.sx) * e; this.y = p.sy + (p.y - p.sy) * e;
      if (k >= 1) this.pan = null;
    } else if (this.follow && targetPx) {
      // Lock-step follow: the camera is the target's *rounded* position plus a decaying integer
      // offset, so the followed unit never wobbles ±1 px against the camera (critic #2).
      const tx = Math.round(targetPx.x * this.zoom) / this.zoom, ty = Math.round(targetPx.y * this.zoom) / this.zoom;
      if (!this.fo) this.fo = { x: this.x - tx, y: this.y - ty };
      const f = Math.exp(-dt * BALANCE.camera.followLerp);
      this.fo.x *= f; this.fo.y *= f;
      if (Math.abs(this.fo.x) < 0.5) this.fo.x = 0;
      if (Math.abs(this.fo.y) < 0.5) this.fo.y = 0;
      this.x = tx + Math.round(this.fo.x * this.zoom) / this.zoom;
      this.y = ty + Math.round(this.fo.y * this.zoom) / this.zoom;
    }
    if (!this.follow || this.pan) this.fo = null;
    this.clamp();
    if (this.shakeAmt > 0.05) {
      const t = Time.realTime * 60;
      this.shakeX = Math.sin(t * 1.7) * this.shakeAmt;
      this.shakeY = Math.cos(t * 2.3) * this.shakeAmt * 0.8;
      this.shakeAmt *= Math.exp(-dt * BALANCE.camera.shakeDecay);
    } else { this.shakeAmt = 0; this.shakeX = 0; this.shakeY = 0; }
  }
  /** screen px → world tiles (float) */
  screenToTile(sx, sy) {
    return { x: (this.left + sx / this.zoom) / TILE, y: (this.top + sy / this.zoom) / TILE };
  }
  /** world tiles → screen px */
  tileToScreen(tx, ty) {
    return { x: (tx * TILE - this.left) * this.zoom, y: (ty * TILE - this.top) * this.zoom };
  }
}
