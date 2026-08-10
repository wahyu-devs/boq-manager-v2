(function defineSyncPolicy() {
  function isWarmStart(readyUserId, cachedUserId) {
    return Boolean(readyUserId && readyUserId === cachedUserId);
  }

  function canResumeWorkspace(readyUserId, sessionUserId) {
    return Boolean(readyUserId && readyUserId === sessionUserId);
  }

  function shouldRefresh({
    hasSession,
    isVisible,
    force = false,
    lastRefreshAt = 0,
    now = Date.now(),
    interval = 10000,
  }) {
    if (!hasSession || !isVisible) return false;
    return force || now - lastRefreshAt >= interval;
  }

  window.BOQSyncPolicy = Object.freeze({
    isWarmStart,
    canResumeWorkspace,
    shouldRefresh,
  });
})();
