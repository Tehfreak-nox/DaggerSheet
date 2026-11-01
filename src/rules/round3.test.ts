import { describe, expect, it } from 'vitest';
import { guides } from '../data';
import {
  avoidDeath, blazeOfGlory, controlsFor, createCharacter, derive, dropOut, dualityRoll, mustMakeDeathMove,
  rest, riskItAll, scoreDuality, setHitPoints, splitClear, transform, transformProblem, applyOutcome, activeForm, damageAddOns, availableForms, evolvedRule, hybridRule, attackProfile, setActive, inEffect,
  type CreateInput, type Rng,
} from './index';

function faces(...f: [sides: number, face: number][]): Rng {
  let i = 0;
  return () => {
    const [sides, face] = f[i++];
    return (face - 0.5) / sides;
  };
}

const druid: CreateInput = {
  id: 'd', name: 'Moss', classId: 'druid', subclassId: 'warden-of-the-elements', ancestry: { id: 'elf' },
  communityId: 'wildborne', traits: { ...guides.druid.traits }, experiences: ['Forager', 'Quiet'],
  primary: { id: 'shortstaff' }, armorId: 'leather-armor', potion: 'minor-health-potion',
  cards: ['sage-gifted-tracker', 'arcana-rune-ward'],
};

describe('beastform', () => {
  it('marks a Stress and adds the form’s trait and Evasion bonuses until you drop out', () => {
    const ch = createCharacter(druid);
    const before = derive(ch);
    const t = transform(ch, 'agile-scout', { via: 'beastform' });
    expect(t.stress).toBe(ch.stress + 1);
    expect(derive(t).traits.agility).toBe(before.traits.agility + 1);
    expect(derive(t).evasion).toBe(before.evasion + 2);
    expect(derive(dropOut(t))).toEqual(before);
  });

  it('Evolution spends 3 Hope, no Stress, and raises a chosen trait by +1', () => {
    const ch = { ...createCharacter(druid), hope: 3 };
    const t = transform(ch, 'agile-scout', { via: 'evolution', trait: 'presence' });
    expect(t.hope).toBe(0);
    expect(t.stress).toBe(ch.stress);
    expect(derive(t).traits.presence).toBe(derive(ch).traits.presence + 1);
    expect(transformProblem({ ...ch, hope: 2 }, 'agile-scout', { via: 'evolution', trait: 'presence' })).toMatch(/3 Hope/);
  });

  it('refuses forms above your tier and needs an unmarked Stress', () => {
    const ch = createCharacter(druid);
    expect(transformProblem(ch, 'great-predator', { via: 'beastform' })).toMatch(/tier/);
    expect(transformProblem({ ...ch, stress: derive(ch).stressSlots }, 'agile-scout', { via: 'beastform' })).toMatch(/Stress/);
  });

  it('marking your last Hit Point drops you out of the form', () => {
    const t = transform(createCharacter(druid), 'agile-scout', { via: 'beastform' });
    expect(setHitPoints(t, 99).beastform).toBeUndefined();
    expect(setHitPoints(t, 1).beastform).toBeDefined();
  });
});

describe('death moves', () => {
  const ch = createCharacter(druid);
  const down = { ...ch, hp: derive(ch).hitPoints };

  it('asks for a death move on the last Hit Point', () => {
    expect(mustMakeDeathMove(ch)).toBe(false);
    expect(mustMakeDeathMove(down)).toBe(true);
    expect(mustMakeDeathMove(blazeOfGlory(down))).toBe(false);
  });

  it('Avoid Death: unconscious; a Hope Die at or under your level scars a Hope slot', () => {
    const scar = avoidDeath(down, faces([12, 1]));
    expect(scar.scarred).toBe(true);
    expect(scar.character.death).toBe('unconscious');
    expect(derive(scar.character).hopeSlots).toBe(5);
    const clean = avoidDeath(down, faces([12, 2]));
    expect(clean.scarred).toBe(false);
    expect(derive(clean.character).hopeSlots).toBe(6);
  });

  it('a scar caps Hope gains', () => {
    const c = { ...ch, scars: 2, hope: 4 };
    expect(applyOutcome(c, { outcome: 'hope' }).hope).toBe(4);
  });

  it('crossing out the last Hope slot ends the journey', () => {
    const r = avoidDeath({ ...down, scars: 5 }, faces([12, 1]));
    expect(r.journeyEnds).toBe(true);
    expect(r.character.death).toBe('dead');
  });

  it('wakes when an ally clears a Hit Point or after a long rest', () => {
    const out = avoidDeath(down, faces([12, 9])).character;
    expect(setHitPoints(out, out.hp - 1).death).toBeUndefined();
    expect(rest(out, 'long', []).character.death).toBeUndefined();
  });

  it('Risk It All: Hope higher clears points, Fear higher is death, matching clears everything', () => {
    const marked = { ...down, stress: 3 };
    const up = riskItAll(marked, faces([12, 5], [12, 2]));
    expect(up.outcome).toBe('clear');
    expect(up.character.hp).toBe(marked.hp - 5);
    expect(splitClear(marked, 5, 3)).toMatchObject({ hp: marked.hp - 3, stress: 1 });
    expect(riskItAll(marked, faces([12, 2], [12, 5])).character.death).toBe('dead');
    expect(riskItAll(marked, faces([12, 7], [12, 7])).character).toMatchObject({ hp: 0, stress: 0 });
  });
});

