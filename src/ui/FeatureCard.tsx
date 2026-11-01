import { useState, type ReactNode } from 'react';
import { attackNow } from '../app/attack';
import {
  actionRoll, armAmount, armedFor, canPay, damage, dice, dieKey, pay, toggleArm, toggleHopeDie, usePlay,
} from '../app/play';
import { updateCharacter } from '../app/store';
import { toast } from '../app/toast';
import type { TraitId } from '../data';
import {
  ACTIVE, controlsFor, costLabel, derive, inEffect, isActive, sectionsOf, setActive,
  type Character, type Control, type Cost, type Count, type DamageControl, type DiceControl, type RollControl, type TokenSource,
} from '../rules';
import { Rich } from './kit';

/** A feature or domain card with tap controls derived from its text (see rules/mechanics.ts). */
export function FeatureCard({
  ch, featureKey, name, text, meta, aside, note, ghost, tag, extra, skip = [],
}: {
  ch: Character;
  /** Stable key for uses/tokens, e.g. "class:rally" or "card:arcana-rune-ward". */
  featureKey: string;
  name: string;
  text: string;
  meta?: string;
  aside?: ReactNode;
  note?: string;
  ghost?: boolean;
  tag?: string;
  extra?: ReactNode;
  /** Control kinds handled elsewhere. */
  skip?: Control['kind'][];
}) {
  const sections = sectionsOf(text);
  return (
    <article className={`feat ${ghost ? 's-ghost' : ''}`}>
      <div className="s-row" style={{ alignItems: 'flex-start' }}>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span className="s-feat-name">{name}</span>
          {meta && <span className="s-muted" style={{ fontSize: 13 }}>{meta}</span>}
        </span>
        {tag && <span className="s-label s-muted" style={{ fontSize: 12, textAlign: 'right' }}>{tag}</span>}
        {aside}
      </div>
      {sections.length === 1 ? (
        <>
          <Rich text={text} />
          {/* A counting die explains itself; the book's tip on how it counts isn't needed. */}
          {note && !controlsFor(text).some((c) => c.kind === 'dieCounter') && <span className="s-muted" style={{ fontSize: 14, lineHeight: 1.4 }}>{note}</span>}
          {!ghost && <Controls ch={ch} featureKey={featureKey} name={name} text={text} skip={skip} />}
        </>
      ) : sections.map((s, i) => (
        <div key={i} className="feat-section">
          {s.title && <span className="s-feat-name" style={{ fontSize: 17 }}>{s.title}</span>}
          <Rich text={s.text} />
          {!ghost && <Controls ch={ch} featureKey={s.title ? `${featureKey}:${s.title}` : featureKey} name={s.title ?? name} text={s.text} skip={skip} />}
        </div>
      ))}
      {extra}
    </article>
  );
}

/** Later features that change an earlier one's dice (Fueled by Fear, Epic Poetry). */
function upgraded(ch: Character, featureKey: string, c: Control): Control {
  const has = (id: string) => inEffect(ch).some((e) => e.key === `sub:${id}`);
  if (featureKey === 'sub:face-your-fear' && c.kind === 'arm' && 'damageDice' in c.effect) {
    const count = has('have-no-fear') ? 3 : has('fueled-by-fear') ? 2 : 1;
    return { ...c, effect: { damageDice: { count, sides: 10 } }, label: `+${count}d10 damage` };
  }
  if (featureKey === 'class:rally' && c.kind === 'dice' && has('epic-poetry')) return { ...c, sides: 10, upgrade: undefined, label: 'Roll Rally Die' };
  return c;
}

