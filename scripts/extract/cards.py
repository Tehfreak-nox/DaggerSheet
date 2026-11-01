"""Domain cards from the SRD appendix "Domain Card Reference" (pp. 206–224)."""
from __future__ import annotations

import re

from pdftext import Line
from textutil import bold_to_md, join, slug, title

DOMAINS = ['Arcana', 'Blade', 'Bone', 'Codex', 'Grace', 'Midnight', 'Sage', 'Splendor', 'Valor', 'Dread']
HEAD = re.compile(r'^(?:\*\*)?Level (\d+) (\w+) (Ability|Spell|Grimoire)(?:\*\*)?$')
RECALL = re.compile(r'^(?:\*\*)?Recall Cost: (\d+)(?:\*\*)?$')


def parse(lines: list[Line]) -> list[dict]:
    lines = [l for l in lines if 206 <= l.page <= 224]
    cards: list[dict] = []
    cur: dict | None = None
    body: list[Line] = []
    domain = None

    def close():
        if cur is not None:
            cur['text'] = bold_to_md(join(body))
            cards.append(cur)

    i = 0
    while i < len(lines):
        l = lines[i]
        m = re.match(r'^([A-Z]+) DOMAIN$', l.text)
        if l.style.startswith('H') and m:
            domain = m.group(1).title()
            i += 1
            continue
        nxt = lines[i + 1] if i + 1 < len(lines) else None
        if l.style == 'B11' and nxt and HEAD.match(nxt.text):
            close()
            body = []
            lvl, dom, typ = HEAD.match(nxt.text).groups()
            rc = RECALL.match(lines[i + 2].text)
            assert rc, lines[i + 2]
            name = title(l.text)
            cur = {
                'id': slug(dom + ' ' + l.text),
                'name': name,
                'domain': dom.lower(),
                'level': int(lvl),
                'type': typ.lower(),
                'recallCost': int(rc.group(1)),
            }
            i += 3
            continue
        if cur is not None and not (l.style.startswith('H') and l.page == 206 and l.top < 160):
            body.append(l)
        i += 1
    close()
    return cards
