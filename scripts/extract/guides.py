"""Character guides (suggested traits, weapons, armor, inventory and
description options) from the official character sheet PDFs.

The guide page has three columns; words are assigned to a column by their
x position and grouped into lines by baseline."""
from __future__ import annotations

import re
import pdfplumber

from textutil import slug

GUIDE_PAGES = {
    'core': {'bard': 1, 'druid': 5, 'guardian': 7, 'ranger': 10, 'rogue': 12,
             'seraph': 14, 'sorcerer': 16, 'warrior': 18, 'wizard': 20},
    'extra': {'assassin': 1, 'brawler': 4, 'warlock': 6, 'witch': 8},
}
TRAITS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge']
DESC_KEYS = {'Clothes that are': 'clothes', 'Eyes like': 'eyes', 'Body that’s': 'body',
             'Skin the color of': 'skin', 'Attitude like': 'attitude'}


def _columns(page) -> list[list[str]]:
    words = page.extract_words(keep_blank_chars=False, x_tolerance=1.5)
    bq = min(w['top'] for w in words if w['text'].upper().startswith('BACKGROUND'))
    top = min(w['top'] for w in words if w['text'] == 'SUGGESTED') - 1
    cols: list[list] = [[], [], []]
    for w in words:
        if not (top < w['top'] < bq - 2):
            continue
        c = 0 if w['x0'] < 235 else 1 if w['x0'] < 425 else 2
        cols[c].append(w)
    out = []
    for col in cols:
        rows: list[list] = []
        for w in sorted(col, key=lambda w: w['bottom']):
            if rows and w['bottom'] - rows[-1][0] <= 3.5:
                rows[-1][1].append(w)
            else:
                rows.append([w['bottom'], [w]])
        out.append([' '.join(w['text'] for w in sorted(ws, key=lambda w: w['x0'])) for _, ws in rows])
    return out


def _blocks(lines: list[str], heads: list[str]) -> dict[str, str]:
    out: dict[str, list[str]] = {}
    cur = None
    for l in lines:
        h = next((h for h in heads if l.upper().startswith(h)), None)
        if h:
            cur = h
            out[cur] = [l[len(h):].strip()] if l[len(h):].strip() else []
        elif cur:
            out[cur].append(l)
    return {k: ' '.join(v).strip() for k, v in out.items()}


def num(s: str) -> int:
    return int(s.replace('−', '-').replace('+', ''))


def _weapon(text: str, weapons: dict[str, dict], cls: str, flags: list[str]) -> dict | None:
    if not text:
        return None
    m = re.match(r'^(.+?) - (\w+) (Melee|Very Close|Close|Far|Very Far) - (d\d+(?:\+d?\d+)?) (phy|mag)(?: - (One|Two)-Handed)?', text)
    assert m, (cls, text)
    name, trait, rng, dmg, typ, hands = m.groups()
    w = weapons.get(slug(name))
    if w is None:
        # Brawler's Strike comes from the "I Am the Weapon" class feature.
        return {'id': None, 'name': name, 'trait': trait.lower(), 'range': slug(rng), 'damage': dmg, 'type': typ}
    want = f"d{w['damage']['die']}" + (f"+{w['damage']['bonus']}" if w['damage']['bonus'] else '')
    ok = (w['trait'] == trait.lower() and w['range'] == slug(rng) and want == dmg
          and typ in w['damage']['type'] and (hands is None or (2 if hands == 'Two' else 1) == w['burden']))
    if not ok:
        flags.append(f'{cls}: guide lists "{text}" but the SRD table has {w["name"]} {w["trait"]} {w["range"]} {want} {w["damage"]["type"]} burden {w["burden"]}')
    return {'id': w['id'], 'name': w['name']}


def _armor(text: str, armor: dict[str, dict], cls: str, flags: list[str]) -> dict:
    m = re.match(r'^(.+?) - Thresholds (\d+) ?/ ?(\d+) - Score (\d+)', text)
    assert m, (cls, text)
    name, maj, sev, score = m.groups()
    a = armor[slug(name)]
    if (a['thresholds']['major'], a['thresholds']['severe'], a['score']) != (int(maj), int(sev), int(score)):
        flags.append(f'{cls}: guide armor "{text}" differs from SRD {a}')
    return {'id': a['id'], 'name': a['name']}


