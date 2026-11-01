import { useRef, useState } from 'react';
import { actionRoll, armedFor, armedText, clearArmed, showDice, toggleAdvantage, toggleExperience, usePlay } from '../app/play';
import { toast } from '../app/toast';
import { updateCharacter } from '../app/store';
import { go } from '../app/nav';
import { cardById, classById, communityById, rules, type TraitId } from '../data';
import {
  ancestryFeatures, availableForms, avoidDeath, beastformOf, blazeOfGlory, derive, dropOut, hasBeastform, multiclassSubclass,
  mustMakeDeathMove, riskItAll, setHitPoints, splitClear, STAGES, subclassOf, transform, transformProblem, TRAIT_IDS, wake,
  type Character, type TransformVia,
} from '../rules';
import { TRAIT_VERBS } from '../theme/tables';
import { FeatureCard } from '../ui/FeatureCard';
import { cap, DomainIcon, Icon, ICONS, Recall, Rich, signed, Title, Track } from '../ui/kit';

type Tab = 'class' | 'subclass' | 'heritage' | 'cards';
const TABS: Tab[] = ['class', 'subclass', 'heritage', 'cards'];

export function CharacterTab({ ch }: { ch: Character }) {
  const d = derive(ch);
  const armed = usePlay((s) => s.armed[ch.id]) ?? armedFor(ch.id);
  const set = (fn: (c: Character) => Character) => updateCharacter(ch.id, fn);
  const cls = classById.get(ch.classId)!;
  const hasArmed = armed.advantage !== 'none' || armed.experiences.length > 0 || armed.extras.length > 0 || !!armed.hopeDie || ch.death === 'blaze';
  const deathMove = mustMakeDeathMove(ch) || !!ch.death;
  const hopeFull = d.hopeSlots > 0 && ch.hope >= d.hopeSlots;

  const rollTrait = (t: TraitId) => actionRoll(ch.id, cap(t), [{ label: cap(t), value: d.traits[t] }], `2d12 ${signed(d.traits[t])}`, { trait: t });

  return (
    <main className="sheet-main">
      {/* Evasion · Armor · armor slots */}
      <section className="defense">
        <div className="s-emblem" style={{ width: 122 }} role="img" aria-label={`Evasion ${d.evasion}`}>
          <svg width="122" height="124" viewBox="0 0 122 124" aria-hidden="true">
            <path d="M2 44h16M0 58h12M2 72h16" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <path d="M68 6L116 58 68 112 20 58Z" style={{ fill: "var(--surface)" }} stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
            <path d="M68 16L106 58 68 102 30 58Z" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
          <span className="s-num" style={{ left: 14, top: 34 }}>{d.evasion}</span>
          <span className="s-bar" style={{ left: 14, right: -4 }}>Evasion</span>
        </div>
        <ArmorShield score={d.armorScore} />
        <div className="stack-4" style={{ alignItems: 'center' }}>
          <Track label="Armor slots" value={ch.armorMarked} max={d.armorScore} total={rules.caps.armorScore} columns={3} countdown
            onChange={(v) => set((c) => ({ ...c, armorMarked: v }))} />
          <span className="s-label s-muted" style={{ fontSize: 11 }}>{d.armorScore - ch.armorMarked} / {d.armorScore} left</span>
        </div>
      </section>

      {/* Traits */}
      <section className="stack-14">
        <Title>Traits</Title>
        {hasArmed && (
          <div className="s-row armed-bar">
            <span style={{ fontSize: 14, lineHeight: 1.35 }}><b>Next roll:</b> {armedText(ch.id)}</span>
            <button className="s-mini" onClick={() => clearArmed(ch.id)}>Clear</button>
          </div>
        )}
        <div className="traits">
          {TRAIT_IDS.map((t) => (
            <button key={t} className="s-trait s-press" onClick={() => rollTrait(t)} aria-label={`Roll ${t}: 2d12 ${signed(d.traits[t])}`}>
              <span className="tab">{t}</span>
              <span className="face" style={ch.markedTraits.includes(t) ? { boxShadow: 'inset 0 -4px 0 var(--accent)' } : undefined}>
                <span className="s-num">{signed(d.traits[t])}</span>
              </span>
              <span className="verbs">{TRAIT_VERBS[t].map((v) => <span key={v}>{v}</span>)}</span>
            </button>
          ))}
        </div>
        <AdvDis id={ch.id} />
      </section>

      {/* Health */}
      <section className="stack-18">
        <Title>Health</Title>
        {deathMove ? <DeathPanel ch={ch} /> : <>
        <div className="s-thr" role="img" aria-label={`Damage thresholds: Major ${d.thresholds.major}, Severe ${d.thresholds.severe}`}>
          <span className="box">Minor</span><span className="n">{d.thresholds.major}</span>
          <span className="box" style={{ paddingLeft: 6 }}>Major</span><span className="n">{d.thresholds.severe}</span>
          <span className="box" style={{ paddingLeft: 6 }}>Severe</span>
          <span className="cap">Mark 1 HP</span><span /><span className="cap">Mark 2 HP</span><span /><span className="cap">Mark 3 HP</span>
        </div>
        <div className="stack-4">
          <div className="s-row"><span className="s-label">HP</span><span className="s-num s-muted" style={{ fontSize: 16 }}>{d.hitPoints - ch.hp} / {d.hitPoints} left</span></div>
          <Track label="Hit Points" value={ch.hp} max={d.hitPoints} total={rules.caps.hitPointSlots} countdown onChange={(v) => set((c) => setHitPoints(c, v))} />
        </div>
        <div className="stack-4">
          <div className="s-row"><span className="s-label">Stress</span><span className="s-num s-muted" style={{ fontSize: 16 }}>{d.stressSlots - ch.stress} / {d.stressSlots} left</span></div>
          <Track label="Stress" value={ch.stress} max={d.stressSlots} total={rules.caps.stressSlots} countdown onChange={(v) => set((c) => ({ ...c, stress: v }))} />
        </div>
        </>}
      </section>

      {/* Experience + Hope */}
      <section className="stack-6">
        <Title style={{ marginBottom: 4 }}>Experience</Title>
        <span className="s-muted" style={{ fontSize: 13, marginBottom: 4 }}>Tap one to spend 1 Hope and add it to your next roll. Tap another to switch.</span>
        {d.experiences.map((x, i) => {
          const on = armed.experiences.includes(i);
          return (
            <button key={i} className={`s-row s-press exp ${on ? 's-armed' : ''}`} aria-pressed={on}
              disabled={!on && !armed.experiences.length && ch.hope < 1} onClick={() => toggleExperience(ch.id, i)}>
              <span>{x.name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="s-muted" style={{ fontSize: 13 }}>{on ? 'Armed · tap to refund' : armed.experiences.length ? 'Tap to switch' : ch.hope < 1 ? 'No Hope' : ''}</span>
                <span className="s-num" style={{ fontSize: 22 }}>+{x.value}</span>
              </span>
            </button>
          );
        })}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="s-label" style={{ fontSize: 18 }}>Hope</span>
          <Track label="Hope" value={ch.hope} max={d.hopeSlots} total={d.hopeSlots} size={28} onChange={(v) => set((c) => ({ ...c, hope: v }))} />
          <Scars ch={ch} />
        </div>
        {hopeFull && <p className="callout" role="status">Your Hope is full: spend it before your next roll with Hope, or that Hope is lost.</p>}
        <span className="s-muted" style={{ fontSize: 14, lineHeight: 1.4 }}>Spend 1 Hope to use an Experience or help an ally. Spend 3 Hope for a Tag Team Roll with an ally.</span>
        <div className="hope-feature">
          {cls.hopeFeature.id === 'evolution'
            ? <BeastformCard ch={ch} name={cls.hopeFeature.name} text={cls.hopeFeature.text} tag="Hope feature" via="evolution" />
            : <FeatureCard ch={ch} featureKey={`hope:${cls.id}`} name={cls.hopeFeature.name} text={cls.hopeFeature.text} tag="Hope feature" />}
        </div>
      </section>

      <FeaturesPanel ch={ch} />
    </main>
  );
}

export function AdvDis({ id, compact }: { id: string; compact?: boolean }) {
  const a = usePlay((s) => s.armed[id]) ?? armedFor(id);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {(['advantage', 'disadvantage'] as const).map((k) => (
        <button key={k} className={`s-mini ${a.advantage === k ? 'solid' : ''}`} style={{ minWidth: 60, minHeight: 44, fontSize: 15 }}
          aria-pressed={a.advantage === k} onClick={() => toggleAdvantage(id, k)}>
          {k === 'advantage' ? 'Adv' : 'Dis'}
        </button>
      ))}
      {!compact && <span className="s-muted" style={{ fontSize: 13, lineHeight: 1.3 }}>
        {a.advantage === 'none' ? 'Arm for your next roll only.' : `${a.advantage === 'advantage' ? '+1d6' : '−1d6'} on your next roll.`}
      </span>}
    </div>
  );
}

