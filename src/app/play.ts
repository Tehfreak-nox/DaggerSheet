// Table-time state that isn't part of the saved character: what is armed
// for the next roll and the roll on screen.
import { useSyncExternalStore } from 'react';
import {
  ACTIVE, applyOutcome, canPayStress, damageRoll, derive, dualityRoll, roll, rollMany, scoreDuality, setActive,
  type Advantage, type ArmEffect, type Character, type Cost, type DamageRequest, type DamageResult, type DualityResult,
  type RollModifier,
} from '../rules';
import type { TraitId } from '../data';
import { getCharacter, updateCharacter } from './store';
import { toast } from './toast';

/** Something armed by a feature: it changes the next roll, the next damage roll, or both. */
export interface Arm {
  key: string;
  label: string;
  /** Times armed (Rage Up can be armed twice). */
  count: number;
  /** Paid per arming; refunded when disarmed. */
  cost?: Cost;
  /** Stays armed until switched off (Sneak Attack, Ignition). */
  persist?: boolean;
  roll?: { value?: number; stat?: TraitId | 'proficiency'; advantage?: boolean; dice?: { count: number; sides: number }; attackOnly?: boolean };
  damage?: { dice?: { count: number | 'tier'; sides: number }; bonus?: number; stat?: { trait: TraitId; times: number }; proficiency?: number; double?: boolean; dieSize?: number };
  /** The roll part was used; the damage part is still waiting for a damage roll. */
  rollDone?: boolean;
  /** Used up by whichever comes first, the roll or the damage roll (Slayer Dice). */
  either?: boolean;
  /** Tokens (or pooled dice) taken from a card's counter; given back when disarmed. */
  refundTo?: { key: string; n: number };
}

export interface Armed {
  advantage: Advantage;
  /** Experience indexes (1 Hope already spent on each). */
  experiences: number[];
  /** Other bonuses for the next roll. */
  extras: RollModifier[];
  /** "Roll a d20 as your Hope Die" armed by a feature (its use key is spent on the roll). */
  hopeDie?: { sides: number; useKey: string; source: string };
  arms: Arm[];
}

export interface DamageOptions { critical?: boolean; halfProf?: boolean }

export type RollView =
  | {
    kind: 'action'; title: string; sub?: string; result: DualityResult; effects: string[];
    charId: string; trait?: string; attack: boolean; reaction: boolean;
    /** An Experience was used on this roll. */
    experience: boolean;
    /** Hope gained / Stress cleared by this roll's outcome, undone if a reroll changes it. */
    applied: { hope: number; stress: number };
    /** Rerolls and follow-ups already used on this roll (by label). */
    rerolled: string[];
    /** Rolls this attack's damage (critical, or half Proficiency for Glancing Blow). */
    damageFn?: (o: DamageOptions) => void;
  }
  | {
    kind: 'damage'; title: string; sub?: string; result: DamageResult; effects: string[];
    charId?: string; magic: boolean; attack: boolean; rerolled: string[];
  }
  | { kind: 'dice'; title: string; sub?: string; values: number[]; sides: number; bonus: number; total: number; effects: string[]; labels?: string[] };

interface State {
  armed: Record<string, Armed>;
  roll: (RollView & { rolling: boolean }) | null;
  /** Characters whose last attack roll was a critical: their next damage roll adds max dice. */
  crit: Record<string, boolean>;
  /** The Fear Die of each character's last action roll (Midnight-Touched). */
  lastFear: Record<string, number>;
}

const EMPTY: Armed = { advantage: 'none', experiences: [], extras: [], arms: [] };
let state: State = { armed: {}, roll: null, crit: {}, lastFear: {} };
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function usePlay<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => select(state),
  );
}

export function armedFor(id: string): Armed {
  return state.armed[id] ?? EMPTY;
}

function setArmed(id: string, a: Armed) {
  set({ armed: { ...state.armed, [id]: a } });
}

// ---- paying -------------------------------------------------------------------

