// Leveling up (SRD "Leveling Up", steps 1–4, and "Multiclassing").
import {
  cardById, classById, domainCards, rules, type Advancement, type DomainCard, type TraitId,
} from '../data';
import { accessibleDomains, derive, ownedCards, STAGES, tierOf } from './derive';
import type { AdvancementChoice, AdvancementMark, Character, PermanentPicks } from './model';

export interface LevelUpChoices {
  /** Tier achievement at levels 2, 5 and 8: a new Experience at +2. */
  newExperience?: string;
  /** Two advancements (Proficiency and Multiclass count as both). */
  advancements: AdvancementChoice[];
  /** Step four: a new domain card at your level or lower. */
  domainCard: string;
  /** Step four, optional: exchange a card you have for another of the same level or lower. */
  exchange?: { from: string; to: string };
  /** Cards granted by an upgraded subclass card ("Take an additional domain card…"). */
  extraCards?: string[];
  /** Picks for cards that ask for them (Vitality, Master of the Craft). */
  picks?: PermanentPicks;
}

const ADV = new Map(rules.leveling.advancements.map((a) => [a.id, a]));

export function achievementAt(level: number) {
  return rules.leveling.achievements.find((a) => a.level === level);
}

/** Slots already marked per tier and advancement. */
function marksByTier(marks: AdvancementMark[]) {
  const out = new Map<string, number>();
  for (const m of marks) {
    const key = `${m.tier}:${m.choice.id}`;
    out.set(key, (out.get(key) ?? 0) + ADV.get(m.choice.id)!.cost);
  }
  return out;
}

/** Whether an option is crossed out in a sheet tier. */
function crossedOut(marks: AdvancementMark[], tier: number, id: string): boolean {
  if (id === 'multiclass') {
    // Multiclassing crosses out every other multiclass option; an upgraded subclass crosses out this tier's.
    return marks.some((m) => m.choice.id === 'multiclass') || marks.some((m) => m.tier === tier && m.choice.id === 'subclass');
  }
  if (id === 'subclass') {
    return marks.some((m) => m.tier === tier && m.choice.id === 'multiclass');
  }
  return false;
}

/** Which sheet tier's slot a pick would mark: the highest tier ≤ yours with room, or null. */
export function slotFor(marks: AdvancementMark[], level: number, id: Advancement['id']): 2 | 3 | 4 | null {
  const adv = ADV.get(id)!;
  const used = marksByTier(marks);
  for (let t = tierOf(level); t >= 2; t--) {
    const cap = adv.slots[String(t) as '2' | '3' | '4'];
    if (!cap) continue;
    if (crossedOut(marks, t, id)) continue;
    if ((used.get(`${t}:${id}`) ?? 0) + adv.cost <= cap) return t as 2 | 3 | 4;
  }
  return null;
}

/** Why an option can't be taken even with an open slot (a cap), or null. */
export function advancementCapped(ch: Character, id: Advancement['id'], newLevel = ch.level + 1): string | null {
  const d = derive(ch);
  switch (id) {
    case 'hitPoint': return d.hitPoints >= rules.caps.hitPointSlots ? `Already ${rules.caps.hitPointSlots} Hit Point slots` : null;
    case 'stress': return d.stressSlots >= rules.caps.stressSlots ? `Already ${rules.caps.stressSlots} Stress slots` : null;
    case 'proficiency': return d.proficiency >= rules.caps.proficiency ? 'Proficiency is at its maximum' : null;
    case 'subclass': return ch.subclassStage === 'mastery' ? 'You already have your mastery' : null;
    case 'multiclass': return newLevel < rules.leveling.multiclass.minLevel ? `From level ${rules.leveling.multiclass.minLevel}` : null;
    default: return null;
  }
}

/** Advancement options with an unmarked slot at the given (new) level that aren't capped. */
export function availableAdvancements(ch: Character, newLevel = ch.level + 1): Advancement[] {
  return rules.leveling.advancements.filter((a) => slotFor(ch.advancements, newLevel, a.id) !== null && !advancementCapped(ch, a.id, newLevel));
}

/** Domain cards you could take at `level` (class domains at your level or lower; multiclass domain at half). */
export function legalCards(ch: Character, level: number, exclude: string[] = []): DomainCard[] {
  const owned = new Set([...ownedCards(ch).map((c) => c.id), ...exclude]);
  const domains = classById.get(ch.classId)!.domains as string[];
  return domainCards.filter((c) => {
    if (owned.has(c.id)) return false;
    if (domains.includes(c.domain)) return c.level <= level;
    if (ch.multiclass && ch.multiclass.domain === c.domain) return c.level <= Math.ceil(level / 2);
    return false;
  });
}

