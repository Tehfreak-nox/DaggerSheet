import { useEffect, useState } from 'react';
import { ancestryById, classById, communityById } from '../data';
import { tierOf, type AncestryChoice } from '../rules';
import { EMBLEMS, FRAMES, ORNAMENTS } from '../theme/tables';
import { Icon, ICONS } from './kit';

export interface Persona {
  name: string;
  pronouns?: string;
  level?: number;
  classId?: string;
  subclassId?: string;
  ancestry?: AncestryChoice;
  communityId?: string;
  multiclass?: { classId: string; subclassId: string };
}

/** data-cls / data-sub attributes that drive the class palette (persona.css). */
export function themeAttrs(p: Pick<Persona, 'classId' | 'subclassId'>) {
  const cls = p.classId ? classById.get(p.classId) : undefined;
  const subIndex = cls && p.subclassId ? Math.max(0, cls.subclasses.findIndex((s) => s.id === p.subclassId)) : 0;
  return { 'data-cls': cls?.id, 'data-sub': subIndex === 1 ? 'b' : 'a' } as Record<string, string | undefined>;
}

export function ancestryIds(a?: AncestryChoice): [string, string] | null {
  if (!a) return null;
  return 'id' in a ? [a.id, a.id] : [a.mixed.first, a.mixed.second];
}

/** "a Loreborne Elemental Origin Sorcerer Elf" */
export function sentence(p: Persona): string {
  const cls = p.classId ? classById.get(p.classId) : undefined;
  const sub = cls?.subclasses.find((s) => s.id === p.subclassId);
  const com = p.communityId ? communityById.get(p.communityId) : undefined;
  const ids = ancestryIds(p.ancestry);
  const anc = ids ? (ids[0] === ids[1] ? ancestryById.get(ids[0])?.name : `${ancestryById.get(ids[0])?.name}/${ancestryById.get(ids[1])?.name}`) : undefined;
  const mc = p.multiclass ? classById.get(p.multiclass.classId) : undefined;
  const mcSub = mc?.subclasses.find((s) => s.id === p.multiclass!.subclassId);
  const words = [com?.name, sub?.name, cls?.name, ...(mc ? ['and', mcSub?.name, mc.name] : []), anc].filter(Boolean);
  if (!words.length) return 'Choose a class to begin';
  const first = words[0]!;
  return `${/^[AEIOU]/i.test(first) ? 'an' : 'a'} ${words.join(' ')}`;
}

export function Ornament({ id, flip }: { id?: string; flip?: boolean }) {
  const o = id ? ORNAMENTS[id] : undefined;
  return (
    <span className={`orn ${flip ? 'r' : ''}`} aria-hidden="true">
      {o && (
        <svg width="48" height="36" viewBox="0 0 60 44" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          {o[1] && <path d={o[1]} fill="currentColor" fillOpacity=".85" stroke="none" />}
          {o[0] && <path d={o[0]} />}
        </svg>
      )}
    </span>
  );
}

/** Index of a subclass within its class (0: ring frame, 1: diamond frame). */
export function subIndexOf(classId?: string, subclassId?: string): number {
  const cls = classId ? classById.get(classId) : undefined;
  return cls ? Math.max(0, cls.subclasses.findIndex((s) => s.id === subclassId)) : 0;
}

/** Class emblem in its subclass frame; a multiclass shows both, split down the middle. */
export function Emblem({ classId, subIndex, size = 210, opacity = 0.17, style, multi }: {
  classId?: string; subIndex: number; size?: number; opacity?: number; style?: React.CSSProperties;
  multi?: { classId: string; subIndex: number };
}) {
  if (!classId) return null;
  const uid = `em-${classId}-${multi?.classId ?? ''}-${size}`;
  return (
    <svg width={size} height={size} viewBox="-5 -5 34 34" fill="none" stroke="#FFFFFF" strokeWidth=".6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ position: 'absolute', right: -44, top: -24, opacity, pointerEvents: 'none', ...style }}>
      {multi ? (
        <>
          <defs>
            <clipPath id={`${uid}-l`}><rect x="-5" y="-5" width="17" height="34" /></clipPath>
            <clipPath id={`${uid}-r`}><rect x="12" y="-5" width="17" height="34" /></clipPath>
          </defs>
          <g clipPath={`url(#${uid}-l)`}><path d={EMBLEMS[classId]} /><path d={FRAMES[subIndex] ?? FRAMES[0]} /></g>
          <g clipPath={`url(#${uid}-r)`}><path d={EMBLEMS[multi.classId]} /><path d={FRAMES[multi.subIndex] ?? FRAMES[0]} /></g>
          <path d="M12 -4V28" strokeDasharray="1 1" />
        </>
      ) : (
        <>
          <path d={EMBLEMS[classId]} />
          <path d={FRAMES[subIndex] ?? FRAMES[0]} />
        </>
      )}
    </svg>
  );
}

