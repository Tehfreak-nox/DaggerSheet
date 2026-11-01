// Tap controls derived from a feature's or card's rules text. The text stays
// the source of truth; these are shortcuts for what it tells you to do
// (spend Hope, mark Stress, roll, track uses and tokens).
import type { TraitId } from '../data';

export type UseScope = 'rest' | 'longRest' | 'session' | 'scene';

export type Control =
  | { kind: 'hope'; n: number | 'any'; label: string }
  | { kind: 'stress'; n: number; label: string }
  | { kind: 'roll'; trait: TraitId | 'spellcast'; difficulty?: number; label: string }
  | { kind: 'damage'; count: number | 'proficiency'; sides: number; bonus: number; type: 'magic' | 'physical' | null; label: string }
  | { kind: 'dice'; count: number; sides: number; bonus: number; label: string }
  | { kind: 'uses'; scope: UseScope; max: number; label: string }
  | { kind: 'tokens'; source: TokenSource; label: string }
  /** "roll a d20 as your Hope Die": armed for the next action roll. */
  | { kind: 'hopeDie'; sides: number; label: string }
  /** A Hope cost and the dice it pays for, in the same sentence: one button. */
  | { kind: 'hopeRoll'; n: number; roll: Extract<Control, { kind: 'dice' | 'damage' }>; label: string }
  /** "spend a Hope to gain a +2 bonus to the roll": armed for the next roll. */
  | { kind: 'hopeBonus'; n: number; bonus: number; label: string };

export type TokenSource =
  | { fixed: number }
  | { trait: TraitId | 'spellcast'; min?: number }
  | { stat: 'tier' | 'proficiency' | 'level' }
  | { roll: { count: number; sides: number; bonus: number } }
  | { manual: true };

const TRAITS: Record<string, TraitId> = {
  agility: 'agility', strength: 'strength', finesse: 'finesse',
  instinct: 'instinct', presence: 'presence', knowledge: 'knowledge',
};

const WORD_NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

const strip = (s: string) => s.replace(/\*\*|__/g, '').replace(/(^|[^\w])_|_(?=[^\w]|$)/g, '$1');

const n = (w: string) => WORD_NUM[w.toLowerCase()] ?? Number(w);

const SCOPES: [RegExp, UseScope][] = [
  [/long rest/i, 'longRest'],
  [/short rest|rest/i, 'rest'],
  [/session/i, 'session'],
  [/scene/i, 'scene'],
];

function scopeOf(s: string): UseScope | null {
  for (const [re, sc] of SCOPES) if (re.test(s)) return sc;
  return null;
}

