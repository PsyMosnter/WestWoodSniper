// @ts-check
import { TILE } from '../core/camera.js';
import { Time } from '../core/time.js';
import { unitSprite, unitVariant, markerLift, whiteOf, tintOf, drawGroundShadow } from './sprites.js';
import { Art } from './artStyle.js';
import { vehicleSprite, vehicleState } from './spriteData/vehicles.js';
import { drawText } from './font.js';
import { BALANCE } from '../config/balance.js';
import { C } from '../config/palette.js';
import { visionOf, detectRange } from '../ai/perception.js';
import { coverKind, drawCovered } from './terrainCover.js';

/**
 * Draws NOT units (y-sorted), vision cones (LOS-clipped), awareness icons, tags and the LKP ghost.
 */
export function installUnitRendering(game) {
  const R = game.renderer, w = game.world;

  R.layers.sorted.push((push, r, alpha) => {
    const fog = w.fog;
    for (const u of w.units) {
      if (u.kind === 'structure' || u.kind === 'emplacement' || u.kind === 'turret' || u.hidden) continue;
      const vis = fog.isVisible(u.tx, u.ty);
      if (vis) u.seenByPlayerT = w.time;
      if (!vis && !(u.dead && fog.isSeen(u.tx, u.ty))) continue;
      const x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
      push({ y, elev: 0, draw: (ctx) => drawUnit(ctx, r, u, x, y) }, Math.floor(y));
    }
  });

  R.layers.ground.push((ctx, r) => {
    // vision cones of visible enemies near WREN (drawn on the ground, under sprites)
    const op = w.operative;
    const list = [];
    for (const u of w.units) {
      if (u.dead || u.hidden || u.kind === 'structure' || !w.fog.isVisible(u.tx, u.ty)) continue;
      const d = Math.hypot(u.x - op.x, u.y - op.y);
      if (d > 16 || u.blindT > 0 || u.disabledVision === 0) continue;   // no cone for a blind (driverless) vehicle
      list.push({ u, d });
    }
    // only the few cones that could actually reach WREN get the dithered fill (an Alarm would
    // otherwise paint the whole screen); the rest show their dotted rims
    list.sort((a, b) => a.d - b.d);
    let fills = 0;
    for (const { u, d } of list) {
      const reach = (u.cone?.inner ?? 7) + 2.5;
      const fill = d <= reach && fills < 4;
      if (fill) fills++;
      drawCone(ctx, r, u, w, fill);
    }
  });

  R.layers.overFog.push((ctx, r) => {
    // LKP ghost (above trees and fog so it's never hidden)
    if (w.lkp && Math.hypot(w.lkp.x - w.operative.x, w.lkp.y - w.operative.y) > 1.2) {
      const s = unitSprite('operative', 'idle', 4, 0);
      const z = r.cam.zoom;
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(Time.realTime * 4);
      ctx.drawImage(tintOf(s.canvas, '#B8C0B8'), Math.round(r.sx(w.lkp.x) - s.ax * z), Math.round(r.sy(w.lkp.y) - s.ay * z), s.w * z, s.h * z);
      ctx.globalAlpha = 1;
      drawText(ctx, 'LKP', Math.round(r.sx(w.lkp.x)), Math.round(r.sy(w.lkp.y)) + 2, { font: '3x5', color: '#B8C0B8', align: 'center', shadow: '#000' });
    }
    const drawnIcons = [];
    for (const u of w.units) {
      if (u.dead || u.hidden || u.kind === 'structure' || !w.fog.isVisible(u.tx, u.ty)) continue;
      // don't stack two icons on the same spot (units standing on each other)
      if (drawnIcons.some((d) => Math.abs(d.x - u.x) < 0.5 && Math.abs(d.y - u.y) < 0.5 && d.s === u.state)) continue;
      drawnIcons.push({ x: u.x, y: u.y, s: u.state });
      drawIcons(ctx, r, u, game);
    }
  });
}

