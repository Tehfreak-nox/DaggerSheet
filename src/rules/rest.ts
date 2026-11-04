// Downtime: short and long rests (SRD "Downtime").
import { endActiveOnRest } from './active';
import { rules } from '../data';
import { derive, hasAncestryFeature } from './derive';
import { defaultRng, roll, type Rng } from './dice';
import type { Character } from './model';
import { controlsFor, type TokenSource } from './mechanics';
import { inEffect } from './inEffect';

/** How many tokens a card's "place a number of tokens equal to …" gives, or null when it's counted by hand. */
export function tokenCount(ch: Character, source: TokenSource): number | null {
  const d = derive(ch);
  if ('fixed' in source) return source.fixed;
  if ('trait' in source) {
    const v = source.trait === 'spellcast' ? (d.spellcast ?? 0) : d.traits[source.trait];
    return Math.max(source.min ?? 0, v);
  }
  if ('stat' in source) return source.stat === 'tier' ? d.tier : source.stat === 'proficiency' ? d.proficiency : ch.level;
  return null;
}

/**
 * Card tokens at a rest: "When you take a (long) rest, clear all unspent tokens",
 * then "After a long rest, place a number of tokens equal to …" refills them.
 */
function restTokens(ch: Character, kind: RestKind): Character {
  const uses = { ...ch.uses };
  for (const e of inEffect(ch)) {
    const t = e.text.replace(/\*\*/g, '');
    const key = `tokens:${e.key}`;
    const clears = kind === 'long' ? /When you take a (long )?rest, clear all unspent tokens/i.test(t) : /When you take a rest, clear all unspent tokens/i.test(t);
    if (clears) uses[key] = 0;
    if (kind === 'long' && /After a long rest, place/i.test(t)) {
      const tok = controlsFor(e.text).find((c) => c.kind === 'tokens');
      const n = tok && tok.kind === 'tokens' ? tokenCount(ch, tok.source) : null;
      if (n !== null) uses[key] = n;
    }
  }
  return { ...ch, uses };
}

/**
 * Start a new session: per-session and per-scene uses refresh, and pooled dice
 * clear ("At the end of each session, clear any unspent Slayer Dice … and gain a
 * Hope per die cleared").
 */
export function newSession(ch: Character): Character {
  let hope = ch.hope;
  for (const e of inEffect(ch)) {
    const pool = controlsFor(e.text).find((c) => c.kind === 'dicePool');
    const n = ch.uses[`pool:${e.key}`] ?? 0;
    if (pool && pool.kind === 'dicePool' && pool.hopeAtSessionEnd) hope += n;
  }
  const uses = Object.fromEntries(Object.entries(ch.uses).filter(([k]) => !k.startsWith('session:') && !k.startsWith('scene:') && !k.startsWith('pool:')));
  return { ...ch, hope: Math.min(derive(ch).hopeSlots, hope), uses };
}

export type RestKind = 'short' | 'long';

export interface RestMove {
  id: string;
  /** Prepare with one or more party members: 2 Hope instead of 1. */
  withParty?: boolean;
}

export interface RestLogEntry {
  move: string;
  roll?: { die: number; tier: number; total: number };
  effect: string;
}

/** Uses counters are keyed "<per>:<feature>"; rests clear the matching ones. */
export const USE_SCOPES = { rest: 'rest:', longRest: 'longRest:', session: 'session:', scene: 'scene:' } as const;

export interface RestOptions {
  /** Elf "Celestial Trance" is optional ("you can drop into a trance"). Default true. */
  trance?: boolean;
}

export function moveLimit(ch: Character, opts: RestOptions = {}): number {
  // Elf "Celestial Trance": choose an additional downtime move during a rest.
  const trance = opts.trance !== false && hasAncestryFeature(ch, 'celestial-trance');
  return rules.downtime.movesPerRest + (trance ? 1 : 0);
}

export function mustLongRest(ch: Character): boolean {
  return ch.shortRestStreak >= rules.downtime.shortRestsBeforeLong;
}

