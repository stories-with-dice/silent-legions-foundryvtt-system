/**
 * Read the text of a PDF with pdf.js and return plain page objects.
 *
 * This file has no Foundry or Node dependencies. The caller passes the pdf.js
 * library: Foundry's bundled copy in the browser (module/apps/import-app.mjs),
 * or the `pdfjs-dist` package in Node (tools/extract.mjs).
 *
 * Output: [{ num, width, height, items: [{ s, x, y, h, w, font }] }]
 * - `s` is the text, `x`/`y` the baseline origin in PDF points (y grows upward),
 *   `h` the font size, `w` the width.
 * - `font` is a short style tag made from the embedded font name, so the parser
 *   can find headings: "heading" (Trajan Bold), "label" (Trajan Regular),
 *   "bold", "italic", "bolditalic", or "body".
 */

/** Map an embedded font name such as "ABCDEF+ArnoPro-BoldItalic" to a style tag. */
export function fontStyle(name = "") {
  const n = name.replace(/^[A-Z]{6}\+/, "").toLowerCase();
  if (n.includes("trajan")) return n.includes("bold") ? "heading" : "label";
  if (n.includes("bolditalic")) return "bolditalic";
  if (n.includes("bold") || n.includes("semibold")) return "bold";
  if (n.includes("italic")) return "italic";
  return "body";
}

/**
 * @param {object} pdfjs                  The pdf.js library namespace.
 * @param {Uint8Array|ArrayBuffer} data   The PDF bytes.
 * @param {object} [options]
 * @param {(done:number, total:number) => void} [options.onProgress]
 * @param {object} [options.documentOptions]  Extra options for pdfjs.getDocument().
 * @returns {Promise<object[]>}
 */
export async function extractPages(pdfjs, data, { onProgress, documentOptions = {} } = {}) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, ...documentOptions }).promise;
  const pages = [];
  try {
    for (let num = 1; num <= doc.numPages; num++) {
      const page = await doc.getPage(num);
      const content = await page.getTextContent();
      // The operator list loads the fonts, so commonObjs knows their real names.
      await page.getOperatorList();
      const fonts = new Map();
      const styleOf = id => {
        if (!fonts.has(id)) {
          let name = "";
          try { name = page.commonObjs.get(id)?.name ?? ""; } catch { /* font not loaded */ }
          fonts.set(id, fontStyle(name));
        }
        return fonts.get(id);
      };
      const [, , width, height] = page.view;
      const items = [];
      for (const it of content.items) {
        if (!it.str || !it.str.trim()) continue;
        items.push({
          s: it.str,
          x: Math.round(it.transform[4] * 10) / 10,
          y: Math.round(it.transform[5] * 10) / 10,
          h: Math.round(Math.abs(it.transform[3]) * 10) / 10,
          w: Math.round(it.width * 10) / 10,
          font: styleOf(it.fontName)
        });
      }
      pages.push({ num, width, height, items });
      page.cleanup();
      onProgress?.(num, doc.numPages);
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}
