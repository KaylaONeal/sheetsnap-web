/**
 * SheetSnap Pure Client-Side Table Engine (ESM — Node 24 & Browser compatible, zero deps).
 * Handles standard HTML <table> (with full rowspan/colspan 2D expansion) and ARIA role=table/grid.
 */

const ENTITY_MAP = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeHtmlEntities(str) {
  return String(str)
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&([a-z]+);/gi, (full, name) => ENTITY_MAP[name.toLowerCase()] ?? full);
}

function stripTags(html) {
  return decodeHtmlEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function parseAttr(attrs, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = attrs.match(re);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}

function normalizeGridWidth(rows) {
  const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
  return rows.map((r) => {
    const out = r.slice();
    while (out.length < width) out.push("");
    return out;
  });
}

function expandHtmlTableBlock(tableInnerHtml) {
  const rowMatches = [...tableInnerHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const matrix = [];
  for (let rIdx = 0; rIdx < rowMatches.length; rIdx++) {
    if (!matrix[rIdx]) matrix[rIdx] = [];
    let cIdx = 0;
    const cellRe = /<(t[hd])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    for (const cm of rowMatches[rIdx][1].matchAll(cellRe)) {
      while (matrix[rIdx][cIdx] !== undefined) cIdx++;
      const attrs = cm[2] || "";
      const rowspan = Math.max(1, Math.min(50, parseInt(parseAttr(attrs, "rowspan") || "1", 10) || 1));
      const colspan = Math.max(1, Math.min(50, parseInt(parseAttr(attrs, "colspan") || "1", 10) || 1));
      const text = stripTags(cm[3] || "");

      for (let dr = 0; dr < rowspan; dr++) {
        if (!matrix[rIdx + dr]) matrix[rIdx + dr] = [];
        for (let dc = 0; dc < colspan; dc++) {
          // Put text in origin cell and repeat header/category value across spanned slots for tidy CSV/JSON analysis
          matrix[rIdx + dr][cIdx + dc] = text;
        }
      }
      cIdx += colspan;
    }
  }
  return normalizeGridWidth(matrix.map((r) => r.map((v) => v ?? "")));
}

function findMatchingTagClose(html, startPos, tagName) {
  const openRe = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  openRe.lastIndex = startPos;
  let depth = 0;
  let m;
  while ((m = openRe.exec(html))) {
    if (m[0].startsWith("</")) {
      depth--;
      if (depth === 0) return m.index + m[0].length;
    } else {
      depth++;
    }
  }
  return -1;
}

function extractAriaGridFromHtml(html) {
  const tables = [];
  const openRe = /<([a-z0-9-]+)\b([^>]*\brole\s*=\s*["']?(?:table|grid)["']?[^>]*)>/gi;
  let m;
  let idx = 1;
  while ((m = openRe.exec(html))) {
    const tag = m[1];
    const closeEnd = findMatchingTagClose(html, m.index, tag);
    if (closeEnd === -1) continue;
    const block = html.slice(m.index, closeEnd);
    const rows = [];
    const rowOpenRe = /<([a-z0-9-]+)\b([^>]*\brole\s*=\s*["']?row["']?[^>]*)>/gi;
    let rm;
    while ((rm = rowOpenRe.exec(block))) {
      const rEnd = findMatchingTagClose(block, rm.index, rm[1]);
      if (rEnd === -1) continue;
      const rBlock = block.slice(rm.index, rEnd);
      const cells = [];
      const cellOpenRe = /<([a-z0-9-]+)\b([^>]*\brole\s*=\s*["']?(?:columnheader|rowheader|gridcell|cell)["']?[^>]*)>/gi;
      let cm;
      while ((cm = cellOpenRe.exec(rBlock))) {
        const cEnd = findMatchingTagClose(rBlock, cm.index, cm[1]);
        if (cEnd === -1) continue;
        cells.push(stripTags(rBlock.slice(cm.index, cEnd)));
        cellOpenRe.lastIndex = cEnd;
      }
      if (cells.length) rows.push(cells);
      rowOpenRe.lastIndex = rEnd;
    }
    const norm = normalizeGridWidth(rows);
    if (norm.length > 0 && norm[0].length > 0) {
      tables.push({
        id: `aria-${idx++}`,
        kind: "aria-grid",
        title: `ARIA Grid (${norm.length}×${norm[0].length})`,
        rows: norm,
      });
    }
    openRe.lastIndex = closeEnd;
  }
  return tables;
}

/**
 * Pure string HTML parser (works in Node tests and pasted-HTML Studio mode).
 */
export function parseTablesFromHtml(html) {
  const src = String(html || "");
  const results = [];
  const openRe = /<table\b([^>]*)>/gi;
  let m;
  let idx = 1;
  while ((m = openRe.exec(src))) {
    const end = findMatchingTagClose(src, m.index, "table");
    if (end === -1) break;
    const full = src.slice(m.index, end);
    const capMatch = full.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i);
    const caption = capMatch ? stripTags(capMatch[1]) : "";
    const rows = expandHtmlTableBlock(full);
    if (rows.length > 0 && rows[0].length > 0) {
      results.push({
        id: `table-${idx++}`,
        kind: "html-table",
        title: caption || `HTML Table (${rows.length}×${rows[0].length})`,
        rows,
      });
    }
    openRe.lastIndex = end;
  }
  return results.concat(extractAriaGridFromHtml(src));
}

/**
 * Live browser DOM table extractor (for Chrome extension active tab & DOM nodes).
 */
export function extractTablesFromRoot(doc = document) {
  const results = [];
  let idx = 1;

  for (const table of doc.querySelectorAll("table")) {
    const matrix = [];
    const trs = table.querySelectorAll("tr");
    for (let rIdx = 0; rIdx < trs.length; rIdx++) {
      if (!matrix[rIdx]) matrix[rIdx] = [];
      let cIdx = 0;
      for (const cell of trs[rIdx].querySelectorAll(":scope > th, :scope > td")) {
        while (matrix[rIdx][cIdx] !== undefined) cIdx++;
        const rowspan = Math.max(1, Math.min(50, Number(cell.getAttribute("rowspan")) || 1));
        const colspan = Math.max(1, Math.min(50, Number(cell.getAttribute("colspan")) || 1));
        const text = (cell.innerText || cell.textContent || "").replace(/\s+/g, " ").trim();
        for (let dr = 0; dr < rowspan; dr++) {
          if (!matrix[rIdx + dr]) matrix[rIdx + dr] = [];
          for (let dc = 0; dc < colspan; dc++) {
            matrix[rIdx + dr][cIdx + dc] = text;
          }
        }
        cIdx += colspan;
      }
    }
    const rows = normalizeGridWidth(matrix.map((r) => r.map((v) => v ?? "")));
    if (rows.length > 0 && rows[0].length > 0) {
      const cap = table.querySelector("caption")?.innerText?.trim();
      results.push({
        id: `dom-table-${idx++}`,
        kind: "html-table",
        title: cap || `HTML Table (${rows.length}×${rows[0].length})`,
        rows,
      });
    }
  }

  for (const grid of doc.querySelectorAll('[role="table"], [role="grid"]')) {
    if (grid.closest("table")) continue;
    const rows = [];
    for (const r of grid.querySelectorAll('[role="row"]')) {
      const cells = [...r.querySelectorAll('[role="columnheader"], [role="rowheader"], [role="gridcell"], [role="cell"]')]
        .map((c) => (c.innerText || c.textContent || "").replace(/\s+/g, " ").trim());
      if (cells.length) rows.push(cells);
    }
    const norm = normalizeGridWidth(rows);
    if (norm.length > 0 && norm[0].length > 0) {
      results.push({
        id: `dom-aria-${idx++}`,
        kind: "aria-grid",
        title: grid.getAttribute("aria-label") || `ARIA Grid (${norm.length}×${norm[0].length})`,
        rows: norm,
      });
    }
  }

  return results;
}

/**
 * Clean currency/accounting strings like "$1,299.50", "€42,000", "($120.50)" into numeric strings.
 */
export function cleanNumericCell(val) {
  const s = String(val ?? "").trim();
  if (!s) return "";
  const negMatch = s.match(/^\(\s*([$€£¥₹]?\s*[\d,]+(?:\.\d+)?)\s*\)$/);
  if (negMatch) {
    return "-" + negMatch[1].replace(/[$€£¥₹,\s]/g, "");
  }
  const curMatch = s.match(/^(-?\s*[$€£¥₹]|[$€£¥₹]\s*-?)\s*([\d,]+(?:\.\d+)?)$/);
  if (curMatch) {
    const sign = curMatch[1].includes("-") ? "-" : "";
    return sign + curMatch[2].replace(/,/g, "");
  }
  if (/^-?[\d]{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) {
    return s.replace(/,/g, "");
  }
  return s;
}

export function cleanGrid(rows, options = {}) {
  const {
    trim = true,
    stripCurrency = false,
    dropEmptyRows = true,
    selectedCols = null,
  } = options;
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const norm = normalizeGridWidth(rows);
  const colIndices = Array.isArray(selectedCols) && selectedCols.length > 0
    ? selectedCols.filter((i) => i >= 0 && i < norm[0].length)
    : norm[0].map((_, i) => i);

  const out = [];
  for (let rIdx = 0; rIdx < norm.length; rIdx++) {
    const row = colIndices.map((cIdx) => {
      let val = String(norm[rIdx][cIdx] ?? "");
      if (trim) val = val.replace(/\s+/g, " ").trim();
      if (stripCurrency && rIdx > 0) val = cleanNumericCell(val);
      return val;
    });
    if (dropEmptyRows && row.every((c) => c === "")) continue;
    out.push(row);
  }
  return out;
}

export function toCSV(rows, { bom = false } = {}) {
  const esc = (cell) => {
    const s = String(cell ?? "");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  return (bom ? "\uFEFF" : "") + body;
}

export function toTSV(rows) {
  return rows
    .map((r) => r.map((c) => String(c ?? "").replace(/[\t\r\n]+/g, " ")).join("\t"))
    .join("\n");
}

export function toMarkdown(rows) {
  if (!rows || rows.length === 0) return "";
  const esc = (c) => String(c ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const header = `| ${rows[0].map(esc).join(" | ")} |`;
  const sep = `| ${rows[0].map(() => "---").join(" | ")} |`;
  const body = rows.slice(1).map((r) => `| ${r.map(esc).join(" | ")} |`);
  return [header, sep, ...body].join("\n");
}

export function toJSON(rows, { headerObjects = true } = {}) {
  if (!rows || rows.length === 0) return "[]";
  if (!headerObjects || rows.length === 1) return JSON.stringify(rows, null, 2);
  const headers = rows[0].map((h, i) => {
    const clean = String(h || "").trim();
    return clean || `col_${i + 1}`;
  });
  const objs = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = r[i] ?? "";
    });
    return obj;
  });
  return JSON.stringify(objs, null, 2);
}

function xmlEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generates valid SpreadsheetML 2003 XML (.xml) multi-sheet Excel workbook with typed Number/String cells.
 */
export function toExcelXML(sheets) {
  const list = Array.isArray(sheets) && sheets.length ? sheets : [{ name: "Sheet1", rows: [] }];
  const wsBlocks = list.map((sheet, idx) => {
    const safeName = xmlEscape((sheet.name || `Sheet${idx + 1}`).replace(/[\\/*?:\[\]]/g, "_").slice(0, 31));
    const rowXml = (sheet.rows || []).map((row, rIdx) => {
      const cells = row.map((val) => {
        const str = String(val ?? "");
        const isNum = rIdx > 0 && /^-?\d+(?:\.\d+)?$/.test(str);
        const type = isNum ? "Number" : "String";
        return `<Cell><Data ss:Type="${type}">${xmlEscape(str)}</Data></Cell>`;
      }).join("");
      return `<Row>${cells}</Row>`;
    }).join("\n");
    return `<Worksheet ss:Name="${safeName}"><Table>${rowXml}</Table></Worksheet>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${wsBlocks}
</Workbook>`;
}
