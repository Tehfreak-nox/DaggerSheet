"""Core rules the app needs as data: character creation defaults, caps,
downtime moves, leveling and gold (SRD pp. 4–8, 49, 52–54, 84) plus the
advancement slot counts printed on the official character sheets."""
from __future__ import annotations

import re
from collections import defaultdict

import pdfplumber

from pdftext import Line
from textutil import join, plain, slug


def _text(lines: list[Line], pages: range, col: str | None = None) -> str:
    return plain(join([l for l in lines if l.page in pages and (col is None or l.col == col)]))


def need(pattern: str, text: str, what: str) -> re.Match:
    m = re.search(pattern, text, re.S)
    assert m, f'SRD text for {what!r} not found: {pattern}'
    return m


def creation(lines: list[Line]) -> dict:
    t = _text(lines, range(4, 7))
    need(r'Every PC starts with 6 Stress slots', t, 'starting stress')
    need(r'Each PC starts with 2 Hope', t, 'starting hope')
    need(r'Proficiency is 1', t, 'starting proficiency')
    need(r'Assign the modifiers \+2, \+1, \+1, \+0, \+0, −1', t, 'trait modifiers')
    need(r'Choose two level one cards', t, 'starting domain cards')
    # Example Experiences, grouped by the bold category labels.
    examples: dict[str, list[str]] = {}
    sec = [l for l in lines if l.page == 5 and l.col == 'R']
    start = next(i for i, l in enumerate(sec) if plain(l.text) == 'EXAMPLE EXPERIENCES')
    body = plain(' '.join(l.text for l in sec[start + 1:]))
    for cat, items in re.findall(r'(Backgrounds|Characteristics|Specialties|Skills|Phrases): (.*?)(?= (?:Characteristics|Specialties|Skills|Phrases):|$)', body):
        examples[cat.lower()] = [i.strip() for i in items.split(',') if i.strip()]
    assert len(examples) == 5, examples
    exp = _text(lines, range(5, 7))
    need(r'two Experiences', exp, 'experience count')
    return {
        'level': 1,
        'stress': 6,
        'hope': 2,
        'proficiency': 1,
        'traitModifiers': [2, 1, 1, 0, 0, -1],
        'experiences': {'count': 2, 'modifier': 2},
        'domainCards': {'count': 2, 'level': 1},
        'startingInventory': {
            'take': ['A torch', '50 feet of rope', 'Basic supplies', 'A handful of gold'],
            'chooseOne': ['Minor Health Potion', 'Minor Stamina Potion'],
            'notes': ['One of the class-specific items listed on your character guide',
                      'If applicable, whichever class-specific item you selected to carry your spells'],
        },
        'exampleExperiences': examples,
    }


def caps(lines: list[Line]) -> dict:
    t = _text(lines, range(1, 85))
    need(r'maximum of 6 Hope', t, 'max hope')
    need(r'Armor Score can’t exceed 12', t, 'max armor score')
    need(r'up to five domain cards', t, 'loadout size')
    return {
        'hope': 6,
        'armorScore': 12,
        'loadout': 5,
        # Hit Point and Stress tracks have 12 slots on the official sheet.
        'hitPointSlots': 12,
        'stressSlots': 12,
        'proficiency': 6,  # six Proficiency circles on the official sheet
        'consumablesEach': 5,
    }


def _moves(text: str) -> list[dict]:
    out = []
    for name, body in re.findall(r'• ([^:•]+): (.*?)(?=\n• |\n[A-Z]|$)', text, re.S):
        out.append({'id': slug(name), 'name': name.strip(), 'text': ' '.join(body.split())})
    return out


