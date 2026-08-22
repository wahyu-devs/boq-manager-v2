(function defineCustomerDocument() {
  const palette = {
    ink: "202832",
    body: "202832",
    company: "2D6089",
    heading: "2D6089",
    muted: "697582",
    note: "697582",
    footer: "8A96A2",
    primary: "356F9E",
    primarySoft: "E9F1F7",
    surface: "F5F7F9",
    tableHead: "356F9E",
    tableHeadText: "FFFFFF",
    border: "DCE2E8",
    white: "FFFFFF",
    banner: "9A641C",
  };

  const layout = {
    pageMarginMm: 9,
    tableWidthMm: 192,
    tableCellPaddingMm: 2.1,
    totalColumnWidthMm: 31,
  };

  function colorRgb(name) {
    const value = palette[name] || name;
    return value.match(/.{2}/g).map((part) => Number.parseInt(part, 16));
  }

  function revisionLabel(documentValue) {
    return window.BOQUtils.visibleRevisionLabel(documentValue.revisionLabel);
  }

  function documentReference(documentValue) {
    return [documentValue.number || "BOQ", revisionLabel(documentValue)]
      .filter(Boolean).join(" · ");
  }

  function documentBanner(documentValue) {
    if (documentValue.revisionState === "Draft") return "DRAFT - NOT ISSUED";
    if (documentValue.revisionState === "Voided") return "VOIDED REVISION";
    return "FOR CUSTOMER";
  }

  function visibility(settings = {}) {
    const showPricing = settings.showPricing !== false;
    return {
      showPricing,
      showSku: settings.showSku === true,
      showUnitPricing: showPricing && settings.showUnitPricing !== false,
    };
  }

  function columns(settings = {}) {
    const display = visibility(settings);
    const values = [
      { key: "index", label: "No", align: "center", widthMm: 8 },
    ];
    if (display.showSku) {
      values.push({ key: "sku", label: "Part Number", widthMm: 23 });
    }
    values.push(
      { key: "item", label: "Item" },
      { key: "qty", label: "Qty", align: "right", widthMm: 13 },
      { key: "unit", label: "Unit", align: "center", widthMm: 16 },
    );
    if (display.showUnitPricing) {
      values.push({
        key: "unitSelling",
        label: "Unit Price",
        align: "right",
        widthMm: 27,
      });
    }
    if (display.showPricing) {
      values.push({
        key: "totalSelling",
        label: "Total",
        align: "right",
        widthMm: layout.totalColumnWidthMm,
      });
    }
    const fixedWidth = values.reduce(
      (sum, column) => sum + Number(column.widthMm || 0),
      0,
    );
    values.find((column) => column.key === "item").widthMm =
      layout.tableWidthMm - fixedWidth;
    return values;
  }

  function filename(data, safeFilename, extension, descriptors = []) {
    const basename = [
      data.document.number,
      data.document.projectName,
      ...descriptors,
      revisionLabel(data.document),
    ].filter(Boolean).map(safeFilename).join(" - ") || "BOQ";
    return `${basename}.${extension}`;
  }

  window.BOQCustomerDocument = {
    palette,
    layout,
    colorRgb,
    revisionLabel,
    documentReference,
    documentBanner,
    visibility,
    columns,
    filename,
  };
})();
