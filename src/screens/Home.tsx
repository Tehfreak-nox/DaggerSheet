import { useState } from 'react';
import { go } from '../app/nav';
import { deleteCharacter, exportJson, importJson, useStore } from '../app/store';
import type { Character } from '../rules';
import { Emblem, sentence, themeAttrs } from '../ui/Header';
import { Icon, ICONS } from '../ui/kit';

export function Home() {
  const chars = useStore((s) => s.characters);
  const sync = useStore((s) => s.sync);
  const list = Object.values(chars).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const [io, setIo] = useState<'none' | 'export' | 'import'>('none');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState('');

  return (
    <div className="s home">
      <header className="home-head">
        <span className="s-label" style={{ fontSize: 12, color: 'var(--ink-2)' }}>Daggerheart character sheet</span>
        <h1>DaggerSheet</h1>
        <span className="s-muted" style={{ fontSize: 14 }}>
          {sync === 'account' ? 'Saved to your account: your characters follow you between devices.'
            : sync === 'connecting' ? 'Connecting to your account…'
            : sync === 'error' ? 'Couldn’t reach your account; saving on this device.'
            : 'Saved on this device.'}
        </span>
      </header>
      <main className="home-main">
        <button className="s-btn solid s-press new-btn" onClick={() => go({ name: 'create' })}>
          <Icon d={ICONS.plus} size={20} stroke={2.6} /> New character
        </button>

        {list.length === 0 && (
          <div className="empty">
            <p className="s-feat-name">No characters yet</p>
            <p className="s-muted">Create one in 11 short steps: class, heritage, traits, gear and cards, with the official guide’s suggestions one tap away.</p>
          </div>
        )}

        {list.map((c) => <CharRow key={c.id} c={c} confirming={confirm === c.id} setConfirm={setConfirm} />)}

        <div className="home-tools">
          <button className="s-mini" onClick={() => { setIo(io === 'export' ? 'none' : 'export'); setText(exportJson()); setMsg(''); }} disabled={!list.length}>Export</button>
          <button className="s-mini" onClick={() => { setIo(io === 'import' ? 'none' : 'import'); setText(''); setMsg(''); }}>Import</button>
          <button className="s-mini" onClick={() => go({ name: 'about' })}>About</button>
        </div>
        {io !== 'none' && (
          <div className="stack-10">
            <label className="s-label s-muted" htmlFor="io-text">{io === 'export' ? 'Your characters as JSON' : 'Paste character JSON'}</label>
            <textarea id="io-text" className="s-field area mono" rows={8} value={text} readOnly={io === 'export'} onChange={(e) => setText(e.target.value)} />
            {io === 'export' ? (
              <button className="s-mini solid" style={{ alignSelf: 'flex-start' }} onClick={() => {
                navigator.clipboard?.writeText(text).then(() => setMsg('Copied.'), () => setMsg('Select the text above and copy it.'));
              }}>Copy</button>
            ) : (
              <button className="s-mini solid" style={{ alignSelf: 'flex-start' }} disabled={!text.trim()} onClick={() => {
                const r = importJson(text);
                setMsg(r.error ?? `Imported ${r.imported} character${r.imported === 1 ? '' : 's'}.`);
              }}>Import</button>
            )}
            {msg && <span className="s-muted" role="status">{msg}</span>}
          </div>
        )}
      </main>
    </div>
  );
}

function CharRow({ c, confirming, setConfirm }: { c: Character; confirming: boolean; setConfirm: (id: string) => void }) {
  const attrs = themeAttrs(c);
  return (
    <div className="char-row" {...attrs}>
      <button className="char-open s-press" onClick={() => go({ name: 'sheet', id: c.id })}>
        <Emblem classId={c.classId} subIndex={attrs['data-sub'] === 'b' ? 1 : 0} size={120} opacity={0.22} style={{ right: -20, top: -20 }} />
        <span className="s-name" style={{ fontSize: 22 }}>{c.name}</span>
        <span className="s-sub" style={{ fontSize: 14 }}>{sentence(c)}</span>
        <span className="s-sub" style={{ fontSize: 13, color: 'rgba(255,255,255,.65)' }}>Level {c.level}</span>
      </button>
      {confirming ? (
        <div className="s-row" style={{ padding: '8px 12px' }}>
          <span style={{ fontSize: 14 }}>Delete {c.name}? This can’t be undone.</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button className="s-mini" onClick={() => setConfirm('')}>Keep</button>
            <button className="s-mini solid" onClick={() => { deleteCharacter(c.id); setConfirm(''); }}>Delete</button>
          </span>
        </div>
      ) : (
        <button className="s-icon s-press char-del" aria-label={`Delete ${c.name}`} onClick={() => setConfirm(c.id)}>
          <Icon d={ICONS.trash} size={20} />
        </button>
      )}
    </div>
  );
}
