/**
 * Dice and chat cards for Silent Legions.
 *
 * - Skill check: 2d6 + skill level + attribute modifier (untrained: -1) vs a difficulty.
 * - Saving throw: 1d20 ≥ save target (NPCs: 15 - HD/2, rounded up).
 * - Attack: 1d20 + attack bonus + combat skill (untrained: -2) + attribute modifier
 *   + target AC ≥ 20. Natural 1 misses, natural 20 hits.
 * - Damage: weapon dice + attribute modifier, with the Slaughter die rolled at the
 *   same time. Slaughter 6+ triples the damage (unless the target is immune).
 * - Madness, Expertise, sorcery costs, rest, and level advancement.
 */
import { SL } from "./config.mjs";

const SYSTEM = "silent-legions";
const esc = v => foundry.utils.escapeHTML(String(v ?? ""));
const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const signed = n => (n >= 0 ? `+${n}` : `${n}`);

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/** The first targeted token's actor, if any. */
function targetActor() {
  return game.user.targets.first()?.actor ?? null;
}

/** Ask for form values. Returns the form data object, or null when closed. */
async function ask(title, content) {
  try {
    return await foundry.applications.api.DialogV2.input({
      window: { title },
      content: `<div class="sl-dialog">${content}</div>`,
      ok: { label: t("SL.Roll"), icon: "fa-solid fa-dice" },
      rejectClose: false
    });
  } catch {
    return null;
  }
}

const field = (label, input) => `<div class="form-group"><label>${esc(label)}</label><div class="form-fields">${input}</div></div>`;
const numberInput = (name, value = 0) => `<input type="number" name="${name}" value="${value}" step="1">`;
const selectInput = (name, options, selected) => `<select name="${name}">${Object.entries(options)
  .map(([k, v]) => `<option value="${esc(k)}" ${String(k) === String(selected) ? "selected" : ""}>${esc(t(v))}</option>`).join("")}</select>`;
const attributeOptions = () => Object.fromEntries(Object.entries(SL.attributes).map(([k, v]) => [k, v.label]));
const difficultyOptions = () => ({ "": "SL.Diff.none", ...SL.difficulties });

/** Render a chat card and post it with its rolls (`renderRolls: false` keeps the rolls out of the card text). */
export async function postCard(actor, { title, subtitle = "", img = null, rolls = [], body = "", buttons = [], flags = {}, renderRolls = true }) {
  const rollHtml = [];
  if (renderRolls) for (const r of rolls) rollHtml.push(await r.render());
  const content = `
    <div class="sl-card">
      <header class="sl-card-header">
        ${img ? `<img src="${esc(img)}" alt="">` : ""}
        <div><h3>${esc(title)}</h3>${subtitle ? `<span class="sl-sub">${esc(subtitle)}</span>` : ""}</div>
      </header>
      ${body}
      ${rollHtml.join("")}
      ${buttons.length ? `<div class="sl-card-buttons">${buttons.map(b =>
        `<button type="button" data-sl-action="${esc(b.action)}" ${Object.entries(b.data ?? {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ")}>${b.icon ? `<i class="${b.icon}"></i> ` : ""}${esc(b.label)}</button>`).join("")}</div>` : ""}
    </div>`;
  const data = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls,
    flags: { [SYSTEM]: { actorUuid: actor?.uuid, ...flags } }
  };
  ChatMessage.applyRollMode(data, game.settings.get("core", "rollMode"));
  return ChatMessage.create(data);
}

const outcome = (ok, okKey = "SL.Success", failKey = "SL.Failure") =>
  `<div class="sl-outcome ${ok ? "success" : "failure"}">${t(ok ? okKey : failKey)}</div>`;

/* -------------------------------------------- */
/*  Skill checks                                */
/* -------------------------------------------- */

/**
 * Roll a skill check. For characters: 2d6 + skill + attribute modifier.
 * For NPCs: 2d6 + the NPC skill bonus.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {Item} [options.skill]        A skill item (characters).
 * @param {string} [options.name]       A skill name, when there is no item (untrained check).
 * @param {string} [options.attribute]  Attribute key; default from the skill.
 * @param {number} [options.modifier]
 * @param {number|null} [options.difficulty]
 * @param {boolean} [options.fastForward]  Skip the dialog.
 * @param {boolean} [options.isReroll]
 */
