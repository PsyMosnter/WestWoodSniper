// @ts-check
/**
 * Scene manager: one active scene plus an optional overlay stack (pause menu etc).
 * Scenes implement any of: enter(params), exit(), update(dt), frame(realDt), render(ctx, alpha),
 * onPointerDown/Move/Up, onHover, onKeyDown/Up, onWheel, resize(W,H).
 */
export class SceneManager {
  constructor(app) {
    this.app = app;
    this.stack = [];
    this.registry = new Map();
  }
  register(name, factory) { this.registry.set(name, factory); }
  get top() { return this.stack[this.stack.length - 1]; }
  /** Replace the whole stack with a new scene */
  go(name, params = {}) {
    while (this.stack.length) this.stack.pop().exit?.();
    this.push(name, params);
  }
  push(name, params = {}) {
    const f = this.registry.get(name);
    if (!f) throw new Error('Unknown scene ' + name);
    const s = f(this.app);
    s.name = name;
    this.stack.push(s);
    s.enter?.(params);
    s.resize?.(this.app.display.W, this.app.display.H);
    return s;
  }
  pop() {
    const s = this.stack.pop(); s?.exit?.();
    this.top?.resumed?.();          // the scene below gets input again: drop presses that ended on the overlay
    return s;
  }
  update(dt) {
    // Only the base scene simulates; overlays may block it (via Time.scale = 0)
    this.stack[0]?.update?.(dt);
    for (let i = 1; i < this.stack.length; i++) this.stack[i].update?.(dt);
  }
  frame(dt) { for (const s of this.stack) s.frame?.(dt); }
  render(ctx, alpha) { for (const s of this.stack) s.render?.(ctx, alpha); }
  resize(W, H) { for (const s of this.stack) s.resize?.(W, H); }
  // input goes to the top scene only
  onPointerDown(p) { this.top?.onPointerDown?.(p); }
  onPointerMove(p) { this.top?.onPointerMove?.(p); }
  onPointerUp(p, c) { this.top?.onPointerUp?.(p, c); }
  onHover(x, y) { this.top?.onHover?.(x, y); }
  onKeyDown(code, e) { this.top?.onKeyDown?.(code, e); }
  onKeyUp(code, e) { this.top?.onKeyUp?.(code, e); }
  onWheel(d, x, y) { this.top?.onWheel?.(d, x, y); }
}
