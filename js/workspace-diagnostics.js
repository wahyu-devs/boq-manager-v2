(function defineWorkspaceDiagnostics() {
  const stageCodes = Object.freeze({
    "cloud-read": "CLOUD_READ_FAILED",
    "cloud-missing": "CLOUD_WORKSPACE_MISSING",
    "cache-read": "CACHE_ACCESS_FAILED",
    "cache-apply": "WORKSPACE_APPLY_FAILED",
    migration: "WORKSPACE_MIGRATION_FAILED",
  });

  function finiteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function storageErrorCode(error) {
    const name = String(error?.name || "");
    const code = Number(error?.code);
    if (name === "QuotaExceededError" || code === 22 || code === 1014) {
      return "CACHE_WRITE_FAILED";
    }
    if (name === "SecurityError" || name === "NotAllowedError") {
      return "CACHE_ACCESS_FAILED";
    }
    return "";
  }

  function byteSize(value) {
    let serialized = "";
    try {
      serialized = typeof value === "string" ? value : JSON.stringify(value);
    } catch (_error) {
      return null;
    }
    if (typeof TextEncoder === "function") {
      return new TextEncoder().encode(serialized).byteLength;
    }
    return serialized.length * 2;
  }

  function createFailure(stage, error, context = {}) {
    const original = error instanceof Error
      ? error
      : new Error(String(error || "Unknown workspace error"));
    const failure = new Error(original.message || "Workspace loading failed");
    failure.name = "WorkspaceLoadError";
    failure.code = storageErrorCode(original) || stageCodes[stage] ||
      "WORKSPACE_LOAD_FAILED";
    failure.stage = String(stage || "unknown");
    failure.errorName = String(original.name || "Error");
    failure.snapshotBytes = finiteNumber(context.snapshotBytes);
    failure.rollbackSucceeded = typeof context.rollbackSucceeded === "boolean"
      ? context.rollbackSucceeded
      : null;
    failure.cause = original;
    return failure;
  }

  function captureCache(storage, prefix) {
    const entries = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) entries.push([key, storage.getItem(key)]);
    }
    return entries;
  }

  function restoreCache(storage, prefix, entries) {
    const currentKeys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) currentKeys.push(key);
    }
    currentKeys.forEach((key) => storage.removeItem(key));
    entries.forEach(([key, value]) => storage.setItem(key, value));
    return true;
  }

  function shouldBlockEmptyCloudPush({
    preventEmptyPush,
    cloudState,
    localTimestamp,
    hasLocalRecords,
  }) {
    return Boolean(
      preventEmptyPush && !cloudState && !Number(localTimestamp) &&
        !hasLocalRecords,
    );
  }

  async function storageEstimate(navigatorValue = globalThis.navigator) {
    if (!navigatorValue?.storage?.estimate) return null;
    try {
      const estimate = await navigatorValue.storage.estimate();
      return {
        usage: finiteNumber(estimate?.usage),
        quota: finiteNumber(estimate?.quota),
      };
    } catch (_error) {
      return null;
    }
  }

  async function report(failure, navigatorValue = globalThis.navigator) {
    const estimate = await storageEstimate(navigatorValue);
    return Object.freeze({
      code: String(failure?.code || "WORKSPACE_LOAD_FAILED"),
      stage: String(failure?.stage || "unknown"),
      errorName: String(failure?.errorName || failure?.name || "Error"),
      snapshotBytes: finiteNumber(failure?.snapshotBytes),
      storageUsage: estimate?.usage ?? null,
      storageQuota: estimate?.quota ?? null,
      rollbackSucceeded: typeof failure?.rollbackSucceeded === "boolean"
        ? failure.rollbackSucceeded
        : null,
    });
  }

  function formatBytes(value) {
    const bytes = finiteNumber(value);
    if (bytes === null) return "";
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB"];
    let amount = bytes / 1024;
    let unit = units[0];
    for (let index = 1; index < units.length && amount >= 1024; index += 1) {
      amount /= 1024;
      unit = units[index];
    }
    const digits = amount >= 100 ? 0 : amount >= 10 ? 1 : 2;
    return `${amount.toFixed(digits)} ${unit}`;
  }

  function describe(reportValue) {
    const details = [
      `Reference: ${reportValue.code}`,
      `Error: ${reportValue.errorName}`,
    ];
    if (reportValue.snapshotBytes !== null) {
      details.push(`Cloud snapshot: ${formatBytes(reportValue.snapshotBytes)}`);
    }
    if (reportValue.storageUsage !== null && reportValue.storageQuota !== null) {
      details.push(
        `Browser storage: ${formatBytes(reportValue.storageUsage)} of ${
          formatBytes(reportValue.storageQuota)
        } used`,
      );
    }
    if (reportValue.rollbackSucceeded === true) {
      details.push("Local cache restored");
    } else if (reportValue.rollbackSucceeded === false) {
      details.push("Local cache recovery failed");
    }
    return details.join(" · ");
  }

  window.BOQWorkspaceDiagnostics = Object.freeze({
    byteSize,
    captureCache,
    createFailure,
    describe,
    report,
    restoreCache,
    shouldBlockEmptyCloudPush,
  });
})();