export function canPay(ch: Character, cost?: Cost, times = 1): boolean {
  if (!cost) return true;
  if ('hope' in cost) return ch.hope >= cost.hope * times;
  return canPayStress(ch, cost.stress * times, derive(ch).stressSlots);
}

/** Pay a cost now; false (with a message) if you can't. */
export function pay(id: string, cost?: Cost, times = 1): boolean {
  if (!cost) return true;
  const ch = getCharacter(id);
  if (!ch) return false;
  if (!canPay(ch, cost, times)) {
    toast('hope' in cost ? `You need ${cost.hope * times} Hope.` : `You need ${cost.stress * times} unmarked Stress.`);
    return false;
  }
  updateCharacter(id, (c) => ('hope' in cost ? { ...c, hope: c.hope - cost.hope * times } : { ...c, stress: c.stress + cost.stress * times }));
  return true;
}

/** Give back what an arm took from a card's counter (tokens, pooled dice). */
function refundCounter(id: string, x: Arm) {
  if (!x.refundTo) return;
  const { key, n } = x.refundTo;
  updateCharacter(id, (c) => ({ ...c, uses: { ...c.uses, [key]: (c.uses[key] ?? 0) + n } }));
}

function refund(id: string, cost: Cost | undefined, times: number) {
  if (!cost || times < 1) return;
  updateCharacter(id, (c) => ('hope' in cost
    ? { ...c, hope: Math.min(derive(c).hopeSlots, c.hope + cost.hope * times) }
    : { ...c, stress: Math.max(0, c.stress - cost.stress * times) }));
}

/** Mark one use of a feature ("rest:card:arcana-arcana-touched"). */
export function useOnce(id: string, useKey?: string) {
  if (!useKey) return;
  updateCharacter(id, (c) => ({ ...c, uses: { ...c.uses, [useKey]: (c.uses[useKey] ?? 0) + 1 } }));
}

// ---- arming -------------------------------------------------------------------

export function toggleAdvantage(id: string, kind: 'advantage' | 'disadvantage') {
  const a = armedFor(id);
  setArmed(id, { ...a, advantage: a.advantage === kind ? 'none' : kind });
}

/** Arm an Experience: spend 1 Hope now, add it to the next roll. Tap again to refund. */
export function toggleExperience(id: string, index: number) {
  const a = armedFor(id);
  if (a.experiences.includes(index)) {
    updateCharacter(id, (c) => ({ ...c, hope: Math.min(derive(c).hopeSlots, c.hope + 1) }));
    setArmed(id, { ...a, experiences: a.experiences.filter((i) => i !== index) });
    return;
  }
  // One Experience at a time: switching moves the Hope already spent.
  if (a.experiences.length) {
    setArmed(id, { ...a, experiences: [index] });
    return;
  }
  const ch = getCharacter(id);
  if (!ch || ch.hope < 1) return;
  updateCharacter(id, (c) => ({ ...c, hope: c.hope - 1 }));
  setArmed(id, { ...a, experiences: [index] });
}

/** Arm a bigger Hope Die for the next action roll (spends one use of the feature when rolled). */
export function toggleHopeDie(id: string, sides: number, useKey: string, source: string) {
  const a = armedFor(id);
  setArmed(id, { ...a, hopeDie: a.hopeDie?.source === source ? undefined : { sides, useKey, source } });
}

function armFromEffect(effect: ArmEffect): Pick<Arm, 'roll' | 'damage'> {
  if ('roll' in effect) return { roll: { value: effect.roll } };
  if ('rollStat' in effect) return { roll: { stat: effect.rollStat } };
  if ('advantage' in effect) return { roll: { advantage: true }, damage: effect.damageDice ? { dice: effect.damageDice } : undefined };
  if ('damageDice' in effect) return { damage: { dice: effect.damageDice } };
  if ('damageBonus' in effect) return { damage: { bonus: effect.damageBonus } };
  if ('damageStat' in effect) return { damage: { stat: { trait: effect.damageStat, times: effect.times } } };
  if ('proficiency' in effect) return { damage: { proficiency: effect.proficiency } };
  if ('damageDie' in effect) return { damage: { dieSize: effect.damageDie } };
  return { damage: { double: true } };
}

