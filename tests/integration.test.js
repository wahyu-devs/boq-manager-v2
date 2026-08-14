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
  equal(boqs[0].status, "Issued", "migrated BOQ status");
  equal(
    store.migrateIssuedStatuses({ silent: true }),
    true,
    "issued terminology migration applied",
  );
  equal(
    store.getMeta().issuedStatusMigrationVersion,
    1,
    "issued terminology migration version stored",
  );
  equal(
    store.migrateIssuedStatuses({ silent: true }),
    false,
    "issued terminology migration is idempotent",
  );
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
  equal(backup.meta.schemaVersion, 5, "backup schema version");
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
  store.saveSettings({
    ...store.getSettings(),
    numberingFormat: "BOQ-{YY}{MM}{NN}",
  });
  const firstMonthlyNumber = store.formatDocumentNumber(
    "BOQ-{YY}{MM}{NN}",
    1,
  );
  store.save("boqs", {
    number: firstMonthlyNumber,
    projectName: "Monthly Numbering Test",
    status: "Draft",
    items: [],
  });
  equal(
    store.nextNumber("boqs", "BOQ"),
    store.formatDocumentNumber("BOQ-{YY}{MM}{NN}", 2),
    "monthly BOQ sequence increments",
  );
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
    JSON.stringify(window.BOQUtils.formatCurrencyParts(-1234567, "IDR")),
    JSON.stringify({ symbol: "Rp", value: "-1,234,567" }),
    "accounting currency parts",
  );
  equal(
    window.BOQUtils.formatCurrencyMarkup(1234567, "IDR").includes(
      '<span class="currency-accounting-symbol" aria-hidden="true">Rp</span>',
    ),
    true,
    "accounting currency markup",
  );
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
    window.BOQUtils.formatCurrencyParts(1234567, "IDR", undefined, "comma")
      .value,
    "1,234,567",
    "explicit snapshot number format",
  );
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
  equal(
    JSON.stringify(window.BOQUtils.collectUniqueTextValues(
      ["Each", "Lot"],
      ["Box", "each", "Pack"],
      "Crate",
    )),
    JSON.stringify(["Each", "Lot", "Box", "Pack", "Crate"]),
    "dynamic option values remain complete and unique",
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
  equal(migratedBoq.status, "Issued", "existing BOQ marked issued");
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
  store.saveSettings({
    ...store.getSettings(),
    numberingFormat: "BOQ-{YYYY}-{NNN}",
  });
  localStorage.setItem(
    "boq-manager-v2:migration-user:boqs",
    JSON.stringify([{
      id: "february-second",
      number: "OLD-003",
      projectName: "February Second",
      status: "Issued",
      items: [],
      createdAt: "2025-02-20T08:00:00.000Z",
      updatedAt: "2025-03-02T08:00:00.000Z",
    }, migratedBoq, {
      id: "february-first",
      number: "OLD-001",
      projectName: "February First",
      status: "Issued",
      items: [],
      createdAt: "2025-02-01T08:00:00.000Z",
      updatedAt: "2025-02-03T08:00:00.000Z",
    }]),
  );
  equal(
    store.migrateBoqNumbers({ silent: true }),
    true,
    "existing BOQ numbers migrated",
  );
  const renumberedBoqs = store.list("boqs");
  equal(
    renumberedBoqs.find((record) => record.id === "existing-boq").number,
    "BOQ-241201",
    "December BOQ sequence starts at one",
  );
  equal(
    renumberedBoqs.find((record) => record.id === "february-first").number,
    "BOQ-250201",
    "first February BOQ numbered from creation date",
  );
  equal(
    renumberedBoqs.find((record) => record.id === "february-second").number,
    "BOQ-250202",
    "second February BOQ increments monthly sequence",
  );
  equal(
    renumberedBoqs.find((record) => record.id === "february-second").updatedAt,
    "2025-03-02T08:00:00.000Z",
    "renumbering preserves update timestamp",
  );
  equal(
    store.getSettings().numberingFormat,
    "BOQ-{YY}{MM}{NN}",
    "new BOQ numbering format saved",
  );
  equal(
    store.getMeta().boqNumberingMigrationVersion,
    1,
    "BOQ numbering migration version stored",
  );
  equal(
    store.migrateBoqNumbers({ silent: true }),
    false,
    "BOQ numbering migration only runs once",
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

  store.setUser("revision-user");
  localStorage.setItem(
    "boq-manager-v2:revision-user:boqs",
    JSON.stringify([{
      id: "alpha-rev-2",
      number: "BOQ-250203",
      projectName: "Project Alpha - Revision 2",
      customerId: "customer-alpha",
      customerName: "Alpha Ltd",
      status: "Issued",
      items: [{ item: "Revision 2 item", qty: 1, unitCogs: 300 }],
      createdAt: "2025-02-03T08:00:00.000Z",
      updatedAt: "2025-02-04T08:00:00.000Z",
    }, {
      id: "alpha-base",
      number: "BOQ-250201",
      projectName: "Project Alpha",
      customerId: "customer-alpha",
      customerName: "Alpha Ltd",
      status: "Issued",
      items: [{ item: "Original item", qty: 1, unitCogs: 100 }],
      createdAt: "2025-02-01T08:00:00.000Z",
      updatedAt: "2025-02-01T09:00:00.000Z",
    }, {
      id: "alpha-rev-1",
      number: "BOQ-250202",
      projectName: "Project Alpha Rev1",
      status: "Issued",
      items: [{ item: "Revision 1 item", qty: 1, unitCogs: 200 }],
      createdAt: "2025-02-02T08:00:00.000Z",
      updatedAt: "2025-02-02T09:00:00.000Z",
    }, {
      id: "standalone",
      number: "BOQ-250204",
      projectName: "Standalone Project",
      status: "Issued",
      items: [],
      createdAt: "2025-02-05T08:00:00.000Z",
      updatedAt: "2025-02-05T09:00:00.000Z",
    }]),
  );
  store.setCurrentBoqId("alpha-rev-2");
  equal(
    store.migrateBoqRevisions({ silent: true }),
    true,
    "BOQ revision migration applied",
  );
  const revisionBoqs = store.list("boqs");
  equal(revisionBoqs.length, 2, "legacy revision BOQs grouped");
  const migratedRevisions = revisionBoqs.find((boq) =>
    boq.id === "alpha-base"
  );
  equal(migratedRevisions.projectName, "Project Alpha", "revision suffix removed");
  equal(migratedRevisions.number, "BOQ-250201", "base BOQ number retained");
  equal(
    store.get("boqs", "alpha-rev-2").id,
    "alpha-base",
    "legacy revision link resolves to grouped BOQ",
  );
  equal(
    store.getCurrentBoqId(),
    "alpha-base",
    "current BOQ link updated after revision grouping",
  );
  equal(migratedRevisions.revisions.length, 3, "revision snapshots retained");
  equal(
    migratedRevisions.revisions.map((revision) => revision.label).join(","),
    "R00,R01,R02",
    "legacy revision labels mapped",
  );
  equal(
    migratedRevisions.revisions[1].document.items[0].item,
    "Revision 1 item",
    "historical revision data retained",
  );
  equal(
    revisionBoqs.find((boq) => boq.id === "standalone").revisions[0].label,
    "R00",
    "existing issued BOQ receives baseline revision",
  );
  equal(
    store.migrateBoqRevisions({ silent: true }),
    false,
    "BOQ revision migration only runs once",
  );

  let lockedSaveFailed = false;
  try {
    store.saveBoqDraft({ ...migratedRevisions, projectName: "Not allowed" });
  } catch (_error) {
    lockedSaveFailed = true;
  }
  equal(lockedSaveFailed, true, "issued revision cannot be edited directly");
  const revisionDraft = store.createRevisionDraft("alpha-base");
  equal(revisionDraft.workingRevision, 3, "next revision draft created");
  const draftRegisterView = store.registerBoqView(revisionDraft);
  equal(draftRegisterView.status, "Draft", "register shows revision draft status");
  equal(
    draftRegisterView.displayRevisionNumber,
    3,
    "register shows working revision number",
  );
  const savedRevisionDraft = store.saveBoqDraft({
    ...revisionDraft,
    projectName: "Project Alpha Updated",
    date: revisionDraft.date || "2025-02-06",
    items: revisionDraft.items.map((item) => ({
      ...item,
      unit: item.unit || "Each",
      margin: Number(item.margin || 0),
    })),
  });
  equal(savedRevisionDraft.status, "Issued", "parent remains issued during draft");
  equal(savedRevisionDraft.hasDraftChanges, true, "draft changes tracked");
  equal(savedRevisionDraft.revisions.length, 3, "draft save creates no snapshot");
  equal(
    store.issuedBoqView(savedRevisionDraft).projectName,
    "Project Alpha",
    "register view remains on latest issued revision",
  );
  const issuedRevision = store.issueBoq(savedRevisionDraft, {
    note: "Updated scope",
    companySettings: { companyName: "Example Company" },
  });
  equal(issuedRevision.revisions.length, 4, "new issued revision added");
  equal(issuedRevision.revisions[3].label, "R03", "new revision label");
  equal(issuedRevision.workingRevision, null, "issued revision locked");
  const issuedRegisterView = store.registerBoqView(issuedRevision);
  equal(issuedRegisterView.status, "Issued", "register restores issued status");
  equal(
    issuedRegisterView.displayRevisionNumber,
    3,
    "register shows issued revision number",
  );
  const voidedRevision = store.voidLatestRevision(
    "alpha-base",
    "Issued with incorrect scope",
  );
  equal(voidedRevision.activeRevisionNumber, 2, "previous revision reactivated");
  equal(voidedRevision.revisions[3].state, "Voided", "latest revision voided");
  equal(
    store.voidLatestRevision("alpha-base", "Cannot void an older revision"),
    null,
    "older revision cannot be voided after a later revision",
  );
  const nextDraft = store.createRevisionDraft("alpha-base", 0);
  equal(nextDraft.workingRevision, 4, "voided revision number is not reused");
  equal(
    nextDraft.items[0].item,
    "Original item",
    "draft can be based on an earlier issued revision",
  );
  const discardedDraft = store.discardBoqDraft("alpha-base");
  equal(discardedDraft.workingRevision, null, "draft revision discarded");
  equal(discardedDraft.activeRevisionNumber, 2, "active revision restored");

  const firstDraft = store.saveBoqDraft({
    id: "first-issue",
    number: "BOQ-250205",
    projectName: "First Issue",
    status: "Draft",
    date: "2025-02-05",
    items: [{
      id: "first-issue-item",
      item: "First issue item",
      qty: 1,
      unit: "Each",
      unitCogs: 100,
      margin: 20,
    }],
  });
  const firstIssue = store.issueBoq(firstDraft);
  equal(firstIssue.revisions[0].label, "R00", "first issue starts at R00");
  equal(store.remove("boqs", "first-issue"), false, "issued BOQ cannot be deleted");
  const voidedFirstIssue = store.voidLatestRevision(
    "first-issue",
    "First issue withdrawn",
  );
  equal(voidedFirstIssue.status, "Draft", "voided R00 returns BOQ to draft");
  equal(voidedFirstIssue.workingRevision, 1, "next draft advances to R01");
  const discardedAfterVoid = store.discardBoqDraft("first-issue");
  equal(
    discardedAfterVoid.revisions[0].state,
    "Voided",
    "discarding draft preserves voided audit record",
  );
  equal(discardedAfterVoid.workingRevision, null, "numbered draft removed");
});