export function ArmorShield({ score, small }: { score: number; small?: boolean }) {
  const w = small ? 96 : 116, h = small ? 104 : 124;
  return (
    <div className="s-emblem" style={{ width: w, height: h }} role="img" aria-label={`Armor score ${score}`}>
      <svg width={w} height={h} viewBox="0 0 116 124" aria-hidden="true">
        <path d="M58 6L100 18Q106 60 96 86L58 118 20 86Q10 60 16 18Z" style={{ fill: "var(--surface)" }} stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M58 14L92 24Q96 60 88 82L58 108 28 82Q20 60 24 24Z" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
      <span className="s-num" style={small ? { top: 22, fontSize: 38 } : undefined}>{score}</span>
      <span className="s-bar" style={small ? { bottom: 16, height: 22, fontSize: 12 } : undefined}>Armor</span>
    </div>
  );
}

function FeaturesPanel({ ch }: { ch: Character }) {
  const [tab, setTab] = useState<Tab>('class');
  const start = useRef<{ x: number; y: number } | null>(null);
  const cls = classById.get(ch.classId)!;
  const sub = subclassOf(ch);
  const mcSub = multiclassSubclass(ch);
  const mcCls = ch.multiclass ? classById.get(ch.multiclass.classId) : undefined;
  const stageIdx = STAGES.indexOf(ch.subclassStage);
  const [a1, a2] = ancestryFeatures(ch);
  const com = communityById.get(ch.communityId)!;
  const idx = TABS.indexOf(tab);

  const onDown = (e: React.PointerEvent) => { start.current = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setTab(TABS[Math.max(0, Math.min(3, idx + (dx < 0 ? 1 : -1)))]);
    }
  };

  const ancestryName = 'id' in ch.ancestry ? undefined : 'Mixed ancestry';

  return (
    <section className="stack-16">
      <Title>Features</Title>
      <div className="s-pills" role="tablist" aria-label="Features">
        {TABS.map((t) => (
          <button key={t} role="tab" className={`s-pill ${tab === t ? 'on' : ''}`} aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === 'heritage' ? 'Heritage' : cap(t)}
          </button>
        ))}
      </div>
      <div className={`fx fx-${ch.communityId}`}>
        <div className="fx-in">
          <div className="features" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { start.current = null; }}>
            {tab === 'class' && (
              <>
                {cls.features.map((f) => f.id === 'beastform'
                  ? <BeastformCard key={f.id} ch={ch} name={f.name} text={f.text} via="beastform" />
                  : <FeatureCard key={f.id} ch={ch} featureKey={`class:${f.id}`} name={f.name} text={f.text} note={f.note} />)}
                {mcCls && (
                  <>
                    <span className="s-label panel-head">Multiclass · {mcCls.name}</span>
                    {mcCls.features.map((f) => f.id === 'beastform'
                      ? <BeastformCard key={f.id} ch={ch} name={f.name} text={f.text} via="beastform" />
                      : <FeatureCard key={f.id} ch={ch} featureKey={`mc:${f.id}`} name={f.name} text={f.text} note={f.note} />)}
                  </>
                )}
                <ClassExtras ch={ch} />
              </>
            )}
            {tab === 'subclass' && (
              <>
                <span className="s-label panel-head">{sub.name}{sub.spellcastTrait ? ` · Spellcast: ${cap(sub.spellcastTrait)}` : ''}</span>
                {STAGES.filter((_, si) => si <= stageIdx).flatMap((stage) => sub[stage].map((f) => (
                  <FeatureCard key={stage + f.id} ch={ch} featureKey={`sub:${f.id}`} name={f.name} text={f.text} tag={cap(stage)} />
                )))}
                {mcSub && (
                  <>
                    <span className="s-label panel-head">{mcSub.name} (multiclass)</span>
                    {mcSub.foundation.map((f) => (
                      <FeatureCard key={f.id} ch={ch} featureKey={`mcsub:${f.id}`} name={f.name} text={f.text} tag="Foundation" />
                    ))}
                  </>
                )}
              </>
            )}
            {tab === 'heritage' && (
              <>
                <span className="s-label panel-head">{ancestryName ?? cap(('id' in ch.ancestry && ch.ancestry.id) || '')}</span>
                <FeatureCard ch={ch} featureKey={`anc:${a1.id}`} name={a1.name} text={a1.text} />
                <FeatureCard ch={ch} featureKey={`anc:${a2.id}`} name={a2.name} text={a2.text} />
                <span className="s-label panel-head">{com.name}</span>
                <FeatureCard ch={ch} featureKey={`com:${com.feature.id}`} name={com.feature.name} text={com.feature.text} />
              </>
            )}
            {tab === 'cards' && <CardsTab ch={ch} />}
            <div className="dots" aria-hidden="true">
              {TABS.map((t) => <span key={t} className={tab === t ? 'on' : ''} />)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CardsTab({ ch }: { ch: Character }) {
  const loadout = ch.cards.loadout.map((id) => cardById.get(id)!).filter(Boolean);
  return (
    <>
      <div className="s-row">
        <span className="s-muted" style={{ fontSize: 15 }}>Loadout {loadout.length} / {rules.caps.loadout} · Vault {ch.cards.vault.length}</span>
        <button className="s-btn s-press" aria-label="Manage cards in the vault" style={{ minWidth: 48, padding: '0 12px' }} onClick={() => go({ name: 'vault', id: ch.id })}>
          <Icon d={ICONS.cog} size={20} />
        </button>
      </div>
      {loadout.length === 0 && <span className="s-muted">No cards in your loadout. Open the vault to move some in.</span>}
      {loadout.map((c) => (
        <FeatureCard key={c.id} ch={ch} featureKey={`card:${c.id}`} name={c.name} text={c.text}
          meta={`${cap(c.domain)} · Level ${c.level} ${cap(c.type)}`}
          aside={<span style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 'none' }}><DomainIcon domain={c.domain} /><Recall cost={c.recallCost} size={36} /></span>} />
      ))}
    </>
  );
}