export interface ArmSpec {
  key: string; label: string; effect: ArmEffect; cost?: Cost; max?: number; persist?: boolean;
  /** Pay with tokens from this counter key. */
  tokens?: { key: string; n: number };
}

/**
 * Arm (paying the cost), arm again up to `max`, or disarm and refund. A
 * persistent arm stays on until switched off.
 */
export function toggleArm(id: string, spec: ArmSpec) {
  const a = armedFor(id);
  const have = a.arms.find((x) => x.key === spec.key);
  if (have && (!spec.max || have.count >= spec.max)) {
    refund(id, have.cost, have.rollDone ? 0 : have.count);
    if (!have.rollDone) refundCounter(id, have);
    setArmed(id, { ...armedFor(id), arms: a.arms.filter((x) => x.key !== spec.key) });
    return;
  }
  if (spec.tokens) {
    const ch = getCharacter(id);
    if (!ch || (ch.uses[spec.tokens.key] ?? 0) < spec.tokens.n) { toast('No tokens left on this card.'); return; }
  }
  if (!pay(id, spec.cost)) return;
  if (spec.tokens) {
    const t = spec.tokens;
    updateCharacter(id, (c) => ({ ...c, uses: { ...c.uses, [t.key]: Math.max(0, (c.uses[t.key] ?? 0) - t.n) } }));
  }
  const arms = have
    ? a.arms.map((x) => (x.key === spec.key ? { ...x, count: x.count + 1 } : x))
    : [...a.arms, { key: spec.key, label: spec.label, count: 1, cost: spec.cost, persist: spec.persist, refundTo: spec.tokens, ...armFromEffect(spec.effect) }];
  setArmed(id, { ...armedFor(id), arms });
}

/**
 * Arm pooled dice (Slayer Dice): taken off the card now, rolled into your next
 * attack roll or damage roll, whichever comes first. Tap again to put them back.
 */
export function togglePoolArm(id: string, poolKey: string, label: string, sides: number) {
  const a = armedFor(id);
  const key = `pool:${poolKey}`;
  const have = a.arms.find((x) => x.key === key);
  if (have) {
    refundCounter(id, have);
    setArmed(id, { ...a, arms: a.arms.filter((x) => x.key !== key) });
    return;
  }
  const n = getCharacter(id)?.uses[poolKey] ?? 0;
  if (n < 1) return;
  updateCharacter(id, (c) => ({ ...c, uses: { ...c.uses, [poolKey]: 0 } }));
  const dice = { count: n, sides };
  setArmed(id, { ...a, arms: [...a.arms, { key, label: `${n}d${sides} ${label}`, count: 1, either: true, refundTo: { key: poolKey, n },
    roll: { dice, attackOnly: true }, damage: { dice } }] });
}

/** Arm a flat bonus with an amount ("spend 3 tokens: +3 to the roll"); replaces any earlier one. */
export function armAmount(id: string, key: string, label: string, part: Pick<Arm, 'roll' | 'damage'>) {
  const a = armedFor(id);
  setArmed(id, { ...a, arms: [...a.arms.filter((x) => x.key !== key), { key, label, count: 1, ...part }] });
}

export function clearArmed(id: string, refundAll = true) {
  const a = armedFor(id);
  if (refundAll) {
    if (a.experiences.length) updateCharacter(id, (c) => ({ ...c, hope: Math.min(derive(c).hopeSlots, c.hope + a.experiences.length) }));
    for (const x of a.arms) { refund(id, x.cost, x.rollDone ? 0 : x.count); if (!x.rollDone) refundCounter(id, x); }
  }
  setArmed(id, EMPTY);
}