const TRAITS: TraitId[] = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];

export function levelUpProblems(ch: Character, choices: LevelUpChoices): string[] {
  const p: string[] = [];
  const level = ch.level + 1;
  if (level > 10) return ['Already at level 10.'];
  const ach = achievementAt(level);
  if (ach && !choices.newExperience?.trim()) p.push(`Level ${level}: name your new Experience.`);
  if (!ach && choices.newExperience) p.push(`No new Experience at level ${level}.`);

  // Simulated character after the tier achievement, to validate picks in order.
  let sim: Character = {
    ...ch,
    level,
    markedTraits: ach?.clearMarkedTraits ? [] : ch.markedTraits,
    experiences: ach && choices.newExperience ? [...ch.experiences, { name: choices.newExperience.trim() }] : ch.experiences,
  };
  const cost = choices.advancements.reduce((a, c) => a + (ADV.get(c.id)?.cost ?? 99), 0);
  if (cost !== rules.leveling.advancementsPerLevel) p.push('Choose two advancements (Proficiency and Multiclass count as two).');

  const newCards: string[] = [];
  for (const choice of choices.advancements) {
    const adv = ADV.get(choice.id);
    if (!adv) { p.push(`Unknown advancement ${choice.id}.`); continue; }
    const tier = slotFor(sim.advancements, level, choice.id);
    if (tier === null) { p.push(`No unmarked "${choice.id}" slot available at level ${level}.`); continue; }
    const d = derive(sim);
    switch (choice.id) {
      case 'traits': {
        const [a, b] = choice.traits;
        if (!TRAITS.includes(a) || !TRAITS.includes(b) || a === b) p.push('Choose two different traits.');
        else if (sim.markedTraits.includes(a) || sim.markedTraits.includes(b)) p.push('Those traits are marked until your next tier achievement clears them.');
        break;
      }
      case 'hitPoint':
        if (d.hitPoints >= rules.caps.hitPointSlots) p.push(`You already have ${rules.caps.hitPointSlots} Hit Point slots.`);
        break;
      case 'stress':
        if (d.stressSlots >= rules.caps.stressSlots) p.push(`You already have ${rules.caps.stressSlots} Stress slots.`);
        break;
      case 'experiences': {
        const [a, b] = choice.experiences;
        if (a === b || !(a in sim.experiences) || !(b in sim.experiences)) p.push('Choose two different Experiences.');
        break;
      }
      case 'domainCard': {
        if (!choice.card) p.push('Choose the domain card for your advancement.');
        else if (!legalCards(sim, level, newCards).some((c) => c.id === choice.card)) p.push(`Can't take ${choice.card} as an advancement.`);
        newCards.push(choice.card);
        break;
      }
      case 'subclass':
        if (sim.subclassStage === 'mastery') p.push('You already have your mastery.');
        break;
      case 'proficiency':
        if (d.proficiency >= rules.caps.proficiency) p.push('Proficiency is already at its maximum.');
        break;
      case 'multiclass': {
        if (level < rules.leveling.multiclass.minLevel) p.push(`Multiclassing starts at level ${rules.leveling.multiclass.minLevel}.`);
        const mc = classById.get(choice.classId);
        if (!mc || mc.id === ch.classId) p.push('Choose a different class to multiclass into.');
        else {
          if (!mc.domains.includes(choice.domain)) p.push(`${mc.name} doesn't have the ${choice.domain} domain.`);
          if (!mc.subclasses.some((s) => s.id === choice.subclassId)) p.push(`${mc.name} has no subclass ${choice.subclassId}.`);
        }
        break;
      }
      case 'evasion':
        break;
    }
    sim = applyChoice(sim, choice, tier, level);
  }

  // Step four
  if (!choices.domainCard) {
    p.push('Choose your new domain card.');
  } else if (!legalCards(sim, level, newCards).some((c) => c.id === choices.domainCard)) {
    p.push(`Can't take ${choices.domainCard} at level ${level}.`);
  }
  newCards.push(choices.domainCard);

  // Upgraded subclass cards that grant extra domain cards (School of Knowledge).
  const need = extraCardsGranted(ch, sim);
  const extra = choices.extraCards ?? [];
  if (extra.length !== need) p.push(`Choose ${need} additional domain card(s) from your upgraded subclass.`);
  for (const id of extra) {
    if (!legalCards(sim, level, newCards).some((c) => c.id === id)) p.push(`Can't take ${id} as an additional card.`);
    newCards.push(id);
  }

  if (choices.exchange) {
    const from = cardById.get(choices.exchange.from);
    const to = cardById.get(choices.exchange.to);
    if (!from || !ownedCards(ch).some((c) => c.id === from.id)) p.push('Exchange: choose a card you have.');
    else if (!to || to.level > from.level || !legalCards(sim, level, newCards).some((c) => c.id === to.id)) {
      p.push('Exchange: the new card must be one you could take, of the same level or lower.');
    }
  }
  p.push(...pickProblems(newCards, choices.picks, sim));
  return p;
}

