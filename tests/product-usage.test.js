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
    activeRevisionNumber: 1,
    updatedAt: "2026-09-04T10:00:00.000Z",
    revisions: [{
      number: 1,
      state: "Issued",
      calculation: { rounding: "2" },
    }],
    items: [{
      item: "Router",
      qty: 3,
      unitCogs: 90,
      margin: 20,
      sellingOverride: 130,
    }],
  }], {
    registerBoqView,
    latestIssuedRevision,
    calculateItem: window.BOQCalculations.calculateItem,
    defaultRounding: "2",
  });

  equal(entries.length, 2, "both current BOQ usages must be returned");
  equal(entries[0].status, "Won", "newest usage must sort first");
  equal(entries[0].unitSelling, 130, "manual selling must be preserved");
  assert(entries[0].manualSelling, "manual selling must be identified");
  equal(entries[1].unitSelling, 2000, "issued revision rounding must be used");
});

Deno.test("keeps repeated matching BOQ items as separate usage rows", () => {
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

  equal(entries.length, 2, "each matching line item must remain visible");
  equal(entries[0].quantity, 2, "original item order must be retained");
  equal(entries[1].quantity, 5, "the second item must remain separate");
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
    responsiveCss.includes(".product-usage-cards"),
    "mobile usage history must provide compact cards",
  );
});
