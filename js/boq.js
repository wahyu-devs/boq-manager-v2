(function initializeBoqEditor() {
  const editor = document.querySelector("[data-boq-editor]");
  if (!editor) return;

  const calculations = window.BOQCalculations;
  const { calculateItem, calculateSummary, calculateCategorySummary } =
    calculations;
  const {
    formatCurrencyMarkup,
    formatPercent,
    formatNumberInput,
    parseNumberInput,
    numberInputEditingValue,
    escapeHtml,
    collectUniqueTextValues,
    reorderItemsWithinCategory,
    reorderValues,
  } = window.BOQUtils;
  const store = window.BOQStore;
  let settings = store.getSettings();
  const editorPreferences = store.getLocalPreference("boq-editor", {});
  let currentRecordId = new URLSearchParams(location.search).get("id");
  let items = [];
  let commission = 0;
  let categoryOrder = [];
  let dirty = false;
  let showCategorySubtotals = typeof editorPreferences.showCategorySubtotals ===
      "boolean"
    ? editorPreferences.showCategorySubtotals
    : settings.showCategorySubtotals !== false;
  let showTablePrices = typeof editorPreferences.showTablePrices === "boolean"
    ? editorPreferences.showTablePrices
    : settings.showTablePrices !== false;
  let currentView = "all";
  let reorderMode = false;
  let activeDrag = null;

  const desktopBody = editor.querySelector("[data-items-body]");
  const mobileList = editor.querySelector("[data-mobile-items]");
  const currencySelect = document.querySelector("#boq-currency");
  const commissionInput = document.querySelector("[data-commission]");

  function catalogRecords() {
    return store.list("products").filter((product) =>
      product.status !== "Inactive"
    );
  }

  function catalogItem(product) {
    return {
      sku: product.sku || "",
      item: product.name || "",
      description: "",
      qty: 1,
      unit: product.unit || "Each",
      unitCogs: Number(product.defaultCogs || 0),
      margin: Number(product.defaultMargin || 0),
      sellingOverride: product.defaultSellingPrice === null ||
          product.defaultSellingPrice === undefined ||
          product.defaultSellingPrice === ""
        ? null
        : Number(product.defaultSellingPrice),
      category: product.category || "Uncategorized",
    };
  }

  function currentCurrency() {
    return currencySelect?.value || settings.defaultCurrency || "IDR";
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

  function initializeDocument() {
    populateRecordOptions();
    const record = currentRecordId ? store.get("boqs", currentRecordId) : null;
    if (record) {
      setFormValue("#boq-number", record.number);
      setFormValue("#boq-status", record.status === "Sent" ? "Sent" : "Draft");
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
      if (commissionInput) commissionInput.value = commission || "";
      document.querySelector("[data-save-state]").textContent =
        "All changes saved";
    } else {
      currentRecordId = null;
      items = [];
      commission = 0;
      categoryOrder = [];
      if (commissionInput) commissionInput.value = "";
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
    updateEditorHeader();
  }

  function updateEditorHeader() {
    const projectName = document.querySelector("#boq-project").value.trim();
    const number = document.querySelector("#boq-number").value.trim();
    const status = document.querySelector("#boq-status").value;
    document.querySelector("[data-editor-title]").textContent = projectName ||
      "New BOQ";
    document.querySelector("[data-editor-number]").textContent = number ||
      "New";
    const statusNode = document.querySelector("[data-editor-status]");
    statusNode.textContent = status;
    statusNode.className = `status status-${status.toLowerCase()}`;
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
      <td class="align-right item-order-cell">${itemDragHandle(item)}<span class="subtle number item-index">${displayIndex}</span></td>
      <td><input class="editor-input" data-item-input data-field="sku" data-item-id="${item.id}" value="${escapeHtml(item.sku || "")}" aria-label="Part number, row ${displayIndex}"></td>
      <td><input class="editor-input" list="product-suggestions" data-item-input data-field="item" data-item-id="${item.id}" value="${escapeHtml(item.item)}" aria-label="Item name, row ${displayIndex}"></td>
      <td><input class="editor-input" data-item-input data-field="category" data-item-id="${item.id}" value="${escapeHtml(item.category)}" aria-label="Category, row ${displayIndex}"></td>
      <td><input class="editor-input numeric" data-item-input data-field="qty" data-item-id="${item.id}" type="number" min="0" step="0.01" value="${item.qty}" aria-label="Quantity, row ${displayIndex}"></td>
      <td><select class="editor-input" data-item-input data-field="unit" data-item-id="${item.id}" aria-label="Unit, row ${displayIndex}">${unitOptions(item.unit)}</select></td>
      <td class="column-cogs column-price"><input class="editor-input numeric" data-item-input data-number-input data-field="unitCogs" data-item-id="${item.id}" type="text" inputmode="decimal" value="${escapeHtml(formatNumberInput(item.unitCogs))}" aria-label="Unit COGS, row ${displayIndex}"></td>
      <td class="calculated-cell column-cogs column-price" data-item-output="totalCogs">${formatCurrencyMarkup(calc.totalCogs, currentCurrency())}</td>
      <td class="column-margin column-price"><input class="editor-input numeric" data-item-input data-field="margin" data-item-id="${item.id}" type="number" min="0" max="99.99" step="0.1" value="${item.margin}" aria-label="Gross margin percentage, row ${displayIndex}"></td>
      <td class="column-selling column-price"><input class="editor-input numeric${calc.isManualSelling ? " is-manual" : ""}" data-item-input data-number-input data-field="sellingOverride" data-item-id="${item.id}" type="text" inputmode="decimal" value="${escapeHtml(formatNumberInput(sellingValue))}" aria-label="Unit selling price, row ${displayIndex}"></td>
      <td class="calculated-cell column-selling column-price" data-item-output="totalSelling">${formatCurrencyMarkup(calc.totalSelling, currentCurrency())}</td>
      <td><div class="row-actions"><div class="menu-wrap"><button class="icon-button" type="button" data-menu-trigger aria-expanded="false" aria-label="More actions for ${escapeHtml(item.item)}">•••</button><div class="dropdown-menu" hidden><button class="menu-item" type="button" data-item-action="duplicate" data-item-id="${item.id}">Duplicate item</button><button class="menu-item danger-text" type="button" data-confirm data-confirm-event="boq:delete-item" data-target-id="${item.id}" data-confirm-title="Delete ${escapeHtml(item.item || "item")}?" data-confirm-message="This item will be removed and all totals recalculated.">Delete item</button></div></div></div></td>
    </tr>`;
  }

  function categoryDesktopHeader(category) {
    return `<tr class="editor-category-row" data-category-row data-category="${escapeHtml(category)}"><td colspan="12"><div><span class="category-title">${categoryDragHandle(category)}<strong>${escapeHtml(category)}</strong></span></div></td></tr>`;
  }

  function categorySubtotalRow(category) {
    if (!showCategorySubtotals) return "";
    const summary = calculateCategorySummary(items, category, { commission: 0 });
    return `<tr class="category-subtotal-row" data-category-subtotal="${escapeHtml(category)}"><td colspan="7">${escapeHtml(category)} subtotal</td><td class="align-right column-cogs column-price" data-category-total="cogs">${formatCurrencyMarkup(summary.totalCogs, currentCurrency())}</td><td class="column-margin column-price"></td><td class="column-selling column-price"></td><td class="align-right column-selling column-price" data-category-total="selling">${formatCurrencyMarkup(summary.totalSelling, currentCurrency())}</td><td></td></tr>`;
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
    editor.querySelector("[data-editor-table]").hidden = items.length === 0;
    editor.querySelector("[data-items-empty]").hidden = items.length > 0;
    editor.querySelector("[data-item-count]").textContent =
      `${items.length} item${items.length === 1 ? "" : "s"}`;
    applyViewState();
    updateSummary();
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
    const summary = calculateSummary(items, { commission });
    const values = {
      totalCogs: formatCurrencyMarkup(summary.totalCogs, currentCurrency()),
      totalSelling: formatCurrencyMarkup(summary.totalSelling, currentCurrency()),
      marginValue: formatCurrencyMarkup(summary.marginValue, currentCurrency()),
      marginPercent: formatPercent(summary.marginPercent),
    };
    Object.entries(values).forEach(([key, value]) =>
      document.querySelectorAll(`[data-summary="${key}"]`).forEach((element) =>
        element.innerHTML = value
      )
    );
  }

  function documentPayload() {
    const projectName = document.querySelector("#boq-project").value.trim();
    const customerSelect = document.querySelector("#boq-customer");
    const summary = calculateSummary(items, { commission });
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
      items: items.map(({ id, ...item }) => ({ ...item })),
      commission,
      categoryOrder: categoryOrder.slice(),
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
  }

  function duplicateItem(id) {
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
    document.querySelector("#product-suggestions").innerHTML = catalog.map(
      (product) => `<option value="${escapeHtml(product.name)}"></option>`,
    ).join("");
  }

  function applyReorderState() {
    editor.classList.toggle("reorder-mode", reorderMode);
    const reorderButton = document.querySelector("[data-toggle-reorder]");
    if (reorderButton) {
      reorderButton.textContent = reorderMode ? "Reorder on" : "Reorder off";
      reorderButton.setAttribute("aria-pressed", String(reorderMode));
    }
    editor.querySelectorAll(
      "[data-drag-handle], [data-category-drag-handle]",
    ).forEach((handle) => {
      handle.tabIndex = reorderMode ? 0 : -1;
    });
    if (!reorderMode) clearDragState();
  }

  function applyViewState() {
    editor.dataset.editorViewMode = currentView;
    editor.classList.toggle("prices-hidden", !showTablePrices);
    const subtotalButton = document.querySelector("[data-toggle-subtotals]");
    const priceButton = document.querySelector("[data-toggle-prices]");
    if (subtotalButton) {
      subtotalButton.textContent = showCategorySubtotals
        ? "Subtotals on"
        : "Subtotals off";
      subtotalButton.setAttribute("aria-pressed", String(showCategorySubtotals));
    }
    if (priceButton) {
      priceButton.textContent = showTablePrices ? "Prices shown" : "Prices hidden";
      priceButton.setAttribute("aria-pressed", String(showTablePrices));
    }
    applyReorderState();
  }

  function saveEditorPreferences() {
    store.saveLocalPreference("boq-editor", {
      showCategorySubtotals,
      showTablePrices,
    });
  }

  function buildPdfPreview() {
    const host = document.querySelector("[data-pdf-preview]");
    const payload = documentPayload();
    const showPartNumber = settings.showSku === true;
    const showUnitPricing = settings.showUnitPricing !== false;
    const columnCount = 5 + Number(showPartNumber) + Number(showUnitPricing);
    const contactDetails = [settings.email, settings.phone]
      .filter(Boolean).map(escapeHtml).join(" · ");
    const companyDetails = [
      settings.registrationNumber
        ? `Registration no.: ${escapeHtml(settings.registrationNumber)}`
        : "",
      settings.address
        ? escapeHtml(settings.address).replace(/\r?\n/g, "<br>")
        : "",
      contactDetails,
    ].filter(Boolean).join("<br>");
    const companyLogo = settings.companyLogo
      ? `<img class="pdf-company-logo" src="${settings.companyLogo}" alt="">`
      : "";
    const footerText = String(settings.footerText || "").trim();
    const partNumberHeader = showPartNumber ? "<th>Part number</th>" : "";
    const unitPriceHeader = showUnitPricing
      ? '<th class="align-right">Unit price</th>'
      : "";
    let rowIndex = 0;
    host.innerHTML = `<div class="pdf-preview-content"><header class="pdf-preview-header"><div>${companyLogo}<strong class="pdf-company">${escapeHtml(settings.companyName || "Company information not configured")}</strong><p>${companyDetails}</p></div><div class="align-right"><h2>Bill of Quantities</h2><p><strong>${escapeHtml(payload.number)}</strong><br>Date: ${escapeHtml(payload.date)}<br>Valid until: ${escapeHtml(payload.validUntil)}</p></div></header><div class="pdf-parties"><div><span>Prepared for</span><strong>${escapeHtml(payload.customerName || "—")}</strong></div><div><span>Project</span><strong>${escapeHtml(payload.projectName || "—")}</strong></div></div><table class="pdf-preview-table"><thead><tr><th>#</th>${partNumberHeader}<th>Item</th><th class="align-right">Qty</th><th>Unit</th>${unitPriceHeader}<th class="align-right">Total</th></tr></thead><tbody>${categories().map((category) => `<tr class="pdf-category"><td colspan="${columnCount}"><strong>${escapeHtml(category)}</strong></td></tr>${items.filter((item) => item.category === category).map((item) => { const calc = calculateItem(item); return `<tr><td>${++rowIndex}</td>${showPartNumber ? `<td>${escapeHtml(item.sku || "")}</td>` : ""}<td><strong>${escapeHtml(item.item)}</strong></td><td class="align-right">${item.qty}</td><td>${escapeHtml(item.unit)}</td>${showUnitPricing ? `<td class="align-right">${formatCurrencyMarkup(calc.unitSelling, currentCurrency())}</td>` : ""}<td class="align-right"><strong>${formatCurrencyMarkup(calc.totalSelling, currentCurrency())}</strong></td></tr>`; }).join("")}`).join("")}</tbody></table><div class="pdf-preview-total"><div><span>Subtotal</span><strong>${formatCurrencyMarkup(payload.totalSelling, currentCurrency())}</strong></div><div class="grand-total"><span>Grand total</span><strong>${formatCurrencyMarkup(payload.totalSelling, currentCurrency())}</strong></div></div>${payload.notes ? `<div class="pdf-notes"><strong>Terms / Notes</strong><p>${escapeHtml(payload.notes)}</p></div>` : ""}${footerText ? `<footer class="pdf-footer">${escapeHtml(footerText)}</footer>` : ""}</div>`;
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
        defaultSellingPrice: item.sellingOverride ?? calc.unitSellingRaw,
        status: existing?.status || "Active",
      });
    });
  }

  function saveDocument() {
    const informationForm = document.querySelector("#boq-info");
    if (!informationForm.checkValidity()) {
      informationForm.reportValidity();
      return null;
    }
    const existing = currentRecordId ? store.get("boqs", currentRecordId) : null;
    const record = store.save("boqs", {
      ...documentPayload(),
      id: currentRecordId || undefined,
      createdAt: existing?.createdAt,
    });
    currentRecordId = record.id;
    store.setCurrentBoqId(record.id);
    updateCatalogHistory();
    history.replaceState(null, "", `boq-editor.html?id=${encodeURIComponent(record.id)}`);
    updateEditorHeader();
    return record;
  }

  editor.addEventListener("focusin", (event) => {
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
    input.value = numberInputEditingValue(value);
  });

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

  editor.addEventListener("input", (event) => {
    const input = event.target.closest("[data-item-input]");
    if (!input) return;
    const item = items.find((entry) => entry.id === input.dataset.itemId);
    if (!item) return;
    const numericFields = ["qty", "unitCogs", "margin", "sellingOverride"];
    if (input.matches("[data-number-input]")) {
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
    syncItem(item);
    markDirty();
  });

  editor.addEventListener("change", (event) => {
    const input = event.target.closest("[data-item-input]");
    if (!input) return;
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
    if (action) {
      const id = action.dataset.itemId;
      if (action.dataset.itemAction === "duplicate") duplicateItem(id);
    }
  });

  editor.addEventListener("pointerdown", (event) => {
    const itemHandle = event.target.closest("[data-drag-handle]");
    const categoryHandle = event.target.closest("[data-category-drag-handle]");
    const handle = itemHandle || categoryHandle;
    if (!reorderMode || !handle || event.button > 0) return;
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
    if (!input || !["Enter", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
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
    if (event.target.closest("[data-add-custom]")) addItem();
    const productButton = event.target.closest("[data-add-product]");
    if (productButton) {
      const product = store.get("products", productButton.dataset.addProduct);
      if (product) addItem(catalogItem(product));
      window.BOQModal.close(document.getElementById("catalog-modal"));
    }
    if (event.target.closest("[data-preview-pdf]")) buildPdfPreview();
    if (event.target.closest("[data-toggle-subtotals]")) {
      showCategorySubtotals = !showCategorySubtotals;
      saveEditorPreferences();
      renderItems();
    }
    if (event.target.closest("[data-toggle-prices]")) {
      showTablePrices = !showTablePrices;
      saveEditorPreferences();
      applyViewState();
    }
    if (event.target.closest("[data-toggle-reorder]")) {
      reorderMode = !reorderMode;
      applyReorderState();
    }
  });

  document.addEventListener("boq:delete-item", (event) => {
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

  document.querySelector("[data-catalog-search]")?.addEventListener("input", updateCatalogResults);
  document.querySelector("[data-editor-view]")?.addEventListener("change", (event) => {
    currentView = event.target.value;
    applyViewState();
  });
  commissionInput?.addEventListener("input", () => {
    commission = Math.max(0, Number(commissionInput.value) || 0);
    updateSummary();
    markDirty();
  });
  document.querySelectorAll("#boq-info input, #boq-info select, #boq-info textarea")
    .forEach((input) => input.addEventListener("input", () => {
      updateEditorHeader();
      markDirty();
    }));
  currencySelect?.addEventListener("change", () => {
    renderItems();
    markDirty();
  });
  document.addEventListener("boq:saved", () => {
    if (!saveDocument()) return;
    dirty = false;
    document.querySelectorAll("[data-save-state]").forEach((element) =>
      element.textContent = "All changes saved"
    );
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
  };

  initializeDocument();
  renderItems();
  updateCatalogResults();
})();
