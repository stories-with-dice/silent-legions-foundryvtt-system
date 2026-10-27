/**
 * Rules numbers for Silent Legions. Only mechanics live here (names, numbers,
 * formulas); descriptive text comes from the PDF import.
 */
export const SL = {};

SL.attributes = {
  str: { label: "SL.Attr.str", abbr: "Str" },
  int: { label: "SL.Attr.int", abbr: "Int" },
  wis: { label: "SL.Attr.wis", abbr: "Wis" },
  dex: { label: "SL.Attr.dex", abbr: "Dex" },
  con: { label: "SL.Attr.con", abbr: "Con" },
  cha: { label: "SL.Attr.cha", abbr: "Cha" }
};

/** Attribute modifier: 3 → -2, 4-7 → -1, 8-13 → 0, 14-17 → +1, 18 → +2. */
SL.attributeMod = score => {
  if (score <= 3) return -2;
  if (score <= 7) return -1;
  if (score <= 13) return 0;
  if (score <= 17) return 1;
  return 2;
};

SL.saves = {
  physical: "SL.Save.physical",
  mental: "SL.Save.mental",
  evasion: "SL.Save.evasion",
  magic: "SL.Save.magic",
  luck: "SL.Save.luck"
};

/**
 * Class progression, levels 1 to 10. Each row: [attack bonus gained at this level,
 * Physical, Mental, Evasion, Magic, Luck]. Level 11+ uses the level 10 row and
 * gains no attack bonus.
 */
const prog = rows => rows.map(([atk, physical, mental, evasion, magic, luck]) => ({ atk, saves: { physical, mental, evasion, magic, luck } }));

/**
 * Each class: hit die, prime attributes, class skills, and the bonus skills of a new character.
 * `bonusSkills` lists the two named picks (a list of two names is "one of these"); every class
 * also gets "any one class skill" and "any one skill". A PC can take a level in a new class only
 * with these two named picks at level-0 or better.
 */
SL.classes = {
  investigator: {
    label: "SL.Class.investigator",
    hitDie: 6,
    prime: ["wis", "cha"],
    skills: ["Computer", "Culture", "Language", "Law", "Navigation", "Perception", "Persuade", "Profession", "Research", "Security", "Stealth", "Vehicle"],
    bonusSkills: [["Perception"], ["Research"]],
    rerollAttacks: false,
    progression: prog([
      [1, 15, 14, 12, 16, 13], [0, 14, 13, 11, 15, 12], [1, 14, 13, 11, 15, 12], [1, 13, 12, 10, 14, 11], [0, 13, 12, 10, 14, 11],
      [1, 12, 11, 9, 13, 10], [1, 12, 11, 9, 13, 10], [0, 11, 10, 8, 12, 9], [1, 11, 10, 8, 12, 9], [1, 9, 8, 6, 10, 7]
    ])
  },
  scholar: {
    label: "SL.Class.scholar",
    hitDie: 4,
    prime: ["int", "wis"],
    skills: ["Art", "Computer", "Culture", "Engineering", "History", "Language", "Law", "Medicine", "Occult", "Profession", "Research", "Science"],
    bonusSkills: [["Research"], ["History", "Science"]],
    rerollAttacks: false,
    progression: prog([
      [0, 16, 14, 15, 12, 13], [1, 15, 13, 14, 11, 12], [0, 15, 13, 14, 11, 12], [1, 14, 12, 13, 10, 11], [0, 14, 12, 13, 10, 11],
      [1, 13, 11, 12, 9, 10], [0, 13, 11, 12, 9, 10], [1, 12, 10, 11, 8, 9], [0, 12, 10, 11, 8, 9], [1, 10, 8, 9, 6, 7]
    ])
  },
  socialite: {
    label: "SL.Class.socialite",
    hitDie: 6,
    prime: ["int", "cha"],
    skills: ["Art", "Business", "Culture", "Gambling", "Language", "Law", "Leadership", "Perception", "Persuade", "Profession", "Vehicle"],
    bonusSkills: [["Culture"], ["Persuade"]],
    rerollAttacks: false,
    progression: prog([
      [1, 15, 12, 16, 14, 13], [0, 14, 11, 15, 13, 12], [1, 14, 11, 15, 13, 12], [0, 13, 10, 14, 12, 11], [1, 13, 10, 14, 12, 11],
      [0, 12, 9, 13, 11, 10], [1, 12, 9, 13, 11, 10], [0, 11, 8, 12, 10, 9], [1, 11, 8, 12, 10, 9], [1, 9, 6, 10, 8, 7]
    ])
  },
  tough: {
    label: "SL.Class.tough",
    hitDie: 8,
    prime: ["str", "dex"],
    skills: ["Athletics", "Combat", "Gambling", "Leadership", "Profession", "Stealth", "Survival", "Tactics", "Vehicle"],
    bonusSkills: [["Athletics"], ["Combat"]],
    rerollAttacks: true,
    progression: prog([
      [1, 12, 16, 14, 15, 13], [1, 11, 15, 13, 14, 12], [1, 11, 15, 13, 14, 12], [1, 10, 14, 12, 13, 11], [1, 10, 14, 12, 13, 11],
      [1, 9, 13, 11, 12, 10], [1, 9, 13, 11, 12, 10], [1, 8, 12, 10, 11, 9], [1, 8, 12, 10, 11, 9], [1, 6, 10, 8, 9, 7]
    ])
  }
};

