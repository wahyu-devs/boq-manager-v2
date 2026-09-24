const source = await Deno.readTextFile(
  new URL("../js/editor-layout.js", import.meta.url),
);
const layoutCss = await Deno.readTextFile(
  new URL("../css/layout.css", import.meta.url),
);
const variablesCss = await Deno.readTextFile(
  new URL("../css/variables.css", import.meta.url),
);
const componentsCss = await Deno.readTextFile(
  new URL("../css/components.css", import.meta.url),
);
const responsiveCss = await Deno.readTextFile(
  new URL("../css/responsive.css", import.meta.url),
);
const editorHtml = await Deno.readTextFile(
  new URL("../boq-editor.html", import.meta.url),
);

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

function createLayout({ width = 1440, height = 900, viewportHeight } = {}) {
  const properties = new Map();
  const frames = [];
  const windowEvents = new Map();
  const documentEvents = new Map();
  const viewportEvents = new Map();
  const observed = [];
  let resizeObserverCallback;
  const topbar = { height: 56, top: 0 };
  const header = { height: 104, top: 84 };
  const headerClasses = new Set();
  header.classList = {
    toggle: (name, enabled) => enabled ? headerClasses.add(name) : headerClasses.delete(name),
    contains: (name) => headerClasses.has(name),
  };
  const itemsHeader = { height: 64 };
  const toolbar = { height: 96 };
  for (const element of [topbar, header, itemsHeader, toolbar]) {
    element.getBoundingClientRect = () => ({
      height: element.height, top: element.top || 0,
      bottom: (element.top || 0) + element.height,
    });
  }
  const itemsPanel = {
    querySelector: (selector) => selector === ".panel-header" ? itemsHeader : toolbar,
  };
  const nodes = new Map([
    [".editor-page-header", header],
    [".boq-items-panel", itemsPanel],
  ]);
  const editor = {
    paddingBottom: "48px",
    scrollTop: 125,
    scrollLeft: 240,
    querySelector: (selector) => nodes.get(selector),
    style: {
      getPropertyValue: (name) => properties.get(name) || "",
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: (name) => properties.delete(name),
    },
  };
  const document = {
    querySelector: (selector) => selector === ".topbar" ? topbar : editor,
    addEventListener: (name, callback) => documentEvents.set(name, callback),
  };
  const window = {
    innerWidth: width,
    innerHeight: height,
    scrollY: 0,
    requestAnimationFrame: (callback) => { frames.push(callback); return frames.length; },
    addEventListener: (name, callback) => windowEvents.set(name, callback),
    visualViewport: {
      height: viewportHeight || height,
      addEventListener: (name, callback) => viewportEvents.set(name, callback),
    },
    getComputedStyle: (element) => element === editor
      ? { paddingBottom: editor.paddingBottom, getPropertyValue: () => "18px" }
      : { borderTopWidth: "1px", borderBottomWidth: "1px" },
    ResizeObserver: class {
      constructor(callback) { resizeObserverCallback = callback; }
      observe(element) { observed.push(element); }
    },
  };
  new Function("window", "document", source)(window, document);
  const flush = () => { while (frames.length) frames.shift()(); };
  return {
    properties, frames, window, editor, topbar, header, itemsHeader, toolbar,
    observed, windowEvents, documentEvents, viewportEvents, flush,
    resize: () => resizeObserverCallback(),
  };
}

Deno.test("budgets editor table height using the measured sticky stack", () => {
  const layout = createLayout();
  layout.flush();
  equal(layout.properties.get("--editor-topbar-height"), "56px", "actual topbar height");
  equal(layout.properties.get("--editor-header-height"), "104px", "actual page header height");
  equal(layout.properties.get("--editor-table-max-height"), "512px", "viewport minus measured chrome and spacing");
  equal(layout.properties.get("--editor-summary-max-height"), "674px", "summary fits below sticky header");
  equal(layout.observed.length, 4, "observes every wrapping header/toolbar surface");
  equal(layout.editor.scrollTop, 125, "vertical scroll is untouched");
  equal(layout.editor.scrollLeft, 240, "horizontal scroll is untouched");
});

Deno.test("recalculates long titles and changing action heights without duplicate frames", () => {
  const layout = createLayout();
  layout.flush();
  layout.header.height += 60;
  layout.toolbar.height += 32;
  layout.resize();
  layout.resize();
  layout.windowEvents.get("resize")();
  equal(layout.frames.length, 1, "resize notifications are batched");
  layout.flush();
  equal(layout.properties.get("--editor-header-height"), "164px", "new header measured");
  equal(layout.properties.get("--editor-table-max-height"), "420px", "available table height shrinks");
  layout.header.height -= 60;
  layout.toolbar.height -= 32;
  layout.documentEvents.get("boq:workspace-updated")();
  layout.flush();
  equal(layout.properties.get("--editor-table-max-height"), "512px", "table can grow back");
});

Deno.test("uses tablet viewport/insets and leaves mobile cards unconstrained", () => {
  const layout = createLayout({ width: 991 });
  layout.topbar.height = 54;
  layout.editor.paddingBottom = "24px";
  layout.flush();
  equal(layout.properties.get("--editor-table-max-height"), "538px", "tablet inset and topbar");
  equal(layout.properties.has("--editor-summary-max-height"), false, "tablet summary keeps natural height");
  layout.window.innerWidth = 767;
  layout.windowEvents.get("resize")();
  layout.flush();
  equal(layout.properties.has("--editor-table-max-height"), false, "mobile drops desktop height constraint");
  equal(layout.properties.get("--editor-header-height"), "104px", "mobile header remains measured");
  layout.window.innerWidth = 768;
  layout.windowEvents.get("resize")();
  layout.flush();
  equal(layout.properties.get("--editor-table-max-height"), "538px", "table restored above mobile breakpoint");
});