export function armedText(id: string): string {
  const a = armedFor(id);
  const ch = getCharacter(id);
  if (!ch) return '';
  const d = derive(ch);
  const parts = [
    ...(ch.death === 'blaze' ? ['Blaze of Glory: automatic critical success'] : []),
    ...(a.hopeDie ? [`d${a.hopeDie.sides} Hope Die · ${a.hopeDie.source}`] : []),
    ...(a.advantage !== 'none' ? [a.advantage === 'advantage' ? 'Advantage' : 'Disadvantage'] : []),
    ...a.experiences.map((i) => `${d.experiences[i]?.name} +${d.experiences[i]?.value}`),
    ...a.extras.map((e) => `${e.label} ${e.value >= 0 ? '+' : ''}${e.value}`),
    ...a.arms.map((x) => `${x.label}${x.count > 1 ? ` ×${x.count}` : ''}${x.rollDone ? ' (damage)' : ''}`),
  ];
  return parts.join(' · ');
}

// ---- rolling ------------------------------------------------------------------

const ROLL_MS = 750;

function show(view: RollView) {
  set({ roll: { ...view, rolling: true } });
  setTimeout(() => {
    if (state.roll) set({ roll: { ...state.roll, rolling: false } });
  }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : ROLL_MS);
}

export function closeRoll() {
  set({ roll: null });
}

export function setCrit(id: string, on: boolean) {
  set({ crit: { ...state.crit, [id]: on } });
}

function outcomeDelta(before: Character, after: Character) {
  return { hope: after.hope - before.hope, stress: before.stress - after.stress };
}

export interface ActionOptions {
  attack?: boolean;
  /** The trait rolled (for trait-specific rerolls such as Nimble Fingers). */
  trait?: string;
  /** Reaction rolls don't generate Hope or Fear. */
  reaction?: boolean;
  /** Rolls this attack's damage, offered on the result card. */
  damageFn?: (o: DamageOptions) => void;
}

/**
 * Duality roll for a character with everything armed. Applies the outcome
 * (Hope on Hope; Hope + clear a Stress on a critical) and consumes what was armed.
 */
