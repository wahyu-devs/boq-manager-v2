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

  function pdfHeader(doc, data, label) {
    doc.setProperties({
      title: `${data.document.number} — ${data.document.projectName || "Bill of Quantities"}`,
      subject: label,
      author: data.settings.companyName || "BOQ Manager",
      creator: "BOQ Manager",
    });
    doc.setTextColor(36, 50, 45);
    doc.setFontSize(15);
    doc.text(data.settings.companyName || "BOQ Manager", 14, 14);
    doc.setFontSize(9);
    doc.setTextColor(90, 101, 96);
    doc.text(`${label} · ${data.document.number || "BOQ"}`, 14, 21);
    doc.text(`Customer: ${data.document.customerName || "—"}`, 14, 27);
    doc.text(`Project: ${data.document.projectName || "—"}`, 105, 27);
    doc.text(`Date: ${data.document.date || "—"}`, 14, 33);
    doc.text(`Valid until: ${data.document.validUntil || "—"}`, 105, 33);
  }

  function groupedPdfRows(data, mode) {
    const rows = [];
    let index = 0;
    const decimals = data.document.currency === "IDR" ? 0 : 2;
    data.categories.forEach((category) => {
      const columnCount = mode === "cogs" ? 7 : 6;
      rows.push([{
        content: category,
        colSpan: columnCount,
        styles: { fillColor: [232, 239, 236], fontStyle: "bold" },
      }]);
      data.items.filter((item) => item.category === category).forEach((item) => {
        const calc = calculateItem(item);
        if (mode === "cogs") {
          rows.push([
            ++index, item.item, item.qty, item.unit,
            formatNumber(item.unitCogs || 0, decimals),
            formatNumber(calc.totalCogs, decimals),
            formatPercent(item.margin || 0),
          ]);
        } else {
          rows.push([
            ++index, item.item, item.qty, item.unit,
            formatNumber(calc.unitSelling, decimals),
            formatNumber(calc.totalSelling, decimals),
          ]);
        }
      });
    });
    return rows;
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
    pdfHeader(doc, data, label);
    if (mode === "summary") {
      const summary = calculateSummary(data.items, { commission: data.document.commission });
      doc.autoTable({
        startY: 40,
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
      });
    } else {
      const head = mode === "cogs"
        ? [["No", "Item", "Qty", "Unit", "Unit COGS", "Total COGS", "Margin"]]
        : [["No", "Item", "Qty", "Unit", "Unit Price", "Total"]];
      doc.autoTable({
        startY: 40,
        head,
        body: groupedPdfRows(data, mode),
        theme: "grid",
        headStyles: { fillColor: [49, 93, 80], halign: "center" },
        styles: { fontSize: 8, cellPadding: 2.3 },
        columnStyles: mode === "cogs"
          ? { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } }
          : { 4: { halign: "right" }, 5: { halign: "right" } },
      });
      const total = mode === "cogs"
        ? data.document.totalCogs
        : data.document.totalSelling;
      let y = doc.lastAutoTable.finalY + 9;
      if (y > 190) {
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
        if (notesY > 190) {
          doc.addPage();
          notesY = 18;
        }
        doc.setFontSize(8);
        doc.setTextColor(90, 101, 96);
        doc.text("Terms / Notes", 14, notesY);
        doc.text(
          doc.splitTextToSize(data.document.notes, 250),
          14,
          notesY + 5,
        );
      }
    }
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
