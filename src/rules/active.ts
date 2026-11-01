// Lasting effects you switch on by paying a feature's cost: they change your
// stats until they end (a rest, a long rest, or when you end them).
import type { TraitId } from '../data';
import type { Modifier } from './effects';
import type { Character } from './model';
import { TRAIT_IDS } from './model';

export interface ActiveDef {
  /** What the effect does, shown while it's on. */
  note: string;
  ends: 'rest' | 'longRest' | 'manual';
  /** "Before you make an action roll, you must spend a Hope. If you can't, you revert." */
  hopeBeforeRoll?: boolean;
  /** Frenzy: you can't use Armor Slots. */
  noArmorSlots?: boolean;
  effects: (ctx: { traits: Record<TraitId, number>; spellcast: number | null }) => Omit<Modifier, 'source'>[];
}

/** Keyed by feature key (see FeatureCard): "card:<id>" or "hope:<class>". */
export const ACTIVE: Record<string, ActiveDef> = {
  'card:valor-full-surge': {
    note: '+2 to all traits until your next rest.', ends: 'rest',
    effects: () => TRAIT_IDS.map((t) => ({ stat: t, value: 2 })),
  },
  'card:blade-frenzy': {
    note: '+10 to damage rolls, +8 to your Severe threshold; you can’t use Armor Slots.', ends: 'manual', noArmorSlots: true,
    effects: () => [{ stat: 'damage', value: 10 }, { stat: 'severe', value: 8 }],
  },
  'card:sage-force-of-nature': {
    note: '+10 to damage rolls on a successful attack or Spellcast Roll; you spend a Hope before each action roll.', ends: 'manual', hopeBeforeRoll: true,
    effects: () => [{ stat: 'damage', value: 10 }],
  },
  'card:dread-avatar-of-terror': {
    note: 'A 1d6 bonus to damage rolls for each Fear in the GM’s pool; you spend a Hope before each action roll.', ends: 'manual', hopeBeforeRoll: true,
    effects: () => [],
  },
  'card:splendor-overwhelming-aura': {
    note: 'Your Presence equals your Spellcast trait until your next long rest.', ends: 'longRest',
    effects: ({ traits, spellcast }) => (spellcast !== null && spellcast !== traits.presence ? [{ stat: 'presence', value: spellcast - traits.presence }] : []),
  },
  'hope:warrior': {
    note: '+1 to your attack rolls until your next rest.', ends: 'rest',
    effects: () => [{ stat: 'attack', value: 1, appliesTo: 'all' }],
  },
  'hope:rogue': {
    note: '+2 Evasion until an attack succeeds against you (or your next rest).', ends: 'rest',
    effects: () => [{ stat: 'evasion', value: 2 }],
  },
};

export function isActive(ch: Character, key: string): boolean {
  return (ch.active ?? []).includes(key);
}

export function setActive(ch: Character, key: string, on: boolean): Character {
  const list = (ch.active ?? []).filter((k) => k !== key);
  return { ...ch, active: on ? [...list, key] : list };
}

/** End effects that last until a rest. */
export function endActiveOnRest(ch: Character, kind: 'short' | 'long'): Character {
  const keep = (ch.active ?? []).filter((k) => {
    const d = ACTIVE[k];
    return d && d.ends !== 'rest' && !(kind === 'long' && d.ends === 'longRest');
  });
  return { ...ch, active: keep };
}