Deno.test("marks valid drafts as issued exactly once", () => {
  const store = window.BOQStore;
  store.setUser("mark-issued-user");

  const draft = store.saveBoqDraft({
    id: "mark-issued-boq",
    number: "BOQ-260801",
    projectName: "Mark Issued Project",
    status: "Draft",
    date: "2026-08-14",
    items: [{
      id: "mark-issued-item",
      item: "Managed service",
      qty: 2,
      unit: "Month",
      unitCogs: 100,
      margin: 20,
    }],
  });
  equal(
    store.validateBoqForIssue(draft).valid,
    true,
    "valid draft passes issue validation",
  );

  const issued = store.issueBoq(draft, { note: "Initial issue" });
  equal(issued.status, "Issued", "draft status becomes issued");
  equal(issued.revisions.length, 1, "initial issue creates one snapshot");
  equal(issued.revisions[0].label, "R00", "initial issue uses R00");
  equal(issued.workingRevision, null, "issued BOQ is locked");

  let duplicateFailed = false;
  try {
    store.issueBoq(issued);
  } catch (_error) {
    duplicateFailed = true;
  }
  equal(duplicateFailed, true, "duplicate issue action is rejected");
  equal(
    store.get("boqs", issued.id).revisions.length,
    1,
    "duplicate action creates no extra snapshot",
  );

  const revisionDraft = store.createRevisionDraft(issued.id);
  const revised = store.issueBoq({
    ...revisionDraft,
    items: revisionDraft.items.map((item) => ({ ...item, qty: 3 })),
  });
  equal(revised.revisions.length, 2, "revision draft creates one new snapshot");
  equal(revised.revisions[1].label, "R01", "revision draft issues as R01");

  const invalidDraft = store.saveBoqDraft({
    id: "invalid-issued-boq",
    number: "BOQ-260802",
    projectName: "Invalid Issue",
    status: "Draft",
    date: "2026-08-14",
    items: [{
      id: "invalid-issued-item",
      item: "",
      qty: 0,
      unit: "Each",
      unitCogs: 100,
      margin: 20,
    }],
  });
  const validation = store.validateBoqForIssue(invalidDraft);
  equal(validation.valid, false, "invalid item blocks issue validation");
  equal(validation.errors[0].field, "item", "invalid item is identified");

  let validationFailed = false;
  try {
    store.issueBoq(invalidDraft);
  } catch (_error) {
    validationFailed = true;
  }
  equal(validationFailed, true, "invalid draft cannot be issued");
  equal(
    store.get("boqs", invalidDraft.id).status,
    "Draft",
    "validation failure preserves draft status",
  );
  equal(
    store.get("boqs", invalidDraft.id).revisions.length,
    0,
    "validation failure creates no snapshot",
  );
});