function drawUnit(ctx, r, u, x, y) {
  const z = r.cam.zoom;
  if (u.kind === 'vehicle') {
    const vs = vehicleSprite(u.type, u.dir, vehicleState(u));
    const X = Math.round(r.sx(x) - vs.ax * z), Y = Math.round(r.sy(y) - vs.ay * z);
    ctx.globalAlpha = 0.3; ctx.drawImage(tintOf(vs.canvas, '#000000'), X + 2 * z, Y + 2 * z, vs.w * z, vs.h * z); ctx.globalAlpha = 1;
    ctx.drawImage(u.flashT > 0 ? whiteOf(vs.canvas) : vs.canvas, X, Y, vs.w * z, vs.h * z);
    if (u.dead && (Math.floor(Time.realTime * 5 + u.x) % 4 === 0)) { ctx.fillStyle = '#4A4440'; ctx.fillRect(X + vs.w * z / 2, Y - 2 * z, 2 * z, 2 * z); }
    return;
  }
  const { pose, frame } = u.pose();
  // a dead unit falls the way its death sends it (away from the shot, forward from a takedown) — Newest & Chibi
  const dir = u.dead && u.deathDir != null && (Art.style === 'newest' || Art.style === 'chibi') ? u.deathDir : u.dir;
  const s = unitSprite(u.type, pose, dir, frame, unitVariant(u));
  const X = Math.round(r.sx(x) - s.ax * z), Y = Math.round(r.sy(y) - s.ay * z);
  const m = u.world.map, cover = u.dead ? null : coverKind(m, u.tx, u.ty);
  if ((!u.dead || s.shadow) && cover !== 'water') drawGroundShadow(ctx, s, r.sx(x), r.sy(y), z);
  const img = u.flashT > 0 ? whiteOf(s.canvas) : s.canvas;
  // standing in tall grass or shallow water: the lower half is hidden (bodies stay fully visible)
  if (cover) drawCovered(ctx, z, img, s, X, Y, cover, m.biome, u.id.length * 13 + (u.id.charCodeAt(0) || 0), !!u.moving);
  else ctx.drawImage(img, X, Y, s.w * z, s.h * z);
}

/** Ray length along angle a before LOS blocks (tile rules of SPEC §7.3). */
function rayLen(map, ox, oy, a, maxR, eO) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let soft = 0, lastT = -1;
  for (let t = 0.25; t <= maxR; t += 0.25) {
    const tx = Math.floor(ox + dx * t), ty = Math.floor(oy + dy * t);
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return t;
    const i = ty * map.w + tx;
    if (i === lastT) continue;
    lastT = i;
    const e = map.elev[i];
    if (e > eO) return t;
    if (e + map.blockH[i] > eO) { if (map.soft[i]) { if (++soft >= 2) return t + 0.3; } else return t + 0.3; }
  }
  return maxR;
}

const CONE_STYLE = {
  unaware: { dot: 'rgba(255,246,200,0.9)', fill: 'rgba(255,246,200,0.34)' },
  wary: { dot: 'rgba(255,178,58,1)', fill: 'rgba(255,178,58,0.38)' },
  combat: { dot: 'rgba(255,90,58,1)', fill: 'rgba(255,90,58,0.4)' },
};
const patterns = new Map();
/** Ordered-dither pattern: overlapping cones share the same screen-aligned pixels, so they never stack into mud. */
function conePattern(ctx, col) {
  let p = patterns.get(col);
  if (p) return p;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 4;
  const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  x.fillStyle = col;
  x.fillRect(0, 0, 1, 1); x.fillRect(2, 2, 1, 1);
  x.globalAlpha = 0.5; x.fillRect(2, 0, 1, 1); x.fillRect(0, 2, 1, 1);
  p = ctx.createPattern(c, 'repeat');
  patterns.set(col, p);
  return p;
}

/**
 * A vision cone in two parts (playtest 2): the dotted outer rim is the furthest this unit can see at all
 * (WREN running in the open), the filled inner cone is how far it can pick WREN out *right now* — it
 * shrinks as he walks, crouches, crawls or hunkers, and in tall grass. Both are clipped by line of sight.
 */
