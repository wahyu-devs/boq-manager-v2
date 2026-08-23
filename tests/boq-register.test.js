const registerHtml = await Deno.readTextFile(
  new URL("../boqs.html", import.meta.url),
);
const recordsScript = await Deno.readTextFile(
  new URL("../js/records.js", import.meta.url),
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
