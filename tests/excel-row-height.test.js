const excelScript = await Deno.readTextFile(
  new URL("../js/excel-export.js", import.meta.url),
);

function assertIncludes(source, value, message) {
  if (!source.includes(value)) throw new Error(message);
}

Deno.test("estimates Excel row height from wrapped content", () => {
  const helperStart = excelScript.indexOf("function wrappedLineCount(");
  const helperEnd = excelScript.indexOf("function mergeValue(", helperStart);
  const helperSource = excelScript.slice(helperStart, helperEnd);
  assertIncludes(
    helperSource,
    "String(value).split(/\\r?\\n/)",
    "explicit line breaks must contribute to row height",
  );
  assertIncludes(
    helperSource,
    "Math.ceil(line.length / charactersPerLine)",
    "long text must be measured against its column width",
  );
  assertIncludes(
    helperSource,
    "Math.floor(Number(width || 8.43) * 1.2)",
    "wrap estimation must account for the smaller 9pt worksheet font",
  );
  assertIncludes(
    helperSource,
    "if (lines <= 1) return minimum;",
    "single-line rows must retain their original compact height",
  );
  assertIncludes(
    helperSource,
    "return Math.max(minimum, lines * lineHeight + padding);",
    "row height must retain a compact minimum and expand for wrapping",
  );
});

Deno.test("applies adaptive height across Excel data sheets", () => {
  const quotationStart = excelScript.indexOf("function addQuotationSheet(");
  const costingStart = excelScript.indexOf("function addCostingSheet(");
  const purchasingStart = excelScript.indexOf("function addPurchasingSheet(");
  const overviewStart = excelScript.indexOf("function addOverviewSheet(");
  const downloadStart = excelScript.indexOf("async function download(");
  const sections = [
    [
      excelScript.slice(quotationStart, costingStart),
      '["sku", "item", "unit"].includes(column.key)',
      "customer BOQ item rows",
    ],
    [
      excelScript.slice(costingStart, purchasingStart),
      '{ value: item.item, width: 34 }',
      "Costing item rows",
    ],
    [
      excelScript.slice(purchasingStart, overviewStart),
      '{ value: item.item, width: 52 }',
      "Purchasing item rows",
    ],
    [
      excelScript.slice(overviewStart, downloadStart),
      "value: category,",
      "Overview category rows",
    ],
  ];
  sections.forEach(([source, marker, label]) => {
    assertIncludes(source, marker, `${label} must measure wrapped content`);
    assertIncludes(
      source,
      "wrappedRowHeight(",
      `${label} must use adaptive row heights`,
    );
  });
  assertIncludes(
    excelScript,
    "row.height = wrappedRowHeight([{",
    "merged category rows must expand when their label wraps",
  );
});
