import { useState, type ReactNode } from 'react';
import { actionRoll, armedFor, damage, dice, toggleExtra, toggleHopeDie, usePlay } from '../app/play';
import { updateCharacter } from '../app/store';
import type { TraitId } from '../data';
import { canPayStress, controlsFor, derive, type Character, type Control, type TokenSource } from '../rules';
import { Rich } from './kit';

/** A feature or domain card with tap controls derived from its text. */
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
  /** Control kinds handled elsewhere (e.g. a Beastform die added to the attack). */
  skip?: Control['kind'][];
}) {
  const controls = ghost ? [] : controlsFor(text).filter((c) => !skip.includes(c.kind));
  const uses = controls.filter((c): c is Extract<Control, { kind: 'uses' }> => c.kind === 'uses');
  const hopeDie = controls.find((c): c is Extract<Control, { kind: 'hopeDie' }> => c.kind === 'hopeDie');
  // With a use box, the box itself arms the bigger Hope Die (Orderborne "Dedicated").
  const actions = controls.filter((c) => c.kind !== 'uses' && c.kind !== 'tokens' && !(c.kind === 'hopeDie' && uses.length));
  const tokens = controls.find((c): c is Extract<Control, { kind: 'tokens' }> => c.kind === 'tokens');
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
      <Rich text={text} />
      {note && <span className="s-muted" style={{ fontSize: 14, lineHeight: 1.4 }}>{note}</span>}
      {uses.map((u, i) => <UseBoxes key={u.label} ch={ch} k={`${u.scope}:${featureKey}`} max={u.max} label={u.label} arm={i === 0 && hopeDie ? { sides: hopeDie.sides, source: name } : undefined} />)}
      {tokens && <Tokens ch={ch} k={`tokens:${featureKey}`} source={tokens.source} />}
      {actions.length > 0 && (
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {actions.map((c) => c.kind === 'hopeDie' ? <HopeDieToggle key={c.label} ch={ch} c={c} name={name} />
            : c.kind === 'hopeRoll' ? <ComboButton key={c.label} ch={ch} cost={c.n} roll={c.roll} name={name} />
            : c.kind === 'hopeBonus' ? <HopeBonusToggle key={c.label} ch={ch} c={c} name={name} />
            : <ActionButton key={c.label} ch={ch} c={c} name={name} />)}
        </span>
      )}
      {extra}
    </article>
  );
}

/** Pay the Hope and roll the dice in one tap. */
function ComboButton({ ch, cost, roll, name }: { ch: Character; cost: number; roll: Control; name: string }) {
  const [asking, setAsking] = useState(false);
  const d = derive(ch);
  const count = roll.kind === 'damage' ? (roll.count === 'proficiency' ? d.proficiency : roll.count) : roll.kind === 'dice' ? roll.count : 1;
  const sides = roll.kind === 'damage' || roll.kind === 'dice' ? roll.sides : 6;
  const bonus = roll.kind === 'damage' || roll.kind === 'dice' ? roll.bonus : 0;
  const diceText = `${count}d${sides}${bonus ? `+${bonus}` : ''}`;
  const go = () => {
    updateCharacter(ch.id, (x) => ({ ...x, hope: Math.max(0, x.hope - cost) }));
    if (roll.kind === 'damage') damage(name, { dice: [{ count, sides }], bonus }, `${diceText}${roll.type ? ` ${roll.type}` : ''} · ${cost} Hope spent`, [], { charId: ch.id, magic: roll.type === 'magic' });
    else dice(name, count, sides, bonus, `${cost} Hope spent`);
    setAsking(false);
  };
  if (asking) {
    return (
      <span className="s-row confirm">
        <span style={{ fontSize: 14 }}>Spend {cost} of your {ch.hope} Hope and roll {diceText}?</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button className="s-mini" onClick={() => setAsking(false)}>Cancel</button>
          <button className="s-mini solid" onClick={go}>Roll</button>
        </span>
      </span>
    );
  }
  return (
    <button className="s-mini solid" disabled={ch.hope < cost} onClick={() => (cost >= 2 ? setAsking(true) : go())}>
      Use · {cost} Hope · {diceText}
    </button>
  );
}

/** "Roll a d20 as your Hope Die" with no use limit (Rise to the Challenge): arm it for the next action roll. */
function HopeDieToggle({ ch, c, name }: { ch: Character; c: Extract<Control, { kind: 'hopeDie' }>; name: string }) {
  const armed = usePlay((s) => s.armed[ch.id]) ?? armedFor(ch.id);
  const on = armed.hopeDie?.source === name;
  return (
    <button className={`s-mini ${on ? 'solid' : ''}`} aria-pressed={on} onClick={() => toggleHopeDie(ch.id, c.sides, '', name)}>
      {on ? `d${c.sides} Hope Die armed` : `Arm d${c.sides} Hope Die`}
    </button>
  );
}

