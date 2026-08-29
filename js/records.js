(function initializeRecordPages() {
  const page = document.body.dataset.page;
  const collectionByPage = {
    boqs: "boqs",
    products: "products",
    customers: "customers",
  };
  const collection = collectionByPage[page];
  if (!collection) return;

  const { list, get, save, remove, nextNumber, backfillBoqPartNumbers } =
    window.BOQStore;
  const {
    escapeHtml,
    formatCurrencyMarkup,
    formatPercent,
    formatNumberInput,
    formatNumberInputElementLive,
    parseNumberInput,
    collectUniqueTextValues,
    visibleRevisionLabel,
    boqAttentionType,
  } = window.BOQUtils;
  let defaultCurrency = window.BOQStore.getSettings().defaultCurrency ||
    "USD";
  const body = document.querySelector("[data-records-body]");
  const cards = document.querySelector("[data-records-cards]");
  const table = document.querySelector("[data-records-table]");
  const empty = document.querySelector("[data-records-empty]");

  function displayBoqs() {
    return list("boqs").map(window.BOQStore.registerBoqView);
  }

  function statusClass(status) {
    const map = {
      Draft: "draft",
      Issued: "issued",
      Won: "won",
      Active: "active",
      Prospect: "review",
      Inactive: "inactive",
    };
    return map[status] || "draft";
  }

  function statusHtml(status) {
    const value = status || "Draft";
    return `<span class="status status-${statusClass(value)}">${
      escapeHtml(value)
    }</span>`;
  }

  function dateText(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  }

  function renderBoq(record) {
    record = window.BOQStore.registerBoqView(record);
    record = {
      ...record,
      status: ["Draft", "Issued", "Won"].includes(record.status)
        ? record.status
        : "Draft",
      ...window.BOQCalculations.calculateSummary(record.items || [], {
        commission: record.commission,
      }),
    };
    const search = [
      record.number,
      record.projectName,
      record.customerName,
      record.customerPoNumber,
    ].filter(Boolean).join(" ");
    const margin = formatPercent(record.marginPercent || 0);
    const attention = boqAttentionType(record);
    const revision = record.displayRevisionNumber === null ||
        record.displayRevisionNumber === undefined
      ? ""
      : visibleRevisionLabel(
        window.BOQStore.revisionLabel(record.displayRevisionNumber),
      );
    const deleteAction = record.status === "Draft" && !record.revisions?.length
      ? `<button class="menu-item danger-text" type="button" data-confirm data-confirm-event="records:delete" data-target-id="${record.id}" data-confirm-title="Delete ${
        escapeHtml(record.number || "this BOQ")
      }?" data-confirm-message="This draft BOQ and its line items will be permanently removed.">Delete</button>`
      : "";
    return {
      row: `<tr data-table-row data-record-id="${record.id}" data-search="${
        escapeHtml(search)
      }" data-status="${
        escapeHtml(
          (record.status || "Draft").toLowerCase().replaceAll(" ", "-"),
        )
      }" data-customer="${escapeHtml((record.customerName || "").toLowerCase())}" data-number="${
        escapeHtml(record.number || "")
      }" data-project-name="${
        escapeHtml(record.projectName || "")
      }" data-customer-po="${escapeHtml(record.customerPoNumber || "")}" data-attention="${escapeHtml(attention)}" data-value="${Number(record.totalSelling || 0)}" data-margin="${
        Number(record.marginPercent || 0)
      }" data-valid-until="${escapeHtml(record.validUntil || "")}" data-created="${escapeHtml(record.createdAt || "")}" data-updated="${
        escapeHtml(record.updatedAt || "")
      }"><td class="boq-number-cell"><a class="cell-primary" href="boq-editor.html?id=${
        encodeURIComponent(record.id)
      }">${
        escapeHtml(record.number || "Untitled")
      }</a>${revision ? `<span class="cell-secondary">${escapeHtml(revision)}</span>` : ""}</td><td>${escapeHtml(record.projectName || "—")}</td><td>${
        escapeHtml(record.customerName || "—")
      }</td><td>${
        statusHtml(record.status)
      }</td><td class="boq-po-cell">${
        escapeHtml(record.customerPoNumber || "")
      }</td><td class="align-right currency">${
        formatCurrencyMarkup(record.totalSelling || 0, record.currency || "USD")
      }</td><td class="align-right number">${margin}</td><td>${
        dateText(record.createdAt)
      }</td><td>${
        dateText(record.updatedAt)
      }</td><td>${
        dateText(record.validUntil)
      }</td><td><div class="row-actions"><a class="icon-button" href="boq-editor.html?id=${
        encodeURIComponent(record.id)
      }" aria-label="Edit ${
        escapeHtml(record.number || "BOQ")
      }">✎</a><div class="menu-wrap"><button class="icon-button" type="button" data-menu-trigger aria-expanded="false" aria-label="More actions">•••</button><div class="dropdown-menu" hidden><a class="menu-item" href="boq-editor.html?id=${encodeURIComponent(record.id)}&preview=pdf">Preview</a><button class="menu-item" type="button" data-record-action="duplicate" data-record-id="${record.id}">Duplicate</button><a class="menu-item" href="boq-editor.html?id=${encodeURIComponent(record.id)}&history=1">Revision history</a><a class="menu-item" href="boq-editor.html?id=${encodeURIComponent(record.id)}&export=excel">Export Excel</a><a class="menu-item" href="boq-editor.html?id=${encodeURIComponent(record.id)}&export=pdf">Download PDF</a><a class="menu-item" href="boq-editor.html?id=${encodeURIComponent(record.id)}&export=word">Download Word</a>${deleteAction}</div></div></div></td></tr>`,
      card:
        `<article class="record-card" data-record-card data-record-id="${record.id}" data-search="${
          escapeHtml(search)
        }" data-status="${
          escapeHtml(
            (record.status || "Draft").toLowerCase().replaceAll(" ", "-"),
          )
        }" data-customer="${
          escapeHtml((record.customerName || "").toLowerCase())
        }" data-attention="${escapeHtml(attention)}"><div class="record-card-header"><div><a class="cell-primary" href="boq-editor.html?id=${
          encodeURIComponent(record.id)
        }">${
          escapeHtml(record.number || "Untitled")
        }</a>${revision ? `<div class="muted text-sm">${escapeHtml(revision)}</div>` : ""}<div class="muted text-sm">${
          escapeHtml(record.projectName || "No project")
        }</div></div>${
          statusHtml(record.status)
        }</div><dl class="record-card-grid"><div><dt>Date</dt><dd>${
          dateText(record.date)
        }</dd></div><div><dt>Expires</dt><dd>${
          dateText(record.validUntil)
        }</dd></div><div><dt>Customer</dt><dd>${
          escapeHtml(record.customerName || "—")
        }</dd></div><div><dt>Customer PO</dt><dd>${
          escapeHtml(record.customerPoNumber || "—")
        }</dd></div><div><dt>Value</dt><dd>${
          formatCurrencyMarkup(record.totalSelling || 0, record.currency || "USD")
        }</dd></div><div><dt>Gross margin</dt><dd>${margin}</dd></div></dl><div class="cluster space-between card-actions"><span class="subtle text-sm">Updated ${
          dateText(record.updatedAt)
        }</span><a class="button button-secondary button-sm" href="boq-editor.html?id=${
          encodeURIComponent(record.id)
        }">${["Issued", "Won"].includes(record.status) && record.workingRevision === null ? "View" : "Edit"}</a></div></article>`,
    };
  }

  function renderProduct(record) {
    const margin = Math.max(
      0,
      Math.min(Number(record.defaultMargin || 0), 99.99),
    );
    const selling = window.BOQCalculations.calculateProductPricing({
      ...record,
      defaultMargin: margin,
    }).unitSelling;
    const search = [record.sku, record.name].filter(Boolean).join(" ");
    return {
      row: `<tr data-table-row data-record-id="${record.id}" data-search="${
        escapeHtml(search)
      }" data-category="${
        escapeHtml((record.category || "").toLowerCase())
      }" data-status="${
        escapeHtml((record.status || "Active").toLowerCase())
      }" data-sku="${escapeHtml(record.sku || "")}" data-product-name="${
        escapeHtml(record.name || "")
      }" data-cogs="${Number(record.defaultCogs || 0)}" data-margin="${
        Number(record.defaultMargin || 0)
      }"><td>${
        escapeHtml(record.sku || "")
      }</td><td><span class="cell-primary">${
        escapeHtml(record.name || "Untitled product")
      }</span></td><td>${escapeHtml(record.category || "—")}</td><td>${
        escapeHtml(record.unit || "Each")
      }</td><td class="align-right currency">${
        formatCurrencyMarkup(record.defaultCogs || 0, defaultCurrency)
      }</td><td class="align-right number">${
        formatPercent(record.defaultMargin || 0)
      }</td><td class="align-right currency cell-primary">${
        formatCurrencyMarkup(selling, defaultCurrency)
      }</td><td>${
        statusHtml(record.status || "Active")
      }</td><td><div class="row-actions"><button class="icon-button" type="button" data-record-action="edit" data-record-id="${record.id}" data-open-modal="record-form-modal" aria-label="Edit product">✎</button><button class="icon-button danger-text" type="button" data-confirm data-confirm-event="records:delete" data-target-id="${record.id}" data-confirm-title="Delete This Product?">×</button></div></td></tr>`,
      card:
        `<article class="record-card" data-record-card data-record-id="${record.id}" data-search="${
          escapeHtml(search)
        }" data-category="${
          escapeHtml((record.category || "").toLowerCase())
        }" data-status="${
          escapeHtml((record.status || "Active").toLowerCase())
        }"><div class="record-card-header"><div><strong>${
          escapeHtml(record.name || "Untitled product")
        }</strong>${record.sku ? `<div class="muted text-sm">${escapeHtml(record.sku)}</div>` : ""}</div>${
          statusHtml(record.status || "Active")
        }</div><dl class="record-card-grid"><div><dt>Category</dt><dd>${
          escapeHtml(record.category || "—")
        }</dd></div><div><dt>Unit</dt><dd>${
          escapeHtml(record.unit || "Each")
        }</dd></div><div><dt>COGS</dt><dd>${
          formatCurrencyMarkup(record.defaultCogs || 0, defaultCurrency)
        }</dd></div><div><dt>Selling</dt><dd>${
          formatCurrencyMarkup(selling, defaultCurrency)
        }</dd></div></dl></article>`,
    };
  }

  function renderCustomer(record) {
    const search = [
      record.companyName,
      record.contactPerson,
      record.email,
      record.phone,
    ].filter(Boolean).join(" ");
    const customerBoqs = displayBoqs().filter((boq) =>
      boq.customerId === record.id
    );
    const projectCount = new Set(customerBoqs.map((boq) =>
      boq.projectName?.trim().toLowerCase()
    ).filter(Boolean)).size;
    const boqCount = customerBoqs.length;
    return {
      row: `<tr data-table-row data-record-id="${record.id}" data-search="${
        escapeHtml(search)
      }" data-status="${
        escapeHtml((record.status || "Prospect").toLowerCase())
      }" data-company="${
        escapeHtml(record.companyName || "")
      }" data-projects="${projectCount}" data-boqs="${boqCount}"><td><button class="link cell-primary customer-company-link" type="button" data-record-action="detail" data-record-id="${record.id}" data-open-modal="record-detail-modal">${
        escapeHtml(record.companyName || "Untitled company")
      }</button><span class="cell-secondary">${
        escapeHtml(record.address || "No address")
      }</span></td><td>${escapeHtml(record.contactPerson || "—")}</td><td>${
        escapeHtml(record.email || "—")
      }<span class="cell-secondary">${
        escapeHtml(record.phone || "")
      }</span></td><td class="align-right number">${projectCount}</td><td class="align-right number">${boqCount}</td><td>${
        statusHtml(record.status || "Prospect")
      }</td><td><div class="row-actions"><button class="icon-button" type="button" data-record-action="edit" data-record-id="${record.id}" data-open-modal="record-form-modal" aria-label="Edit customer">✎</button><button class="icon-button danger-text" type="button" data-confirm data-confirm-event="records:delete" data-target-id="${record.id}" data-confirm-title="Delete This Customer?">×</button></div></td></tr>`,
      card:
        `<article class="record-card" data-record-card data-record-id="${record.id}" data-search="${
          escapeHtml(search)
        }" data-status="${
          escapeHtml((record.status || "Prospect").toLowerCase())
        }"><div class="record-card-header"><div><button class="link cell-primary" type="button" data-record-action="detail" data-record-id="${record.id}" data-open-modal="record-detail-modal">${
          escapeHtml(record.companyName || "Untitled company")
        }</button><div class="muted text-sm">${
          escapeHtml(record.contactPerson || "No contact")
        }</div></div>${
          statusHtml(record.status || "Prospect")
        }</div><dl class="record-card-grid"><div><dt>Email</dt><dd>${
          escapeHtml(record.email || "—")
        }</dd></div><div><dt>Phone</dt><dd>${
          escapeHtml(record.phone || "—")
        }</dd></div><div><dt>BOQ projects</dt><dd>${projectCount}</dd></div><div><dt>BOQs</dt><dd>${boqCount}</dd></div></dl></article>`,
    };
  }

  const renderer = {
    boqs: renderBoq,
    products: renderProduct,
    customers: renderCustomer,
  }[collection];

  function render() {
    const records = [...list(collection)].sort((a, b) =>
      new Date(b.updatedAt) - new Date(a.updatedAt)
    );
    const rendered = records.map(renderer);
    body.innerHTML = rendered.map((entry) => entry.row).join("");
    cards.innerHTML = rendered.map((entry) => entry.card).join("");
    table.hidden = records.length === 0;
    cards.hidden = records.length === 0;
    empty.hidden = records.length > 0;
    document.querySelectorAll("[data-total-records]").forEach((node) =>
      node.textContent = String(records.length)
    );
    updateDynamicOptions();
  }

  function updateDynamicOptions() {
    const customerFilter = document.querySelector("[data-customer-filter]");
    if (customerFilter) {
      const current = customerFilter.value;
      const customerNames = [...new Set(displayBoqs().map((record) =>
        record.customerName
      ).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      customerFilter.innerHTML = '<option value="">All customers</option>' +
        customerNames.map((name) =>
          `<option value="${escapeHtml(name.toLowerCase())}">${escapeHtml(name)}</option>`
        ).join("");
      customerFilter.value = current;
    }
    const categoryFilter = document.querySelector("[data-category-filter]");
    if (categoryFilter) {
      const current = categoryFilter.value;
      const values = [...new Set(list("products").map((record) =>
        record.category
      ).filter(Boolean))].sort();
      categoryFilter.innerHTML = '<option value="">All categories</option>' +
        values.map((value) =>
          `<option value="${escapeHtml(value.toLowerCase())}">${escapeHtml(value)}</option>`
        ).join("");
      categoryFilter.value = current;
    }
  }

  function productOptionValues(field, defaults, currentValue = "") {
    const savedValues = list("products").map((product) => product[field])
      .filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)));
    return collectUniqueTextValues(defaults, savedValues, currentValue);
  }

  function updateProductFormOptions(form, record) {
    if (collection !== "products") return;
    const optionSets = {
      category: ["Network", "Cabling", "Power", "Services", "Other"],
      unit: ["Each", "Lot", "Meter", "Hour", "Day", "Month"],
    };
    Object.entries(optionSets).forEach(([field, defaults]) => {
      const control = form.elements.namedItem(field);
      if (!(control instanceof HTMLSelectElement)) return;
      const selected = String(record?.[field] || control.value || defaults[0]);
      const values = productOptionValues(field, defaults, selected);
      control.innerHTML = values.map((value) =>
        `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
      ).join("");
      control.value = selected;
    });
  }

  function populateForm(record) {
    const form = document.querySelector("[data-record-form]");
    if (!form) return;
    form.reset();
    form.querySelector("[data-selling-price]")?.setAttribute(
      "data-manual",
      "false",
    );
    form.dataset.recordId = record?.id || "";
    updateProductFormOptions(form, record);
    const recordLabel = singular(collection);
    const headingLabel =
      recordLabel === "BOQ"
        ? recordLabel
        : `${recordLabel.charAt(0).toUpperCase()}${recordLabel.slice(1)}`;
    document.querySelector("[data-record-form-title]").textContent = record
      ? `Edit ${headingLabel}`
      : `Add ${headingLabel}`;
    if (!record) {
      updateCalculatedProductPrice();
      formatProductNumberFields(form);
      return;
    }
    Object.entries(record).forEach(([key, value]) => {
      const control = form.elements.namedItem(key);
      if (!control) return;
      if (control instanceof HTMLSelectElement && value &&
          ![...control.options].some((option) =>
            option.value === String(value)
          )) {
        control.add(new Option(String(value), String(value)));
      }
      control.value = value ?? "";
    });
    if (collection === "products" &&
        Number(record.defaultCogs || 0) <= 0 &&
        record.defaultSellingPrice !== null &&
        record.defaultSellingPrice !== undefined &&
        record.defaultSellingPrice !== "") {
      form.querySelector("[data-selling-price]").dataset.manual = "true";
    }
    updateCalculatedProductPrice();
    formatProductNumberFields(form);
  }

  function formatProductNumberFields(form) {
    if (collection !== "products") return;
    form.querySelectorAll("[data-product-number-input]").forEach((input) => {
      if (input.value === "") return;
      input.value = formatNumberInput(
        Math.max(0, parseNumberInput(input.value)),
      );
    });
  }

  function singular(value) {
    return value === "customers"
      ? "customer"
      : value === "products"
      ? "product"
      : "BOQ";
  }

  function formRecord(form) {
    const values = Object.fromEntries(new FormData(form));
    if (collection === "products") {
      values.defaultCogs = Math.max(0, parseNumberInput(values.defaultCogs));
      values.defaultMargin = Number(values.defaultMargin || 0);
      values.defaultSellingPrice = values.defaultCogs > 0 ||
          values.defaultSellingPrice === ""
        ? null
        : Math.max(0, parseNumberInput(values.defaultSellingPrice));
    }
    return values;
  }

  function showDetail(record) {
    const host = document.querySelector("[data-record-detail]");
    if (!host || !record) return;
    if (collection === "boqs") {
      record = window.BOQStore.registerBoqView(record);
      const revision = record.displayRevisionNumber === null ||
          record.displayRevisionNumber === undefined
        ? ""
        : visibleRevisionLabel(
          window.BOQStore.revisionLabel(record.displayRevisionNumber),
        );
      const summary = window.BOQCalculations.calculateSummary(
        record.items || [],
        { commission: record.commission },
      );
      host.innerHTML =
        `<div class="stack-md"><div><span class="muted text-sm">${
          escapeHtml(record.number || "Untitled")
        }</span><h2>${
          escapeHtml(record.projectName || "No project")
        }</h2></div><dl class="stack-sm"><div class="cluster space-between"><dt class="muted">Customer</dt><dd>${
          escapeHtml(record.customerName || "—")
        }</dd></div><div class="cluster space-between"><dt class="muted">Status</dt><dd>${
          statusHtml(record.status)
        }</dd></div><div class="cluster space-between"><dt class="muted">Customer PO</dt><dd>${
          escapeHtml(record.customerPoNumber || "—")
        }</dd></div><div class="cluster space-between"><dt class="muted">Expires</dt><dd>${
          dateText(record.validUntil)
        }</dd></div><div class="cluster space-between"><dt class="muted">Revision</dt><dd>${
          escapeHtml(revision || "Not issued")
        }</dd></div><div class="cluster space-between"><dt class="muted">Items</dt><dd>${
          record.items?.length || 0
        }</dd></div><div class="cluster space-between"><dt class="muted">Total selling</dt><dd class="text-medium">${
          formatCurrencyMarkup(summary.totalSelling, record.currency || defaultCurrency)
        }</dd></div></dl></div>`;
    } else if (collection === "customers") {
      const relatedBoqs = displayBoqs().filter((boq) =>
        boq.customerId === record.id
      );
      const projectCount = new Set(relatedBoqs.map((boq) =>
        boq.projectName?.trim().toLowerCase()
      ).filter(Boolean)).size;
      const relationships = relatedBoqs.map((boq) => ({
        label: boq.number || "BOQ",
        title: boq.projectName,
        href: `boq-editor.html?id=${encodeURIComponent(boq.id)}`,
      }));
      const relatedList = relationships.length
        ? `<div class="related-records"><strong>Related records</strong>${relationships.map((entry) =>
          entry.href
            ? `<a href="${entry.href}"><span>${escapeHtml(entry.label)}</span><small>${escapeHtml(entry.title || "Untitled")}</small></a>`
            : `<div><span>${escapeHtml(entry.label)}</span><small>${escapeHtml(entry.title || "Untitled")}</small></div>`
        ).join("")}</div>`
        : "";
      host.innerHTML = `<div class="stack-lg"><h2>${
        escapeHtml(record.companyName || "Untitled company")
      }</h2><dl class="stack-sm"><div class="cluster space-between"><dt class="muted">Contact</dt><dd>${
        escapeHtml(record.contactPerson || "—")
      }</dd></div><div class="cluster space-between"><dt class="muted">Email</dt><dd>${
        escapeHtml(record.email || "—")
      }</dd></div><div class="cluster space-between"><dt class="muted">Phone</dt><dd>${
        escapeHtml(record.phone || "—")
      }</dd></div><div class="cluster space-between"><dt class="muted">BOQ projects</dt><dd>${projectCount}</dd></div><div class="cluster space-between"><dt class="muted">BOQs</dt><dd>${relatedBoqs.length}</dd></div></dl>${relatedList}</div>`;
    }
  }

  function updateCalculatedProductPrice() {
    if (collection !== "products") return;
    const form = document.querySelector("[data-record-form]");
    const output = form?.querySelector("[data-selling-price]");
    if (!form || !output) return;
    const cogs = parseNumberInput(form.elements.defaultCogs.value);
    const margin = Number(form.elements.defaultMargin.value || 0);
    const hasCogs = Number.isFinite(cogs) && cogs > 0;
    output.readOnly = hasCogs;
    output.setAttribute("aria-readonly", String(hasCogs));
    if (!hasCogs) {
      if (output.dataset.manual !== "true") output.value = "";
      return;
    }
    output.dataset.manual = "false";
    output.value = formatNumberInput(window.BOQCalculations.calculateItem({
      qty: 1,
      unitCogs: cogs,
      margin,
    }).unitSelling);
  }

  document.addEventListener("click", (event) => {
    const createButton = event.target.closest("[data-record-create]");
    if (createButton) populateForm(null);
    const action = event.target.closest("[data-record-action]");
    if (!action) return;
    const record = get(collection, action.dataset.recordId);
    if (action.dataset.recordAction === "edit") populateForm(record);
    if (action.dataset.recordAction === "detail") {
      showDetail(record);
    }
    if (action.dataset.recordAction === "duplicate" && record) {
      const duplicate = {
        ...record,
        id: undefined,
        createdAt: undefined,
        updatedAt: undefined,
        number: nextNumber("boqs", "BOQ"),
        status: "Draft",
        revisions: [],
        activeRevisionNumber: null,
        workingRevision: null,
        hasDraftChanges: false,
        issuedAt: undefined,
        wonAt: undefined,
        customerPoNumber: undefined,
      };
      save(collection, duplicate);
      render();
      document.dispatchEvent(new CustomEvent("records:changed"));
      window.BOQApp.showToast("BOQ duplicated.");
    }
  });

  document.addEventListener("records:delete", (event) => {
    const record = get(collection, event.detail.targetId);
    if (collection === "boqs" &&
        (["Issued", "Won"].includes(record?.status) ||
          record?.revisions?.length)) {
      window.BOQApp.showToast(
        "Issued or Won BOQs cannot be deleted.",
        "error",
      );
      return;
    }
    remove(collection, event.detail.targetId);
    render();
    document.dispatchEvent(new CustomEvent("records:changed"));
    window.BOQApp.showToast(`${singular(collection)} deleted.`);
  });

  document.querySelector("[data-record-form]")?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.checkValidity()) return form.reportValidity();
      save(collection, {
        ...formRecord(form),
        id: form.dataset.recordId || undefined,
      });
      const updatedExistingBoqs = collection === "products" &&
        backfillBoqPartNumbers();
      window.BOQModal.close(form.closest(".modal-backdrop"));
      render();
      document.dispatchEvent(new CustomEvent("records:changed"));
      window.BOQApp.showToast(
        updatedExistingBoqs
          ? "Product saved. Existing BOQs updated."
          : `${singular(collection)} saved.`,
      );
    },
  );

  document.querySelector("[data-record-form]")?.addEventListener(
    "input",
    (event) => {
      const numberInput = event.target.closest("[data-product-number-input]");
      if (numberInput && !numberInput.readOnly) {
        formatNumberInputElementLive(numberInput);
      }
      if (collection === "products" &&
          event.target.matches("[data-selling-price]")) {
        const cogs = parseNumberInput(
          event.currentTarget.elements.defaultCogs.value,
        );
        if (Number.isFinite(cogs) && cogs > 0) {
          updateCalculatedProductPrice();
          return;
        }
        event.target.dataset.manual = event.target.value === ""
          ? "false"
          : "true";
        return;
      }
      updateCalculatedProductPrice();
    },
  );
  document.querySelector("[data-record-form]")?.addEventListener(
    "focusout",
    (event) => {
      const input = event.target.closest("[data-product-number-input]");
      if (!input || input.value === "") return;
      input.value = formatNumberInput(
        Math.max(0, parseNumberInput(input.value)),
      );
    },
  );
  document.addEventListener("boq:workspace-updated", () => {
    defaultCurrency = window.BOQStore.getSettings().defaultCurrency || "USD";
    render();
  });
  render();
})();
