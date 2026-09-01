(function initializeDocumentExports() {
  if (!document.querySelector("[data-boq-editor]")) return;
  const WORD_LIBRARY_SOURCE =
    "https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.js";
  let wordLibraryPromise = null;

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

  function loadWordLibrary() {
    if (window.docx?.Document) return Promise.resolve();
    if (wordLibraryPromise) return wordLibraryPromise;
    wordLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = WORD_LIBRARY_SOURCE;
      script.dataset.wordExportLibrary = "true";
      script.onload = () => resolve();
      script.onerror = () => {
        wordLibraryPromise = null;
        reject(new Error("Word export library failed to load."));
      };
      document.head.append(script);
    });
    return wordLibraryPromise;
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

  async function exportWord(revisionNumber) {
    if (!window.BOQWordExport) {
      window.BOQApp.showToast("Word export is unavailable.", "error");
      return;
    }
    try {
      await loadWordLibrary();
      await window.BOQWordExport.download(
        editorData(revisionNumber),
        downloadBlob,
        safeFilename,
      );
      window.BOQApp.showToast("Word document downloaded.");
    } catch (error) {
      console.error(error);
      window.BOQApp.showToast("Unable to create the Word document.", "error");
    }
  }

  function setExcelRevisionTarget(revisionNumber) {
    const hasRevision = revisionNumber !== undefined &&
      revisionNumber !== null && revisionNumber !== "";
    document.querySelectorAll("#excel-modal [data-excel-mode]").forEach(
      (button) => {
        if (hasRevision) {
          button.dataset.exportRevision = revisionNumber;
        } else {
          button.removeAttribute("data-export-revision");
        }
      },
    );
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-export-excel]")) {
      setExcelRevisionTarget();
      window.BOQModal.open("excel-modal");
    }
    const modeButton = event.target.closest("[data-excel-mode]");
    if (modeButton) {
      window.BOQModal.close(document.getElementById("excel-modal"));
      void exportExcel(
        modeButton.dataset.excelMode,
        modeButton.dataset.exportRevision,
      );
    }
    const previewExcelButton = event.target.closest(
      "[data-download-preview-excel]",
    );
    if (previewExcelButton) {
      setExcelRevisionTarget(previewExcelButton.dataset.exportRevision);
      window.BOQModal.open("excel-modal");
    }
    const pdfButton = event.target.closest("[data-download-pdf]");
    if (pdfButton) exportPdf(pdfButton.dataset.exportRevision);
    const wordButton = event.target.closest("[data-download-word]");
    if (wordButton) void exportWord(wordButton.dataset.exportRevision);
  });

  document.addEventListener("boq:export-revision", (event) => {
    if (event.detail.type === "excel") {
      void exportExcel("selling", event.detail.number);
    } else if (event.detail.type === "pdf") {
      exportPdf(event.detail.number);
    } else if (event.detail.type === "word") {
      void exportWord(event.detail.number);
    }
  });

  const requestedExport = new URLSearchParams(location.search).get("export");
  if (requestedExport === "excel") {
    window.setTimeout(() => window.BOQModal.open("excel-modal"), 0);
  } else if (requestedExport === "pdf") {
    window.setTimeout(exportPdf, 0);
  } else if (requestedExport === "word") {
    window.setTimeout(() => void exportWord(), 0);
  }
})();
