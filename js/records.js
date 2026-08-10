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
  const { escapeHtml, formatCurrency, formatPercent } = window.BOQUtils;
  let defaultCurrency = window.BOQStore.getSettings().defaultCurrency ||
    "USD";
  const body = document.querySelector("[data-records-body]");
  const cards = document.querySelector("[data-records-cards]");
  const table = document.querySelector("[data-records-table]");
  const empty = document.querySelector("[data-records-empty]");

  function statusClass(status) {
    const map = {
      Draft: "draft",
      Sent: "sent",
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
    record = {
      ...record,
      status: record.status === "Sent" ? "Sent" : "Draft",
      ...window.BOQCalculations.calculateSummary(record.items || [], {
        commission: record.commission,
      }),
    };
    const search = [
      record.number,
      record.projectName,
      record.customerName,
    ].filter(Boolean).join(" ");
    const margin = formatPercent(record.marginPercent || 0);
    return {
      row: `<tr data-table-row data-record-id="${record.id}" data-search="${
        escapeHtml(search)
      }" data-status="${
        escapeHtml(
          (record.status || "Draft").toLowerCase().replaceAll(" ", "-"),
        )
      }" data-project="${escapeHtml((record.projectName || "").toLowerCase())}" data-number="${
        escapeHtml(record.number || "")
      }" data-project-name="${
        escapeHtml(record.projectName || "")
      }" data-value="${Number(record.totalSelling || 0)}" data-margin="${
        Number(record.marginPercent || 0)
      }" data-created="${escapeHtml(record.createdAt || "")}" data-updated="${
        escapeHtml(record.updatedAt || "")
      }"><td class="boq-number-cell"><a class="cell-primary" href="boq-editor.html?id=${
        encodeURIComponent(record.id)
      }">${
        escapeHtml(record.number || "Untitled")
      }</a></td><td>${escapeHtml(record.projectName || "—")}</td><td>${
        escapeHtml(record.customerName || "—")
      }</td><td>${
        statusHtml(record.status)
      }</td><td class="align-right currency">${
        formatCurrency(record.totalSelling || 0, record.currency || "USD")
      }</td><td class="align-right number">${margin}</td><td>${
        dateText(record.createdAt)
      }</td><td>${
        dateText(record.updatedAt)
      }</td><td><div class="row-actions"><a class="icon-button" href="boq-editor.html?id=${
        encodeURIComponent(record.id)
      }" aria-label="Edit ${
        escapeHtml(record.number || "BOQ")
      }">✎</a><div class="menu-wrap"><button class="icon-button" type="button" data-menu-trigger aria-expanded="false" aria-label="More actions">•••</button><div class="dropdown-menu" hidden><button class="menu-item" type="button" data-record-action="preview" data-record-id="${record.id}" data-open-modal="record-detail-modal">Preview</button><button class="menu-item" type="button" data-record-action="duplicate" data-record-id="${record.id}">Duplicate</button><a class="menu-item" href="boq-editor.html?id=${encodeURIComponent(record.id)}&export=excel">Export Excel</a><a class="menu-item" href="boq-editor.html?id=${encodeURIComponent(record.id)}&export=pdf">Download PDF</a><button class="menu-item danger-text" type="button" data-confirm data-confirm-event="records:delete" data-target-id="${record.id}" data-confirm-title="Delete ${
        escapeHtml(record.number || "this BOQ")
      }?" data-confirm-message="This BOQ and its line items will be permanently removed.">Delete</button></div></div></div></td></tr>`,
      card:
        `<article class="record-card" data-record-card data-record-id="${record.id}" data-search="${
          escapeHtml(search)
        }" data-status="${
          escapeHtml(
            (record.status || "Draft").toLowerCase().replaceAll(" ", "-"),
          )
        }" data-project="${
          escapeHtml((record.projectName || "").toLowerCase())
        }"><div class="record-card-header"><div><a class="cell-primary" href="boq-editor.html?id=${
          encodeURIComponent(record.id)
        }">${
          escapeHtml(record.number || "Untitled")
        }</a><div class="muted text-sm">${
          escapeHtml(record.projectName || "No project")
        }</div></div>${
          statusHtml(record.status)
        }</div><dl class="record-card-grid"><div><dt>Date</dt><dd>${
          dateText(record.date)
        }</dd></div><div><dt>Customer</dt><dd>${
          escapeHtml(record.customerName || "—")
        }</dd></div><div><dt>Value</dt><dd>${
          formatCurrency(record.totalSelling || 0, record.currency || "USD")
        }</dd></div><div><dt>Gross margin</dt><dd>${margin}</dd></div></dl><div class="cluster space-between card-actions"><span class="subtle text-sm">Updated ${
          dateText(record.updatedAt)
        }</span><a class="button button-secondary button-sm" href="boq-editor.html?id=${
          encodeURIComponent(record.id)
        }">Edit</a></div></article>`,
    };
  }

  function renderProduct(record) {
    const margin = Math.max(
      0,
      Math.min(Number(record.defaultMargin || 0), 99.99),
    );
    const selling = window.BOQCalculations.calculateItem({
      qty: 1,
      unitCogs: record.defaultCogs,
      margin,
      sellingOverride: record.defaultSellingPrice,
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
      }"><td class="mono">${
        escapeHtml(record.sku || "")
      }</td><td><span class="cell-primary">${
        escapeHtml(record.name || "Untitled product")
      }</span></td><td>${escapeHtml(record.category || "—")}</td><td>${
        escapeHtml(record.unit || "Each")
      }</td><td class="align-right currency">${
        formatCurrency(record.defaultCogs || 0, defaultCurrency)
      }</td><td class="align-right number">${
        formatPercent(record.defaultMargin || 0)
      }</td><td class="align-right currency cell-primary">${
        formatCurrency(selling, defaultCurrency)
      }</td><td>${
        statusHtml(record.status || "Active")
      }</td><td><div class="row-actions"><button class="icon-button" type="button" data-record-action="edit" data-record-id="${record.id}" data-open-modal="record-form-modal" aria-label="Edit product">✎</button><button class="icon-button danger-text" type="button" data-confirm data-confirm-event="records:delete" data-target-id="${record.id}" data-confirm-title="Delete this product?">×</button></div></td></tr>`,
      card:
        `<article class="record-card" data-record-card data-record-id="${record.id}" data-search="${
          escapeHtml(search)
        }" data-category="${
          escapeHtml((record.category || "").toLowerCase())
        }" data-status="${
          escapeHtml((record.status || "Active").toLowerCase())
        }"><div class="record-card-header"><div><strong>${
          escapeHtml(record.name || "Untitled product")
        }</strong>${record.sku ? `<div class="muted text-sm mono">${escapeHtml(record.sku)}</div>` : ""}</div>${
          statusHtml(record.status || "Active")
        }</div><dl class="record-card-grid"><div><dt>Category</dt><dd>${
          escapeHtml(record.category || "—")
        }</dd></div><div><dt>Unit</dt><dd>${
          escapeHtml(record.unit || "Each")
        }</dd></div><div><dt>COGS</dt><dd>${
          formatCurrency(record.defaultCogs || 0, defaultCurrency)
        }</dd></div><div><dt>Selling</dt><dd>${
          formatCurrency(selling, defaultCurrency)
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
    const customerBoqs = list("boqs").filter((boq) =>
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
      }" data-projects="${projectCount}" data-boqs="${boqCount}"><td><button class="link cell-primary" type="button" data-record-action="detail" data-record-id="${record.id}" data-open-modal="record-detail-modal">${
        escapeHtml(record.companyName || "Untitled company")
      }</button><span class="cell-secondary">${
        escapeHtml(record.address || "No address")
      }</span></td><td>${escapeHtml(record.contactPerson || "—")}</td><td>${
        escapeHtml(record.email || "—")
      }<span class="cell-secondary">${
        escapeHtml(record.phone || "")
      }</span></td><td class="align-right number">${projectCount}</td><td class="align-right number">${boqCount}</td><td>${
        statusHtml(record.status || "Prospect")
      }</td><td><div class="row-actions"><button class="icon-button" type="button" data-record-action="edit" data-record-id="${record.id}" data-open-modal="record-form-modal" aria-label="Edit customer">✎</button><button class="icon-button danger-text" type="button" data-confirm data-confirm-event="records:delete" data-target-id="${record.id}" data-confirm-title="Delete this customer?">×</button></div></td></tr>`,
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
    const projectFilter = document.querySelector("[data-project-filter]");
    if (projectFilter) {
      const current = projectFilter.value;
      const projectNames = [...new Set(list("boqs").map((record) =>
        record.projectName
      ).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      projectFilter.innerHTML = '<option value="">All projects</option>' +
        projectNames.map((name) =>
          `<option value="${escapeHtml(name.toLowerCase())}">${escapeHtml(name)}</option>`
        ).join("");
      projectFilter.value = current;
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
    const seen = new Set();
    const values = [];
    const add = (value) => {
      const text = String(value || "").trim();
      const key = text.toLowerCase();
      if (!text || seen.has(key)) return;
      seen.add(key);
      values.push(text);
    };
    defaults.forEach(add);
    list("products").map((product) => product[field]).filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b))).forEach(add);
    add(currentValue);
    return values;
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
    document.querySelector("[data-record-form-title]").textContent = record
      ? `Edit ${singular(collection)}`
      : `Add ${singular(collection)}`;
    if (!record) {
      updateCalculatedProductPrice();
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
        record.defaultSellingPrice !== null &&
        record.defaultSellingPrice !== undefined &&
        record.defaultSellingPrice !== "") {
      form.querySelector("[data-selling-price]").dataset.manual = "true";
    }
    updateCalculatedProductPrice();
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
      values.defaultCogs = Number(values.defaultCogs || 0);
      values.defaultMargin = Number(values.defaultMargin || 0);
      values.defaultSellingPrice = values.defaultSellingPrice === ""
        ? null
        : Number(values.defaultSellingPrice || 0);
    }
    return values;
  }

  function showDetail(record) {
    const host = document.querySelector("[data-record-detail]");
    if (!host || !record) return;
    if (collection === "boqs") {
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
        }</dd></div><div class="cluster space-between"><dt class="muted">Items</dt><dd>${
          record.items?.length || 0
        }</dd></div><div class="cluster space-between"><dt class="muted">Total selling</dt><dd class="text-medium">${
          formatCurrency(summary.totalSelling, record.currency || defaultCurrency)
        }</dd></div></dl></div>`;
    } else if (collection === "customers") {
      const relatedBoqs = list("boqs").filter((boq) =>
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
    const cogs = Number(form.elements.defaultCogs.value || 0);
    const margin = Number(form.elements.defaultMargin.value || 0);
    if (output.dataset.manual === "true") return;
    output.value = window.BOQCalculations.calculateItem({
      qty: 1,
      unitCogs: cogs,
      margin,
    }).unitSelling;
  }

  document.addEventListener("click", (event) => {
    const createButton = event.target.closest("[data-record-create]");
    if (createButton) populateForm(null);
    const action = event.target.closest("[data-record-action]");
    if (!action) return;
    const record = get(collection, action.dataset.recordId);
    if (action.dataset.recordAction === "edit") populateForm(record);
    if (["detail", "preview"].includes(action.dataset.recordAction)) {
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
      };
      save(collection, duplicate);
      render();
      document.dispatchEvent(new CustomEvent("records:changed"));
      window.BOQApp.showToast("BOQ duplicated.");
    }
  });

  document.addEventListener("records:delete", (event) => {
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
      if (collection === "products" &&
          event.target.matches("[data-selling-price]")) {
        event.target.dataset.manual = event.target.value === ""
          ? "false"
          : "true";
        if (event.target.value === "") updateCalculatedProductPrice();
        return;
      }
      updateCalculatedProductPrice();
    },
  );
  document.addEventListener("boq:workspace-updated", () => {
    defaultCurrency = window.BOQStore.getSettings().defaultCurrency || "USD";
    render();
  });
  render();
})();
