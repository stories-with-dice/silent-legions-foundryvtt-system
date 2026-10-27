/**
 * Write parsed book data (sl-parser.mjs) into world compendiums.
 *
 * Each pack lives in the current world only (never in the system folder), inside a
 * "Silent Legions (PDF)" compendium folder. A new import deletes and rebuilds the packs.
 */
import { SL } from "../config.mjs";
import { defaultItemIcon } from "../sheets.mjs";
import { buildTablePlan } from "./table-plan.mjs";

const SYSTEM = "silent-legions";
const esc = v => foundry.utils.escapeHTML(String(v ?? ""));
const paras = list => (Array.isArray(list) ? list : String(list ?? "").split(/\n\n+/)).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join("");
const pageRef = page => (page ? `Silent Legions p. ${page - 3}` : "Silent Legions");

/** The packs this importer owns, by key. */
export const PACKS = {
  rules: { label: "SL.Pack.rules", type: "JournalEntry" },
  abilities: { label: "SL.Pack.abilities", type: "Item" },
  skills: { label: "SL.Pack.skills", type: "Item" },
  backgrounds: { label: "SL.Pack.backgrounds", type: "Item" },
  deliria: { label: "SL.Pack.deliria", type: "Item" },
  equipment: { label: "SL.Pack.equipment", type: "Item" },
  sorcery: { label: "SL.Pack.sorcery", type: "Item" },
  bestiary: { label: "SL.Pack.bestiary", type: "Actor" },
  tables: { label: "SL.Pack.tables", type: "RollTable" },
  tags: { label: "SL.Pack.tags", type: "JournalEntry" }
};
const packName = key => `sl-${key}`;

/* -------------------------------------------- */
/*  Conversion: book data → document data       */
/* -------------------------------------------- */

const isFirearm = w => !/bow|taser/i.test(w.name) && (Number(w.magazine) > 0 || /grenade|launcher/i.test(w.name));
function combatSkill(w) {
  if (/unarmed/i.test(w.name)) return "Combat/Unarmed";
  if (/machine gun|launcher/i.test(w.name)) return "Combat/Gunnery";
  if (/crossbow/i.test(w.name) || (isFirearm(w) && !/grenade/i.test(w.name))) return "Combat/Projectile";
  return "Combat/Primitive";
}

export function weaponToItem(w) {
  const unarmed = /unarmed/i.test(w.name);
  return {
    name: w.name, type: "weapon", img: defaultItemIcon("weapon"),
    system: {
      description: paras(w.description), source: pageRef(20),
      damage: unarmed ? "1d2" : w.damage, slaughter: unarmed ? "" : w.slaughter,
      attributes: w.attributes.join("/"), skill: combatSkill(w), range: w.range,
      magazine: Number(w.magazine) || 0, ammo: Number(w.magazine) || 0,
      firearm: isFirearm(w), burst: w.burst, subdual: w.subdual, unarmed,
      enc: /rifle|bow|spear|great weapon|shotgun|launcher|machine gun/i.test(w.name) ? 2 : 1,
      cost: SL.costs[w.cost] ?? w.cost, location: "readied"
    }
  };
}

export function armorToItem(a) {
  return {
    name: a.name, type: "armor", img: defaultItemIcon("armor"),
    system: {
      description: paras(a.description), source: pageRef(21),
      ac: a.shield ? 9 : a.ac, shield: a.shield, shieldBonus: a.shieldBonus || 1,
      noFirearms: a.noFirearms, noMelee: a.noMelee, enc: a.enc, cost: SL.costs[a.cost] ?? a.cost, location: "readied"
    }
  };
}

export const gearToItem = g => ({
  name: g.name, type: "gear", img: defaultItemIcon("gear"),
  system: { source: pageRef(22), enc: g.enc, bundle: g.bundle, quantity: 1, cost: SL.costs[g.cost] ?? g.cost, location: "stowed" }
});

export const vehicleToItem = v => ({
  name: v.name, type: "vehicle", img: defaultItemIcon("vehicle"),
  system: { source: pageRef(22), speed: v.speed ?? 0, armor: v.armor ?? 0, crew: v.crew ?? 1, cost: SL.costs[v.cost] ?? v.cost, hp: { value: v.hp ?? 0, max: v.hp ?? 0 } }
});

