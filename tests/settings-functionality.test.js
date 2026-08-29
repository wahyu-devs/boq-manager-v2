const editorHtml = await Deno.readTextFile(
  new URL("../boq-editor.html", import.meta.url),
);
const editorScript = await Deno.readTextFile(
  new URL("../js/boq.js", import.meta.url),
);
const recordsScript = await Deno.readTextFile(
  new URL("../js/records.js", import.meta.url),
);
const dashboardScript = await Deno.readTextFile(
  new URL("../js/dashboard.js", import.meta.url),
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

Deno.test("applies tax settings across summaries and customer documents", () => {
  assertIncludes(
    editorHtml,
    "data-tax-summary-row",
    "the editor must expose tax rows in its financial summary",
  );
  assertIncludes(
    editorScript,
    "previewSummary.taxValue",
    "Customer Preview must render the calculated tax value",
  );
  assertIncludes(
    pdfScript,
    "summary.taxValue",
    "PDF must render the calculated tax value",
  );
  assertIncludes(
    wordScript,
    "summary.taxValue",
    "Word must render the calculated tax value",
  );
  assertIncludes(
    excelScript,
    "summary.taxValue",
    "Excel must render the calculated tax value",
  );
  [editorScript, pdfScript, wordScript, excelScript].forEach((source) => {
    assertIncludes(
      source,
      "taxRegistrationNumber",
      "customer outputs must include the configured tax registration number",
    );
  });
});

Deno.test("applies the date preference to UI and exported documents", () => {
  assertIncludes(
    recordsScript,
    "return formatDate(value);",
    "record tables must use the shared date formatter",
  );
  assertIncludes(
    dashboardScript,
    "formatDate(boq.updatedAt)",
    "the Dashboard must use the shared date formatter",
  );
  [editorScript, pdfScript, wordScript, excelScript].forEach((source) => {
    assertIncludes(
      source,
      "dateFormat",
      "every customer export path must honor the selected date format",
    );
  });
});

Deno.test("prefills Add Product with the commercial default margin", () => {
  assertIncludes(
    recordsScript,
    "form.elements.defaultMargin.value = Number(",
    "Add Product must initialize its margin field",
  );
  assertIncludes(
    recordsScript,
    "window.BOQStore.getSettings().defaultMargin || 0",
    "Add Product must use the saved commercial default margin",
  );
});
