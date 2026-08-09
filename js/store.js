(function defineDataStore() {
  const appPrefix = "boq-manager-v2";
  const previousPrefix = "boq-manager-v1";
  const sessionUserKey = "boq-manager-session-user";
  const collections = ["boqs", "products", "customers"];
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
    return {
      ...value,
      status: value.status === "Sent" ? "Sent" : "Draft",
      projectName,
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
      items: Array.isArray(value.items) ? value.items : [],
      commission: Number(value.commission || 0),
      categoryOrder: Array.isArray(value.categoryOrder)
        ? value.categoryOrder
        : [],
    };
  }

  function list(collection) {
    if (!collections.includes(collection)) return [];
    const records = read(collection, []);
    if (!Array.isArray(records)) return [];
    return collection === "boqs" ? records.map(normalizeBoq) : records;
  }

  function get(collection, id) {
    return list(collection).find((record) => record.id === id) || null;
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
    const normalized = collection === "boqs" ? normalizeBoq(value) : value;
    const existingIndex = records.findIndex((entry) =>
      entry.id === normalized.id
    );
    if (existingIndex >= 0) records[existingIndex] = normalized;
    else records.unshift(normalized);
    write(collection, records, options);
    return normalized;
  }

  function remove(collection, id) {
    if (!collections.includes(collection)) return;
    write(collection, list(collection).filter((record) => record.id !== id));
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
    const template = String(format || "BOQ-{YYYY}-{NNN}");
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
    const template = String(format || "BOQ-{YYYY}-{NNN}");
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
        `${prefixText || "BOQ"}-{YYYY}-{NNN}`;
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
        status: "Sent",
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
        status: "Sent",
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
          description: String(item.description || ""),
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
        schemaVersion: 4,
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
        schemaVersion: 4,
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
      schemaVersion: 4,
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
        status: "Sent",
      };
    });
    localStorage.setItem(storageKey("boqs"), JSON.stringify(migrated));
    const clientUpdatedAt = Date.now();
    localStorage.setItem(storageKey("meta"), JSON.stringify({
      ...meta,
      schemaVersion: 4,
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
      schemaVersion: 4,
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
        schemaVersion: 4,
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
    migrateLegacyPartNumbers,
    exportState,
    applyState,
    convertLegacySnapshot,
    normalizeLegacySnapshot,
    isLegacySnapshot,
    setCurrentBoqId,
    getCurrentBoqId,
  };
})();
