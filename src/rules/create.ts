// Character creation (SRD "Character Creation", steps 1–9).
import {
  ancestryById, cardById, classById, communityById, lootById, rules, type TraitId,
} from '../data';
import { accessibleDomains, derive, hasAncestryFeature } from './derive';
import { weaponProblems, armorProblems } from './equipment';
import { TRAIT_IDS, type AncestryChoice, type Character, type WeaponSlot } from './model';

export interface CreateInput {
  id?: string;
  name: string;
  pronouns?: string;
  classId: string;
  subclassId: string;
  ancestry: AncestryChoice;
  communityId: string;
  traits: Record<TraitId, number>;
  experiences: [string, string];
  /** Clank "Purposeful Design": index of the Experience that gets +1. */
  purposefulDesign?: number;
  primary?: WeaponSlot;
  secondary?: WeaponSlot;
  armorId: string;
  /** Minor Health Potion or Minor Stamina Potion. */
  potion: 'minor-health-potion' | 'minor-stamina-potion';
  classItem?: string;
  cards: string[];
  background?: Record<string, string>;
  description?: Record<string, string>;
}

/** Number of starting domain cards: 2, plus "take an additional domain card" foundation features. */
export function startingCardCount(classId: string, subclassId: string): number {
  const sub = classById.get(classId)?.subclasses.find((s) => s.id === subclassId);
  const extra = sub?.foundation.filter((f) => /^Take an additional domain card/.test(f.text)).length ?? 0;
  return rules.creation.domainCards.count + extra;
}

export function creationProblems(input: CreateInput): string[] {
  const p: string[] = [];
  if (!input.name.trim()) p.push('Name is required.');
  const cls = classById.get(input.classId);
  if (!cls) return [...p, `Unknown class "${input.classId}".`];
  if (!cls.subclasses.some((s) => s.id === input.subclassId)) p.push(`Unknown subclass "${input.subclassId}".`);
  if ('id' in input.ancestry) {
    if (!ancestryById.has(input.ancestry.id)) p.push(`Unknown ancestry "${input.ancestry.id}".`);
  } else {
    const { first, second } = input.ancestry.mixed;
    if (!ancestryById.has(first) || !ancestryById.has(second)) p.push('Unknown mixed ancestry.');
    if (first === second) p.push('Mixed ancestry needs two different ancestries.');
  }
  if (!communityById.has(input.communityId)) p.push(`Unknown community "${input.communityId}".`);

  const mods = TRAIT_IDS.map((t) => input.traits[t]).sort((a, b) => a - b);
  const want = [...rules.creation.traitModifiers].sort((a, b) => a - b);
  if (mods.join() !== want.join()) p.push(`Traits must use ${rules.creation.traitModifiers.join(', ')} once each.`);

  const exps = input.experiences.map((e) => e.trim());
  if (exps.length !== rules.creation.experiences.count || exps.some((e) => !e)) p.push('Two Experiences are required.');
  else if (exps[0].toLowerCase() === exps[1].toLowerCase()) p.push('Experiences must be different.');
  if (p.length) return p;

  const ch = buildCharacter(input);
  if (hasAncestryFeature(ch, 'purposeful-design') && (input.purposefulDesign === undefined || !(input.purposefulDesign in ch.experiences))) {
    p.push('Purposeful Design: choose the Experience that aligns with your purpose.');
  }

  // Weapons: a two-handed primary, or a one-handed primary plus optional one-handed secondary.
  if (input.primary) {
    const probs = weaponProblems({ ...ch, primary: undefined }, input.primary.id, 'primary');
    if (probs.length) p.push(`Primary weapon: ${probs.join(', ')}.`);
  } else if (input.classId !== 'brawler') {
    p.push('Choose a primary weapon.');
  }
  if (input.secondary) {
    const probs = weaponProblems(ch, input.secondary.id, 'secondary');
    if (probs.length) p.push(`Secondary weapon: ${probs.join(', ')}.`);
  }
  const ap = armorProblems(ch, input.armorId);
  if (ap.length) p.push(`Armor: ${ap.join(', ')}.`);
  if (!lootById.has(input.potion)) p.push('Choose a Minor Health Potion or a Minor Stamina Potion.');

  // Domain cards
  const n = startingCardCount(input.classId, input.subclassId);
  if (input.cards.length !== n) p.push(`Choose ${n} level 1 domain cards.`);
  if (new Set(input.cards).size !== input.cards.length) p.push('Domain cards must be different.');
  const domains = accessibleDomains(ch);
  for (const id of input.cards) {
    const c = cardById.get(id);
    if (!c) p.push(`Unknown card "${id}".`);
    else if (c.level > 1) p.push(`${c.name} is level ${c.level}; starting cards are level 1.`);
    else if (!domains.includes(c.domain)) p.push(`${c.name} is not in your class’s domains.`);
  }
  return p;
}

function buildCharacter(input: CreateInput): Character {
  return {
    version: 1,
    id: input.id ?? `ch-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: input.name.trim(),
    pronouns: input.pronouns?.trim() ?? '',
    classId: input.classId,
    subclassId: input.subclassId,
    ancestry: input.ancestry,
    communityId: input.communityId,
    level: rules.creation.level,
    traits: { ...input.traits },
    experiences: input.experiences.map((name) => ({ name: name.trim() })),
    purposefulDesign: input.purposefulDesign,
    subclassStage: 'foundation',
    advancements: [],
    markedTraits: [],
    primary: input.primary,
    secondary: input.secondary,
    inventoryWeapons: [],
    armorId: input.armorId,
    cards: { loadout: input.cards.slice(0, rules.caps.loadout), vault: input.cards.slice(rules.caps.loadout) },
    picks: {},
    hp: 0,
    stress: 0,
    hope: rules.creation.hope,
    armorMarked: 0,
    gold: { coins: 0, handfuls: 1, bags: 0, chests: 0 },
    safe: { coins: 0, handfuls: 0, bags: 0, chests: 0 },
    items: [
      { id: 'custom:torch', name: 'Torch', qty: 1 },
      { id: 'custom:rope', name: '50 feet of rope', qty: 1 },
      { id: 'custom:basic-supplies', name: 'Basic supplies', qty: 1 },
      { id: input.potion, qty: 1 },
      ...(input.classItem ? [{ id: 'custom:class-item', name: input.classItem, qty: 1 }] : []),
    ],
    shortRestStreak: 0,
    uses: {},
    background: input.background ?? {},
    description: input.description ?? {},
  };
}

export function createCharacter(input: CreateInput): Character {
  const problems = creationProblems(input);
  if (problems.length) throw new Error(`Invalid character: ${problems.join(' ')}`);
  const ch = buildCharacter(input);
  derive(ch); // throws on any dangling reference
  return ch;
}