export interface MenuItem { label: string; note?: string; onClick: () => void; disabled?: boolean }

export function Header({
  persona, tab, onTab, menu, onHome, preview,
}: {
  persona: Persona;
  tab?: 'character' | 'equipment';
  onTab?: (t: 'character' | 'equipment') => void;
  menu?: MenuItem[];
  onHome?: () => void;
  preview?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const cls = persona.classId ? classById.get(persona.classId) : undefined;
  const subIndex = cls ? Math.max(0, cls.subclasses.findIndex((s) => s.id === persona.subclassId)) : 0;
  const ids = ancestryIds(persona.ancestry);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="s-band">
      <Emblem classId={cls?.id} subIndex={subIndex}
        multi={persona.multiclass ? { classId: persona.multiclass.classId, subIndex: subIndexOf(persona.multiclass.classId, persona.multiclass.subclassId) } : undefined} />
      {onHome && (
        <button className="s-icon s-press band-btn" style={{ left: 2 }} aria-label="All characters" onClick={onHome}>
          <Icon d={ICONS.back} size={24} stroke={2.4} />
        </button>
      )}
      {menu && (
        <button className="s-icon s-press band-btn" style={{ right: 6 }} aria-label="More: rests, level up" aria-expanded={open} onClick={() => setOpen(!open)}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
        </button>
      )}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6, padding: onHome ? '0 40px 0 30px' : '0 40px 0 0' }}>
        {preview && <span className="s-label" style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>Live preview</span>}
        <h1 className="s-name">{persona.name || 'Your character'}</h1>
        <span className="s-sub">{sentence(persona)}</span>
        {persona.level !== undefined && (
          <span className="s-sub" style={{ fontSize: 15, color: 'rgba(255,255,255,.65)' }}>
            Level {persona.level} · Tier {tierOf(persona.level)}{persona.pronouns ? ` · ${persona.pronouns}` : ''}
          </span>
        )}
      </div>
      <nav aria-label="Pages" style={{ position: 'relative', display: 'flex', margin: '16px -20px 0' }}>
        <Ornament id={ids?.[0]} />
        {(['character', 'equipment'] as const).map((t) => (
          <button key={t} className={`s-navtab ${tab === t ? 'on' : ''}`} aria-current={tab === t ? 'page' : undefined}
            style={{ border: 0, background: 'transparent', minHeight: preview ? 46 : 64 }}
            onClick={() => onTab?.(t)} disabled={!onTab}>
            {!preview && <Icon d={t === 'character' ? ICONS.person : ICONS.bag} size={30} stroke={1.6} />}
            {t === 'character' ? 'Character' : 'Equipment'}
          </button>
        ))}
        <Ornament id={ids?.[1]} flip />
      </nav>

      {open && menu && (
        <>
          <button className="s-scrim" style={{ background: 'transparent', zIndex: 40 }} aria-label="Close menu" onClick={() => setOpen(false)} />
          <div role="menu" className="band-menu">
            {menu.map((m) => (
              <button key={m.label} role="menuitem" className="s-press" disabled={m.disabled}
                onClick={() => { setOpen(false); m.onClick(); }}>
                <span className="s-label" style={{ fontSize: 16, flex: 1 }}>{m.label}</span>
                {m.note && <span className="s-muted" style={{ fontSize: 13 }}>{m.note}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </header>
  );
}
