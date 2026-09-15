globalThis.window = globalThis;
window.BOQStore = {
  getSettings: () => ({ rounding: "2", numberFormat: "comma" }),
};

await import("../js/utils.js");
await import("../js/calculations.js");
await import("../js/universal-search.js");

function assert(value, message) {
  if (!value) throw new Error(message);
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

function searchIndex() {
  return window.BOQUniversalSearch.buildIndex({
    boqs: [{
      id: "boq-1",
      number: "BOQ-260901",
      projectName: "Ayana Ballroom Network",
      customerName: "Ayana Resort",
      customerPoNumber: "PO-7788",
      status: "Issued",
      currency: "IDR",
      items: [{ item: "Router", qty: 2, unitCogs: 500000, margin: 20 }],
    }],
    products: [{
      id: "product-1",
      sku: "PN-RTR-01",
      name: "Router",
      category: "Network Equipment",
      unit: "pcs",
      status: "Active",
    }, {
      id: "product-2",
      sku: "PN-RTR-02",
      name: "Router Pro",
      category: "Network Equipment",
      unit: "pcs",
      status: "Active",
    }],
    customers: [{
      id: "customer-1",
      companyName: "Ayana Resort",
      contactPerson: "Made Putra",
      email: "made@ayana.example",
      phone: "+62 811 222",
      address: "Bali",
      status: "Active",
    }],
  }, {
    registerBoqView: (record) => ({
      ...record,
      displayRevisionNumber: 1,
    }),
    calculateSummary: window.BOQCalculations.calculateSummary,
    formatCurrency: window.BOQUtils.formatCurrency,
    revisionLabel: (number) => `R${String(number).padStart(2, "0")}`,
    visibleRevisionLabel: window.BOQUtils.visibleRevisionLabel,
  });
}

Deno.test("groups universal search results across all record types", () => {
  const index = searchIndex();
  const ayana = window.BOQUniversalSearch.search(index, "ayana", 5);
  equal(
    ayana.boqs.total,
    1,
    "BOQ customer and project fields must be searchable",
  );
  equal(ayana.customers.total, 1, "customer company must be searchable");
  equal(ayana.products.total, 0, "unrelated products must be excluded");

  const product = window.BOQUniversalSearch.search(index, "RTR network", 5);
  equal(
    product.products.total,
    2,
    "part number and category tokens must combine",
  );
  equal(
    product.products.items[0].primary,
    "Router",
    "exact product must rank first",
  );

  const po = window.BOQUniversalSearch.search(index, "7788", 5);
  equal(po.boqs.total, 1, "Customer PO must be searchable");

  const address = window.BOQUniversalSearch.search(index, "bali", 5);
  equal(address.customers.total, 1, "customer address must be searchable");
});

Deno.test("searches BOQ values and preserves grouped result limits", () => {
  const index = searchIndex();
  const value = window.BOQUniversalSearch.search(index, "1,250,000", 5);
  equal(value.boqs.total, 1, "formatted BOQ value must be searchable");
  assert(
    value.boqs.items[0].href.includes("boq-editor.html?id=boq-1"),
    "BOQ results must link directly to the editor",
  );

  const limited = window.BOQUniversalSearch.search(index, "router", 1);
  equal(
    limited.products.total,
    2,
    "total must include results beyond the limit",
  );
  equal(
    limited.products.items.length,
    1,
    "visible results must respect the limit",
  );

  const punctuation = window.BOQUniversalSearch.search(index, "---", 5);
  equal(
    punctuation.boqs.total,
    0,
    "punctuation-only queries must not return all records",
  );
});

Deno.test("wires universal search into every application page", async () => {
  const pages = [
    "index.html",
    "boqs.html",
    "boq-editor.html",
    "products.html",
    "customers.html",
    "settings.html",
  ];
  for (const page of pages) {
    const html = await Deno.readTextFile(
      new URL(`../${page}`, import.meta.url),
    );
    assert(
      html.includes('src="js/universal-search.js"'),
      `${page} must load universal search`,
    );
  }

  const navigation = await Deno.readTextFile(
    new URL("../js/navigation.js", import.meta.url),
  );
  const records = await Deno.readTextFile(
    new URL("../js/records.js", import.meta.url),
  );
  const app = await Deno.readTextFile(new URL("../js/app.js", import.meta.url));
  const layout = await Deno.readTextFile(
    new URL("../css/layout.css", import.meta.url),
  );
  const responsive = await Deno.readTextFile(
    new URL("../css/responsive.css", import.meta.url),
  );

  assert(
    navigation.includes("data-universal-search-input") &&
      navigation.includes("data-universal-search-results") &&
      navigation.includes("data-universal-search-open"),
    "the shared top bar must expose desktop and mobile search controls",
  );
  assert(
    records.includes('get("product")') && records.includes('get("customer")') &&
      records.includes("openRequestedRecord"),
    "product and customer results must support direct detail links",
  );
  assert(
    app.includes('get(\n        "q",') || app.includes('get("q")'),
    "View all links must initialize register search from the query string",
  );
  assert(
    app.includes('url.searchParams.set("q", query)') &&
      app.includes('url.searchParams.delete("q")'),
    "register search changes must remain synchronized with the query string",
  );
  assert(
    layout.includes("clamp(240px, 30vw, 480px)") &&
      responsive.includes("body.universal-search-open .universal-search"),
    "universal search must use deliberate desktop and mobile layouts",
  );
});