/** XP needed to reach each level (index = level). Past 10th: +256,000 per level. */
SL.xpTable = [0, 0, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 512000];
SL.xpForLevel = level => (level <= 10 ? SL.xpTable[level] : 512000 + (level - 10) * 256000);

/** Skill names (no descriptions), with a suggested attribute. Specialized skills take "Name/Specialty". */
SL.skills = {
  Art: { attr: "cha", spec: true }, Athletics: { attr: "str" }, Business: { attr: "int" },
  Combat: { attr: "dex", spec: true }, Computer: { attr: "int" }, Culture: { attr: "int", spec: true },
  Engineering: { attr: "int" }, Gambling: { attr: "wis" }, History: { attr: "int" }, Language: { attr: "int" },
  Law: { attr: "int" }, Leadership: { attr: "cha" }, Medicine: { attr: "int" }, Navigation: { attr: "wis" },
  Occult: { attr: "int" }, Perception: { attr: "wis" }, Persuade: { attr: "cha" }, Profession: { attr: "wis", spec: true },
  Research: { attr: "int" }, Religion: { attr: "int" }, Science: { attr: "int" }, Security: { attr: "int" },
  Stealth: { attr: "dex" }, Survival: { attr: "wis" }, Tactics: { attr: "wis" }, Vehicle: { attr: "dex", spec: true }
};

/** Book spellings in background skill lists that mean a skill above. */
SL.skillAliases = { Artist: "Art", Persuasion: "Persuade" };
SL.skillName = name => {
  const [base, ...spec] = String(name).split("/");
  const fixed = SL.skillAliases[base.trim()] ?? base.trim();
  return spec.length ? `${fixed}/${spec.join("/").trim()}` : fixed;
};

SL.combatSkills = ["Combat/Eldritch", "Combat/Gunnery", "Combat/Primitive", "Combat/Projectile", "Combat/Unarmed"];

/** Highest skill level allowed: 1 + floor(character level / 3). */
SL.maxSkillLevel = level => 1 + Math.floor(level / 3);

/** Skill point cost of one level: class skill (level + 1), other skill (level + 2). */
SL.skillCost = (level, classSkill) => level + (classSkill ? 1 : 2);

/** Skill level of an untrained skill: a skill row the character has not learned (checks take -1). */
SL.untrained = -1;

/** A new character's skills start at level-1 or lower. */
SL.startingSkillMax = 1;

/** Starting Expertise of a new character (maximum is level + 1). */
SL.startingExpertise = 2;

/** Optional rule: place 14, 11, or 7 in each attribute, with no more 14s than 7s. */
SL.attributeArray = [14, 11, 7];
SL.validArray = scores => {
  const list = Object.values(scores).map(Number);
  return list.every(v => SL.attributeArray.includes(v)) && list.filter(v => v === 14).length <= list.filter(v => v === 7).length;
};

/** The score that "raise a prime attribute" sets. */
SL.primeScore = 14;

/**
 * Starting wealth choices: Struggling gives one more free skill pick, Affluent costs
 * 10 Madness.
 */
SL.startingWealth = {
  average: { picks: 0, madness: 0 },
  struggling: { picks: 1, madness: 0 },
  affluent: { picks: 0, madness: 10 }
};

/** "Any One Skill", "Any Two Skills", "Any Three Skills" in a background: the number of free picks, else 0. */
SL.anySkillPicks = text => {
  const m = String(text).trim().match(/^any (one|two|three|four|\d+) skills?$/i);
  if (!m) return 0;
  return { one: 1, two: 2, three: 3, four: 4 }[m[1].toLowerCase()] ?? Number(m[1]);
};

/** Disciplines: learning costs 1 skill point and 5 Madness; mastery costs Madness (and 1 Expertise for level-0). */
SL.discipline = {
  learnPoints: 1,
  learnMadness: 5,
  masterMadness: level => (level === 0 ? 10 : 5),
  masterExpertise: level => (level === 0 ? 1 : 0)
};

/** Learning a spell: Int/Occult vs 6 + level; 1 Madness for any attempt, + level on a success. */
SL.spellLearnDifficulty = level => 6 + level;

SL.difficulties = { 6: "SL.Diff.6", 8: "SL.Diff.8", 9: "SL.Diff.9", 11: "SL.Diff.11", 13: "SL.Diff.13", 15: "SL.Diff.15" };

SL.wealth = {
  penniless: "SL.Wealth.penniless",
  struggling: "SL.Wealth.struggling",
  average: "SL.Wealth.average",
  affluent: "SL.Wealth.affluent",
  rich: "SL.Wealth.rich",
  plutocratic: "SL.Wealth.plutocratic"
};

SL.costs = { Che: "Cheap", Com: "Common", Exp: "Expensive", Ext: "Extravagant", Pri: "Priceless" };

SL.itemLocations = { readied: "SL.Loc.readied", stowed: "SL.Loc.stowed", other: "SL.Loc.other" };

SL.madnessCategories = { bloodshed: "SL.MadnessCat.bloodshed", horror: "SL.MadnessCat.horror", occult: "SL.MadnessCat.occult" };

/** Unarmed Slaughter die by Combat/Unarmed level (untrained: none). */
SL.unarmedSlaughter = level => (level < 0 ? "" : ["1d6", "1d8", "1d10"][level] ?? "1d12");

/** NPC saving throw: 15 minus half the hit dice, rounded up. */
SL.npcSave = hd => Math.ceil(15 - hd / 2);
