import { SL } from "./config.mjs";
import * as Rolls from "./rolls.mjs";

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

  /** Add a skill at level-0, or raise it to level-1 if the character already has it at level-0. */
  async learnSkill(name) {
    const existing = this.items.find(i => i.type === "skill" && i.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (existing.system.level === 0) await existing.update({ "system.level": 1 });
      return existing;
    }
    const base = name.split("/")[0].trim();
    const attribute = SL.skills[base]?.attr ?? "int";
    const [item] = await this.createEmbeddedDocuments("Item", [{ name, type: "skill", system: { level: 0, attribute } }]);
    return item;
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