export function actionRoll(id: string, title: string, modifiers: RollModifier[], sub?: string, opts: ActionOptions | boolean = {}) {
  const o: ActionOptions = typeof opts === 'boolean' ? { attack: opts } : opts;
  let ch = getCharacter(id);
  if (!ch) return;
  const notes: string[] = [];
  // "Before you make an action roll, you must spend a Hope. If you can't, you revert."
  for (const key of ch.active ?? []) {
    if (!ACTIVE[key]?.hopeBeforeRoll || o.reaction) continue;
    if (ch.hope >= 1) { updateCharacter(id, (c) => ({ ...c, hope: c.hope - 1 })); notes.push('Spent a Hope to keep your form.'); }
    else { updateCharacter(id, (c) => setActive(c, key, false)); notes.push('No Hope to spend: you revert to your normal form.'); }
    ch = getCharacter(id)!;
  }
  const a = armedFor(id);
  const d = derive(ch);
  const rollArms = a.arms.filter((x) => x.roll && !x.rollDone && (!x.roll.attackOnly || o.attack));
  // Dice armed into the roll (Slayer Dice) are rolled now.
  const armDice = rollArms.filter((x) => x.roll!.dice).map((x) => {
    const values = rollMany(x.roll!.dice!.count, x.roll!.dice!.sides);
    return { label: `${x.label} (${values.join(', ')})`, value: values.reduce((s2, v) => s2 + v, 0) };
  });
  const counters = dieCounters(ch, 'action');
  const mods = [
    ...counters.map((x) => ({ label: x.label, value: x.value })),
    ...modifiers,
    ...a.experiences.map((i) => ({ label: d.experiences[i]?.name ?? 'Experience', value: d.experiences[i]?.value ?? 0 })),
    ...a.extras,
    ...armDice,
    ...rollArms.filter((x) => x.roll!.value !== undefined || x.roll!.stat).map((x) => ({
      label: x.label.split(' · ')[0],
      value: x.count * (x.roll!.value ?? (x.roll!.stat === 'proficiency' ? d.proficiency : d.traits[x.roll!.stat as TraitId])),
    })),
  ];
  let advantage = a.advantage;
  if (rollArms.some((x) => x.roll!.advantage)) advantage = advantage === 'disadvantage' ? 'none' : 'advantage';
  const blaze = ch.death === 'blaze';
  const result = dualityRoll({ label: title, modifiers: mods, advantage, hopeSides: a.hopeDie?.sides, forceCritical: blaze });
  const effects = o.reaction ? ['Reaction roll: no Hope or Fear is generated.'] : outcomeEffects(ch, result, !!o.attack);
  effects.push(...notes);
  if (blaze) effects.push('Blaze of Glory: after this action you cross through the veil of death.');
  const before = ch;
  const after = o.reaction ? ch : applyOutcome(ch, result);
  updateCharacter(id, (c) => {
    let next = o.reaction ? c : applyOutcome(c, result);
    if (a.hopeDie?.useKey) next = { ...next, uses: { ...next.uses, [a.hopeDie.useKey]: (next.uses[a.hopeDie.useKey] ?? 0) + 1 } };
    if (blaze) next = { ...next, death: 'dead' };
    return next;
  });
  // Spend what was armed: roll-only arms go; arms with a damage part wait for the damage roll.
  const used = new Set(rollArms.map((x) => x.key));
  const arms = a.arms.flatMap((x) => (!used.has(x.key) || x.persist ? [x] : x.either || !x.damage ? [] : [{ ...x, rollDone: true }]));
  // "After you add its value to a roll, increase the die's value by one" (Wild Surge).
  for (const x of counters) {
    const next = x.value + 1;
    updateCharacter(id, (c) => ({ ...c, uses: { ...c.uses, [x.key]: next > x.sides ? 0 : next } }));
    effects.push(next > x.sides ? `${x.label}: the die would go past ${x.sides}, so it ends.` : `${x.label} goes up to ${next}.`);
  }
  setArmed(id, { ...EMPTY, arms });
  set({ lastFear: { ...state.lastFear, [id]: result.fear } });
  if (o.attack) set({ crit: { ...state.crit, [id]: result.outcome === 'critical' } });
  show({
    kind: 'action', title, sub, result, effects, charId: id, trait: o.trait, attack: !!o.attack, reaction: !!o.reaction,
    experience: a.experiences.length > 0, applied: outcomeDelta(before, after), rerolled: [], damageFn: o.damageFn,
  });
}

function outcomeEffects(ch: Character, result: DualityResult, attack: boolean): string[] {
  const effects: string[] = [];
  const full = ch.hope >= derive(ch).hopeSlots;
  if (result.outcome === 'hope') effects.push(full ? 'With Hope (Hope is full).' : 'You gain a Hope.');
  if (result.outcome === 'critical') effects.push('Critical success: you gain a Hope and clear a Stress.');
  if (result.outcome === 'fear') effects.push('The GM gains a Fear.');
  if (attack && result.outcome === 'critical') effects.push('Your damage is critical: roll it below.');
  return effects;
}

/** Replace the action roll on screen with a new result, undoing the old outcome's Hope/Stress first. */
function rescore(label: string, result: DualityResult, note: string, cost?: Cost, useKey?: string) {
  const r = state.roll;
  if (!r || r.kind !== 'action') return;
  const id = r.charId;
  const ch = getCharacter(id);
  if (!ch) return;
  let base: Character = { ...ch, hope: ch.hope - r.applied.hope, stress: ch.stress + r.applied.stress };
  if (cost) {
    if (!canPay(base, cost)) { toast('hope' in cost ? `You need ${cost.hope} Hope.` : `You need ${cost.stress} unmarked Stress.`); return; }
    base = 'hope' in cost ? { ...base, hope: base.hope - cost.hope } : { ...base, stress: base.stress + cost.stress };
  }
  const after = r.reaction ? base : applyOutcome(base, result);
  updateCharacter(id, () => (useKey ? { ...after, uses: { ...after.uses, [useKey]: (after.uses[useKey] ?? 0) + 1 } } : after));
  if (r.attack) set({ crit: { ...state.crit, [id]: result.outcome === 'critical' } });
  set({ lastFear: { ...state.lastFear, [id]: result.fear } });
  const effects = [...(r.reaction ? r.effects.slice(0, 1) : outcomeEffects(base, result, r.attack)), note];
  show({ ...r, result, effects, applied: outcomeDelta(base, after), rerolled: [...r.rerolled, label] });
}

