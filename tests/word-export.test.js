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

Deno.test("keeps the Word grand total inside the BOQ items table", () => {
  assertIncludes(
    wordExportScript,
    "rows.push(grandTotalRow(data, columns, columnWidths));",
    "the BOQ table appends its grand total row",
  );
  if (wordExportScript.includes("grandTotalTable(data)")) {
    throw new Error("the grand total must not be rendered as a separate table");
  }
});