/** "Spend a Hope to gain a +2 bonus to the roll": pay now, add it to the next roll; tap again to refund. */
function HopeBonusToggle({ ch, c, name }: { ch: Character; c: Extract<Control, { kind: 'hopeBonus' }>; name: string }) {
  const armed = usePlay((s) => s.armed[ch.id]) ?? armedFor(ch.id);
  const on = armed.extras.some((e) => e.label === name);
  return (
    <button className={`s-mini ${on ? 'solid' : ''}`} aria-pressed={on} disabled={!on && ch.hope < c.n}
      onClick={() => {
        updateCharacter(ch.id, (x) => ({ ...x, hope: x.hope + (on ? c.n : -c.n) }));
        toggleExtra(ch.id, { label: name, value: c.bonus });
      }}>
      {on ? `+${c.bonus} armed · tap to refund` : c.label}
    </button>
  );
}

function ActionButton({ ch, c, name }: { ch: Character; c: Control; name: string }) {
  const [asking, setAsking] = useState(false);
  const d = derive(ch);
  switch (c.kind) {
    case 'hope': {
      const cost = c.n === 'any' ? 1 : c.n;
      if (asking) {
        return (
          <span className="s-row confirm">
            <span style={{ fontSize: 14 }}>Spend {cost} of your {ch.hope} Hope?</span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button className="s-mini" onClick={() => setAsking(false)}>Cancel</button>
              <button className="s-mini solid" onClick={() => { updateCharacter(ch.id, (x) => ({ ...x, hope: Math.max(0, x.hope - cost) })); setAsking(false); }}>Apply</button>
            </span>
          </span>
        );
      }
      return (
        <button className="s-mini solid" disabled={ch.hope < cost} onClick={() => (cost >= 2 ? setAsking(true) : updateCharacter(ch.id, (x) => ({ ...x, hope: x.hope - cost })))}>
          {c.n === 'any' ? 'Spend 1 Hope' : `Use · ${cost} Hope`}
        </button>
      );
    }
    case 'stress':
      return (
        <button className="s-mini" disabled={!canPayStress(ch, c.n, d.stressSlots)}
          onClick={() => updateCharacter(ch.id, (x) => ({ ...x, stress: x.stress + c.n }))}>
          {c.label}
        </button>
      );
    case 'roll': {
      const spell = c.trait === 'spellcast';
      const trait: TraitId | undefined = c.trait === 'spellcast' ? d.spellcastTraits.slice().sort((a, b) => d.traits[b] - d.traits[a])[0] : c.trait;
      if (!trait) return <button className="s-mini" disabled>{c.label} · no Spellcast trait</button>;
      const mods = [{ label: cap(trait), value: d.traits[trait] }, ...(spell && d.spellcastBonus ? [{ label: 'Spellcast bonus', value: d.spellcastBonus }] : [])];
      return (
        <button className="s-mini solid" onClick={() => actionRoll(ch.id, spell ? `Spellcast · ${cap(trait)}` : `${cap(trait)} Roll`, mods, c.difficulty ? `${name} · Difficulty ${c.difficulty}` : name, { trait })}>
          {spell ? `Spellcast · ${cap(trait)}` : `${cap(trait)} Roll`}{c.difficulty ? ` (${c.difficulty})` : ''}
        </button>
      );
    }
    case 'damage': {
      const count = c.count === 'proficiency' ? d.proficiency : c.count;
      return (
        <button className="s-mini" onClick={() => damage(name, { dice: [{ count, sides: c.sides }], bonus: c.bonus }, `${count}d${c.sides}${c.bonus ? `+${c.bonus}` : ''}${c.type ? ` ${c.type}` : ''}`, [], { charId: ch.id, magic: c.type === 'magic', attack: true })}>
          Damage {count}d{c.sides}{c.bonus ? `+${c.bonus}` : ''}
        </button>
      );
    }
    case 'dice':
      return <button className="s-mini" onClick={() => dice(name, c.count, c.sides, c.bonus)}>{c.label}</button>;
    default:
      return null;
  }
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

function Tokens({ ch, k, source }: { ch: Character; k: string; source: TokenSource }) {
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
      <span className="s-label" style={{ fontSize: 12 }}>Tokens</span>
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

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