def downtime(lines: list[Line]) -> dict:
    sec = [l for l in lines if l.page == 52 and l.col == 'R']
    start = next(i for i, l in enumerate(sec) if l.text == 'DOWNTIME')
    t = join(sec[start + 1:])
    short = need(r'A \*\*short rest\*\* lasts(.*?)(?=\*\*At the end of a short rest)', t, 'short rest').group(1)
    long_ = need(r'A \*\*long rest\*\*(.*?)(?=At the end of a long rest)', t, 'long rest').group(1)
    p = plain(t)
    need(r'three short rests in a row, their next rest must be a long rest', p, 'short rest limit')
    need(r'up to two downtime moves', p, 'moves per rest')
    s_moves, l_moves = _moves(plain(short)), _moves(plain(long_))
    assert [m['name'] for m in s_moves] == ['Tend to Wounds', 'Clear Stress', 'Repair Armor', 'Prepare'], s_moves
    assert [m['name'] for m in l_moves] == ['Tend to All Wounds', 'Clear All Stress', 'Repair All Armor', 'Prepare', 'Work on a Project'], l_moves
    paras = [x.strip() for x in p.split('\n\n') if x.strip()]
    end_short = next(x for x in paras if x.startswith('At the end of a short rest'))
    end_long = next(x for x in paras if x.startswith('At the end of a long rest'))
    return {
        'movesPerRest': 2,
        'shortRestsBeforeLong': 3,
        'intro': paras[0] + '\n\n' + paras[1] + '\n\n' + paras[2],
        'short': {'moves': s_moves, 'end': end_short},
        'long': {'moves': l_moves, 'end': end_long},
    }


ADV_IDS = [
    ('traits', 'Gain a +1 bonus to two unmarked character traits and mark them.'),
    ('hitPoint', 'Permanently gain one Hit Point slot.'),
    ('stress', 'Permanently gain one Stress slot.'),
    ('experiences', 'Permanently gain a +1 bonus to two Experiences.'),
    ('domainCard', 'Choose an additional domain card of your level or lower from a domain you have access to.'),
    ('evasion', 'Permanently gain a +1 bonus to your Evasion.'),
    ('subclass', 'Take an upgraded subclass card. Then cross out the multiclass option for this tier.'),
    ('proficiency', 'Increase your Proficiency by +1.'),
    ('multiclass', 'Multiclass: Choose an additional class for your character, then cross out an unused “Take an upgraded subclass card” and the other multiclass option on this sheet.'),
]
ADV_START = {
    'traits': 'Gain a +1 bonus to two', 'hitPoint': 'Permanently gain one Hit Point',
    'stress': 'Permanently gain one Stress', 'experiences': 'Permanently gain a +1 bonus to two',
    'domainCard': 'Choose an additional domain card', 'evasion': 'Permanently gain a +1 bonus to your Evasion',
    'subclass': 'Take an upgraded subclass card', 'proficiency': 'Increase your Proficiency',
    'multiclass': 'Multiclass:',
}