function ClassExtras({ ch }: { ch: Character }) {
  const cls = classById.get(ch.classId)!;
  const ex = cls.extras;
  const d = derive(ch);
  const [open, setOpen] = useState(false);
  if (ex.beastforms) {
    const forms = ex.beastforms.forms.filter((f) => f.tier <= d.tier);
    return (
      <Expander title={`Beastforms · tier ${d.tier} or lower (${forms.length})`} open={open} onToggle={() => setOpen(!open)}>
        {forms.map((f) => (
          <FeatureCard key={f.id} ch={ch} featureKey={`beast:${f.id}`} name={f.name}
            meta={`Tier ${f.tier} · ${f.examples}`}
            text={[
              f.trait ? `**${cap(f.trait)} ${signed(f.traitBonus)}** · **Evasion ${signed(f.evasionBonus)}**` : '',
              f.attack ? `Attack: ${cap(f.attack.range.replace('-', ' '))} ${cap(f.attack.trait)} **${f.attack.damage} ${f.attack.type}**` : '',
              f.advantages.length ? `Gain advantage on: ${f.advantages.join(', ')}` : '',
              f.text,
              ...f.features.map((x) => `**${x.name}:** ${x.text}`),
            ].filter(Boolean).join('\n\n')} />
        ))}
      </Expander>
    );
  }
  if (ex.martialStances && ch.subclassId === 'martial-artist') {
    return (
      <Expander title="Martial stances" open={open} onToggle={() => setOpen(!open)}>
        {ex.martialStances.stances.filter((s) => s.tier <= d.tier).map((s) => (
          <FeatureCard key={s.id} ch={ch} featureKey={`stance:${s.id}`} name={s.name} text={s.text} meta={`Tier ${s.tier}`} />
        ))}
      </Expander>
    );
  }
  if (ex.companion && ch.subclassId === 'beastbound') {
    return (
      <Expander title="Ranger companion" open={open} onToggle={() => setOpen(!open)}>
        {[...ex.companion.steps, ...ex.companion.rules].map((s) => (
          <FeatureCard key={s.title} ch={ch} featureKey={`comp:${s.title}`} name={s.title || 'Companion'} text={s.text} />
        ))}
      </Expander>
    );
  }
  return null;
}

