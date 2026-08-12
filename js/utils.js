(function defineUtilities() {
  const currencySymbols = { USD: "$", EUR: "€", GBP: "£", IDR: "Rp" };

  function numberFormatPreference() {
    return window.BOQStore?.getSettings?.().numberFormat || "comma";
  }

  function formatNumber(value, decimals = 2) {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    const preference = numberFormatPreference();
    const locale = preference === "comma"
      ? "en-US"
      : preference === "dot"
      ? "de-DE"
      : "fr-FR";
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
    return preference === "space"
      ? formatted.replace(/[\u00a0\u202f]/g, " ")
      : formatted;
  }

  function formatNumberInput(value) {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    const preference = numberFormatPreference();
    const locale = preference === "comma"
      ? "en-US"
      : preference === "dot"
      ? "de-DE"
      : "fr-FR";
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
    return preference === "space"
      ? formatted.replace(/[\u00a0\u202f]/g, " ")
      : formatted;
  }

  function parseNumberInput(value) {
    const preference = numberFormatPreference();
    let text = String(value ?? "").trim().replace(/[\s\u00a0\u202f]/g, "");
    if (!text) return 0;
    if (preference === "comma") {
      if (text.includes(",") && text.includes(".")) {
        text = text.replaceAll(",", "");
      } else if (text.includes(",")) {
        text = /^-?\d{1,3}(,\d{3})+$/.test(text)
          ? text.replaceAll(",", "")
          : text.replaceAll(",", ".");
      }
    } else if (preference === "dot") {
      if (text.includes(".") && text.includes(",")) {
        text = text.replaceAll(".", "").replaceAll(",", ".");
      } else if (text.includes(",")) {
        text = text.replaceAll(",", ".");
      } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
        text = text.replaceAll(".", "");
      }
    } else {
      text = text.replaceAll(",", ".");
    }
    const number = Number(text.replace(/[^\d.-]/g, ""));
    return Number.isFinite(number) ? number : 0;
  }

  function numberInputEditingValue(value) {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    const text = String(amount);
    return numberFormatPreference() === "comma" ? text : text.replace(".", ",");
  }

  function formatCurrency(value, currency = "USD", decimals) {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    const fractionDigits = decimals ?? (currency === "IDR" ? 0 : 2);
    const sign = amount < 0 ? "-" : "";
    const symbol = currencySymbols[currency] || currency;
    const separator = currency === "IDR" || !currencySymbols[currency]
      ? " "
      : "";
    return `${sign}${symbol}${separator}${formatNumber(
      Math.abs(amount),
      fractionDigits,
    )}`;
  }

  function formatBoqAmount(value, currency = "IDR", decimals) {
    return currency === "IDR"
      ? formatNumber(value, decimals ?? 0)
      : formatCurrency(value, currency, decimals);
  }

  function formatPercent(value) {
    return `${formatNumber(value, 1)}%`;
  }

  function debounce(callback, wait = 160) {
    let timeout;
    return (...args) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => callback(...args), wait);
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function collectUniqueTextValues(...groups) {
    const seen = new Set();
    const values = [];
    groups.forEach((group) => {
      const entries = Array.isArray(group) ? group : [group];
      entries.forEach((entry) => {
        const value = String(entry || "").trim();
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return;
        seen.add(key);
        values.push(value);
      });
    });
    return values;
  }

  function reorderItemsWithinCategory(records, itemId, targetId, position) {
    const items = Array.isArray(records) ? records.slice() : [];
    if (!itemId || !targetId || itemId === targetId) {
      return { items, changed: false };
    }
    const item = items.find((entry) => entry.id === itemId);
    const target = items.find((entry) => entry.id === targetId);
    if (!item || !target || item.category !== target.category) {
      return { items, changed: false };
    }
    const previousOrder = items.map((entry) => entry.id);
    items.splice(items.indexOf(item), 1);
    const targetIndex = items.indexOf(target);
    items.splice(targetIndex + (position === "after" ? 1 : 0), 0, item);
    return {
      items,
      changed: items.some((entry, index) => entry.id !== previousOrder[index]),
    };
  }

  function reorderValues(records, value, targetValue, position) {
    const values = Array.isArray(records) ? records.slice() : [];
    if (!value || !targetValue || value === targetValue ||
        !values.includes(value) || !values.includes(targetValue)) {
      return { values, changed: false };
    }
    const previousOrder = values.slice();
    values.splice(values.indexOf(value), 1);
    const targetIndex = values.indexOf(targetValue);
    values.splice(
      targetIndex + (position === "after" ? 1 : 0),
      0,
      value,
    );
    return {
      values,
      changed: values.some((entry, index) => entry !== previousOrder[index]),
    };
  }

  window.BOQUtils = {
    formatNumber,
    formatNumberInput,
    parseNumberInput,
    numberInputEditingValue,
    formatCurrency,
    formatBoqAmount,
    formatPercent,
    debounce,
    escapeHtml,
    collectUniqueTextValues,
    reorderItemsWithinCategory,
    reorderValues,
  };
})();
