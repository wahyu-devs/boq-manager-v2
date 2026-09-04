globalThis.window = globalThis;
window.BOQStore = {
  getSettings: () => ({ rounding: "2" }),
};

await import("../js/calculations.js");
await import("../js/product-usage.js");

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

const registerBoqView = (record) => ({
  ...record,
  displayRevisionNumber: record.workingRevision ??
    record.activeRevisionNumber ?? 0,
});

const latestIssuedRevision = (record) =>
  [...(record.revisions || [])].reverse().find((revision) =>
    revision.state === "Issued"
  ) || null;

Deno.test("matches product usage by normalized exact item name", () => {
  const entries = window.BOQProductUsage.build("  Data   Outlet  ", [{
    id: "boq-draft",
    number: "BOQ-260901",
    projectName: "Office Network",
    customerName: "Example Customer",
    status: "Draft",
    workingRevision: 1,
    currency: "IDR",
    updatedAt: "2026-09-03T10:00:00.000Z",
    items: [
      { item: "data outlet", qty: 2, unitCogs: 100, margin: 20 },
      { item: "Data Outlet Pro", qty: 1, unitCogs: 200, margin: 20 },
    ],
  }], {
    registerBoqView,
    latestIssuedRevision,
    calculateItem: window.BOQCalculations.calculateItem,
    defaultRounding: "2",
  });

  equal(entries.length, 1, "only the exact normalized item name must match");
  equal(entries[0].boqId, "boq-draft", "the matching BOQ must be retained");
  equal(entries[0].revisionNumber, 1, "the working revision must be shown");
  equal(entries[0].status, "Draft", "the current draft status must be shown");
});

Deno.test("uses effective BOQ pricing, revision rounding, and manual selling", () => {
  const entries = window.BOQProductUsage.build("Router", [{
    id: "boq-issued",
    number: "BOQ-260902",
    projectName: "Issued Project",
    customerName: "Issued Customer",
    status: "Issued",
    activeRevisionNumber: 2,
    updatedAt: "2026-09-02T10:00:00.000Z",
    revisions: [{
      number: 2,
      state: "Issued",
      calculation: { rounding: "up1000" },
    }],
    items: [{ item: "Router", qty: 1, unitCogs: 800, margin: 25 }],
  }, {
    id: "boq-won",
    number: "BOQ-260903",
    projectName: "Won Project",
    customerName: "Won Customer",
    status: "Won",
    customerPoNumber: "PO-2026-019",
    activeRevisionNumber: 1,
    updatedAt: "2026-09-04T10:00:00.000Z",
    revisions: [{
      number: 1,
      state: "Issued",
      calculation: { rounding: "2" },
    }],
    items: [
      {
        item: "Router",
        qty: 3,
        unitCogs: 90,
        margin: 20,
        sellingOverride: 130,
      },
      { item: "Installation", qty: 1, unitCogs: 50, margin: 50 },
    ],
  }], {
    registerBoqView,
    latestIssuedRevision,
    calculateItem: window.BOQCalculations.calculateItem,
    defaultRounding: "2",
  });

  equal(entries.length, 2, "both current BOQ usages must be returned");
  equal(entries[0].status, "Won", "newest usage must sort first");
  equal(
    entries[0].customerPoNumber,
    "PO-2026-019",
    "the Customer PO must come from the current BOQ",
  );
  equal(
    entries[0].boqValue,
    490,
    "BOQ Value must total every item in the effective BOQ",
  );
  equal(entries[0].unitSelling, 130, "manual selling must be preserved");
  assert(entries[0].manualSelling, "manual selling must be identified");
  equal(entries[1].unitSelling, 2000, "issued revision rounding must be used");
});

Deno.test("deduplicates repeated item names within the same BOQ", () => {
  const entries = window.BOQProductUsage.build("Access Point", [{
    id: "boq-repeat",
    number: "BOQ-260904",
    status: "Draft",
    updatedAt: "2026-09-04T12:00:00.000Z",
    items: [
      { item: "Access Point", qty: 2, unitCogs: 100, margin: 20 },
      { item: "Access Point", qty: 5, unitCogs: 120, margin: 25 },
    ],
  }], {
    registerBoqView,
    calculateItem: window.BOQCalculations.calculateItem,
  });

  equal(entries.length, 1, "the same product must appear once per BOQ");
  equal(entries[0].unitCogs, 100, "the first matching item must be used");
});

Deno.test("wires Product Usage History into the catalog UI", async () => {
  const productsHtml = await Deno.readTextFile(
    new URL("../products.html", import.meta.url),
  );
  const recordsSource = await Deno.readTextFile(
    new URL("../js/records.js", import.meta.url),
  );
  const componentsCss = await Deno.readTextFile(
    new URL("../css/components.css", import.meta.url),
  );
  const responsiveCss = await Deno.readTextFile(
    new URL("../css/responsive.css", import.meta.url),
  );

  assert(
    productsHtml.includes('id="product-usage-modal"'),
    "Products must provide the usage history modal",
  );
  assert(
    productsHtml.includes('src="js/product-usage.js"'),
    "Products must load the product usage module",
  );
  const statusHeader = productsHtml.indexOf(
    'data-product-usage-sort="status"',
  );
  const poHeader = productsHtml.indexOf(
    'data-product-usage-sort="customerPoNumber"',
    statusHeader,
  );
  const valueHeader = productsHtml.indexOf(
    'data-product-usage-sort="boqValue"',
    poHeader,
  );
  assert(
    statusHeader >= 0 && poHeader > statusHeader && valueHeader > poHeader,
    "Customer PO and BOQ Value must follow Status",
  );
  assert(
    !productsHtml.includes('<th class="align-right">Qty</th>'),
    "Product Usage History must not display a quantity column",
  );
  equal(
    productsHtml.split("data-product-usage-sort=").length - 1,
    10,
    "every Product Usage data header must support sorting",
  );
  [
    "boqNumber",
    "projectName",
    "customerName",
    "status",
    "customerPoNumber",
    "boqValue",
    "unitCogs",
    "margin",
    "unitSelling",
    "updatedAt",
  ].forEach((key) =>
    assert(
      productsHtml.includes(`data-product-usage-sort="${key}"`),
      `${key} must be sortable in Product Usage History`,
    )
  );
  assert(
    recordsSource.includes("productUsageSortKey") &&
      recordsSource.includes("updateProductUsageSortState"),
    "Product Usage sorting must track its active key and direction",
  );
  assert(
    recordsSource.includes('data-record-action="usage"'),
    "product names must open their usage history",
  );
  assert(
    recordsSource.includes("Set it to Inactive instead"),
    "used products must be protected from permanent deletion",
  );
  assert(
    componentsCss.includes(".product-usage-table"),
    "desktop usage history must use a dedicated table layout",
  );
  assert(
    componentsCss.includes(
      ".product-usage-table th:first-child,\n.product-usage-table td:first-child {\n  padding-left: 18px;",
    ) && componentsCss.includes(
      ".product-usage-table th:last-child,\n.product-usage-table td:last-child {\n  padding-right: 18px;",
    ),
    "usage table edges must align with the modal padding",
  );
  assert(
    componentsCss.includes(
      ".product-usage-modal [data-product-usage-name]",
    ) && componentsCss.includes(
      ".product-usage-modal [data-product-usage-stats]",
    ) && recordsSource.includes("summaryStats.textContent"),
    "long product names must truncate without hiding usage totals",
  );
  assert(
    responsiveCss.includes(".product-usage-cards"),
    "mobile usage history must provide compact cards",
  );
});
