// A random but rules-legal "player" used to exercise the engine end to end:
// create a character from its class guide, then level it to 10 making random
// legal choices. The simulation tests run it over every combination.
import { armor, classes, domainCards, guides, rules, weapons, type TraitId } from '../data';
import { createCharacter, startingCardCount, type CreateInput } from './create';
import { derive, tierOf } from './derive';
import type { Rng } from './dice';
import { armorProblems, weaponProblems } from './equipment';
import {
  achievementAt, availableAdvancements, extraCardsFor, legalCards, levelUpProblems, type LevelUpChoices,
} from './levelUp';
import { TRAIT_IDS, type AdvancementChoice, type AncestryChoice, type Character } from './model';

export const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const EXAMPLES = Object.values(rules.creation.exampleExperiences).flat();

export function guideInput(
  classId: string, subclassId: string, ancestry: AncestryChoice, communityId: string, rng: Rng,
): CreateInput {
  const g = guides[classId];
  const cls = classes.find((c) => c.id === classId)!;
  const l1 = shuffle(rng, domainCards.filter((c) => c.level === 1 && (cls.domains as string[]).includes(c.domain)));
  const exps = shuffle(rng, EXAMPLES).slice(0, 2) as [string, string];
  return {
    id: `${classId}-${subclassId}-${JSON.stringify(ancestry)}-${communityId}`,
    name: 'Sim',
    classId,
    subclassId,
    ancestry,
    communityId,
    traits: { ...g.traits },
    experiences: exps,
    purposefulDesign: 0,
    primary: g.primary.id ? { id: g.primary.id } : undefined,
    secondary: g.secondary?.id ? { id: g.secondary.id } : undefined,
    armorId: g.armor.id,
    potion: pick(rng, ['minor-health-potion', 'minor-stamina-potion'] as const),
    classItem: pick(rng, g.inventory.classItem),
    cards: l1.slice(0, startingCardCount(classId, subclassId)).map((c) => c.id),
  };
}

/**
 * Random legal level-up choices, or null if none could be found (a rules dead end).
 * `forced` fixes the advancement ids (their details are still filled in randomly).
 */
export function randomLevelUp(ch: Character, rng: Rng, forced?: AdvancementChoice[], tries = 400): LevelUpChoices | null {
  const level = ch.level + 1;
  const ach = achievementAt(level);
  const used = new Set(ch.experiences.map((e) => e.name));
  const newExperience = ach ? shuffle(rng, EXAMPLES).find((e) => !used.has(e)) : undefined;
  const nExp = ch.experiences.length + (ach ? 1 : 0);
  const marked = new Set(ach?.clearMarkedTraits ? [] : ch.markedTraits);

  for (let t = 0; t < tries; t++) {
    const avail = availableAdvancements(ch, level);
    if (!avail.length) return null;
    const doubles = avail.filter((a) => a.cost === 2);
    const singles = avail.filter((a) => a.cost === 1);
    const ids = forced
      ? forced.map((f) => f.id)
      : doubles.length && (rng() < 0.3 || !singles.length) ? [pick(rng, doubles).id] : [pick(rng, singles).id, pick(rng, singles).id];
    const taken = new Set<TraitId>(marked);
    const cardsTaken: string[] = [];
    const advancements: AdvancementChoice[] = ids.map((id, i) => {
      if (forced && Object.keys(forced[i]).length > 1) return forced[i];
      switch (id) {
        case 'traits': {
          const free = shuffle(rng, TRAIT_IDS.filter((x) => !taken.has(x)));
          free.slice(0, 2).forEach((x) => taken.add(x));
          return { id, traits: [free[0], free[1]] as [TraitId, TraitId] };
        }
        case 'experiences': {
          const [a, b] = shuffle(rng, Array.from({ length: nExp }, (_, i) => i));
          return { id, experiences: [a, b] as [number, number] };
        }
        case 'domainCard': {
          const c = pick(rng, legalCards(ch, level, cardsTaken));
          cardsTaken.push(c?.id);
          return { id, card: c?.id };
        }
        case 'multiclass': {
          const mc = pick(rng, classes.filter((c) => c.id !== ch.classId));
          return { id, classId: mc.id, domain: pick(rng, mc.domains), subclassId: pick(rng, mc.subclasses).id };
        }
        default:
          return { id } as AdvancementChoice;
      }
    });
    // Step four and any extra subclass cards, chosen after the advancements (multiclass can open a domain).
    const mc = advancements.find((a) => a.id === 'multiclass');
    const after: Character = mc && mc.id === 'multiclass'
      ? { ...ch, multiclass: { classId: mc.classId, domain: mc.domain, subclassId: mc.subclassId, level } }
      : ch;
    const pool = shuffle(rng, legalCards(after, level, cardsTaken));
    if (!pool.length) continue;
    const domainCard = pool[0].id;
    const extraCards = pool.slice(1, 1 + extraCardsFor(ch, advancements)).map((c) => c.id);
    const newCards = [...cardsTaken, domainCard, ...extraCards];
    const choices: LevelUpChoices = {
      newExperience,
      advancements,
      domainCard,
      extraCards,
      picks: {
        ...(newCards.includes('blade-vitality') ? { vitality: shuffle(rng, ['stress', 'hitPoint', 'thresholds'] as const).slice(0, 2) } : {}),
        ...(newCards.includes('grace-master-of-the-craft')
          ? { masterOfTheCraft: { experiences: shuffle(rng, Array.from({ length: nExp }, (_, i) => i)).slice(0, rng() < 0.5 ? 1 : 2) } }
          : {}),
      },
    };
    if (levelUpProblems(ch, choices).length === 0) return choices;
  }
  return null;
}

/** Random legal gear of the character's tier or lower. */
export function randomGear(ch: Character, rng: Rng): Character {
  const tier = tierOf(ch.level);
  let c = { ...ch };
  if (rng() < 0.5) {
    const prim = weapons.filter((w) => w.category === 'primary' && w.tier <= tier);
    const w = pick(rng, prim);
    if (weaponProblems({ ...c, secondary: undefined }, w.id, 'primary').length === 0) {
      c = { ...c, primary: { id: w.id }, secondary: w.burden === 2 && !derive(c).ignoresBurden ? undefined : c.secondary };
    }
  }
  if (rng() < 0.5) {
    const sec = weapons.filter((w) => w.category === 'secondary' && w.tier <= tier);
    const w = pick(rng, sec);
    if (weaponProblems(c, w.id, 'secondary').length === 0) c = { ...c, secondary: { id: w.id } };
  }
  if (rng() < 0.5) {
    const a = pick(rng, armor.filter((x) => x.tier <= tier));
    if (armorProblems(c, a.id).length === 0) c = { ...c, armorId: a.id, armorMarked: 0 };
  }
  return c;
}

export { createCharacter, derive };
