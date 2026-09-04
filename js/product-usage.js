(function defineProductUsage() {
  function normalizeItemName(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function timestampValue(value) {
    const timestamp = new Date(value || 0).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function activeRevision(record, latestIssuedRevision) {
    const revisionNumber = record?.activeRevisionNumber;
    const revisions = Array.isArray(record?.revisions) ? record.revisions : [];
    return revisions.find((revision) =>
      Number(revision?.number) === Number(revisionNumber) &&
      ["Issued", "Sent"].includes(revision?.state)
    ) || latestIssuedRevision?.(record) || null;
  }

  function build(productName, boqs, options = {}) {
    const targetName = normalizeItemName(productName);
    if (!targetName) return [];

    const registerBoqView = options.registerBoqView ||
      window.BOQStore?.registerBoqView || ((record) => record);
    const latestIssuedRevision = options.latestIssuedRevision ||
      window.BOQStore?.latestIssuedRevision;
    const calculateItem = options.calculateItem ||
      window.BOQCalculations?.calculateItem;
    const defaultRounding = options.defaultRounding ||
      window.BOQStore?.getSettings?.().rounding || "2";
    if (typeof calculateItem !== "function") return [];

    const entries = [];
    (Array.isArray(boqs) ? boqs : []).forEach((sourceRecord) => {
      const record = registerBoqView(sourceRecord);
      if (!record) return;
      const status = ["Draft", "Issued", "Won"].includes(record.status)
        ? record.status
        : "Draft";
      const revision = status === "Draft"
        ? null
        : activeRevision(record, latestIssuedRevision);
      const rounding = revision?.calculation?.rounding || defaultRounding;
      const revisionNumber = record.displayRevisionNumber ??
        record.workingRevision ?? record.activeRevisionNumber ?? 0;
      const boqValue = (Array.isArray(record.items) ? record.items : [])
        .reduce((total, item) =>
          total + calculateItem(item, { rounding }).totalSelling, 0);

      (Array.isArray(record.items) ? record.items : []).forEach(
        (item, itemIndex) => {
          if (normalizeItemName(item?.item) !== targetName) return;
          const calculation = calculateItem(item, { rounding });
          entries.push({
            boqId: String(record.id || ""),
            boqNumber: String(record.number || ""),
            revisionNumber: Math.max(0, Number(revisionNumber) || 0),
            projectName: String(record.projectName || ""),
            customerName: String(record.customerName || ""),
            status,
            customerPoNumber: String(record.customerPoNumber || ""),
            boqValue,
            currency: String(record.currency || "IDR"),
            quantity: calculation.quantity,
            unit: String(item?.unit || ""),
            unitCogs: calculation.unitCogs,
            margin: calculation.margin,
            unitSelling: calculation.unitSelling,
            totalSelling: calculation.totalSelling,
            manualSelling: calculation.isManualSelling,
            updatedAt: String(record.updatedAt || ""),
            itemIndex,
          });
        },
      );
    });

    return entries.sort((left, right) =>
      timestampValue(right.updatedAt) - timestampValue(left.updatedAt) ||
      left.boqNumber.localeCompare(right.boqNumber) ||
      left.itemIndex - right.itemIndex
    );
  }

  window.BOQProductUsage = {
    build,
    normalizeItemName,
  };
})();
