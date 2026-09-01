const editorHtml = await Deno.readTextFile(
  new URL("../boq-editor.html", import.meta.url),
);
const exportScript = await Deno.readTextFile(
  new URL("../js/export.js", import.meta.url),
);
const editorScript = await Deno.readTextFile(
  new URL("../js/boq.js", import.meta.url),
);
const recordsScript = await Deno.readTextFile(
  new URL("../js/records.js", import.meta.url),
);
const wordExportScript = await Deno.readTextFile(
  new URL("../js/word-export.js", import.meta.url),
);

function assertIncludes(source, value, message) {
  if (!source.includes(value)) throw new Error(message);
}

Deno.test("wires Word export across BOQ workflows", () => {
  assertIncludes(
    exportScript,
    "docx@9.7.1/dist/index.iife.js",
    "pinned Word library is loaded on demand",
  );
  assertIncludes(
    editorHtml,
    'src="js/word-export.js"',
    "Word generator is loaded",
  );
  assertIncludes(
    editorHtml,
    "data-download-word",
    "BOQ editor exposes Word download actions",
  );
  assertIncludes(
    exportScript,
    "window.BOQWordExport.download",
    "download orchestration calls the Word generator",
  );
  assertIncludes(
    exportScript,
    'requestedExport === "word"',
    "BOQ Register deep link supports Word export",
  );
  assertIncludes(
    editorScript,
    "data-download-revision-word",
    "revision history supports Word export",
  );
  assertIncludes(
    recordsScript,
    "export=word",
    "BOQ Register exposes Word export",
  );
});

Deno.test("offers Word PDF and primary Excel in Document Preview", () => {
  const modalStart = editorHtml.indexOf('id="pdf-modal"');
  const modalEnd = editorHtml.indexOf("</section>", modalStart);
  const previewModal = editorHtml.slice(modalStart, modalEnd);
  assertIncludes(
    previewModal,
    "Document Preview",
    "the customer document modal must use its format-neutral title",
  );
  const wordAction = previewModal.indexOf("data-download-word");
  const pdfAction = previewModal.indexOf("data-download-pdf");
  const excelAction = previewModal.indexOf("data-download-preview-excel");
  if (wordAction < 0 || pdfAction <= wordAction || excelAction <= pdfAction) {
    throw new Error("Document Preview actions must be ordered Word, PDF, Excel");
  }
  assertIncludes(
    previewModal,
    'class="button button-primary"\n              type="button"\n              data-download-preview-excel',
    "Excel must be the primary Document Preview action",
  );
  assertIncludes(
    exportScript,
    'void exportExcel(\n        "selling",\n        previewExcelButton.dataset.exportRevision,',
    "Document Preview must download the customer Excel workbook for the active revision",
  );
  assertIncludes(
    editorScript,
    "#pdf-modal [data-download-preview-excel]",
    "revision previews must target the matching Excel revision",
  );
});

Deno.test("keeps the Word grand total inside the BOQ items table", () => {
  assertIncludes(
    wordExportScript,
    "if (customerDocument.visibility(data.settings).showPricing) {",
    "the Word grand total must respect Show pricing",
  );
  assertIncludes(
    wordExportScript,
    "rows.push(grandTotalSpacerRow(columns));",
    "the BOQ table keeps an internal spacer before its grand total",
  );
  assertIncludes(
    wordExportScript,
    "rows.push(grandTotalRow(data, columns, columnWidths));",
    "the BOQ table appends its grand total row",
  );
  if (wordExportScript.includes("grandTotalTable(data)")) {
    throw new Error("the grand total must not be rendered as a separate table");
  }
});

Deno.test("spaces the divider below company contact details", () => {
  assertIncludes(
    wordExportScript,
    "header,\n      spacer(2.2),\n      divider(),",
    "the company contact details have spacing before the divider",
  );
});
