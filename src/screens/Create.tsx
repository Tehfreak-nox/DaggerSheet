import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { back, replace } from '../app/nav';
import { saveCharacter } from '../app/store';
import {
  ancestries, armor, classById, classes, communities, domainCards, guides, rules, weaponById, weapons,
  type Armor, type TraitId, type Weapon,
} from '../data';
import {
  createCharacter, creationProblems, hasAncestryFeature, startingCardCount, TRAIT_IDS, versatileStats,
  type AncestryChoice, type Character, type CreateInput,
} from '../rules';
import { EMBLEMS, FRAMES } from '../theme/tables';
import { sortGear } from '../ui/gearSort';
import { Header, Ornament, themeAttrs } from '../ui/Header';
import { cap, DomainIcon, Icon, ICONS, RANGE_NAMES, Recall, Rich, signed } from '../ui/kit';

const STEPS = ['Name', 'Class', 'Subclass', 'Ancestry', 'Community', 'Traits', 'Experiences', 'Equipment', 'Domain cards', 'Background', 'Review'];

interface Draft {
  name: string;
  pronouns: string;
  classId: string;
  subclassId: string;
  /** Mixed ancestry: anc1 gives the top (first) feature, anc2 the bottom (second). */
  mixed: boolean;
  anc1: string;
  anc2: string;
  communityId: string;
  traits: Partial<Record<TraitId, number>>;
  held: number | null;
  exp: [string, string];
  purposeful: number;
  primary: string;
  secondary: string;
  armorId: string;
  potion: 'minor-health-potion' | 'minor-stamina-potion';
  classItem: string;
  cards: string[];
  answers: Record<string, string>;
  connections: Record<string, string>;
}

const EMPTY: Draft = {
  name: '', pronouns: '', classId: '', subclassId: '', mixed: false, anc1: '', anc2: '', communityId: '',
  traits: {}, held: null, exp: ['', ''], purposeful: 0, primary: '', secondary: '', armorId: '',
  potion: 'minor-health-potion', classItem: '', cards: [], answers: {}, connections: {},
};

const MODS = rules.creation.traitModifiers;
const PRONOUNS = ['he/him', 'she/her', 'they/them'];

/** Clank "Purposeful Design" (first Clank feature, so also a mixed ancestry with Clank first). */
function isClank(d: Draft): boolean {
  const anc = ancestryOf(d);
  return !!anc && hasAncestryFeature({ ancestry: anc } as Character, 'purposeful-design');
}

function ancestryOf(d: Draft): AncestryChoice | undefined {
  const a = d.anc1 || d.anc2;
  if (!a) return undefined;
  return d.anc1 && d.anc2 && d.anc1 !== d.anc2 ? { mixed: { first: d.anc1, second: d.anc2 } } : { id: a };
}

function toInput(d: Draft): CreateInput {
  return {
    name: d.name,
    pronouns: d.pronouns,
    classId: d.classId,
    subclassId: d.subclassId,
    ancestry: ancestryOf(d) ?? { id: 'human' },
    communityId: d.communityId,
    traits: Object.fromEntries(TRAIT_IDS.map((t) => [t, d.traits[t] ?? 99])) as Record<TraitId, number>,
    experiences: d.exp,
    purposefulDesign: d.purposeful,
    primary: d.primary ? { id: d.primary } : undefined,
    secondary: d.secondary ? { id: d.secondary } : undefined,
    armorId: d.armorId,
    potion: d.potion,
    classItem: d.classItem,
    cards: d.cards,
    background: {
      ...Object.fromEntries(Object.entries(d.answers).filter(([, a]) => a.trim())),
      ...Object.fromEntries(Object.entries(d.connections).filter(([, a]) => a.trim()).map(([q, a]) => [`Connection: ${q}`, a])),
    },
  };
}

/** Slots in the tray that are still free (by index into MODS). */
function trayUsed(d: Draft): number[] {
  const used: number[] = [];
  for (const t of TRAIT_IDS) {
    const v = d.traits[t];
    if (v === undefined) continue;
    const i = MODS.findIndex((m, j) => m === v && !used.includes(j));
    if (i >= 0) used.push(i);
  }
  return used;
}

