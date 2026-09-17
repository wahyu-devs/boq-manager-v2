const source = await Deno.readTextFile(new URL("../js/boq.js", import.meta.url));
const updateSource = source.match(
  /function updateStickyColumnsState\(\) \{[\s\S]*?\n  \}/,
)?.[0];
if (!updateSource) throw new Error("Sticky columns updater missing");

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

function createSurface() {
  const classes = new Set();
  const properties = new Map();
  return {
    classes, properties,
    classList: {
      contains: (name) => classes.has(name),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      remove: (name) => classes.delete(name),
    },
    style: {
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: (name) => properties.delete(name),
    },
  };
}

function createStickyTable() {
  const viewport = createSurface();
  const table = createSurface();
  const widths = [36, 106, 300, 108, 68, 82];
  const headers = widths.map((width, index) => {
    const header = createSurface();
    header.display = "table-cell";
    header.width = width;
    header.right = 506;
    header.getBoundingClientRect = () => ({ width: header.width, right: header.right });
    if (![1, 3].includes(index)) header.classes.add("editor-sticky-column");
    return header;
  });
  const unitHeader = headers[5];
  unitHeader.cellIndex = 5;
  unitHeader.parentElement = { cells: headers };
  table.querySelector = () => unitHeader;
  const wrap = {
    hidden: false, offsetParent: {}, scrollTop: 320, scrollLeft: 0, clientHeight: 512,
    querySelector: () => table,
    getBoundingClientRect: () => ({ left: 20 }),
  };
  const update = new Function(
    "desktopTableWrap", "desktopTableViewport", "getComputedStyle",
    `return (${updateSource});`,
  )(wrap, viewport, (header) => ({ display: header.display }));
  return { viewport, table, wrap, headers, unitHeader, update };
}

Deno.test("positions one stationary sticky shadow from the measured Unit edge", () => {
  const layout = createStickyTable();
  layout.wrap.scrollLeft = 214;
  layout.update();
  equal(layout.viewport.classes.has("sticky-columns-active"), true, "overlay activated");
  equal(layout.viewport.properties.get("--editor-sticky-boundary-width"), "486px", "overlay follows actual Unit edge");
  equal(layout.table.properties.get("--editor-sticky-boundary-width"), "486px", "category/subtotal region stays aligned");
  equal(layout.viewport.properties.get("--editor-table-viewport-height"), "512px", "overlay uses visible client height, not scroll height");
  equal(layout.wrap.scrollTop, 320, "internal vertical scroll unchanged");
  equal(layout.wrap.scrollLeft, 214, "horizontal scroll unchanged");
});

Deno.test("removes the continuous sticky shadow before activation and at the left edge", () => {
  const layout = createStickyTable();
  layout.wrap.scrollLeft = 250;
  layout.update();
  for (const scrollLeft of [100, 0]) {
    layout.wrap.scrollLeft = scrollLeft;
    layout.update();
    equal(layout.viewport.classes.has("sticky-columns-active"), false, "overlay hidden outside sticky region");
    equal(layout.table.classes.has("sticky-columns-active"), false, "table state stays aligned");
    equal(layout.viewport.properties.size, 0, "overlay measurements are cleared");
    equal(layout.table.properties.size, 0, "category fallback measurement is cleared");
  }
});

Deno.test("refreshes shadow height and boundary after layout or column visibility changes", () => {
  const layout = createStickyTable();
  layout.wrap.scrollLeft = 150;
  layout.update();
  equal(layout.viewport.classes.has("sticky-columns-active"), false, "visible part number raises activation threshold");
  layout.headers[1].display = "none";
  layout.wrap.clientHeight = 400;
  layout.unitHeader.right = 530;
  layout.update();
  equal(layout.viewport.classes.has("sticky-columns-active"), true, "hidden non-sticky columns excluded from threshold");
  equal(layout.viewport.properties.get("--editor-sticky-boundary-width"), "510px", "new rendered edge measured");
  equal(layout.viewport.properties.get("--editor-table-viewport-height"), "400px", "overlay resizes without moving rows");
});

Deno.test("clears overlay state for empty or mobile-hidden tables", () => {
  for (const state of ["empty", "mobile"]) {
    const layout = createStickyTable();
    layout.wrap.scrollLeft = 250;
    layout.update();
    if (state === "empty") layout.wrap.hidden = true;
    else layout.wrap.offsetParent = null;
    layout.update();
    equal(layout.viewport.classes.has("sticky-columns-active"), false, `${state} has no overlay`);
    equal(layout.viewport.properties.size, 0, `${state} clears stale measurements`);
  }
  if (!source.includes("observer.observe(desktopTableWrap);")) {
    throw new Error("Actual table viewport resizing must refresh the shadow");
  }
  if (!source.includes('currentView = event.target.value;\n    applyViewState();\n    updateStickyColumnsState();')) {
    throw new Error("View switching must refresh shadow geometry immediately");
  }
});
