// @ts-check
import { Model, norm } from './model3d.js';

/**
 * Posing kit for the New-style 3D figures and vehicles (model3d.js): small vector helpers in a unit's
 * local frame (f forward, r right, z up), 2-bone IK, and `Rig`, which collects parts in that frame and
 * maps them into world space for one facing (plus an optional whole-body transform, e.g. a fall).
 */
/** @typedef {number[]} V */
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
/** orthonormal basis with forward d and "up-ish" hint */
export function basis(d, up = [0, 0, 1]) {
  const f = norm(d);
  let r = cross(up, f);
  if (len(r) < 1e-4) r = cross([1, 0, 0], f);
  r = norm(r);
  const u = cross(f, r);
  return [f, r, u];   // forward, right, up
}
/** 2-bone IK: joint between a and c with segment lengths l1, l2, bending towards hint */
export function ik(a, c, l1, l2, hint) {
  let d = sub(c, a);
  let dl = len(d);
  const max = (l1 + l2) * 0.999;
  if (dl > max) { d = mul(d, max / dl); dl = max; }
  if (dl < 1e-4) return add(a, mul(norm(hint), l1));
  const u = mul(d, 1 / dl);
  const x = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl);
  const y = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let w = sub(hint, mul(u, dot(hint, u)));
  w = len(w) < 1e-4 ? [0, 0, 1] : norm(w);
  return add(a, add(mul(u, x), mul(w, y)));
}

/**
 * Posed figure builder: collects parts in the local frame, then maps them into world space
 * (yaw to the facing direction, plus an optional whole-body transform used by death animations).
 */
export class Rig {
  constructor(angle, xf = null) {
    this.m = new Model();
    const c = Math.cos(angle), s = Math.sin(angle);
    this.F = [c, s, 0]; this.R = [-s, c, 0];
    this.xf = xf;       // local point → local point (before yaw)
  }
  /** start a new body part (drawn with a shadow line where it overlaps another) */
  part() { this.m.newPart(); }
  /** local → world */
  W(p) {
    const q = this.xf ? this.xf(p) : p;
    return [this.F[0] * q[0] + this.R[0] * q[1], this.F[1] * q[0] + this.R[1] * q[1], q[2]];
  }
  /** local direction → world direction (through the same transform) */
  D(d) {
    const o = this.W([0, 0, 0]), e = this.W(d);
    return norm(sub(e, o));
  }
  cap(a, b, r, mat, zone) { this.m.capsule(this.W(a), this.W(b), r, mat, zone); }
  cyl(a, b, r, mat, zone) { this.m.cylinder(this.W(a), this.W(b), r, mat, zone); }
  ball(c, r, mat, zone) { this.m.ellipsoid(this.W(c), [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [r, r, r], mat, zone); }
  /** ellipsoid with local axes ax (f, r, up) */
  ell(c, ax, rr, mat, zone) {
    const w = ax.map((a) => this.D(a));
    this.m.ellipsoid(this.W(c), orthonormal(w), rr, mat, zone);
  }
  box(c, ax, hh, mat, zone) {
    const w = ax.map((a) => this.D(a));
    this.m.box(this.W(c), orthonormal(w), hh, mat, zone);
  }
}
function orthonormal([a, b]) {
  const f = norm(a);
  let r = sub(b, mul(f, dot(b, f)));
  r = norm(r);
  return [f, r, cross(f, r)];
}
export const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
/** axes pitched forward by a (about the right axis) */
export function pitchAx(a) { return [[Math.cos(a), 0, -Math.sin(a)], [0, 1, 0], [Math.sin(a), 0, Math.cos(a)]]; }

export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
