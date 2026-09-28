// @ts-check
/** Who is talking in an illustrated shot, and which mouth shape they make this instant. */
import { speakingAt, mouthAt } from '../cutStage.js';

/** @returns {{speaking: {who: string, lt: number, text: string} | null, mouth: string, talkers: Record<string, number[]>}} */
export function talkState(lines, T, failedLine = '') {
  const sp = speakingAt(lines, T, failedLine);
  if (!sp) return { speaking: null, mouth: 'closed', talkers: {} };
  const m = mouthAt(sp.text, sp.lt), ch = sp.text[Math.floor(sp.lt * 16)] || '';
  return { speaking: sp, mouth: m === 0 ? 'closed' : /[OUW]/i.test(ch) ? 'o' : m === 2 ? 'a' : 'e', talkers: {} };
}
