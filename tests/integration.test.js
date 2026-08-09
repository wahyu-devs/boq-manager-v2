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
  const boqs = store.list("boqs");
  const products = store.list("products");

  equal(store.list("projects").length, 0, "project collection removed");
  equal(boqs.length, 1, "BOQ count");
  equal(products.length, 1, "product count");
  equal(products[0].sku, "", "legacy product part number is blank");
  equal(boqs[0].items[0].sku, "", "legacy BOQ item part number is blank");
  equal(boqs[0].projectName, "Office Upgrade", "BOQ project name");
  equal(boqs[0].projectId, undefined, "BOQ project id removed");
  equal(boqs[0].title, undefined, "BOQ title removed");
  equal(boqs[0].items[0].sellingOverride, 125, "stored selling price");
  equal(boqs[0].commission, 10, "commission");
  equal(boqs[0].status, "Sent", "migrated BOQ status");
  equal(
    boqs[0].createdAt,
    "2025-01-01T00:00:00.000Z",
    "legacy BOQ created timestamp",
  );
  equal(
    boqs[0].updatedAt,
    "2025-01-01T00:00:00.000Z",
    "legacy BOQ updated timestamp",
  );
  equal(store.getSettings().showTablePrices, false, "price visibility preference");
  equal(store.getSettings().showCategorySubtotals, true, "subtotal preference");
  const preferenceMetaTimestamp = store.getMeta().clientUpdatedAt;
  store.saveLocalPreference("boq-editor", {
    showCategorySubtotals: false,
    showTablePrices: true,
  });
  equal(
    JSON.stringify(store.getLocalPreference("boq-editor")),
    JSON.stringify({ showCategorySubtotals: false, showTablePrices: true }),
    "BOQ editor preferences saved locally",
  );
  equal(
    store.getMeta().clientUpdatedAt,
    preferenceMetaTimestamp,
    "local preferences do not trigger cloud sync",
  );

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
  equal(backup.meta.schemaVersion, 4, "backup schema version");
  equal(
    backup.collections.projects,
    undefined,
    "project collection excluded from backup",
  );

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
    projectName: "Numbering Test",
    status: "Draft",
    items: [],
  });
  equal(store.nextNumber("boqs", "BOQ"), `EST-${year}-10`, "next BOQ number");
  const normalizedLegacyBoq = store.save("boqs", {
    number: "LEGACY-001",
    title: "Legacy Project Name",
    status: "Draft",
    items: [],
  });
  equal(
    normalizedLegacyBoq.projectName,
    "Legacy Project Name",
    "legacy title becomes project name",
  );
  equal(normalizedLegacyBoq.title, undefined, "legacy title discarded");
  equal(window.BOQUtils.formatCurrency(1234.5, "USD", 2), "$1,234.50", "comma number format");
  equal(
    window.BOQUtils.formatNumberInput(1234567.5),
    "1,234,567.5",
    "comma financial input format",
  );
  equal(
    window.BOQUtils.parseNumberInput("1,234,567.5"),
    1234567.5,
    "comma financial input parsing",
  );

  const reorderedItems = window.BOQUtils.reorderItemsWithinCategory(
    [
      { id: "first", category: "Network" },
      { id: "second", category: "Network" },
      { id: "third", category: "Services" },
    ],
    "second",
    "first",
    "before",
  );
  equal(reorderedItems.changed, true, "same-category reorder applied");
  equal(
    reorderedItems.items.map((item) => item.id).join(","),
    "second,first,third",
    "items reordered around drop target",
  );
  const crossCategoryReorder = window.BOQUtils.reorderItemsWithinCategory(
    reorderedItems.items,
    "third",
    "first",
    "before",
  );
  equal(
    crossCategoryReorder.changed,
    false,
    "cross-category drop does not change item category",
  );
  const reorderedCategories = window.BOQUtils.reorderValues(
    ["Network", "Services", "Other"],
    "Other",
    "Network",
    "before",
  );
  equal(reorderedCategories.changed, true, "category reorder applied");
  equal(
    reorderedCategories.values.join(","),
    "Other,Network,Services",
    "category placed around drop target",
  );

  store.saveSettings({ ...store.getSettings(), numberFormat: "dot" });
  equal(window.BOQUtils.formatCurrency(1234.5, "USD", 2), "$1.234,50", "dot number format");
  equal(window.BOQUtils.formatPercent(12.5), "12,5%", "dot percentage format");
  equal(
    window.BOQUtils.formatNumberInput(1234567.5),
    "1.234.567,5",
    "dot financial input format",
  );
  equal(
    window.BOQUtils.parseNumberInput("1.234.567,5"),
    1234567.5,
    "dot financial input parsing",
  );
  equal(
    window.BOQUtils.numberInputEditingValue(1234567.5),
    "1234567,5",
    "localized financial editing value",
  );

  store.saveSettings({ ...store.getSettings(), numberFormat: "space" });
  equal(window.BOQUtils.formatCurrency(1234.5, "USD", 2), "$1 234,50", "space number format");
  equal(
    window.BOQUtils.formatNumberInput(1234567.5),
    "1 234 567,5",
    "space financial input format",
  );
  equal(
    window.BOQUtils.parseNumberInput("1 234 567,5"),
    1234567.5,
    "space financial input parsing",
  );

  store.applyState({
    collections: {
      boqs: [{
        id: "linked-boq",
        number: "OLD-001",
        projectId: "legacy-project",
        projectName: "",
        status: "Draft",
        items: [],
      }],
      projects: [{ id: "legacy-project", name: "Linked Project" }],
      products: [],
      customers: [],
    },
    meta: { clientUpdatedAt: 1735689600000 },
  }, { silent: true });
  equal(
    store.list("boqs")[0].projectName,
    "Linked Project",
    "linked project name migrated into BOQ",
  );
  equal(
    store.list("boqs")[0].projectId,
    undefined,
    "linked project id removed",
  );
  equal(store.list("projects").length, 0, "linked project collection removed");

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
  equal(store.list("projects").length, 0, "single-project has no project record");
  equal(
    store.list("boqs")[0].projectName,
    "Single Project Backup",
    "single-project restore project",
  );
  equal(store.list("boqs")[0].commission, 2000, "single-project restore commission");

  store.setUser("migration-user");
  localStorage.setItem(
    "boq-manager-v2:migration-user:boqs",
    JSON.stringify([{
      id: "existing-boq",
      number: "OLD-002",
      projectName: "Cloud Project",
      status: "Draft",
      items: [],
      source: "imported",
      updatedAt: "2025-02-15T00:00:00.000Z",
      createdAt: "2025-02-15T00:00:00.000Z",
    }]),
  );
  const migrated = store.migrateExistingBoqs({
    silent: true,
    cloudCreatedAt: "2024-12-01T08:30:00.000Z",
    cloudUpdatedAt: "2025-03-01T10:00:00.000Z",
  });
  const migratedBoq = store.list("boqs")[0];
  equal(migrated, true, "existing BOQ migration applied");
  equal(migratedBoq.status, "Sent", "existing BOQ marked sent");
  equal(
    migratedBoq.createdAt,
    "2024-12-01T08:30:00.000Z",
    "imported BOQ uses cloud creation timestamp",
  );
  equal(
    migratedBoq.updatedAt,
    "2025-02-15T00:00:00.000Z",
    "BOQ update timestamp preserved",
  );
  equal(
    store.getMeta().existingBoqMigrationVersion,
    1,
    "existing BOQ migration version stored",
  );
  equal(
    store.migrateExistingBoqs({ silent: true }),
    false,
    "existing BOQ migration only runs once",
  );
  localStorage.setItem(
    "boq-manager-v2:migration-user:products",
    JSON.stringify([{
      id: "imported-product",
      sku: "SKU-001",
      name: "Imported Product",
      description: "Legacy description",
      source: "imported",
    }, {
      id: "manual-product",
      sku: "PN-002",
      name: "Manual Product",
    }]),
  );
  localStorage.setItem(
    "boq-manager-v2:migration-user:boqs",
    JSON.stringify([{
      ...migratedBoq,
      items: [{
        id: "legacy-item",
        sku: "SKU-001",
        item: "Imported Product",
      }],
    }]),
  );
  equal(
    store.migrateLegacyPartNumbers({ silent: true }),
    true,
    "legacy part number migration applied",
  );
  const migratedProducts = store.list("products");
  equal(migratedProducts[0].sku, "", "imported part number cleared");
  equal(
    migratedProducts[0].description,
    undefined,
    "product description removed",
  );
  equal(migratedProducts[1].sku, "", "manual part number cleared");
  equal(store.list("boqs")[0].items[0].sku, "", "BOQ part number cleared");
  equal(
    store.getMeta().partNumberMigrationVersion,
    1,
    "part number migration version stored",
  );
  equal(
    store.migrateLegacyPartNumbers({ silent: true }),
    false,
    "part number migration only runs once",
  );
  const boqBeforeBackfill = store.list("boqs")[0];
  store.save("boqs", {
    ...boqBeforeBackfill,
    items: [
      ...boqBeforeBackfill.items,
      {
        id: "custom-part-number-item",
        sku: "CUSTOM-001",
        item: "Imported Product",
      },
    ],
  });
  const beforeBackfillUpdatedAt = store.list("boqs")[0].updatedAt;
  store.save("products", { ...migratedProducts[0], sku: "PN-100" });
  equal(
    store.backfillBoqPartNumbers({ silent: true }),
    true,
    "product part number backfilled to existing BOQ",
  );
  equal(
    store.list("boqs")[0].items[0].sku,
    "PN-100",
    "existing BOQ receives product part number",
  );
  equal(
    store.list("boqs")[0].items[1].sku,
    "CUSTOM-001",
    "existing BOQ part number is not overwritten",
  );
  equal(
    store.list("boqs")[0].updatedAt,
    beforeBackfillUpdatedAt,
    "part number backfill preserves BOQ update timestamp",
  );
  equal(
    store.backfillBoqPartNumbers({ silent: true }),
    false,
    "part number backfill is idempotent",
  );
  const updatedBoq = store.save("boqs", {
    ...migratedBoq,
    projectName: "Cloud Project Updated",
  });
  equal(
    updatedBoq.createdAt,
    "2024-12-01T08:30:00.000Z",
    "BOQ creation timestamp preserved on update",
  );
});
