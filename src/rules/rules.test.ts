import { describe, expect, it } from 'vitest';
import { guides, rules } from '../data';
import {
  addGold, applyLevelUp, applyOutcome, attackProfile, availableAdvancements, canPayStress, createCharacter,
  creationProblems, damageRoll, derive, dualityRoll, equipWeapon, legalCards, levelUpProblems, markStress,
  moveLimit, removeGold, rest, restProblems, severityOf, slotFor, store, take, takeDamage, weaponProblems,
  type Character, type CreateInput, type Gold, type Rng,
} from './index';

/** RNG that makes roll(sides) return the given faces in order. */
function faces(...f: [sides: number, face: number][]): Rng {
  let i = 0;
  return () => {
    const [sides, face] = f[i++];
    return (face - 0.5) / sides;
  };
}

function input(over: Partial<CreateInput> = {}): CreateInput {
  return {
    id: 'test',
    name: 'Kaelen',
    classId: 'bard',
    subclassId: 'troubadour',
    ancestry: { id: 'elf' },
    communityId: 'loreborne',
    traits: { ...guides.bard.traits },
    experiences: ['Scholar', 'Silver Tongue'],
    primary: { id: 'rapier' },
    secondary: { id: 'small-dagger' },
    armorId: 'gambeson-armor',
    potion: 'minor-health-potion',
    cards: ['grace-deft-deceiver', 'codex-book-of-ava'],
    ...over,
  };
}

const gold = (g: Partial<Gold>): Gold => ({ coins: 0, handfuls: 0, bags: 0, chests: 0, ...g });

describe('duality rolls', () => {
  it('adds both dice and modifiers; higher die decides Hope or Fear', () => {
    const r = dualityRoll({ label: 'Agility', modifiers: [{ label: 'Agility', value: 2 }] }, faces([12, 9], [12, 4]));
    expect(r).toMatchObject({ hope: 9, fear: 4, total: 15, outcome: 'hope', advantageDie: null });
    expect(dualityRoll({ label: 'x', modifiers: [] }, faces([12, 3], [12, 8])).outcome).toBe('fear');
  });

  it('is a critical success on matching dice', () => {
    expect(dualityRoll({ label: 'x', modifiers: [] }, faces([12, 7], [12, 7])).outcome).toBe('critical');
  });

  it('adds a d6 with advantage and subtracts it with disadvantage', () => {
    const adv = dualityRoll({ label: 'x', modifiers: [], advantage: 'advantage' }, faces([12, 5], [12, 6], [6, 4]));
    expect(adv.total).toBe(15);
    const dis = dualityRoll({ label: 'x', modifiers: [], advantage: 'disadvantage' }, faces([12, 5], [12, 6], [6, 4]));
    expect(dis.total).toBe(7);
  });

  it('gives Hope on Hope, Hope and a cleared Stress on a crit, nothing on Fear', () => {
    const ch = { ...createCharacter(input()), hope: 2, stress: 3 };
    expect(applyOutcome(ch, { outcome: 'hope' })).toMatchObject({ hope: 3, stress: 3 });
    expect(applyOutcome(ch, { outcome: 'critical' })).toMatchObject({ hope: 3, stress: 2 });
    expect(applyOutcome(ch, { outcome: 'fear' })).toMatchObject({ hope: 2, stress: 3 });
    expect(applyOutcome({ ...ch, hope: 6 }, { outcome: 'hope' }).hope).toBe(6);
  });
});

