// @ts-check
import { BALANCE } from '../config/balance.js';
import { BLOOD } from '../config/palette.js';
import { unitDef } from './defs.js';
import { angleToDir8, dirIndex, dir8ToAngle } from '../world/tiles.js';
import { Art } from '../render/artStyle.js';

let NEXT_ID = 1;

/**
 * NOT unit (infantry or beast). Vehicles extend this in vehicle.js.
 * Position (x, y) in tiles; `angle` is the continuous facing used by the vision cone.
 */
export class Unit {
  constructor(world, spec) {
    this.world = world;
    this.id = spec.id || `u${NEXT_ID++}`;
    this.type = spec.type;
    this.def = unitDef(spec.type);
    this.kind = this.def.kind;
    this.team = 'NOT';
    this.profile = this.def.vision || 'infantry';
    this.x = spec.x + 0.5; this.y = spec.y + 0.5;
    this.px = this.x; this.py = this.y;
    this.angle = dir8ToAngle(dirIndex(spec.facing || 'S'));
    this.targetAngle = this.angle;
    this.hp = this.def.hp; this.maxHp = this.def.hp;
    this.dead = false; this.deathT = 0;
    this.wounded = false; this.speedMult = 1;
    this.blood = BLOOD[world.rng.int(0, BLOOD.length - 1)];
    this.alertGroup = spec.alertGroup || 'default';
    this.behaviour = spec.behaviour || { kind: 'sentry' };
    this.targetsTrucks = !!spec.targetsTrucks;   // M4 ambushers: only engage trucks that come within range
    this.hidden = !!spec.hidden;
    this.state = 'unaware';
    this.stateT = 0;
    this.det = 0;                 // detection meter for the Operative
    this.detF = new Map();        // detection meters for friendlies
    this.seesOp = false;
    this.lastKnown = null;        // {x,y} where this unit last saw WREN
    this.poi = null;
    /** @type {{x:number,y:number}[]} */
    this.path = [];
    this.moveMode = 'walk';
    this.animT = world.rng.next() * 4;
    this.percT = world.rng.next() * 0.1; // staggered perception
    this.fireT = world.rng.range(0.3, 1.2);
    this.burstLeft = 0; this.burstT = 0;
    this.pistolHits = 0;          // rolled on first pistol shot
    this.hasRadio = !!this.def.radio;
    this.helmet = !!this.def.helmet;
    this.radioT = 0;
    this.blindT = 0;
    this.staggerT = 0;
    this.flashT = 0;
    this.visionMult = 1;
    this.home = { x: this.x, y: this.y, angle: this.angle };
    this.pathIdx = 0; this.pathDir = 1; this.waitT = 0;
    this.search = null;           // {pts:[], i, t}
    this.examine = null;          // corpse being examined
    this.coverSpot = null;
    this.seenByPlayerT = -999;    // world time when the player last saw this unit
    this.tag = null;              // floating tag {text, t}
    this.important = !!spec.important;
    this.training = !!spec.training;   // Boot Camp dummy: sees and reacts, never fires (src/missions/bc.js)
    this.name = spec.name || this.def.name;
  }
  get tx() { return Math.floor(this.x); }
  get ty() { return Math.floor(this.y); }
  get elev() { return this.world.map.elevAt(this.tx, this.ty); }
  get dir() { return angleToDir8(this.angle); }
  get alive() { return !this.dead; }
  get moving() { return this.path.length > 0; }
  setState(s) { if (this.state !== s) { this.state = s; this.stateT = 0; } }
  speed() {
    const d = this.def;
    let s = this.moveMode === 'run' ? d.runSpeed || d.speed * 1.8 : d.speed;
    const g = this.world.alerts?.group(this.alertGroup);
    if (g && g.level !== 'calm' && this.moveMode === 'walk') s *= BALANCE.ai.cautionSpeed;
    return s * this.speedMult * (this.staggerT > 0 ? 0.2 : 1);
  }
  /** Path to a tile; returns false if unreachable. */
  goTo(tx, ty, mode = 'walk') {
    const m = this.world.map;
    const goal = m.walkable(tx, ty) ? { x: tx, y: ty } : m.nearestWalkable(tx, ty, 3);
    if (!goal) return false;
    if (goal.x === this.tx && goal.y === this.ty) { this.path = []; return true; }
    const p = this.world.pf.find(this.tx, this.ty, goal.x, goal.y, { partial: true, maxIter: 6000 });
    if (!p) return false;
    this.path = this.world.smoothPath(this.x, this.y, p);
    this.moveMode = mode;
    return true;
  }
  stop() { this.path = []; }
  face(x, y) { this.targetAngle = Math.atan2(y - this.y, x - this.x); }
  /** Movement + turning; returns true when the path finished this tick. */
  step(dt) {
    this.px = this.x; this.py = this.y;
    // turn toward target angle
    let da = this.targetAngle - this.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const turn = 5 * dt;
    this.angle += Math.abs(da) <= turn ? da : Math.sign(da) * turn;
    if (!this.path.length) return false;
    const m = this.world.map;
    const c = m.cost[m.idx(this.tx, this.ty)];
    let budget = this.speed() / Math.max(0.6, Math.min(3, c === Infinity ? 1 : c)) * dt;
    while (budget > 0 && this.path.length) {
      const wp = this.path[0];
      const tx = wp.x + 0.5, ty = wp.y + 0.5;
      const dx = tx - this.x, dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-4) this.targetAngle = Math.atan2(dy, dx);
      if (d <= budget) { this.x = tx; this.y = ty; budget -= d; this.path.shift(); }
      else { this.x += (dx / d) * budget; this.y += (dy / d) * budget; budget = 0; }
    }
    this.animT += dt * (this.moveMode === 'run' ? 1.4 : 1);
    return this.path.length === 0;
  }
  pose() {
    if (this.dead) return { pose: 'dead', frame: Math.min(Art.frames('dead') - 1, Math.floor(this.deathT / Art.deadStep)) };
    if (this.moving) {
      // a cycle takes as long in every style; Newest just draws it in 6 frames instead of 4
      const pose = this.moveMode === 'run' ? 'run' : 'walk', n = Art.frames(pose);
      return { pose, frame: Math.floor(this.animT * (pose === 'run' ? 7 : 5) * n / 4) % n };
    }
    if (this.firingT > 0) return { pose: 'fire', frame: 0 };
    if (this.state === 'combat' && this.coverSpot && this.tx === this.coverSpot.x && this.ty === this.coverSpot.y) return { pose: 'crouch', frame: 0 };
    return { pose: 'idle', frame: 0 };
  }
}