export const spellToItem = s => ({
  name: s.name, type: "spell", img: defaultItemIcon("spell"),
  system: { level: s.level, description: paras(s.description), source: pageRef(s.page) }
});

export const disciplineToItem = d => ({
  name: d.name, type: "discipline", img: defaultItemIcon("discipline"),
  system: {
    level: 0, mastered: -1, source: pageRef(d.page),
    description: paras(d.description) + (d.levels.length ? `<ol start="0">${d.levels.map(l => `<li>${esc(l.description)}</li>`).join("")}</ol>` : ""),
    levels: Object.fromEntries(d.levels.map(l => [l.level, l.description]))
  }
});

const abilityToItem = (cls, a) => ({
  name: a.name, type: "ability", img: defaultItemIcon("ability"),
  system: { class: cls.key, level: a.level, cost: 1, description: paras([a.description, cls.abilitiesNote]), source: pageRef(cls.page) }
});

const skillToItem = s => ({
  name: s.name, type: "skill", img: defaultItemIcon("skill"),
  system: { level: 0, attribute: SL.skills[s.name]?.attr ?? "int", description: paras(s.description), source: pageRef(11) }
});

const backgroundToItem = b => ({
  name: b.name, type: "background", img: defaultItemIcon("background"),
  system: { skills: b.skills.join(", "), description: `<p>${esc(b.roll)}</p>`, source: pageRef(10) }
});

const deliriumToItem = d => ({
  name: d.name, type: "delirium", img: defaultItemIcon("delirium"),
  system: { description: paras(d.description), source: pageRef(30) }
});

export function creatureToActor(c) {
  const hp = c.hdValue === 0 ? 1 : c.hdValue === 0.5 ? 2 : Math.floor(c.hdValue * 4.5);
  return {
    name: c.name, type: "npc", img: "icons/svg/mystery-man.svg",
    system: {
      ac: c.ac ?? 9, mundaneImmune: !!c.mundaneImmune, hd: String(c.hd ?? "1"), hp: { value: hp, max: hp },
      attacks: c.attacks.map(a => ({ name: a.name, bonus: a.bonus, count: a.count, damage: a.damage })),
      slaughter: c.slaughter ?? "1d6", move: c.move ?? "", morale: Math.clamp(c.morale ?? 7, 1, 12), skill: c.skill ?? 0,
      madness: c.madness ?? "None", save: c.save ?? null, special: c.special ?? "", group: c.group ?? "",
      description: paras(c.description) + `<p><em>${esc(pageRef(c.page))}</em></p>`
    }
  };
}

/**
 * A plan table (table-plan.mjs) as RollTable data. A result has the row text only; its table's
 * label goes in a flag that SLTableResult#getHTML shows on chat cards, so a master table's card
 * says which sub-table gave each line. (A label in `name` repeats on every row of the sheet.)
 * @param {object} t
 * @param {(link: object) => string|null} resolveLink  Item or journal page UUID for a link.
 */
export function planTableToDocument(t, resolveLink = () => null) {
  return {
    name: t.name, formula: t.formula, replacement: true, displayRoll: true, description: esc(t.description ?? ""),
    results: t.results.map(r => {
      const uuid = r.link ? resolveLink(r.link) : null;
      const base = { name: "", description: esc(r.text), range: r.range, weight: r.range[1] - r.range[0] + 1, flags: { [SYSTEM]: { label: r.label } } };
      return uuid ? { ...base, type: "document", documentUuid: uuid } : { ...base, type: "text" };
    })
  };
}

/** A master table: every result points to a table or another master by UUID. */
function masterToDocument(m, uuids) {
  return {
    name: m.name, formula: m.formula, replacement: true, displayRoll: m.kind !== "all",
    description: esc(m.description),
    results: m.results.map(r => ({
      type: "document", documentUuid: uuids.get(r.ref), name: r.label, description: r.text ? esc(r.text) : "",
      range: r.range, weight: r.range[1] - r.range[0] + 1
    }))
  };
}

