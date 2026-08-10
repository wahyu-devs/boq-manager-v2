(function initializeSettings() {
  const form = document.querySelector("#settings-form");
  if (!form) return;
  const store = window.BOQStore;
  const defaults = {
    defaultCurrency: "USD",
    defaultMargin: 0,
    defaultValidity: 30,
    numberingFormat: "BOQ-{YYYY}-{NNN}",
    rounding: "2",
    showSku: false,
    showUnitPricing: true,
    taxEnabled: false,
    taxRate: 0,
    dateFormat: "dmy",
    numberFormat: "comma",
    compactTables: false,
  };
  let companyLogo = "";
  let formDirty = false;

  function applyStoredSettings() {
    const saved = store.getSettings();
    const values = { ...defaults, ...saved };
    companyLogo = saved.companyLogo || "";
    Object.entries(values).forEach(([name, value]) => {
      const control = form.elements.namedItem(name);
      if (!control) return;
      if (control.type === "checkbox") control.checked = Boolean(value);
      else control.value = value ?? "";
    });
  }

  applyStoredSettings();

  function updateTaxControls() {
    const enabled = form.elements.taxEnabled.checked;
    form.elements.taxRate.disabled = !enabled;
    form.elements.taxRegistrationNumber.disabled = !enabled;
  }

  function updateLogoPreview() {
    const preview = document.querySelector("[data-company-logo-preview]");
    const removeButton = document.querySelector("[data-remove-company-logo]");
    preview.innerHTML = companyLogo
      ? `<img src="${companyLogo}" alt="Company logo preview">`
      : "—";
    preview.setAttribute(
      "aria-label",
      companyLogo ? "Company logo preview" : "No company logo",
    );
    removeButton.hidden = !companyLogo;
  }

  function collectSettings() {
    const result = {};
    [...form.elements].forEach((control) => {
      if (!control.name) return;
      if (control.type === "checkbox") result[control.name] = control.checked;
      else result[control.name] = control.value;
    });
    result.defaultMargin = Number(result.defaultMargin || 0);
    result.defaultValidity = Number(result.defaultValidity || 30);
    result.taxRate = Number(result.taxRate || 0);
    result.companyLogo = companyLogo;
    return result;
  }

  function updateNumberingPreview() {
    const input = form.elements.numberingFormat;
    const preview = document.querySelector("[data-numbering-preview]");
    if (!input || !preview) return;
    const valid = store.isValidNumberingFormat(input.value);
    input.setCustomValidity(
      valid ? "" : "Include exactly one sequence token such as {NNN}.",
    );
    preview.textContent = valid
      ? store.formatDocumentNumber(input.value, 1)
      : "invalid format";
  }

  function downloadBackup() {
    const state = store.exportState();
    const timestamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `boq-manager-backup-${timestamp}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    window.BOQApp.showToast("Backup downloaded.");
  }

  function updateSyncStatus() {
    const node = document.querySelector("[data-last-synced]");
    if (!node) return;
    const timestamp = Number(store.getMeta().lastSyncedAt || 0);
    node.textContent = timestamp
      ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(timestamp))
      : "Not yet";
  }

  form.elements.taxEnabled.addEventListener("change", updateTaxControls);
  form.elements.numberingFormat.addEventListener("input", updateNumberingPreview);
  document.querySelector("[data-company-logo-input]").addEventListener(
    "change",
    (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        companyLogo = String(reader.result || "");
        updateLogoPreview();
      });
      reader.readAsDataURL(file);
    },
  );
  document.querySelector("[data-remove-company-logo]").addEventListener(
    "click",
    () => {
      companyLogo = "";
      document.querySelector("[data-company-logo-input]").value = "";
      updateLogoPreview();
    },
  );
  document.querySelector("[data-settings-save]").addEventListener(
    "click",
    () => {
      if (!form.checkValidity()) return form.reportValidity();
      store.saveSettings(collectSettings());
      formDirty = false;
      window.BOQApp.showToast("Settings saved.");
    },
  );
  document.querySelector("[data-backup-download]")?.addEventListener(
    "click",
    downloadBackup,
  );
  document.querySelector("[data-restore-trigger]")?.addEventListener(
    "click",
    () => document.querySelector("[data-restore-input]").click(),
  );
  document.querySelector("[data-restore-input]")?.addEventListener(
    "change",
    async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      let state;
      try {
        state = JSON.parse(await file.text());
      } catch (_error) {
        window.BOQApp.showToast("The selected file is not valid JSON.", "error");
        return;
      }
      if (!window.confirm(
        "Restore will replace the data in this workspace. Continue?",
      )) return;
      try {
        store.applyState(state);
        await window.BOQAuth?.push?.();
        location.reload();
      } catch (error) {
        console.error(error);
        window.BOQApp.showToast("This backup format is not supported.", "error");
      }
    },
  );
  document.querySelector("[data-sync-push]")?.addEventListener(
    "click",
    async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      const success = await window.BOQAuth?.push?.();
      button.disabled = false;
      window.BOQApp.showToast(
        success ? "Cloud data saved." : "Cloud sync failed.",
        success ? "success" : "error",
      );
      updateSyncStatus();
    },
  );
  document.querySelector("[data-sync-pull]")?.addEventListener(
    "click",
    async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const changed = await window.BOQAuth?.refresh?.();
        if (!changed) window.BOQApp.showToast("Workspace is already up to date.");
      } catch (_error) {
        window.BOQApp.showToast("Cloud refresh failed.", "error");
      } finally {
        button.disabled = false;
      }
    },
  );
  form.addEventListener("input", () => {
    formDirty = true;
  });
  form.addEventListener("change", () => {
    formDirty = true;
  });
  document.addEventListener("boq:workspace-updated", () => {
    if (formDirty) return;
    applyStoredSettings();
    updateTaxControls();
    updateLogoPreview();
    updateSyncStatus();
    updateNumberingPreview();
  });
  document.addEventListener("boq:sync-complete", updateSyncStatus);
  updateTaxControls();
  updateLogoPreview();
  updateSyncStatus();
  updateNumberingPreview();
})();
