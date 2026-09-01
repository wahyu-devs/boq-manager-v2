(function initializeModalSystem() {
  const modalStack = [];

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

  function openModal(id) {
    const backdrop = document.getElementById(id);
    if (!backdrop) return;
    const existingEntry = modalStack.find((entry) =>
      entry.backdrop === backdrop
    );
    if (existingEntry) return;
    modalStack.push({
      backdrop,
      previouslyFocused: document.activeElement,
    });
    syncModalLayers();
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
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
    document.body.style.overflow = modalStack.length ? "hidden" : "";
    if (entry?.previouslyFocused) entry.previouslyFocused.focus();
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
