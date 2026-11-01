# DaggerSheet

A free, fan-made character sheet for **Daggerheart**: create characters,
roll Duality Dice, track Hope, Stress, Hit Points, armor, gold, items and
domain cards, rest, and level up from 1 to 10. Mobile-first, tap-only, and
installable on your phone's home screen.

**Open it: https://tehfreak-nox.github.io/DaggerSheet/**

## Using it

- No account needed. Characters are saved in your browser on that device.
- To install it: on iPhone, **Share → Add to Home Screen**; on Android,
  **⋮ → Add to Home screen** (or **Install app**).
- To move characters to another device or back them up, use **Export** and
  **Import** on the home screen.

## What it does

- **Character creation** in 11 steps, with the official character guide's
  suggestions one tap away and a live preview of your sheet.
- **Your sheet restyles itself**: class colours and emblem, subclass frame,
  ancestry ornaments, community frame, light and dark mode.
- **Every card and feature has tap controls** read from its rules text: pay
  Hope or Stress and roll in one tap, arm bonuses for your next roll or
  damage roll, track uses per rest and tokens.
- **Rolls** with Hope and Fear, advantage, Experiences, critical damage, and
  the rerolls and follow-ups your features allow.
- **Druid Beastforms**, death moves, rests with downtime moves, the gold
  tracker, the vault and loadout, and level up with every advancement and
  multiclassing.

## Development

```sh
npm install
npm test          # unit and simulation tests (vitest)
npm run typecheck
npm run dev       # local dev server
npm run build     # production build into dist/
```

Every push to `main` runs the tests, builds the app and publishes it to
GitHub Pages (`.github/workflows/pages.yml`). `npm run build:artifact` makes a
single-file build (`dist-artifact/daggersheet.html`) for a claude.ai artifact.

## Layout

```
design/            Design handoff: interactive mockups (*.dc.html), CSS, HANDOFF.md
public/            App manifest and icons (home-screen install)
.github/workflows/ Build, test and publish to GitHub Pages
sources/           Source PDFs, not in the repo: put the SRD 2.0 PDFs and the official character
                   sheets and guides PDF here to regenerate the data with `npm run data`
scripts/extract/   Python extraction pipeline: PDFs -> src/data/*.json
src/data/          Generated rules data, TypeScript types (types.ts), typed index, tests
src/rules/         Rules engine: derived stats, creation, rolls, damage, rests, gold, level up, validation
src/app/           Character store (local + account sync), navigation, table-time state (armed rolls)
src/screens/       Home, Create, Character, Equipment, Picker, Vault, Rest, Level up, About
src/ui/            Header, roll overlay, feature cards with tap controls, shared pieces
src/styles/        sheet.css and persona.css from the design handoff, app.css for layout
FLAGS.md           Rules decisions, ambiguities, and features the app doesn't automate yet
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

## License and attribution

This product includes materials from the Daggerheart System Reference
Document 2.0, © Critical Role, LLC, under the terms of the Darrington Press
Community Gaming (DPCGL) License. More information can be found at
https://www.daggerheart.com. There are no previous modifications by others.

Daggerheart and Darrington Press are trademarks of Critical Role, LLC. This
project is not affiliated with or endorsed by Critical Role or Darrington Press.
