import { SL } from "./config.mjs";
import * as Rolls from "./rolls.mjs";
import { NpcData } from "./data/actors.mjs";
import { askSpecialty } from "./documents.mjs";
import { SLCreationApp } from "./apps/creation-app.mjs";
import { bonusSkillsDialog } from "./apps/skill-picks.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2, ItemSheetV2 } = foundry.applications.sheets;
const TextEditor = () => foundry.applications.ux.TextEditor.implementation;
const PATH = "systems/silent-legions/templates";

const ITEM_ICONS = {
  skill: "icons/svg/book.svg", weapon: "icons/svg/sword.svg", armor: "icons/svg/shield.svg", gear: "icons/svg/item-bag.svg",
  vehicle: "icons/svg/wing.svg", spell: "icons/svg/daze.svg", discipline: "icons/svg/aura.svg", ability: "icons/svg/upgrade.svg",
  delirium: "icons/svg/terror.svg", background: "icons/svg/village.svg"
};
export const defaultItemIcon = type => ITEM_ICONS[type] ?? "icons/svg/item-bag.svg";

/** Shared actions and helpers of both actor sheets. */
class SLActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["silent-legions", "sheet", "actor"],
    form: { submitOnChange: true },
    window: { resizable: true },
    actions: {
      roll: SLActorSheet.#onRoll,
      itemCreate: SLActorSheet.#onItemCreate,
      itemEdit: SLActorSheet.#onItemEdit,
      itemDelete: SLActorSheet.#onItemDelete,
      itemUse: SLActorSheet.#onItemUse,
      toggleWorn: SLActorSheet.#onToggleWorn
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    return Object.assign(context, {
      actor, system: actor.system, source: actor.system._source, fields: actor.system.schema.fields,
      editable: this.isEditable, owner: actor.isOwner, config: SL
    });
  }

  /** Inline inputs for item fields (data-item-id + data-field) update the item, not the actor. */
  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const input of this.element.querySelectorAll("[data-item-field]")) {
      input.addEventListener("change", async event => {
        event.stopPropagation();
        const item = this.actor.items.get(input.closest("[data-item-id]").dataset.itemId);
        const value = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
        await item?.update({ [input.dataset.itemField]: value });
      });
    }
  }

  static #item(target) {
    return this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
  }

  static async #onRoll(event, target) {
    const { rollType, key } = target.dataset;
    const actor = this.actor;
    const fastForward = event.shiftKey;
    switch (rollType) {
      case "save": return Rolls.saveThrow(actor, key, { fastForward });
      case "skill": return Rolls.skillCheck(actor, { skill: SLActorSheet.#item.call(this, target), fastForward });
      case "untrained": return Rolls.skillCheck(actor, { name: key, fastForward });
      case "npcSkill": return Rolls.skillCheck(actor, { name: game.i18n.localize("SL.Skill"), fastForward });
      case "attack": return Rolls.attack(actor, { attackIndex: Number(key), fastForward });
      case "morale": return Rolls.moraleCheck(actor);
      case "madness": return Rolls.madnessDialog(actor);
      case "npcMadness": return actor.system.madnessFormula
        ? Rolls.postCard(actor, { title: game.i18n.localize("SL.Madness"), subtitle: actor.system.madness, rolls: [await new Roll(actor.system.madnessFormula).evaluate()] })
        : null;
      case "delirium": return Rolls.deliriumCheck(actor);
      case "rest": return Rolls.rest(actor);
      case "levelUp": return Rolls.levelUp(actor);
      case "initiative": return actor.rollInitiative({ createCombatants: true });
      case "hp": {
        const roll = await new Roll(NpcData.hpFormula(actor.system.hd)).evaluate();
        await actor.update({ "system.hp.value": roll.total, "system.hp.max": roll.total });
        return roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: game.i18n.localize("SL.RollHP") });
      }
    }
  }

  static async #onItemCreate(event, target) {
    const type = target.dataset.type;
    const name = game.i18n.format("SL.NewItem", { type: game.i18n.localize(`TYPES.Item.${type}`) });
    const system = {};
    if (type === "spell" && target.dataset.level) system.level = Number(target.dataset.level);
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name, type, img: defaultItemIcon(type), system }]);
    item?.sheet.render(true);
  }

  static #onItemEdit(event, target) {
    SLActorSheet.#item.call(this, target)?.sheet.render(true);
  }

  static async #onItemDelete(event, target) {
    const item = SLActorSheet.#item.call(this, target);
    if (!item) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("SL.Delete") },
      content: `<p>${game.i18n.format("SL.DeleteConfirm", { name: foundry.utils.escapeHTML(item.name) })}</p>`
    });
    if (ok) await item.delete();
  }

  static #onItemUse(event, target) {
    return SLActorSheet.#item.call(this, target)?.use({ fastForward: event.shiftKey });
  }

  static async #onToggleWorn(event, target) {
    const item = SLActorSheet.#item.call(this, target);
    if (item) await item.update({ "system.worn": !item.system.worn });
  }

  static async enrich(html, actor) {
    return TextEditor().enrichHTML(html ?? "", { relativeTo: actor, secrets: actor.isOwner });
  }
}

