import { describe, expect, it } from 'vitest';
import { ancestries, cardById, classById, classes, communities, domainCards } from '../data';
import { controlsFor } from './mechanics';

describe('feature controls', () => {
  it('parses every feature and card without throwing', () => {
    const texts = [
      ...domainCards.map((c) => c.text),
      ...classes.flatMap((c) => [c.hopeFeature.text, ...c.features.map((f) => f.text),
        ...c.subclasses.flatMap((s) => [...s.foundation, ...s.specialization, ...s.mastery].map((f) => f.text))]),
      ...ancestries.flatMap((a) => a.features.map((f) => f.text)),
      ...communities.map((c) => c.feature.text),
    ];
    let withControls = 0;
    for (const t of texts) if (controlsFor(t).length) withControls++;
    expect(withControls / texts.length).toBeGreaterThan(0.6);
  });

  it('reads costs, rolls, damage, uses and tokens', () => {
    expect(controlsFor(cardById.get('arcana-unleash-chaos')!.text)).toEqual(expect.arrayContaining([
      { kind: 'roll', trait: 'spellcast', difficulty: undefined, label: 'Spellcast Roll' },
      { kind: 'stress', n: 1, label: 'Mark 1 Stress' },
      { kind: 'tokens', source: { trait: 'spellcast', min: undefined }, label: 'Tokens' },
    ]));
    expect(controlsFor(cardById.get('arcana-cinder-grasp')!.text)).toEqual(expect.arrayContaining([
      { kind: 'damage', count: 1, sides: 20, bonus: 3, type: 'magic', label: '1d20+3 magic damage' },
    ]));
    expect(controlsFor(classById.get('bard')!.hopeFeature.text)).toEqual([{ kind: 'hope', n: 3, label: 'Spend 3 Hope' }]);
    const toxic = classById.get('assassin')!.subclasses[1].foundation[0].text;
    expect(controlsFor(toxic)).toEqual(expect.arrayContaining([
      { kind: 'tokens', source: { roll: { count: 1, sides: 4, bonus: 1 } }, label: 'Tokens' },
    ]));
    const rousing = classById.get('bard')!.subclasses[1].foundation[0].text;
    expect(controlsFor(rousing)).toContainEqual({ kind: 'uses', scope: 'longRest', max: 1, label: 'Once per long rest' });
    // A Stress the target marks is not a cost you pay.
    expect(controlsFor('On a success, the target must mark a Stress.')).toEqual([]);
  });
});
