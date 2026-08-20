(function defineFinancialCalculations() {
  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function safeMargin(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(number, 99.99));
  }

  function activeRounding(options = {}) {
    return options.rounding ?? window.BOQStore?.getSettings?.().rounding ?? "2";
  }

  function roundSelling(value, rounding = "2") {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    if (rounding === "up1000") {
      return Math.ceil((number - 1e-9) / 1000) * 1000;
    }
    if (rounding === "5") return Math.round(number / 5) * 5;
    if (rounding === "0") return Math.round(number);
    return Math.round(number * 100) / 100;
  }

  function calculateItem(item, options = {}) {
    const quantity = safeNumber(item.qty);
    const unitCogs = safeNumber(item.unitCogs);
    const margin = safeMargin(item.margin);
    const calculatedSelling = unitCogs / (1 - margin / 100);
    const override = item.sellingOverride === "" ||
        item.sellingOverride === null || item.sellingOverride === undefined
      ? null
      : Number(item.sellingOverride);
    const unitSellingRaw = Number.isFinite(override) && override >= 0
      ? override
      : calculatedSelling;
    const unitSelling = roundSelling(unitSellingRaw, activeRounding(options));
    const totalCogs = quantity * unitCogs;
    const totalSelling = quantity * unitSelling;
    return {
      quantity,
      unitCogs,
      margin,
      totalCogs,
      unitSellingRaw,
      unitSelling,
      totalSelling,
      marginValue: totalSelling - totalCogs,
      isManualSelling: override !== null && Number.isFinite(override),
    };
  }

  function calculateProductPricing(product, options = {}) {
    const unitCogs = safeNumber(product?.defaultCogs);
    return calculateItem({
      qty: 1,
      unitCogs,
      margin: product?.defaultMargin,
      sellingOverride: unitCogs > 0 ? null : product?.defaultSellingPrice,
    }, options);
  }

  function calculateSummary(items, options = {}) {
    const totals = (Array.isArray(items) ? items : []).reduce(
      (summary, item) => {
        const calculation = calculateItem(item, options);
        summary.totalCogs += calculation.totalCogs;
        summary.totalSelling += calculation.totalSelling;
        return summary;
      },
      { totalCogs: 0, totalSelling: 0 },
    );
    totals.commission = safeNumber(options.commission || 0);
    totals.marginValue = totals.totalSelling - totals.totalCogs -
      totals.commission;
    totals.marginPercent = totals.totalSelling > 0
      ? totals.marginValue / totals.totalSelling * 100
      : 0;
    return totals;
  }

  function calculateCategorySummary(items, category, options = {}) {
    return calculateSummary(
      (Array.isArray(items) ? items : []).filter((item) =>
        String(item.category || "Uncategorized") === category
      ),
      options,
    );
  }

  window.BOQCalculations = {
    calculateItem,
    calculateProductPricing,
    calculateSummary,
    calculateCategorySummary,
    roundSelling,
    safeMargin,
  };
})();
