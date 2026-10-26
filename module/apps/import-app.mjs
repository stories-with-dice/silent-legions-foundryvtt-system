/**
 * "Import from PDF" dialog (Game Settings → Silent Legions, and a button in the
 * Compendium sidebar). Reads the PDF in the browser with Foundry's bundled pdf.js,
 * parses it, and then:
 * - fills the world compendiums (foundry-import.mjs), and/or
 * - downloads an RPG Keeper content pack, and/or the parsed data as JSON.
 * Nothing is sent anywhere except the optional PDF upload into this world's folder.
 */
import { extractPages } from "../import/pdf-extract.mjs";
import { parseBook } from "../import/sl-parser.mjs";
import { toKeeperPack } from "../import/keeper-pack.mjs";
import { importBook, uploadPdf, PACKS } from "../import/foundry-import.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

async function loadPdfJs() {
  const route = path => foundry.utils.getRoute(path);
  const pdfjs = await import(route("scripts/pdfjs/build/pdf.mjs"));
  pdfjs.GlobalWorkerOptions.workerSrc = route("scripts/pdfjs/build/pdf.worker.mjs");
  return pdfjs;
}

export class SLImportApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "sl-import",
    tag: "form",
    classes: ["silent-legions", "sl-import"],
    window: { title: "SL.Import.title", icon: "fa-solid fa-file-pdf", resizable: true },
    position: { width: 560, height: "auto" },
    form: { handler: SLImportApp.#onSubmit, closeOnSubmit: false },
    actions: { keeper: SLImportApp.#onKeeper, json: SLImportApp.#onJson }
  };

  static PARTS = { form: { template: "systems/silent-legions/templates/apps/import.hbs" } };

  /** Parsed data of the last read file, reused by the download buttons. */
  #data = null;
  #fileKey = null;

  async _prepareContext(options) {
    const info = game.settings.get("silent-legions", "importInfo");
    return {
      packs: Object.entries(PACKS).map(([key, p]) => ({ key, label: p.label })),
      isGM: game.user.isGM,
      last: info?.date ? new Date(info.date).toLocaleString() : null,
      counts: info?.counts ? Object.entries(info.counts).map(([k, v]) => `${k}: ${v}`).join(", ") : ""
    };
  }

  #status(text) {
    const el = this.element.querySelector(".sl-import-status");
    if (el) el.textContent = text;
  }

  /** Read and parse the chosen file: a PDF, or a silent-legions-data.json from the CLI. */
  async #read() {
    const file = this.element.querySelector("input[name='file']")?.files?.[0];
    if (!file) throw new Error(game.i18n.localize("SL.Import.noFile"));
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (this.#data && this.#fileKey === key) return { data: this.#data, file };
    let data;
    if (/\.json$/i.test(file.name)) {
      data = JSON.parse(await file.text());
      if (!data?.meta || !Array.isArray(data.spells)) throw new Error(game.i18n.localize("SL.Import.badJson"));
    } else {
      this.#status(game.i18n.localize("SL.Import.loading"));
      const pdfjs = await loadPdfJs();
      const pages = await extractPages(pdfjs, await file.arrayBuffer(), {
        onProgress: (n, total) => this.#status(game.i18n.format("SL.Import.reading", { n, total }))
      });
      data = parseBook(pages);
    }
    this.#data = data;
    this.#fileKey = key;
    const counts = Object.entries(data.counts).map(([k, v]) => `${k}: ${v}`).join(", ");
    this.#status(game.i18n.format("SL.Import.parsed", { counts }));
    for (const w of data.warnings ?? []) console.warn(`Silent Legions import | ${w}`);
    return { data, file };
  }

  static async #onSubmit(event, form, formData) {
    try {
      const { data, file } = await this.#read();
      const values = formData.object;
      const only = Object.keys(PACKS).filter(k => values[`pack.${k}`]);
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("SL.Import.title") },
        content: `<p>${game.i18n.localize("SL.Import.confirm")}</p>`
      });
      if (!ok) return;
      let pdfPath = null;
      if (values.uploadPdf && /\.pdf$/i.test(file.name)) {
        this.#status(game.i18n.localize("SL.Import.uploading"));
        pdfPath = await uploadPdf(file);
      }
      await importBook(data, { only, pdfPath, onProgress: msg => this.#status(msg) });
      ui.notifications.info(game.i18n.localize("SL.Import.done"));
    } catch (err) {
      console.error(err);
      this.#status(err.message);
      ui.notifications.error(err.message);
    }
  }

  static async #onKeeper() {
    try {
      const { data } = await this.#read();
      foundry.utils.saveDataToFile(JSON.stringify(toKeeperPack(data), null, 1), "application/json", "keeper-sl-pack.json");
    } catch (err) {
      ui.notifications.error(err.message);
    }
  }

  static async #onJson() {
    try {
      const { data } = await this.#read();
      foundry.utils.saveDataToFile(JSON.stringify(data, null, 1), "application/json", "silent-legions-data.json");
    } catch (err) {
      ui.notifications.error(err.message);
    }
  }
}