export function Create() {
  const [step, setStepRaw] = useState(0);
  const setStep = (n: number) => {
    setStepRaw(n);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  };
  const [d, setD] = useState<Draft>(EMPTY);
  /** Ancestry tile tapped last: its details open under its row. */
  const [peek, setPeek] = useState('');
  const [otherPro, setOtherPro] = useState(false);
  const up = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const cls = d.classId ? classById.get(d.classId) : undefined;
  const sub = cls?.subclasses.find((s) => s.id === d.subclassId);
  const guide = d.classId ? guides[d.classId] : undefined;
  const hasSpellcast = !!sub?.spellcastTrait;

  const stepOk = (i: number): boolean => {
    switch (i) {
      case 0: return d.name.trim().length > 0;
      case 1: return !!d.classId;
      case 2: return !!d.subclassId;
      case 3: return !!d.anc1 && !!d.anc2 && (!d.mixed || d.anc1 !== d.anc2);
      case 4: return !!d.communityId;
      case 5: return TRAIT_IDS.every((t) => d.traits[t] !== undefined);
      case 6: return d.exp.every((e) => e.trim()) && d.exp[0].trim().toLowerCase() !== d.exp[1].trim().toLowerCase();
      case 7: return !!d.armorId && (!!d.primary || d.classId === 'brawler');
      case 8: return d.cards.length === startingCardCount(d.classId, d.subclassId);
      default: return true;
    }
  };

  const persona = { name: d.name, pronouns: d.pronouns, classId: d.classId || undefined, subclassId: d.subclassId || undefined, ancestry: ancestryOf(d), communityId: d.communityId || undefined };

  const finish = () => {
    const input = toInput(d);
    const problems = creationProblems(input);
    if (problems.length) return;
    const ch: Character = createCharacter(input);
    saveCharacter(ch);
    replace({ name: 'sheet', id: ch.id });
  };

  const pickClass = (id: string) => {
    if (id === d.classId) return;
    const g = guides[id];
    up({
      classId: id, subclassId: '', cards: [], answers: {},
      primary: '', secondary: '', armorId: '', classItem: g?.inventory.classItem[0] ?? '',
    });
  };

  const useGuideGear = () => {
    if (!guide) return;
    up({ primary: guide.primary.id ?? '', secondary: guide.secondary?.id ?? '', armorId: guide.armor.id });
  };

  return (
    <div className="s" {...themeAttrs(persona)}>
      <Header persona={persona} preview tab="character" />
      {d.communityId && (
        <div className="create-com">
          <div className={`fx fx-${d.communityId}`}>
            <div className="fx-in">
              <span className="s-label">Features panel</span>
              <span className="s-muted" style={{ fontSize: 13 }}>{communities.find((c) => c.id === d.communityId)?.name}</span>
            </div>
          </div>
        </div>
      )}
      <div className="create-progress">
        <div className="bar" aria-hidden="true">
          {STEPS.map((_, i) => <span key={i} className={i < step ? 'done' : i === step ? 'now' : ''} />)}
        </div>
        <div className="s-row">
          <span className="s-label s-muted" style={{ fontSize: 12 }}>Step {step + 1} of {STEPS.length}</span>
          <button className="s-label s-muted link" style={{ fontSize: 12 }} onClick={back}>Cancel</button>
        </div>
        <h1 className="create-title">{STEPS[step]}</h1>
      </div>

      <main className="create-main">
        {step === 0 && (
          <>
            <label className="s-label s-muted" htmlFor="c-name">Name</label>
            <input id="c-name" className="s-field" type="text" placeholder="Character name" value={d.name} onChange={(e) => up({ name: e.target.value })} autoComplete="off" />
            <span className="s-label s-muted">Pronouns</span>
            <div className="seg-choice" role="group" aria-label="Pronouns">
              {PRONOUNS.map((p) => (
                <button key={p} className={`s-mini ${d.pronouns === p && !otherPro ? 'solid' : ''}`} aria-pressed={d.pronouns === p && !otherPro}
                  onClick={() => { setOtherPro(false); up({ pronouns: d.pronouns === p ? '' : p }); }}>{p}</button>
              ))}
              <button className={`s-mini ${otherPro ? 'solid' : ''}`} aria-pressed={otherPro}
                onClick={() => { setOtherPro(!otherPro); up({ pronouns: '' }); }}>Other</button>
            </div>
            {otherPro && (
              <input id="c-pro" className="s-field" type="text" aria-label="Your pronouns" placeholder="e.g. xe/xem" value={d.pronouns} onChange={(e) => up({ pronouns: e.target.value })} autoComplete="off" />
            )}
            <span className="s-muted hint">Your sheet reads: name · community · subclass · class · ancestry. Each choice restyles the sheet above.</span>
          </>
        )}

        {step === 1 && (
          <InlineGrid
            columns={2}
            items={classes}
            openId={d.classId}
            tile={(c) => (
              <button className="class-tile s-press" data-cls={c.id} data-sub="a" aria-pressed={d.classId === c.id} onClick={() => pickClass(c.id)}>
                <span className="head">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={EMBLEMS[c.id]} /></svg>
                  <span>{c.name}</span>
                </span>
                <span className="body">
                  <span style={{ fontSize: 13 }}>{c.domains.map(cap).join(' & ')}</span>
                  <span className="s-muted" style={{ fontSize: 12 }}>HP {c.startingHitPoints} · Evasion {c.startingEvasion}</span>
                </span>
              </button>
            )}
            detail={(c) => <ClassDetail id={c.id} />}
          />
        )}

        {step === 2 && cls && (
          <>
            <span className="s-muted hint">Both subclasses share the {cls.name} colours and emblem; each shifts the accent and the frame around the emblem. Tap one to read all of its abilities.</span>
            {cls.subclasses.map((s, i) => (
              <Fragment key={s.id}>
                <button className="sub-tile s-press" data-cls={cls.id} data-sub={i ? 'b' : 'a'} aria-pressed={d.subclassId === s.id} onClick={() => up({ subclassId: s.id, cards: [] })}>
                  <span className="em">
                    <svg width="44" height="44" viewBox="-5 -5 34 34" fill="none" stroke="#FFFFFF" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={EMBLEMS[cls.id]} /><path d={FRAMES[i]} /></svg>
                  </span>
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' }}>
                    <span className="s-feat-name">{s.name}</span>
                    <span className="s-muted" style={{ fontSize: 13 }}>{s.spellcastTrait ? `Spellcast: ${cap(s.spellcastTrait)}` : 'No Spellcast trait'} · {i ? 'diamond' : 'ring'} frame</span>
                    <span style={{ fontSize: 14, lineHeight: 1.35 }}>{s.description}</span>
                  </span>
                  <span className="swatch" />
                </button>
                {d.subclassId === s.id && <SubclassDetail classId={cls.id} subclassId={s.id} />}
              </Fragment>
            ))}
          </>
        )}

        {step === 3 && (
          <>
            <span className="s-muted hint">Tap an ancestry to read it. You get both of its features. To mix two ancestries, choose “Top only” or “Bottom only” in its details, then tap a second ancestry for the other feature.</span>
            {d.mixed && (
              <div className="s-row soft" style={{ alignItems: 'flex-start' }}>
                <span style={{ fontSize: 14, lineHeight: 1.4 }}>
                  <b>Mixed ancestry</b><br />
                  Top: {d.anc1 ? `${ancName(d.anc1)} · ${ancFeature(d.anc1, 0)}` : <i>tap an ancestry</i>}<br />
                  Bottom: {d.anc2 ? `${ancName(d.anc2)} · ${ancFeature(d.anc2, 1)}` : <i>tap an ancestry</i>}
                </span>
                <button className="s-mini" onClick={() => { const keep = d.anc1 || d.anc2; up({ mixed: false, anc1: keep, anc2: keep }); setPeek(keep); }}>Undo mix</button>
              </div>
            )}
            <InlineGrid
              items={ancestries}
              openId={peek || d.anc1 || d.anc2}
              tile={(a) => {
                const sel = a.id === d.anc1 || a.id === d.anc2;
                return (
                  <button className={`anc-tile s-press ${sel ? 'sel' : ''}`} aria-pressed={sel}
                    onClick={() => {
                      setPeek(a.id);
                      const pending = d.mixed && (!d.anc1 || !d.anc2);
                      if (pending) {
                        if (!d.anc1 && a.id !== d.anc2) up({ anc1: a.id });
                        else if (!d.anc2 && a.id !== d.anc1) up({ anc2: a.id });
                      } else if (!d.mixed) {
                        // Not mixing: tapping an ancestry takes both of its features.
                        up({ anc1: a.id, anc2: a.id, mixed: false });
                      }
                      // While a finished mix is in place, tapping just opens the details.
                    }}>
                    <Ornament id={a.id} />
                    <span style={{ font: '700 14px/1 var(--head)' }}>{a.name}</span>
                  </button>
                );
              }}
              detail={(a) => {
                const both = !d.mixed && d.anc1 === a.id;
                const top = d.mixed && d.anc1 === a.id;
                const bottom = d.mixed && d.anc2 === a.id;
                const pending = d.mixed && (!d.anc1 || !d.anc2);
                return (
                  <div className="inline-detail stack-10">
                    <span className="s-label">{a.name}{a.group ? ` · ${a.group}` : ''}</span>
                    {a.features.map((f, i) => {
                      const used = both || (i === 0 ? top : bottom);
                      return (
                        <div key={f.id} style={d.mixed && (top || bottom) && !used ? { opacity: 0.45 } : undefined}>
                          <span className="s-feat-name" style={{ fontSize: 17 }}>{f.name}</span>
                          <span className="s-muted" style={{ fontSize: 12 }}> · {i === 0 ? 'top' : 'bottom'} feature{used ? ' · yours' : ''}</span>
                          <Rich text={f.text} style={{ fontSize: 15 }} />
                        </div>
                      );
                    })}
                    <div className="seg-choice" role="group" aria-label={`Use ${a.name}`}>
                      <button className={`s-mini ${both ? 'solid' : ''}`} aria-pressed={both} onClick={() => up({ anc1: a.id, anc2: a.id, mixed: false })}>Both</button>
                      <button className={`s-mini ${top ? 'solid' : ''}`} aria-pressed={top}
                        onClick={() => up({ mixed: true, anc1: a.id, anc2: d.mixed && d.anc2 !== a.id ? d.anc2 : '' })}>Top only</button>
                      <button className={`s-mini ${bottom ? 'solid' : ''}`} aria-pressed={bottom}
                        onClick={() => up({ mixed: true, anc2: a.id, anc1: d.mixed && d.anc1 !== a.id ? d.anc1 : '' })}>Bottom only</button>
                    </div>
                    {pending && (top || bottom) && (
                      <span className="callout">Now tap another ancestry for its {top ? 'bottom' : 'top'} feature.</span>
                    )}
                  </div>
                );
              }}
            />
          </>
        )}

        {step === 4 && (
          <InlineGrid
            items={communities}
            openId={d.communityId}
            tile={(c) => (
              <button className="com-tile s-press" aria-pressed={d.communityId === c.id} onClick={() => up({ communityId: c.id })}>
                <span className={`fx fx-${c.id}`} style={{ display: 'block', padding: 8, borderRadius: 0 }}><span className="fx-in" style={{ display: 'block', height: 34, padding: 0 }} /></span>
                <span className="name">{c.name}</span>
              </button>
            )}
            detail={(c) => (
              <div className="inline-detail stack-10">
                <span className="s-label">{c.name}</span>
                <div><span className="s-feat-name" style={{ fontSize: 17 }}>{c.feature.name}</span><Rich text={c.feature.text} style={{ fontSize: 15 }} /></div>
              </div>
            )}
          />
        )}

        {step === 5 && guide && (
          <>
            <div className="rec-box">
              <div className="s-row"><span className="s-label">Suggested for {cls?.name}</span><button className="s-mini solid" onClick={() => up({ traits: { ...guide.traits }, held: null })}>Use</button></div>
              <div className="grid-6" style={{ textAlign: 'center' }}>
                {TRAIT_IDS.map((t) => (
                  <span key={t} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ font: '700 9px/1 var(--head)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{t}</span>
                    <span className="s-num" style={{ fontSize: 20 }}>{signed(guide.traits[t])}</span>
                  </span>
                ))}
              </div>
              <span className="s-muted" style={{ fontSize: 13 }}>From the official {cls?.name} character guide{sub?.spellcastTrait ? `. ${sub.name} casts with ${cap(sub.spellcastTrait)}.` : '.'}</span>
            </div>
            <span className="s-muted hint">Or place them yourself: tap a modifier, then tap a trait. Tap a placed trait to send its modifier back.</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minHeight: 52 }}>
              {MODS.map((m, i) => {
                const used = trayUsed(d).includes(i);
                return (
                  <button key={i} className={`s-token ${d.held === i ? 'sel' : used ? 'spent' : ''}`} disabled={used}
                    style={{ width: 48, height: 48, font: '600 20px/1 var(--head)', color: d.held === i ? '#fff' : undefined }}
                    aria-pressed={d.held === i} aria-label={`Modifier ${signed(m)}`} onClick={() => up({ held: d.held === i ? null : i })}>
                    {signed(m)}
                  </button>
                );
              })}
            </div>
            <div className="traits">
              {TRAIT_IDS.map((t) => (
                <button key={t} className="s-trait s-press" aria-label={`${t} ${d.traits[t] === undefined ? 'empty' : signed(d.traits[t]!)}`}
                  onClick={() => {
                    if (d.held !== null) {
                      up({ traits: { ...d.traits, [t]: MODS[d.held] }, held: null });
                    } else if (d.traits[t] !== undefined) {
                      const next = { ...d.traits };
                      delete next[t];
                      up({ traits: next });
                    }
                  }}>
                  <span className="tab">{t}</span>
                  <span className="face"><span className="s-num">{d.traits[t] === undefined ? '' : signed(d.traits[t]!)}</span></span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <span className="s-muted hint">Two Experiences at +2: a background, a skill, a saying. Keep them broad enough to come up often, but not so broad they apply to everything.</span>
            {[0, 1].map((i) => (
              <div key={i} className="s-row">
                <input className="s-field" type="text" id={`c-exp-${i}`} aria-label={i ? 'Second Experience' : 'First Experience'}
                  placeholder={i ? 'e.g. Silver Tongue' : 'e.g. Raised by Smugglers'} value={d.exp[i]}
                  onChange={(e) => { const exp = [...d.exp] as [string, string]; exp[i] = e.target.value; up({ exp }); }} autoComplete="off" />
                <span className="s-num" style={{ fontSize: 22 }}>+{2 + (isClank(d) && d.purposeful === i ? 1 : 0)}</span>
              </div>
            ))}
            {(() => {
              if (!isClank(d)) return null;
              return (
                <div className="soft stack-10">
                  <span style={{ fontSize: 14 }}><b>Purposeful Design</b> (Clank): which Experience fits the purpose you were made for? It gets a permanent +1.</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[0, 1].map((i) => <button key={i} className={`s-mini ${d.purposeful === i ? 'solid' : ''}`} onClick={() => up({ purposeful: i })}>{d.exp[i] || (i ? 'Second' : 'First')}</button>)}
                  </div>
                </div>
              );
            })()}
            <ExampleExperiences onPick={(e) => { const i = d.exp[0] ? 1 : 0; const exp = [...d.exp] as [string, string]; exp[i] = e; up({ exp }); }} />
          </>
        )}

        {step === 7 && cls && guide && (
          <GearStep d={d} up={up} hasSpellcast={hasSpellcast} useGuide={useGuideGear} />
        )}

        {step === 8 && cls && (
          <CardStep d={d} up={up} />
        )}

        {step === 9 && cls && (
          <>
            <span className="s-label">Background questions · {cls.name}</span>
            <span className="s-muted hint">Answer any of these, or write your own.</span>
            {cls.backgroundQuestions.map((q, i) => (
              <div key={i} className="stack-6">
                <label className="s-feat-text" style={{ fontSize: 15, fontWeight: 700 }} htmlFor={`bg-${i}`}>{q}</label>
                <textarea id={`bg-${i}`} className="s-field area" rows={3} placeholder="Your answer" value={d.answers[q] ?? ''} onChange={(e) => up({ answers: { ...d.answers, [q]: e.target.value } })} />
              </div>
            ))}
            <span className="s-label" style={{ marginTop: 10 }}>Connections · {cls.name}</span>
            <span className="s-muted hint">Ask your fellow players these for their character to answer, and note what they say.</span>
            {cls.connectionQuestions.map((q, i) => (
              <div key={i} className="stack-6">
                <label className="s-feat-text" style={{ fontSize: 15, fontWeight: 700 }} htmlFor={`con-${i}`}>{q}</label>
                <textarea id={`con-${i}`} className="s-field area" rows={3} placeholder="Their answer" value={d.connections[q] ?? ''} onChange={(e) => up({ connections: { ...d.connections, [q]: e.target.value } })} />
              </div>
            ))}
          </>
        )}

        {step === 10 && <Review d={d} />}

        <div className="create-nav">
          <button className="s-btn s-press" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          {step < STEPS.length - 1 ? (
            <button className="s-btn solid s-press" disabled={!stepOk(step)} onClick={() => setStep(step + 1)}>Next · {STEPS[step + 1]}</button>
          ) : (
            <button className="s-btn solid s-press" disabled={creationProblems(toInput(d)).length > 0} onClick={finish}>Create character</button>
          )}
        </div>
      </main>
    </div>
  );
}

