// End-to-end simulation: every class × subclass × ancestry × community is
// created from its class guide, played (rolls, attacks, damage, rests, gear
// swaps) and levelled 1 → 10 with random legal choices. The independent
// checker in validate.ts runs after every step.
import { describe, expect, it } from 'vitest';
import { ancestries, classes, communities, domainCards, rules } from '../data';
import {
  ancestryFeatures, applyLevelUp, applyOutcome, attackProfile, characterProblems, createCharacter, creationProblems, damageRoll,
  derive, dualityRoll, legalCards, markStress, rest, seededRng, slotFor, startingCardCount,
  takeDamage, TRAIT_IDS, type AdvancementChoice, type Character, type Rng,
} from './index';
import { guideInput, pick, randomGear, randomLevelUp } from './simulate';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Roll every trait, attack with both weapons, take damage and rest; return problems found. */
function play(ch: Character, rng: Rng): { ch: Character; problems: string[] } {
  const problems: string[] = [];
  const d = derive(ch);
  for (const t of TRAIT_IDS) {
    const r = dualityRoll({ label: t, modifiers: [{ label: t, value: d.traits[t] }], advantage: pick(rng, ['none', 'advantage', 'disadvantage'] as const) }, rng);
    if (r.hope < 1 || r.hope > 12 || r.fear < 1 || r.fear > 12) problems.push(`bad duality dice ${r.hope}/${r.fear}`);
    ch = applyOutcome(ch, r);
  }
  for (const slot of ['primary', 'secondary'] as const) {
    const a = attackProfile(ch, slot);
    if (!a) continue;
    if (a.dice.some((x) => x.count !== d.proficiency)) problems.push(`${slot} rolls ${a.dice[0].count} dice at Proficiency ${d.proficiency}`);
    if (!Number.isFinite(a.traitValue)) problems.push(`${slot} has no trait value (${a.trait})`);
    const crit = rng() < 0.2;
    const dmg = damageRoll({ dice: a.dice, bonus: a.damageBonus, critical: crit, extraDieDropLowest: a.extraDieDropLowest }, rng);
    const min = a.dice.reduce((s, x) => s + x.count, 0) + a.damageBonus + (crit ? a.dice.reduce((s, x) => s + x.count * x.sides, 0) : 0);
    if (dmg.total < min) problems.push(`${slot} damage ${dmg.total} below minimum ${min}`);
  }
  const hit = takeDamage(ch, 1 + Math.floor(rng() * 3 * d.thresholds.severe / 2), d.thresholds, d.armorScore, d.hitPoints, rng() < 0.5);
  ch = markStress(hit.character, 1 + Math.floor(rng() * 3), d.stressSlots, d.hitPoints);
  if (ch.hp > d.hitPoints || ch.stress > d.stressSlots) problems.push('tracks over their maximum');
  // Short rests until a long rest is required, then a long rest.
  const shortMoves = rules.downtime.short.moves.map((m) => m.id);
  while (ch.shortRestStreak < rules.downtime.shortRestsBeforeLong && rng() < 0.7) {
    ch = rest(ch, 'short', [{ id: pick(rng, shortMoves) }, { id: pick(rng, shortMoves), withParty: rng() < 0.5 }], rng).character;
  }
  ch = rest(ch, 'long', [{ id: 'tend-to-all-wounds' }, { id: 'clear-all-stress' }], rng).character;
  if (ch.hp !== 0 || ch.stress !== 0) problems.push('long rest did not clear HP and Stress');
  ch = { ...ch, armorMarked: 0 };
  return { ch, problems };
}

interface Run {
  failures: string[];
  cards: Set<string>;
  advancements: Map<string, number>;
  mastery: Set<string>;
  multiclass: Set<string>;
  levelled: number;
}

function newRun(): Run {
  return { failures: [], cards: new Set(), advancements: new Map(), mastery: new Set(), multiclass: new Set(), levelled: 0 };
}

