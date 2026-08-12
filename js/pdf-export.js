(function definePdfExport() {
  const COLORS = {
    ink: [32, 39, 36],
    body: [37, 42, 40],
    company: [39, 76, 64],
    heading: [39, 63, 55],
    muted: [104, 113, 109],
    note: [79, 89, 84],
    footer: [115, 125, 120],
    tableHead: [237, 241, 239],
    tableHeadText: [74, 85, 79],
    border: [216, 221, 218],
    white: [255, 255, 255],
  };
  const PAGE_MARGIN = 12;
  const TABLE_WIDTH = 186;

  function imageType(source) {
    return String(source).startsWith("data:image/png") ? "PNG" : "JPEG";
  }

  function addLogo(doc, source, x, y) {
    if (!source) return null;
    try {
      const properties = doc.getImageProperties(source);
      const scale = Math.min(36 / properties.width, 10.5 / properties.height);
      const width = properties.width * scale;
      const height = properties.height * scale;
      doc.addImage(source, imageType(source), x, y, width, height);
      return { width, height };
    } catch (_error) {
      return null;
    }
  }

  function textLines(doc, values, width) {
    return values.filter(Boolean).flatMap((value) =>
      doc.splitTextToSize(String(value), width)
    );
  }

  function companyDetailLines(doc, settings, width) {
    return textLines(doc, [
      settings.registrationNumber
        ? `Registration no.: ${settings.registrationNumber}`
        : "",
      settings.address,
      [settings.email, settings.phone].filter(Boolean).join(" · "),
    ], width);
  }

  function drawDocumentHeader(doc, data) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - PAGE_MARGIN * 2;
    const headerTop = 12;
    const rightWidth = 63;
    const headerGap = 8;
    const leftWidth = contentWidth - rightWidth - headerGap;
    const rightX = pageWidth - PAGE_MARGIN;
    const logo = addLogo(
      doc,
      data.settings.companyLogo,
      PAGE_MARGIN,
      headerTop,
    );
    let leftY = logo ? headerTop + logo.height + 3 : headerTop + 3;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.25);
    doc.setTextColor(...COLORS.company);
    const companyLines = textLines(doc, [
      data.settings.companyName || "Company information not configured",
    ], leftWidth);
    doc.text(companyLines, PAGE_MARGIN, leftY);
    leftY += Math.max(1, companyLines.length) * 4.4 + 1.6;

    const details = companyDetailLines(doc, data.settings, leftWidth);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.25);
    doc.setTextColor(...COLORS.body);
    if (details.length) doc.text(details, PAGE_MARGIN, leftY);
    const leftBottom = details.length
      ? leftY + Math.max(0, details.length - 1) * 4
      : leftY;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.75);
    doc.setTextColor(...COLORS.ink);
    doc.text("Bill of Quantities", rightX, headerTop + 4, { align: "right" });
    doc.setFontSize(8.25);
    doc.text(data.document.number || "BOQ", rightX, headerTop + 10, {
      align: "right",
    });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.body);
    doc.text(`Date: ${data.document.date || ""}`, rightX, headerTop + 14, {
      align: "right",
    });
    doc.text(
      `Valid until: ${data.document.validUntil || ""}`,
      rightX,
      headerTop + 18,
      { align: "right" },
    );
    const rightBottom = headerTop + 18;

    const dividerY = Math.max(leftBottom, rightBottom) + 5.8;
    doc.setDrawColor(...COLORS.heading);
    doc.setLineWidth(0.55);
    doc.line(PAGE_MARGIN, dividerY, pageWidth - PAGE_MARGIN, dividerY);

    const partiesTop = dividerY + 5.3;
    const partyGap = 8;
    const partyWidth = (contentWidth - partyGap) / 2;
    const projectX = PAGE_MARGIN + partyWidth + partyGap;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.75);
    doc.setTextColor(...COLORS.muted);
    doc.text("PREPARED FOR", PAGE_MARGIN, partiesTop);
    doc.text("PROJECT", projectX, partiesTop);

    const customerLines = textLines(
      doc,
      [data.document.customerName || "-"],
      partyWidth,
    );
    const projectLines = textLines(
      doc,
      [data.document.projectName || "-"],
      partyWidth,
    );
    doc.setFontSize(8.25);
    doc.setTextColor(...COLORS.ink);
    doc.text(customerLines, PAGE_MARGIN, partiesTop + 4.2);
    doc.text(projectLines, projectX, partiesTop + 4.2);
    const partyLineCount = Math.max(
      customerLines.length,
      projectLines.length,
      1,
    );
    return partiesTop + 4.2 + (partyLineCount - 1) * 4 + 6.3;
  }

  function pdfColumns(data) {
    const columns = [
      { key: "index", label: "#", width: 8 },
    ];
    if (data.settings.showSku === true) {
      columns.push({ key: "sku", label: "PART NUMBER", width: 23 });
    }
    columns.push(
      { key: "item", label: "ITEM" },
      { key: "qty", label: "QTY", align: "right", width: 13 },
      { key: "unit", label: "UNIT", width: 16 },
    );
    if (data.settings.showUnitPricing !== false) {
      columns.push({
        key: "unitSelling",
        label: "UNIT PRICE",
        align: "right",
        width: 27,
      });
    }
    columns.push({
      key: "totalSelling",
      label: "TOTAL",
      align: "right",
      width: 31,
    });
    const fixedWidth = columns.reduce(
      (sum, column) => sum + Number(column.width || 0),
      0,
    );
    columns.find((column) => column.key === "item").width = TABLE_WIDTH -
      fixedWidth;
    return columns;
  }

  function bodyCell(content, styles = {}) {
    return { content: content ?? "", styles };
  }

  function currencyBodyCell(value, currency, styles = {}) {
    return {
      content: "",
      styles,
      accounting: window.BOQUtils.formatCurrencyParts(value, currency),
    };
  }

  function drawAccountingCell(doc, cellData) {
    const accounting = cellData.cell.raw?.accounting;
    if (!accounting || cellData.section !== "body") return;
    const { cell } = cellData;
    const leftPadding = typeof cell.padding === "function"
      ? cell.padding("left")
      : 2.1;
    const rightPadding = typeof cell.padding === "function"
      ? cell.padding("right")
      : 2.1;
    const textPosition = typeof cell.getTextPos === "function"
      ? cell.getTextPos()
      : { y: cell.y + cell.height / 2 + 1 };
    const textColor = Array.isArray(cell.styles.textColor)
      ? cell.styles.textColor
      : COLORS.body;
    doc.setFont(
      cell.styles.font || "helvetica",
      cell.styles.fontStyle || "normal",
    );
    doc.setFontSize(cell.styles.fontSize || 8.25);
    doc.setTextColor(...textColor);
    doc.text(accounting.symbol, cell.x + leftPadding, textPosition.y);
    doc.text(
      accounting.value,
      cell.x + cell.width - rightPadding,
      textPosition.y,
      { align: "right" },
    );
  }

  function pdfRows(data, columns) {
    const { calculateItem } = window.BOQCalculations;
    const rows = [];
    let index = 0;
    data.categories.forEach((category) => {
      rows.push([{
        content: category,
        colSpan: columns.length,
        styles: {
          fillColor: COLORS.white,
          textColor: COLORS.ink,
          fontStyle: "bold",
          halign: "left",
        },
      }]);
      data.items.filter((item) => item.category === category).forEach(
        (item) => {
          const calculation = calculateItem(item);
          const values = {
            index: bodyCell(++index),
            sku: bodyCell(item.sku || ""),
            item: bodyCell(item.item, { fontStyle: "bold" }),
            qty: bodyCell(item.qty),
            unit: bodyCell(item.unit),
            unitSelling: currencyBodyCell(
              calculation.unitSelling,
              data.document.currency,
            ),
            totalSelling: currencyBodyCell(
              calculation.totalSelling,
              data.document.currency,
              { fontStyle: "bold" },
            ),
          };
          rows.push(columns.map((column) => values[column.key]));
        },
      );
    });
    if (!rows.length) {
      rows.push([{
        content: "No BOQ items",
        colSpan: columns.length,
        styles: { textColor: COLORS.muted, minCellHeight: 14 },
      }]);
    }
    return rows;
  }

  function footerText(data) {
    return String(data.settings.footerText || "").trim();
  }

  function drawFooter(doc, data, startY) {
    const text = footerText(data);
    if (!text) return startY;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const lines = doc.splitTextToSize(text, pageWidth - PAGE_MARGIN * 2);
    const requiredHeight = 4.2 + Math.max(1, lines.length) * 3.2;
    const y = ensureSpace(
      doc,
      startY,
      requiredHeight,
      pageHeight - PAGE_MARGIN,
    );
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.2);
    doc.line(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.75);
    doc.setTextColor(...COLORS.footer);
    doc.text(lines, pageWidth / 2, y + 4.2, { align: "center" });
    return y + requiredHeight;
  }

  function ensureSpace(doc, y, requiredHeight, bottom) {
    if (y + requiredHeight <= bottom) return y;
    doc.addPage();
    return PAGE_MARGIN;
  }

  function drawSummary(doc, data, startY, reserve) {
    const { formatCurrencyParts } = window.BOQUtils;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentBottom = pageHeight - reserve;
    const totalWidth = 68;
    const totalX = pageWidth - PAGE_MARGIN - totalWidth;
    const amountX = pageWidth - PAGE_MARGIN - 38;
    let y = ensureSpace(doc, startY, 16, contentBottom);
    const total = formatCurrencyParts(
      data.document.totalSelling,
      data.document.currency,
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.25);
    doc.setTextColor(...COLORS.body);
    doc.text("Subtotal", totalX, y + 3.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.ink);
    doc.text(total.symbol, amountX, y + 3.5);
    doc.text(total.value, pageWidth - PAGE_MARGIN, y + 3.5, {
      align: "right",
    });

    const grandLineY = y + 7;
    doc.setDrawColor(...COLORS.heading);
    doc.setLineWidth(0.55);
    doc.line(totalX, grandLineY, pageWidth - PAGE_MARGIN, grandLineY);
    doc.setFontSize(10.5);
    doc.text("Grand total", totalX, grandLineY + 5.8);
    doc.text(total.symbol, amountX, grandLineY + 5.8);
    doc.text(total.value, pageWidth - PAGE_MARGIN, grandLineY + 5.8, {
      align: "right",
    });
    y += 16;

    const notes = String(data.document.notes || "").trim();
    if (!notes) return y;
    const noteLines = doc.splitTextToSize(
      notes,
      pageWidth - PAGE_MARGIN * 2,
    );
    const noteLineHeight = 3.8;
    const noteHeaderHeight = 9;
    let lineIndex = 0;
    y += 6.8;
    while (lineIndex < noteLines.length) {
      y = ensureSpace(doc, y, noteHeaderHeight + noteLineHeight, contentBottom);
      doc.setDrawColor(...COLORS.border);
      doc.setLineWidth(0.2);
      doc.line(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.25);
      doc.setTextColor(...COLORS.ink);
      doc.text("Terms / Notes", PAGE_MARGIN, y + 5);
      y += noteHeaderHeight;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.note);
      while (
        lineIndex < noteLines.length && y + noteLineHeight <= contentBottom
      ) {
        doc.text(noteLines[lineIndex], PAGE_MARGIN, y);
        lineIndex += 1;
        y += noteLineHeight;
      }
      if (lineIndex < noteLines.length) {
        doc.addPage();
        y = PAGE_MARGIN;
      }
    }
    return y;
  }

  function create(data) {
    const doc = new window.jspdf.jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const projectName = data.document.projectName || "Bill of Quantities";
    doc.setProperties({
      title: `${data.document.number || "BOQ"} - ${projectName}`,
      subject: "Customer Bill of Quantities",
      author: data.settings.companyName || "BOQ Manager",
      creator: "BOQ Manager",
      keywords: "BOQ, Bill of Quantities, quotation",
    });
    const tableStartY = drawDocumentHeader(doc, data);
    const columns = pdfColumns(data);
    const columnStyles = Object.fromEntries(columns.map((column, index) => [
      index,
      { halign: column.align || "left", cellWidth: column.width },
    ]));
    const reserve = PAGE_MARGIN;
    doc.autoTable({
      startY: tableStartY,
      margin: {
        top: PAGE_MARGIN,
        right: PAGE_MARGIN,
        bottom: reserve,
        left: PAGE_MARGIN,
      },
      head: [columns.map((column) => column.label)],
      body: pdfRows(data, columns),
      theme: "plain",
      showHead: "everyPage",
      headStyles: {
        fillColor: COLORS.tableHead,
        textColor: COLORS.tableHeadText,
        fontStyle: "bold",
        fontSize: 6.75,
        cellPadding: { top: 2.1, right: 2.1, bottom: 2.1, left: 2.1 },
      },
      styles: {
        font: "helvetica",
        fontSize: 8.25,
        textColor: COLORS.body,
        fillColor: COLORS.white,
        lineWidth: 0,
        cellPadding: { top: 2.1, right: 2.1, bottom: 2.1, left: 2.1 },
        overflow: "linebreak",
        valign: "middle",
      },
      columnStyles,
      didDrawCell: (cellData) => {
        if (!["head", "body"].includes(cellData.section)) return;
        doc.setDrawColor(...COLORS.border);
        doc.setLineWidth(0.2);
        doc.line(
          cellData.cell.x,
          cellData.cell.y + cellData.cell.height,
          cellData.cell.x + cellData.cell.width,
          cellData.cell.y + cellData.cell.height,
        );
        drawAccountingCell(doc, cellData);
      },
    });
    const summaryBottom = drawSummary(
      doc,
      data,
      doc.lastAutoTable.finalY + 5.8,
      reserve,
    );
    drawFooter(doc, data, summaryBottom + 9);
    return doc;
  }

  function download(data, safeFilename) {
    const doc = create(data);
    const filename = [data.document.number, data.document.projectName]
      .filter(Boolean).map(safeFilename).join(" - ") || "BOQ";
    doc.save(`${filename}.pdf`);
  }

  window.BOQPdfExport = { create, download };
})();
