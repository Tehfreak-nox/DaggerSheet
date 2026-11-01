// Table-time state that isn't part of the saved character: what is armed
// for the next roll and the roll on screen.
import { useSyncExternalStore } from 'react';
import {
  applyOutcome, damageRoll, derive, dualityRoll, roll, rollMany, scoreDuality,
  type Advantage, type Character, type DamageRequest, type DamageResult, type DualityResult, type RollModifier,
} from '../rules';
import { getCharacter, updateCharacter } from './store';

export interface Armed {
  advantage: Advantage;
  /** Experience indexes (1 Hope already spent on each). */
  experiences: number[];
  /** Other bonuses armed by features ("+2 · Elementalist"). */
  extras: RollModifier[];
  /** "Roll a d20 as your Hope Die" armed by a feature (its use key is spent on the roll). */
  hopeDie?: { sides: number; useKey: string; source: string };
}

export type RollView =
  | {
    kind: 'action'; title: string; sub?: string; result: DualityResult; effects: string[];
    charId: string; trait?: string; attack: boolean;
    /** Hope gained / Stress cleared by this roll's outcome, undone if a reroll changes it. */
    applied: { hope: number; stress: number };
    /** Rerolls already used on this roll (by label). */
    rerolled: string[];
    critDamage?: () => void;
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
}

const EMPTY: Armed = { advantage: 'none', experiences: [], extras: [] };
let state: State = { armed: {}, roll: null, crit: {} };
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
  setArmed(id, { ...a, hopeDie: a.hopeDie?.useKey === useKey ? undefined : { sides, useKey, source } });
}

export function toggleExtra(id: string, mod: RollModifier) {
  const a = armedFor(id);
  const has = a.extras.some((e) => e.label === mod.label);
  setArmed(id, { ...a, extras: has ? a.extras.filter((e) => e.label !== mod.label) : [...a.extras, mod] });
}

export function clearArmed(id: string, refund = true) {
  const a = armedFor(id);
  if (refund && a.experiences.length) {
    updateCharacter(id, (c) => ({ ...c, hope: Math.min(derive(c).hopeSlots, c.hope + a.experiences.length) }));
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
  ];
  return parts.join(' · ');
}

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

/**
 * Duality roll for a character with everything armed. Applies the outcome
 * (Hope on Hope; Hope + clear a Stress on a critical) and consumes what was armed.
 */
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
  /** Rolls this attack's damage as a critical, offered on the result card after a critical success. */
  critDamage?: () => void;
}

export function actionRoll(id: string, title: string, modifiers: RollModifier[], sub?: string, opts: ActionOptions | boolean = {}) {
  const o: ActionOptions = typeof opts === 'boolean' ? { attack: opts } : opts;
  const ch = getCharacter(id);
  if (!ch) return;
  const a = armedFor(id);
  const d = derive(ch);
  const mods = [
    ...modifiers,
    ...a.experiences.map((i) => ({ label: d.experiences[i]?.name ?? 'Experience', value: d.experiences[i]?.value ?? 0 })),
    ...a.extras,
  ];
  const blaze = ch.death === 'blaze';
  const result = dualityRoll({ label: title, modifiers: mods, advantage: a.advantage, hopeSides: a.hopeDie?.sides, forceCritical: blaze });
  const effects = outcomeEffects(ch, result, !!o.attack);
  if (blaze) effects.push('Blaze of Glory: after this action you cross through the veil of death.');
  const after = applyOutcome(ch, result);
  updateCharacter(id, (c) => {
    let next = applyOutcome(c, result);
    if (a.hopeDie?.useKey) next = { ...next, uses: { ...next.uses, [a.hopeDie.useKey]: (next.uses[a.hopeDie.useKey] ?? 0) + 1 } };
    if (blaze) next = { ...next, death: 'dead' };
    return next;
  });
  setArmed(id, EMPTY);
  if (o.attack) set({ crit: { ...state.crit, [id]: result.outcome === 'critical' } });
  show({
    kind: 'action', title, sub, result, effects, charId: id, trait: o.trait, attack: !!o.attack,
    applied: outcomeDelta(ch, after), rerolled: [], critDamage: o.critDamage,
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

/**
 * Reroll the Hope Die of the roll on screen (Internal Compass, Nimble Fingers,
 * Feline Instincts). Undoes the old outcome's Hope/Stress and applies the new one.
 */
export function rerollHopeDie(label: string, hopeCost = 0) {
  const r = state.roll;
  if (!r || r.kind !== 'action') return;
  const id = r.charId;
  const ch = getCharacter(id);
  if (!ch || ch.hope - r.applied.hope < hopeCost) return;
  const result = scoreDuality({ ...r.result, hope: roll(r.result.hopeSides) });
  let base: Character = { ...ch, hope: ch.hope - r.applied.hope, stress: ch.stress + r.applied.stress };
  base = { ...base, hope: base.hope - hopeCost };
  const after = applyOutcome(base, result);
  updateCharacter(id, () => after);
  if (r.attack) set({ crit: { ...state.crit, [id]: result.outcome === 'critical' } });
  const effects = [...outcomeEffects(base, result, r.attack), `Rerolled the Hope Die (${label}${hopeCost ? `, ${hopeCost} Hope` : ''}): ${r.result.hope} → ${result.hope}.`];
  show({ ...r, result, effects, applied: outcomeDelta(base, after), rerolled: [...r.rerolled, label] });
}

/** Reroll chosen damage dice (Not Good Enough: 1s and 2s; Volatile Magic: any, for 3 Hope). */
export function rerollDamage(label: string, pick: (value: number, group: number, index: number) => boolean, hopeCost = 0) {
  const r = state.roll;
  if (!r || r.kind !== 'damage') return;
  if (hopeCost) {
    const ch = r.charId ? getCharacter(r.charId) : undefined;
    if (!ch || ch.hope < hopeCost) return;
    updateCharacter(ch.id, (c) => ({ ...c, hope: c.hope - hopeCost }));
  }
  const rolls = r.result.rolls.map((g, gi) => ({ ...g, values: g.values.map((v, i) => (pick(v, gi, i) ? roll(g.sides) : v)) }));
  const total = rolls.reduce((a, g) => a + g.values.reduce((x, y) => x + y, 0), 0)
    + r.result.critBonus + r.result.bonus + r.result.modifiers.reduce((a, m) => a + m.value, 0);
  show({ ...r, result: { ...r.result, rolls, total }, effects: [...r.effects, `Rerolled with ${label}: ${r.result.total} → ${total}.`], rerolled: [...r.rerolled, label] });
}

export function damage(title: string, req: DamageRequest, sub?: string, effects: string[] = [], opts: { charId?: string; magic?: boolean; attack?: boolean } = {}) {
  show({ kind: 'damage', title, sub, result: damageRoll(req), effects, charId: opts.charId, magic: !!opts.magic, attack: !!opts.attack, rerolled: [] });
}

/** Plain dice ("roll a d6", "1d4+1 tokens"). */
export function dice(title: string, count: number, sides: number, bonus = 0, sub?: string, effects: string[] = []) {
  const values = count === 1 ? [roll(sides)] : rollMany(count, sides);
  const total = values.reduce((a, b) => a + b, 0) + bonus;
  show({ kind: 'dice', title, sub, values, sides, bonus, total, effects });
  return total;
}

/** Show dice already rolled by a rules function (death moves). */
export function showDice(title: string, values: number[], labels: string[], effects: string[], sub?: string) {
  show({ kind: 'dice', title, sub, values, sides: 12, bonus: 0, total: 0, effects, labels });
}