Deno.test("handles changing visual viewport and hidden startup surfaces safely", () => {
  const layout = createLayout({ viewportHeight: 700 });
  layout.header.height = 0;
  layout.flush();
  equal(layout.properties.size, 0, "does not apply zero-sized hidden startup geometry");
  layout.header.height = 104;
  layout.documentEvents.get("boq:auth-ready")();
  layout.flush();
  equal(layout.properties.get("--editor-table-max-height"), "312px", "uses visible visual viewport");
  layout.window.visualViewport.height = 300;
  layout.viewportEvents.get("resize")();
  layout.flush();
  equal(layout.properties.get("--editor-table-max-height"), "0px", "short viewports never produce negative height");
});

Deno.test("shows a header shadow only when the page reaches its sticky boundary", () => {
  const layout = createLayout();
  layout.flush();
  equal(layout.header.classList.contains("is-stuck"), false, "initial header has no shadow");
  layout.window.scrollY = 14;
  layout.header.top = 70;
  layout.windowEvents.get("scroll")();
  layout.flush();
  equal(layout.header.classList.contains("is-stuck"), false, "scrolling before sticky boundary has no shadow");
  layout.window.scrollY = 28;
  layout.header.top = 56;
  layout.windowEvents.get("scroll")();
  layout.windowEvents.get("scroll")();
  equal(layout.frames.length, 1, "scroll checks are batched");
  const before = JSON.stringify([...layout.properties]);
  layout.flush();
  equal(layout.header.classList.contains("is-stuck"), true, "shadow appears at the actual sticky boundary");
  equal(JSON.stringify([...layout.properties]), before, "scrolling does not recalculate table layout");
  layout.header.top = 50;
  layout.windowEvents.get("scroll")();
  layout.flush();
  equal(layout.header.classList.contains("is-stuck"), false, "released header does not retain shadow");
  layout.window.scrollY = 0;
  layout.header.top = 84;
  layout.windowEvents.get("scroll")();
  layout.flush();
  equal(layout.header.classList.contains("is-stuck"), false, "returning to top removes shadow");
});

Deno.test("refreshes the sticky indicator for restored pages and responsive topbars", () => {
  const layout = createLayout({ width: 390 });
  layout.window.scrollY = 200;
  layout.topbar.height = 54;
  layout.header.top = 54;
  layout.windowEvents.get("pageshow")();
  layout.flush();
  equal(layout.header.classList.contains("is-stuck"), true, "restored mobile scroll activates shadow");
  layout.header.height = 0;
  layout.resize();
  layout.flush();
  equal(layout.header.classList.contains("is-stuck"), false, "hidden header clears indicator");
  layout.header.height = 104;
  layout.documentEvents.get("boq:auth-ready")();
  layout.flush();
  equal(layout.header.classList.contains("is-stuck"), true, "revealed header restores indicator");
});

Deno.test("editor layout is page-scoped and preserves existing sticky/mobile layers", () => {
  new Function("window", "document", source)({}, { querySelector: () => null });
  for (const expected of [
    ".editor-page-header {\n  position: sticky;\n  z-index: 30;\n  top: var(--editor-topbar-height);",
    "background: var(--color-bg);",
    "var(--editor-topbar-height) + var(--editor-header-height) +",
  ]) {
    if (!layoutCss.includes(expected)) throw new Error(`Missing sticky layout rule: ${expected}`);
  }
  const headerRule = layoutCss.match(/\.editor-page-header\s*\{([^}]+)\}/)?.[1] || "";
  equal(/border(?:-bottom)?:/.test(headerRule), false, "header has no divider");
  equal(/box-shadow:/.test(headerRule), false, "initial header has no shadow");
  equal(layoutCss.includes(".editor-page-header.is-stuck {\n  box-shadow: var(--shadow-sticky-header);"), true, "shadow is scoped to the stuck header");
  equal((variablesCss.match(/--shadow-sticky-header:/g) || []).length, 2, "both themes define a subtle sticky shadow");
  equal(headerRule.includes("padding-block: var(--space-2) var(--space-3);"), true, "header spacing is preserved");
  equal(componentsCss.includes("max-height: calc(100vh - 238px)"), false, "removes fixed table budget");
  equal(componentsCss.includes("max-height: var(--editor-table-max-height, none);"), true, "uses measured maximum height");
  equal(componentsCss.includes(".editor-table thead {\n  position: sticky;"), true, "keeps internal table header");
  equal(componentsCss.includes(".supporting-materials-table-wrap {\n  max-height: var(--editor-table-max-height, none);"), true, "applies the measured table height to Supporting Materials");
  equal(editorHtml.includes('class="table-wrap supporting-materials-table-wrap editor-desktop-table"'), true, "keeps Supporting Materials inside the shared scroll container");
  equal(componentsCss.includes(".supporting-materials-table thead {\n  position: sticky;"), true, "keeps the Supporting Materials header visible during internal scrolling");
  equal(responsiveCss.includes(".editor-summary {\n    position: static;\n    grid-row: 1;"), true, "tablet summary remains in flow");
  equal(editorHtml.includes('<script src="js/editor-layout.js"></script>'), true, "loads editor-only module");
  if (/\.(?:editor-toolbar|boq-items-panel|panel-header)\s*\{[^}]*position:\s*sticky/s.test(layoutCss + componentsCss)) {
    throw new Error("BOQ Items header and toolbar must not become sticky");
  }
});
