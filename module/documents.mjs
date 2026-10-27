import { SL } from "./config.mjs";
import * as Rolls from "./rolls.mjs";

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = v => foundry.utils.escapeHTML(String(v ?? ""));

/** Status effect ids for 0 HP: characters are mortally wounded, NPCs are dead. */
export const STATUS = { mortal: "sl-mortal", dead: "dead" };

/** Skill item data. New characters get every book skill at the untrained level. */
export const skillData = (name, level = 0) => ({
  name, type: "skill", img: "icons/svg/book.svg",
  system: { level, attribute: SL.skills[name.split("/")[0].trim()]?.attr ?? "int" }
});

/** Ask for the specialty of a specialized skill. Returns "Base/Specialty", or null. */
export async function askSpecialty(base) {
  const form = await foundry.applications.api.DialogV2.input({
    window: { title: t("SL.Specialization") },
    content: `<div class="form-group"><label>${esc(base)}/</label><input type="text" name="spec" autofocus></div>`,
    rejectClose: false
  }).catch(() => null);
  const spec = form?.spec?.trim();
  return spec ? `${base}/${spec}` : null;
}

async function confirm(title, html) {
  return foundry.applications.api.DialogV2.confirm({ window: { title }, content: html, rejectClose: false }).catch(() => false);
}

