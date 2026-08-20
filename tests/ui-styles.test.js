const utilitiesCss = await Deno.readTextFile(
  new URL("../css/utilities.css", import.meta.url),
);
const componentsCss = await Deno.readTextFile(
  new URL("../css/components.css", import.meta.url),
);
const variablesCss = await Deno.readTextFile(
  new URL("../css/variables.css", import.meta.url),
);
const layoutCss = await Deno.readTextFile(
  new URL("../css/layout.css", import.meta.url),
);
const editorHtml = await Deno.readTextFile(
  new URL("../boq-editor.html", import.meta.url),
);
const productsHtml = await Deno.readTextFile(
  new URL("../products.html", import.meta.url),
);
const boqSource = await Deno.readTextFile(
  new URL("../js/boq.js", import.meta.url),
);
const modalSource = await Deno.readTextFile(
  new URL("../js/modal.js", import.meta.url),
);

function assertIncludes(source, value, message) {
  if (!source.includes(value)) throw new Error(message);
}

Deno.test("keeps desktop badges vertically centered", () => {
  assertIncludes(
    utilitiesCss,
    ".badge.desktop-only {\n  display: inline-flex;\n}",
    "desktop visibility must preserve the badge flex alignment",
  );
});

Deno.test("uses the application icon as favicon on every page", async () => {
  const pages = [
    "index.html",
    "boqs.html",
    "boq-editor.html",
    "products.html",
    "customers.html",
    "settings.html",
  ];
  for (const page of pages) {
    const source = await Deno.readTextFile(new URL(`../${page}`, import.meta.url));
    assertIncludes(
      source,
      '<link rel="icon" type="image/png" sizes="512x512" href="assets/icon.png">',
      `${page} must use assets/icon.png as its favicon`,
    );
  }
});

Deno.test("shows an icon on every Create Revision action", () => {
  const revisionIcon = '<path d="M15 12v6M12 15h6" />';
  const iconCount = editorHtml.split(revisionIcon).length - 1;
  if (iconCount !== 2) {
    throw new Error(`expected 2 Create Revision icons, received ${iconCount}`);
  }
});

Deno.test("uses formatted monetary inputs in the product form", () => {
  const inputCount = productsHtml.split("data-product-number-input").length - 1;
  if (inputCount !== 2) {
    throw new Error(`expected 2 formatted product inputs, received ${inputCount}`);
  }
});

Deno.test("keeps Revision History open behind revision previews", () => {
  const previewStart = boqSource.indexOf(
    'const previewRevision = event.target.closest("[data-preview-revision]")',
  );
  const previewEnd = boqSource.indexOf(
    'const revisionExcel = event.target.closest("[data-download-revision-excel]")',
    previewStart,
  );
  const previewHandler = boqSource.slice(previewStart, previewEnd);
  assertIncludes(
    previewHandler,
    'window.BOQModal.open("pdf-modal")',
    "revision preview must open the PDF modal",
  );
  if (previewHandler.includes('BOQModal.close')) {
    throw new Error("revision preview must not close Revision History");
  }
  assertIncludes(
    modalSource,
    "const modalStack = [];",
    "nested previews require stacked modal state",
  );
});

Deno.test("shows a Grand Total for every revision history entry", () => {
  assertIncludes(
    boqSource,
    '<div class="revision-entry-total"><strong>${grandTotal}</strong>',
    "revision history must render its snapshot total",
  );
  assertIncludes(
    componentsCss,
    ".revision-entry-total {",
    "revision total must use the revision history layout",
  );
});

Deno.test("shows the snapshot project on every revision history entry", () => {
  assertIncludes(
    boqSource,
    '<div class="revision-entry-project"><strong>${escapeHtml(revisionProject)}</strong>',
    "revision history must render its snapshot project",
  );
  assertIncludes(
    componentsCss,
    ".revision-entry-project {",
    "revision project must use the revision history layout",
  );
});

Deno.test("keeps revision card metadata concise", () => {
  const historyStart = boqSource.indexOf("function renderRevisionHistory()");
  const historyEnd = boqSource.indexOf(
    "function comparisonItemKey",
    historyStart,
  );
  const historySource = boqSource.slice(historyStart, historyEnd);
  if (historySource.includes(">Issued ${escapeHtml(revisionDate")) {
    throw new Error("revision date must not repeat the Issued badge");
  }
  if (historySource.includes(">Grand Total</span>") ||
      historySource.includes(">Project</span>")) {
    throw new Error("revision values must not repeat visible field labels");
  }
});

Deno.test("uses soft canvas contrast in the dark theme", () => {
  assertIncludes(
    variablesCss,
    "--color-bg: #181f26;",
    "dark workspace must use the softened canvas color",
  );
  assertIncludes(
    variablesCss,
    "--color-surface: #202830;",
    "dark surfaces must remain distinct from the canvas",
  );
  assertIncludes(
    variablesCss,
    "--color-sidebar: #12181e;",
    "dark sidebar must remain distinct without appearing black",
  );
  assertIncludes(
    layoutCss,
    "border-right: 1px solid var(--color-sidebar-border);",
    "sidebar must retain a subtle divider",
  );
});