const costText = (cost?: Cost) => (cost ? ` (${'hope' in cost ? `${cost.hope} Hope` : `${cost.stress} Stress`})` : '');

/** Reroll the Hope Die (Internal Compass, Nimble Fingers, Feline Instincts). */
export function rerollHopeDie(label: string, hopeCost = 0) {
  const r = state.roll;
  if (!r || r.kind !== 'action') return;
  const result = scoreDuality({ ...r.result, hope: roll(r.result.hopeSides) });
  const cost = hopeCost ? { hope: hopeCost } : undefined;
  rescore(label, result, `Rerolled the Hope Die with ${label}${costText(cost)}: ${r.result.hope} → ${result.hope}.`, cost);
}

/** Reroll the Fear Die (Endless Charisma). */
export function rerollFearDie(label: string, cost?: Cost, useKey?: string) {
  const r = state.roll;
  if (!r || r.kind !== 'action') return;
  const result = scoreDuality({ ...r.result, fear: roll(12) });
  rescore(label, result, `Rerolled the Fear Die with ${label}${costText(cost)}: ${r.result.fear} → ${result.fear}.`, cost, useKey);
}

/** Reroll both Duality Dice (Luckbender, Adaptability), optionally with advantage (Warlock). */
export function rerollDuality(label: string, cost?: Cost, useKey?: string, withAdvantage = false) {
  const r = state.roll;
  if (!r || r.kind !== 'action') return;
  const advantage: Advantage = withAdvantage ? 'advantage' : r.result.advantage;
  const advantageDie = advantage === 'none' ? null : roll(6);
  const result = scoreDuality({ ...r.result, hope: roll(r.result.hopeSides), fear: roll(12), advantage, advantageDie });
  rescore(label, result, `Rerolled with ${label}${withAdvantage ? ' (advantage)' : ''}${costText(cost)}: ${r.result.total} → ${result.total}.`, cost, useKey);
}

/** Swap the Hope and Fear Dice (Arcana-Touched, Nemesis). */
export function swapDuality(label: string, useKey?: string) {
  const r = state.roll;
  if (!r || r.kind !== 'action') return;
  const result = scoreDuality({ ...r.result, hope: r.result.fear, fear: r.result.hope });
  rescore(label, result, `Swapped the Hope and Fear Dice with ${label}.`, undefined, useKey);
}

/** "Change it into a roll with Hope instead" (Fearless, Freeborne, Stealth Expertise). */
export function makeItHope(label: string, cost?: Cost, useKey?: string) {
  const r = state.roll;
  if (!r || r.kind !== 'action') return;
  rescore(label, { ...r.result, outcome: 'hope' }, `${label}: now a roll with Hope${costText(cost)}.`, cost, useKey);
}

/** Add a die to the action roll's total after rolling (Heart of a Poet). */
export function addDieToRoll(label: string, sides: number, cost?: Cost) {
  const r = state.roll;
  if (!r || r.kind !== 'action') return;
  const v = roll(sides);
  const result = scoreDuality({ ...r.result, modifiers: [...r.result.modifiers, { label: `${label} d${sides}`, value: v }] });
  rescore(label, result, `${label}: +${v} (d${sides})${costText(cost)}.`, cost);
}

/** Extra effects you apply from the result card (Gore and Glory, Champion's Edge, Pummeljoy). */
export function applyFromResult(label: string, fn: (c: Character) => Character, cost?: Cost, note?: string) {
  const r = state.roll;
  if (!r || !('charId' in r) || !r.charId) return;
  if (!pay(r.charId, cost)) return;
  updateCharacter(r.charId, fn);
  set({ roll: { ...state.roll!, effects: [...r.effects, note ?? label], rerolled: [...r.rerolled, label] } as State['roll'] });
}

