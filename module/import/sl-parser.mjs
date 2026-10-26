/**
 * Silent Legions book parser.
 *
 * Input: the page objects from pdf-extract.mjs. Output: plain JSON data (see
 * docs/data-format.md). The parser has no Foundry or Node dependencies, so the
 * Foundry importer and the Node CLI (tools/extract.mjs) produce the same data.
 *
 * The parser finds each section by its heading text and table headers, not by
 * page number. It is written for the 2015 Sine Nomine PDF (189 pages); another
 * printing can need small changes. Anything it cannot read goes to `warnings`.
 */

export const PARSER_VERSION = 1;

const CLASS_NAMES = ["Investigator", "Scholar", "Socialite", "Tough"];
const SAVE_KEYS = ["physical", "mental", "evasion", "magic", "luck"];
const HEADER_Y = 750;   // running chapter title at y = 755
const FOOTER_Y = 36;    // page number at y = 30

/* -------------------------------------------- */
/*  Text helpers                                */
/* -------------------------------------------- */

const norm = s => s.replace(/[’‘]/g, "'").replace(/[“”]/g, "\"").replace(/\s+/g, " ").trim();
const slug = s => norm(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const isNum = s => /^\d+\+?$/.test(s);
const toInt = s => { const n = parseInt(String(s).replace(/[^\d-]/g, ""), 10); return Number.isNaN(n) ? null : n; };

/** Join text items of one line, adding a space where the PDF leaves a gap. */
function joinItems(items) {
  let out = "";
  let prev = null;
  for (const it of items) {
    if (prev) {
      const gap = it.x - (prev.x + prev.w);
      if (gap > 0.8 && !out.endsWith(" ") && !it.s.startsWith(" ")) out += " ";
    }
    out += it.s;
    prev = it;
  }
  return norm(out);
}

/* -------------------------------------------- */
/*  Page and line model                         */
/* -------------------------------------------- */

class Book {
  constructor(pages) {
    this.pages = [];
    this.lines = [];
    this.warnings = [];
    const words = new Set();
    for (const page of pages) {
      const chapterItem = page.items.find(i => i.y >= HEADER_Y && i.font === "label");
      const chapter = chapterItem ? norm(chapterItem.s) : "";
      const items = page.items.filter(i => !(i.y >= HEADER_Y && i.font === "label") && !(i.y <= FOOTER_Y && isNum(i.s.trim())));
      const lines = [];
      let line = null;
      for (const it of items) {
        if (line && Math.abs(it.y - line.y) <= 2.5) { line.items.push(it); continue; }
        line = { page: page.num, chapter, y: it.y, items: [it] };
        lines.push(line);
      }
      for (const l of lines) {
        l.x = Math.min(...l.items.map(i => i.x));
        l.x2 = Math.max(...l.items.map(i => i.x + i.w));
        l.h = Math.max(...l.items.map(i => i.h));
        l.font = l.items[0].font;
        l.text = joinItems(l.items);
        l.index = this.lines.length;
        this.lines.push(l);
        for (const w of l.text.split(/[^A-Za-z]+/)) if (w) words.add(w.toLowerCase());
      }
      this.pages.push({ num: page.num, chapter, lines });
    }
    this.words = words;
  }

  /** Index of the first line at or after `from` that passes `test`. */
  find(test, from = 0, to = this.lines.length) {
    for (let i = from; i < to; i++) if (test(this.lines[i])) return i;
    return -1;
  }

  /** True when a line is a section heading (Trajan Bold, 12pt or more). */
  static isHeading(l, min = 12) {
    return l.font === "heading" && l.h >= min;
  }

  /**
   * Reflow lines into paragraphs. A gap larger than 1.5 lines, a bullet, or a
   * move to a new column after a full stop starts a new paragraph.
   */
  paragraphs(lines) {
    const paras = [];
    let cur = null;
    let prev = null;
    for (const l of lines) {
      let text = l.text;
      let start = !cur || text.startsWith("•");
      if (cur && prev) {
        const sameColumn = l.page === prev.page && l.y < prev.y;
        if (sameColumn) start ||= (prev.y - l.y) > prev.h * 1.6;
        else start ||= /[.!?:"']$/.test(cur.text);
      }
      if (start) {
        cur = { text: text.replace(/^•\s*/, ""), bullet: text.startsWith("•") };
        paras.push(cur);
      } else {
        cur.text = this.joinText(cur.text, text);
      }
      prev = l;
    }
    return paras.map(p => p.text);
  }

  /** Join two text lines. A hyphen at the line end is removed when the joined word exists in the book. */
  joinText(a, b) {
    const m = a.match(/([A-Za-z]+)-$/);
    if (m) {
      const next = b.match(/^([a-z]+)/);
      if (next && this.words.has((m[1] + next[1]).toLowerCase())) return a.slice(0, -1) + b;
      return a + b;
    }
    return `${a} ${b}`;
  }
}

/* -------------------------------------------- */
/*  Grid tables                                 */
/* -------------------------------------------- */

/** Column index for an item, by overlap with the header cells, else the nearest center. */
function columnOf(item, columns) {
  let best = -1, bestScore = -Infinity;
  const a = item.x, b = item.x + item.w;
  columns.forEach((c, i) => {
    const overlap = Math.min(b, c.x2) - Math.max(a, c.x);
    const dist = Math.abs((a + b) / 2 - (c.x + c.x2) / 2);
    const score = overlap > 0 ? 1000 + overlap : -dist;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

/** Split a line into cells, one per column. */
function cells(line, columns) {
  const out = columns.map(() => []);
  for (const it of line.items) out[columnOf(it, columns)].push(it);
  return out.map(items => joinItems(items));
}

const headerColumns = line => line.items.map(i => ({ x: i.x, x2: i.x + i.w, s: norm(i.s) }));

/** Index of a line whose items are exactly `labels` (as a prefix match on each). */
function findHeader(book, labels, from = 0) {
  return book.find(l => l.items.length === labels.length
    && l.items.every((it, i) => norm(it.s).toLowerCase().startsWith(labels[i].toLowerCase())), from);
}

/* -------------------------------------------- */
/*  Character creation                          */
/* -------------------------------------------- */

function splitList(text) {
  return norm(text).replace(/\.\s/g, ", ").replace(/\band\s+/g, "").replace(/\.$/, "")
    .split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
}

function parseClasses(book) {
  const classes = [];
  for (const name of CLASS_NAMES) {
    const h = book.find(l => Book.isHeading(l, 13) && l.text === `The ${name}`);
    if (h < 0) { book.warnings.push(`Class ${name}: heading not found`); continue; }
    const lines = book.pages[book.lines[h].page - 1].lines;
    const at = label => lines.findIndex(l => l.font === "label" && l.text === label);
    const iPrime = at("Prime Attributes"), iSkills = at("Class Skills"), iBonus = at("Bonus Skills for New Characters");
    const iAbil = at("Class Abilities");
    const cls = { name, key: name.toLowerCase(), page: book.lines[h].page, primeAttributes: [], classSkills: [], bonusSkills: [],
      description: [], abilitiesIntro: [], abilities: [], abilitiesNote: "", progression: [] };
    if (iPrime >= 0) cls.primeAttributes = lines[iPrime + 1].text.split(/\s+and\s+/);
    if (iSkills >= 0 && iBonus > iSkills) cls.classSkills = splitList(lines.slice(iSkills + 1, iBonus).map(l => l.text).join(" "));
    if (iBonus >= 0) cls.bonusSkills = splitList(lines[iBonus + 1].text);
    if (iBonus >= 0 && iAbil > iBonus) cls.description = book.paragraphs(lines.slice(iBonus + 2, iAbil));
    if (iAbil >= 0) {
      const iEnd = lines.findIndex((l, i) => i > iAbil && Book.isHeading(l, 13));
      const body = book.paragraphs(lines.slice(iAbil + 1, iEnd < 0 ? undefined : iEnd));
      for (const p of body) {
        const m = p.match(/^([^:]{3,40}):\s*(At (\d+)\w* level.*)$/);
        if (m) cls.abilities.push({ name: m[1].trim(), level: Number(m[3]), description: m[2] });
        else if (cls.abilities.length) cls.abilitiesNote = cls.abilitiesNote ? `${cls.abilitiesNote} ${p}` : p;
        else cls.abilitiesIntro.push(p);
      }
    }
    for (const l of lines) {
      const t = l.items.map(i => norm(i.s));
      if (t.length === 8 && /^\d+\+?$/.test(t[0]) && /^\d+d\d+$/.test(t[1])) {
        const saves = {};
        SAVE_KEYS.forEach((k, i) => { saves[k] = toInt(t[3 + i]); });
        cls.progression.push({ level: toInt(t[0]), hitDice: t[1], attack: toInt(t[2]), saves });
      }
    }
    if (cls.progression.length !== 10) book.warnings.push(`Class ${name}: ${cls.progression.length} progression rows (expected 10)`);
    if (cls.abilities.length !== 4) book.warnings.push(`Class ${name}: ${cls.abilities.length} abilities (expected 4)`);
    classes.push(cls);
  }
  return classes;
}

function parseBackgrounds(book) {
  const h = findHeader(book, ["1d8", "1d10", "Background", "Starting Skills"]);
  if (h < 0) { book.warnings.push("Backgrounds table not found"); return []; }
  const out = [];
  let group = "";
  for (let i = h + 1; i < book.lines.length && out.length < 40; i++) {
    const l = book.lines[i];
    const t = l.items.map(it => norm(it.s));
    if (t.length === 1 && /^\d-\d$/.test(t[0])) { group = t[0]; continue; }
    if (t.length !== 3 || !isNum(t[0])) break;
    out.push({ name: t[1], roll: `${group}/${t[0]}`, skills: splitList(t[2]) });
  }
  if (out.length !== 40) book.warnings.push(`Backgrounds: ${out.length} rows (expected 40)`);
  return out;
}

function parseSkills(book) {
  const start = book.find(l => Book.isHeading(l, 13) && l.text === "Skills" && l.chapter === "Character Creation");
  const end = book.find(l => Book.isHeading(l, 13) && l.text.startsWith("Choosing Your Character Class"), start + 1);
  if (start < 0 || end < 0) { book.warnings.push("Skills section not found"); return { intro: [], skills: [] }; }
  const lines = book.lines.slice(start + 1, end);
  const heads = [];
  lines.forEach((l, i) => { if (l.font === "label" && l.h >= 9.5 && l.h < 12) heads.push(i); });
  const skills = heads.map((hi, n) => {
    const text = lines[hi].text;
    const m = text.match(/^(.+?)\s*\(Specialization\)$/);
    return {
      name: m ? m[1] : text,
      specialization: !!m,
      description: book.paragraphs(lines.slice(hi + 1, heads[n + 1] ?? lines.length))
    };
  });
  return { intro: book.paragraphs(lines.slice(0, heads[0] ?? 0)), skills };
}

function parseDeliria(book) {
  const h = book.find(l => l.text === "Sample Deliria");
  if (h < 0) { book.warnings.push("Deliria not found"); return []; }
  const page = book.lines[h].page;
  const lines = book.lines.slice(h + 1).filter(l => l.page === page);
  const out = [];
  for (const p of book.paragraphs(lines)) {
    const m = p.match(/^(\d+)\)\s*([^:]+):\s*(.*)$/);
    if (m) out.push({ roll: Number(m[1]), name: m[2].trim(), description: m[3] });
    else if (out.length) out.at(-1).description += ` ${p}`;
  }
  if (out.length !== 12) book.warnings.push(`Deliria: ${out.length} entries (expected 12)`);
  return out;
}

function parseMadnessCosts(book) {
  const h = book.find(l => l.items.length === 2 && norm(l.items[0].s) === "Bloodshed Events" && norm(l.items[1].s) === "Cost");
  if (h < 0) { book.warnings.push("Madness costs table not found"); return []; }
  const out = [];
  let category = "Bloodshed";
  for (let i = h + 1; i < book.lines.length; i++) {
    const l = book.lines[i];
    const m = l.text.match(/^(Bloodshed|Horror|Occult) Events$/);
    if (m) { category = m[1]; continue; }
    if (l.items.length !== 2) break;
    out.push({ category, event: norm(l.items[0].s).replace(/\.$/, ""), cost: norm(l.items[1].s) });
  }
  return out;
}

/** The Quick Reference page of the rules chapter, as titled paragraphs. */
function parseQuickReference(book) {
  const h = book.find(l => Book.isHeading(l, 13) && l.text === "Silent Legions Quick Reference");
  if (h < 0) { book.warnings.push("Quick Reference not found"); return []; }
  const page = book.lines[h].page;
  const lines = book.lines.slice(h + 1).filter(l => l.page === page);
  const sections = [];
  let cur = null;
  const flush = (to) => { if (cur) cur.paragraphs = book.paragraphs(cur.lines.slice(0, to)); };
  for (const l of lines) {
    if (l.font === "label" && l.h >= 11) { flush(); cur = { title: l.text, lines: [] }; sections.push(cur); continue; }
    cur?.lines.push(l);
  }
  flush();
  for (const s of sections) {
    // The Madness section ends with the costs table, which madnessCosts already holds.
    const i = s.lines.findIndex(l => l.text === "Madness Costs");
    if (i >= 0) s.paragraphs = book.paragraphs(s.lines.slice(0, i));
    delete s.lines;
  }
  return sections;
}

/* -------------------------------------------- */
/*  Equipment                                   */
/* -------------------------------------------- */

function gridRows(book, h, stop) {
  const columns = headerColumns(book.lines[h]);
  const rows = [];
  for (let i = h + 1; i < book.lines.length; i++) {
    const l = book.lines[i];
    if (stop(l)) break;
    rows.push(cells(l, columns));
  }
  return rows;
}

function parseEquipment(book) {
  const out = { weapons: [], armor: [], gear: [], vehicles: [], notes: {} };

  // Weapons
  const hw = findHeader(book, ["Weapon", "Dmg", "Slaughter", "Attrib", "Range", "Mag", "Cost"]);
  if (hw >= 0) {
    const legend = [];
    const rows = gridRows(book, hw, l => /^[§*#@]/.test(l.text) && (legend.push(l.text), true));
    for (let i = hw + rows.length + 2; i < book.lines.length && /^[§*#@]|^weapons can|^#/.test(book.lines[i].text); i++) legend.push(book.lines[i].text);
    const special = book.find(l => l.text === "Special Weapon Notes");
    const notes = special >= 0 ? book.paragraphs(book.lines.slice(special + 1, book.find(l => l.text === "Burst Fire and Suppressive Fire", special))) : [];
    out.notes.weapons = legend.join(" ");
    for (const [name, damage, slaughter, attributes, range, magazine, cost] of rows) {
      const flags = damage.match(/[§*#]/g) ?? [];
      const w = {
        name, damage: damage.replace(/[§*#]/g, "").trim(), slaughter: slaughter === "None" ? "" : slaughter,
        attributes: attributes.split("/").map(a => a.toLowerCase()), range: range === "N/A" ? "" : range,
        magazine: magazine.replace("@", ""), slowReload: magazine.includes("@"), cost,
        subdual: flags.includes("§"), burst: flags.includes("*"), suppress: flags.includes("#"),
        description: ""
      };
      const lname = name.toLowerCase();
      w.description = notes.filter(p => {
        const first = p.split(/\s+/)[0].toLowerCase().replace(/s$/, "");
        return lname.includes(first);
      }).join("\n\n");
      out.weapons.push(w);
    }
    out.notes.weaponRules = notes;
  } else book.warnings.push("Weapons table not found");

  // Armor
  const ha = findHeader(book, ["Armor", "AC", "Enc", "Cost"]);
  if (ha >= 0) {
    const legend = [];
    const rows = gridRows(book, ha, l => /^[*@]/.test(l.text) && (legend.push(l.text), true));
    const next = book.lines[ha + rows.length + 2];
    if (next && /^@/.test(next.text)) legend.push(next.text);
    out.notes.armor = legend.join(" ");
    const types = book.find(l => l.text === "Types of Armor");
    const paras = types >= 0 ? book.paragraphs(book.lines.slice(types + 1, ha).filter(l => l.page === book.lines[types].page)) : [];
    for (const [name, ac, enc, cost] of rows) {
      const shield = /bonus/i.test(ac);
      const stem = name.toLowerCase().replace(/s$/, "");
      out.armor.push({
        name, ac: shield ? 0 : toInt(ac), shieldBonus: shield ? Math.abs(toInt(ac)) : 0, shield,
        noFirearms: ac.includes("*"), noMelee: ac.includes("@"), enc: toInt(enc) ?? 1, cost,
        description: paras.filter(p => shield ? /shields/i.test(p) : p.slice(0, 80).toLowerCase().includes(stem)).join("\n\n")
      });
    }
  } else book.warnings.push("Armor table not found");

  // Gear and vehicles (same page)
  const hg = findHeader(book, ["Item", "Enc", "Cost"]);
  const hv = findHeader(book, ["Vehicle", "Speed", "Armor", "HP", "Crew", "Cost"]);
  if (hg >= 0) {
    const rows = gridRows(book, hg, l => l.index >= hv || l.items.length > 3 || l.font === "label");
    for (const [name, enc, cost] of rows) {
      out.gear.push({ name, enc: enc === "*" ? 0 : (toInt(enc) ?? 1), bundle: enc.includes("@"), cost });
    }
  } else book.warnings.push("Gear table not found");
  if (hv >= 0) {
    const rows = gridRows(book, hv, l => l.items.length !== 6);
    for (const [name, speed, armor, hp, crew, cost] of rows) {
      out.vehicles.push({ name, speed: toInt(speed), armor: toInt(armor), hp: toInt(hp), crew: toInt(crew), cost });
    }
    const vp = book.find(l => l.text === "Vehicles" && l.font === "label");
    if (vp >= 0) out.notes.vehicles = book.paragraphs(book.lines.slice(vp + 1, book.find(l => l.text === "Vehicle Weaponry", vp)));
  } else book.warnings.push("Vehicles table not found");
  return out;
}

/* -------------------------------------------- */
/*  Sorcery                                     */
/* -------------------------------------------- */

function parseSpells(book) {
  const spells = [];
  const isSpellHead = l => l.font === "label" && l.items.length === 2 && /^Level [1-5]$/.test(norm(l.items[1].s))
    && !/^Level/.test(norm(l.items[0].s)) && l.chapter === "Sorcery";
  let i = book.find(isSpellHead);
  while (i >= 0) {
    const head = book.lines[i];
    const next = book.find(l => isSpellHead(l) || Book.isHeading(l, 12), i + 1);
    const body = book.lines.slice(i + 1, next < 0 ? undefined : next);
    spells.push({ name: norm(head.items[0].s), level: toInt(head.items[1].s), page: head.page, description: book.paragraphs(body) });
    i = book.find(isSpellHead, i + 1);
  }
  if (spells.length < 30) book.warnings.push(`Spells: only ${spells.length} found`);
  return spells;
}

function parseDisciplines(book) {
  const start = book.find(l => Book.isHeading(l, 13) && l.text === "Occult Disciplines");
  if (start < 0) { book.warnings.push("Occult Disciplines not found"); return { rules: [], disciplines: [] }; }
  const isHead = l => Book.isHeading(l, 13);
  const firstSub = book.find(l => isHead(l), start + 1);
  const rules = book.paragraphs(book.lines.slice(start + 1, firstSub).filter(l => !(l.font === "label" && l.h >= 11)));
  const disciplines = [];
  for (let i = firstSub; i >= 0 && book.lines[i].chapter === "Sorcery"; i = book.find(isHead, i + 1)) {
    const next = book.find(isHead, i + 1);
    const body = book.lines.slice(i + 1, next < 0 ? undefined : next);
    const t = body.findIndex(l => /^Lvl\s+Ability$/.test(l.text));
    if (t < 0) continue;
    const levels = [];
    for (const l of body.slice(t + 1)) {
      const first = norm(l.items[0].s);
      if (/^[0-4]$/.test(first) && l.items[0].x < body[t].items[1].x - 5) {
        levels.push({ level: Number(first), lines: [] });
        if (l.items.length > 1) levels.at(-1).lines.push({ ...l, items: l.items.slice(1), text: joinItems(l.items.slice(1)) });
      } else levels.at(-1)?.lines.push(l);
    }
    disciplines.push({
      name: book.lines[i].text,
      page: book.lines[i].page,
      description: book.paragraphs(body.slice(0, t)),
      levels: levels.map(v => ({ level: v.level, description: book.paragraphs(v.lines).join(" ") }))
    });
  }
  return { rules, disciplines };
}

/* -------------------------------------------- */
/*  Bestiary                                    */
/* -------------------------------------------- */

/**
 * Build attack entries from stat block text.
 * "bite +8 / claw+8 x2" + "1d6" → bite +8 (1d6) and claw +8 ×2 (1d6).
 * Template rows give the bonus in its own column: "bite / claw x 2", "+4", "1d8 / 1d6 x 2".
 */
function buildAttacks(namesText, bonusText, dmgText) {
  const names = norm(namesText), dmg = norm(dmgText ?? "");
  const nameParts = names.split(/\s+\/\s+|\s+\+\s+(?=[a-z])/i).filter(Boolean);
  let dmgParts = dmg.split(/\s+\/\s+/).filter(Boolean);
  if (dmgParts.length !== nameParts.length && /\s\+\s/.test(names)) {
    const plus = dmg.split(/\s+\+\s+/).filter(Boolean);
    if (plus.length === nameParts.length) dmgParts = plus;   // "bite + wpn" / "1d4 + wpn"
  }
  const shared = toInt(bonusText);
  const countOf = t => toInt((t.match(/x\s*(\d+)/i) ?? [])[1]);
  return nameParts.map((part, k) => {
    const d = dmgParts.length === nameParts.length ? dmgParts[k] : dmg;
    const bonus = (part.match(/([+-]\d+)/) ?? [])[1];
    return {
      name: part.replace(/[+-]\d+/, "").replace(/x\s*\d+/gi, "").replace(/\s+/g, " ").trim() || "attack",
      bonus: bonus !== undefined ? Number(bonus) : (shared ?? 0),
      count: countOf(part) ?? (dmgParts.length === nameParts.length ? countOf(d) : null) ?? 1,
      damage: d.replace(/\s*x\s*\d+$/i, "").trim()
    };
  });
}

function hdToNumber(hd) {
  const s = norm(String(hd));
  if (/^1 hp$/i.test(s)) return 0;
  if (/^1d4 hp$/i.test(s)) return 0.5;
  return toInt(s) ?? 0;
}

function finishCreature(c) {
  c.hdValue = hdToNumber(c.hd);
  c.mundaneImmune = /\*/.test(String(c.ac));
  c.ac = toInt(c.ac);
  c.morale = toInt(c.morale);
  c.skill = toInt(c.skill) ?? 0;
  c.save = toInt(c.save) ?? Math.ceil(15 - c.hdValue / 2);
  c.madness = norm(String(c.madness ?? "None"));
  if (c.madness === "0") c.madness = "None";
  c.special = norm(String(c.special ?? ""));
  if (/^none$/i.test(c.special)) c.special = "";
  // "Most creature attacks use a 1d6 Slaughter die unless noted specially."
  c.slaughter = (c.special.match(/(\d*d\d+) Slaughter die/i) ?? [])[1] ?? "1d6";
  c.attacksText = c.attacks.map(a => `${a.name} ${a.bonus >= 0 ? "+" : ""}${a.bonus}${a.count > 1 ? ` x${a.count}` : ""} (${a.damage || "—"})`).join(", ");
  return c;
}

function parseCreatureTemplates(book) {
  const h = findHeader(book, ["Type Of Entity", "AC", "HD", "Attacks", "+Hit", "Damage", "Move", "ML", "Skill", "Mad"]);
  if (h < 0) { book.warnings.push("Creature template table not found"); return []; }
  const columns = headerColumns(book.lines[h]).slice(1);
  const page = book.lines[h].page;
  const varieties = book.find(l => l.text === "Varieties of Foul Foes");
  const vEnd = varieties >= 0 ? book.find(l => Book.isHeading(l, 13), varieties + 1) : -1;
  const vParas = varieties >= 0 ? book.paragraphs(book.lines.slice(varieties + 1, vEnd)) : [];
  const out = [];
  let type = null;
  for (let i = h + 1; i < book.lines.length && book.lines[i].page === page; i++) {
    const l = book.lines[i];
    const tier = norm(l.items[0].s);
    if (l.items.length === 1) { type = l.text; continue; }
    if (!/^(Weak|Average|Strong)$/.test(tier) || !type) continue;
    const c = cells({ items: l.items.slice(1) }, columns);
    const typeWord = type.toLowerCase().split(" ")[0];
    out.push(finishCreature({
      name: `${type} (${tier})`, group: "Creature Templates", template: type, tier, page,
      ac: c[0], hd: c[1], attacks: buildAttacks(c[2], c[3], c[4]),
      move: c[5], morale: c[6], skill: c[7], madness: c[8], special: "",
      description: vParas.filter(p => p.toLowerCase().startsWith(typeWord)).join("\n\n")
    }));
  }
  if (out.length !== 33) book.warnings.push(`Creature templates: ${out.length} rows (expected 33)`);
  return out;
}

const STAT_LABEL = /^(AC|HD|Atks|Dmg|Move|Morale|Skill|Special|Madness|Save):$/;
const isStatRow = l => l.items.length >= 2 && STAT_LABEL.test(norm(l.items[0].s)) && l.chapter === "Bestiary";

/** Stat blocks: one creature in a 2-column grid, or several creatures side by side. */
function parseStatBlocks(book) {
  const out = [];
  for (let i = 1; i < book.lines.length; i++) {
    const l = book.lines[i];
    if (!isStatRow(l) || norm(l.items[0].s) !== "AC:" || isStatRow(book.lines[i - 1])) continue;
    const rows = [];
    for (let j = i; j < book.lines.length && isStatRow(book.lines[j]); j++) rows.push(book.lines[j]);
    if (rows.length < 5) continue;
    const nameLine = book.lines[i - 1];
    const labelsInRow = rows[0].items.filter(it => STAT_LABEL.test(norm(it.s))).length;
    if (labelsInRow === 2 && rows.length === 5) {
      // Single creature: positions are fixed (one block in the book has misprinted labels).
      const grid = rows.map(r => {
        const second = r.items.findIndex((it, k) => k > 0 && STAT_LABEL.test(norm(it.s)));
        return [joinItems(r.items.slice(1, second)), joinItems(r.items.slice(second + 1))];
      });
      const [[ac, move], [hd, morale], [atks, dmg], [skill, madness], [special, save]] = grid;
      out.push(finishCreature({
        name: nameLine.text, group: sectionOf(book, i).title, page: l.page, ac, move, hd, morale,
        attacks: buildAttacks(atks, null, dmg), skill, madness, special, save, at: i
      }));
    } else {
      // Several creatures: the name line gives the columns; the label line above it the group.
      const group = book.lines.slice(0, i - 1).reverse().find(x => x.font === "label" && x.h >= 11)?.text ?? sectionOf(book, i).title;
      const columns = [{ x: rows[0].items[0].x, x2: rows[0].items[0].x + rows[0].items[0].w, s: "" }, ...headerColumns(nameLine)];
      const table = {};
      for (const r of rows) table[norm(r.items[0].s).replace(":", "").toLowerCase()] = cells(r, columns).slice(1);
      columns.slice(1).forEach((col, k) => {
        const get = key => table[key]?.[k] ?? "";
        out.push(finishCreature({
          name: col.s, group, page: l.page, ac: get("ac"), hd: get("hd"), move: get("move"),
          morale: get("morale"), attacks: buildAttacks(get("atks"), null, get("dmg")), skill: get("skill"),
          madness: get("madness"), special: get("special"), save: get("save"), at: i
        }));
      });
    }
    i += rows.length - 1;
  }
  // Named horrors have their own heading; their group is the heading above those ("Uncanny Abominations").
  const names = new Set(out.map(c => c.name.toLowerCase()));
  const own = h => [...names].some(n => n === h.text.toLowerCase() || n.split(/\s+/).includes(h.text.toLowerCase()));
  for (const c of out) {
    if (own({ text: c.group })) {
      for (let j = c.at; j >= 0; j--) {
        const l = book.lines[j];
        if (Book.isHeading(l, 13) && l.h < 20 && !own(l)) { c.group = l.text; break; }
      }
    }
    c.description = creatureDescription(book, c).join("\n\n");
    delete c.at;
  }
  return out;
}

/**
 * The creature's own heading section if it has one ("Macguffin" for "Medium-sized
 * Macguffin Servant"); else the paragraphs of its section that start with its name;
 * else the section of its group heading ("Mundane Humans").
 */
function creatureDescription(book, c) {
  const lname = c.name.toLowerCase();
  const heads = book.lines.filter(l => l.chapter === "Bestiary" && Book.isHeading(l, 13) && l.h < 20);
  const own = heads.find(l => l.text.toLowerCase() === lname)
    ?? heads.find(l => lname.split(/\s+/).includes(l.text.toLowerCase()));
  if (own) return sectionParagraphs(book, own.index);
  const section = sectionOf(book, c.at);
  const paras = sectionParagraphs(book, section.index);
  const stem = lname.split(" ")[0].replace(/s$/, "");
  const named = paras.filter(p => p.toLowerCase().startsWith(stem));
  if (named.length) return named;
  const group = heads.find(l => l.text.toLowerCase() === String(c.group).toLowerCase());
  return group ? sectionParagraphs(book, group.index) : [];
}

/** The section (last 13pt+ heading) that contains line `i`. */
function sectionOf(book, i) {
  for (let j = i; j >= 0; j--) {
    const l = book.lines[j];
    if (Book.isHeading(l, 13)) return { title: l.text, index: j };
  }
  return { title: "", index: 0 };
}

const sectionCache = new WeakMap();
/** Prose paragraphs from heading line `index` to the next heading, without stat blocks. */
function sectionParagraphs(book, index) {
  let cache = sectionCache.get(book);
  if (!cache) sectionCache.set(book, cache = new Map());
  if (cache.has(index)) return cache.get(index);
  const end = book.find(l => Book.isHeading(l, 13), index + 1);
  const lines = book.lines.slice(index + 1, end < 0 ? undefined : end)
    .filter((l, k, all) => l.font !== "label" && !isStatRow(l) && !isStatRow(all[k + 1] ?? { items: [] }));
  const paras = book.paragraphs(lines).filter(p => p.length > 40);
  cache.set(index, paras);
  return paras;
}

/* -------------------------------------------- */
/*  Location tags                               */
/* -------------------------------------------- */

function parseTags(book) {
  const out = [];
  const keys = ["Enemies", "Friends", "Schemes", "Secrets", "Places"];
  for (let i = 0; i < book.lines.length; i++) {
    const l = book.lines[i];
    if (!(l.font === "heading" && l.h >= 11 && l.h < 13 && l.chapter === "Building Your World")) continue;
    const next = book.find(x => x.font === "heading", i + 1);
    const body = book.lines.slice(i + 1, next < 0 ? undefined : next);
    if (!body.some(b => b.text.startsWith("Enemies:"))) continue;
    const tag = { name: l.text, page: l.page, description: "" };
    const desc = [];
    let key = null;
    const parts = {};
    for (const b of body) {
      const m = b.text.match(/^(Enemies|Friends|Schemes|Secrets|Places):\s*(.*)$/);
      if (m) { key = m[1]; parts[key] = m[2]; continue; }
      if (key) parts[key] = book.joinText(parts[key], b.text);
      else desc.push(b);
    }
    tag.description = book.paragraphs(desc).join("\n\n");
    for (const k of keys) tag[k.toLowerCase()] = (parts[k] ?? "").split(/,\s+(?=[A-Z"])/).map(s => s.trim()).filter(Boolean);
    out.push(tag);
    i = (next < 0 ? book.lines.length : next) - 1;
  }
  return out;
}

/* -------------------------------------------- */
/*  Random tables                               */
/* -------------------------------------------- */

const DIE_RE = /^1?d(\d+)$/i;
const ROW_RE = /^(\d+)(?:\s*[-–]\s*(\d+))?$/;

/** Split a header line into segments: each die (or die pair) starts a segment with its title columns. */
function headerSegments(head) {
  const segs = [];
  for (const it of head.items) {
    const s = norm(it.s);
    const die = s.match(DIE_RE);
    const prev = segs.at(-1);
    const box = { x: it.x, x2: it.x + it.w };
    if (die && (!prev || prev.titles.length)) segs.push({ dice: [{ size: Number(die[1]), ...box }], titles: [], x: it.x });
    else if (die) prev.dice.push({ size: Number(die[1]), ...box });
    else if (prev) prev.titles.push({ s, ...box });
  }
  // One die over repeated column groups: "1d8 | It Maims | Word | It Summons | Word".
  for (const seg of [...segs]) {
    const t = seg.titles.map(x => x.s);
    const rep = t.findIndex((x, k) => k > 0 && t.indexOf(x) < k);
    if (seg.dice.length !== 1 || rep < 0) continue;
    const size = rep - t.indexOf(t[rep]);
    if (size < 1 || t.length % size !== 0) continue;
    const groups = [];
    for (let k = 0; k < t.length; k += size) groups.push(seg.titles.slice(k, k + size));
    // Cells start left of their centered header: split just after the previous group's last header.
    const parts = groups.map((titles, g) => ({
      dice: seg.dice, titles, shared: g > 0,
      x: g ? groups[g - 1].at(-1).x2 + 16 : seg.x
    }));
    segs.splice(segs.indexOf(seg), 1, ...parts);
  }
  segs.forEach((s, k) => { s.xEnd = segs[k + 1]?.x ?? Infinity; });
  return segs;
}

/**
 * Generic "dN Title" tables. A header line can hold several tables side by side.
 * A segment with more than one title column becomes one table per column
 * ("Book | Adjective | Noun"); two halves of one long table are merged
 * ("d100 Portfolio | d100 Portfolio").
 */
function parseRandomTables(book) {
  const tables = [];
  for (let i = 0; i < book.lines.length; i++) {
    let head = book.lines[i];
    if (!DIE_RE.test(norm(head.items[0].s)) || head.font === "body") continue;
    let prefix = "";
    if (head.items.length === 1) {
      // "d12" / "Words for Creating a Spell's Name" / "Spell | Adjective | Entity"
      const [a, b] = [book.lines[i + 1], book.lines[i + 2]];
      const cols = a?.font === "heading" && a.items.length === 1 && b?.font === "heading" && b.items.length > 1 ? (prefix = a.text, b) : a;
      if (!cols || cols.font !== "heading") continue;
      head = { ...cols, items: [head.items[0], ...cols.items], text: `${head.text} ${cols.text}` };
      i = cols.index;
    }
    if (head.items.length < 2 || head.text.length > 120) continue;
    // A caption above a two-dice grid: "Modes and Epithets" / "d4 | 1 | 2 | 3 | 4" / "d10 | Create | …".
    const above = book.lines[head.index - 1];
    if (!prefix && above && DIE_RE.test(norm(above.items[0].s)) && above.items.slice(1).every(it => /^\d+$/.test(norm(it.s)))) {
      const caption = book.lines[head.index - 2];
      if (caption?.font === "heading" && caption.items.length === 1) prefix = caption.text;
    }
    const segs = headerSegments(head);
    if (!segs.length || segs.some(s => !s.titles.length)) continue;
    const section = sectionOf(book, i);
    const result = readTableBody(book, head.index, segs, head);
    const fromLine = [];
    for (const [k, seg] of segs.entries()) {
      const rows = result[k];
      if (rows.length < 2) continue;
      seg.titles.forEach((title, c) => {
        const results = rows.map(r => ({ range: [...r.range], text: norm(r.cells[c] ?? "") })).filter(r => r.text);
        if (results.length < 2) return;
        let name = seg.titles.length > 1 && c > 0 ? `${seg.titles[0].s}: ${title.s}` : title.s;
        if (prefix) name = `${prefix}: ${title.s}`;
        else if (seg.titles[0].s.length <= 3) name = `${section.title}: ${name}`;
        const dice = seg.dice.map(d => `d${d.size}`).join("+");
        const same = fromLine.find(t => t.name === name && t.dice === dice);
        if (same) same.results.push(...results);
        else fromLine.push({ name, section: section.title, chapter: head.chapter, page: head.page, dice, results });
      });
    }
    for (const t of fromLine) {
      t.results.sort((a, b) => a.range[0] - b.range[0]);
      // Remove overlaps from misprinted ranges ("57-58", "58-60").
      for (let k = 1; k < t.results.length; k++) {
        const prev = t.results[k - 1].range, cur = t.results[k].range;
        if (cur[0] <= prev[1] && prev[1] < cur[1]) cur[0] = prev[1] + 1;
      }
      const max = Math.max(...t.results.map(r => r.range[1]));
      const die = toInt(t.dice.split("+")[0].slice(1));
      t.formula = t.dice.includes("+") ? `1d${max}` : `1d${die}`;
      const covered = t.results.reduce((n, r) => n + r.range[1] - r.range[0] + 1, 0);
      const size = t.dice.includes("+") ? max : die;
      if (covered !== size) book.warnings.push(`Table "${t.name}" (page ${t.page}): ranges cover ${covered} of ${size}`);
      tables.push(t);
    }
  }
  return tables;
}

function readTableBody(book, h, segs, head = book.lines[h]) {
  const state = segs.map(() => ({ rows: [], group: 1, groups: 0, done: false, doneAt: undefined, last: null }));
  const maxOf = seg => (seg.dice.length === 2 ? seg.dice[0].size * seg.dice[1].size : seg.dice[0].size);
  const left = Math.min(...segs.map(s => s.x));
  let prevY = head.y;
  for (let i = h + 1; i < book.lines.length; i++) {
    const l = book.lines[i];
    if (l.page !== head.page && l.page !== head.page + 1) break;
    if (Book.isHeading(l, 11) || (DIE_RE.test(norm(l.items[0].s)) && l.items.length > 1 && l.font !== "body")) break;
    if (l.x < left - 3) break;                                    // prose to the left of the table
    if (l.page !== head.page && l.y > prevY) break;               // next page, no continuation
    if (state.every(s => s.done || (s.doneAt !== undefined && (prevY - l.y > 15 || l.y > prevY + 20)))) break;
    let lineRange = null;   // row started on this line by a segment with row numbers
    for (const [k, seg] of segs.entries()) {
      const st = state[k];
      if (st.doneAt !== undefined && (prevY - l.y > 15 || l.y > prevY + 20)) st.done = true;
      if (st.done) continue;
      const items = l.items.filter(it => it.x >= seg.x - 8 && it.x < seg.xEnd - 8);
      if (!items.length) continue;
      const cols = seg.titles.map((t, c) => ({ x: t.x, x2: t.x2, idx: c }));
      // Leading numbers: the row number (and the group number for two-dice tables).
      let rest = items;
      const nums = [];
      while (rest.length && ROW_RE.test(norm(rest[0].s)) && rest[0].x < seg.titles[0].x - 2) { nums.push(norm(rest[0].s)); rest = rest.slice(1); }
      if (seg.dice.length === 2) {
        const groupNum = n => (/^\d+$/.test(n) ? Number(n) : ++st.groups);   // "1-2" groups count in order
        if (nums.length === 2) { st.group = groupNum(nums[0]); nums.shift(); }
        else if (nums.length === 1 && !rest.length && items[0].x < seg.dice[1].x - 4) { st.group = groupNum(nums[0]); continue; }
      }
      if (seg.shared && lineRange && !nums.length) {
        // Column group without its own row numbers ("1d8 | A | Word | B | Word").
        st.last = { range: [...lineRange], cells: cols.map(() => "") };
        st.rows.push(st.last);
      } else if (nums.length) {
        const m = nums[0].match(ROW_RE);
        let lo = Number(m[1]), hi = m[2] ? Number(m[2]) : lo;
        if (m[1] === "00") lo = hi = 100;
        if (m[2] === "00") hi = 100;
        if (seg.dice.length === 2) { const off = (st.group - 1) * seg.dice[1].size; lo += off; hi += off; }
        st.last = { range: [lo, hi], cells: cols.map(() => "") };
        st.rows.push(st.last);
        lineRange = st.last.range;
      } else if (!st.last || (prevY - l.y) > 16) {
        continue;
      }
      for (const it of rest) {
        const c = columnOf(it, cols);
        st.last.cells[c] = st.last.cells[c] ? book.joinText(st.last.cells[c], norm(it.s)) : norm(it.s);
      }
      if (st.last.range[1] >= maxOf(seg)) st.doneAt ??= i;
    }
    prevY = l.y;
  }
  return state.map(s => s.rows);
}

/* -------------------------------------------- */
/*  Entry point                                 */
/* -------------------------------------------- */

/**
 * @param {object[]} pages  Output of extractPages().
 * @returns {object}        The parsed book data.
 */
export function parseBook(pages) {
  const book = new Book(pages);
  const classes = parseClasses(book);
  const skills = parseSkills(book);
  const equipment = parseEquipment(book);
  const sorcery = parseDisciplines(book);
  const creatures = [...parseCreatureTemplates(book), ...parseStatBlocks(book)];
  const tables = parseRandomTables(book);
  const data = {
    meta: { title: "Silent Legions", parserVersion: PARSER_VERSION, pages: pages.length, createdAt: new Date().toISOString() },
    classes,
    backgrounds: parseBackgrounds(book),
    skillsIntro: skills.intro,
    skills: skills.skills,
    deliria: parseDeliria(book),
    madnessCosts: parseMadnessCosts(book),
    quickReference: parseQuickReference(book),
    weapons: equipment.weapons,
    armor: equipment.armor,
    gear: equipment.gear,
    vehicles: equipment.vehicles,
    equipmentNotes: equipment.notes,
    spells: parseSpells(book),
    disciplineRules: sorcery.rules,
    disciplines: sorcery.disciplines,
    creatures,
    tags: parseTags(book),
    tables,
    warnings: book.warnings
  };
  data.counts = Object.fromEntries(Object.entries(data).filter(([, v]) => Array.isArray(v) && v.length && typeof v[0] === "object" && v !== data.warnings).map(([k, v]) => [k, v.length]));
  return data;
}

export const _test = { Book, buildAttacks, hdToNumber, columnOf, slug };