export async function skillCheck(actor, options = {}) {
  let { skill = null, name = null, attribute, modifier = 0, difficulty = null, fastForward = false, isReroll = false } = options;
  const isPC = actor.type === "character";
  if (!skill && name && isPC) skill = actor.findSkill(name);
  const label = skill?.name ?? name ?? t("SL.SkillCheck");
  attribute ??= skill?.system.attribute ?? (SL.skills[String(name).split("/")[0]]?.attr ?? "int");

  if (!fastForward) {
    const form = await ask(`${actor.name}: ${label}`, [
      isPC ? field(t("SL.Attribute"), selectInput("attribute", attributeOptions(), attribute)) : "",
      field(t("SL.Modifier"), numberInput("modifier", modifier)),
      field(t("SL.Difficulty"), selectInput("difficulty", difficultyOptions(), difficulty ?? ""))
    ].join(""));
    if (!form) return null;
    attribute = form.attribute ?? attribute;
    modifier = Number(form.modifier) || 0;
    difficulty = form.difficulty === "" || form.difficulty == null ? null : Number(form.difficulty);
  }

  const parts = ["2d6"];
  const data = {};
  if (isPC) {
    data.skill = skill?.system.trained ? skill.system.level : SL.untrained;
    data.attr = actor.system.attributes[attribute]?.mod ?? 0;
    parts.push("@skill", "@attr");
  } else {
    data.skill = actor.system.skill;
    parts.push("@skill");
  }
  if (modifier) { data.mod = modifier; parts.push("@mod"); }
  const roll = await new Roll(parts.join(" + "), data).evaluate();

  const success = difficulty == null ? null : roll.total >= difficulty;
  const attrLabel = isPC ? `${SL.attributes[attribute]?.abbr}/` : "";
  const subtitle = [
    isPC && !skill?.system.trained ? t("SL.Untrained") : "",
    difficulty != null ? `${t("SL.Difficulty")} ${difficulty}` : "",
    isReroll ? t("SL.Rerolled") : ""
  ].filter(Boolean).join(" · ");
  const buttons = [];
  // Reliable Skill: reroll a failed class-skill check once for 1 Expertise.
  const canReroll = isPC && !isReroll && success === false && skill?.system.isClassSkill && actor.system.expertise.value > 0;
  if (canReroll) buttons.push({ action: "reroll-skill", label: t("SL.RerollExpertise"), icon: "fa-solid fa-rotate" });
  return postCard(actor, {
    title: `${attrLabel}${label}`,
    subtitle,
    rolls: [roll],
    body: success == null ? "" : outcome(success),
    buttons,
    flags: { type: "skill", skillId: skill?.id ?? null, name, attribute, modifier, difficulty }
  });
}

/* -------------------------------------------- */
/*  Saving throws and morale                    */
/* -------------------------------------------- */

export async function saveThrow(actor, key = "physical", { modifier = 0, fastForward = false } = {}) {
  const isPC = actor.type === "character";
  const target = isPC ? actor.system.saves[key].target : actor.system.saveTarget;
  const label = isPC ? t(SL.saves[key]) : t("SL.Save.npc");
  if (!fastForward) {
    const form = await ask(`${actor.name}: ${label}`, field(t("SL.Modifier"), numberInput("modifier", modifier)));
    if (!form) return null;
    modifier = Number(form.modifier) || 0;
  }
  const roll = await new Roll(modifier ? "1d20 + @mod" : "1d20", { mod: modifier }).evaluate();
  return postCard(actor, {
    title: label, subtitle: `${t("SL.Target")} ${target}+`, rolls: [roll],
    body: outcome(roll.total >= target), flags: { type: "save", key }
  });
}

export async function moraleCheck(actor) {
  const roll = await new Roll("2d6").evaluate();
  const morale = actor.system.morale;
  return postCard(actor, {
    title: t("SL.Morale"), subtitle: `ML ${morale}`, rolls: [roll],
    body: outcome(roll.total <= morale, "SL.MoraleHolds", "SL.MoraleBreaks"), flags: { type: "morale" }
  });
}

/* -------------------------------------------- */
/*  Attacks and damage                          */
/* -------------------------------------------- */

