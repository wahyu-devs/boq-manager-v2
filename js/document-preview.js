(function initializeDocumentPreviewFit() {
  const MOBILE_QUERY = "(max-width: 767px), " +
    "(max-width: 991px) and (max-height: 500px)";
  const modal = document.querySelector("#pdf-modal");
  const viewport = modal?.querySelector("[data-document-preview-fit-viewport]");
  const stage = modal?.querySelector("[data-document-preview-fit-stage]");
  const preview = modal?.querySelector("[data-pdf-preview]");
  const media = window.matchMedia(MOBILE_QUERY);

  if (!modal || !viewport || !stage || !preview) return;

  let frame = 0;

  function clearFit() {
    preview.style.removeProperty("left");
    preview.style.removeProperty("transform");
    stage.style.removeProperty("height");
  }

  function fitPreview() {
    if (!media.matches) {
      clearFit();
      return;
    }
    if (modal.hidden) return;

    preview.style.transform = "none";
    const pageWidth = preview.offsetWidth;
    const pageHeight = preview.offsetHeight;
    const availableWidth = viewport.clientWidth;
    if (!pageWidth || !pageHeight || !availableWidth) return;

    const scale = Math.min(1, availableWidth / pageWidth);
    const renderedWidth = pageWidth * scale;
    preview.style.left = `${Math.max(0, (availableWidth - renderedWidth) / 2)}px`;
    preview.style.transform = `scale(${scale})`;
    stage.style.height = `${Math.ceil(pageHeight * scale)}px`;

    preview.querySelectorAll("img").forEach((image) => {
      if (image.complete) return;
      image.addEventListener("load", scheduleFit, { once: true });
    });
  }

  function scheduleFit() {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      fitPreview();
    });
  }

  new MutationObserver(() => {
    if (!modal.hidden) scheduleFit();
  }).observe(modal, { attributes: true, attributeFilter: ["hidden"] });

  new MutationObserver(scheduleFit).observe(preview, {
    childList: true,
    subtree: true,
  });

  new ResizeObserver(scheduleFit).observe(viewport);

  function handleMediaChange() {
    if (media.matches) scheduleFit();
    else clearFit();
  }

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", handleMediaChange);
  } else {
    media.addListener(handleMediaChange);
  }

  window.BOQDocumentPreview = {
    refresh: scheduleFit,
  };
})();