/* -------------------------------------------- */
/*  Character                                   */
/* -------------------------------------------- */

export class SLCharacterSheet extends SLActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["character"],
    position: { width: 760, height: 780 },
    actions: {
      learnSkill: SLCharacterSheet.#onLearnSkill,
      buySkill: SLCharacterSheet.#onBuySkill,
      skillFilter: SLCharacterSheet.#onSkillFilter,
      bonusSkills: SLCharacterSheet.#onBonusSkills,
      createCharacter: SLCharacterSheet.#onCreateCharacter,
      raiseDiscipline: SLCharacterSheet.#onRaiseDiscipline,
      masterDiscipline: SLCharacterSheet.#onMasterDiscipline
    }
  };

  /** Skill list filter: all skills, trained skills only, or class skills only. Kept while the sheet is open. */
  static SKILL_FILTERS = { all: "SL.Filter.all", trained: "SL.Filter.trained", class: "SL.Filter.class" };
  #skillFilter = "all";

  static PARTS = {
    header: { template: `${PATH}/actor/character-header.hbs` },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: `${PATH}/actor/character-main.hbs`, scrollable: [""] },
    skills: { template: `${PATH}/actor/character-skills.hbs`, scrollable: [""] },
    equipment: { template: `${PATH}/actor/character-equipment.hbs`, scrollable: [""] },
    sorcery: { template: `${PATH}/actor/character-sorcery.hbs`, scrollable: [""] },
    features: { template: `${PATH}/actor/character-features.hbs`, scrollable: [""] },
    bio: { template: `${PATH}/actor/character-bio.hbs`, scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [{ id: "main" }, { id: "skills" }, { id: "equipment" }, { id: "sorcery" }, { id: "features" }, { id: "bio" }],
      initial: "main",
      labelPrefix: "SL.Tab"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const s = this.actor.system;
    const items = this.actor.items.contents.sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name));
    const byType = type => items.filter(i => i.type === type);

    context.attributes = Object.entries(s.attributes).map(([key, a]) => ({
      key, value: a.value, mod: a.mod, label: SL.attributes[key].label, abbr: SL.attributes[key].abbr
    }));
    context.classes = Object.entries(SL.classes).map(([key, c]) => ({ key, label: c.label, level: s.classLevels[key] }));
    context.saves = Object.entries(s.saves).map(([key, v]) => ({ key, target: v.target, label: SL.saves[key] }));
    context.skills = byType("skill").map(i => {
      const next = i.system.level + 1;
      const cost = SL.skillCost(next, i.system.isClassSkill);
      return {
        item: i, id: i.id, name: i.name, level: i.system.level, trained: i.system.trained, attribute: SL.attributes[i.system.attribute]?.abbr,
        classSkill: i.system.isClassSkill,
        buyTooltip: next > s.maxSkillLevel ? game.i18n.format("SL.BuyMax", { max: s.maxSkillLevel })
          : game.i18n.format(i.system.needsSpecialty ? "SL.BuySpecialty" : "SL.Buy", { level: next, cost })
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    context.skillFilter = this.#skillFilter;
    context.skillFilters = Object.entries(SLCharacterSheet.SKILL_FILTERS).map(([key, label]) => ({ key, label, active: key === this.#skillFilter }));
    const known = new Set(byType("skill").map(i => i.system.baseName));
    context.missingSkills = Object.keys(SL.skills).filter(n => !known.has(n) || SL.skills[n].spec);
    context.showCreate = this.isEditable && !s.hasClass;
    context.weapons = byType("weapon").map(w => {
      const { mod } = w.system.attributeMod(this.actor);
      const skill = this.actor.findSkill(w.system.skill);
      const toHit = s.attackBonus + (skill?.system.trained ? skill.system.level : -2) + mod;
      return { item: w, id: w.id, toHit, damage: `${w.system.damage}${mod ? (mod > 0 ? `+${mod}` : mod) : ""}` };
    });
    context.armor = byType("armor");
    context.gear = byType("gear");
    context.vehicles = byType("vehicle");
    context.spellLevels = [1, 2, 3, 4, 5].map(level => ({ level, spells: byType("spell").filter(i => i.system.level === level) }))
      .filter(g => g.spells.length);
    context.disciplines = byType("discipline");
    context.abilities = byType("ability").map(i => ({ item: i, id: i.id, locked: i.system.class && s.classLevels[i.system.class] < i.system.level }));
    context.deliria = byType("delirium");
    context.backgrounds = byType("background");
    context.madnessPct = Math.min(100, s.madness.value);
    context.wealthOptions = SL.wealth;
    context.locations = SL.itemLocations;
    context.enriched = {
      biography: await SLActorSheet.enrich(s.biography, this.actor),
      notes: await SLActorSheet.enrich(s.notes, this.actor)
    };
    return context;
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (context.tabs?.[partId]) context.tab = context.tabs[partId];
    return context;
  }

  /** "Add" under the skill list: a free skill at level-0 (no skill point cost; for the GM or a new character). */
  static async #onLearnSkill(event, target) {
    const select = this.element.querySelector("select[name='learn-skill']");
    const name = select?.value;
    if (!name) return;
    const full = SL.skills[name]?.spec ? await askSpecialty(name) : name;
    if (full) await this.actor.learnSkill(full);
  }

  static #onBuySkill(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (item) return this.actor.buySkill(item);
  }

  /** Show all skills, trained skills, or class skills. CSS hides the other rows, so there is no re-render. */
  static #onSkillFilter(event, target) {
    this.#skillFilter = target.dataset.filter;
    this.element.querySelector(".sl-skill-grid")?.setAttribute("data-filter", this.#skillFilter);
    for (const b of this.element.querySelectorAll("[data-action='skillFilter']")) {
      const active = b.dataset.filter === this.#skillFilter;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    }
  }

  static #onBonusSkills() {
    return bonusSkillsDialog(this.actor);
  }

  static #onCreateCharacter() {
    return new SLCreationApp(this.actor).render(true);
  }

  static #onRaiseDiscipline(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (item) return this.actor.raiseDiscipline(item);
  }

  static #onMasterDiscipline(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (item) return this.actor.masterDiscipline(item);
  }

  /**
   * Drops from outside the sheet:
   * - background: set it and add its skills (level-0, or level-1 if already known);
   * - skill: a skill the character already lists gets the dropped description, no duplicate;
   * - discipline: learn it (1 skill point, 5 Madness) or add it for free (innate, at creation);
   * - spell: roll to learn it (Int/Occult) or add it without a roll.
   */
  async _onDropItem(event, item) {
    const actor = this.actor;
    if (!actor.isOwner || item.parent === actor) return super._onDropItem(event, item);
    switch (item.type) {
      case "background": {
        await actor.update({ "system.background": item.name });
        const list = item.system.skillList.map(SL.skillName);
        const open = n => SL.anySkillPicks(n) || /^any /i.test(n) || /\/any$/i.test(n) || (SL.skills[n]?.spec && !n.includes("/"));
        for (const name of list.filter(n => !open(n))) await actor.learnSkill(name);
        const rest = list.filter(open);
        if (rest.length) ui.notifications.info(game.i18n.format("SL.BackgroundChoose", { skills: rest.join(", ") }));
        return item;
      }
      case "skill": {
        const existing = actor.skillNamed(item.name);
        if (!existing) return super._onDropItem(event, item);
        if (!existing.system.description && item.system.description) await existing.update({ "system.description": item.system.description });
        ui.notifications.info(game.i18n.format("SL.SkillExists", { name: item.name }));
        return existing;
      }
      case "discipline": {
        const choice = await SLCharacterSheet.#chooseLearn(item, "SL.LearnDisciplineHint", "SL.LearnDiscipline", "SL.AddInnate");
        if (choice === "learn") return actor.learnDiscipline(item.toObject());
        if (choice === "free") return actor.learnDiscipline(item.toObject(), { free: true });
        return null;
      }
      case "spell": {
        const choice = await SLCharacterSheet.#chooseLearn(item, "SL.LearnSpellDropHint", "SL.LearnSpell", "SL.AddKnown");
        if (choice === "learn") return Rolls.learnSpell(actor, item.toObject());
        if (choice === "free") return super._onDropItem(event, item);
        return null;
      }
    }
    return super._onDropItem(event, item);
  }

  /** Ask how to add a dropped spell or discipline: "learn" (with its cost), "free", or null. */
  static #chooseLearn(item, hintKey, learnKey, freeKey) {
    return foundry.applications.api.DialogV2.wait({
      window: { title: item.name },
      content: `<p>${game.i18n.format(hintKey, { level: item.system.level ?? 0 })}</p>`,
      buttons: [
        { action: "learn", label: game.i18n.localize(learnKey), icon: "fa-solid fa-book-skull", default: true },
        { action: "free", label: game.i18n.localize(freeKey), icon: "fa-solid fa-plus" }
      ],
      rejectClose: false
    }).catch(() => null);
  }
}

