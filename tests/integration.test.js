globalThis.window = globalThis;
globalThis.document = new EventTarget();

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.has(String(key)) ? this.#values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.#values.set(String(key), String(value));
  }

  removeItem(key) {
    this.#values.delete(String(key));
  }

  clear() {
    this.#values.clear();
  }
}

Object.defineProperty(globalThis, "localStorage", {
  value: new MemoryStorage(),
  configurable: true,
});

localStorage.clear();
localStorage.setItem("boq-manager-session-user", "test-user");
localStorage.setItem("boq_show_table_prices", "false");
localStorage.setItem("boq_show_category_subtotals", "true");
localStorage.setItem("boq:user:test-user:projects", JSON.stringify({
  "Office Upgrade": {
    data: [{
      name: "Router",
      qty: 2,
      unit: "Each",
      price: 100,
      margin: 20,
      sellingPrice: 125,
      category: "Network",
    }],
    commission: 10,
    categoryOrder: ["Network"],
    lastSaved: 1735689600000,
  },
}));
localStorage.setItem("boq:user:test-user:items", JSON.stringify([{
  name: "Router",
  unit: "Each",
  price: 100,
  sellingPrice: 125,
  category: "Network",
  updatedAt: 1735689600000,
}]));
localStorage.setItem("boq:user:test-user:working", "[]");
localStorage.setItem("boq:user:test-user:current_name", "Office Upgrade");
localStorage.setItem(
  "boq:user:test-user:category_order",
  JSON.stringify(["Network"]),
);

await import("../js/store.js");
await import("../js/calculations.js");
await import("../js/utils.js");

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

Deno.test("migrates previous data and preserves pricing behavior", () => {
  const store = window.BOQStore;
  const calculations = window.BOQCalculations;
  const projects = store.list("projects");
  const boqs = store.list("boqs");
  const products = store.list("products");

  equal(projects.length, 1, "project count");
  equal(boqs.length, 1, "BOQ count");
  equal(products.length, 1, "product count");
  equal(boqs[0].title, "Office Upgrade", "BOQ title");
  equal(boqs[0].items[0].sellingOverride, 125, "stored selling price");
  equal(boqs[0].commission, 10, "commission");
  equal(boqs[0].status, "Draft", "migrated BOQ status");
  equal(store.getSettings().showTablePrices, false, "price visibility preference");
  equal(store.getSettings().showCategorySubtotals, true, "subtotal preference");

  store.saveSettings({ ...store.getSettings(), rounding: "2" });
  const exact = calculations.calculateItem({
    qty: 1,
    unitCogs: 100,
    margin: 20,
  });
  equal(exact.unitSelling, 125, "gross-margin selling price");

  store.saveSettings({ ...store.getSettings(), rounding: "up1000" });
  const rounded = calculations.calculateItem({
    qty: 1,
    unitCogs: 101000,
    margin: 20,
  });
  equal(rounded.unitSelling, 127000, "round up to nearest thousand");

  const manual = calculations.calculateItem({
    qty: 1,
    unitCogs: 100000,
    margin: 20,
    sellingOverride: 130000,
  });
  equal(manual.unitSelling, 130000, "manual selling override");

  const summary = calculations.calculateSummary([{
    qty: 1,
    unitCogs: 100000,
    margin: 20,
  }], { commission: 5000 });
  equal(summary.totalSelling, 125000, "summary selling total");
  equal(summary.marginValue, 20000, "profit after commission");
  equal(summary.marginPercent, 16, "margin percentage after commission");

  const backup = store.exportState();
  equal(backup.application, "BOQ Manager", "backup application metadata");
  equal(backup.meta.schemaVersion, 2, "backup schema version");

  equal(
    store.formatDocumentNumber(
      "Q-{YY}-{MM}-{NNNN}",
      7,
      new Date(2031, 2, 1),
    ),
    "Q-31-03-0007",
    "document number tokens",
  );
  equal(store.isValidNumberingFormat("BOQ-{NNN}"), true, "valid numbering format");
  equal(store.isValidNumberingFormat("BOQ-{YYYY}"), false, "missing sequence token");
  const year = new Date().getFullYear();
  store.saveSettings({
    ...store.getSettings(),
    numberingFormat: "EST-{YYYY}-{NN}",
    numberFormat: "comma",
  });
  store.save("boqs", {
    number: `EST-${year}-09`,
    title: "Numbering Test",
    status: "Draft",
    items: [],
  });
  equal(store.nextNumber("boqs", "BOQ"), `EST-${year}-10`, "next BOQ number");
  equal(window.BOQUtils.formatCurrency(1234.5, "USD", 2), "$1,234.50", "comma number format");

  store.saveSettings({ ...store.getSettings(), numberFormat: "dot" });
  equal(window.BOQUtils.formatCurrency(1234.5, "USD", 2), "$1.234,50", "dot number format");
  equal(window.BOQUtils.formatPercent(12.5), "12,5%", "dot percentage format");

  store.saveSettings({ ...store.getSettings(), numberFormat: "space" });
  equal(window.BOQUtils.formatCurrency(1234.5, "USD", 2), "$1 234,50", "space number format");

  store.applyState({
    project: "Single Project Backup",
    data: [{
      name: "Installation",
      qty: 1,
      unit: "Lot",
      price: 50000,
      margin: 20,
      category: "Services",
    }],
    commission: 2000,
    categoryOrder: ["Services"],
  }, { silent: true });
  equal(store.list("projects").length, 1, "single-project restore count");
  equal(store.list("boqs")[0].title, "Single Project Backup", "single-project restore title");
  equal(store.list("boqs")[0].commission, 2000, "single-project restore commission");
});
