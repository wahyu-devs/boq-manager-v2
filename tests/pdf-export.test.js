const componentsCss = await Deno.readTextFile(
  new URL("../css/components.css", import.meta.url),
);
function assertIncludes(source, value, message) {
  if (!source.includes(value)) throw new Error(message);
}

Deno.test("spaces customer contact details above the preview divider", () => {
  assertIncludes(
    componentsCss,
    "min-height: 116px;\n  margin-bottom: 8px;",
    "Customer PDF Preview keeps space above the divider",
  );
});
