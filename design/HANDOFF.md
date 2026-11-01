# Daggerheart character sheet — handoff

## What's here
design/            The canvas files (each *.dc.html is one screen; HTML + a small JS logic class)
  V2Sheet.dc.html    Page 1 · Character (rolls, Adv/Dis, experiences arm Hope, features/cards interactive, ⋮ rests + level up)
  V2Equip.dc.html    Page 2 · Equipment (hit/damage rolls, Focus Runes +1, tap-only gold w/ rollover + safe, potions)
  V2Catalog.dc.html  Add weapon/armor/item picker (tiers 1–4, ★ recommended, custom tab); V2AddArmor/V2AddItem wrap it
  V2Vault.dc.html    Cards by level 1–10, loadout/vault swap rules
  Create.dc.html     11-step character creation, live themed preview
  sheet.css          Base look (white page, Barlow, banner titles). Accents read var(--accent)
  persona.css        Theme layers: data-cls + data-sub → colours; .fx-<community> → Features frame
  canvas.json        Canvas index (page "v2" = current; "v1" = old explorations)
  lv1cards.json      All 30 level-1 domain cards (SRD text)

## Theme system
- Class  → header band colour (--c-deep) + accent; emblem paths in themeTables().EM
- Subclass → accent a/b + emblem frame (ring / diamond)
- Ancestry → SVG ornaments left/right of the page tabs (themeTables().ORN; mixed = left/right)
- Community → Features panel material (.fx-loreborne scroll, .fx-orderborne tablet, …)
- Rule: textures only on frames, never behind numbers/text.

## Rules data (from DH SRD 2026-08-25)
Spellcast traits per subclass, class HP/Evasion/domains, T1 weapons & armor, tier weapon
bonuses (+3/+6/+9 primary, +2/+4/+6 secondary), downtime moves, level-up steps, gold
(10 coins→handful→bag→chest, max 1 chest).
Recommended trait spreads / armor are app suggestions (not in the SRD).

## Next steps
1. Real app shell: one shared character state (pages are separate mockups today).
2. Load every class's features / hope feature / cards (currently Sorcerer sample on the sheet).
3. Wire Create → Sheet; persist characters.
4. Refine ornament + frame art; add Darrington Press Community Gaming License attribution.
