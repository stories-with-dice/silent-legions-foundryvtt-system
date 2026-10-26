/**
 * Parser and Keeper pack tests.
 *
 * The book tests need your PDF at the repo root ("Silent Legions.pdf"); they are
 * skipped without it (the PDF is not in the repo). The other tests use small
 * hand-made data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fontStyle, extractPages } from "../module/import/pdf-extract.mjs";
import { parseBook, _test } from "../module/import/sl-parser.mjs";
import { toKeeperPack } from "../module/import/keeper-pack.mjs";
import { buildTablePlan } from "../module/import/table-plan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PDF = path.join(root, "Silent Legions.pdf");
const hasPdf = fs.existsSync(PDF);

/* -------------------------------------------- */
/*  Unit tests (no PDF needed)                  */
/* -------------------------------------------- */

test("fontStyle maps embedded font names to style tags", () => {
  assert.equal(fontStyle("DDWSPN+TrajanPro3-Bold"), "heading");
  assert.equal(fontStyle("VUYRHD+TrajanPro3-Regular"), "label");
  assert.equal(fontStyle("ENDODL+ArnoPro-BoldItalic"), "bolditalic");
  assert.equal(fontStyle("SDCPRJ+ArnoPro-Italic"), "italic");
  assert.equal(fontStyle("MRGPLV+ArnoPro-Regular"), "body");
});

test("buildAttacks splits multi-attack stat lines", () => {
  const { buildAttacks } = _test;
  assert.deepEqual(buildAttacks("bite +8 / claw+8 x2", null, "1d6"), [
    { name: "bite", bonus: 8, count: 1, damage: "1d6" },
    { name: "claw", bonus: 8, count: 2, damage: "1d6" }
  ]);
  assert.deepEqual(buildAttacks("bite / claw x 2", "+4", "1d8 / 1d6 x 2"), [
    { name: "bite", bonus: 4, count: 1, damage: "1d8" },
    { name: "claw", bonus: 4, count: 2, damage: "1d6" }
  ]);
  assert.deepEqual(buildAttacks("bite + wpn", "+1", "1d4 + wpn").map(a => a.damage), ["1d4", "wpn"]);
  assert.deepEqual(buildAttacks("smash +5", null, "1d8 + 1d6 Mad."), [{ name: "smash", bonus: 5, count: 1, damage: "1d8 + 1d6 Mad." }]);
});

test("hdToNumber reads '1 hp', '1d4 hp', and plain numbers", () => {
  assert.equal(_test.hdToNumber("1 hp"), 0);
  assert.equal(_test.hdToNumber("1d4 hp"), 0.5);
  assert.equal(_test.hdToNumber("6"), 6);
});

const tinyData = {
  meta: { parserVersion: 1 },
  quickReference: [{ title: "Combat", paragraphs: ["Roll 1d20."] }],
  madnessCosts: [{ category: "Horror", event: "Seeing a thing", cost: "1d6" }],
  classes: [], skills: [{ name: "Combat", specialization: true, description: ["Fighting."] }],
  backgrounds: [], deliria: [], disciplineRules: [], disciplines: [], weapons: [], armor: [], gear: [], vehicles: [], tags: [], tables: [],
  spells: [{ name: "Test Rite", level: 2, page: 40, description: ["Does a thing."] }],
  creatures: [{ name: "Thing", description: "A thing.", ac: 6, mundaneImmune: true, hd: "3", hdValue: 3, move: "30'", morale: 9,
    skill: 2, madness: "1d6", special: "", save: 14, slaughter: "1d6", attacks: [{ name: "claw", bonus: 3, count: 2, damage: "1d4" }] }]
};

test("toKeeperPack writes the osr_keeper content pack shape", () => {
  const pack = toKeeperPack(tinyData);
  assert.equal(pack.pack.system, "sl");
  const spell = pack.compendium.find(e => e.name === "Test Rite");
  assert.equal(spell.category, "Spells");
  assert.equal(spell.source, "Spell Level 2");
  assert.match(spell.ref, /^slpdf:spell:/);
  const m = pack.monsters[0];
  assert.deepEqual(m.ac, { asc: null, desc: 6, thac0: null });
  assert.equal(m.hd, "3");
  assert.equal(m.hp, 13);
  assert.deepEqual(m.saveTargets, { Save: 14 });
  assert.equal(m.attacksText, "claw +3 x2 (1d4)");
  assert.ok(m.mundaneImmune);
});

test("Keeper entries never share a name and category (Keeper would skip one)", () => {
  const pack = toKeeperPack(tinyData);
  const keys = pack.compendium.map(e => `${e.name.toLowerCase()}|${e.category}`);
  assert.equal(new Set(keys).size, keys.length);
});

