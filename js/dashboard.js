(function renderDashboard(event) {
  const { list } = window.BOQStore;
  const {
    formatCurrencyMarkup,
    formatPercent,
    escapeHtml,
    debounce,
    visibleRevisionLabel,
    greetingForHour,
    boqAttentionType,
    formatDate,
  } = window.BOQUtils;
  updateGreeting();
  const settings = window.BOQStore.getSettings();
  const calculateSummary = window.BOQCalculations.calculateSummary;
  const boqs = list("boqs").map(window.BOQStore.registerBoqView).map((boq) => {
    const summary = calculateSummary(boq.items || [], {
      commission: boq.commission,
    });
    return {
      ...boq,
      status: ["Draft", "Issued", "Won"].includes(boq.status)
        ? boq.status
        : "Draft",
      ...summary,
      customerPoValue: customerPoValue(boq),
    };
  });
  const products = list("products");
  const customers = list("customers");
  const currency = settings.defaultCurrency || "USD";
  const draftBoqs = boqs.filter((boq) => boq.status === "Draft");
  const issuedBoqs = boqs.filter((boq) => boq.status === "Issued");
  const wonBoqs = boqs.filter((boq) => boq.status === "Won");
  const attentionReference = new Date();
  const expiringSoon = issuedBoqs.filter((boq) =>
    boqAttentionType(boq, attentionReference) === "expiring-soon"
  );
  const expired = issuedBoqs.filter((boq) =>
    boqAttentionType(boq, attentionReference) === "expired"
  );
  const staleDrafts = draftBoqs.filter((boq) =>
    boqAttentionType(boq, attentionReference) === "stale-draft"
  );
  const activeProducts = products.filter((product) =>
    product.status !== "Inactive"
  );
  const expiryVerb = expiringSoon.length === 1 ? "expires" : "expire";
  const draftReviewVerb = staleDrafts.length === 1 ? "needs" : "need";
  const knownCustomerIds = new Set(customers.map((customer) => customer.id));
  const customerIdsWithBoqs = new Set(boqs.map((boq) => boq.customerId)
    .filter((id) => id && knownCustomerIds.has(id)));

  const metrics = {
    boqCount: String(boqs.length),
    productCount: String(products.length),
    customerCount: String(customers.length),
  };
  Object.entries(metrics).forEach(([name, value]) => {
    document.querySelectorAll(`[data-metric="${name}"]`).forEach((node) =>
      node.textContent = value
    );
  });
  const metricDetails = {
    boqCount: boqs.length
      ? `${plural(draftBoqs.length, "draft")} · ${
        plural(issuedBoqs.length, "issued")
      } · ${wonBoqs.length} won`
      : "No documents yet",
    productCount: products.length
      ? `${plural(activeProducts.length, "active product")}`
      : "Catalog is empty",
    customerCount: customers.length
      ? `${plural(customerIdsWithBoqs.size, "customer")} linked to BOQs`
      : "No customer records",
  };
  Object.entries(metricDetails).forEach(([name, value]) => {
    const node = document.querySelector(`[data-metric-detail="${name}"]`);
    if (node) node.textContent = value;
  });

  const recentBoqs = [...boqs].sort((a, b) =>
    new Date(b.updatedAt) - new Date(a.updatedAt)
  ).slice(0, recentBoqRowLimit());
  const boqTable = document.querySelector("[data-recent-boqs-table]");
  const boqEmpty = document.querySelector("[data-recent-boqs-empty]");
  if (recentBoqs.length) {
    boqTable.hidden = false;
    boqEmpty.hidden = true;
    document.querySelector("[data-recent-boqs]").innerHTML = recentBoqs.map((
      boq,
    ) => {
      const revision = boq.displayRevisionNumber === null ||
          boq.displayRevisionNumber === undefined
        ? ""
        : visibleRevisionLabel(
          window.BOQStore.revisionLabel(boq.displayRevisionNumber),
        );
      return `<tr><td class="boq-number-cell"><a class="cell-primary" href="boq-editor.html?id=${
        encodeURIComponent(boq.id)
      }">${
        escapeHtml(boq.number || "Untitled")
      }</a>${
        revision
          ? `<span class="cell-secondary">${escapeHtml(revision)}</span>`
          : ""
      }</td><td>${
        escapeHtml(boq.projectName || "—")
      }<span class="cell-secondary">${
        escapeHtml(boq.customerName || "No customer")
      }</span></td><td><span class="status status-${
        (boq.status || "Draft").toLowerCase()
      }">${
        escapeHtml(boq.status || "Draft")
      }</span></td><td class="align-right currency dashboard-financial-column">${
        formatCurrencyMarkup(boq.totalSelling || 0, boq.currency || currency)
      }</td><td class="align-right number dashboard-financial-column">${
        formatPercent(boq.marginPercent || 0)
      }</td><td class="dashboard-updated-column">${
        formatDate(boq.updatedAt)
      }</td></tr>`
    }).join("");
  } else {
    boqTable.hidden = true;
    boqEmpty.hidden = false;
    document.querySelector("[data-recent-boqs]").innerHTML = "";
  }

  const attentionItems = [
    {
      count: expired.length,
      title: `${plural(expired.length, "issued BOQ")} expired`,
      detail: "Review validity before customer follow-up.",
      tone: "danger",
      filter: "expired",
    },
    {
      count: expiringSoon.length,
      title: `${plural(expiringSoon.length, "issued BOQ")} ${expiryVerb} soon`,
      detail: "Validity ends within the next seven days.",
      tone: "warning",
      filter: "expiring-soon",
    },
    {
      count: staleDrafts.length,
      title: `${plural(staleDrafts.length, "draft")} ${draftReviewVerb} review`,
      detail: "These drafts have not been updated for 14 days.",
      tone: "info",
      filter: "stale-draft",
    },
  ].filter((item) => item.count > 0);
  const insightHost = document.querySelector("[data-insights]");
  const insightEmpty = document.querySelector("[data-insights-empty]");
  insightHost.innerHTML = attentionItems.map((item) =>
    `<li class="insight-item"><span class="insight-icon insight-icon-${item.tone}" aria-hidden="true">!</span><div><a class="insight-title" href="boqs.html?attention=${encodeURIComponent(item.filter)}">${escapeHtml(item.title)}</a><p>${escapeHtml(item.detail)}</p></div></li>`
  ).join("");
  insightEmpty.hidden = attentionItems.length > 0;

  const recentCustomerPos = window.BOQDashboardData.recentCustomerPos(
    wonBoqs,
    recentCustomerPoRowLimit(),
  );
  const recentPoHost = document.querySelector("[data-recent-customer-pos]");
  const recentPoEmpty = document.querySelector(
    "[data-recent-customer-pos-empty]",
  );
  recentPoHost.innerHTML = recentCustomerPos.map((boq) => {
    const detail = [
      boq.customerPoNumber || "No PO number",
      boq.customerName || "No customer",
    ].filter(Boolean).join(" · ");
    return `<li class="dashboard-record-item"><div class="dashboard-record-heading"><a href="boq-editor.html?id=${encodeURIComponent(boq.id)}">${escapeHtml(boq.projectName || boq.number || "Untitled BOQ")}</a><strong>${formatCurrencyMarkup(boq.customerPoValue || 0, boq.currency || currency)}</strong></div><div class="dashboard-record-meta"><span>${escapeHtml(detail)}</span><time datetime="${escapeHtml(boq.wonAt || "")}">${formatDate(boq.wonAt)}</time></div></li>`;
  }).join("");
  recentPoEmpty.hidden = recentCustomerPos.length > 0;
  syncDashboardPanelHeights();
  trimOverflowingRecentCustomerPos();

  function customerPoValue(boq) {
    const revision = window.BOQStore.latestIssuedRevision(boq);
    const documentValue = revision?.document || boq;
    const storedSettings = revision?.companySettings || {};
    return calculateSummary(documentValue.items || [], {
      commission: documentValue.commission,
      rounding: revision?.calculation?.rounding || storedSettings.rounding ||
        settings.rounding,
      taxEnabled: storedSettings.taxEnabled === true,
      taxRate: storedSettings.taxRate ?? 0,
    }).grandTotal;
  }

  function plural(count, singular) {
    return `${count} ${singular}${count === 1 ? "" : "s"}`;
  }

  function updateGreeting() {
    const greeting = greetingForHour(new Date().getHours());
    document.querySelectorAll("[data-dashboard-greeting]").forEach((node) => {
      node.textContent = greeting;
    });
  }

  function recentBoqRowLimit() {
    const panel = document.querySelector("[data-recent-boqs-panel]");
    return viewportRowLimit(panel, {
      fallback: 6,
      minimum: 3,
      rowHeightProperty: "--dashboard-recent-row-height",
      rowHeightFallback: 52,
      fixedContentProperty: "--dashboard-recent-table-header-height",
      fixedContentFallback: 40,
    });
  }

  function recentCustomerPoRowLimit() {
    const panel = document.querySelector("[data-recent-customer-pos-panel]");
    return viewportRowLimit(panel, {
      fallback: 4,
      minimum: 2,
      rowHeightProperty: "--dashboard-po-row-height",
      rowHeightFallback: 60,
      includeBodyPadding: true,
    });
  }

  function viewportRowLimit(panel, options) {
    if (!window.matchMedia("(min-width: 992px)").matches) {
      return options.fallback;
    }
    const main = document.querySelector(".main-content");
    if (!panel || !main) return options.fallback;

    const panelStyles = window.getComputedStyle(panel);
    const mainStyles = window.getComputedStyle(main);
    const panelHeader = panel.querySelector(".panel-header");
    const panelBody = panel.querySelector(".panel-body");
    const rowHeight = cssPixels(
      panelStyles,
      options.rowHeightProperty,
      options.rowHeightFallback,
    );
    const fixedContentHeight = options.fixedContentProperty
      ? cssPixels(
        panelStyles,
        options.fixedContentProperty,
        options.fixedContentFallback,
      )
      : 0;
    const bodyStyles = options.includeBodyPadding && panelBody
      ? window.getComputedStyle(panelBody)
      : null;
    const bodyPadding = bodyStyles
      ? (Number.parseFloat(bodyStyles.paddingTop) || 0) +
        (Number.parseFloat(bodyStyles.paddingBottom) || 0)
      : 0;
    const bottomInset = Number.parseFloat(mainStyles.paddingBottom) || 48;
    const panelBorder = (Number.parseFloat(panelStyles.borderTopWidth) || 0) +
      (Number.parseFloat(panelStyles.borderBottomWidth) || 0);
    const panelHeaderHeight = panelHeader?.getBoundingClientRect().height || 54;
    const availableHeight = window.innerHeight -
      panel.getBoundingClientRect().top - bottomInset - panelBorder -
      panelHeaderHeight - fixedContentHeight - bodyPadding;
    return Math.max(
      options.minimum,
      Math.floor(availableHeight / rowHeight),
    );
  }

  function syncDashboardPanelHeights() {
    const panels = [
      document.querySelector("[data-recent-boqs-panel]"),
      document.querySelector("[data-recent-customer-pos-panel]"),
    ].filter(Boolean);
    if (!window.matchMedia("(min-width: 992px)").matches) {
      panels.forEach((panel) => panel.style.removeProperty("height"));
      return;
    }

    const main = document.querySelector(".main-content");
    if (!main) return;
    const mainStyles = window.getComputedStyle(main);
    const bottomInset = Number.parseFloat(mainStyles.paddingBottom) || 48;
    const targetBottom = window.innerHeight - bottomInset;
    panels.forEach((panel) => {
      const availableHeight = targetBottom -
        panel.getBoundingClientRect().top;
      if (availableHeight > 0) {
        panel.style.height = `${availableHeight}px`;
      } else {
        panel.style.removeProperty("height");
      }
    });
  }

  function trimOverflowingRecentCustomerPos() {
    if (!window.matchMedia("(min-width: 992px)").matches) return;
    const panel = document.querySelector("[data-recent-customer-pos-panel]");
    const body = panel?.querySelector(".panel-body");
    const host = panel?.querySelector("[data-recent-customer-pos]");
    if (!body || !host) return;

    const bodyStyles = window.getComputedStyle(body);
    const visibleBottom = body.getBoundingClientRect().bottom -
      (Number.parseFloat(bodyStyles.paddingBottom) || 0);
    const items = [...host.querySelectorAll(".dashboard-record-item")];
    const firstOverflow = items.findIndex((item) =>
      item.getBoundingClientRect().bottom > visibleBottom + 0.5
    );
    if (firstOverflow < 0) return;
    items.slice(firstOverflow).forEach((item) => item.remove());
  }

  function cssPixels(styles, property, fallback) {
    return Number.parseFloat(styles.getPropertyValue(property)) || fallback;
  }

  if (!event) {
    document.addEventListener("boq:workspace-updated", renderDashboard);
    window.setInterval(updateGreeting, 60000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") updateGreeting();
    });
    window.addEventListener(
      "resize",
      debounce(() => renderDashboard({ type: "resize" }), 160),
    );
  }
})();
