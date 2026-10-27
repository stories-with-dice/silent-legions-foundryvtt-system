# Changelog

## Unreleased

- Character creation wizard ("Create character" in the sheet header): attributes (3d6 in order or
  the optional 14/11/7 array), background (from the imported compendium, rolled, or custom),
  class and prime attribute, starting wealth, and all starting skill picks with the level-1
  limit. It rolls hit points, sets Expertise, and adds the background and level-1 class ability.
- Skills tab: every new character lists the 26 skills (untrained at level -1), in columns, with
  filters for all, trained, and class skills. "Bonus skills" adds a class's starting skills.
  The + button spends skill points at the book cost and checks the maximum skill level.
- The system creates a names-only "SL: Skills" compendium in each world. The PDF import replaces it.
- Drop a spell to learn it (Int/Occult vs 6 + level, Madness) and a discipline to learn it (1 skill
  point, 5 Madness, or free if innate). Discipline buttons raise a level and master a level.
- Level up into a new class checks the class's first two bonus skills.
- 0 HP sets the "Mortally wounded" status on a character and "Dead" on an NPC.
- Background skills "Artist" and "Persuasion" (book spellings) map to Art and Persuade.
- Skill points can go below 0 (a discipline learned by "spending ahead").

- RPG Keeper pack: each table has Keeper's filter fields: `origin` "Silent Legions", `settings`
  `["Modern", "Horror"]`, and an `output` for what it makes (aliens, gods, NPCs, and monsters are
  Entity; cults and pantheons are Group; Kelipot and location tags are Location; scenes and
  adventure templates are Adventure; the rest is Other). The old `tag` (the book chapter) is gone.
- RPG Keeper pack: the 243 book and helper tables and the 60 generators are now Keeper tables
  (a `tables` list in Keeper's table text format), so they roll in Keeper's Tables tab. They are
  no longer Compendium entries (231 entries now).
- RPG Keeper pack: monster abilities are `{ name, text }` objects (Keeper showed "undefined"
  for the old strings), and attacks use Keeper's format (`2 claw +3 (1d4)`).
- RPG Keeper pack: a branch row with no text of its own has no stray " — " before its lookup.

## 1.1.0

- Master tables: 22 generators and 38 generator steps that roll the book's tables together or
  branch from one table to the next (Dark Sorcery, Outer God, Alien Race, Kelipah, Cult,
  artifacts, Occult Grimoire, Adventure Template, Secret Adept, and more).
- Table results link to background items, delirium items, spells, and location tag pages.
- Every table result shows its table name in chat.
- Parser: independent side-by-side columns get their own names; record tables (Quality,
  Background) stay one table; no space before punctuation after a bold term ("Major. 1d3+1").
- RPG Keeper pack: helper tables and generators as entries with cross-links (534 entries).

## 1.0.0

- First public release. The "Release" GitHub workflow publishes `system.json` and
  `silent-legions.zip`; Foundry installs from the manifest URL
  `https://github.com/stories-with-dice/silent-legions-foundryvtt-system/releases/latest/download/system.json`.

## 0.1.0

- First version for Foundry VTT v13: character and NPC sheets, ten item types, skill checks,
  saves, attacks with Slaughter dice, Madness, Deliria, sorcery costs, rest, level up.
- "Import from PDF" dialog and `tools/extract.mjs` CLI: parse your PDF into world compendiums,
  an RPG Keeper content pack, or a JSON data file.
