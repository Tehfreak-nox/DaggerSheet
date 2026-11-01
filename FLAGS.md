# Data flags

Things in the source PDFs that were ambiguous, inconsistent, or not stated in
the SRD text, and the call that was made. Each one is open for review.

## Values taken from the character sheets, not SRD text

| Value | Source | Notes |
|---|---|---|
| Advancement slots per tier (traits 3, HP 2, Stress 2, Experiences 1, domain card 1, Evasion 1; tier 3–4 add subclass 1, Proficiency 2, Multiclass 2) | Checkbox graphics on the Bard guide page | Counted automatically in `rules.py::sheet_slots` and asserted, so a sheet revision will fail the build instead of drifting. Proficiency and Multiclass are "black box" options: one pick costs both slots. |
| 12 Hit Point slots and 12 Stress slots, 6 Proficiency circles | Sheet layout | The SRD only says Armor Score can't exceed 12. |
| Domain-card advancement "up to level 4" (tier 2) and "up to level 7" (tier 3) | Sheet text | The SRD says "at or below your level", which gives the same cap. |

## Inconsistencies in the SRD

- **Mythic Hybrid** prints its attack as `Strength Melee d12+10 phy` (trait before range). Every other Beastform prints range first. The parser accepts both orders.
- **Arcane-Frame Wheelchair** uses `Spellcast` as its trait. It's stored as `trait: "spellcast"` and means "your Spellcast trait".
- **Legendary Beast** and **Mythic Beast** have no fixed stats: you pick a lower-tier form and gain the listed bonuses. They're stored with `trait: null`, `attack: null` and the rules in their `Evolved` feature.
- **Page 23 (Rogue)**: a line of the Syndicate's *Contacts Everywhere* option overlaps the "FOUNDATION FEATURE" label in the PDF's text layer. Fixed by grouping text by baseline and ignoring space glyphs when measuring column gaps; covered by the class tests.

## Suggestions

- **All 13 classes have official character guides.** The extra sheet PDF (`CharacterGuidesAndSheetsTile_HF_2026-07-23.pdf`) covers Assassin, Brawler, Warlock and Witch, so the mockup's "App suggestion" fallback isn't needed. The official spreads differ from the mockup's `REC` table for 10 entries (assassin a/b, brawler, druid, guardian, seraph, warlock, warrior, witch a, wizard). `guides.json` uses the official ones.
- **Witch** has one guide for both subclasses, and it leads with Instinct (+2 Instinct, +1 Knowledge). That fits Moon (Instinct), but Hedge casts with Knowledge. **Decision needed:** use the official spread for both subclasses, or offer a Hedge variant labelled "App suggestion"?
- The guide's **Brawler** primary weapon is *Brawler's Strike* from the "I Am the Weapon" class feature. It's not a table weapon, so it's stored with `id: null` and its stats inline.

## Not extracted (out of scope for now)

- Transformations (SRD pp. 42–45: Demigod, Ghost, Reanimated, Shapeshifter, Vampire, Werewolf).
- GM material, adversaries, environments, campaign frames.
- Background and connection questions come from the SRD class pages. The guides print the same questions; they aren't extracted a second time.

## Planned

- Structured `mechanics` hooks per feature and card (spend Hope, mark Stress, uses per rest, token pools, roll buttons). These will be derived in Milestone 4, when the interactive Features panel is built, so each hook is tested against a UI that uses it.
