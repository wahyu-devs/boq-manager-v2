const editorHtml = await Deno.readTextFile(
  new URL("../boq-editor.html", import.meta.url),
);
const responsiveCss = await Deno.readTextFile(
  new URL("../css/responsive.css", import.meta.url),
);
const previewScript = await Deno.readTextFile(
  new URL("../js/document-preview.js", import.meta.url),
);
const editorScript = await Deno.readTextFile(
  new URL("../js/boq.js", import.meta.url),
);

function assertIncludes(source, value, message) {
  if (!source.includes(value)) throw new Error(message);
}

Deno.test("uses a full-screen fit-to-width Document Preview on mobile", () => {
  [
    "data-document-preview-viewport",
    "data-document-preview-stage",
    "Document preview. Pinch with two fingers to zoom.",
    '<script src="js/document-preview.js"></script>',
  ].forEach((value) =>
    assertIncludes(editorHtml, value, `Document Preview is missing ${value}`)
  );
  [
    "#pdf-modal.modal-backdrop {\n    align-items: stretch;\n    padding: 0;",
    "height: 100dvh;",
    "grid-template-rows: auto minmax(0, 1fr) auto;",
    "touch-action: pan-x pan-y;",
    "width: 620px;\n    min-width: 620px;",
    "transform-origin: top left;",
  ].forEach((value) =>
    assertIncludes(
      responsiveCss,
      value,
      `mobile Document Preview styles are missing ${value}`,
    )
  );
});

Deno.test("supports bounded pinch zoom without scaling modal controls", () => {
  [
    'const MOBILE_QUERY = "(max-width: 767px), " +',
    '"(max-width: 991px) and (max-height: 500px)";',
    "const MAX_SCALE = 3;",
    "(viewport.clientWidth - PAGE_GUTTER * 2) / pageWidth",
    'preview.style.transform = `scale(${scale})`;',
    'viewport.addEventListener("touchstart", startPinch, { passive: false });',
    'viewport.addEventListener("touchmove", movePinch, { passive: false });',
    "viewport.scrollLeft = position.left + pinch.documentX * scale",
    "viewport.scrollTop = position.top + pinch.documentY * scale",
    "if (Math.abs(viewport.clientWidth - lastViewportWidth) > 1) schedule(true);",
  ].forEach((value) =>
    assertIncludes(
      previewScript,
      value,
      `mobile pinch behavior is missing ${value}`,
    )
  );
  assertIncludes(
    editorScript,
    "window.BOQDocumentPreview?.refresh();",
    "rendering a new preview must reset mobile zoom",
  );
});
