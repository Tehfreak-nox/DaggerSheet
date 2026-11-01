// Small shared UI pieces in the sheet style (see src/styles/sheet.css).
import { Fragment, type ReactNode } from 'react';
import { DOMAIN_ICONS } from '../theme/tables';
import type { DomainId } from '../data';

/** Banner section title: ◆ ═══ TITLE ═══ ◆ */
export function Title({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <h2 className="s-title" style={{ margin: 0, ...style }}>
      <i /><span>{children}</span><i />
    </h2>
  );
}

/** Render Markdown-lite rules text: **bold**, _italic_, paragraphs, ◦/• lists. */
export function Rich({ text, className = 's-feat-text', style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const paras = text.split(/\n\n/);
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      {paras.map((p, i) => {
        const lines = p.split('\n');
        const items = lines.filter((l) => /^[•◦] /.test(l));
        const lead = lines.filter((l) => !/^[•◦] /.test(l));
        return (
          <Fragment key={i}>
            {lead.length > 0 && <p style={{ margin: 0 }}>{inline(lead.join(' '))}</p>}
            {items.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {items.map((it, j) => <li key={j}>{inline(it.slice(2))}</li>)}
              </ul>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|(?<![A-Za-z0-9])_(.+?)_(?![A-Za-z0-9])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(m[1] !== undefined ? <b key={k++}>{m[1]}</b> : <i key={k++}>{m[2]}</i>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function plainText(s: string): string {
  return s.replace(/\*\*|__/g, '').replace(/(^|[^\w])_|_(?=[^\w]|$)/g, '$1');
}

/**
 * Tap-only slot track. Tapping an empty slot fills up to it; tapping a
 * filled slot clears it and everything after it.
 */
export function Track({
  label, value, max, total, onChange, size = 23, columns, countdown,
}: {
  label: string;
  value: number;
  /** Unlocked slots. */
  max: number;
  /** Slots drawn (locked ones greyed). */
  total: number;
  onChange: (v: number) => void;
  size?: number;
  columns?: number;
  /** Show what's left: filled slots are unmarked ones (value stays the number marked). */
  countdown?: boolean;
}) {
  const left = max - value;
  return (
    <div
      role="group"
      aria-label={countdown ? `${label}, ${left} of ${max} left` : `${label}, ${value} of ${max} marked`}
      style={columns ? { display: 'grid', gridTemplateColumns: `repeat(${columns}, ${size + 6}px)` } : { display: 'flex', flexWrap: 'wrap', margin: '0 -3px' }}
    >
      {Array.from({ length: total }, (_, i) => {
        const locked = i >= max;
        const on = countdown ? i < left : i < value;
        return (
          <button
            key={i}
            className="s-slotbtn"
            style={{ width: size + 6, height: size + 9 }}
            disabled={locked}
            aria-label={locked ? `${label} slot ${i + 1}, locked` : countdown ? `${label} slot ${i + 1}, ${on ? 'left' : 'marked'}` : `${label} slot ${i + 1}, ${on ? 'marked' : 'empty'}`}
            onClick={() => onChange(countdown ? max - (on ? i : i + 1) : on ? i : i + 1)}
          >
            <span className={`s-sq ${on ? 'on' : ''} ${locked ? 'off' : ''}`} style={{ width: size, height: size }} />
          </button>
        );
      })}
    </div>
  );
}

export function Icon({ d, size = 20, stroke = 2, label, style }: { d: string; size?: number; stroke?: number; label?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined}
      aria-label={label} style={style}>
      <path d={d} />
    </svg>
  );
}

export const ICONS = {
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  more: '',
  chevron: 'M6 9l6 6 6-6',
  check: 'M5 12l5 5 9-10',
  plus: 'M12 5v14M5 12h14',
  cog: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  hand: 'M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-2a2 2 0 0 0-4 0',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  safe: 'M3 5h18v15H3zM12 9.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  star: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
  grip: 'M5 9h14M5 15h14',
  person: 'M12 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM12 8v7M8 21l4-6 4 6M6 11l6-2 6 2',
  sword: 'M14.5 3.5l6 6-9 9-4 0-2-2v-4zM4 20l3-3',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  bag: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
  cancel: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 8.5l7 7M15.5 8.5l-7 7',
} as const;

export function DomainIcon({ domain, size = 18 }: { domain: DomainId; size?: number }) {
  return <Icon d={DOMAIN_ICONS[domain]} size={size} label={`${domain} domain`} />;
}

/** Recall cost badge: number + lightning bolt. */
export function Recall({ cost, size = 34 }: { cost: number; size?: number }) {
  return (
    <span className="recall" style={{ width: size, height: size }} role="img" aria-label={`Recall cost ${cost}`}>
      <span className="s-num" style={{ fontSize: size * 0.45 }}>{cost}</span>
      <svg width="9" height="13" viewBox="0 0 10 14" aria-hidden="true"><path d="M6 0L0 8h4l-1 6 7-9H6z" fill="currentColor" /></svg>
    </span>
  );
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const RANGE_NAMES: Record<string, string> = {
  'melee': 'Melee', 'very-close': 'Very Close', 'close': 'Close', 'far': 'Far', 'very-far': 'Very Far',
};

/** Full-screen page with a title bar (rests, level up, pickers, vault). */
export function Page({ title, onClose, closeLabel = 'Close', children, actions }: {
  title: string; onClose: () => void; closeLabel?: string; children: ReactNode; actions?: ReactNode;
}) {
  return (
    <div className="page">
      <header className="page-head">
        <h1>{title}</h1>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {actions}
          <button className="s-icon s-press" aria-label={closeLabel} onClick={onClose}><Icon d={ICONS.close} size={26} stroke={2.4} /></button>
        </span>
      </header>
      <main className="page-main">{children}</main>
    </div>
  );
}
