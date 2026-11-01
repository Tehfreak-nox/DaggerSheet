"""Ancestries (SRD pp. 32–38) and communities (pp. 38–42)."""
from __future__ import annotations

import re

from classes import split_features
from pdftext import Line
from textutil import join, plain, slug, title

ELEMENTAL = {'EARTHKIN', 'EMBERKIN', 'SKYKIN', 'TIDEKIN'}


def _chunks(lines: list[Line]) -> list[tuple[str, list[Line]]]:
    out: list[tuple[str, list[Line]]] = []
    for l in lines:
        if l.style == 'H12':
            out.append((l.text, []))
        elif l.style == 'H17':
            out.append(('', []))
        elif out:
            out[-1][1].append(l)
    return out


def ancestries(lines: list[Line]) -> tuple[list[dict], dict]:
    sec = [l for l in lines if 32 <= l.page <= 38]
    stop = next(i for i, l in enumerate(sec) if l.style == 'H17' and l.text == 'COMMUNITIES')
    out, mixed = [], {}
    for head, body in _chunks(sec[:stop]):
        if head in ('', 'ANCESTRY FEATURES', 'ELEMENTAL KIN'):
            continue
        if head == 'MIXED ANCESTRY':
            mixed = {'id': 'mixed', 'name': 'Mixed Ancestry', 'text': join(body).replace('__', '**')}
            continue
        i = next(i for i, l in enumerate(body) if l.style == 'B11' and plain(l.text).startswith('ANCESTRY FEATURE'))
        feats = split_features(body[i + 1:])
        assert len(feats) == 2 and all(f['name'] for f in feats), (head, feats)
        a = {'id': slug(head), 'name': title(head), 'description': plain(join(body[:i])), 'features': feats}
        if head in ELEMENTAL:
            a['group'] = 'Elemental Kin'
        out.append(a)
    return out, mixed


def communities(lines: list[Line]) -> list[dict]:
    sec = [l for l in lines if 38 <= l.page <= 42]
    start = next(i for i, l in enumerate(sec) if l.style == 'H17' and l.text == 'COMMUNITIES')
    stop = next(i for i, l in enumerate(sec) if l.style == 'H17' and l.text == 'TRANSFORMATIONS')
    out = []
    for head, body in _chunks(sec[start:stop]):
        if not head:
            continue
        i = next(i for i, l in enumerate(body) if l.style == 'B11' and plain(l.text) == 'COMMUNITY FEATURE')
        desc = [l for l in body[:i] if l.style != 'I']
        adj_text = plain(join([l for l in body[:i] if l.style == 'I']))
        m = re.match(r'^\w+ are often (.+)\.$', adj_text)
        assert m, (head, adj_text)
        adjectives = [a.strip() for a in re.split(r',\s*(?:and\s+)?', m.group(1))]
        feats = split_features(body[i + 1:])
        assert len(feats) == 1 and feats[0]['name'], (head, feats)
        out.append({'id': slug(head), 'name': title(head), 'description': plain(join(desc)),
                    'adjectives': adjectives, 'feature': feats[0]})
    return out