describe('duality options', () => {
  it('rolls a d20 Hope Die when asked', () => {
    const r = dualityRoll({ label: 'x', modifiers: [], hopeSides: 20 }, faces([20, 17], [12, 3]));
    expect(r.hope).toBe(17);
    expect(r.hopeSides).toBe(20);
    expect(r.outcome).toBe('hope');
  });

  it('Blaze of Glory forces a critical success', () => {
    for (let f = 1; f <= 12; f++) {
      expect(dualityRoll({ label: 'x', modifiers: [], forceCritical: true }, faces([12, f], [6, 1])).outcome).toBe('critical');
    }
  });

  it('rescoring after a reroll recomputes total and outcome', () => {
    const r = dualityRoll({ label: 'x', modifiers: [{ label: 'A', value: 1 }] }, faces([12, 1], [12, 6]));
    expect(r.outcome).toBe('fear');
    const again = scoreDuality({ ...r, hope: 9 });
    expect(again).toMatchObject({ total: 16, outcome: 'hope' });
  });

  it('reads "roll a d20 as your Hope Die" as an arm toggle, not a dice button', () => {
    const c = controlsFor('Once per rest, when you describe how you’re embodying one of these principles through your current action, you can roll a **d20** as your Hope Die.');
    expect(c.map((x) => x.kind)).toEqual(['uses', 'hopeDie']);
  });
});

describe('beastform variants', () => {
  const at = (level: number) => ({ ...createCharacter(druid), level });

  it('threshold features apply while transformed (Powerful Beast Thick Hide +2)', () => {
    const ch = at(5);
    const t = transform(ch, 'powerful-beast', { via: 'beastform' });
    expect(derive(t).thresholds.major).toBe(derive(ch).thresholds.major + 2);
    expect(derive(t).thresholds.severe).toBe(derive(ch).thresholds.severe + 2);
  });

  it('Legendary Beast evolves a tier 1 form with its bonuses', () => {
    const ch = at(5 + 3);
    expect(transformProblem(ch, 'legendary-beast', { via: 'beastform' })).toMatch(/Tier 1/);
    expect(transformProblem(ch, 'legendary-beast', { via: 'beastform' }, { base: 'armored-sentry' })).toMatch(/Tier 1/);
    const t = transform(ch, 'legendary-beast', { via: 'beastform' }, { base: 'agile-scout' });
    const f = activeForm(t)!;
    expect(f.traitBonus).toBe(2);
    expect(f.evasionBonus).toBe(4);
    expect(f.attack).toMatchObject({ sides: 4, bonus: 6, trait: 'agility' });
    expect(derive(t).traits.agility).toBe(derive(ch).traits.agility + 2);
  });

  it('Mythic Beast steps the damage die up', () => {
    const t = transform(at(9), 'mythic-beast', { via: 'beastform' }, { base: 'pack-predator' });
    expect(activeForm(t)!.attack).toMatchObject({ sides: 10, bonus: 11 });
  });

  it('Legendary Hybrid takes picks and an additional Stress', () => {
    const ch = at(6);
    const hybrid = { forms: ['agile-scout', 'pack-predator'], advantages: ['sneak', 'attack', 'track', 'locate'], features: ['pack-predator:pack-hunting', 'agile-scout:agile'] };
    expect(transformProblem(ch, 'legendary-hybrid', { via: 'beastform' }, { hybrid: { ...hybrid, features: [] } })).toMatch(/2 features/);
    const t = transform(ch, 'legendary-hybrid', { via: 'beastform' }, { hybrid });
    expect(t.stress).toBe(ch.stress + 2);
    expect(activeForm(t)!.features.map((x) => x.feature.name)).toEqual(['Agile', 'Pack Hunting']);
  });

  it('finds damage add-ons such as Pack Hunting', () => {
    const t = transform(createCharacter(druid), 'pack-predator', { via: 'beastform' });
    expect(damageAddOns(activeForm(t)!)).toMatchObject([{ name: 'Pack Hunting', sides: 8 }]);
  });
});