/** On a roll with Hope, take a pooled die (Slayer Dice) instead of the Hope. */
export function takePoolDie(label: string, poolKey: string, max: number) {
  const r = state.roll;
  if (!r || r.kind !== 'action') return;
  const id = r.charId;
  const gained = r.applied.hope;
  updateCharacter(id, (c) => ({ ...c, hope: Math.max(0, c.hope - gained), uses: { ...c.uses, [poolKey]: Math.min(max, (c.uses[poolKey] ?? 0) + 1) } }));
  set({ roll: { ...state.roll!, applied: { ...r.applied, hope: 0 }, effects: [...r.effects, `${label}: took a die instead of a Hope.`], rerolled: [...r.rerolled, label] } as State['roll'] });
}

// ---- damage -------------------------------------------------------------------

export function damage(title: string, req: DamageRequest, sub?: string, effects: string[] = [], opts: { charId?: string; magic?: boolean; attack?: boolean } = {}) {
  let rq = req;
  const notes = [...effects];
  let double = false;
  if (opts.attack && opts.charId) {
    const ch = getCharacter(opts.charId);
    // A counting die that adds to damage (Unstoppable).
    const counters = ch ? dieCounters(ch, 'damage') : [];
    if (counters.length) rq = { ...rq, modifiers: [...(rq.modifiers ?? []), ...counters.map((x) => ({ label: x.label, value: x.value }))] };
    const a = armedFor(opts.charId);
    const dmgArms = a.arms.filter((x) => x.damage);
    if (ch && dmgArms.length) {
      const d = derive(ch);
      const dice = [...rq.dice];
      const mods = [...(rq.modifiers ?? [])];
      for (const x of dmgArms) {
        const dm = x.damage!;
        const name = x.label.split(' · ')[0];
        if (dm.proficiency && dice.length) dice[0] = { ...dice[0], count: dice[0].count + dm.proficiency * x.count };
        if (dm.dieSize && dice.length) dice[0] = { ...dice[0], sides: dm.dieSize };
        if (dm.dice) dice.push({ count: (dm.dice.count === 'tier' ? d.tier : dm.dice.count) * x.count, sides: dm.dice.sides });
        if (dm.bonus) mods.push({ label: name, value: dm.bonus * x.count });
        if (dm.stat) mods.push({ label: name, value: d.traits[dm.stat.trait] * dm.stat.times * x.count });
        if (dm.double) double = true;
        notes.push(`Armed: ${x.label}${x.count > 1 ? ` ×${x.count}` : ''}.`);
      }
      rq = { ...rq, dice, modifiers: mods };
      setArmed(opts.charId, { ...a, arms: a.arms.filter((x) => x.persist || !x.damage) });
    }
  }
  const result = damageRoll(rq);
  if (double) {
    result.modifiers = [...result.modifiers, { label: 'Doubled', value: result.total }];
    result.total *= 2;
    result.rolls = result.rolls.map((g) => ({ ...g }));
  }
  show({ kind: 'damage', title, sub, result, effects: notes, charId: opts.charId, magic: !!opts.magic, attack: !!opts.attack, rerolled: [] });
}

/** Key a die counter stores its value under in `uses`: "die:damage:6:class:unstoppable". */
export function dieKey(addsTo: string | undefined, sides: number, featureKey: string): string {
  return `die:${addsTo ?? 'none'}:${sides}:${featureKey}`;
}

/** Active die counters that add to a kind of roll. */
function dieCounters(ch: Character, kind: 'damage' | 'action') {
  return Object.entries(ch.uses).filter(([k, v]) => k.startsWith(`die:${kind}:`) && v > 0).map(([k, v]) => {
    const [, , sides, source, id] = k.split(':');
    // "class:unstoppable" → Unstoppable; "card:sage-wild-surge" → Wild Surge (drop the domain).
    const words = (id ?? '').split('-').slice(source === 'card' ? 1 : 0);
    const name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return { key: k, value: v, sides: Number(sides), label: `${name} Die` };
  });
}

