/**
 * Convert parsed book data (sl-parser.mjs) into an RPG Keeper content pack.
 *
 * RPG Keeper (osr_keeper repo) imports a file with a `pack` header as a content pack:
 * it adds the Compendium entries, Bestiary monsters, and random tables (Tables tab)
 * to the "sl" system, skips what it already has (an entry with the same name and
 * category, a monster with the same ref, a table with the same name), and never
 * replaces anything. Monsters use Keeper's Silent Legions def shape; tables use the
 * text format of osr_keeper's js/table-syntax.js. This file has no Foundry or Node
 * dependencies.
 */

import { buildTablePlan } from "./table-plan.mjs";

const slug = s => String(s).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const md = list => (Array.isArray(list) ? list : String(list ?? "").split(/\n\n+/)).filter(Boolean).join("\n\n");
const cell = s => String(s ?? "").replace(/\|/g, "/");
const mdTable = (head, rows) => [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map(r => `| ${r.map(cell).join(" | ")} |`)].join("\n");
const page = p => (p ? `p. ${p - 3}` : "");

function entry(name, category, source, body, refKind) {
  return { name, category, source, body, ref: `slpdf:${refKind}:${slug(name)}` };
}

/* -------------------------------------------- */
/*  Compendium                                  */
/* -------------------------------------------- */

function weaponSource(w) {
  if (/machine gun|launcher/i.test(w.name)) return "Weapon (Heavy)";
  if (/bow|grenade/i.test(w.name) || (w.range && !w.magazine && !/knife|club|spear/i.test(w.name))) return "Weapon (Ranged)";
  if (Number(w.magazine) > 0 && !/taser/i.test(w.name)) return "Weapon (Firearm)";
  return "Weapon (Melee)";
}

function compendium(data) {
  const out = [];
  // Rules
  for (const s of data.quickReference ?? []) out.push(entry(`Quick Reference: ${s.title}`, "Rules", "Quick Reference", md(s.paragraphs), "rule"));
  if (data.madnessCosts?.length) {
    out.push(entry("Madness Costs", "Rules", "Madness", mdTable(["Category", "Event", "Cost"], data.madnessCosts.map(m => [m.category, m.event, m.cost])), "rule"));
  }
  if (data.disciplineRules?.length) out.push(entry("Occult Disciplines", "Rules", "Sorcery", md(data.disciplineRules), "rule"));
  for (const c of data.classes ?? []) {
    const prog = mdTable(["Lvl", "HD", "Atk", "Phys", "Ment", "Evas", "Magic", "Luck"],
      c.progression.map(p => [p.level, p.hitDice, p.attack >= 0 ? `+${p.attack}` : p.attack, ...Object.values(p.saves)]));
    out.push(entry(c.name, "Rules", "Class", [
      `**Prime Attributes** ${c.primeAttributes.join(", ")}`,
      `**Class Skills** ${c.classSkills.join(", ")}`,
      `**Bonus Skills** ${c.bonusSkills.join(", ")}`,
      md(c.description),
      `**Abilities** ${c.abilities.map(a => `[${a.name}] (${a.level})`).join(", ")}`,
      prog
    ].join("\n\n"), "class"));
    for (const a of c.abilities) {
      out.push(entry(a.name, "Abilities", `${c.name} ${a.level}`, `**${c.name}** level ${a.level} · **Cost** 1 Expertise\n\n${a.description}`, "ability"));
    }
  }
  if (data.skills?.length) {
    for (const s of data.skills) out.push(entry(s.name, "Rules", s.specialization ? "Skill (Specialization)" : "Skill", md(s.description), "skill"));
  }
  if (data.backgrounds?.length) {
    out.push(entry("Backgrounds", "Rules", "Character Creation",
      `Roll 1d8 and 1d10.\n\n${mdTable(["1d8/1d10", "Background", "Starting Skills"], data.backgrounds.map(b => [b.roll, b.name, b.skills.join(", ")]))}`, "rule"));
  }
  for (const d of data.deliria ?? []) out.push(entry(d.name, "Abilities", "Delirium", `**Delirium** (${d.roll})\n\n${d.description}`, "delirium"));

  // Sorcery
  for (const s of data.spells ?? []) {
    out.push(entry(s.name, "Spells", `Spell Level ${s.level}`, `**Level** ${s.level} · **Cost** 1 Expertise or ${s.level} Madness · ${page(s.page)}\n\n${md(s.description)}`, "spell"));
  }
  for (const d of data.disciplines ?? []) {
    const levels = d.levels.map(l => `**${l.level}.** ${l.description}`).join("\n\n");
    out.push(entry(d.name, "Powers", "Discipline", `**Cost** 1 Expertise, or Madness = discipline level + 1 — see [Occult Disciplines]\n\n${md(d.description)}\n\n${levels}`, "discipline"));
  }

  // Equipment
  for (const w of data.weapons ?? []) {
    const flags = [w.subdual && "subdual damage", w.burst && "burst fire", w.suppress && "suppressive fire", w.slowReload && "extra action to reload"].filter(Boolean);
    const head = `**Damage** ${w.damage} · **Slaughter** ${w.slaughter || "none"} · **Attribute** ${w.attributes.map(a => a[0].toUpperCase() + a.slice(1)).join("/")}`
      + (w.range ? ` · **Range** ${w.range} m` : "") + (w.magazine ? ` · **Mag** ${w.magazine}` : "") + ` · **Cost** ${w.cost}`;
    out.push(entry(w.name, "Items", weaponSource(w), [head, flags.length ? `*${flags.join(", ")}*` : "", w.description].filter(Boolean).join("\n\n"), "weapon"));
  }
  for (const a of data.armor ?? []) {
    const ac = a.shield ? `-${a.shieldBonus} bonus` : `${a.ac}`;
    const notes = [a.noFirearms && "ineffective against firearms and explosives", a.noMelee && "ineffective against melee weapons"].filter(Boolean);
    out.push(entry(a.name, "Items", "Armor", [`**AC** ${ac} · **Enc** ${a.enc} · **Cost** ${a.cost}`, notes.length ? `*${notes.join("; ")}*` : "", a.description].filter(Boolean).join("\n\n"), "armor"));
  }
  for (const g of data.gear ?? []) {
    out.push(entry(g.name, "Items", "Gear", `**Enc** ${g.enc === 0 ? "—" : g.enc}${g.bundle ? " (bundles of 3)" : ""} · **Cost** ${g.cost}`, "gear"));
  }
  for (const v of data.vehicles ?? []) {
    out.push(entry(v.name, "Items", "Vehicle", `**Speed** ${v.speed} · **Armor** ${v.armor} · **HP** ${v.hp} · **Crew** ${v.crew} · **Cost** ${v.cost}`, "vehicle"));
  }

  // Location tags
  for (const t of data.tags ?? []) {
    const list = (label, items) => (items?.length ? `**${label}:** ${items.join("; ")}` : "");
    out.push(entry(t.name, "Other", "Location Tag", [t.description, list("Enemies", t.enemies), list("Friends", t.friends),
      list("Schemes", t.schemes), list("Secrets", t.secrets), list("Places", t.places)].filter(Boolean).join("\n\n"), "tag"));
  }

  return out;
}

