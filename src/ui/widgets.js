// @ts-check
import { C } from '../config/palette.js';
import { drawText, measureText } from '../render/font.js';
import { icon } from '../render/spriteData/icons.js';

/** 90s military-terminal widgets (SPEC §17.1): riveted panels, bevelled buttons. */

export function panel(ctx, x, y, w, h, o = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  ctx.globalAlpha = o.alpha ?? 0.92;
  ctx.fillStyle = o.fill || C.uiPanel;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.uiBevelL;
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
  ctx.fillStyle = C.uiBevelD;
  ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
  if (o.rivets !== false && w > 12 && h > 12) {
    ctx.fillStyle = '#5E6E60';
    for (const [rx, ry] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) ctx.fillRect(x + rx, y + ry, 1, 1);
  }
}

export class Button {
  /**
   * @param {{id:string, icon?:string, label?:string, toggle?:boolean, hold?:boolean, onPress?:Function, onRelease?:Function, color?:string, big?:boolean}} o
   */
  constructor(o) {
    this.id = o.id; this.iconName = o.icon; this.label = o.label || ''; this.short = o.short || '';
    this.toggle = !!o.toggle; this.hold = !!o.hold;
    this.onPress = o.onPress; this.onRelease = o.onRelease;
    this.x = 0; this.y = 0; this.w = 32; this.h = 32;
    this.visible = true; this.enabled = true; this.active = false;
    this.pressed = false; this.flashT = 0;
    this.badge = '';          // e.g. "×3"
    this.color = o.color || C.uiText;
    this.progress = -1;       // optional ring/progress 0..1
    this.pad = 4;             // extra touch slop (logical px)
    this.big = !!o.big;
  }
  place(x, y, w, h) { this.x = Math.round(x); this.y = Math.round(y); this.w = Math.round(w); this.h = Math.round(h ?? w); return this; }
  hit(px, py) {
    return this.visible && px >= this.x - this.pad && py >= this.y - this.pad && px < this.x + this.w + this.pad && py < this.y + this.h + this.pad;
  }
  draw(ctx) {
    if (!this.visible) return;
    const { x, y, w, h } = this;
    const down = this.pressed;
    const on = this.active;
    ctx.globalAlpha = this.enabled ? 0.9 : 0.5;
    ctx.fillStyle = on ? '#3A2C10' : down ? '#101410' : C.uiPanel;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    // bevel
    ctx.fillStyle = down ? C.uiBevelD : on ? '#8A6A2A' : C.uiBevelL;
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = down ? C.uiBevelL : C.uiBevelD;
    ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
    // inner line
    ctx.fillStyle = on ? 'rgba(255,178,58,0.35)' : 'rgba(124,255,122,0.08)';
    ctx.fillRect(x + 2, y + 2, w - 4, 1);
    ctx.fillStyle = '#5E6E60';
    for (const [rx, ry] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) ctx.fillRect(x + rx, y + ry, 1, 1);
    const col = !this.enabled ? C.uiGrey : on ? C.uiAmber : this.color;
    const off = down ? 1 : 0;
    const hasLabel = !!this.label;
    if (this.iconName) {
      const ic = icon(this.iconName, col, on ? '#8A5A10' : '#2E6A2D', on ? '#FFE08A' : C.uiAmber);
      const s = this.big && w >= 40 ? 2 : 1;
      const iw = ic.width * s, ih = ic.height * s;
      const iy = hasLabel ? y + Math.max(3, Math.floor((h - ih - 7) / 2)) : y + Math.floor((h - ih) / 2);
      ctx.drawImage(ic, x + Math.floor((w - iw) / 2) + off, iy + off, iw, ih);
    }
    if (hasLabel) {
      const ly = this.iconName ? y + h - 8 : y + Math.floor((h - 5) / 2);
      const text = this.short && measureText(this.label, { font: '3x5' }) > w - 4 ? this.short : this.label;   // narrow button → short label
      drawText(ctx, text, x + w / 2 + off, ly + off, { font: '3x5', color: col, align: 'center' });
    }
    if (this.badge) {
      const bw = measureText(this.badge, { font: '3x5' }) + 3;
      ctx.fillStyle = '#0D0F0E';
      ctx.fillRect(x + w - bw - 1, y + 1, bw, 7);
      drawText(ctx, this.badge, x + w - bw + 1, y + 2, { font: '3x5', color: C.uiAmber });
    }
    if (this.progress >= 0) {
      ctx.fillStyle = C.uiAmber;
      ctx.fillRect(x + 2, y + h - 3, Math.round((w - 4) * this.progress), 1);
    }
    if (this.flashT > 0) {
      ctx.globalAlpha = Math.min(1, this.flashT * 4) * 0.4;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      this.flashT -= 1 / 60;
    }
  }
}

/** Simple text menu button (menus/pause) */
export class TextButton extends Button {
  constructor(o) { super(o); this.text = o.text; }
  draw(ctx) {
    if (!this.visible) return;
    const { x, y, w, h } = this;
    panel(ctx, x, y, w, h, { rivets: true, fill: this.pressed ? '#101410' : this.active ? '#2A2410' : C.uiPanel });
    const col = !this.enabled ? C.uiGrey : this.active ? C.uiAmber : C.uiText;
    drawText(ctx, this.text, x + w / 2 + (this.pressed ? 1 : 0), y + Math.floor((h - 7) / 2) + (this.pressed ? 1 : 0), { color: col, align: 'center', shadow: '#0D0F0E' });
  }
}
