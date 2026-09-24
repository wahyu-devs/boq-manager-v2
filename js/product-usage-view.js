(function defineProductUsageView() {
  const {
    escapeHtml,
    formatCurrencyMarkup,
    formatPercent,
    formatNumberInput,
    formatDate,
    matchesSearchQuery,
    visibleRevisionLabel,
  } = window.BOQUtils;

  function statusClass(status) {
    return { Draft: "draft", Issued: "issued", Won: "won" }[status] ||
      "draft";
  }

  function statusHtml(status) {
    const value = status || "Draft";
    return `<span class="status status-${statusClass(value)}">${
      escapeHtml(value)
    }</span>`;
  }

  function optionalCurrencyMarkup(value, currency) {
    return value === null || value === undefined
      ? '<span class="muted">—</span>'
      : formatCurrencyMarkup(value, currency);
  }

  function optionalPercent(value) {
    return value === null || value === undefined
      ? '<span class="muted">—</span>'
      : formatPercent(value);
  }

  function ensureModal() {
    const existing = document.getElementById("product-usage-modal");
    if (existing) return existing;
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="modal-backdrop" id="product-usage-modal" hidden>
        <section class="modal modal-xl product-usage-modal" role="dialog" aria-modal="true" aria-labelledby="product-usage-title">
          <header class="modal-header">
            <div>
              <h2 id="product-usage-title">Product Usage History</h2>
              <p class="muted text-sm" data-product-usage-summary><span data-product-usage-name>Select a product</span><span data-product-usage-stats>· Review its BOQ usage</span></p>
            </div>
            <button class="icon-button" type="button" data-close-modal aria-label="Close">×</button>
          </header>
          <div class="modal-body product-usage-body">
            <div class="product-usage-toolbar">
              <label class="search-field"><span class="sr-only">Search product usage</span><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg><input class="input input-sm" type="search" placeholder="Search BOQ, project, or customer" data-product-usage-search></label>
              <label><span class="sr-only">Filter usage status</span><select class="select select-sm" data-product-usage-status><option value="">All statuses</option><option value="draft">Draft</option><option value="issued">Issued</option><option value="won">Won</option></select></label>
              <label><span class="sr-only">Filter usage customer</span><select class="select select-sm" data-product-usage-customer><option value="">All customers</option></select></label>
            </div>
            <div class="detail-table-wrap product-usage-table-wrap" hidden>
              <table class="data-table product-usage-table">
                <thead><tr>
                  <th><button class="sort-button" type="button" data-product-usage-sort="boqNumber">BOQ</button></th>
                  <th><button class="sort-button" type="button" data-product-usage-sort="projectName">Project</button></th>
                  <th><button class="sort-button" type="button" data-product-usage-sort="customerName">Customer</button></th>
                  <th><button class="sort-button" type="button" data-product-usage-sort="status">Status</button></th>
                  <th><button class="sort-button" type="button" data-product-usage-sort="customerPoNumber">Customer PO</button></th>
                  <th class="align-right"><button class="sort-button" type="button" data-product-usage-sort="boqValue">BOQ Value</button></th>
                  <th><button class="sort-button" type="button" data-product-usage-sort="usageType">Usage</button></th>
                  <th class="align-right"><button class="sort-button" type="button" data-product-usage-sort="quantity">Qty</button></th>
                  <th class="align-right"><button class="sort-button" type="button" data-product-usage-sort="unitCogs">Unit COGS</button></th>
                  <th class="align-right"><button class="sort-button" type="button" data-product-usage-sort="margin">Margin</button></th>
                  <th class="align-right"><button class="sort-button" type="button" data-product-usage-sort="unitSelling">Unit Selling</button></th>
                  <th><button class="sort-button" type="button" data-product-usage-sort="updatedAt" aria-sort="descending">Updated</button></th>
                  <th><span class="sr-only">Action</span></th>
                </tr></thead>
                <tbody data-product-usage-body></tbody>
              </table>
            </div>
            <div class="product-usage-cards" data-product-usage-cards hidden></div>
            <div class="empty-state product-usage-empty" data-product-usage-empty><div class="empty-state-content"><div class="empty-state-icon" aria-hidden="true">⌕</div><h3>Not Used Yet</h3><p>This product has not been used in a saved BOQ.</p></div></div>
            <div class="empty-state product-usage-empty" data-product-usage-no-results hidden><div class="empty-state-content"><div class="empty-state-icon" aria-hidden="true">⌕</div><h3>No Matching Usage</h3><p>Try changing the search, status, or customer filter.</p></div></div>
          </div>
          <footer class="modal-footer"><span class="muted text-sm" data-product-usage-count>0 results</span><button class="button button-secondary" type="button" data-close-modal>Close</button></footer>
        </section>
      </div>`,
    );
    return document.getElementById("product-usage-modal");
  }

  function create(options = {}) {
    const modal = ensureModal();
    const getProduct = options.getProduct ||
      ((id) => window.BOQStore.get("products", id));
    const listBoqs = options.listBoqs || (() => window.BOQStore.list("boqs"));
    let activeProductId = "";
    let entries = [];
    let sortKey = "updatedAt";
    let sortDirection = "descending";

    function entriesFor(record) {
      return window.BOQProductUsage.build(record.name, listBoqs(), {
        registerBoqView: window.BOQStore.registerBoqView,
        latestIssuedRevision: window.BOQStore.latestIssuedRevision,
        calculateItem: window.BOQCalculations.calculateItem,
        defaultRounding: window.BOQStore.getSettings().rounding,
      });
    }

    function filteredEntries() {
      const query = modal.querySelector("[data-product-usage-search]")?.value ||
        "";
      const status =
        modal.querySelector("[data-product-usage-status]")?.value ||
        "";
      const customer =
        modal.querySelector("[data-product-usage-customer]")?.value ||
        "";
      const direction = sortDirection === "ascending" ? 1 : -1;
      return entries.filter((entry) => {
        const searchValue = [
          entry.boqNumber,
          window.BOQStore.revisionLabel(entry.revisionNumber),
          entry.projectName,
          entry.customerName,
          entry.status,
          entry.usageType,
          entry.customerPoNumber,
          entry.boqValue,
          entry.quantity,
          entry.unitCogs,
          entry.margin,
          entry.unitSelling,
        ].join(" ");
        return matchesSearchQuery(searchValue, query) &&
          (!status || entry.status.toLowerCase() === status) &&
          (!customer ||
            String(entry.customerName || "").trim().toLowerCase() === customer);
      }).sort((left, right) => {
        const numericKeys = [
          "boqValue",
          "quantity",
          "unitCogs",
          "margin",
          "unitSelling",
        ];
        let comparison;
        if (sortKey === "updatedAt") {
          comparison = (new Date(left.updatedAt || 0).getTime() || 0) -
            (new Date(right.updatedAt || 0).getTime() || 0);
        } else if (numericKeys.includes(sortKey)) {
          comparison = Number(left[sortKey] || 0) - Number(right[sortKey] || 0);
        } else {
          comparison = String(left[sortKey] || "").localeCompare(
            String(right[sortKey] || ""),
            undefined,
            { numeric: true, sensitivity: "base" },
          );
        }
        return comparison * direction || left.boqNumber.localeCompare(
          right.boqNumber,
          undefined,
          { numeric: true, sensitivity: "base" },
        );
      });
    }

    function updateSortState() {
      modal.querySelectorAll("[data-product-usage-sort]").forEach((button) => {
        if (button.dataset.productUsageSort === sortKey) {
          button.setAttribute("aria-sort", sortDirection);
        } else {
          button.removeAttribute("aria-sort");
        }
      });
    }

    function render() {
      const tableWrap = modal.querySelector(".product-usage-table-wrap");
      const tableBody = modal.querySelector("[data-product-usage-body]");
      const cardList = modal.querySelector("[data-product-usage-cards]");
      const emptyState = modal.querySelector("[data-product-usage-empty]");
      const noResults = modal.querySelector("[data-product-usage-no-results]");
      const resultCount = modal.querySelector("[data-product-usage-count]");
      const visibleEntries = filteredEntries();

      tableBody.innerHTML = visibleEntries.map((entry) => {
        const revision = visibleRevisionLabel(
          window.BOQStore.revisionLabel(entry.revisionNumber),
        );
        return `<tr><td class="boq-number-cell"><a class="cell-primary" href="boq-editor.html?id=${
          encodeURIComponent(entry.boqId)
        }">${escapeHtml(entry.boqNumber || "Untitled")}</a>${
          revision
            ? `<span class="cell-secondary">${escapeHtml(revision)}</span>`
            : ""
        }</td><td>${escapeHtml(entry.projectName || "—")}</td><td>${
          escapeHtml(entry.customerName || "—")
        }</td><td>${statusHtml(entry.status)}</td><td>${
          escapeHtml(entry.customerPoNumber || "")
        }</td><td class="align-right currency">${
          formatCurrencyMarkup(entry.boqValue, entry.currency)
        }</td><td>${
          escapeHtml(entry.usageType || "BOQ Item")
        }</td><td class="align-right number">${
          formatNumberInput(entry.quantity)
        }</td><td class="align-right currency">${
          optionalCurrencyMarkup(entry.unitCogs, entry.currency)
        }</td><td class="align-right number">${
          optionalPercent(entry.margin)
        }</td><td class="align-right currency">${
          optionalCurrencyMarkup(entry.unitSelling, entry.currency)
        }${
          entry.manualSelling
            ? '<span class="cell-secondary">Manual</span>'
            : ""
        }</td><td>${
          formatDate(entry.updatedAt)
        }</td><td><a class="button button-ghost button-sm" href="boq-editor.html?id=${
          encodeURIComponent(entry.boqId)
        }">Open</a></td></tr>`;
      }).join("");
      cardList.innerHTML = visibleEntries.map((entry) => {
        const revision = visibleRevisionLabel(
          window.BOQStore.revisionLabel(entry.revisionNumber),
        );
        return `<article class="record-card product-usage-card"><div class="record-card-header"><div><a class="cell-primary" href="boq-editor.html?id=${
          encodeURIComponent(entry.boqId)
        }">${escapeHtml(entry.boqNumber || "Untitled")}</a>${
          revision
            ? `<div class="muted text-sm">${escapeHtml(revision)}</div>`
            : ""
        }</div>${
          statusHtml(entry.status)
        }</div><div class="product-usage-card-context"><strong>${
          escapeHtml(entry.projectName || "No project")
        }</strong><span>${
          escapeHtml(entry.customerName || "No customer")
        }</span></div><dl class="record-card-grid"><div><dt>Customer PO</dt><dd>${
          escapeHtml(entry.customerPoNumber || "—")
        }</dd></div><div><dt>BOQ Value</dt><dd>${
          formatCurrencyMarkup(entry.boqValue, entry.currency)
        }</dd></div><div><dt>Usage</dt><dd>${
          escapeHtml(entry.usageType || "BOQ Item")
        }</dd></div><div><dt>Qty</dt><dd class="number">${
          formatNumberInput(entry.quantity)
        }</dd></div><div><dt>Unit COGS</dt><dd>${
          optionalCurrencyMarkup(entry.unitCogs, entry.currency)
        }</dd></div><div><dt>Margin</dt><dd>${
          optionalPercent(entry.margin)
        }</dd></div><div><dt>Unit Selling</dt><dd>${
          optionalCurrencyMarkup(entry.unitSelling, entry.currency)
        }${
          entry.manualSelling
            ? '<span class="cell-secondary">Manual</span>'
            : ""
        }</dd></div></dl><div class="cluster space-between card-actions"><span class="muted text-sm">Updated ${
          formatDate(entry.updatedAt)
        }</span><a class="button button-secondary button-sm" href="boq-editor.html?id=${
          encodeURIComponent(entry.boqId)
        }">Open BOQ</a></div></article>`;
      }).join("");

      const hasUsage = entries.length > 0;
      const hasResults = visibleEntries.length > 0;
      tableWrap.hidden = !hasResults;
      cardList.hidden = !hasResults;
      emptyState.hidden = hasUsage;
      noResults.hidden = !hasUsage || hasResults;
      resultCount.textContent = `${visibleEntries.length} result${
        visibleEntries.length === 1 ? "" : "s"
      }`;
    }

    function updateSummary(record) {
      const summaryName = modal.querySelector("[data-product-usage-name]");
      const summaryStats = modal.querySelector("[data-product-usage-stats]");
      const boqCount = new Set(entries.map((entry) => entry.boqId)).size;
      summaryName.textContent = record.name;
      summaryStats.textContent = entries.length
        ? `· ${entries.length} use${
          entries.length === 1 ? "" : "s"
        } across ${boqCount} BOQ${boqCount === 1 ? "" : "s"}`
        : "· No saved BOQ usage";
    }

    function updateCustomerOptions() {
      const select = modal.querySelector("[data-product-usage-customer]");
      const customers = new Map();
      entries.forEach((entry) => {
        const name = String(entry.customerName || "").trim();
        if (name) customers.set(name.toLowerCase(), name);
      });
      const options = [...customers.entries()].sort((left, right) =>
        left[1].localeCompare(right[1], undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );
      select.innerHTML = '<option value="">All customers</option>' +
        options.map(([value, label]) =>
          `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`
        ).join("");
    }

    function show(record) {
      if (!record) return;
      activeProductId = record.id;
      entries = entriesFor(record);
      sortKey = "updatedAt";
      sortDirection = "descending";
      modal.querySelector("[data-product-usage-search]").value = "";
      modal.querySelector("[data-product-usage-status]").value = "";
      updateCustomerOptions();
      modal.querySelector("[data-product-usage-customer]").value = "";
      updateSummary(record);
      updateSortState();
      render();
      window.BOQModal.open("product-usage-modal");
    }

    function refresh() {
      if (!activeProductId || modal.hidden) return;
      const record = getProduct(activeProductId);
      if (!record) return;
      entries = entriesFor(record);
      const selectedCustomer =
        modal.querySelector("[data-product-usage-customer]").value;
      updateCustomerOptions();
      if (
        [...modal.querySelector("[data-product-usage-customer]").options].some(
          (option) => option.value === selectedCustomer,
        )
      ) {
        modal.querySelector("[data-product-usage-customer]").value =
          selectedCustomer;
      }
      updateSummary(record);
      render();
    }

    modal.querySelector("[data-product-usage-search]").addEventListener(
      "input",
      window.BOQUtils.debounce(render, 100),
    );
    modal.querySelector("[data-product-usage-status]").addEventListener(
      "change",
      render,
    );
    modal.querySelector("[data-product-usage-customer]").addEventListener(
      "change",
      render,
    );
    modal.querySelectorAll("[data-product-usage-sort]").forEach((button) =>
      button.addEventListener("click", (event) => {
        const nextKey = event.currentTarget.dataset.productUsageSort;
        if (nextKey === sortKey) {
          sortDirection = sortDirection === "descending"
            ? "ascending"
            : "descending";
        } else {
          sortKey = nextKey;
          sortDirection = nextKey === "updatedAt" ? "descending" : "ascending";
        }
        updateSortState();
        render();
      })
    );
    document.addEventListener("boq:workspace-updated", refresh);

    return { show, refresh };
  }

  window.BOQProductUsageView = { create };
})();
