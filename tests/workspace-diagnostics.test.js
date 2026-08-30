globalThis.window = globalThis;

await import("../js/workspace-diagnostics.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

class MemoryStorage {
  #values = new Map();

  get length() {
    return this.#values.size;
  }

  key(index) {
    return [...this.#values.keys()][index] ?? null;
  }

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

Deno.test("classifies workspace bootstrap failures without exposing data", async () => {
  const diagnostics = window.BOQWorkspaceDiagnostics;
  const quotaError = new Error("record contents must stay private");
  quotaError.name = "QuotaExceededError";
  const failure = diagnostics.createFailure("cache-apply", quotaError, {
    rollbackSucceeded: true,
    snapshotBytes: 5242880,
  });
  const report = await diagnostics.report(failure, {
    storage: {
      estimate: () => Promise.resolve({ usage: 1048576, quota: 8388608 }),
    },
  });
  equal(report.code, "CACHE_WRITE_FAILED", "quota failure code");
  equal(report.stage, "cache-apply", "quota failure stage");
  equal(report.snapshotBytes, 5242880, "snapshot size");
  equal(report.rollbackSucceeded, true, "cache rollback state");
  const description = diagnostics.describe(report);
  assert(description.includes("Reference: CACHE_WRITE_FAILED"), "reference");
  assert(description.includes("Cloud snapshot: 5.00 MB"), "snapshot detail");
  assert(description.includes("Local cache restored"), "rollback detail");
  assert(!description.includes("record contents"), "private data is excluded");
});

Deno.test("distinguishes cloud, cache access, apply, and migration failures", () => {
  const diagnostics = window.BOQWorkspaceDiagnostics;
  equal(
    diagnostics.createFailure("cloud-read", new Error("offline")).code,
    "CLOUD_READ_FAILED",
    "cloud read failure",
  );
  equal(
    diagnostics.createFailure("cloud-missing", new Error("missing")).code,
    "CLOUD_WORKSPACE_MISSING",
    "missing cloud workspace",
  );
  const securityError = new Error("blocked");
  securityError.name = "SecurityError";
  equal(
    diagnostics.createFailure("cache-read", securityError).code,
    "CACHE_ACCESS_FAILED",
    "cache access failure",
  );
  equal(
    diagnostics.createFailure("cache-apply", new Error("invalid state")).code,
    "WORKSPACE_APPLY_FAILED",
    "workspace apply failure",
  );
  equal(
    diagnostics.createFailure("migration", new Error("migration failed")).code,
    "WORKSPACE_MIGRATION_FAILED",
    "workspace migration failure",
  );
});

Deno.test("restores a cold-start cache checkpoint after a partial write", () => {
  const diagnostics = window.BOQWorkspaceDiagnostics;
  const storage = new MemoryStorage();
  const prefix = "boq-manager-v2:user-1:";
  storage.setItem("boq-manager-theme", "dark");
  const checkpoint = diagnostics.captureCache(storage, prefix);
  storage.setItem(`${prefix}boqs`, "partial workspace");
  storage.setItem(`${prefix}products`, "partial catalog");
  diagnostics.restoreCache(storage, prefix, checkpoint);
  equal(storage.getItem(`${prefix}boqs`), null, "partial BOQs removed");
  equal(storage.getItem(`${prefix}products`), null, "partial products removed");
  equal(storage.getItem("boq-manager-theme"), "dark", "unrelated data retained");
});

Deno.test("restores an existing cache without changing unrelated users", () => {
  const diagnostics = window.BOQWorkspaceDiagnostics;
  const storage = new MemoryStorage();
  const prefix = "boq-manager-v2:user-1:";
  storage.setItem(`${prefix}boqs`, "previous BOQs");
  storage.setItem("boq-manager-v2:user-2:boqs", "other user BOQs");
  const checkpoint = diagnostics.captureCache(storage, prefix);
  storage.setItem(`${prefix}boqs`, "partial replacement");
  storage.setItem(`${prefix}settings`, "partial settings");
  diagnostics.restoreCache(storage, prefix, checkpoint);
  equal(storage.getItem(`${prefix}boqs`), "previous BOQs", "BOQs restored");
  equal(storage.getItem(`${prefix}settings`), null, "new partial key removed");
  equal(
    storage.getItem("boq-manager-v2:user-2:boqs"),
    "other user BOQs",
    "other user cache retained",
  );
});

Deno.test("retry cannot upload an empty workspace when cloud state is missing", () => {
  const diagnostics = window.BOQWorkspaceDiagnostics;
  equal(
    diagnostics.shouldBlockEmptyCloudPush({
      preventEmptyPush: true,
      cloudState: null,
      localTimestamp: 0,
      hasLocalRecords: false,
    }),
    true,
    "empty retry is blocked",
  );
  equal(
    diagnostics.shouldBlockEmptyCloudPush({
      preventEmptyPush: true,
      cloudState: { collections: {} },
      localTimestamp: 0,
      hasLocalRecords: false,
    }),
    false,
    "existing cloud state is allowed",
  );
  equal(
    diagnostics.shouldBlockEmptyCloudPush({
      preventEmptyPush: true,
      cloudState: null,
      localTimestamp: 1,
      hasLocalRecords: false,
    }),
    false,
    "meaningful local state is allowed",
  );
});

Deno.test("every application page loads diagnostics before authentication", async () => {
  const pages = [
    "index.html",
    "boqs.html",
    "boq-editor.html",
    "products.html",
    "customers.html",
    "settings.html",
  ];
  for (const page of pages) {
    const source = await Deno.readTextFile(new URL(`../${page}`, import.meta.url));
    const diagnosticsIndex = source.indexOf("js/workspace-diagnostics.js");
    const authIndex = source.indexOf("js/auth.js");
    assert(diagnosticsIndex >= 0, `${page} loads workspace diagnostics`);
    assert(diagnosticsIndex < authIndex, `${page} loads diagnostics before auth`);
  }
});

Deno.test("authentication exposes a safe retry for cold-start failures", async () => {
  const source = await Deno.readTextFile(
    new URL("../js/auth.js", import.meta.url),
  );
  assert(source.includes("data-auth-retry"), "retry control exists");
  assert(source.includes("Retry workspace"), "retry label exists");
  assert(source.includes("workspaceDiagnostics.captureCache"), "cache checkpoint");
  assert(source.includes("workspaceDiagnostics.restoreCache"), "cache rollback");
  assert(source.includes("preventEmptyPush: Boolean(options.retry)"), "safe retry");
  assert(
    source.includes("workspaceDiagnostics.shouldBlockEmptyCloudPush"),
    "missing cloud guard",
  );
  assert(!source.includes("localStorage.clear"), "retry never clears storage");
});
