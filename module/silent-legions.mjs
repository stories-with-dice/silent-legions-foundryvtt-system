/**
 * Silent Legions for Foundry VTT v13: entry point.
 */
import { SL } from "./config.mjs";
import { CharacterData, NpcData } from "./data/actors.mjs";
import * as ItemModels from "./data/items.mjs";
import { SLActor, SLItem, SLCombatant, SLTableResult } from "./documents.mjs";
import { SLCharacterSheet, SLNpcSheet, SLItemSheet, defaultItemIcon } from "./sheets.mjs";
import { SLImportApp } from "./apps/import-app.mjs";
import { SLCreationApp } from "./apps/creation-app.mjs";
import { STATUS } from "./documents.mjs";
import { ensureSkillPack } from "./import/foundry-import.mjs";
import * as Rolls from "./rolls.mjs";

const SYSTEM = "silent-legions";

Hooks.once("init", () => {
  CONFIG.SL = SL;
  game.silentLegions = { config: SL, rolls: Rolls, ImportApp: SLImportApp, CreationApp: SLCreationApp };

  CONFIG.Actor.documentClass = SLActor;
  CONFIG.Item.documentClass = SLItem;
  CONFIG.Combatant.documentClass = SLCombatant;
  CONFIG.TableResult.documentClass = SLTableResult;
  CONFIG.Combat.initiative = { formula: "1d8", decimals: 0 };
  // A character at 0 HP: dies in 6 rounds unless stabilized.
  CONFIG.statusEffects.push({ id: STATUS.mortal, name: "SL.Status.mortal", img: "icons/svg/blood.svg" });

  CONFIG.Actor.dataModels = { character: CharacterData, npc: NpcData };
  CONFIG.Item.dataModels = {
    skill: ItemModels.SkillData, weapon: ItemModels.WeaponData, armor: ItemModels.ArmorData, gear: ItemModels.GearData,
    vehicle: ItemModels.VehicleData, spell: ItemModels.SpellData, discipline: ItemModels.DisciplineData,
    ability: ItemModels.AbilityData, delirium: ItemModels.DeliriumData, background: ItemModels.BackgroundData
  };
  CONFIG.Actor.trackableAttributes = {
    character: { bar: ["hp", "madness"], value: ["expertise.value"] },
    npc: { bar: ["hp"], value: [] }
  };

  const DSC = foundry.applications.apps.DocumentSheetConfig;
  DSC.unregisterSheet(Actor, "core", foundry.appv1.sheets.ActorSheet);
  DSC.unregisterSheet(Item, "core", foundry.appv1.sheets.ItemSheet);
  DSC.registerSheet(Actor, SYSTEM, SLCharacterSheet, { types: ["character"], makeDefault: true, label: "SL.Sheet.character" });
  DSC.registerSheet(Actor, SYSTEM, SLNpcSheet, { types: ["npc"], makeDefault: true, label: "SL.Sheet.npc" });
  DSC.registerSheet(Item, SYSTEM, SLItemSheet, { makeDefault: true, label: "SL.Sheet.item" });

  game.settings.register(SYSTEM, "madnessCosts", { scope: "world", config: false, type: Array, default: [] });
  game.settings.register(SYSTEM, "importInfo", { scope: "world", config: false, type: Object, default: {} });
  game.settings.registerMenu(SYSTEM, "importMenu", {
    name: "SL.Import.menuName",
    label: "SL.Import.menuLabel",
    hint: "SL.Import.menuHint",
    icon: "fa-solid fa-file-pdf",
    type: SLImportApp,
    restricted: false
  });
});

Hooks.once("ready", () => ensureSkillPack().catch(err => console.error("Silent Legions | skill compendium", err)));

/** New items get a type icon instead of the generic bag. */
Hooks.on("preCreateItem", (item, data) => {
  if (!data.img || data.img === Item.implementation.DEFAULT_ICON) item.updateSource({ img: defaultItemIcon(item.type) });
});

Hooks.on("renderChatMessageHTML", Rolls.onRenderChatMessage);

/** "Import from PDF" button at the bottom of the Compendium sidebar. */
Hooks.on("renderCompendiumDirectory", (app, html) => {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".sl-import-button")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sl-import-button";
  button.innerHTML = `<i class="fa-solid fa-file-pdf"></i> ${game.i18n.localize("SL.Import.menuLabel")}`;
  button.addEventListener("click", () => new SLImportApp().render(true));
  const footer = root.querySelector(".directory-footer") ?? root;
  footer.append(button);
});

/** Drag a skill, weapon, spell, discipline, or ability to the hotbar for a roll macro. */
Hooks.on("hotbarDrop", (bar, data, slot) => {
  if (data.type !== "Item") return;
  createItemMacro(data, slot);
  return false;
});

async function createItemMacro(data, slot) {
  const item = await fromUuid(data.uuid);
  if (!item?.actor) return ui.notifications.warn(game.i18n.localize("SL.Warn.macroOwned"));
  const command = `const item = await fromUuid("${item.uuid}");\nitem?.use({ fastForward: event?.shiftKey });`;
  let macro = game.macros.find(m => m.name === item.name && m.command === command);
  macro ??= await Macro.create({ name: item.name, type: "script", img: item.img, command });
  game.user.assignHotbarMacro(macro, slot);
}
