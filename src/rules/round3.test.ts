import { describe, expect, it } from 'vitest';
import { guides } from '../data';
import {
  avoidDeath, blazeOfGlory, controlsFor, createCharacter, derive, dropOut, dualityRoll, mustMakeDeathMove,
  rest, riskItAll, scoreDuality, setHitPoints, splitClear, transform, transformProblem, applyOutcome,
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
