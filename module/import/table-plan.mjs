/**
 * Master tables: how the book's random tables combine.
 *
 * The book builds gods, aliens, Kelipot, cults, artifacts, adventures, and NPCs by
 * rolling several tables together ("roll one of each type of die") or by letting one
 * table pick the next ("The Sorcery's Basic Effect" picks one of twelve effect tables).
 * This file turns the parsed tables (sl-parser.mjs) into a plan of:
 *
 * - base tables: the book tables, plus a few small tables the book describes in text
 *   (deity mode, grimoire spell level, sample deliria, spells by level);
 * - master tables: results that point to other tables.
 *   - "all" masters roll every listed table once (formula "1", every result on 1);
 *   - "branch" masters copy a book table and point each row to the table it names.
 *
 * Foundry draws all results that match a roll and draws inner tables recursively,
 * so a master table works with the normal Roll button. The plan has no Foundry or
 * Node code; foundry-import.mjs creates the documents, keeper-pack.mjs lists them.
 */

/* -------------------------------------------- */
/*  Book structure (by table name)              */
/* -------------------------------------------- */

const EFFECTS = [
  "It Maims or Kills", "It Summons an Entity", "It Communicates with a Thing", "It Creates a Disaster",
  "It Influences the Target's Mind", "It Improves a Living Creature", "It Improves an Object", "It Curses a Target",
  "It Conjures a Thing", "It Destroys A Thing", "It Transports the Target", "It Controls Natural Laws"
];
const SORCERY_NEEDS = ["A Type of Location", "A Type of Object", "A Type of Sacrifice", "A Type of Participant", "A Particular Time", "A Recent Act"];
const MODES = ["Create", "Destroy", "Control", "See"];

/** One-roll sets: the book says to roll one of each die (d4, d6, d8, d10, d12, d20) together. */
const ONE_ROLL_SETS = {
  "Alien: Grim History": ["How Long Have They Been Here?", "Why Did The Influence End?", "Their Greatest Remaining Work", "Why Aren't They Known?", "What Do They Think of Humans?", "Where Did They Come From?", "What Did They Influence?"],
  "Alien: Dark Ways": ["How Directly Involved Are They?", "What Values do they despise?", "Why are they in this Region?", "What is their advantage?", "How do they control minions?", "What do they fear?", "What Values do they Admire?"],
  "Cult: Roots of the Evil": ["When Were They Founded?", "How Did They Conceal the Cult?", "Their Most Important Past Event", "Who Founded It?", "Who Were the Early Recruits?", "Who Troubled Them Most?", "What Motivated the Founding?"],
  "Cult: How It Manifests": ["How Crazed Are They?", "What's their Strongest Tool?", "Special Traits and Quirks", "Where Do They Meet?", "How Is It Governed?", "How Do They Control Members?", "What Does the Cult Crave?"],
  "Artifact: Origin": ["What Do Legends Say Of It?", "What Great Deed Was It Part Of?", "How Was It Lost By Its Maker?", "Who Created It?", "When Was It Created?", "Why Was It Created?"],
  "Artifact: Curse": ["How Bad Is The Curse?", "What is the Basic Curse Effect?", "What Cures the Curse's Effect?", "How Can the Curse be Suppressed?", "How Frequent is the Curse?", "What Triggers the Curse?"],
  "Artifact: Weapon Power": ["What Kind of Weapon Is It?", "The Strangeness When It's Used", "What Other Power Does It Have?", "What Kind of Benefit Does It Give?", "What Does It Work Against?", "What's Uncanny About It?"],
  "Artifact: Protection": ["How Complete Is the Protection?", "What Does It Protect Against?", "What Is Its Flaw?", "How Often Can It Be Used?", "How Broad Is The Protection?", "How Does the Ward Appear?"],
  "Artifact: Miscellaneous Effect": ["How Long Does It Last?", "Internal Effects", "How Strong Is The Effect?", "How Hard Is It To Resist?", "External Effects"],
  "One-Roll Actor": ["One-Roll Actor Creation: Age", "Their Advantage in the Situation", "Memorable Quirks", "Profession", "Relation to Situation", "Social Standing", "The Problem That Drives Them"],
  "One-Roll Crime": ["It was discovered by…", "The Crime Scene Investigation is…", "A Clue about the Crime is…", "The Police Attitude is…", "The Seeming Type of Crime is…", "Gossip or News about it is…", "The Witnesses Were…"],
  "Mythos Aberration": ["They're Not From Around Here", "What Uncanny Mark Do They Bear?", "What's Wrong About This Place?", "A Thing They Desire Is…", "A Rule They Ignore Is…", "Who Sent Them?", "What Curse Plagues the Unwary?"]
};

