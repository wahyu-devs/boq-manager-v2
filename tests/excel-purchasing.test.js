const editorHtml = await Deno.readTextFile(
  new URL("../boq-editor.html", import.meta.url),
);
const editorScript = await Deno.readTextFile(
  new URL("../js/boq.js", import.meta.url),
);
const excelScript = await Deno.readTextFile(
  new URL("../js/excel-export.js", import.meta.url),
);

function assertIncludes(source, value, message) {
  if (!source.includes(value)) throw new Error(message);
}

Deno.test("adds Purchasing only to the estimation workbook", () => {
  const downloadStart = excelScript.indexOf("async function download(");
  const downloadSource = excelScript.slice(downloadStart);
  assertIncludes(
    downloadSource,
    'const purchasingSheet = workbook.addWorksheet("Purchasing");',
    "the estimation workbook must create a Purchasing sheet",
  );
  assertIncludes(
    downloadSource,
    "addPurchasingSheet(workbook, data, purchasingSheet, logo);",
    "the estimation workbook must populate the Purchasing sheet",
  );
  const workbookSheets = ["Overview", "BOQ", "Costing", "Purchasing"];
  let previousIndex = -1;
  workbookSheets.forEach((name) => {
    const index = downloadSource.indexOf(`workbook.addWorksheet("${name}")`);
    if (index <= previousIndex) {
      throw new Error("estimation workbook sheet order must be preserved");
    }
    previousIndex = index;
  });
  const modeCount = (editorHtml.match(/data-excel-mode=/g) || []).length;
  if (modeCount !== 2) {
    throw new Error("Purchasing must not add another Excel download mode");
  }
});

Deno.test("keeps the Purchasing sheet price-free", () => {
  const sheetStart = excelScript.indexOf("function addPurchasingSheet(");
  const sheetEnd = excelScript.indexOf(
    "function addOverviewSheet(",
    sheetStart,
  );
  const sheetSource = excelScript.slice(sheetStart, sheetEnd);
  [
    '"No"',
    '"Part Number"',
    '"Item"',
    '"Qty"',
    '"Unit"',
    '"Remarks"',
    '"CUSTOMER PO"',
    '"DATE"',
  ].forEach((value) =>
    assertIncludes(
      sheetSource,
      value,
      `Purchasing sheet is missing ${value}`,
    )
  );
  [
    "Unit COGS",
    "Margin %",
    "Unit Selling",
    "Total COGS",
    "Total Selling",
    "Grand Total",
    "Commission",
  ].forEach((value) => {
    if (sheetSource.includes(value)) {
      throw new Error(`Purchasing sheet must not expose ${value}`);
    }
  });
  if (sheetSource.includes('"Category"') ||
      sheetSource.includes('"WON DATE"') ||
      sheetSource.includes('"PO DATE"')) {
    throw new Error(
      "Purchasing must use category rows and the concise Date label",
    );
  }
  assertIncludes(
    sheetSource,
    '["E6:F6", "E7:F8", "CUSTOMER", data.document.customerName || "-"],',
    "Customer must remain in the original metadata row",
  );
  assertIncludes(
    sheetSource,
    'setCell(sheet.getCell("G6"), "DATE", {',
    "Date must remain in the original right-side metadata block",
  );
  assertIncludes(
    sheetSource,
    "sheet.mergeCells(headerRow, 3, headerRow, 4);",
    "the Item header must span two physical columns",
  );
  assertIncludes(
    sheetSource,
    "sheet.mergeCells(rowNumber, 3, rowNumber, 4);",
    "each Item value must span the matching physical columns",
  );
  assertIncludes(
    sheetSource,
    'align: index === 0 || index === 5\n              ? "center"',
    "Purchasing row numbers and units must be centered",
  );
});

Deno.test("excludes Services while preserving purchasing item order", () => {
  const filterStart = excelScript.indexOf("function purchasingExportData(");
  const filterEnd = excelScript.indexOf("function currencyFormat(", filterStart);
  const filterSource = excelScript.slice(filterStart, filterEnd);
  assertIncludes(
    filterSource,
    'normalizeCategory(itemCategory(item)) !== "services"',
    "Services items must be excluded case-insensitively",
  );
  assertIncludes(
    filterSource,
    'normalizeCategory(category) !== "services"',
    "the Services category must be excluded",
  );
  const sheetStart = excelScript.indexOf("function addPurchasingSheet(");
  const sheetEnd = excelScript.indexOf(
    "function addOverviewSheet(",
    sheetStart,
  );
  const sheetSource = excelScript.slice(sheetStart, sheetEnd);
  assertIncludes(
    sheetSource,
    "purchasing.categories.forEach((category) => {",
    "Purchasing categories must use the established BOQ order",
  );
  assertIncludes(
    sheetSource,
    "purchasing.items.filter((item) =>",
    "items must retain their order within each category",
  );
});

Deno.test("passes Won metadata into internal Excel exports", () => {
  const customerPoCount = (
    editorScript.match(
      /customerPoNumber: currentRecord\?\.customerPoNumber \|\| "",/g,
    ) || []
  ).length;
  const wonAtCount = (
    editorScript.match(/wonAt: currentRecord\?\.wonAt \|\| "",/g) || []
  ).length;
  if (customerPoCount !== 2 || wonAtCount !== 2) {
    throw new Error(
      "current and revision exports must receive parent-level Won metadata",
    );
  }
});