function retotal(r: DamageResult): number {
  return r.rolls.reduce((a, g) => a + g.values.reduce((x, y) => x + y, 0), 0) + r.critBonus + r.bonus + r.modifiers.reduce((a, m) => a + m.value, 0);
}

/** Reroll chosen damage dice (Not Good Enough: 1s and 2s; Volatile Magic: any, for 3 Hope). */
export function rerollDamage(label: string, pick: (value: number, group: number, index: number) => boolean, hopeCost = 0) {
  const r = state.roll;
  if (!r || r.kind !== 'damage') return;
  if (hopeCost && (!r.charId || !pay(r.charId, { hope: hopeCost }))) return;
  const rolls = r.result.rolls.map((g, gi) => ({ ...g, values: g.values.map((v, i) => (pick(v, gi, i) ? roll(g.sides) : v)) }));
  const next = { ...r.result, rolls };
  const total = retotal(next);
  show({ ...r, result: { ...next, total }, effects: [...r.effects, `Rerolled with ${label}: ${r.result.total} → ${total}.`], rerolled: [...r.rerolled, label] });
}

/** Use the maximum of your lowest damage die (Versatile Fighter). */
export function maxOneDamageDie(label: string, cost?: Cost) {
  const r = state.roll;
  if (!r || r.kind !== 'damage' || !r.charId || !pay(r.charId, cost)) return;
  let best = { g: -1, i: -1, gain: 0 };
  r.result.rolls.forEach((g, gi) => g.values.forEach((v, i) => { if (g.sides - v > best.gain) best = { g: gi, i, gain: g.sides - v }; }));
  if (best.g < 0) return;
  const rolls = r.result.rolls.map((g, gi) => ({ ...g, values: g.values.map((v, i) => (gi === best.g && i === best.i ? g.sides : v)) }));
  const next = { ...r.result, rolls };
  const total = retotal(next);
  show({ ...r, result: { ...next, total }, effects: [...r.effects, `${label}: a die counts as its maximum (${r.result.total} → ${total}).`], rerolled: [...r.rerolled, label] });
}

/** Add a flat amount to the damage on screen (Midnight-Touched: your Fear Die). */
export function addToDamage(label: string, value: number, cost?: Cost) {
  const r = state.roll;
  if (!r || r.kind !== 'damage' || !r.charId || !pay(r.charId, cost)) return;
  const next = { ...r.result, modifiers: [...r.result.modifiers, { label, value }] };
  show({ ...r, result: { ...next, total: retotal(next) }, effects: [...r.effects, `${label}: +${value}.`], rerolled: [...r.rerolled, label] });
}

export function lastFearDie(id: string): number | undefined {
  return state.lastFear[id];
}

/** Add extra dice to the damage roll on screen (Rampage: a d10 for each 1). */
export function addDamageDice(label: string, count: number, sides: number) {
  const r = state.roll;
  if (!r || r.kind !== 'damage' || count < 1) return;
  const extra = rollMany(count, sides);
  const rolls = [...r.result.rolls, { sides, values: extra, dropped: null }];
  const total = r.result.total + extra.reduce((a, b) => a + b, 0);
  show({ ...r, result: { ...r.result, rolls, total }, effects: [...r.effects, `${label}: +${extra.join(' +')}.`], rerolled: [...r.rerolled, label] });
}

/** Plain dice ("roll a d6", "1d4+1 tokens"). */
export function dice(title: string, count: number, sides: number, bonus = 0, sub?: string, effects: string[] = []) {
  const values = count <= 1 ? [roll(sides)] : rollMany(count, sides);
  const total = values.reduce((a, b) => a + b, 0) + bonus;
  show({ kind: 'dice', title, sub, values, sides, bonus, total, effects });
  return total;
}

/** Show dice already rolled by a rules function (death moves). */
export function showDice(title: string, values: number[], labels: string[], effects: string[], sub?: string) {
  show({ kind: 'dice', title, sub, values, sides: 12, bonus: 0, total: 0, effects, labels });
}
