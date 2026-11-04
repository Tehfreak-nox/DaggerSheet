// The owner's real characters, kept as examples: every change must keep them working.
import { describe, expect, it } from 'vitest';
import party from './fixtures/party.json';
import {
  applyLevelUp, attackProfile, characterProblems, derive, inEffect, newSession, rest, type Character,
} from './index';
import { armorById, lootById, weaponById } from '../data';

const chars = party.characters as unknown as Character[];
const byName = (n: string) => chars.find((c) => c.name === n)!;

describe('example party: Kane, Tank, Grum', () => {
  // Homebrew gear (Kane's Hold-Mark) resolves by id, as the store does on load.
  for (const ch of chars) {
    for (const w of ch.homebrew?.weapons ?? []) weaponById.set(w.id, w);
    for (const a of ch.homebrew?.armor ?? []) armorById.set(a.id, a);
    for (const l of ch.homebrew?.items ?? []) lootById.set(l.id, l);
  }

  it('all three are valid characters', () => {
    for (const ch of chars) expect(characterProblems(ch), ch.name).toEqual([]);
  });

  it('Kane: Leather Armor, Casting Dagger with Focus Runes', () => {
    const k = byName('Kane of Eleven');
    expect(derive(k)).toMatchObject({ evasion: 10, armorScore: 3, thresholds: { major: 7, severe: 14 }, hitPoints: 6, spellcast: 2 });
    const a = attackProfile(k, 'primary')!;
    expect(a.traitValue).toBe(2);
    expect(a.damageBonus + a.conditional.reduce((s, m) => s + m.value, 0)).toBe(1);
  });

  it('Tank: Bare Bones, Stoneskin, Nimble, Unwavering', () => {
    expect(derive(byName('Tank'))).toMatchObject({ evasion: 10, armorScore: 6, thresholds: { major: 12, severe: 22 }, hitPoints: 7 });
    expect(attackProfile(byName('Tank'), 'primary')).toMatchObject({ traitValue: 2, damageBonus: 3 });
  });

  it('Grum: Untouchable, Broadsword, Combat Training, Slayer Dice', () => {
    const g = byName('Grum Mudrunner');
    const d = derive(g);
    expect(d.evasion).toBe(11 + 1 + 1); // Warrior 11, Gambeson Flexible +1, Untouchable ceil(Agility 2 / 2) = 1
    expect(attackProfile(g, 'primary')!.damageBonus).toBe(1); // Combat Training: + level
    expect(inEffect(g).some((e) => e.key === 'sub:slayer')).toBe(true);
  });

  it('rest, a new session and levelling to 2 keep each one valid', () => {
    for (const ch of chars) {
      const after = newSession(rest(rest(ch, 'short', []).character, 'long', []).character);
      expect(characterProblems(after), ch.name).toEqual([]);
      const up = applyLevelUp(after, {
        newExperience: 'Tested', advancements: [{ id: 'hitPoint' }, { id: 'stress' }], domainCard: ch.cards.loadout[0] === 'arcana-unleash-chaos' ? 'arcana-wall-walk' : 'blade-reckless', extraCards: [], picks: {},
      });
      expect(characterProblems(up), ch.name).toEqual([]);
      expect(up.level).toBe(2);
    }
  });
});