/** Weapon (or NPC attack) numbers in one shape. */
function attackProfile(actor, { weapon = null, attackIndex = null }) {
  if (weapon) {
    const s = weapon.system;
    const { key: attr, mod: attrMod } = s.attributeMod(actor);
    const skill = actor.type === "character" ? actor.findSkill(s.skill) : null;
    const trained = skill?.system.trained;
    const skillLevel = actor.type === "character" ? (trained ? skill.system.level : -2) : 0;
    const unarmedLevel = s.unarmed ? (trained ? skill.system.level : -1) : null;
    return {
      name: weapon.name, img: weapon.img, count: 1,
      bonus: (actor.type === "character" ? actor.system.attackBonus : 0) + Math.max(skillLevel, -2) + attrMod,
      bonusParts: { attackBonus: actor.system.attackBonus ?? 0, skill: skillLevel, attr: attrMod, attrKey: attr },
      damage: s.damage, damageMod: attrMod + (s.unarmed ? Math.max(unarmedLevel, 0) : 0),
      slaughter: s.unarmed ? SL.unarmedSlaughter(unarmedLevel) : s.slaughter,
      burst: s.burst, firearm: s.firearm, subdual: s.subdual, weaponId: weapon.id
    };
  }
  const a = actor.system.attacks[attackIndex];
  return {
    name: a.name, img: actor.img, count: a.count, bonus: a.bonus, bonusParts: null,
    damage: a.damage, damageMod: 0, slaughter: actor.system.slaughter, burst: false, firearm: false, attackIndex
  };
}

const validFormula = f => !!f && Roll.validate(f);

/**
 * Roll an attack. On a hit, damage and the Slaughter die are rolled in the same card.
 * NPC attacks with "x2" roll each attack.
 */
export async function attack(actor, { weapon = null, attackIndex = null, modifier = 0, targetAC = null, burst = false, fastForward = false, isReroll = false } = {}) {
  const p = attackProfile(actor, { weapon, attackIndex });
  const target = targetActor();
  if (targetAC == null && target) targetAC = target.type === "character" ? (p.firearm ? target.system.ac.ranged : target.system.ac.melee) : target.system.ac;
  targetAC ??= 9;

  if (!fastForward) {
    const form = await ask(`${actor.name}: ${p.name}`, [
      field(t("SL.TargetAC"), numberInput("targetAC", targetAC)),
      field(t("SL.Modifier"), numberInput("modifier", modifier)),
      p.burst ? field(t("SL.BurstFire"), `<input type="checkbox" name="burst" ${burst ? "checked" : ""}>`) : ""
    ].join(""));
    if (!form) return null;
    targetAC = Number(form.targetAC) || 0;
    modifier = Number(form.modifier) || 0;
    burst = !!form.burst;
  }
  const burstBonus = burst ? 2 : 0;
  const rolls = [];
  const results = [];
  for (let n = 0; n < p.count; n++) {
    const roll = await new Roll("1d20 + @bonus + @ac + @mod", { bonus: p.bonus, ac: targetAC, mod: modifier + burstBonus }).evaluate();
    const natural = roll.dice[0].total;
    const hit = natural === 20 || (natural !== 1 && roll.total >= 20);
    rolls.push(roll);
    const res = { hit, natural, roll };
    if (hit) Object.assign(res, await rollDamage(p, { burst, targetImmune: target?.type === "npc" && target.system.mundaneImmune }));
    if (res.damageRoll) rolls.push(res.damageRoll);
    if (res.slaughterRoll) rolls.push(res.slaughterRoll);
    results.push(res);
  }

  const total = results.reduce((s, r) => s + (r.final ?? 0), 0);
  const body = results.map((r, i) => {
    const head = p.count > 1 ? `<strong>#${i + 1}</strong> ` : "";
    if (!r.hit) return `<div class="sl-outcome failure">${head}${t("SL.Miss")}${r.natural === 1 ? " (1)" : ""}</div>`;
    const slaughter = r.slaughterRoll ? ` · ${t("SL.SlaughterDie")} ${r.slaughterRoll.total}${r.slaughtered ? ` → <strong>${t("SL.Slaughter")}</strong>` : ""}${r.immuneNote ? ` (${t("SL.Immune")})` : ""}` : "";
    return `<div class="sl-outcome success">${head}${t("SL.Hit")}${r.natural === 20 ? " (20)" : ""}: <strong>${r.final}</strong> ${t("SL.DamageShort")}${slaughter}</div>`;
  }).join("");
  const buttons = [];
  if (total > 0) {
    buttons.push({ action: "apply-damage", label: t("SL.ApplyDamage", { n: total }), icon: "fa-solid fa-heart-crack", data: { amount: total } });
  }
  const missed = results.every(r => !r.hit);
  if (missed && !isReroll && weapon && actor.type === "character" && actor.system.rerollAttacks && actor.system.expertise.value > 0) {
    buttons.push({ action: "reroll-attack", label: t("SL.RerollExpertise"), icon: "fa-solid fa-rotate" });
  }
  const subtitle = [
    `${signed(p.bonus)} ${t("SL.ToHit")}`, `${t("SL.VsAC")} ${targetAC}`, target ? target.name : "",
    burst ? t("SL.BurstFire") : "", modifier ? `${t("SL.Modifier")} ${signed(modifier)}` : "", isReroll ? t("SL.Rerolled") : ""
  ].filter(Boolean).join(" · ");
  if (weapon?.system.magazine > 0 && weapon.system.firearm) {
    const used = burst ? 3 : 1;
    await weapon.update({ "system.ammo": Math.max(0, weapon.system.ammo - used) });
  }
  return postCard(actor, {
    title: p.name, subtitle, img: p.img, rolls, body, buttons,
    flags: { type: "attack", weaponId: p.weaponId ?? null, attackIndex: p.attackIndex ?? null, modifier, targetAC, burst }
  });
}

