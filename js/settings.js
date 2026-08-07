(function initializeSettings() {
  const form = document.querySelector("#settings-form");
  if (!form) return;
  const store = window.BOQStore;
  const saved = store.getSettings();
  const defaults = {
    defaultCurrency: "USD",
    defaultMargin: 0,
    defaultValidity: 30,
    numberingFormat: "BOQ-{YYYY}-{NNN}",
    rounding: "2",
    showDescriptions: true,
    showSku: false,
    showUnitPricing: true,
    taxEnabled: false,
    taxRate: 0,
    dateFormat: "dmy",
    numberFormat: "comma",
    compactTables: false,
  };
  const values = { ...defaults, ...saved };
  let companyLogo = saved.companyLogo || "";

  Object.entries(values).forEach(([name, value]) => {
    const control = form.elements.namedItem(name);
    if (!control) return;
    if (control.type === "checkbox") control.checked = Boolean(value);
    else control.value = value ?? "";
  });

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

  form.elements.taxEnabled.addEventListener("change", updateTaxControls);
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
      window.BOQApp.showToast("Settings saved.");
    },
  );
  updateTaxControls();
  updateLogoPreview();
})();