describe('damage', () => {
  it('rolls Proficiency dice plus a flat bonus', () => {
    const r = damageRoll({ dice: [{ count: 2, sides: 8 }], bonus: 2 }, faces([8, 3], [8, 5]));
    expect(r.total).toBe(10);
  });

  it('adds the maximum dice result on a critical', () => {
    const r = damageRoll({ dice: [{ count: 2, sides: 8 }], bonus: 1, critical: true }, faces([8, 1], [8, 1]));
    expect(r.critBonus).toBe(16);
    expect(r.total).toBe(19);
  });

  it('drops the lowest die for Massive/Powerful', () => {
    const r = damageRoll({ dice: [{ count: 1, sides: 10 }], bonus: 0, extraDieDropLowest: true }, faces([10, 2], [10, 9]));
    expect(r.rolls[0]).toMatchObject({ values: [9], dropped: 2 });
  });

  it('marks 1/2/3 HP by threshold and armor reduces one step', () => {
    const t = { major: 6, severe: 12 };
    expect([0, 1, 5, 6, 11, 12, 30].map((n) => severityOf(n, t))).toEqual(['none', 'minor', 'minor', 'major', 'major', 'severe', 'severe']);
    const ch = createCharacter(input());
    const hit = takeDamage(ch, 13, t, 3, 6, true);
    expect(hit).toMatchObject({ severity: 'major', hpMarked: 2, armorUsed: true });
    expect(hit.character).toMatchObject({ hp: 2, armorMarked: 1 });
    expect(takeDamage(ch, 13, t, 3, 6, false).hpMarked).toBe(3);
    expect(takeDamage({ ...ch, armorMarked: 3 }, 13, t, 3, 6, true).armorUsed).toBe(false);
  });

  it('marks 1 HP when Stress overflows, and blocks paying Stress you don’t have', () => {
    const ch = { ...createCharacter(input()), stress: 6 };
    expect(markStress(ch, 1, 6, 5)).toMatchObject({ stress: 6, hp: 1 });
    expect(canPayStress(ch, 1, 6)).toBe(false);
  });
});

describe('creation', () => {
  it('creates a level 1 character with SRD starting values', () => {
    const ch = createCharacter(input());
    const d = derive(ch);
    expect(ch).toMatchObject({ level: 1, hope: 2, hp: 0, stress: 0, gold: { handfuls: 1 } });
    expect(d).toMatchObject({ proficiency: 1, hitPoints: 5, stressSlots: 6, evasion: 11, armorScore: 3 });
    expect(d.thresholds).toEqual({ major: 6, severe: 12 }); // Gambeson 5/11 + level 1
  });

  it('rejects illegal choices', () => {
    expect(creationProblems(input({ traits: { ...guides.bard.traits, agility: 2 } }))).toContain('Traits must use 2, 1, 1, 0, 0, -1 once each.');
    expect(creationProblems(input({ cards: ['blade-get-back-up', 'codex-book-of-ava'] })).join()).toMatch(/not in your class/);
    expect(creationProblems(input({ cards: ['codex-book-of-ava', 'codex-book-of-ava'] })).join()).toMatch(/different/);
    expect(creationProblems(input({ primary: { id: 'longsword' } })).join()).toMatch(/hands-full/);
    expect(creationProblems(input({ classId: 'guardian', subclassId: 'stalwart', primary: { id: 'hallowed-axe' }, secondary: undefined, cards: ['valor-bare-bones', 'blade-get-back-up'] })).join()).toMatch(/needs-spellcast/);
    expect(creationProblems(input({ primary: { id: 'improved-rapier' } })).join()).toMatch(/tier-too-high/);
    expect(creationProblems(input({ ancestry: { mixed: { first: 'elf', second: 'elf' } } })).join()).toMatch(/two different/);
  });

  it('applies ancestry stat features', () => {
    expect(derive(createCharacter(input({ ancestry: { id: 'giant' } }))).hitPoints).toBe(6);
    expect(derive(createCharacter(input({ ancestry: { id: 'human' } }))).stressSlots).toBe(7);
    expect(derive(createCharacter(input({ ancestry: { id: 'simiah' } }))).evasion).toBe(12);
    const earthkin = derive(createCharacter(input({ ancestry: { id: 'earthkin' } })));
    expect(earthkin.armorScore).toBe(4);
    expect(earthkin.thresholds).toEqual({ major: 7, severe: 13 });
    // Mixed: first feature of Simiah (Natural Climber) + second of Giant (Reach) → no stat changes.
    const mixed = derive(createCharacter(input({ ancestry: { mixed: { first: 'simiah', second: 'giant' } } })));
    expect(mixed.evasion).toBe(11);
    // Clank Purposeful Design: +1 to the chosen Experience.
    const clank = createCharacter(input({ ancestry: { id: 'clank' }, purposefulDesign: 1 }));
    expect(derive(clank).experiences.map((e) => e.value)).toEqual([2, 3]);
    expect(creationProblems(input({ ancestry: { id: 'clank' } })).join()).toMatch(/Purposeful Design/);
  });

  it('gives the School of Knowledge a third starting card', () => {
    const wiz = input({ classId: 'wizard', subclassId: 'school-of-knowledge', traits: { ...guides.wizard.traits }, primary: { id: 'greatstaff' }, secondary: undefined, armorId: 'leather-armor', cards: ['codex-book-of-ava', 'splendor-bolt-beacon'] });
    expect(creationProblems(wiz).join()).toMatch(/Choose 3/);
    expect(creationProblems({ ...wiz, cards: [...wiz.cards, 'codex-book-of-illiat'] })).toEqual([]);
  });
});

