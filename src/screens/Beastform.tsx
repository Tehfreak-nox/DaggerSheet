import { useState } from 'react';
import { back } from '../app/nav';
import { toast } from '../app/toast';
import { updateCharacter, useStore } from '../app/store';
import type { Beastform, TraitId } from '../data';
import {
  availableForms, derive, dropOut, evolvedRule, hybridRule, transform, transformProblem, transformStress, TRAIT_IDS,
  type FormExtras, type TransformVia,
} from '../rules';
import { themeAttrs } from '../ui/Header';
import { cap, Page, Rich, signed } from '../ui/kit';

/** Choose a Beastform (or use Evolution), as a full page like the vault and item pickers. */
export function BeastformPicker({ id, via }: { id: string; via: 'beastform' | 'evolution' }) {
  const ch = useStore((s) => s.characters[id]);
  const [form, setForm] = useState('');
  const [trait, setTrait] = useState<TraitId | ''>('');
  const [base, setBase] = useState('');
  const [hForms, setHForms] = useState<string[]>([]);
  const [hAdv, setHAdv] = useState<string[]>([]);
  const [hFeat, setHFeat] = useState<string[]>([]);
  if (!ch) return null;
  const d = derive(ch);
  const forms = availableForms(ch);
  const chosen = forms.find((f) => f.id === form);
  const ev = chosen ? evolvedRule(chosen) : null;
  const hy = chosen ? hybridRule(chosen) : null;
  const simple = (f: Beastform) => !evolvedRule(f) && !hybridRule(f);
  const how: TransformVia | null = via === 'beastform' ? { via } : trait ? { via, trait } : null;
  const extras: FormExtras = ev ? { base } : hy ? { hybrid: { forms: hForms, advantages: hAdv, features: hFeat } } : {};
  const problem = chosen && how ? transformProblem(dropOut(ch), form, how, extras) : null;
  const stress = chosen && how ? transformStress(ch, form, how) : via === 'beastform' ? 1 : 0;
  const pick = (f: string) => { setForm(f); setBase(''); setHForms([]); setHAdv([]); setHFeat([]); };
  const toggle = (arr: string[], set: (x: string[]) => void, v: string, max: number) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : arr.length < max ? [...arr, v] : arr);
  const hybridFrom = forms.filter((f) => hForms.includes(f.id));

  const confirm = () => {
    if (!chosen || !how || problem) return;
    updateCharacter(id, (c) => transform(dropOut(c), form, how, extras));
    toast(`Transformed: ${chosen.name}${ev ? ` (${forms.find((f) => f.id === base)?.name})` : ''}.`);
    back();
  };

  return (
    <div className="s" {...themeAttrs(ch)}>
      <Page title={via === 'evolution' ? 'Evolution' : 'Beastform'} onClose={back}>
        <span className="s-muted" style={{ fontSize: 14, lineHeight: 1.4 }}>
          {via === 'evolution'
            ? 'Spend 3 Hope to transform without marking a Stress, and raise one trait by +1 until you drop out.'
            : `Mark a Stress to transform into a creature of tier ${d.tier} or lower.`}
        </span>

        {via === 'evolution' && (
          <section className="stack-6">
            <span className="s-label">Trait to raise by +1</span>
            <div className="seg-choice">
              {TRAIT_IDS.map((t) => (
                <button key={t} className={`s-mini ${trait === t ? 'solid' : ''}`} aria-pressed={trait === t} onClick={() => setTrait(t)}>
                  {cap(t)} {signed(d.traits[t])}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="stack-6">
          <span className="s-label">Form</span>
          {[1, 2, 3, 4].filter((t) => t <= d.tier).map((tier) => (
            <div key={tier} className="stack-6">
              {tier > 1 && <hr className="sep" />}
              <span className="s-label s-muted" style={{ fontSize: 12 }}>Tier {tier}</span>
              {forms.filter((f) => f.tier === tier).map((f) => (
                <FormRow key={f.id} f={f} selected={form === f.id} onClick={() => pick(form === f.id ? '' : f.id)} />
              ))}
            </div>
          ))}
        </section>

        {ev && (
          <section className="stack-6">
            <span className="s-label">Evolve which form? · Tier {ev.maxTier === 1 ? '1' : `1–${ev.maxTier}`}</span>
            <span className="s-muted" style={{ fontSize: 13 }}>+{ev.damage} damage, +{ev.trait} to its trait, +{ev.evasion} Evasion{ev.dieUp ? ', damage die one size larger' : ''}.</span>
            {forms.filter((f) => f.tier <= ev.maxTier && simple(f)).map((f) => (
              <FormRow key={f.id} f={f} selected={base === f.id} onClick={() => setBase(base === f.id ? '' : f.id)} />
            ))}
          </section>
        )}

        {hy && (
          <section className="stack-6">
            <span className="s-label">Combine {hy.forms} forms · Tiers 1–{hy.maxTier} ({hForms.length}/{hy.forms})</span>
            {forms.filter((f) => f.tier <= hy.maxTier && simple(f)).map((f) => (
              <FormRow key={f.id} f={f} selected={hForms.includes(f.id)}
                onClick={() => { toggle(hForms, setHForms, f.id, hy.forms); setHAdv([]); setHFeat([]); }} />
            ))}
            {hybridFrom.length === hy.forms && (
              <>
                <span className="s-label" style={{ marginTop: 8 }}>Advantages ({hAdv.length}/{hy.advantages})</span>
                <div className="seg-choice">
                  {[...new Set(hybridFrom.flatMap((f) => f.advantages))].map((a) => (
                    <button key={a} className={`s-mini ${hAdv.includes(a) ? 'solid' : ''}`} aria-pressed={hAdv.includes(a)}
                      disabled={!hAdv.includes(a) && hAdv.length >= hy.advantages} onClick={() => toggle(hAdv, setHAdv, a, hy.advantages)}>{a}</button>
                  ))}
                </div>
                <span className="s-label" style={{ marginTop: 8 }}>Features ({hFeat.length}/{hy.features})</span>
                {hybridFrom.flatMap((f) => f.features.map((x) => ({ key: `${f.id}:${x.id}`, from: f.name, x }))).map(({ key, from, x }) => (
                  <button key={key} className={`beast-opt s-press ${hFeat.includes(key) ? 'sel' : ''}`} aria-pressed={hFeat.includes(key)}
                    disabled={!hFeat.includes(key) && hFeat.length >= hy.features} onClick={() => toggle(hFeat, setHFeat, key, hy.features)}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
                      <b>{x.name} <span className="s-muted" style={{ fontWeight: 400, fontSize: 13 }}>· {from}</span></b>
                      <Rich text={x.text} style={{ fontSize: 14 }} />
                    </span>
                  </button>
                ))}
              </>
            )}
          </section>
        )}

        {problem && chosen && <p className="callout" role="status">{problem}</p>}
        <button className="s-btn solid s-press sticky-cta" style={{ minHeight: 52 }} disabled={!chosen || !how || !!problem} onClick={confirm}>
          {!chosen ? 'Choose a form' : via === 'evolution' ? `Transform · 3 Hope${stress ? ` + ${stress} Stress` : ''}` : `Transform · mark ${stress} Stress`}
        </button>
      </Page>
    </div>
  );
}

function FormRow({ f, selected, onClick }: { f: Beastform; selected: boolean; onClick: () => void }) {
  return (
    <button className={`beast-opt s-press ${selected ? 'sel' : ''}`} aria-pressed={selected} onClick={onClick}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left', flex: 1 }}>
        <b style={{ fontSize: 16 }}>{f.name}</b>
        <span className="s-muted" style={{ fontSize: 13 }}>{f.examples}</span>
        {(f.trait || f.attack) && (
          <span style={{ fontSize: 13 }}>
            {f.trait ? `${cap(f.trait)} ${signed(f.traitBonus)} · ` : ''}Evasion {signed(f.evasionBonus)}
            {f.attack ? ` · ${cap(f.attack.trait)} ${f.attack.damage} ${f.attack.type}` : ''}
          </span>
        )}
        {f.advantages.length > 0 && <span className="s-muted" style={{ fontSize: 13 }}>Advantage: {f.advantages.join(', ')}</span>}
        {selected && f.features.map((x) => <span key={x.id} className="stack-2" style={{ display: 'flex', marginTop: 4 }}><b>{x.name}</b><Rich text={x.text} style={{ fontSize: 14 }} /></span>)}
      </span>
    </button>
  );
}
