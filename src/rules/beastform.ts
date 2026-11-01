// Druid Beastform and the Evolution Hope feature.
import { classById, type Beastform, type TraitId } from '../data';
import { derive } from './derive';
import type { Character } from './model';
import { canPayStress } from './rolls';

/** Forms of your tier or lower, from the Druid class or a Druid multiclass. */
export function availableForms(ch: Character): Beastform[] {
  const tier = derive(ch).tier;
  const ids = [ch.classId, ch.multiclass?.classId].filter(Boolean) as string[];
  const forms = ids.flatMap((id) => classById.get(id)?.extras.beastforms?.forms ?? []);
  return forms.filter((f) => f.tier <= tier);
}

export function hasBeastform(ch: Character): boolean {
  return [ch.classId, ch.multiclass?.classId].some((id) => !!id && !!classById.get(id)?.extras.beastforms);
}

export type TransformVia = { via: 'beastform' } | { via: 'evolution'; trait: TraitId };

/** Why the transformation can't happen, or null. */
export function transformProblem(ch: Character, formId: string, how: TransformVia): string | null {
  if (!availableForms(ch).some((f) => f.id === formId)) return 'That form is above your tier.';
  if (how.via === 'beastform' && !canPayStress(ch, 1, derive(ch).stressSlots)) return 'All your Stress is marked.';
  if (how.via === 'evolution') {
    if (ch.classId !== 'druid') return 'Evolution is the Druid’s Hope feature.';
    if (ch.hope < 3) return 'Evolution costs 3 Hope.';
  }
  return null;
}

/** Beastform: mark a Stress. Evolution: spend 3 Hope instead and raise one trait by +1 until you drop out. */
export function transform(ch: Character, formId: string, how: TransformVia): Character {
  const p = transformProblem(ch, formId, how);
  if (p) throw new Error(p);
  return how.via === 'beastform'
    ? { ...ch, stress: ch.stress + 1, beastform: { formId } }
    : { ...ch, hope: ch.hope - 3, beastform: { formId, evolution: how.trait } };
}

export function dropOut(ch: Character): Character {
  const { beastform: _, ...rest } = ch;
  return rest;
}
