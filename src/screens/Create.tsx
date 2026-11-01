import { useMemo, useState } from 'react';
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
import { Header, Ornament, themeAttrs } from '../ui/Header';
import { cap, Icon, ICONS, RANGE_NAMES, Recall, Rich, signed } from '../ui/kit';

const STEPS = ['Name', 'Class', 'Subclass', 'Ancestry', 'Community', 'Traits', 'Experiences', 'Equipment', 'Domain cards', 'Background', 'Review'];

interface Draft {
  name: string;
  pronouns: string;
  classId: string;
  subclassId: string;
  mixed: boolean;
  anc1: string;
  anc2: string;
  slot: 0 | 1;
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
  connections: string;
}

const EMPTY: Draft = {
  name: '', pronouns: '', classId: '', subclassId: '', mixed: false, anc1: '', anc2: '', slot: 0, communityId: '',
  traits: {}, held: null, exp: ['', ''], purposeful: 0, primary: '', secondary: '', armorId: '',
  potion: 'minor-health-potion', classItem: '', cards: [], answers: {}, connections: '',
};

const MODS = rules.creation.traitModifiers;

function ancestryOf(d: Draft): AncestryChoice | undefined {
  if (!d.anc1) return undefined;
  return d.mixed && d.anc2 && d.anc2 !== d.anc1 ? { mixed: { first: d.anc1, second: d.anc2 } } : { id: d.anc1 };
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
    background: { ...d.answers, ...(d.connections ? { connections: d.connections } : {}) },
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
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(EMPTY);
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
      case 3: return !!d.anc1 && (!d.mixed || (!!d.anc2 && d.anc2 !== d.anc1));
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
            <label className="s-label s-muted" htmlFor="c-pro">Pronouns</label>
            <input id="c-pro" className="s-field" type="text" placeholder="e.g. she/her" value={d.pronouns} onChange={(e) => up({ pronouns: e.target.value })} autoComplete="off" />
            <span className="s-muted hint">Your sheet reads: name · community · subclass · class · ancestry. Each choice restyles the sheet above.</span>
          </>
        )}

        {step === 1 && (
          <div className="grid-2">
            {classes.map((c) => (
              <button key={c.id} className="class-tile s-press" data-cls={c.id} data-sub="a" aria-pressed={d.classId === c.id} onClick={() => pickClass(c.id)}>
                <span className="head">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={EMBLEMS[c.id]} /></svg>
                  <span>{c.name}</span>
                </span>
                <span className="body">
                  <span style={{ fontSize: 13 }}>{c.domains.map(cap).join(' & ')}</span>
                  <span className="s-muted" style={{ fontSize: 12 }}>HP {c.startingHitPoints} · Evasion {c.startingEvasion}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {step === 2 && cls && (
          <>
            <span className="s-muted hint">Both subclasses share the {cls.name} colours and emblem; each shifts the accent and the frame around the emblem.</span>
            {cls.subclasses.map((s, i) => (
              <button key={s.id} className="sub-tile s-press" data-cls={cls.id} data-sub={i ? 'b' : 'a'} aria-pressed={d.subclassId === s.id} onClick={() => up({ subclassId: s.id, cards: [] })}>
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
            ))}
            {sub && (
              <div className="stack-10">
                <span className="s-label">Foundation</span>
                {sub.foundation.map((f) => <div key={f.id}><span className="s-feat-name" style={{ fontSize: 17 }}>{f.name}</span><Rich text={f.text} style={{ fontSize: 15 }} /></div>)}
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <div className="s-row soft">
              <span style={{ fontSize: 14, lineHeight: 1.35 }}><b>Mixed ancestry</b> · first feature from one, second from another</span>
              <button className={`s-check ${d.mixed ? 'on' : ''}`} aria-pressed={d.mixed} aria-label="Mixed ancestry" onClick={() => up({ mixed: !d.mixed, slot: 0, anc2: '' })} />
            </div>
            {d.mixed && (
              <div className="s-pills" style={{ justifyContent: 'flex-start' }}>
                {[0, 1].map((i) => (
                  <button key={i} className={`s-pill ${d.slot === i ? 'on' : ''}`} style={{ border: '2px solid var(--accent, var(--ink))' }} onClick={() => up({ slot: i as 0 | 1 })}>
                    {i === 0 ? 'First feature' : 'Second feature'} · {ancestries.find((a) => a.id === (i ? d.anc2 : d.anc1))?.name ?? '—'}
                  </button>
                ))}
              </div>
            )}
            <div className="grid-3">
              {ancestries.map((a) => {
                const sel = a.id === d.anc1 || (d.mixed && a.id === d.anc2);
                return (
                  <button key={a.id} className={`anc-tile s-press ${sel ? 'sel' : ''}`} aria-pressed={sel}
                    onClick={() => (d.mixed && d.slot === 1 ? up({ anc2: a.id }) : up({ anc1: a.id, slot: d.mixed ? 1 : 0 }))}>
                    <Ornament id={a.id} />
                    <span style={{ font: '700 14px/1 var(--head)' }}>{a.name}</span>
                  </button>
                );
              })}
            </div>
            {d.anc1 && (
              <div className="stack-10">
                {(() => {
                  const first = ancestries.find((a) => a.id === d.anc1)!;
                  const second = ancestries.find((a) => a.id === (d.mixed && d.anc2 ? d.anc2 : d.anc1))!;
                  return [first.features[0], second.features[1]].map((f) => (
                    <div key={f.id}><span className="s-feat-name" style={{ fontSize: 17 }}>{f.name}</span><Rich text={f.text} style={{ fontSize: 15 }} /></div>
                  ));
                })()}
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <div className="grid-3">
              {communities.map((c) => (
                <button key={c.id} className="com-tile s-press" aria-pressed={d.communityId === c.id} onClick={() => up({ communityId: c.id })}>
                  <span className={`fx fx-${c.id}`} style={{ display: 'block', padding: 8, borderRadius: 0 }}><span className="fx-in" style={{ display: 'block', height: 34, padding: 0 }} /></span>
                  <span className="name">{c.name}</span>
                </button>
              ))}
            </div>
            {d.communityId && (() => {
              const c = communities.find((x) => x.id === d.communityId)!;
              return (
                <div className="stack-10">
                  <span className="s-muted" style={{ fontSize: 14 }}>{c.name} are often {c.adjectives.join(', ')}.</span>
                  <div><span className="s-feat-name" style={{ fontSize: 17 }}>{c.feature.name}</span><Rich text={c.feature.text} style={{ fontSize: 15 }} /></div>
                </div>
              );
            })()}
          </>
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
                <span className="s-num" style={{ fontSize: 22 }}>+{2 + (d.anc1 === 'clank' || (d.mixed && d.anc1 === 'clank') ? (d.purposeful === i ? 1 : 0) : 0)}</span>
              </div>
            ))}
            {(() => {
              const anc = ancestryOf(d);
              const isClank = anc && hasAncestryFeature({ ancestry: anc } as Character, 'purposeful-design');
              if (!isClank) return null;
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
            <span className="s-muted hint">Ask your fellow players one of these for their character to answer, or make up your own.</span>
            {cls.connectionQuestions.map((q) => <span key={q} className="quote">“{q}”</span>)}
            <textarea className="s-field area" id="bg-con" rows={3} placeholder="Notes on your connections" aria-label="Connection notes" value={d.connections} onChange={(e) => up({ connections: e.target.value })} />
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

function weaponLine(w: Weapon) {
  return `${cap(w.trait)} ${RANGE_NAMES[w.range]} · ${w.burden === 2 ? 'Two-handed' : 'One-handed'}`;
}
function weaponStat(w: Weapon) {
  return `d${w.damage.die}${w.damage.bonus ? '+' + w.damage.bonus : ''} ${w.damage.type}`;
}

function GearStep({ d, up, hasSpellcast, useGuide }: { d: Draft; up: (p: Partial<Draft>) => void; hasSpellcast: boolean; useGuide: () => void }) {
  const [open, setOpen] = useState('');
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const guide = guides[d.classId];
  const prim = d.primary ? weaponById.get(d.primary) : undefined;
  const twoHanded = prim?.burden === 2;
  const rec = new Set([guide.primary.id, guide.secondary?.id, guide.armor.id].filter(Boolean) as string[]);

  const sortRec = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => Number(rec.has(b.id)) - Number(rec.has(a.id)));
  const groups: { key: string; title: string; items: (Weapon | Armor)[]; chosen: string; note?: string }[] = [
    { key: 'primary', title: 'Primary weapon', items: sortRec(weapons.filter((w) => w.tier === 1 && w.category === 'primary' && !w.group)), chosen: d.primary,
      note: d.classId === 'brawler' ? 'Brawler: with no active weapons you fight with Brawler’s Strike (I Am the Weapon), so a weapon is optional.' : undefined },
    { key: 'secondary', title: 'Secondary weapon', items: sortRec(weapons.filter((w) => w.tier === 1 && w.category === 'secondary')), chosen: d.secondary,
      note: twoHanded ? `${prim?.name} is two-handed, so you can’t also hold a secondary weapon.` : 'Optional. Only with a one-handed primary weapon.' },
    { key: 'armor', title: 'Armor', items: sortRec(armor.filter((a) => a.tier === 1)), chosen: d.armorId },
  ];

  return (
    <>
      <div className="rec-box">
        <div className="s-row">
          <span className="s-label">★ Suggested for {classById.get(d.classId)!.name}</span>
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
              const isOpen = open === x.id;
              const chosen = g.chosen === x.id;
              const vs = w ? versatileStats(w.feature) : null;
              return (
                <div key={x.id} className="gear-row" style={blocked ? { opacity: 0.45 } : undefined}>
                  <button className="s-row s-press" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : x.id)}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, textAlign: 'left' }}>
                      <span style={{ font: '700 17px/1.15 var(--head)' }}>{rec.has(x.id) ? '★ ' : ''}{x.name}</span>
                      <span className="s-muted" style={{ fontSize: 13 }}>{w ? weaponLine(w) : `Thresholds ${a!.thresholds.major}/${a!.thresholds.severe}`}{blocked ? ` · ${blocked}` : ''}</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                      <span className="s-num" style={{ fontSize: 16 }}>{w ? weaponStat(w) : `Score ${a!.score}`}</span>
                      {chosen && <span className="chosen">Chosen</span>}
                      <Icon d={ICONS.chevron} style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="stack-10" style={{ padding: '4px 0 14px' }}>
                      <div className="grid-2 kv">
                        {(w ? [['Trait', cap(w.trait)], ['Range', RANGE_NAMES[w.range]], ['Damage', weaponStat(w)], ['Burden', w.burden === 2 ? 'Two-handed' : 'One-handed']]
                          : [['Major', String(a!.thresholds.major)], ['Severe', String(a!.thresholds.severe)], ['Armor Score', String(a!.score)], ['Tier', String(a!.tier)]]).map(([k, v]) => (
                          <span key={k} style={{ display: 'flex', flexDirection: 'column' }}><span className="s-label s-muted" style={{ fontSize: 11 }}>{k}</span><span style={{ fontSize: 15 }}>{v}</span></span>
                        ))}
                      </div>
                      {x.feature && <span className="s-feat-text" style={{ fontSize: 15 }}><b>{x.feature.name}:</b> {x.feature.text}</span>}
                      {vs && <span className="s-muted" style={{ fontSize: 13 }}>Versatile: {cap(vs.trait)}, {RANGE_NAMES[vs.range]}, d{vs.damage.die}{vs.damage.bonus ? '+' + vs.damage.bonus : ''}</span>}
                      <button className={`s-mini ${chosen ? '' : 'solid'}`} style={{ alignSelf: 'flex-start' }} disabled={!!blocked && !chosen}
                        onClick={() => {
                          if (g.key === 'primary') up({ primary: chosen ? '' : x.id, secondary: !chosen && w!.burden === 2 ? '' : d.secondary });
                          if (g.key === 'secondary') up({ secondary: chosen ? '' : x.id });
                          if (g.key === 'armor') up({ armorId: chosen ? '' : x.id });
                        }}>
                        {chosen ? 'Remove' : 'Choose'}
                      </button>
                    </div>
                  )}
                </div>
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {(['minor-health-potion', 'minor-stamina-potion'] as const).map((p) => (
          <button key={p} className={`s-mini ${d.potion === p ? 'solid' : ''}`} onClick={() => up({ potion: p })}>
            {p === 'minor-health-potion' ? 'Minor Health Potion · 1d4 HP' : 'Minor Stamina Potion · 1d4 Stress'}
          </button>
        ))}
      </div>
      <span className="s-label" style={{ marginTop: 10 }}>Class item</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {guide.inventory.classItem.map((it) => (
          <button key={it} className={`s-mini ${d.classItem === it ? 'solid' : ''}`} style={{ textTransform: 'none', letterSpacing: 0 }} onClick={() => up({ classItem: it })}>{it}</button>
        ))}
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
      {pool.map((c) => {
        const sel = d.cards.includes(c.id);
        const isOpen = open === c.id;
        return (
          <div key={c.id} className={`card-pick ${sel ? 'sel' : ''}`}>
            <button className="s-row s-press" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : c.id)}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
                <span className="s-feat-name" style={{ fontSize: 18 }}>{c.name}</span>
                <span className="s-muted" style={{ fontSize: 13 }}>{cap(c.domain)} · {cap(c.type)}</span>
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
    ['Ancestry', d.mixed && d.anc2 ? `${ancestries.find((a) => a.id === d.anc1)?.name} / ${ancestries.find((a) => a.id === d.anc2)?.name}` : ancestries.find((a) => a.id === d.anc1)?.name ?? ''],
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
