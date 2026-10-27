# Changelog

## Unreleased

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
