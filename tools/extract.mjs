#!/usr/bin/env node
/**
 * Command-line PDF import.
 *
 *   node tools/extract.mjs [path/to/Silent Legions.pdf] [--out output] [--keeper <file>] [--pages-cache]
 *
 * Reads the PDF with the same parser that the Foundry "Import from PDF" menu uses
 * (module/import/sl-parser.mjs) and writes:
 * - <out>/silent-legions-data.json   the parsed book data (the Foundry importer reads this format too)
 * - <out>/keeper-sl-pack.json        an RPG Keeper content pack (Keeper: Import button)
 *
 * --keeper <file>  also copies the pack to <file>, for example a folder outside the Keeper repo.
 * --pages-cache    stores the raw pdf.js text in <out>/pages.json and reuses it on the next run.
 *
 * Both files hold book text: keep them out of public repositories.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPages } from "../module/import/pdf-extract.mjs";
import { parseBook } from "../module/import/sl-parser.mjs";
import { toKeeperPack } from "../module/import/keeper-pack.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = { pdf: null, out: path.join(root, "output"), keeper: null, cache: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = path.resolve(argv[++i]);
    else if (a === "--keeper") args.keeper = path.resolve(argv[++i]);
    else if (a === "--pages-cache") args.cache = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else args.pdf = path.resolve(a);
  }
  args.pdf ??= path.join(root, "Silent Legions.pdf");
  return args;
}

async function loadPages(args) {
  const cacheFile = path.join(args.out, "pages.json");
  if (args.cache && fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  if (!fs.existsSync(args.pdf)) throw new Error(`PDF not found: ${args.pdf}`);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(args.pdf));
  const pages = await extractPages(pdfjs, data, {
    onProgress: (n, total) => { if (process.stderr.isTTY) process.stderr.write(`\rReading page ${n}/${total}`); }
  });
  if (process.stderr.isTTY) process.stderr.write("\n");
  if (args.cache) fs.writeFileSync(cacheFile, JSON.stringify(pages));
  return pages;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
    return;
  }
  fs.mkdirSync(args.out, { recursive: true });
  const pages = await loadPages(args);
  const data = parseBook(pages);
  const pack = toKeeperPack(data);
  const dataFile = path.join(args.out, "silent-legions-data.json");
  const packFile = path.join(args.out, "keeper-sl-pack.json");
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 1));
  fs.writeFileSync(packFile, JSON.stringify(pack, null, 1));
  if (args.keeper) fs.copyFileSync(packFile, args.keeper);
  console.log(`Wrote ${path.relative(process.cwd(), dataFile)} and ${path.relative(process.cwd(), packFile)}`);
  for (const [key, n] of Object.entries(data.counts)) console.log(`  ${key}: ${n}`);
  for (const w of data.warnings) console.warn(`  warning: ${w}`);
}

main().catch(err => { console.error(err.message); process.exitCode = 1; });
