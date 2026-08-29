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

  function formatNumberInputElementLive(input, numberFormat) {
    const text = input.value;
    const caret = input.selectionStart ?? text.length;
    const preference = numberFormatPreference(numberFormat);
    const decimalSeparator = preference === "comma" ? "." : ",";
    const semanticOffset = [...text.slice(0, caret)].filter((character) =>
      /\d/.test(character) || character === decimalSeparator
    ).length;
    const formatted = formatNumberInputLive(text, preference);
    input.value = formatted;
    if (typeof input.setSelectionRange !== "function") return formatted;
    if (semanticOffset === 0) {
      input.setSelectionRange(0, 0);
      return formatted;
    }
    let semanticCount = 0;
    let nextCaret = formatted.length;
    for (let index = 0; index < formatted.length; index += 1) {
      const character = formatted[index];
      if (/\d/.test(character) || character === decimalSeparator) {
        semanticCount += 1;
      }
      if (semanticCount === semanticOffset) {
        nextCaret = index + 1;
        break;
      }
    }
    input.setSelectionRange(nextCaret, nextCaret);
    return formatted;
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

  function boqAttentionType(boq, referenceDate = new Date()) {
    if (!boq) return "";
    const today = localDay(referenceDate);
    if (!today) return "";
    const status = String(boq.status || "").trim().toLowerCase();

    if (status === "issued" || status === "sent") {
      const expiry = localDay(boq.validUntil);
      if (!expiry) return "";
      const daysUntilExpiry = Math.ceil(
        (expiry.getTime() - today.getTime()) / 86400000,
      );
      if (daysUntilExpiry < 0) return "expired";
      if (daysUntilExpiry <= 7) return "expiring-soon";
      return "";
    }

    if (status === "draft") {
      const updated = validDate(boq.updatedAt);
      if (updated && today.getTime() - updated.getTime() > 14 * 86400000) {
        return "stale-draft";
      }
    }
    return "";
  }

  function localDay(value) {
    if (!value) return null;
    const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = dateOnly
      ? new Date(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
      )
      : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function validDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
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

  function normalizeSearchText(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function matchesSearchQuery(value, query) {
    const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;
    const searchable = normalizeSearchText(value);
    return tokens.every((token) => searchable.includes(token));
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
    formatNumberInputElementLive,
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
    boqAttentionType,
    collectUniqueTextValues,
    matchesSearchQuery,
    reorderItemsWithinCategory,
    reorderValues,
  };
})();
