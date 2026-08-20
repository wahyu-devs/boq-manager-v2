(function initializeApplication() {
  const iconHtml = {
    check: '<span class="toast-symbol" aria-hidden="true">✓</span>',
    error: '<span class="toast-symbol" aria-hidden="true">!</span>',
    info: '<span class="toast-symbol" aria-hidden="true">i</span>',
  };

  function ensureGlobalUi() {
    if (!document.querySelector(".toast-region")) {
      const region = document.createElement("div");
      region.className = "toast-region";
      region.setAttribute("aria-live", "polite");
      region.setAttribute("aria-atomic", "true");
      document.body.append(region);
    }

    if (!document.getElementById("confirm-modal")) {
      document.body.insertAdjacentHTML(
        "beforeend",
        `
        <div class="modal-backdrop" id="confirm-modal" role="presentation" hidden>
          <section class="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
            <header class="modal-header">
              <h2 id="confirm-title">Confirm Action</h2>
              <button class="icon-button" type="button" data-close-modal aria-label="Close confirmation">×</button>
            </header>
            <div class="modal-body stack-sm">
              <p id="confirm-message" class="muted">This action cannot be undone.</p>
            </div>
            <footer class="modal-footer">
              <button class="button button-secondary" type="button" data-close-modal>Cancel</button>
              <button class="button button-danger" type="button" data-confirm-action>Delete</button>
            </footer>
          </section>
        </div>`,
      );
    }
  }

  function showToast(message, type = "success", action) {
    const region = document.querySelector(".toast-region");
    if (!region) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    toast.innerHTML = `${iconHtml[type] || iconHtml.info}<span>${
      window.BOQUtils.escapeHtml(message)
    }</span>${
      action
        ? `<button class="button button-ghost button-sm" type="button" data-toast-action>${
          window.BOQUtils.escapeHtml(action.label)
        }</button>`
        : '<button class="icon-button" type="button" data-toast-dismiss aria-label="Dismiss notification">×</button>'
    }`;
    region.append(toast);

    if (action) {
      toast.querySelector("[data-toast-action]").addEventListener(
        "click",
        () => {
          action.callback();
          toast.remove();
        },
      );
    }
    const timeout = window.setTimeout(
      () => toast.remove(),
      action ? 6500 : 4000,
    );
    toast.querySelector("[data-toast-dismiss]")?.addEventListener(
      "click",
      () => {
        window.clearTimeout(timeout);
        toast.remove();
      },
    );
  }

  function setNavigation(open) {
    document.body.classList.toggle("nav-open", open);
    document.querySelector("[data-nav-open]")?.setAttribute(
      "aria-expanded",
      String(open),
    );
  }

  function closeMenus(exception) {
    document.querySelectorAll(".dropdown-menu:not([hidden])").forEach(
      (menu) => {
        if (menu === exception) return;
        menu.hidden = true;
        menu.previousElementSibling?.setAttribute("aria-expanded", "false");
      },
    );
  }

  function initializeFiltering() {
    document.querySelectorAll("[data-filter-scope]").forEach((scope) => {
      const search = scope.querySelector("[data-table-search]");
      const filters = [...scope.querySelectorAll("[data-table-filter]")];
      let rows = [...scope.querySelectorAll("[data-table-row]")];
      const cardList = scope.querySelector(".record-card-list");

      if (cardList) {
        const existingSearchValues = new Set(
          [...cardList.querySelectorAll("[data-record-card]")].map((card) =>
            card.dataset.search
          ),
        );
        const headers = [...scope.querySelectorAll(".data-table thead th")].map(
          (header) => header.textContent.trim(),
        );

        rows.forEach((row) => {
          if (existingSearchValues.has(row.dataset.search)) return;
          const cells = [...row.cells];
          const statusIndex = cells.findIndex((cell) =>
            cell.querySelector(".status")
          );
          const detailIndexes = cells.map((_, index) => index).filter((index) =>
            index > 0 && index !== statusIndex && index < cells.length - 1
          ).slice(0, 4);
          const card = document.createElement("article");
          card.className = "record-card";
          card.setAttribute("data-record-card", "");
          Object.entries(row.dataset).forEach(([key, value]) => {
            if (key !== "tableRow") card.dataset[key] = value;
          });
          card.innerHTML = `<div class="record-card-header"><div>${
            cells[0].innerHTML
          }</div>${
            statusIndex >= 0 ? cells[statusIndex].innerHTML : ""
          }</div><dl class="record-card-grid">${
            detailIndexes.map((index) =>
              `<div><dt>${escapeHeader(headers[index])}</dt><dd>${
                cells[index].innerHTML
              }</dd></div>`
            ).join("")
          }</dl>`;
          cardList.append(card);
        });
      }
      const noResults = scope.querySelector("[data-no-results]");

      const update = () => {
        rows = [...scope.querySelectorAll("[data-table-row]")];
        const cards = [...scope.querySelectorAll("[data-record-card]")];
        const query = (search?.value || "").trim().toLowerCase();
        const activeFilters = filters.map((filter) => ({
          key: filter.dataset.tableFilter,
          value: filter.value.toLowerCase(),
        }));
        let visibleCount = 0;

        rows.forEach((row) => {
          const matchesQuery = !query ||
            window.BOQUtils.matchesSearchQuery(
              row.dataset.search || row.textContent,
              query,
            );
          const matchesFilters = activeFilters.every(({ key, value }) =>
            !value || (row.dataset[key] || "").toLowerCase() === value
          );
          const visible = matchesQuery && matchesFilters;
          row.hidden = !visible;
          if (visible) visibleCount += 1;
        });

        cards.forEach((card) => {
          const matchesQuery = !query ||
            window.BOQUtils.matchesSearchQuery(
              card.dataset.search || card.textContent,
              query,
            );
          const matchesFilters = activeFilters.every(({ key, value }) =>
            !value || (card.dataset[key] || "").toLowerCase() === value
          );
          card.hidden = !(matchesQuery && matchesFilters);
        });

        const hasCriteria = Boolean(query) ||
          activeFilters.some(({ value }) => Boolean(value));
        if (noResults) {
          noResults.hidden = visibleCount > 0 || rows.length === 0 ||
            !hasCriteria;
        }
        scope.querySelector("[data-result-count]")?.replaceChildren(
          document.createTextNode(
            `${visibleCount} result${visibleCount === 1 ? "" : "s"}`,
          ),
        );
      };

      search?.addEventListener("input", window.BOQUtils.debounce(update, 100));
      filters.forEach((filter) => filter.addEventListener("change", update));
      document.addEventListener("records:changed", update);
      update();
    });
  }

  function escapeHeader(value) {
    return window.BOQUtils.escapeHtml(
      value.replace("↕", "").replace("↑", "").replace("↓", "").trim(),
    );
  }

  function initializeSorting() {
    document.querySelectorAll("[data-sort-key]").forEach((button) => {
      button.addEventListener("click", () => {
        const table = button.closest("table");
        const tbody = table?.tBodies[0];
        if (!tbody) return;
        const direction = button.getAttribute("aria-sort") === "ascending"
          ? "descending"
          : "ascending";
        table.querySelectorAll("[data-sort-key]").forEach((item) =>
          item.removeAttribute("aria-sort")
        );
        button.setAttribute("aria-sort", direction);
        const key = button.dataset.sortKey;
        const rows = [...tbody.querySelectorAll("[data-table-row]")];

        rows.sort((a, b) => {
          const aValue = a.dataset[key] || "";
          const bValue = b.dataset[key] || "";
          const aNumber = Number(aValue);
          const bNumber = Number(bValue);
          const comparison = Number.isNaN(aNumber) || Number.isNaN(bNumber)
            ? aValue.localeCompare(bValue)
            : aNumber - bNumber;
          return direction === "ascending" ? comparison : -comparison;
        });

        rows.forEach((row) => tbody.append(row));
      });
    });
  }

  function requestConfirmation(trigger) {
    const modal = document.getElementById("confirm-modal");
    const title = trigger.dataset.confirmTitle || "Confirm Action";
    const message = trigger.dataset.confirmMessage ||
      "This action cannot be undone.";
    modal.querySelector("#confirm-title").textContent = title;
    modal.querySelector("#confirm-message").textContent = message;
    modal.querySelector("[data-confirm-action]").textContent =
      trigger.dataset.confirmLabel || "Delete";
    modal.dataset.targetId = trigger.dataset.targetId || "";
    modal.dataset.confirmEvent = trigger.dataset.confirmEvent || "";
    window.BOQModal.open("confirm-modal");
  }

  function confirmPendingAction() {
    const modal = document.getElementById("confirm-modal");
    const targetId = modal.dataset.targetId;
    const eventName = modal.dataset.confirmEvent;
    window.BOQModal.close(modal);

    if (eventName) {
      document.dispatchEvent(
        new CustomEvent(eventName, { detail: { targetId } }),
      );
      return;
    }

    if (targetId) {
      document.querySelectorAll(`[data-record-id="${CSS.escape(targetId)}"]`)
        .forEach((element) => element.remove());
      showToast("Record deleted.");
    }
  }

  async function simulateSave(button, options = {}) {
    const form = button.closest("form") ||
      (button.getAttribute("form")
        ? document.getElementById(button.getAttribute("form"))
        : null);
    if (form && !form.checkValidity()) {
      form.reportValidity();
      showToast("Please review the highlighted fields.", "error");
      return;
    }
    if (!options.confirmed) {
      const request = new CustomEvent("boq:before-save", {
        cancelable: true,
        detail: {
          button,
          resume: () => simulateSave(button, { confirmed: true }),
        },
      });
      if (!document.dispatchEvent(request)) return;
    }
    const original = button.innerHTML;
    button.classList.add("is-loading");
    button.disabled = true;
    button.innerHTML =
      '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36"/></svg><span>Saving…</span>';
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      const detail = { promise: null, successMessage: "" };
      document.dispatchEvent(new CustomEvent("boq:saved", { detail }));
      if (detail.promise) await detail.promise;
      showToast(
        detail.successMessage || button.dataset.successMessage ||
          "Changes saved successfully.",
      );
    } catch (error) {
      console.error(error);
      showToast(error?.message || "Unable to save changes.", "error");
    } finally {
      button.classList.remove("is-loading");
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  ensureGlobalUi();
  initializeFiltering();
  initializeSorting();

  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-nav-open]")) setNavigation(true);
    if (event.target.closest("[data-nav-close]")) setNavigation(false);

    const menuTrigger = event.target.closest("[data-menu-trigger]");
    if (menuTrigger) {
      event.stopPropagation();
      const menu = menuTrigger.nextElementSibling;
      const willOpen = menu.hidden;
      closeMenus(menu);
      menu.hidden = !willOpen;
      menuTrigger.setAttribute("aria-expanded", String(willOpen));
      return;
    }
    if (!event.target.closest(".dropdown-menu")) closeMenus();

    const confirmation = event.target.closest("[data-confirm]");
    if (confirmation) requestConfirmation(confirmation);
    if (event.target.closest("[data-confirm-action]")) confirmPendingAction();

    const saveButton = event.target.closest("[data-save]");
    if (saveButton) {
      event.preventDefault();
      void simulateSave(saveButton);
    }

    const refreshButton = event.target.closest("[data-refresh]");
    if (refreshButton) {
      const original = refreshButton.innerHTML;
      refreshButton.classList.add("is-loading");
      refreshButton.disabled = true;
      refreshButton.innerHTML =
        '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6"/></svg><span>Refreshing…</span>';
      try {
        const changed = await window.BOQAuth?.refresh?.();
        showToast(changed
          ? "Dashboard data updated."
          : "Dashboard data is up to date.");
      } catch (_error) {
        showToast("Unable to refresh cloud data.", "error");
      } finally {
        refreshButton.classList.remove("is-loading");
        refreshButton.disabled = false;
        refreshButton.innerHTML = original;
      }
    }
  });

  document.addEventListener("change", (event) => {
    const control = event.target.closest("[data-controls]");
    if (!control) return;
    const target = document.getElementById(control.dataset.controls);
    if (target) target.disabled = !control.checked;
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 991) setNavigation(false);
  });

  window.BOQApp = { showToast };
})();
