// Table-time state that isn't part of the saved character: what is armed
// for the next roll and the roll on screen.
import { useSyncExternalStore } from 'react';
import {
  applyOutcome, damageRoll, derive, dualityRoll, roll, rollMany,
  type Advantage, type DamageRequest, type DamageResult, type DualityResult, type RollModifier,
} from '../rules';
import { getCharacter, updateCharacter } from './store';

export interface Armed {
  advantage: Advantage;
  /** Experience indexes (1 Hope already spent on each). */
  experiences: number[];
  /** Other bonuses armed by features ("+2 · Elementalist"). */
  extras: RollModifier[];
}

export type RollView =
  | { kind: 'action'; title: string; sub?: string; result: DualityResult; effects: string[] }
  | { kind: 'damage'; title: string; sub?: string; result: DamageResult; effects: string[] }
  | { kind: 'dice'; title: string; sub?: string; values: number[]; sides: number; bonus: number; total: number; effects: string[] };

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
    updateCharacter(id, (c) => ({ ...c, hope: Math.min(6, c.hope + 1) }));
    setArmed(id, { ...a, experiences: a.experiences.filter((i) => i !== index) });
    return;
  }
  const ch = getCharacter(id);
  if (!ch || ch.hope < 1) return;
  updateCharacter(id, (c) => ({ ...c, hope: c.hope - 1 }));
  setArmed(id, { ...a, experiences: [...a.experiences, index] });
}

export function toggleExtra(id: string, mod: RollModifier) {
  const a = armedFor(id);
  const has = a.extras.some((e) => e.label === mod.label);
  setArmed(id, { ...a, extras: has ? a.extras.filter((e) => e.label !== mod.label) : [...a.extras, mod] });
}

export function clearArmed(id: string, refund = true) {
  const a = armedFor(id);
  if (refund && a.experiences.length) {
    updateCharacter(id, (c) => ({ ...c, hope: Math.min(6, c.hope + a.experiences.length) }));
  }
  setArmed(id, EMPTY);
}

export function armedText(id: string): string {
  const a = armedFor(id);
  const ch = getCharacter(id);
  if (!ch) return '';
  const d = derive(ch);
  const parts = [
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

export function actionRoll(id: string, title: string, modifiers: RollModifier[], sub?: string, attack = false) {
  const ch = getCharacter(id);
  if (!ch) return;
  const a = armedFor(id);
  const d = derive(ch);
  const mods = [
    ...modifiers,
    ...a.experiences.map((i) => ({ label: d.experiences[i]?.name ?? 'Experience', value: d.experiences[i]?.value ?? 0 })),
    ...a.extras,
  ];
  const result = dualityRoll({ label: title, modifiers: mods, advantage: a.advantage });
  const effects: string[] = [];
  if (result.outcome === 'hope') effects.push(ch.hope < 6 ? 'You gain a Hope.' : 'With Hope (Hope is full).');
  if (result.outcome === 'critical') effects.push('Critical success: you gain a Hope and clear a Stress.');
  if (result.outcome === 'fear') effects.push('The GM gains a Fear.');
  if (attack && result.outcome === 'critical') effects.push('Your next damage roll is critical.');
  updateCharacter(id, (c) => applyOutcome(c, result));
  setArmed(id, EMPTY);
  if (attack) set({ crit: { ...state.crit, [id]: result.outcome === 'critical' } });
  show({ kind: 'action', title, sub, result, effects });
}

export function damage(title: string, req: DamageRequest, sub?: string, effects: string[] = []) {
  show({ kind: 'damage', title, sub, result: damageRoll(req), effects });
}

/** Plain dice ("roll a d6", "1d4+1 tokens"). */
export function dice(title: string, count: number, sides: number, bonus = 0, sub?: string, effects: string[] = []) {
  const values = count === 1 ? [roll(sides)] : rollMany(count, sides);
  const total = values.reduce((a, b) => a + b, 0) + bonus;
  show({ kind: 'dice', title, sub, values, sides, bonus, total, effects });
  return total;
}
