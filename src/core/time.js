// @ts-check
/** Global time state: timeScale 1.0 normal, 0.2 scoped, 0 paused (SPEC §3). */
export const Time = {
  scale: 1,
  simTime: 0,     // seconds of simulated game time
  realTime: 0,    // seconds since boot (real)
  frame: 0,
  tick: 0,
  alpha: 0,       // render interpolation
  fps: 60,
};