function ExampleExperiences({ onPick }: { onPick: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  const ex = rules.creation.exampleExperiences;
  return (
    <div className="stack-10">
      <button className="s-mini" style={{ alignSelf: 'flex-start' }} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide examples' : 'Show examples'}</button>
      {open && Object.entries(ex).map(([k, list]) => (
        <div key={k} className="stack-6">
          <span className="s-label s-muted" style={{ fontSize: 12 }}>{k}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {list.map((e) => <button key={e} className="s-chip s-press" style={{ border: 0 }} onClick={() => onPick(e)}>{e}</button>)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Light, medium or heavy, read from the armor score against its tier (robes, gambeson, chainmail pattern). */
export function armorWeight(a: Armor): 'light' | 'medium' | 'heavy' {
  const d = a.score - a.tier;
  return d <= 1 ? 'light' : d === 2 ? 'medium' : 'heavy';
}

function WeightIcon({ weight }: { weight: 'light' | 'medium' | 'heavy' }) {
  const shield = 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z';
  return (
    <span className="gear-ico" title={`${cap(weight)} armor`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
        <defs><clipPath id={`w-${weight}`}><rect x="0" y={weight === 'heavy' ? 0 : weight === 'medium' ? 12 : 24} width="24" height="24" /></clipPath></defs>
        <path d={shield} fill="currentColor" clipPath={`url(#w-${weight})`} stroke="none" />
        <path d={shield} />
      </svg>
      <span>{cap(weight)}</span>
    </span>
  );
}

/** Which hands a weapon takes: left for a one-handed primary, right for a secondary, both when two-handed. */
export function Hands({ w }: { w: Weapon }) {
  const left = w.burden === 2 || w.category === 'primary';
  const right = w.burden === 2 || w.category === 'secondary';
  return (
    <span className="gear-ico hands" title={w.burden === 2 ? 'Two-handed' : w.category === 'primary' ? 'One-handed, primary hand' : 'Off hand'}>
      <span style={{ display: 'flex' }}>
        <Icon d={ICONS.hand} size={18} style={{ transform: 'scaleX(-1)', opacity: left ? 1 : 0.2 }} />
        <Icon d={ICONS.hand} size={18} style={{ opacity: right ? 1 : 0.2 }} />
      </span>
      <span>{w.burden === 2 ? 'Two-handed' : 'One-handed'}</span>
    </span>
  );
}

/** ★ in a ring for the guide's suggestion; a plain ★ for a weapon using your best trait. */
export function GearStar({ kind }: { kind: 'rec' | 'best' }) {
  return kind === 'rec'
    ? <span className="star-rec" title="Suggested by the character guide"><Icon d={ICONS.star} size={16} stroke={2} /></span>
    : <span className="star-best" title="Uses your best trait"><Icon d={ICONS.star} size={14} stroke={2} /></span>;
}

function GearStep({ d, up, hasSpellcast, useGuide }: { d: Draft; up: (p: Partial<Draft>) => void; hasSpellcast: boolean; useGuide: () => void }) {
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const guide = guides[d.classId];
  const prim = d.primary ? weaponById.get(d.primary) : undefined;
  const twoHanded = prim?.burden === 2;
  const rec = new Set([guide.primary.id, guide.secondary?.id, guide.armor.id].filter(Boolean) as string[]);
  const items = guide.inventory.classItem;
  const [otherItem, setOtherItem] = useState(!!d.classItem && !items.includes(d.classItem));

  const sub = classById.get(d.classId)!.subclasses.find((x) => x.id === d.subclassId);
  const spell = sub?.spellcastTrait ? d.traits[sub.spellcastTrait] ?? null : null;
  const traitVal = (w: Weapon) => w.trait === 'spellcast' ? spell : d.traits[w.trait as TraitId] ?? null;
  const best = Math.max(...TRAIT_IDS.map((t) => d.traits[t] ?? -9));
  const sortRec = <T extends { id: string; name: string; trait?: TraitId | 'spellcast' }>(xs: T[]) => sortGear(xs, (x) => rec.has(x.id), d.traits, spell);
  const groups: { key: 'primary' | 'secondary' | 'armor'; title: string; items: (Weapon | Armor)[]; chosen: string; note?: string }[] = [
    { key: 'primary', title: 'Primary weapon', items: sortRec(weapons.filter((w) => w.tier === 1 && w.category === 'primary' && !w.group)), chosen: d.primary,
      note: d.classId === 'brawler' ? 'Brawler: with no active weapons you fight with Brawler’s Strike (I Am the Weapon), so a weapon is optional.' : undefined },
    { key: 'secondary', title: 'Secondary weapon', items: sortRec(weapons.filter((w) => w.tier === 1 && w.category === 'secondary')), chosen: d.secondary,
      note: twoHanded ? `${prim?.name} is two-handed, so you can’t also hold a secondary weapon.` : 'Optional. Only with a one-handed primary weapon.' },
    { key: 'armor', title: 'Armor', items: sortRec(armor.filter((a) => a.tier === 1)), chosen: d.armorId },
  ];

  return (
    <>
      <span className="s-muted hint stack-4">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><GearStar kind="rec" /> Suggested by the {classById.get(d.classId)!.name} guide</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 24, display: 'inline-grid', placeItems: 'center' }}><GearStar kind="best" /></span> Uses your best trait</span>
        <span>Tap a row to choose it; tap it again to remove it.</span>
      </span>
      <div className="rec-box">
        <div className="s-row">
          <span className="s-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><GearStar kind="rec" /> Suggested for {classById.get(d.classId)!.name}</span>
          <button className="s-mini solid" onClick={useGuide}>Use</button>
        </div>
        <span style={{ fontSize: 14 }}>{[guide.primary.name, guide.secondary?.name, guide.armor.name].filter(Boolean).join(' · ')}</span>
      </div>
      {groups.map((g) => {
        const limit = showAll[g.key] ? g.items.length : 6;
        return (
          <section key={g.key} className="stack-6" style={{ marginTop: 8 }}>
            <div className="s-row" style={{ paddingBottom: 6, borderBottom: '2px solid var(--ink)' }}>
              <span className="s-label" style={{ fontSize: 16 }}>{g.title}</span>
              <span className="s-muted" style={{ fontSize: 13 }}>{g.items.find((x) => x.id === g.chosen)?.name ?? 'None'}</span>
            </div>
            {g.note && <span className="s-muted" style={{ fontSize: 13 }}>{g.note}</span>}
            {g.items.slice(0, limit).map((x) => {
              const isW = 'damage' in x;
              const w = isW ? (x as Weapon) : null;
              const a = !isW ? (x as Armor) : null;
              const blocked = (w && w.damage.type !== 'phy' && !hasSpellcast) ? 'Needs a Spellcast trait'
                : (w && g.key === 'secondary' && twoHanded) ? 'Hands full'
                : null;
              const chosen = g.chosen === x.id;
              const vs = w ? versatileStats(w.feature) : null;
              const star = rec.has(x.id) ? 'rec' : w && best > -9 && traitVal(w) === best ? 'best' : null;
              const choose = () => {
                if (g.key === 'primary') up({ primary: chosen ? '' : x.id, secondary: !chosen && w!.burden === 2 ? '' : d.secondary });
                if (g.key === 'secondary') up({ secondary: chosen ? '' : x.id });
                if (g.key === 'armor') up({ armorId: chosen ? '' : x.id });
              };
              return (
                <button key={x.id} className={`gear-pick s-press ${chosen ? 'sel' : ''}`} aria-pressed={chosen} disabled={!!blocked && !chosen} onClick={choose}
                  style={blocked ? { opacity: 0.45 } : undefined}>
                  <span className="gp-main">
                    <span className="gp-name">{star && <GearStar kind={star} />}{x.name}{chosen && <span className="chosen">Chosen</span>}</span>
                    <span className="gp-meta">
                      {w ? <Hands w={w} /> : <WeightIcon weight={armorWeight(a!)} />}
                      <span className="s-muted">{w ? `${w.trait === 'spellcast' ? 'Spellcast' : cap(w.trait)} · ${RANGE_NAMES[w.range]}` : `Thresholds ${a!.thresholds.major} / ${a!.thresholds.severe}`}</span>
                    </span>
                    {x.feature && <span className="gp-feat"><b>{x.feature.name}:</b> {x.feature.text}</span>}
                    {vs && <span className="s-muted" style={{ fontSize: 13 }}>Versatile: {cap(vs.trait)}, {RANGE_NAMES[vs.range]}, d{vs.damage.die}{vs.damage.bonus ? '+' + vs.damage.bonus : ''}</span>}
                    {blocked && <span className="s-muted" style={{ fontSize: 13 }}>{blocked}</span>}
                  </span>
                  <span className="gp-side">
                    {w ? <><span className="s-num" style={{ fontSize: 18 }}>d{w.damage.die}{w.damage.bonus ? '+' + w.damage.bonus : ''}</span><span className="s-label s-muted" style={{ fontSize: 11 }}>{w.damage.type === 'phy' ? 'Physical' : 'Magic'}</span></>
                      : <><span className="s-num" style={{ fontSize: 20 }}>{a!.score}</span><span className="s-label s-muted" style={{ fontSize: 11 }}>Score</span></>}
                  </span>
                </button>
              );
            })}
            {g.items.length > 6 && (
              <button className="s-mini" style={{ alignSelf: 'flex-start', marginTop: 8 }} onClick={() => setShowAll({ ...showAll, [g.key]: !showAll[g.key] })}>
                {showAll[g.key] ? 'Show fewer' : `Show all ${g.items.length}`}
              </button>
            )}
          </section>
        );
      })}
      <span className="s-label" style={{ marginTop: 10 }}>Potion</span>
      <div className="stack-col">
        {(['minor-health-potion', 'minor-stamina-potion'] as const).map((p) => (
          <button key={p} className={`s-mini wide ${d.potion === p ? 'solid' : ''}`} aria-pressed={d.potion === p} onClick={() => up({ potion: p })}>
            {p === 'minor-health-potion' ? 'Minor Health Potion · 1d4 HP' : 'Minor Stamina Potion · 1d4 Stress'}
          </button>
        ))}
      </div>
      <span className="s-label" style={{ marginTop: 10 }}>Class item</span>
      <div className="stack-col">
        {items.map((it) => (
          <button key={it} className={`s-mini wide ${!otherItem && d.classItem === it ? 'solid' : ''}`} aria-pressed={!otherItem && d.classItem === it}
            onClick={() => { setOtherItem(false); up({ classItem: it }); }}>{it}</button>
        ))}
        <button className={`s-mini wide ${otherItem ? 'solid' : ''}`} aria-pressed={otherItem}
          onClick={() => { setOtherItem(true); up({ classItem: '' }); }}>Other</button>
        {otherItem && (
          <input className="s-field" type="text" aria-label="Your class item" placeholder="Describe your class item" value={d.classItem} onChange={(e) => up({ classItem: e.target.value })} autoComplete="off" />
        )}
      </div>
      <span className="s-muted hint">Also added: a torch, 50 feet of rope, basic supplies and a handful of gold.</span>
    </>
  );
}

function CardStep({ d, up }: { d: Draft; up: (p: Partial<Draft>) => void }) {
  const [open, setOpen] = useState('');
  const cls = classById.get(d.classId)!;
  const need = startingCardCount(d.classId, d.subclassId);
  const pool = useMemo(() => domainCards.filter((c) => c.level === 1 && (cls.domains as string[]).includes(c.domain)), [cls]);
  return (
    <>
      <span className="s-muted hint">Choose {need} level 1 cards from {cls.domains.map(cap).join(' and ')}. Tap a card to read it. {d.cards.length} of {need} chosen.</span>
      {cls.domains.map((dom, di) => (
        <Fragment key={dom}>
          {di > 0 && <hr className="sep" />}
          <span className="s-label domain-head"><DomainIcon domain={dom} size={22} /> {cap(dom)}</span>
          {pool.filter((c) => c.domain === dom).map((c) => {
            const sel = d.cards.includes(c.id);
            const isOpen = open === c.id;
            return (
              <div key={c.id} className={`card-pick ${sel ? 'sel' : ''}`}>
                <button className="s-row s-press" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : c.id)}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
                    <DomainIcon domain={c.domain} size={24} />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span className="s-feat-name" style={{ fontSize: 18 }}>{c.name}</span>
                      <span className="s-muted" style={{ fontSize: 13 }}>{cap(c.domain)} · {cap(c.type)}</span>
                    </span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {sel && <span className="chosen">Chosen</span>}
                    <Recall cost={c.recallCost} />
                  </span>
                </button>
                {isOpen && (
                  <div className="stack-10" style={{ padding: '0 12px 14px' }}>
                    <Rich text={c.text} style={{ fontSize: 15 }} />
                    <button className={`s-mini ${sel ? '' : 'solid'}`} style={{ alignSelf: 'flex-start' }} disabled={!sel && d.cards.length >= need}
                      onClick={() => up({ cards: sel ? d.cards.filter((x) => x !== c.id) : [...d.cards, c.id] })}>
                      {sel ? 'Remove' : d.cards.length >= need ? `${need} chosen` : 'Choose'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </Fragment>
      ))}
    </>
  );
}

function Review({ d }: { d: Draft }) {
  const input = toInput(d);
  const problems = creationProblems(input);
  const cls = classById.get(d.classId);
  const sub = cls?.subclasses.find((s) => s.id === d.subclassId);
  const rows: [string, string][] = [
    ['Name', `${d.name}${d.pronouns ? ` (${d.pronouns})` : ''}`],
    ['Class', `${cls?.name} · ${sub?.name}`],
    ['Ancestry', d.anc1 !== d.anc2 ? `${ancName(d.anc1)} (${ancFeature(d.anc1, 0)}) / ${ancName(d.anc2)} (${ancFeature(d.anc2, 1)})` : ancName(d.anc1)],
    ['Community', communities.find((c) => c.id === d.communityId)?.name ?? ''],
    ['Traits', TRAIT_IDS.map((t) => `${cap(t).slice(0, 3)} ${signed(d.traits[t] ?? 0)}`).join(' · ')],
    ['Experiences', d.exp.join(' · ')],
    ['Weapons', [d.primary && weaponById.get(d.primary)?.name, d.secondary && weaponById.get(d.secondary)?.name].filter(Boolean).join(' + ') || 'Brawler’s Strike'],
    ['Armor', armor.find((a) => a.id === d.armorId)?.name ?? ''],
    ['Cards', d.cards.map((id) => domainCards.find((c) => c.id === id)?.name).join(' · ')],
    ['Start', cls ? `HP ${cls.startingHitPoints} · Evasion ${cls.startingEvasion} · Stress 6 · Hope 2` : ''],
  ];
  return (
    <>
      {rows.map(([k, v]) => (
        <div key={k} className="s-row review-row"><span className="s-label s-muted" style={{ fontSize: 12, paddingTop: 3 }}>{k}</span><span>{v}</span></div>
      ))}
      {problems.length > 0 && <p className="callout">{problems.join(' ')}</p>}
    </>
  );
}

/**
 * A 3-column tile grid that opens the chosen tile's details directly under
 * its row, so the text appears where you tapped instead of below the grid.
 */
function InlineGrid<T extends { id: string }>({ items, openId, tile, detail, columns = 3 }: {
  items: T[]; openId?: string; tile: (x: T) => ReactNode; detail: (x: T) => ReactNode; columns?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const idx = items.findIndex((x) => x.id === openId);
  const rowEnd = idx < 0 ? -1 : Math.min(items.length - 1, Math.floor(idx / columns) * columns + columns - 1);
  useEffect(() => {
    if (idx >= 0) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [openId]);
  return (
    <div className={columns === 2 ? 'grid-2' : 'grid-3'}>
      {items.map((x, i) => (
        <Fragment key={x.id}>
          {tile(x)}
          {i === rowEnd && <div ref={ref} className="inline-span">{detail(items[idx])}</div>}
        </Fragment>
      ))}
    </div>
  );
}

const ancName = (id: string) => ancestries.find((a) => a.id === id)?.name ?? '';
const ancFeature = (id: string, i: 0 | 1) => ancestries.find((a) => a.id === id)?.features[i].name ?? '';

function Feat({ name, text, note, tag }: { name: string; text: string; note?: string; tag?: string }) {
  return (
    <div className="stack-4">
      <span><span className="s-feat-name" style={{ fontSize: 17 }}>{name}</span>{tag && <span className="s-muted" style={{ fontSize: 12 }}> · {tag}</span>}</span>
      <Rich text={text} style={{ fontSize: 15 }} />
      {note && <span className="s-muted" style={{ fontSize: 13 }}>{note}</span>}
    </div>
  );
}

/** A class's Hope feature and class features, shown under its tile before you pick it. */
function ClassDetail({ id }: { id: string }) {
  const c = classById.get(id)!;
  return (
    <div className="inline-detail stack-14" data-cls={c.id} data-sub="a">
      <span className="s-label" style={{ fontSize: 18 }}>{c.name}</span>
      <span className="s-label">Hope feature</span>
      <Feat name={c.hopeFeature.name} text={c.hopeFeature.text} tag={`${c.hopeFeature.hopeCost} Hope`} />
      <hr className="sep" />
      <span className="s-label">Class feature{c.features.length > 1 ? 's' : ''}</span>
      {c.features.map((f) => <Feat key={f.id} name={f.name} text={f.text} note={f.note} />)}
    </div>
  );
}

/** Every subclass ability, with when you gain it. */
function SubclassDetail({ classId, subclassId }: { classId: string; subclassId: string }) {
  const s = classById.get(classId)!.subclasses.find((x) => x.id === subclassId)!;
  const stages: [keyof typeof s & ('foundation' | 'specialization' | 'mastery'), string][] = [
    ['foundation', 'Foundation · Level 1'],
    ['specialization', 'Specialization · Level 5'],
    ['mastery', 'Mastery · Level 8'],
  ];
  return (
    <div className="inline-detail stack-14">
      <span className="s-label" style={{ fontSize: 18 }}>{s.name}</span>
      <span style={{ fontSize: 14 }}>{s.spellcastTrait ? `Spellcast trait: ${cap(s.spellcastTrait)}` : 'No Spellcast trait (you can’t use magic weapons).'}</span>
      {stages.map(([k, label], i) => (
        <div key={k} className="stack-10">
          {i > 0 && <hr className="sep" />}
          <span className="s-label stage-head">{label}</span>
          {s[k].map((f) => <Feat key={f.id} name={f.name} text={f.text} note={f.note} />)}
        </div>
      ))}
    </div>
  );
}
