# AGENTS.md

Rules for AI agents and contributors. The user guide is [README.md](README.md).

## Hard rules

- **No book text in the repository.** Never commit the PDF, `output/`, or any text copied from
  the book (spells, items, creatures, tables, rules prose). `module/config.mjs` holds mechanics
  only: numbers, formulas, and names.
- **Plain ES modules, no build step.** Foundry loads `module/silent-legions.mjs` directly.
- **Foundry v13 APIs only**: `TypeDataModel`, `ActorSheetV2`/`ItemSheetV2` with
  `HandlebarsApplicationMixin`, `DialogV2`, the `renderChatMessageHTML` hook.
- **The parser files stay environment-free.** `module/import/pdf-extract.mjs`,
  `module/import/sl-parser.mjs`, `module/import/table-plan.mjs`, and `module/import/keeper-pack.mjs` must not use Foundry or Node
  globals. The browser (Foundry) and the CLI (Node) run the same code and must give byte-identical
  data (checked by hashing the JSON in both).

## Code layout

| File | Contents |
|---|---|
| `system.json` | Manifest: document types, `htmlFields`, token attributes |
| `module/silent-legions.mjs` | Entry point: `init` hook, sheet registration, settings, the Compendium-sidebar button, hotbar macros |
| `module/config.mjs` | `SL`: attributes, saves, class progression, XP table, skill names, wealth, helper formulas |
| `module/data/actors.mjs` | `CharacterData` and `NpcData` (schemas and derived values: saves, attack bonus, AC, encumbrance) |
| `module/data/items.mjs` | One `TypeDataModel` per item type |
| `module/documents.mjs` | `SLActor` (damage, Expertise, Madness, `learnSkill`), `SLItem.use()`, `SLCombatant` (initiative) |
| `module/rolls.mjs` | All dice and chat cards, and the chat-button handlers |
| `module/sheets.mjs` | Character, NPC, and item sheets |
| `module/apps/import-app.mjs` | The "Import from PDF" dialog |
| `module/import/pdf-extract.mjs` | pdf.js → page items with position, size, and font style |
| `module/import/sl-parser.mjs` | Page items → book data ([docs/data-format.md](docs/data-format.md)) |
| `module/import/foundry-import.mjs` | Book data → world compendiums |
| `module/import/table-plan.mjs` | Master tables: which book tables roll together or branch to others, by table name ([docs/data-format.md](docs/data-format.md#table-plan)) |
| `module/import/keeper-pack.mjs` | Book data → RPG Keeper content pack |
| `tools/extract.mjs` | CLI: PDF → `output/silent-legions-data.json` and `output/keeper-sl-pack.json` |
| `templates/`, `styles/`, `lang/en.json` | Handlebars templates, CSS, English strings |
| `.github/workflows/release.yml` | "Release" workflow: tests, stamps version/manifest/download into `system.json`, zips the system, (re)creates the GitHub release |
| `test/parser.test.mjs` | `node:test` suite. Book tests skip without the PDF |

## Data flow of an import

1. `extractPages()` (`pdf-extract.mjs`) reads every page with pdf.js. It returns text items with
   x/y, font size, and a font style tag (`heading`, `label`, `body`, …).
2. `parseBook()` (`sl-parser.mjs`) builds lines and finds each section by its heading or table
   header. It returns the book data object with `counts` and `warnings`.
3. Then one of these runs:
   - `importBook()` (`foundry-import.mjs`) deletes and recreates the world compendiums
     `world.sl-*` and saves the Madness table in the world setting `silent-legions.madnessCosts`.
   - `toKeeperPack()` (`keeper-pack.mjs`) returns `{ pack, compendium, monsters }` in
     osr_keeper's `data/seed-sl.json` shapes.

## Conventions

- New strings go in `lang/en.json` under `SL`. A key is a string or a group, never both
  (Foundry merges JSON objects, and a duplicate key loses one of them).
- Item fields shown inline on an actor sheet use `data-item-field="system.x"` (no `name`), so they
  update the item, not the actor.
- NPC attack rows use `name="attacks.N.field"`; `SLNpcSheet._processFormData` rebuilds the array.
- Master tables refer to book tables by name. A renamed table shows up in `buildTablePlan().warnings`
  and fails the "every master table finds its sub-tables" test. Created RollTables are matched to
  plan ids by the flag `silent-legions.planId`, because `createDocuments` does not keep input order.

## Checklist for a change

1. `npm test` passes (with the PDF present for parser changes).
2. A parser change: run `node tools/extract.mjs --pages-cache` and look at `warnings` and `counts`.
3. Check the change in Foundry: the system folder is symlinked into
   `~/Library/Application Support/FoundryVTT/Data/systems/silent-legions`; reload the world.
4. Update README.md for user-visible changes and the docs for format changes.
