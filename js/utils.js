(function defineUtilities() {
  const currencySymbols = { USD: "$", EUR: "€", GBP: "£", IDR: "Rp" };

  function numberFormatPreference(preference) {
    return preference || window.BOQStore?.getSettings?.().numberFormat ||
      "comma";
  }

  function formatNumber(value, decimals = 2, numberFormat) {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    const preference = numberFormatPreference(numberFormat);
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

  function formatNumberInputLive(value, numberFormat) {
    const preference = numberFormatPreference(numberFormat);
    const decimalSeparator = preference === "comma" ? "." : ",";
    const groupSeparator = preference === "comma"
      ? ","
      : preference === "dot"
      ? "."
      : " ";
    const text = String(value ?? "");
    if (!text) return "";
    const decimalIndex = text.indexOf(decimalSeparator);
    const hasDecimal = decimalIndex !== -1;
    const integerSource = hasDecimal ? text.slice(0, decimalIndex) : text;
    const fractionSource = hasDecimal ? text.slice(decimalIndex + 1) : "";
    const integerDigits = integerSource.replace(/\D/g, "")
      .replace(/^0+(?=\d)/, "");
    const integer = integerDigits || (hasDecimal ? "0" : "");
    if (!integer) return "";
    const groupedInteger = integer.replace(
      /\B(?=(\d{3})+(?!\d))/g,
      groupSeparator,
    );
    const fraction = fractionSource.replace(/\D/g, "").slice(0, 2);
    return `${groupedInteger}${hasDecimal ? decimalSeparator + fraction : ""}`;
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

  function formatCurrency(value, currency = "USD", decimals, numberFormat) {
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
      numberFormat,
    )}`;
  }

  function formatCurrencyParts(
    value,
    currency = "USD",
    decimals,
    numberFormat,
  ) {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    const fractionDigits = decimals ?? (currency === "IDR" ? 0 : 2);
    return {
      symbol: currencySymbols[currency] || currency,
      value: `${amount < 0 ? "-" : ""}${formatNumber(
        Math.abs(amount),
        fractionDigits,
        numberFormat,
      )}`,
    };
  }

  function formatCurrencyMarkup(
    value,
    currency = "USD",
    decimals,
    numberFormat,
  ) {
    const parts = formatCurrencyParts(value, currency, decimals, numberFormat);
    return `<span class="currency-accounting" aria-label="${
      escapeHtml(formatCurrency(value, currency, decimals, numberFormat))
    }"><span class="currency-accounting-symbol" aria-hidden="true">${
      escapeHtml(parts.symbol)
    }</span><span class="currency-accounting-value" aria-hidden="true">${
      escapeHtml(parts.value)
    }</span></span>`;
  }

  function formatPercent(value, numberFormat) {
    return `${formatNumber(value, 1, numberFormat)}%`;
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

  function visibleRevisionLabel(value) {
    const label = String(value || "").trim();
    return /^R0+$/i.test(label) ? "" : label;
  }

  function greetingForHour(value) {
    const hour = Number(value);
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) return "Welcome";
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 17) return "Good afternoon";
    if (hour >= 17 && hour < 21) return "Good evening";
    return "Good night";
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
    formatNumberInputLive,
    parseNumberInput,
    numberInputEditingValue,
    formatCurrency,
    formatCurrencyParts,
    formatCurrencyMarkup,
    formatPercent,
    debounce,
    escapeHtml,
    visibleRevisionLabel,
    greetingForHour,
    collectUniqueTextValues,
    reorderItemsWithinCategory,
    reorderValues,
  };
})();
