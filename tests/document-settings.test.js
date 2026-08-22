const settingsHtml = await Deno.readTextFile(
  new URL("../settings.html", import.meta.url),
);
const settingsScript = await Deno.readTextFile(
  new URL("../js/settings.js", import.meta.url),
);
const editorScript = await Deno.readTextFile(
  new URL("../js/boq.js", import.meta.url),
);
const pdfScript = await Deno.readTextFile(
  new URL("../js/pdf-export.js", import.meta.url),
);
const wordScript = await Deno.readTextFile(
  new URL("../js/word-export.js", import.meta.url),
);
const excelScript = await Deno.readTextFile(
  new URL("../js/excel-export.js", import.meta.url),
);

function assertIncludes(source, value, message) {
  if (!source.includes(value)) throw new Error(message);
}

Deno.test("provides a Show pricing document setting", () => {
  assertIncludes(
    settingsHtml,
    'name="showPricing"',
    "Settings must expose the Show pricing toggle",
  );
  assertIncludes(
    settingsScript,
    "showPricing: true,",
    "existing users must keep pricing visible by default",
  );
  assertIncludes(
    settingsScript,
    "unitPricing.disabled = !showPricing;",
    "unit pricing must be disabled while all pricing is hidden",
  );
});

Deno.test("uses current visibility settings for issued revisions only", () => {
  const helperStart = editorScript.indexOf(
    "function currentDocumentVisibilitySettings()",
  );
  const helperEnd = editorScript.indexOf("function localDate", helperStart);
  const helper = editorScript.slice(helperStart, helperEnd);
  assertIncludes(helper, "showPricing:", "current pricing visibility is required");
  assertIncludes(helper, "showSku:", "current part number visibility is required");
  assertIncludes(
    helper,
    "showUnitPricing:",
    "current unit pricing visibility is required",
  );
  if (helper.includes("footerText")) {
    throw new Error("issued revision footer text must remain snapshotted");
  }
  assertIncludes(
    editorScript,
    "...currentDocumentVisibilitySettings(),",
    "revision exports must apply current visibility settings last",
  );
});

Deno.test("hides customer pricing consistently across every output", () => {
  assertIncludes(
    editorScript,
    'showPricing ? "" : "without-pricing"',
    "Customer Preview must switch to the non-pricing layout",
  );
  assertIncludes(
    pdfScript,
    "if (showPricing) {",
    "PDF must conditionally render its Grand Total",
  );
  assertIncludes(
    wordScript,
    "if (customerDocument.visibility(data.settings).showPricing) {",
    "Word must conditionally render its Grand Total",
  );
  assertIncludes(
    excelScript,
    "if (display.showPricing) {",
    "Excel must conditionally render its Grand Total",
  );
});

Deno.test("keeps internal Excel sheets independent from customer pricing", () => {
  const downloadStart = excelScript.indexOf("async function download(");
  const downloadSource = excelScript.slice(downloadStart);
  assertIncludes(
    downloadSource,
    "addCostingSheet(workbook, data, costingSheet)",
    "the internal Costing sheet must still be generated",
  );
  assertIncludes(
    downloadSource,
    "addOverviewSheet(workbook, data, costing, overviewSheet, logo)",
    "the internal Overview sheet must still be generated",
  );
});

Deno.test("balances the Excel BOQ header when pricing columns are hidden", () => {
  assertIncludes(
    excelScript,
    "const splitColumn = Math.max(2, columnCount - 2);",
    "four-column BOQ sheets must reserve two columns for the document header",
  );
  assertIncludes(
    excelScript,
    "window.BOQExcelExport = { download, quotationColumns };",
    "Excel layout profiles must remain independently testable",
  );
});