function Controls({ ch, featureKey, name, text, skip }: { ch: Character; featureKey: string; name: string; text: string; skip: Control['kind'][] }) {
  const controls = controlsFor(text).filter((c) => !skip.includes(c.kind)).map((c) => upgraded(ch, featureKey, c));
  const uses = controls.filter((c): c is Extract<Control, { kind: 'uses' }> => c.kind === 'uses');
  const hopeDie = controls.find((c): c is Extract<Control, { kind: 'hopeDie' }> => c.kind === 'hopeDie');
  const tokens = controls.find((c): c is Extract<Control, { kind: 'tokens' }> => c.kind === 'tokens');
  // A lasting effect: its first cost switches it on.
  const activeDef = ACTIVE[featureKey];
  const activator = activeDef ? controls.find((c) => c.kind === 'hope' || c.kind === 'stress' || c.kind === 'pay') : undefined;
  const counter = controls.find((c): c is Extract<Control, { kind: 'dieCounter' }> => c.kind === 'dieCounter');
  const actions = controls.filter((c) => c.kind !== 'uses' && c.kind !== 'tokens' && c.kind !== 'dieCounter' && c !== activator
    && !(c.kind === 'hopeDie' && uses.length));
  const tokenKey = `tokens:${featureKey}`;
  return (
    <>
      {activeDef && <ActiveToggle ch={ch} k={featureKey} note={activeDef.note} cost={activator ? costOf(activator) : undefined}
        use={activator && 'once' in activator && activator.once ? `${activator.once}:${featureKey}` : undefined} />}
      {uses.map((u, i) => <UseBoxes key={u.label} ch={ch} k={`${u.scope}:${featureKey}`} max={u.max} label={u.label} arm={i === 0 && hopeDie ? { sides: hopeDie.sides, source: name } : undefined} />)}
      {tokens && <Tokens ch={ch} k={tokenKey} source={tokens.source} label={tokens.label} />}
      {counter && <DieCounter ch={ch} c={counter} name={name} featureKey={featureKey}
        use={uses[0] && !activator ? { key: `${uses[0].scope}:${featureKey}`, max: uses[0].max } : undefined} />}
      {actions.length > 0 && (
        <span className="ctl-row">
          {actions.map((c, i) => <ControlButton key={`${c.kind}-${i}`} ch={ch} c={c} name={name} featureKey={featureKey} tokenKey={tokenKey}
            use={'once' in c && c.once ? { key: `${c.once}:${featureKey}`, max: uses.find((u) => u.scope === c.once)?.max ?? 1 } : undefined} />)}
        </span>
      )}
    </>
  );
}

