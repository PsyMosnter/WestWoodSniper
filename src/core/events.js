// @ts-check
/** Tiny pub/sub bus. */
export class Events {
  constructor() { /** @type {Map<string, Set<Function>>} */ this.map = new Map(); }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) { this.map.get(name)?.delete(fn); }
  emit(name, data) {
    const s = this.map.get(name);
    if (s) for (const fn of [...s]) fn(data);
  }
  clear() { this.map.clear(); }
}
