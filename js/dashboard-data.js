(function defineDashboardData() {
  function dateValue(value) {
    const date = value instanceof Date ? new Date(value) : new Date(value || "");
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function timestamp(value) {
    return dateValue(value)?.getTime() || 0;
  }

  function recentCustomerPos(records, limit = 4) {
    return (Array.isArray(records) ? records : []).filter((record) =>
      record?.status === "Won" && timestamp(record.wonAt) &&
      String(record.customerPoNumber || "").trim()
    ).sort((left, right) => timestamp(right.wonAt) - timestamp(left.wonAt))
      .slice(0, Math.max(0, Number(limit) || 0));
  }

  window.BOQDashboardData = Object.freeze({
    recentCustomerPos,
  });
})();
