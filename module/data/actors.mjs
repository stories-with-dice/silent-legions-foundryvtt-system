import { SL } from "../config.mjs";

const { fields } = foundry.data;
const int = (initial = 0, opts = {}) => new fields.NumberField({ required: true, nullable: false, integer: true, initial, ...opts });
const str = (initial = "") => new fields.StringField({ required: true, blank: true, initial });
const html = () => new fields.HTMLField({ required: true, blank: true });

/**
 * Player character.
 * Stored: attribute scores, class levels, current HP/Expertise/Madness, manual adjustments.
 * Derived (prepareDerivedData): modifiers, level, attack bonus, saves, AC, Expertise max,
 * hit dice formula, encumbrance.
 */
export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const attr = () => new fields.SchemaField({ value: int(10, { min: 3, max: 18 }) });
    return {
      attributes: new fields.SchemaField(Object.fromEntries(Object.keys(SL.attributes).map(k => [k, attr()]))),
      classLevels: new fields.SchemaField(Object.fromEntries(Object.keys(SL.classes).map(k => [k, int(0, { min: 0, max: 30 })]))),
      hp: new fields.SchemaField({ value: int(1, { min: 0 }), max: int(1, { min: 0 }) }),
      expertise: new fields.SchemaField({ value: int(2, { min: 0 }), lost: int(0, { min: 0 }) }),
      madness: new fields.SchemaField({ value: int(0, { min: 0, max: 100 }), max: int(100) }),
      xp: int(0, { min: 0 }),
      skillPoints: int(0, { min: 0 }),
      wealth: new fields.StringField({ required: true, initial: "average", choices: () => SL.wealth }),
      background: str(),
      connection: str(),
      languages: str(),
      adjust: new fields.SchemaField({
        attack: int(0),
        ac: int(0),
        saves: new fields.SchemaField(Object.fromEntries(Object.keys(SL.saves).map(k => [k, int(0)])))
      }),
      biography: html(),
      notes: html()
    };
  }

  prepareDerivedData() {
    for (const [key, a] of Object.entries(this.attributes)) {
      a.mod = SL.attributeMod(a.value);
      a.label = SL.attributes[key].abbr;
    }
    const classes = Object.entries(this.classLevels).filter(([, lvl]) => lvl > 0);
    this.level = Math.max(1, classes.reduce((n, [, lvl]) => n + lvl, 0));
    this.hasClass = classes.length > 0;

    // Attack bonus: sum of the per-level gains of each class (levels 11+ add nothing).
    this.attackBonus = classes.reduce((n, [key, lvl]) =>
      n + SL.classes[key].progression.slice(0, Math.min(lvl, 10)).reduce((s, r) => s + r.atk, 0), 0) + this.adjust.attack;

    // Saves: best (lowest) target among the character's classes.
    this.saves = {};
    for (const key of Object.keys(SL.saves)) {
      const targets = classes.map(([c, lvl]) => SL.classes[c].progression[Math.min(lvl, 10) - 1].saves[key]);
      this.saves[key] = { target: (targets.length ? Math.min(...targets) : 16) - this.adjust.saves[key], label: SL.saves[key] };
    }

    this.hitDice = classes.map(([c, lvl]) => `${lvl}d${SL.classes[c].hitDie}`).join(" + ") || "1d6";
    this.expertise.max = this.level + 1 - this.expertise.lost;
    this.maxSkillLevel = SL.maxSkillLevel(this.level);
    this.nextLevelXP = SL.xpForLevel(this.level + 1);
    this.classSkills = new Set(classes.flatMap(([c]) => SL.classes[c].skills));
    this.rerollAttacks = classes.some(([c]) => SL.classes[c].rerollAttacks);
    this.classLabel = classes.map(([c, lvl]) => `${game.i18n.localize(SL.classes[c].label)} ${lvl}`).join(" / ");

    this.#prepareArmor();
    this.#prepareEncumbrance();
  }

  /** AC against melee and against firearms; Dex modifier applies, never worse than 9. */
  #prepareArmor() {
    const items = this.parent.items;
    const worn = items.filter(i => i.type === "armor" && i.system.worn);
    const body = worn.filter(i => !i.system.shield);
    const shield = worn.filter(i => i.system.shield).reduce((n, i) => Math.max(n, i.system.shieldBonus), 0);
    const best = list => list.reduce((ac, i) => Math.min(ac, i.system.ac || 9), 9);
    const dex = this.attributes.dex.mod;
    const meleeBase = best(body.filter(i => !i.system.noMelee)) - shield;
    const rangedBase = best(body.filter(i => !i.system.noFirearms)) - (worn.some(i => i.system.shield && !i.system.noFirearms) ? shield : 0);
    this.ac = {
      melee: Math.min(9, meleeBase - dex - this.adjust.ac),
      ranged: Math.min(9, rangedBase - dex - this.adjust.ac)
    };
  }

  /** Readied items: floor(Str / 2); stowed: Str. Two more readied or four more stowed per step of encumbrance. */
  #prepareEncumbrance() {
    const str = this.attributes.str.value;
    let readied = 0, stowed = 0;
    for (const i of this.parent.items) {
      const s = i.system;
      if (!("location" in s)) continue;
      const load = (s.enc ?? 1) * (s.quantity ?? 1) / (s.bundle ? 3 : 1);
      if (s.location === "readied") readied += load;
      else if (s.location === "stowed") stowed += load;
    }
    readied = Math.ceil(readied);
    stowed = Math.ceil(stowed);
    const rMax = Math.floor(str / 2), sMax = str;
    const over = Math.max(Math.ceil((readied - rMax) / 2), Math.ceil((stowed - sMax) / 4), 0);
    this.encumbrance = {
      readied, stowed, readiedMax: rMax, stowedMax: sMax,
      level: over, label: ["SL.EncLevel.none", "SL.EncLevel.light", "SL.EncLevel.heavy"][over] ?? "SL.EncLevel.over",
      move: [20, 15, 10][over] ?? 0
    };
  }
}