describe('equipment', () => {
  it('lets a two-handed primary push out the secondary', () => {
    const ch = createCharacter(input());
    const next = equipWeapon(ch, 'primary', { id: 'quarterstaff' });
    expect(next.secondary).toBeUndefined();
    expect(weaponProblems(next, 'small-dagger', 'secondary')).toContain('hands-full');
  });

  it('lets a Warrior ignore burden (Combat Training)', () => {
    const w = createCharacter(input({ classId: 'warrior', subclassId: 'call-of-the-brave', traits: { ...guides.warrior.traits }, primary: { id: 'longsword' }, secondary: { id: 'shortsword' }, armorId: 'chainmail-armor', cards: ['blade-get-back-up', 'bone-untouchable'] }));
    expect(weaponProblems(w, 'shortsword', 'secondary')).toEqual([]);
    // Combat Training: + level to physical damage.
    expect(attackProfile(w, 'primary')!.damageBonus).toBe(3 + 1);
  });

  it('builds attack profiles with weapon modifiers', () => {
    const ch = createCharacter(input({ primary: { id: 'broadsword' }, secondary: { id: 'small-dagger' } }));
    const a = attackProfile(ch, 'primary')!;
    expect(a).toMatchObject({ trait: 'agility', traitValue: 0, dice: [{ count: 1, sides: 8 }], damageBonus: 0 });
    expect(a.attackModifiers).toEqual([{ label: 'Broadsword', value: 1 }]); // Reliable
    expect(a.conditional).toMatchObject([{ stat: 'primaryDamage', value: 2, condition: 'Target within Melee range' }]); // Paired
    const v = attackProfile({ ...ch, primary: { id: 'whipsword', versatile: true } }, 'primary')!;
    expect(v).toMatchObject({ trait: 'finesse', range: 'melee', dice: [{ sides: 10 }] });
  });

  it('applies armor and weapon stat features', () => {
    expect(derive(createCharacter(input({ armorId: 'full-plate-armor' })))).toMatchObject({ evasion: 8, traits: { agility: -1 } });
    const sorc = createCharacter(input({ classId: 'sorcerer', subclassId: 'elemental-origin', traits: { ...guides.sorcerer.traits }, primary: { id: 'dualstaff' }, secondary: undefined, armorId: 'mage-robes', cards: ['arcana-rune-ward', 'midnight-pick-and-pull'] }));
    // Mage Robes "Enchanted": thresholds + Spellcast trait (Instinct +2): 4/10 + 1 + 2.
    expect(derive(sorc).thresholds).toEqual({ major: 7, severe: 13 });
  });

  it('gives the Brawler Brawler’s Strike and +1 Evasion with no weapons', () => {
    const b = createCharacter(input({ classId: 'brawler', subclassId: 'juggernaut', traits: { ...guides.brawler.traits }, primary: undefined, secondary: undefined, armorId: 'brigandine-armor', cards: ['valor-bare-bones', 'bone-untouchable'] }));
    const d = derive(b);
    expect(d.brawlersStrike).toBe(true);
    // 10 + 1 (I Am the Weapon) + ceil(Agility 1 / 2) (Untouchable)
    expect(d.evasion).toBe(12);
    expect(d.thresholds.severe).toBe(12 + 1 + 3); // Rugged
    expect(attackProfile(b, 'primary')!.dice).toEqual([{ count: 1, sides: 8 }, { count: 1, sides: 6 }]);
  });
});

