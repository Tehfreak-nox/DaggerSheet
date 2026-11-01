import { useEffect, useState } from 'react';
import { closeRoll, usePlay } from '../app/play';
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

function Die({ value, sides, rolling, fear, small, dropped }: { value: number; sides: number; rolling: boolean; fear?: boolean; small?: boolean; dropped?: boolean }) {
  const t = useTumble(rolling, sides);
  return (
    <div className={`s-die ${fear ? 'fear' : ''} ${small ? 'sm' : ''} ${sides === 6 ? 'd6' : ''} ${rolling ? 's-spin' : ''}`} style={dropped ? { opacity: 0.35 } : undefined}>
      <span>{rolling ? t : value}</span>
    </div>
  );
}

export function RollOverlay() {
  const r = usePlay((s) => s.roll);
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
      { label: 'Hope die', val: String(x.hope) },
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
              <DieLabel label="Hope"><Die value={r.result.hope} sides={12} rolling={rolling} /></DieLabel>
              <DieLabel label="Fear"><Die value={r.result.fear} sides={12} rolling={rolling} fear /></DieLabel>
              {r.result.advantageDie !== null && (
                <DieLabel label={r.result.advantage === 'advantage' ? 'Adv' : 'Dis'}><Die value={r.result.advantageDie} sides={6} rolling={rolling} small /></DieLabel>
              )}
            </>
          )}
          {r.kind === 'damage' && r.result.rolls.flatMap((g, gi) => [
            ...g.values.map((v, i) => <Die key={`${gi}-${i}`} value={v} sides={g.sides} rolling={rolling} small />),
            ...(g.dropped !== null ? [<Die key={`${gi}-d`} value={g.dropped} sides={g.sides} rolling={rolling} small dropped />] : []),
          ])}
          {r.kind === 'dice' && r.values.map((v, i) => <Die key={i} value={v} sides={r.sides} rolling={rolling} small />)}
        </div>
        {rolling ? (
          <span className="s-label" style={{ textAlign: 'center', fontSize: 16, letterSpacing: '.2em' }} aria-live="polite">Rolling…</span>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column' }} aria-live="polite">
              {lines.map((l, i) => (
                <div key={i} className="s-row" style={{ minHeight: 30, borderBottom: '1px solid var(--line)', fontSize: 15 }}>
                  <span>{l.label}</span><span className="s-num" style={{ fontSize: 18 }}>{l.val}</span>
                </div>
              ))}
              <div className="s-row" style={{ paddingTop: 8 }}>
                <span className="s-label" style={{ fontSize: 16 }}>Total</span>
                <span className="s-num" style={{ fontSize: 52, fontWeight: 600 }}>{total}</span>
              </div>
            </div>
            {outcome && <div className={`s-outcome ${outcome.light ? 'light' : ''}`}>{outcome.text}</div>}
            {r.effects.map((e, i) => <span key={i} style={{ fontSize: 14, textAlign: 'center' }}>{e}</span>)}
            <button className="s-btn solid s-press" onClick={closeRoll} autoFocus>Done</button>
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
