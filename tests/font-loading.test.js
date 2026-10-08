const pageNames = [
  "index.html",
  "boqs.html",
  "boq-editor.html",
  "products.html",
  "customers.html",
  "settings.html",
];
const variablesCss = await Deno.readTextFile(
  new URL("../css/variables.css", import.meta.url),
);
const baseCss = await Deno.readTextFile(
  new URL("../css/base.css", import.meta.url),
);

function assertIncludes(source, value, message) {
  if (!source.includes(value)) throw new Error(message);
}

Deno.test("self-hosts Inter Variable for every application page", async () => {
  [
    '@font-face {\n  font-family: "Inter";',
    'url("../assets/fonts/InterVariable.woff2") format("woff2-variations")',
    "font-weight: 100 900;",
    "font-display: swap;",
    '--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
  ].forEach((rule) =>
    assertIncludes(variablesCss, rule, `Inter setup is missing ${rule}`)
  );

  for (const pageName of pageNames) {
    const source = await Deno.readTextFile(
      new URL(`../${pageName}`, import.meta.url),
    );
    const preload = [
      'rel="preload"',
      'href="assets/fonts/InterVariable.woff2"',
      'as="font"',
      'type="font/woff2"',
      "crossorigin",
    ];
    preload.forEach((attribute) =>
      assertIncludes(
        source,
        attribute,
        `${pageName} font preload is missing ${attribute}`,
      )
    );
    if (source.indexOf('href="assets/fonts/InterVariable.woff2"') >
      source.indexOf('href="css/variables.css"')) {
      throw new Error(`${pageName} must preload Inter before application CSS`);
    }
    if (source.includes("fonts.googleapis.com") ||
      source.includes("fonts.gstatic.com")) {
      throw new Error(`${pageName} must not depend on Google Fonts`);
    }
  }
});

Deno.test("includes a valid Inter WOFF2 asset and its license", async () => {
  const font = await Deno.readFile(
    new URL("../assets/fonts/InterVariable.woff2", import.meta.url),
  );
  if (font.length < 100_000 ||
    String.fromCharCode(...font.slice(0, 4)) !== "wOF2") {
    throw new Error("InterVariable.woff2 is not a valid bundled WOFF2 font");
  }
  const license = await Deno.readTextFile(
    new URL("../assets/fonts/Inter-LICENSE.txt", import.meta.url),
  );
  assertIncludes(
    license,
    "SIL OPEN FONT LICENSE",
    "bundled Inter must retain its OFL license",
  );
});

Deno.test("uses Inter with tabular numbers instead of a monospace UI font", async () => {
  const editorHtml = await Deno.readTextFile(
    new URL("../boq-editor.html", import.meta.url),
  );
  const settingsHtml = await Deno.readTextFile(
    new URL("../settings.html", import.meta.url),
  );
  const combinedSource = [variablesCss, baseCss, editorHtml, settingsHtml]
    .join("\n");
  if (combinedSource.includes("--font-mono") ||
    /class=["'][^"']*\bmono\b/.test(combinedSource) ||
    baseCss.includes(".mono")) {
    throw new Error("the application must not retain a monospace UI font");
  }
  assertIncludes(
    baseCss,
    ".number,\n.currency {\n  font-variant-numeric: tabular-nums;",
    "numeric UI values must retain tabular Inter figures",
  );
  assertIncludes(
    editorHtml,
    'class="number text-sm" data-editor-number',
    "the editor header number must use tabular Inter figures",
  );
  assertIncludes(
    editorHtml,
    'class="input number"\n                        id="boq-number"',
    "the editable BOQ number must use tabular Inter figures",
  );
});