/** UUIDs of documents that table results can link to, from the world packs. */
async function linkIndex() {
  const index = new Map();
  const add = (kind, name, uuid) => index.set(`${kind}:${name.toLowerCase()}`, uuid);
  for (const [key, kind] of [["backgrounds", "background"], ["deliria", "delirium"], ["sorcery", "spell"]]) {
    const pack = game.packs.get(`world.${packName(key)}`);
    if (!pack) continue;
    for (const e of await pack.getIndex({ fields: ["type"] })) add(kind, e.name, e.uuid);
  }
  const tags = game.packs.get(`world.${packName("tags")}`);
  if (tags) {
    for (const journal of await tags.getDocuments()) for (const page of journal.pages) add("tag", page.name, page.uuid);
  }
  return link => index.get(`${link.kind}:${String(link.name).toLowerCase()}`) ?? null;
}

/**
 * Build the Random Tables pack: book tables in folders by book part, then the master
 * tables ("Generators" for whole generators, "Generator Steps" for their parts).
 */
async function fillTables(pack, data) {
  const plan = buildTablePlan(data);
  for (const w of plan.warnings) console.warn(`Silent Legions import | ${w}`);
  const resolveLink = await linkIndex();
  const folderIds = new Map();
  const folder = async name => {
    if (!folderIds.has(name)) {
      const f = await Folder.implementation.create({ name, type: "RollTable", sorting: "a" }, { pack: pack.collection });
      folderIds.set(name, f.id);
    }
    return folderIds.get(name);
  };
  await folder(game.i18n.localize("SL.Generators"));
  await folder(game.i18n.localize("SL.GeneratorSteps"));
  const uuids = new Map();
  const create = async (list, toData) => {
    const docs = [];
    // The plan id goes in a flag: createDocuments does not keep the input order.
    for (const item of list) docs.push({ ...toData(item), folder: await folder(item.folder), flags: { [SYSTEM]: { planId: item.id } } });
    for (let i = 0; i < docs.length; i += 100) {
      const created = await RollTable.implementation.createDocuments(docs.slice(i, i + 100), { pack: pack.collection });
      for (const doc of created) uuids.set(doc.getFlag(SYSTEM, "planId"), doc.uuid);
    }
  };
  await create(plan.tables, t => planTableToDocument(t, resolveLink));
  // Masters come leaves first; create them one level at a time so every reference exists.
  let pending = plan.masters.map(m => ({ ...m, folder: game.i18n.localize(m.top ? "SL.Generators" : "SL.GeneratorSteps") }));
  while (pending.length) {
    const ready = pending.filter(m => m.results.every(r => uuids.has(r.ref)));
    if (!ready.length) throw new Error(`Master tables with missing references: ${pending.map(m => m.name).join(", ")}`);
    await create(ready, m => masterToDocument(m, uuids));
    pending = pending.filter(m => !ready.includes(m));
  }
  return plan;
}

const htmlTable = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const textPage = (name, content, sort) => ({ name, type: "text", sort, text: { content, format: 1 } });

