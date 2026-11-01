import { useEffect, useState } from 'react';
import { closeRoll, rerollDamage, rerollHopeDie, usePlay, type RollView } from '../app/play';
import { useStore } from '../app/store';
import { hasAncestryFeature, type Character } from '../rules';
import { signed } from './kit';

function useTumble(active: boolean, sides: number) {
  const [n, setN] = useState(1);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN(1 + Math.floor(Math.random() * sides)), 70);
    return () => clearInterval(t);
  }, [active, sides]);
  return n;
}

function Die({ value, sides, rolling, fear, small, dropped, picked, onPick }: {
  value: number; sides: number; rolling: boolean; fear?: boolean; small?: boolean; dropped?: boolean; picked?: boolean; onPick?: () => void;
}) {
  const t = useTumble(rolling, sides);
  const cls = `s-die ${fear ? 'fear' : ''} ${small ? 'sm' : ''} ${sides === 6 ? 'd6' : ''} ${rolling ? 's-spin' : ''} ${picked ? 'picked' : ''}`;
  if (onPick) {
    return (
      <button className={cls} style={{ border: 0, padding: 0 }} aria-pressed={!!picked} aria-label={`d${sides} showing ${value}${picked ? ', selected to reroll' : ''}`} onClick={onPick}>
        <span>{value}</span>
      </button>
    );
  }
  return (
    <div className={cls} style={dropped ? { opacity: 0.35 } : undefined}>
      <span>{rolling ? t : value}</span>
    </div>
  );
}

const key = (g: number, i: number) => `${g}:${i}`;

/** Reroll and follow-up buttons the character's features offer on this result. */
function Followups({ r, ch, picked, setPicked, picking, setPicking }: {
  r: RollView; ch?: Character; picked: Set<string>; setPicked: (s: Set<string>) => void; picking: boolean; setPicking: (b: boolean) => void;
}) {
  if (!ch) return null;
  const out: React.ReactNode[] = [];
  if (r.kind === 'action') {
    const used = (l: string) => r.rerolled.includes(l);
    const spare = ch.hope;
    if (hasAncestryFeature(ch, 'internal-compass') && r.result.hope === 1 && !used('Internal Compass')) {
      out.push(<button key="ic" className="s-btn s-press" onClick={() => rerollHopeDie('Internal Compass')}>Reroll your 1 · Internal Compass</button>);
    }
    if (hasAncestryFeature(ch, 'nimble-fingers') && r.trait === 'finesse' && !used('Nimble Fingers')) {
      out.push(<button key="nf" className="s-btn s-press" disabled={spare < 2} onClick={() => rerollHopeDie('Nimble Fingers', 2)}>Reroll Hope Die · 2 Hope (Nimble Fingers)</button>);
    }
    if (hasAncestryFeature(ch, 'feline-instincts') && r.trait === 'agility' && !used('Feline Instincts')) {
      out.push(<button key="fi" className="s-btn s-press" disabled={spare < 2} onClick={() => rerollHopeDie('Feline Instincts', 2)}>Reroll Hope Die · 2 Hope (Feline Instincts)</button>);
    }
    if (r.critDamage && r.result.outcome === 'critical') {
      out.push(<button key="cd" className="s-btn solid s-press" onClick={() => { closeRoll(); r.critDamage!(); }}>Roll critical damage</button>);
    }
  } else if (r.kind === 'damage') {
    const used = (l: string) => r.rerolled.includes(l);
    const low = r.result.rolls.some((g) => g.values.some((v) => v <= 2));
    if (ch.cards.loadout.includes('blade-not-good-enough') && low && !used('Not Good Enough')) {
      out.push(<button key="ng" className="s-btn s-press" onClick={() => rerollDamage('Not Good Enough', (v) => v <= 2)}>Reroll 1s and 2s · Not Good Enough</button>);
    }
    if (ch.classId === 'sorcerer' && r.magic && r.attack) {
      if (!picking) {
        out.push(<button key="vm" className="s-btn s-press" disabled={ch.hope < 3} onClick={() => setPicking(true)}>Volatile Magic · reroll dice for 3 Hope</button>);
      } else {
        out.push(
          <span key="vm-hint" className="s-muted" style={{ fontSize: 14, textAlign: 'center' }}>Tap the dice to reroll.</span>,
          <span key="vm" style={{ display: 'flex', gap: 8 }}>
            <button className="s-btn s-press" style={{ flex: 1 }} onClick={() => { setPicking(false); setPicked(new Set()); }}>Cancel</button>
            <button className="s-btn solid s-press" style={{ flex: 2 }} disabled={!picked.size || ch.hope < 3}
              onClick={() => { const p = new Set(picked); setPicking(false); setPicked(new Set()); rerollDamage('Volatile Magic', (_, g, i) => p.has(key(g, i)), 3); }}>
              Reroll {picked.size || ''} · 3 Hope
            </button>
          </span>,
        );
      }
    }
  }
  return out.length ? <>{out}</> : null;
}

