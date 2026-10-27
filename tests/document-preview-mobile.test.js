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

function assertNotIncludes(source, value, message) {
  if (source.includes(value)) throw new Error(message);
}

Deno.test("fits the unchanged desktop document layout to mobile width", () => {
  [
    "data-document-preview-fit-viewport",
    "data-document-preview-fit-stage",
    '<script src="js/document-preview.js"></script>',
  ].forEach((value) =>
    assertIncludes(editorHtml, value, `Document Preview is missing ${value}`)
  );
  [
    "#pdf-modal .document-preview-fit-viewport",
    "@media (max-width: 767px),\n  (max-width: 991px) and (max-height: 500px)",
    "width: 656px;\n    min-width: 656px;",
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

Deno.test("uses proportional fit and natural vertical modal scrolling", () => {
  [
    'const MOBILE_QUERY = "(max-width: 767px), " +',
    '"(max-width: 991px) and (max-height: 500px)";',
    "const scale = Math.min(1, availableWidth / pageWidth);",
    "(availableWidth - renderedWidth) / 2",
    'preview.style.transform = `scale(${scale})`;',
    'stage.style.height = `${Math.ceil(pageHeight * scale)}px`;',
    "new ResizeObserver(scheduleFit).observe(viewport);",
  ].forEach((value) =>
    assertIncludes(
      previewScript,
      value,
      `mobile fit behavior is missing ${value}`,
    )
  );
  assertNotIncludes(
    previewScript,
    'addEventListener("touchstart"',
    "fit-to-width must not add custom pinch zoom",
  );
  assertNotIncludes(
    responsiveCss,
    "#pdf-modal.modal-backdrop",
    "Document Preview must retain the shared mobile bottom-sheet modal",
  );
  assertIncludes(
    editorScript,
    "window.BOQDocumentPreview?.refresh();",
    "rendering new preview content must refresh the mobile fit",
  );
});