export function controlsFor(rawText: string): Control[] {
  const text = strip(rawText);
  const out: Control[] = [];
  const seen = new Set<string>();
  const add = (c: Control) => {
    const key = JSON.stringify(c);
    if (!seen.has(key)) { seen.add(key); out.push(c); }
  };
  /** Text already turned into a combined control, skipped by the single-control passes. */
  const used: [number, number][] = [];
  const isUsed = (at: number) => used.some(([a, b]) => at >= a && at < b);

  // Hope that buys a bonus to the roll: arm it like an Experience.
  for (const m of text.matchAll(/\bspend (a|an|one|two|\d+) Hope to gain a \+(\d+) bonus to (?:the|that|your) (?:roll|[A-Z]\w+ Roll)/gi)) {
    const cost = n(m[1]);
    add({ kind: 'hopeBonus', n: cost, bonus: Number(m[2]), label: `Spend ${cost} Hope · +${m[2]} to the roll` });
    used.push([m.index!, m.index! + m[0].length]);
  }

  // A Hope cost and dice in the same sentence ("spend a Hope to … 1d8"): one button that pays and rolls.
  for (const sm of text.matchAll(/[^.!?\n]+[.!?]?/g)) {
    const sentence = sm[0];
    const h = /\bspend (a|an|one|two|three|\d+) Hope\b/i.exec(sentence);
    const dm = /\b(\d*)d(\d+)(?:\s*\+\s*(\d+))?(?:\s+(magic|physical)\s+damage(?: using your (Proficiency))?|\s+(?:magic|physical)?\s*damage)?/i.exec(sentence);
    if (!h || !dm || isUsed(sm.index! + h.index)) continue;
    const dmg = /damage/i.test(dm[0]) || /\bdeal|damage/i.test(sentence.slice(dm.index));
    const count = dm[5] || (!dm[1] && /Proficiency/.test(dm[0])) ? 'proficiency' : dm[1] ? Number(dm[1]) : 1;
    const bonus = dm[3] ? Number(dm[3]) : 0;
    const roll: Extract<Control, { kind: 'dice' | 'damage' }> = dmg && /damage/i.test(sentence)
      ? { kind: 'damage', count, sides: Number(dm[2]), bonus, type: (dm[4]?.toLowerCase() as 'magic' | 'physical') ?? null, label: `${dm[0].trim()}` }
      : { kind: 'dice', count: count === 'proficiency' ? 1 : count, sides: Number(dm[2]), bonus, label: `Roll ${dm[0].trim()}` };
    const cost = n(h[1]);
    add({ kind: 'hopeRoll', n: cost, roll, label: `Use · ${cost} Hope · ${dm[1] || ''}d${dm[2]}${bonus ? `+${bonus}` : ''}` });
    used.push([sm.index! + h.index, sm.index! + h.index + h[0].length], [sm.index! + dm.index, sm.index! + dm.index + dm[0].length]);
  }

  // Uses: "Once per long rest", "twice per session", "three times per rest".
  for (const m of text.matchAll(/\b(once|twice|three times) per (long rest|short rest|rest|session|scene)\b/gi)) {
    const max = m[1].toLowerCase() === 'once' ? 1 : m[1].toLowerCase() === 'twice' ? 2 : 3;
    const scope = scopeOf(m[2])!;
    add({ kind: 'uses', scope, max, label: `${cap(m[1])} per ${m[2].toLowerCase()}` });
  }

  // Costs you pay: "Spend 3 Hope", "spend a Hope", "spend any number of Hope".
  for (const m of text.matchAll(/\bspend (a|an|one|two|three|\d+|any number of) Hope\b/gi)) {
    if (isUsed(m.index!)) continue;
    const amount = /any/i.test(m[1]) ? 'any' : n(m[1]);
    add({ kind: 'hope', n: amount, label: amount === 'any' ? 'Spend Hope' : `Spend ${amount} Hope` });
  }
  // "mark a Stress" / "Mark 2 Stress" when you're the one marking it.
  for (const m of text.matchAll(/(^|[.:;!?]\s+|you can |, |and |\bto |or )mark (a|one|two|three|\d+) Stress\b/gi)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 20), (m.index ?? 0) + m[1].length);
    if (/(must|they|target|adversary|ally|companion)\s*$/i.test(before)) continue;
    const amount = n(m[2]);
    add({ kind: 'stress', n: amount, label: `Mark ${amount} Stress` });
  }

  // Rolls: "make a Spellcast Roll (15)", "make an Instinct Roll".
  for (const m of text.matchAll(/\bmake an? (Spellcast|Agility|Strength|Finesse|Instinct|Presence|Knowledge) Roll(?: \((\d+)\))?/gi)) {
    // "before you make a Spellcast Roll", "when you make a Presence Roll": a condition, not an instruction.
    const lead = text.slice(Math.max(0, m.index! - 24), m.index!);
    if (/\b(before|when|whenever|after|if|would|each time)\b(\s+you)?(\s+would)?\s*$/i.test(lead)) continue;
    const trait = m[1].toLowerCase() === 'spellcast' ? 'spellcast' : TRAITS[m[1].toLowerCase()];
    const difficulty = m[2] ? Number(m[2]) : undefined;
    add({ kind: 'roll', trait, difficulty, label: `${cap(m[1])} Roll${difficulty ? ` (${difficulty})` : ''}` });
  }

  // Damage: "d8+2 magic damage using your Proficiency", "1d20+3 magic damage".
  const damageSpans: [number, number][] = [];
  for (const m of text.matchAll(/\b(\d*)d(\d+)(?:\s*\+\s*(\d+))?\s+(magic|physical)?\s*damage(?: using your (Proficiency))?/gi)) {
    if (isUsed(m.index!)) continue;
    const count = m[5] || !m[1] ? 'proficiency' : Number(m[1]);
    const bonus = m[3] ? Number(m[3]) : 0;
    const label = `${count === 'proficiency' ? '' : count}d${m[2]}${bonus ? `+${bonus}` : ''} ${m[4] ? m[4].toLowerCase() + ' ' : ''}damage`;
    add({ kind: 'damage', count, sides: Number(m[2]), bonus, type: (m[4]?.toLowerCase() as 'magic' | 'physical') ?? null, label });
    damageSpans.push([m.index!, m.index! + m[0].length]);
  }

  // Tokens.
  const tok = /\bplace (?:a number of )?(?:(\d+d\d+(?:\+\d+)?|\d+) )?tokens(?: equal to (?:your |the )?(Spellcast trait|Agility|Strength|Finesse|Instinct|Presence|Knowledge|tier|Proficiency|level))?(?:[^.]*\(minimum (\d+)\))?/i.exec(text);
  if (tok) {
    let source: TokenSource = { manual: true };
    if (tok[1] && /d/.test(tok[1])) {
      const [, c, s, b] = /(\d+)d(\d+)(?:\+(\d+))?/.exec(tok[1])!;
      source = { roll: { count: Number(c), sides: Number(s), bonus: Number(b ?? 0) } };
    } else if (tok[1]) {
      source = { fixed: Number(tok[1]) };
    } else if (tok[2]) {
      const w = tok[2].toLowerCase();
      source = w === 'spellcast trait' ? { trait: 'spellcast', min: tok[3] ? Number(tok[3]) : undefined }
        : w === 'tier' || w === 'proficiency' || w === 'level' ? { stat: w }
        : { trait: TRAITS[w], min: tok[3] ? Number(tok[3]) : undefined };
    }
    add({ kind: 'tokens', source, label: 'Tokens' });
  }

  // A bigger Hope Die: "you can roll a d20 as your Hope Die".
  const hopeDie = /\broll a d(\d+) as your Hope Die\b/i.exec(text);
  if (hopeDie) {
    add({ kind: 'hopeDie', sides: Number(hopeDie[1]), label: `d${hopeDie[1]} Hope Die` });
    damageSpans.push([hopeDie.index, hopeDie.index + hopeDie[0].length]);
  }

  // Other dice: "roll a d6", "clear 1d4 Hit Points", "a d8 to your damage roll".
  for (const m of text.matchAll(/\b(\d*)d(\d+)(?:\s*\+\s*(\d+))?\b/gi)) {
    const at = m.index!;
    if (damageSpans.some(([a, b]) => at >= a && at < b) || isUsed(at)) continue;
    if (tok && tok[1] && text.indexOf(tok[1]) === at) continue;
    const count = m[1] ? Number(m[1]) : 1;
    const bonus = m[3] ? Number(m[3]) : 0;
    add({ kind: 'dice', count, sides: Number(m[2]), bonus, label: `Roll ${count}d${m[2]}${bonus ? `+${bonus}` : ''}` });
  }
  return out.slice(0, 8);
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
