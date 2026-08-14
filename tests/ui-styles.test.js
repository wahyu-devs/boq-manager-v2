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