async function rollDamage(p, { burst = false, targetImmune = false } = {}) {
  const parts = [];
  if (validFormula(p.damage)) parts.push(p.damage);
  if (!parts.length) return { final: 0, note: p.damage };
  const mod = p.damageMod + (burst ? 2 : 0);
  if (mod) parts.push(String(mod));
  const damageRoll = await new Roll(parts.join(" + ")).evaluate();
  let slaughterRoll = null, slaughtered = false, immuneNote = false;
  if (validFormula(p.slaughter) && !p.subdual) {
    slaughterRoll = await new Roll(burst ? `${p.slaughter} + 2` : p.slaughter).evaluate();
    slaughtered = slaughterRoll.total >= 6;
    if (slaughtered && targetImmune) { slaughtered = false; immuneNote = true; }
  }
  const base = Math.max(0, damageRoll.total);
  return { damageRoll, slaughterRoll, slaughtered, immuneNote, final: slaughtered ? base * 3 : base };
}

/* -------------------------------------------- */
/*  Madness and Deliria                         */
/* -------------------------------------------- */

/** Roll a Madness formula and add it to the character. */
export async function gainMadness(actor, { formula = "1d6", label = "" } = {}) {
  if (!validFormula(formula)) return ui.notifications.warn(t("SL.Warn.badFormula", { formula }));
  const roll = await new Roll(formula).evaluate();
  const before = actor.system.madness.value;
  const after = await actor.addMadness(roll.total);
  return postCard(actor, {
    title: t("SL.GainMadness"), subtitle: label, rolls: [roll],
    body: `<div class="sl-outcome failure">${t("SL.Madness")} ${before} → <strong>${after}</strong></div>`,
    flags: { type: "madness" }
  });
}

/** Dialog with the Madness costs from the imported book data, or a custom formula. */
export async function madnessDialog(actor) {
  const events = game.settings.get(SYSTEM, "madnessCosts") ?? [];
  const options = events.filter(e => validFormula(e.cost) || /^\d+$/.test(e.cost))
    .map((e, i) => `<option value="${i}">${esc(e.category)}: ${esc(e.event)} (${esc(e.cost)})</option>`).join("");
  const form = await ask(`${actor.name}: ${t("SL.GainMadness")}`, [
    options ? field(t("SL.MadnessEvent"), `<select name="event"><option value="">—</option>${options}</select>`) : "",
    field(t("SL.Formula"), `<input type="text" name="formula" value="1d6">`),
    field(t("SL.Label"), `<input type="text" name="label" value="">`)
  ].join(""));
  if (!form) return null;
  const ev = form.event !== "" && form.event != null ? events[Number(form.event)] : null;
  return gainMadness(actor, { formula: ev ? ev.cost : form.formula, label: ev ? ev.event : form.label });
}

/**
 * After taking a new Delirium (add the Delirium item first): roll 1d20. If the roll is
 * at least the number of Deliria, lose 10 Madness; otherwise gain 10.
 */
