# Silent Legions for Foundry VTT

A minimal, unofficial Foundry VTT v13 system for **Silent Legions**, the Lovecraftian horror RPG by
Kevin Crawford (Sine Nomine Publishing, 2015).

The system has the rules mechanics only. It has no book text: no spells, items, creatures, or
tables. You can type those in by hand, or import them from **your own copy of the PDF** with the
"Import from PDF" menu. The same importer also writes a content pack for
[RPG Keeper](../osr_keeper) (the osr_keeper app).

## What the system does

- **Characters** (actor type `character`): six attributes with modifiers, levels in the four
  classes (multiclass works), hit points, Expertise, Madness (0–100), XP, wealth, background.
  The sheet calculates the attack bonus, the five saving throws, AC against melee and against
  firearms, maximum Expertise, maximum skill level, and encumbrance (readied and stowed items).
- **NPCs and creatures** (actor type `npc`): a Silent Legions stat block. The save is
  15 − HD/2 (rounded up) unless you type a value. AC with `*` (needs magic to harm) blocks
  Slaughter hits.
- **Items**: skill, weapon, armor, gear, vehicle, spell, discipline, class ability, delirium,
  background.
- **Rolls** (chat cards with buttons):
  - Skill check: 2d6 + skill + attribute modifier against a difficulty. Untrained: −1.
    A failed class skill check offers "Reroll (1 Expertise)".
  - Saving throw: 1d20 against the target number.
  - Attack: 1d20 + attack bonus + combat skill (untrained −2) + attribute modifier + target AC.
    20 or more hits. A hit rolls damage and the Slaughter die together; 6 or more triples the
    damage. Burst fire adds +2. Toughs can reroll a miss for 1 Expertise. "Apply damage" lowers
    the HP of the selected or targeted tokens.
  - Madness: pick an event from the book's Madness table (after the import) or type a formula.
  - Delirium check, spell casting (Expertise or Madness cost, Int/Occult check above your Occult
    level), disciplines (free up to the mastered level), class abilities (spend Expertise).
  - Rest (HP + level, Expertise + 1), level up (reroll the hit dice pool and keep the higher
    total, Madness − 10, +4 skill points), NPC morale (2d6 against ML), initiative (1d8 + Dex).
- Drag a skill, weapon, spell, or ability from a character sheet to the hotbar to make a roll
  macro. Shift-click a roll to skip its dialog.

## Install

In Foundry: Setup → Game Systems → **Install System**, and paste this **Manifest URL**:

```
https://github.com/stories-with-dice/silent-legions-foundryvtt-system/releases/latest/download/system.json
```

The URL always points to the newest release, so Foundry offers updates. Foundry v13 is needed.

### Install from a local folder (development)

1. Put this folder (or a symlink to it) in Foundry's `Data/systems/silent-legions`.
   On macOS: `~/Library/Application Support/FoundryVTT/Data/systems/silent-legions`.
2. Restart Foundry or reload the setup screen. Create a world with the "Silent Legions" system.

```bash
ln -s "$PWD" "$HOME/Library/Application Support/FoundryVTT/Data/systems/silent-legions"
```

## Import the book from your PDF

### In Foundry

1. Open the **Compendium** sidebar and click **Import from PDF** at the bottom. (The same dialog
   is in Game Settings → Configure Settings → Silent Legions.)
2. Choose your PDF. The browser reads it with Foundry's own pdf.js. Nothing leaves your computer.
3. Select the compendiums to build. Optionally tick "upload the PDF" to also add the book as a
   PDF journal page in this world.
4. Click **Import into compendiums**. A GM is needed for this step.

The importer builds these world compendiums, in the compendium folder "Silent Legions (PDF)":

| Compendium | Contents |
|---|---|
| SL: Rules Reference | Journal: quick reference, Madness costs, deliria, the four classes, skills, backgrounds, weapons, armor, vehicles, disciplines |
| SL: Class Abilities | 16 class abilities (Expertise cost 1) |
| SL: Skills | 26 skills |
| SL: Backgrounds | 40 backgrounds. Drop one on a character to add its skills |
| SL: Deliria | 12 sample deliria |
| SL: Equipment | 21 weapons, 8 armors, 20 gear items, 9 vehicles |
| SL: Spells & Disciplines | 38 spells by level, 8 disciplines with their level effects |
| SL: Bestiary | 58 creatures: 33 creature templates and 25 named NPCs and horrors |
| SL: Random Tables | 232 book tables, 11 helper tables, and 60 master tables (see below) |
| SL: Location Tags | Journal: 60 location tags with Enemies, Friends, Schemes, Secrets, Places |

### Master tables (generators)

