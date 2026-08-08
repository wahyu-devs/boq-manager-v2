(function renderDashboard() {
  const { list } = window.BOQStore;
  const { formatCurrency, formatPercent, escapeHtml } = window.BOQUtils;
  const boqs = list("boqs").map((boq) => ({
    ...boq,
    status: boq.status === "Sent" ? "Sent" : "Draft",
    ...window.BOQCalculations.calculateSummary(boq.items || [], {
      commission: boq.commission,
    }),
  }));
  const products = list("products");
  const customers = list("customers");
  const currency = window.BOQStore.getSettings().defaultCurrency || "USD";
  const draftBoqs = boqs.filter((boq) => boq.status === "Draft");
  const sentBoqs = boqs.filter((boq) => boq.status === "Sent");
  const today = startOfDay(new Date());
  const expiringSoon = sentBoqs.filter((boq) => {
    const days = daysUntil(boq.validUntil, today);
    return days !== null && days >= 0 && days <= 7;
  });
  const expired = sentBoqs.filter((boq) => {
    const days = daysUntil(boq.validUntil, today);
    return days !== null && days < 0;
  });
  const staleDrafts = draftBoqs.filter((boq) => {
    const updated = validDate(boq.updatedAt);
    return updated && today - updated > 14 * 86400000;
  });
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
    draftCount: String(draftBoqs.length),
    sentCount: String(sentBoqs.length),
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
      ? `${plural(draftBoqs.length, "draft")} · ${plural(sentBoqs.length, "sent")}`
      : "No documents yet",
    draftCount: staleDrafts.length
      ? `${plural(staleDrafts.length, "draft")} older than 14 days`
      : draftBoqs.length
      ? "All drafts recently updated"
      : "No work in progress",
    sentCount: expiringSoon.length
      ? `${plural(expiringSoon.length, "BOQ")} ${expiryVerb} within 7 days`
      : sentBoqs.length
      ? "No upcoming expiry"
      : "No issued documents",
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
  ).slice(0, 6);
  const boqTable = document.querySelector("[data-recent-boqs-table]");
  const boqEmpty = document.querySelector("[data-recent-boqs-empty]");
  if (recentBoqs.length) {
    boqTable.hidden = false;
    boqEmpty.hidden = true;
    document.querySelector("[data-recent-boqs]").innerHTML = recentBoqs.map((
      boq,
    ) =>
      `<tr><td><a class="cell-primary" href="boq-editor.html?id=${
        encodeURIComponent(boq.id)
      }">${
        escapeHtml(boq.number || "Untitled")
      }</a><span class="cell-secondary">${
        escapeHtml(boq.customerName || "No customer")
      }</span></td><td>${
        escapeHtml(boq.projectName || "—")
      }<span class="cell-secondary">${plural(boq.items?.length || 0, "item")}</span></td><td><span class="status status-${
        (boq.status || "Draft").toLowerCase()
      }">${
        escapeHtml(boq.status || "Draft")
      }</span></td><td class="align-right currency">${
        formatCurrency(boq.totalSelling || 0, boq.currency || currency)
      }</td><td class="align-right number">${
        formatPercent(boq.marginPercent || 0)
      }</td><td>${formatDateTime(boq.updatedAt)}</td></tr>`
    ).join("");
  }

  const attentionItems = [
    {
      count: expired.length,
      title: `${plural(expired.length, "sent BOQ")} expired`,
      detail: "Review validity before customer follow-up.",
      tone: "danger",
    },
    {
      count: expiringSoon.length,
      title: `${plural(expiringSoon.length, "sent BOQ")} ${expiryVerb} soon`,
      detail: "Validity ends within the next seven days.",
      tone: "warning",
    },
    {
      count: staleDrafts.length,
      title: `${plural(staleDrafts.length, "draft")} ${draftReviewVerb} review`,
      detail: "These drafts have not been updated for 14 days.",
      tone: "info",
    },
  ].filter((item) => item.count > 0);
  const insightHost = document.querySelector("[data-insights]");
  const insightEmpty = document.querySelector("[data-insights-empty]");
  insightHost.innerHTML = attentionItems.map((item) =>
    `<li class="insight-item"><span class="insight-icon insight-icon-${item.tone}" aria-hidden="true">!</span><div><a class="insight-title" href="boqs.html">${escapeHtml(item.title)}</a><p>${escapeHtml(item.detail)}</p></div></li>`
  ).join("");
  insightEmpty.hidden = attentionItems.length > 0;

  const dataChecks = [
    {
      label: "Customer assignment",
      detail: "BOQs without a customer",
      count: boqs.filter((boq) => !boq.customerId && !boq.customerName?.trim())
        .length,
      href: "boqs.html",
    },
    {
      label: "Catalog costing",
      detail: "Products with zero COGS",
      count: products.filter((product) =>
        Number(product.defaultCogs || 0) <= 0
      ).length,
      href: "products.html",
    },
    {
      label: "Customer contacts",
      detail: "Customers without email",
      count: customers.filter((customer) => !customer.email?.trim()).length,
      href: "customers.html",
    },
  ];
  document.querySelector("[data-data-checks]").innerHTML = dataChecks.map((check) =>
    `<li><a class="data-check-link" href="${check.href}"><span><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.detail)}</small></span><span class="data-check-count${check.count === 0 ? " is-clear" : ""}">${check.count}</span></a></li>`
  ).join("");

  function startOfDay(value) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function validDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function daysUntil(value, fromDate) {
    const date = validDate(value);
    if (!date) return null;
    return Math.ceil((startOfDay(date) - fromDate) / 86400000);
  }

  function plural(count, singular) {
    return `${count} ${singular}${count === 1 ? "" : "s"}`;
  }

  function formatDateTime(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  }
})();