export async function deliriumCheck(actor) {
  const count = actor.items.filter(i => i.type === "delirium").length;
  if (!count) return ui.notifications.warn(t("SL.Warn.noDelirium"));
  const roll = await new Roll("1d20").evaluate();
  const ok = roll.total >= count;
  const after = await actor.addMadness(ok ? -10 : 10);
  return postCard(actor, {
    title: t("SL.DeliriumCheck"), subtitle: `${t("SL.Deliria")}: ${count}`, rolls: [roll],
    body: `${outcome(ok)}<p>${t(ok ? "SL.DeliriumSoothes" : "SL.DeliriumWorse")} ${t("SL.Madness")} → <strong>${after}</strong></p>`,
    flags: { type: "delirium" }
  });
}

/* -------------------------------------------- */
/*  Sorcery and abilities                       */
/* -------------------------------------------- */

const descriptionHtml = async item => (item.system.description
  ? `<div class="sl-card-desc">${await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description, { relativeTo: item })}</div>`
  : "");

/** Pay a sorcery cost: 1 Expertise, or Madness. Returns the label of what was paid, or null. */
async function payCost(actor, madness, title) {
  const exp = actor.system.expertise.value;
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title },
    content: `<p>${t("SL.PayCost", { madness })}</p>`,
    buttons: [
      { action: "expertise", label: t("SL.PayExpertise"), icon: "fa-solid fa-star", disabled: exp < 1, default: exp >= 1 },
      { action: "madness", label: t("SL.PayMadness", { n: madness }), icon: "fa-solid fa-brain", default: exp < 1 }
    ],
    rejectClose: false
  });
  if (choice === "expertise") return (await actor.spendExpertise(1)) ? t("SL.PaidExpertise") : null;
  if (choice === "madness") { await actor.addMadness(madness); return t("SL.PaidMadness", { n: madness }); }
  return null;
}

/**
 * Cast a spell: pay 1 Expertise or Madness equal to the spell level. A spell above the
 * caster's Occult level also needs Int/Occult vs 6 + level; on a failure, the caster can
 * force it for more Madness equal to the level.
 */
export async function castSpell(actor, spell) {
  const level = spell.system.level;
  const paid = await payCost(actor, level, `${actor.name}: ${spell.name}`);
  if (!paid) return null;
  const occult = actor.findSkill("Occult");
  const rolls = [];
  let body = `<p class="sl-paid">${esc(paid)}</p>`;
  const buttons = [];
  if (!occult || occult.system.level < level) {
    const roll = await new Roll("2d6 + @skill + @attr", { skill: occult ? occult.system.level : -1, attr: actor.system.attributes.int.mod }).evaluate();
    rolls.push(roll);
    const ok = roll.total >= 6 + level;
    body += `<p>${t("SL.AboveOccult", { dc: 6 + level })}</p>${outcome(ok)}`;
    if (!ok) buttons.push({ action: "force-spell", label: t("SL.ForceSpell", { n: level }), icon: "fa-solid fa-brain", data: { madness: level } });
  }
  body += await descriptionHtml(spell);
  return postCard(actor, { title: spell.name, subtitle: `${t("SL.SpellLevel")} ${level}`, img: spell.img, rolls, body, buttons, flags: { type: "spell", itemId: spell.id } });
}

/**
 * Learn a spell from a book or a teacher: needs Occult at level-0 or better. Int/Occult vs
 * 6 + spell level (a teacher adds their Occult level). Any attempt costs 1 Madness; a success
 * costs Madness equal to the spell level more and adds the spell to the character.
 * @param {Actor} actor
 * @param {object} spellData  Item data of the spell (from a drop).
 */