def sheet_slots(sheet_pdf: str) -> dict[int, dict[str, int]]:
    """Count the advancement checkboxes printed beside each option on the
    Bard character guide (page 2). Each box is drawn as two small vector
    shapes (fill + outline)."""
    with pdfplumber.open(sheet_pdf) as pdf:
        p = pdf.pages[1]
        boxes = [c for c in p.curves + p.rects if 5 < c['x1'] - c['x0'] < 12 and 5 < c['bottom'] - c['top'] < 12]
        rows: dict[tuple, list] = defaultdict(list)
        for w in p.extract_words():
            if w['top'] > 540:
                rows[(round(w['top'] / 2) * 2, int(w['x0'] // 210))].append(w)
        out: dict[int, dict[str, int]] = {2: {}, 3: {}, 4: {}}
        seen: set = set()
        for (top, col), ws in sorted(rows.items(), key=lambda kv: (kv[0][1], kv[0][0])):
            text = ' '.join(w['text'] for w in ws)
            x0, t0, b0 = min(w['x0'] for w in ws), min(w['top'] for w in ws), max(w['bottom'] for w in ws)
            for key, start in ADV_START.items():
                if text.startswith(start) and (col, key) not in seen:
                    if key == 'experiences' and 'Evasion' in text:
                        continue
                    if key == 'traits' and 'character' not in text:
                        continue
                    if key == 'experiences' and 'Experiences' not in text and 'two' not in text:
                        continue
                    n = sum(1 for c in boxes if c['top'] < b0 + 1 and c['bottom'] > t0 - 1 and x0 - 70 < c['x0'] and c['x1'] <= x0 + 1)
                    out[col + 2][key] = n // 2
                    seen.add((col, key))
                    break
        return out


def leveling(lines: list[Line], sheet_pdf: str) -> dict:
    t = _text(lines, range(53, 55))
    need(r'At level 2, you gain a new Experience at \+2 and permanently increase your Proficiency by 1', t, 'tier 2 achievements')
    need(r'At level 5, you gain a new Experience at \+2, permanently increase your Proficiency by 1, and clear any marked traits', t, 'tier 3 achievements')
    need(r'At level 8, you gain a new Experience at \+2, permanently increase your Proficiency by 1, and clear any marked traits', t, 'tier 4 achievements')
    need(r'Choose any two advancements with at least one unmarked slot from your tier or below', t, 'two advancements')
    need(r'Increase all damage thresholds by 1', t, 'threshold step')
    need(r'Starting at level 5, you can choose multiclassing', t, 'multiclass level')
    slots = sheet_slots(sheet_pdf)
    expected = {'traits': 3, 'hitPoint': 2, 'stress': 2, 'experiences': 1, 'domainCard': 1, 'evasion': 1}
    assert slots[2] == expected, slots[2]
    upper = dict(expected, subclass=1, proficiency=2, multiclass=2)
    assert slots[3] == upper and slots[4] == upper, slots
    step = lambda n, head: plain(join(_section(lines, n, head)))  # noqa: E731
    return {
        'tiers': [{'tier': 1, 'levels': [1, 1]}, {'tier': 2, 'levels': [2, 4]},
                  {'tier': 3, 'levels': [5, 7]}, {'tier': 4, 'levels': [8, 10]}],
        'achievements': [
            {'level': 2, 'newExperience': 2, 'proficiency': 1, 'clearMarkedTraits': False},
            {'level': 5, 'newExperience': 2, 'proficiency': 1, 'clearMarkedTraits': True},
            {'level': 8, 'newExperience': 2, 'proficiency': 1, 'clearMarkedTraits': True},
        ],
        'advancementsPerLevel': 2,
        'advancements': [
            {'id': key, 'text': text,
             'cost': 2 if key in ('proficiency', 'multiclass') else 1,
             'minTier': 3 if key in ('subclass', 'proficiency', 'multiclass') else 2,
             'slots': {str(tier): slots[tier].get(key, 0) for tier in (2, 3, 4)}}
            for key, text in ADV_IDS
        ],
        'advancementRules': step(54, 'ADVANCEMENTS'),
        'thresholdIncrease': 1,
        'domainCardStep': step(54, 'DOMAIN CARDS'),
        'multiclass': {'minLevel': 5, 'text': step(54, 'MULTICLASSING')},
        'domainCardLevelLimits': {'2': 4, '3': 7, '4': 10},
    }


def _section(lines: list[Line], page: int, head: str) -> list[Line]:
    sec = [l for l in lines if l.page == page]
    i = next(i for i, l in enumerate(sec) if l.style.startswith('H') and l.text == head)
    out = []
    for l in sec[i + 1:]:
        if l.style.startswith('H'):
            break
        out.append(l)
    return out


def gold(lines: list[Line]) -> dict:
    t = _text(lines, range(84, 85), 'R')
    need(r'10 handfuls to 1 bag, and 10 bags to 1 chest', t, 'gold denominations')
    need(r'You can’t have more than 1 chest', t, 'chest cap')
    need(r'10 coins equal 1 handful', t, 'coins')
    return {
        'denominations': ['coins', 'handfuls', 'bags', 'chests'],
        'perNext': 10,
        'maxChests': 1,
        'coinsOptional': True,
        'text': t,
    }


def parse(lines: list[Line], sheet_pdf: str) -> dict:
    return {
        'creation': creation(lines),
        'caps': caps(lines),
        'downtime': downtime(lines),
        'leveling': leveling(lines, sheet_pdf),
        'gold': gold(lines),
    }
