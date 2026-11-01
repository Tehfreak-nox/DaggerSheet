# DaggerSheet

A digital Daggerheart character sheet with cards, tokens and items. It's a
mobile-first installable web app (React + TypeScript + Vite) and saves
characters locally.

## Status

| Milestone | State |
|---|---|
| 1. Rules data extracted from the PDFs, with types and tests | done |
| 2. Rules engine (pure functions and tests) | done |
| 3. App shell, store, persistence, theme | next |
| 4. Character page | |
| 5. Equipment, pickers, vault | |
| 6. Create flow | |
| 7. Rests and level up | |
| 8. Polish | |

## Layout

```
design/            Design handoff: interactive mockups (*.dc.html), CSS, HANDOFF.md
sources/           Source PDFs (SRD 2.0 in four parts, official character sheets and guides)
scripts/extract/   Python extraction pipeline: PDFs -> src/data/*.json
src/data/          Generated rules data, TypeScript types (types.ts), typed index, tests
src/rules/         Rules engine: derived stats, creation, rolls, damage, rests, gold, level up, validation
FLAGS.md           Ambiguities and decisions found while extracting
```

## Data

`src/data/*.json` is generated; don't edit it by hand.

| File | Contents |
|---|---|
| `classes.json` | 13 classes: domains, starting HP/Evasion, class items, Hope feature, features, 2 subclasses each (Spellcast trait, foundation/specialization/mastery), background and connection questions, extras (Druid Beastforms, Brawler martial stances, Ranger companion, Warlock patron spheres) |
| `guides.json` | Official character guide for each class: suggested traits, weapons, armor, inventory, description options |
| `ancestries.json`, `mixedAncestry.json`, `communities.json` | 24 ancestries, the mixed ancestry rule, 15 communities |
| `domainCards.json` | 210 domain cards (10 domains × 21, levels 1–10) |
| `weapons.json`, `armor.json`, `loot.json` | Tier 1–4 primary and secondary weapons (incl. combat wheelchairs), armor, items and consumables |
| `rules.json` | Creation defaults, caps, downtime moves, leveling (tier achievements, advancement slots), gold |

To regenerate the data (needs Python 3.10+):

```sh
pip install -r scripts/extract/requirements.txt
npm run data
npm test
```

The pipeline reads the PDFs in column order with font styling kept (feature
names are bold italic in the SRD, so they become `__Name:__` and are split
reliably). Equipment tables are read by word position. Every value that
can't be read straight from text is asserted against the PDF in the build or
in `src/data/data.test.ts`, and anything ambiguous is listed in `FLAGS.md`.

## Rules engine and simulation tests

`src/rules` is pure TypeScript with no UI: every function takes a character
and returns a new one, and dice take an injectable RNG.

`npm test` runs, besides unit tests for each rule:

- **All 9,360 combinations** (13 classes × 2 subclasses × 24 ancestries × 15
  communities). Each is created from its class guide, then levelled 1 → 10
  with random legal choices (traits, HP/Stress, Experiences, Evasion, domain
  cards, subclass upgrades, Proficiency, multiclassing, Vitality/Master of
  the Craft picks). At every level it also rolls every trait, attacks with
  both weapons, takes damage, rests, and swaps gear. An independent checker
  (`validate.ts`) recomputes the rules after every step.
- **All 552 mixed ancestries**, levelled to 10.
- **Every legal pair of starting cards** for every subclass (395 sets).
- **Forced paths**: every subclass to mastery, every class multiclassing into
  every other class and domain, Proficiency 6, HP and Stress to 12.
- Coverage checks: across the runs every domain card gets taken, every
  advancement gets used and every subclass reaches mastery.

The checker was itself tested by planting bugs (cards one level too high, a
wrong subclass bonus, missing cross-outs); each made the suite fail.

## Development

```sh
npm install
npm test          # vitest
npm run typecheck
npm run dev
```

## License and attribution

This product includes materials from the Daggerheart System Reference
Document 2.0, © Critical Role, LLC, under the terms of the Darrington Press
Community Gaming (DPCGL) License. More information can be found at
https://www.daggerheart.com. There are no previous modifications by others.

Daggerheart and Darrington Press are trademarks of Critical Role, LLC. This
project is not affiliated with or endorsed by Critical Role or Darrington Press.
