# DaggerSheet roadmap

Free, fan-made, and meant to stay free. Live at
https://tehfreak-nox.github.io/DaggerSheet.app/

## Done: working today

**Characters**
- Character creation in 11 steps with the official character guide's suggestions; pronouns; mixed ancestries; live preview.
- The sheet restyles itself by class, subclass, ancestry and community; light and dark mode; die shapes (d4 to d20).
- Level 1 to 10: tier achievements, every advancement, multiclassing, domain cards, subclass upgrades.
- Short and long rests with downtime moves; death moves (Blaze of Glory, Avoid Death with scars, Risk It All).
- Gold, safe, items and consumables; vault and loadout with Recall costs.
- Saved on the device, with Export and Import; synced to your account when opened from claude.ai.

**Rules running in the background**
- Stats computed from everything equipped and chosen: armor, weapons, ancestry, community, subclass and card passives (e.g. Bare Bones, Focus Runes, Untouchable).
- Duality rolls with advantage, Experiences, critical damage, reaction rolls.
- Every card and feature gets buttons from its text, by one rule set:
  - pay and roll in one tap;
  - **arm** what changes your next roll or damage roll (Tusks, Rage Up, Smite, Follow-Up, Pack Hunting);
  - amount pickers for "any number of";
  - use boxes and tokens, refilling at rests.
- Result-card follow-ups: rerolls, swap the dice, make it a roll with Hope, Slayer Dice, Glancing Blow and more.
- Lasting effects: Full Surge, Frenzy, Force of Nature, the Warrior and Rogue Hope features.
- Counters: the Unstoppable Die, Wild Surge, Zone of Protection, Slayer Dice.
- Druid Beastform: every form, including Evolved and Hybrid; Evolution.
- Tested by unit and simulation tests: all 9,360 class, subclass, ancestry and community combinations levelled to 10, plus browser sweeps of every card and feature.

**Played and tuned with:** Kane of Eleven (Sorcerer), Tank (Guardian), Grum Mudrunner (Warrior).

## Phase 1: everything works on its own

The goal: a player who doesn't read the rules still gets them right, and the GM has nothing extra to track.

1. **Full SRD pass, word for word**: every class, subclass, ancestry, community and domain card, every weapon and armor on every tier, every item and consumable, and the transformations.
2. **Make each one automatic** where possible, one tap (arm or pay-and-roll) where not.
3. **Flag every outlier** that fits no existing mechanic; the owner chooses how it should work, and that choice becomes a new mechanic reused for similar cards.
4. **Class resources** that have no counters yet: Focus (Martial Artist), Favor and the Patron Die (Warlock), Prayer Dice (Seraph), the Combo Die (Brawler), martial stances, Elemental Channel, Lunar Phases, Strange Patterns.
5. **Transformations** (Demigod, Ghost, Reanimated, Shapeshifter, Vampire, Werewolf):
   - a **Transformation** option in the sheet menu, next to the rests and Level up;
   - applied passively everywhere;
   - shown on the Heritage tab only once chosen.
6. **Big test run**:
   - simulate every combination (thousands of characters) with the new rules;
   - try to break them;
   - fix what breaks before publishing.

## Phase 2: online campaigns (still free)

Needs a small online service with accounts and live updates (e.g. Supabase or Firebase on a free tier).

- **Player and GM modes**:
  - **Player** lists your characters and character creation;
  - **GM** lists your campaigns and encounters.
- **Campaigns**:
  - the GM creates a campaign and shares a join link or code;
  - players pick one of their characters to join.
- **The GM sees the party live**, with every change players make visible.
- **Limited GM powers on a character**: give items, gold or Hope, and help during play. Everything else stays the player's.

## Phase 3: the GM's side

- **Adversaries** from the SRD:
  - sorted by tier (1–4) and type (Minion, Solo, Social, Bruiser, Support, Horde, Leader, and so on);
  - each one as a card with tap-to-roll attacks, damage and features;
  - HP and Stress tracking.
- **Encounter builder** using Battle Points:
  - (number of PCs × 3) + 2, checked against the current SRD;
  - point costs per adversary type;
  - the SRD's adjustments (easier, harder, lower-tier adversaries, and so on) applied for you;
  - a running "points left" so the GM can build an encounter in 15 minutes before a session.
- **Environments**: environment cards the GM can drop into a scene.

## Later

- **Void playtest content**: optional experimental classes and options, once Phase 1 is solid, and kept up to date with SRD changes.