export function RollOverlay() {
  const r = usePlay((s) => s.roll);
  const ch = useStore((s) => (r && 'charId' in r && r.charId ? s.characters[r.charId] : undefined));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);
  useEffect(() => { setPicked(new Set()); setPicking(false); }, [r && 'result' in r ? r.result : r]);
  useEffect(() => {
    if (!r) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRoll(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [r]);
  if (!r) return null;
  const rolling = r.rolling;

  let lines: { label: string; val: string }[] = [];
  let total = 0;
  let outcome: { text: string; light?: boolean } | null = null;

  if (r.kind === 'action') {
    const x = r.result;
    lines = [
      { label: x.hopeSides === 12 ? 'Hope die' : `Hope die (d${x.hopeSides})`, val: String(x.hope) },
      { label: 'Fear die', val: String(x.fear) },
      ...(x.advantageDie !== null ? [{ label: x.advantage === 'advantage' ? 'Advantage d6' : 'Disadvantage d6', val: x.advantage === 'advantage' ? `+${x.advantageDie}` : `−${x.advantageDie}` }] : []),
      ...x.modifiers.map((m) => ({ label: m.label, val: signed(m.value) })),
    ];
    total = x.total;
    outcome = x.outcome === 'critical' ? { text: 'Critical success' } : x.outcome === 'hope' ? { text: 'With Hope' } : { text: 'With Fear', light: true };
  } else if (r.kind === 'damage') {
    const x = r.result;
    lines = [
      ...x.rolls.map((g) => ({ label: `${g.values.length}d${g.sides}${g.dropped !== null ? ` (dropped ${g.dropped})` : ''}`, val: String(g.values.reduce((a, b) => a + b, 0)) })),
      ...(x.critBonus ? [{ label: 'Critical: max dice', val: `+${x.critBonus}` }] : []),
      ...(x.bonus ? [{ label: 'Bonus', val: signed(x.bonus) }] : []),
      ...x.modifiers.map((m) => ({ label: m.label, val: signed(m.value) })),
    ];
    total = x.total;
  } else {
    lines = [
      { label: `${r.values.length}d${r.sides}`, val: String(r.values.reduce((a, b) => a + b, 0)) },
      ...(r.bonus ? [{ label: 'Bonus', val: signed(r.bonus) }] : []),
    ];
    total = r.total;
  }

  return (
    <>
      <button className="s-scrim" aria-label="Close roll" onClick={closeRoll} />
      <div className="s-pop" role="dialog" aria-modal="true" aria-label={r.title} style={{ top: 'max(70px, env(safe-area-inset-top, 0px))' }}>
        <div className="s-row" style={{ alignItems: 'baseline' }}>
          <span className="s-label" style={{ fontSize: 20 }}>{r.title}</span>
          {r.sub && <span className="s-muted" style={{ fontSize: 14 }}>{r.sub}</span>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
          {r.kind === 'action' && (
            <>
              <DieLabel label="Hope"><Die value={r.result.hope} sides={r.result.hopeSides} rolling={rolling} /></DieLabel>
              <DieLabel label="Fear"><Die value={r.result.fear} sides={12} rolling={rolling} fear /></DieLabel>
              {r.result.advantageDie !== null && (
                <DieLabel label={r.result.advantage === 'advantage' ? 'Adv' : 'Dis'}><Die value={r.result.advantageDie} sides={6} rolling={rolling} small /></DieLabel>
              )}
            </>
          )}
          {r.kind === 'damage' && r.result.rolls.flatMap((g, gi) => [
            ...g.values.map((v, i) => (
              <Die key={`${gi}-${i}`} value={v} sides={g.sides} rolling={rolling} small picked={picked.has(key(gi, i))}
                onPick={picking && !rolling ? () => { const p = new Set(picked); if (p.has(key(gi, i))) p.delete(key(gi, i)); else p.add(key(gi, i)); setPicked(p); } : undefined} />
            )),
            ...(g.dropped !== null ? [<Die key={`${gi}-d`} value={g.dropped} sides={g.sides} rolling={rolling} small dropped />] : []),
          ])}
          {r.kind === 'dice' && (r.labels
            ? r.values.map((v, i) => <DieLabel key={i} label={r.labels![i]}><Die value={v} sides={r.sides} rolling={rolling} fear={/fear/i.test(r.labels![i])} /></DieLabel>)
            : r.values.map((v, i) => <Die key={i} value={v} sides={r.sides} rolling={rolling} small />))}
        </div>
        {rolling ? (
          <span className="s-label" style={{ textAlign: 'center', fontSize: 16, letterSpacing: '.2em' }} aria-live="polite">Rolling…</span>
        ) : (
          <>
            {!(r.kind === 'dice' && r.labels) && <div style={{ display: 'flex', flexDirection: 'column' }} aria-live="polite">
              {lines.map((l, i) => (
                <div key={i} className="s-row" style={{ minHeight: 30, borderBottom: '1px solid var(--line)', fontSize: 15 }}>
                  <span>{l.label}</span><span className="s-num" style={{ fontSize: 18 }}>{l.val}</span>
                </div>
              ))}
              <div className="s-row" style={{ paddingTop: 8 }}>
                <span className="s-label" style={{ fontSize: 16 }}>Total</span>
                <span className="s-num" style={{ fontSize: 52, fontWeight: 600 }}>{total}</span>
              </div>
            </div>}
            {outcome && <div className={`s-outcome ${outcome.light ? 'light' : ''}`}>{outcome.text}</div>}
            {r.effects.map((e, i) => <span key={i} style={{ fontSize: 14, textAlign: 'center' }}>{e}</span>)}
            <Followups r={r} ch={ch} picked={picked} setPicked={setPicked} picking={picking} setPicking={setPicking} />
            <button className={`s-btn s-press ${r.kind === 'action' && r.critDamage && r.result.outcome === 'critical' ? '' : 'solid'}`} onClick={closeRoll} autoFocus>Done</button>
          </>
        )}
      </div>
    </>
  );
}

function DieLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      {children}
      <span className="s-label" style={{ fontSize: 12 }}>{label}</span>
    </div>
  );
}
