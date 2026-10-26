# How the parser reads the PDF

The parser (`module/import/sl-parser.mjs`) is written for the 2015 Sine Nomine PDF of Silent
Legions (189 pages). It finds sections by heading text and table headers, not by page number,
so small layout changes do not break it. A different printing can still need changes.

## Step 1: page items (`pdf-extract.mjs`)

pdf.js returns text items in reading order (column by column). For each item the extractor keeps
the text, x/y position, font size, width, and a style tag from the embedded font name:

| Font | Tag | Used for |
|---|---|---|
| Trajan Pro Bold | `heading` | Section headings (14pt), table headers (8–10pt) |
| Trajan Pro Regular | `label` | Sub-headings, running chapter title, row numbers, spell headings |
| Arno Pro | `body`, `italic`, `bold`, `bolditalic` | Text and table cells |

The real font names are known only after `page.getOperatorList()` loads the fonts, so the
extractor calls it for every page.

## Step 2: lines (`Book`)

- The running chapter title (label at y ≥ 750) becomes `line.chapter`. Page numbers (y ≤ 36) are
  dropped.
- Items with the same y (±2.5) become one line. Because pdf.js reads column by column, lines of
  two text columns do not mix, but cells of one table row stay together.
- `paragraphs()` joins lines into paragraphs: a gap larger than 1.6 lines or a bullet starts a new
  one. A hyphen at a line end is removed only when the joined word exists elsewhere in the book.

## Step 3: sections

| Section | How it is found |
|---|---|
| Classes | Headings "The Investigator" … "The Tough"; labels "Prime Attributes", "Class Skills", "Bonus Skills…", "Class Abilities"; 8-cell rows for the progression |
| Backgrounds | Header `1d8 1d10 Background Starting Skills` |
| Skills | Labels between the headings "Skills" and "Choosing Your Character Class" |
| Deliria | Paragraphs "N) Name: text" after "Sample Deliria" |
| Madness costs | Header `Bloodshed Events | Cost` |
| Equipment | Headers `Weapon Dmg Slaughter…`, `Armor AC Enc Cost`, `Item Enc Cost`, `Vehicle Speed…` |
| Spells | Label lines "Name | Level N" in the Sorcery chapter |
| Disciplines | Headings after "Occult Disciplines" that have a `Lvl Ability` table |
| Creature templates | Header `Type Of Entity AC HD…`; rows start with Weak, Average, or Strong |
| Stat blocks | Five or more lines that start with `AC:`, `HD:`, …; two labels per line is one creature, else several creatures side by side |
| Location tags | 12pt headings in "Building Your World" followed by `Enemies:` |
| Random tables | Any heading line that starts with a die (`d8`, `1d12`) |

Random tables need the most care:

- A header line can hold several tables side by side. Each die starts a segment.
- One die over repeated columns (`1d8 | It Maims | Word | It Summons | Word`) splits into column
  groups that share the row numbers.
- Two halves of one long table (`d100 Portfolio | d100 Portfolio`) merge into one table.
- Two-dice tables count the group number (or the order of groups such as "1-2", "3-4").
- A table ends at a heading, a new table header, text left of the table, or a paragraph gap
  after its last row.
- A row range that overlaps the previous row (a misprint) is shortened.
- Column names: an independent column keeps its own title ("Central Asia", "Head"). A column that
  only makes sense with the first one gets its name as a prefix ("Book: Adjective",
  "It Maims or Kills: Word").
- Record tables ("Quality", "Background") keep their columns in one result, joined with " — ".
- Each table records its `part` (the last 17pt+ heading in its chapter, such as
  "Creating Cults: Sons of Forsaken Wisdom"). `table-plan.mjs` and the folders use it.

## When a new printing breaks something

1. Run `node tools/extract.mjs --pages-cache` and read the `warnings`.
2. Look at the raw lines of the page: load `output/pages.json` and print
   `font`, `h`, `x`, and `s` of each item.
3. Change the matching function in `sl-parser.mjs`, rerun with `--pages-cache` (fast, no PDF
   read), and run `npm test`.
4. Raise `PARSER_VERSION` when the output format changes.