/* -------------------------------------------- */
/*  Random tables (Keeper's Tables tab)         */
/* -------------------------------------------- */

const range = r => (r.range[0] === r.range[1] ? `${r.range[0]}` : `${r.range[0]}-${r.range[1]}`);
// One line of table text: no line breaks, and no [ ] (Keeper reads [Name] as a lookup).
const line = s => String(s ?? "").replace(/\s*\n\s*/g, " ").replace(/\[/g, "(").replace(/\]/g, ")").trim();
const comment = s => (s ? `# ${line(s)}\n` : "");

// Keeper's table filters (osr_keeper js/tables.js): where a table comes from,
// its settings, and what it makes (Encounter, Entity, Location, Adventure,
// Group, Other).
const ORIGIN = "Silent Legions";
const SETTINGS = ["Modern", "Horror"];
// By table name first (masters, and book sections that make something else
// than their chapter), then by the book chapter (`folder`). The rest is Other
// (sorcery, artifacts, names, poisons, visions, character creation).
const OUTPUT_BY_NAME = [
  [/^(One-Roll Actor|Secret Adept|Mythos Aberration|Monster Twist|Outer God|Deity Mode|Alien)/, "Entity"],
  [/^Lovecraftian Name Generator: (Region|Motive to Study|Hallmark Magic|Manner of)/, "Entity"],
  [/^(Pantheon|Cult|Creating Gods: (Number of Major Deities|Pantheon Traits))/, "Group"],
  [/^Kelipah/, "Location"],
  [/^(Resolution Scene|Investigation Scene|Adventure Template|Extra Scenes|Scene Challenge|One-Roll Crime)/, "Adventure"],
  [/^Poisons and Diseases/, "Other"]
];
const OUTPUT_BY_FOLDER = {
  "Creating Gods": "Entity", "Creating Aliens": "Entity", Bestiary: "Entity",
  "Creating Cults": "Group",
  "Creating Kelipot": "Location", "Building Your World": "Location",
  "Creating Adventure Templates": "Adventure"
};
export function tableOutput(name, folder) {
  const rule = OUTPUT_BY_NAME.find(([re]) => re.test(name));
  return rule ? rule[1] : OUTPUT_BY_FOLDER[folder] ?? "Other";
}
const keeperTable = (name, folder, source) =>
  ({ name, origin: ORIGIN, settings: [...SETTINGS], output: tableOutput(name, folder), system: "sl", source });

