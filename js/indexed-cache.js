(function defineIndexedWorkspaceCache() {
  const databaseName = "boq-manager";
  const databaseVersion = 1;
  const storeName = "workspaces";
  const legacyStateKeys = [
    "boqs",
    "products",
    "customers",
    "settings",
    "currentBoqId",
    "meta",
    "workingDraft",
    "projects",
    "migrationComplete",
  ];
  let databasePromise = null;
  let writeQueue = Promise.resolve();

  function cacheError(code, message, cause) {
    const error = new Error(message);
    error.name = "IndexedCacheError";
    error.code = code;
    error.cause = cause;
    return error;
  }

  function validState(value) {
    return Boolean(
      value && typeof value === "object" &&
        value.collections && typeof value.collections === "object" &&
        ["boqs", "products", "customers"].every((name) =>
          Array.isArray(value.collections[name])
        ),
    );
  }

  function stateSummary(state) {
    const boqs = Array.isArray(state?.collections?.boqs)
      ? state.collections.boqs
      : [];
    return {
      boqs: boqs.length,
      products: Array.isArray(state?.collections?.products)
        ? state.collections.products.length
        : 0,
      customers: Array.isArray(state?.collections?.customers)
        ? state.collections.customers.length
        : 0,
      items: boqs.reduce((total, boq) =>
        total + (Array.isArray(boq?.items) ? boq.items.length : 0), 0),
      revisions: boqs.reduce((total, boq) =>
        total + (Array.isArray(boq?.revisions) ? boq.revisions.length : 0), 0),
      clientUpdatedAt: Number(state?.meta?.clientUpdatedAt || 0),
    };
  }

  function summariesMatch(left, right) {
    return Object.keys(left).every((key) => left[key] === right[key]);
  }

  function requestResult(request, code, message) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(cacheError(code, message, request.error));
    });
  }

  function transactionComplete(transaction, code, message) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onabort = () => reject(
        cacheError(code, message, transaction.error),
      );
      transaction.onerror = () => reject(
        cacheError(code, message, transaction.error),
      );
    });
  }

  function openDatabase(factory = globalThis.indexedDB) {
    if (!factory?.open) {
      return Promise.reject(cacheError(
        "INDEXEDDB_UNAVAILABLE",
        "IndexedDB is unavailable in this browser.",
      ));
    }
    if (factory === globalThis.indexedDB && databasePromise) {
      return databasePromise;
    }
    const opening = new Promise((resolve, reject) => {
      let request;
      try {
        request = factory.open(databaseName, databaseVersion);
      } catch (error) {
        reject(cacheError(
          "INDEXEDDB_OPEN_FAILED",
          "The workspace cache could not be opened.",
          error,
        ));
        return;
      }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: "userId" });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          if (factory === globalThis.indexedDB) databasePromise = null;
        };
        resolve(database);
      };
      request.onerror = () => reject(cacheError(
        "INDEXEDDB_OPEN_FAILED",
        "The workspace cache could not be opened.",
        request.error,
      ));
      request.onblocked = () => reject(cacheError(
        "INDEXEDDB_OPEN_BLOCKED",
        "Another page is blocking the workspace cache upgrade.",
      ));
    });
    if (factory !== globalThis.indexedDB) return opening;
    databasePromise = opening.catch((error) => {
      databasePromise = null;
      throw error;
    });
    return databasePromise;
  }

  async function read(userId, factory = globalThis.indexedDB) {
    if (!userId) return null;
    const database = await openDatabase(factory);
    let transaction;
    try {
      transaction = database.transaction(storeName, "readonly");
    } catch (error) {
      throw cacheError(
        "INDEXEDDB_READ_FAILED",
        "The workspace cache could not be read.",
        error,
      );
    }
    const record = await requestResult(
      transaction.objectStore(storeName).get(userId),
      "INDEXEDDB_READ_FAILED",
      "The workspace cache could not be read.",
    );
    if (!record) return null;
    if (!validState(record.state)) {
      throw cacheError(
        "INDEXEDDB_INVALID_STATE",
        "The workspace cache contains an unsupported state.",
      );
    }
    return record;
  }

  async function writeRecord(userId, state, options = {}) {
    if (!userId || !validState(state)) {
      throw cacheError(
        "INDEXEDDB_INVALID_STATE",
        "A valid user and workspace state are required.",
      );
    }
    const database = await openDatabase(options.factory);
    let transaction;
    try {
      transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put({
        userId,
        state,
        schemaVersion: Number(state.meta?.schemaVersion || 5),
        clientUpdatedAt: Number(state.meta?.clientUpdatedAt || 0),
        savedAt: new Date().toISOString(),
      });
    } catch (error) {
      throw cacheError(
        "INDEXEDDB_WRITE_FAILED",
        "The workspace cache could not be saved.",
        error,
      );
    }
    await transactionComplete(
      transaction,
      "INDEXEDDB_WRITE_FAILED",
      "The workspace cache could not be saved.",
    );
    if (!options.verify) return true;
    const stored = await read(userId, options.factory);
    if (!stored || !summariesMatch(stateSummary(state), stateSummary(stored.state))) {
      throw cacheError(
        "INDEXEDDB_VERIFY_FAILED",
        "The workspace cache could not be verified after saving.",
      );
    }
    return true;
  }

  function write(userId, state, options = {}) {
    const operation = () => writeRecord(userId, state, options);
    writeQueue = writeQueue.then(operation, operation);
    return writeQueue;
  }

  function clearLegacyWorkspace(userId, storage = globalThis.localStorage) {
    if (!userId || !storage) return false;
    const prefix = `boq-manager-v2:${userId}:`;
    legacyStateKeys.forEach((key) => storage.removeItem(`${prefix}${key}`));
    return true;
  }

  function hasLegacyWorkspace(userId, storage = globalThis.localStorage) {
    if (!userId || !storage) return false;
    const prefix = `boq-manager-v2:${userId}:`;
    return legacyStateKeys.some((key) =>
      key !== "migrationComplete" &&
      storage.getItem(`${prefix}${key}`) !== null
    );
  }

  function hasWorkspaceData(state) {
    if (!validState(state)) return false;
    return ["boqs", "products", "customers"].some((name) =>
      state.collections[name].length
    ) || Object.keys(state.settings || {}).length > 0 ||
      Number(state.meta?.clientUpdatedAt || 0) > 0;
  }

  window.BOQIndexedCache = Object.freeze({
    clearLegacyWorkspace,
    hasLegacyWorkspace,
    hasWorkspaceData,
    openDatabase,
    read,
    stateSummary,
    validState,
    write,
  });
})();
