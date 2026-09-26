// @ts-check
import { BALANCE } from '../config/balance.js';

/**
 * @typedef {Object} Ptr
 * @property {number} id
 * @property {number} x
 * @property {number} y
 * @property {number} startX
 * @property {number} startY
 * @property {number} lastX
 * @property {number} lastY
 * @property {number} t0
 * @property {number} button
 * @property {string} type
 * @property {boolean} shift
 * @property {any} [owner]   whoever claimed this pointer (widget, gesture, scope)
 */

/**
 * Raw input: pointers (logical coords), keys, wheel. Dispatches to one handler (the scene stack).
 */
export class Input {
  /** @param {HTMLCanvasElement} canvas @param {import('./display.js').Display} display */
  constructor(canvas, display) {
    this.canvas = canvas; this.display = display;
    /** @type {Map<number, Ptr>} */ this.pointers = new Map();
    /** @type {Set<string>} */ this.keys = new Set();
    this.mouse = { x: -1, y: -1, inside: false };
    this.handler = null;
    this.usedTouch = false;
    this.unlockCallbacks = [];

    const opts = { passive: false };
    canvas.addEventListener('pointerdown', (e) => this._down(e), opts);
    window.addEventListener('pointermove', (e) => this._move(e), opts);
    window.addEventListener('pointerup', (e) => this._up(e), opts);
    window.addEventListener('pointercancel', (e) => this._up(e, true), opts);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = display.toLogical(e.clientX, e.clientY);
      this.handler?.onWheel?.(e.deltaY, p.x, p.y);
    }, opts);
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (!['KeyW','KeyA','KeyS','KeyD'].includes(e.code)) return; }
      this.keys.add(e.code);
      if (['Space', 'Backquote', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F5', 'F9'].includes(e.code)) e.preventDefault();   // F5/F9: quick save/load, not reload
      this.handler?.onKeyDown?.(e.code, e);
      this._unlock();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); this.handler?.onKeyUp?.(e.code, e); });
    window.addEventListener('blur', () => { this.keys.clear(); });
    // iOS: block pinch-zoom / double-tap zoom of the page itself
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, opts);
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), opts);
  }
  onUnlock(fn) { this.unlockCallbacks.push(fn); }
  _unlock() {
    if (!this.unlockCallbacks.length) return;
    const cbs = this.unlockCallbacks; this.unlockCallbacks = [];
    for (const f of cbs) { try { f(); } catch (e) { console.warn(e); } }
  }
  _mk(e) {
    const p = this.display.toLogical(e.clientX, e.clientY);
    return p;
  }
  _down(e) {
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    this.canvas.focus?.();
    if (e.pointerType === 'touch') this.usedTouch = true;
    const p = this._mk(e);
    /** @type {Ptr} */
    const ptr = {
      id: e.pointerId, x: p.x, y: p.y, startX: p.x, startY: p.y, lastX: p.x, lastY: p.y,
      t0: performance.now(), button: e.button, type: e.pointerType, shift: e.shiftKey,
    };
    this.pointers.set(e.pointerId, ptr);
    this._unlock();
    this.handler?.onPointerDown?.(ptr);
  }
  _move(e) {
    const p = this._mk(e);
    if (e.pointerType === 'mouse') {
      this.mouse.x = p.x; this.mouse.y = p.y;
      this.mouse.inside = p.x >= 0 && p.y >= 0 && p.x < this.display.W && p.y < this.display.H;
    }
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) { this.handler?.onHover?.(p.x, p.y); return; }
    e.preventDefault();
    ptr.lastX = ptr.x; ptr.lastY = ptr.y;
    ptr.x = p.x; ptr.y = p.y;
    ptr.shift = e.shiftKey;
    this.handler?.onPointerMove?.(ptr);
  }
  _up(e, cancel = false) {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    const p = this._mk(e);
    ptr.x = p.x; ptr.y = p.y;
    this.pointers.delete(e.pointerId);
    this.handler?.onPointerUp?.(ptr, cancel);
  }
  isDown(code) { return this.keys.has(code); }
}