function simulate(run: Run, label: string, rng: Rng, start: Character) {
  let ch = start;
  const fail = (msg: string) => run.failures.push(`${label} L${ch.level}: ${msg}`);
  const check = () => characterProblems(ch).forEach(fail);
  check();
  try {
    let r = play(ch, rng);
    ch = r.ch;
    r.problems.forEach(fail);
    while (ch.level < 10) {
      const choices = randomLevelUp(ch, rng);
      if (!choices) { fail('no legal level-up choices'); return; }
      ch = applyLevelUp(ch, choices);
      for (const a of choices.advancements) run.advancements.set(a.id, (run.advancements.get(a.id) ?? 0) + 1);
      ch = randomGear(ch, rng);
      check();
      r = play(ch, rng);
      ch = r.ch;
      r.problems.forEach(fail);
      check();
    }
    run.levelled++;
    [...ch.cards.loadout, ...ch.cards.vault].forEach((c) => run.cards.add(c));
    if (ch.subclassStage === 'mastery') run.mastery.add(`${ch.classId}/${ch.subclassId}`);
    if (ch.multiclass) run.multiclass.add(`${ch.classId}>${ch.multiclass.classId}`);
  } catch (e) {
    fail(`threw: ${(e as Error).message}`);
  }
}

const report = (run: Run) => (run.failures.length ? `${run.failures.length} failures, first:\n${run.failures.slice(0, 25).join('\n')}` : '');

describe('simulation: every class, subclass, ancestry and community', () => {
  it('creates and levels all 9,360 combinations to 10', () => {
    const run = newRun();
    for (const cls of classes) {
      for (const sub of cls.subclasses) {
        for (const anc of ancestries) {
          for (const com of communities) {
            const label = `${cls.id}/${sub.id}/${anc.id}/${com.id}`;
            const rng = seededRng(hash(label));
            const input = guideInput(cls.id, sub.id, { id: anc.id }, com.id, rng);
            const problems = creationProblems(input);
            if (problems.length) { run.failures.push(`${label}: creation: ${problems.join(' ')}`); continue; }
            simulate(run, label, rng, createCharacter(input));
          }
        }
      }
    }
    expect(report(run)).toBe('');
    expect(run.levelled).toBe(13 * 2 * 24 * 15);
    // Coverage: everything the rules allow actually happened somewhere.
    const reachable = domainCards.filter((c) => c.level <= 10);
    expect(reachable.filter((c) => !run.cards.has(c.id)).map((c) => c.id)).toEqual([]);
    expect([...run.advancements.keys()].sort()).toEqual(rules.leveling.advancements.map((a) => a.id).sort());
    expect(run.mastery.size).toBe(26);
    expect(run.multiclass.size).toBeGreaterThan(100);
  }, 900_000);

  it('builds every mixed ancestry (552 ordered pairs) and levels it to 10', () => {
    const run = newRun();
    let i = 0;
    for (const a of ancestries) {
      for (const b of ancestries) {
        if (a.id === b.id) continue;
        const cls = classes[i % classes.length];
        const sub = cls.subclasses[i % 2];
        const com = communities[i % communities.length];
        i++;
        const label = `${cls.id}/${sub.id}/${a.id}+${b.id}/${com.id}`;
        const rng = seededRng(hash(label));
        const input = guideInput(cls.id, sub.id, { mixed: { first: a.id, second: b.id } }, com.id, rng);
        const problems = creationProblems(input);
        if (problems.length) { run.failures.push(`${label}: creation: ${problems.join(' ')}`); continue; }
        const ch = createCharacter(input);
        // Mixed = first feature of one, second feature of the other.
        expect(ancestryFeatures(ch).map((f) => f.id)).toEqual([a.features[0].id, b.features[1].id]);
        simulate(run, label, rng, ch);
      }
    }
    expect(report(run)).toBe('');
    expect(run.levelled).toBe(24 * 23);
  }, 300_000);
});

describe('creation choices', () => {
  it('accepts every legal pair of starting domain cards for every subclass', () => {
    const failures: string[] = [];
    let combos = 0;
    for (const cls of classes) {
      const pool = domainCards.filter((c) => c.level === 1 && (cls.domains as string[]).includes(c.domain)).map((c) => c.id);
      expect(pool, cls.id).toHaveLength(6);
      for (const sub of cls.subclasses) {
        const n = startingCardCount(cls.id, sub.id);
        const sets: string[][] = [];
        const choose = (start: number, acc: string[]) => {
          if (acc.length === n) { sets.push(acc); return; }
          for (let k = start; k < pool.length; k++) choose(k + 1, [...acc, pool[k]]);
        };
        choose(0, []);
        for (const cards of sets) {
          combos++;
          const input = { ...guideInput(cls.id, sub.id, { id: 'human' }, 'loreborne', seededRng(1)), cards };
          const p = creationProblems(input);
          if (p.length) failures.push(`${cls.id}/${sub.id} ${cards.join('+')}: ${p.join(' ')}`);
        }
      }
    }
    expect(failures).toEqual([]);
    // 24 subclasses × C(6,2) + School of Knowledge × C(6,3) (+ School of War × C(6,2))
    expect(combos).toBe(25 * 15 + 20);
  });

  it('makes every domain card reachable at its level by some class', () => {
    for (const card of domainCards) {
      const cls = classes.find((c) => (c.domains as string[]).includes(card.domain));
      expect(cls, card.id).toBeDefined();
      const ch = { classId: cls!.id, cards: { loadout: [], vault: [] } } as unknown as Character;
      expect(legalCards(ch, card.level).some((c) => c.id === card.id), card.id).toBe(true);
      if (card.level > 1) expect(legalCards(ch, card.level - 1).some((c) => c.id === card.id), card.id).toBe(false);
    }
  });
});

