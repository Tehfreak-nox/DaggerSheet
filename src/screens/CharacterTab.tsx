import { useRef, useState } from 'react';
import { actionRoll, armedFor, armedText, clearArmed, toggleAdvantage, toggleExperience, usePlay } from '../app/play';
import { updateCharacter } from '../app/store';
import { go } from '../app/nav';
import { cardById, classById, communityById, rules, type TraitId } from '../data';
import {
  ancestryFeatures, derive, multiclassSubclass, STAGES, subclassOf, TRAIT_IDS, type Character,
} from '../rules';
import { TRAIT_VERBS } from '../theme/tables';
import { FeatureCard } from '../ui/FeatureCard';
import { cap, DomainIcon, Icon, ICONS, Recall, signed, Title, Track } from '../ui/kit';

type Tab = 'class' | 'subclass' | 'heritage' | 'cards';
const TABS: Tab[] = ['class', 'subclass', 'heritage', 'cards'];

export function CharacterTab({ ch }: { ch: Character }) {
  const d = derive(ch);
  const armed = usePlay((s) => s.armed[ch.id]) ?? armedFor(ch.id);
  const set = (fn: (c: Character) => Character) => updateCharacter(ch.id, fn);
  const cls = classById.get(ch.classId)!;
  const hasArmed = armed.advantage !== 'none' || armed.experiences.length > 0 || armed.extras.length > 0;

  const rollTrait = (t: TraitId) => actionRoll(ch.id, cap(t), [{ label: cap(t), value: d.traits[t] }], `2d12 ${signed(d.traits[t])}`);

  return (
    <main className="sheet-main">
      {/* Evasion · Armor · armor slots */}
      <section className="defense">
        <div className="s-emblem" style={{ width: 122 }} role="img" aria-label={`Evasion ${d.evasion}`}>
          <svg width="122" height="124" viewBox="0 0 122 124" aria-hidden="true">
            <path d="M2 44h16M0 58h12M2 72h16" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <path d="M68 6L116 58 68 112 20 58Z" fill="#FFFFFF" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
            <path d="M68 16L106 58 68 102 30 58Z" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
          <span className="s-num" style={{ left: 14, top: 34 }}>{d.evasion}</span>
          <span className="s-bar" style={{ left: 14, right: -4 }}>Evasion</span>
        </div>
        <ArmorShield score={d.armorScore} />
        <Track label="Armor slots" value={ch.armorMarked} max={d.armorScore} total={rules.caps.armorScore} columns={3}
          onChange={(v) => set((c) => ({ ...c, armorMarked: v }))} />
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
        <div className="s-thr" role="img" aria-label={`Damage thresholds: Major ${d.thresholds.major}, Severe ${d.thresholds.severe}`}>
          <span className="box">Minor</span><span className="n">{d.thresholds.major}</span>
          <span className="box" style={{ paddingLeft: 6 }}>Major</span><span className="n">{d.thresholds.severe}</span>
          <span className="box" style={{ paddingLeft: 6 }}>Severe</span>
          <span className="cap">Mark 1 HP</span><span /><span className="cap">Mark 2 HP</span><span /><span className="cap">Mark 3 HP</span>
        </div>
        <div className="stack-4">
          <div className="s-row"><span className="s-label">HP</span><span className="s-num s-muted" style={{ fontSize: 16 }}>{ch.hp} / {d.hitPoints}</span></div>
          <Track label="Hit Points" value={ch.hp} max={d.hitPoints} total={rules.caps.hitPointSlots} onChange={(v) => set((c) => ({ ...c, hp: v }))} />
        </div>
        <div className="stack-4">
          <div className="s-row"><span className="s-label">Stress</span><span className="s-num s-muted" style={{ fontSize: 16 }}>{ch.stress} / {d.stressSlots}</span></div>
          <Track label="Stress" value={ch.stress} max={d.stressSlots} total={rules.caps.stressSlots} onChange={(v) => set((c) => ({ ...c, stress: v }))} />
        </div>
        {ch.hp >= d.hitPoints && <p className="callout">You’ve marked your last Hit Point: make a death move (Blaze of Glory, Avoid Death or Risk It All).</p>}
      </section>

      {/* Experience + Hope */}
      <section className="stack-6">
        <Title style={{ marginBottom: 4 }}>Experience</Title>
        <span className="s-muted" style={{ fontSize: 13, marginBottom: 4 }}>Tap to spend 1 Hope and add it to your next roll</span>
        {d.experiences.map((x, i) => {
          const on = armed.experiences.includes(i);
          return (
            <button key={i} className={`s-row s-press exp ${on ? 's-armed' : ''}`} aria-pressed={on}
              disabled={!on && ch.hope < 1} onClick={() => toggleExperience(ch.id, i)}>
              <span>{x.name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="s-muted" style={{ fontSize: 13 }}>{on ? 'Armed · tap to refund' : ch.hope < 1 ? 'No Hope' : ''}</span>
                <span className="s-num" style={{ fontSize: 22 }}>+{x.value}</span>
              </span>
            </button>
          );
        })}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="s-label" style={{ fontSize: 18 }}>Hope</span>
          <Track label="Hope" value={ch.hope} max={d.hopeSlots} total={d.hopeSlots} size={28} onChange={(v) => set((c) => ({ ...c, hope: v }))} />
        </div>
        <span className="s-muted" style={{ fontSize: 14, lineHeight: 1.4 }}>Spend 1 Hope to use an Experience or help an ally. Spend 3 Hope for a Tag Team Roll with an ally.</span>
        <div className="hope-feature">
          <FeatureCard ch={ch} featureKey={`hope:${cls.id}`} name={cls.hopeFeature.name} text={cls.hopeFeature.text} tag="Hope feature" />
        </div>
      </section>

      <FeaturesPanel ch={ch} />
    </main>
  );
}

export function AdvDis({ id }: { id: string }) {
  const a = usePlay((s) => s.armed[id]) ?? armedFor(id);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {(['advantage', 'disadvantage'] as const).map((k) => (
        <button key={k} className={`s-mini ${a.advantage === k ? 'solid' : ''}`} style={{ minWidth: 60, minHeight: 44, fontSize: 15 }}
          aria-pressed={a.advantage === k} onClick={() => toggleAdvantage(id, k)}>
          {k === 'advantage' ? 'Adv' : 'Dis'}
        </button>
      ))}
      <span className="s-muted" style={{ fontSize: 13, lineHeight: 1.3 }}>
        {a.advantage === 'none' ? 'Arm for your next roll only.' : `${a.advantage === 'advantage' ? '+1d6' : '−1d6'} on your next roll.`}
      </span>
    </div>
  );
}