function Expander({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="stack-16">
      <button className="s-btn s-press" aria-expanded={open} onClick={onToggle} style={{ justifyContent: 'space-between' }}>
        <span>{title}</span>
        <Icon d={ICONS.chevron} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && children}
    </div>
  );
}

/** Avoid Death scars: crossed-out Hope slots. Tap one for what it means. */
function Scars({ ch }: { ch: Character }) {
  const [open, setOpen] = useState(false);
  const n = ch.scars ?? 0;
  if (!n) return null;
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <button key={i} className="scar-slot" aria-label="Scarred Hope slot: what this means" aria-expanded={open} onClick={() => setOpen(!open)}>
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" rx="3" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" /><path d="M5 23L23 5M9 5l3 6-4 3 6 9" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
        </button>
      ))}
      {open && (
        <div className="callout stack-6" style={{ flexBasis: '100%' }}>
          <span><b>Scar{n > 1 ? `s (${n})` : ''}.</b> Avoid Death crossed out {n > 1 ? 'these Hope slots' : 'this Hope slot'} for good. Work with your GM on its lasting narrative impact and how, if possible, it can be restored, perhaps through a quest.</span>
          <button className="s-mini" style={{ alignSelf: 'flex-start' }} onClick={() => { updateCharacter(ch.id, (c) => ({ ...c, scars: Math.max(0, (c.scars ?? 0) - 1) })); setOpen(false); }}>Restore a slot (GM approved)</button>
        </div>
      )}
    </>
  );
}

