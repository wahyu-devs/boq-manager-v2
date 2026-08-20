(function defineDataStore() {
  const appPrefix = "boq-manager-v2";
  const previousPrefix = "boq-manager-v1";
  const sessionUserKey = "boq-manager-session-user";
  const collections = ["boqs", "products", "customers"];
  const defaultBoqNumberingFormat = "BOQ-{YY}{MM}{NN}";
  const schemaVersion = 5;
  let activeUserId = localStorage.getItem(sessionUserKey) || "guest";

  function namespace(userId = activeUserId) {
    return `${appPrefix}:${userId || "guest"}`;
  }

  function storageKey(key, userId = activeUserId) {
    return `${namespace(userId)}:${key}`;
  }

  function parseJson(value, fallback) {
    if (value === null || value === undefined || value === "") return fallback;
    try {
      return JSON.parse(value);
    } catch (_error) {
      return fallback;
    }
  }

  function read(key, fallback) {
    return parseJson(localStorage.getItem(storageKey(key)), fallback);
  }

  function write(key, value, options = {}) {
    localStorage.setItem(storageKey(key), JSON.stringify(value));
    if (!options.silent) touch();
    return value;
  }

  function createId() {
    return globalThis.crypto?.randomUUID?.() ||
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function stableId(type, value) {
    const input = `${type}:${String(value || "").trim().toLowerCase()}`;
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${type}-${(hash >>> 0).toString(36)}`;
  }

  function touch() {
    const meta = read("meta", {});
    const next = { ...meta, clientUpdatedAt: Date.now() };
    localStorage.setItem(storageKey("meta"), JSON.stringify(next));
    document.dispatchEvent(new CustomEvent("boq:data-changed", {
      detail: { clientUpdatedAt: next.clientUpdatedAt },
    }));
  }

  function cloneValue(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function revisionLabel(number) {
    return `R${String(Math.max(0, Number(number) || 0)).padStart(2, "0")}`;
  }

  function isIssuedStatus(value) {
    return value === "Issued" || value === "Sent";
  }

  function isIssuedRevision(revision) {
    return revision?.state === "Issued" || revision?.state === "Sent";
  }

  function revisionDocument(record) {
    const value = record || {};
    return cloneValue({
      number: value.number || "",
      status: isIssuedStatus(value.status) ? "Issued" : "Draft",
      projectName: value.projectName || "",
      customerId: value.customerId || "",
      customerName: value.customerName || "",
      currency: value.currency || "IDR",
      date: value.date || "",
      validUntil: value.validUntil || "",
      notes: value.notes || "",
      items: Array.isArray(value.items) ? value.items : [],
      commission: Number(value.commission || 0),
      categoryOrder: Array.isArray(value.categoryOrder)
        ? value.categoryOrder
        : [],
      totalCogs: Number(value.totalCogs || 0),
      totalSelling: Number(value.totalSelling || 0),
      marginValue: Number(value.marginValue || 0),
      marginPercent: Number(value.marginPercent || 0),
    });
  }

  function normalizeRevision(revision, index = 0) {
    const number = Math.max(0, Number(revision?.number ?? index) || 0);
    const issuedAt = isoTimestamp(revision?.issuedAt) ||
      isoTimestamp(revision?.snapshot?.updatedAt) ||
      isoTimestamp(revision?.snapshot?.date);
    return {
      id: revision?.id || createId(),
      number,
      label: revisionLabel(number),
      state: revision?.state === "Voided" ? "Voided" : "Issued",
      issuedAt,
      issuedBy: String(revision?.issuedBy || ""),
      note: String(revision?.note || ""),
      voidedAt: isoTimestamp(revision?.voidedAt),
      voidReason: String(revision?.voidReason || ""),
      sourceRecordId: String(revision?.sourceRecordId || ""),
      sourceNumber: String(revision?.sourceNumber || ""),
      document: revisionDocument(revision?.document || revision?.snapshot || {}),
      companySettings: cloneValue(revision?.companySettings || {}),
      customer: cloneValue(revision?.customer || {}),
      calculation: cloneValue(revision?.calculation || {
        version: 1,
        marginMethod: "gross-margin",
      }),
    };
  }

  function latestIssuedRevision(record) {
    const revisions = Array.isArray(record?.revisions) ? record.revisions : [];
    return [...revisions].reverse().find((revision) =>
      isIssuedRevision(revision)
    ) || null;
  }

  function issuedBoqView(record) {
    const normalized = normalizeBoq(record || {});
    const revision = latestIssuedRevision(normalized);
    if (normalized.workingRevision === null || !revision) return normalized;
    return {
      ...normalized,
      ...cloneValue(revision.document),
      status: "Issued",
      revisions: normalized.revisions,
      activeRevisionNumber: revision.number,
      workingRevision: normalized.workingRevision,
      hasDraftChanges: true,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
    };
  }

  function registerBoqView(record) {
    const normalized = normalizeBoq(record || {});
    const isDraftRevision = normalized.workingRevision !== null;
    const displayRevisionNumber = isDraftRevision
      ? normalized.workingRevision
      : normalized.activeRevisionNumber;
    return {
      ...normalized,
      status: isDraftRevision ? "Draft" : normalized.status,
      displayRevisionNumber: displayRevisionNumber ?? 0,
    };
  }

  function nextRevisionNumber(record) {
    const revisions = Array.isArray(record?.revisions) ? record.revisions : [];
    return revisions.reduce((highest, revision) =>
      Math.max(highest, Number(revision.number) || 0), -1
    ) + 1;
  }

  function normalizeBoq(record, legacyProjects = [], timestampFallbacks = {}) {
    const {
      title: legacyTitle,
      projectId: legacyProjectId,
      createdAt: rawCreatedAt,
      updatedAt: rawUpdatedAt,
      ...value
    } = record || {};
    const linkedProject = legacyProjectId && Array.isArray(legacyProjects)
      ? legacyProjects.find((project) => project.id === legacyProjectId)
      : null;
    const projectName = String(value.projectName || "").trim() ||
      String(linkedProject?.name || "").trim() ||
      String(legacyTitle || "").trim();
    const createdAt = isoTimestamp(rawCreatedAt) ||
      isoTimestamp(linkedProject?.createdAt) ||
      isoTimestamp(timestampFallbacks.createdAt);
    const updatedAt = isoTimestamp(rawUpdatedAt) ||
      isoTimestamp(linkedProject?.updatedAt) ||
      isoTimestamp(linkedProject?.lastSaved) ||
      isoTimestamp(timestampFallbacks.updatedAt) ||
      isoTimestamp(timestampFallbacks.clientUpdatedAt) || createdAt;
    const revisions = Array.isArray(value.revisions)
      ? value.revisions.map(normalizeRevision).sort((left, right) =>
        left.number - right.number ||
        timestampValue(left.issuedAt) - timestampValue(right.issuedAt)
      )
      : [];
    const activeRevision = [...revisions].reverse().find((revision) =>
      isIssuedRevision(revision)
    );
    const workingRevision = value.workingRevision === null ||
        value.workingRevision === undefined || value.workingRevision === ""
      ? null
      : Math.max(0, Number(value.workingRevision) || 0);
    return {
      ...value,
      status: activeRevision || isIssuedStatus(value.status)
        ? "Issued"
        : "Draft",
      projectName,
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
      items: Array.isArray(value.items) ? value.items : [],
      commission: Number(value.commission || 0),
      categoryOrder: Array.isArray(value.categoryOrder)
        ? value.categoryOrder
        : [],
      revisions,
      activeRevisionNumber: activeRevision?.number ?? null,
      workingRevision,
      hasDraftChanges: Boolean(value.hasDraftChanges && workingRevision !== null),
    };
  }

  function normalizeProduct(record) {
    const value = { ...(record || {}) };
    delete value.description;
    return value;
  }

  function list(collection) {
    if (!collections.includes(collection)) return [];
    const records = read(collection, []);
    if (!Array.isArray(records)) return [];
    if (collection === "boqs") return records.map(normalizeBoq);
    if (collection === "products") return records.map(normalizeProduct);
    return records;
  }

  function get(collection, id) {
    const records = list(collection);
    const direct = records.find((record) => record.id === id);
    if (direct || collection !== "boqs") return direct || null;
    const alias = read("meta", {}).boqRevisionAliases?.[id];
    return alias
      ? records.find((record) => record.id === alias) || null
      : null;
  }

  function save(collection, record, options = {}) {
    if (!collections.includes(collection)) return null;
    const records = list(collection);
    const now = new Date().toISOString();
    const id = record.id || createId();
    const existing = records.find((entry) => entry.id === id);
    const value = {
      ...record,
      id,
      createdAt: isoTimestamp(record.createdAt) || existing?.createdAt || now,
      updatedAt: options.preserveUpdatedAt
        ? isoTimestamp(record.updatedAt) || existing?.updatedAt || now
        : now,
    };
    const normalized = collection === "boqs"
      ? normalizeBoq(value)
      : collection === "products"
      ? normalizeProduct(value)
      : value;
    const existingIndex = records.findIndex((entry) =>
      entry.id === normalized.id
    );
    if (existingIndex >= 0) records[existingIndex] = normalized;
    else records.unshift(normalized);
    write(collection, records, options);
    return normalized;
  }

  function remove(collection, id) {
    if (!collections.includes(collection)) return false;
    if (collection === "boqs") {
      const record = get("boqs", id);
      if (record?.status === "Issued" || record?.revisions?.length) return false;
    }
    write(collection, list(collection).filter((record) => record.id !== id));
    return true;
  }

  function saveBoqDraft(record) {
    const existing = record?.id ? get("boqs", record.id) : null;
    const activeRevision = latestIssuedRevision(existing);
    let workingRevision = existing?.workingRevision ?? null;
    let draftBaseRevisionNumber = existing?.draftBaseRevisionNumber ?? null;
    if (activeRevision && workingRevision === null) {
      const requestedWorkingRevision = record?.workingRevision === null ||
          record?.workingRevision === undefined || record?.workingRevision === ""
        ? null
        : Math.max(0, Number(record.workingRevision) || 0);
      const sourceRevision = getRevision(
        existing,
        record?.draftBaseRevisionNumber,
      );
      const isPreparedRevision = requestedWorkingRevision ===
          nextRevisionNumber(existing) && isIssuedRevision(sourceRevision);
      if (!isPreparedRevision) {
        throw new Error("Create a revision before editing an issued BOQ.");
      }
      workingRevision = requestedWorkingRevision;
      draftBaseRevisionNumber = sourceRevision.number;
    }
    return save("boqs", {
      ...existing,
      ...record,
      status: activeRevision ? "Issued" : "Draft",
      revisions: existing?.revisions || [],
      activeRevisionNumber: activeRevision?.number ?? null,
      workingRevision,
      draftBaseRevisionNumber,
      hasDraftChanges: Boolean(activeRevision),
      createdAt: existing?.createdAt || record?.createdAt,
    });
  }

  function validateBoqForIssue(record) {
    const errors = [];
    const addError = (field, message, itemId = "") => {
      errors.push({ field, message, itemId });
    };
    if (!String(record?.number || "").trim()) {
      addError("number", "Enter a BOQ number before marking it as issued.");
    }
    if (!String(record?.projectName || "").trim()) {
      addError("projectName", "Enter a project before marking this BOQ as issued.");
    }
    if (!String(record?.date || "").trim()) {
      addError("date", "Enter a BOQ date before marking it as issued.");
    }
    const recordItems = Array.isArray(record?.items) ? record.items : [];
    if (!recordItems.length) {
      addError("items", "Add at least one BOQ item before marking it as issued.");
    }
    recordItems.forEach((item, index) => {
      const itemNumber = index + 1;
      const itemId = String(item?.id || "");
      if (!String(item?.item || "").trim()) {
        addError("item", `Enter a name for item ${itemNumber}.`, itemId);
      }
      if (!(Number(item?.qty) > 0)) {
        addError(
          "qty",
          `Quantity for item ${itemNumber} must be greater than zero.`,
          itemId,
        );
      }
      if (!String(item?.unit || "").trim()) {
        addError("unit", `Select a unit for item ${itemNumber}.`, itemId);
      }
      const unitCogs = Number(item?.unitCogs);
      if (!Number.isFinite(unitCogs) || unitCogs < 0) {
        addError(
          "unitCogs",
          `Enter a valid Unit COGS for item ${itemNumber}.`,
          itemId,
        );
      }
      const margin = Number(item?.margin);
      if (!Number.isFinite(margin) || margin < 0 || margin > 99.99) {
        addError(
          "margin",
          `Margin for item ${itemNumber} must be between 0% and 99.99%.`,
          itemId,
        );
      }
      if (item?.sellingOverride !== null &&
          item?.sellingOverride !== undefined && item?.sellingOverride !== "") {
        const sellingOverride = Number(item.sellingOverride);
        if (!Number.isFinite(sellingOverride) || sellingOverride < 0) {
          addError(
            "sellingOverride",
            `Enter a valid Unit Selling Price for item ${itemNumber}.`,
            itemId,
          );
        }
      }
    });
    return {
      valid: errors.length === 0,
      errors,
      message: errors[0]?.message || "",
    };
  }

  function issueBoq(record, metadata = {}) {
    const validation = validateBoqForIssue(record);
    if (!validation.valid) throw new Error(validation.message);
    const existing = record?.id ? get("boqs", record.id) : null;
    const activeRevision = latestIssuedRevision(existing);
    let number = existing?.workingRevision ?? null;
    if (activeRevision && number === null) {
      const requestedWorkingRevision = record?.workingRevision === null ||
          record?.workingRevision === undefined || record?.workingRevision === ""
        ? null
        : Math.max(0, Number(record.workingRevision) || 0);
      const sourceRevision = getRevision(
        existing,
        record?.draftBaseRevisionNumber,
      );
      const isPreparedRevision = requestedWorkingRevision ===
          nextRevisionNumber(existing) && isIssuedRevision(sourceRevision);
      if (!isPreparedRevision) {
        throw new Error("This issued revision is locked.");
      }
      number = requestedWorkingRevision;
    }
    number ??= nextRevisionNumber(existing);
    const issuedAt = new Date().toISOString();
    const documentValue = revisionDocument({
      ...existing,
      ...record,
      status: "Issued",
    });
    const revision = normalizeRevision({
      id: createId(),
      number,
      state: "Issued",
      issuedAt,
      issuedBy: metadata.issuedBy || "",
      note: metadata.note || "",
      document: documentValue,
      companySettings: metadata.companySettings || {},
      customer: metadata.customer || {},
      calculation: {
        version: 1,
        marginMethod: "gross-margin",
        rounding: metadata.rounding || "2",
        numberFormat: metadata.numberFormat || "comma",
      },
    });
    return save("boqs", {
      ...existing,
      ...documentValue,
      id: existing?.id || record?.id,
      status: "Issued",
      revisions: [...(existing?.revisions || []), revision],
      activeRevisionNumber: number,
      workingRevision: null,
      draftBaseRevisionNumber: null,
      hasDraftChanges: false,
      issuedAt,
      createdAt: existing?.createdAt || record?.createdAt,
    });
  }

  function prepareRevisionDraft(id, sourceNumber) {
    let record = get("boqs", id);
    let activeRevision = latestIssuedRevision(record);
    if (record?.status === "Issued" && !record.revisions.length) {
      record = migratedRevisionRecord([{
        record,
        parsed: { revision: null },
      }], record.projectName);
      activeRevision = latestIssuedRevision(record);
    }
    const sourceRevision = sourceNumber === undefined || sourceNumber === null
      ? activeRevision
      : getRevision(record, sourceNumber);
    if (!record || !activeRevision || record.workingRevision !== null) {
      return null;
    }
    if (!sourceRevision || !isIssuedRevision(sourceRevision)) return null;
    return normalizeBoq({
      ...record,
      ...cloneValue(sourceRevision.document),
      id: record.id,
      status: "Issued",
      revisions: record.revisions,
      activeRevisionNumber: activeRevision.number,
      workingRevision: nextRevisionNumber(record),
      draftBaseRevisionNumber: sourceRevision.number,
      hasDraftChanges: true,
      createdAt: record.createdAt,
    });
  }

  function createRevisionDraft(id, sourceNumber) {
    const draft = prepareRevisionDraft(id, sourceNumber);
    return draft ? save("boqs", draft) : null;
  }

  function discardBoqDraft(id) {
    const record = get("boqs", id);
    if (!record) return null;
    if (!record.revisions.length) {
      remove("boqs", id);
      return { removed: true };
    }
    if (record.workingRevision === null) return null;
    const activeRevision = latestIssuedRevision(record);
    if (!activeRevision) {
      const lastRevision = record.revisions.at(-1);
      return save("boqs", {
        ...record,
        ...cloneValue(lastRevision.document),
        id: record.id,
        status: "Draft",
        revisions: record.revisions,
        activeRevisionNumber: null,
        workingRevision: null,
        draftBaseRevisionNumber: null,
        hasDraftChanges: false,
        createdAt: record.createdAt,
      });
    }
    return save("boqs", {
      ...record,
      ...cloneValue(activeRevision.document),
      id: record.id,
      status: "Issued",
      revisions: record.revisions,
      activeRevisionNumber: activeRevision.number,
      workingRevision: null,
      draftBaseRevisionNumber: null,
      hasDraftChanges: false,
      createdAt: record.createdAt,
    });
  }

  function voidLatestRevision(id, reason) {
    const record = get("boqs", id);
    const explanation = String(reason || "").trim();
    if (!record || !explanation || record.workingRevision !== null) return null;
    const revisions = record.revisions.slice();
    const latest = revisions.at(-1);
    if (!latest || !isIssuedRevision(latest)) return null;
    revisions[revisions.length - 1] = normalizeRevision({
      ...latest,
      state: "Voided",
      voidedAt: new Date().toISOString(),
      voidReason: explanation,
    });
    const previous = [...revisions].reverse().find((revision) =>
      isIssuedRevision(revision)
    );
    const restoredDocument = cloneValue(
      previous?.document || latest.document,
    );
    return save("boqs", {
      ...record,
      ...restoredDocument,
      id: record.id,
      status: previous ? "Issued" : "Draft",
      revisions,
      activeRevisionNumber: previous?.number ?? null,
      workingRevision: previous ? null : nextRevisionNumber({ revisions }),
      draftBaseRevisionNumber: previous ? null : latest.number,
      hasDraftChanges: !previous,
      createdAt: record.createdAt,
    });
  }

  function getRevision(recordOrId, number) {
    const record = typeof recordOrId === "string"
      ? get("boqs", recordOrId)
      : normalizeBoq(recordOrId || {});
    return record?.revisions.find((revision) =>
      revision.number === Number(number)
    ) || null;
  }

  function escapePattern(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function numberingTokens(format, date = new Date()) {
    return {
      YYYY: String(date.getFullYear()),
      YY: String(date.getFullYear()).slice(-2),
      MM: String(date.getMonth() + 1).padStart(2, "0"),
    };
  }

  function formatDocumentNumber(format, sequence, date = new Date()) {
    const template = String(format || defaultBoqNumberingFormat);
    const tokens = numberingTokens(template, date);
    return template.replace(/\{(YYYY|YY|MM|N+)\}/g, (token, name) => {
      if (name.startsWith("N")) {
        return String(sequence).padStart(name.length, "0");
      }
      return tokens[name];
    });
  }

  function isValidNumberingFormat(format) {
    return (String(format || "").match(/\{N+\}/g) || []).length === 1;
  }

  function numberingMatcher(format, date = new Date()) {
    const template = String(format || defaultBoqNumberingFormat);
    const tokens = numberingTokens(template, date);
    let sequenceCaptured = false;
    let cursor = 0;
    let pattern = "";
    for (const match of template.matchAll(/\{(YYYY|YY|MM|N+)\}/g)) {
      pattern += escapePattern(template.slice(cursor, match.index));
      if (match[1].startsWith("N")) {
        pattern += sequenceCaptured ? "\\d+" : "(\\d+)";
        sequenceCaptured = true;
      } else {
        pattern += escapePattern(tokens[match[1]]);
      }
      cursor = match.index + match[0].length;
    }
    pattern += escapePattern(template.slice(cursor));
    return sequenceCaptured ? new RegExp(`^${pattern}$`) : null;
  }

  function nextNumber(collection, prefixText) {
    if (collection === "boqs") {
      const format = getSettings().numberingFormat ||
        (prefixText === "BOQ" || !prefixText
          ? defaultBoqNumberingFormat
          : `${prefixText}-{YY}{MM}{NN}`);
      const matcher = numberingMatcher(format);
      const sequence = list(collection).reduce((highest, record) => {
        const match = String(record.number || "").match(matcher || /$^/);
        return match ? Math.max(highest, Number(match[1])) : highest;
      }, 0) + 1;
      return formatDocumentNumber(format, sequence);
    }
    const year = new Date().getFullYear();
    const sequence = list(collection).reduce((highest, record) => {
      const match = String(record.code || "").match(/(\d+)$/);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0) + 1;
    return `${prefixText}-${year}-${String(sequence).padStart(3, "0")}`;
  }

  function getSettings() {
    return read("settings", {});
  }

  function saveSettings(settings) {
    return write("settings", settings);
  }

  function legacyScopedValue(suffix, fallback) {
    const scopedKey = activeUserId !== "guest"
      ? `boq:user:${activeUserId}:${suffix}`
      : `boq:guest:${suffix}`;
    const scoped = localStorage.getItem(scopedKey);
    if (scoped !== null) return parseJson(scoped, fallback);
    const legacyKeys = {
      projects: "boq_projects_v2",
      items: "boq_items",
      working: "boq_working",
      current_name: "boq_current_name",
      category_order: "boq_category_order",
      unsaved_commission: "boq_unsaved_commission",
      sync_meta: "boq_sync_meta_v1",
    };
    const raw = localStorage.getItem(legacyKeys[suffix]);
    if (["current_name", "unsaved_commission"].includes(suffix)) {
      return raw === null ? fallback : raw;
    }
    return parseJson(raw, fallback);
  }

  function legacyItemToBoqItem(item, index) {
    const selling = item.sellingPrice === "" || item.sellingPrice == null
      ? null
      : Number(item.sellingPrice);
    return {
      sku: "",
      item: String(item.name || item.item || `Item ${index + 1}`),
      description: String(item.description || ""),
      qty: Number(item.qty || 0),
      unit: String(item.unit || "Each"),
      unitCogs: Number(item.price ?? item.unitCogs ?? 0),
      margin: Math.max(0, Math.min(Number(item.margin || 0), 99.99)),
      sellingOverride: Number.isFinite(selling) ? selling : null,
      category: String(item.category || "Uncategorized"),
    };
  }

  function deriveMargin(cogs, selling) {
    const cost = Number(cogs || 0);
    const price = Number(selling || 0);
    if (!(cost > 0) || !(price > 0) || price < cost) return 0;
    return Math.max(0, Math.min((price - cost) / price * 100, 99.99));
  }

  function timestampValue(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(value || "");
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function isoTimestamp(value) {
    const timestamp = timestampValue(value);
    return timestamp ? new Date(timestamp).toISOString() : "";
  }

  function buildLegacySnapshot() {
    return {
      projects: legacyScopedValue("projects", {}),
      items: legacyScopedValue("items", []),
      working: legacyScopedValue("working", []),
      currentProjectName: legacyScopedValue("current_name", ""),
      categoryOrder: legacyScopedValue("category_order", []),
      unsavedCommission: Number(
        legacyScopedValue("unsaved_commission", 0) || 0,
      ),
      meta: legacyScopedValue("sync_meta", {}),
    };
  }

  function isLegacySnapshot(snapshot) {
    return Boolean(snapshot && typeof snapshot === "object" &&
      (snapshot.projects || snapshot.projectList || snapshot.project ||
        snapshot.data || snapshot.working || snapshot.boq_working ||
        snapshot.items || snapshot.boq_items) &&
      !snapshot.collections);
  }

  function normalizeLegacySnapshot(snapshot) {
    const safe = snapshot && typeof snapshot === "object" ? snapshot : {};
    if (safe.project && Array.isArray(safe.data)) {
      const projectName = String(safe.project).trim() || "Imported Project";
      return {
        projects: {
          [projectName]: {
            data: safe.data,
            commission: Number(safe.commission || 0),
            categoryOrder: Array.isArray(safe.categoryOrder)
              ? safe.categoryOrder
              : [],
            lastSaved: Date.now(),
          },
        },
        items: Array.isArray(safe.items) ? safe.items : [],
        working: safe.data,
        currentProjectName: projectName,
        categoryOrder: Array.isArray(safe.categoryOrder)
          ? safe.categoryOrder
          : [],
        unsavedCommission: Number(safe.commission || 0),
        meta: safe.meta || {},
      };
    }
    return {
      projects: safe.projects || safe.projectList || {},
      items: Array.isArray(safe.items)
        ? safe.items
        : Array.isArray(safe.boq_items)
        ? safe.boq_items
        : [],
      working: Array.isArray(safe.working)
        ? safe.working
        : Array.isArray(safe.boq_working)
        ? safe.boq_working
        : [],
      currentProjectName: safe.currentProjectName || safe.current || "",
      categoryOrder: Array.isArray(safe.categoryOrder)
        ? safe.categoryOrder
        : [],
      unsavedCommission: Number(
        safe.unsavedCommission || safe.commission || 0,
      ),
      meta: safe.meta || {},
    };
  }

  function mergeRecords(current, incoming) {
    const map = new Map(current.map((record) => [record.id, record]));
    incoming.forEach((record) => {
      const previous = map.get(record.id);
      if (!previous || new Date(record.updatedAt || 0) >=
          new Date(previous.updatedAt || 0)) map.set(record.id, record);
    });
    return [...map.values()];
  }

  function convertLegacySnapshot(snapshot, cloudTimestamps = {}) {
    snapshot = normalizeLegacySnapshot(snapshot);
    const sourceProjects = snapshot.projects &&
        typeof snapshot.projects === "object"
      ? snapshot.projects
      : {};
    const legacyProducts = Array.isArray(snapshot.items) ? snapshot.items : [];
    const boqRecords = [];
    const currentSettings = getSettings();
    const currency = currentSettings.defaultCurrency || "IDR";
    const savedPricePreference = localStorage.getItem("boq_show_table_prices");
    const previousHiddenPreference = localStorage.getItem("boq_hide_table_prices");
    const showTablePrices = savedPricePreference === null
      ? previousHiddenPreference !== "true"
      : savedPricePreference === "true";
    const savedSubtotalPreference = localStorage.getItem(
      "boq_show_category_subtotals",
    );
    const showCategorySubtotals = savedSubtotalPreference === null
      ? true
      : savedSubtotalPreference === "true";
    const projectNames = Object.keys(sourceProjects);
    const cloudCreatedAt = timestampValue(cloudTimestamps.createdAt);
    const cloudUpdatedAt = timestampValue(cloudTimestamps.updatedAt) ||
      timestampValue(cloudTimestamps.clientUpdatedAt);
    const legacyUpdatedAt = Math.max(
      timestampValue(snapshot.meta?.clientUpdatedAt),
      cloudUpdatedAt,
      ...Object.values(sourceProjects).map((project) =>
        timestampValue(project?.lastSaved)
      ),
      ...legacyProducts.map((item) => timestampValue(item?.updatedAt)),
    ) || Date.now();

    projectNames.forEach((name, index) => {
      const source = sourceProjects[name];
      const data = Array.isArray(source)
        ? source
        : Array.isArray(source?.data)
        ? source.data
        : [];
      const savedAt = timestampValue(source?.lastSaved) || legacyUpdatedAt;
      const updatedAt = new Date(savedAt).toISOString();
      const createdAt = new Date(
        timestampValue(source?.createdAt) || cloudCreatedAt || savedAt,
      ).toISOString();
      boqRecords.push({
        id: stableId("boq", name),
        number: `BOQ-${String(index + 1).padStart(3, "0")}`,
        status: "Issued",
        projectName: name,
        customerId: "",
        customerName: "",
        currency,
        date: updatedAt.slice(0, 10),
        validUntil: "",
        notes: "",
        items: data.map(legacyItemToBoqItem),
        commission: Number(source?.commission || 0),
        categoryOrder: Array.isArray(source?.categoryOrder)
          ? source.categoryOrder
          : [],
        createdAt,
        updatedAt,
        source: "imported",
      });
    });

    const working = Array.isArray(snapshot.working) ? snapshot.working : [];
    const currentName = String(snapshot.currentProjectName || "").trim();
    if (working.length && currentName) {
      const current = boqRecords.find((record) =>
        record.projectName === currentName
      );
      if (current) {
        current.items = working.map(legacyItemToBoqItem);
        current.commission = Number(snapshot.unsavedCommission ||
          sourceProjects[currentName]?.commission || 0);
        current.categoryOrder = Array.isArray(snapshot.categoryOrder)
          ? snapshot.categoryOrder
          : current.categoryOrder;
      }
    } else if (working.length) {
      const updatedAt = new Date(legacyUpdatedAt).toISOString();
      const createdAt = new Date(cloudCreatedAt || legacyUpdatedAt)
        .toISOString();
      boqRecords.unshift({
        id: stableId("boq", `working-${updatedAt}`),
        number: `BOQ-${String(boqRecords.length + 1).padStart(3, "0")}`,
        status: "Issued",
        projectName: "Imported Project",
        customerId: "",
        customerName: "",
        currency,
        date: updatedAt.slice(0, 10),
        validUntil: "",
        notes: "Imported from the previous working document.",
        items: working.map(legacyItemToBoqItem),
        commission: Number(snapshot.unsavedCommission || 0),
        categoryOrder: Array.isArray(snapshot.categoryOrder)
          ? snapshot.categoryOrder
          : [],
        createdAt,
        updatedAt,
        source: "imported",
      });
    }

    const productRecords = legacyProducts.filter((item) => item?.name).map(
      (item) => {
        const cogs = Number(item.price || 0);
        const selling = Number(item.sellingPrice || 0);
        const updatedAt = new Date(Number(item.updatedAt || Date.now()))
          .toISOString();
        return {
          id: stableId("product", item.name),
          sku: "",
          name: String(item.name),
          category: String(item.category || "Uncategorized"),
          unit: String(item.unit || "Each"),
          defaultCogs: cogs,
          defaultMargin: deriveMargin(cogs, selling),
          defaultSellingPrice: selling || null,
          status: "Active",
          createdAt: updatedAt,
          updatedAt,
          source: "imported",
        };
      },
    );

    return {
      collections: {
        boqs: boqRecords,
        products: productRecords,
        customers: [],
      },
      settings: {
        ...currentSettings,
        defaultCurrency: currency,
        rounding: currentSettings.rounding || "up1000",
        showCategorySubtotals,
        showTablePrices,
      },
      currentBoqId: currentName ? stableId("boq", currentName) : "",
      meta: {
        schemaVersion,
        clientUpdatedAt: legacyUpdatedAt,
        importedFromPreviousVersion: true,
      },
    };
  }

  function exportState() {
    return {
      exportedAt: new Date().toISOString(),
      application: "BOQ Manager",
      collections: Object.fromEntries(
        collections.map((collection) => [collection, list(collection)]),
      ),
      settings: getSettings(),
      currentBoqId: read("currentBoqId", ""),
      meta: {
        ...read("meta", {}),
        schemaVersion,
      },
    };
  }

  function applyState(snapshot, options = {}) {
    const cloudTimestamps = {
      createdAt: options.cloudCreatedAt,
      updatedAt: options.cloudUpdatedAt,
      clientUpdatedAt: snapshot?.meta?.clientUpdatedAt,
    };
    const converted = isLegacySnapshot(snapshot)
      ? convertLegacySnapshot(snapshot, cloudTimestamps)
      : snapshot;
    if (!converted?.collections) throw new Error("Unsupported backup format");
    collections.forEach((collection) => {
      let incoming = Array.isArray(converted.collections[collection])
        ? converted.collections[collection]
        : [];
      if (collection === "boqs") {
        incoming = incoming.map((record) =>
          normalizeBoq(
            record,
            converted.collections.projects,
            cloudTimestamps,
          )
        );
      }
      const value = options.merge
        ? mergeRecords(list(collection), incoming)
        : incoming;
      localStorage.setItem(storageKey(collection), JSON.stringify(value));
    });
    localStorage.removeItem(storageKey("projects"));
    if (converted.settings && typeof converted.settings === "object") {
      const settings = options.merge
        ? { ...getSettings(), ...converted.settings }
        : converted.settings;
      localStorage.setItem(storageKey("settings"), JSON.stringify(settings));
    }
    if (converted.currentBoqId) {
      localStorage.setItem(
        storageKey("currentBoqId"),
        JSON.stringify(converted.currentBoqId),
      );
    } else if (!options.merge) {
      localStorage.removeItem(storageKey("currentBoqId"));
    }
    localStorage.removeItem(storageKey("workingDraft"));
    const incomingTs = Number(converted.meta?.clientUpdatedAt || Date.now());
    localStorage.setItem(storageKey("meta"), JSON.stringify({
      ...read("meta", {}),
      ...converted.meta,
      schemaVersion,
      clientUpdatedAt: incomingTs,
    }));
    document.dispatchEvent(new CustomEvent("boq:store-ready"));
    if (!options.silent) touch();
    return exportState();
  }

  function migrateCurrentNamespace() {
    if (read("migrationComplete", false)) return;
    const previousClaimKey = "boq-manager-v1-claimed-by";
    const previousClaim = localStorage.getItem(previousClaimKey);
    const canClaimPrevious = activeUserId === "guest" || !previousClaim ||
      previousClaim === activeUserId;
    const previousProjects = canClaimPrevious
      ? parseJson(localStorage.getItem(`${previousPrefix}:projects`), [])
      : [];
    const previousCollections = Object.fromEntries(collections.map((name) => [
      name,
      canClaimPrevious
        ? parseJson(localStorage.getItem(`${previousPrefix}:${name}`), [])
        : [],
    ]));
    const hasPreviousData = collections.some((name) =>
      previousCollections[name].length
    );
    if (hasPreviousData) {
      if (activeUserId !== "guest" && !previousClaim) {
        localStorage.setItem(previousClaimKey, activeUserId);
      }
      collections.forEach((name) =>
        localStorage.setItem(
          storageKey(name),
          JSON.stringify(name === "boqs"
            ? previousCollections[name].map((record) =>
              normalizeBoq(record, previousProjects)
            )
            : previousCollections[name]),
        )
      );
      const previousSettings = parseJson(
        localStorage.getItem(`${previousPrefix}:settings`),
        {},
      );
      localStorage.setItem(
        storageKey("settings"),
        JSON.stringify(previousSettings),
      );
    }
    const legacy = buildLegacySnapshot();
    const hasLegacyData = Object.keys(legacy.projects || {}).length ||
      legacy.items.length || legacy.working.length;
    if (hasLegacyData) applyState(convertLegacySnapshot(legacy), {
      merge: true,
      silent: true,
    });
    localStorage.setItem(storageKey("migrationComplete"), "true");
  }

  function setUser(userId) {
    const nextUserId = userId || "guest";
    const changed = nextUserId !== activeUserId;
    activeUserId = nextUserId;
    if (nextUserId === "guest") localStorage.removeItem(sessionUserKey);
    else localStorage.setItem(sessionUserKey, nextUserId);
    migrateCurrentNamespace();
    removeProjectCollection();
    if (changed) document.dispatchEvent(new CustomEvent("boq:user-changed", {
      detail: { userId: nextUserId },
    }));
    return changed;
  }

  function getUserId() {
    return activeUserId === "guest" ? null : activeUserId;
  }

  function setCurrentBoqId(id) {
    write("currentBoqId", id || "", { silent: true });
  }

  function getCurrentBoqId() {
    return read("currentBoqId", "");
  }

  function getMeta() {
    return read("meta", {});
  }

  function getLocalPreference(name, fallback = {}) {
    return read(`preference-${name}`, fallback);
  }

  function saveLocalPreference(name, value) {
    localStorage.setItem(
      storageKey(`preference-${name}`),
      JSON.stringify(value),
    );
    return value;
  }

  function migrateExistingBoqs(options = {}) {
    const migrationVersion = 1;
    const meta = read("meta", {});
    if (Number(meta.existingBoqMigrationVersion || 0) >= migrationVersion) {
      return false;
    }
    const raw = parseJson(localStorage.getItem(storageKey("boqs")), []);
    if (!Array.isArray(raw)) return false;
    const timestampFallbacks = {
      createdAt: options.cloudCreatedAt,
      updatedAt: options.cloudUpdatedAt,
      clientUpdatedAt: meta.clientUpdatedAt,
    };
    const migrated = raw.map((record) => {
      const importedWithoutDistinctCreation = record?.source === "imported" &&
        (!isoTimestamp(record.createdAt) ||
          isoTimestamp(record.createdAt) === isoTimestamp(record.updatedAt));
      const source = importedWithoutDistinctCreation && options.cloudCreatedAt
        ? { ...record, createdAt: options.cloudCreatedAt }
        : record;
      return {
        ...normalizeBoq(source, [], timestampFallbacks),
        status: "Issued",
      };
    });
    localStorage.setItem(storageKey("boqs"), JSON.stringify(migrated));
    const clientUpdatedAt = Date.now();
    localStorage.setItem(storageKey("meta"), JSON.stringify({
      ...meta,
      schemaVersion,
      existingBoqMigrationVersion: migrationVersion,
      clientUpdatedAt,
    }));
    if (!options.silent) {
      document.dispatchEvent(new CustomEvent("boq:data-changed", {
        detail: { clientUpdatedAt },
      }));
    }
    return true;
  }

  function migrateIssuedStatuses(options = {}) {
    const migrationVersion = 1;
    const meta = read("meta", {});
    if (Number(meta.issuedStatusMigrationVersion || 0) >= migrationVersion) {
      return false;
    }
    const raw = parseJson(localStorage.getItem(storageKey("boqs")), []);
    if (!Array.isArray(raw) || !raw.length) return false;
    const migrated = raw.map(normalizeBoq);
    localStorage.setItem(storageKey("boqs"), JSON.stringify(migrated));
    const clientUpdatedAt = Date.now();
    localStorage.setItem(storageKey("meta"), JSON.stringify({
      ...meta,
      schemaVersion,
      issuedStatusMigrationVersion: migrationVersion,
      clientUpdatedAt,
    }));
    if (!options.silent) {
      document.dispatchEvent(new CustomEvent("boq:data-changed", {
        detail: { clientUpdatedAt },
      }));
    }
    return true;
  }

  function migrateLegacyPartNumbers(options = {}) {
    const migrationVersion = 1;
    const meta = read("meta", {});
    if (Number(meta.partNumberMigrationVersion || 0) >= migrationVersion) {
      return false;
    }
    const products = parseJson(
      localStorage.getItem(storageKey("products")),
      [],
    );
    const boqs = parseJson(localStorage.getItem(storageKey("boqs")), []);
    if (Array.isArray(products)) {
      localStorage.setItem(
        storageKey("products"),
        JSON.stringify(products.map((product) => ({ ...product, sku: "" }))),
      );
    }
    if (Array.isArray(boqs)) {
      localStorage.setItem(
        storageKey("boqs"),
        JSON.stringify(boqs.map((boq) => ({
          ...boq,
          items: Array.isArray(boq.items)
            ? boq.items.map((item) => ({ ...item, sku: "" }))
            : [],
        }))),
      );
    }
    const clientUpdatedAt = Date.now();
    localStorage.setItem(storageKey("meta"), JSON.stringify({
      ...meta,
      schemaVersion,
      partNumberMigrationVersion: migrationVersion,
      clientUpdatedAt,
    }));
    if (!options.silent) {
      document.dispatchEvent(new CustomEvent("boq:data-changed", {
        detail: { clientUpdatedAt },
      }));
    }
    return true;
  }

  function migrateBoqNumbers(options = {}) {
    const migrationVersion = 1;
    const meta = read("meta", {});
    if (Number(meta.boqNumberingMigrationVersion || 0) >= migrationVersion) {
      return false;
    }
    const raw = parseJson(localStorage.getItem(storageKey("boqs")), []);
    if (!Array.isArray(raw)) return false;

    const datedRecords = raw.map((record, index) => {
      const createdTimestamp = timestampValue(record?.createdAt) ||
        timestampValue(record?.date) || timestampValue(record?.updatedAt) ||
        Date.now();
      return {
        record,
        index,
        createdTimestamp,
        updatedTimestamp: timestampValue(record?.updatedAt),
        date: new Date(createdTimestamp),
      };
    }).sort((left, right) =>
      left.createdTimestamp - right.createdTimestamp ||
      left.updatedTimestamp - right.updatedTimestamp ||
      String(left.record?.id || "").localeCompare(
        String(right.record?.id || ""),
      ) || left.index - right.index
    );

    const monthlySequences = new Map();
    const numbersByIndex = new Map();
    datedRecords.forEach(({ date, index }) => {
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      const sequence = (monthlySequences.get(monthKey) || 0) + 1;
      monthlySequences.set(monthKey, sequence);
      numbersByIndex.set(
        index,
        formatDocumentNumber(defaultBoqNumberingFormat, sequence, date),
      );
    });

    localStorage.setItem(
      storageKey("boqs"),
      JSON.stringify(raw.map((record, index) => ({
        ...record,
        number: numbersByIndex.get(index),
      }))),
    );
    localStorage.setItem(storageKey("settings"), JSON.stringify({
      ...getSettings(),
      numberingFormat: defaultBoqNumberingFormat,
    }));
    const clientUpdatedAt = Date.now();
    localStorage.setItem(storageKey("meta"), JSON.stringify({
      ...meta,
      schemaVersion,
      boqNumberingMigrationVersion: migrationVersion,
      clientUpdatedAt,
    }));
    if (!options.silent) {
      document.dispatchEvent(new CustomEvent("boq:data-changed", {
        detail: { clientUpdatedAt },
      }));
    }
    return true;
  }

  function backfillBoqPartNumbers(options = {}) {
    const partNumbersByName = new Map();
    list("products").forEach((product) => {
      const name = String(product.name || "").trim().replace(/\s+/g, " ")
        .toLowerCase();
      const partNumber = String(product.sku || "").trim();
      if (!name || !partNumber) return;
      if (!partNumbersByName.has(name)) {
        partNumbersByName.set(name, partNumber);
      } else if (partNumbersByName.get(name) !== partNumber) {
        partNumbersByName.set(name, null);
      }
    });
    if (![...partNumbersByName.values()].some(Boolean)) return false;

    const boqs = parseJson(localStorage.getItem(storageKey("boqs")), []);
    if (!Array.isArray(boqs)) return false;
    let changed = false;
    const updatedBoqs = boqs.map((boq) => {
      if (!Array.isArray(boq?.items)) return boq;
      let boqChanged = false;
      const items = boq.items.map((item) => {
        if (!item || typeof item !== "object" || String(item.sku || "").trim()) {
          return item;
        }
        const name = String(item.item || "").trim().replace(/\s+/g, " ")
          .toLowerCase();
        const partNumber = partNumbersByName.get(name);
        if (!partNumber) return item;
        boqChanged = true;
        changed = true;
        return { ...item, sku: partNumber };
      });
      return boqChanged ? { ...boq, items } : boq;
    });
    if (!changed) return false;

    localStorage.setItem(storageKey("boqs"), JSON.stringify(updatedBoqs));
    const clientUpdatedAt = Date.now();
    localStorage.setItem(storageKey("meta"), JSON.stringify({
      ...read("meta", {}),
      schemaVersion,
      clientUpdatedAt,
    }));
    if (!options.silent) {
      document.dispatchEvent(new CustomEvent("boq:data-changed", {
        detail: { clientUpdatedAt },
      }));
    }
    return true;
  }

  function parseLegacyRevisionProject(value) {
    const projectName = String(value || "").trim();
    const match = projectName.match(
      /^(.*?)(?:\s*[-–—_/]\s*|\s+|\s*\(\s*)rev(?:ision)?\.?\s*[-_.]?\s*(\d+)\s*\)?\s*$/i,
    );
    if (!match || !String(match[1] || "").trim()) {
      return { projectName, baseName: projectName, revision: null };
    }
    return {
      projectName,
      baseName: String(match[1]).trim().replace(/[\s\-–—_/]+$/g, "").trim(),
      revision: Math.max(0, Number(match[2]) || 0),
    };
  }

  function revisionProjectKey(parsed) {
    return String(parsed.baseName || "").trim().replace(/\s+/g, " ")
      .toLowerCase();
  }

  function revisionCustomerKey(record) {
    return String(record.customerName || record.customerId || "").trim()
      .replace(/\s+/g, " ").toLowerCase();
  }

  function migratedRevisionRecord(members, baseName) {
    const sorted = members.map((entry, index) => ({ ...entry, sourceIndex: index }))
      .sort((left, right) => {
        const leftRevision = left.parsed.revision ?? 0;
        const rightRevision = right.parsed.revision ?? 0;
        return leftRevision - rightRevision ||
          timestampValue(left.record.updatedAt || left.record.date) -
            timestampValue(right.record.updatedAt || right.record.date) ||
          left.sourceIndex - right.sourceIndex;
      });
    const usedNumbers = new Set();
    const settings = getSettings();
    const customers = list("customers");
    const canonicalSource = sorted.find((entry) =>
      entry.parsed.revision === null
    ) || sorted[0];
    const canonicalNumber = canonicalSource.record.number ||
      sorted[0].record.number || "";
    const revisions = sorted.map((entry) => {
      let number = entry.parsed.revision ?? 0;
      while (usedNumbers.has(number)) number += 1;
      usedNumbers.add(number);
      const customer = customers.find((candidate) =>
        candidate.id === entry.record.customerId
      ) || {};
      return normalizeRevision({
        id: stableId(
          "revision",
          `${canonicalSource.record.id}:${entry.record.id}:${number}`,
        ),
        number,
        state: "Issued",
        issuedAt: entry.record.updatedAt || entry.record.date ||
          entry.record.createdAt,
        note: "Migrated from an existing BOQ.",
        sourceRecordId: entry.record.id,
        sourceNumber: entry.record.number,
        document: {
          ...entry.record,
          number: canonicalNumber,
          status: "Issued",
          projectName: baseName,
        },
        companySettings: settings,
        customer,
        calculation: {
          version: 1,
          marginMethod: "gross-margin",
          rounding: settings.rounding || "2",
          numberFormat: settings.numberFormat || "comma",
        },
      });
    });
    const latest = revisions.at(-1);
    const createdAt = new Date(Math.min(...members.map((entry) =>
      timestampValue(entry.record.createdAt || entry.record.date ||
        entry.record.updatedAt) || Date.now()
    ))).toISOString();
    const updatedAt = new Date(Math.max(...members.map((entry) =>
      timestampValue(entry.record.updatedAt || entry.record.date ||
        entry.record.createdAt) || 0
    ), timestampValue(createdAt))).toISOString();
    return normalizeBoq({
      ...canonicalSource.record,
      ...cloneValue(latest.document),
      id: canonicalSource.record.id,
      number: canonicalNumber,
      projectName: baseName,
      status: "Issued",
      revisions,
      activeRevisionNumber: latest.number,
      workingRevision: null,
      hasDraftChanges: false,
      createdAt,
      updatedAt,
    });
  }

  function migrateBoqRevisions(options = {}) {
    const migrationVersion = 1;
    const meta = read("meta", {});
    if (Number(meta.boqRevisionMigrationVersion || 0) >= migrationVersion) {
      return false;
    }
    const raw = parseJson(localStorage.getItem(storageKey("boqs")), []);
    if (!Array.isArray(raw)) return false;
    const entries = raw.map((record) => {
      const normalized = normalizeBoq(record);
      const parsed = parseLegacyRevisionProject(normalized.projectName);
      return {
        record: normalized,
        parsed,
        projectKey: revisionProjectKey(parsed),
        customerKey: revisionCustomerKey(normalized),
      };
    });
    const customersByProject = new Map();
    entries.forEach((entry) => {
      if (!entry.customerKey) return;
      const customers = customersByProject.get(entry.projectKey) || new Set();
      customers.add(entry.customerKey);
      customersByProject.set(entry.projectKey, customers);
    });
    entries.forEach((entry) => {
      const customers = customersByProject.get(entry.projectKey) || new Set();
      entry.key = customers.size <= 1
        ? entry.projectKey
        : `${entry.projectKey}::${entry.customerKey || "no-customer"}`;
    });
    const explicitKeys = new Set(entries.filter((entry) =>
      entry.parsed.revision !== null && !entry.record.revisions.length
    ).map((entry) => entry.key));
    const processedKeys = new Set();
    const revisionAliases = { ...(meta.boqRevisionAliases || {}) };
    const migrated = [];

    entries.forEach((entry) => {
      if (entry.record.revisions.length || entry.record.status !== "Issued") {
        migrated.push(entry.record);
        return;
      }
      if (explicitKeys.has(entry.key)) {
        if (processedKeys.has(entry.key)) return;
        processedKeys.add(entry.key);
        const members = entries.filter((candidate) =>
          candidate.key === entry.key && !candidate.record.revisions.length &&
          candidate.record.status === "Issued"
        );
        const grouped = migratedRevisionRecord(members, entry.parsed.baseName);
        members.forEach((member) => {
          if (member.record.id !== grouped.id) {
            revisionAliases[member.record.id] = grouped.id;
          }
        });
        migrated.push(grouped);
        return;
      }
      migrated.push(migratedRevisionRecord([entry], entry.record.projectName));
    });

    localStorage.setItem(storageKey("boqs"), JSON.stringify(migrated));
    const currentBoqId = read("currentBoqId", "");
    if (revisionAliases[currentBoqId]) {
      localStorage.setItem(
        storageKey("currentBoqId"),
        JSON.stringify(revisionAliases[currentBoqId]),
      );
    }
    const clientUpdatedAt = Date.now();
    localStorage.setItem(storageKey("meta"), JSON.stringify({
      ...meta,
      schemaVersion,
      boqRevisionMigrationVersion: migrationVersion,
      boqRevisionAliases: revisionAliases,
      clientUpdatedAt,
    }));
    if (!options.silent) {
      document.dispatchEvent(new CustomEvent("boq:data-changed", {
        detail: { clientUpdatedAt },
      }));
    }
    return true;
  }

  function removeProjectCollection() {
    const raw = parseJson(localStorage.getItem(storageKey("boqs")), []);
    if (!Array.isArray(raw)) return;
    const legacyProjects = parseJson(
      localStorage.getItem(storageKey("projects")),
      [],
    );
    const normalized = raw.map((record) =>
      normalizeBoq(record, legacyProjects)
    );
    const changed = JSON.stringify(normalized) !== JSON.stringify(raw);
    const hadProjectCollection = localStorage.getItem(storageKey("projects")) !==
      null;
    if (changed) {
      localStorage.setItem(storageKey("boqs"), JSON.stringify(normalized));
    }
    localStorage.removeItem(storageKey("projects"));
    if (changed || hadProjectCollection) {
      localStorage.setItem(storageKey("meta"), JSON.stringify({
        ...read("meta", {}),
        schemaVersion,
      }));
    }
  }

  migrateCurrentNamespace();
  removeProjectCollection();
  localStorage.removeItem(storageKey("workingDraft"));

  window.BOQStore = {
    list,
    get,
    save,
    remove,
    saveBoqDraft,
    validateBoqForIssue,
    issueBoq,
    prepareRevisionDraft,
    createRevisionDraft,
    discardBoqDraft,
    voidLatestRevision,
    getRevision,
    latestIssuedRevision,
    issuedBoqView,
    registerBoqView,
    nextRevisionNumber,
    revisionLabel,
    nextNumber,
    formatDocumentNumber,
    isValidNumberingFormat,
    getSettings,
    saveSettings,
    createId,
    setUser,
    getUserId,
    getMeta,
    getLocalPreference,
    saveLocalPreference,
    migrateExistingBoqs,
    migrateIssuedStatuses,
    migrateLegacyPartNumbers,
    migrateBoqNumbers,
    migrateBoqRevisions,
    backfillBoqPartNumbers,
    exportState,
    applyState,
    convertLegacySnapshot,
    normalizeLegacySnapshot,
    isLegacySnapshot,
    setCurrentBoqId,
    getCurrentBoqId,
  };
})();
