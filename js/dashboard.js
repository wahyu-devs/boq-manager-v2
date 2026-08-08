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
  const projects = list("projects");
  const customers = list("customers");
  const currency = window.BOQStore.getSettings().defaultCurrency || "USD";
  const totalCogs = boqs.reduce(
    (sum, boq) => sum + Number(boq.totalCogs || 0),
    0,
  );
  const totalSelling = boqs.reduce(
    (sum, boq) => sum + Number(boq.totalSelling || 0),
    0,
  );
  const marginValue = totalSelling - totalCogs;
  const averageMargin = totalSelling > 0 ? marginValue / totalSelling * 100 : 0;
  const sentCount = boqs.filter((boq) => boq.status === "Sent").length;
  const sentRate = boqs.length ? sentCount / boqs.length * 100 : 0;

  const metrics = {
    boqValue: formatCurrency(totalSelling, currency),
    margin: formatPercent(averageMargin),
    sentRate: `${sentRate.toFixed(0)}%`,
    boqCount: String(boqs.length),
    activeProjects: String(
      projects.filter((project) => project.status === "Active").length,
    ),
    draftCount: String(boqs.filter((boq) => boq.status === "Draft").length),
    customerCount: String(customers.length),
  };
  Object.entries(metrics).forEach(([name, value]) => {
    document.querySelectorAll(`[data-metric="${name}"]`).forEach((node) =>
      node.textContent = value
    );
  });
  document.querySelector('[data-metric-detail="sentRate"]').textContent =
    boqs.length ? `${sentCount} of ${boqs.length} BOQs sent` : "No BOQs yet";
  document.querySelector("[data-dashboard-date]").textContent = new Intl
    .DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());

  const statuses = ["Draft", "Sent"];
  const statusHost = document.querySelector("[data-status-overview]");
  const maximum = Math.max(
    1,
    ...statuses.map((status) =>
      boqs.filter((boq) => boq.status === status).length
    ),
  );
  statusHost.innerHTML = statuses.map((status) => {
    const count = boqs.filter((boq) => boq.status === status).length;
    return `<div class="status-row"><span>${
      escapeHtml(status)
    }</span><div class="progress-track"><div class="progress-bar" data-progress="${
      count / maximum * 100
    }"></div></div><strong>${count}</strong></div>`;
  }).join("");
  statusHost.querySelectorAll("[data-progress]").forEach((bar) =>
    bar.style.width = `${bar.dataset.progress}%`
  );

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
      }</a><span class="cell-secondary">${
        escapeHtml(boq.title || "Untitled BOQ")
      }</span></td><td>${
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

  const recentProjects = [...projects].sort((a, b) =>
    new Date(b.updatedAt) - new Date(a.updatedAt)
  ).slice(0, 4);
  const projectHost = document.querySelector("[data-recent-projects]");
  const projectEmpty = document.querySelector("[data-recent-projects-empty]");
  if (recentProjects.length) {
    projectEmpty.hidden = true;
    projectHost.innerHTML = recentProjects.map((project) =>
      `<li class="activity-item"><span class="avatar">${
        initials(project.name)
      }</span><p><strong>${escapeHtml(project.name)}</strong><br>${
        escapeHtml(project.code || "No code")
      } · ${
        escapeHtml(project.status || "Planning")
      }<span class="activity-time">${
        formatDateTime(project.updatedAt)
      }</span></p></li>`
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

  function initials(value) {
    return String(value || "").split(/\s+/).filter(Boolean).slice(0, 2).map((
      word,
    ) => word[0]).join("").toUpperCase() || "—";
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