/** Additional domain cards granted by the subclass upgrades in these advancements (School of Knowledge). */
export function extraCardsFor(ch: Character, advancements: AdvancementChoice[]): number {
  const ups = advancements.filter((a) => a.id === 'subclass').length;
  const stage = STAGES[Math.min(2, STAGES.indexOf(ch.subclassStage) + ups)];
  return extraCardsGranted(ch, { ...ch, subclassStage: stage });
}

function extraCardsGranted(before: Character, after: Character): number {
  const s = classById.get(before.classId)!.subclasses.find((x) => x.id === before.subclassId)!;
  const from = STAGES.indexOf(before.subclassStage);
  const to = STAGES.indexOf(after.subclassStage);
  let n = 0;
  for (let i = from + 1; i <= to; i++) n += s[STAGES[i]].filter((f) => /^Take an additional domain card/.test(f.text)).length;
  return n;
}

function pickProblems(newCards: string[], picks: PermanentPicks | undefined, sim: Character): string[] {
  const p: string[] = [];
  if (newCards.includes('blade-vitality')) {
    const v = picks?.vitality ?? [];
    if (v.length !== 2 || new Set(v).size !== 2) p.push('Vitality: choose two different benefits.');
  }
  if (newCards.includes('grace-master-of-the-craft')) {
    const e = picks?.masterOfTheCraft?.experiences ?? [];
    if (!(e.length === 1 || (e.length === 2 && e[0] !== e[1])) || e.some((i) => !(i in sim.experiences))) {
      p.push('Master of the Craft: choose two Experiences (+2) or one (+3).');
    }
  }
  return p;
}

function applyChoice(ch: Character, choice: AdvancementChoice, tier: 2 | 3 | 4, level: number): Character {
  const next: Character = { ...ch, advancements: [...ch.advancements, { level, tier, choice }] };
  switch (choice.id) {
    case 'traits':
      next.markedTraits = [...ch.markedTraits, ...choice.traits];
      break;
    case 'subclass':
      next.subclassStage = STAGES[Math.min(2, STAGES.indexOf(ch.subclassStage) + 1)];
      break;
    case 'multiclass':
      next.multiclass = { classId: choice.classId, domain: choice.domain, subclassId: choice.subclassId, level };
      break;
    case 'domainCard':
      return addCard(next, choice.card);
  }
  return next;
}

/** New cards go to the loadout if there's room, else the vault. Vitality / Master of the Craft go to the vault permanently. */
function addCard(ch: Character, id: string): Character {
  const toVault = ch.cards.loadout.length >= rules.caps.loadout || id === 'blade-vitality' || id === 'grace-master-of-the-craft';
  return {
    ...ch,
    cards: toVault
      ? { loadout: ch.cards.loadout, vault: [...ch.cards.vault, id] }
      : { loadout: [...ch.cards.loadout, id], vault: ch.cards.vault },
  };
}

export function applyLevelUp(ch: Character, choices: LevelUpChoices): Character {
  const problems = levelUpProblems(ch, choices);
  if (problems.length) throw new Error(`Invalid level up: ${problems.join(' ')}`);
  const level = ch.level + 1;
  const ach = achievementAt(level);
  let c: Character = {
    ...ch,
    level,
    markedTraits: ach?.clearMarkedTraits ? [] : ch.markedTraits,
    experiences: ach ? [...ch.experiences, { name: choices.newExperience!.trim() }] : ch.experiences,
  };
  for (const choice of choices.advancements) c = applyChoice(c, choice, slotFor(c.advancements, level, choice.id)!, level);
  c = addCard(c, choices.domainCard);
  for (const id of choices.extraCards ?? []) c = addCard(c, id);
  if (choices.exchange) {
    const { from, to } = choices.exchange;
    c = {
      ...c,
      cards: {
        loadout: c.cards.loadout.map((x) => (x === from ? to : x)),
        vault: c.cards.vault.map((x) => (x === from ? to : x)),
      },
    };
  }
  if (choices.picks) c = { ...c, picks: { ...c.picks, ...choices.picks } };
  derive(c);
  return c;
}

export { accessibleDomains };
