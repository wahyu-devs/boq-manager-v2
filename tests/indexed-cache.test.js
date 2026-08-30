globalThis.window = globalThis;

await import("../js/indexed-cache.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.has(String(key)) ? this.#values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.#values.set(String(key), String(value));
  }

  removeItem(key) {
    this.#values.delete(String(key));
  }
}

function workspaceState() {
  return {
    collections: {
      boqs: [{
        id: "boq-1",
        items: [{ id: "item-1" }, { id: "item-2" }],
        revisions: [{ number: 0 }],
      }],
      products: [{ id: "product-1" }],
      customers: [{ id: "customer-1" }],
    },
    settings: { defaultCurrency: "IDR" },
    currentBoqId: "boq-1",
    meta: { schemaVersion: 5, clientUpdatedAt: 1234 },
  };
}

Deno.test("validates and summarizes an IndexedDB workspace record", () => {
  const cache = window.BOQIndexedCache;
  const state = workspaceState();
  assert(cache.validState(state), "workspace shape is valid");
  const summary = cache.stateSummary(state);
  assert(summary.boqs === 1, "BOQ count retained");
  assert(summary.products === 1, "product count retained");
  assert(summary.customers === 1, "customer count retained");
  assert(summary.items === 2, "item count retained");
  assert(summary.revisions === 1, "revision count retained");
  assert(summary.clientUpdatedAt === 1234, "timestamp retained");
});

Deno.test("accepts a multi-megabyte workspace without localStorage serialization", () => {
  const state = workspaceState();
  state.collections.products[0].name = "x".repeat(4 * 1024 * 1024);
  const serializedBytes = new TextEncoder().encode(JSON.stringify(state))
    .byteLength;
  assert(serializedBytes >= 3 * 1024 * 1024, "snapshot is at least 3 MB");
  assert(serializedBytes <= 10 * 1024 * 1024, "snapshot is at most 10 MB");
  assert(window.BOQIndexedCache.validState(state), "large state remains valid");
  assert(
    window.BOQIndexedCache.hasWorkspaceData(state),
    "large state contains workspace data",
  );
});

Deno.test("clears only verified legacy workspace keys", () => {
  const cache = window.BOQIndexedCache;
  const storage = new MemoryStorage();
  const prefix = "boq-manager-v2:user-1:";
  storage.setItem(`${prefix}boqs`, "[]");
  storage.setItem(`${prefix}products`, "[]");
  storage.setItem(`${prefix}preference-editor`, '{"edit":true}');
  storage.setItem("boq-manager-v2:user-2:boqs", "other user");

  assert(cache.hasLegacyWorkspace("user-1", storage), "legacy cache detected");
  cache.clearLegacyWorkspace("user-1", storage);

  assert(storage.getItem(`${prefix}boqs`) === null, "legacy BOQs removed");
  assert(storage.getItem(`${prefix}products`) === null, "legacy products removed");
  assert(
    storage.getItem(`${prefix}preference-editor`) !== null,
    "small preference retained",
  );
  assert(
    storage.getItem("boq-manager-v2:user-2:boqs") === "other user",
    "other user cache retained",
  );
});
