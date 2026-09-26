// @ts-check
import { Time } from './time.js';
import { BALANCE } from '../config/balance.js';

/**
 * Fixed-timestep loop (30 Hz sim) with render interpolation (SPEC §3).
 * update(dt) receives fixed sim dt (already includes time scale via step skipping).
 * frame(realDt) runs once per animation frame with real seconds.
 * render(alpha) draws with interpolation factor.
 */
export class Loop {
  constructor({ update, frame, render }) {
    this.update = update; this.frame = frame; this.render = render;
    this.step = 1 / BALANCE.sim.hz;
    this.acc = 0; this.last = 0; this.running = false;
    this.fpsAcc = 0; this.fpsFrames = 0;
    this._raf = this._raf.bind(this);
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._raf);
  }
  _raf(now) {
    if (!this.running) return;
    let realDt = (now - this.last) / 1000;
    this.last = now;
    if (realDt > 0.25) realDt = 0.25; // tab switch etc.
    if (realDt < 0) realDt = 0;
    Time.realTime += realDt;
    Time.frame++;
    this.fpsAcc += realDt; this.fpsFrames++;
    if (this.fpsAcc >= 0.5) { Time.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }

    this.frame(realDt);
    this.acc += realDt * Time.scale;
    let steps = 0;
    while (this.acc >= this.step && steps < BALANCE.sim.maxStepsPerFrame) {
      this.update(this.step);
      Time.simTime += this.step;
      Time.tick++;
      this.acc -= this.step;
      steps++;
    }
    if (steps >= BALANCE.sim.maxStepsPerFrame) this.acc = 0;
    Time.alpha = this.acc / this.step;
    this.render(Time.alpha);
    requestAnimationFrame(this._raf);
  }
}
