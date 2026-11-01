import { useState } from 'react';
import { back } from '../app/nav';
import { saveCharacter, useStore } from '../app/store';
import { rules } from '../data';
import { derive, hasAncestryFeature, mustLongRest, rest, restProblems, type RestLogEntry, type RestMove } from '../rules';
import { themeAttrs } from '../ui/Header';
import { Page } from '../ui/kit';

export function Rest({ id, kind }: { id: string; kind: 'short' | 'long' }) {
  const ch = useStore((s) => s.characters[id]);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [trance, setTrance] = useState(true);
  const [party, setParty] = useState(false);
  const [phase, setPhase] = useState<'pick' | 'rolling' | 'done'>('pick');
  const [log, setLog] = useState<RestLogEntry[]>([]);
  if (!ch) return null;

  const d = derive(ch);
  const elf = hasAncestryFeature(ch, 'celestial-trance');
  const efficient = kind === 'short' && hasAncestryFeature(ch, 'efficient');
  const max = rules.downtime.movesPerRest + (elf && trance ? 1 : 0);
  const own = kind === 'short' ? rules.downtime.short.moves : rules.downtime.long.moves;
  const extra = efficient ? rules.downtime.long.moves.filter((m) => !own.some((o) => o.id === m.id)) : [];
  const used = Object.values(picks).reduce((a, b) => a + b, 0);
  const moves: RestMove[] = Object.entries(picks).flatMap(([mid, n]) => Array.from({ length: n }, () => ({ id: mid, withParty: mid === 'prepare' && party })));
  const blocked = kind === 'short' && mustLongRest(ch);
  const problems = restProblems(ch, kind, moves, { trance });

  const take = () => {
    const r = rest(ch, kind, moves, undefined, { trance });
    saveCharacter(r.character);
    setLog(r.log);
    setPhase('rolling');
    setTimeout(() => setPhase('done'), r.log.some((l) => l.roll) && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 900 : 200);
  };

  const title = kind === 'short' ? 'Short rest' : 'Long rest';
  const end = kind === 'short' ? rules.downtime.short.end : rules.downtime.long.end;

  return (
    <div className="s" {...themeAttrs(ch)}>
      <Page title={title} onClose={back}>
        {phase === 'pick' && (
          <div className="stack-16">
            <span className="s-feat-text" style={{ fontSize: 15 }}>
              {kind === 'short'
                ? `About an hour to catch your breath. Choose ${max} downtime moves (the same move twice is fine). Moves that clear things roll 1d4 + your tier (${d.tier}).`
                : `Make camp for several hours. Choose ${max} downtime moves (the same move twice is fine).`}
            </span>
            {blocked && <p className="callout">You’ve taken three short rests in a row: this rest must be a long rest.</p>}
            {kind === 'short' && !blocked && <span className="s-muted" style={{ fontSize: 13 }}>Short rests in a row: {ch.shortRestStreak} of {rules.downtime.shortRestsBeforeLong}</span>}
            {elf && (
              <div className="s-row soft">
                <span style={{ fontSize: 14, lineHeight: 1.35 }}><b>Celestial Trance</b> (Elf) · take a 3rd downtime move</span>
                <button className={`s-check ${trance ? 'on' : ''}`} aria-pressed={trance} aria-label="Use Celestial Trance" onClick={() => { setTrance(!trance); setPicks({}); }} />
              </div>
            )}
            <div className="s-row"><span className="s-label">Choose downtime moves</span><span className="s-num" style={{ fontSize: 18 }}>{used} / {max}</span></div>
            {[...own, ...extra].map((m) => {
              const n = picks[m.id] ?? 0;
              const isExtra = extra.includes(m);
              return (
                <div key={m.id} className="move-row">
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="s-feat-name" style={{ fontSize: 18 }}>{m.name}{isExtra ? ' · Efficient' : ''}</span>
                    <span className="s-muted" style={{ fontSize: 14, lineHeight: 1.4 }}>{m.text}</span>
                    {m.id === 'prepare' && (
                      <button className={`s-mini ${party ? 'solid' : ''}`} style={{ alignSelf: 'flex-start', marginTop: 4 }} aria-pressed={party} onClick={() => setParty(!party)}>With party · 2 Hope each</button>
                    )}
                  </span>
                  <span style={{ display: 'flex', gap: 2 }}>
                    {[0, 1].map((b) => {
                      const on = b < n;
                      const canAdd = used < max && !(isExtra && Object.entries(picks).some(([k, v]) => k !== m.id && extra.some((e) => e.id === k) && v > 0)) && !(isExtra && n >= 1);
                      return (
                        <button key={b} className="s-slotbtn" style={{ width: 44, height: 44 }} disabled={blocked || (!on && !canAdd)}
                          aria-label={`${m.name} pick ${b + 1}: ${on ? 'chosen' : 'not chosen'}`}
                          onClick={() => setPicks({ ...picks, [m.id]: on ? b : b + 1 > n ? n + 1 : n })}>
                          <span className={`s-sq ${on ? 'on' : ''}`} style={{ width: 28, height: 28 }} />
                        </button>
                      );
                    })}
                  </span>
                </div>
              );
            })}
            <span className="s-muted" style={{ fontSize: 13, lineHeight: 1.4 }}>{end} You can also move domain cards between loadout and vault for free.</span>
            {problems.length > 0 && used > 0 && <span className="callout">{problems.join(' ')}</span>}
            <button className="s-btn solid s-press" style={{ minHeight: 52 }} disabled={blocked || used === 0 || problems.length > 0} onClick={take}>
              Take {title.toLowerCase()}
            </button>
          </div>
        )}
        {phase === 'rolling' && (
          <div className="stack-16" style={{ alignItems: 'center', paddingTop: 30 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              {log.filter((l) => l.roll).map((l, i) => <div key={i} className="s-die d6 sm s-spin"><span>{l.roll!.die}</span></div>)}
            </div>
            <span className="s-label" style={{ fontSize: 16, letterSpacing: '.2em' }} aria-live="polite">Resting…</span>
          </div>
        )}
        {phase === 'done' && (
          <div className="stack-10">
            {log.map((l, i) => (
              <div key={i} className="s-row" style={{ minHeight: 44, borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: 16 }}>{[...rules.downtime.short.moves, ...rules.downtime.long.moves].find((m) => m.id === l.move)?.name}</span>
                <span className="s-label" style={{ fontSize: 15 }}>{l.roll ? `1d4 (${l.roll.die}) + ${l.roll.tier} → ` : ''}{l.effect}</span>
              </div>
            ))}
            <span className="s-muted" style={{ fontSize: 14, lineHeight: 1.4 }}>
              {kind === 'short' ? 'Per-rest uses refreshed.' : 'Per-rest and per-long-rest uses refreshed.'}
            </span>
            <button className="s-btn solid s-press" style={{ minHeight: 52 }} onClick={back}>Done</button>
          </div>
        )}
      </Page>
    </div>
  );
}
