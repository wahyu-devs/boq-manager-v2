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
const responsiveCss = await Deno.readTextFile(
  new URL("../css/responsive.css", import.meta.url),
);
const dashboardHtml = await Deno.readTextFile(
  new URL("../index.html", import.meta.url),
);
const dashboardSource = await Deno.readTextFile(
  new URL("../js/dashboard.js", import.meta.url),
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
const appSource = await Deno.readTextFile(
  new URL("../js/app.js", import.meta.url),
);
const modalSource = await Deno.readTextFile(
  new URL("../js/modal.js", import.meta.url),
);
const navigationSource = await Deno.readTextFile(
  new URL("../js/navigation.js", import.meta.url),
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

Deno.test("opens constrained row menus above their trigger", () => {
  assertIncludes(
    appSource,
    "function positionDropdownMenu(trigger, menu) {",
    "dropdowns must calculate their opening direction",
  );
  assertIncludes(
    appSource,
    'menu.closest(".table-wrap")?.getBoundingClientRect()',
    "row menus must use the internal table viewport as their clipping boundary",
  );
  assertIncludes(
    appSource,
    "if (menuHeight > spaceBelow && spaceAbove > spaceBelow) {",
    "menus must flip only when they do not fit below and have more room above",
  );
  assertIncludes(
    appSource,
    'menu.classList.add("dropdown-menu-up");',
    "the upward placement class must be applied after measurement",
  );
  assertIncludes(
    appSource,
    "if (willOpen) {\n        positionDropdownMenu(menuTrigger, menu);",
    "menu placement must run after the menu becomes visible",
  );
  assertIncludes(
    componentsCss,
    ".dropdown-menu.dropdown-menu-up {\n  top: auto;\n  bottom: calc(100% + 6px);\n}",
    "upward menus must anchor above their trigger",
  );
});

Deno.test("keeps register search placeholders readable", () => {
  assertIncludes(
    componentsCss,
    "width: min(360px, 100%);\n  min-width: min(360px, 100%);",
    "BOQ, product, and customer searches must be wide enough for their placeholders",
  );
  assertIncludes(
    responsiveCss,
    ".toolbar-group,\n  .search-field {\n    width: 100%;",
    "search fields must still fill the toolbar on tablet and mobile",
  );
});

Deno.test("centers the company logo file picker", () => {
  assertIncludes(
    componentsCss,
    '.settings-logo-upload input[type="file"] {\n  padding: 3px 8px;\n  line-height: 24px;',
    "the logo file input must vertically center its content",
  );
  assertIncludes(
    componentsCss,
    '.settings-logo-upload input[type="file"]::file-selector-button {\n  box-sizing: border-box;\n  height: 24px;',
    "the native Choose File button must fit the compact input height",
  );
});

Deno.test("contains tablet layouts and balances mobile editor controls", () => {
  assertIncludes(
    responsiveCss,
    "html,\n  body {\n    overflow-x: clip;\n  }",
    "tablet viewports must not pan with internal table overflow",
  );
  assertIncludes(
    responsiveCss,
    ".responsive-table {\n    overflow: hidden;\n  }",
    "tablet pages must contain internal table overflow",
  );
  assertIncludes(
    responsiveCss,
    ".editor-view-controls [data-toggle-reorder] {\n    grid-column: 1 / -1;\n  }",
    "the mobile reorder control must span the toolbar width",
  );
  assertIncludes(
    responsiveCss,
    ".record-card-grid,\n  .mobile-item-body {\n    grid-template-columns: 1fr;\n  }",
    "BOQ item fields must collapse only at the narrowest breakpoint",
  );
  assertIncludes(
    responsiveCss,
    ".modal-footer {\n    position: sticky;",
    "mobile modal actions must remain available while forms scroll",
  );
});

Deno.test("keeps Settings anchor targets below the sticky topbar", () => {
  assertIncludes(
    componentsCss,
    ".settings-section {\n  scroll-margin-top: calc(var(--header-height) + 18px);\n}",
    "Settings sections need a scroll offset for the sticky application header",
  );
});

Deno.test("top-aligns form controls beside fields with supporting text", () => {
  assertIncludes(
    componentsCss,
    ".field {\n  display: grid;\n  align-content: start;",
    "grid fields must not stretch controls when an adjacent field has a hint",
  );
});

Deno.test("labels the compact New BOQ action", () => {
  assertIncludes(
    navigationSource,
    'href="boq-editor.html" aria-label="Create new BOQ"',
    "the icon-only mobile action must retain an accessible name",
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

Deno.test("exposes the Issued to Won editor workflow", () => {
  const markWonCount = editorHtml.split(
    "data-mark-won",
  ).length - 1;
  if (markWonCount !== 2) {
    throw new Error(`expected 2 Mark as Won actions, received ${markWonCount}`);
  }
  const issuedStatusIconCount = editorHtml.split(
    '<path d="m8.5 12 2.25 2.25L15.75 9" />',
  ).length - 1;
  if (issuedStatusIconCount !== 4) {
    throw new Error(
      "Mark as Issued and Mark as Won must share the same icon",
    );
  }
  assertIncludes(
    editorHtml,
    'name="customerPoNumber"',
    "Mark as Won must collect a customer PO number",
  );
  assertIncludes(
    editorHtml,
    "data-edit-customer-po",
    "Won BOQs must allow the customer PO number to be corrected",
  );
  assertIncludes(
    editorHtml,
    'data-confirm-event="boq:revert-issued"',
    "Won BOQs must offer Revert to Issued",
  );
  assertIncludes(
    editorHtml,
    "<option>Won</option>",
    "BOQ information must display the Won status",
  );
  assertIncludes(
    boqSource,
    "store.markBoqWon(currentRecordId, {",
    "Mark as Won must use the store transition",
  );
  assertIncludes(
    boqSource,
    "store.updateBoqCustomerPoNumber(currentRecordId, customerPoNumber)",
    "Edit Customer PO must update parent-level commercial metadata",
  );
  assertIncludes(
    boqSource,
    "store.revertBoqToIssued(currentRecordId)",
    "Revert to Issued must use the store transition",
  );
  assertIncludes(
    appSource,
    'trigger.dataset.confirmTone === "primary"',
    "status confirmations must use a non-destructive primary action",
  );
  assertIncludes(
    dashboardSource,
    'const wonBoqs = boqs.filter((boq) => boq.status === "Won");',
    "Dashboard must retain Won BOQs as a distinct status",
  );
});

Deno.test("shows the Customer PO beside the Won editor status", () => {
  assertIncludes(
    editorHtml,
    'class="status status-won"\n                  data-editor-customer-po',
    "the Customer PO must use the Won badge treatment",
  );
  const statusBadge = editorHtml.indexOf("data-editor-status");
  const customerPoBadge = editorHtml.indexOf("data-editor-customer-po");
  const revisionBadge = editorHtml.indexOf("data-editor-revision");
  if (statusBadge < 0 || customerPoBadge <= statusBadge ||
      revisionBadge <= customerPoBadge) {
    throw new Error("Customer PO badge must follow Won before the revision badge");
  }
  assertIncludes(
    boqSource,
    "customerPoNode.hidden = status !== \"Won\" || !customerPoNumber;",
    "the Customer PO badge must only appear for a Won BOQ with a PO number",
  );
  assertIncludes(
    boqSource,
    "? customerPoNumber\n        : \"\";",
    "the Customer PO badge must display only the saved PO number",
  );
  if (boqSource.includes("`Customer PO: ${customerPoNumber}`")) {
    throw new Error("the Customer PO badge must not repeat its label");
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
  assertIncludes(
    modalSource,
    'entry.backdrop.style.setProperty(\n        "--modal-stack-depth",',
    "each nested modal must receive its stack depth",
  );
  assertIncludes(
    componentsCss,
    "z-index: calc(100 + var(--modal-stack-depth, 0));",
    "nested modals must render above the modal that opened them",
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

Deno.test("shows snapshot gross margin for every revision history entry", () => {
  assertIncludes(
    boqSource,
    "revisionData?.document.marginPercent || 0,",
    "revision margin must come from the selected snapshot calculation",
  );
  assertIncludes(
    boqSource,
    '<span class="revision-entry-margin">Gross margin ${grossMargin}</span>',
    "revision history must render the snapshot gross margin",
  );
  assertIncludes(
    componentsCss,
    ".revision-entry-margin {",
    "revision gross margin must use the revision history layout",
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

Deno.test("shows saved revision drafts in Revision History", () => {
  assertIncludes(
    boqSource,
    "const entries = store.revisionHistory(currentRecordId || currentRecord);",
    "Revision History must include the saved working draft entry",
  );
  assertIncludes(
    boqSource,
    "revisionDate(isDraft ? revision.savedAt : revision.issuedAt)",
    "saved drafts must show their saved timestamp",
  );
  assertIncludes(
    editorHtml,
    "Saved drafts remain editable; issued revisions are retained as locked snapshots.",
    "Revision History must explain the difference between drafts and snapshots",
  );
});

Deno.test("keeps the original dark canvas with a darker sidebar", () => {
  assertIncludes(
    variablesCss,
    "--color-bg: #151a1f;",
    "dark workspace must retain its original canvas color",
  );
  assertIncludes(
    variablesCss,
    "--color-surface: #1c2229;",
    "dark cards must retain their original surface color",
  );
  assertIncludes(
    variablesCss,
    "--color-sidebar: #0c1116;",
    "dark sidebar must use the deeper navigation color",
  );
  if (layoutCss.includes("border-right: 1px solid var(--color-sidebar-border);")) {
    throw new Error("sidebar must not render a right-side divider");
  }
});

Deno.test("keeps key BOQ item columns visible during horizontal scrolling", () => {
  assertIncludes(
    editorHtml,
    'class="editor-sticky-column editor-sticky-index"',
    "BOQ row number header must use the sticky index column",
  );
  assertIncludes(
    editorHtml,
    'class="editor-sticky-column editor-sticky-item"',
    "BOQ item header must use the sticky item column",
  );
  assertIncludes(
    editorHtml,
    "align-right editor-sticky-column editor-sticky-qty",
    "BOQ quantity header must use the sticky quantity column",
  );
  assertIncludes(
    editorHtml,
    'class="editor-sticky-column editor-sticky-unit"',
    "BOQ unit header must use the sticky unit column",
  );
  assertIncludes(
    boqSource,
    "item-order-cell editor-sticky-column editor-sticky-index",
    "BOQ row numbers must remain sticky",
  );
  assertIncludes(
    boqSource,
    'td class="editor-sticky-column editor-sticky-item"',
    "BOQ item inputs must remain sticky",
  );
  assertIncludes(
    boqSource,
    'td class="editor-sticky-column editor-sticky-qty"',
    "BOQ quantity inputs must remain sticky",
  );
  assertIncludes(
    boqSource,
    'td class="editor-sticky-column editor-sticky-unit"',
    "BOQ unit inputs must remain sticky",
  );
  assertIncludes(
    boqSource,
    'class="editor-category-sticky"',
    "BOQ category rows must keep a sticky category region",
  );
  assertIncludes(
    boqSource,
    'class="category-subtotal-sticky">Subtotal</div>',
    "subtotal labels must remain visible from the left edge while scrolling",
  );
  assertIncludes(
    boqSource,
    'category-subtotal-row" data-category-subtotal',
    "subtotal rows must retain their category identity",
  );
  assertIncludes(
    componentsCss,
    ".editor-table tbody tr.category-subtotal-row:hover td,",
    "every subtotal cell must share one hover background",
  );
  assertIncludes(
    componentsCss,
    ".editor-table tbody .category-subtotal-row:hover .category-subtotal-sticky",
    "the sticky subtotal surface must share the row hover background",
  );
  assertIncludes(
    componentsCss,
    ".editor-table.sticky-columns-active .category-subtotal-sticky::after",
    "sticky subtotal boundaries must align with the final sticky column",
  );
  assertIncludes(
    componentsCss,
    ".editor-table tbody tr.category-subtotal-row td {",
    "subtotal rows must retain a complete bottom border",
  );
  assertIncludes(
    componentsCss,
    "bottom: 1px;",
    "the sticky subtotal surface must leave its bottom border visible",
  );
  assertIncludes(
    componentsCss,
    "left: var(--editor-sticky-index-width);",
    "sticky item cells must sit beside the row-number column",
  );
  assertIncludes(
    componentsCss,
    "var(--editor-sticky-index-width) + var(--editor-sticky-item-width)",
    "sticky quantity cells must sit beside the item column",
  );
  assertIncludes(
    componentsCss,
    "var(--editor-sticky-qty-width)",
    "sticky unit cells must sit beside the quantity column",
  );
  assertIncludes(
    componentsCss,
    ".editor-category-sticky {",
    "category regions must have sticky positioning rules",
  );
  if (/\.editor-category-row strong\s*\{[^}]*font-size:/s.test(componentsCss)) {
    throw new Error("category labels must inherit the table content font size");
  }
  assertIncludes(
    componentsCss,
    ".editor-table {\n  --editor-sticky-index-width: 36px;",
    "BOQ items must use the editor table typography scope",
  );
  assertIncludes(
    componentsCss,
    "min-width: var(--editor-table-min-width);\n  font-size: 11px;",
    "category, calculated, and subtotal content must use 11px text",
  );
  assertIncludes(
    componentsCss,
    "padding-left: 6px;\n  font-size: 11px;",
    "editable BOQ cells must use 11px text",
  );
  assertIncludes(
    componentsCss,
    "--editor-sticky-boundary-width",
    "category regions must follow the measured sticky boundary",
  );
  assertIncludes(
    componentsCss,
    ".editor-table.sticky-columns-active .editor-sticky-unit::after",
    "the final sticky column border must depend on the active sticky state",
  );
  assertIncludes(
    componentsCss,
    "background: var(--color-border);",
    "the active sticky boundary must match the table border color",
  );
  assertIncludes(
    boqSource,
    'table.classList.toggle("sticky-columns-active", isActive);',
    "horizontal scrolling must update the active sticky state",
  );
  assertIncludes(
    boqSource,
    '!header.classList.contains("editor-sticky-column")',
    "sticky activation must derive from preceding non-sticky columns",
  );
  assertIncludes(
    boqSource,
    'table.style.setProperty(\n        "--editor-sticky-boundary-width"',
    "category boundaries must align to the rendered unit column edge",
  );
  assertIncludes(
    boqSource,
    'desktopTableWrap?.addEventListener("scroll", updateStickyColumnsState',
    "the BOQ table must monitor horizontal scrolling",
  );
  assertIncludes(
    boqSource,
    'event.target.closest(".editor-table [data-item-input]")',
    "horizontal gestures must be handled across all BOQ item controls",
  );
  assertIncludes(
    boqSource,
    "desktopTableWrap.scrollLeft += horizontalDelta * deltaScale;",
    "horizontal input gestures must scroll the BOQ table",
  );
  assertIncludes(
    boqSource,
    'editor.addEventListener("wheel", redirectItemInputHorizontalScroll',
    "the BOQ editor must intercept horizontal input gestures",
  );
});

Deno.test("only allows BOQ item changes while Edit is on", () => {
  assertIncludes(
    editorHtml,
    "data-toggle-edit",
    "BOQ Items must provide an Edit toggle",
  );
  if (editorHtml.includes("data-toggle-prices") ||
      editorHtml.includes("Prices shown")) {
    throw new Error("the price visibility toggle must be removed");
  }
  assertIncludes(
    boqSource,
    "let editItems = true;",
    "draft BOQs must default to Edit on",
  );
  if (boqSource.includes("editorPreferences.editItems")) {
    throw new Error(
      "a previous Edit off preference must not affect a new draft",
    );
  }
  const startDraftEditingCount =
    boqSource.split("startDraftEditing();").length - 1;
  if (startDraftEditingCount !== 2) {
    throw new Error(
      `expected both revision draft flows to enable editing, received ${startDraftEditingCount}`,
    );
  }
  assertIncludes(
    boqSource,
    "function startDraftEditing() {\n    editItems = true;\n  }",
    "revision drafts must explicitly start with Edit on",
  );
  assertIncludes(
    boqSource,
    'editor.classList.toggle("items-readonly", !itemsEditable);',
    "Edit off must apply the read-only item state",
  );
  assertIncludes(
    boqSource,
    'if (!input || !canEditItems()) return;',
    "disabled item inputs must not mutate BOQ data",
  );
  assertIncludes(
    boqSource,
    "[data-item-action], .row-actions [data-menu-trigger],",
    "Edit off must disable only BOQ row action menus",
  );
  if (boqSource.includes("[data-item-action], [data-menu-trigger],")) {
    throw new Error("Edit off must keep the BOQ header menu enabled");
  }
  assertIncludes(
    componentsCss,
    ".items-readonly .editor-table input,",
    "read-only BOQ item controls must retain deliberate styling",
  );
  if (boqSource.includes("prices-hidden") ||
      componentsCss.includes(".prices-hidden")) {
    throw new Error("price hiding behavior must be removed from BOQ Items");
  }
});

Deno.test("adds a custom BOQ item with Enter while editing", () => {
  assertIncludes(
    editorHtml,
    "Enter adds a custom item",
    "the BOQ Items keyboard hint must describe the Enter action",
  );
  if (editorHtml.includes("Enter moves to the next field")) {
    throw new Error("the previous Enter navigation hint must be removed");
  }
  assertIncludes(
    boqSource,
    'if (event.key === "Enter") {',
    "BOQ item inputs must handle Enter separately from arrow navigation",
  );
  assertIncludes(
    boqSource,
    "event.repeat || event.isComposing ||",
    "Enter must guard against repeated and composing key events",
  );
  assertIncludes(
    boqSource,
    "const addedItem = addItem();",
    "Enter must create the same custom item as the existing Add action",
  );
  assertIncludes(
    boqSource,
    "if (addedItem) focusDesktopItemField(addedItem.id);",
    "focus must move to the new custom item's Item field",
  );
  assertIncludes(
    boqSource,
    'if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;',
    "arrow-key field navigation must remain available independently",
  );
});

Deno.test("collapses hidden BOQ pricing columns without an empty scroll area", () => {
  assertIncludes(
    editorHtml,
    'class="item-col-money column-cogs"',
    "COGS column tracks must follow the selected editor view",
  );
  assertIncludes(
    editorHtml,
    'class="item-col-money column-selling"',
    "selling column tracks must follow the selected editor view",
  );
  assertIncludes(
    editorHtml,
    'class="item-col-margin column-margin"',
    "margin column tracks must follow the selected editor view",
  );
  assertIncludes(
    componentsCss,
    '[data-editor-view-mode="cogs"] .editor-table {\n  --editor-table-min-width: 1128px;',
    "COGS view must remove hidden selling width from the table",
  );
  assertIncludes(
    componentsCss,
    '[data-editor-view-mode="selling"] .editor-table {\n  --editor-table-min-width: 1050px;',
    "selling view must remove hidden COGS and margin width from the table",
  );
  if (editorHtml.includes('<option value="summary">')) {
    throw new Error(
      "Calculation summary must not duplicate the Financial Summary panel",
    );
  }
});

Deno.test("uses deliberate tablet and mobile layouts", () => {
  assertIncludes(
    responsiveCss,
    '@media (max-width: 991px)',
    "responsive styles must define the tablet breakpoint",
  );
  assertIncludes(
    responsiveCss,
    '.editor-page-header .page-actions',
    "tablet BOQ actions must wrap below the editor heading",
  );
  assertIncludes(
    responsiveCss,
    'body[data-page="boq-editor"] .main-content',
    "mobile save-bar spacing must be scoped to the BOQ editor",
  );
  assertIncludes(
    responsiveCss,
    '.dashboard-recent .dashboard-financial-column',
    "mobile dashboard tables must hide secondary financial columns",
  );
  assertIncludes(
    responsiveCss,
    'max-height: calc(100dvh - env(safe-area-inset-top) - 12px);',
    "mobile modals must respect the dynamic viewport",
  );
  assertIncludes(
    dashboardHtml,
    'class="align-right dashboard-financial-column"',
    "dashboard headers must identify columns that collapse on mobile",
  );
  assertIncludes(
    dashboardSource,
    'dashboard-updated-column',
    "dashboard rows must match the responsive column classes",
  );
});