/** The "Rules Reference" journal: quick reference, Madness, Deliria, classes, skills, backgrounds, equipment notes, sorcery. */
function rulesJournal(data) {
  const pages = [];
  let sort = 0;
  const add = (name, html) => pages.push(textPage(name, html, (sort += 100)));
  if (data.quickReference.length) add("Quick Reference", data.quickReference.map(s => `<h2>${esc(s.title)}</h2>${paras(s.paragraphs)}`).join(""));
  if (data.madnessCosts.length) {
    add("Madness Costs", htmlTable(["Category", "Event", "Cost"], data.madnessCosts.map(m => [m.category, m.event, m.cost])));
  }
  if (data.deliria.length) add("Sample Deliria", `<ol>${data.deliria.map(d => `<li><strong>${esc(d.name)}:</strong> ${esc(d.description)}</li>`).join("")}</ol>`);
  for (const c of data.classes) {
    const prog = htmlTable(["Level", "Hit Dice", "Attack", "Physical", "Mental", "Evasion", "Magic", "Luck"],
      c.progression.map(p => [p.level, p.hitDice, p.attack >= 0 ? `+${p.attack}` : p.attack, ...Object.values(p.saves)]));
    add(`The ${c.name}`, [
      `<p><strong>Prime Attributes:</strong> ${esc(c.primeAttributes.join(", "))}</p>`,
      `<p><strong>Class Skills:</strong> ${esc(c.classSkills.join(", "))}</p>`,
      `<p><strong>Bonus Skills for New Characters:</strong> ${esc(c.bonusSkills.join(", "))}</p>`,
      paras(c.description), "<h3>Class Abilities</h3>", paras(c.abilitiesIntro),
      `<ul>${c.abilities.map(a => `<li><strong>${esc(a.name)}:</strong> ${esc(a.description)}</li>`).join("")}</ul>`,
      paras(c.abilitiesNote), prog
    ].join(""));
  }
  if (data.skills.length) add("Skills", paras(data.skillsIntro) + data.skills.map(s => `<h3>${esc(s.name)}${s.specialization ? " (Specialization)" : ""}</h3>${paras(s.description)}`).join(""));
  if (data.backgrounds.length) add("Backgrounds", htmlTable(["1d8/1d10", "Background", "Starting Skills"], data.backgrounds.map(b => [b.roll, b.name, b.skills.join(", ")])));
  const notes = data.equipmentNotes ?? {};
  if (data.weapons.length) {
    add("Weapons", htmlTable(["Weapon", "Dmg", "Slaughter", "Attrib.", "Range", "Mag.", "Cost"],
      data.weapons.map(w => [w.name, w.damage + (w.subdual ? "§" : "") + (w.burst ? "*" : "") + (w.suppress ? "#" : ""), w.slaughter || "None", w.attributes.join("/"), w.range, w.magazine + (w.slowReload ? "@" : ""), w.cost]))
      + `<p>${esc(notes.weapons)}</p>` + paras(notes.weaponRules));
  }
  if (data.armor.length) add("Armor", htmlTable(["Armor", "AC", "Enc", "Cost"], data.armor.map(a => [a.name, a.shield ? `-${a.shieldBonus} bonus` : `${a.ac}${a.noFirearms ? "*" : ""}${a.noMelee ? "@" : ""}`, a.enc, a.cost])) + `<p>${esc(notes.armor)}</p>`);
  if (data.vehicles.length) add("Vehicles", paras(notes.vehicles) + htmlTable(["Vehicle", "Speed", "Armor", "HP", "Crew", "Cost"], data.vehicles.map(v => [v.name, v.speed, v.armor, v.hp, v.crew, v.cost])));
  if (data.disciplineRules?.length) add("Occult Disciplines", paras(data.disciplineRules));
  return { name: game.i18n.localize("SL.RulesReference"), pages };
}

