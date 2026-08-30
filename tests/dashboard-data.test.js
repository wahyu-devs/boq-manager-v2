globalThis.window = globalThis;

await import("../js/dashboard-data.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function localIso(year, month, day, hour = 9) {
  return new Date(year, month - 1, day, hour).toISOString();
}

Deno.test("summarizes Customer POs by local month and currency", () => {
  const records = [{
    id: "aug-idr",
    status: "Won",
    wonAt: localIso(2026, 8, 10),
    customerPoNumber: "PO-001",
    currency: "IDR",
    customerPoValue: 1120000,
  }, {
    id: "aug-usd",
    status: "Won",
    wonAt: localIso(2026, 8, 20),
    customerPoNumber: "PO-002",
    currency: "USD",
    customerPoValue: 250,
  }, {
    id: "jul-idr",
    status: "Won",
    wonAt: localIso(2026, 7, 12),
    customerPoNumber: "PO-003",
    currency: "IDR",
    customerPoValue: 780000,
  }, {
    id: "previous-year",
    status: "Won",
    wonAt: localIso(2025, 12, 20),
    customerPoNumber: "PO-004",
    currency: "IDR",
    customerPoValue: 990000,
  }, {
    id: "not-won",
    status: "Issued",
    wonAt: localIso(2026, 8, 5),
    currency: "IDR",
    customerPoValue: 500000,
  }];
  const periods = window.BOQDashboardData.customerPoPeriods(records, {
    referenceDate: new Date(2026, 7, 30, 12),
    defaultCurrency: "IDR",
  });
  const current = periods.find((period) => period.key === "this-month");
  const previous = periods.find((period) => period.key === "last-month");
  const year = periods.find((period) => period.key === "year-to-date");

  assert(current.count === 2, "current month includes two Won BOQs");
  assert(current.totals.length === 2, "currencies remain separate");
  assert(current.totals[0].currency === "IDR", "default currency comes first");
  assert(current.totals[0].value === 1120000, "IDR value is retained");
  assert(current.totals[1].value === 250, "USD value is retained");
  assert(previous.count === 1, "last month uses the previous calendar month");
  assert(year.count === 3, "year to date excludes previous-year and Issued BOQs");
});

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

Deno.test("builds recent activity from stored record timestamps", () => {
  const activities = window.BOQDashboardData.recentActivity({
    boqs: [{
      id: "won-boq",
      number: "BOQ-260801",
      projectName: "Won Project",
      status: "Won",
      customerPoNumber: "PO-100",
      createdAt: localIso(2026, 8, 1),
      updatedAt: localIso(2026, 8, 20),
      wonAt: localIso(2026, 8, 20),
      workingRevision: null,
      revisions: [{
        number: 0,
        state: "Issued",
        issuedAt: localIso(2026, 8, 2),
      }, {
        number: 1,
        state: "Issued",
        issuedAt: localIso(2026, 8, 10),
      }],
    }, {
      id: "draft-boq",
      number: "BOQ-260802",
      projectName: "Draft Project",
      status: "Draft",
      displayRevisionNumber: 2,
      workingRevision: 2,
      createdAt: localIso(2026, 8, 25),
      updatedAt: localIso(2026, 8, 29),
      revisions: [],
    }],
    products: [{
      name: "Router",
      createdAt: localIso(2026, 8, 28),
      updatedAt: localIso(2026, 8, 28),
    }],
    customers: [{
      companyName: "Example Customer",
      createdAt: localIso(2026, 8, 27),
      updatedAt: localIso(2026, 8, 30),
    }],
  }, 20);
  const titles = activities.map((activity) => activity.title);

  assert(titles.includes("Customer PO received"), "Won activity is included");
  assert(titles.includes("R01 issued"), "revision issue activity is included");
  assert(titles.includes("BOQ issued"), "R00 is hidden from activity labels");
  assert(!titles.includes("R00 issued"), "R00 is never displayed");
  assert(titles.includes("R02 draft updated"), "draft revision update is included");
  assert(titles.includes("Product added"), "catalog activity is included");
  assert(titles.includes("Customer updated"), "customer activity is included");
  assert(
    activities[0].title === "Customer updated",
    "activities are ordered by latest timestamp",
  );
});

Deno.test("wires the three dashboard sections to live data", async () => {
  const html = await Deno.readTextFile(new URL("../index.html", import.meta.url));
  const script = await Deno.readTextFile(
    new URL("../js/dashboard.js", import.meta.url),
  );
  assert(html.includes("Customer PO by Period"), "period panel exists");
  assert(html.includes("Recent Customer POs"), "recent PO panel exists");
  assert(html.includes("Recent Activity"), "activity panel exists");
  assert(
    html.indexOf("js/dashboard-data.js") < html.indexOf("js/dashboard.js"),
    "dashboard data helpers load first",
  );
  assert(script.includes("storedSettings.taxEnabled === true"), "PO value uses issued tax snapshot");
  assert(script.includes(").grandTotal"), "PO value uses the customer grand total");
});
