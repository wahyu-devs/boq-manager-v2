(function initializeModalSystem() {
  let activeModal = null;
  let previouslyFocused = null;

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
    previouslyFocused = document.activeElement;
    activeModal = backdrop;
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
    const focusable = getFocusable(backdrop);
    window.setTimeout(() => (focusable[0] || backdrop).focus(), 0);
  }

  function closeModal(backdrop = activeModal) {
    if (!backdrop) return;
    backdrop.hidden = true;
    document.body.style.overflow = "";
    activeModal = null;
    if (previouslyFocused) previouslyFocused.focus();
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