def _or(s: str) -> list[str]:
    return [p.strip() for p in re.split(r'\s+OR\s+', s) if p.strip()]


def _cap(s: str) -> str:
    return s[:1].upper() + s[1:]


def parse_page(page, cls: str, weapons: dict, armor: dict, flags: list[str]) -> dict:
    left, mid, right = _columns(page)
    lb = _blocks(left, ['SUGGESTED TRAITS', 'SUGGESTED PRIMARY WEAPON', 'SUGGESTED SECONDARY WEAPON', 'SUGGESTED ARMOR'])
    traits: dict[str, int] = {}
    for n, t in re.findall(r'([+−-]?\d) (\w+)', lb['SUGGESTED TRAITS']):
        traits[t.lower()] = num(n)
    assert sorted(traits) == sorted(TRAITS) and sorted(traits.values()) == [-1, 0, 0, 1, 1, 2], (cls, traits)
    primary = _weapon(lb['SUGGESTED PRIMARY WEAPON'], weapons, cls, flags)
    secondary = _weapon(lb.get('SUGGESTED SECONDARY WEAPON', ''), weapons, cls, flags)
    armor_ = _armor(lb['SUGGESTED ARMOR'], armor, cls, flags)

    mb = _blocks(mid, ['INVENTORY', 'TAKE:', 'THEN CHOOSE BETWEEN:', 'AND EITHER:', 'THEN DECIDE WHAT YOU'])
    take = re.split(r',\s*(?:and\s+)?|\s+and\s+', mb['TAKE:'])
    # "THEN DECIDE WHAT YOU CARRY YOUR SPELLS IN:" (Bard, Wizard) or
    # "THEN DECIDE WHAT YOU USE FOR YOUR CRAFT:" (Witch).
    carrier = re.match(r'^(.*?):\s*(.*)$', mb.get('THEN DECIDE WHAT YOU', ''))
    prompt, spells = (('What you ' + carrier.group(1).lower()), carrier.group(2)) if carrier else ('', '')
    inventory = {
        'take': [_cap(t.strip()) for t in take if t.strip()],
        'chooseOne': [_cap(x) for x in _or(mb['THEN CHOOSE BETWEEN:'])],
        'classItem': [_cap(x) for x in _or(mb['AND EITHER:'])],
        'spellCarrier': [s.strip() for s in spells.rstrip('.').split(',') if s.strip() and s.strip() != 'etc'],
        'spellCarrierPrompt': prompt,
    }

    desc: dict[str, list[str]] = {}
    cur = None
    for l in right:
        k = next((k for k in DESC_KEYS if l.startswith(k + ':')), None)
        if k:
            cur = DESC_KEYS[k]
            desc[cur] = [l[len(k) + 1:].strip()]
        elif cur:
            desc[cur].append(l)
    description = {k: [x.strip() for x in ' '.join(v).split(',') if x.strip()] for k, v in desc.items()}
    assert list(description) == list(DESC_KEYS.values()), (cls, description)

    return {'source': 'guide', 'traits': {t: traits[t] for t in TRAITS}, 'primary': primary,
            'secondary': secondary, 'armor': armor_, 'inventory': inventory, 'description': description}


def parse(core_pdf: str, extra_pdf: str, weapons: list[dict], armor: list[dict], flags: list[str]) -> dict[str, dict]:
    wmap = {w['id']: w for w in weapons if w['tier'] == 1}
    amap = {a['id']: a for a in armor if a['tier'] == 1}
    out: dict[str, dict] = {}
    for key, path in (('core', core_pdf), ('extra', extra_pdf)):
        with pdfplumber.open(path) as pdf:
            for cls, idx in GUIDE_PAGES[key].items():
                head = pdf.pages[idx].extract_words()[0]['text']
                assert head.lower() == cls, (cls, head)
                out[cls] = parse_page(pdf.pages[idx], cls, wmap, amap, flags)
    return dict(sorted(out.items()))
