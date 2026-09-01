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
const editorScript = await Deno.readTextFile(
  new URL("../js/boq.js", import.meta.url),
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
    "String(record.totalSelling || 0),",
    "unformatted BOQ values must be included in BOQ search data",
  );
  assertIncludes(
    recordsScript,
    "formatCurrency(\n        record.totalSelling || 0,",
    "formatted BOQ values must be included in BOQ search data",
  );
  assertIncludes(
    registerHtml,
    'placeholder="Search BOQ, project, customer, PO, or value"',
    "BOQ search must communicate that values are searchable",
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
    registerHtml,
    'data-table-filter="attention"',
    "BOQ Register must always expose the attention filter",
  );
  assertIncludes(
    registerHtml,
    '<option value="expiring-soon">Expiring soon</option>',
    "users must be able to select upcoming expiry attention themselves",
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
    'url.searchParams.set("attention", attentionFilter.value)',
    "manually selected attention filters must remain in the page URL",
  );
  assertIncludes(
    appScript,
    'new URLSearchParams(window.location.search).get("status")',
    "BOQ Register must read status deep links",
  );
  assertIncludes(
    appScript,
    'url.searchParams.set("status", statusFilter.value)',
    "manually selected BOQ statuses must remain in the page URL",
  );
  assertIncludes(
    appScript,
    'document.addEventListener("boq:workspace-updated", update)',
    "deep-linked filters must reapply after cloud or cache rendering",
  );
});

Deno.test("opens BOQ Register previews in Document Preview", () => {
  assertIncludes(
    recordsScript,
    '&preview=pdf">Preview</a>',
    "BOQ Register Preview must open the selected BOQ in the editor",
  );
  assertIncludes(
    editorScript,
    'get("preview") === "pdf"',
    "BOQ Editor must recognize the Document Preview request",
  );
  assertIncludes(
    editorScript,
    'window.BOQModal.open("pdf-modal")',
    "BOQ Editor must automatically open Document Preview",
  );
  if (recordsScript.includes('data-record-action="preview"')) {
    throw new Error("BOQ Register must not open the legacy generic preview");
  }
});
