(function initializeBoqEditor() {
  const editor = document.querySelector("[data-boq-editor]");
  if (!editor) return;

  const calculations = window.BOQCalculations;
  const { calculateItem, calculateSummary, calculateCategorySummary } =
    calculations;
  const {
    formatCurrencyMarkup,
    formatCurrencyParts,
    formatPercent,
    formatNumberInput,
    parseNumberInput,
    formatNumberInputElementLive,
    escapeHtml,
    visibleRevisionLabel,
    collectUniqueTextValues,
    formatDate,
    formatDateTime,
    reorderItemsWithinCategory,
    reorderValues,
  } = window.BOQUtils;
  const store = window.BOQStore;
  let settings = store.getSettings();
  const editorPreferences = store.getLocalPreference("boq-editor", {});
  let currentRecordId = new URLSearchParams(location.search).get("id");
  let currentRecord = null;
  let items = [];
  let commission = 0;
  let categoryOrder = [];
  let dirty = false;
  let showCategorySubtotals = typeof editorPreferences.showCategorySubtotals ===
      "boolean"
    ? editorPreferences.showCategorySubtotals
    : settings.showCategorySubtotals !== false;
  let editItems = true;
  let currentView = "all";
  let reorderMode = false;
  let activeDrag = null;
  let pendingIssueNote = "";
  let pendingSaveContinuation = null;

  const desktopBody = editor.querySelector("[data-items-body]");
  const mobileList = editor.querySelector("[data-mobile-items]");
  const desktopTableWrap = editor.querySelector("[data-editor-table]");
  const currencySelect = document.querySelector("#boq-currency");
  const commissionInput = document.querySelector("[data-commission]");
  const commissionCurrency = document.querySelector(
    "[data-commission-currency]",
  );

  function catalogRecords() {
    return store.list("products").filter((product) =>
      product.status !== "Inactive"
    );
  }

  function catalogItem(product) {
    const productPricing = calculations.calculateProductPricing(product);
    return {
      sku: product.sku || "",
      item: product.name || "",
      description: "",
      qty: 1,
      unit: product.unit || "Each",
      unitCogs: Number(product.defaultCogs || 0),
      margin: Number(product.defaultMargin || 0),
      sellingOverride: productPricing.isManualSelling
        ? productPricing.unitSellingRaw
        : null,
      category: product.category || "Uncategorized",
    };
  }

  function currentCurrency() {
    return currencySelect?.value || settings.defaultCurrency || "IDR";
  }

  function currentDocumentVisibilitySettings() {
    return {
      showPricing: settings.showPricing !== false,
      showSku: settings.showSku === true,
      showUnitPricing: settings.showUnitPricing !== false,
    };
  }

  function taxOptions(source = settings) {
    return {
      taxEnabled: source.taxEnabled === true,
      taxRate: source.taxRate,
    };
  }

  function editorTaxOptions() {
    if (!isIssuedLocked()) return taxOptions();
    const revision = (currentRecord?.revisions || []).find((entry) =>
      Number(entry.number) === Number(currentRecord.activeRevisionNumber)
    );
    const storedSettings = revision?.companySettings || {};
    return taxOptions({
      taxEnabled: storedSettings.taxEnabled === true,
      taxRate: storedSettings.taxRate ?? 0,
    });
  }

  function localDate(date) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  function itemId() {
    return store.createId();
  }

  function normalizeItem(item) {
    return {
      id: item.id || itemId(),
      sku: item.sku || "",
      item: item.item || item.name || "",
      description: item.description || "",
      qty: Number(item.qty || 0),
      unit: item.unit || "Each",
      unitCogs: Number(item.unitCogs ?? item.price ?? 0),
      margin: Math.max(0, Math.min(Number(item.margin || 0), 99.99)),
      sellingOverride: item.sellingOverride === "" ||
          item.sellingOverride === undefined || item.sellingOverride === null
        ? null
        : Number(item.sellingOverride),
      category: item.category || "Uncategorized",
    };
  }

  function categories() {
    const present = [...new Set(items.map((item) =>
      item.category || "Uncategorized"
    ))];
    categoryOrder = [
      ...categoryOrder.filter((category) => present.includes(category)),
      ...present.filter((category) => !categoryOrder.includes(category)),
    ];
    return categoryOrder;
  }

  function populateRecordOptions() {
    const projectSuggestions = document.querySelector("#project-suggestions");
    const customerSelect = document.querySelector("#boq-customer");
    const projectNames = [...new Set(store.list("boqs").map((record) =>
      record.projectName?.trim()
    ).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    projectSuggestions.innerHTML = projectNames.map((name) =>
      `<option value="${escapeHtml(name)}"></option>`
    ).join("");
    customerSelect.innerHTML =
      '<option value="">No customer selected</option>' +
      store.list("customers").map((customer) =>
        `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.companyName)}</option>`
      ).join("");
  }

  function setFormValue(selector, value) {
    const control = document.querySelector(selector);
    if (control) control.value = value ?? "";
  }

  function initializeDocument(recordOverride) {
    populateRecordOptions();
    const record = recordOverride ||
      (currentRecordId ? store.get("boqs", currentRecordId) : null);
    currentRecord = record;
    if (record) {
      if (record.id !== currentRecordId) {
        currentRecordId = record.id;
        const params = new URLSearchParams(location.search);
        params.set("id", record.id);
        history.replaceState(null, "", `boq-editor.html?${params.toString()}`);
      }
      setFormValue("#boq-number", record.number);
      setFormValue(
        "#boq-status",
        record.workingRevision !== null
          ? "Draft"
          : ["Issued", "Won"].includes(record.status)
          ? record.status
          : "Draft",
      );
      setFormValue("#boq-project", record.projectName);
      setFormValue("#boq-customer", record.customerId);
      setFormValue("#boq-currency", record.currency || settings.defaultCurrency || "IDR");
      setFormValue("#boq-date", record.date);
      setFormValue("#boq-valid-until", record.validUntil);
      setFormValue("#boq-notes", record.notes);
      items = (record.items || []).map(normalizeItem);
      commission = Number(record.commission || 0);
      categoryOrder = Array.isArray(record.categoryOrder)
        ? record.categoryOrder.slice()
        : [];
      document.querySelector("[data-save-state]").textContent =
        record.workingRevision !== null
          ? `Draft changes for ${store.revisionLabel(record.workingRevision)}`
          : record.status === "Won"
          ? `${store.revisionLabel(record.activeRevisionNumber)} won and locked`
          : record.status === "Issued"
          ? `${store.revisionLabel(record.activeRevisionNumber)} issued and locked`
          : "All changes saved";
    } else {
      currentRecordId = null;
      items = [];
      commission = 0;
      categoryOrder = [];
      currentRecord = null;
      const today = new Date();
      const validUntil = new Date(today);
      validUntil.setDate(
        validUntil.getDate() + Number(settings.defaultValidity || 30),
      );
      setFormValue("#boq-number", store.nextNumber("boqs", "BOQ"));
      setFormValue("#boq-date", localDate(today));
      setFormValue("#boq-valid-until", localDate(validUntil));
      setFormValue("#boq-currency", settings.defaultCurrency || "IDR");
    }
    updateCommissionInput();
    updateEditorHeader();
    applyEditorMode();
  }

  function updateEditorHeader() {
    const projectName = document.querySelector("#boq-project").value.trim();
    const number = document.querySelector("#boq-number").value.trim();
    const selectedStatus = document.querySelector("#boq-status").value;
    const hasWorkingRevision = currentRecord?.workingRevision !== null &&
      currentRecord?.workingRevision !== undefined;
    const hasIssuedRevision = currentRecord?.activeRevisionNumber !== null &&
      currentRecord?.activeRevisionNumber !== undefined;
    const status = hasWorkingRevision
      ? "Draft"
      : currentRecord?.status === "Won"
      ? "Won"
      : hasIssuedRevision
      ? "Issued"
      : selectedStatus;
    document.querySelector("[data-editor-title]").textContent = projectName ||
      "New BOQ";
    document.querySelector("[data-editor-number]").textContent = number ||
      "New";
    const statusNode = document.querySelector("[data-editor-status]");
    statusNode.textContent = status;
    statusNode.className = `status status-${status.toLowerCase()}`;
    const customerPoNode = document.querySelector("[data-editor-customer-po]");
    const customerPoNumber = String(
      currentRecord?.customerPoNumber || "",
    ).trim();
    if (customerPoNode) {
      customerPoNode.hidden = status !== "Won" || !customerPoNumber;
      customerPoNode.textContent = status === "Won" && customerPoNumber
        ? customerPoNumber
        : "";
    }
    const revisionNode = document.querySelector("[data-editor-revision]");
    const revisionNumber = currentRecord?.workingRevision ??
      currentRecord?.activeRevisionNumber;
    if (revisionNode) {
      revisionNode.hidden = revisionNumber === null || revisionNumber === undefined;
      revisionNode.textContent = revisionNumber === null ||
          revisionNumber === undefined
        ? ""
        : `${store.revisionLabel(revisionNumber)}${
          currentRecord && currentRecord.workingRevision !== null ? " draft" : ""
        }`;
    }
  }

  function isIssuedLocked() {
    return Boolean(
      ["Issued", "Won"].includes(currentRecord?.status) &&
        currentRecord.workingRevision === null,
    );
  }

  function isRevisableIssued() {
    return Boolean(
      currentRecord?.status === "Issued" &&
        currentRecord.workingRevision === null,
    );
  }

  function isWonLocked() {
    return Boolean(
      currentRecord?.status === "Won" &&
        currentRecord.workingRevision === null,
    );
  }

  function canEditItems() {
    return editItems && !isIssuedLocked();
  }

  function hasUnpersistedRevisionDraft() {
    if (!currentRecordId || currentRecord?.workingRevision === null ||
        currentRecord?.workingRevision === undefined) return false;
    const storedRecord = store.get("boqs", currentRecordId);
    return storedRecord?.workingRevision === null ||
      storedRecord?.workingRevision === undefined;
  }

  function applyEditorMode() {
    const locked = isIssuedLocked();
    const revisableIssued = isRevisableIssued();
    const won = isWonLocked();
    editor.classList.toggle("editor-readonly", locked);
    document.body.classList.toggle("boq-won", won);
    document.querySelectorAll("#boq-info input, #boq-info select, #boq-info textarea")
      .forEach((control) => control.disabled = locked);
    const statusControl = document.querySelector("#boq-status");
    if (statusControl) statusControl.disabled = true;
    const numberInput = document.querySelector("#boq-number");
    if (numberInput && currentRecord?.revisions?.length) {
      numberInput.disabled = true;
    }
    if (commissionInput) commissionInput.disabled = locked;
    document.querySelectorAll("[data-save]").forEach((button) =>
      button.hidden = locked
    );
    document.querySelectorAll("[data-create-revision]").forEach((button) =>
      button.hidden = !revisableIssued
    );
    document.querySelectorAll("[data-mark-won]").forEach((button) =>
      button.hidden = !revisableIssued
    );
    document.querySelectorAll("[data-revert-issued]").forEach((button) =>
      button.hidden = !won
    );
    document.querySelectorAll("[data-edit-customer-po]").forEach((button) =>
      button.hidden = !won
    );
    document.querySelectorAll("[data-open-revision-history]").forEach((button) =>
      button.hidden = !currentRecord?.revisions?.length
    );
    document.querySelectorAll("[data-discard-revision]").forEach((button) =>
      button.hidden = !(currentRecord?.workingRevision !== null &&
        currentRecord?.revisions?.length)
    );
    const mobileSaveBar = document.querySelector(".mobile-save-bar");
    if (mobileSaveBar) mobileSaveBar.hidden = won;
    const itemsEditable = canEditItems();
    editor.classList.toggle("items-readonly", !itemsEditable);
    editor.querySelectorAll(
      "[data-item-input], [data-item-action], .row-actions [data-menu-trigger], " +
        "[data-drag-handle], [data-category-drag-handle], " +
        "[data-confirm-event=\"boq:delete-item\"], [data-add-custom], " +
        "[data-open-modal=\"catalog-modal\"], [data-toggle-reorder]",
    ).forEach((control) => control.disabled = !itemsEditable);
    document.querySelectorAll("[data-add-product]")
      .forEach((control) => control.disabled = !itemsEditable);
    const editButton = document.querySelector("[data-toggle-edit]");
    if (editButton) {
      editButton.disabled = locked;
      editButton.textContent = itemsEditable ? "Edit on" : "Edit off";
      editButton.setAttribute("aria-pressed", String(itemsEditable));
    }
    if (!itemsEditable && reorderMode) {
      reorderMode = false;
    }
    applyReorderState();
  }

  function clearIssueValidation() {
    editor.querySelectorAll('[aria-invalid="true"]')
      .forEach((control) => control.removeAttribute("aria-invalid"));
  }

  function showIssueValidation(validation) {
    clearIssueValidation();
    const error = validation.errors[0];
    if (!error) return;
    const informationFields = {
      number: "#boq-number",
      projectName: "#boq-project",
      date: "#boq-date",
    };
    let controls = [];
    if (error.itemId) {
      controls = [...editor.querySelectorAll(
        `[data-item-id="${CSS.escape(error.itemId)}"]` +
          `[data-field="${CSS.escape(error.field)}"]`,
      )];
    } else if (informationFields[error.field]) {
      const control = document.querySelector(informationFields[error.field]);
      if (control) controls = [control];
    }
    controls.forEach((control) => control.setAttribute("aria-invalid", "true"));
    const focusTarget = controls.find((control) => control.offsetParent !== null) ||
      controls[0];
    focusTarget?.focus();
    window.BOQApp.showToast(validation.message, "error");
  }

  function revisionDate(value) {
    return formatDateTime(value, settings.dateFormat, "Unknown date");
  }

  function revisionExportData(number) {
    const revision = store.revisionHistory(currentRecordId || currentRecord)
      .find((entry) => entry.number === Number(number));
    if (!revision) return null;
    const isDraft = revision.state === "Draft";
    let documentValue = {
      ...revision.document,
      status: isDraft ? "Draft" : "Issued",
      customerPoNumber: currentRecord?.customerPoNumber || "",
      wonAt: currentRecord?.wonAt || "",
      revisionNumber: revision.number,
      revisionLabel: visibleRevisionLabel(revision.label),
      revisionState: revision.state,
      revisionNote: revision.note,
      issuedAt: revision.issuedAt || "",
    };
    const revisionItems = (documentValue.items || []).map(normalizeItem);
    const storedSettings = revision.companySettings || {};
    const revisionSettingsBase = isDraft
      ? { ...settings }
      : {
        ...settings,
        ...storedSettings,
        taxEnabled: storedSettings.taxEnabled === true,
        taxRate: storedSettings.taxRate ?? 0,
        taxRegistrationNumber: storedSettings.taxRegistrationNumber || "",
      };
    revisionSettingsBase.rounding = revision.calculation?.rounding ||
      storedSettings.rounding || settings.rounding;
    revisionSettingsBase.numberFormat = revision.calculation?.numberFormat ||
      storedSettings.numberFormat || settings.numberFormat;
    const revisionSettings = {
      ...revisionSettingsBase,
      ...currentDocumentVisibilitySettings(),
    };
    documentValue = {
      ...documentValue,
      ...calculateSummary(revisionItems, {
        commission: documentValue.commission,
        rounding: revisionSettings.rounding,
        ...taxOptions(revisionSettings),
      }),
    };
    const presentCategories = [...new Set(revisionItems.map((item) =>
      item.category || "Uncategorized"
    ))];
    const savedOrder = Array.isArray(documentValue.categoryOrder)
      ? documentValue.categoryOrder
      : [];
    return {
      document: documentValue,
      items: revisionItems,
      categories: [
        ...savedOrder.filter((category) => presentCategories.includes(category)),
        ...presentCategories.filter((category) => !savedOrder.includes(category)),
      ],
      settings: revisionSettings,
    };
  }

  function currentExportData() {
    if (isIssuedLocked() && currentRecord?.activeRevisionNumber !== null) {
      return revisionExportData(currentRecord.activeRevisionNumber);
    }
    const documentValue = documentPayload();
    return {
      document: documentValue,
      items: items.map((item) => ({ ...item })),
      categories: categories().slice(),
      settings: { ...settings },
    };
  }

  function renderRevisionHistory() {
    const host = document.querySelector("[data-revision-list]");
    if (!host) return;
    const revisions = currentRecord?.revisions || [];
    const entries = store.revisionHistory(currentRecordId || currentRecord);
    const latest = revisions.at(-1);
    host.innerHTML = entries.length
      ? [...entries].reverse().map((revision) => {
        const isDraft = revision.state === "Draft";
        const canVoid = isRevisableIssued() && latest?.id === revision.id &&
          revision.state === "Issued" &&
          currentRecord?.workingRevision === null;
        const canCreateDraft = isRevisableIssued() &&
          revision.state === "Issued";
        const reason = isDraft
          ? revision.draftBaseRevisionNumber === null ||
              revision.draftBaseRevisionNumber === undefined
            ? "Saved draft changes"
            : `Saved draft based on ${
              store.revisionLabel(revision.draftBaseRevisionNumber)
            }`
          : revision.state === "Voided"
          ? `Voided ${revisionDate(revision.voidedAt)} · ${revision.voidReason}`
          : revision.note || "No revision note";
        const revisionData = revisionExportData(revision.number);
        const revisionCurrency = revisionData?.document.currency ||
          currentCurrency();
        const revisionProject = revisionData?.document.projectName ||
          "No project";
        const grandTotal = formatCurrencyMarkup(
          revisionData?.document.grandTotal ??
            revisionData?.document.totalSelling ?? 0,
          revisionCurrency,
          undefined,
          revisionData?.settings.numberFormat || settings.numberFormat,
        );
        const grossMargin = formatPercent(
          revisionData?.document.marginPercent || 0,
          revisionData?.settings.numberFormat || settings.numberFormat,
        );
        return `<article class="revision-entry${
          revision.state === "Voided"
            ? " is-voided"
            : isDraft
            ? " is-draft"
            : ""
        }"><div class="revision-entry-main"><div class="revision-entry-heading"><strong>${escapeHtml(revision.label)}</strong><span class="status status-${
          revision.state === "Voided"
            ? "inactive"
            : isDraft
            ? "draft"
            : "issued"
        }">${escapeHtml(revision.state)}</span><span class="muted text-sm">${escapeHtml(revisionDate(isDraft ? revision.savedAt : revision.issuedAt))}</span></div><div class="revision-entry-project"><strong>${escapeHtml(revisionProject)}</strong></div><p class="revision-entry-note">${escapeHtml(reason)}</p></div><div class="revision-entry-total"><strong>${grandTotal}</strong><span class="revision-entry-margin">Gross margin ${grossMargin}</span></div><div class="revision-entry-actions"><button class="button button-secondary button-sm" type="button" data-preview-revision="${revision.number}">Preview</button><button class="button button-ghost button-sm" type="button" data-download-revision-excel="${revision.number}">Excel</button><button class="button button-ghost button-sm" type="button" data-download-revision-pdf="${revision.number}">PDF</button><button class="button button-ghost button-sm" type="button" data-download-revision-word="${revision.number}">Word</button>${
          canVoid
            ? `<button class="button button-ghost button-sm danger-text" type="button" data-void-revision="${revision.number}">Void</button>`
            : ""
        }${
          canCreateDraft
            ? `<button class="button button-secondary button-sm" type="button" data-create-revision-from="${revision.number}">Use as Draft</button>`
            : ""
        }</div></article>`;
      }).join("")
      : '<div class="empty-state"><div class="empty-state-content"><h3>No Revision History</h3><p>Saved revision drafts and issued snapshots will appear here.</p></div></div>';
    const compare = document.querySelector("[data-revision-compare]");
    const from = document.querySelector("[data-compare-from]");
    const to = document.querySelector("[data-compare-to]");
    if (compare) compare.hidden = entries.length < 2;
    if (entries.length >= 2 && from && to) {
      const options = entries.map((revision) =>
        `<option value="${revision.number}">${escapeHtml(revision.label)} · ${escapeHtml(revision.state)}</option>`
      ).join("");
      from.innerHTML = options;
      to.innerHTML = options;
      from.value = String(entries.at(-2).number);
      to.value = String(entries.at(-1).number);
      renderRevisionComparison(from.value, to.value);
    }
  }

  function comparisonItemKey(item) {
    const partNumber = String(item.sku || "").trim().toLowerCase();
    if (partNumber) return `part:${partNumber}`;
    return `item:${String(item.item || "").trim().replace(/\s+/g, " ").toLowerCase()}`;
  }

  function comparisonItemValue(item) {
    return JSON.stringify({
      item: String(item.item || "").trim(),
      category: item.category || "Uncategorized",
      qty: Number(item.qty || 0),
      unit: item.unit || "",
      unitCogs: Number(item.unitCogs || 0),
      margin: Number(item.margin || 0),
      sellingOverride: item.sellingOverride === null ||
          item.sellingOverride === undefined
        ? null
        : Number(item.sellingOverride),
    });
  }

  function renderRevisionComparison(fromNumber, toNumber) {
    const host = document.querySelector("[data-revision-compare-result]");
    const fromRevision = revisionExportData(fromNumber);
    const toRevision = revisionExportData(toNumber);
    if (!host || !fromRevision || !toRevision) return;
    const fromItems = fromRevision.items || [];
    const toItems = toRevision.items || [];
    const matchedIndexes = new Set();
    let removed = 0;
    let changed = 0;
    fromItems.forEach((item) => {
      const key = comparisonItemKey(item);
      const matchIndex = toItems.findIndex((candidate, index) =>
        !matchedIndexes.has(index) && comparisonItemKey(candidate) === key
      );
      if (matchIndex < 0) {
        removed += 1;
        return;
      }
      matchedIndexes.add(matchIndex);
      if (comparisonItemValue(item) !== comparisonItemValue(toItems[matchIndex])) {
        changed += 1;
      }
    });
    const added = toItems.length - matchedIndexes.size;
    const fromSummary = calculateSummary(fromItems, {
      commission: fromRevision.document.commission,
      rounding: fromRevision.settings.rounding,
    });
    const toSummary = calculateSummary(toItems, {
      commission: toRevision.document.commission,
      rounding: toRevision.settings.rounding,
    });
    const currency = toRevision.document.currency || currentCurrency();
    const numberFormat = toRevision.settings.numberFormat ||
      settings.numberFormat;
    const marginChange = toSummary.marginPercent - fromSummary.marginPercent;
    host.hidden = false;
    host.innerHTML = `<div class="revision-change"><span>Item changes</span><strong>+${added} / −${removed} / ${changed} updated</strong></div><div class="revision-change"><span>Total selling change</span><strong>${formatCurrencyMarkup(
      toSummary.totalSelling - fromSummary.totalSelling,
      currency,
      undefined,
      numberFormat,
    )}</strong></div><div class="revision-change"><span>Total COGS change</span><strong>${formatCurrencyMarkup(
      toSummary.totalCogs - fromSummary.totalCogs,
      currency,
      undefined,
      numberFormat,
    )}</strong></div><div class="revision-change"><span>Gross margin change</span><strong>${
      marginChange > 0 ? "+" : ""
    }${formatPercent(marginChange, numberFormat)}</strong></div>`;
  }

  function unitOptions(value) {
    const defaults = [
      "Each",
      "Lot",
      "Meter",
      "Hour",
      "Day",
      "Month",
      "Unit",
      "Set",
      "M2",
      "M3",
      "Kg",
    ];
    const catalogUnits = store.list("products").map((product) => product.unit)
      .filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)));
    const itemUnits = items.map((item) => item.unit).filter(Boolean);
    const options = collectUniqueTextValues(
      defaults,
      catalogUnits,
      itemUnits,
      value,
    );
    const selected = String(value || "").trim().toLowerCase();
    return options.map((unit) =>
      `<option${unit.toLowerCase() === selected ? " selected" : ""}>${escapeHtml(unit)}</option>`
    ).join("");
  }

  function itemDragHandle(item) {
    const itemName = escapeHtml(item.item || "item");
    return `<button class="icon-button drag-handle" type="button" data-drag-handle data-item-id="${item.id}" aria-label="Drag ${itemName} to reorder. Use arrow keys for keyboard reordering." title="Drag to reorder"><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M9 7h.01M15 7h.01M9 12h.01M15 12h.01M9 17h.01M15 17h.01" /></svg></button>`;
  }

  function categoryDragHandle(category) {
    const categoryName = escapeHtml(category);
    return `<button class="icon-button drag-handle" type="button" data-category-drag-handle data-category="${categoryName}" aria-label="Drag ${categoryName} category to reorder. Use arrow keys for keyboard reordering." title="Drag category to reorder"><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M9 7h.01M15 7h.01M9 12h.01M15 12h.01M9 17h.01M15 17h.01" /></svg></button>`;
  }

  function desktopRow(item, displayIndex) {
    const calc = calculateItem(item);
    const sellingValue = calc.isManualSelling
      ? item.sellingOverride
      : calc.unitSelling;
    return `<tr data-item-row data-item-id="${item.id}">
      <td class="align-right item-order-cell editor-sticky-column editor-sticky-index">${itemDragHandle(item)}<span class="subtle number item-index">${displayIndex}</span></td>
      <td><input class="editor-input" data-item-input data-field="sku" data-item-id="${item.id}" value="${escapeHtml(item.sku || "")}" aria-label="Part number, row ${displayIndex}"></td>
      <td class="editor-sticky-column editor-sticky-item"><input class="editor-input" list="product-suggestions" data-item-input data-field="item" data-item-id="${item.id}" value="${escapeHtml(item.item)}" aria-label="Item name, row ${displayIndex}"></td>
      <td><input class="editor-input" data-item-input data-field="category" data-item-id="${item.id}" value="${escapeHtml(item.category)}" aria-label="Category, row ${displayIndex}"></td>
      <td class="editor-sticky-column editor-sticky-qty"><input class="editor-input numeric" data-item-input data-field="qty" data-item-id="${item.id}" type="number" min="0" step="0.01" value="${item.qty}" aria-label="Quantity, row ${displayIndex}"></td>
      <td class="editor-sticky-column editor-sticky-unit"><select class="editor-input" data-item-input data-field="unit" data-item-id="${item.id}" aria-label="Unit, row ${displayIndex}">${unitOptions(item.unit)}</select></td>
      <td class="column-cogs column-price"><input class="editor-input numeric" data-item-input data-number-input data-field="unitCogs" data-item-id="${item.id}" type="text" inputmode="decimal" value="${escapeHtml(formatNumberInput(item.unitCogs))}" aria-label="Unit COGS, row ${displayIndex}"></td>
      <td class="calculated-cell column-cogs column-price" data-item-output="totalCogs">${formatCurrencyMarkup(calc.totalCogs, currentCurrency())}</td>
      <td class="column-margin column-price"><input class="editor-input numeric" data-item-input data-field="margin" data-item-id="${item.id}" type="number" min="0" max="99.99" step="0.1" value="${item.margin}" aria-label="Gross margin percentage, row ${displayIndex}"></td>
      <td class="column-selling column-price"><input class="editor-input numeric${calc.isManualSelling ? " is-manual" : ""}" data-item-input data-number-input data-field="sellingOverride" data-item-id="${item.id}" type="text" inputmode="decimal" value="${escapeHtml(formatNumberInput(sellingValue))}" aria-label="Unit selling price, row ${displayIndex}"></td>
      <td class="calculated-cell column-selling column-price" data-item-output="totalSelling">${formatCurrencyMarkup(calc.totalSelling, currentCurrency())}</td>
      <td><div class="row-actions"><div class="menu-wrap"><button class="icon-button" type="button" data-menu-trigger aria-expanded="false" aria-label="More actions for ${escapeHtml(item.item)}">•••</button><div class="dropdown-menu" hidden><button class="menu-item" type="button" data-item-action="duplicate" data-item-id="${item.id}">Duplicate item</button><button class="menu-item danger-text" type="button" data-confirm data-confirm-event="boq:delete-item" data-target-id="${item.id}" data-confirm-title="Delete ${escapeHtml(item.item || "item")}?" data-confirm-message="This item will be removed and all totals recalculated.">Delete item</button></div></div></div></td>
    </tr>`;
  }

  function categoryDesktopHeader(category) {
    return `<tr class="editor-category-row" data-category-row data-category="${escapeHtml(category)}"><td colspan="12"><div class="editor-category-sticky"><span class="category-title">${categoryDragHandle(category)}<strong>${escapeHtml(category)}</strong></span></div></td></tr>`;
  }

  function categorySubtotalRow(category) {
    if (!showCategorySubtotals) return "";
    const summary = calculateCategorySummary(items, category, { commission: 0 });
    return `<tr class="category-subtotal-row" data-category-subtotal="${escapeHtml(category)}"><td class="editor-sticky-column editor-sticky-index category-subtotal-anchor"><div class="category-subtotal-sticky">Subtotal</div></td><td></td><td class="editor-sticky-column editor-sticky-item"></td><td></td><td class="editor-sticky-column editor-sticky-qty"></td><td class="editor-sticky-column editor-sticky-unit"></td><td class="column-cogs column-price"></td><td class="align-right column-cogs column-price" data-category-total="cogs">${formatCurrencyMarkup(summary.totalCogs, currentCurrency())}</td><td class="column-margin column-price"></td><td class="column-selling column-price"></td><td class="align-right column-selling column-price" data-category-total="selling">${formatCurrencyMarkup(summary.totalSelling, currentCurrency())}</td><td></td></tr>`;
  }

  function mobileCard(item, displayIndex) {
    const calc = calculateItem(item);
    const sellingValue = calc.isManualSelling
      ? item.sellingOverride
      : calc.unitSelling;
    return `<article class="mobile-item-card" data-item-row data-item-id="${item.id}">
      <div class="mobile-item-head">${itemDragHandle(item)}<div class="mobile-item-main"><span class="subtle text-sm">Item ${displayIndex}</span><input class="editor-input text-medium" list="product-suggestions" data-item-input data-field="item" data-item-id="${item.id}" value="${escapeHtml(item.item)}" aria-label="Item name, item ${displayIndex}"></div><div class="row-actions"><button class="icon-button" type="button" data-item-action="duplicate" data-item-id="${item.id}" aria-label="Duplicate ${escapeHtml(item.item)}">⧉</button><button class="icon-button danger-text" type="button" data-confirm data-confirm-event="boq:delete-item" data-target-id="${item.id}" data-confirm-title="Delete ${escapeHtml(item.item || "item")}?" data-confirm-message="This item will be removed and totals recalculated." aria-label="Delete ${escapeHtml(item.item)}">×</button></div></div>
      <div class="mobile-item-body">
        <label class="field"><span class="field-label">Part Number</span><input class="input input-sm" data-item-input data-field="sku" data-item-id="${item.id}" value="${escapeHtml(item.sku || "")}"></label>
        <label class="field"><span class="field-label">Category</span><input class="input input-sm" data-item-input data-field="category" data-item-id="${item.id}" value="${escapeHtml(item.category)}"></label>
        <label class="field"><span class="field-label">Unit</span><select class="select select-sm" data-item-input data-field="unit" data-item-id="${item.id}">${unitOptions(item.unit)}</select></label>
        <label class="field"><span class="field-label">Quantity</span><input class="input input-sm align-right" data-item-input data-field="qty" data-item-id="${item.id}" type="number" min="0" step="0.01" value="${item.qty}"></label>
        <label class="field column-cogs column-price"><span class="field-label">Unit COGS</span><input class="input input-sm align-right" data-item-input data-number-input data-field="unitCogs" data-item-id="${item.id}" type="text" inputmode="decimal" value="${escapeHtml(formatNumberInput(item.unitCogs))}"></label>
        <label class="field column-margin column-price"><span class="field-label">Gross margin %</span><input class="input input-sm align-right" data-item-input data-field="margin" data-item-id="${item.id}" type="number" min="0" max="99.99" step="0.1" value="${item.margin}"></label>
        <label class="field column-selling column-price"><span class="field-label">Unit selling <small>(edit to override)</small></span><input class="input input-sm align-right${calc.isManualSelling ? " is-manual" : ""}" data-item-input data-number-input data-field="sellingOverride" data-item-id="${item.id}" type="text" inputmode="decimal" value="${escapeHtml(formatNumberInput(sellingValue))}"></label>
        <div class="mobile-item-total column-selling column-price"><span class="muted">Total selling</span><strong data-item-output="totalSelling">${formatCurrencyMarkup(calc.totalSelling, currentCurrency())}</strong></div>
      </div>
    </article>`;
  }

  function renderItems() {
    const categoryList = categories();
    let displayIndex = 0;
    desktopBody.innerHTML = categoryList.map((category) => {
      const categoryItems = items.filter((item) =>
        (item.category || "Uncategorized") === category
      );
      return categoryDesktopHeader(category) +
        categoryItems.map((item) => desktopRow(item, ++displayIndex)).join("") +
        categorySubtotalRow(category);
    }).join("");
    displayIndex = 0;
    mobileList.innerHTML = categoryList.map((category) => {
      const categoryItems = items.filter((item) =>
        (item.category || "Uncategorized") === category
      );
      return `<section class="mobile-category-section"><header data-category-row data-category="${escapeHtml(category)}"><span class="category-title">${categoryDragHandle(category)}<strong>${escapeHtml(category)}</strong></span></header>${categoryItems.map((item) => mobileCard(item, ++displayIndex)).join("")}</section>`;
    }).join("");
    desktopTableWrap.hidden = items.length === 0;
    editor.querySelector("[data-items-empty]").hidden = items.length > 0;
    editor.querySelector("[data-item-count]").textContent =
      `${items.length} item${items.length === 1 ? "" : "s"}`;
    applyViewState();
    updateSummary();
    applyEditorMode();
    updateStickyColumnsState();
  }

  function updateStickyColumnsState() {
    const table = desktopTableWrap?.querySelector(".editor-table");
    const unitHeader = table?.querySelector("thead .editor-sticky-unit");
    if (!table || !unitHeader || desktopTableWrap.hidden ||
        desktopTableWrap.offsetParent === null) {
      table?.classList.remove("sticky-columns-active");
      table?.style.removeProperty("--editor-sticky-boundary-width");
      return;
    }
    const precedingHeaders = [...unitHeader.parentElement.cells].slice(
      0,
      unitHeader.cellIndex,
    );
    const activationPoint = precedingHeaders
      .filter((header) =>
        !header.classList.contains("editor-sticky-column") &&
        getComputedStyle(header).display !== "none"
      )
      .reduce(
        (width, header) => width + header.getBoundingClientRect().width,
        0,
      );
    const isActive = desktopTableWrap.scrollLeft > 0 &&
      desktopTableWrap.scrollLeft >= activationPoint - 1;
    table.classList.toggle("sticky-columns-active", isActive);
    if (isActive) {
      const boundaryWidth = unitHeader.getBoundingClientRect().right -
        desktopTableWrap.getBoundingClientRect().left;
      table.style.setProperty(
        "--editor-sticky-boundary-width",
        `${boundaryWidth}px`,
      );
    } else {
      table.style.removeProperty("--editor-sticky-boundary-width");
    }
  }

  function redirectItemInputHorizontalScroll(event) {
    const input = event.target.closest(".editor-table [data-item-input]");
    if (!input || desktopTableWrap.hidden) return;
    const horizontalDelta = event.deltaX ||
      (event.shiftKey ? event.deltaY : 0);
    if (!horizontalDelta ||
        (!event.shiftKey && Math.abs(event.deltaX) <= Math.abs(event.deltaY))) {
      return;
    }
    const deltaScale = event.deltaMode === 1
      ? 16
      : event.deltaMode === 2
      ? desktopTableWrap.clientWidth
      : 1;
    event.preventDefault();
    desktopTableWrap.scrollLeft += horizontalDelta * deltaScale;
  }

  function syncItem(item) {
    const calc = calculateItem(item);
    document.querySelectorAll(`[data-item-row][data-item-id="${CSS.escape(item.id)}"]`)
      .forEach((row) => {
        row.querySelectorAll('[data-item-output="totalCogs"]').forEach((cell) =>
          cell.innerHTML = formatCurrencyMarkup(calc.totalCogs, currentCurrency())
        );
        row.querySelectorAll('[data-item-output="totalSelling"]').forEach((cell) =>
          cell.innerHTML = formatCurrencyMarkup(calc.totalSelling, currentCurrency())
        );
        row.querySelectorAll('[data-field="unitCogs"]').forEach((input) => {
          if (document.activeElement !== input) {
            input.value = formatNumberInput(item.unitCogs);
          }
        });
        row.querySelectorAll('[data-field="sellingOverride"]').forEach((input) => {
          input.classList.toggle("is-manual", calc.isManualSelling);
          if (document.activeElement !== input) {
            input.value = formatNumberInput(
              calc.isManualSelling ? item.sellingOverride : calc.unitSelling,
            );
          }
        });
      });
    updateSummary();
    updateCategorySubtotal(item.category || "Uncategorized");
  }

  function updateCategorySubtotal(category) {
    const summary = calculateCategorySummary(items, category);
    document.querySelectorAll(`[data-category-subtotal="${CSS.escape(category)}"]`)
      .forEach((row) => {
        const cogs = row.querySelector('[data-category-total="cogs"]');
        const selling = row.querySelector('[data-category-total="selling"]');
        if (cogs) cogs.innerHTML = formatCurrencyMarkup(summary.totalCogs, currentCurrency());
        if (selling) selling.innerHTML = formatCurrencyMarkup(summary.totalSelling, currentCurrency());
      });
  }

  function updateSummary() {
    const summary = calculateSummary(items, {
      commission,
      ...editorTaxOptions(),
    });
    updateCommissionInput();
    const values = {
      totalCogs: formatCurrencyMarkup(summary.totalCogs, currentCurrency()),
      totalSelling: formatCurrencyMarkup(summary.totalSelling, currentCurrency()),
      taxValue: formatCurrencyMarkup(summary.taxValue, currentCurrency()),
      finalTotal: formatCurrencyMarkup(summary.grandTotal, currentCurrency()),
      marginValue: formatCurrencyMarkup(summary.marginValue, currentCurrency()),
      marginPercent: formatPercent(summary.marginPercent),
    };
    Object.entries(values).forEach(([key, value]) =>
      document.querySelectorAll(`[data-summary="${key}"]`).forEach((element) =>
        element.innerHTML = value
      )
    );
    document.querySelectorAll("[data-tax-summary-row]").forEach((element) => {
      element.hidden = !summary.taxEnabled;
    });
    document.querySelectorAll("[data-summary-tax-rate]").forEach((element) => {
      element.textContent = `(${formatPercent(summary.taxRate)})`;
    });
    document.querySelectorAll("[data-summary-total-label]").forEach((element) => {
      element.textContent = summary.taxEnabled ? "Grand total" : "Total selling";
    });
    const summaryMeta = document.querySelector("[data-summary-meta]");
    if (summaryMeta) {
      summaryMeta.textContent = summary.taxEnabled
        ? "Gross profit is calculated after commission. Tax does not affect margin."
        : "Gross profit is calculated after commission.";
    }
  }

  function updateCommissionInput() {
    if (commissionCurrency) {
      commissionCurrency.textContent = formatCurrencyParts(
        commission,
        currentCurrency(),
      ).symbol;
    }
    if (commissionInput && document.activeElement !== commissionInput) {
      commissionInput.value = formatNumberInput(commission);
    }
  }

  function documentPayload() {
    const projectName = document.querySelector("#boq-project").value.trim();
    const customerSelect = document.querySelector("#boq-customer");
    const summary = calculateSummary(items, {
      commission,
      ...taxOptions(),
    });
    const revisionNumber = currentRecord?.workingRevision ??
      currentRecord?.activeRevisionNumber;
    return {
      number: document.querySelector("#boq-number").value.trim(),
      status: document.querySelector("#boq-status").value,
      projectName,
      customerId: customerSelect.value,
      customerName: customerSelect.value
        ? customerSelect.selectedOptions[0]?.text || ""
        : "",
      currency: currentCurrency(),
      date: document.querySelector("#boq-date").value,
      validUntil: document.querySelector("#boq-valid-until").value,
      notes: document.querySelector("#boq-notes").value.trim(),
      customerPoNumber: currentRecord?.customerPoNumber || "",
      wonAt: currentRecord?.wonAt || "",
      items: items.map(({ id, ...item }) => ({ ...item })),
      commission,
      categoryOrder: categoryOrder.slice(),
      revisionNumber,
      revisionLabel: revisionNumber === null || revisionNumber === undefined
        ? ""
        : visibleRevisionLabel(store.revisionLabel(revisionNumber)),
      revisionState: ["Issued", "Won"].includes(
          document.querySelector("#boq-status").value,
        )
        ? "Issued"
        : "Draft",
      ...summary,
    };
  }

  function markDirty() {
    dirty = true;
    document.querySelectorAll("[data-save-state]").forEach((element) =>
      element.textContent = "Unsaved changes"
    );
  }

  function addItem(source = {}) {
    if (!canEditItems()) return null;
    const item = normalizeItem({
      qty: 1,
      unit: "Each",
      margin: Number(settings.defaultMargin || 0),
      category: "Uncategorized",
      ...source,
      id: itemId(),
    });
    items.push(item);
    renderItems();
    markDirty();
    window.BOQApp.showToast(
      source.item ? `${source.item} added.` : "Custom item added.",
    );
    return item;
  }

  function focusDesktopItemField(id, field = "item") {
    requestAnimationFrame(() => {
      const input = editor.querySelector(
        `.editor-table [data-item-input][data-item-id="${
          CSS.escape(id)
        }"][data-field="${CSS.escape(field)}"]`,
      );
      input?.focus();
      input?.select?.();
    });
  }

  function duplicateItem(id) {
    if (!canEditItems()) return;
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return;
    const duplicate = {
      ...items[index],
      id: itemId(),
      sku: items[index].sku,
      item: `${items[index].item} (Copy)`,
    };
    items.splice(index + 1, 0, duplicate);
    renderItems();
    markDirty();
  }

  function moveItem(id, direction) {
    if (!canEditItems()) return;
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    const peers = items.filter((entry) => entry.category === item.category);
    const peerIndex = peers.findIndex((entry) => entry.id === id);
    const destination = peers[peerIndex + direction];
    if (!destination) return;
    const sourceIndex = items.indexOf(item);
    const destinationIndex = items.indexOf(destination);
    [items[sourceIndex], items[destinationIndex]] =
      [items[destinationIndex], items[sourceIndex]];
    renderItems();
    markDirty();
    requestAnimationFrame(() => {
      const handles = [...editor.querySelectorAll(
        `[data-drag-handle][data-item-id="${CSS.escape(id)}"]`,
      )];
      handles.find((handle) => handle.offsetParent !== null)?.focus();
    });
  }

  function reorderItem(itemId, targetId, position) {
    if (!canEditItems()) return false;
    const reordered = reorderItemsWithinCategory(
      items,
      itemId,
      targetId,
      position,
    );
    if (!reordered.changed) return false;
    items = reordered.items;
    renderItems();
    markDirty();
    return true;
  }

  function moveCategory(category, direction) {
    if (!canEditItems()) return;
    const index = categories().indexOf(category);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= categoryOrder.length) {
      return;
    }
    [categoryOrder[index], categoryOrder[destination]] =
      [categoryOrder[destination], categoryOrder[index]];
    renderItems();
    markDirty();
    requestAnimationFrame(() => {
      const handles = [...editor.querySelectorAll(
        `[data-category-drag-handle][data-category="${CSS.escape(category)}"]`,
      )];
      handles.find((handle) => handle.offsetParent !== null)?.focus();
    });
  }

  function reorderCategory(category, targetCategory, position) {
    if (!canEditItems()) return false;
    categories();
    const reordered = reorderValues(
      categoryOrder,
      category,
      targetCategory,
      position,
    );
    if (!reordered.changed) return false;
    categoryOrder = reordered.values;
    renderItems();
    markDirty();
    return true;
  }

  function clearDropIndicators() {
    editor.querySelectorAll(".is-dragging, .drop-before, .drop-after")
      .forEach((element) =>
        element.classList.remove("is-dragging", "drop-before", "drop-after")
      );
  }

  function clearDragState() {
    clearDropIndicators();
    editor.classList.remove("drag-in-progress");
    activeDrag = null;
  }

  function beginDrag(type, key, row, pointerId) {
    clearDragState();
    activeDrag = {
      type,
      key,
      pointerId,
      sourceRow: row,
      targetKey: null,
      position: "before",
    };
    row.classList.add("is-dragging");
    editor.classList.add("drag-in-progress");
  }

  function updateDropTarget(row, clientY) {
    if (!activeDrag) return false;
    editor.querySelectorAll(".drop-before, .drop-after").forEach((element) =>
      element.classList.remove("drop-before", "drop-after")
    );
    activeDrag.targetKey = null;
    if (!row || row === activeDrag.sourceRow) return false;
    let targetKey;
    if (activeDrag.type === "category") {
      targetKey = row.dataset.category;
      if (!targetKey || activeDrag.key === targetKey) return false;
    } else {
      const item = items.find((entry) => entry.id === activeDrag.key);
      const target = items.find((entry) => entry.id === row.dataset.itemId);
      if (!item || !target || item.category !== target.category) return false;
      targetKey = target.id;
    }
    const bounds = row.getBoundingClientRect();
    const position = clientY < bounds.top + bounds.height / 2
      ? "before"
      : "after";
    row.classList.add(position === "before" ? "drop-before" : "drop-after");
    activeDrag.targetKey = targetKey;
    activeDrag.position = position;
    return true;
  }

  function completeDrag() {
    if (!activeDrag) return false;
    const { type, key, targetKey, position } = activeDrag;
    clearDragState();
    return type === "category"
      ? reorderCategory(key, targetKey, position)
      : reorderItem(key, targetKey, position);
  }

  function autoScrollDuringDrag(clientY) {
    const threshold = 56;
    const tableWrap = editor.querySelector("[data-editor-table]");
    if (tableWrap && !tableWrap.hidden && tableWrap.offsetParent !== null) {
      const bounds = tableWrap.getBoundingClientRect();
      if (clientY > bounds.top && clientY < bounds.bottom) {
        if (clientY < bounds.top + threshold) tableWrap.scrollTop -= 12;
        if (clientY > bounds.bottom - threshold) tableWrap.scrollTop += 12;
        return;
      }
    }
    if (clientY < threshold) globalThis.scrollBy(0, -12);
    if (clientY > globalThis.innerHeight - threshold) {
      globalThis.scrollBy(0, 12);
    }
  }

  function applyCatalogMatch(item) {
    const product = catalogRecords().find((entry) =>
      entry.name.trim().toLowerCase() === item.item.trim().toLowerCase()
    );
    if (!product) return false;
    const source = catalogItem(product);
    Object.assign(item, source, { qty: item.qty || 1, id: item.id });
    return true;
  }

  function updateCatalogResults() {
    const query = (document.querySelector("[data-catalog-search]")?.value || "")
      .toLowerCase();
    const catalog = catalogRecords();
    const host = document.querySelector("[data-catalog-list]");
    const filtered = catalog.filter((product) =>
      `${product.sku} ${product.name} ${product.category}`
        .toLowerCase().includes(query)
    );
    host.innerHTML = filtered.length
      ? filtered.map((product) => {
        return `<div class="catalog-row"><div><strong>${escapeHtml(product.name)}</strong><span>${product.sku ? `${escapeHtml(product.sku)} · ` : ""}${escapeHtml(product.category || product.unit || "Catalog item")}</span></div><div class="align-right"><strong>${formatCurrencyMarkup(product.defaultCogs || 0, currentCurrency())}</strong><span>${formatPercent(product.defaultMargin || 0)} default margin</span></div><button class="button button-secondary button-sm" type="button" data-add-product="${escapeHtml(product.id)}">Add</button></div>`;
      }).join("")
      : '<div class="empty-state catalog-empty"><div class="empty-state-content"><h3>No Products Found</h3><p>Try searching by product name, part number, or category.</p></div></div>';
    host.querySelectorAll("[data-add-product]")
      .forEach((button) => button.disabled = !canEditItems());
    document.querySelector("#product-suggestions").innerHTML = catalog.map(
      (product) => `<option value="${escapeHtml(product.name)}"></option>`,
    ).join("");
  }

  function applyReorderState() {
    const enabled = reorderMode && canEditItems();
    editor.classList.toggle("reorder-mode", enabled);
    const reorderButton = document.querySelector("[data-toggle-reorder]");
    if (reorderButton) {
      reorderButton.textContent = enabled ? "Reorder on" : "Reorder off";
      reorderButton.setAttribute("aria-pressed", String(enabled));
    }
    editor.querySelectorAll(
      "[data-drag-handle], [data-category-drag-handle]",
    ).forEach((handle) => {
      handle.tabIndex = enabled ? 0 : -1;
    });
    if (!enabled) clearDragState();
  }

  function applyViewState() {
    editor.dataset.editorViewMode = currentView;
    const subtotalButton = document.querySelector("[data-toggle-subtotals]");
    if (subtotalButton) {
      subtotalButton.textContent = showCategorySubtotals
        ? "Subtotals on"
        : "Subtotals off";
      subtotalButton.setAttribute("aria-pressed", String(showCategorySubtotals));
    }
    applyReorderState();
  }

  function saveEditorPreferences() {
    store.saveLocalPreference("boq-editor", {
      showCategorySubtotals,
    });
  }

  function startDraftEditing() {
    editItems = true;
  }

  function buildPdfPreview(exportData = currentExportData()) {
    const host = document.querySelector("[data-pdf-preview]");
    const payload = exportData.document;
    const previewItems = exportData.items;
    const previewCategories = exportData.categories;
    const previewSettings = exportData.settings;
    const previewCurrency = payload.currency || previewSettings.defaultCurrency ||
      "IDR";
    const documentVisibility = window.BOQCustomerDocument.visibility(
      previewSettings,
    );
    const showPartNumber = documentVisibility.showSku;
    const showPricing = documentVisibility.showPricing;
    const showUnitPricing = documentVisibility.showUnitPricing;
    const previewSummary = calculateSummary(previewItems, {
      commission: payload.commission,
      rounding: previewSettings.rounding,
      ...taxOptions(previewSettings),
    });
    const columnCount = 4 + Number(showPartNumber) + Number(showPricing) +
      Number(showUnitPricing);
    const contactDetails = [previewSettings.email, previewSettings.phone]
      .filter(Boolean).map(escapeHtml).join(" | ");
    const companyDetails = [
      previewSettings.registrationNumber
        ? `Registration no.: ${escapeHtml(previewSettings.registrationNumber)}`
        : "",
      previewSettings.taxEnabled && previewSettings.taxRegistrationNumber
        ? `Tax registration no.: ${escapeHtml(previewSettings.taxRegistrationNumber)}`
        : "",
      previewSettings.address
        ? escapeHtml(previewSettings.address).replace(/\r?\n/g, "<br>")
        : "",
      contactDetails,
    ].filter(Boolean).join("<br>");
    const companyLogo = previewSettings.companyLogo
      ? `<img class="pdf-company-logo" src="${previewSettings.companyLogo}" alt="">`
      : "";
    const footerText = String(previewSettings.footerText || "").trim();
    const partNumberHeader = showPartNumber
      ? '<th class="pdf-column-part-number">Part Number</th>'
      : "";
    const unitPriceHeader = showUnitPricing
      ? '<th class="align-right pdf-column-unit-price">Unit Price</th>'
      : "";
    const totalHeader = showPricing
      ? '<th class="align-right pdf-total-column">Total</th>'
      : "";
    const tableClasses = [
      "pdf-preview-table",
      showPartNumber ? "has-part-number" : "",
      showUnitPricing ? "has-unit-price" : "",
      showPricing ? "" : "without-pricing",
    ].filter(Boolean).join(" ");
    let rowIndex = 0;
    const itemRows = previewCategories.map((category) => {
      const rows = previewItems.filter((item) =>
        (item.category || "Uncategorized") === category
      ).map((item) => {
        const calculation = calculateItem(item, {
          rounding: previewSettings.rounding,
        });
        return `<tr><td class="pdf-column-no">${++rowIndex}</td>${
          showPartNumber
            ? `<td class="pdf-column-part-number">${escapeHtml(item.sku || "")}</td>`
            : ""
        }<td class="pdf-column-item">${escapeHtml(item.item)}</td><td class="align-right pdf-column-qty">${
          escapeHtml(item.qty)
        }</td><td class="pdf-column-unit">${escapeHtml(item.unit)}</td>${
          showUnitPricing
            ? `<td class="align-right pdf-column-unit-price">${
              formatCurrencyMarkup(
                calculation.unitSelling,
                previewCurrency,
                undefined,
                previewSettings.numberFormat,
              )
            }</td>`
            : ""
        }${
          showPricing
            ? `<td class="align-right pdf-total-column">${
              formatCurrencyMarkup(
                calculation.totalSelling,
                previewCurrency,
                undefined,
                previewSettings.numberFormat,
              )
            }</td>`
            : ""
        }</tr>`;
      }).join("");
      return `<tr class="pdf-category"><td colspan="${columnCount}"><strong>${
        escapeHtml(category)
      }</strong></td></tr>${rows}`;
    }).join("");
    const tableRows = itemRows ||
      `<tr class="pdf-empty-row"><td colspan="${columnCount}">No BOQ items</td></tr>`;
    const previewTotals = previewSummary.taxEnabled
      ? `<div class="pdf-preview-totals"><div class="pdf-preview-total-row"><span>Subtotal</span><strong>${
        formatCurrencyMarkup(
          previewSummary.totalSelling,
          previewCurrency,
          undefined,
          previewSettings.numberFormat,
        )
      }</strong></div><div class="pdf-preview-total-row"><span>Tax ${escapeHtml(
        formatPercent(previewSummary.taxRate, previewSettings.numberFormat),
      )}</span><strong>${
        formatCurrencyMarkup(
          previewSummary.taxValue,
          previewCurrency,
          undefined,
          previewSettings.numberFormat,
        )
      }</strong></div><div class="pdf-preview-total-row is-grand-total"><span>Grand Total</span><strong>${
        formatCurrencyMarkup(
          previewSummary.grandTotal,
          previewCurrency,
          undefined,
          previewSettings.numberFormat,
        )
      }</strong></div></div>`
      : `<div class="pdf-preview-total"><span>Grand Total</span><strong>${
        formatCurrencyMarkup(
          previewSummary.totalSelling,
          previewCurrency,
          undefined,
          previewSettings.numberFormat,
        )
      }</strong></div>`;
    host.innerHTML = `<div class="pdf-preview-content${companyLogo ? " has-company-logo" : ""}"><header class="pdf-preview-header"><div class="pdf-preview-company">${
      companyLogo ? `<div class="pdf-preview-logo-slot">${companyLogo}</div>` : ""
    }<strong class="pdf-company">${
      escapeHtml(previewSettings.companyName || "Company information not configured")
    }</strong><p>${companyDetails}</p></div><div class="pdf-preview-document"><h2>Bill of Quantities</h2><strong>${
      escapeHtml(window.BOQCustomerDocument.documentReference(payload))
    }</strong><span>${escapeHtml(
      window.BOQCustomerDocument.documentBanner(payload),
    )}</span></div></header><div class="pdf-preview-divider" aria-hidden="true"></div><div class="pdf-parties"><div><span>Prepared for</span><strong>${
      escapeHtml(payload.customerName || "-")
    }</strong></div><div><span>Project</span><strong>${
      escapeHtml(payload.projectName || "-")
    }</strong></div><div><span>Issued / Valid Until</span><strong>${
      escapeHtml(formatDate(payload.date, previewSettings.dateFormat, "-"))
    }</strong><strong>${
      escapeHtml(formatDate(payload.validUntil, previewSettings.dateFormat, "-"))
    }</strong></div></div><table class="${tableClasses}"><thead><tr><th class="pdf-column-no">No</th>${partNumberHeader}<th class="pdf-column-item">Item</th><th class="align-right pdf-column-qty">Qty</th><th class="pdf-column-unit">Unit</th>${unitPriceHeader}${totalHeader}</tr></thead><tbody>${tableRows}</tbody></table>${
      showPricing
        ? previewTotals
        : ""
    }${
      payload.notes
        ? `<div class="pdf-notes"><strong>Terms / Notes</strong><p>${escapeHtml(payload.notes)}</p></div>`
        : ""
    }${
      footerText
        ? `<footer class="pdf-footer">${escapeHtml(footerText)}</footer>`
        : ""
    }</div>`;
  }

  function updateCatalogHistory() {
    items.filter((item) => item.item.trim()).forEach((item) => {
      const existing = catalogRecords().find((product) =>
        product.name.trim().toLowerCase() === item.item.trim().toLowerCase()
      );
      const calc = calculateItem(item);
      store.save("products", {
        ...existing,
        id: existing?.id,
        sku: item.sku || existing?.sku || "",
        name: item.item,
        category: item.category,
        unit: item.unit,
        defaultCogs: item.unitCogs,
        defaultMargin: item.margin,
        defaultSellingPrice: Number(item.unitCogs || 0) > 0
          ? null
          : item.sellingOverride ?? calc.unitSellingRaw,
        status: existing?.status || "Active",
      });
    });
  }

  async function saveDocument() {
    const informationForm = document.querySelector("#boq-info");
    if (!informationForm.checkValidity()) {
      informationForm.reportValidity();
      return null;
    }
    const existing = currentRecordId ? store.get("boqs", currentRecordId) : null;
    const payload = {
      ...documentPayload(),
      id: currentRecordId || undefined,
      createdAt: existing?.createdAt,
      workingRevision: currentRecord?.workingRevision ?? null,
      draftBaseRevisionNumber:
        currentRecord?.draftBaseRevisionNumber ?? null,
    };
    const issuing = payload.status === "Issued";
    const selectedCustomer = payload.customerId
      ? store.get("customers", payload.customerId)
      : null;
    const record = issuing
      ? store.issueBoq(payload, {
        note: pendingIssueNote,
        issuedBy: store.getUserId() || "",
        companySettings: settings,
        customer: selectedCustomer || {},
        rounding: settings.rounding || "2",
        numberFormat: settings.numberFormat || "comma",
      })
      : store.saveBoqDraft(payload);
    pendingIssueNote = "";
    currentRecordId = record.id;
    currentRecord = record;
    store.setCurrentBoqId(record.id);
    updateCatalogHistory();
    history.replaceState(null, "", `boq-editor.html?id=${encodeURIComponent(record.id)}`);
    updateEditorHeader();
    applyEditorMode();
    renderRevisionHistory();
    if (issuing && window.BOQAuth?.push) {
      document.querySelectorAll("[data-save-state]").forEach((element) =>
        element.textContent = "Saving issued revision to cloud…"
      );
      const synced = await window.BOQAuth.push();
      if (!synced) {
        record.cloudSyncPending = true;
      }
    }
    return record;
  }

  editor.addEventListener("focusout", (event) => {
    const input = event.target.closest("[data-number-input]");
    if (!input) return;
    const item = items.find((entry) => entry.id === input.dataset.itemId);
    if (!item) return;
    const calc = calculateItem(item);
    const value = input.dataset.field === "sellingOverride"
      ? calc.isManualSelling
        ? item.sellingOverride
        : calc.unitSelling
      : item.unitCogs;
    input.value = formatNumberInput(value);
  });

  editor.addEventListener("wheel", redirectItemInputHorizontalScroll, {
    passive: false,
  });

  editor.addEventListener("input", (event) => {
    const input = event.target.closest("[data-item-input]");
    if (!input || !canEditItems()) return;
    const item = items.find((entry) => entry.id === input.dataset.itemId);
    if (!item) return;
    const numericFields = ["qty", "unitCogs", "margin", "sellingOverride"];
    if (input.matches("[data-number-input]")) {
      formatNumberInputElementLive(input);
      if (input.dataset.field === "sellingOverride" && input.value === "") {
        item.sellingOverride = null;
      } else {
        item[input.dataset.field] = Math.max(0, parseNumberInput(input.value));
      }
    } else if (numericFields.includes(input.dataset.field)) {
      const value = Math.max(0, Number(input.value) || 0);
      item[input.dataset.field] = input.dataset.field === "margin"
        ? Math.min(value, 99.99)
        : value;
    } else item[input.dataset.field] = input.value;
    editor.querySelectorAll(
      `[data-item-id="${CSS.escape(item.id)}"]` +
        `[data-field="${CSS.escape(input.dataset.field)}"]`,
    ).forEach((control) => control.removeAttribute("aria-invalid"));
    syncItem(item);
    markDirty();
  });

  editor.addEventListener("change", (event) => {
    const input = event.target.closest("[data-item-input]");
    if (!input || !canEditItems()) return;
    const item = items.find((entry) => entry.id === input.dataset.itemId);
    if (!item) return;
    if (input.dataset.field === "item" && applyCatalogMatch(item)) {
      renderItems();
      markDirty();
      return;
    }
    if (input.dataset.field === "category") {
      item.category = input.value.trim() || "Uncategorized";
      renderItems();
      markDirty();
    }
  });

  editor.addEventListener("click", (event) => {
    const action = event.target.closest("[data-item-action]");
    if (action && canEditItems()) {
      const id = action.dataset.itemId;
      if (action.dataset.itemAction === "duplicate") duplicateItem(id);
    }
  });

  editor.addEventListener("pointerdown", (event) => {
    const itemHandle = event.target.closest("[data-drag-handle]");
    const categoryHandle = event.target.closest("[data-category-drag-handle]");
    const handle = itemHandle || categoryHandle;
    if (!reorderMode || !canEditItems() || !handle || event.button > 0) return;
    const type = categoryHandle ? "category" : "item";
    const row = handle.closest(
      type === "category" ? "[data-category-row]" : "[data-item-row]",
    );
    if (!row) return;
    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    beginDrag(
      type,
      type === "category" ? handle.dataset.category : handle.dataset.itemId,
      row,
      event.pointerId,
    );
  });

  editor.addEventListener("pointermove", (event) => {
    if (!reorderMode || activeDrag?.pointerId !== event.pointerId) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const rowSelector = activeDrag.type === "category"
      ? "[data-category-row]"
      : "[data-item-row]";
    updateDropTarget(target?.closest(rowSelector), event.clientY);
    autoScrollDuringDrag(event.clientY);
  });

  editor.addEventListener("pointerup", (event) => {
    if (activeDrag?.pointerId !== event.pointerId) return;
    event.preventDefault();
    completeDrag();
  });

  editor.addEventListener("pointercancel", (event) => {
    if (activeDrag?.pointerId === event.pointerId) clearDragState();
  });

  editor.addEventListener("keydown", (event) => {
    const categoryHandle = event.target.closest("[data-category-drag-handle]");
    if (categoryHandle && reorderMode &&
        ["ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      moveCategory(
        categoryHandle.dataset.category,
        event.key === "ArrowUp" ? -1 : 1,
      );
      return;
    }
    const dragHandle = event.target.closest("[data-drag-handle]");
    if (dragHandle && reorderMode &&
        ["ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      moveItem(dragHandle.dataset.itemId, event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    const input = event.target.closest(".editor-table [data-item-input]");
    if (!input) return;
    if (event.key === "Enter") {
      if (!canEditItems() || event.repeat || event.isComposing ||
          event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      const currentItem = items.find((item) =>
        item.id === input.dataset.itemId
      );
      if (currentItem && input.dataset.field === "item") {
        applyCatalogMatch(currentItem);
      } else if (currentItem && input.dataset.field === "category") {
        currentItem.category = input.value.trim() || "Uncategorized";
      }
      const addedItem = addItem();
      if (addedItem) focusDesktopItemField(addedItem.id);
      return;
    }
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        (input.selectionStart !== input.selectionEnd ||
          (event.key === "ArrowLeft" && input.selectionStart > 0) ||
          (event.key === "ArrowRight" && input.selectionStart < input.value.length))) return;
    const inputs = [...editor.querySelectorAll(".editor-table [data-item-input]")];
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const next = inputs[inputs.indexOf(input) + direction];
    if (next) {
      event.preventDefault();
      next.focus();
      next.select?.();
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-add-custom]") && canEditItems()) addItem();
    const productButton = event.target.closest("[data-add-product]");
    if (productButton && canEditItems()) {
      const product = store.get("products", productButton.dataset.addProduct);
      if (product) addItem(catalogItem(product));
      window.BOQModal.close(document.getElementById("catalog-modal"));
    }
    if (event.target.closest("[data-preview-pdf]")) {
      buildPdfPreview();
      document.querySelectorAll(
        "#pdf-modal [data-download-pdf], #pdf-modal [data-download-word]",
      ).forEach((button) => button.removeAttribute("data-export-revision"));
    }
    if (event.target.closest("[data-create-revision]")) {
      event.preventDefault();
      const record = store.prepareRevisionDraft(currentRecordId);
      if (!record) {
        window.BOQApp.showToast(
          "Unable to create a revision for this BOQ. Reload and try again.",
          "error",
        );
        return;
      }
      currentRecord = record;
      startDraftEditing();
      initializeDocument(record);
      renderItems();
      markDirty();
      window.BOQApp.showToast(
        `${store.revisionLabel(record.workingRevision)} draft opened. Save BOQ to keep it.`,
      );
    }
    const revisionSource = event.target.closest("[data-create-revision-from]");
    if (revisionSource) {
      const record = store.prepareRevisionDraft(
        currentRecordId,
        revisionSource.dataset.createRevisionFrom,
      );
      if (!record) return;
      currentRecord = record;
      startDraftEditing();
      window.BOQModal.close(document.getElementById("revision-history-modal"));
      initializeDocument(record);
      renderItems();
      markDirty();
      window.BOQApp.showToast(
        `${store.revisionLabel(record.workingRevision)} draft opened from ${
          store.revisionLabel(record.draftBaseRevisionNumber)
        }. Save BOQ to keep it.`,
      );
    }
    if (event.target.closest("[data-open-revision-history]")) {
      renderRevisionHistory();
      window.BOQModal.open("revision-history-modal");
    }
    const markWon = event.target.closest("[data-mark-won]");
    if (markWon && isRevisableIssued()) {
      openCustomerPoModal("mark");
    }
    const editCustomerPo = event.target.closest("[data-edit-customer-po]");
    if (editCustomerPo && isWonLocked()) {
      const menu = editCustomerPo.closest(".dropdown-menu");
      if (menu) {
        menu.hidden = true;
        menu.previousElementSibling?.setAttribute("aria-expanded", "false");
      }
      openCustomerPoModal("edit");
    }
    if (event.target.closest("[data-compare-revisions]")) {
      renderRevisionComparison(
        document.querySelector("[data-compare-from]").value,
        document.querySelector("[data-compare-to]").value,
      );
    }
    const previewRevision = event.target.closest("[data-preview-revision]");
    if (previewRevision) {
      const data = revisionExportData(previewRevision.dataset.previewRevision);
      if (!data) return;
      buildPdfPreview(data);
      document.querySelectorAll(
        "#pdf-modal [data-download-pdf], #pdf-modal [data-download-word]",
      ).forEach((button) =>
        button.setAttribute(
          "data-export-revision",
          String(data.document.revisionNumber),
        )
      );
      window.BOQModal.open("pdf-modal");
    }
    const revisionExcel = event.target.closest("[data-download-revision-excel]");
    if (revisionExcel) {
      document.dispatchEvent(new CustomEvent("boq:export-revision", {
        detail: { type: "excel", number: revisionExcel.dataset.downloadRevisionExcel },
      }));
    }
    const revisionPdf = event.target.closest("[data-download-revision-pdf]");
    if (revisionPdf) {
      document.dispatchEvent(new CustomEvent("boq:export-revision", {
        detail: { type: "pdf", number: revisionPdf.dataset.downloadRevisionPdf },
      }));
    }
    const revisionWord = event.target.closest("[data-download-revision-word]");
    if (revisionWord) {
      document.dispatchEvent(new CustomEvent("boq:export-revision", {
        detail: {
          type: "word",
          number: revisionWord.dataset.downloadRevisionWord,
        },
      }));
    }
    const voidRevision = event.target.closest("[data-void-revision]");
    if (voidRevision) {
      const revision = store.getRevision(currentRecord, voidRevision.dataset.voidRevision);
      if (!revision) return;
      const form = document.querySelector("[data-void-revision-form]");
      form.reset();
      form.dataset.revisionNumber = String(revision.number);
      document.querySelector("[data-void-revision-message]").textContent =
        `${revision.label} will be marked void. The previous issued revision will become active.`;
      window.BOQModal.open("void-revision-modal");
    }
    if (event.target.closest("[data-toggle-subtotals]")) {
      showCategorySubtotals = !showCategorySubtotals;
      saveEditorPreferences();
      renderItems();
    }
    if (event.target.closest("[data-toggle-edit]") && !isIssuedLocked()) {
      editItems = !editItems;
      saveEditorPreferences();
      applyEditorMode();
    }
    if (event.target.closest("[data-toggle-reorder]") && canEditItems()) {
      reorderMode = !reorderMode;
      applyReorderState();
    }
  });

  document.addEventListener("boq:delete-item", (event) => {
    if (!canEditItems()) return;
    const id = event.detail.targetId;
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return;
    const [removed] = items.splice(index, 1);
    renderItems();
    markDirty();
    window.BOQApp.showToast(`${removed.item || "Item"} removed.`, "success", {
      label: "Undo",
      callback: () => {
        items.splice(index, 0, removed);
        renderItems();
        markDirty();
      },
    });
  });

  document.addEventListener("boq:discard-revision", () => {
    if (hasUnpersistedRevisionDraft()) {
      currentRecord = store.get("boqs", currentRecordId);
      dirty = false;
      initializeDocument(currentRecord);
      renderItems();
      window.BOQApp.showToast("Unsaved draft revision discarded.");
      return;
    }
    const result = store.discardBoqDraft(currentRecordId);
    if (!result) return;
    if (result.removed) {
      location.href = "boqs.html";
      return;
    }
    currentRecord = result;
    dirty = false;
    initializeDocument();
    renderItems();
    window.BOQApp.showToast("Draft revision discarded.");
  });

  function applyStatusTransition(record, successMessage) {
    if (!record) {
      window.BOQApp.showToast(
        "The BOQ status could not be changed. Reload and try again.",
        "error",
      );
      return;
    }
    currentRecord = record;
    dirty = false;
    initializeDocument(record);
    renderItems();
    renderRevisionHistory();
    window.BOQApp.showToast(successMessage);
    if (!window.BOQAuth?.push) return;
    void window.BOQAuth.push().then((synced) => {
      if (synced === false) {
        window.BOQApp.showToast(
          "Status saved locally. Cloud sync is pending.",
          "error",
        );
      }
    }).catch(() => {
      window.BOQApp.showToast(
        "Status saved locally. Cloud sync is pending.",
        "error",
      );
    });
  }

  function openCustomerPoModal(mode) {
    const form = document.querySelector("[data-won-status-form]");
    if (!form) return;
    const editing = mode === "edit";
    form.reset();
    form.dataset.mode = editing ? "edit" : "mark";
    form.elements.customerPoNumber.setCustomValidity("");
    form.elements.customerPoNumber.value = editing
      ? currentRecord?.customerPoNumber || ""
      : "";
    document.querySelector("[data-won-status-title]").textContent = editing
      ? "Edit Customer PO"
      : "Mark BOQ as Won?";
    document.querySelector("[data-won-status-description]").textContent = editing
      ? "Update the customer PO reference without changing the issued revision."
      : "Record the customer PO before confirming this BOQ as Won.";
    document.querySelector("[data-won-status-submit]").textContent = editing
      ? "Save Customer PO"
      : "Mark as Won";
    window.BOQModal.open("won-status-modal");
  }

  document.querySelector("[data-won-status-form]")?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const input = form.elements.customerPoNumber;
      input.setCustomValidity("");
      if (!form.checkValidity()) return form.reportValidity();
      const customerPoNumber = input.value.trim();
      if (!customerPoNumber) {
        input.setCustomValidity("Enter the customer PO number.");
        input.reportValidity();
        return;
      }
      const editing = form.dataset.mode === "edit";
      const record = editing
        ? store.updateBoqCustomerPoNumber(currentRecordId, customerPoNumber)
        : store.markBoqWon(currentRecordId, {
          customerPoNumber,
          currentDate: new Date(),
        });
      if (!record) {
        window.BOQApp.showToast(
          "The customer PO could not be saved. Reload and try again.",
          "error",
        );
        return;
      }
      window.BOQModal.close(document.getElementById("won-status-modal"));
      applyStatusTransition(
        record,
        editing ? "Customer PO updated." : "BOQ marked as Won.",
      );
    },
  );

  document.addEventListener("boq:revert-issued", () => {
    applyStatusTransition(
      store.revertBoqToIssued(currentRecordId),
      "BOQ reverted to Issued.",
    );
  });

  document.querySelector("[data-void-revision-form]")?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.checkValidity()) return form.reportValidity();
      const record = store.voidLatestRevision(
        currentRecordId,
        form.elements.reason.value,
      );
      if (!record) {
        window.BOQApp.showToast(
          "Only the latest issued revision can be voided.",
          "error",
        );
        return;
      }
      currentRecord = record;
      dirty = false;
      window.BOQModal.close(document.getElementById("void-revision-modal"));
      window.BOQModal.close(document.getElementById("revision-history-modal"));
      initializeDocument();
      renderItems();
      window.BOQApp.showToast("Latest revision voided.");
    },
  );

  document.addEventListener("boq:before-save", (event) => {
    const status = document.querySelector("#boq-status").value;
    const requestedStatus = event.detail.button?.dataset.saveStatus || status;
    if (requestedStatus !== "Issued" || isIssuedLocked()) return;
    event.preventDefault();
    const validation = store.validateBoqForIssue(documentPayload());
    if (!validation.valid) {
      showIssueValidation(validation);
      return;
    }
    clearIssueValidation();
    pendingSaveContinuation = event.detail.resume;
    const revisionNumber = currentRecord?.workingRevision ??
      store.nextRevisionNumber(currentRecord);
    const form = document.querySelector("[data-issue-revision-form]");
    form.reset();
    document.querySelector("[data-issue-revision-message]").textContent =
      `${store.revisionLabel(revisionNumber)} will become an official, locked customer revision.`;
    window.BOQModal.open("issue-revision-modal");
  });

  document.querySelector("[data-issue-revision-form]")?.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = "Checking cloud…";
      const conflict = await window.BOQAuth?.checkIssueConflict?.(
        currentRecordId,
        currentRecord?.updatedAt,
      ) || { ok: true };
      button.disabled = false;
      button.textContent = "Mark as Issued";
      if (!conflict.ok) {
        window.BOQApp.showToast(conflict.message, "error");
        return;
      }
      pendingIssueNote = form.elements.note.value.trim();
      const continuation = pendingSaveContinuation;
      pendingSaveContinuation = null;
      document.querySelector("#boq-status").value = "Issued";
      updateEditorHeader();
      window.BOQModal.close(document.getElementById("issue-revision-modal"));
      continuation?.();
    },
  );

  document.querySelector("[data-catalog-search]")?.addEventListener("input", updateCatalogResults);
  desktopTableWrap?.addEventListener("scroll", updateStickyColumnsState, {
    passive: true,
  });
  globalThis.addEventListener("resize", updateStickyColumnsState);
  document.querySelector("[data-editor-view]")?.addEventListener("change", (event) => {
    currentView = event.target.value;
    applyViewState();
  });
  commissionInput?.addEventListener("input", () => {
    formatNumberInputElementLive(commissionInput);
    commission = Math.max(0, parseNumberInput(commissionInput.value));
    updateSummary();
    markDirty();
  });
  commissionInput?.addEventListener("blur", updateCommissionInput);
  document.querySelectorAll("#boq-info input, #boq-info select, #boq-info textarea")
    .forEach((input) => input.addEventListener("input", () => {
      input.removeAttribute("aria-invalid");
      updateEditorHeader();
      markDirty();
    }));
  currencySelect?.addEventListener("change", () => {
    renderItems();
    markDirty();
  });
  document.addEventListener("boq:saved", (event) => {
    const issuing = document.querySelector("#boq-status").value === "Issued";
    event.detail.promise = (async () => {
      try {
        const record = await saveDocument();
        if (!record) throw new Error("Unable to save this BOQ.");
        dirty = false;
        document.querySelectorAll("[data-save-state]").forEach((element) =>
          element.textContent = record.cloudSyncPending
            ? `${store.revisionLabel(record.activeRevisionNumber)} issued locally · cloud sync pending`
            : issuing
            ? `${store.revisionLabel(record.activeRevisionNumber)} issued and locked`
            : record.workingRevision !== null
            ? `Draft changes saved for ${store.revisionLabel(record.workingRevision)}`
            : "All changes saved"
        );
        event.detail.successMessage = issuing
          ? `${store.revisionLabel(record.activeRevisionNumber)} issued.`
          : "BOQ saved.";
        if (record.cloudSyncPending) {
          throw new Error(
            "Revision issued locally, but cloud confirmation is pending.",
          );
        }
      } catch (error) {
        if (issuing && !isIssuedLocked()) {
          document.querySelector("#boq-status").value = "Draft";
          updateEditorHeader();
        }
        throw error;
      }
    })();
  });
  window.addEventListener("beforeunload", (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
  document.addEventListener("boq:workspace-updated", () => {
    settings = store.getSettings();
    populateRecordOptions();
    updateCatalogResults();
    if (dirty) return;
    currentRecordId = new URLSearchParams(location.search).get("id");
    initializeDocument();
    renderItems();
  });

  window.BOQEditor = {
    getDocument: documentPayload,
    getItems: () => items.map((item) => ({ ...item })),
    getCategories: categories,
    getView: () => currentView,
    getSettings: () => ({ ...settings }),
    buildPdfPreview,
    getExportData: currentExportData,
    getRevisionExportData: revisionExportData,
  };

  initializeDocument();
  renderItems();
  updateCatalogResults();
  if (new URLSearchParams(location.search).get("history") === "1" &&
      currentRecord?.revisions?.length) {
    renderRevisionHistory();
    window.setTimeout(() => window.BOQModal.open("revision-history-modal"), 0);
  }
  if (new URLSearchParams(location.search).get("preview") === "pdf" &&
      currentRecord) {
    buildPdfPreview();
    window.setTimeout(() => window.BOQModal.open("pdf-modal"), 0);
  }
})();
