import { SL } from "../config.mjs";

const { fields } = foundry.data;
const int = (initial = 0, opts = {}) => new fields.NumberField({ required: true, nullable: false, integer: true, initial, ...opts });
const str = (initial = "") => new fields.StringField({ required: true, blank: true, initial });
const bool = (initial = false) => new fields.BooleanField({ initial });
const html = () => new fields.HTMLField({ required: true, blank: true });
const location = (initial = "stowed") => new fields.StringField({ required: true, initial, choices: () => SL.itemLocations });
const attr = initial => new fields.StringField({ required: true, initial, choices: () => Object.fromEntries(Object.entries(SL.attributes).map(([k, v]) => [k, v.label])) });

class BaseItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return { description: html(), source: str() };
  }
}

/** Physical items count against encumbrance by location. */
class CarriedItemData extends BaseItemData {
  static defineSchema() {
    return { ...super.defineSchema(), enc: int(1, { min: 0 }), cost: str(), location: location() };
  }
}

/** A skill such as "Combat/Projectile" at level 0 to 4, or -1 for an untrained skill row. */
export class SkillData extends BaseItemData {
  static defineSchema() {
    return { ...super.defineSchema(), level: int(0, { min: SL.untrained, max: 4 }), attribute: attr("int") };
  }

  get trained() {
    return this.level > SL.untrained;
  }

  /** A specialized skill (Combat, Culture, …) without its "/Specialty" part: the untrained placeholder row. */
  get needsSpecialty() {
    return !!SL.skills[this.baseName]?.spec && !this.parent.name.includes("/");
  }

  /** "Combat/Projectile" → "Combat". */
  get baseName() {
    return this.parent.name.split("/")[0].trim();
  }

  get isClassSkill() {
    return !!this.parent.actor?.system.classSkills?.has(this.baseName);
  }
}

export class WeaponData extends CarriedItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      damage: str("1d6"),
      slaughter: str("1d6"),
      attributes: str("str/dex"),
      skill: str("Combat/Primitive"),
      range: str(),
      magazine: int(0, { min: 0 }),
      ammo: int(0, { min: 0 }),
      firearm: bool(false),
      burst: bool(false),
      subdual: bool(false),
      unarmed: bool(false)
    };
  }

  /** Best modifier among the weapon's attributes ("str/dex" → the higher of the two). */
  attributeMod(actor) {
    const keys = this.attributes.toLowerCase().split(/[^a-z]+/).filter(k => k in SL.attributes);
    if (!keys.length) return { key: "", mod: 0 };
    return keys.map(k => ({ key: k, mod: actor.system.attributes[k].mod })).sort((a, b) => b.mod - a.mod)[0];
  }
}

export class ArmorData extends CarriedItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      location: location("readied"),
      ac: int(7, { min: 0, max: 9 }),
      shield: bool(false),
      shieldBonus: int(1, { min: 0 }),
      noFirearms: bool(false),
      noMelee: bool(false),
      worn: bool(false)
    };
  }
}

export class GearData extends CarriedItemData {
  static defineSchema() {
    return { ...super.defineSchema(), quantity: int(1, { min: 0 }), bundle: bool(false) };
  }
}

export class VehicleData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      speed: int(0), armor: int(0), crew: int(1, { min: 0 }), cost: str(),
      hp: new fields.SchemaField({ value: int(10, { min: 0 }), max: int(10, { min: 0 }) })
    };
  }
}

export class SpellData extends BaseItemData {
  static defineSchema() {
    return { ...super.defineSchema(), level: int(1, { min: 1, max: 5 }) };
  }
}

/** A discipline is learned like a skill (level 0 to 4); mastered levels cost nothing to use. */
export class DisciplineData extends BaseItemData {
  static defineSchema() {
    const lvl = () => str();
    return {
      ...super.defineSchema(),
      level: int(0, { min: 0, max: 4 }),
      mastered: int(-1, { min: -1, max: 4 }),
      levels: new fields.SchemaField({ 0: lvl(), 1: lvl(), 2: lvl(), 3: lvl(), 4: lvl() })
    };
  }
}

/** A class ability (Leading Whispers, Deep Gnosis, …): costs 1 Expertise to use. */
export class AbilityData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      class: new fields.StringField({ required: true, blank: true, initial: "", choices: () => ({ "": "—", ...Object.fromEntries(Object.entries(SL.classes).map(([k, v]) => [k, v.label])) }) }),
      level: int(1, { min: 1 }),
      cost: int(1, { min: 0 })
    };
  }
}

export class DeliriumData extends BaseItemData {}

/** A background: dropping it on a character adds its skills at level-0 (level-1 if already known). */
export class BackgroundData extends BaseItemData {
  static defineSchema() {
    return { ...super.defineSchema(), skills: str() };
  }

  get skillList() {
    return this.skills.split(",").map(s => s.trim()).filter(Boolean);
  }
}
