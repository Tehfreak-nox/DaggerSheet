import { useState } from 'react';
import { back } from '../app/nav';
import { updateCharacter, useStore } from '../app/store';
import {
  armor as allArmor, guides, loot as allLoot, rules, weapons as allWeapons,
  type Armor, type Loot, type RangeId, type Tier, type TraitId, type Weapon,
} from '../data';
import { armorProblems, derive, equipWeapon, tierOf, weaponProblems, type Character, type EquipProblem } from '../rules';
import { themeAttrs } from '../ui/Header';
import { cap, Icon, ICONS, Page, RANGE_NAMES } from '../ui/kit';

type Kind = 'weapon' | 'armor' | 'item';

const PROBLEM: Record<EquipProblem, string> = {
  'unknown': 'Unknown', 'wrong-slot': 'Wrong slot', 'tier-too-high': 'Tier too high',
  'needs-spellcast': 'Needs a Spellcast trait', 'hands-full': 'Hands full',
};

export function Picker({ id, kind }: { id: string; kind: Kind }) {
  const ch = useStore((s) => s.characters[id]);
  const [source, setSource] = useState<'book' | 'custom'>('book');
  if (!ch) return null;
  const title = kind === 'weapon' ? 'Add weapon' : kind === 'armor' ? 'Change armor' : 'Add item';
  return (
    <div className="s" {...themeAttrs(ch)}>
      <Page title={title} onClose={back}>
        <div className="s-pills" role="tablist" aria-label="Source" style={{ justifyContent: 'flex-start' }}>
          <button role="tab" className={`s-pill ${source === 'book' ? 'on' : ''}`} aria-selected={source === 'book'} onClick={() => setSource('book')}>From the book</button>
          <button role="tab" className={`s-pill ${source === 'custom' ? 'on' : ''}`} aria-selected={source === 'custom'} onClick={() => setSource('custom')}>Custom {kind}</button>
        </div>
        {source === 'book' ? <Catalog ch={ch} kind={kind} /> : <Custom ch={ch} kind={kind} />}
      </Page>
    </div>
  );
}

function addWeapon(ch: Character, w: Weapon): string {
  const slot = w.category;
  const probs = weaponProblems({ ...ch, [slot]: undefined }, w.id, slot);
  if (!ch[slot] && probs.length === 0) {
    updateCharacter(ch.id, (c) => equipWeapon(c, slot, { id: w.id }));
    return `Equipped ${w.name} as your ${slot} weapon.`;
  }
  if (ch.inventoryWeapons.length >= 2) return 'You can carry two inventory weapons. Drop one first.';
  updateCharacter(ch.id, (c) => ({ ...c, inventoryWeapons: [...c.inventoryWeapons, { id: w.id }] }));
  return `Added ${w.name} to your inventory weapons.`;
}

function addItem(ch: Character, l: Loot): string {
  const have = ch.items.find((x) => x.id === l.id);
  if (l.kind === 'consumable' && have && have.qty >= rules.caps.consumablesEach) return `You can hold up to ${rules.caps.consumablesEach} of each consumable.`;
  updateCharacter(ch.id, (c) => ({
    ...c,
    items: have && l.kind === 'consumable' ? c.items.map((x) => (x.id === l.id ? { ...x, qty: x.qty + 1 } : x)) : [...c.items, { id: l.id, qty: 1 }],
  }));
  return `Added ${l.name}.`;
}