function tagsJournal(data) {
  const list = (label, items) => (items?.length ? `<p><strong>${label}:</strong></p><ul>${items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : "");
  return {
    name: game.i18n.localize("SL.LocationTags"),
    pages: data.tags.map((tag, i) => textPage(tag.name, paras(tag.description)
      + list("Enemies", tag.enemies) + list("Friends", tag.friends) + list("Schemes", tag.schemes)
      + list("Secrets", tag.secrets) + list("Places", tag.places), (i + 1) * 100))
  };
}

/* -------------------------------------------- */
/*  Writing the packs                           */
/* -------------------------------------------- */

async function compendiumFolder() {
  const name = game.i18n.localize("SL.PackFolder");
  return game.folders.find(f => f.type === "Compendium" && f.name === name)
    ?? Folder.implementation.create({ name, type: "Compendium", color: "#2e3b2e" });
}

async function freshPack(key, folder) {
  const { label, type } = PACKS[key];
  const old = game.packs.get(`world.${packName(key)}`);
  if (old) {
    if (old.locked) await old.configure({ locked: false });
    await old.deleteCompendium();
  }
  const pack = await foundry.documents.collections.CompendiumCollection.createCompendium({
    name: packName(key), label: `SL: ${game.i18n.localize(label)}`, type, packageType: "world"
  });
  await pack.configure({ folder: folder.id });
  return pack;
}

/** Create documents in a pack, grouped in folders: { folderName: [docData, …] }. */
async function fill(pack, groups) {
  const cls = pack.documentClass;
  const entries = Object.entries(groups).filter(([, docs]) => docs.length);
  let sort = 0;
  for (const [folderName, docs] of entries) {
    let folder = null;
    if (folderName && entries.length > 1) {
      folder = await Folder.implementation.create({ name: folderName, type: pack.documentName, sorting: "m", sort: (sort += 100) }, { pack: pack.collection });
    }
    const data = docs.map((d, i) => ({ ...d, folder: folder?.id ?? null, sort: (i + 1) * 100 }));
    for (let i = 0; i < data.length; i += 100) await cls.createDocuments(data.slice(i, i + 100), { pack: pack.collection });
  }
}

const groupBy = (list, key) => list.reduce((acc, x) => ((acc[key(x)] ??= []).push(x), acc), {});

/**
 * Import parsed book data into world compendiums.
 * @param {object} data                     Output of parseBook().
 * @param {object} [options]
 * @param {string[]} [options.only]         Pack keys to import (default: all).
 * @param {string|null} [options.pdfPath]   An uploaded PDF to add as a journal page.
 * @param {(msg:string) => void} [options.onProgress]
 */
export async function importBook(data, { only = Object.keys(PACKS), pdfPath = null, onProgress = () => {} } = {}) {
  if (!game.user.isGM) throw new Error(game.i18n.localize("SL.Warn.gmOnly"));
  const folder = await compendiumFolder();
  const want = new Set(only);
  const step = async (key, fn) => {
    if (!want.has(key)) return;
    onProgress(game.i18n.format("SL.Import.writing", { pack: game.i18n.localize(PACKS[key].label) }));
    const pack = await freshPack(key, folder);
    await fn(pack);
  };

  await step("rules", async pack => {
    const journals = [rulesJournal(data)];
    if (pdfPath) journals.push({ name: "Silent Legions (PDF)", pages: [{ name: "Silent Legions", type: "pdf", src: pdfPath }] });
    await fill(pack, { "": journals });
  });
  await step("abilities", pack => fill(pack, Object.fromEntries(data.classes.map(c => [c.name, c.abilities.map(a => abilityToItem(c, a))]))));
  await step("skills", pack => fill(pack, { "": data.skills.map(skillToItem) }));
  await step("backgrounds", pack => fill(pack, { "": data.backgrounds.map(backgroundToItem) }));
  await step("deliria", pack => fill(pack, { "": data.deliria.map(deliriumToItem) }));
  await step("equipment", pack => fill(pack, {
    [game.i18n.localize("SL.Weapons")]: data.weapons.map(weaponToItem),
    [game.i18n.localize("SL.Armor")]: data.armor.map(armorToItem),
    [game.i18n.localize("SL.Gear")]: data.gear.map(gearToItem),
    [game.i18n.localize("SL.Vehicles")]: data.vehicles.map(vehicleToItem)
  }));
  await step("sorcery", pack => fill(pack, {
    ...Object.fromEntries([1, 2, 3, 4, 5].map(l => [`${game.i18n.localize("SL.SpellLevel")} ${l}`, data.spells.filter(s => s.level === l).map(spellToItem)])),
    [game.i18n.localize("SL.Disciplines")]: data.disciplines.map(disciplineToItem)
  }));
  await step("bestiary", pack => fill(pack, Object.fromEntries(Object.entries(groupBy(data.creatures, c => c.group || "Other")).map(([g, list]) => [g, list.map(creatureToActor)]))));
  await step("tags", pack => fill(pack, { "": [tagsJournal(data)] }));
  await step("tables", pack => fillTables(pack, data));

  await game.settings.set(SYSTEM, "madnessCosts", data.madnessCosts ?? []);
  await game.settings.set(SYSTEM, "importInfo", { date: new Date().toISOString(), counts: data.counts, parserVersion: data.meta?.parserVersion });
  onProgress(game.i18n.localize("SL.Import.done"));
}

/**
 * The skill names are rules, not book text, so a world without an import still gets an
 * "SL: Skills" compendium: one item per skill (name and attribute, no description).
 * A PDF import replaces it with the described skills. Runs on "ready" for the first GM.
 */
export async function ensureSkillPack() {
  if (!game.user.isGM || game.user !== game.users.activeGM || game.packs.get(`world.${packName("skills")}`)) return;
  const pack = await freshPack("skills", await compendiumFolder());
  await fill(pack, { "": Object.entries(SL.skills).map(([name, s]) => ({
    name, type: "skill", img: defaultItemIcon("skill"), system: { level: 0, attribute: s.attr, source: "Silent Legions" }
  })) });
}

/** Upload the PDF into the world folder so a journal page can show it. Returns the path. */
export async function uploadPdf(file) {
  const FP = foundry.applications.apps.FilePicker.implementation;
  const dir = `worlds/${game.world.id}/silent-legions`;
  try { await FP.createDirectory("data", dir); } catch { /* exists */ }
  const res = await FP.upload("data", dir, file, {}, { notify: false });
  return res?.path ?? `${dir}/${file.name}`;
}
