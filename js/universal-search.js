(function defineUniversalSearch() {
  const root = typeof window === "undefined" ? globalThis : window;
  const groupOrder = ["boqs", "products", "customers"];
  const groupConfig = {
    boqs: { label: "BOQs", page: "boqs.html" },
    products: { label: "Products", page: "products.html" },
    customers: { label: "Customers", page: "customers.html" },
  };

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function recordRank(record, query) {
    const normalizedQuery = normalize(query);
    const primary = normalize(record.primary);
    const words = primary.split(/\s+/).filter(Boolean);
    if (primary === normalizedQuery) return 0;
    if (primary.startsWith(normalizedQuery)) return 1;
    if (words.some((word) => word.startsWith(normalizedQuery))) return 2;
    if (primary.includes(normalizedQuery)) return 3;
    return 4;
  }

  function buildIndex(collections = {}, options = {}) {
    const registerBoqView = options.registerBoqView || ((record) => record);
    const calculateSummary = options.calculateSummary || (() => ({
      totalSelling: 0,
    }));
    const formatCurrency = options.formatCurrency || ((value) => String(value));
    const revisionLabel = options.revisionLabel || (() => "");
    const visibleRevisionLabel = options.visibleRevisionLabel ||
      ((value) => value);

    const boqs = (collections.boqs || []).map((source) => {
      const record = registerBoqView(source);
      const summary = calculateSummary(record.items || [], {
        commission: record.commission,
      });
      const revision = record.displayRevisionNumber === null ||
          record.displayRevisionNumber === undefined
        ? ""
        : visibleRevisionLabel(revisionLabel(record.displayRevisionNumber));
      const number = record.number || "Untitled BOQ";
      const value = Number(summary.totalSelling || 0);
      return {
        id: record.id,
        type: "boqs",
        primary: revision ? `${number} · ${revision}` : number,
        secondary: [
          record.projectName || "No project",
          record.customerName || "No customer",
        ].join(" · "),
        meta: record.status || "Draft",
        href: `boq-editor.html?id=${encodeURIComponent(record.id)}`,
        searchText: [
          number,
          revision,
          record.projectName,
          record.customerName,
          record.customerPoNumber,
          record.status,
          value,
          formatCurrency(value, record.currency || "USD"),
        ].filter((value) => value !== null && value !== undefined).join(" "),
      };
    });

    const products = (collections.products || []).map((record) => ({
      id: record.id,
      type: "products",
      primary: record.name || "Untitled product",
      secondary: [record.sku, record.category, record.unit].filter(Boolean)
        .join(" · ") || "No catalog details",
      meta: record.status || "Active",
      href: `products.html?product=${encodeURIComponent(record.id)}`,
      searchText: [
        record.name,
        record.sku,
        record.category,
        record.unit,
        record.status,
      ].filter(Boolean).join(" "),
    }));

    const customers = (collections.customers || []).map((record) => ({
      id: record.id,
      type: "customers",
      primary: record.companyName || "Untitled customer",
      secondary: [record.contactPerson, record.email].filter(Boolean).join(
        " · ",
      ) || "No contact details",
      meta: record.status || "Active",
      href: `customers.html?customer=${encodeURIComponent(record.id)}`,
      searchText: [
        record.companyName,
        record.contactPerson,
        record.email,
        record.phone,
        record.address,
        record.status,
      ].filter(Boolean).join(" "),
    }));

    return { boqs, products, customers };
  }

  function search(index, query, limit = 5) {
    const result = {};
    const hasSearchTerm = Boolean(normalize(query));
    groupOrder.forEach((group) => {
      const matching = (hasSearchTerm ? index[group] || [] : []).filter(
        (record) => root.BOQUtils.matchesSearchQuery(record.searchText, query),
      ).sort((left, right) =>
        recordRank(left, query) - recordRank(right, query) ||
        left.primary.localeCompare(right.primary, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );
      result[group] = {
        items: matching.slice(0, limit),
        total: matching.length,
      };
    });
    return result;
  }

  root.BOQUniversalSearch = { buildIndex, search };
  if (typeof document === "undefined") return;

  const container = document.querySelector("[data-universal-search]");
  const input = container?.querySelector("[data-universal-search-input]");
  const results = container?.querySelector("[data-universal-search-results]");
  const openButton = document.querySelector("[data-universal-search-open]");
  const closeButton = container?.querySelector("[data-universal-search-close]");
  if (!container || !input || !results || !root.BOQStore) return;

  let index = { boqs: [], products: [], customers: [] };
  let activeIndex = -1;
  const resultLimit = 5;

  function rebuildIndex() {
    index = buildIndex({
      boqs: root.BOQStore.list("boqs"),
      products: root.BOQStore.list("products"),
      customers: root.BOQStore.list("customers"),
    }, {
      registerBoqView: root.BOQStore.registerBoqView,
      calculateSummary: root.BOQCalculations.calculateSummary,
      formatCurrency: root.BOQUtils.formatCurrency,
      revisionLabel: root.BOQStore.revisionLabel,
      visibleRevisionLabel: root.BOQUtils.visibleRevisionLabel,
    });
    if (!results.hidden && input.value.trim()) renderResults();
  }

  function closeResults() {
    results.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    activeIndex = -1;
  }

  function closeMobileSearch(options = {}) {
    document.body.classList.remove("universal-search-open");
    closeResults();
    if (options.clear) input.value = "";
    input.blur();
  }

  function resultLinks() {
    return [...results.querySelectorAll("[data-universal-search-result]")];
  }

  function setActiveResult(nextIndex) {
    const links = resultLinks();
    if (!links.length) return;
    activeIndex = (nextIndex + links.length) % links.length;
    links.forEach((link, index) => {
      const active = index === activeIndex;
      link.classList.toggle("is-active", active);
      link.setAttribute("aria-selected", String(active));
    });
    const active = links[activeIndex];
    input.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
  }

  function groupHtml(group, groupResult, query, offset) {
    if (!groupResult.total) return "";
    const config = groupConfig[group];
    const viewAll = groupResult.total > resultLimit
      ? `<a class="universal-search-view-all" href="${config.page}?q=${
        encodeURIComponent(query)
      }">View all ${escapeHtml(config.label)}</a>`
      : "";
    return `<section class="universal-search-group" role="group" aria-labelledby="universal-search-${group}-label">
      <header class="universal-search-group-header"><span id="universal-search-${group}-label">${
      escapeHtml(config.label)
    }</span><span>${groupResult.total} result${
      groupResult.total === 1 ? "" : "s"
    }</span></header>
      <div>${
      groupResult.items.map((record, index) =>
        `<a class="universal-search-result" id="universal-search-result-${
          offset + index
        }" href="${record.href}" role="option" aria-selected="false" data-universal-search-result><span class="universal-search-result-copy"><strong>${
          escapeHtml(record.primary)
        }</strong><span>${
          escapeHtml(record.secondary)
        }</span></span><span class="universal-search-result-meta">${
          escapeHtml(record.meta)
        }</span></a>`
      ).join("")
    }</div>${viewAll}</section>`;
  }

  function renderResults() {
    const query = input.value.trim();
    if (!query) {
      closeResults();
      return;
    }
    const matches = search(index, query, resultLimit);
    let offset = 0;
    const groups = groupOrder.map((group) => {
      const html = groupHtml(group, matches[group], query, offset);
      offset += matches[group].items.length;
      return html;
    }).join("");
    results.innerHTML = groups ||
      '<div class="universal-search-empty"><strong>No results found</strong><span>Try another BOQ, product, or customer keyword.</span></div>';
    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
    activeIndex = -1;
    input.removeAttribute("aria-activedescendant");
  }

  const debouncedRender = root.BOQUtils.debounce(renderResults, 100);
  input.addEventListener("input", debouncedRender);
  input.addEventListener("focus", () => {
    if (input.value.trim()) renderResults();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (results.hidden) renderResults();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = activeIndex < 0
        ? direction > 0 ? 0 : resultLinks().length - 1
        : activeIndex + direction;
      setActiveResult(nextIndex);
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      resultLinks()[activeIndex]?.click();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (window.matchMedia("(max-width: 991px)").matches) {
        closeMobileSearch({ clear: true });
      } else {
        closeResults();
        input.blur();
      }
    }
  });

  openButton?.addEventListener("click", () => {
    document.body.classList.remove("nav-open");
    document.body.classList.add("universal-search-open");
    window.requestAnimationFrame(() => input.focus());
  });
  closeButton?.addEventListener("click", () => {
    closeMobileSearch({ clear: true });
  });

  document.addEventListener("pointerdown", (event) => {
    if (
      container.contains(event.target) || openButton?.contains(event.target)
    ) {
      return;
    }
    if (window.matchMedia("(max-width: 991px)").matches) {
      closeMobileSearch();
    } else {
      closeResults();
    }
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      if (document.body.classList.contains("auth-pending")) return;
      event.preventDefault();
      if (window.matchMedia("(max-width: 991px)").matches) {
        document.body.classList.add("universal-search-open");
      }
      window.requestAnimationFrame(() => input.focus());
    }
  });
  window.addEventListener("resize", () => {
    if (!window.matchMedia("(max-width: 991px)").matches) {
      document.body.classList.remove("universal-search-open");
    }
  });

  [
    "boq:store-ready",
    "boq:auth-ready",
    "boq:data-changed",
    "boq:workspace-updated",
  ].forEach((eventName) => document.addEventListener(eventName, rebuildIndex));
  rebuildIndex();

  function escapeHtml(value) {
    return root.BOQUtils.escapeHtml(value);
  }
})();
