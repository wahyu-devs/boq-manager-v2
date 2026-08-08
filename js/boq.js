(function initializeBoqEditor() {
  const editor = document.querySelector("[data-boq-editor]");
  if (!editor) return;

  const { calculateItem, calculateSummary } = window.BOQCalculations;
  const { formatCurrency, formatPercent, escapeHtml } = window.BOQUtils;
  const store = window.BOQStore;
  const settings = store.getSettings();
  let nextId = 1;
  let dirty = false;
  let pendingDeleteId = null;
  let currentRecordId = new URLSearchParams(location.search).get("id");
  let items = [];
  const catalog = store.list("products").filter((product) =>
    product.status !== "Inactive"
  ).map((product) => ({
    sku: product.sku,
    item: product.name,
    description: product.description || "",
    unit: product.unit || "Each",
    unitCogs: Number(product.defaultCogs || 0),
    margin: Number(product.defaultMargin || 0),
  }));

  const desktopBody = editor.querySelector("[data-items-body]");
  const mobileList = editor.querySelector("[data-mobile-items]");
  const currencySelect = document.querySelector("#boq-currency");

  function currentCurrency() {
    return currencySelect?.value || "USD";
  }

  function populateRecordOptions() {
    const projectSelect = document.querySelector("#boq-project");
    const customerSelect = document.querySelector("#boq-customer");
    projectSelect.innerHTML = '<option value="">No project selected</option>' +
      store.list("projects").map((project) =>
        `<option value="${project.id}">${escapeHtml(project.name)}</option>`
      ).join("");
    customerSelect.innerHTML =
      '<option value="">No customer selected</option>' +
      store.list("customers").map((customer) =>
        `<option value="${customer.id}">${
          escapeHtml(customer.companyName)
        }</option>`
      ).join("");
  }

  function localDate(date) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  function initializeDocument() {
    populateRecordOptions();
    const record = currentRecordId ? store.get("boqs", currentRecordId) : null;
    if (record) {
      document.querySelector("#boq-number").value = record.number || "";
      document.querySelector("#boq-title").value = record.title || "";
      document.querySelector("#boq-status").value = record.status === "Sent"
        ? "Sent"
        : "Draft";
      document.querySelector("#boq-project").value = record.projectId || "";
      document.querySelector("#boq-customer").value = record.customerId || "";
      document.querySelector("#boq-currency").value = record.currency || "USD";
      document.querySelector("#boq-date").value = record.date || "";
      document.querySelector("#boq-valid-until").value = record.validUntil ||
        "";
      document.querySelector("#boq-notes").value = record.notes || "";
      items = (record.items || []).map((item, index) => ({
        ...item,
        id: index + 1,
      }));
      nextId = items.length + 1;
      document.querySelector("[data-save-state]").textContent =
        "All changes saved";
    } else {
      currentRecordId = null;
      const today = new Date();
      const validUntil = new Date(today);
      validUntil.setDate(
        validUntil.getDate() + Number(settings.defaultValidity || 30),
      );
      document.querySelector("#boq-number").value = store.nextNumber(
        "boqs",
        "BOQ",
      );
      document.querySelector("#boq-date").value = localDate(today);
      document.querySelector("#boq-valid-until").value = localDate(validUntil);
      document.querySelector("#boq-currency").value =
        settings.defaultCurrency || "USD";
    }
    updateEditorHeader();
  }

  function updateEditorHeader() {
    const title = document.querySelector("#boq-title").value.trim();
    const number = document.querySelector("#boq-number").value.trim();
    const status = document.querySelector("#boq-status").value;
    document.querySelector("[data-editor-title]").textContent = title ||
      "New BOQ";
    document.querySelector("[data-editor-number]").textContent = number ||
      "New";
    const statusNode = document.querySelector("[data-editor-status]");
    statusNode.textContent = status;
    statusNode.className = `status status-${status.toLowerCase()}`;
  }

  function desktopRow(item, index) {
    const calc = calculateItem(item);
    return `<tr data-item-row data-item-id="${item.id}">
      <td class="align-right"><span class="subtle number">${
      index + 1
    }</span></td>
      <td><input class="editor-input" data-item-input data-field="item" data-item-id="${item.id}" value="${
      escapeHtml(item.item)
    }" aria-label="Item name, row ${
      index + 1
    }"><span class="cell-secondary mono">${
      escapeHtml(item.sku || "CUSTOM")
    }</span></td>
      <td><input class="editor-input" data-item-input data-field="description" data-item-id="${item.id}" value="${
      escapeHtml(item.description)
    }" aria-label="Description, row ${index + 1}"></td>
      <td><input class="editor-input numeric" data-item-input data-field="qty" data-item-id="${item.id}" type="number" min="0" step="0.01" value="${item.qty}" aria-label="Quantity, row ${
      index + 1
    }"></td>
      <td><select class="editor-input" data-item-input data-field="unit" data-item-id="${item.id}" aria-label="Unit, row ${
      index + 1
    }">${
      ["Each", "Lot", "Meter", "Hour", "Day", "Month"].map((unit) =>
        `<option${unit === item.unit ? " selected" : ""}>${unit}</option>`
      ).join("")
    }</select></td>
      <td><input class="editor-input numeric" data-item-input data-field="unitCogs" data-item-id="${item.id}" type="number" min="0" step="0.01" value="${item.unitCogs}" aria-label="Unit COGS, row ${
      index + 1
    }"></td>
      <td class="calculated-cell" data-item-output="totalCogs">${
      formatCurrency(calc.totalCogs, currentCurrency())
    }</td>
      <td><input class="editor-input numeric" data-item-input data-field="margin" data-item-id="${item.id}" type="number" min="0" max="99.99" step="0.1" value="${item.margin}" aria-label="Gross margin percentage, row ${
      index + 1
    }"></td>
      <td class="calculated-cell" data-item-output="unitSelling">${
      formatCurrency(calc.unitSelling, currentCurrency())
    }</td>
      <td class="calculated-cell" data-item-output="totalSelling">${
      formatCurrency(calc.totalSelling, currentCurrency())
    }</td>
      <td><div class="row-actions"><button class="icon-button" type="button" data-item-action="move-up" data-item-id="${item.id}" aria-label="Move ${
      escapeHtml(item.item)
    } up" ${
      index === 0 ? "disabled" : ""
    }>↑</button><button class="icon-button" type="button" data-item-action="move-down" data-item-id="${item.id}" aria-label="Move ${
      escapeHtml(item.item)
    } down" ${
      index === items.length - 1 ? "disabled" : ""
    }>↓</button><div class="menu-wrap"><button class="icon-button" type="button" data-menu-trigger aria-expanded="false" aria-label="More actions for ${
      escapeHtml(item.item)
    }">•••</button><div class="dropdown-menu" hidden><button class="menu-item" type="button" data-item-action="duplicate" data-item-id="${item.id}">Duplicate item</button><button class="menu-item danger-text" type="button" data-confirm data-confirm-event="boq:delete-item" data-target-id="${item.id}" data-confirm-title="Delete ${
      escapeHtml(item.item)
    }?" data-confirm-message="This item will be removed from the BOQ and all totals will be recalculated.">Delete item</button></div></div></div></td>
    </tr>`;
  }

  function mobileCard(item, index) {
    const calc = calculateItem(item);
    return `<article class="mobile-item-card" data-item-row data-item-id="${item.id}">
      <div class="mobile-item-head"><div><span class="subtle text-sm">Item ${
      index + 1
    } · ${
      escapeHtml(item.sku || "Custom")
    }</span><input class="editor-input text-medium" data-item-input data-field="item" data-item-id="${item.id}" value="${
      escapeHtml(item.item)
    }" aria-label="Item name, item ${
      index + 1
    }"></div><div class="row-actions"><button class="icon-button" type="button" data-item-action="duplicate" data-item-id="${item.id}" aria-label="Duplicate ${
      escapeHtml(item.item)
    }">⧉</button><button class="icon-button danger-text" type="button" data-confirm data-confirm-event="boq:delete-item" data-target-id="${item.id}" data-confirm-title="Delete ${
      escapeHtml(item.item)
    }?" data-confirm-message="This item will be removed and totals recalculated." aria-label="Delete ${
      escapeHtml(item.item)
    }">×</button></div></div>
      <div class="mobile-item-body">
        <label class="field"><span class="field-label">Description</span><input class="input input-sm" data-item-input data-field="description" data-item-id="${item.id}" value="${
      escapeHtml(item.description)
    }"></label>
        <label class="field"><span class="field-label">Unit</span><select class="select select-sm" data-item-input data-field="unit" data-item-id="${item.id}">${
      ["Each", "Lot", "Meter", "Hour", "Day", "Month"].map((unit) =>
        `<option${unit === item.unit ? " selected" : ""}>${unit}</option>`
      ).join("")
    }</select></label>
        <label class="field"><span class="field-label">Quantity</span><input class="input input-sm align-right" data-item-input data-field="qty" data-item-id="${item.id}" type="number" min="0" step="0.01" value="${item.qty}"></label>
        <label class="field"><span class="field-label">Unit COGS</span><input class="input input-sm align-right" data-item-input data-field="unitCogs" data-item-id="${item.id}" type="number" min="0" step="0.01" value="${item.unitCogs}"></label>
        <label class="field"><span class="field-label">Gross margin %</span><input class="input input-sm align-right" data-item-input data-field="margin" data-item-id="${item.id}" type="number" min="0" max="99.99" step="0.1" value="${item.margin}"></label>
        <div class="field"><span class="field-label">Unit selling</span><strong class="calculated-cell" data-item-output="unitSelling">${
      formatCurrency(calc.unitSelling, currentCurrency())
    }</strong></div>
        <div class="mobile-item-total"><span class="muted">Total selling</span><strong data-item-output="totalSelling">${
      formatCurrency(calc.totalSelling, currentCurrency())
    }</strong></div>
      </div>
    </article>`;
  }

  function renderItems() {
    desktopBody.innerHTML = items.map(desktopRow).join("");
    mobileList.innerHTML = items.map(mobileCard).join("");
    editor.querySelector("[data-editor-table]").hidden = items.length === 0;
    editor.querySelector("[data-items-empty]").hidden = items.length > 0;
    editor.querySelector("[data-item-count]").textContent =
      `${items.length} item${items.length === 1 ? "" : "s"}`;
    updateSummary();
  }

  function syncItem(item) {
    const calc = calculateItem(item);
    document.querySelectorAll(`[data-item-id="${item.id}"][data-item-input]`)
      .forEach((input) => {
        if (document.activeElement !== input) {
          input.value = item[input.dataset.field];
        }
      });
    document.querySelectorAll(`[data-item-row][data-item-id="${item.id}"]`)
      .forEach((row) => {
        row.querySelectorAll('[data-item-output="totalCogs"]').forEach(
          (cell) => {
            cell.textContent = formatCurrency(
              calc.totalCogs,
              currentCurrency(),
            );
          },
        );
        row.querySelectorAll('[data-item-output="unitSelling"]').forEach(
          (cell) => {
            cell.textContent = formatCurrency(
              calc.unitSelling,
              currentCurrency(),
            );
          },
        );
        row.querySelectorAll('[data-item-output="totalSelling"]').forEach(
          (cell) => {
            cell.textContent = formatCurrency(
              calc.totalSelling,
              currentCurrency(),
            );
          },
        );
      });
    updateSummary();
  }

  function updateSummary() {
    const summary = calculateSummary(items);
    const values = {
      totalCogs: formatCurrency(summary.totalCogs, currentCurrency()),
      totalSelling: formatCurrency(summary.totalSelling, currentCurrency()),
      marginValue: formatCurrency(summary.marginValue, currentCurrency()),
      marginPercent: formatPercent(summary.marginPercent),
    };
    Object.entries(values).forEach(([key, value]) => {
      document.querySelectorAll(`[data-summary="${key}"]`).forEach(
        (element) => {
          element.textContent = value;
        },
      );
    });
  }

  function markDirty() {
    dirty = true;
    document.querySelectorAll("[data-save-state]").forEach((element) => {
      element.textContent = "Unsaved changes";
    });
  }

  function addItem(source) {
    items.push({
      id: nextId++,
      sku: source.sku || "CUSTOM",
      item: source.item || "",
      description: source.description || "",
      qty: source.qty || 1,
      unit: source.unit || "Each",
      unitCogs: source.unitCogs || 0,
      margin: source.margin ?? Number(settings.defaultMargin || 0),
    });
    renderItems();
    markDirty();
    window.BOQApp.showToast(
      source.item ? `${source.item} added.` : "Custom item added.",
    );
  }

  function duplicateItem(id) {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return;
    const duplicate = {
      ...items[index],
      id: nextId++,
      sku: items[index].sku === "CUSTOM"
        ? "CUSTOM"
        : `${items[index].sku}-COPY`,
      item: `${items[index].item} (Copy)`,
    };
    items.splice(index + 1, 0, duplicate);
    renderItems();
    markDirty();
  }

  function moveItem(id, direction) {
    const index = items.findIndex((item) => item.id === id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= items.length) return;
    [items[index], items[destination]] = [items[destination], items[index]];
    renderItems();
    markDirty();
  }

  function updateCatalogResults() {
    const query = (document.querySelector("[data-catalog-search]")?.value || "")
      .toLowerCase();
    const host = document.querySelector("[data-catalog-list]");
    const filtered = catalog.filter((product) =>
      `${product.sku} ${product.item} ${product.description}`.toLowerCase()
        .includes(query)
    );
    host.innerHTML = filtered.length
      ? filtered.map((product, index) =>
        `<div class="catalog-row"><div><strong>${
          escapeHtml(product.item)
        }</strong><span>${escapeHtml(product.sku)} · ${
          escapeHtml(product.description)
        }</span></div><div class="align-right"><strong>${
          formatCurrency(product.unitCogs, currentCurrency())
        }</strong><span>${product.margin}% default margin</span></div><button class="button button-secondary button-sm" type="button" data-add-product="${
          catalog.indexOf(product)
        }">Add</button></div>`
      ).join("")
      : '<div class="empty-state catalog-empty"><div class="empty-state-content"><h3>No products found</h3><p>Try searching by product name, SKU, or description.</p></div></div>';
  }

  function xmlEscape(value) {
    return escapeHtml(value).replaceAll("&#039;", "&apos;");
  }

  function createWorksheetXml() {
    const info = {
      number: document.querySelector("#boq-number").value,
      title: document.querySelector("#boq-title").value,
      project:
        document.querySelector("#boq-project").selectedOptions[0]?.text || "",
      customer:
        document.querySelector("#boq-customer").selectedOptions[0]?.text || "",
      date: document.querySelector("#boq-date").value,
      valid: document.querySelector("#boq-valid-until").value,
      notes: document.querySelector("#boq-notes").value,
    };
    const rows = [];
    const stringCell = (ref, value, style = 0) =>
      `<c r="${ref}" t="inlineStr" s="${style}"><is><t>${
        xmlEscape(value)
      }</t></is></c>`;
    const numberCell = (ref, value, style = 0) =>
      `<c r="${ref}" s="${style}"><v>${Number(value).toFixed(2)}</v></c>`;
    rows.push(
      `<row r="1">${stringCell("A1", "BOQ Manager", 2)}${
        stringCell("B1", info.title, 2)
      }</row>`,
    );
    rows.push(
      `<row r="2">${stringCell("A2", "Company")}${
        stringCell("B2", settings.companyName || "")
      }</row>`,
    );
    rows.push(
      `<row r="3">${stringCell("A3", "BOQ Number")}${
        stringCell("B3", info.number)
      }${stringCell("D3", "Date")}${stringCell("E3", info.date)}</row>`,
    );
    rows.push(
      `<row r="4">${stringCell("A4", "Customer")}${
        stringCell("B4", info.customer)
      }${stringCell("D4", "Valid Until")}${stringCell("E4", info.valid)}</row>`,
    );
    rows.push(
      `<row r="5">${stringCell("A5", "Project")}${
        stringCell("B5", info.project)
      }</row>`,
    );
    const headers = [
      "Item",
      "Description",
      "Qty",
      "Unit",
      "Unit COGS",
      "Total COGS",
      "Gross Margin %",
      "Unit Selling",
      "Total Selling",
    ];
    rows.push(
      `<row r="7">${
        headers.map((header, index) =>
          stringCell(`${String.fromCharCode(65 + index)}7`, header, 3)
        ).join("")
      }</row>`,
    );
    items.forEach((item, index) => {
      const rowNumber = index + 8;
      const calc = calculateItem(item);
      rows.push(
        `<row r="${rowNumber}">${stringCell(`A${rowNumber}`, item.item)}${
          stringCell(`B${rowNumber}`, item.description)
        }${numberCell(`C${rowNumber}`, item.qty)}${
          stringCell(`D${rowNumber}`, item.unit)
        }${numberCell(`E${rowNumber}`, item.unitCogs, 1)}${
          numberCell(`F${rowNumber}`, calc.totalCogs, 1)
        }${numberCell(`G${rowNumber}`, item.margin, 4)}${
          numberCell(`H${rowNumber}`, calc.unitSelling, 1)
        }${numberCell(`I${rowNumber}`, calc.totalSelling, 1)}</row>`,
      );
    });
    const summary = calculateSummary(items);
    const totalRow = items.length + 9;
    rows.push(
      `<row r="${totalRow}">${stringCell(`G${totalRow}`, "Grand Total", 3)}${
        numberCell(`I${totalRow}`, summary.totalSelling, 5)
      }</row>`,
    );
    rows.push(
      `<row r="${totalRow + 2}">${
        stringCell(`A${totalRow + 2}`, "Terms / Notes")
      }${stringCell(`B${totalRow + 2}`, info.notes)}</row>`,
    );
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="48" customWidth="1"/><col min="3" max="9" width="15" customWidth="1"/></cols><sheetData>${
      rows.join("")
    }</sheetData></worksheet>`;
  }

  function crc32(bytes) {
    let crc = -1;
    for (const byte of bytes) {
      crc ^= byte;
      for (let i = 0; i < 8; i += 1) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return (crc ^ -1) >>> 0;
  }

  function createStoredZip(files) {
    const encoder = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    const write16 = (view, position, value) =>
      view.setUint16(position, value, true);
    const write32 = (view, position, value) =>
      view.setUint32(position, value, true);

    Object.entries(files).forEach(([name, content]) => {
      const nameBytes = encoder.encode(name);
      const data = encoder.encode(content);
      const checksum = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(local.buffer);
      write32(localView, 0, 0x04034b50);
      write16(localView, 4, 20);
      write16(localView, 6, 0);
      write16(localView, 8, 0);
      write16(localView, 10, 0);
      write16(localView, 12, 0);
      write32(localView, 14, checksum);
      write32(localView, 18, data.length);
      write32(localView, 22, data.length);
      write16(localView, 26, nameBytes.length);
      write16(localView, 28, 0);
      local.set(nameBytes, 30);
      parts.push(local, data);

      const entry = new Uint8Array(46 + nameBytes.length);
      const entryView = new DataView(entry.buffer);
      write32(entryView, 0, 0x02014b50);
      write16(entryView, 4, 20);
      write16(entryView, 6, 20);
      write16(entryView, 8, 0);
      write16(entryView, 10, 0);
      write16(entryView, 12, 0);
      write16(entryView, 14, 0);
      write32(entryView, 16, checksum);
      write32(entryView, 20, data.length);
      write32(entryView, 24, data.length);
      write16(entryView, 28, nameBytes.length);
      write16(entryView, 30, 0);
      write16(entryView, 32, 0);
      write16(entryView, 34, 0);
      write16(entryView, 36, 0);
      write32(entryView, 38, 0);
      write32(entryView, 42, offset);
      entry.set(nameBytes, 46);
      central.push(entry);
      offset += local.length + data.length;
    });

    const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    write32(endView, 0, 0x06054b50);
    write16(endView, 4, 0);
    write16(endView, 6, 0);
    write16(endView, 8, central.length);
    write16(endView, 10, central.length);
    write32(endView, 12, centralSize);
    write32(endView, 16, offset);
    write16(endView, 20, 0);
    return new Blob([...parts, ...central, end], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  function exportExcel() {
    const files = {
      "[Content_Types].xml":
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      "_rels/.rels":
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      "xl/workbook.xml":
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="BOQ" sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels":
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      "xl/styles.xml":
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>',
      "xl/worksheets/sheet1.xml": createWorksheetXml(),
    };
    const link = document.createElement("a");
    link.href = URL.createObjectURL(createStoredZip(files));
    link.download = `${
      document.querySelector("#boq-number").value || "BOQ"
    }.xlsx`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    window.BOQApp.showToast("Excel workbook downloaded.");
  }

  function buildPdfPreview() {
    const host = document.querySelector("[data-pdf-preview]");
    const summary = calculateSummary(items);
    const number = document.querySelector("#boq-number").value;
    const title = document.querySelector("#boq-title").value;
    const project =
      document.querySelector("#boq-project").selectedOptions[0]?.text || "";
    const customer =
      document.querySelector("#boq-customer").selectedOptions[0]?.text || "";
    const date = document.querySelector("#boq-date").value;
    const valid = document.querySelector("#boq-valid-until").value;
    const notes = document.querySelector("#boq-notes").value;
    const companyDetails = [settings.address, settings.email, settings.phone]
      .filter(Boolean).map(escapeHtml).join("<br>");
    const companyLogo = settings.companyLogo
      ? `<img class="pdf-company-logo" src="${settings.companyLogo}" alt="">`
      : "";
    host.innerHTML =
      `<div class="pdf-preview-content"><header class="pdf-preview-header"><div>${companyLogo}<strong class="pdf-company">${
        escapeHtml(settings.companyName || "Company information not configured")
      }</strong><p>${companyDetails}</p></div><div class="align-right"><h2>Bill of Quantities</h2><p><strong>${
        escapeHtml(number)
      }</strong><br>Date: ${escapeHtml(date)}<br>Valid until: ${
        escapeHtml(valid)
      }</p></div></header><div class="pdf-parties"><div><span>Prepared for</span><strong>${
        escapeHtml(customer)
      }</strong></div><div><span>Project</span><strong>${
        escapeHtml(project)
      }</strong><small>${
        escapeHtml(title)
      }</small></div></div><table class="pdf-preview-table"><thead><tr><th>#</th><th>Item & description</th><th class="align-right">Qty</th><th>Unit</th><th class="align-right">Unit price</th><th class="align-right">Total</th></tr></thead><tbody>${
        items.map((item, index) => {
          const calc = calculateItem(item);
          return `<tr><td>${index + 1}</td><td><strong>${
            escapeHtml(item.item)
          }</strong><br><span>${
            escapeHtml(item.description)
          }</span></td><td class="align-right">${item.qty}</td><td>${
            escapeHtml(item.unit)
          }</td><td class="align-right">${
            formatCurrency(calc.unitSelling, currentCurrency())
          }</td><td class="align-right"><strong>${
            formatCurrency(calc.totalSelling, currentCurrency())
          }</strong></td></tr>`;
        }).join("")
      }</tbody></table><div class="pdf-preview-total"><div><span>Subtotal</span><strong>${
        formatCurrency(summary.totalSelling, currentCurrency())
      }</strong></div><div class="grand-total"><span>Grand total</span><strong>${
        formatCurrency(summary.totalSelling, currentCurrency())
      }</strong></div></div><div class="pdf-notes"><strong>Terms / Notes</strong><p>${
        escapeHtml(notes)
      }</p></div><footer class="pdf-footer">Generated by BOQ Manager · Pricing excludes applicable taxes unless stated otherwise.</footer></div>`;
  }

  function saveDocument() {
    const summary = calculateSummary(items);
    const projectSelect = document.querySelector("#boq-project");
    const customerSelect = document.querySelector("#boq-customer");
    const existing = currentRecordId
      ? store.get("boqs", currentRecordId)
      : null;
    const record = store.save("boqs", {
      id: currentRecordId || undefined,
      createdAt: existing?.createdAt,
      number: document.querySelector("#boq-number").value.trim(),
      title: document.querySelector("#boq-title").value.trim(),
      status: document.querySelector("#boq-status").value,
      projectId: projectSelect.value,
      projectName: projectSelect.value
        ? projectSelect.selectedOptions[0]?.text || ""
        : "",
      customerId: customerSelect.value,
      customerName: customerSelect.value
        ? customerSelect.selectedOptions[0]?.text || ""
        : "",
      currency: currentCurrency(),
      date: document.querySelector("#boq-date").value,
      validUntil: document.querySelector("#boq-valid-until").value,
      notes: document.querySelector("#boq-notes").value.trim(),
      items: items.map(({ id, ...item }) => item),
      ...summary,
    });
    currentRecordId = record.id;
    history.replaceState(
      null,
      "",
      `boq-editor.html?id=${encodeURIComponent(record.id)}`,
    );
    updateEditorHeader();
  }

  editor.addEventListener("input", (event) => {
    const input = event.target.closest("[data-item-input]");
    if (!input) return;
    const item = items.find((entry) =>
      entry.id === Number(input.dataset.itemId)
    );
    if (!item) return;
    const numericFields = ["qty", "unitCogs", "margin"];
    const numericValue = Math.max(0, Number(input.value) || 0);
    item[input.dataset.field] = numericFields.includes(input.dataset.field)
      ? input.dataset.field === "margin"
        ? Math.min(numericValue, 99.99)
        : numericValue
      : input.value;
    syncItem(item);
    markDirty();
  });

  editor.addEventListener("change", (event) => {
    const input = event.target.closest("[data-item-input]");
    if (!input) return;
    const item = items.find((entry) =>
      entry.id === Number(input.dataset.itemId)
    );
    if (item) {
      const numericFields = ["qty", "unitCogs", "margin"];
      const numericValue = Math.max(0, Number(input.value) || 0);
      item[input.dataset.field] = numericFields.includes(input.dataset.field)
        ? input.dataset.field === "margin"
          ? Math.min(numericValue, 99.99)
          : numericValue
        : input.value;
      input.value = item[input.dataset.field];
      syncItem(item);
      markDirty();
    }
  });

  editor.addEventListener("click", (event) => {
    const action = event.target.closest("[data-item-action]");
    if (!action) return;
    const id = Number(action.dataset.itemId);
    if (action.dataset.itemAction === "duplicate") duplicateItem(id);
    if (action.dataset.itemAction === "move-up") moveItem(id, -1);
    if (action.dataset.itemAction === "move-down") moveItem(id, 1);
  });

  editor.addEventListener("keydown", (event) => {
    const input = event.target.closest(".editor-table [data-item-input]");
    if (!input || !["Enter", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      return;
    }
    if (
      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      (input.selectionStart !== input.selectionEnd ||
        (event.key === "ArrowLeft" && input.selectionStart > 0) ||
        (event.key === "ArrowRight" &&
          input.selectionStart < input.value.length))
    ) return;
    const inputs = [
      ...editor.querySelectorAll(".editor-table [data-item-input]"),
    ];
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const next = inputs[inputs.indexOf(input) + direction];
    if (next) {
      event.preventDefault();
      next.focus();
      next.select?.();
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-add-custom]")) addItem({});
    const productButton = event.target.closest("[data-add-product]");
    if (productButton) {
      addItem(catalog[Number(productButton.dataset.addProduct)]);
      window.BOQModal.close(document.getElementById("catalog-modal"));
    }
    if (event.target.closest("[data-export-excel]")) exportExcel();
    if (event.target.closest("[data-preview-pdf]")) buildPdfPreview();
    if (event.target.closest("[data-download-pdf]")) {
      buildPdfPreview();
      window.BOQModal.open("pdf-modal");
      window.setTimeout(() => window.print(), 250);
    }
  });

  document.addEventListener("boq:delete-item", (event) => {
    pendingDeleteId = Number(event.detail.targetId);
    const index = items.findIndex((item) => item.id === pendingDeleteId);
    if (index < 0) return;
    const [removed] = items.splice(index, 1);
    renderItems();
    markDirty();
    window.BOQApp.showToast(`${removed.item} removed.`, "success", {
      label: "Undo",
      callback: () => {
        items.splice(index, 0, removed);
        renderItems();
        markDirty();
      },
    });
  });

  document.querySelector("[data-catalog-search]")?.addEventListener(
    "input",
    updateCatalogResults,
  );
  document.querySelectorAll(
    "#boq-info input, #boq-info select, #boq-info textarea",
  ).forEach((input) =>
    input.addEventListener("input", () => {
      updateEditorHeader();
      markDirty();
    })
  );
  currencySelect?.addEventListener("change", () => {
    renderItems();
    markDirty();
  });
  document.addEventListener("boq:saved", () => {
    saveDocument();
    dirty = false;
    document.querySelectorAll("[data-save-state]").forEach((element) => {
      element.textContent = "All changes saved";
    });
  });
  window.addEventListener("beforeunload", (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  initializeDocument();
  renderItems();
  updateCatalogResults();
})();
