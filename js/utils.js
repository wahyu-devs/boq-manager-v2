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
    const previousOrder = items.map((entry) => entry.id).join("|");
    items.splice(items.indexOf(item), 1);
    const targetIndex = items.indexOf(target);
    items.splice(targetIndex + (position === "after" ? 1 : 0), 0, item);
    return {
      items,
      changed: items.map((entry) => entry.id).join("|") !== previousOrder,
    };
  }

  window.BOQUtils = {
    formatNumber,
    formatCurrency,
    formatPercent,
    debounce,
    escapeHtml,
    reorderItemsWithinCategory,
  };
})();