/** The death moves, shown in place of the health tracks once your last Hit Point is marked. */
function DeathPanel({ ch }: { ch: Character }) {
  const [split, setSplit] = useState<{ points: number; before: Character; toHp: number } | null>(null);
  const set = (c: Character) => updateCharacter(ch.id, () => c);
  const death = rules.death;
  const move = (id: string) => death.moves.find((m) => m.id === id)!;

  if (ch.death === 'unconscious') {
    return (
      <div className="death stack-10">
        <span className="s-label" style={{ fontSize: 18 }}>Unconscious</span>
        <span className="s-feat-text">You can’t move or act, and you can’t be targeted by an attack. You return to consciousness when an ally clears 1 or more of your marked Hit Points or when the party finishes a long rest.</span>
        <button className="s-btn solid s-press" onClick={() => set(wake(ch))}>An ally cleared a Hit Point</button>
      </div>
    );
  }
  if (ch.death === 'blaze') {
    return (
      <div className="death stack-10">
        <span className="s-label" style={{ fontSize: 18 }}>Blaze of Glory</span>
        <span className="s-feat-text">Take one final action: your next action roll automatically critically succeeds (with GM approval). Then you cross through the veil of death.</span>
        <button className="s-mini" style={{ alignSelf: 'flex-start' }} onClick={() => set({ ...ch, death: undefined })}>Choose another death move</button>
      </div>
    );
  }
  if (ch.death === 'dead') {
    return (
      <div className="death stack-10">
        <span className="s-label" style={{ fontSize: 18 }}>Beyond the veil</span>
        <span className="s-feat-text">{(ch.scars ?? 0) >= rules.caps.hope ? 'Your last Hope slot is crossed out: your character’s journey ends.' : 'Your character has crossed through the veil of death.'}</span>
        <button className="s-mini" style={{ alignSelf: 'flex-start' }} onClick={() => set({ ...ch, death: undefined })}>Undo (GM ruling)</button>
      </div>
    );
  }
  if (split) {
    const toStress = split.points - split.toHp;
    const apply = (toHp: number) => { setSplit({ ...split, toHp }); set(splitClear(split.before, split.points, toHp)); };
    return (
      <div className="death stack-10">
        <span className="s-label" style={{ fontSize: 18 }}>Risk It All · you stay on your feet</span>
        <span className="s-feat-text">Divide your Hope Die ({split.points}) between Hit Points and Stress.</span>
        <div className="s-row">
          <button className="s-mini" disabled={split.toHp <= 0} onClick={() => apply(split.toHp - 1)}>− HP</button>
          <span style={{ fontSize: 16 }}><b>{split.toHp}</b> HP · <b>{toStress}</b> Stress</span>
          <button className="s-mini" disabled={split.toHp >= split.points} onClick={() => apply(split.toHp + 1)}>+ HP</button>
        </div>
        <button className="s-btn solid s-press" onClick={() => setSplit(null)}>Done</button>
      </div>
    );
  }
  return (
    <div className="death stack-14">
      <span className="s-feat-text" style={{ fontWeight: 700 }}>{death.intro}</span>
      <div className="stack-6">
        <span className="s-feat-name">{move('blaze-of-glory').name}</span>
        <span className="s-feat-text">{move('blaze-of-glory').text}</span>
        <button className="s-btn s-press" onClick={() => { set(blazeOfGlory(ch)); toast('Your next action roll is a critical success.'); }}>Blaze of Glory</button>
      </div>
      <hr className="sep" />
      <div className="stack-6">
        <span className="s-feat-name">{move('avoid-death').name}</span>
        <span className="s-feat-text">{move('avoid-death').text}</span>
        <button className="s-btn s-press" onClick={() => {
          const r = avoidDeath(ch);
          set(r.character);
          showDice('Avoid Death', [r.hopeDie], ['Hope'], [
            r.journeyEnds ? 'You gain a scar on your last Hope slot: your journey ends.'
              : r.scarred ? `${r.hopeDie} is at or under your level (${ch.level}): you gain a scar and lose a Hope slot.`
              : `${r.hopeDie} is over your level (${ch.level}): no scar.`,
            'You drop unconscious.',
          ]);
        }}>Avoid Death · roll your Hope Die</button>
      </div>
      <hr className="sep" />
      <div className="stack-6">
        <span className="s-feat-name">{move('risk-it-all').name}</span>
        <span className="s-feat-text">{move('risk-it-all').text}</span>
        <button className="s-btn s-press" onClick={() => {
          const r = riskItAll(ch);
          set(r.character);
          showDice('Risk It All', [r.hope, r.fear], ['Hope', 'Fear'], [
            r.outcome === 'all' ? 'Matching dice: you stay up and clear all Hit Points and Stress.'
              : r.outcome === 'dead' ? 'The Fear Die is higher: you cross through the veil of death.'
              : `The Hope Die is higher: you stay on your feet and clear ${r.hope} Hit Points or Stress.`,
          ]);
          if (r.outcome === 'clear') {
            const { beastform: _, ...before } = ch;
            setSplit({ points: r.hope, before, toHp: Math.min(r.hope, ch.hp) });
          }
        }}>Risk It All · roll your Duality Dice</button>
      </div>
    </div>
  );
}

