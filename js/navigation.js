(function renderApplicationShell() {
  const page = document.body.dataset.page || "dashboard";
  const titles = {
    dashboard: "Dashboard",
    boqs: "BOQs",
    "boq-editor": "BOQ Editor",
    projects: "Projects",
    products: "Products",
    customers: "Customers",
    settings: "Settings",
  };

  const icons = {
    dashboard:
      '<path d="M4 13h6V4H4v9Zm10 7h6V11h-6v9ZM4 20h6v-3H4v3Zm10-13h6V4h-6v3Z"/>',
    boqs: '<path d="M6 3h9l4 4v14H6V3Z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',
    projects: '<path d="M3 7h7l2 2h9v10H3V7Z"/><path d="M3 7V5h7l2 2"/>',
    products:
      '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    customers:
      '<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 20v-2a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15a1.7 1.7 0 0 0-1.55-1H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1-1.55V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9a1.7 1.7 0 0 0 1.55 1H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    help:
      '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.7 2c-1 .65-1.5 1.1-1.5 2M12 17h.01"/>',
  };

  const icon = (name) =>
    `<svg class="${
      name === "menu" ? "icon" : "nav-icon"
    }" aria-hidden="true" viewBox="0 0 24 24">${icons[name]}</svg>`;
  const current = (name) =>
    page === name || (name === "boqs" && page === "boq-editor")
      ? ' aria-current="page"'
      : "";

  const navigationHost = document.querySelector("[data-navigation]");
  if (navigationHost) {
    navigationHost.outerHTML = `
      <div class="sidebar-overlay" data-nav-close aria-hidden="true"></div>
      <aside class="sidebar" aria-label="Primary navigation">
        <a class="sidebar-brand" href="index.html" aria-label="BOQ Manager dashboard">
          <span class="brand-mark" aria-hidden="true">BM</span>
          <span class="brand-name">BOQ Manager</span>
        </a>
        <nav class="sidebar-nav">
          <div class="nav-section-label">Workspace</div>
          <ul class="nav-list">
            <li><a class="nav-link" href="index.html"${current("dashboard")}>${
      icon("dashboard")
    }<span>Dashboard</span></a></li>
            <li><a class="nav-link" href="boqs.html"${current("boqs")}>${
      icon("boqs")
    }<span>BOQs</span></a></li>
            <li><a class="nav-link" href="projects.html"${
      current("projects")
    }>${icon("projects")}<span>Projects</span></a></li>
            <li><a class="nav-link" href="products.html"${
      current("products")
    }>${icon("products")}<span>Products</span></a></li>
            <li><a class="nav-link" href="customers.html"${
      current("customers")
    }>${icon("customers")}<span>Customers</span></a></li>
          </ul>
          <div class="nav-section-label">System</div>
          <ul class="nav-list">
            <li><a class="nav-link" href="settings.html"${
      current("settings")
    }>${icon("settings")}<span>Settings</span></a></li>
          </ul>
        </nav>
        <div class="sidebar-footer">
          <div class="user-card">
            <span class="avatar" aria-hidden="true">AR</span>
            <div><strong>Alex Rivera</strong><span>Senior Estimator</span></div>
          </div>
        </div>
      </aside>`;
  }

  const topbarHost = document.querySelector("[data-topbar]");
  if (topbarHost) {
    topbarHost.outerHTML = `
      <header class="topbar">
        <div class="topbar-left">
          <button class="icon-button mobile-nav-trigger" type="button" data-nav-open aria-label="Open navigation" aria-expanded="false">${
      icon("menu")
    }</button>
          <a class="mobile-brand" href="index.html"><span class="brand-mark" aria-hidden="true">BM</span><span>BOQ Manager</span></a>
          <div class="breadcrumb"><span>BOQ Manager</span> / <strong>${
      titles[page]
    }</strong></div>
        </div>
        <div class="topbar-actions">
          <button class="icon-button" type="button" data-demo-action="Help center is ready for product documentation." aria-label="Open help center" title="Help">${
      icon("help")
    }</button>
          <button class="icon-button" type="button" data-theme-toggle aria-label="Switch theme"></button>
          <a class="button button-secondary" href="boq-editor.html">${
      icon("plus")
    }<span>New BOQ</span></a>
        </div>
      </header>`;
  }

  document.dispatchEvent(new CustomEvent("boq:shell-ready"));
})();
