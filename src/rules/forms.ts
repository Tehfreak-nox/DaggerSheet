// Resolving the Beastform a character is in: plain forms, Evolved forms
// (Legendary/Mythic Beast built on a lower-tier form) and Hybrids (features
// and advantages picked from several forms). Read from the form text.
import { classById, type Beastform, type Feature, type RangeId, type TraitId } from '../data';
import type { Character } from './model';

export interface BeastformChoice {
  formId: string;
  /** Evolution: the trait raised by +1 until you drop out. */
  evolution?: TraitId;
  /** Evolved forms: the lower-tier form this is a larger version of. */
  base?: string;
  /** Hybrid forms: the forms combined, and the advantages and features taken from them. */
  hybrid?: { forms: string[]; advantages: string[]; features: string[] };
}

export interface FormAttack {
  range: RangeId;
  trait: TraitId;
  sides: number;
  bonus: number;
  type: 'phy' | 'mag';
}

export interface ActiveForm {
  form: Beastform;
  name: string;
  trait: TraitId | null;
  traitBonus: number;
  evasionBonus: number;
  attack: FormAttack | null;
  advantages: string[];
  /** Features in effect, with the form each comes from (key: "formId:featureId"). */
  features: { key: string; from: string; feature: Feature }[];
  /** "+2 bonus to your damage thresholds" and similar. */
  thresholdBonus: number;
}

/** Every Beastform the character's classes offer (Druid or a Druid multiclass). */
export function allForms(ch: Pick<Character, 'classId' | 'multiclass'>): Beastform[] {
  const ids = [ch.classId, ch.multiclass?.classId].filter(Boolean) as string[];
  return ids.flatMap((id) => classById.get(id)?.extras.beastforms?.forms ?? []);
}

const DIE_STEPS = [4, 6, 8, 10, 12, 20];

export interface EvolvedRule { maxTier: number; damage: number; trait: number; evasion: number; dieUp: boolean }
export interface HybridRule { forms: number; maxTier: number; advantages: number; features: number; extraStress: number }

const WORDS: Record<string, number> = { an: 1, a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const num = (w: string) => WORDS[w.toLowerCase()] ?? Number(w);
const plain = (s: string) => s.replace(/\*\*|__/g, '').replace(/(^|\W)_|_(?=\W|$)/g, '$1');

export function evolvedRule(f: Beastform): EvolvedRule | null {
  const t = plain(f.features.find((x) => x.id === 'evolved')?.text ?? '');
  if (!t) return null;
  const maxTier = Math.max(...[...t.matchAll(/Tier (\d)/g)].map((m) => Number(m[1])));
  const bonus = (re: RegExp) => Number(re.exec(t)?.[1] ?? 0);
  return {
    maxTier,
    damage: bonus(/\+(\d+) bonus to damage rolls/),
    trait: bonus(/\+(\d+) bonus to the trait used by this form/),
    evasion: bonus(/\+(\d+) bonus to Evasion/),
    dieUp: /damage die increases by one size/.test(t),
  };
}

export function hybridRule(f: Beastform): HybridRule | null {
  const t = plain(f.features.find((x) => x.id === 'hybrid-features')?.text ?? '');
  if (!t) return null;
  const opts = /Choose any (\w+) Beastform options from Tiers 1[–-](\d)/.exec(t);
  const picks = /Choose a total of (\w+) advantages and (\w+) features/.exec(t);
  const stress = /mark (an|\d+) additional Stress/.exec(t);
  if (!opts || !picks) return null;
  return { forms: num(opts[1]), maxTier: Number(opts[2]), advantages: num(picks[1]), features: num(picks[2]), extraStress: stress ? num(stress[1]) : 0 };
}

function parseAttack(a: Beastform['attack']): FormAttack | null {
  if (!a) return null;
  const m = /^d(\d+)(?:\+(\d+))?$/.exec(a.damage);
  if (!m) return null;
  return { range: a.range, trait: a.trait, sides: Number(m[1]), bonus: Number(m[2] ?? 0), type: a.type };
}

function thresholdBonus(features: Feature[]): number {
  let n = 0;
  for (const f of features) {
    const m = /You gain a ([+−-])(\d+) (?:bonus|penalty) to (?:all )?your damage thresholds/.exec(plain(f.text));
    if (m) n += (m[1] === '+' ? 1 : -1) * Number(m[2]);
  }
  return n;
}

const keyed = (form: Beastform) => form.features.map((feature) => ({ key: `${form.id}:${feature.id}`, from: form.name, feature }));

/** The form in effect with everything resolved, or undefined. */
export function activeForm(ch: Character): ActiveForm | undefined {
  const choice = ch.beastform as BeastformChoice | undefined;
  if (!choice) return undefined;
  const forms = allForms(ch);
  const form = forms.find((f) => f.id === choice.formId);
  if (!form) return undefined;
  const ev = evolvedRule(form);
  const base = ev && choice.base ? forms.find((f) => f.id === choice.base) : undefined;
  if (ev && base) {
    const att = parseAttack(base.attack);
    const feats = keyed(base);
    return {
      form, name: `${form.name} · ${base.name}`, trait: base.trait, traitBonus: base.traitBonus + ev.trait,
      evasionBonus: base.evasionBonus + ev.evasion,
      attack: att && {
        ...att, bonus: att.bonus + ev.damage,
        sides: ev.dieUp ? DIE_STEPS[Math.min(DIE_STEPS.length - 1, DIE_STEPS.indexOf(att.sides) + 1)] : att.sides,
      },
      advantages: base.advantages, features: feats, thresholdBonus: thresholdBonus(feats.map((x) => x.feature)),
    };
  }
  const hy = hybridRule(form);
  if (hy && choice.hybrid) {
    const from = forms.filter((f) => choice.hybrid!.forms.includes(f.id));
    const feats = from.flatMap(keyed).filter((x) => choice.hybrid!.features.includes(x.key));
    return {
      form, name: form.name, trait: form.trait, traitBonus: form.traitBonus, evasionBonus: form.evasionBonus,
      attack: parseAttack(form.attack), advantages: choice.hybrid.advantages, features: feats,
      thresholdBonus: thresholdBonus(feats.map((x) => x.feature)),
    };
  }
  return {
    form, name: form.name, trait: form.trait, traitBonus: form.traitBonus, evasionBonus: form.evasionBonus,
    attack: parseAttack(form.attack), advantages: form.advantages, features: keyed(form),
    thresholdBonus: thresholdBonus(form.features),
  };
}

/** Extra damage dice a form feature can add to an attack ("add a d8 to your damage roll"). */
export function damageAddOns(f: ActiveForm): { key: string; name: string; sides: number; condition: string }[] {
  const out: { key: string; name: string; sides: number; condition: string }[] = [];
  for (const { key, feature } of f.features) {
    const t = plain(feature.text);
    const m = /^(When [^,]+), add a d(\d+) to your damage roll/.exec(t);
    if (m) out.push({ key, name: feature.name, sides: Number(m[2]), condition: m[1] });
  }
  return out;
}
