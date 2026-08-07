(function defineFinancialCalculations() {
  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function calculateItem(item) {
    const quantity = safeNumber(item.qty);
    const unitCogs = safeNumber(item.unitCogs);
    const margin = safeNumber(item.margin);
    const totalCogs = quantity * unitCogs;
    const unitSelling = unitCogs * (1 + margin / 100);
    const totalSelling = quantity * unitSelling;
    return {
      totalCogs,
      unitSelling,
      totalSelling,
      marginValue: totalSelling - totalCogs,
    };
  }

  function calculateSummary(items) {
    const totals = items.reduce((summary, item) => {
      const calculation = calculateItem(item);
      summary.totalCogs += calculation.totalCogs;
      summary.totalSelling += calculation.totalSelling;
      return summary;
    }, { totalCogs: 0, totalSelling: 0 });

    totals.marginValue = totals.totalSelling - totals.totalCogs;
    totals.marginPercent = totals.totalCogs > 0
      ? (totals.marginValue / totals.totalCogs) * 100
      : 0;
    return totals;
  }

  window.BOQCalculations = { calculateItem, calculateSummary };
})();
