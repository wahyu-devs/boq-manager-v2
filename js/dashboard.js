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
  const sentCount = boqs.filter((boq) => boq.status === "Sent").length;

  const metrics = {
    boqCount: String(boqs.length),
    draftCount: String(boqs.filter((boq) => boq.status === "Draft").length),
    sentCount: String(sentCount),
    productCount: String(products.length),
    customerCount: String(customers.length),
  };
  Object.entries(metrics).forEach(([name, value]) => {
    document.querySelectorAll(`[data-metric="${name}"]`).forEach((node) =>
      node.textContent = value
    );
  });
  const recentBoqs = [...boqs].sort((a, b) =>
    new Date(b.updatedAt) - new Date(a.updatedAt)
  ).slice(0, 5);
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
      }</a></td><td>${
        escapeHtml(boq.projectName || "—")
      }</td><td><span class="status">${
        escapeHtml(boq.status || "Draft")
      }</span></td><td class="align-right currency">${
        formatCurrency(boq.totalSelling || 0, boq.currency || currency)
      }</td><td class="align-right number">${
        formatPercent(boq.marginPercent || 0)
      }</td><td>${formatDateTime(boq.updatedAt)}</td></tr>`
    ).join("");
  }

  const today = new Date();
  const expiring = boqs.filter((boq) => {
    if (!boq.validUntil) return false;
    const days = (new Date(boq.validUntil) - today) / 86400000;
    return days >= 0 && days <= 7;
  });
  if (expiring.length) {
    document.querySelector("[data-insights-empty]").hidden = true;
    document.querySelector("[data-insights]").innerHTML =
      `<li class="insight-item"><span class="insight-icon">!</span><p><strong>${expiring.length} BOQ${
        expiring.length === 1 ? "" : "s"
      } expire within seven days.</strong><br>Review pricing validity before following up.</p></li>`;
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
