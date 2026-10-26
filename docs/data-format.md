# Parsed data format

`parseBook()` in `module/import/sl-parser.mjs` returns one JSON object. The CLI writes it to
`output/silent-legions-data.json`; the import dialog can download it and read it back. Page
numbers are PDF page numbers (the printed page number is 3 lower).

| Key | Type | Contents |
|---|---|---|
| `meta` | object | `title`, `parserVersion`, `pages`, `createdAt` |
| `classes` | array | `{ name, key, page, primeAttributes[], classSkills[], bonusSkills[], description[], abilitiesIntro[], abilities[{ name, level, description }], abilitiesNote, progression[{ level, hitDice, attack, saves{ physical, mental, evasion, magic, luck } }] }` |
| `backgrounds` | array | `{ name, roll ("1-2/1"), skills[] }` |
| `skillsIntro` | string[] | Paragraphs before the skill list |
| `skills` | array | `{ name, specialization, description[] }` |
| `deliria` | array | `{ roll, name, description }` |
| `madnessCosts` | array | `{ category (Bloodshed, Horror, Occult), event, cost }` |
| `quickReference` | array | `{ title, paragraphs[] }` |
| `weapons` | array | `{ name, damage, slaughter, attributes[], range, magazine, slowReload, cost, subdual, burst, suppress, description }` |
| `armor` | array | `{ name, ac, shield, shieldBonus, noFirearms, noMelee, enc, cost, description }` |
| `gear` | array | `{ name, enc (0 = too small to count), bundle, cost }` |
| `vehicles` | array | `{ name, speed, armor, hp, crew, cost }` |
| `equipmentNotes` | object | `weapons` (table legend), `weaponRules[]`, `armor`, `vehicles[]` |
| `spells` | array | `{ name, level, page, description[] }` |
| `disciplineRules` | string[] | Introduction to occult disciplines |
| `disciplines` | array | `{ name, page, description[], levels[{ level, description }] }` |
| `creatures` | array | `{ name, group, page, template?, tier?, ac, mundaneImmune, hd ("3", "1 hp", "1d4 hp"), hdValue, attacks[{ name, bonus, count, damage }], attacksText, move, morale, skill, madness ("None / 1d6"), special, save, slaughter, description }` |
| `tags` | array | `{ name, page, description, enemies[], friends[], schemes[], secrets[], places[] }` |
| `tables` | array | `{ name, section, chapter, page, dice ("d6+d10"), formula ("1d60"), results[{ range[lo, hi], text }] }` |
| `warnings` | string[] | Sections or tables that did not parse as expected |
| `counts` | object | Number of entries per array key |

Notes:

- Text fields that hold several paragraphs are arrays, or strings with `\n\n` between paragraphs
  (`creatures[].description`, `tags[].description`, `weapons[].description`).
- Two-dice tables (d6 + d10, d8 + d10) become one table with sequential ranges, so `1d60`
  gives the same chances as the two dice.
- `creatures[].slaughter` is `1d6` unless the stat block names another die ("Most creature
  attacks use a 1d6 Slaughter die").