/** Beastform (class feature) or Evolution (Hope feature): pick a form, then transform. */
function BeastformCard({ ch, name, text, tag, via }: { ch: Character; name: string; text: string; tag?: string; via: 'beastform' | 'evolution' }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState('');
  const [trait, setTrait] = useState<TraitId | ''>('');
  const current = beastformOf(ch);
  const forms = availableForms(ch);
  const how: TransformVia | null = via === 'beastform' ? { via } : trait ? { via, trait } : null;
  const problem = form && how ? transformProblem(ch, form, how) : null;
  const stateLine = current && (
    <div className="beast-on">
      <span style={{ flex: 1, fontSize: 15 }}>
        <b>In Beastform: {current.name}</b>
        {current.trait ? ` · ${cap(current.trait)} ${signed(current.traitBonus)}` : ''} · Evasion {signed(current.evasionBonus)}
        {ch.beastform?.evolution ? ` · ${cap(ch.beastform.evolution)} +1 (Evolution)` : ''}
      </span>
      <button className="s-mini" aria-label="Drop out of Beastform" onClick={() => updateCharacter(ch.id, dropOut)}>Drop out</button>
    </div>
  );
  return (
    <article className="feat">
      <div className="s-row" style={{ alignItems: 'flex-start' }}>
        <span className="s-feat-name">{name}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {tag && <span className="s-label s-muted" style={{ fontSize: 12 }}>{tag}</span>}
          {via === 'beastform' && (
            <button className="s-icon s-press" style={{ width: 44, height: 44 }} aria-label="Choose a Beastform" aria-expanded={open} onClick={() => setOpen(!open)}>
              <Icon d={ICONS.cog} size={20} />
            </button>
          )}
        </span>
      </div>
      <Rich text={text} />
      {via === 'beastform' && stateLine}
      {via === 'evolution' && !open && (
        <button className="s-mini solid" style={{ alignSelf: 'flex-start' }} disabled={ch.hope < 3 || !hasBeastform(ch)} onClick={() => setOpen(true)}>Use · 3 Hope</button>
      )}
      {open && (
        <div className="stack-10 beast-pick">
          <span className="s-label s-muted" style={{ fontSize: 12 }}>{via === 'evolution' ? 'Evolution: no Stress. Choose a form and a trait to raise by +1.' : 'Mark a Stress to transform. Forms of tier ' + derive(ch).tier + ' or lower.'}</span>
          {forms.map((f) => (
            <button key={f.id} className={`beast-opt s-press ${form === f.id ? 'sel' : ''}`} aria-pressed={form === f.id} onClick={() => setForm(f.id)}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
                <b>{f.name}</b>
                <span className="s-muted" style={{ fontSize: 13 }}>Tier {f.tier} · {f.examples}</span>
                <span style={{ fontSize: 13 }}>
                  {f.trait ? `${cap(f.trait)} ${signed(f.traitBonus)} · ` : ''}Evasion {signed(f.evasionBonus)}
                  {f.attack ? ` · ${cap(f.attack.trait)} ${f.attack.damage} ${f.attack.type}` : ''}
                </span>
              </span>
            </button>
          ))}
          {via === 'evolution' && (
            <label className="stack-4">
              <span className="s-label s-muted" style={{ fontSize: 12 }}>Trait to raise by +1</span>
              <select className="s-field" value={trait} onChange={(e) => setTrait(e.target.value as TraitId)}>
                <option value="">Choose a trait</option>
                {TRAIT_IDS.map((t) => <option key={t} value={t}>{cap(t)}</option>)}
              </select>
            </label>
          )}
          {problem && <span className="s-muted" style={{ fontSize: 13 }}>{problem}</span>}
          <span style={{ display: 'flex', gap: 6 }}>
            <button className="s-mini" onClick={() => { setOpen(false); setForm(''); setTrait(''); }}>Cancel</button>
            <button className="s-mini solid" disabled={!form || !how || !!problem}
              onClick={() => {
                updateCharacter(ch.id, (c) => transform(dropOut(c), form, how!));
                toast(`Transformed: ${forms.find((f) => f.id === form)?.name}.`);
                setOpen(false); setForm(''); setTrait('');
              }}>
              {via === 'evolution' ? 'Confirm · 3 Hope' : 'Transform · mark a Stress'}
            </button>
          </span>
        </div>
      )}
    </article>
  );
}
