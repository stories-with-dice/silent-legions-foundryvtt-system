/**
 * Skill picks of a new character: background skills, class bonus skills, and free picks.
 * The creation wizard (creation-app.mjs) and the "Bonus skills" dialog use these rows.
 *
 * A row is { key, label, options }: `options` is a list of skill names to choose from
 * (one name: a fixed skill). Specialized skills (Combat, Culture, …) also need a specialty.
 */
import { SL } from "../config.mjs";

const esc = v => foundry.utils.escapeHTML(String(v ?? ""));
const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const allSkills = () => Object.keys(SL.skills);
const isSpec = name => !!SL.skills[String(name).split("/")[0].trim()]?.spec && !String(name).includes("/");

/** Rows for a background's skill list, for example "Culture/Home, History, Any One Skill". */
export function backgroundRows(skills) {
  const rows = [];
  skills.map(SL.skillName).forEach((name, i) => {
    const any = SL.anySkillPicks(name);
    if (any) for (let n = 0; n < any; n++) rows.push({ key: `bg${i}_${n}`, label: t("SL.Picks.background"), options: allSkills() });
    // "Combat/Any" and similar: pick the specialty yourself.
    else rows.push({ key: `bg${i}`, label: t("SL.Picks.background"), options: [name.replace(/\/any$/i, "")] });
  });
  return rows;
}

/** Rows for a class: the two named bonus skills, any one class skill, any one skill. */
export function classRows(cls) {
  const c = SL.classes[cls];
  if (!c) return [];
  const label = t(c.label);
  return [
    ...c.bonusSkills.map((options, i) => ({ key: `cls${i}`, label, options })),
    { key: "clsAny", label: t("SL.Picks.classSkill", { cls: label }), options: c.skills },
    { key: "any", label: t("SL.Picks.anySkill"), options: allSkills() }
  ];
}

/** Struggling wealth gives one more free pick. */
export function wealthRows(wealth) {
  const n = SL.startingWealth[wealth]?.picks ?? 0;
  return Array.from({ length: n }, (_, i) => ({ key: `wealth${i}`, label: t("SL.Picks.wealth"), options: allSkills() }));
}

/** Form HTML for the rows. `values` holds earlier choices: { "pick-key": name, "spec-key": specialty }. */
export function rowsHtml(rows, values = {}) {
  return rows.map(row => {
    const chosen = values[`pick-${row.key}`] ?? (row.options.length === 1 ? row.options[0] : "");
    const control = row.options.length === 1
      ? `<input type="hidden" name="pick-${row.key}" value="${esc(row.options[0])}"><span class="sl-pick-fixed">${esc(row.options[0])}</span>`
      : `<select name="pick-${row.key}"><option value="">—</option>${row.options.map(o =>
        `<option value="${esc(o)}" ${o === chosen ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    const spec = row.options.some(isSpec)
      ? `<input type="text" name="spec-${row.key}" value="${esc(values[`spec-${row.key}`] ?? "")}" placeholder="${esc(t("SL.Picks.specialty"))}">`
      : "";
    return `<div class="form-group sl-pick"><label>${esc(row.label)}</label><div class="form-fields">${control}${spec}</div></div>`;
  }).join("");
}

/**
 * Read the chosen skills from form values. Returns { names, errors }: full names such as
 * "Combat/Projectile", and messages for missing picks or specialties.
 */
export function readPicks(rows, values) {
  const names = [], errors = [];
  for (const row of rows) {
    const name = String(values[`pick-${row.key}`] ?? "").trim();
    if (!name) { errors.push(t("SL.Picks.missing", { label: row.label })); continue; }
    if (isSpec(name)) {
      const spec = String(values[`spec-${row.key}`] ?? "").trim();
      if (!spec) { errors.push(t("SL.Picks.needSpecialty", { name })); continue; }
      names.push(`${name}/${spec}`);
    } else names.push(name);
  }
  return { names, errors };
}

/**
 * Check the picks against the character's skills: each pick raises an untrained skill to
 * level-0 and a level-0 skill to level-1. A new character's skill cannot go above level-1.
 * Returns the error messages.
 */
export function checkPicks(actor, names) {
  const levels = new Map(actor.items.filter(i => i.type === "skill").map(i => [i.name.toLowerCase(), i.system.level]));
  const errors = [];
  for (const name of names) {
    const key = name.toLowerCase();
    const level = (levels.get(key) ?? SL.untrained) + 1;
    if (level > SL.startingSkillMax) errors.push(t("SL.Picks.tooHigh", { name }));
    levels.set(key, level);
  }
  return [...new Set(errors)];
}

/** Learn the picked skills in order. */
export async function applyPicks(actor, names) {
  for (const name of names) await actor.learnSkill(name);
}

/**
 * "Bonus skills" dialog of a character with a class: the class's two named bonus skills,
 * any one class skill, and any one skill. It uses the class with the most levels.
 */
export async function bonusSkillsDialog(actor) {
  const cls = Object.entries(actor.system.classLevels).filter(([, l]) => l > 0).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!cls) return ui.notifications.warn(t("SL.Warn.noClass"));
  const rows = classRows(cls);
  let values = {};
  for (;;) {
    const form = await foundry.applications.api.DialogV2.input({
      window: { title: `${actor.name}: ${t("SL.BonusSkills")} (${t(SL.classes[cls].label)})` },
      content: `<div class="sl-dialog"><p class="sl-hint">${t("SL.Picks.hint")}</p>${rowsHtml(rows, values)}</div>`,
      ok: { label: t("SL.Picks.add"), icon: "fa-solid fa-plus" },
      rejectClose: false
    }).catch(() => null);
    if (!form) return null;
    values = form;
    const { names, errors } = readPicks(rows, form);
    errors.push(...checkPicks(actor, names));
    if (errors.length) { ui.notifications.warn(errors.join(" ")); continue; }
    await applyPicks(actor, names);
    return names;
  }
}