describe('rests', () => {
  it('rolls 1d4 + tier and applies short rest moves', () => {
    const ch = { ...createCharacter(input()), hp: 4, stress: 5, hope: 0 };
    const { character, log } = rest(ch, 'short', [{ id: 'tend-to-wounds' }, { id: 'prepare', withParty: true }], faces([4, 2]));
    expect(log[0].roll).toEqual({ die: 2, tier: 1, total: 3 });
    expect(character).toMatchObject({ hp: 1, hope: 2, stress: 5, shortRestStreak: 1 });
  });

  it('requires a long rest after three short rests', () => {
    let ch = createCharacter(input({ ancestry: { id: 'human' } }));
    for (let i = 0; i < 3; i++) ch = rest(ch, 'short', [{ id: 'prepare' }]).character;
    expect(restProblems(ch, 'short', [])).toHaveLength(1);
    ch = rest(ch, 'long', [{ id: 'clear-all-stress' }, { id: 'tend-to-all-wounds' }]).character;
    expect(ch.shortRestStreak).toBe(0);
  });

  it('refreshes per-rest uses on any rest and per-long-rest uses on a long rest', () => {
    const ch = { ...createCharacter(input({ ancestry: { id: 'human' } })), uses: { 'rest:a': 1, 'longRest:b': 1, 'session:c': 1 } };
    expect(rest(ch, 'short', []).character.uses).toEqual({ 'longRest:b': 1, 'session:c': 1 });
    expect(rest(ch, 'long', []).character.uses).toEqual({ 'session:c': 1 });
  });

  it('gives Elves a third move and lets Clanks take one long move on a short rest', () => {
    const elf = createCharacter(input());
    expect(moveLimit(elf)).toBe(3);
    const clank = createCharacter(input({ ancestry: { id: 'clank' }, purposefulDesign: 0 }));
    expect(restProblems(clank, 'short', [{ id: 'clear-all-stress' }])).toEqual([]);
    expect(restProblems(clank, 'short', [{ id: 'clear-all-stress' }, { id: 'tend-to-all-wounds' }])).toHaveLength(1);
    expect(restProblems(elf, 'short', [{ id: 'clear-all-stress' }])).toHaveLength(1);
  });
});

describe('gold', () => {
  it('rolls ten of a row into the next and clears the row', () => {
    expect(addGold(gold({ handfuls: 9 }), 'handfuls').gold).toEqual(gold({ bags: 1 }));
    expect(addGold(gold({ coins: 9, handfuls: 9 }), 'coins').gold).toEqual(gold({ bags: 1 }));
    expect(addGold(gold({ bags: 9, handfuls: 3 }), 'bags').gold).toEqual(gold({ chests: 1, handfuls: 3 }));
  });

  it('stays maxed when every higher row is full (one chest max)', () => {
    const full = gold({ chests: 1, bags: 9 });
    expect(addGold(full, 'bags').gold).toEqual(gold({ chests: 1, bags: 10 }));
    const r = addGold(gold({ chests: 1, bags: 10 }), 'bags');
    expect(r.overflow).toBe(1);
    expect(addGold(gold({ chests: 1 }), 'chests').overflow).toBe(1);
  });

  it('spends by breaking a larger denomination', () => {
    expect(removeGold(gold({ bags: 1 }), 'handfuls')).toEqual(gold({ handfuls: 9 }));
    expect(removeGold(gold({}), 'handfuls')).toBeNull();
  });

  it('moves gold to and from the safe', () => {
    const s = store(gold({ handfuls: 3 }), gold({}), 'handfuls', 2)!;
    expect(s).toEqual({ carried: gold({ handfuls: 1 }), safe: gold({ handfuls: 2 }) });
    expect(take(s.carried, s.safe, 'handfuls', 2)!.carried).toEqual(gold({ handfuls: 3 }));
  });
});

