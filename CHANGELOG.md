# Changelog

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