// Book tables and helper tables: "1d12" and one "range: text" line per result.
// Links (spells, deliria, tags, backgrounds) stay as plain text.
// Master tables: "Roll on each" is one 1d1 line with a [Name] lookup per
// sub-table; "Branch" rows end with a lookup of the table they lead to.
function tables(data) {
  const plan = buildTablePlan(data);
  const names = new Map([...plan.tables, ...plan.masters].map(t => [t.id, t.name]));
  const out = [];
  for (const t of plan.tables) {
    const rows = t.results.map(r => `${range(r)}: ${line(r.text)}`);
    out.push(keeperTable(t.name, t.folder, `${comment(t.description)}${t.formula}\n${rows.join("\n")}\n`));
  }
  for (const m of plan.masters) {
    const rows = m.kind === "all"
      ? [`1: ${m.results.map(r => `${line(r.label)}: [${names.get(r.ref)}]`).join("; ")}`]
      : m.results.map(r => `${range(r)}: ${line(r.text) ? `${line(r.text)} — ` : ""}[${names.get(r.ref)}]`);
    const formula = m.kind === "all" ? "1d1" : m.formula;
    out.push(keeperTable(m.name, m.folder, `${comment(m.description)}${formula}\n${rows.join("\n")}\n`));
  }
  return out;
}

/* -------------------------------------------- */
/*  Bestiary                                    */
/* -------------------------------------------- */

function monster(c) {
  const hdKeeper = c.hdValue === 0 ? "0" : c.hdValue === 0.5 ? "½" : String(c.hdValue);
  const hp = c.hdValue === 0 ? 1 : c.hdValue === 0.5 ? 2 : Math.floor(4.5 * c.hdValue);
  const attacks = c.attacks.map(a => {
    const byWeapon = /^(wpn|by weapon|weapon)$/i.test(a.damage);
    return { label: a.name, count: a.count, toHit: a.bonus, damage: byWeapon ? "" : a.damage, note: byWeapon ? "by weapon" : "", raw: "" };
  });
  // Keeper's own format (js/monster-form.js): "2 claw +3 (1d4)".
  const attacksText = attacks.map(a => `${a.count > 1 ? `${a.count} ` : ""}${a.label} ${a.toHit >= 0 ? "+" : ""}${a.toHit} (${a.damage || a.note || "—"})`).join(", ");
  const hdText = c.hdValue === 0 ? "1 hp (1hp)" : c.hdValue === 0.5 ? "1d4 hp (2hp)" : `${c.hdValue} (${hp}hp)`;
  const id = `slpdf-${slug(c.name)}`;
  const desc = String(c.description ?? "").split(/\n\n/)[0] ?? "";
  return {
    name: c.name,
    desc: c.description ?? "",
    ac: { asc: null, desc: c.ac ?? 9, thac0: null },
    hd: hdKeeper,
    attacks,
    move: c.move ?? "",
    skill: c.skill ?? 0,
    madness: c.madness ?? "None",
    abilities: c.special ? [{ name: "", text: c.special }] : [],
    id,
    ref: `slpdf:monster:${slug(c.name)}`,
    source: "sl",
    mundaneImmune: !!c.mundaneImmune,
    hdNum: c.hdValue,
    hp,
    align: "",
    xp: null,
    moraleML: c.morale ?? 7,
    atkBonus: attacks[0]?.toHit ?? 0,
    attacksText,
    stats: null,
    saveTargets: { Save: c.save },
    savesText: `${c.save}+`,
    slaughterDie: c.slaughter || "1d6",
    raw: [c.name, desc, `AC ${c.ac}${c.mundaneImmune ? "*" : ""}, HD ${hdText}, Atk ${attacksText}, Move ${c.move}, ML ${c.morale}, Skill ${c.skill >= 0 ? "+" : ""}${c.skill}, Madness ${c.madness}, Slaughter ${c.slaughter || "1d6"}, Save ${c.save}+`].filter(Boolean).join("\n")
  };
}

/**
 * @param {object} data   Output of parseBook().
 * @returns {{pack: {name: string, system: string}, compendium: object[], monsters: object[], tables: object[]}}
 */
export function toKeeperPack(data) {
  return {
    pack: { name: "Silent Legions (from your PDF)", system: "sl", version: data.meta?.parserVersion ?? 1, createdAt: data.meta?.createdAt },
    compendium: compendium(data),
    monsters: (data.creatures ?? []).map(monster),
    tables: tables(data)
  };
}
