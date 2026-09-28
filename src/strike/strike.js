// @ts-check
import { BALANCE } from '../config/balance.js';
import { C } from '../config/palette.js';
import { TILE } from '../core/camera.js';
import { Time } from '../core/time.js';
import { canSee } from '../world/los.js';
import { makeCanvas, Pix } from '../render/pixel.js';
import { Rng } from '../core/rng.js';
import { drawText } from '../render/font.js';
import { craterDecal } from '../render/decals.js';
import { makeSuspicious } from '../ai/fsm.js';

const S = BALANCE.strike;

/**
 * Strategic strike via the laser designator (SPEC §14): targeting (range ring, jammer overlay),
 * a 6 s channel visible to the enemy, 8 s inbound countdown, impact rings, crater & fallout.
 */
export class StrikeSystem {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.state = 'idle';      // idle | targeting | channel | inbound | impact
    this.target = null;
    this.t = 0;
    this.fallout = [];        // {x,y,t}
    this.craters = [];        // {x,y} — kept for checkpoints
    this.cloud = null;        // {x,y,t}
    this.flashT = 0;
    this.blindOp = 0;
  }
  jammers() { return this.world.structures.filter((s) => s.type === 'jammer' && !s.dead && !s.st.unpowered); }
  jammed(x, y) { return this.jammers().some((j) => Math.hypot(j.cx - x, j.cy - y) <= S.jammerRadius); }
  range(x, y) {
    const op = this.world.operative, m = this.world.map;
    const adv = Math.max(0, op.elev - m.elevAt(Math.floor(x), Math.floor(y)));
    return S.range + adv * S.rangePerElev;
  }
  canUse() {
    const op = this.world.operative;
    if (op.designator <= 0) return 'NO STRIKE CHARGES';
    if (!(op.stance === 'crouch' || op.stance === 'cover' || op.stance === 'hunker') || op.moving || op.trans) return 'CROUCH, COVER OR HUNKER FIRST';
    if (this.state === 'channel' || this.state === 'inbound') return 'STRIKE ALREADY UNDERWAY';
    return null;
  }
  toggleTargeting() {
    const g = this.game;
    if (this.state === 'targeting') { this.state = 'idle'; g.mode = 'normal'; return; }
    const why = this.canUse();
    if (why) { g.hud.toast(why, C.uiAmber); return; }
    this.state = 'targeting'; g.mode = 'designator';
    g.hud.toast('TAP A TARGET YOU CAN SEE', C.uiAmber, 1.8);
  }
  /** a tap while targeting */
  tapTarget(tx, ty) {
    const g = this.game, w = this.world, op = w.operative;
    const x = tx + 0.5, y = ty + 0.5;
    const d = Math.hypot(x - op.x, y - op.y);
    if (d > this.range(x, y)) { g.hud.toast('OUT OF DESIGNATOR RANGE', C.uiAmber); return true; }
    if (!canSee(w.map, op.tx, op.ty, tx, ty, {}) || !w.fog.isVisible(tx, ty)) { g.hud.toast('NO LINE OF SIGHT', C.uiAmber); return true; }
    if (this.jammed(x, y)) { g.hud.toast('STRIKE BLOCKED — JAMMER', C.uiAlert, 2); g.audio?.play?.('dry'); return true; }
    this.target = { x, y };
    this.state = 'channel'; this.t = 0; g.mode = 'normal';
    this.opPos = { x: op.x, y: op.y, stance: op.stance };
    this.hp0 = op.hp;
    g.hud.say('Painting target. Hold steady…');
    g.audio?.play?.('laser');
    return true;
  }
  /** Is WREN inside the lethal outer radius of the painted point? */
  opInBlast() {
    const op = this.world.operative, t = this.target;
    return !!t && !op.dead && Math.hypot(op.x - t.x, op.y - t.y) <= S.outer;
  }
  /** The dot's tile plus the beam's tiles within `beamSuspicionTiles` of it (what the enemy can spot). */
  beamTiles() {
    const op = this.world.operative, t = this.target;
    const d = Math.hypot(op.x - t.x, op.y - t.y) || 1, ux = (op.x - t.x) / d, uy = (op.y - t.y) / d;
    const out = [];
    for (let k = 0; k <= Math.min(S.beamSuspicionTiles, d); k++) {
      const p = { x: Math.floor(t.x + ux * k), y: Math.floor(t.y + uy * k) };
      if (!out.some((q) => q.x === p.x && q.y === p.y)) out.push(p);
    }
    return out;
  }
  breakChannel(why) {
    this.state = 'idle'; this.target = null;
    this.game.hud.toast('LASER LOST — ' + why, C.uiAmber, 1.6);
  }
  update(dt) {
    const g = this.game, w = this.world, op = w.operative;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.blindOp > 0) this.blindOp -= dt;
    for (const f of this.fallout) {
      f.t -= dt;
      if (Math.hypot(op.x - f.x, op.y - f.y) <= S.falloutRadius) g.combat.damageOp(S.falloutDps * dt, null, 'fallout');
      for (const u of w.units) if (!u.dead && Math.hypot(u.x - f.x, u.y - f.y) <= S.falloutRadius && u.kind !== 'vehicle') { u.hp -= S.falloutDps * dt; if (u.hp <= 0) g.combat.kill(u, { by: 'fallout' }); }
    }
    this.fallout = this.fallout.filter((f) => f.t > 0);
    if (this.cloud) { this.cloud.t += dt; if (this.cloud.t > 6) this.cloud = null; }
    if (this.state === 'channel') {
      this.t += dt;
      // breaks if WREN moves, changes stance or takes >10 damage in one hit
      if (op.moving || op.stance !== this.opPos.stance || Math.hypot(op.x - this.opPos.x, op.y - this.opPos.y) > 0.3) { this.breakChannel('YOU MOVED'); return; }
      if ((op.lastHit || 0) > S.channelBreakDamage && op.hp < this.hp0) { this.breakChannel('HIT'); op.lastHit = 0; return; }
      this.hp0 = op.hp;
      // the laser is visible: enemies seeing the dot or the last 4 tiles of the beam grow suspicious along it
      if ((this.susT = (this.susT || 0) - dt) <= 0) {
        this.susT = 0.5;
        const tt = this.target, pts = this.beamTiles();
        for (const u of w.units) {
          if (u.dead || u.hidden || u.state === 'combat' || !u.goTo || u.blindT > 0) continue;
          if (Math.hypot(u.x - tt.x, u.y - tt.y) >= 12) continue;
          if (pts.some((p) => canSee(w.map, u.tx, u.ty, p.x, p.y, {}))) { makeSuspicious(u, op.x, op.y); u.tag = { text: '?', t: 1.2 }; }
        }
      }
      if (this.t >= S.channel) {
        op.designator--;
        this.state = 'inbound'; this.t = S.inbound;
        g.hud.say(this.opInBlast() ? 'Strike confirmed. Impact in eight — you\'re danger close, WREN, MOVE!' : 'Strike confirmed. Impact in eight.', true);
        w.alerts.raiseAll('alarm', 'strike inbound');
        g.audio?.play?.('whistle');
      }
    } else if (this.state === 'inbound') {
      this.t -= dt;
      if (this.t <= 0) this.impact();
    }
  }
  impact() {
    const g = this.game, w = this.world, op = w.operative, tg = this.target;
    this.state = 'idle';
    this.flashT = 0.12;
    this.cloud = { x: tg.x, y: tg.y, t: 0 };
    g.cam.shake(8);
    g.audio?.play?.('nuke');
    w.noise(tg.x, tg.y, 999, 'strike');
    w.fog.reveal(tg.x, tg.y, S.revealRadius, S.revealTime);
    const inR = (x, y, r) => Math.hypot(x - tg.x, y - tg.y) <= r;
    // units
    for (const u of w.units) {
      if (u.dead || u.invulnerable) continue;
      const d = Math.hypot(u.x - tg.x, u.y - tg.y);
      if (d <= S.inner) { u.hidden = false; g.combat.kill(u, { by: 'strike' }); }
      else if (d <= S.outer) {
        if (u.kind === 'vehicle' || u.kind === 'turret') { u.hp -= u.maxHp * S.outerFrac; if (u.hp <= 0) g.combat.kill(u, { by: 'strike' }); }
        else g.combat.kill(u, { by: 'strike' });
      } else if (d <= S.flash && u.kind !== 'vehicle') { u.blindT = S.blindTime; u.det = 0; }
    }
    for (const f of w.friendlies) if (!f.dead && inR(f.x, f.y, S.outer)) g.friendlies?.damage(f, f.maxHp * (inR(f.x, f.y, S.inner) ? 1 : S.outerFrac) + 1, tg);
    // structures (hardened ones take 25 % — structures.damage() applies that multiplier itself)
    for (const s of w.structures) {
      if (s.dead) continue;
      const d = s.distTo(tg.x, tg.y);
      if (d <= S.inner) { if (s.hardened) g.structures.damage(s, s.maxHp, { by: 'strike' }); else g.structures.destroy(s, { by: 'strike' }); }
      else if (d <= S.outer) g.structures.damage(s, s.maxHp * S.outerFrac, { by: 'strike' });
    }
    // WREN: dies inside the outer radius; blinded in the flash radius unless hunkered
    const dop = Math.hypot(op.x - tg.x, op.y - tg.y);
    if (dop <= S.outer) g.combat.damageOp(9999, tg, 'strike');
    else if (dop <= S.flash && !op.hunkered) this.blindOp = S.blindTime;
    // crater (impassable 3×3 centre, rubble ring) + fallout
    this.crater(tg.x, tg.y);
    this.fallout.push({ x: tg.x, y: tg.y, t: S.falloutTime });
    g.combat.particles.debris(tg.x, tg.y, 80, ['#2A2426', '#4A3A36', '#FF7A1A', '#FFC24A']);
    g.combat.particles.smoke(tg.x, tg.y, 40, 3);
    this.target = null;
    w.events.emit('strike', { x: tg.x, y: tg.y });
  }
  /** Scar the ground: impassable 3×3 centre, rubble ring, scorch decal. Also used to restore checkpoints. */
  crater(x, y) {
    const g = this.game, m = this.world.map;
    const cx = Math.floor(x), cy = Math.floor(y);
    this.craters.push({ x, y });
    for (let yy = cy - 3; yy <= cy + 3; yy++) for (let xx = cx - 3; xx <= cx + 3; xx++) {
      if (!m.inb(xx, yy)) continue;
      // the bowl is impassable; the crater decal does the drawing (tile-shaped rubble read as a square)
      if (Math.hypot(xx - cx, yy - cy) <= 1.5) m.setBlocked(xx, yy, true);
      g.renderer?.terrain.invalidateTile(xx, yy);
    }
    g.renderer?.terrain.addDecal(craterDecal(x, y, 5, 99));
  }

  // ---------------------------------------------------------------- drawing
  /** world-space: range ring & jammer hatch (targeting), laser, warning ring, fallout, cloud */
  draw(ctx, r) {
    const w = this.world, op = w.operative, z = r.cam.zoom;
    if (this.state === 'targeting') {
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 0, r.cam.viewW, r.cam.viewH);
      // jammer coverage: violet hatch
      for (const j of this.jammers()) hatchCircle(ctx, r, j.cx, j.cy, S.jammerRadius, 'rgba(155,90,224,0.55)');
      dashedCircle(ctx, r, op.x, op.y, this.range(op.x, op.y), C.uiAlert);
    }
    if (this.state === 'channel' && this.target) {
      const t = this.target;
      const pulse = 0.6 + 0.4 * Math.sin(Time.realTime * 20);
      ctx.strokeStyle = `rgba(255,60,40,${(0.55 + 0.3 * pulse).toFixed(2)})`; ctx.lineWidth = z;
      ctx.beginPath(); ctx.moveTo(r.sx(op.x), r.sy(op.y) - 6 * z); ctx.lineTo(r.sx(t.x), r.sy(t.y)); ctx.stroke();
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(Math.round(r.sx(t.x)) - z, Math.round(r.sy(t.y)) - z, 3 * z, 3 * z);
      ctx.strokeStyle = C.uiAlert; dashedCircle(ctx, r, t.x, t.y, 0.8 + pulse * 0.4, C.uiAlert);
      const k = this.t / S.channel;
      drawText(ctx, `PAINTING ${Math.round(k * 100)}%`, r.sx(t.x), r.sy(t.y) - 16 * z, { font: '3x5', color: C.uiAlert, align: 'center', shadow: '#000' });
    }
    if (this.state === 'inbound' && this.target) {
      const t = this.target;
      const blink = Math.floor(Time.realTime * 4) & 1;
      // the kill zone, unmistakable on any ground
      ctx.fillStyle = `rgba(255,90,58,${blink ? 0.24 : 0.14})`;
      ctx.beginPath(); ctx.arc(Math.round(r.sx(t.x)), Math.round(r.sy(t.y)), S.outer * TILE * r.cam.zoom, 0, Math.PI * 2); ctx.fill();
      dashedCircle(ctx, r, t.x, t.y, S.outer, blink ? C.uiAlert : '#FFFFFF');
      dashedCircle(ctx, r, t.x, t.y, S.inner, C.uiAlert);
      drawText(ctx, `IMPACT ${Math.max(0, this.t).toFixed(1)}`, r.sx(t.x), r.sy(t.y) - 8, { color: C.uiAlert, align: 'center', bold: true, shadow: '#000' });
    }
    for (const f of this.fallout) hatchCircle(ctx, r, f.x, f.y, S.falloutRadius, 'rgba(166,240,60,0.35)');
    if (this.cloud) drawCloud(ctx, r, this.cloud);
  }
  /** screen-space: white-out and blindness */
  drawScreen(ctx, W, H) {
    if (this.flashT > 0) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H); }
    if (this.blindOp > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, this.blindOp / S.blindTime).toFixed(2)})`; ctx.fillRect(0, 0, W, H); }
    if (this.state === 'inbound') {
      drawText(ctx, `STRIKE INBOUND ${Math.max(0, this.t).toFixed(1)}`, W / 2, 40, { color: C.uiAlert, align: 'center', bold: true, scale: 2, shadow: '#000' });
      if (this.opInBlast() && (Math.floor(Time.realTime * 3) & 1)) drawText(ctx, 'YOU ARE INSIDE THE BLAST RING — MOVE!', W / 2, 60, { color: '#FFFFFF', align: 'center', shadow: C.uiAlert });
    }
  }
}

function dashedCircle(ctx, r, x, y, radT, col) {
  const z = r.cam.zoom, cx = r.sx(x), cy = r.sy(y), R = radT * TILE * z;
  ctx.fillStyle = col;
  const n = Math.max(24, Math.round(R * 1.2));
  for (let i = 0; i < n; i++) {
    if ((i >> 1) & 1) continue;
    const a = (i / n) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(a) * R), Math.round(cy + Math.sin(a) * R), z, z);
  }
}
function hatchCircle(ctx, r, x, y, radT, col) {
  const z = r.cam.zoom, cx = r.sx(x), cy = r.sy(y), R = radT * TILE * z;
  ctx.fillStyle = col;
  for (let yy = Math.max(0, Math.floor(cy - R)); yy < Math.min(r.cam.viewH, cy + R); yy += 2) {
    for (let xx = Math.max(0, Math.floor(cx - R)); xx < Math.min(r.cam.viewW, cx + R); xx += 2) {
      if (((xx + yy) & 7) !== 0) continue;
      if ((xx - cx) ** 2 + (yy - cy) ** 2 <= R * R) ctx.fillRect(xx, yy, 1, 1);
    }
  }
}

let cloudFrames = null;
/** 16-frame pixel mushroom cloud (~64×96). */
function cloudFrame(k) {
  if (!cloudFrames) {
    cloudFrames = [];
    const rng = new Rng(77);
    for (let f = 0; f < 16; f++) {
      const p = new Pix(64, 96);
      const t = f / 15;
      const stemTop = 90 - t * 60, capY = stemTop - 6, capR = 8 + t * 18;
      for (let y = Math.floor(stemTop); y < 94; y++) {
        const hw = 3 + (94 - y) * 0.04 + t * 2;
        for (let x = Math.floor(32 - hw); x <= 32 + hw; x++) p.set(x, y, y > 86 ? '#8A3A18' : (x + y) % 5 === 0 ? '#5A4640' : '#7A5E54');
      }
      for (let y = Math.floor(capY - capR * 0.7); y <= capY + capR * 0.5; y++) for (let x = Math.floor(32 - capR); x <= 32 + capR; x++) {
        const d = Math.hypot((x - 32) / capR, (y - capY) / (capR * 0.65)) + (rng.next() - 0.5) * 0.12;
        if (d > 1) continue;
        const hot = 1 - t;
        let c = d < 0.4 ? (hot > 0.5 ? '#FFF1A8' : '#FFC24A') : d < 0.7 ? (hot > 0.3 ? '#FF9A2A' : '#8A5A48') : '#5A4640';
        if (t > 0.6 && d < 0.5) c = '#7A6258';
        p.set(x, y, c);
      }
      // base ring
      for (let x = 4; x < 60; x++) if (Math.abs(x - 32) > 6 + t * 10) p.set(x, 92 + ((x * 7) % 3), t < 0.5 ? '#FFC24A' : '#6A5048');
      cloudFrames.push(p.toCanvas());
    }
  }
  return cloudFrames[Math.min(15, Math.floor(k * 16))];
}
function drawCloud(ctx, r, c) {
  const z = r.cam.zoom;
  const k = Math.min(1, c.t / 4);
  const f = cloudFrame(k);
  ctx.globalAlpha = c.t > 4.5 ? Math.max(0, 1 - (c.t - 4.5) / 1.5) : 1;
  ctx.drawImage(f, Math.round(r.sx(c.x) - 32 * z), Math.round(r.sy(c.y) - 92 * z), 64 * z, 96 * z);
  // shockwave ring
  const R = Math.min(1, c.t / 0.8) * 12 * TILE * z;
  if (c.t < 0.8) { ctx.strokeStyle = `rgba(255,255,255,${(0.8 - c.t).toFixed(2)})`; ctx.lineWidth = 2 * z; ctx.beginPath(); ctx.ellipse(r.sx(c.x), r.sy(c.y), R, R * 0.7, 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.globalAlpha = 1;
}