The book builds its generators by rolling several tables together ("roll one of each type of
die") or by letting one table pick the next. The **SL: Random Tables** compendium has master
tables that do this for you. Draw one with Foundry's normal **Roll** button; Foundry rolls every
sub-table and shows each line with the name of its table. (The table sheet shows only the
result text.)

| Folder | Contents |
|---|---|
| Generators | 22 complete generators: Dark Sorcery, Pantheon, Outer God, Lovecraftian Name, Alien Race, Kelipah, Cult, Cult Name, Magical Weapon, Protective Artifact, Miscellaneous Artifact, Occult Grimoire, Adventure Template, Extra Scenes, Scene Challenge, One-Roll Actor, One-Roll Crime, Monster Twist, Poison, Secret Adept, Dark Vision, Mythos Aberration |
| Generator Steps | 38 parts of the generators, usable alone, for example "Cult: Roots of the Evil", "Alien: Physical Form", or "It Curses a Target (effect and word)" |
| Book parts (Creating Gods, Creating Cults, …) | The book tables. Each name starts with its book section, for example "Grim Histories: How Long Have They Been Here?" |

Two kinds of master table:

- **Roll on each**: every sub-table is rolled once. Example: "Cult" rolls the seven Roots of
  the Evil tables, the seven How It Manifests tables, two minions, a cult name, and a portfolio
  for its god.
- **Branch**: a book table whose rows point to other tables. Example: "Dark Sorcery: Effect"
  rolls The Sorcery's Basic Effect (1d12) and then the matching effect table and name word;
  "Secret Adept: Region" rolls a region and then that region's adept table.

Some results link to documents: Background rolls link to the background items, Location Tag
rolls to the tag journal pages, "Sample Deliria" to the delirium items, and the "Spells: Level N"
tables (used by "Occult Grimoire") to the spells.

A few helper tables let you roll where the book says to pick: Deity Mode (1d4), Grimoire Spell
Level (1d10: 1–3 level 1, 4–6 level 2, 7–8 level 3, 9 level 4, 10 level 5), Resolution Kind,
Investigation Kind, and Challenge Kind. Counts that the book leaves to a die roll (a grimoire's
1d4 spells, a Grand spell's 1d4+3 needed things) are in the table description: draw the
sub-table again for each extra one.

A new import deletes and rebuilds the selected compendiums. Items and actors that you already
copied into the world do not change.

The dialog also has two download buttons:

- **RPG Keeper pack**: `keeper-sl-pack.json`, for RPG Keeper's Import button.
- **Parsed data (JSON)**: `silent-legions-data.json`, the parser output. The dialog can import
  this file again instead of the PDF.

### From the command line

The CLI uses the same parser and writes the same files:

```bash
npm install
```

```bash
node tools/extract.mjs "Silent Legions.pdf"
```

It writes `output/silent-legions-data.json` and `output/keeper-sl-pack.json`. Options:
`--out <folder>`, `--keeper <file>` (also copy the pack to that file), `--pages-cache`
(store the raw PDF text in `output/pages.json` for faster reruns while you change the parser).

### Load the pack into RPG Keeper

1. In RPG Keeper, click **Import** and choose `keeper-sl-pack.json`.
2. Confirm "Add Silent Legions (from your PDF) to Silent Legions?".

Keeper adds to the Silent Legions system:

- 231 Compendium entries: rules and quick reference, classes, class abilities, skills,
  backgrounds, deliria, spells, disciplines, equipment, and location tags.
- 58 Bestiary monsters.
- 303 tables in the Tables tab: the 243 book and helper tables, and the 60 generators (master
  tables) that roll on them. A generator's result is an outline: one line per sub-table
  ("Need: …"), and a generator step is indented under its label ("Effect", then its effect and
  word). Click a part of the result, or a label, to roll only that part again. Each table has
  the Source "Silent Legions", the settings Modern and Horror, and an Output for Keeper's
  filters: Entity (aliens, gods, NPCs, monsters), Group (cults, pantheons), Location (Kelipot,
  location tags), Adventure (scenes, templates, crimes), or Other (sorcery, artifacts, names).

Keeper has no built-in Silent Legions data, so this pack is its only source. Keeper never
replaces anything during a pack import: it skips an entry with the same name and category, a
monster with the same `ref`, and a table with the same name. To load a newer pack, delete the
old items in Keeper first.

Keep the pack file out of the osr_keeper repository: it holds book text, and that repository is
public.

## Copyright

Silent Legions is © 2015 Sine Nomine Publishing. This repository holds no text from the book.
The class progression numbers, XP table, and skill names in `module/config.mjs` are game
mechanics. Everything that the importer writes (compendiums, `output/`, downloads) is a copy of
your book: keep it private. `.gitignore` excludes `*.pdf` and `output/`.

## Develop and test

- [AGENTS.md](AGENTS.md): code layout and rules for contributors and AI agents.
- [docs/data-format.md](docs/data-format.md): the parsed data format.
- [docs/parser.md](docs/parser.md): how the parser reads the PDF, and how to fix it for another printing.

```bash
npm test
```

The book tests run only when `Silent Legions.pdf` is in the repository folder.

## Make a release

The GitHub Actions workflow `.github/workflows/release.yml` ("Release") builds a release with two
files: `system.json` and `silent-legions.zip`. It runs the tests, writes the version, manifest
URL, and download URL into the released `system.json`, and puts the manifest URL in the release
notes and the run summary. Start it in one of two ways:

- **Actions tab → Release → Run workflow**, with a version such as `1.0.1`. It builds from the
  chosen branch. If a release with that version exists, the workflow deletes that release and
  its tag first, then creates it again on the current commit.
- **Push a tag**: `git tag v1.0.1` and `git push origin v1.0.1`.

Raise `version` in `system.json` and add a `CHANGELOG.md` entry before you release, so the
repository matches the release.