function drawCone(ctx, r, u, w, fill = true) {
  const now = w.time, op = w.operative;
  const vis = visionOf(u, w);
  const inner = op.dead || op.hidden ? 0 : Math.min(vis.radius, detectRange(u, op, w, vis));
  if (!u.cone || now - u.cone.t > 0.1 || Math.abs(u.cone.a - u.angle) > 0.05 || Math.abs(u.cone.inner - inner) > 0.05) {
    const n = 18;
    const pts = [];
    const eO = w.map.elevAt(u.tx, u.ty);
    for (let i = 0; i <= n; i++) {
      const a = u.angle - vis.cone / 2 + (vis.cone * i) / n;
      const d = rayLen(w.map, u.x, u.y, a, vis.radius, eO);
      pts.push({ a, d, di: Math.min(d, inner), full: vis.radius });
    }
    u.cone = { t: now, a: u.angle, pts, per: vis.peripheral, x: u.x, y: u.y, inner };
  }
  const c = u.cone;
  const z = r.cam.zoom;
  const cx = Math.round(r.sx(u.x)), cy = Math.round(r.sy(u.y));
  const st = u.state === 'combat' ? CONE_STYLE.combat : u.state === 'unaware' || u.state === 'returning' ? CONE_STYLE.unaware : CONE_STYLE.wary;
  const at = (p, d) => [cx + Math.cos(p.a) * d * TILE * z, cy + Math.sin(p.a) * d * TILE * z];
  // dithered fill of the inner (detection) cone only for cones that matter right now — rims for the rest
  if (fill && c.inner > 0.2) {
    ctx.fillStyle = conePattern(ctx, st.fill);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (const p of c.pts) { const [x, y] = at(p, p.di); ctx.lineTo(x, y); }
    ctx.closePath();
    ctx.fill();
  }
  // a dotted line with a dark shadow pixel so it reads on light ground (tall grass, sand, snow)
  const dotted = (x0, y0, x1, y1, step, o) => {
    const k = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let j = 0; j < k; j++) ctx.fillRect(Math.round(x0 + (x1 - x0) * j / k) + o, Math.round(y0 + (y1 - y0) * j / k) + o, z, z);
  };
  const rim = (fn) => { ctx.fillStyle = 'rgba(7,9,10,0.55)'; fn(1); ctx.fillStyle = st.dot; fn(0); };
  // outer rim: sparse dots — the edges and the arc at full sight
  ctx.globalAlpha = 0.75;
  rim((o) => {
    for (const p of [c.pts[0], c.pts[c.pts.length - 1]]) {
      const [x0, y0] = at(p, p.di), [x1, y1] = at(p, p.d);
      if (p.d - p.di > 0.3) dotted(x0, y0, x1, y1, 4, o);
    }
    for (let i = 0; i < c.pts.length - 1; i++) {
      const [x0, y0] = at(c.pts[i], c.pts[i].d), [x1, y1] = at(c.pts[i + 1], c.pts[i + 1].d);
      dotted(x0, y0, x1, y1, 4, o);
    }
  });
  ctx.globalAlpha = 1;
  // inner rim: dense dots — where WREN would be seen right now — with a dark outline on both sides so it
  // reads on light ground (tall grass, water, snow) as well as dark
  if (c.inner > 0.2) {
    ctx.fillStyle = 'rgba(7,9,10,0.5)';
    for (let i = 0; i < c.pts.length - 1; i++) {
      const [x0, y0] = at(c.pts[i], c.pts[i].di + 1.5 / TILE), [x1, y1] = at(c.pts[i + 1], c.pts[i + 1].di + 1.5 / TILE);
      dotted(x0, y0, x1, y1, 1, 0);
    }
  }
  if (c.inner > 0.2) rim((o) => {
    for (const p of [c.pts[0], c.pts[c.pts.length - 1]]) {
      const [x1, y1] = at(p, p.di);
      const s0 = Math.min(8, p.di * TILE * z);
      dotted(cx + Math.cos(p.a) * s0, cy + Math.sin(p.a) * s0, x1, y1, 2, o);
    }
    for (let i = 0; i < c.pts.length - 1; i++) {
      const [x0, y0] = at(c.pts[i], c.pts[i].di), [x1, y1] = at(c.pts[i + 1], c.pts[i + 1].di);
      dotted(x0, y0, x1, y1, 2, o);
    }
  });
}

