(function definePdfExport() {
  const customerDocument = window.BOQCustomerDocument;
  const COLORS = {
    ink: customerDocument.colorRgb("ink"),
    body: customerDocument.colorRgb("body"),
    company: customerDocument.colorRgb("company"),
    heading: customerDocument.colorRgb("heading"),
    muted: customerDocument.colorRgb("muted"),
    note: customerDocument.colorRgb("note"),
    footer: customerDocument.colorRgb("footer"),
    primary: customerDocument.colorRgb("primary"),
    primarySoft: customerDocument.colorRgb("primarySoft"),
    surface: customerDocument.colorRgb("surface"),
    tableHead: customerDocument.colorRgb("tableHead"),
    tableHeadText: customerDocument.colorRgb("tableHeadText"),
    border: customerDocument.colorRgb("border"),
    white: customerDocument.colorRgb("white"),
  };
  const PAGE_MARGIN = customerDocument.layout.pageMarginMm;
  const TABLE_CELL_PADDING = customerDocument.layout.tableCellPaddingMm;
  const TOTAL_COLUMN_WIDTH = customerDocument.layout.totalColumnWidthMm;
  const CATEGORY_ROW_HEIGHT = 8;

  function imageType(source) {
    return String(source).startsWith("data:image/png") ? "PNG" : "JPEG";
  }

  function addLogo(doc, source, x, y) {
    if (!source) return null;
    try {
      const properties = doc.getImageProperties(source);
      const scale = Math.min(38 / properties.width, 17 / properties.height);
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
      [settings.email, settings.phone].filter(Boolean).join(" | "),
    ], width);
  }

  function drawDocumentHeader(doc, data) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - PAGE_MARGIN * 2;
    const headerTop = 10;
    const rightWidth = 66;
    const headerGap = 10;
    const leftWidth = contentWidth - rightWidth - headerGap;
    const rightX = pageWidth - PAGE_MARGIN;
    const logo = addLogo(
      doc,
      data.settings.companyLogo,
      PAGE_MARGIN,
      headerTop,
    );
    let leftY = logo ? headerTop + 20 : headerTop + 4;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.25);
    doc.setTextColor(...COLORS.company);
    const companyLines = textLines(doc, [
      data.settings.companyName || "Company information not configured",
    ], leftWidth);
    doc.text(companyLines, PAGE_MARGIN, leftY);
    leftY += Math.max(1, companyLines.length) * 4.4 + 1;

    const details = companyDetailLines(doc, data.settings, leftWidth);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.muted);
    if (details.length) doc.text(details, PAGE_MARGIN, leftY);
    const leftBottom = details.length
      ? leftY + Math.max(0, details.length - 1) * 3.5
      : leftY;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.75);
    doc.setTextColor(...COLORS.heading);
    doc.text("BILL OF QUANTITIES", rightX, headerTop + 4, {
      align: "right",
    });
    doc.setFontSize(8.25);
    doc.setTextColor(...COLORS.ink);
    doc.text(customerDocument.documentReference(data.document), rightX, headerTop + 10, {
      align: "right",
    });
    doc.setFontSize(7);
    doc.setTextColor(...customerDocument.colorRgb("banner"));
    doc.text(customerDocument.documentBanner(data.document), rightX, headerTop + 16, {
      align: "right",
    });
    const rightBottom = headerTop + 16;

    const dividerY = Math.max(leftBottom, rightBottom) + 4.5;
    doc.setFillColor(...COLORS.primary);
    doc.rect(PAGE_MARGIN, dividerY, contentWidth, 2, "F");

    const partiesTop = dividerY + 2;
    const partiesHeight = 18;
    const customerWidth = contentWidth * 0.24;
    const projectWidth = contentWidth * 0.55;
    const projectX = PAGE_MARGIN + customerWidth;
    const dateX = projectX + projectWidth;
    doc.setFillColor(...COLORS.surface);
    doc.rect(PAGE_MARGIN, partiesTop, contentWidth, partiesHeight, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...COLORS.muted);
    doc.text("PREPARED FOR", PAGE_MARGIN + 2, partiesTop + 4);
    doc.text("PROJECT", projectX + 2, partiesTop + 4);
    doc.text("ISSUED / VALID UNTIL", dateX + 2, partiesTop + 4);

    const customerLines = textLines(
      doc,
      [data.document.customerName || "-"],
      customerWidth - 4,
    );
    const projectLines = textLines(
      doc,
      [data.document.projectName || "-"],
      projectWidth - 4,
    );
    doc.setFontSize(8.25);
    doc.setTextColor(...COLORS.ink);
    doc.text(customerLines, PAGE_MARGIN + 2, partiesTop + 9);
    doc.text(projectLines, projectX + 2, partiesTop + 9);
    doc.setFont("helvetica", "normal");
    doc.text(data.document.date || "-", dateX + 2, partiesTop + 9);
    doc.text(data.document.validUntil || "-", dateX + 2, partiesTop + 13.2);
    return partiesTop + partiesHeight + 7;
  }

  function pdfColumns(data) {
    return customerDocument.columns(data.settings).map((column) => ({
      ...column,
      width: column.widthMm,
    }));
  }

  function bodyCell(content, styles = {}) {
    return { content: content ?? "", styles };
  }

  function currencyBodyCell(value, currency, styles = {}, numberFormat) {
    return {
      content: "",
      styles,
      accounting: window.BOQUtils.formatCurrencyParts(
        value,
        currency,
        undefined,
        numberFormat,
      ),
    };
  }

  function drawAccountingCell(doc, cellData) {
    const accounting = cellData.cell.raw?.accounting;
    if (!accounting || cellData.section !== "body") return;
    const { cell } = cellData;
    const leftPadding = typeof cell.padding === "function"
      ? cell.padding("left")
      : TABLE_CELL_PADDING;
    const rightPadding = typeof cell.padding === "function"
      ? cell.padding("right")
      : TABLE_CELL_PADDING;
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
          fillColor: COLORS.primarySoft,
          textColor: COLORS.heading,
          fontStyle: "bold",
          halign: "left",
          minCellHeight: CATEGORY_ROW_HEIGHT,
        },
      }]);
      data.items.filter((item) =>
        (item.category || "Uncategorized") === category
      ).forEach(
        (item) => {
          const calculation = calculateItem(item, {
            rounding: data.settings.rounding,
          });
          const values = {
            index: bodyCell(++index),
            sku: bodyCell(item.sku || ""),
            item: bodyCell(item.item),
            qty: bodyCell(item.qty),
            unit: bodyCell(item.unit),
            unitSelling: currencyBodyCell(
              calculation.unitSelling,
              data.document.currency,
              {},
              data.settings.numberFormat,
            ),
            totalSelling: currencyBodyCell(
              calculation.totalSelling,
              data.document.currency,
              {},
              data.settings.numberFormat,
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

  function drawPageMetadata(doc, data) {
    const pageCount = doc.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...COLORS.footer);
      doc.text(
        customerDocument.documentReference(data.document),
        PAGE_MARGIN,
        pageHeight - 5,
      );
      doc.text(
        `Page ${page} of ${pageCount}`,
        pageWidth - PAGE_MARGIN,
        pageHeight - 5,
        { align: "right" },
      );
    }
  }

  function drawSummary(doc, data, startY, reserve) {
    const { formatCurrencyParts } = window.BOQUtils;
    const showPricing = customerDocument.visibility(data.settings).showPricing;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentBottom = pageHeight - reserve;
    const totalWidth = 74;
    const labelWidth = totalWidth - TOTAL_COLUMN_WIDTH;
    const totalX = pageWidth - PAGE_MARGIN - totalWidth;
    const amountRightX = pageWidth - PAGE_MARGIN - TABLE_CELL_PADDING;
    const amountX = totalX + labelWidth + TABLE_CELL_PADDING;
    const totalHeight = CATEGORY_ROW_HEIGHT;
    let y = startY;
    if (showPricing) {
      y = ensureSpace(doc, y, totalHeight, contentBottom);
      const total = formatCurrencyParts(
        data.document.totalSelling,
        data.document.currency,
        undefined,
        data.settings.numberFormat,
      );

      doc.setFillColor(...COLORS.primarySoft);
      doc.rect(totalX, y, totalWidth, totalHeight, "F");
      doc.setDrawColor(...COLORS.border);
      doc.setLineWidth(0.2);
      doc.line(totalX, y, totalX + totalWidth, y);
      doc.line(
        totalX,
        y + totalHeight,
        totalX + totalWidth,
        y + totalHeight,
      );
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.25);
      doc.setTextColor(...COLORS.heading);
      const totalTextY = y + totalHeight / 2 + 1.25;
      doc.text("Grand Total", totalX + labelWidth / 2, totalTextY, {
        align: "center",
      });
      doc.text(total.symbol, amountX, totalTextY);
      doc.text(total.value, amountRightX, totalTextY, {
        align: "right",
      });
      y += totalHeight;
    }

    const notes = String(data.document.notes || "").trim();
    if (!notes) return y;
    const noteLines = doc.splitTextToSize(
      notes,
      pageWidth - PAGE_MARGIN * 2,
    );
    const noteLineHeight = 3.8;
    let lineIndex = 0;
    if (showPricing) y += 8;
    while (lineIndex < noteLines.length) {
      y = ensureSpace(doc, y, 13, contentBottom);
      const availableLines = Math.max(
        1,
        Math.floor((contentBottom - y - 10) / noteLineHeight),
      );
      const pageLines = noteLines.slice(
        lineIndex,
        lineIndex + availableLines,
      );
      const noteBoxHeight = Math.max(12, pageLines.length * noteLineHeight + 5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.75);
      doc.setTextColor(...COLORS.muted);
      doc.text("TERMS / NOTES", PAGE_MARGIN, y + 3);
      const noteBoxY = y + 5;
      doc.setFillColor(...COLORS.surface);
      doc.rect(
        PAGE_MARGIN,
        noteBoxY,
        pageWidth - PAGE_MARGIN * 2,
        noteBoxHeight,
        "F",
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.25);
      doc.setTextColor(...COLORS.note);
      pageLines.forEach((line, index) =>
        doc.text(line, PAGE_MARGIN + 2, noteBoxY + 4 + index * noteLineHeight)
      );
      lineIndex += pageLines.length;
      y = noteBoxY + noteBoxHeight;
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
      title: `${customerDocument.documentReference(data.document)} - ${projectName}`,
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
        halign: "center",
        cellPadding: {
          top: TABLE_CELL_PADDING,
          right: TABLE_CELL_PADDING,
          bottom: TABLE_CELL_PADDING,
          left: TABLE_CELL_PADDING,
        },
      },
      styles: {
        font: "helvetica",
        fontSize: 8.25,
        textColor: COLORS.body,
        fillColor: COLORS.white,
        lineWidth: 0,
        cellPadding: {
          top: TABLE_CELL_PADDING,
          right: TABLE_CELL_PADDING,
          bottom: TABLE_CELL_PADDING,
          left: TABLE_CELL_PADDING,
        },
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
    drawPageMetadata(doc, data);
    return doc;
  }

  function download(data, safeFilename) {
    const doc = create(data);
    doc.save(customerDocument.filename(data, safeFilename, "pdf"));
  }

  window.BOQPdfExport = { create, download };
})();