/* -------------------------------------------- */
/*  NPC                                         */
/* -------------------------------------------- */

export class SLNpcSheet extends SLActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["npc"],
    position: { width: 620, height: 640 },
    actions: { addAttack: SLNpcSheet.#onAddAttack, deleteAttack: SLNpcSheet.#onDeleteAttack }
  };

  static PARTS = {
    sheet: { template: `${PATH}/actor/npc.hbs`, scrollable: [".sl-scroll"] }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.attacks = this.actor.system.attacks.map((a, index) => ({ ...a, index }));
    context.items = this.actor.items.contents;
    context.enriched = { description: await SLActorSheet.enrich(this.actor.system.description, this.actor) };
    return context;
  }

  static async #onAddAttack() {
    const attacks = [...this.actor.system.toObject().attacks, { name: "attack", bonus: 0, count: 1, damage: "1d6" }];
    await this.actor.update({ "system.attacks": attacks });
  }

  static async #onDeleteAttack(event, target) {
    const attacks = this.actor.system.toObject().attacks;
    attacks.splice(Number(target.dataset.index), 1);
    await this.actor.update({ "system.attacks": attacks });
  }

  /** The attack rows use names like "attacks.0.name": turn them into the system.attacks array. */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    if (data.attacks) {
      data.system ??= {};
      data.system.attacks = Object.entries(data.attacks).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, a]) => ({
        name: a.name ?? "", bonus: Number(a.bonus) || 0, count: Math.max(1, Number(a.count) || 1), damage: a.damage ?? ""
      }));
      delete data.attacks;
    }
    return data;
  }
}

