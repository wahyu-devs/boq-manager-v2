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
const componentsCss = await Deno.readTextFile(
  new URL("../css/components.css", import.meta.url),
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

Deno.test("updates the active Settings section navigation", () => {
  assertIncludes(
    settingsScript,
    'link.addEventListener("click", () => setActiveSection(link.hash.slice(1)))',
    "clicking a Settings section must move the active navigation state",
  );
  assertIncludes(
    settingsScript,
    'link.setAttribute("aria-current", "true");',
    "the active Settings link must expose its current state",
  );
  assertIncludes(
    settingsScript,
    'window.addEventListener("scroll", scheduleSectionNavigationUpdate, {',
    "manual scrolling must keep the Settings navigation synchronized",
  );
  assertIncludes(
    settingsScript,
    "const initialSectionId = location.hash.slice(1);",
    "direct Settings section links must initialize the correct active state",
  );
});

Deno.test("omits the unused compact table preference", () => {
  if (settingsHtml.includes("Compact tables") ||
      settingsHtml.includes('name="compactTables"') ||
      settingsScript.includes("compactTables")) {
    throw new Error("Settings must not expose or default an unused table mode");
  }
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
  assertIncludes(
    downloadSource,
    "addPurchasingSheet(workbook, data, purchasingSheet, logo)",
    "the internal Purchasing sheet must be generated independently of customer pricing",
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

Deno.test("styles Grand Total consistently across customer outputs", () => {
  assertIncludes(
    editorScript,
    '<div class="pdf-preview-total"><span>Grand Total</span>',
    "Customer Preview must use a title-case Grand Total label",
  );
  [
    "border-top: 1px solid #dce2e8;",
    "border-bottom: 1px solid #dce2e8;",
    "font-size: 13px;",
    "text-align: center;",
    "font-size: inherit;",
  ].forEach((rule) =>
    assertIncludes(
      componentsCss,
      rule,
      `Customer Preview Grand Total is missing ${rule}`,
    )
  );
  const previewTotalStart = componentsCss.indexOf(".pdf-preview-total {");
  const previewTotalEnd = componentsCss.indexOf("}", previewTotalStart);
  const previewTotalSource = componentsCss.slice(
    previewTotalStart,
    previewTotalEnd,
  );
  assertIncludes(
    previewTotalSource,
    "padding: 6px 0;",
    "Customer Preview Grand Total height must follow its content and padding",
  );
  if (previewTotalSource.includes("height:")) {
    throw new Error("Customer Preview Grand Total must not set a fixed height");
  }
  assertIncludes(
    pdfScript,
    'doc.text("Grand Total", totalX + labelWidth / 2, y + 5.8, {',
    "PDF must center the title-case Grand Total label",
  );
  assertIncludes(
    pdfScript,
    "doc.line(totalX, y, totalX + totalWidth, y);",
    "PDF Grand Total must have a top border",
  );
  assertIncludes(
    pdfScript,
    "y + totalHeight,\n        totalX + totalWidth,\n        y + totalHeight,",
    "PDF Grand Total must have a bottom border",
  );
  const pdfTotalStart = pdfScript.indexOf("function drawSummary(");
  const pdfTotalEnd = pdfScript.indexOf("const notes =", pdfTotalStart);
  const pdfTotalSource = pdfScript.slice(pdfTotalStart, pdfTotalEnd);
  if ((pdfTotalSource.match(/setFontSize\(10\.25\)/g) || []).length !== 1) {
    throw new Error("PDF Grand Total label and amount must share one font size");
  }
  assertIncludes(
    wordScript,
    'textCell("Grand Total", {',
    "Word must use a title-case Grand Total label",
  );
  assertIncludes(
    wordScript,
    "alignment: window.docx.AlignmentType.CENTER,\n        borders: horizontalBorders(),",
    "Word must center and border the Grand Total label",
  );
  const wordTotalStart = wordScript.indexOf("function grandTotalRow(");
  const wordTotalEnd = wordScript.indexOf(
    "function grandTotalSpacerRow(",
    wordTotalStart,
  );
  const wordTotalSource = wordScript.slice(wordTotalStart, wordTotalEnd);
  const wordSizeCount = (wordTotalSource.match(/size: 20,/g) || []).length;
  const wordBorderCount = (
    wordTotalSource.match(/borders: horizontalBorders\(\),/g) || []
  ).length;
  if (wordSizeCount !== 2 || wordBorderCount !== 2) {
    throw new Error("Word Grand Total cells must share font size and borders");
  }
  assertIncludes(
    excelScript,
    '"Grand Total",\n        {',
    "Excel must use a title-case Grand Total label",
  );
  assertIncludes(
    excelScript,
    'align: "center",\n          size: 11,\n          border: thinHorizontalBorder(),',
    "Excel must center and border the Grand Total label",
  );
  const excelTotalStart = excelScript.indexOf("if (display.showPricing) {");
  const excelTotalEnd = excelScript.indexOf(
    "if (data.document.notes)",
    excelTotalStart,
  );
  const excelTotalSource = excelScript.slice(excelTotalStart, excelTotalEnd);
  const excelSizeCount = (excelTotalSource.match(/size: 11,/g) || []).length;
  const excelBorderCount = (
    excelTotalSource.match(/border: thinHorizontalBorder\(\),/g) || []
  ).length;
  if (excelSizeCount !== 2 || excelBorderCount !== 2) {
    throw new Error("Excel Grand Total cells must share font size and borders");
  }
});
