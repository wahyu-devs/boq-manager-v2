(function defineExcelExport() {
  const COLORS = {
    ink: "FF202832",
    muted: "FF697582",
    primary: "FF356F9E",
    primaryDark: "FF2D6089",
    primarySoft: "FFE9F1F7",
    surface: "FFF5F7F9",
    border: "FFDCE2E8",
    borderStrong: "FFC8D1DA",
    highlight: "FFE9F1F7",
    input: "FFEFF2F5",
    white: "FFFFFFFF",
  };
  const FONT = "Arial";
  const HEADER_LOGO_WIDTH = 144;
  const HEADER_LOGO_HEIGHT = 64;

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

  function columnLetter(index) {
    let number = index;
    let result = "";
    while (number > 0) {
      number -= 1;
      result = String.fromCharCode(65 + number % 26) + result;
      number = Math.floor(number / 26);
    }
    return result;
  }

  function itemCategory(item) {
    return item.category || "Uncategorized";
  }

  function orderedExportData(data) {
    const items = Array.isArray(data.items) ? data.items : [];
    const requestedCategories = Array.isArray(data.categories)
      ? data.categories
      : [];
    const presentCategories = [...new Set(items.map(itemCategory))];
    const categories = [
      ...requestedCategories.filter((category, index) =>
        presentCategories.includes(category) &&
        requestedCategories.indexOf(category) === index
      ),
      ...presentCategories.filter((category) =>
        !requestedCategories.includes(category)
      ),
    ];
    return {
      ...data,
      categories,
      items: categories.flatMap((category) =>
        items.filter((item) => itemCategory(item) === category)
      ),
    };
  }

  function currencyFormat(currency) {
    const symbols = { USD: "$", EUR: "€", GBP: "£", IDR: "Rp" };
    const symbol = String(symbols[currency] || currency).replaceAll('"', '""');
    const number = currency === "IDR" ? "#,##0" : "#,##0.00";
    const zero = currency === "IDR" ? "0" : "0.00";
    return `"${symbol}"* ${number};"${symbol}"* -${number};"${symbol}"* ${zero}`;
  }

  function excelDate(value) {
    if (!value) return "-";
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return value;
    const date = new Date(Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      12,
    ));
    return Number.isNaN(date.getTime()) ? value : date;
  }

  function thinBottomBorder() {
    return {
      bottom: { style: "thin", color: { argb: COLORS.border } },
    };
  }

  function inputCellBorder() {
    const edge = { style: "thin", color: { argb: COLORS.borderStrong } };
    return { top: edge, right: edge, bottom: edge, left: edge };
  }

  function setCell(cell, value, options = {}) {
    cell.value = value;
    cell.font = {
      name: FONT,
      size: options.size || 10,
      bold: Boolean(options.bold),
      color: { argb: options.color || COLORS.ink },
    };
    const accountingFormat = String(options.numFmt || "").includes("* ");
    cell.alignment = {
      vertical: options.vertical || "middle",
      wrapText: options.wrap !== false,
    };
    if (!accountingFormat) {
      cell.alignment.horizontal = options.align || "left";
    }
    if (options.fill) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: options.fill },
      };
    }
    if (options.border) cell.border = options.border;
    if (options.numFmt) cell.numFmt = options.numFmt;
  }

  function mergeValue(sheet, range, value, options = {}) {
    sheet.mergeCells(range);
    setCell(sheet.getCell(range.split(":")[0]), value, options);
  }

  function prepareWorkbookLogo(settings) {
    const source = String(settings.companyLogo || "");
    const match = source.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
    if (!match || typeof window.Image !== "function") {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const image = new window.Image();
      image.onload = () => {
        const width = Number(image.naturalWidth || image.width);
        const height = Number(image.naturalHeight || image.height);
        if (!width || !height) {
          resolve(null);
          return;
        }
        resolve({
          source,
          extension: match[1].toLowerCase() === "png" ? "png" : "jpeg",
          width,
          height,
        });
      };
      image.onerror = () => resolve(null);
      image.src = source;
    });
  }

  function fittedLogoSize(logo, maxWidth, maxHeight) {
    const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height);
    return {
      width: Math.max(1, Math.round(logo.width * scale * 100) / 100),
      height: Math.max(1, Math.round(logo.height * scale * 100) / 100),
    };
  }

  function columnPixelWidth(sheet, columnIndex) {
    const width = Number(sheet.getColumn(columnIndex).width || 8.43);
    return Math.max(1, Math.floor(width * 7 + 5));
  }

  function rowPixelHeight(sheet, rowIndex) {
    const height = Number(
      sheet.getRow(rowIndex).height || sheet.properties.defaultRowHeight || 15,
    );
    return Math.max(1, height * 4 / 3);
  }

  function addWorkbookLogo(workbook, sheet, logo, options = {}) {
    if (!logo) return false;
    try {
      const imageId = workbook.addImage({
        base64: logo.source,
        extension: logo.extension,
      });
      const maxWidth = options.width || 58;
      const maxHeight = options.height || 42;
      const size = fittedLogoSize(logo, maxWidth, maxHeight);
      const baseCol = options.col ?? 0.15;
      const baseRow = options.row ?? 0.2;
      const colOffset = (maxWidth - size.width) / 2 /
        columnPixelWidth(sheet, Math.floor(baseCol) + 1);
      const rowOffset = (maxHeight - size.height) / 2 /
        rowPixelHeight(sheet, Math.floor(baseRow) + 1);
      sheet.addImage(imageId, {
        tl: { col: baseCol + colOffset, row: baseRow + rowOffset },
        ext: size,
      });
      return true;
    } catch (_error) {
      return false;
    }
  }

  function configureSheet(sheet, options = {}) {
    sheet.properties.defaultRowHeight = 18;
    sheet.views = [{
      state: "frozen",
      xSplit: options.freezeColumns || 0,
      ySplit: options.freezeRows || 0,
      showGridLines: false,
    }];
    sheet.pageSetup = {
      paperSize: 9,
      orientation: options.orientation || "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.45,
        bottom: 0.55,
        header: 0.2,
        footer: 0.25,
      },
    };
  }

  function companyDetails(settings) {
    return [
      settings.registrationNumber
        ? `Registration no.: ${settings.registrationNumber}`
        : "",
      settings.address,
      [settings.email, settings.phone].filter(Boolean).join(" | "),
    ].filter(Boolean).join("\n");
  }

  function quotationColumns(settings) {
    const columns = [{ key: "index", header: "No", width: 7, align: "center" }];
    if (settings.showSku === true) {
      columns.push({ key: "sku", header: "Part Number", width: 18 });
    }
    columns.push(
      { key: "item", header: "Item", width: 42 },
      { key: "qty", header: "Qty", width: 10, align: "right" },
      { key: "unit", header: "Unit", width: 12, align: "center" },
    );
    if (settings.showUnitPricing !== false) {
      columns.push({
        key: "unitSelling",
        header: "Unit Price",
        width: 18,
        align: "right",
        money: true,
      });
    }
    columns.push({
      key: "totalSelling",
      header: "Total",
      width: 20,
      align: "right",
      money: true,
    });
    return columns;
  }

  function styleTableHeader(sheet, rowNumber, columnCount) {
    const row = sheet.getRow(rowNumber);
    row.height = 24;
    for (let column = 1; column <= columnCount; column += 1) {
      setCell(row.getCell(column), row.getCell(column).value, {
        bold: true,
        color: COLORS.white,
        fill: COLORS.primary,
        align: "center",
        size: 9,
      });
    }
  }

  function styleCategoryRow(sheet, rowNumber, columnCount) {
    sheet.mergeCells(rowNumber, 1, rowNumber, columnCount);
    const row = sheet.getRow(rowNumber);
    row.height = 21;
    setCell(row.getCell(1), row.getCell(1).value, {
      bold: true,
      fill: COLORS.primarySoft,
      color: COLORS.primaryDark,
      size: 9,
    });
    row.getCell(1).border = {
      top: { style: "thin", color: { argb: COLORS.border } },
      bottom: { style: "thin", color: { argb: COLORS.border } },
    };
  }

  function addQuotationHeader(workbook, sheet, data, columnCount, logo) {
    const lastColumn = columnLetter(columnCount);
    const hasLogo = addWorkbookLogo(workbook, sheet, logo, {
      col: 0.05,
      row: 0.05,
      width: HEADER_LOGO_WIDTH,
      height: HEADER_LOGO_HEIGHT,
    });
    const splitColumn = Math.max(3, columnCount - 2);
    const splitLetter = columnLetter(splitColumn);
    const rightStart = columnLetter(splitColumn + 1);
    const companyNameRange = hasLogo
      ? `A3:${splitLetter}3`
      : `A1:${splitLetter}1`;
    const companyDetailsRange = hasLogo
      ? `A4:${splitLetter}4`
      : `A2:${splitLetter}3`;

    mergeValue(
      sheet,
      companyNameRange,
      data.settings.companyName || "Company information not configured",
      { bold: true, color: COLORS.primaryDark, size: 15 },
    );
    mergeValue(
      sheet,
      companyDetailsRange,
      companyDetails(data.settings),
      { color: COLORS.muted, size: 8, vertical: "top" },
    );
    mergeValue(sheet, `${rightStart}1:${lastColumn}1`, "BILL OF QUANTITIES", {
      bold: true,
      color: COLORS.primaryDark,
      size: 14,
      align: "right",
    });
    mergeValue(
      sheet,
      `${rightStart}2:${lastColumn}2`,
      documentReference(data.document),
      { bold: true, size: 10, align: "right" },
    );
    mergeValue(
      sheet,
      `${rightStart}3:${lastColumn}3`,
      documentBanner(data.document),
      {
        bold: true,
        color: "FF9A641C",
        size: 8,
        align: "right",
      },
    );
    sheet.getRow(1).height = hasLogo ? 30 : 25;
    sheet.getRow(2).height = hasLogo ? 24 : 18;
    sheet.getRow(3).height = hasLogo ? 22 : 24;
    if (hasLogo) sheet.getRow(4).height = 34;
    sheet.getRow(5).height = 4;
    for (let column = 1; column <= columnCount; column += 1) {
      sheet.getRow(5).getCell(column).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.primary },
      };
    }

    const customerEnd = Math.max(2, Math.floor(columnCount * 0.34));
    const dateStart = Math.max(customerEnd + 2, columnCount - 1);
    const projectStart = customerEnd + 1;
    const projectEnd = dateStart - 1;
    const customerRange = `A6:${columnLetter(customerEnd)}6`;
    const customerValueRange = `A7:${columnLetter(customerEnd)}8`;
    const projectRange = `${columnLetter(projectStart)}6:${
      columnLetter(projectEnd)
    }6`;
    const projectValueRange = `${columnLetter(projectStart)}7:${
      columnLetter(projectEnd)
    }8`;
    const dateRange = `${columnLetter(dateStart)}6:${lastColumn}6`;
    const dateValueRange = `${columnLetter(dateStart)}7:${lastColumn}8`;

    mergeValue(sheet, customerRange, "PREPARED FOR", {
      bold: true,
      color: COLORS.muted,
      fill: COLORS.surface,
      size: 8,
    });
    mergeValue(
      sheet,
      customerValueRange,
      data.document.customerName || "-",
      { bold: true, fill: COLORS.surface, size: 10, vertical: "top" },
    );
    mergeValue(sheet, projectRange, "PROJECT", {
      bold: true,
      color: COLORS.muted,
      fill: COLORS.surface,
      size: 8,
    });
    mergeValue(
      sheet,
      projectValueRange,
      data.document.projectName || "-",
      { bold: true, fill: COLORS.surface, size: 10, vertical: "top" },
    );
    mergeValue(sheet, dateRange, "ISSUED / VALID UNTIL", {
      bold: true,
      color: COLORS.muted,
      fill: COLORS.surface,
      size: 8,
    });
    const dateCell = sheet.getCell(`${columnLetter(dateStart)}7`);
    sheet.mergeCells(dateValueRange);
    dateCell.value = `${data.document.date || "-"}\n${
      data.document.validUntil || "-"
    }`;
    setCell(dateCell, dateCell.value, {
      fill: COLORS.surface,
      size: 9,
      vertical: "top",
    });
    sheet.getRow(7).height = 18;
    sheet.getRow(8).height = 20;
  }

  function addQuotationSheet(workbook, data, targetSheet, logo, costing) {
    const { calculateItem } = window.BOQCalculations;
    const columns = quotationColumns(data.settings);
    const sheet = targetSheet || workbook.addWorksheet("BOQ");
    configureSheet(sheet, { freezeRows: 10, orientation: "portrait" });
    sheet.columns = columns.map((column) => ({ width: column.width }));
    addQuotationHeader(workbook, sheet, data, columns.length, logo);

    const headerRow = 10;
    sheet.getRow(headerRow).values = columns.map((column) => column.header);
    styleTableHeader(sheet, headerRow, columns.length);
    let rowNumber = headerRow;
    let itemIndex = 0;
    const itemRows = [];
    const moneyFormat = currencyFormat(data.document.currency);

    data.categories.forEach((category) => {
      rowNumber += 1;
      sheet.getCell(rowNumber, 1).value = category;
      styleCategoryRow(sheet, rowNumber, columns.length);
      data.items.filter((item) => itemCategory(item) === category).forEach(
        (item) => {
          rowNumber += 1;
          itemIndex += 1;
          itemRows.push(rowNumber);
          const calculation = calculateItem(item, {
            rounding: data.settings.rounding,
          });
          const values = {
            index: itemIndex,
            sku: item.sku || "",
            item: item.item,
            qty: calculation.quantity,
            unit: item.unit,
            unitSelling: calculation.unitSelling,
            totalSelling: calculation.totalSelling,
          };
          columns.forEach((column, columnIndex) => {
            const cell = sheet.getCell(rowNumber, columnIndex + 1);
            if (column.key === "totalSelling") {
              const quantityColumn = columnLetter(
                columns.findIndex((entry) => entry.key === "qty") + 1,
              );
              const unitSellingColumn = columnLetter(
                columns.findIndex((entry) => entry.key === "unitSelling") + 1,
              );
              if (data.settings.showUnitPricing !== false) {
                cell.value = {
                  formula:
                    `${quantityColumn}${rowNumber}*${unitSellingColumn}${rowNumber}`,
                  result: calculation.totalSelling,
                };
              } else {
                cell.value = calculation.totalSelling;
              }
            } else if (column.key === "unitSelling" &&
              costing?.itemRows?.[itemIndex - 1]) {
              cell.value = {
                formula: `='Costing'!I${costing.itemRows[itemIndex - 1]}`,
                result: calculation.unitSelling,
              };
            } else {
              cell.value = values[column.key];
            }
            setCell(cell, cell.value, {
              align: column.align,
              border: thinBottomBorder(),
              numFmt: column.money ? moneyFormat : undefined,
              size: 9,
            });
          });
          sheet.getRow(rowNumber).height = 20;
        },
      );
    });

    if (!itemRows.length) {
      rowNumber += 1;
      mergeValue(
        sheet,
        `A${rowNumber}:${columnLetter(columns.length)}${rowNumber}`,
        "No BOQ items",
        { color: COLORS.muted, fill: COLORS.surface, size: 9 },
      );
      sheet.getRow(rowNumber).height = 28;
    }

    rowNumber += 2;
    const totalColumn = columnLetter(columns.length);
    const totalLabelStart = columnLetter(Math.max(1, columns.length - 2));
    mergeValue(
      sheet,
      `${totalLabelStart}${rowNumber}:${
        columnLetter(columns.length - 1)
      }${rowNumber}`,
      "GRAND TOTAL",
      {
        bold: true,
        fill: COLORS.highlight,
        color: COLORS.primaryDark,
        align: "right",
        size: 10,
      },
    );
    const totalCell = sheet.getCell(`${totalColumn}${rowNumber}`);
    totalCell.value = itemRows.length
      ? {
        formula: `SUM(${totalColumn}${itemRows[0]}:${totalColumn}${
          itemRows.at(-1)
        })`,
        result: data.document.totalSelling,
      }
      : 0;
    setCell(totalCell, totalCell.value, {
      bold: true,
      fill: COLORS.highlight,
      color: COLORS.primaryDark,
      align: "right",
      size: 12,
      numFmt: moneyFormat,
    });
    sheet.getRow(rowNumber).height = 27;

    if (data.document.notes) {
      rowNumber += 2;
      mergeValue(
        sheet,
        `A${rowNumber}:${columnLetter(columns.length)}${rowNumber}`,
        "TERMS / NOTES",
        { bold: true, color: COLORS.muted, size: 8 },
      );
      rowNumber += 1;
      mergeValue(
        sheet,
        `A${rowNumber}:${columnLetter(columns.length)}${rowNumber + 1}`,
        data.document.notes,
        {
          color: COLORS.muted,
          fill: COLORS.surface,
          size: 9,
          vertical: "top",
        },
      );
      sheet.getRow(rowNumber).height = 22;
      sheet.getRow(rowNumber + 1).height = 22;
      rowNumber += 1;
    }

    const footerText = String(data.settings.footerText || "").trim();
    if (footerText) {
      rowNumber += 2;
      mergeValue(
        sheet,
        `A${rowNumber}:${columnLetter(columns.length)}${rowNumber}`,
        footerText,
        {
          color: COLORS.muted,
          size: 8,
          align: "center",
          border: {
            top: { style: "thin", color: { argb: COLORS.border } },
          },
        },
      );
    }
    sheet.pageSetup.printArea = `A1:${
      columnLetter(columns.length)
    }${rowNumber}`;
    sheet.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
    sheet.headerFooter.oddFooter = `&L${
      documentReference(data.document)
    }&RPage &P of &N`;
    return sheet;
  }

  function roundingFormula(expression, rounding) {
    if (rounding === "up1000") return `CEILING(${expression},1000)`;
    if (rounding === "5") return `ROUND(${expression}/5,0)*5`;
    if (rounding === "0") return `ROUND(${expression},0)`;
    return `ROUND(${expression},2)`;
  }

  function addCostingSheet(workbook, data, targetSheet) {
    const { calculateItem, calculateSummary } = window.BOQCalculations;
    const sheet = targetSheet || workbook.addWorksheet("Costing");
    configureSheet(sheet, {
      freezeRows: 5,
      freezeColumns: 3,
      orientation: "landscape",
    });
    sheet.columns = [
      { width: 7 },
      { width: 18 },
      { width: 34 },
      { width: 20 },
      { width: 10 },
      { width: 11 },
      { width: 18 },
      { width: 13 },
      { width: 18 },
      { width: 19 },
      { width: 20 },
      { width: 18, hidden: true },
    ];
    sheet.getColumn(12).hidden = true;
    mergeValue(sheet, "A1:H1", "COSTING WORKSHEET", {
      bold: true,
      color: COLORS.primaryDark,
      size: 15,
    });
    mergeValue(
      sheet,
      "A2:H2",
      `${documentReference(data.document)} | ${data.document.projectName || "-"}`,
      { bold: true, size: 10 },
    );
    mergeValue(
      sheet,
      "A3:H3",
      "Input cells use neutral shading. Calculated values use blue shading.",
      { color: COLORS.muted, size: 8 },
    );
    mergeValue(sheet, "I1:K1", "INTERNAL - NOT FOR CUSTOMER", {
      bold: true,
      color: "FF9A641C",
      size: 9,
      align: "right",
    });
    mergeValue(sheet, "I2:K2", `Currency: ${data.document.currency}`, {
      color: COLORS.muted,
      size: 9,
      align: "right",
    });
    sheet.getRow(1).height = 25;
    sheet.getRow(3).height = 22;

    const headers = [
      "No",
      "Part Number",
      "Item",
      "Category",
      "Qty",
      "Unit",
      "Unit COGS",
      "Margin %",
      "Unit Selling",
      "Total COGS",
      "Total Selling",
      "Selling Override",
    ];
    sheet.getRow(5).values = headers;
    styleTableHeader(sheet, 5, headers.length);
    const moneyFormat = currencyFormat(data.document.currency);
    const firstDataRow = 6;
    let rowNumber = 5;
    const itemRows = [];

    data.items.forEach((item, index) => {
      rowNumber += 1;
      itemRows.push(rowNumber);
      const calculation = calculateItem(item, {
        rounding: data.settings.rounding,
      });
      const manualOverride = calculation.isManualSelling
        ? Number(item.sellingOverride)
        : null;
      const baseExpression =
        `IF(L${rowNumber}<>"",L${rowNumber},IFERROR(G${rowNumber}/(1-H${rowNumber}),0))`;
      const unitSellingFormula = roundingFormula(
        baseExpression,
        data.settings.rounding || "2",
      );
      const values = [
        index + 1,
        item.sku || "",
        item.item,
        item.category || "Uncategorized",
        calculation.quantity,
        item.unit,
        calculation.unitCogs,
        calculation.margin / 100,
        { formula: unitSellingFormula, result: calculation.unitSelling },
        {
          formula: `E${rowNumber}*G${rowNumber}`,
          result: calculation.totalCogs,
        },
        {
          formula: `E${rowNumber}*I${rowNumber}`,
          result: calculation.totalSelling,
        },
        manualOverride,
      ];
      values.forEach((value, index) => {
        const column = index + 1;
        const isInput = [5, 7, 8, 12].includes(column);
        const isCalculation = [9, 10, 11].includes(column);
        setCell(sheet.getCell(rowNumber, column), value, {
          align: [1, 5, 7, 8, 9, 10, 11, 12].includes(column)
            ? "right"
            : column === 6
            ? "center"
            : "left",
          fill: isInput
            ? COLORS.input
            : isCalculation
            ? COLORS.primarySoft
            : undefined,
          border: isInput ? inputCellBorder() : thinBottomBorder(),
          numFmt: [7, 9, 10, 11, 12].includes(column)
            ? moneyFormat
            : column === 8
            ? "0.0%"
            : undefined,
          size: 9,
        });
      });
      sheet.getRow(rowNumber).height = 20;
    });

    if (!data.items.length) {
      rowNumber += 1;
      mergeValue(sheet, `A${rowNumber}:K${rowNumber}`, "No BOQ items", {
        color: COLORS.muted,
        fill: COLORS.surface,
        size: 9,
      });
    }
    const lastDataRow = rowNumber;
    const summary = calculateSummary(data.items, {
      commission: data.document.commission,
      rounding: data.settings.rounding,
    });
    const totalRow = rowNumber + 2;
    mergeValue(sheet, `A${totalRow}:I${totalRow}`, "TOTALS", {
      bold: true,
      fill: COLORS.highlight,
      color: COLORS.primaryDark,
      align: "right",
      size: 10,
    });
    const cogsTotal = sheet.getCell(`J${totalRow}`);
    cogsTotal.value = data.items.length
      ? {
        formula: `SUM(J${firstDataRow}:J${lastDataRow})`,
        result: summary.totalCogs,
      }
      : 0;
    setCell(cogsTotal, cogsTotal.value, {
      bold: true,
      fill: COLORS.highlight,
      align: "right",
      numFmt: moneyFormat,
    });
    const sellingTotal = sheet.getCell(`K${totalRow}`);
    sellingTotal.value = data.items.length
      ? {
        formula: `SUM(K${firstDataRow}:K${lastDataRow})`,
        result: summary.totalSelling,
      }
      : 0;
    setCell(sellingTotal, sellingTotal.value, {
      bold: true,
      fill: COLORS.highlight,
      align: "right",
      numFmt: moneyFormat,
    });

    const commissionRow = totalRow + 1;
    mergeValue(sheet, `A${commissionRow}:J${commissionRow}`, "Commission", {
      color: COLORS.muted,
      align: "right",
      size: 9,
    });
    setCell(sheet.getCell(`K${commissionRow}`), summary.commission, {
      align: "right",
      numFmt: moneyFormat,
      fill: COLORS.input,
      border: inputCellBorder(),
      size: 9,
    });
    const profitRow = totalRow + 2;
    mergeValue(sheet, `A${profitRow}:J${profitRow}`, "Gross profit", {
      bold: true,
      align: "right",
      size: 9,
    });
    const profitCell = sheet.getCell(`K${profitRow}`);
    profitCell.value = {
      formula: `K${totalRow}-J${totalRow}-K${commissionRow}`,
      result: summary.marginValue,
    };
    setCell(profitCell, profitCell.value, {
      bold: true,
      align: "right",
      numFmt: moneyFormat,
      fill: COLORS.primarySoft,
    });
    const marginRow = totalRow + 3;
    mergeValue(sheet, `A${marginRow}:J${marginRow}`, "Gross margin", {
      bold: true,
      align: "right",
      size: 9,
    });
    const marginCell = sheet.getCell(`K${marginRow}`);
    marginCell.value = {
      formula: `IFERROR(K${profitRow}/K${totalRow},0)`,
      result: summary.marginPercent / 100,
    };
    setCell(marginCell, marginCell.value, {
      bold: true,
      align: "right",
      numFmt: "0.0%",
      fill: COLORS.primarySoft,
    });

    if (data.items.length) sheet.autoFilter = `A5:K${lastDataRow}`;
    sheet.pageSetup.printArea = `A1:K${marginRow}`;
    sheet.pageSetup.printTitlesRow = "5:5";
    sheet.headerFooter.oddFooter = `&LInternal costing&RPage &P of &N`;
    return {
      sheet,
      itemRows,
      totalRow,
      commissionRow,
      profitRow,
      marginRow,
    };
  }

  function addOverviewSheet(workbook, data, costing, targetSheet, logo) {
    const { calculateCategorySummary, calculateSummary } =
      window.BOQCalculations;
    const sheet = targetSheet || workbook.addWorksheet("Overview");
    configureSheet(sheet, { freezeRows: 9, orientation: "portrait" });
    sheet.columns = [
      { width: 20 },
      { width: 12 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 12 },
    ];
    const hasLogo = addWorkbookLogo(workbook, sheet, logo, {
      col: 0.05,
      row: 0.05,
      width: HEADER_LOGO_WIDTH,
      height: HEADER_LOGO_HEIGHT,
    });
    const companyNameRange = hasLogo ? "A3:D3" : "A1:D1";
    const companyDetailsRange = hasLogo ? "A4:D4" : "A2:D3";
    mergeValue(
      sheet,
      companyNameRange,
      data.settings.companyName || "BOQ Manager",
      { bold: true, color: COLORS.primaryDark, size: 15 },
    );
    mergeValue(sheet, companyDetailsRange, companyDetails(data.settings), {
      color: COLORS.muted,
      size: 8,
      vertical: "top",
    });
    mergeValue(sheet, "E1:F1", "ESTIMATION OVERVIEW", {
      bold: true,
      color: COLORS.primaryDark,
      size: 14,
      align: "right",
    });
    mergeValue(sheet, "E2:F2", documentReference(data.document), {
      bold: true,
      size: 10,
      align: "right",
    });
    mergeValue(sheet, "E3:F3", "INTERNAL - NOT FOR CUSTOMER", {
      bold: true,
      color: "FF9A641C",
      size: 8,
      align: "right",
    });
    sheet.getRow(1).height = hasLogo ? 30 : 25;
    sheet.getRow(2).height = hasLogo ? 24 : 18;
    sheet.getRow(3).height = hasLogo ? 22 : 24;
    if (hasLogo) sheet.getRow(4).height = 34;
    sheet.getRow(5).height = 4;
    for (let column = 1; column <= 6; column += 1) {
      sheet.getRow(5).getCell(column).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.primary },
      };
    }
    mergeValue(sheet, "A6:C6", "PROJECT", {
      bold: true,
      color: COLORS.muted,
      fill: COLORS.surface,
      size: 8,
    });
    mergeValue(sheet, "A7:C8", data.document.projectName || "-", {
      bold: true,
      fill: COLORS.surface,
      size: 11,
      vertical: "top",
    });
    mergeValue(sheet, "D6:F6", "CUSTOMER", {
      bold: true,
      color: COLORS.muted,
      fill: COLORS.surface,
      size: 8,
    });
    mergeValue(sheet, "D7:F8", data.document.customerName || "-", {
      bold: true,
      fill: COLORS.surface,
      size: 11,
      vertical: "top",
    });

    mergeValue(sheet, "A10:D10", "COMMERCIAL SUMMARY", {
      bold: true,
      color: COLORS.white,
      fill: COLORS.primary,
      size: 9,
    });
    mergeValue(sheet, "E10:F10", "DOCUMENT DETAILS", {
      bold: true,
      color: COLORS.white,
      fill: COLORS.primary,
      size: 9,
    });
    const summary = calculateSummary(data.items, {
      commission: data.document.commission,
      rounding: data.settings.rounding,
    });
    const summaryRows = [
      ["Total selling", `'Costing'!K${costing.totalRow}`, summary.totalSelling],
      ["Total COGS", `'Costing'!J${costing.totalRow}`, summary.totalCogs],
      ["Commission", `'Costing'!K${costing.commissionRow}`, summary.commission],
      ["Gross profit", `'Costing'!K${costing.profitRow}`, summary.marginValue],
      [
        "Gross margin",
        `'Costing'!K${costing.marginRow}`,
        summary.marginPercent / 100,
      ],
    ];
    const moneyFormat = currencyFormat(data.document.currency);
    summaryRows.forEach(([label, reference, result], index) => {
      const row = 11 + index;
      mergeValue(sheet, `A${row}:B${row}`, label, {
        bold: index === 0 || index === 3,
        color: index === 0 ? COLORS.primaryDark : COLORS.muted,
        fill: index === 0 ? COLORS.highlight : COLORS.surface,
        size: 9,
      });
      mergeValue(sheet, `C${row}:D${row}`, {
        formula: `=${reference}`,
        result,
      }, {
        bold: index === 0 || index >= 3,
        fill: index === 0 ? COLORS.highlight : COLORS.surface,
        color: COLORS.primaryDark,
        align: "right",
        numFmt: index === 4 ? "0.0%" : moneyFormat,
        size: index === 0 ? 12 : 9,
      });
      sheet.getRow(row).height = index === 0 ? 25 : 20;
    });

    const details = [
      ["Status", data.document.status || "Draft"],
      ["Revision", revisionLabel(data.document) || "—"],
      ["Date", excelDate(data.document.date)],
      ["Valid until", excelDate(data.document.validUntil)],
      ["Currency", data.document.currency],
      ["Line items", data.items.length],
    ];
    details.forEach(([label, value], index) => {
      const row = 11 + index;
      setCell(sheet.getCell(`E${row}`), label, {
        color: COLORS.muted,
        fill: COLORS.surface,
        size: 9,
      });
      setCell(sheet.getCell(`F${row}`), value, {
        bold: true,
        fill: COLORS.surface,
        align: "right",
        numFmt: value instanceof Date ? "dd mmm yyyy" : undefined,
        size: 9,
      });
    });

    mergeValue(sheet, "A18:F18", "CATEGORY BREAKDOWN", {
      bold: true,
      color: COLORS.white,
      fill: COLORS.primary,
      size: 9,
    });
    const categoryHeaderRow = 19;
    const categoryHeaders = [
      "Category",
      "Line Items",
      "Total COGS",
      "Total Selling",
      "Gross Profit",
      "Margin %",
    ];
    sheet.getRow(categoryHeaderRow).values = categoryHeaders;
    styleTableHeader(sheet, categoryHeaderRow, 6);
    const costingFirstRow = 6;
    const costingLastRow = Math.max(
      costingFirstRow,
      costingFirstRow + data.items.length - 1,
    );
    let categoryRow = categoryHeaderRow;
    data.categories.forEach((category) => {
      categoryRow += 1;
      const categorySummary = calculateCategorySummary(data.items, category, {
        rounding: data.settings.rounding,
      });
      setCell(sheet.getCell(`A${categoryRow}`), category, {
        border: thinBottomBorder(),
        size: 9,
      });
      setCell(sheet.getCell(`B${categoryRow}`), {
        formula:
          `COUNTIF('Costing'!$D$${costingFirstRow}:$D$${costingLastRow},A${categoryRow})`,
        result: data.items.filter((item) => item.category === category).length,
      }, { align: "right", border: thinBottomBorder(), size: 9 });
      setCell(sheet.getCell(`C${categoryRow}`), {
        formula:
          `SUMIF('Costing'!$D$${costingFirstRow}:$D$${costingLastRow},A${categoryRow},'Costing'!$J$${costingFirstRow}:$J$${costingLastRow})`,
        result: categorySummary.totalCogs,
      }, {
        align: "right",
        border: thinBottomBorder(),
        numFmt: moneyFormat,
        size: 9,
      });
      setCell(sheet.getCell(`D${categoryRow}`), {
        formula:
          `SUMIF('Costing'!$D$${costingFirstRow}:$D$${costingLastRow},A${categoryRow},'Costing'!$K$${costingFirstRow}:$K$${costingLastRow})`,
        result: categorySummary.totalSelling,
      }, {
        align: "right",
        border: thinBottomBorder(),
        numFmt: moneyFormat,
        size: 9,
      });
      setCell(sheet.getCell(`E${categoryRow}`), {
        formula: `D${categoryRow}-C${categoryRow}`,
        result: categorySummary.marginValue,
      }, {
        align: "right",
        border: thinBottomBorder(),
        numFmt: moneyFormat,
        size: 9,
      });
      setCell(sheet.getCell(`F${categoryRow}`), {
        formula: `IFERROR(E${categoryRow}/D${categoryRow},0)`,
        result: categorySummary.marginPercent / 100,
      }, {
        align: "right",
        border: thinBottomBorder(),
        numFmt: "0.0%",
        size: 9,
      });
      sheet.getRow(categoryRow).height = 20;
    });
    if (!data.categories.length) {
      categoryRow += 1;
      mergeValue(sheet, `A${categoryRow}:F${categoryRow}`, "No BOQ items", {
        color: COLORS.muted,
        fill: COLORS.surface,
        size: 9,
      });
    }
    sheet.pageSetup.printArea = `A1:F${categoryRow}`;
    sheet.headerFooter.oddFooter = `&LBOQ Manager - Internal&RPage &P of &N`;
    return sheet;
  }

  async function download(data, mode, downloadBlob, safeFilename) {
    data = orderedExportData(data);
    const workbook = new window.ExcelJS.Workbook();
    const logo = await prepareWorkbookLogo(data.settings);
    const projectName = data.document.projectName || "Bill of Quantities";
    workbook.creator = "BOQ Manager";
    workbook.lastModifiedBy = "BOQ Manager";
    workbook.company = data.settings.companyName || "";
    workbook.title = `${documentReference(data.document)} - ${projectName}`;
    workbook.subject = mode === "all"
      ? "BOQ estimation workbook"
      : "Customer BOQ";
    workbook.description = "Exported from BOQ Manager";
    workbook.created = new Date();
    workbook.modified = new Date();

    if (mode === "all") {
      const overviewSheet = workbook.addWorksheet("Overview");
      const quotationSheet = workbook.addWorksheet("BOQ");
      const costingSheet = workbook.addWorksheet("Costing");
      const costing = addCostingSheet(workbook, data, costingSheet);
      addOverviewSheet(workbook, data, costing, overviewSheet, logo);
      addQuotationSheet(workbook, data, quotationSheet, logo, costing);
    } else {
      addQuotationSheet(workbook, data, undefined, logo);
    }

    workbook.calcProperties.fullCalcOnLoad = true;
    workbook.calcProperties.forceFullCalc = true;
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = [
      data.document.number,
      revisionLabel(data.document),
      data.document.projectName,
    ]
      .filter(Boolean).map(safeFilename).join(" - ") || "BOQ";
    const suffix = mode === "all" ? "" : " - Quotation";
    downloadBlob(
      new Blob([buffer], {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `${filename}${suffix}.xlsx`,
    );
  }

  window.BOQExcelExport = { download };
})();