export class SLActor extends Actor {
  /** @inheritDoc */
  getRollData() {
    const data = super.getRollData();
    if (this.type === "character") {
      for (const [k, a] of Object.entries(this.system.attributes)) data[k] = a.mod;
      data.level = this.system.level;
      data.init = this.system.attributes.dex.mod;
    } else {
      data.init = 0;
    }
    return data;
  }

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    const prototypeToken = { actorLink: this.type === "character", disposition: this.type === "character" ? 1 : -1 };
    if (this.type === "character") prototypeToken.sight = { enabled: true };
    this.updateSource({ prototypeToken });
    // A new character lists every skill, untrained, so the sheet can roll any of them.
    if (this.type === "character" && !(data.items ?? []).some(i => i.type === "skill")) {
      this.updateSource({ items: [...(data.items ?? []), ...Object.keys(SL.skills).map(n => skillData(n, SL.untrained))] });
    }
  }

  /** At 0 HP a character gets the "mortally wounded" status and an NPC the "dead" status; healing removes it. */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (userId !== game.user.id || foundry.utils.getProperty(changed, "system.hp.value") === undefined) return;
    const id = this.type === "character" ? STATUS.mortal : STATUS.dead;
    const down = this.system.hp.value <= 0;
    if (down !== this.statuses.has(id)) this.toggleStatusEffect(id, { active: down, overlay: this.type !== "character" });
  }

  /** Lower current HP (never below 0) and post a short note. */
  async applyDamage(amount) {
    const hp = this.system.hp;
    const value = Math.max(0, hp.value - Math.max(0, amount));
    await this.update({ "system.hp.value": value });
    if (value === 0 && hp.value > 0) {
      const text = this.type === "character" ? game.i18n.localize("SL.Chat.mortallyWounded") : game.i18n.localize("SL.Chat.down");
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<p class="sl-note">${foundry.utils.escapeHTML(this.name)} ${text}</p>` });
    }
    return value;
  }

  /** Spend Expertise. Returns false (and warns) when there is not enough. */
  async spendExpertise(n = 1) {
    if (this.type !== "character") return true;
    const cur = this.system.expertise.value;
    if (cur < n) {
      ui.notifications.warn(game.i18n.format("SL.Warn.noExpertise", { name: this.name }));
      return false;
    }
    await this.update({ "system.expertise.value": cur - n });
    return true;
  }

  /** Add (or remove, with a negative amount) Madness, clamped to 0..100. */
  async addMadness(amount) {
    if (this.type !== "character") return 0;
    const value = Math.clamp(this.system.madness.value + amount, 0, 100);
    await this.update({ "system.madness.value": value });
    if (value >= 100) ui.notifications.error(game.i18n.format("SL.Warn.insane", { name: this.name }));
    return value;
  }

  /** Skill item by name (case-insensitive), or the best match on the base name ("Combat"). */
  findSkill(name) {
    const lname = String(name).toLowerCase();
    const skills = this.items.filter(i => i.type === "skill");
    return skills.find(s => s.name.toLowerCase() === lname)
      ?? skills.filter(s => s.system.baseName.toLowerCase() === lname.split("/")[0]).sort((a, b) => b.system.level - a.system.level)[0]
      ?? null;
  }

  /** Skill item with exactly this name (case-insensitive), or undefined. */
  skillNamed(name) {
    const lname = String(name).toLowerCase();
    return this.items.find(i => i.type === "skill" && i.name.toLowerCase() === lname);
  }

  /**
   * Free skill pick (background, class bonus skill): an untrained or new skill becomes level-0,
   * a level-0 skill becomes level-1. A skill at level-1 or higher does not change (a new
   * character's skills start at level-1 or lower).
   */
  async learnSkill(name) {
    const existing = this.skillNamed(name);
    if (existing) {
      if (existing.system.level < SL.startingSkillMax) await existing.update({ "system.level": existing.system.level + 1 });
      return existing;
    }
    const [item] = await this.createEmbeddedDocuments("Item", [skillData(name)]);
    return item;
  }

  /**
   * Spend skill points to raise a skill one level: class skill (new level + 1 points),
   * other skill (new level + 2). The new level must not be above the maximum skill level.
   * An untrained specialized row ("Combat") asks for the specialty and raises "Combat/…".
   */
  async buySkill(skill) {
    let name = skill.name;
    if (skill.system.needsSpecialty) {
      name = await askSpecialty(skill.system.baseName);
      if (!name) return null;
    }
    const target = name === skill.name ? skill : this.skillNamed(name);
    const from = target?.system.level ?? SL.untrained;
    const level = from + 1;
    const base = name.split("/")[0].trim();
    const classSkill = this.system.classSkills.has(base);
    const cost = SL.skillCost(level, classSkill);
    const { maxSkillLevel, skillPoints } = this.system;
    if (level > maxSkillLevel) return ui.notifications.warn(t("SL.Warn.skillMax", { name, level, max: maxSkillLevel }));
    if (skillPoints < cost) return ui.notifications.warn(t("SL.Warn.skillPoints", { name, cost, points: skillPoints }));
    if (target) await target.update({ "system.level": level });
    else await this.createEmbeddedDocuments("Item", [skillData(name, level)]);
    await this.update({ "system.skillPoints": skillPoints - cost });
    return Rolls.postCard(this, {
      title: t("SL.SkillRaised"), subtitle: name,
      body: `<p>${esc(name)}: ${from < 0 ? t("SL.UntrainedShort") : from} → <strong>${level}</strong> · ${t("SL.SkillPointsSpent", { n: cost, left: skillPoints - cost })}</p>`,
      flags: { type: "skillBuy" }
    });
  }

  /**
   * Learn a discipline: 1 skill point (it can go below 0: "spend ahead" from the next level)
   * and 5 Madness. With `free`, add it at level-0 with no cost (an innate discipline at creation).
   */
  async learnDiscipline(data, { free = false } = {}) {
    const itemData = foundry.utils.deepClone(data);
    itemData.system = { ...itemData.system, level: 0, mastered: -1 };
    delete itemData._id;
    const [item] = await this.createEmbeddedDocuments("Item", [itemData]);
    if (free) return item;
    const { learnPoints, learnMadness } = SL.discipline;
    const points = this.system.skillPoints;
    await this.update({ "system.skillPoints": points - learnPoints });
    await this.addMadness(learnMadness);
    await Rolls.postCard(this, {
      title: t("SL.DisciplineLearned"), subtitle: item.name, img: item.img,
      body: `<p>${t("SL.SkillPointsSpent", { n: learnPoints, left: points - learnPoints })} · +${learnMadness} ${t("SL.Madness")}</p>`,
      flags: { type: "disciplineLearn", itemId: item.id }
    });
    return item;
  }

  /** Raise a discipline one level, at the cost of a class skill. */
  async raiseDiscipline(disc) {
    const level = disc.system.level + 1;
    const { maxSkillLevel, skillPoints } = this.system;
    const cost = SL.skillCost(level, true);
    if (level > 4 || level > maxSkillLevel) return ui.notifications.warn(t("SL.Warn.skillMax", { name: disc.name, level, max: maxSkillLevel }));
    if (skillPoints < cost) return ui.notifications.warn(t("SL.Warn.skillPoints", { name: disc.name, cost, points: skillPoints }));
    await disc.update({ "system.level": level });
    await this.update({ "system.skillPoints": skillPoints - cost });
    return Rolls.postCard(this, {
      title: t("SL.SkillRaised"), subtitle: disc.name, img: disc.img,
      body: `<p>${esc(disc.name)}: ${level - 1} → <strong>${level}</strong> · ${t("SL.SkillPointsSpent", { n: cost, left: skillPoints - cost })}</p>`,
      flags: { type: "skillBuy" }
    });
  }

  /**
   * Master the next level of a discipline (a mastered level costs nothing to use).
   * Level-0: lose 1 Expertise for good and gain 10 Madness. Each later level: 5 Madness.
   */
  async masterDiscipline(disc) {
    const level = disc.system.mastered + 1;
    if (level > disc.system.level) return ui.notifications.warn(t("SL.Warn.masterKnown", { name: disc.name }));
    const madness = SL.discipline.masterMadness(level);
    const expertise = SL.discipline.masterExpertise(level);
    const cost = expertise ? t("SL.MasterCostExpertise", { madness, expertise }) : t("SL.MasterCost", { madness });
    if (!(await confirm(`${this.name}: ${disc.name}`, `<p>${t("SL.MasterConfirm", { level, cost })}</p>`))) return null;
    await disc.update({ "system.mastered": level });
    if (expertise) {
      const exp = this.system.expertise;
      await this.update({ "system.expertise.lost": exp.lost + expertise, "system.expertise.value": Math.max(0, exp.value - expertise) });
    }
    await this.addMadness(madness);
    return Rolls.postCard(this, {
      title: t("SL.DisciplineMastered"), subtitle: `${disc.name} · ${t("SL.Level")} ${level}`, img: disc.img,
      body: `<p>${esc(cost)}</p>`, flags: { type: "disciplineMaster", itemId: disc.id }
    });
  }

  /**
   * The bonus skills that a level in a new class needs (the first two picks of the class's
   * bonus skills, at level-0 or better). Returns the missing ones as text, for example
   * ["History or Science"].
   */
  missingClassPrerequisites(cls) {
    return SL.classes[cls].bonusSkills
      .filter(group => !group.some(name => this.items.some(i => i.type === "skill" && i.system.baseName === name && i.system.trained)))
      .map(group => group.join(` ${t("SL.Or")} `));
  }
}

export class SLItem extends Item {
  /** Main use of the item, from a sheet click or a macro. */
  async use(options = {}) {
    const actor = this.actor;
    if (!actor) return ui.notifications.warn(game.i18n.localize("SL.Warn.noActor"));
    switch (this.type) {
      case "skill": return Rolls.skillCheck(actor, { skill: this, ...options });
      case "weapon": return Rolls.attack(actor, { weapon: this, ...options });
      case "spell": return Rolls.castSpell(actor, this);
      case "discipline": return Rolls.useDiscipline(actor, this);
      case "ability": return Rolls.useAbility(actor, this);
      default: return Rolls.showItem(actor, this);
    }
  }
}

export class SLCombatant extends Combatant {
  /** 1d8 + Dex modifier for characters, 1d8 for NPCs. */
  _getInitiativeFormula() {
    return this.actor?.type === "character" ? "1d8 + @init" : "1d8";
  }
}

export class SLTableResult extends TableResult {
  /**
   * Chat card text for a drawn result. Imported results carry their table's label in the flag
   * `silent-legions.label`, so a master table's card says which sub-table gave each line.
   * The table sheet does not call this, so its rows show the result text only.
   */
  async getHTML() {
    const html = await super.getHTML();
    const label = this.getFlag("silent-legions", "label");
    if (!label) return html;
    return `<div class="sl-table-result"><div class="sl-table-label">${foundry.utils.escapeHTML(label)}</div>${html}</div>`;
  }

  /**
   * Foundry's version calls fromUuidSync, which throws for a page inside a compendium journal
   * (the Location Tags results link to pages in `world.sl-tags`). That error stops the table
   * sheet from rendering, so build the link from the UUID alone for those results.
   */
  documentToAnchor() {
    if (this.type === "text" || !this.documentUuid) return null;
    const parsed = foundry.utils.parseUuid(this.documentUuid) ?? {};
    if (!(parsed.collection instanceof foundry.documents.collections.CompendiumCollection) || !parsed.embedded?.length) {
      return super.documentToAnchor();
    }
    const div = document.createElement("div");
    div.innerHTML = this.description;
    return foundry.applications.ux.TextEditor.implementation.createAnchor({
      classes: ["content-link"],
      attrs: { draggable: "true" },
      dataset: { link: "", uuid: this.documentUuid, id: parsed.id, type: parsed.type, pack: parsed.collection.metadata.id,
        tooltip: game.i18n.localize(`DOCUMENT.${parsed.type}`) },
      name: this.name || div.textContent.trim() || game.i18n.localize("Unknown"),
      icon: CONFIG[parsed.type]?.sidebarIcon ?? "fa-solid fa-file-lines"
    });
  }
}