function Catalog({ ch, kind }: { ch: Character; kind: Kind }) {
  const myTier = tierOf(ch.level);
  const [tier, setTier] = useState<Tier>(myTier);
  const [group, setGroup] = useState(kind === 'weapon' ? 'primary-phy' : kind === 'item' ? 'consumable' : 'all');
  const [open, setOpen] = useState('');
  const [msg, setMsg] = useState('');
  const g = guides[ch.classId];
  const rec = new Set([g?.primary.id, g?.secondary?.id, g?.armor.id].filter(Boolean) as string[]);
  const recName = (n: string) => n.replace(/^(Improved|Advanced|Legendary) /, '');
  const recNames = new Set([g?.primary.name, g?.secondary?.name, g?.armor.name].filter(Boolean) as string[]);
  const isRec = (x: { id: string; name: string }) => rec.has(x.id) || recNames.has(recName(x.name));

  let rows: (Weapon | Armor | Loot)[] = [];
  const groups: [string, string][] = kind === 'weapon'
    ? [['primary-phy', 'Primary · physical'], ['primary-mag', 'Primary · magic'], ['secondary', 'Secondary'], ['wheelchair', 'Combat wheelchair']]
    : kind === 'item' ? [['consumable', 'Consumables'], ['item', 'Items']] : [];
  if (kind === 'weapon') {
    rows = allWeapons.filter((w) => w.tier === tier && !w.id.startsWith('hb-') && (
      group === 'secondary' ? w.category === 'secondary'
        : group === 'wheelchair' ? w.group === 'combat-wheelchair'
        : w.category === 'primary' && !w.group && (group === 'primary-mag' ? w.damage.type !== 'phy' : w.damage.type === 'phy')));
  } else if (kind === 'armor') {
    rows = allArmor.filter((a) => a.tier === tier && !a.id.startsWith('hb-'));
  } else {
    rows = allLoot.filter((l) => l.kind === group && !l.id.startsWith('hb-'));
  }
  rows = [...rows].sort((a, b) => Number(isRec(b)) - Number(isRec(a)));

  return (
    <>
      <div className="stack-10 picker-filters">
        {kind !== 'item' && (
          <>
            <span className="s-label">Tier</span>
            <div className="s-seg" role="tablist" aria-label="Tier" style={{ alignSelf: 'flex-start' }}>
              {([1, 2, 3, 4] as Tier[]).map((t) => (
                <button key={t} role="tab" className={tier === t ? 'on' : ''} aria-selected={tier === t} aria-label={`Tier ${t}`} onClick={() => setTier(t)}>{t}</button>
              ))}
            </div>
          </>
        )}
        {groups.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {groups.map(([k, label]) => (
              <button key={k} className={`s-pill ${group === k ? 'on' : ''}`} style={{ border: '2px solid var(--ink)' }} aria-pressed={group === k} onClick={() => setGroup(k)}>{label}</button>
            ))}
          </div>
        )}
        {kind !== 'item' && <span className="s-muted" style={{ fontSize: 14 }}>★ suggested by the {cap(ch.classId)} guide · you can equip tier {myTier} or lower</span>}
        {msg && <span className="callout" role="status">{msg}</span>}
      </div>
      <div className="picker-rows">
        {rows.map((x) => {
          const isOpen = open === x.id;
          const w = 'damage' in x ? x : null;
          const a = 'thresholds' in x ? x : null;
          const l = 'kind' in x ? x : null;
          const probs = w ? weaponProblems({ ...ch, [w.category]: undefined }, w.id, w.category) : a ? armorProblems(ch, a.id) : [];
          return (
            <div key={x.id} className="picker-row">
              <button className="s-row s-press" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : x.id)}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, textAlign: 'left' }}>
                  <span className="s-feat-name" style={{ fontSize: 20 }}>{isRec(x) ? '★ ' : ''}{x.name}</span>
                  <span className="s-muted" style={{ fontSize: 14 }}>
                    {w && `${cap(w.trait)} ${RANGE_NAMES[w.range]} · ${w.burden === 2 ? 'Two-handed' : 'One-handed'}`}
                    {a && `Thresholds ${a.thresholds.major}/${a.thresholds.severe}`}
                    {l && `Roll ${l.roll} · ${l.set === 'core' ? 'Core set' : 'Additional'}`}
                    {probs.length > 0 && ` · ${probs.map((p) => PROBLEM[p]).join(', ')}`}
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                  <span className="s-num" style={{ fontSize: 17 }}>{w ? `d${w.damage.die}${w.damage.bonus ? '+' + w.damage.bonus : ''} ${w.damage.type}` : a ? `Score ${a.score}` : ''}</span>
                  <Icon d={ICONS.chevron} style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} />
                </span>
              </button>
              {isOpen && (
                <div className="stack-10" style={{ paddingBottom: 14 }}>
                  {(() => {
                    const feat = w?.feature ?? a?.feature ?? null;
                    if (feat) return <span className="s-feat-text" style={{ fontSize: 15 }}><b>{feat.name}:</b> {feat.text}</span>;
                    return l ? <span className="s-feat-text" style={{ fontSize: 15 }}>{l.text}</span> : null;
                  })()}
                  <button className="s-mini solid" style={{ alignSelf: 'flex-start' }}
                    disabled={!!a && probs.length > 0}
                    onClick={() => {
                      if (w) setMsg(addWeapon(ch, w));
                      if (a) { updateCharacter(ch.id, (c) => ({ ...c, armorId: a.id, armorMarked: 0 })); back(); }
                      if (l) setMsg(addItem(ch, l));
                    }}>
                    {a ? (ch.armorId === a.id ? 'Equipped' : 'Equip') : w ? (ch[w.category] || probs.length ? 'Add to inventory' : `Equip as ${w.category}`) : 'Add'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

const TRAITS: TraitId[] = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];
const RANGES: RangeId[] = ['melee', 'very-close', 'close', 'far', 'very-far'];

function Custom({ ch, kind }: { ch: Character; kind: Kind }) {
  const [f, setF] = useState({
    name: '', category: 'primary', burden: '1', trait: 'agility', range: 'melee', damage: 'd8', type: 'phy',
    major: '', severe: '', score: '', itemKind: 'item', notes: '', tier: String(tierOf(ch.level)),
  });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const hbId = () => `hb-${Date.now().toString(36)}`;
  const featureOf = (): { name: string; text: string } | null => {
    if (!f.notes.trim()) return null;
    const m = /^([^:]{1,30}):\s*(.+)$/s.exec(f.notes.trim());
    return m ? { name: m[1].trim(), text: m[2].trim() } : { name: 'Feature', text: f.notes.trim() };
  };

  const add = () => {
    if (!f.name.trim()) { setErr('Give it a name.'); return; }
    const hb = ch.homebrew ?? { weapons: [], armor: [], items: [] };
    if (kind === 'weapon') {
      const m = /^d(\d+)(?:\s*\+\s*(\d+))?$/.exec(f.damage.trim());
      if (!m) { setErr('Damage looks like d8 or d6+2.'); return; }
      const w: Weapon = {
        id: hbId(), name: f.name.trim(), tier: Number(f.tier) as Tier, category: f.category as Weapon['category'],
        trait: f.trait as TraitId, range: f.range as RangeId, damage: { die: Number(m[1]), bonus: Number(m[2] ?? 0), type: f.type as Weapon['damage']['type'] },
        burden: Number(f.burden) as 1 | 2, feature: featureOf(),
      };
      const next = { ...ch, homebrew: { ...hb, weapons: [...hb.weapons, w] } };
      updateCharacter(ch.id, () => next);
      setErr(addWeapon(next, w));
    } else if (kind === 'armor') {
      const [maj, sev, sc] = [Number(f.major), Number(f.severe), Number(f.score)];
      if (!maj || !sev || sev <= maj || sc < 0 || sc > 12) { setErr('Enter base thresholds (Major below Severe) and a score from 0 to 12.'); return; }
      const a: Armor = { id: hbId(), name: f.name.trim(), tier: Number(f.tier) as Tier, thresholds: { major: maj, severe: sev }, score: sc, feature: featureOf() };
      updateCharacter(ch.id, (c) => ({ ...c, homebrew: { ...hb, armor: [...hb.armor, a] }, armorId: a.id, armorMarked: 0 }));
      back();
    } else {
      const l: Loot = { id: hbId(), name: f.name.trim(), kind: f.itemKind as Loot['kind'], roll: 0, set: 'additional', text: f.notes.trim() };
      updateCharacter(ch.id, (c) => ({ ...c, homebrew: { ...hb, items: [...hb.items, l] }, items: [...c.items, { id: l.id, qty: 1 }] }));
      setErr(`Added ${l.name}.`);
    }
  };

  const field = (id: string, label: string, el: React.ReactNode) => (
    <div className="stack-6"><label className="s-label s-muted" style={{ fontSize: 15 }} htmlFor={id}>{label}</label>{el}</div>
  );
  void derive;
  return (
    <div className="stack-16" style={{ paddingTop: 18 }}>
      {field('c-name', 'Name', <input id="c-name" className="s-field" value={f.name} onChange={set('name')} placeholder={kind === 'weapon' ? 'e.g. Grandmother’s Saber' : kind === 'armor' ? 'e.g. Patched Leathers' : 'e.g. Lucky Coin'} />)}
      {kind === 'weapon' && (
        <div className="grid-2">
          {field('c-slot', 'Slot', <select id="c-slot" className="s-field" value={f.category} onChange={set('category')}><option value="primary">Primary</option><option value="secondary">Secondary</option></select>)}
          {field('c-hands', 'Burden', <select id="c-hands" className="s-field" value={f.burden} onChange={set('burden')}><option value="1">One-handed</option><option value="2">Two-handed</option></select>)}
          {field('c-trait', 'Trait', <select id="c-trait" className="s-field" value={f.trait} onChange={set('trait')}>{TRAITS.map((t) => <option key={t} value={t}>{cap(t)}</option>)}</select>)}
          {field('c-range', 'Range', <select id="c-range" className="s-field" value={f.range} onChange={set('range')}>{RANGES.map((r) => <option key={r} value={r}>{RANGE_NAMES[r]}</option>)}</select>)}
          {field('c-die', 'Damage', <input id="c-die" className="s-field" value={f.damage} onChange={set('damage')} placeholder="d6+1" />)}
          {field('c-type', 'Type', <select id="c-type" className="s-field" value={f.type} onChange={set('type')}><option value="phy">Physical</option><option value="mag">Magic</option></select>)}
          {field('c-tier', 'Tier', <select id="c-tier" className="s-field" value={f.tier} onChange={set('tier')}>{[1, 2, 3, 4].map((t) => <option key={t} value={t}>{t}</option>)}</select>)}
        </div>
      )}
      {kind === 'armor' && (
        <>
          <div className="grid-3">
            {field('c-maj', 'Major', <input id="c-maj" className="s-field" type="number" inputMode="numeric" value={f.major} onChange={set('major')} placeholder="6" />)}
            {field('c-sev', 'Severe', <input id="c-sev" className="s-field" type="number" inputMode="numeric" value={f.severe} onChange={set('severe')} placeholder="13" />)}
            {field('c-sc', 'Score', <input id="c-sc" className="s-field" type="number" inputMode="numeric" value={f.score} onChange={set('score')} placeholder="3" />)}
          </div>
          <span className="s-muted" style={{ fontSize: 14, marginTop: -6 }}>Base thresholds; your level is added on the sheet.</span>
          {field('c-tier', 'Tier', <select id="c-tier" className="s-field" value={f.tier} onChange={set('tier')}>{[1, 2, 3, 4].map((t) => <option key={t} value={t}>{t}</option>)}</select>)}
        </>
      )}
      {kind === 'item' && field('c-kind', 'Kind', <select id="c-kind" className="s-field" value={f.itemKind} onChange={set('itemKind')}><option value="item">Item</option><option value="consumable">Consumable</option></select>)}
      {field('c-notes', kind === 'item' ? 'What it does' : 'Feature (optional, “Name: text”)', <textarea id="c-notes" className="s-field area" rows={4} value={f.notes} onChange={set('notes')} placeholder={kind === 'item' ? 'e.g. Clear 1d4 HP.' : 'e.g. Reliable: +1 to attack rolls'} />)}
      {err && <span className="callout" role="status">{err}</span>}
      <button className="s-btn solid s-press" style={{ alignSelf: 'flex-end' }} onClick={add}>Add</button>
    </div>
  );
}
