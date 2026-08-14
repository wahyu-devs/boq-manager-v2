const utilitiesCss = await Deno.readTextFile(
  new URL("../css/utilities.css", import.meta.url),
);

function assertIncludes(source, value, message) {
  if (!source.includes(value)) throw new Error(message);
}

Deno.test("keeps desktop badges vertically centered", () => {
  assertIncludes(
    utilitiesCss,
    ".badge.desktop-only {\n  display: inline-flex;\n}",
    "desktop visibility must preserve the badge flex alignment",
  );
});

Deno.test("uses the application icon as favicon on every page", async () => {
  const pages = [
    "index.html",
    "boqs.html",
    "boq-editor.html",
    "products.html",
    "customers.html",
    "settings.html",
  ];
  for (const page of pages) {
    const source = await Deno.readTextFile(new URL(`../${page}`, import.meta.url));
    assertIncludes(
      source,
      '<link rel="icon" type="image/png" sizes="512x512" href="assets/icon.png">',
      `${page} must use assets/icon.png as its favicon`,
    );
  }
});