function costOf(c: Control): Cost | undefined {
  if (c.kind === 'hope') return { hope: c.n };
  if (c.kind === 'stress') return { stress: c.n };
  if (c.kind === 'pay') return c.cost;
  return undefined;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Resolve a dice count that depends on your stats. */
function countFor(ch: Character, n: Count): number {
  const d = derive(ch);
  if (typeof n === 'number') return n;
  if (n === 'proficiency') return d.proficiency;
  if (n === 'spellcast') return Math.max(0, d.spellcast ?? 0);
  return Math.max(0, d.traits[n]);
}

function rollNow(ch: Character, c: RollControl, name: string) {
  const d = derive(ch);
  const spell = c.trait === 'spellcast';
  const trait: TraitId | undefined = spell ? d.spellcastTraits.slice().sort((a, b) => d.traits[b] - d.traits[a])[0] : (c.trait as TraitId);
  if (!trait) { toast('You have no Spellcast trait.'); return; }
  const mods = [{ label: cap(trait), value: d.traits[trait] }, ...(spell && d.spellcastBonus ? [{ label: 'Spellcast bonus', value: d.spellcastBonus }] : [])];
  actionRoll(ch.id, spell ? `Spellcast · ${cap(trait)}` : `${cap(trait)} Roll`, mods, c.difficulty ? `${name} · Difficulty ${c.difficulty}` : name, { trait, reaction: c.reaction });
}

function rollLabel(ch: Character, c: RollControl): string {
  if (c.trait !== 'spellcast') return `${c.reaction ? 'Reaction · ' : ''}${c.label}`;
  const d = derive(ch);
  const t = d.spellcastTraits.slice().sort((a, b) => d.traits[b] - d.traits[a])[0];
  return `${c.reaction ? 'Reaction · ' : ''}Spellcast · ${t ? cap(t) : 'none'}${c.difficulty ? ` (${c.difficulty})` : ''}`;
}

function diceNow(ch: Character, c: DiceControl | DamageControl, name: string, sub?: string) {
  const count = countFor(ch, c.count);
  const sides = c.kind === 'dice' && c.upgrade && ch.level >= c.upgrade.level ? c.upgrade.sides : c.sides;
  if (count < 1) { toast('That rolls no dice right now.'); return; }
  const text = `${count}d${sides}${c.bonus ? `+${c.bonus}` : ''}`;
  if (c.kind === 'damage') damage(name, { dice: [{ count, sides }], bonus: c.bonus }, `${text}${c.type ? ` ${c.type}` : ''}${sub ? ` · ${sub}` : ''}`, [], { charId: ch.id, magic: c.type === 'magic', attack: true });
  else dice(name, count, sides, c.bonus, sub);
}

function diceLabel(ch: Character, c: DiceControl | DamageControl): string {
  const count = countFor(ch, c.count);
  const sides = c.kind === 'dice' && c.upgrade && ch.level >= c.upgrade.level ? c.upgrade.sides : c.sides;
  const dice = `${count}d${sides}${c.bonus ? `+${c.bonus}` : ''}`;
  if (c.kind === 'damage') {
    const named = c.label.includes(' · ') ? `${c.label.split(' · ')[0]} · ` : '';
    return `${named}Damage ${dice}`;
  }
  return c.upgrade || /Die$/.test(c.label) ? `${c.label} · d${sides}` : `Roll ${dice}`;
}

/** A use box ticked when the control is used ("Once per rest, spend 3 Hope …"). */
interface UseLink { key: string; max: number }

function ControlButton({ ch, c, name, featureKey, tokenKey, use }: { ch: Character; c: Control; name: string; featureKey: string; tokenKey: string; use?: UseLink }) {
  const spent = !!use && (ch.uses[use.key] ?? 0) >= use.max;
  const done = use ? () => updateCharacter(ch.id, (x) => ({ ...x, uses: { ...x.uses, [use.key]: (x.uses[use.key] ?? 0) + 1 } })) : undefined;
  switch (c.kind) {
    case 'hope':
    case 'stress':
      return <CostButton ch={ch} cost={costOf(c)!} label={c.label} spent={spent} done={done} />;
    case 'roll':
      return <button className="s-mini solid" onClick={() => rollNow(ch, c, name)}>{rollLabel(ch, c)}</button>;
    case 'attack':
      return <button className="s-mini solid" onClick={() => { if (!attackNow(ch.id, c.primary)) toast('Equip a weapon to attack.'); }}>{c.primary ? 'Attack · primary weapon' : 'Attack'}</button>;
    case 'dice':
    case 'damage':
      return <button className="s-mini" onClick={() => diceNow(ch, c, name)}>{diceLabel(ch, c)}</button>;
    case 'pay':
      return <PayButton ch={ch} c={c} name={name} spent={spent} done={done} />;
    case 'arm':
      return <ArmButton ch={ch} c={c} k={`${featureKey}:${c.label}`} spent={spent} done={done} />;
    case 'scaled':
      return <Scaled ch={ch} c={c} name={name} featureKey={featureKey} tokenKey={tokenKey} spent={spent} done={done} />;
    case 'choice':
      return <Choice ch={ch} c={c} k={`${featureKey}:choice`} name={name} />;
    case 'hopeDie':
      return <HopeDieToggle ch={ch} sides={c.sides} name={name} />;
    default:
      return null;
  }
}

/** Spend Hope or mark Stress; asks first for 2 or more Hope. */
function CostButton({ ch, cost, label, spent, done }: { ch: Character; cost: Cost; label: string; spent?: boolean; done?: () => void }) {
  const [asking, setAsking] = useState(false);
  const ok = canPay(ch, cost) && !spent;
  const go = () => { if (pay(ch.id, cost)) done?.(); };
  if (asking) {
    return (
      <span className="s-row confirm">
        <span style={{ fontSize: 14 }}>{label}?</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button className="s-mini" onClick={() => setAsking(false)}>Cancel</button>
          <button className="s-mini solid" onClick={() => { go(); setAsking(false); }}>Apply</button>
        </span>
      </span>
    );
  }
  return (
    <button className={`s-mini ${'hope' in cost ? 'solid' : ''}`} disabled={!ok}
      onClick={() => ('hope' in cost && cost.hope >= 2 ? setAsking(true) : go())}>{spent ? `${label} · used` : label}</button>
  );
}

/** Pay the cost and roll what it pays for, in one tap. */
function PayButton({ ch, c, name, spent, done }: { ch: Character; c: Extract<Control, { kind: 'pay' }>; name: string; spent?: boolean; done?: () => void }) {
  const [asking, setAsking] = useState(false);
  const t = c.then;
  const what = t.kind === 'roll' ? rollLabel(ch, t) : t.kind === 'attack' ? 'Attack' : diceLabel(ch, t).replace(/^Roll /, '');
  const label = `${costLabel(c.cost)} · ${what}`;
  const go = () => {
    setAsking(false);
    if (!pay(ch.id, c.cost)) return;
    done?.();
    if (t.kind === 'roll') rollNow({ ...ch, ...('hope' in c.cost ? { hope: ch.hope - c.cost.hope } : { stress: ch.stress + c.cost.stress }) }, t, name);
    else if (t.kind === 'attack') { if (!attackNow(ch.id, t.primary)) toast('Equip a weapon to attack.'); }
    else diceNow(ch, t, name, `${costLabel(c.cost)} spent`);
  };
  if (asking) {
    return (
      <span className="s-row confirm">
        <span style={{ fontSize: 14 }}>{label}?</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button className="s-mini" onClick={() => setAsking(false)}>Cancel</button>
          <button className="s-mini solid" onClick={go}>Go</button>
        </span>
      </span>
    );
  }
  return (
    <button className="s-mini solid" disabled={!canPay(ch, c.cost) || spent} onClick={() => ('hope' in c.cost && c.cost.hope >= 2 ? setAsking(true) : go())}>{spent ? `${label} · used` : label}</button>
  );
}

/** Armed for the next roll or damage roll; tap again to disarm (and refund). */
function ArmButton({ ch, c, k, spent, done }: { ch: Character; c: Extract<Control, { kind: 'arm' }>; k: string; spent?: boolean; done?: () => void }) {
  const armed = usePlay((s) => s.armed[ch.id]) ?? armedFor(ch.id);
  const have = armed.arms.find((x) => x.key === k);
  const more = have && c.max && have.count < c.max;
  return (
    <button className={`s-mini ${have ? 'solid' : ''}`} aria-pressed={!!have} disabled={!have && (!canPay(ch, c.cost) || spent)}
      onClick={() => {
        toggleArm(ch.id, { key: k, label: c.label, effect: c.effect, cost: c.cost, max: c.max, persist: c.persist });
        if (!have) done?.();
        else if (c.once) updateCharacter(ch.id, (x) => ({ ...x, uses: { ...x.uses, [`${c.once}:${k.split(':').slice(0, -1).join(':')}`]: 0 } }));
      }}>
      {have ? `${c.label.split(' · ')[0]}${have.count > 1 ? ` ×${have.count}` : ''} · ${more ? 'tap to add' : c.persist ? 'on' : 'armed'}` : c.label}
    </button>
  );
}

/** "Spend any number of …": choose an amount, then pay and roll. */
function Scaled({ ch, c, name, featureKey, tokenKey, spent, done }: { ch: Character; c: Extract<Control, { kind: 'scaled' }>; name: string; featureKey: string; tokenKey: string; spent?: boolean; done?: () => void }) {
  const d = derive(ch);
  const tokens = ch.uses[tokenKey] ?? 0;
  const cap = c.unit === 'hope' ? ch.hope : c.unit === 'stress' ? d.stressSlots - ch.stress : c.unit === 'tokens' ? tokens : 20;
  const max = Math.min(cap, c.max ?? 99);
  const [n, setN] = useState(c.min);
  const amount = Math.min(Math.max(n, c.min), Math.max(max, c.min));
  const unitText = c.unit === 'hope' ? 'Hope' : c.unit === 'stress' ? 'Stress' : c.unit === 'tokens' ? (amount === 1 ? 'token' : 'tokens') : '';
  const go = () => {
    if (max < amount) return;
    if (c.unit === 'hope' && !pay(ch.id, { hope: amount })) return;
    if (c.unit === 'stress' && !pay(ch.id, { stress: amount })) return;
    if (c.unit === 'tokens') updateCharacter(ch.id, (x) => ({ ...x, uses: { ...x.uses, [tokenKey]: Math.max(0, (x.uses[tokenKey] ?? 0) - amount) } }));
    done?.();
    const spent = c.unit === 'count' ? '' : `${amount} ${unitText} spent`;
    if (c.per?.toDamageRoll) armAmount(ch.id, `${featureKey}:scaled`, `+${amount}d${c.per.sides} damage (${name})`, { damage: { dice: { count: amount, sides: c.per.sides } } });
    else if (c.flat && c.toRoll) armAmount(ch.id, `${featureKey}:scaled`, `+${amount * c.flat} to the roll (${name})`, { roll: { value: amount * c.flat } });
    else if (c.flat) armAmount(ch.id, `${featureKey}:scaled`, `+${amount * c.flat} damage (${name})`, { damage: { bonus: amount * c.flat } });
    else if (c.per?.damage) damage(name, { dice: [{ count: amount, sides: c.per.sides }], bonus: c.per.bonus * amount }, `${amount}d${c.per.sides}${c.per.bonus ? `+${c.per.bonus * amount}` : ''}${c.per.type ? ` ${c.per.type}` : ''} · ${spent}`, [], { charId: ch.id, magic: c.per.type === 'magic', attack: true });
    else if (c.per) dice(name, amount, c.per.sides, 0, spent);
    else toast(`${name}: ${spent}.`);
    setN(c.min);
  };
  const result = c.per?.toDamageRoll ? `+${amount}d${c.per.sides} to damage` : c.flat ? `+${amount * c.flat}${c.toRoll ? ' to the roll' : ' damage'}` : c.per ? `${amount}d${c.per.sides}${c.per.bonus ? `+${c.per.bonus * amount}` : ''}` : '';
  return (
    <span className="stepper" role="group" aria-label={c.label}>
      <button className="s-mini" aria-label="Fewer" disabled={amount <= c.min} onClick={() => setN(amount - 1)}>−</button>
      <span className="s-num" style={{ fontSize: 18, minWidth: 22, textAlign: 'center' }}>{amount}</span>
      <button className="s-mini" aria-label="More" disabled={amount >= max} onClick={() => setN(amount + 1)}>+</button>
      <button className="s-mini solid" disabled={max < amount || spent} onClick={go}>
        {c.unit === 'count' ? `Roll ${amount}d${c.per?.sides}` : `${c.unit === 'tokens' ? 'Spend' : c.unit === 'hope' ? 'Spend' : 'Mark'} ${amount} ${unitText}${result ? ` · ${result}` : ''}`}
      </button>
    </span>
  );
}

/** Choose one bonus for the next roll (Teleport). */
function Choice({ ch, c, k, name }: { ch: Character; c: Extract<Control, { kind: 'choice' }>; k: string; name: string }) {
  const armed = usePlay((s) => s.armed[ch.id]) ?? armedFor(ch.id);
  const on = armed.arms.find((x) => x.key === k);
  return (
    <span className="ctl-row">
      {c.options.map((o) => {
        const label = `${o.label} · ${o.value >= 0 ? '+' : '−'}${Math.abs(o.value)}`;
        const sel = on?.label === `${name}: ${label}`;
        return (
          <button key={o.label} className={`s-mini ${sel ? 'solid' : ''}`} aria-pressed={sel} style={{ textTransform: 'none', letterSpacing: 0 }}
            onClick={() => armAmount(ch.id, k, `${name}: ${label}`, { roll: { value: o.value } })}>{label}</button>
        );
      })}
    </span>
  );
}

/**
 * A die kept on the sheet that counts up (Unstoppable): start it at 1, tap + to
 * count up; past its highest face it ends. Starting it uses the feature's
 * "once per long rest", which stays used until that rest.
 */
function DieCounter({ ch, c, name, featureKey, use }: {
  ch: Character; c: Extract<Control, { kind: 'dieCounter' }>; name: string; featureKey: string; use?: { key: string; max: number };
}) {
  const sides = c.upgrade && ch.level >= c.upgrade.level ? c.upgrade.sides : c.sides;
  const k = dieKey(c.addsTo, sides, featureKey);
  const value = ch.uses[k] ?? 0;
  const spent = !!use && (ch.uses[use.key] ?? 0) >= use.max;
  const setValue = (v: number, extra: Record<string, number> = {}) =>
    updateCharacter(ch.id, (x) => ({ ...x, uses: { ...x.uses, ...extra, [k]: v } }));
  const title = c.label === 'Die' ? name : c.label.replace(/ Die$/, '');
  if (!value) {
    return (
      <button className="s-mini solid" style={{ alignSelf: 'flex-start' }} disabled={spent}
        onClick={() => setValue(1, use ? { [use.key]: (ch.uses[use.key] ?? 0) + 1 } : {})}>
        {spent ? `${title} · used until your rest` : `Start ${title} · d${sides}`}
      </button>
    );
  }
  return (
    <div className="die-counter">
      <div className={`s-die sm d${sides}`} role="img" aria-label={`${title} die showing ${value} of ${sides}`}><span>{value}</span></div>
      <span style={{ flex: 1, fontSize: 14, lineHeight: 1.35 }}>
        <b>{title}: {value}</b>{c.addsTo === 'damage' ? ` · +${value} to your damage rolls` : c.addsTo === 'action' ? ` · +${value} to your action rolls` : ''}
        <br /><span className="s-muted">{value >= sides ? 'At its highest: + ends it.' : `Counts up to ${sides}.`}</span>
      </span>
      <button className="s-mini solid" aria-label={value >= sides ? `End ${title}` : `Count ${title} up to ${value + 1}`}
        onClick={() => { setValue(value >= sides ? 0 : value + 1); if (value >= sides) toast(`${title} ends.`); }}>+</button>
      <button className="s-mini" onClick={() => setValue(0)}>End</button>
    </div>
  );
}

/** "Roll a d20 as your Hope Die" with no use limit (Rise to the Challenge): arm it for the next action roll. */
function HopeDieToggle({ ch, sides, name }: { ch: Character; sides: number; name: string }) {
  const armed = usePlay((s) => s.armed[ch.id]) ?? armedFor(ch.id);
  const on = armed.hopeDie?.source === name;
  return (
    <button className={`s-mini ${on ? 'solid' : ''}`} aria-pressed={on} onClick={() => toggleHopeDie(ch.id, sides, '', name)}>
      {on ? `d${sides} Hope Die armed` : `Arm d${sides} Hope Die`}
    </button>
  );
}

/** A lasting effect: pay to switch it on; it changes your stats until it ends. */
function ActiveToggle({ ch, k, note, cost, use }: { ch: Character; k: string; note: string; cost?: Cost; use?: string }) {
  const on = isActive(ch, k);
  const spent = !!use && (ch.uses[use] ?? 0) >= 1;
  if (on) {
    return (
      <div className="beast-on">
        <span style={{ flex: 1, fontSize: 14 }}><b>Active.</b> {note}</span>
        <button className="s-mini" onClick={() => updateCharacter(ch.id, (c) => setActive(c, k, false))}>End</button>
      </div>
    );
  }
  return (
    <button className="s-mini solid" style={{ alignSelf: 'flex-start' }} disabled={!canPay(ch, cost) || spent}
      onClick={() => { if (pay(ch.id, cost)) updateCharacter(ch.id, (c) => ({ ...setActive(c, k, true), uses: use ? { ...c.uses, [use]: (c.uses[use] ?? 0) + 1 } : c.uses })); }}>
      {spent ? 'Used' : `Activate${cost ? ` · ${costLabel(cost)}` : ''}`}
    </button>
  );
}

function UseBoxes({ ch, k, max, label, arm }: { ch: Character; k: string; max: number; label: string; arm?: { sides: number; source: string } }) {
  const used = ch.uses[k] ?? 0;
  const armed = usePlay((s) => s.armed[ch.id]) ?? armedFor(ch.id);
  const on = !!arm && armed.hopeDie?.useKey === k;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className="s-label s-muted" style={{ fontSize: 12 }}>{label}</span>
      {Array.from({ length: max }, (_, i) => {
        // With `arm`, the next free box arms the bigger Hope Die; it's marked when you roll.
        const next = arm && i === used;
        return (
          <button key={i} className={`s-check ${i < used ? 'on' : ''} ${next && on ? 'armed' : ''}`} aria-pressed={i < used || (!!next && on)}
            aria-label={next ? `${on ? 'Disarm' : 'Arm'} d${arm!.sides} Hope Die (${label})` : `${label}: use ${i + 1} ${i < used ? 'used' : 'available'}`}
            onClick={() => next
              ? toggleHopeDie(ch.id, arm!.sides, k, arm!.source)
              : updateCharacter(ch.id, (x) => ({ ...x, uses: { ...x.uses, [k]: i < used ? i : i + 1 } }))} />
        );
      })}
      {on ? <span className="s-label" style={{ fontSize: 12 }}>d{arm!.sides} Hope Die armed</span>
        : arm && used < max ? <span className="s-muted" style={{ fontSize: 12 }}>Tap to arm d{arm.sides} Hope Die</span>
        : used >= max ? <span className="s-muted" style={{ fontSize: 12 }}>Used</span> : null}
    </span>
  );
}

