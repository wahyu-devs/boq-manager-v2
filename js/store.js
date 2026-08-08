(function defineDataStore() {
  const appPrefix = "boq-manager-v2";
  const previousPrefix = "boq-manager-v1";
  const sessionUserKey = "boq-manager-session-user";
  const collections = ["boqs", "projects", "products", "customers"];
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

  function normalizeBoq(record) {
    return {
      ...record,
      status: record.status === "Sent" ? "Sent" : "Draft",
      items: Array.isArray(record.items) ? record.items : [],
      commission: Number(record.commission || 0),
      categoryOrder: Array.isArray(record.categoryOrder)
        ? record.categoryOrder
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
    const value = {
      ...record,
      id: record.id || createId(),
      createdAt: record.createdAt || now,
      updatedAt: options.preserveUpdatedAt && record.updatedAt
        ? record.updatedAt
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

  function nextNumber(collection, prefixText) {
    const year = new Date().getFullYear();
    const sequence = list(collection).reduce((highest, record) => {
      const match = String(record.number || record.code || "").match(/(\d+)$/);
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
      sku: item.sku || "CUSTOM",
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
      (snapshot.projects || snapshot.working || snapshot.items) &&
      !snapshot.collections);
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

  function convertLegacySnapshot(snapshot) {
    const sourceProjects = snapshot.projects &&
        typeof snapshot.projects === "object"
      ? snapshot.projects
      : {};
    const legacyProducts = Array.isArray(snapshot.items) ? snapshot.items : [];
    const projectRecords = [];
    const boqRecords = [];
    const now = new Date().toISOString();
    const currentSettings = getSettings();
    const currency = currentSettings.defaultCurrency || "IDR";
    const projectNames = Object.keys(sourceProjects);

    projectNames.forEach((name, index) => {
      const source = sourceProjects[name];
      const data = Array.isArray(source)
        ? source
        : Array.isArray(source?.data)
        ? source.data
        : [];
      const savedAt = Number(source?.lastSaved || snapshot.meta?.clientUpdatedAt ||
        Date.now());
      const timestamp = new Date(savedAt).toISOString();
      const projectId = stableId("project", name);
      projectRecords.push({
        id: projectId,
        name,
        code: `PRJ-${String(index + 1).padStart(3, "0")}`,
        customerId: "",
        customerName: "",
        owner: "",
        status: "Active",
        startDate: "",
        estimatedValue: 0,
        notes: "",
        createdAt: timestamp,
        updatedAt: timestamp,
        source: "imported",
      });
      boqRecords.push({
        id: stableId("boq", name),
        number: `BOQ-${String(index + 1).padStart(3, "0")}`,
        title: name,
        status: "Draft",
        projectId,
        projectName: name,
        customerId: "",
        customerName: "",
        currency,
        date: timestamp.slice(0, 10),
        validUntil: "",
        notes: "",
        items: data.map(legacyItemToBoqItem),
        commission: Number(source?.commission || 0),
        categoryOrder: Array.isArray(source?.categoryOrder)
          ? source.categoryOrder
          : [],
        createdAt: timestamp,
        updatedAt: timestamp,
        source: "imported",
      });
    });

    const working = Array.isArray(snapshot.working) ? snapshot.working : [];
    const currentName = String(snapshot.currentProjectName || "").trim();
    if (working.length && currentName) {
      const current = boqRecords.find((record) => record.title === currentName);
      if (current) {
        current.items = working.map(legacyItemToBoqItem);
        current.commission = Number(snapshot.unsavedCommission ||
          sourceProjects[currentName]?.commission || 0);
        current.categoryOrder = Array.isArray(snapshot.categoryOrder)
          ? snapshot.categoryOrder
          : current.categoryOrder;
      }
    } else if (working.length) {
      const timestamp = new Date(
        Number(snapshot.meta?.clientUpdatedAt || Date.now()),
      ).toISOString();
      boqRecords.unshift({
        id: stableId("boq", `working-${timestamp}`),
        number: `BOQ-${String(boqRecords.length + 1).padStart(3, "0")}`,
        title: "Recovered working BOQ",
        status: "Draft",
        projectId: "",
        projectName: "",
        customerId: "",
        customerName: "",
        currency,
        date: timestamp.slice(0, 10),
        validUntil: "",
        notes: "Recovered from the previous working document.",
        items: working.map(legacyItemToBoqItem),
        commission: Number(snapshot.unsavedCommission || 0),
        categoryOrder: Array.isArray(snapshot.categoryOrder)
          ? snapshot.categoryOrder
          : [],
        createdAt: timestamp,
        updatedAt: timestamp,
        source: "imported",
      });
    }

    const productRecords = legacyProducts.filter((item) => item?.name).map(
      (item, index) => {
        const cogs = Number(item.price || 0);
        const selling = Number(item.sellingPrice || 0);
        const updatedAt = new Date(Number(item.updatedAt || Date.now()))
          .toISOString();
        return {
          id: stableId("product", item.name),
          sku: `ITEM-${String(index + 1).padStart(3, "0")}`,
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
        projects: projectRecords,
        products: productRecords,
        customers: [],
      },
      settings: {
        ...currentSettings,
        defaultCurrency: currency,
        rounding: currentSettings.rounding || "up1000",
        showCategorySubtotals: true,
        showTablePrices: true,
      },
      currentBoqId: currentName ? stableId("boq", currentName) : "",
      meta: {
        schemaVersion: 2,
        clientUpdatedAt: Number(snapshot.meta?.clientUpdatedAt || Date.now()),
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
        schemaVersion: 2,
      },
    };
  }

  function applyState(snapshot, options = {}) {
    const converted = isLegacySnapshot(snapshot)
      ? convertLegacySnapshot(snapshot)
      : snapshot;
    if (!converted?.collections) throw new Error("Unsupported backup format");
    collections.forEach((collection) => {
      const incoming = Array.isArray(converted.collections[collection])
        ? converted.collections[collection]
        : [];
      const value = options.merge
        ? mergeRecords(list(collection), incoming)
        : incoming;
      localStorage.setItem(storageKey(collection), JSON.stringify(value));
    });
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
    }
    const incomingTs = Number(converted.meta?.clientUpdatedAt || Date.now());
    localStorage.setItem(storageKey("meta"), JSON.stringify({
      ...read("meta", {}),
      ...converted.meta,
      schemaVersion: 2,
      clientUpdatedAt: incomingTs,
    }));
    document.dispatchEvent(new CustomEvent("boq:store-ready"));
    if (!options.silent) touch();
    return exportState();
  }

  function migrateCurrentNamespace() {
    if (read("migrationComplete", false)) return;
    const previousCollections = Object.fromEntries(collections.map((name) => [
      name,
      parseJson(localStorage.getItem(`${previousPrefix}:${name}`), []),
    ]));
    const hasPreviousData = collections.some((name) =>
      previousCollections[name].length
    );
    if (hasPreviousData) {
      collections.forEach((name) =>
        localStorage.setItem(
          storageKey(name),
          JSON.stringify(previousCollections[name]),
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

  migrateCurrentNamespace();

  window.BOQStore = {
    list,
    get,
    save,
    remove,
    nextNumber,
    getSettings,
    saveSettings,
    createId,
    setUser,
    getUserId,
    getMeta,
    exportState,
    applyState,
    convertLegacySnapshot,
    isLegacySnapshot,
    setCurrentBoqId,
    getCurrentBoqId,
  };
})();