test("table plan: masters reference earlier tables only, and missing tables become warnings", () => {
  const table = (name, n = 4) => ({ name, chapter: "Test", part: "", section: "S", page: 10, formula: `1d${n}`, dice: `d${n}`,
    results: [...Array(n).keys()].map(i => ({ range: [i + 1, i + 1], text: `${name} ${i + 1}` })) });
  const plan = buildTablePlan({ ...tinyData, tables: [table("Number of Major Deities"), table("Pantheon Traits", 20)] });
  const pantheon = plan.masters.find(m => m.name === "Pantheon");
  assert.equal(pantheon.formula, "1");
  assert.deepEqual(pantheon.results.map(r => [r.range, r.label]), [[[1, 1], "Number of Major Deities"], [[1, 1], "Pantheon Traits"]]);
  const known = new Set(plan.tables.map(t => t.id));
  for (const m of plan.masters) {
    for (const r of m.results) assert.ok(known.has(r.ref), `${m.name} → ${r.ref}`);
    known.add(m.id);
  }
  assert.ok(plan.warnings.some(w => w.includes("Dark Sorcery")), "absent book tables are reported");
  const spells = plan.tables.find(t => t.name === "Spells: Level 2");
  assert.deepEqual(spells.results[0].link, { kind: "spell", name: "Test Rite" });
});

/* -------------------------------------------- */
/*  Book tests (need the PDF)                   */
/* -------------------------------------------- */

let bookData = null;
async function book() {
  if (bookData) return bookData;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  bookData = parseBook(await extractPages(pdfjs, new Uint8Array(fs.readFileSync(PDF))));
  return bookData;
}

test("book: every section parses with the expected counts and no warnings", { skip: !hasPdf && "no PDF" }, async () => {
  const d = await book();
  assert.deepEqual(d.warnings, []);
  assert.deepEqual(
    { classes: d.classes.length, backgrounds: d.backgrounds.length, skills: d.skills.length, deliria: d.deliria.length,
      spells: d.spells.length, disciplines: d.disciplines.length, weapons: d.weapons.length, armor: d.armor.length,
      gear: d.gear.length, vehicles: d.vehicles.length, creatures: d.creatures.length, tags: d.tags.length },
    { classes: 4, backgrounds: 40, skills: 26, deliria: 12, spells: 38, disciplines: 8, weapons: 21, armor: 8,
      gear: 20, vehicles: 9, creatures: 58, tags: 60 }
  );
  assert.ok(d.tables.length >= 230, `tables: ${d.tables.length}`);
  assert.ok(d.tables.every(t => t.part !== undefined && t.chapter), "every table has a chapter and part");
});

test("book: class progression in the PDF matches module/config.mjs", { skip: !hasPdf && "no PDF" }, async () => {
  // config.mjs uses Foundry globals only inside functions, so it imports in Node.
  const { SL } = await import("../module/config.mjs");
  const d = await book();
  for (const c of d.classes) {
    const cfg = SL.classes[c.key];
    assert.equal(`d${cfg.hitDie}`, c.progression[0].hitDice.replace(/^1/, ""));
    c.progression.forEach((row, i) => {
      assert.equal(cfg.progression[i].atk, row.attack, `${c.name} level ${i + 1} attack`);
      assert.deepEqual(cfg.progression[i].saves, row.saves, `${c.name} level ${i + 1} saves`);
    });
    assert.deepEqual([...cfg.skills].sort(), [...c.classSkills].sort(), `${c.name} class skills`);
  }
});

test("book: random tables cover their whole die range", { skip: !hasPdf && "no PDF" }, async () => {
  const d = await book();
  for (const t of d.tables) {
    const size = Number(t.formula.split("d")[1]);
    const covered = t.results.reduce((n, r) => n + r.range[1] - r.range[0] + 1, 0);
    assert.equal(covered, size, `${t.name} (p. ${t.page})`);
  }
});

test("book: Keeper pack has no name/category collisions", { skip: !hasPdf && "no PDF" }, async () => {
  const pack = toKeeperPack(await book());
  const keys = pack.compendium.map(e => `${e.name.toLowerCase()}|${e.category}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(pack.monsters.length, 58);
});

test("book: every master table finds its sub-tables", { skip: !hasPdf && "no PDF" }, async () => {
  const plan = buildTablePlan(await book());
  assert.deepEqual(plan.warnings, []);
  assert.equal(plan.masters.filter(m => m.top).length, 22);
  const branch = plan.masters.find(m => m.name === "Dark Sorcery: Effect");
  assert.equal(branch.formula, "1d12");
  assert.equal(branch.results.length, 12);
  const known = new Set(plan.tables.map(t => t.id));
  for (const m of plan.masters) {
    for (const r of m.results) assert.ok(known.has(r.ref), `${m.name} → ${r.ref}`);
    known.add(m.id);
  }
});

test("book: Keeper generator entries link only to entries in the pack", { skip: !hasPdf && "no PDF" }, async () => {
  const pack = toKeeperPack(await book());
  const names = new Set(pack.compendium.map(e => e.name));
  for (const e of pack.compendium.filter(x => /^(Generator|Table)/.test(x.source))) {
    for (const [, link] of e.body.matchAll(/\[([^\]]+)\]/g)) assert.ok(names.has(link), `${e.name} → [${link}]`);
  }
});