/* -------------------------------------------- */
/*  Items                                       */
/* -------------------------------------------- */

export class SLItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["silent-legions", "sheet", "item"],
    position: { width: 520, height: 560 },
    form: { submitOnChange: true },
    window: { resizable: true },
    actions: { use: SLItemSheet.#onUse }
  };

  static PARTS = {
    sheet: { template: `${PATH}/item/item.hbs`, scrollable: [".sl-scroll"] }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.item;
    return Object.assign(context, {
      item, system: item.system, source: item.system._source, fields: item.system.schema.fields,
      editable: this.isEditable, config: SL, type: item.type,
      [`is${item.type.capitalize()}`]: true,
      hasLocation: "location" in item.system,
      attributeChoices: Object.fromEntries(Object.entries(SL.attributes).map(([k, v]) => [k, v.label])),
      classChoices: { "": "—", ...Object.fromEntries(Object.entries(SL.classes).map(([k, v]) => [k, v.label])) },
      levels: [0, 1, 2, 3, 4].map(l => ({ level: l, text: item.system.levels?.[l] ?? "" })),
      canUse: !!item.actor,
      enriched: { description: await TextEditor().enrichHTML(item.system.description ?? "", { relativeTo: item, secrets: item.isOwner }) }
    });
  }

  static #onUse() {
    return this.item.use();
  }
}