export async function learnSpell(actor, spellData) {
  const level = spellData.system?.level ?? 1;
  const occult = actor.findSkill("Occult");
  if (!occult?.system.trained) return ui.notifications.warn(t("SL.Warn.needOccult", { name: actor.name }));
  const dc = SL.spellLearnDifficulty(level);
  const form = await ask(`${actor.name}: ${t("SL.LearnSpell")} (${spellData.name})`, [
    `<p>${t("SL.LearnSpellHint", { dc, level })}</p>`,
    field(t("SL.TeacherOccult"), numberInput("teacher", 0)),
    field(t("SL.Modifier"), numberInput("modifier", 0))
  ].join(""));
  if (!form) return null;
  const data = { skill: occult.system.level, attr: actor.system.attributes.int.mod, teacher: Number(form.teacher) || 0, mod: Number(form.modifier) || 0 };
  const roll = await new Roll("2d6 + @skill + @attr + @teacher + @mod", data).evaluate();
  const ok = roll.total >= dc;
  const madness = 1 + (ok ? level : 0);
  const after = await actor.addMadness(madness);
  let item = null;
  if (ok) {
    const itemData = foundry.utils.deepClone(spellData);
    delete itemData._id;
    [item] = await actor.createEmbeddedDocuments("Item", [itemData]);
  }
  return postCard(actor, {
    title: t("SL.LearnSpell"), subtitle: `${spellData.name} · ${t("SL.SpellLevel")} ${level} · ${t("SL.Difficulty")} ${dc}`,
    img: spellData.img, rolls: [roll],
    body: `${outcome(ok)}<p>${t(ok ? "SL.SpellLearned" : "SL.SpellNotLearned")} +${madness} ${t("SL.Madness")} → <strong>${after}</strong></p>`,
    flags: { type: "spellLearn", itemId: item?.id ?? null }
  });
}

/** Use a discipline: free up to the mastered level, else 1 Expertise or Madness = discipline level + 1. */
export async function useDiscipline(actor, disc) {
  const s = disc.system;
  const options = Object.fromEntries([...Array(s.level + 1).keys()].map(l => [l, `${t("SL.Level")} ${l}${l <= s.mastered ? ` (${t("SL.Mastered")})` : ""}`]));
  const form = await ask(`${actor.name}: ${disc.name}`, field(t("SL.Level"), selectInput("level", options, s.level)));
  if (!form) return null;
  const used = Number(form.level);
  let paid = t("SL.MasteredFree");
  if (used > s.mastered) {
    paid = await payCost(actor, s.level + 1, `${actor.name}: ${disc.name}`);
    if (!paid) return null;
  }
  const text = s.levels[used] ? `<p><strong>${t("SL.Level")} ${used}:</strong> ${esc(s.levels[used])}</p>` : "";
  return postCard(actor, {
    title: disc.name, subtitle: `${t("SL.Level")} ${used} · ${t("SL.Lasts15")}`, img: disc.img,
    body: `<p class="sl-paid">${esc(paid)}</p>${text}`, flags: { type: "discipline", itemId: disc.id }
  });
}

/** Use a class ability: spend its Expertise cost (usually 1). */
export async function useAbility(actor, ability) {
  const cost = ability.system.cost;
  if (cost > 0 && !(await actor.spendExpertise(cost))) return null;
  return postCard(actor, {
    title: ability.name, subtitle: cost ? t("SL.PaidExpertiseN", { n: cost }) : "", img: ability.img,
    body: await descriptionHtml(ability), flags: { type: "ability", itemId: ability.id }
  });
}

export async function showItem(actor, item) {
  return postCard(actor, { title: item.name, img: item.img, body: await descriptionHtml(item), flags: { type: "item", itemId: item.id } });
}

/* -------------------------------------------- */
/*  Rest and advancement                        */
/* -------------------------------------------- */

/** A night's rest: regain HP equal to level and 1 Expertise. */
export async function rest(actor) {
  const s = actor.system;
  const hp = Math.min(s.hp.max, s.hp.value + s.level);
  const exp = Math.min(s.expertise.max, s.expertise.value + 1);
  await actor.update({ "system.hp.value": hp, "system.expertise.value": exp });
  return postCard(actor, {
    title: t("SL.Rest"),
    body: `<p>${t("SL.HP")} ${s.hp.value} → <strong>${hp}</strong> · ${t("SL.Expertise")} ${s.expertise.value} → <strong>${exp}</strong></p>`,
    flags: { type: "rest" }
  });
}

/**
 * Gain a level in a class: reroll the whole hit dice pool (+ Con modifier per level),
 * keep the higher maximum, lose 10 Madness, gain 4 skill points.
 */