/** NPC or creature: a stat block. */
export class NpcData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ac: int(9),
      mundaneImmune: new fields.BooleanField({ initial: false }),
      hd: str("1"),
      hp: new fields.SchemaField({ value: int(4, { min: 0 }), max: int(4, { min: 0 }) }),
      attacks: new fields.ArrayField(new fields.SchemaField({
        name: str("attack"), bonus: int(0), count: int(1, { min: 1 }), damage: str("1d6")
      }), { initial: [{ name: "attack", bonus: 0, count: 1, damage: "1d6" }] }),
      slaughter: str("1d6"),
      move: str("30'"),
      morale: int(7, { min: 1, max: 12 }),
      skill: int(1),
      madness: str("None"),
      save: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null }),
      special: str(),
      group: str(),
      description: html()
    };
  }

  prepareDerivedData() {
    const s = String(this.hd).trim().toLowerCase();
    this.hdValue = s === "1 hp" ? 0 : s === "1d4 hp" ? 0.5 : (parseInt(s, 10) || 0);
    this.saveTarget = this.save ?? SL.npcSave(this.hdValue);
    // "None / 1d6": no Madness in human guise, the second value in true form.
    const parts = this.madness.split("/").map(p => p.trim());
    this.madnessFormula = [...parts].reverse().find(p => /^\d*d?\d+$/i.test(p)) ?? "";
  }

  /** Default HP for a hit dice value: 1 hp, 1d4 hp, or Nd8. */
  static hpFormula(hd) {
    const s = String(hd).trim().toLowerCase();
    if (s === "1 hp") return "1";
    if (s === "1d4 hp") return "1d4";
    const n = parseInt(s, 10);
    return n > 0 ? `${n}d8` : "1d4";
  }
}