/* -------------------------------------------- */
/*  Plan builder                                */
/* -------------------------------------------- */

const slug = s => String(s).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const label = name => String(name).split(": ").pop();
/** "Grim Histories: How Long Have They Been Here?". A part heading gives only its first half ("Creating Gods"). */
const withSection = (section, name) => {
  const prefix = String(section ?? "").split(": ")[0];
  return !prefix || name.toLowerCase().startsWith(prefix.toLowerCase()) ? name : `${prefix}: ${name}`;
};

/**
 * @param {object} data  Output of parseBook().
 * @returns {{tables: object[], masters: object[], warnings: string[]}}
 *   tables:  { id, name, bookName, label, folder, formula, description, results: [{ range, label, text, link? }] }
 *            `name` is the book name with its section in front; master tables find tables by `bookName`.
 *   masters: { id, name, folder, top, description, formula, results: [{ range, label, text?, ref }] }
 *            `ref` is the id of a table or of an earlier master. Masters come leaves first.
 *   link:    { kind: "background" | "delirium" | "spell" | "tag", name } — the importer turns it into a document link.
 */
export function buildTablePlan(data) {
  const warnings = [];
  const tables = [];
  const byName = new Map();
  const masters = [];
  const masterIds = new Set();

  const addTable = ({ section, ...t }) => {
    const table = { id: `t-${slug(t.name)}`, label: label(t.name), ...t, name: withSection(section, t.name), bookName: t.name };
    tables.push(table);
    byName.set(t.name, table);
    return table;
  };
  const folderOf = t => (t.part ? t.part.split(":")[0] : t.chapter) || "Other";

  for (const t of data.tables ?? []) {
    const link = t.name === "Background" ? "background" : t.name === "Location Tags: Tag" ? "tag" : null;
    addTable({
      name: t.name, section: t.section, folder: folderOf(t), formula: t.formula,
      description: [t.section, t.page ? `Silent Legions p. ${t.page - 3}` : ""].filter(Boolean).join(" · "),
      results: t.results.map(r => ({
        range: r.range, label: label(t.name), text: r.text,
        ...(link ? { link: { kind: link, name: r.text.split(" — ")[0] } } : {})
      }))
    });
  }

  // Tables the book gives as text or lists.
  if (byName.has("Modes and Epithets: Create")) {
    addTable({
      name: "Deity Mode", section: "Portfolios and Modes", folder: "Creating Gods", formula: "1d4", description: "Portfolios and Modes: pick a mode, then an epithet",
      results: MODES.map((m, i) => ({ range: [i + 1, i + 1], label: "Mode", text: m }))
    });
  }
  if (data.deliria?.length) {
    addTable({
      name: "Sample Deliria", section: "Madness", folder: "Character Creation", formula: `1d${data.deliria.length}`, description: "Madness: Sample Deliria",
      results: data.deliria.map((d, i) => ({ range: [i + 1, i + 1], label: "Delirium", text: d.name, link: { kind: "delirium", name: d.name } }))
    });
  }
  const spellLevels = [1, 2, 3, 4, 5].filter(l => data.spells?.some(s => s.level === l));
  for (const level of spellLevels) {
    const spells = data.spells.filter(s => s.level === level);
    addTable({
      name: `Spells: Level ${level}`, folder: "Sorcery", formula: `1d${spells.length}`, description: `Spells of the Gray Path, level ${level}`,
      results: spells.map((s, i) => ({ range: [i + 1, i + 1], label: `Level ${level} spell`, text: s.name, link: { kind: "spell", name: s.name } }))
    });
  }
  if (spellLevels.length === 5) {
    // Occult Grimoires: "1-3 is first level, 4-6 is second level, 7-8 is third level, 9 is fourth level, and 10 is fifth level."
    addTable({
      name: "Grimoire Spell Level", section: "Occult Grimoires", folder: "Creating Artifacts", formula: "1d10", description: "Occult Grimoires: level of each spell in the book",
      results: [[1, 3, 1], [4, 6, 2], [7, 8, 3], [9, 9, 4], [10, 10, 5]].map(([lo, hi, l]) => ({ range: [lo, hi], label: "Spell level", text: `Level ${l}` }))
    });
  }

  // The book asks the GM to pick these; a 1dN table lets the GM roll instead.
  const choice = (name, folder, labelText, options) => addTable({
    name, section: "Building a Template", folder, formula: `1d${options.length}`, description: "Pick one, or roll",
    results: options.map((o, i) => ({ range: [i + 1, i + 1], label: labelText, text: o }))
  });
  choice("Resolution Kind", "Creating Adventure Templates", "Resolution", ["Time-sensitive", "No time pressure"]);
  choice("Investigation Kind", "Creating Adventure Templates", "Investigation", ["Objects or places", "People or events"]);
  choice("Challenge Kind", "Creating Adventure Templates", "Challenge", ["Investigator: infiltrating a place", "Investigator: finding an important object",
    "Scholar: information to obtain", "Scholar: hidden fact or needed skill", "Socialite: people who want something",
    "Socialite: people who fear something", "Tough: hostile opposition", "Tough: environmental dangers"]);

  /* ---- master helpers ---- */

  const refId = ref => {
    if (masterIds.has(`m-${slug(ref)}`)) return `m-${slug(ref)}`;
    const t = byName.get(ref);
    return t ? t.id : null;
  };
  const refLabel = ref => byName.get(ref)?.label ?? ref.replace(/^[^:]+: /, "");
  const pushMaster = m => {
    if (!m.results.length) { warnings.push(`Master table "${m.name}": no sub-tables found`); return null; }
    masters.push(m);
    masterIds.add(m.id);
    return m;
  };

  /** Roll every listed table (or master) once. */
  const all = (name, folder, description, refs, { top = false } = {}) => {
    const results = [];
    for (const ref of refs) {
      const id = refId(ref);
      if (!id) { warnings.push(`Master table "${name}": "${ref}" not found`); continue; }
      results.push({ range: [1, 1], label: refLabel(ref), ref: id });
    }
    return pushMaster({ id: `m-${slug(name)}`, name, folder, top, description, formula: "1", kind: "all", results });
  };

  /** Copy a table and point each row to another table (or master). */
  const branch = (name, folder, description, baseName, targets, { top = false, keepText = true } = {}) => {
    const base = byName.get(baseName);
    if (!base) { warnings.push(`Master table "${name}": "${baseName}" not found`); return null; }
    const results = [];
    base.results.forEach((r, i) => {
      const target = typeof targets === "function" ? targets(r, i) : targets[i];
      const id = target && refId(target);
      if (!id) { warnings.push(`Master table "${name}": row ${r.range[0]} has no target "${target}"`); return; }
      results.push({ range: r.range, label: base.label, text: keepText ? r.text : "", ref: id });
    });
    return pushMaster({ id: `m-${slug(name)}`, name, folder, top, description, formula: base.formula, kind: "branch", results });
  };

  /* ---- Sorcery ---- */

  for (const e of EFFECTS) all(`${e} (effect and word)`, "Generator Steps", "Creating Dark Sorcery: an effect and a word for the spell's name", [e, `${e}: Word`]);
  branch("Dark Sorcery: Effect", "Generator Steps", "The Sorcery's Basic Effect, then the matching effect table and name word",
    "The Sorcery's Basic Effect", EFFECTS.map(e => `${e} (effect and word)`));
  branch("Dark Sorcery: Need", "Generator Steps", "To Cast It, The Sorcerer Needs… (a Major spell needs 1d3+1 things, a Grand one 1d4+3)",
    "To Cast It, The Sorcerer Needs...", SORCERY_NEEDS);
  all("Dark Sorcery: Name Words", "Generator Steps", "Words for Creating a Spell's Name",
    ["Words for Creating a Spell's Name: Spell", "Words for Creating a Spell's Name: Adjective", "Words for Creating a Spell's Name: Entity"]);
  all("Dark Sorcery", "Generators", "Creating Dark Sorcery: effect, origin, power, a casting need, and name words. Draw the need again for each extra needed thing.",
    ["Dark Sorcery: Effect", "It was first devised by means of...", "How Powerful Is the Spell?", "Dark Sorcery: Need", "Dark Sorcery: Name Words"], { top: true });
  if (byName.has("Grimoire Spell Level")) {
    branch("Grimoire Spell", "Generator Steps", "Occult Grimoires: a spell of a random level (a grimoire has 1d4 spells)",
      "Grimoire Spell Level", (r, i) => `Spells: Level ${i + 1}`, { keepText: false });
  }

  /* ---- Gods ---- */

  branch("Deity Mode and Epithet", "Generator Steps", "Selecting Modes: the mode and an epithet from its list",
    "Deity Mode", MODES.map(m => `Modes and Epithets: ${m}`));
  all("Pantheon", "Generators", "Creating Gods: number of major deities and a pantheon trait",
    ["Number of Major Deities", "Pantheon Traits"], { top: true });

  /* ---- GM resources (used by other generators) ---- */

  all("Name Syllable", "Generator Steps", "Lovecraftian Name Generator: one consonant and one vowel syllable",
    ["Lovecraftian Name Generator: C", "Lovecraftian Name Generator: C: V"]);
  all("Lovecraftian Name", "Generators", "Lovecraftian Name Generator: a name structure and syllables to fill it (roll 1d6+1 syllables in all; draw again for <Name>)",
    ["Basic Structure of the Name", "Name Syllable", "Name Syllable", "Name Syllable", "Deity Mode and Epithet"], { top: true });

  all("Outer God", "Generators", "Creating Gods: portfolio, mode with epithet, a title pattern with two words, and a name",
    ["Portfolio", "Deity Mode and Epithet", "Title", "Word", "Word", "Lovecraftian Name"], { top: true });

  /* ---- Aliens ---- */

  all("Alien: Grim History", "Generator Steps", "Creating Aliens: Grim Histories (roll one of each die)", ONE_ROLL_SETS["Alien: Grim History"]);
  all("Alien: Dark Ways", "Generator Steps", "Creating Aliens: Dark Ways (roll one of each die)", ONE_ROLL_SETS["Alien: Dark Ways"]);
  all("Alien: Body", "Generator Steps", "The Creature's Physical Form: body parts",
    ["Arm or Leg", "Hand / Foot", "Head", "Skin", "Torso", "Mouth", "Tentacle"]);
  all("Alien: Physical Form", "Generator Steps", "The Creature's Physical Form: configuration, body, and behavior",
    ["Basic Configuration", "Animal Types and Characteristics", "Other Growths", "Alien: Body", "Manner of Feeding", "Voice or Call", "The Way it Moves", "Hunting Style"]);
  all("Alien Race", "Generators", "Creating Aliens: history, ways, physical form, a special ability, and a name",
    ["Alien: Grim History", "Alien: Dark Ways", "Alien: Physical Form", "Optional Special Abilities", "Lovecraftian Name"], { top: true });

  /* ---- Kelipot ---- */

  all("Kelipah: Basic Traits", "Generator Steps", "Establish Basic Traits: terrain, element, warping, flora, fauna",
    ["The Terrain is…", "An element…", "…is warped this way", "The Flora is…", "The Fauna is…"]);
  all("Kelipah: Inhabitants", "Generator Steps", "Create the Inhabitants",
    ["Inspiration", "Rigidity", "Population", "Material Technology Level", "Magical Prevalence", "Number of Major Factions", "Ruling Authorities"]);
  all("Kelipah: Values and Attitudes", "Generator Steps", "Add Values, Desires and Attitudes: a pair of values, a desire, and an attitude",
    ["Values Prized by the Culture", "Values Prized by the Culture", "Desires of the Rulers or People", "Attitude toward Outsiders"]);
  all("Kelipah: Cultural Flavor", "Generator Steps", "Add Cultural Flavor: two elements, read as effect and cause",
    ["Cultural Element", "Cultural Element"]);
  all("Kelipah", "Generators", "Creating Kelipot: size, traits, inhabitants, values, and cultural flavor",
    ["The Size of the Realm", "Kelipah: Basic Traits", "Kelipah: Inhabitants", "Kelipah: Values and Attitudes", "Kelipah: Cultural Flavor"], { top: true });

  /* ---- Cults ---- */

  all("Cult: Roots of the Evil", "Generator Steps", "The Roots of the Evil (roll one of each die)", ONE_ROLL_SETS["Cult: Roots of the Evil"]);
  all("Cult: How It Manifests", "Generator Steps", "How It Manifests (roll one of each die)", ONE_ROLL_SETS["Cult: How It Manifests"]);
  all("Cult Name", "Generators", "Minions and Names: a naming format and one word of each kind to fill it",
    ["Possible Naming Formats", "Group", "Occult", "Hue", "Object", "Count", "Laud", "Material", "Master"], { top: true });
  all("Cult: Minions", "Generator Steps", "Minions and Names: an important and a petty servant",
    ["What Important NPCs Serve?", "What Petty NPCs Serve Them?"]);
  all("Cult", "Generators", "Creating Cults: roots, how it manifests, minions, a name, and its god",
    ["Cult: Roots of the Evil", "Cult: How It Manifests", "Cult: Minions", "Cult Name", "Portfolio"], { top: true });

  /* ---- Artifacts ---- */

  for (const key of ["Artifact: Origin", "Artifact: Curse", "Artifact: Weapon Power", "Artifact: Protection", "Artifact: Miscellaneous Effect"]) {
    all(key, "Generator Steps", `Creating Artifacts: ${key.split(": ")[1]} (roll one of each die)`, ONE_ROLL_SETS[key]);
  }
  all("Magical Weapon", "Generators", "Creating Artifacts: origin, curse, and weapon powers", ["Artifact: Origin", "Artifact: Curse", "Artifact: Weapon Power"], { top: true });
  all("Protective Artifact", "Generators", "Creating Artifacts: origin, curse, and protection", ["Artifact: Origin", "Artifact: Curse", "Artifact: Protection"], { top: true });
  all("Miscellaneous Artifact", "Generators", "Creating Artifacts: origin, curse, and effect (use the internal or the external effect)",
    ["Artifact: Origin", "Artifact: Curse", "Artifact: Miscellaneous Effect"], { top: true });
  all("Grimoire Title", "Generator Steps", "Occult Grimoires: title words", ["Book", "Book: Adjective", "Book: Noun"]);
  all("Occult Grimoire", "Generators", "Occult Grimoires: language, form, tenor, condition, material, title, and a first spell (a grimoire has 1d4 spells)",
    ["What Language Is Used?", "What Form Does It Take?", "What Is The Tenor of the Text?", "What's the Book's Condition?", "What's the Manuscript Made From?", "Grimoire Title", "Grimoire Spell"], { top: true });

  /* ---- Adventures ---- */

  branch("Resolution Scene", "Generator Steps", "Resolution Scenes: with or without time pressure", "Resolution Kind", ["Time-Sensitive Resolutions", "Resolutions Without Time Pressure"]);
  branch("Investigation Scene", "Generator Steps", "Investigation Scenes: of objects and places, or of people and events", "Investigation Kind", ["Investigations of Objects or Places", "Investigations of People or Events"]);
  all("Adventure Template", "Generators", "Building a Template (work backwards): a Resolution, two Investigations, an Introduction, and a Hook",
    ["Resolution Scene", "Investigation Scene", "Investigation Scene", "The Introduction", "The Hook"], { top: true });
  all("Extra Scenes", "Generators", "Optional scenes: an Ambush, a Conflict, an Escape, and a Respite",
    ["The Nature of the Ambush", "The Form of Conflict", "The Escape the Heroes Need to Make", "The Respite"], { top: true });
  branch("Scene Challenge", "Generators", "Scenes and Challenges: one of the eight challenge tables (two per class)", "Challenge Kind",
    ["Infiltrating a Place", "Finding An Important Object", "Information to Obtain", "Hidden Fact or Needed Skill", "People Who Want Something", "People Who Fear Something", "Hostile Opposition", "Environmental Dangers"], { top: true, keepText: true });
  all("One-Roll Actor", "Generators", "One-Roll Actor Creation (roll one of each die)", ONE_ROLL_SETS["One-Roll Actor"], { top: true });
  all("One-Roll Crime", "Generators", "One-Roll Crime Creation (roll one of each die)", ONE_ROLL_SETS["One-Roll Crime"], { top: true });

  /* ---- Bestiary and resources ---- */

  all("Monster Twist", "Generators", "Special Monster Traits and Types of Monstrous Horror", ["Quality", "The basic horror of the Thing"], { top: true });
  all("Poison", "Generators", "Lingering Poisons and Diseases: effect, interval, and harm", ["Poison effects", "Poison effects: Intervals", "Poison effects: Harm"], { top: true });
  const adepts = byName.get("Region")?.results.map(r => r.text) ?? [];
  branch("Secret Adept: Region", "Generator Steps", "Secret Adepts of the World: a region and an adept from it", "Region", adepts);
  all("Secret Adept", "Generators", "Secret Adepts of the World: region and adept, motive, hallmark magic, and manner of \"death\"",
    ["Secret Adept: Region", "Motive to Study", "Hallmark Magic", "Manner of \"Death\"", "Lovecraftian Name"], { top: true });
  all("Dark Vision", "Generators", "Dark Visions: sense, side effect, and insight", ["Sense Affected", "Side Effect of the Vision", "Type of Insight Granted"], { top: true });
  all("Mythos Aberration", "Generators", "Mythos Aberrations (roll one of each die)", ONE_ROLL_SETS["Mythos Aberration"], { top: true });

  return { tables, masters, warnings };
}
