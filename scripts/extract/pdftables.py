"""Positional table extraction for the SRD equipment and loot tables.

A table starts at a header row set in the small Eveleth face ("Name Trait
Range …"). Column boundaries come from the header words' x positions; every
following word is assigned to the right-most column whose header starts at
or left of it. Rows are grouped into records by a key column (the first cell
that is only filled on a record's first line, e.g. Trait or ROLL).
"""
from __future__ import annotations

import re

import pdfplumber

HEADER_WORDS = {'Name', 'Trait', 'Range', 'Damage', 'Burden', 'Feature', 'Tier',
                'Thresholds', 'Score', 'ROLL', 'Roll', 'LOOT', 'Loot', 'description'}


def _kind(w) -> str:
    f = w['fontname'].split('+')[-1]
    if 'Eveleth' in f:
        return 'H8' if w['size'] < 10 else 'H'
    if 'BoldItalic' in f:
        return 'BI'
    if 'Bold' in f:
        return 'B11' if w['size'] >= 10 else 'B'
    if 'Italic' in f:
        return 'I'
    return 'R'


def _lines(page):
    ws = page.extract_words(extra_attrs=['fontname', 'size'], x_tolerance=1.5)
    ws.sort(key=lambda w: (w['top'], w['x0']))
    rows: list[list] = []
    for w in ws:
        w['k'] = _kind(w)
        if rows and abs(rows[-1][0] - w['top']) < 3:
            rows[-1][1].append(w)
        else:
            rows.append([w['top'], [w]])
    for r in rows:
        r[1].sort(key=lambda w: w['x0'])
    return rows


def raw_tables(path: str, first_page: int, pages: range | None = None):
    """Yield {'ctx', 'page', 'cols': [(name, x0)], 'rows': [{'top', 'cells', 'fonts'}]}."""
    ctx: dict = {}
    table = None
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages):
            pg = first_page + i
            if pages is not None and pg not in pages:
                continue
            for top, ws in _lines(page):
                if top > 750:
                    continue
                ks = {w['k'] for w in ws}
                text = ' '.join(w['text'] for w in ws)
                if ks == {'H'}:
                    if table and table['rows']:
                        yield table
                    table = None
                    if re.match(r'TIER \d', text):
                        ctx['tier'] = text
                    else:
                        ctx = {'section': text}
                    continue
                if ks == {'B11'}:
                    if table and table['rows']:
                        yield table
                    table = None
                    ctx['sub'] = text
                    continue
                if 'H8' in ks:
                    if table and table['rows']:
                        yield table
                    cols: list[list] = []
                    for w in (w for w in ws if w['k'] == 'H8'):
                        if cols and w['text'] not in HEADER_WORDS:
                            cols[-1][0] += ' ' + w['text']
                        else:
                            cols.append([w['text'], w['x0']])
                    if table and not table['rows'] and table['page'] == pg and 0 < top - table['last'] < 14:
                        # Two-line header ("Base Base" / "Thresholds Score"): keep the lower line.
                        pass
                    table = {'ctx': dict(ctx), 'page': pg, 'cols': [tuple(c) for c in cols], 'rows': [], 'last': top}
                    continue
                if table is None:
                    continue
                if table['rows'] and top - table['last'] > 40:
                    yield table
                    table = None
                    continue
                table['last'] = top
                xs = [c[1] for c in table['cols']]
                cells = [''] * len(xs)
                fonts = [''] * len(xs)
                for w in ws:
                    j = max([k for k, x in enumerate(xs) if w['x0'] >= x - 4] or [0])
                    t = w['text']
                    if w['k'] == 'BI':
                        t = '__' + t + '__'
                    cells[j] = (cells[j] + ' ' + t).strip()
                    fonts[j] = fonts[j] or w['k']
                table['rows'].append({'top': round(top), 'cells': cells, 'fonts': fonts})
            if table:
                if table['rows']:
                    yield table
                # A table continues onto the next page under a repeated header.
                table = None
    if table and table['rows']:
        yield table


def records(table: dict, key: int, group: slice | None = None) -> list[list[str]]:
    """Group a table's rows into records. A new record starts on any row whose
    `key` column (relative to `group`) is non-empty. Cells are joined with spaces."""
    out: list[list[str]] = []
    for row in table['rows']:
        cells = row['cells'][group] if group else row['cells']
        if not any(cells):
            continue
        if cells[key] or not out:
            out.append(list(cells))
        else:
            for j, c in enumerate(cells):
                if c:
                    out[-1][j] = (out[-1][j] + ' ' + c).strip()
    return out
