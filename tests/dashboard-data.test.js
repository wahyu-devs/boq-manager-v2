globalThis.window = globalThis;

await import("../js/dashboard-data.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function localIso(year, month, day, hour = 9) {
  return new Date(year, month - 1, day, hour).toISOString();
}

Deno.test("orders recent Customer POs by PO date", () => {
  const records = [{
    id: "older",
    status: "Won",
    wonAt: localIso(2026, 8, 5),
    customerPoNumber: "PO-001",
  }, {
    id: "newer",
    status: "Won",
    wonAt: localIso(2026, 8, 20),
    customerPoNumber: "PO-002",
  }, {
    id: "missing-po",
    status: "Won",
    wonAt: localIso(2026, 8, 25),
    customerPoNumber: "",
  }];
  const recent = window.BOQDashboardData.recentCustomerPos(records, 2);
  assert(recent.length === 2, "only valid Customer POs are returned");
  assert(recent[0].id === "newer", "newest PO appears first");
});

Deno.test("places recent Customer POs below Attention Needed", async () => {
  const html = await Deno.readTextFile(new URL("../index.html", import.meta.url));
  const script = await Deno.readTextFile(
    new URL("../js/dashboard.js", import.meta.url),
  );
  const layout = await Deno.readTextFile(
    new URL("../css/layout.css", import.meta.url),
  );
  const responsive = await Deno.readTextFile(
    new URL("../css/responsive.css", import.meta.url),
  );
  assert(html.includes("Recent Customer POs"), "recent PO panel exists");
  assert(!html.includes("Customer PO by Period"), "period panel is removed");
  assert(!html.includes("Recent Activity"), "activity panel is removed");
  assert(
    html.indexOf('id="attention-heading"') <
      html.indexOf('id="recent-po-heading"') &&
      html.indexOf('id="recent-po-heading"') <
        html.indexOf("</aside>", html.indexOf('id="recent-po-heading"')),
    "recent POs remain in the attention column below its first panel",
  );
  assert(
    html.indexOf("js/dashboard-data.js") < html.indexOf("js/dashboard.js"),
    "dashboard data helpers load first",
  );
  assert(
    html.includes("data-recent-customer-pos-panel"),
    "recent PO panel exposes a viewport measurement hook",
  );
  assert(
    script.includes("recentCustomerPoRowLimit()"),
    "recent PO count follows the available viewport height",
  );
  assert(
    script.includes("function viewportRowLimit"),
    "both dashboard lists share one viewport calculation",
  );
  assert(
    script.includes("syncDashboardPanelHeights();") &&
      script.includes("const targetBottom = window.innerHeight - bottomInset"),
    "both recent panels share one exact viewport bottom",
  );
  assert(
    script.includes("trimOverflowingRecentCustomerPos();") &&
      script.includes("item.getBoundingClientRect().bottom > visibleBottom"),
    "wrapped Customer PO rows are removed before they can be clipped",
  );
  assert(
    !script.includes('[boq.number, revision].filter(Boolean).join(" · ")'),
    "recent Customer POs omit the BOQ number",
  );
  assert(
    !script.includes("const revision = visibleRevisionLabel(\n      window.BOQStore.revisionLabel(boq.displayRevisionNumber),\n    );\n    const detail"),
    "recent Customer POs omit the revision number",
  );
  assert(
    layout.includes("grid-template-columns: minmax(0, 1fr);") &&
      layout.includes(".dashboard-primary > *"),
    "desktop dashboard columns contain wide table content",
  );
  assert(
    responsive.startsWith('@media (min-width: 1200px) {\n  body[data-page="dashboard"] .main-content') &&
      responsive.includes("padding-bottom: 28px;"),
    "dashboard bottom spacing changes only on large desktop",
  );
  assert(
    responsive.includes(".dashboard-attention > :first-child") &&
      responsive.indexOf(".dashboard-recent {\n    order: 3;") <
        responsive.indexOf("@media (max-width: 767px)"),
    "tablet and mobile place Attention Needed between metrics and recent BOQs",
  );
  assert(script.includes("storedSettings.taxEnabled === true"), "PO value uses issued tax snapshot");
  assert(script.includes(").grandTotal"), "PO value uses the customer grand total");
});