describe('forced paths', () => {
  /** Level a character choosing `want` advancements first whenever they're legal. */
  function levelWith(ch: Character, rng: Rng, want: (level: number) => AdvancementChoice[] | null) {
    while (ch.level < 10) {
      const forced = want(ch.level + 1);
      const choices = (forced && randomLevelUp(ch, rng, forced)) || randomLevelUp(ch, rng);
      if (!choices) throw new Error(`no legal choices at level ${ch.level + 1}`);
      ch = applyLevelUp(ch, choices);
    }
    return ch;
  }

  it('lets every subclass reach specialization at 5 and mastery at 8', () => {
    for (const cls of classes) {
      for (const sub of cls.subclasses) {
        const rng = seededRng(hash(sub.id));
        let ch = createCharacter(guideInput(cls.id, sub.id, { id: 'human' }, 'wildborne', rng));
        ch = levelWith(ch, rng, (lvl) => (lvl === 5 || lvl === 8 ? [{ id: 'subclass' }, { id: 'evasion' }] : null));
        expect(characterProblems(ch), sub.id).toEqual([]);
        expect(ch.subclassStage, sub.id).toBe('mastery');
        expect(ch.advancements.filter((a) => a.choice.id === 'subclass').map((a) => a.level), sub.id).toEqual([5, 8]);
      }
    }
  });

  it('lets every class multiclass into every other class and domain at level 5', () => {
    const failures: string[] = [];
    for (const cls of classes) {
      for (const other of classes) {
        if (other.id === cls.id) continue;
        for (const domain of other.domains) {
          const label = `${cls.id}>${other.id}/${domain}`;
          const rng = seededRng(hash(label));
          let ch = createCharacter(guideInput(cls.id, cls.subclasses[0].id, { id: 'elf' }, 'seaborne', rng));
          try {
            ch = levelWith(ch, rng, (lvl) => (lvl === 5 ? [{ id: 'multiclass', classId: other.id, domain, subclassId: other.subclasses[1].id }] : null));
          } catch (e) {
            failures.push(`${label}: ${(e as Error).message}`);
            continue;
          }
          if (ch.multiclass?.domain !== domain) failures.push(`${label}: multiclass not applied`);
          failures.push(...characterProblems(ch).map((p) => `${label}: ${p}`));
          // After multiclassing, no further multiclass and no tier-3 subclass upgrade.
          if (slotFor(ch.advancements, 10, 'multiclass') !== null) failures.push(`${label}: second multiclass allowed`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('takes Proficiency to 6 by level 10 (achievements + both boxed advancements)', () => {
    const rng = seededRng(42);
    let ch = createCharacter(guideInput('guardian', 'stalwart', { id: 'giant' }, 'ridgeborne', rng));
    ch = levelWith(ch, rng, (lvl) => (lvl === 5 || lvl === 8 ? [{ id: 'proficiency' }] : null));
    expect(derive(ch).proficiency).toBe(6);
    expect(characterProblems(ch)).toEqual([]);
  });

  it('keeps HP and Stress slots within 12 when taking every slot', () => {
    const rng = seededRng(7);
    let ch = createCharacter(guideInput('guardian', 'vengeance', { id: 'giant' }, 'ridgeborne', rng));
    ch = levelWith(ch, rng, () => [{ id: 'hitPoint' }, { id: 'stress' }]);
    const d = derive(ch);
    expect(d.hitPoints).toBeLessThanOrEqual(12);
    expect(d.stressSlots).toBeLessThanOrEqual(12);
    expect(characterProblems(ch)).toEqual([]);
  });
});
