// @ts-check
import { BALANCE } from '../config/balance.js';

/**
 * Unit & structure definitions (SPEC §12). Stats come from balance.js; this file adds roles,
 * names, sprite keys and capabilities.
 */
const U = BALANCE.units;

export const UNIT_TYPES = {
  husk:     { name: 'Husk Trooper', kind: 'infantry', ...U.husk, scope: 'husk' },
  lobber:   { name: 'Lobber', kind: 'infantry', ...U.lobber, scope: 'lobber', grenadier: true },
  scorcher: { name: 'Scorcher', kind: 'infantry', ...U.scorcher, scope: 'scorcher', flamer: true },
  launcher: { name: 'Launcher', kind: 'infantry', ...U.launcher, scope: 'launcher' },
  warden:   { name: 'Warden', kind: 'infantry', ...U.warden, scope: 'warden', officer: true, radio: true },
  sniffer:  { name: 'Sniffer', kind: 'beast', ...U.sniffer, scope: 'sniffer', smell: true },
  vrask:    { name: 'Overseer Vrask', kind: 'infantry', ...U.vrask, scope: 'vrask', officer: true, radio: true, boss: true, helmet: true },
  harvester:{ name: 'Harvester', kind: 'infantry', ...U.harvester, scope: 'harvester', unarmed: true, flees: true },
};

export function unitDef(type) { return UNIT_TYPES[type] || UNIT_TYPES.husk; }
export function isInfantry(u) { return u.def.kind === 'infantry' || u.def.kind === 'beast'; }
