(function initializeModalSystem() {
  const modalStack = [];
  const rootStyleProperties = ["overflow"];
  const bodyStyleProperties = [
    "overflow",
    "position",
    "top",
    "left",
    "width",
    "paddingRight",
  ];
  let pageScrollLock = null;

  function activeEntry() {
    return modalStack.at(-1) || null;
  }

  function syncModalLayers() {
    modalStack.forEach((entry, index) => {
      entry.backdrop.style.setProperty(
        "--modal-stack-depth",
        String(index),
      );
    });
  }

  function getFocusable(modal) {
    return [
      ...modal.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ];
  }

  function captureInlineStyles(element, properties) {
    return Object.fromEntries(
      properties.map((property) => [property, element.style[property]]),
    );
  }

  function restoreInlineStyles(element, styles) {
    Object.entries(styles).forEach(([property, value]) => {
      element.style[property] = value;
    });
  }

  function lockPageScroll() {
    if (pageScrollLock) return;
    const root = document.documentElement;
    const body = document.body;
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);
    const bodyPaddingRight = Number.parseFloat(
      window.getComputedStyle(body).paddingRight,
    ) || 0;

    pageScrollLock = {
      scrollX,
      scrollY,
      rootStyles: captureInlineStyles(root, rootStyleProperties),
      bodyStyles: captureInlineStyles(body, bodyStyleProperties),
    };

    root.classList.add("modal-scroll-locked");
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.width = "100%";
    if (scrollbarWidth) {
      body.style.paddingRight = `${bodyPaddingRight + scrollbarWidth}px`;
    }
  }

  function unlockPageScroll() {
    if (!pageScrollLock) return;
    const lock = pageScrollLock;
    pageScrollLock = null;
    document.documentElement.classList.remove("modal-scroll-locked");
    restoreInlineStyles(document.documentElement, lock.rootStyles);
    restoreInlineStyles(document.body, lock.bodyStyles);
    window.scrollTo(lock.scrollX, lock.scrollY);
  }

  function restoreFocus(element) {
    if (!element?.focus) return;
    try {
      element.focus({ preventScroll: true });
    } catch (_error) {
      element.focus();
    }
  }

  function openModal(id) {
    const backdrop = document.getElementById(id);
    if (!backdrop) return;
    const existingEntry = modalStack.find((entry) =>
      entry.backdrop === backdrop
    );
    if (existingEntry) return;
    if (!modalStack.length) lockPageScroll();
    modalStack.push({
      backdrop,
      previouslyFocused: document.activeElement,
    });
    syncModalLayers();
    backdrop.hidden = false;
    const focusable = getFocusable(backdrop);
    window.setTimeout(() => (focusable[0] || backdrop).focus(), 0);
  }

  function closeModal(backdrop = activeEntry()?.backdrop) {
    if (!backdrop) return;
    const index = modalStack.findIndex((entry) =>
      entry.backdrop === backdrop
    );
    const [entry] = index >= 0 ? modalStack.splice(index, 1) : [];
    backdrop.hidden = true;
    backdrop.style.removeProperty("--modal-stack-depth");
    syncModalLayers();
    if (!modalStack.length) unlockPageScroll();
    restoreFocus(entry?.previouslyFocused);
  }

  document.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-open-modal]");
    if (opener) {
      event.preventDefault();
      openModal(opener.dataset.openModal);
      return;
    }

    const closer = event.target.closest("[data-close-modal]");
    if (closer) {
      closeModal(closer.closest(".modal-backdrop"));
      return;
    }

    if (event.target.classList.contains("modal-backdrop")) {
      closeModal(event.target);
    }
  });

  document.addEventListener("keydown", (event) => {
    const activeModal = activeEntry()?.backdrop;
    if (!activeModal) return;
    if (event.key === "Escape") {
      closeModal();
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = getFocusable(activeModal);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.BOQModal = { open: openModal, close: closeModal };
})();