function drawIcons(ctx, r, u, game) {
  const z = r.cam.zoom;
  let lift = u.type === 'guardTower' ? 38 : u.kind === 'vehicle' ? 18 : 20;
  if (u.kind === 'vehicle') {
    const top = vehicleSprite(u.type, u.dir, vehicleState(u)).top;
    if (top != null) lift = Math.max(lift, top + 4);           // New vehicles: just above the roof
  } else if (u.kind !== 'structure' && u.kind !== 'emplacement' && u.kind !== 'turret') {
    const { pose, frame } = u.pose();
    lift = markerLift(unitSprite(u.type, pose, u.dir, frame, unitVariant(u)), lift);
  }
  const x = Math.round(r.sx(u.px + (u.x - u.px) * Time.alpha)), y = Math.round(r.sy(u.py + (u.y - u.py) * Time.alpha)) - lift * z;
  const cb = game.settings.colourBlind;
  if (u.state === 'combat') {
    const blink = Math.floor(Time.realTime * 6) & 1;
    ctx.fillStyle = '#07090A'; ctx.fillRect(x - 3 * z, y - 2 * z, 6 * z, 10 * z);
    ctx.fillStyle = blink ? C.uiAlert : '#FFFFFF';
    ctx.fillRect(x - z, y - z, 2 * z, 5 * z); ctx.fillRect(x - z, y + 5 * z, 2 * z, 2 * z);
  } else if (u.det > 0.05 || u.state === 'suspicious' || u.state === 'investigating' || u.state === 'alerted') {
    // "?" with the fill of the detection meter
    const k = Math.min(1, u.det);
    ctx.fillStyle = '#07090A'; ctx.fillRect(x - 4 * z, y - 2 * z, 8 * z, 11 * z);
    drawText(ctx, '?', x, y - z, { color: u.state === 'alerted' ? C.uiAlert : C.uiAmber, align: 'center', scale: z });
    ctx.fillStyle = '#26302A'; ctx.fillRect(x - 3 * z, y + 7 * z, 6 * z, z);
    ctx.fillStyle = k > 0.7 ? C.uiAlert : C.uiAmber; ctx.fillRect(x - 3 * z, y + 7 * z, Math.max(z, Math.round(6 * k) * z), z);
  }
  if (u.tag && u.tag.text === 'RADIO') {
    // officer calling the alarm: dark plate, antenna glyph, 3 s countdown bar (the cue to shoot him NOW)
    const k = Math.min(1, u.radioT / BALANCE.ai.officerRadioTime);
    const bx = x - 17, by = y - 14 * z;
    const blink = Math.floor(Time.realTime * 8) & 1;
    ctx.fillStyle = '#07090A'; ctx.fillRect(bx, by, 34, 12);
    ctx.fillStyle = blink ? C.uiAlert : '#FFFFFF'; ctx.fillRect(bx, by, 34, 1); ctx.fillRect(bx, by + 11, 34, 1); ctx.fillRect(bx, by, 1, 12); ctx.fillRect(bx + 33, by, 1, 12);
    // antenna glyph
    ctx.fillStyle = C.uiAmber; ctx.fillRect(bx + 3, by + 3, 1, 6); ctx.fillRect(bx + 2, by + 3, 3, 1); ctx.fillRect(bx + 1, by + 2, 1, 1); ctx.fillRect(bx + 5, by + 2, 1, 1);
    drawText(ctx, 'RADIO', bx + 8, by + 2, { font: '3x5', color: '#FFFFFF' });
    ctx.fillStyle = '#3A1A14'; ctx.fillRect(bx + 8, by + 8, 23, 2);
    ctx.fillStyle = C.uiAlert; ctx.fillRect(bx + 8, by + 8, Math.round(23 * k), 2);
  } else if (u.tag && u.tag.text !== '!' && u.tag.text !== '?') {
    const tw = u.tag.text.length * 4 + 4;
    ctx.fillStyle = 'rgba(7,9,10,0.85)'; ctx.fillRect(x - tw / 2, y - 10 * z - 1, tw, 7);
    drawText(ctx, u.tag.text, x, y - 10 * z, { font: '3x5', color: C.uiAmber, align: 'center' });
  }
  if (u.important && u.state !== 'combat') {
    ctx.fillStyle = C.uiAmber;
    const yy = y - (u.det > 0.05 ? 12 : 2) * z;
    ctx.fillRect(x - 2 * z, yy, 5 * z, z); ctx.fillRect(x - z, yy + z, 3 * z, z); ctx.fillRect(x, yy + 2 * z, z, z);
  }
}
