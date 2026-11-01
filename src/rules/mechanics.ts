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
  | { kind: 'tokens'; source: TokenSource; label: string };

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

  // Uses: "Once per long rest", "twice per session", "three times per rest".
  for (const m of text.matchAll(/\b(once|twice|three times) per (long rest|short rest|rest|session|scene)\b/gi)) {
    const max = m[1].toLowerCase() === 'once' ? 1 : m[1].toLowerCase() === 'twice' ? 2 : 3;
    const scope = scopeOf(m[2])!;
    add({ kind: 'uses', scope, max, label: `${cap(m[1])} per ${m[2].toLowerCase()}` });
  }

  // Costs you pay: "Spend 3 Hope", "spend a Hope", "spend any number of Hope".
  for (const m of text.matchAll(/\bspend (a|an|one|two|three|\d+|any number of) Hope\b/gi)) {
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
    const trait = m[1].toLowerCase() === 'spellcast' ? 'spellcast' : TRAITS[m[1].toLowerCase()];
    const difficulty = m[2] ? Number(m[2]) : undefined;
    add({ kind: 'roll', trait, difficulty, label: `${cap(m[1])} Roll${difficulty ? ` (${difficulty})` : ''}` });
  }

  // Damage: "d8+2 magic damage using your Proficiency", "1d20+3 magic damage".
  const damageSpans: [number, number][] = [];
  for (const m of text.matchAll(/\b(\d*)d(\d+)(?:\s*\+\s*(\d+))?\s+(magic|physical)?\s*damage(?: using your (Proficiency))?/gi)) {
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

  // Other dice: "roll a d6", "clear 1d4 Hit Points", "a d8 to your damage roll".
  for (const m of text.matchAll(/\b(\d*)d(\d+)(?:\s*\+\s*(\d+))?\b/gi)) {
    const at = m.index!;
    if (damageSpans.some(([a, b]) => at >= a && at < b)) continue;
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
