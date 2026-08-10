globalThis.window = globalThis;

await import("../js/sync-policy.js");

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

Deno.test("uses blocking bootstrap only before a workspace is ready", () => {
  const policy = window.BOQSyncPolicy;
  equal(policy.isWarmStart(null, "user-1"), false, "cold start");
  equal(policy.isWarmStart("user-1", "user-1"), true, "warm navigation");
  equal(policy.isWarmStart("user-1", "user-2"), false, "changed user");
  equal(
    policy.canResumeWorkspace("user-1", "user-1"),
    true,
    "matching authenticated user",
  );
  equal(
    policy.canResumeWorkspace("user-1", "user-2"),
    false,
    "mismatched authenticated user",
  );
});

Deno.test("refreshes cloud in the background when appropriate", () => {
  const policy = window.BOQSyncPolicy;
  const base = {
    hasSession: true,
    isVisible: true,
    lastRefreshAt: 1000,
    now: 12000,
    interval: 10000,
  };
  equal(policy.shouldRefresh(base), true, "refresh interval elapsed");
  equal(
    policy.shouldRefresh({ ...base, now: 5000 }),
    false,
    "recent refresh",
  );
  equal(
    policy.shouldRefresh({ ...base, now: 5000, force: true }),
    true,
    "forced refresh",
  );
  equal(
    policy.shouldRefresh({ ...base, hasSession: false, force: true }),
    false,
    "missing session",
  );
  equal(
    policy.shouldRefresh({ ...base, isVisible: false, force: true }),
    false,
    "hidden page",
  );
});
