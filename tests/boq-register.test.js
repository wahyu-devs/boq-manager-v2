const registerHtml = await Deno.readTextFile(
  new URL("../boqs.html", import.meta.url),
);
const recordsScript = await Deno.readTextFile(
  new URL("../js/records.js", import.meta.url),
);
const dashboardScript = await Deno.readTextFile(
  new URL("../js/dashboard.js", import.meta.url),
);
const appScript = await Deno.readTextFile(
  new URL("../js/app.js", import.meta.url),
);

function assertIncludes(source, value, message) {
  if (!source.includes(value)) throw new Error(message);
}

Deno.test("filters the BOQ Register by customer", () => {
  assertIncludes(
    registerHtml,
    'data-table-filter="customer"',
    "BOQ Register must expose a customer filter",
  );
  assertIncludes(
    registerHtml,
    'data-customer-filter',
    "customer options must be populated dynamically",
  );
  assertIncludes(
    registerHtml,
    '<option value="won">Won</option>',
    "BOQ Register must offer the Won status filter",
  );
  assertIncludes(
    recordsScript,
    'Won: "won",',
    "BOQ Register must render the Won semantic status",
  );
  assertIncludes(
    registerHtml,
    'data-sort-key="customerPo"',
    "BOQ Register must provide Customer PO sorting",
  );
  assertIncludes(
    recordsScript,
    "record.customerPoNumber,",
    "Customer PO must be included in BOQ search data",
  );
  assertIncludes(
    recordsScript,
    'data-customer-po="${escapeHtml(record.customerPoNumber || "")}"',
    "desktop BOQ rows must include the Customer PO sort value",
  );
  assertIncludes(
    recordsScript,
    "<dt>Customer PO</dt><dd>",
    "mobile BOQ cards must display the Customer PO number",
  );
  assertIncludes(
    registerHtml,
    'data-sort-key="validUntil"',
    "BOQ Register must provide expiry-date sorting",
  );
  assertIncludes(
    recordsScript,
    'data-valid-until="${escapeHtml(record.validUntil || "")}"',
    "desktop BOQ rows must include the validity sort value",
  );
  if (registerHtml.includes("boq-validity-cell") ||
      recordsScript.includes("boq-validity-cell")) {
    throw new Error("Expires must wrap like Created and Updated");
  }
  const updatedHeader = registerHtml.indexOf('data-sort-key="updated"');
  const validityHeader = registerHtml.indexOf('data-sort-key="validUntil"');
  if (updatedHeader < 0 || validityHeader <= updatedHeader) {
    throw new Error("Expires must appear after Updated in the desktop header");
  }
  const updatedCell = recordsScript.indexOf("dateText(record.updatedAt)");
  const validityCell = recordsScript.indexOf("dateText(record.validUntil)");
  if (updatedCell < 0 || validityCell <= updatedCell) {
    throw new Error("Expires must appear after Updated in desktop rows");
  }
  assertIncludes(
    recordsScript,
    "<dt>Expires</dt><dd>",
    "mobile BOQ cards must display the validity date",
  );
  assertIncludes(
    recordsScript,
    '<dt class="muted">Expires</dt><dd>',
    "BOQ Register preview must display the validity date",
  );
  assertIncludes(
    recordsScript,
    'data-customer="${escapeHtml((record.customerName || "").toLowerCase())}"',
    "desktop BOQ rows must include the customer filter value",
  );
  assertIncludes(
    recordsScript,
    'const customerNames = [...new Set(displayBoqs().map((record) =>',
    "filter options must come from BOQ customers",
  );
  if (registerHtml.includes('data-table-filter="project"') ||
      recordsScript.includes("data-project-filter")) {
    throw new Error("the previous project filter must be removed");
  }
});

Deno.test("opens dashboard attention links as BOQ Register filters", () => {
  assertIncludes(
    dashboardScript,
    'href="boqs.html?attention=${encodeURIComponent(item.filter)}"',
    "dashboard attention links must carry their filter to the register",
  );
  assertIncludes(
    registerHtml,
    "data-boq-attention-scope",
    "BOQ Register must opt into attention query filtering",
  );
  assertIncludes(
    recordsScript,
    'data-attention="${escapeHtml(attention)}"',
    "BOQ rows and cards must expose their shared attention classification",
  );
  assertIncludes(
    appScript,
    'new URLSearchParams(window.location.search).get("attention")',
    "table filtering must read the dashboard attention query",
  );
  assertIncludes(
    appScript,
    "row.dataset.attention === attention",
    "desktop BOQ rows must be limited to the requested attention subset",
  );
  assertIncludes(
    appScript,
    "card.dataset.attention === attention",
    "mobile BOQ cards must be limited to the requested attention subset",
  );
  assertIncludes(
    registerHtml,
    "data-attention-filter-context",
    "BOQ Register must explain the active attention filter",
  );
});
