(function defineWordExport() {
  const customerDocument = window.BOQCustomerDocument;
  const TWIPS_PER_MM = 1440 / 25.4;
  const PAGE_WIDTH = Math.round(210 * TWIPS_PER_MM);
  const PAGE_HEIGHT = Math.round(297 * TWIPS_PER_MM);
  const PAGE_MARGIN = Math.round(
    customerDocument.layout.pageMarginMm * TWIPS_PER_MM,
  );
  const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
  const CELL_PADDING = Math.round(
    customerDocument.layout.tableCellPaddingMm * TWIPS_PER_MM,
  );
  const COLORS = customerDocument.palette;

  function mmToTwips(value) {
    return Math.round(value * TWIPS_PER_MM);
  }

  function fullWidth() {
    return { size: CONTENT_WIDTH, type: window.docx.WidthType.DXA };
  }

  function noBorder() {
    return {
      style: window.docx.BorderStyle.NONE,
      size: 0,
      color: COLORS.white,
    };
  }

  function noBorders() {
    const border = noBorder();
    return {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    };
  }

  function bottomBorder() {
    return {
      top: noBorder(),
      bottom: {
        style: window.docx.BorderStyle.SINGLE,
        size: 2,
        color: COLORS.border,
      },
      left: noBorder(),
      right: noBorder(),
    };
  }

  function margins(value = CELL_PADDING) {
    return { top: value, bottom: value, left: value, right: value };
  }

  function run(text, options = {}) {
    return new window.docx.TextRun({
      text: String(text ?? ""),
      font: "Arial",
      color: options.color || COLORS.body,
      size: options.size || 16,
      bold: options.bold === true,
      break: options.break,
    });
  }

  function paragraph(children, options = {}) {
    return new window.docx.Paragraph({
      children: Array.isArray(children) ? children : [run(children, options)],
      alignment: options.alignment,
      spacing: {
        before: options.before || 0,
        after: options.after || 0,
        line: options.line || 240,
        lineRule: window.docx.LineRuleType.AUTO,
      },
      keepNext: options.keepNext,
      tabStops: options.tabStops,
      border: options.border,
    });
  }

  function spacer(heightMm) {
    return paragraph([run(" ", { size: 2, color: COLORS.white })], {
      line: 20,
      after: mmToTwips(heightMm),
    });
  }

  function cell(children, options = {}) {
    return new window.docx.TableCell({
      children,
      width: options.width
        ? { size: options.width, type: window.docx.WidthType.DXA }
        : undefined,
      columnSpan: options.columnSpan,
      shading: options.fill
        ? { fill: options.fill, type: window.docx.ShadingType.CLEAR }
        : undefined,
      margins: options.margins || margins(),
      borders: options.borders || noBorders(),
      verticalAlign: options.verticalAlign || window.docx.VerticalAlign.CENTER,
    });
  }

  function textCell(text, options = {}) {
    return cell([
      paragraph([run(text, options)], {
        alignment: options.alignment,
        keepNext: options.keepNext,
      }),
    ], options);
  }

  function accountingTable(value, currency, width, settings, options = {}) {
    const formatted = window.BOQUtils.formatCurrencyParts(
      value,
      currency,
      undefined,
      settings.numberFormat,
    );
    const innerWidth = Math.max(600, width - CELL_PADDING * 2);
    const symbolWidth = Math.min(mmToTwips(5), Math.floor(innerWidth / 3));
    const valueWidth = innerWidth - symbolWidth;
    return new window.docx.Table({
      width: { size: innerWidth, type: window.docx.WidthType.DXA },
      columnWidths: [symbolWidth, valueWidth],
      layout: window.docx.TableLayoutType.FIXED,
      borders: noBorders(),
      rows: [
        new window.docx.TableRow({
          cantSplit: true,
          children: [
            textCell(formatted.symbol, {
              width: symbolWidth,
              ...options,
              alignment: window.docx.AlignmentType.LEFT,
              margins: margins(0),
              borders: noBorders(),
            }),
            textCell(formatted.value, {
              width: valueWidth,
              ...options,
              alignment: window.docx.AlignmentType.RIGHT,
              margins: margins(0),
              borders: noBorders(),
            }),
          ],
        }),
      ],
    });
  }

  function currencyCell(value, currency, width, settings, options = {}) {
    return cell([
      accountingTable(value, currency, width, settings, options),
      paragraph([run("", { size: 2 })]),
    ], { ...options, width });
  }

  function imageType(source) {
    const match = String(source).match(/^data:image\/(png|jpe?g|gif|bmp);/i);
    if (!match) return null;
    return match[1].toLowerCase().replace("jpeg", "jpg");
  }

  function imageDimensions(data, type) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (type === "png" && data.byteLength >= 24) {
      return {
        width: view.getUint32(16),
        height: view.getUint32(20),
      };
    }
    if (type === "gif" && data.byteLength >= 10) {
      return {
        width: view.getUint16(6, true),
        height: view.getUint16(8, true),
      };
    }
    if (type === "bmp" && data.byteLength >= 26) {
      return {
        width: Math.abs(view.getInt32(18, true)),
        height: Math.abs(view.getInt32(22, true)),
      };
    }
    if (type === "jpg") {
      let offset = 2;
      while (offset + 8 < data.byteLength) {
        if (data[offset] !== 0xFF) {
          offset += 1;
          continue;
        }
        const marker = data[offset + 1];
        const isStartOfFrame = marker >= 0xC0 && marker <= 0xCF &&
          ![0xC4, 0xC8, 0xCC].includes(marker);
        if (isStartOfFrame) {
          return {
            width: view.getUint16(offset + 7),
            height: view.getUint16(offset + 5),
          };
        }
        const length = view.getUint16(offset + 2);
        if (length < 2) break;
        offset += length + 2;
      }
    }
    return null;
  }

  async function logoParagraph(source) {
    const type = imageType(source);
    if (!source || !type) return null;
    try {
      const response = await fetch(source);
      if (!response.ok) return null;
      const data = new Uint8Array(await response.arrayBuffer());
      const dimensions = imageDimensions(data, type);
      const ratio = dimensions?.width && dimensions?.height
        ? Math.min(144 / dimensions.width, 64 / dimensions.height)
        : 1;
      const width = dimensions
        ? Math.max(1, Math.round(dimensions.width * ratio))
        : 144;
      const height = dimensions
        ? Math.max(1, Math.round(dimensions.height * ratio))
        : 64;
      return paragraph([
        new window.docx.ImageRun({
          data,
          type,
          transformation: { width, height },
          altText: {
            title: "Company logo",
            description: "Company logo",
            name: "Company logo",
          },
        }),
      ], { after: 80 });
    } catch (_error) {
      return null;
    }
  }

  function detailParagraphs(settings) {
    const contact = [settings.email, settings.phone]
      .filter(Boolean).join(" | ");
    const entries = [
      {
        text: settings.registrationNumber
          ? `Registration no.: ${settings.registrationNumber}`
          : "",
      },
      { text: settings.address, isAddress: true },
      { text: contact },
    ].filter((entry) => entry.text);
    return entries.map((entry) =>
      paragraph([run(entry.text, { color: COLORS.muted, size: 15 })], {
        after: entry.isAddress && contact ? 70 : 0,
      })
    );
  }

  async function documentHeader(data) {
    const leftWidth = mmToTwips(116);
    const gapWidth = mmToTwips(10);
    const rightWidth = mmToTwips(66);
    const logo = await logoParagraph(data.settings.companyLogo);
    const leftChildren = [
      ...(logo ? [logo] : []),
      paragraph([
        run(
          data.settings.companyName || "Company information not configured",
          { bold: true, color: COLORS.company, size: 22 },
        ),
      ], { after: 40 }),
    ];
    const details = detailParagraphs(data.settings);
    if (details.length) leftChildren.push(...details);

    const rightChildren = [
      paragraph([run("BILL OF QUANTITIES", {
        bold: true,
        color: COLORS.heading,
        size: 26,
      })], { alignment: window.docx.AlignmentType.RIGHT, after: 80 }),
      paragraph([run(customerDocument.documentReference(data.document), {
        bold: true,
        color: COLORS.ink,
        size: 16,
      })], { alignment: window.docx.AlignmentType.RIGHT, after: 80 }),
      paragraph([run(customerDocument.documentBanner(data.document), {
        bold: true,
        color: COLORS.banner,
        size: 14,
      })], { alignment: window.docx.AlignmentType.RIGHT }),
    ];
    return new window.docx.Table({
      width: fullWidth(),
      columnWidths: [leftWidth, gapWidth, rightWidth],
      layout: window.docx.TableLayoutType.FIXED,
      borders: noBorders(),
      rows: [
        new window.docx.TableRow({
          cantSplit: true,
          children: [
            cell(leftChildren, { width: leftWidth, margins: margins(0) }),
            cell([paragraph("")], { width: gapWidth, margins: margins(0) }),
            cell(rightChildren, { width: rightWidth, margins: margins(0) }),
          ],
        }),
      ],
    });
  }

  function divider() {
    return paragraph([run(" ", { size: 2, color: COLORS.primary })], {
      line: 20,
      border: {
        bottom: {
          style: window.docx.BorderStyle.SINGLE,
          color: COLORS.primary,
          size: 48,
          space: 0,
        },
      },
    });
  }

  function partyCell(label, values, width, options = {}) {
    const children = [paragraph([run(label.toUpperCase(), {
      bold: true,
      color: COLORS.muted,
      size: 13,
    })], { after: 50 })];
    values.filter(Boolean).forEach((value) => {
      children.push(paragraph([run(value, {
        bold: options.bold !== false,
        color: COLORS.ink,
        size: 16,
      })], { after: 18 }));
    });
    return cell(children, {
      width,
      fill: COLORS.surface,
      margins: margins(mmToTwips(2)),
    });
  }

  function partiesTable(data) {
    const customerWidth = mmToTwips(46.08);
    const projectWidth = mmToTwips(105.6);
    const dateWidth = CONTENT_WIDTH - customerWidth - projectWidth;
    return new window.docx.Table({
      width: fullWidth(),
      columnWidths: [customerWidth, projectWidth, dateWidth],
      layout: window.docx.TableLayoutType.FIXED,
      borders: noBorders(),
      rows: [
        new window.docx.TableRow({
          cantSplit: true,
          children: [
            partyCell(
              "Prepared for",
              [data.document.customerName || "-"],
              customerWidth,
            ),
            partyCell(
              "Project",
              [data.document.projectName || "-"],
              projectWidth,
            ),
            partyCell(
              "Issued / Valid Until",
              [data.document.date || "-", data.document.validUntil || "-"],
              dateWidth,
              { bold: false },
            ),
          ],
        }),
      ],
    });
  }

  function bodyAlignment(column) {
    if (column.align === "right") return window.docx.AlignmentType.RIGHT;
    if (column.align === "center") return window.docx.AlignmentType.CENTER;
    return window.docx.AlignmentType.LEFT;
  }

  function headerCell(column, width) {
    return textCell(column.label, {
      width,
      fill: COLORS.tableHead,
      color: COLORS.tableHeadText,
      bold: true,
      size: 14,
      alignment: window.docx.AlignmentType.CENTER,
      margins: margins(CELL_PADDING),
      borders: bottomBorder(),
    });
  }

  function itemCells(item, index, data, columns, columnWidths) {
    const calculation = window.BOQCalculations.calculateItem(item, {
      rounding: data.settings.rounding,
    });
    const values = {
      index,
      sku: item.sku || "",
      item: item.item || "",
      qty: item.qty,
      unit: item.unit || "",
    };
    return columns.map((column, columnIndex) => {
      const width = columnWidths[columnIndex];
      if (column.key === "unitSelling") {
        return currencyCell(
          calculation.unitSelling,
          data.document.currency,
          width,
          data.settings,
          { borders: bottomBorder(), size: 16 },
        );
      }
      if (column.key === "totalSelling") {
        return currencyCell(
          calculation.totalSelling,
          data.document.currency,
          width,
          data.settings,
          { borders: bottomBorder(), size: 16 },
        );
      }
      return textCell(values[column.key], {
        width,
        size: 16,
        alignment: bodyAlignment(column),
        borders: bottomBorder(),
      });
    });
  }

  function grandTotalRow(data, columns, columnWidths) {
    const amountIndex = columns.length - 1;
    const labelStart = Math.max(0, amountIndex - 2);
    const blankWidth = columnWidths.slice(0, labelStart).reduce(
      (sum, width) => sum + width,
      0,
    );
    const labelWidth = columnWidths.slice(labelStart, amountIndex).reduce(
      (sum, width) => sum + width,
      0,
    );
    const children = [];
    if (labelStart > 0) {
      children.push(cell([paragraph("")], {
        width: blankWidth,
        columnSpan: labelStart,
        margins: margins(0),
      }));
    }
    children.push(
      textCell("GRAND TOTAL", {
        width: labelWidth,
        columnSpan: amountIndex - labelStart,
        fill: COLORS.primarySoft,
        color: COLORS.heading,
        bold: true,
        size: 18,
        alignment: window.docx.AlignmentType.RIGHT,
      }),
      currencyCell(
        data.document.totalSelling,
        data.document.currency,
        columnWidths[amountIndex],
        data.settings,
        {
          fill: COLORS.primarySoft,
          color: COLORS.heading,
          bold: true,
          size: 21,
        },
      ),
    );
    return new window.docx.TableRow({ cantSplit: true, children });
  }

  function grandTotalSpacerRow(columns) {
    return new window.docx.TableRow({
      cantSplit: true,
      children: [cell([spacer(5.8)], {
        width: CONTENT_WIDTH,
        columnSpan: columns.length,
        margins: margins(0),
      })],
    });
  }

  function itemsTable(data) {
    const columns = customerDocument.columns(data.settings);
    const columnWidths = columns.map((column) => mmToTwips(column.widthMm));
    columnWidths[columnWidths.length - 1] += CONTENT_WIDTH -
      columnWidths.reduce((sum, width) => sum + width, 0);
    const rows = [
      new window.docx.TableRow({
        tableHeader: true,
        cantSplit: true,
        children: columns.map((column, index) =>
          headerCell(column, columnWidths[index])
        ),
      }),
    ];
    let index = 0;
    data.categories.forEach((category) => {
      rows.push(
        new window.docx.TableRow({
          cantSplit: true,
          children: [textCell(category, {
            columnSpan: columns.length,
            fill: COLORS.primarySoft,
            color: COLORS.heading,
            bold: true,
            size: 16,
            alignment: window.docx.AlignmentType.LEFT,
            borders: bottomBorder(),
          })],
        }),
      );
      data.items.filter((item) =>
        (item.category || "Uncategorized") === category
      ).forEach((item) => {
        index += 1;
        rows.push(
          new window.docx.TableRow({
            cantSplit: true,
            children: itemCells(item, index, data, columns, columnWidths),
          }),
        );
      });
    });
    if (!data.items.length) {
      rows.push(
        new window.docx.TableRow({
          cantSplit: true,
          children: [textCell("No BOQ items", {
            columnSpan: columns.length,
            fill: COLORS.surface,
            color: COLORS.muted,
            size: 16,
            alignment: window.docx.AlignmentType.LEFT,
            borders: bottomBorder(),
          })],
        }),
      );
    }
    rows.push(grandTotalSpacerRow(columns));
    rows.push(grandTotalRow(data, columns, columnWidths));
    return new window.docx.Table({
      width: fullWidth(),
      columnWidths,
      layout: window.docx.TableLayoutType.FIXED,
      borders: noBorders(),
      rows,
    });
  }

  function notes(data) {
    const value = String(data.document.notes || "").trim();
    if (!value) return [];
    return [
      spacer(8),
      paragraph([run("TERMS / NOTES", {
        bold: true,
        color: COLORS.muted,
        size: 13,
      })], { after: 80, keepNext: true }),
      new window.docx.Table({
        width: fullWidth(),
        columnWidths: [CONTENT_WIDTH],
        layout: window.docx.TableLayoutType.FIXED,
        borders: noBorders(),
        rows: [
          new window.docx.TableRow({
            children: [textCell(value, {
              width: CONTENT_WIDTH,
              fill: COLORS.surface,
              color: COLORS.note,
              size: 16,
              alignment: window.docx.AlignmentType.LEFT,
              margins: margins(mmToTwips(2)),
            })],
          }),
        ],
      }),
    ];
  }

  function footerText(data) {
    const value = String(data.settings.footerText || "").trim();
    if (!value) return [];
    return [
      spacer(9),
      paragraph([run(value, { color: COLORS.footer, size: 13 })], {
        alignment: window.docx.AlignmentType.CENTER,
        before: 80,
        border: {
          top: {
            style: window.docx.BorderStyle.SINGLE,
            color: COLORS.border,
            size: 2,
            space: 6,
          },
        },
      }),
    ];
  }

  function pageFooter(data) {
    const halfWidth = Math.floor(CONTENT_WIDTH / 2);
    return new window.docx.Footer({
      children: [
        new window.docx.Table({
          width: fullWidth(),
          columnWidths: [halfWidth, CONTENT_WIDTH - halfWidth],
          layout: window.docx.TableLayoutType.FIXED,
          borders: noBorders(),
          rows: [
            new window.docx.TableRow({
              cantSplit: true,
              children: [
                textCell(customerDocument.documentReference(data.document), {
                  width: halfWidth,
                  color: COLORS.footer,
                  size: 13,
                  alignment: window.docx.AlignmentType.LEFT,
                  margins: margins(0),
                }),
                cell([paragraph([
                  run("Page ", { color: COLORS.footer, size: 13 }),
                  new window.docx.TextRun({
                    children: [window.docx.PageNumber.CURRENT],
                    font: "Arial",
                    color: COLORS.footer,
                    size: 13,
                  }),
                  run(" of ", { color: COLORS.footer, size: 13 }),
                  new window.docx.TextRun({
                    children: [window.docx.PageNumber.TOTAL_PAGES],
                    font: "Arial",
                    color: COLORS.footer,
                    size: 13,
                  }),
                ], { alignment: window.docx.AlignmentType.RIGHT })], {
                  width: CONTENT_WIDTH - halfWidth,
                  margins: margins(0),
                }),
              ],
            }),
          ],
        }),
      ],
    });
  }

  async function create(data) {
    const header = await documentHeader(data);
    const children = [
      header,
      divider(),
      partiesTable(data),
      spacer(7),
      itemsTable(data),
      ...notes(data),
      ...footerText(data),
    ];
    return new window.docx.Document({
      creator: data.settings.companyName || "BOQ Manager",
      lastModifiedBy: "BOQ Manager",
      title: `${customerDocument.documentReference(data.document)} - ${
        data.document.projectName || "Bill of Quantities"
      }`,
      subject: "Customer Bill of Quantities",
      description: "Customer-ready BOQ generated by BOQ Manager",
      keywords: "BOQ, Bill of Quantities, quotation",
      styles: {
        default: {
          document: {
            run: { font: "Arial", size: 16, color: COLORS.body },
            paragraph: { spacing: { before: 0, after: 0, line: 240 } },
          },
        },
      },
      sections: [{
        properties: {
          page: {
            size: {
              width: PAGE_WIDTH,
              height: PAGE_HEIGHT,
              orientation: window.docx.PageOrientation.PORTRAIT,
            },
            margin: {
              top: PAGE_MARGIN,
              right: PAGE_MARGIN,
              bottom: PAGE_MARGIN,
              left: PAGE_MARGIN,
              header: mmToTwips(5),
              footer: mmToTwips(5),
            },
          },
        },
        footers: { default: pageFooter(data) },
        children,
      }],
    });
  }

  async function download(data, downloadBlob, safeFilename) {
    const documentValue = await create(data);
    const blob = await window.docx.Packer.toBlob(documentValue);
    downloadBlob(
      blob,
      customerDocument.filename(data, safeFilename, "docx"),
    );
  }

  window.BOQWordExport = { create, download };
})();
