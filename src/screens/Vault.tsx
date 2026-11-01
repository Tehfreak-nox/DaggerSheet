import { useState } from 'react';
import { back } from '../app/nav';
import { updateCharacter, useStore } from '../app/store';
import { classById, domainCards, rules, type DomainCard } from '../data';
import { accessibleDomains, canPayStress, derive } from '../rules';
import { themeAttrs } from '../ui/Header';
import { cap, DomainIcon, Page, Recall, Rich } from '../ui/kit';

const PERMANENT_VAULT = new Set(['blade-vitality', 'grace-master-of-the-craft']);

export function Vault({ id }: { id: string }) {
  const ch = useStore((s) => s.characters[id]);
  const [resting, setResting] = useState(true);
  const [open, setOpen] = useState('');
  const [msg, setMsg] = useState('');
  if (!ch) return null;
  const d = derive(ch);
  const domains = accessibleDomains(ch);
  const loadout = new Set(ch.cards.loadout);
  const vault = new Set(ch.cards.vault);
  const full = ch.cards.loadout.length >= rules.caps.loadout;

  const toVault = (c: DomainCard) => {
    updateCharacter(id, (x) => ({ ...x, cards: { loadout: x.cards.loadout.filter((y) => y !== c.id), vault: [...x.cards.vault, c.id] } }));
    setMsg(`${c.name} moved to the vault.`);
  };
  const toLoadout = (c: DomainCard) => {
    if (full) { setMsg('Your loadout is full. Move a card to the vault first (free).'); return; }
    const cost = resting ? 0 : c.recallCost;
    if (cost && !canPayStress(ch, cost, d.stressSlots)) { setMsg(`Recalling ${c.name} costs ${cost} Stress and you don’t have enough unmarked.`); return; }
    updateCharacter(id, (x) => ({ ...x, stress: x.stress + cost, cards: { vault: x.cards.vault.filter((y) => y !== c.id), loadout: [...x.cards.loadout, c.id] } }));
    setMsg(cost ? `${c.name} recalled: marked ${cost} Stress.` : `${c.name} moved to your loadout.`);
  };

  const strip = ch.cards.loadout.map((cid) => domainCards.find((c) => c.id === cid)!).filter(Boolean);

  return (
    <div className="s" {...themeAttrs(ch)}>
      <Page title="Cards" onClose={back} closeLabel="Done">
        <div className="stack-8">
          <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="When are you swapping?">
            <button className={`s-pill ${resting ? 'on' : ''}`} style={{ border: '2px solid var(--ink)' }} aria-pressed={resting} onClick={() => setResting(true)}>Resting · free</button>
            <button className={`s-pill ${!resting ? 'on' : ''}`} style={{ border: '2px solid var(--ink)' }} aria-pressed={!resting} onClick={() => setResting(false)}>Mid-scene · Stress</button>
          </div>
          <span className="s-muted" style={{ fontSize: 14, lineHeight: 1.4 }}>
            {resting ? 'During a rest you can move cards between your loadout and vault for free.'
              : 'Outside a rest, moving a card into your loadout costs Stress equal to its Recall Cost. Moving one to the vault is free.'}
          </span>
          {msg && <span className="callout" role="status">{msg}</span>}
        </div>

        <section className="stack-10">
          <div className="s-row"><span className="s-label" style={{ fontSize: 18 }}>Loadout</span><span className="s-num" style={{ fontSize: 18 }}>{strip.length} / {rules.caps.loadout}</span></div>
          <div className="loadout-strip">
            {Array.from({ length: rules.caps.loadout }, (_, i) => {
              const c = strip[i];
              return (
                <div key={i} className={`strip-card ${c ? 'on' : ''}`}>
                  {c && <DomainIcon domain={c.domain} size={20} />}
                  <span>{c?.name ?? 'Empty'}</span>
                </div>
              );
            })}
          </div>
        </section>

        {Array.from({ length: 10 }, (_, i) => i + 1).map((lvl) => {
          const cards = domainCards.filter((c) => c.level === lvl && domains.includes(c.domain));
          const locked = lvl > ch.level;
          const mcLimit = ch.multiclass ? Math.ceil(ch.level / 2) : 0;
          return (
            <section key={lvl} className="stack-4" style={locked ? { opacity: 0.55 } : undefined}>
              <h2 className="s-title" style={{ margin: '0 0 4px' }}><i /><span>Level {lvl}</span><i /></h2>
              {locked && <span className="s-muted" style={{ fontSize: 13, textAlign: 'center' }}>Unlocks at level {lvl}</span>}
              {cards.map((c) => {
                const inL = loadout.has(c.id), inV = vault.has(c.id);
                const mcLocked = ch.multiclass?.domain === c.domain && !(classById.get(ch.classId)!.domains as string[]).includes(c.domain) && c.level > mcLimit;
                const status = inL ? 'In loadout' : inV ? 'In vault' : locked || mcLocked ? 'Locked' : 'Not learned';
                const isOpen = open === c.id;
                return (
                  <div key={c.id} className="vault-row">
                    <button className="s-row s-press vault-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : c.id)}>
                      <span className={`dom-badge ${inL ? 'on' : ''}`}><DomainIcon domain={c.domain} size={18} /></span>
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left', opacity: inL || inV ? 1 : 0.6 }}>
                        <span className="s-feat-name" style={{ fontSize: 18 }}>{c.name}</span>
                        <span className="s-muted" style={{ fontSize: 13 }}>{cap(c.domain)} · {cap(c.type)} · {status}</span>
                      </span>
                      <Recall cost={c.recallCost} />
                    </button>
                    {isOpen && <Rich text={c.text} style={{ fontSize: 15, padding: '0 0 10px 48px' }} />}
                    {(inL || inV) && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 10 }}>
                        {inL && <button className="s-mini" onClick={() => toVault(c)}>To vault</button>}
                        {inV && (PERMANENT_VAULT.has(c.id)
                          ? <span className="s-label s-muted" style={{ fontSize: 11 }}>Stays in the vault</span>
                          : <button className="s-mini solid" disabled={full} onClick={() => toLoadout(c)}>{resting || !c.recallCost ? 'To loadout' : `Recall · ${c.recallCost} Stress`}</button>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
        <span className="s-muted" style={{ fontSize: 14 }}>New cards are learned when you level up.</span>
      </Page>
    </div>
  );
}