export function ArmorShield({ score, small }: { score: number; small?: boolean }) {
  const w = small ? 96 : 116, h = small ? 104 : 124;
  return (
    <div className="s-emblem" style={{ width: w, height: h }} role="img" aria-label={`Armor score ${score}`}>
      <svg width={w} height={h} viewBox="0 0 116 124" aria-hidden="true">
        <path d="M58 6L100 18Q106 60 96 86L58 118 20 86Q10 60 16 18Z" fill="#FFFFFF" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
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
                {cls.features.map((f) => (
                  <FeatureCard key={f.id} ch={ch} featureKey={`class:${f.id}`} name={f.name} text={f.text} note={f.note} />
                ))}
                {mcCls && (
                  <>
                    <span className="s-label panel-head">Multiclass · {mcCls.name}</span>
                    {mcCls.features.map((f) => (
                      <FeatureCard key={f.id} ch={ch} featureKey={`mc:${f.id}`} name={f.name} text={f.text} note={f.note} />
                    ))}
                  </>
                )}
                <ClassExtras ch={ch} />
              </>
            )}
            {tab === 'subclass' && (
              <>
                <span className="s-label panel-head">{sub.name}{sub.spellcastTrait ? ` · Spellcast: ${cap(sub.spellcastTrait)}` : ''}</span>
                {STAGES.flatMap((stage, si) => sub[stage].map((f) => (
                  <FeatureCard key={stage + f.id} ch={ch} featureKey={`sub:${f.id}`} name={f.name} text={f.text}
                    tag={si > stageIdx ? `${cap(stage)} · locked` : cap(stage)} ghost={si > stageIdx} />
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
