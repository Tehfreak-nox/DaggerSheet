// Druid Beastform and the Evolution Hope feature.
import type { Beastform, TraitId } from '../data';
import { derive } from './derive';
import { allForms, evolvedRule, hybridRule, type BeastformChoice } from './forms';
import type { Character } from './model';
import { canPayStress } from './rolls';

/** Forms of your tier or lower, from the Druid class or a Druid multiclass. */
export function availableForms(ch: Character): Beastform[] {
  const tier = derive(ch).tier;
  return allForms(ch).filter((f) => f.tier <= tier);
}

export function hasBeastform(ch: Character): boolean {
  return allForms(ch).length > 0;
}

export type TransformVia = { via: 'beastform' } | { via: 'evolution'; trait: TraitId };

/** What a choice of form needs besides the form itself. */
export type FormExtras = Omit<BeastformChoice, 'formId' | 'evolution'>;

/** Stress the transformation marks: 1 for Beastform (0 with Evolution), plus a hybrid's additional Stress. */
export function transformStress(ch: Character, formId: string, how: TransformVia): number {
  const form = allForms(ch).find((f) => f.id === formId);
  const extra = form ? hybridRule(form)?.extraStress ?? 0 : 0;
  return (how.via === 'beastform' ? 1 : 0) + extra;
}

/** Why the transformation can't happen, or null. */
export function transformProblem(ch: Character, formId: string, how: TransformVia, extras: FormExtras = {}): string | null {
  const forms = availableForms(ch);
  const form = forms.find((f) => f.id === formId);
  if (!form) return 'That form is above your tier.';
  const ev = evolvedRule(form);
  if (ev) {
    const base = forms.find((f) => f.id === extras.base);
    if (!base || base.tier > ev.maxTier || evolvedRule(base) || hybridRule(base)) return `Choose a Tier ${ev.maxTier === 1 ? '1' : `1–${ev.maxTier}`} form to evolve.`;
  }
  const hy = hybridRule(form);
  if (hy) {
    const h = extras.hybrid;
    const picked = (h?.forms ?? []).map((id) => forms.find((f) => f.id === id));
    if (picked.length !== hy.forms || picked.some((f) => !f || f.tier > hy.maxTier || evolvedRule(f) || hybridRule(f))) return `Choose ${hy.forms} forms from Tiers 1–${hy.maxTier}.`;
    if ((h?.advantages.length ?? 0) !== hy.advantages) return `Choose ${hy.advantages} advantages.`;
    if ((h?.features.length ?? 0) !== hy.features) return `Choose ${hy.features} features.`;
  }
  const stress = transformStress(ch, formId, how);
  if (stress && !canPayStress(ch, stress, derive(ch).stressSlots)) return `You need ${stress} unmarked Stress.`;
  if (how.via === 'evolution') {
    if (ch.classId !== 'druid') return 'Evolution is the Druid’s Hope feature.';
    if (ch.hope < 3) return 'Evolution costs 3 Hope.';
  }
  return null;
}

/** Beastform: mark a Stress. Evolution: spend 3 Hope instead and raise one trait by +1 until you drop out. */
export function transform(ch: Character, formId: string, how: TransformVia, extras: FormExtras = {}): Character {
  const p = transformProblem(ch, formId, how, extras);
  if (p) throw new Error(p);
  const stress = ch.stress + transformStress(ch, formId, how);
  const choice: BeastformChoice = { formId, ...extras, ...(how.via === 'evolution' ? { evolution: how.trait } : {}) };
  return how.via === 'beastform'
    ? { ...ch, stress, beastform: choice }
    : { ...ch, stress, hope: ch.hope - 3, beastform: choice };
}

export function dropOut(ch: Character): Character {
  const { beastform: _, ...rest } = ch;
  return rest;
}
