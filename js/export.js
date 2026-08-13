(function initializeDocumentExports() {
  if (!document.querySelector("[data-boq-editor]")) return;

  function editorData(revisionNumber) {
    if (revisionNumber !== undefined && revisionNumber !== null &&
        revisionNumber !== "") {
      return window.BOQEditor.getRevisionExportData(revisionNumber);
    }
    return window.BOQEditor.getExportData();
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

  async function exportExcel(mode, revisionNumber) {
    if (!window.ExcelJS || !window.BOQExcelExport) {
      window.BOQApp.showToast(
        "Excel export library is unavailable.",
        "error",
      );
      return;
    }
    try {
      await window.BOQExcelExport.download(
        editorData(revisionNumber),
        mode,
        downloadBlob,
        safeFilename,
      );
      window.BOQApp.showToast("Excel workbook downloaded.");
    } catch (error) {
      console.error(error);
      window.BOQApp.showToast("Unable to create the Excel workbook.", "error");
    }
  }

  function exportPdf(revisionNumber) {
    if (!window.jspdf?.jsPDF || !window.BOQPdfExport) {
      window.BOQApp.showToast("PDF export library is unavailable.", "error");
      return;
    }
    try {
      window.BOQPdfExport.download(editorData(revisionNumber), safeFilename);
      window.BOQApp.showToast("PDF downloaded.");
    } catch (error) {
      console.error(error);
      window.BOQApp.showToast("Unable to create the PDF.", "error");
    }
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
    const pdfButton = event.target.closest("[data-download-pdf]");
    if (pdfButton) exportPdf(pdfButton.dataset.exportRevision);
  });

  document.addEventListener("boq:export-revision", (event) => {
    if (event.detail.type === "excel") {
      void exportExcel("selling", event.detail.number);
    } else if (event.detail.type === "pdf") {
      exportPdf(event.detail.number);
    }
  });

  const requestedExport = new URLSearchParams(location.search).get("export");
  if (requestedExport === "excel") {
    window.setTimeout(() => window.BOQModal.open("excel-modal"), 0);
  } else if (requestedExport === "pdf") {
    window.setTimeout(exportPdf, 0);
  }
})();
