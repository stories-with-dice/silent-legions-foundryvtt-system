/**
 * Character creation wizard. The steps follow the book's summary:
 *
 * 1. Attributes: roll 3d6 in order, or place 14/11/7 (optional rule, no more 14s than 7s).
 * 2. Background: its skills at level-0, and its "Any … Skills" free picks.
 * 3. Class: raise one prime attribute to 14, and the class bonus skills.
 * 4. Wealth: Average, Struggling (one more free pick), or Affluent (10 Madness).
 * 5. Finish: set the sheet, learn the skills (at most level-1), roll hit points (hit die
 *    + Con modifier, at least 1), set Expertise 2, add the background and the class's
 *    level-1 abilities from the imported compendiums, and post a summary card.
 */
import { SL } from "../config.mjs";
import * as Rolls from "../rolls.mjs";
import { backgroundRows, classRows, wealthRows, rowsHtml, readPicks, checkPicks, applyPicks } from "./skill-picks.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const esc = v => foundry.utils.escapeHTML(String(v ?? ""));
const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const SYSTEM = "silent-legions";

/** Fields that change the layout of the form: a change re-renders it. */
const LAYOUT_FIELDS = ["method", "background", "bgSkills", "cls", "wealth"];

export class SLCreationApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @param {Actor} actor  The character to set up. */
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    const s = actor.system;
    this.state = {
      method: "roll",
      scores: Object.fromEntries(Object.entries(s.attributes).map(([k, a]) => [k, a.value])),
      background: "",
      bgName: s.background,
      bgSkills: "",
      cls: Object.keys(SL.classes)[0],
      prime: "",
      wealth: "average",
      values: {}
    };
    this.backgrounds = null;
  }

  static DEFAULT_OPTIONS = {
    classes: ["silent-legions", "sl-creation"],
    tag: "form",
    window: { title: "SL.Create.title", icon: "fa-solid fa-user-plus", resizable: true },
    position: { width: 600, height: 760 },
    form: { handler: SLCreationApp.#onChange, submitOnChange: true, closeOnSubmit: false },
    actions: {
      rollAttributes: SLCreationApp.#onRollAttributes,
      rollBackground: SLCreationApp.#onRollBackground,
      finish: SLCreationApp.#onFinish
    }
  };

  static PARTS = {
    form: { template: "systems/silent-legions/templates/apps/creation.hbs", scrollable: [".sl-scroll"] }
  };

  get title() {
    return `${t("SL.Create.title")}: ${this.actor.name}`;
  }

  /** Backgrounds from the imported compendium and the world's items: { id, name, skills }. */
  async #loadBackgrounds() {
    if (this.backgrounds) return this.backgrounds;
    const list = [];
    const pack = game.packs.get(`world.sl-backgrounds`);
    if (pack) {
      const index = await pack.getIndex({ fields: ["system.skills"] });
      for (const e of index) list.push({ id: e.uuid, name: e.name, skills: e.system?.skills ?? "" });
    }
    for (const i of game.items.filter(i => i.type === "background")) list.push({ id: i.uuid, name: i.name, skills: i.system.skills });
    this.backgrounds = list.sort((a, b) => a.name.localeCompare(b.name));
    return this.backgrounds;
  }

  /** The final attribute scores: the rolled or placed scores, with the prime attribute raised to 14. */
  #finalScores() {
    const scores = Object.fromEntries(Object.entries(this.state.scores).map(([k, v]) => [k, Math.clamp(Number(v) || 3, 3, 18)]));
    const prime = this.state.prime;
    if (prime && scores[prime] < SL.primeScore) scores[prime] = SL.primeScore;
    return scores;
  }

  #rows() {
    const skills = this.state.bgSkills.split(",").map(s => s.trim()).filter(Boolean);
    return [...backgroundRows(skills), ...classRows(this.state.cls), ...wealthRows(this.state.wealth)];
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const st = this.state;
    const backgrounds = await this.#loadBackgrounds();
    const scores = this.#finalScores();
    const cls = SL.classes[st.cls];
    const modSum = Object.keys(SL.attributes).reduce((n, k) => n + SL.attributeMod(Number(st.scores[k]) || 3), 0);
    return Object.assign(context, {
      state: st,
      isArray: st.method === "array",
      arrayOk: SL.validArray(st.scores),
      modSum,
      canReroll: modSum < 0,
      attributes: Object.entries(SL.attributes).map(([key, a]) => ({
        key, abbr: a.abbr, label: a.label, value: st.scores[key], final: scores[key], mod: SL.attributeMod(scores[key]),
        raised: scores[key] !== (Number(st.scores[key]) || 3),
        arrayOptions: SL.attributeArray.map(v => ({ v, selected: Number(st.scores[key]) === v }))
      })),
      backgrounds: backgrounds.map(b => ({ ...b, selected: b.id === st.background })),
      hasBackgrounds: backgrounds.length > 0,
      classes: Object.entries(SL.classes).map(([key, c]) => ({ key, label: c.label, selected: key === st.cls })),
      cls: {
        hitDie: cls.hitDie,
        skills: cls.skills.join(", "),
        primes: cls.prime.map(k => ({ key: k, label: SL.attributes[k].label, value: Number(st.scores[k]) || 3, selected: st.prime === k }))
      },
      wealthOptions: Object.keys(SL.startingWealth).map(k => ({ key: k, label: SL.wealth[k], hint: `SL.Create.wealth.${k}`, selected: k === st.wealth })),
      picksHtml: rowsHtml(this.#rows(), st.values)
    });
  }

  /** Store the form values; re-render only when a field that changes the layout changed. */
  static async #onChange(event, form, formData) {
    const data = formData.object;
    const st = this.state;
    const before = Object.fromEntries(LAYOUT_FIELDS.map(k => [k, st[k]]));
    for (const k of Object.keys(SL.attributes)) if (`score-${k}` in data) st.scores[k] = Number(data[`score-${k}`]) || 3;
    for (const k of ["method", "cls", "prime", "wealth", "bgName", "bgSkills"]) if (k in data) st[k] = data[k] ?? "";
    if ("background" in data && data.background !== st.background) {
      st.background = data.background;
      const bg = this.backgrounds.find(b => b.id === st.background);
      if (bg) Object.assign(st, { bgName: bg.name, bgSkills: bg.skills });
    }
    if (st.method !== before.method && st.method === "array") st.scores = Object.fromEntries(Object.keys(SL.attributes).map(k => [k, 11]));
    if (!SL.classes[st.cls].prime.includes(st.prime)) st.prime = "";
    for (const [k, v] of Object.entries(data)) if (k.startsWith("pick-") || k.startsWith("spec-")) st.values[k] = v;
    const layoutChanged = LAYOUT_FIELDS.some(k => st[k] !== before[k]) || event.target?.name === "prime" || event.target?.name?.startsWith("score-");
    if (layoutChanged) this.render();
  }

  /** Roll 3d6 six times, in order from Strength to Charisma, and post the result. */
  static async #onRollAttributes() {
    const keys = Object.keys(SL.attributes);
    const roll = await new Roll(`{${keys.map(() => "3d6").join(", ")}}`).evaluate();
    const totals = roll.terms[0].rolls.map(r => r.total);
    this.state.scores = Object.fromEntries(keys.map((k, i) => [k, totals[i]]));
    this.state.method = "roll";
    const cells = keys.map(k => `<td><strong>${this.state.scores[k]}</strong> (${SL.attributeMod(this.state.scores[k]) >= 0 ? "+" : ""}${SL.attributeMod(this.state.scores[k])})</td>`).join("");
    await Rolls.postCard(this.actor, {
      title: t("SL.Create.rolledAttributes"),
      body: `<table class="sl-card-table"><tr>${keys.map(k => `<th>${SL.attributes[k].abbr}</th>`).join("")}</tr><tr>${cells}</tr></table>`,
      rolls: [roll], renderRolls: false, flags: { type: "attributes" }
    });
    this.render();
  }

  /** Pick a random background (each of the book's backgrounds has the same chance). */
  static async #onRollBackground() {
    const list = this.backgrounds ?? [];
    if (!list.length) return;
    const roll = await new Roll(`1d${list.length}`).evaluate();
    const bg = list[roll.total - 1];
    Object.assign(this.state, { background: bg.id, bgName: bg.name, bgSkills: bg.skills });
    this.render();
  }

  static async #onFinish() {
    const actor = this.actor;
    const st = this.state;
    const errors = [];
    if (st.method === "array" && !SL.validArray(st.scores)) errors.push(t("SL.Create.badArray"));
    const rows = this.#rows();
    const { names, errors: pickErrors } = readPicks(rows, st.values);
    errors.push(...pickErrors, ...checkPicks(actor, names));
    if (errors.length) return ui.notifications.warn(errors.join(" "));

    const scores = this.#finalScores();
    const cls = SL.classes[st.cls];
    const wealth = SL.startingWealth[st.wealth];
    const con = SL.attributeMod(scores.con);
    const hpRoll = await new Roll(con ? `1d${cls.hitDie} + ${con}` : `1d${cls.hitDie}`).evaluate();
    const hp = Math.max(1, hpRoll.total);

    await actor.update({
      "system.attributes": Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, { value: v }])),
      "system.classLevels": Object.fromEntries(Object.keys(SL.classes).map(k => [k, k === st.cls ? 1 : 0])),
      "system.background": st.bgName,
      "system.wealth": st.wealth,
      "system.madness.value": wealth.madness,
      "system.hp": { value: hp, max: hp },
      "system.expertise": { value: SL.startingExpertise, lost: 0 },
      "system.skillPoints": 0,
      "system.xp": 0
    });
    await applyPicks(actor, names);

    // The background item and the class's level-1 abilities, when the compendiums exist.
    const add = [];
    const bg = st.background ? await fromUuid(st.background) : null;
    if (bg) add.push(bg.toObject());
    const abilities = game.packs.get("world.sl-abilities");
    if (abilities) {
      const index = await abilities.getIndex({ fields: ["system.class", "system.level"] });
      for (const e of index.filter(e => e.system?.class === st.cls && (e.system?.level ?? 1) <= 1)) {
        if (!actor.items.some(i => i.type === "ability" && i.name === e.name)) add.push((await fromUuid(e.uuid)).toObject());
      }
    }
    for (const d of add) delete d._id;
    if (add.length) await actor.createEmbeddedDocuments("Item", add);

    const attrs = Object.entries(scores).map(([k, v]) => `${SL.attributes[k].abbr} ${v}`).join(", ");
    await Rolls.postCard(actor, {
      title: t("SL.Create.done"), subtitle: `${t(cls.label)} 1 · ${esc(st.bgName)}`, img: actor.img, rolls: [hpRoll],
      body: `<p>${esc(attrs)}</p><p><strong>${t("SL.Skills")}:</strong> ${names.map(esc).join(", ")}</p>`
        + `<p>${t("SL.HP")} <strong>${hp}</strong> · ${t("SL.Expertise")} ${SL.startingExpertise} · ${t("SL.Madness")} ${wealth.madness} · ${t(SL.wealth[st.wealth])}</p>`
        + (add.length ? `<p>${t("SL.Create.added")}: ${add.map(d => esc(d.name)).join(", ")}</p>` : ""),
      flags: { type: "create" }
    });
    await actor.setFlag(SYSTEM, "created", true);
    this.close();
  }
}