function tokenMax(ch: Character, source: TokenSource): number | null {
  const d = derive(ch);
  if ('fixed' in source) return source.fixed;
  if ('trait' in source) {
    const v = source.trait === 'spellcast' ? (d.spellcast ?? 0) : d.traits[source.trait];
    return Math.max(source.min ?? 0, v);
  }
  if ('stat' in source) return source.stat === 'tier' ? d.tier : source.stat === 'proficiency' ? d.proficiency : ch.level;
  return null;
}

function Tokens({ ch, k, source, label }: { ch: Character; k: string; source: TokenSource; label: string }) {
  const have = ch.uses[k] ?? 0;
  const max = tokenMax(ch, source);
  const shown = Math.max(have, max ?? 0, 'roll' in source ? source.roll.count * source.roll.sides + source.roll.bonus : 0);
  const setTo = (v: number) => updateCharacter(ch.id, (x) => ({ ...x, uses: { ...x.uses, [k]: Math.max(0, v) } }));
  const fill = () => {
    if ('roll' in source) setTo(dice('Tokens', source.roll.count, source.roll.sides, source.roll.bonus));
    else if (max !== null) setTo(max);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className="s-label" style={{ fontSize: 12 }}>{label}</span>
      {Array.from({ length: Math.min(12, shown) }, (_, i) => (
        <button key={i} className={`s-token ${i < have ? 'on' : 'spent'}`} aria-label={i < have ? `Spend token ${i + 1}` : `Token ${i + 1} spent`}
          disabled={i >= have} onClick={() => setTo(have - 1)} />
      ))}
      {'manual' in source ? (
        <>
          <button className="s-mini" aria-label="Remove a token" onClick={() => setTo(have - 1)}>−</button>
          <span className="s-num" style={{ fontSize: 18 }}>{have}</span>
          <button className="s-mini" aria-label="Add a token" onClick={() => setTo(have + 1)}>+</button>
        </>
      ) : (
        <button className="s-mini" onClick={fill}>{'roll' in source ? `Roll ${source.roll.count}d${source.roll.sides}${source.roll.bonus ? '+' + source.roll.bonus : ''}` : `Fill · ${max}`}</button>
      )}
      {have > 0 && !('manual' in source) && <button className="s-mini" onClick={() => setTo(0)}>Clear</button>}
    </div>
  );
}