Deno.test("creates a revision draft for a legacy sent BOQ", () => {
  const store = window.BOQStore;
  const userId = "legacy-revision-draft-user";
  const prefix = `boq-manager-v2:${userId}`;
  const createdAt = "2026-08-01T08:00:00.000Z";
  const updatedAt = "2026-08-02T09:00:00.000Z";
  store.setUser(userId);
  localStorage.setItem(`${prefix}:boqs`, JSON.stringify([{
    id: "legacy-sent-boq",
    number: "BOQ-260801",
    projectName: "Legacy Sent Project",
    customerId: "",
    customerName: "",
    status: "Sent",
    items: [{ id: "legacy-item", item: "Legacy item", qty: 1, unitCogs: 100 }],
    createdAt,
    updatedAt,
    revisions: [],
  }]));
  localStorage.setItem(`${prefix}:meta`, JSON.stringify({
    schemaVersion: 5,
    boqRevisionMigrationVersion: 3,
    clientUpdatedAt: Date.parse(updatedAt),
  }));

  const draft = store.createRevisionDraft("legacy-sent-boq");
  equal(Boolean(draft), true, "legacy revision draft created");
  equal(draft.status, "Issued", "legacy Sent status normalized to Issued");
  equal(draft.revisions.length, 1, "legacy R00 baseline created once");
  equal(draft.revisions[0].label, "R00", "legacy baseline labeled R00");
  equal(draft.revisions[0].state, "Issued", "legacy revision state normalized");
  equal(draft.activeRevisionNumber, 0, "legacy R00 remains active");
  equal(draft.workingRevision, 1, "new revision draft starts at R01");
  equal(draft.items[0].item, "Legacy item", "legacy BOQ content preserved");
  equal(
    store.createRevisionDraft("legacy-sent-boq"),
    null,
    "existing revision draft is not duplicated",
  );
  equal(store.list("boqs").length, 1, "legacy BOQ remains a single record");
});
