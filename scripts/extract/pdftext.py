"""Column-aware, style-aware text extraction for the Daggerheart PDFs.

The SRD is a two-column layout. Each physical row of characters is split
into segments wherever there is a horizontal gap wider than GAP points; a
segment that starts right of SPLIT belongs to the right column. Lines are
then emitted left column first, then right column, page by page.

Inline styling is kept as light markup so feature names and emphasised
costs survive extraction:
    __bold italic__   (feature names: "__Rally:__ Once per session…")
    **bold**          ("**Spend a Hope**")
    _italic_
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import pdfplumber

GAP, SPLIT = 7.0, 300.0


@dataclass
class Line:
    page: int
    col: str      # 'L' | 'R'
    x0: float
    top: float
    style: str    # H<size> heading, B / B<size> bold, BI, I, R
    text: str

    def __str__(self) -> str:
        return f'{self.page}|{self.col}|{self.x0:.0f}|{self.top:.0f}|{self.style}|{self.text}'


def style_of(c) -> str:
    f, size = c['fontname'].split('+')[-1], c['size']
    if 'Eveleth' in f:
        return f'H{size:.0f}'
    if 'BoldItalic' in f:
        return 'BI'
    if 'Bold' in f or 'Black' in f:
        return 'B' if size < 10 else f'B{size:.0f}'
    if 'Italic' in f:
        return 'I'
    return 'R'


def _render(cs) -> tuple[str | None, str]:
    runs: list[list[str]] = []
    prev, pend = None, False
    for c in cs:
        if not c['text'].strip():
            pend = True
            continue
        st = style_of(c)
        sp = pend or (prev is not None and c['x0'] - prev['x1'] > c['size'] * 0.12)
        pend = False
        if runs and runs[-1][0] == st:
            runs[-1][1] += (' ' if sp else '') + c['text']
        else:
            if sp and runs:
                runs[-1][1] += ' '
            runs.append([st, c['text']])
        prev = c
    if not runs:
        return None, ''
    main = max(runs, key=lambda r: len(r[1].strip()))[0]
    uniform = all(st == main for st, t in runs if t.strip())
    out = ''
    for st, t in runs:
        if uniform or st == 'R' or st.startswith('H') or not t.strip():
            out += t
            continue
        lead, core, trail = re.match(r'(\s*)(.*?)(\s*)$', t, re.S).groups()
        if st == 'BI':
            fmt = '__{}__'
        elif st == 'I':
            fmt = '_{}_'
        else:
            fmt = '**{}**'
        out += lead + fmt.format(core) + trail
    return main, re.sub(r'\s+', ' ', out).strip()


def _base(c) -> float:
    # Group by baseline, not glyph top: faces in this PDF have different
    # ascents, so a bold-italic name sits ~3pt lower than the regular text
    # that follows it on the same line.
    return -c['matrix'][5]


def _rows(chars):
    chars = sorted(chars, key=lambda c: (_base(c), c['x0']))
    rows: list[list] = []
    for c in chars:
        for r in rows[-3:]:
            if abs(r[0] - _base(c)) < 2.5:
                r[1].append(c)
                break
        else:
            rows.append([_base(c), [c]])
    return rows


def page_lines(page, pg: int, split: float = SPLIT) -> list[Line]:
    cols: dict[str, list] = {'L': [], 'R': []}
    for base, cs in _rows(page.chars):
        top = page.height + base  # baseline, measured from the top of the page
        cs.sort(key=lambda c: c['x0'])
        segs, cur, right = [], [], None
        for c in cs:
            ink = bool(c['text'].strip())
            if cur and ink and right is not None and c['x0'] - right > GAP:
                segs.append(cur)
                cur, right = [], None
            cur.append(c)
            if ink:
                right = c['x1'] if right is None else max(right, c['x1'])
        if cur:
            segs.append(cur)
        for seg in segs:
            ink = [c for c in seg if c['text'].strip()]
            if ink:
                col = 'R' if ink[0]['x0'] >= split else 'L'
                cols[col].append((top, ink[0]['x0'], seg))
    out: list[Line] = []
    for col in 'LR':
        merged: list[list] = []
        for top, x0, seg in sorted(cols[col], key=lambda t: (round(t[0]), t[1])):
            if merged and abs(merged[-1][0] - top) < 2.5:
                merged[-1][2].extend([{'text': ' ', 'x0': 0, 'x1': 0}] + seg)
            else:
                merged.append([top, x0, list(seg)])
        for top, x0, seg in merged:
            st, text = _render(seg)
            if text:
                out.append(Line(pg, col, x0, top, st, text))
    return out


def pdf_lines(path: str, first_page: int = 1, split: float = SPLIT) -> list[Line]:
    with pdfplumber.open(path) as pdf:
        out: list[Line] = []
        for i, p in enumerate(pdf.pages):
            out.extend(page_lines(p, first_page + i, split))
        return out


FOOTER = re.compile(r'^(\*\*)?(\d+ )?(\*\*)?Daggerheart SRD(\*\*)?( \d+)?$|^\d{1,3}$')


def strip_footers(lines: list[Line]) -> list[Line]:
    return [l for l in lines if not FOOTER.match(l.text)]