describe('level up', () => {
  const base = () => createCharacter(input());

  it('applies tier achievements, advancements and a new card', () => {
    const ch = applyLevelUp(base(), {
      newExperience: 'Bard of the Road',
      advancements: [{ id: 'traits', traits: ['agility', 'strength'] }, { id: 'hitPoint' }],
      domainCard: 'grace-enrapture',
    });
    const d = derive(ch);
    expect(ch.level).toBe(2);
    expect(d.proficiency).toBe(2);
    expect(d.hitPoints).toBe(6);
    expect(d.traits).toMatchObject({ agility: 1, strength: 0 });
    expect(d.thresholds).toEqual({ major: 7, severe: 13 }); // +1 from the level
    expect(d.experiences).toHaveLength(3);
    expect(ch.markedTraits).toEqual(['agility', 'strength']);
    expect(ch.cards.loadout).toContain('grace-enrapture');
  });

  it('rejects illegal level ups', () => {
    const ch = base();
    const ok = { newExperience: 'X', advancements: [{ id: 'evasion' as const }, { id: 'stress' as const }], domainCard: 'grace-enrapture' };
    expect(levelUpProblems(ch, ok)).toEqual([]);
    expect(levelUpProblems(ch, { ...ok, newExperience: undefined }).join()).toMatch(/new Experience/);
    expect(levelUpProblems(ch, { ...ok, advancements: [{ id: 'evasion' }] }).join()).toMatch(/two advancements/);
    expect(levelUpProblems(ch, { ...ok, advancements: [{ id: 'evasion' }, { id: 'evasion' }] }).join()).toMatch(/No unmarked "evasion"/);
    expect(levelUpProblems(ch, { ...ok, advancements: [{ id: 'proficiency' }] }).join()).toMatch(/proficiency/);
    expect(levelUpProblems(ch, { ...ok, domainCard: 'grace-copycat' }).join()).toMatch(/Can't take/);
    expect(levelUpProblems(ch, { ...ok, domainCard: 'blade-get-back-up' }).join()).toMatch(/Can't take/);
  });

  it('only allows marked traits again after the next tier achievement', () => {
    let ch = base();
    const lv = (c: Character, exp: string | undefined, adv: Parameters<typeof applyLevelUp>[1]['advancements']) =>
      applyLevelUp(c, { newExperience: exp, advancements: adv, domainCard: legalCards(c, c.level + 1)[0].id });
    ch = lv(ch, 'A', [{ id: 'traits', traits: ['agility', 'strength'] }, { id: 'traits', traits: ['finesse', 'instinct'] }]);
    expect(levelUpProblems(ch, { advancements: [{ id: 'traits', traits: ['agility', 'presence'] }, { id: 'evasion' }], domainCard: legalCards(ch, 3)[0].id }).join()).toMatch(/marked/);
    ch = lv(ch, undefined, [{ id: 'traits', traits: ['presence', 'knowledge'] }, { id: 'evasion' }]);
    expect(availableAdvancements(ch).map((a) => a.id)).not.toContain('traits');
    ch = lv(ch, undefined, [{ id: 'hitPoint' }, { id: 'stress' }]);
    // Level 5: marks clear, tier 3 opens subclass / proficiency / multiclass.
    expect(availableAdvancements(ch).map((a) => a.id)).toEqual(expect.arrayContaining(['traits', 'subclass', 'proficiency', 'multiclass']));
    ch = lv(ch, 'B', [{ id: 'traits', traits: ['agility', 'strength'] }, { id: 'subclass' }]);
    expect(ch.markedTraits).toEqual(['agility', 'strength']);
    expect(ch.subclassStage).toBe('specialization');
    // Upgraded subclass crosses out this tier's multiclass option.
    expect(slotFor(ch.advancements, 6, 'multiclass')).toBeNull();
  });

  it('multiclasses at level 5+ with the half-level card limit', () => {
    let ch = base();
    for (let i = 0; i < 4; i++) {
      ch = applyLevelUp(ch, { newExperience: ch.level + 1 === 2 ? 'A' : ch.level + 1 === 5 ? 'B' : undefined, advancements: [{ id: 'hitPoint' }, { id: 'stress' }].slice(0, 2) as never, domainCard: legalCards(ch, ch.level + 1)[0].id });
      if (ch.level === 3) break;
    }
    expect(ch.level).toBe(3);
    ch = applyLevelUp(ch, { advancements: [{ id: 'evasion' }, { id: 'experiences', experiences: [0, 1] }], domainCard: legalCards(ch, 4)[0].id });
    ch = applyLevelUp(ch, {
      newExperience: 'C',
      advancements: [{ id: 'multiclass', classId: 'warrior', domain: 'blade', subclassId: 'call-of-the-brave' }],
      domainCard: 'blade-get-back-up',
    });
    expect(ch.multiclass).toMatchObject({ classId: 'warrior', domain: 'blade', level: 5 });
    // ceil(5 / 2) = 3: a level 3 Blade card is fine, level 4 isn't.
    const blade = legalCards(ch, 5).filter((c) => c.domain === 'blade').map((c) => c.level);
    expect(Math.max(...blade)).toBe(3);
    expect(slotFor(ch.advancements, 6, 'subclass')).toBeNull();
    expect(slotFor(ch.advancements, 8, 'multiclass')).toBeNull();
    expect(slotFor(ch.advancements, 8, 'subclass')).toBe(4);
  });

  it('asks for Vitality picks and applies them permanently', () => {
    const war = createCharacter(input({ classId: 'warrior', subclassId: 'call-of-the-brave', traits: { ...guides.warrior.traits }, primary: { id: 'longsword' }, secondary: undefined, armorId: 'chainmail-armor', cards: ['blade-get-back-up', 'bone-untouchable'] }));
    let ch = war;
    const step = (c: Character) => {
      const simple = availableAdvancements(c).filter((a) => ['evasion', 'hitPoint', 'stress', 'experiences'].includes(a.id));
      const picks = simple.flatMap((a) => (a.slots[String(Math.max(2, Math.min(4, c.level + 1 <= 4 ? 2 : c.level + 1 <= 7 ? 3 : 4))) as '2'] > 1 ? [a, a] : [a])).slice(0, 2);
      return applyLevelUp(c, {
        newExperience: [2, 5, 8].includes(c.level + 1) ? `E${c.level}` : undefined,
        advancements: picks.map((a) => (a.id === 'experiences' ? { id: 'experiences', experiences: [0, 1] } : { id: a.id })) as never,
        domainCard: legalCards(c, c.level + 1).find((x) => x.id !== 'blade-vitality')!.id,
      });
    };
    while (ch.level < 4) ch = step(ch);
    const before = derive(ch);
    const choices = { newExperience: 'Veteran', advancements: [{ id: 'traits' as const, traits: ['agility', 'strength'] as ['agility', 'strength'] }, { id: 'proficiency' as const }].slice(0, 1).concat([{ id: 'traits', traits: ['finesse', 'instinct'] }] as never), domainCard: 'blade-vitality' };
    expect(levelUpProblems(ch, choices).join()).toMatch(/Vitality/);
    ch = applyLevelUp(ch, { ...choices, picks: { vitality: ['hitPoint', 'thresholds'] } });
    const after = derive(ch);
    expect(after.hitPoints).toBe(before.hitPoints + 1);
    expect(after.thresholds.major).toBe(before.thresholds.major + 1 + 2);
    expect(ch.cards.vault).toContain('blade-vitality');
  });

  it('caps Proficiency per sheet tier: one +1 in tier 3 and one in tier 4', () => {
    expect(rules.leveling.advancements.find((a) => a.id === 'proficiency')!.slots).toEqual({ 2: 0, 3: 2, 4: 2 });
  });
});