/**
 * Gesture recognizer for world interaction (SPEC §5.1 gesture rules).
 * - tap: short press, < 8 px movement. Dispatched immediately on release.
 * - doubleTap: a 2nd tap within 300 ms & 24 px — fired *in addition* to the first tap (upgrade).
 * - longPress: held ≥ 450 ms without dragging (fires while held).
 * - drag: movement > 8 px (single pointer) → pan.
 * - pinch: two pointers.
 */
export class Gestures {
  /** @param {Object} cb callbacks */
  constructor(cb) {
    this.cb = cb;
    /** @type {Map<number, any>} */ this.active = new Map();
    this.lastTap = null;
    this.mode = 'idle'; // idle | press | drag | long | pinch
    this.pinchStart = 0; this.pinchLast = 1;
  }
  reset() { this.active.clear(); this.mode = 'idle'; }
  /** @param {Ptr} p */
  down(p) {
    this.active.set(p.id, { x: p.x, y: p.y, sx: p.x, sy: p.y, t0: p.t0, button: p.button, shift: p.shift });
    if (this.active.size === 2) {
      if (this.mode === 'drag') this.cb.dragEnd?.();
      if (this.mode === 'long') this.cb.longPressEnd?.();
      this.mode = 'pinch';
      const [a, b] = [...this.active.values()];
      this.pinchStart = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      this.pinchLast = 1;
      return;
    }
    if (this.active.size > 2) return;
    if (p.button === 2 || p.button === 1) { this.mode = 'drag'; this.cb.dragStart?.(p.x, p.y); return; }
    this.mode = 'press';
  }
  /** @param {Ptr} p */
  move(p) {
    const a = this.active.get(p.id);
    if (!a) return;
    const dx = p.x - a.x, dy = p.y - a.y;
    a.x = p.x; a.y = p.y;
    if (this.mode === 'pinch') {
      const [u, v] = [...this.active.values()];
      if (!v) return;
      const d = Math.hypot(u.x - v.x, u.y - v.y) || 1;
      const s = d / this.pinchStart;
      this.cb.pinch?.(s / this.pinchLast, (u.x + v.x) / 2, (u.y + v.y) / 2);
      this.pinchLast = s;
      return;
    }
    if (this.mode === 'press') {
      if (Math.hypot(p.x - a.sx, p.y - a.sy) > BALANCE.input.tapMaxMove) {
        this.mode = 'drag';
        this.cb.dragStart?.(a.sx, a.sy);
        this.cb.drag?.(p.x - a.sx, p.y - a.sy);
      }
      return;
    }
    if (this.mode === 'drag') this.cb.drag?.(dx, dy);
  }
  /** @param {Ptr} p */
  up(p, cancel = false) {
    const a = this.active.get(p.id);
    if (!a) return;
    this.active.delete(p.id);
    if (this.mode === 'pinch') { if (this.active.size === 0) this.mode = 'idle'; return; }
    const mode = this.mode;
    this.mode = this.active.size ? this.mode : 'idle';
    if (cancel) { if (mode === 'drag') this.cb.dragEnd?.(); return; }
    if (mode === 'drag') { this.cb.dragEnd?.(); return; }
    if (mode === 'long') { this.cb.longPressEnd?.(p.x, p.y); return; }
    if (mode === 'press') {
      const dur = performance.now() - a.t0;
      if (dur <= BALANCE.input.tapMaxMs) {
        const now = performance.now();
        const lt = this.lastTap;
        if (lt && now - lt.t <= BALANCE.input.doubleTapMs && Math.hypot(p.x - lt.x, p.y - lt.y) <= BALANCE.input.doubleTapDist) {
          this.lastTap = null;
          this.cb.doubleTap?.(p.x, p.y, { shift: a.shift });
        } else {
          this.lastTap = { t: now, x: p.x, y: p.y };
          this.cb.tap?.(p.x, p.y, { shift: a.shift, button: a.button });
        }
      }
    }
  }
  /** Call every frame to fire long-presses while held. */
  update() {
    if (this.mode !== 'press' || this.active.size !== 1) return;
    const a = [...this.active.values()][0];
    if (performance.now() - a.t0 >= BALANCE.input.longPressMs) {
      this.mode = 'long';
      this.lastTap = null;
      this.cb.longPress?.(a.x, a.y, { shift: a.shift });
    }
  }
}
