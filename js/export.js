(function initializeDocumentExports() {
  if (!document.querySelector("[data-boq-editor]")) return;

  const { formatCurrency, formatNumber, formatPercent } = window.BOQUtils;
  const { calculateItem, calculateSummary } = window.BOQCalculations;

  function editorData() {
    return {
      document: window.BOQEditor.getDocument(),
      items: window.BOQEditor.getItems(),
      categories: window.BOQEditor.getCategories(),
      settings: window.BOQEditor.getSettings(),
      view: window.BOQEditor.getView(),
    };
  }

  function safeFilename(value) {
    return String(value || "BOQ").replace(/[\\/:*?"<>|]+/g, "-").trim() ||
      "BOQ";
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function styleHeader(row) {
    row.height = 22;
    row.eachCell((cell) => {
      cell.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF315D50" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFB7C0BC" } },
        left: { style: "thin", color: { argb: "FFB7C0BC" } },
        bottom: { style: "thin", color: { argb: "FFB7C0BC" } },
        right: { style: "thin", color: { argb: "FFB7C0BC" } },
      };
    });
  }

  function styleDataRow(row, numericColumns = []) {
    row.eachCell((cell, column) => {
      cell.font = { name: "Arial", size: 10 };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD9DEDC" } },
        left: { style: "thin", color: { argb: "FFD9DEDC" } },
        bottom: { style: "thin", color: { argb: "FFD9DEDC" } },
        right: { style: "thin", color: { argb: "FFD9DEDC" } },
      };
      cell.alignment = {
        horizontal: numericColumns.includes(column) ? "right" :
          column === 1 || column === 2 ? "left" : "center",
        vertical: "middle",
        wrapText: true,
      };
      if (numericColumns.includes(column)) cell.numFmt = "#,##0.00";
    });
  }

  function addDocumentHeader(sheet, document, settings, lastColumn) {
    sheet.mergeCells(1, 1, 1, lastColumn);
    const title = sheet.getCell(1, 1);
    title.value = settings.companyName || "BOQ Manager";
    title.font = { name: "Arial", bold: true, size: 15, color: { argb: "FF263A33" } };
    sheet.mergeCells(2, 1, 2, lastColumn);
    sheet.getCell(2, 1).value = `${document.number || "BOQ"} — ${document.projectName || "Bill of Quantities"}`;
    sheet.getCell(2, 1).font = { name: "Arial", bold: true, size: 12 };
    sheet.addRow(["Customer", document.customerName || "—", "Project", document.projectName || "—"]);
    sheet.addRow(["Date", document.date || "—", "Valid until", document.validUntil || "—"]);
    sheet.addRow([]);
  }

  function addCategoryRow(sheet, category, columnCount) {
    const row = sheet.addRow([category]);
    sheet.mergeCells(row.number, 1, row.number, columnCount);
    row.eachCell((cell) => {
      cell.font = { name: "Arial", bold: true, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EFEC" } };
      cell.border = {
        top: { style: "thin", color: { argb: "FFC5CECA" } },
        bottom: { style: "thin", color: { argb: "FFC5CECA" } },
      };
    });
  }

  function addGrandTotal(sheet, label, value, columnCount) {
    const row = sheet.addRow([]);
    sheet.mergeCells(row.number, 1, row.number, columnCount - 1);
    row.getCell(1).value = label;
    row.getCell(columnCount).value = value;
    row.getCell(columnCount).numFmt = "#,##0.00";
    row.eachCell((cell) => {
      cell.font = { name: "Arial", bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1E8CF" } };
      cell.alignment = { horizontal: cell.column === columnCount ? "right" : "center" };
      cell.border = {
        top: { style: "thin" }, left: { style: "thin" },
        bottom: { style: "thin" }, right: { style: "thin" },
      };
    });
  }

  function addNotes(sheet, notes, columnCount) {
    if (!notes) return;
    const spacer = sheet.addRow([]);
    spacer.height = 5;
    const row = sheet.addRow([`Terms / Notes: ${notes}`]);
    sheet.mergeCells(row.number, 1, row.number, columnCount);
    row.height = 34;
    row.getCell(1).alignment = { vertical: "top", wrapText: true };
    row.getCell(1).font = { name: "Arial", size: 9, color: { argb: "FF53615C" } };
  }

  function addSellingSheet(workbook, data) {
    const sheet = workbook.addWorksheet("Selling", {
      views: [{ state: "frozen", ySplit: 6 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    });
    sheet.columns = [
      { width: 7 }, { width: 38 }, { width: 12 }, { width: 12 },
      { width: 19 }, { width: 21 },
    ];
    addDocumentHeader(sheet, data.document, data.settings, 6);
    const header = sheet.addRow(["No", "Item", "Qty", "Unit", "Unit Price", "Total"]);
    styleHeader(header);
    let index = 0;
    data.categories.forEach((category) => {
      addCategoryRow(sheet, category, 6);
      data.items.filter((item) => item.category === category).forEach((item) => {
        const calc = calculateItem(item);
        const row = sheet.addRow([
          ++index, item.item, item.qty, item.unit, calc.unitSelling,
          calc.totalSelling,
        ]);
        styleDataRow(row, [5, 6]);
      });
    });
    addGrandTotal(sheet, "Grand Total", data.document.totalSelling, 6);
    addNotes(sheet, data.document.notes, 6);
    return sheet;
  }

  function addCogsSheet(workbook, data) {
    const sheet = workbook.addWorksheet("COGS", {
      views: [{ state: "frozen", ySplit: 6 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    });
    sheet.columns = [
      { width: 7 }, { width: 38 }, { width: 12 }, { width: 12 },
      { width: 19 }, { width: 21 }, { width: 15 },
    ];
    addDocumentHeader(sheet, data.document, data.settings, 7);
    const header = sheet.addRow([
      "No", "Item", "Qty", "Unit", "Unit COGS", "Total COGS", "Margin %",
    ]);
    styleHeader(header);
    let index = 0;
    data.categories.forEach((category) => {
      addCategoryRow(sheet, category, 7);
      data.items.filter((item) => item.category === category).forEach((item) => {
        const calc = calculateItem(item);
        const row = sheet.addRow([
          ++index, item.item, item.qty, item.unit, item.unitCogs,
          calc.totalCogs, item.margin,
        ]);
        styleDataRow(row, [5, 6, 7]);
      });
    });
    addGrandTotal(sheet, "Grand Total COGS", data.document.totalCogs, 7);
    return sheet;
  }

  function addCalculationSheet(workbook, data) {
    const sheet = workbook.addWorksheet("Calculation");
    sheet.columns = Array.from({ length: 5 }, () => ({ width: 22 }));
    addDocumentHeader(sheet, data.document, data.settings, 5);
    const header = sheet.addRow([
      "Total COGS", "Total Selling", "Commission", "Gross Profit",
      "Gross Margin %",
    ]);
    styleHeader(header);
    const summary = calculateSummary(data.items, {
      commission: data.document.commission,
    });
    const row = sheet.addRow([
      summary.totalCogs, summary.totalSelling, summary.commission,
      summary.marginValue, summary.marginPercent / 100,
    ]);
    styleDataRow(row, [1, 2, 3, 4, 5]);
    row.getCell(5).numFmt = "0.00%";
    return sheet;
  }

  async function exportExcel(mode) {
    if (!window.ExcelJS) {
      window.BOQApp.showToast("Excel export library is unavailable.", "error");
      return;
    }
    const data = editorData();
    const workbook = new window.ExcelJS.Workbook();
    workbook.creator = "BOQ Manager";
    workbook.subject = data.document.projectName || "Bill of Quantities";
    workbook.created = new Date();
    addSellingSheet(workbook, data);
    if (mode === "all") {
      addCogsSheet(workbook, data);
      addCalculationSheet(workbook, data);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `${safeFilename(data.document.number)}${mode === "selling" ? " - Quotation" : ""}.xlsx`,
    );
    window.BOQApp.showToast("Excel workbook downloaded.");
  }

  function pdfImageType(source) {
    return String(source).startsWith("data:image/png") ? "PNG" : "JPEG";
  }

  function addPdfLogo(doc, source, x, y) {
    if (!source) return null;
    try {
      const properties = doc.getImageProperties(source);
      const scale = Math.min(
        34 / properties.width,
        16 / properties.height,
      );
      const width = properties.width * scale;
      const height = properties.height * scale;
      doc.addImage(source, pdfImageType(source), x, y, width, height);
      return { width, height };
    } catch (_error) {
      return null;
    }
  }

  function pdfTextLines(doc, values, width) {
    return values.filter(Boolean).flatMap((value) =>
      doc.splitTextToSize(String(value), width)
    );
  }

  function pdfHeader(doc, data, label) {
    doc.setProperties({
      title: `${data.document.number} - ${data.document.projectName || "Bill of Quantities"}`,
      subject: label,
      author: data.settings.companyName || "BOQ Manager",
      creator: "BOQ Manager",
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const logo = addPdfLogo(doc, data.settings.companyLogo, 14, 10);
    const companyX = logo ? 14 + logo.width + 6 : 14;
    const companyWidth = Math.max(62, (pageWidth / 2) - companyX - 6);
    const companyNameLines = pdfTextLines(
      doc,
      [data.settings.companyName || "Company information not configured"],
      companyWidth,
    );
    doc.setTextColor(36, 50, 45);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(companyNameLines, companyX, 13);
    const companyNameBottom = 13 + Math.max(0, companyNameLines.length - 1) *
      4.5;
    const companyDetails = pdfTextLines(doc, [
      data.settings.registrationNumber
        ? `Registration no.: ${data.settings.registrationNumber}`
        : "",
      data.settings.address,
      [data.settings.email, data.settings.phone].filter(Boolean).join(" | "),
    ], companyWidth);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90, 101, 96);
    const companyDetailsY = companyNameBottom + 4.5;
    if (companyDetails.length) {
      doc.text(companyDetails, companyX, companyDetailsY);
    }
    const companyBottom = Math.max(
      logo ? 10 + logo.height : 13,
      companyDetails.length
        ? companyDetailsY + (companyDetails.length - 1) * 3.5
        : companyNameBottom,
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(36, 50, 45);
    doc.text(label, pageWidth - 14, 13, { align: "right" });
    doc.setFontSize(9);
    doc.text(data.document.number || "BOQ", pageWidth - 14, 19, {
      align: "right",
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90, 101, 96);
    doc.text(`Date: ${data.document.date || "-"}`, pageWidth - 14, 25, {
      align: "right",
    });
    doc.text(
      `Valid until: ${data.document.validUntil || "-"}`,
      pageWidth - 14,
      29,
      { align: "right" },
    );

    const dividerY = Math.max(35, companyBottom + 5);
    doc.setDrawColor(49, 93, 80);
    doc.setLineWidth(0.5);
    doc.line(14, dividerY, pageWidth - 14, dividerY);
    const partyLabelY = dividerY + 7;
    const partyValueY = partyLabelY + 5;
    const partyWidth = (pageWidth - 42) / 2;
    const customerLines = pdfTextLines(
      doc,
      [data.document.customerName || "-"],
      partyWidth,
    );
    const projectLines = pdfTextLines(
      doc,
      [data.document.projectName || "-"],
      partyWidth,
    );
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(90, 101, 96);
    doc.text("PREPARED FOR", 14, partyLabelY);
    doc.text("PROJECT", pageWidth / 2 + 7, partyLabelY);
    doc.setFontSize(9);
    doc.setTextColor(36, 50, 45);
    doc.text(customerLines, 14, partyValueY);
    doc.text(projectLines, pageWidth / 2 + 7, partyValueY);
    doc.setFont("helvetica", "normal");
    return partyValueY + Math.max(customerLines.length, projectLines.length) *
      4 + 4;
  }

  function pdfColumns(data, mode) {
    const columns = [{ key: "index", label: "No", align: "center" }];
    if (data.settings.showSku === true) {
      columns.push({ key: "sku", label: "Part Number" });
    }
    columns.push(
      { key: "item", label: "Item" },
      { key: "qty", label: "Qty", align: "right" },
      { key: "unit", label: "Unit", align: "center" },
    );
    if (mode === "cogs") {
      columns.push(
        { key: "unitCogs", label: "Unit COGS", align: "right" },
        { key: "totalCogs", label: "Total COGS", align: "right" },
        { key: "margin", label: "Margin", align: "right" },
      );
    } else {
      if (data.settings.showUnitPricing !== false) {
        columns.push({
          key: "unitSelling",
          label: "Unit Price",
          align: "right",
        });
      }
      columns.push({ key: "totalSelling", label: "Total", align: "right" });
    }
    return columns;
  }

  function groupedPdfRows(data, mode, columns) {
    const rows = [];
    let index = 0;
    const decimals = data.document.currency === "IDR" ? 0 : 2;
    data.categories.forEach((category) => {
      rows.push([{
        content: category,
        colSpan: columns.length,
        styles: { fillColor: [232, 239, 236], fontStyle: "bold" },
      }]);
      data.items.filter((item) => item.category === category).forEach((item) => {
        const calc = calculateItem(item);
        const values = {
          index: ++index,
          sku: item.sku || "",
          item: item.item,
          qty: item.qty,
          unit: item.unit,
          unitCogs: formatNumber(item.unitCogs || 0, decimals),
          totalCogs: formatNumber(calc.totalCogs, decimals),
          margin: formatPercent(item.margin || 0),
          unitSelling: formatNumber(calc.unitSelling, decimals),
          totalSelling: formatNumber(calc.totalSelling, decimals),
        };
        rows.push(columns.map((column) => values[column.key]));
      });
    });
    return rows;
  }

  function pdfFooterLines(doc, settings) {
    const footerText = String(settings.footerText || "").trim();
    if (!footerText) return [];
    return doc.splitTextToSize(
      footerText,
      doc.internal.pageSize.getWidth() - 36,
    );
  }

  function pdfFooterReserve(doc, settings) {
    const lines = pdfFooterLines(doc, settings);
    return lines.length ? 13 + lines.length * 3.4 : 10;
  }

  function addPdfFooters(doc, settings) {
    const lines = pdfFooterLines(doc, settings);
    if (!lines.length) return;
    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const firstLineY = pageHeight - 7 - Math.max(0, lines.length - 1) * 3.4;
      doc.setDrawColor(207, 214, 211);
      doc.setLineWidth(0.2);
      doc.line(14, firstLineY - 5, pageWidth - 14, firstLineY - 5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(105, 116, 111);
      doc.text(lines, pageWidth / 2, firstLineY, { align: "center" });
    }
  }

  function exportPdf() {
    if (!window.jspdf?.jsPDF) {
      window.BOQApp.showToast("PDF export library is unavailable.", "error");
      return;
    }
    const data = editorData();
    const mode = data.view === "cogs"
      ? "cogs"
      : data.view === "summary"
      ? "summary"
      : "selling";
    const doc = new window.jspdf.jsPDF({ orientation: mode === "summary" ? "portrait" : "landscape" });
    const label = mode === "cogs"
      ? "BOQ COGS"
      : mode === "summary"
      ? "BOQ Calculation"
      : "Bill of Quantities";
    const contentStartY = pdfHeader(doc, data, label);
    const footerReserve = pdfFooterReserve(doc, data.settings);
    if (mode === "summary") {
      const summary = calculateSummary(data.items, { commission: data.document.commission });
      doc.autoTable({
        startY: contentStartY,
        head: [["Total COGS", "Total Selling", "Commission", "Gross Profit", "Gross Margin"]],
        body: [[
          formatCurrency(summary.totalCogs, data.document.currency),
          formatCurrency(summary.totalSelling, data.document.currency),
          formatCurrency(summary.commission, data.document.currency),
          formatCurrency(summary.marginValue, data.document.currency),
          formatPercent(summary.marginPercent),
        ]],
        theme: "grid",
        headStyles: { fillColor: [49, 93, 80] },
        margin: { bottom: footerReserve },
      });
    } else {
      const columns = pdfColumns(data, mode);
      const columnStyles = Object.fromEntries(columns.map((column, index) => [
        index,
        column.align ? { halign: column.align } : {},
      ]));
      doc.autoTable({
        startY: contentStartY,
        head: [columns.map((column) => column.label)],
        body: groupedPdfRows(data, mode, columns),
        theme: "grid",
        headStyles: { fillColor: [49, 93, 80], halign: "center" },
        styles: { fontSize: 8, cellPadding: 2.3 },
        columnStyles,
        margin: { bottom: footerReserve },
      });
      const total = mode === "cogs"
        ? data.document.totalCogs
        : data.document.totalSelling;
      let y = doc.lastAutoTable.finalY + 9;
      const contentBottom = doc.internal.pageSize.getHeight() - footerReserve;
      if (y > contentBottom - 8) {
        doc.addPage();
        y = 18;
      }
      doc.setFontSize(10);
      doc.setTextColor(36, 50, 45);
      doc.text(
        `${mode === "cogs" ? "Total COGS" : "Grand Total"}: ${formatCurrency(total, data.document.currency)}`,
        282,
        y,
        { align: "right" },
      );
      if (data.document.notes) {
        let notesY = y + 10;
        const noteLines = doc.splitTextToSize(data.document.notes, 250);
        const notesHeight = 5 + noteLines.length * 3.5;
        if (notesY + notesHeight > contentBottom) {
          doc.addPage();
          notesY = 18;
        }
        doc.setFontSize(8);
        doc.setTextColor(90, 101, 96);
        doc.text("Terms / Notes", 14, notesY);
        doc.text(noteLines, 14, notesY + 5);
      }
    }
    addPdfFooters(doc, data.settings);
    const suffix = mode === "selling" ? "" : ` - ${label}`;
    doc.save(`${safeFilename(data.document.number)}${suffix}.pdf`);
    window.BOQApp.showToast("PDF downloaded.");
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-export-excel]")) {
      window.BOQModal.open("excel-modal");
    }
    const modeButton = event.target.closest("[data-excel-mode]");
    if (modeButton) {
      window.BOQModal.close(document.getElementById("excel-modal"));
      void exportExcel(modeButton.dataset.excelMode);
    }
    if (event.target.closest("[data-download-pdf]")) exportPdf();
  });

  const requestedExport = new URLSearchParams(location.search).get("export");
  if (requestedExport === "excel") {
    window.setTimeout(() => window.BOQModal.open("excel-modal"), 0);
  } else if (requestedExport === "pdf") {
    window.setTimeout(exportPdf, 0);
  }
})();
