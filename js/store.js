(function defineDataStore() {
  const prefix = "boq-manager-v1";
  const collections = ["boqs", "projects", "products", "customers"];

  function read(key, fallback) {
    try {
      const value = localStorage.getItem(`${prefix}:${key}`);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(`${prefix}:${key}`, JSON.stringify(value));
    return value;
  }

  function list(collection) {
    if (!collections.includes(collection)) return [];
    return read(collection, []);
  }

  function get(collection, id) {
    return list(collection).find((record) => record.id === id) || null;
  }

  function createId() {
    return globalThis.crypto?.randomUUID?.() ||
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function save(collection, record) {
    const records = list(collection);
    const now = new Date().toISOString();
    const value = {
      ...record,
      id: record.id || createId(),
      createdAt: record.createdAt || now,
      updatedAt: now,
    };
    const existingIndex = records.findIndex((entry) => entry.id === value.id);
    if (existingIndex >= 0) records[existingIndex] = value;
    else records.unshift(value);
    write(collection, records);
    return value;
  }

  function remove(collection, id) {
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

  window.BOQStore = {
    list,
    get,
    save,
    remove,
    nextNumber,
    getSettings,
    saveSettings,
  };
})();
