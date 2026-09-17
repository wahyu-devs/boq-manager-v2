(function () {
  const editor = document.querySelector("[data-boq-editor]");
  if (!editor) return;

  const topbar = document.querySelector(".topbar");
  const header = editor.querySelector(".editor-page-header");
  const itemsPanel = editor.querySelector(".boq-items-panel");
  const itemsHeader = itemsPanel?.querySelector(".panel-header");
  const toolbar = itemsPanel?.querySelector(".editor-toolbar");
  if (!topbar || !header || !itemsHeader || !toolbar) return;

  let layoutFrame = null;

  function setLayoutProperty(name, value) {
    const formatted = `${value}px`;
    if (editor.style.getPropertyValue(name) !== formatted) {
      editor.style.setProperty(name, formatted);
    }
  }

  function updateEditorLayout() {
    layoutFrame = null;
    const topbarHeight = topbar.getBoundingClientRect().height;
    const headerHeight = header.getBoundingClientRect().height;
    // Hidden startup surfaces are measured again when they become visible.
    if (!topbarHeight || !headerHeight) return;

    setLayoutProperty("--editor-topbar-height", topbarHeight);
    setLayoutProperty("--editor-header-height", headerHeight);

    if (window.innerWidth < 992) {
      editor.style.removeProperty("--editor-summary-max-height");
    }
    if (window.innerWidth < 768) {
      editor.style.removeProperty("--editor-table-max-height");
      return;
    }

    const editorStyle = window.getComputedStyle(editor);
    const panelStyle = window.getComputedStyle(itemsPanel);
    const stickyGap = parseFloat(
      editorStyle.getPropertyValue("--editor-sticky-gap"),
    ) || 0;
    const bottomInset = parseFloat(editorStyle.paddingBottom) || 0;
    const panelBorders = (parseFloat(panelStyle.borderTopWidth) || 0) +
      (parseFloat(panelStyle.borderBottomWidth) || 0);
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const availableHeight = Math.max(
      0,
      viewportHeight - topbarHeight - headerHeight - stickyGap - bottomInset,
    );
    if (window.innerWidth >= 992) {
      setLayoutProperty("--editor-summary-max-height", availableHeight);
    }
    const tableHeight = Math.max(
      0,
      availableHeight - panelBorders - itemsHeader.getBoundingClientRect().height -
        toolbar.getBoundingClientRect().height,
    );
    // Only change layout tokens: keep the current rows, focus, and scroll position.
    setLayoutProperty("--editor-table-max-height", tableHeight);
  }

  function scheduleEditorLayout() {
    if (layoutFrame !== null) return;
    layoutFrame = window.requestAnimationFrame(updateEditorLayout);
  }

  if (window.ResizeObserver) {
    const observer = new window.ResizeObserver(scheduleEditorLayout);
    [topbar, header, itemsHeader, toolbar].forEach((element) =>
      observer.observe(element)
    );
  }
  window.addEventListener("resize", scheduleEditorLayout, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleEditorLayout, {
    passive: true,
  });
  document.addEventListener("boq:auth-ready", scheduleEditorLayout);
  document.addEventListener("boq:workspace-updated", scheduleEditorLayout);
  scheduleEditorLayout();
})();
