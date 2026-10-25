(function initializeDocumentPreview() {
  const MOBILE_QUERY = "(max-width: 767px), " +
    "(max-width: 991px) and (max-height: 500px)";
  const MAX_SCALE = 3;
  const PAGE_GUTTER = 8;
  const modal = document.querySelector("#pdf-modal");
  const viewport = modal?.querySelector("[data-document-preview-viewport]");
  const stage = modal?.querySelector("[data-document-preview-stage]");
  const preview = modal?.querySelector("[data-pdf-preview]");
  const media = window.matchMedia(MOBILE_QUERY);

  if (!modal || !viewport || !stage || !preview) return;

  let scale = 1;
  let minimumScale = 1;
  let pageWidth = 0;
  let pageHeight = 0;
  let lastViewportWidth = 0;
  let frame = 0;
  let resetRequested = false;
  let pinch = null;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function isMobilePreviewOpen() {
    return media.matches && !modal.hidden;
  }

  function pagePosition(nextScale = scale) {
    const scaledWidth = pageWidth * nextScale;
    const stageWidth = Math.max(
      viewport.clientWidth,
      scaledWidth + PAGE_GUTTER * 2,
    );
    return {
      left: Math.max(PAGE_GUTTER, (stageWidth - scaledWidth) / 2),
      top: PAGE_GUTTER,
      stageWidth,
      stageHeight: Math.max(
        viewport.clientHeight,
        pageHeight * nextScale + PAGE_GUTTER * 2,
      ),
    };
  }

  function renderScale(nextScale) {
    scale = clamp(nextScale, minimumScale, MAX_SCALE);
    const position = pagePosition();
    stage.style.width = `${position.stageWidth}px`;
    stage.style.height = `${position.stageHeight}px`;
    preview.style.left = `${position.left}px`;
    preview.style.top = `${position.top}px`;
    preview.style.transform = `scale(${scale})`;
    modal.dataset.previewZoomed = String(scale > minimumScale + 0.01);
    return position;
  }

  function measure(reset = false) {
    if (!isMobilePreviewOpen()) return;
    preview.style.transform = "none";
    pageWidth = preview.offsetWidth;
    pageHeight = preview.offsetHeight;
    if (!pageWidth || !pageHeight || !viewport.clientWidth) return;
    minimumScale = clamp(
      (viewport.clientWidth - PAGE_GUTTER * 2) / pageWidth,
      0.1,
      1,
    );
    lastViewportWidth = viewport.clientWidth;
    renderScale(reset ? minimumScale : scale);
    if (reset) {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    }
    preview.querySelectorAll("img").forEach((image) => {
      if (image.complete) return;
      image.addEventListener("load", () => schedule(false), { once: true });
    });
  }

  function schedule(reset = false) {
    resetRequested = resetRequested || reset;
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      const shouldReset = resetRequested;
      resetRequested = false;
      measure(shouldReset);
    });
  }

  function clearDesktopState() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    resetRequested = false;
    pinch = null;
    scale = 1;
    minimumScale = 1;
    pageWidth = 0;
    pageHeight = 0;
    lastViewportWidth = 0;
    modal.removeAttribute("data-preview-zoomed");
    stage.style.removeProperty("width");
    stage.style.removeProperty("height");
    preview.style.removeProperty("left");
    preview.style.removeProperty("top");
    preview.style.removeProperty("transform");
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }

  function touchGeometry(touches) {
    const first = touches[0];
    const second = touches[1];
    const rect = viewport.getBoundingClientRect();
    return {
      distance: Math.hypot(
        second.clientX - first.clientX,
        second.clientY - first.clientY,
      ),
      midpoint: {
        x: (first.clientX + second.clientX) / 2 - rect.left,
        y: (first.clientY + second.clientY) / 2 - rect.top,
      },
    };
  }

  function startPinch(event) {
    if (!isMobilePreviewOpen() || event.touches.length !== 2) return;
    event.preventDefault();
    const geometry = touchGeometry(event.touches);
    const position = pagePosition();
    pinch = {
      distance: geometry.distance,
      scale,
      documentX: (
        viewport.scrollLeft + geometry.midpoint.x - position.left
      ) / scale,
      documentY: (
        viewport.scrollTop + geometry.midpoint.y - position.top
      ) / scale,
    };
  }

  function movePinch(event) {
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    const geometry = touchGeometry(event.touches);
    if (!pinch.distance || !geometry.distance) return;
    const nextScale = clamp(
      pinch.scale * geometry.distance / pinch.distance,
      minimumScale,
      MAX_SCALE,
    );
    const position = renderScale(nextScale);
    viewport.scrollLeft = position.left + pinch.documentX * scale -
      geometry.midpoint.x;
    viewport.scrollTop = position.top + pinch.documentY * scale -
      geometry.midpoint.y;
  }

  function endPinch(event) {
    if (event.touches.length < 2) pinch = null;
  }

  viewport.addEventListener("touchstart", startPinch, { passive: false });
  viewport.addEventListener("touchmove", movePinch, { passive: false });
  viewport.addEventListener("touchend", endPinch);
  viewport.addEventListener("touchcancel", endPinch);
  viewport.addEventListener("gesturestart", (event) => {
    if (isMobilePreviewOpen()) event.preventDefault();
  }, { passive: false });

  new MutationObserver(() => {
    if (modal.hidden) {
      pinch = null;
      return;
    }
    schedule(true);
  }).observe(modal, { attributes: true, attributeFilter: ["hidden"] });

  new MutationObserver(() => schedule(true)).observe(preview, {
    childList: true,
    subtree: true,
  });

  new ResizeObserver(() => {
    if (!isMobilePreviewOpen()) return;
    if (Math.abs(viewport.clientWidth - lastViewportWidth) > 1) schedule(true);
  }).observe(viewport);

  function handleMediaChange() {
    if (media.matches) schedule(true);
    else clearDesktopState();
  }

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", handleMediaChange);
  } else {
    media.addListener(handleMediaChange);
  }

  window.BOQDocumentPreview = {
    refresh: () => schedule(true),
    getState: () => ({ scale, minimumScale, maximumScale: MAX_SCALE }),
  };
})();
