import {
  parseTablesFromHtml,
  cleanGrid,
  toCSV,
  toTSV,
  toMarkdown,
  toJSON,
  toExcelXML,
} from "./table_engine.mjs";

const SAMPLES = {
  rowspan: {
    title: "SaaS Pricing Matrix",
    html: `<table>
      <caption>SaaS Plan Comparison</caption>
      <thead>
        <tr><th rowspan="2">Category</th><th colspan="2">Annual Tiers</th></tr>
        <tr><th>Starter</th><th>Growth</th></tr>
      </thead>
      <tbody>
        <tr><td rowspan="2">Core Limits</td><td>5,000 rows</td><td>Unlimited rows</td></tr>
        <tr><td>CSV only</td><td>CSV, Markdown &amp; Excel</td></tr>
        <tr><td>Support</td><td>Community</td><td>Priority Email</td></tr>
      </tbody>
    </table>`,
  },
  finance: {
    title: "Quarterly Revenue",
    html: `<table>
      <caption>Q1–Q2 Revenue &amp; Variance</caption>
      <thead>
        <tr><th>Region</th><th>Gross Sales</th><th>Refunds</th><th>Net ARR</th></tr>
      </thead>
      <tbody>
        <tr><td>North America</td><td>$1,299.50</td><td>($120.50)</td><td>$14,800.00</td></tr>
        <tr><td>Europe (EU)</td><td>€42,000</td><td>(€450)</td><td>€41,550</td></tr>
        <tr><td>Asia Pacific</td><td>$8,420.25</td><td>$0.00</td><td>$8,420.25</td></tr>
      </tbody>
    </table>`,
  },
  aria: {
    title: "ARIA Metrics Grid",
    html: `<div role="grid" aria-label="Deployment Metrics">
      <div role="row">
        <div role="columnheader">Service</div>
        <div role="columnheader">Latency p95</div>
        <div role="columnheader">Uptime</div>
      </div>
      <div role="row">
        <div role="gridcell">Edge Parser</div>
        <div role="gridcell">4.2 ms</div>
        <div role="gridcell">99.99%</div>
      </div>
      <div role="row">
        <div role="gridcell">CSV Exporter</div>
        <div role="gridcell">1.8 ms</div>
        <div role="gridcell">100%</div>
      </div>
    </div>`,
  },
};

let currentTable = { title: "Sample", rows: [] };
let selectedCols = [];
let currentFmt = "csv";
const batchQueue = [];

const htmlInput = document.getElementById("htmlInput");
const cleanToggle = document.getElementById("cleanCurrencyToggle");
const gridMeta = document.getElementById("gridMeta");
const colPills = document.getElementById("colPills");
const tableWrap = document.getElementById("tableWrap");
const exportPreview = document.getElementById("exportPreview");
const actionStatus = document.getElementById("actionStatus");
const batchCount = document.getElementById("batchCount");
const proModal = document.getElementById("proModal");

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getCleanedRows() {
  return cleanGrid(currentTable.rows, {
    stripCurrency: cleanToggle.checked,
    selectedCols,
  });
}

function getFormattedPayload() {
  const rows = getCleanedRows();
  if (currentFmt === "csv") return { ext: "csv", mime: "text/csv;charset=utf-8", text: toCSV(rows, { bom: false }) };
  if (currentFmt === "tsv") return { ext: "tsv", mime: "text/tab-separated-values;charset=utf-8", text: toTSV(rows) };
  if (currentFmt === "md") return { ext: "md", mime: "text/markdown;charset=utf-8", text: toMarkdown(rows) };
  if (currentFmt === "json") return { ext: "json", mime: "application/json;charset=utf-8", text: toJSON(rows) };
  return { ext: "xml", mime: "application/xml;charset=utf-8", text: toExcelXML([{ name: currentTable.title || "Sheet1", rows }]) };
}

function renderColPills() {
  const headers = currentTable.rows[0] || [];
  colPills.innerHTML = headers
    .map((h, i) => {
      const on = selectedCols.includes(i) ? "on" : "";
      return `<button class="col-pill ${on}" data-col="${i}" type="button">${escHtml(h || `Col ${i + 1}`)}</button>`;
    })
    .join("");
}

function renderAll() {
  const rows = getCleanedRows();
  if (!rows.length) {
    gridMeta.textContent = "0 rows × 0 cols";
    tableWrap.innerHTML = `<div style="padding:16px;color:var(--muted)">No table rows parsed. Paste a &lt;table&gt; or ARIA grid and click Parse.</div>`;
    exportPreview.textContent = "";
    return;
  }
  gridMeta.textContent = `${rows.length} rows × ${rows[0].length} cols`;
  const head = rows[0].map((c) => `<th>${escHtml(c)}</th>`).join("");
  const body = rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${escHtml(c)}</td>`).join("")}</tr>`).join("");
  tableWrap.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  exportPreview.textContent = getFormattedPayload().text;
}

