const componentsCss = await Deno.readTextFile(
  new URL("../css/components.css", import.meta.url),
);
const pdfScript = await Deno.readTextFile(
  new URL("../js/pdf-export.js", import.meta.url),
);
function assertIncludes(source, value, message) {
  if (!source.includes(value)) throw new Error(message);
}

Deno.test("spaces customer contact details above the preview divider", () => {
  assertIncludes(
    componentsCss,
    "min-height: 116px;\n  margin-bottom: 8px;",
    "Document Preview keeps space above the divider",
  );
});

Deno.test("fits long PDF Grand Total values without moving accounting columns", () => {
  [
    "const GRAND_TOTAL_FONT_SIZE = 10.25;",
    "const GRAND_TOTAL_MIN_FONT_SIZE = 8.25;",
    "doc.getTextWidth(symbol)",
    "availableWidth - ACCOUNTING_TEXT_GAP",
    "amountRightX - amountX",
  ].forEach((rule) =>
    assertIncludes(
      pdfScript,
      rule,
      `PDF Grand Total fitting is missing ${rule}`,
    )
  );

  const fakeWindow = {
    BOQCustomerDocument: {
      colorRgb: () => [0, 0, 0],
      layout: {
        pageMarginMm: 9,
        tableCellPaddingMm: 2.1,
        totalColumnWidthMm: 31,
      },
    },
  };
  new Function("window", pdfScript)(fakeWindow);
  const document = {
    fontSize: 0,
    setFontSize(value) {
      this.fontSize = value;
    },
    getTextWidth(value) {
      return String(value).length * this.fontSize * 0.18;
    },
  };
  const normalSize = fakeWindow.BOQPdfExport.fitAccountingFontSize(
    document,
    "Rp",
    "9.999.999",
    26.8,
  );
  if (normalSize !== 10.25) {
    throw new Error("short Grand Total values must keep the normal font size");
  }
  const fittedSize = fakeWindow.BOQPdfExport.fitAccountingFontSize(
    document,
    "Rp",
    "1.234.567.890",
    26.8,
  );
  if (fittedSize >= 10.25 || fittedSize < 8.25) {
    throw new Error("10-digit Grand Total values must use a safe fitted size");
  }
  if (document.fontSize !== fittedSize) {
    throw new Error("the fitted size must apply equally to the Grand Total row");
  }
});
