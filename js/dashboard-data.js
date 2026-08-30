(function defineDashboardData() {
  function dateValue(value) {
    const date = value instanceof Date ? new Date(value) : new Date(value || "");
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function timestamp(value) {
    return dateValue(value)?.getTime() || 0;
  }

  function revisionLabel(number) {
    const value = Math.max(0, Number(number) || 0);
    return value > 0 ? `R${String(value).padStart(2, "0")}` : "";
  }

  function currencyTotals(records, defaultCurrency) {
    const totals = new Map();
    records.forEach((record) => {
      const currency = String(record.currency || defaultCurrency || "IDR")
        .trim().toUpperCase() || "IDR";
      const value = Number(record.customerPoValue || 0);
      totals.set(currency, (totals.get(currency) || 0) +
        (Number.isFinite(value) ? value : 0));
    });
    return [...totals].map(([currency, value]) => ({ currency, value })).sort(
      (left, right) => {
        if (left.currency === defaultCurrency) return -1;
        if (right.currency === defaultCurrency) return 1;
        return left.currency.localeCompare(right.currency);
      },
    );
  }

  function customerPoPeriods(records, options = {}) {
    const reference = dateValue(options.referenceDate) || new Date();
    const year = reference.getFullYear();
    const month = reference.getMonth();
    const thisMonthStart = new Date(year, month, 1);
    const lastMonthStart = new Date(year, month - 1, 1);
    const yearStart = new Date(year, 0, 1);
    const nowEnd = new Date(reference.getTime() + 1);
    const ranges = [
      {
        key: "this-month",
        label: "This month",
        start: thisMonthStart,
        end: nowEnd,
      },
      {
        key: "last-month",
        label: "Last month",
        start: lastMonthStart,
        end: thisMonthStart,
      },
      {
        key: "year-to-date",
        label: "Year to date",
        start: yearStart,
        end: nowEnd,
      },
    ];
    const wonRecords = (Array.isArray(records) ? records : []).filter((record) =>
      record?.status === "Won" && timestamp(record.wonAt)
    );
    return ranges.map((range) => {
      const matches = wonRecords.filter((record) => {
        const value = timestamp(record.wonAt);
        return value >= range.start.getTime() && value < range.end.getTime();
      });
      return {
        key: range.key,
        label: range.label,
        count: matches.length,
        totals: currencyTotals(matches, options.defaultCurrency),
      };
    });
  }

  function recentCustomerPos(records, limit = 4) {
    return (Array.isArray(records) ? records : []).filter((record) =>
      record?.status === "Won" && timestamp(record.wonAt) &&
      String(record.customerPoNumber || "").trim()
    ).sort((left, right) => timestamp(right.wonAt) - timestamp(left.wonAt))
      .slice(0, Math.max(0, Number(limit) || 0));
  }

  function recentActivity(data = {}, limit = 6) {
    const activities = [];
    let sequence = 0;
    const push = (activity) => {
      const value = timestamp(activity.timestamp);
      if (!value) return;
      activities.push({ ...activity, timestampValue: value, sequence: sequence++ });
    };
    const distinctUpdate = (createdAt, updatedAt) =>
      timestamp(updatedAt) - timestamp(createdAt) > 1000;

    (Array.isArray(data.boqs) ? data.boqs : []).forEach((boq) => {
      const reference = [boq.number || "BOQ", boq.projectName || "Untitled project"]
        .filter(Boolean).join(" · ");
      const href = `boq-editor.html?id=${encodeURIComponent(boq.id || "")}`;
      push({
        type: "boq-created",
        title: "BOQ created",
        detail: reference,
        timestamp: boq.createdAt,
        href,
      });
      (Array.isArray(boq.revisions) ? boq.revisions : []).forEach((revision) => {
        if (revision?.state !== "Issued") return;
        const label = revisionLabel(revision.number);
        push({
          type: "boq-issued",
          title: label ? `${label} issued` : "BOQ issued",
          detail: reference,
          timestamp: revision.issuedAt,
          href,
        });
      });
      if (boq.status === "Won") {
        const poNumber = String(boq.customerPoNumber || "").trim();
        push({
          type: "boq-won",
          title: "Customer PO received",
          detail: [poNumber, boq.projectName].filter(Boolean).join(" · "),
          timestamp: boq.wonAt,
          href,
        });
        if (distinctUpdate(boq.wonAt, boq.updatedAt)) {
          push({
            type: "po-updated",
            title: "Customer PO updated",
            detail: [poNumber, boq.projectName].filter(Boolean).join(" · "),
            timestamp: boq.updatedAt,
            href,
          });
        }
      } else if ((boq.status === "Draft" ||
          (boq.workingRevision !== null &&
            boq.workingRevision !== undefined)) &&
          distinctUpdate(boq.createdAt, boq.updatedAt)) {
        const label = revisionLabel(boq.displayRevisionNumber);
        push({
          type: "draft-updated",
          title: label ? `${label} draft updated` : "Draft updated",
          detail: reference,
          timestamp: boq.updatedAt,
          href,
        });
      }
    });

    (Array.isArray(data.products) ? data.products : []).forEach((product) => {
      const href = "products.html";
      push({
        type: "product-created",
        title: "Product added",
        detail: product.name || "Unnamed product",
        timestamp: product.createdAt,
        href,
      });
      if (distinctUpdate(product.createdAt, product.updatedAt)) {
        push({
          type: "product-updated",
          title: "Product updated",
          detail: product.name || "Unnamed product",
          timestamp: product.updatedAt,
          href,
        });
      }
    });

    (Array.isArray(data.customers) ? data.customers : []).forEach((customer) => {
      const href = "customers.html";
      push({
        type: "customer-created",
        title: "Customer added",
        detail: customer.companyName || "Unnamed customer",
        timestamp: customer.createdAt,
        href,
      });
      if (distinctUpdate(customer.createdAt, customer.updatedAt)) {
        push({
          type: "customer-updated",
          title: "Customer updated",
          detail: customer.companyName || "Unnamed customer",
          timestamp: customer.updatedAt,
          href,
        });
      }
    });

    return activities.sort((left, right) =>
      right.timestampValue - left.timestampValue || right.sequence - left.sequence
    ).slice(0, Math.max(0, Number(limit) || 0));
  }

  window.BOQDashboardData = Object.freeze({
    customerPoPeriods,
    recentActivity,
    recentCustomerPos,
  });
})();
