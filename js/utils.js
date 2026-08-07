(function defineUtilities() {
  const currencySymbols = { USD: "$", EUR: "€", GBP: "£", IDR: "Rp" };

  function formatCurrency(value, currency = "USD", decimals) {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    const fractionDigits = decimals ?? (currency === "IDR" ? 0 : 2);
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(amount);
    } catch (error) {
      return `${currencySymbols[currency] || currency} ${
        amount.toFixed(fractionDigits)
      }`;
    }
  }

  function formatPercent(value) {
    return `${Number(value || 0).toFixed(1)}%`;
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

  window.BOQUtils = { formatCurrency, formatPercent, debounce, escapeHtml };
})();
