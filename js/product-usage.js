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

  function purchasingUsage(record, revisionNumber) {
    const purchasing = record?.purchasing || {};
    const draft = purchasing.draft;
    const archived = Array.isArray(purchasing.revisions)
      ? purchasing.revisions
      : [];
    const entry = Number(draft?.revisionNumber) === Number(revisionNumber)
      ? draft
      : archived.find((candidate) =>
        Number(candidate?.revisionNumber) === Number(revisionNumber)
      );
    return {
      items: Array.isArray(entry?.items) ? entry.items : [],
      updatedAt: String(entry?.updatedAt || ""),
    };
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
      const recordItems = Array.isArray(record.items) ? record.items : [];
      const boqValue = recordItems.reduce((total, item) =>
          total + calculateItem(item, { rounding }).totalSelling, 0);
      const matchingItems = recordItems.filter((entry) =>
        normalizeItemName(entry?.item) === targetName
      );
      const purchasing = purchasingUsage(record, revisionNumber);
      const matchingSupportingMaterials = purchasing.items.filter((entry) =>
        normalizeItemName(entry?.item) === targetName
      );
      if (!matchingItems.length && !matchingSupportingMaterials.length) return;
      const calculations = matchingItems.map((item) =>
        calculateItem(item, { rounding })
      );
      const calculation = calculations[0] || null;
      const quantity = calculations.reduce((total, itemCalculation) =>
        total + itemCalculation.quantity, 0) +
        matchingSupportingMaterials.reduce((total, item) =>
          total + (Number(item?.qty) || 0), 0);
      const usageType = matchingItems.length && matchingSupportingMaterials.length
        ? "BOQ Item + Supporting Material"
        : matchingItems.length
        ? "BOQ Item"
        : "Supporting Material";
      const updatedAt = timestampValue(purchasing.updatedAt) >
          timestampValue(record.updatedAt)
        ? purchasing.updatedAt
        : String(record.updatedAt || "");
      entries.push({
        boqId: String(record.id || ""),
        boqNumber: String(record.number || ""),
        revisionNumber: Math.max(0, Number(revisionNumber) || 0),
        projectName: String(record.projectName || ""),
        customerName: String(record.customerName || ""),
        status,
        customerPoNumber: String(record.customerPoNumber || ""),
        boqValue,
        quantity,
        usageType,
        currency: String(record.currency || "IDR"),
        unitCogs: calculation?.unitCogs ?? null,
        margin: calculation?.margin ?? null,
        unitSelling: calculation?.unitSelling ?? null,
        totalSelling: calculation?.totalSelling ?? null,
        manualSelling: calculation?.isManualSelling || false,
        updatedAt,
      });
    });

    return entries.sort((left, right) =>
      timestampValue(right.updatedAt) - timestampValue(left.updatedAt) ||
      left.boqNumber.localeCompare(right.boqNumber)
    );
  }

  window.BOQProductUsage = {
    build,
    normalizeItemName,
  };
})();