function loadHtml(html, sampleKey = null) {
  const parsed = parseTablesFromHtml(html);
  currentTable = parsed[0] || { title: "Empty", rows: [] };
  const colCount = currentTable.rows[0]?.length || 0;
  selectedCols = Array.from({ length: colCount }, (_, i) => i);
  if (sampleKey) {
    document.querySelectorAll(".sample-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.sample === sampleKey);
    });
  }
  renderColPills();
  renderAll();
}

document.getElementById("sampleList").addEventListener("click", (e) => {
  const btn = e.target.closest(".sample-btn");
  if (!btn) return;
  const key = btn.dataset.sample;
  htmlInput.value = SAMPLES[key].html;
  loadHtml(SAMPLES[key].html, key);
  actionStatus.textContent = `Loaded sample: ${SAMPLES[key].title}`;
});

document.getElementById("parseHtmlBtn").addEventListener("click", () => {
  loadHtml(htmlInput.value);
  actionStatus.textContent = currentTable.rows.length
    ? `Parsed ${currentTable.rows.length} rows`
    : "No valid table found in pasted HTML";
});

document.getElementById("clearHtmlBtn").addEventListener("click", () => {
  htmlInput.value = SAMPLES.rowspan.html;
  cleanToggle.checked = false;
  loadHtml(SAMPLES.rowspan.html, "rowspan");
  actionStatus.textContent = "Reset to SaaS Pricing Matrix";
});

colPills.addEventListener("click", (e) => {
  const pill = e.target.closest(".col-pill");
  if (!pill) return;
  const idx = Number(pill.dataset.col);
  if (selectedCols.includes(idx)) {
    if (selectedCols.length === 1) return; // keep at least 1 column
    selectedCols = selectedCols.filter((c) => c !== idx);
  } else {
    selectedCols = [...selectedCols, idx].sort((a, b) => a - b);
  }
  renderColPills();
  renderAll();
});

cleanToggle.addEventListener("change", () => {
  renderAll();
  actionStatus.textContent = cleanToggle.checked ? "Currency cleaning enabled" : "Raw cell text";
});

document.getElementById("formatTabs").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fmt]");
  if (!btn) return;
  currentFmt = btn.dataset.fmt;
  document.querySelectorAll("#formatTabs .btn").forEach((b) => b.classList.toggle("active", b === btn));
  renderAll();
});

document.getElementById("copyOutBtn").addEventListener("click", async () => {
  const { text } = getFormattedPayload();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    actionStatus.textContent = `Copied ${currentFmt.toUpperCase()} to clipboard`;
  } catch {
    actionStatus.textContent = `Prepared ${currentFmt.toUpperCase()} (${text.length} chars)`;
  }
});

document.getElementById("downloadOutBtn").addEventListener("click", () => {
  const { ext, mime, text } = getFormattedPayload();
  if (!text) return;
  const blob = new Blob([ext === "csv" ? "\uFEFF" + text : text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sheetsnap-export.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
  actionStatus.textContent = `Downloaded sheetsnap-export.${ext}`;
});

document.getElementById("addBatchBtn").addEventListener("click", () => {
  const rows = getCleanedRows();
  if (!rows.length) return;
  batchQueue.push({ name: `${currentTable.title || "Table"}-${batchQueue.length + 1}`, rows });
  batchCount.textContent = String(batchQueue.length);
  actionStatus.textContent = `Added to batch (${batchQueue.length} sheet${batchQueue.length > 1 ? "s" : ""})`;
});

document.getElementById("openProBtn").addEventListener("click", () => proModal.classList.add("open"));
document.getElementById("closeProBtn").addEventListener("click", () => proModal.classList.remove("open"));
document.getElementById("restoreProBtn").addEventListener("click", () => {
  actionStatus.textContent = "Local license check: Free tier active (no server account needed)";
  proModal.classList.remove("open");
});
document.getElementById("downloadBatchBtn").addEventListener("click", () => {
  const sheets = batchQueue.length ? batchQueue : [{ name: currentTable.title || "Sheet1", rows: getCleanedRows() }];
  const xml = toExcelXML(sheets);
  exportPreview.textContent = xml;
  actionStatus.textContent = `Generated ${sheets.length}-sheet Excel XML workbook`;
  proModal.classList.remove("open");
});

if (location.hash === "#pro") {
  proModal.classList.add("open");
}

htmlInput.value = SAMPLES.rowspan.html;
loadHtml(SAMPLES.rowspan.html, "rowspan");