describe('every Druid form', () => {
  it('transforms, applies its numbers and has an attack', () => {
    const ch = { ...createCharacter(druid), level: 10 };
    const forms = availableForms(ch);
    expect(forms.length).toBe(24);
    for (const f of forms) {
      const ev = evolvedRule(f), hy = hybridRule(f);
      const simple = forms.filter((x) => !evolvedRule(x) && !hybridRule(x));
      let extras = {};
      if (ev) extras = { base: simple.find((x) => x.tier <= ev.maxTier && x.attack)!.id };
      if (hy) {
        const from = simple.filter((x) => x.tier <= hy.maxTier).slice(0, hy.forms);
        extras = { hybrid: {
          forms: from.map((x) => x.id),
          advantages: [...new Set(from.flatMap((x) => x.advantages))].slice(0, hy.advantages),
          features: from.flatMap((x) => x.features.map((y) => `${x.id}:${y.id}`)).slice(0, hy.features),
        } };
      }
      const t = transform(ch, f.id, { via: 'beastform' }, extras);
      const a = activeForm(t)!;
      expect(a, f.name).toBeDefined();
      expect(a.attack, f.name).not.toBeNull();
      expect(derive(t).evasion, f.name).toBe(derive(ch).evasion + a.evasionBonus);
      if (a.trait) expect(derive(t).traits[a.trait], f.name).toBe(derive(ch).traits[a.trait] + a.traitBonus);
      expect(() => damageAddOns(a)).not.toThrow();
    }
  });
});

describe('card passives and lasting effects', () => {
  const guardian = (cards: string[], over: Partial<CreateInput> = {}) => createCharacter({
    id: 'g', name: 'Tor', classId: 'guardian', subclassId: 'vengeance', ancestry: { id: 'human' }, communityId: 'highborne',
    traits: { ...guides.guardian.traits }, experiences: ['A', 'B'], primary: { id: guides.guardian.primary.id! },
    armorId: 'chainmail-armor', potion: 'minor-health-potion', cards, ...over,
  });

  it('Bare Bones: unarmored Armor Score 3 + Strength and the tier thresholds', () => {
    const ch = { ...guardian(['valor-bare-bones', 'blade-get-back-up']), armorId: undefined };
    const d = derive(ch);
    expect(d.armorScore).toBe(3 + d.traits.strength);
    expect(d.thresholds).toEqual({ major: 9 + ch.level, severe: 19 + ch.level });
  });

  it('Body Basher adds Strength to Melee weapon damage; Cruel Precision the better of Finesse and Agility', () => {
    const plain = guardian(['valor-bare-bones', 'blade-get-back-up']);
    const base = attackProfile(plain, 'primary')!.damageBonus;
    const basher = { ...plain, cards: { loadout: [...plain.cards.loadout, 'valor-body-basher'], vault: [] } };
    const melee = attackProfile(basher, 'primary')!.range === 'melee';
    expect(attackProfile(basher, 'primary')!.damageBonus).toBe(base + (melee ? derive(basher).traits.strength : 0));
    const cruel = { ...plain, cards: { loadout: [...plain.cards.loadout, 'bone-cruel-precision'], vault: [] } };
    const t = derive(cruel).traits;
    expect(attackProfile(cruel, 'primary')!.damageBonus).toBe(base + Math.max(t.finesse, t.agility));
  });

  it('Full Surge raises every trait until a rest; Frenzy adds damage and Severe until ended', () => {
    const ch = guardian(['valor-bare-bones', 'blade-get-back-up']);
    const surge = setActive(ch, 'card:valor-full-surge', true);
    for (const t of ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'] as const) expect(derive(surge).traits[t]).toBe(derive(ch).traits[t] + 2);
    expect(rest(surge, 'short', []).character.active).toEqual([]);
    const frenzy = setActive(ch, 'card:blade-frenzy', true);
    expect(derive(frenzy).thresholds.severe).toBe(derive(ch).thresholds.severe + 8);
    expect(attackProfile(frenzy, 'primary')!.damageBonus).toBe(attackProfile(ch, 'primary')!.damageBonus + 10);
    expect(rest(frenzy, 'long', []).character.active).toEqual(['card:blade-frenzy']);
  });

  it('lists Touched cards only with 4 of their domain in the loadout', () => {
    const ch = guardian(['valor-bare-bones', 'blade-get-back-up']);
    const with3 = { ...ch, cards: { loadout: ['arcana-arcana-touched', 'arcana-rune-ward', 'arcana-wall-walk'], vault: [] } };
    expect(inEffect(with3).some((e) => e.key === 'card:arcana-arcana-touched')).toBe(false);
    const with4 = { ...ch, cards: { loadout: [...with3.cards.loadout, 'arcana-unleash-chaos'], vault: [] } };
    expect(inEffect(with4).some((e) => e.key === 'card:arcana-arcana-touched')).toBe(true);
  });
});
