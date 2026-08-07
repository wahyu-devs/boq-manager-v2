(function initializeRecordPages() {
  const page = document.body.dataset.page;
  const collectionByPage = {
    boqs: "boqs",
    projects: "projects",
    products: "products",
    customers: "customers",
  };
  const collection = collectionByPage[page];
  if (!collection) return;

  const { list, get, save, remove, nextNumber } = window.BOQStore;
  const { escapeHtml, formatCurrency, formatPercent } = window.BOQUtils;
  const defaultCurrency = window.BOQStore.getSettings().defaultCurrency ||
    "USD";
  const body = document.querySelector("[data-records-body]");
  const cards = document.querySelector("[data-records-cards]");
  const table = document.querySelector("[data-records-table]");
  const empty = document.querySelector("[data-records-empty]");

  function statusClass(status) {
    const map = {
      Draft: "draft",
      "In Review": "review",
      Approved: "approved",
      Sent: "sent",
      Won: "won",
      Lost: "lost",
      Active: "active",
      Planning: "review",
      "On Hold": "draft",
      Completed: "approved",
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
      ...window.BOQCalculations.calculateSummary(record.items || []),
    };
    const search = [
      record.number,
      record.title,
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
      }" data-project="${escapeHtml(record.projectId || "")}" data-number="${
        escapeHtml(record.number || "")
      }" data-project-name="${
        escapeHtml(record.projectName || "")
      }" data-value="${Number(record.totalSelling || 0)}" data-margin="${
        Number(record.marginPercent || 0)
      }" data-created="${escapeHtml(record.createdAt || "")}" data-updated="${
        escapeHtml(record.updatedAt || "")
      }"><td><a class="cell-primary" href="boq-editor.html?id=${
        encodeURIComponent(record.id)
      }">${
        escapeHtml(record.number || "Untitled")
      }</a><span class="cell-secondary">${
        escapeHtml(record.title || "Untitled BOQ")
      }</span></td><td>${escapeHtml(record.projectName || "—")}</td><td>${
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
      }">✎</a><div class="menu-wrap"><button class="icon-button" type="button" data-menu-trigger aria-expanded="false" aria-label="More actions">•••</button><div class="dropdown-menu" hidden><button class="menu-item" type="button" data-record-action="preview" data-record-id="${record.id}" data-open-modal="record-detail-modal">Preview</button><button class="menu-item" type="button" data-record-action="duplicate" data-record-id="${record.id}">Duplicate</button><button class="menu-item danger-text" type="button" data-confirm data-confirm-event="records:delete" data-target-id="${record.id}" data-confirm-title="Delete ${
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
          escapeHtml(record.projectId || "")
        }"><div class="record-card-header"><div><a class="cell-primary" href="boq-editor.html?id=${
          encodeURIComponent(record.id)
        }">${
          escapeHtml(record.number || "Untitled")
        }</a><div class="muted text-sm">${
          escapeHtml(record.title || "Untitled BOQ")
        }</div></div>${
          statusHtml(record.status)
        }</div><dl class="record-card-grid"><div><dt>Project</dt><dd>${
          escapeHtml(record.projectName || "—")
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

  function renderProject(record) {
    const search = [record.name, record.code, record.customerName, record.owner]
      .filter(Boolean).join(" ");
    const boqCount =
      list("boqs").filter((boq) => boq.projectId === record.id).length;
    return {
      row: `<tr data-table-row data-record-id="${record.id}" data-search="${
        escapeHtml(search)
      }" data-status="${
        escapeHtml(
          (record.status || "Planning").toLowerCase().replaceAll(" ", "-"),
        )
      }" data-owner="${escapeHtml(record.owner || "")}" data-project-name="${
        escapeHtml(record.name || "")
      }" data-value="${
        Number(record.estimatedValue || 0)
      }" data-boqs="${boqCount}"><td><button class="link cell-primary" type="button" data-record-action="detail" data-record-id="${record.id}" data-open-modal="record-detail-modal">${
        escapeHtml(record.name || "Untitled project")
      }</button><span class="cell-secondary">${
        escapeHtml(record.notes || "No notes")
      }</span></td><td class="mono">${escapeHtml(record.code || "—")}</td><td>${
        escapeHtml(record.customerName || "—")
      }</td><td>${escapeHtml(record.owner || "—")}</td><td>${
        statusHtml(record.status || "Planning")
      }</td><td>${
        dateText(record.startDate)
      }</td><td class="align-right currency">${
        formatCurrency(record.estimatedValue || 0, defaultCurrency)
      }</td><td class="align-right number">${boqCount}</td><td><div class="row-actions"><button class="icon-button" type="button" data-record-action="edit" data-record-id="${record.id}" data-open-modal="record-form-modal" aria-label="Edit project">✎</button><button class="icon-button danger-text" type="button" data-confirm data-confirm-event="records:delete" data-target-id="${record.id}" data-confirm-title="Delete this project?">×</button></div></td></tr>`,
      card:
        `<article class="record-card" data-record-card data-record-id="${record.id}" data-search="${
          escapeHtml(search)
        }" data-status="${
          escapeHtml(
            (record.status || "Planning").toLowerCase().replaceAll(" ", "-"),
          )
        }" data-owner="${
          escapeHtml(record.owner || "")
        }"><div class="record-card-header"><div><button class="link cell-primary" type="button" data-record-action="detail" data-record-id="${record.id}" data-open-modal="record-detail-modal">${
          escapeHtml(record.name || "Untitled project")
        }</button><div class="muted text-sm mono">${
          escapeHtml(record.code || "—")
        }</div></div>${
          statusHtml(record.status || "Planning")
        }</div><dl class="record-card-grid"><div><dt>Customer</dt><dd>${
          escapeHtml(record.customerName || "—")
        }</dd></div><div><dt>Owner</dt><dd>${
          escapeHtml(record.owner || "—")
        }</dd></div><div><dt>Est. value</dt><dd>${
          formatCurrency(record.estimatedValue || 0, defaultCurrency)
        }</dd></div><div><dt>BOQs</dt><dd>${boqCount}</dd></div></dl></article>`,
    };
  }

  function renderProduct(record) {
    const margin = Math.max(
      0,
      Math.min(Number(record.defaultMargin || 0), 99.99),
    );
    const selling = Number(record.defaultCogs || 0) / (1 - margin / 100);
    const search = [record.sku, record.name, record.description].filter(Boolean)
      .join(" ");
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
        escapeHtml(record.sku || "—")
      }</td><td><span class="cell-primary">${
        escapeHtml(record.name || "Untitled product")
      }</span><span class="cell-secondary">${
        escapeHtml(record.description || "No description")
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
        }</strong><div class="muted text-sm mono">${
          escapeHtml(record.sku || "—")
        }</div></div>${
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
    const projectCount =
      list("projects").filter((project) => project.customerId === record.id)
        .length;
    const boqCount =
      list("boqs").filter((boq) => boq.customerId === record.id).length;
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
        }</dd></div><div><dt>Projects</dt><dd>${projectCount}</dd></div><div><dt>BOQs</dt><dd>${boqCount}</dd></div></dl></article>`,
    };
  }

  const renderer = {
    boqs: renderBoq,
    projects: renderProject,
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
    const ownerFilter = document.querySelector("[data-owner-filter]");
    if (ownerFilter) {
      const current = ownerFilter.value;
      const owners = [
        ...new Set(
          list("projects").map((record) => record.owner).filter(Boolean),
        ),
      ].sort();
      ownerFilter.innerHTML = '<option value="">All owners</option>' +
        owners.map((owner) =>
          `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`
        ).join("");
      ownerFilter.value = current;
    }
    const projectFilter = document.querySelector("[data-project-filter]");
    if (projectFilter) {
      const current = projectFilter.value;
      projectFilter.innerHTML = '<option value="">All projects</option>' +
        list("projects").map((record) =>
          `<option value="${record.id}">${escapeHtml(record.name)}</option>`
        ).join("");
      projectFilter.value = current;
    }
    const customerSelect = document.querySelector('[name="customerId"]');
    if (customerSelect) {
      const current = customerSelect.value;
      customerSelect.innerHTML =
        '<option value="">No customer selected</option>' +
        list("customers").map((record) =>
          `<option value="${record.id}">${
            escapeHtml(record.companyName)
          }</option>`
        ).join("");
      customerSelect.value = current;
    }
  }

  function populateForm(record) {
    const form = document.querySelector("[data-record-form]");
    if (!form) return;
    form.reset();
    form.dataset.recordId = record?.id || "";
    document.querySelector("[data-record-form-title]").textContent = record
      ? `Edit ${singular(collection)}`
      : `Add ${singular(collection)}`;
    if (!record) {
      if (collection === "projects") {
        form.elements.code.value = nextNumber("projects", "PRJ");
      }
      return;
    }
    Object.entries(record).forEach(([key, value]) => {
      const control = form.elements.namedItem(key);
      if (control) control.value = value ?? "";
    });
    updateCalculatedProductPrice();
  }

  function singular(value) {
    return value === "customers"
      ? "customer"
      : value === "products"
      ? "product"
      : value === "projects"
      ? "project"
      : "BOQ";
  }

  function formRecord(form) {
    const values = Object.fromEntries(new FormData(form));
    if (collection === "projects") {
      const customer = get("customers", values.customerId);
      values.customerName = customer?.companyName || "";
      values.estimatedValue = Number(values.estimatedValue || 0);
    }
    if (collection === "products") {
      values.defaultCogs = Number(values.defaultCogs || 0);
      values.defaultMargin = Number(values.defaultMargin || 0);
    }
    return values;
  }

  function showDetail(record) {
    const host = document.querySelector("[data-record-detail]");
    if (!host || !record) return;
    if (collection === "boqs") {
      host.innerHTML =
        `<div class="stack-md"><div><span class="muted text-sm">${
          escapeHtml(record.number || "Untitled")
        }</span><h2>${
          escapeHtml(record.title || "Untitled BOQ")
        }</h2></div><dl class="stack-sm"><div class="cluster space-between"><dt class="muted">Project</dt><dd>${
          escapeHtml(record.projectName || "—")
        }</dd></div><div class="cluster space-between"><dt class="muted">Customer</dt><dd>${
          escapeHtml(record.customerName || "—")
        }</dd></div><div class="cluster space-between"><dt class="muted">Status</dt><dd>${
          statusHtml(record.status)
        }</dd></div><div class="cluster space-between"><dt class="muted">Items</dt><dd>${
          record.items?.length || 0
        }</dd></div><div class="cluster space-between"><dt class="muted">Total selling</dt><dd class="text-medium">${
          formatCurrency(record.totalSelling || 0, record.currency || "USD")
        }</dd></div></dl></div>`;
    } else if (collection === "projects") {
      const related = list("boqs").filter((boq) => boq.projectId === record.id);
      host.innerHTML =
        `<div class="stack-lg"><div><span class="muted text-sm mono">${
          escapeHtml(record.code || "No code")
        }</span><h2>${
          escapeHtml(record.name || "Untitled project")
        }</h2></div><dl class="stack-sm"><div class="cluster space-between"><dt class="muted">Customer</dt><dd>${
          escapeHtml(record.customerName || "—")
        }</dd></div><div class="cluster space-between"><dt class="muted">Owner</dt><dd>${
          escapeHtml(record.owner || "—")
        }</dd></div><div class="cluster space-between"><dt class="muted">Status</dt><dd>${
          statusHtml(record.status || "Planning")
        }</dd></div><div class="cluster space-between"><dt class="muted">Related BOQs</dt><dd>${related.length}</dd></div></dl></div>`;
    } else if (collection === "customers") {
      const relatedProjects = list("projects").filter((project) =>
        project.customerId === record.id
      );
      const relatedBoqs = list("boqs").filter((boq) =>
        boq.customerId === record.id
      );
      host.innerHTML = `<div class="stack-lg"><h2>${
        escapeHtml(record.companyName || "Untitled company")
      }</h2><dl class="stack-sm"><div class="cluster space-between"><dt class="muted">Contact</dt><dd>${
        escapeHtml(record.contactPerson || "—")
      }</dd></div><div class="cluster space-between"><dt class="muted">Email</dt><dd>${
        escapeHtml(record.email || "—")
      }</dd></div><div class="cluster space-between"><dt class="muted">Phone</dt><dd>${
        escapeHtml(record.phone || "—")
      }</dd></div><div class="cluster space-between"><dt class="muted">Projects</dt><dd>${relatedProjects.length}</dd></div><div class="cluster space-between"><dt class="muted">BOQs</dt><dd>${relatedBoqs.length}</dd></div></dl></div>`;
    }
  }

  function updateCalculatedProductPrice() {
    if (collection !== "products") return;
    const form = document.querySelector("[data-record-form]");
    const output = form?.querySelector("[data-selling-price]");
    if (!form || !output) return;
    const cogs = Number(form.elements.defaultCogs.value || 0);
    const margin = Number(form.elements.defaultMargin.value || 0);
    output.value = formatCurrency(
      cogs / (1 - Math.max(0, Math.min(margin, 99.99)) / 100),
      defaultCurrency,
    );
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
        number: nextNumber("boqs", "BOQ"),
        title: `${record.title || "Untitled BOQ"} Copy`,
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
      window.BOQModal.close(form.closest(".modal-backdrop"));
      render();
      document.dispatchEvent(new CustomEvent("records:changed"));
      window.BOQApp.showToast(`${singular(collection)} saved.`);
    },
  );

  document.querySelector("[data-record-form]")?.addEventListener(
    "input",
    updateCalculatedProductPrice,
  );
  render();
})();