export async function levelUp(actor) {
  const s = actor.system;
  const options = Object.fromEntries(Object.entries(SL.classes).map(([k, v]) => [k, `${t(v.label)} (${s.classLevels[k]} → ${s.classLevels[k] + 1})`]));
  const current = Object.entries(s.classLevels).sort((a, b) => b[1] - a[1])[0][0];
  const form = await ask(`${actor.name}: ${t("SL.LevelUp")}`, field(t("SL.ClassLabel"), selectInput("cls", options, current)));
  if (!form) return null;
  // A level in a new class needs the first two bonus skills of that class at level-0.
  if (s.hasClass && s.classLevels[form.cls] === 0) {
    const missing = actor.missingClassPrerequisites(form.cls);
    if (missing.length) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: `${actor.name}: ${t("SL.LevelUp")}` },
        content: `<p>${t("SL.MulticlassMissing", { cls: t(SL.classes[form.cls].label), skills: missing.map(esc).join(", ") })}</p>`,
        rejectClose: false
      }).catch(() => false);
      if (!ok) return null;
    }
  }
  const levels = { ...s.classLevels, [form.cls]: s.classLevels[form.cls] + 1 };
  const total = Object.values(levels).reduce((a, b) => a + b, 0);
  // Levels past 10th roll no new hit dice.
  const dice = Object.entries(levels).filter(([, l]) => l > 0).map(([c, l]) => `${Math.min(l, 10)}d${SL.classes[c].hitDie}`).join(" + ");
  const con = s.attributes.con.mod * Math.min(total, 10);
  const roll = await new Roll(con ? `${dice} + ${con}` : dice).evaluate();
  const newMax = Math.max(s.hp.max, roll.total, 1);
  const madness = Math.max(0, s.madness.value - 10);
  await actor.update({
    "system.classLevels": levels,
    "system.hp.max": newMax,
    "system.hp.value": s.hp.value + (newMax - s.hp.max),
    "system.madness.value": madness,
    "system.skillPoints": s.skillPoints + 4,
    "system.expertise.value": s.expertise.value + 1
  });
  return postCard(actor, {
    title: t("SL.LevelUp"), subtitle: `${t(SL.classes[form.cls].label)} ${levels[form.cls]} · ${t("SL.Level")} ${total}`, rolls: [roll],
    body: `<p>${t("SL.MaxHP")} ${s.hp.max} → <strong>${newMax}</strong> · ${t("SL.Madness")} ${s.madness.value} → <strong>${madness}</strong> · +4 ${t("SL.SkillPoints")}</p>`,
    flags: { type: "level" }
  });
}

/* -------------------------------------------- */
/*  Chat card buttons                           */
/* -------------------------------------------- */

export function onRenderChatMessage(message, html) {
  const flags = message.flags?.[SYSTEM];
  if (!flags) return;
  for (const button of html.querySelectorAll("button[data-sl-action]")) {
    button.addEventListener("click", event => onCardButton(event, message, flags));
  }
}

async function onCardButton(event, message, flags) {
  event.preventDefault();
  const button = event.currentTarget;
  const action = button.dataset.slAction;
  const actor = flags.actorUuid ? await fromUuid(flags.actorUuid) : null;

  if (action === "apply-damage") {
    const amount = Number(button.dataset.amount) || 0;
    const tokens = canvas.tokens?.controlled.length ? canvas.tokens.controlled : [...game.user.targets];
    if (!tokens.length) return ui.notifications.warn(t("SL.Warn.noTokens"));
    for (const token of tokens) if (token.actor?.isOwner) await token.actor.applyDamage(amount);
    return;
  }
  if (!actor?.isOwner) return ui.notifications.warn(t("SL.Warn.notOwner"));
  button.disabled = true;

  if (action === "reroll-skill") {
    if (!(await actor.spendExpertise(1))) return;
    const skill = flags.skillId ? actor.items.get(flags.skillId) : null;
    return skillCheck(actor, { skill, name: flags.name, attribute: flags.attribute, modifier: flags.modifier, difficulty: flags.difficulty, fastForward: true, isReroll: true });
  }
  if (action === "reroll-attack") {
    if (!(await actor.spendExpertise(1))) return;
    const weapon = flags.weaponId ? actor.items.get(flags.weaponId) : null;
    return attack(actor, { weapon, attackIndex: flags.attackIndex, modifier: flags.modifier, targetAC: flags.targetAC, burst: flags.burst, fastForward: true, isReroll: true });
  }
  if (action === "force-spell") {
    const n = Number(button.dataset.madness) || 0;
    const after = await actor.addMadness(n);
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p class="sl-note">${t("SL.SpellForced", { n })} ${t("SL.Madness")} → ${after}</p>` });
  }
}
