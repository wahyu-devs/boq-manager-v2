const modalScript = await Deno.readTextFile(
  new URL("../js/modal.js", import.meta.url),
);
const componentsCss = await Deno.readTextFile(
  new URL("../css/components.css", import.meta.url),
);

function assertIncludes(source, value, message) {
  if (!source.includes(value)) throw new Error(message);
}

Deno.test("locks the page once for a nested modal stack", () => {
  [
    "let pageScrollLock = null;",
    "if (!modalStack.length) lockPageScroll();",
    "if (!modalStack.length) unlockPageScroll();",
    'body.style.position = "fixed";',
    'body.style.top = `-${scrollY}px`;',
    'root.classList.add("modal-scroll-locked");',
  ].forEach((value) =>
    assertIncludes(
      modalScript,
      value,
      `shared modal scroll lock is missing ${value}`,
    )
  );
});

Deno.test("restores page styles scroll position and focus", () => {
  [
    "captureInlineStyles(root, rootStyleProperties)",
    "captureInlineStyles(body, bodyStyleProperties)",
    "restoreInlineStyles(document.documentElement, lock.rootStyles);",
    "restoreInlineStyles(document.body, lock.bodyStyles);",
    "window.scrollTo(lock.scrollX, lock.scrollY);",
    "element.focus({ preventScroll: true });",
  ].forEach((value) =>
    assertIncludes(
      modalScript,
      value,
      `modal close restoration is missing ${value}`,
    )
  );
});

Deno.test("contains modal overscroll while the page is locked", () => {
  assertIncludes(
    componentsCss,
    "html.modal-scroll-locked,\nhtml.modal-scroll-locked body {\n  overscroll-behavior: none;",
    "the locked root must reject scroll chaining",
  );
  assertIncludes(
    componentsCss,
    "overflow: auto;\n  overscroll-behavior: contain;",
    "scrollable modals must contain overscroll",
  );
});
