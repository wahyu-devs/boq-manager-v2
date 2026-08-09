(function definePdfExport() {
  const COLORS = {
    ink: [32, 39, 36],
    muted: [105, 115, 111],
    primary: [38, 115, 95],
    primaryDark: [31, 98, 79],
    primarySoft: [232, 243, 239],
    surface: [245, 246, 247],
    border: [221, 225, 223],
    warning: [154, 100, 28],
    warningSoft: [251, 241, 223],
    white: [255, 255, 255],
  };
  const MARGIN = 15;

  function imageType(source) {
    return String(source).startsWith("data:image/png") ? "PNG" : "JPEG";
  }

  function addLogo(doc, source, x, y) {
    if (!source) return null;
    try {
      const properties = doc.getImageProperties(source);
      const scale = Math.min(28 / properties.width, 14 / properties.height);
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

  function displayDate(value, preference = "dmy") {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return value || "-";
    const [, year, month, day] = match;
    if (preference === "iso") return `${year}-${month}-${day}`;
    if (preference === "mdy") return `${month}/${day}/${year}`;
    const monthName = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ][Number(month) - 1];
    return `${day} ${monthName} ${year}`;
  }

  function drawDocumentHeader(doc, data) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const logo = addLogo(doc, data.settings.companyLogo, MARGIN, 12);
    const companyX = logo ? MARGIN + logo.width + 5 : MARGIN;
    const companyWidth = 92 - (companyX - MARGIN);
    const companyNameLines = textLines(
      doc,
      [data.settings.companyName || "Company information not configured"],
      companyWidth,
    );
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...COLORS.ink);
    doc.text(companyNameLines, companyX, 15);
    const companyNameBottom = 15 + Math.max(0, companyNameLines.length - 1) *
        4.4;
    const detailLines = textLines(doc, [
      data.settings.registrationNumber
        ? `Registration no.: ${data.settings.registrationNumber}`
        : "",
      data.settings.address,
      [data.settings.email, data.settings.phone].filter(Boolean).join(" | "),
    ], companyWidth);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.3);
    doc.setTextColor(...COLORS.muted);
    const detailsY = companyNameBottom + 4;
    if (detailLines.length) doc.text(detailLines, companyX, detailsY);
    const companyBottom = Math.max(
      logo ? 12 + logo.height : 15,
      detailLines.length
        ? detailsY + (detailLines.length - 1) * 3.2
        : companyNameBottom,
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.primary);
    doc.text("BILL OF QUANTITIES", pageWidth - MARGIN, 13, {
      align: "right",
    });
    doc.setFontSize(15);
    doc.setTextColor(...COLORS.ink);
    doc.text(data.document.number || "BOQ", pageWidth - MARGIN, 20, {
      align: "right",
    });
    if (data.document.status === "Draft") {
      const pillWidth = 18;
      doc.setDrawColor(...COLORS.warning);
      doc.setLineWidth(0.25);
      doc.roundedRect(
        pageWidth - MARGIN - pillWidth,
        23,
        pillWidth,
        6,
        1.5,
        1.5,
        "S",
      );
      doc.setFontSize(6.5);
      doc.setTextColor(...COLORS.warning);
      doc.text("DRAFT", pageWidth - MARGIN - pillWidth / 2, 27, {
        align: "center",
      });
    }

    const dividerY = Math.max(34, companyBottom + 5);
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(0.45);
    doc.line(MARGIN, dividerY, pageWidth - MARGIN, dividerY);
    return drawInformationPanel(doc, data, dividerY + 5);
  }

  function drawInformationPanel(doc, data, y) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const width = pageWidth - MARGIN * 2;
    const panelHeight = 22;
    doc.setFillColor(...COLORS.surface);
    doc.roundedRect(MARGIN, y, width, panelHeight, 1.5, 1.5, "F");
    const customerX = MARGIN + 4;
    const projectX = MARGIN + 64;
    const datesX = pageWidth - MARGIN - 47;
    const customerWidth = 53;
    const projectWidth = datesX - projectX - 5;
    const dateFormat = data.settings.dateFormat || "dmy";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.3);
    doc.setTextColor(...COLORS.muted);
    doc.text("PREPARED FOR", customerX, y + 6);
    doc.text("PROJECT", projectX, y + 6);
    doc.text("DATE", datesX, y + 6);
    doc.text("VALID UNTIL", datesX + 24, y + 6);
    doc.setFontSize(8.4);
    doc.setTextColor(...COLORS.ink);
    doc.text(
      textLines(doc, [data.document.customerName || "-"], customerWidth),
      customerX,
      y + 11,
    );
    doc.text(
      textLines(doc, [data.document.projectName || "-"], projectWidth),
      projectX,
      y + 11,
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(
      displayDate(data.document.date, dateFormat),
      datesX,
      y + 11,
    );
    doc.text(
      displayDate(data.document.validUntil, dateFormat),
      datesX + 24,
      y + 11,
    );
    return y + panelHeight + 6;
  }

  function drawContinuationHeader(doc, data) {
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.primaryDark);
    doc.text(data.document.number || "BOQ", MARGIN, 11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.muted);
    doc.text(
      data.document.projectName || "Bill of Quantities",
      pageWidth - MARGIN,
      11,
      { align: "right" },
    );
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, 15, pageWidth - MARGIN, 15);
  }

  function pdfColumns(data) {
    const currency = data.document.currency || "";
    const columns = [
      { key: "index", label: "No", align: "center", width: 9 },
    ];
    if (data.settings.showSku === true) {
      columns.push({ key: "sku", label: "Part Number", width: 24 });
    }
    columns.push(
      { key: "item", label: "Item" },
      { key: "qty", label: "Qty", align: "right", width: 13 },
      { key: "unit", label: "Unit", align: "center", width: 16 },
    );
    if (data.settings.showUnitPricing !== false) {
      columns.push({
        key: "unitSelling",
        label: `Unit Price (${currency})`,
        align: "right",
        width: 27,
      });
    }
    columns.push({
      key: "totalSelling",
      label: `Total (${currency})`,
      align: "right",
      width: 30,
    });
    const fixedWidth = columns.reduce(
      (sum, column) => sum + Number(column.width || 0),
      0,
    );
    const itemColumn = columns.find((column) => column.key === "item");
    itemColumn.width = 180 - fixedWidth;
    return columns;
  }

  function pdfRows(data, columns) {
    const { calculateItem } = window.BOQCalculations;
    const { formatNumber } = window.BOQUtils;
    const decimals = data.document.currency === "IDR" ? 0 : 2;
    const rows = [];
    let index = 0;
    data.categories.forEach((category) => {
      rows.push([{
        content: category,
        colSpan: columns.length,
        styles: {
          fillColor: COLORS.primarySoft,
          textColor: COLORS.primaryDark,
          fontStyle: "bold",
          halign: "left",
          cellPadding: { top: 2.2, right: 2.4, bottom: 2.2, left: 2.4 },
        },
      }]);
      data.items.filter((item) => item.category === category).forEach(
        (item) => {
          const calculation = calculateItem(item);
          const values = {
            index: ++index,
            sku: item.sku || "",
            item: item.item,
            qty: calculation.quantity,
            unit: item.unit,
            unitSelling: formatNumber(calculation.unitSelling, decimals),
            totalSelling: formatNumber(calculation.totalSelling, decimals),
          };
          rows.push(columns.map((column) => values[column.key]));
        },
      );
    });
    if (!rows.length) {
      rows.push([{
        content: "No BOQ items",
        colSpan: columns.length,
        styles: {
          textColor: COLORS.muted,
          fillColor: COLORS.surface,
          minCellHeight: 14,
          valign: "middle",
        },
      }]);
    }
    return rows;
  }

  function footerLines(doc, data) {
    const text = String(data.settings.footerText || "").trim();
    return text ? doc.splitTextToSize(text, 130) : [];
  }

  function footerReserve(doc, data) {
    const lines = footerLines(doc, data);
    return Math.max(18, 13 + lines.length * 3.3);
  }

  function addFooters(doc, data) {
    const pageCount = doc.getNumberOfPages();
    const lines = footerLines(doc, data);
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const firstLineY = pageHeight - 8 - Math.max(0, lines.length - 1) * 3.2;
      doc.setDrawColor(...COLORS.border);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, firstLineY - 5, pageWidth - MARGIN, firstLineY - 5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.setTextColor(...COLORS.muted);
      if (lines.length) {
        doc.text(lines, MARGIN, firstLineY);
      } else {
        doc.text(data.document.number || "BOQ", MARGIN, firstLineY);
      }
      doc.text(`Page ${page} of ${pageCount}`, pageWidth - MARGIN, firstLineY, {
        align: "right",
      });
    }
  }

  function drawSummary(doc, data, startY, reserve) {
    const { formatCurrency } = window.BOQUtils;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const noteLines = data.document.notes
      ? doc.splitTextToSize(data.document.notes, 104)
      : [];
    const requiredHeight = Math.max(27, noteLines.length * 3.8 + 11);
    const contentBottom = pageHeight - reserve;
    let y = startY;
    if (y + requiredHeight > contentBottom) {
      doc.addPage();
      drawContinuationHeader(doc, data);
      y = 24;
    }

    if (noteLines.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.muted);
      doc.text("TERMS / NOTES", MARGIN, y + 2);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.ink);
      doc.text(noteLines, MARGIN, y + 8);
    }

    const cardWidth = 66;
    const cardHeight = 24;
    const cardX = pageWidth - MARGIN - cardWidth;
    doc.setFillColor(...COLORS.warningSoft);
    doc.roundedRect(cardX, y, cardWidth, cardHeight, 1.8, 1.8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...COLORS.muted);
    doc.text("GRAND TOTAL", cardX + 5, y + 7);
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.primaryDark);
    doc.text(data.document.currency || "", cardX + 5, y + 16);
    doc.setFontSize(13);
    doc.text(
      formatCurrency(data.document.totalSelling, data.document.currency),
      cardX + cardWidth - 5,
      y + 17,
      { align: "right" },
    );
  }

  function download(data, safeFilename) {
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
      {
        halign: column.align || "left",
        cellWidth: column.width,
      },
    ]));
    const reserve = footerReserve(doc, data);
    doc.autoTable({
      startY: tableStartY,
      margin: { top: 20, right: MARGIN, bottom: reserve, left: MARGIN },
      head: [columns.map((column) => column.label)],
      body: pdfRows(data, columns),
      theme: "grid",
      showHead: "everyPage",
      headStyles: {
        fillColor: COLORS.primary,
        textColor: COLORS.white,
        fontStyle: "bold",
        halign: "center",
        fontSize: 7,
        lineColor: COLORS.primary,
        lineWidth: 0.2,
        cellPadding: { top: 2.6, right: 2, bottom: 2.6, left: 2 },
      },
      styles: {
        font: "helvetica",
        fontSize: 7.5,
        textColor: COLORS.ink,
        lineColor: COLORS.border,
        lineWidth: 0.15,
        cellPadding: { top: 2.4, right: 2.2, bottom: 2.4, left: 2.2 },
        overflow: "linebreak",
        valign: "middle",
      },
      columnStyles,
      didDrawPage: (tablePage) => {
        if (tablePage.pageNumber > 1) drawContinuationHeader(doc, data);
      },
    });
    drawSummary(doc, data, doc.lastAutoTable.finalY + 9, reserve);
    addFooters(doc, data);
    const filename = [data.document.number, data.document.projectName]
      .filter(Boolean).map(safeFilename).join(" - ") || "BOQ";
    doc.save(`${filename}.pdf`);
  }

  window.BOQPdfExport = { download };
})();
