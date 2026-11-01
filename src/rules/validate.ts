// Independent consistency checks for a stored character. Used by the
// simulation tests and on import, so they recompute from the raw state
// rather than trusting the level-up code that produced it.
import { cardById, classById, rules, weaponById } from '../data';
import { startingCardCount } from './create';
import { derive, STAGES, tierOf } from './derive';
import { weaponProblems } from './equipment';
import { TRAIT_IDS, type Character } from './model';

export function characterProblems(ch: Character): string[] {
  const p: string[] = [];
  const cls = classById.get(ch.classId);
  if (!cls) return [`unknown class ${ch.classId}`];
  if (ch.level < 1 || ch.level > 10) p.push(`level ${ch.level} out of range`);

  // Traits: creation spread, plus +1s from advancements
  const spread = TRAIT_IDS.map((t) => ch.traits[t]).sort((a, b) => a - b).join();
  if (spread !== [...rules.creation.traitModifiers].sort((a, b) => a - b).join()) p.push(`trait spread ${spread}`);

  // Tier achievements
  const achieved = rules.leveling.achievements.filter((a) => ch.level >= a.level).length;
  if (ch.experiences.length !== rules.creation.experiences.count + achieved) {
    p.push(`expected ${rules.creation.experiences.count + achieved} experiences, have ${ch.experiences.length}`);
  }

  // Advancements: exactly two picks' worth per level after 1, slots never over-marked
  for (let lvl = 2; lvl <= ch.level; lvl++) {
    const cost = ch.advancements.filter((a) => a.level === lvl)
      .reduce((s, a) => s + rules.leveling.advancements.find((x) => x.id === a.choice.id)!.cost, 0);
    if (cost !== 2) p.push(`level ${lvl}: advancements cost ${cost}, expected 2`);
  }
  if (ch.advancements.some((a) => a.level > ch.level || a.level < 2)) p.push('advancement outside levels 2..current');
  for (const adv of rules.leveling.advancements) {
    for (const t of [2, 3, 4] as const) {
      const used = ch.advancements.filter((a) => a.tier === t && a.choice.id === adv.id).length * adv.cost;
      if (used > adv.slots[t]) p.push(`tier ${t} ${adv.id}: ${used}/${adv.slots[t]} slots`);
    }
  }
  for (const a of ch.advancements) if (a.tier > tierOf(a.level)) p.push(`level ${a.level} marked a tier ${a.tier} slot`);
  const mcs = ch.advancements.filter((a) => a.choice.id === 'multiclass');
  if (mcs.length > 1) p.push('multiclassed more than once');
  if (mcs.length && mcs[0].level < rules.leveling.multiclass.minLevel) p.push('multiclassed before level 5');
  if (mcs.length !== (ch.multiclass ? 1 : 0)) p.push('multiclass state does not match advancements');
  for (const m of mcs) {
    if (ch.advancements.some((a) => a.tier === m.tier && a.choice.id === 'subclass')) p.push(`tier ${m.tier}: both subclass upgrade and multiclass`);
  }

  // Subclass progression
  const upgrades = ch.advancements.filter((a) => a.choice.id === 'subclass').length;
  if (STAGES.indexOf(ch.subclassStage) !== Math.min(2, upgrades)) p.push(`subclass stage ${ch.subclassStage} after ${upgrades} upgrades`);
  if (ch.subclassStage === 'mastery' && ch.level < 8) p.push('mastery before level 8');
  if (ch.subclassStage === 'specialization' && ch.level < 5) p.push('specialization before level 5');

  // Domain cards
  const owned = [...ch.cards.loadout, ...ch.cards.vault];
  if (new Set(owned).size !== owned.length) p.push('duplicate domain cards');
  if (ch.cards.loadout.length > rules.caps.loadout) p.push(`loadout has ${ch.cards.loadout.length} cards`);
  const sub = cls.subclasses.find((s) => s.id === ch.subclassId);
  if (!sub) p.push(`unknown subclass ${ch.subclassId}`);
  const extraFromUpgrades = sub
    ? STAGES.slice(1, STAGES.indexOf(ch.subclassStage) + 1)
        .flatMap((st) => sub[st]).filter((f) => /^Take an additional domain card/.test(f.text)).length
    : 0;
  const expectedCards = startingCardCount(ch.classId, ch.subclassId) + (ch.level - 1)
    + ch.advancements.filter((a) => a.choice.id === 'domainCard').length + extraFromUpgrades;
  if (owned.length !== expectedCards) p.push(`expected ${expectedCards} domain cards, have ${owned.length}`);
  for (const id of owned) {
    const c = cardById.get(id);
    if (!c) { p.push(`unknown card ${id}`); continue; }
    if ((cls.domains as string[]).includes(c.domain)) {
      if (c.level > ch.level) p.push(`${c.name} is level ${c.level} at character level ${ch.level}`);
    } else if (ch.multiclass?.domain === c.domain) {
      if (c.level > Math.ceil(ch.level / 2)) p.push(`multiclass card ${c.name} above half level`);
    } else {
      p.push(`${c.name} is outside your domains`);
    }
  }

  // Derived values and caps
  let d;
  try { d = derive(ch); } catch (e) { return [...p, `derive failed: ${(e as Error).message}`]; }
  const expectProf = 1 + achieved + ch.advancements.filter((a) => a.choice.id === 'proficiency').length;
  if (d.proficiency !== Math.min(rules.caps.proficiency, expectProf)) p.push(`proficiency ${d.proficiency}, expected ${expectProf}`);
  if (d.hitPoints > rules.caps.hitPointSlots || d.hitPoints < 1) p.push(`hit points ${d.hitPoints}`);
  if (d.stressSlots > rules.caps.stressSlots || d.stressSlots < 1) p.push(`stress slots ${d.stressSlots}`);
  if (d.armorScore < 0 || d.armorScore > rules.caps.armorScore) p.push(`armor score ${d.armorScore}`);
  if (d.thresholds.major >= d.thresholds.severe) p.push(`thresholds ${d.thresholds.major}/${d.thresholds.severe}`);
  if (d.evasion < 1) p.push(`evasion ${d.evasion}`);
  if (ch.hp < 0 || ch.hp > d.hitPoints) p.push(`hp marked ${ch.hp}/${d.hitPoints}`);
  if (ch.stress < 0 || ch.stress > d.stressSlots) p.push(`stress marked ${ch.stress}/${d.stressSlots}`);
  if (ch.hope < 0 || ch.hope > d.hopeSlots) p.push(`hope ${ch.hope}`);
  if (ch.armorMarked < 0 || ch.armorMarked > Math.max(d.armorScore, 0)) p.push(`armor marked ${ch.armorMarked}/${d.armorScore}`);
  for (const t of ch.markedTraits) if (!TRAIT_IDS.includes(t)) p.push(`marked trait ${t}`);
  if (new Set(ch.markedTraits).size !== ch.markedTraits.length) p.push('trait marked twice');

  // Equipment
  for (const slot of ['primary', 'secondary'] as const) {
    const w = ch[slot];
    if (!w) continue;
    if (!weaponById.has(w.id)) { p.push(`unknown weapon ${w.id}`); continue; }
    const probs = weaponProblems({ ...ch, [slot]: undefined }, w.id, slot);
    if (probs.length) p.push(`${slot} ${w.id}: ${probs.join(', ')}`);
  }
  if (ch.primary && ch.secondary && !d.ignoresBurden) {
    const burden = weaponById.get(ch.primary.id)!.burden + weaponById.get(ch.secondary.id)!.burden;
    if (burden > 2) p.push('more than two hands of weapons');
  }
  return p;
}
