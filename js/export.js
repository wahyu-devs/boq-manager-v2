(function initializeDocumentExports() {
  if (!document.querySelector("[data-boq-editor]")) return;

  function editorData() {
    return {
      document: window.BOQEditor.getDocument(),
      items: window.BOQEditor.getItems(),
      categories: window.BOQEditor.getCategories(),
      settings: window.BOQEditor.getSettings(),
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

  async function exportExcel(mode) {
    if (!window.ExcelJS || !window.BOQExcelExport) {
      window.BOQApp.showToast(
        "Excel export library is unavailable.",
        "error",
      );
      return;
    }
    try {
      await window.BOQExcelExport.download(
        editorData(),
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

  function exportPdf() {
    if (!window.jspdf?.jsPDF || !window.BOQPdfExport) {
      window.BOQApp.showToast("PDF export library is unavailable.", "error");
      return;
    }
    try {
      window.BOQPdfExport.download(editorData(), safeFilename);
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
    if (event.target.closest("[data-download-pdf]")) exportPdf();
  });

  const requestedExport = new URLSearchParams(location.search).get("export");
  if (requestedExport === "excel") {
    window.setTimeout(() => window.BOQModal.open("excel-modal"), 0);
  } else if (requestedExport === "pdf") {
    window.setTimeout(exportPdf, 0);
  }
})();