export function restProblems(ch: Character, kind: RestKind, moves: RestMove[], opts: RestOptions = {}): string[] {
  const p: string[] = [];
  if (kind === 'short' && mustLongRest(ch)) p.push('After three short rests in a row, the next rest must be a long rest.');
  if (moves.length > moveLimit(ch, opts)) p.push(`Choose up to ${moveLimit(ch, opts)} downtime moves.`);
  const short = rules.downtime.short.moves.map((m) => m.id);
  const long = rules.downtime.long.moves.map((m) => m.id);
  let longInShort = 0;
  for (const m of moves) {
    if (kind === 'long' && !long.includes(m.id)) p.push(`"${m.id}" is not a long rest move.`);
    if (kind === 'short' && !short.includes(m.id)) {
      // Clank "Efficient": on a short rest you can choose a long rest move instead of a short rest move.
      if (long.includes(m.id) && hasAncestryFeature(ch, 'efficient')) longInShort++;
      else p.push(`"${m.id}" is not a short rest move.`);
    }
  }
  if (longInShort > 1) p.push('Efficient lets you swap in one long rest move.');
  return p;
}

export function rest(
  ch: Character, kind: RestKind, moves: RestMove[], rng: Rng = defaultRng, opts: RestOptions = {},
): { character: Character; log: RestLogEntry[] } {
  const problems = restProblems(ch, kind, moves, opts);
  if (problems.length) throw new Error(problems.join(' '));
  const d = derive(ch);
  let c: Character = { ...ch };
  const log: RestLogEntry[] = [];
  const d4 = () => {
    const r = roll(4, rng);
    return { die: r, tier: d.tier, total: r + d.tier };
  };
  for (const m of moves) {
    switch (m.id) {
      case 'tend-to-wounds': { const r = d4(); c.hp = Math.max(0, c.hp - r.total); log.push({ move: m.id, roll: r, effect: `Cleared ${r.total} Hit Points` }); break; }
      case 'clear-stress': { const r = d4(); c.stress = Math.max(0, c.stress - r.total); log.push({ move: m.id, roll: r, effect: `Cleared ${r.total} Stress` }); break; }
      case 'repair-armor': { const r = d4(); c.armorMarked = Math.max(0, c.armorMarked - r.total); log.push({ move: m.id, roll: r, effect: `Cleared ${r.total} Armor Slots` }); break; }
      case 'tend-to-all-wounds': c.hp = 0; log.push({ move: m.id, effect: 'Cleared all Hit Points' }); break;
      case 'clear-all-stress': c.stress = 0; log.push({ move: m.id, effect: 'Cleared all Stress' }); break;
      case 'repair-all-armor': c.armorMarked = 0; log.push({ move: m.id, effect: 'Cleared all Armor Slots' }); break;
      case 'prepare': {
        const n = m.withParty ? 2 : 1;
        c.hope = Math.min(d.hopeSlots, c.hope + n);
        log.push({ move: m.id, effect: `Gained ${n} Hope` });
        break;
      }
      case 'work-on-a-project': log.push({ move: m.id, effect: 'Advanced your project' }); break;
      default: throw new Error(`Unknown downtime move ${m.id}`);
    }
  }
  // End of rest: refresh per-rest uses (and per-long-rest uses on a long rest).
  const clear = kind === 'long' ? [USE_SCOPES.rest, USE_SCOPES.longRest] : [USE_SCOPES.rest];
  // Counting dice (Unstoppable, Wild Surge) also end when you rest.
  c.uses = Object.fromEntries(Object.entries(c.uses).filter(([k]) => !clear.some((p) => k.startsWith(p)) && !k.startsWith('die:')));
  c.shortRestStreak = kind === 'short' ? c.shortRestStreak + 1 : 0;
  // Avoid Death: "They return to consciousness when … the party finishes a long rest."
  if (kind === 'long' && c.death === 'unconscious') c.death = undefined;
  if (c.active?.length) c = endActiveOnRest(c, kind);
  c = restTokens(c, kind);
  return { character: c, log };
}
