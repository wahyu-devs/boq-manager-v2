(function initializeAuthentication() {
  const serviceUrl = "https://lhrwrkcablnqewgndpsr.supabase.co";
  const publishableKey = "sb_publishable_NFPcMihNQpPB10r9tRYZdg_6AaOL3lo";
  const profileTable = "user_profiles";
  const stateTable = "user_app_state";
  const syncDelay = 3000;
  const backgroundRefreshInterval = 10000;
  const workspaceReadyKey = "boq-manager-workspace-ready";
  const store = window.BOQStore;
  const syncPolicy = window.BOQSyncPolicy;
  const workspaceDiagnostics = window.BOQWorkspaceDiagnostics;
  let client = null;
  let currentSession = null;
  let syncTimer = null;
  let syncPromise = null;
  let refreshInFlight = null;
  let lastRefreshAt = 0;
  let lastWorkspaceDiagnostic = null;
  let signingOut = false;

  function renderAuthInterface() {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="auth-screen" data-auth-screen aria-live="polite">
        <div class="auth-toolbar">
          <button class="icon-button" type="button" data-theme-toggle aria-label="Switch theme"></button>
        </div>
        <section class="auth-panel" aria-labelledby="auth-title">
          <div class="auth-brand">BOQ Manager</div>
          <div class="auth-loading" data-auth-loading>
            <span class="auth-spinner" aria-hidden="true"></span>
            <div><h1 id="auth-title">Preparing Your Workspace</h1><p>Checking your session and latest data…</p></div>
          </div>
          <form class="auth-form stack-md" data-login-form hidden>
            <div><h1>Welcome Back</h1><p>Sign in to continue to BOQ Manager.</p></div>
            <label class="field"><span class="field-label">Email</span><input class="input" name="email" type="email" autocomplete="username" required></label>
            <label class="field"><span class="field-label">Password</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
            <label class="checkbox-row"><input type="checkbox" name="remember" checked><span>Keep me signed in</span></label>
            <p class="form-error" data-login-error role="alert"></p>
            <p class="auth-diagnostic" data-auth-diagnostic hidden></p>
            <button class="button button-primary auth-submit" type="submit">Sign in</button>
            <button class="button button-secondary auth-retry" type="button" data-auth-retry hidden>Retry workspace</button>
          </form>
        </section>
      </div>
      <div class="modal-backdrop" id="password-modal" hidden>
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="password-title">
          <header class="modal-header"><div><h2 id="password-title">Change Password</h2><p class="muted text-sm">Confirm your current password first.</p></div><button class="icon-button" type="button" data-close-modal aria-label="Close">×</button></header>
          <form data-password-form>
            <div class="modal-body stack-md">
              <label class="field"><span class="field-label">Current password</span><input class="input" name="currentPassword" type="password" autocomplete="current-password" required></label>
              <label class="field"><span class="field-label">New password</span><input class="input" name="newPassword" type="password" minlength="6" autocomplete="new-password" required></label>
              <label class="field"><span class="field-label">Confirm new password</span><input class="input" name="confirmPassword" type="password" minlength="6" autocomplete="new-password" required></label>
              <p class="form-error" data-password-error role="alert"></p>
            </div>
            <footer class="modal-footer"><button class="button button-secondary" type="button" data-close-modal>Cancel</button><button class="button button-primary" type="submit">Update password</button></footer>
          </form>
        </section>
      </div>`,
    );
    window.BOQTheme?.updateControls();
  }

  function authError(message, options = {}) {
    const screen = document.querySelector("[data-auth-screen]");
    const loading = document.querySelector("[data-auth-loading]");
    const form = document.querySelector("[data-login-form]");
    if (screen) screen.hidden = false;
    document.body.classList.add("auth-pending");
    if (loading) loading.hidden = true;
    if (form) form.hidden = false;
    const button = form?.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = false;
      button.textContent = "Sign in";
    }
    const error = document.querySelector("[data-login-error]");
    if (error) error.textContent = message || "Unable to sign in.";
    const diagnostic = document.querySelector("[data-auth-diagnostic]");
    if (diagnostic) {
      diagnostic.textContent = options.diagnostic || "";
      diagnostic.hidden = !options.diagnostic;
    }
    const retry = document.querySelector("[data-auth-retry]");
    if (retry) {
      retry.hidden = !options.retry;
      retry.disabled = false;
      retry.textContent = "Retry workspace";
    }
  }

  function clearAuthDiagnostic() {
    const diagnostic = document.querySelector("[data-auth-diagnostic]");
    if (diagnostic) {
      diagnostic.hidden = true;
      diagnostic.textContent = "";
    }
    const retry = document.querySelector("[data-auth-retry]");
    if (retry) {
      retry.hidden = true;
      retry.disabled = false;
      retry.textContent = "Retry workspace";
    }
  }

  function showLogin() {
    document.body.classList.add("auth-pending");
    const screen = document.querySelector("[data-auth-screen]");
    if (screen) screen.hidden = false;
    document.querySelector("[data-auth-loading]")?.setAttribute("hidden", "");
    const form = document.querySelector("[data-login-form]");
    if (form) {
      form.hidden = false;
      form.elements.email.focus();
    }
    clearAuthDiagnostic();
  }

  function showApplication() {
    const screen = document.querySelector("[data-auth-screen]");
    if (screen) screen.hidden = true;
    document.body.classList.remove("auth-pending");
    clearAuthDiagnostic();
  }

  function safeSessionGet(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  }

  function safeSessionSet(key, value) {
    try {
      sessionStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn("Session cache is unavailable:", error?.name || "Error");
      return false;
    }
  }

  function safeSessionRemove(key) {
    try {
      sessionStorage.removeItem(key);
    } catch (_error) {
      // Session cache is optional; authentication remains server-backed.
    }
  }

  function initials(value) {
    return String(value || "User").split(/\s+/).filter(Boolean).slice(0, 2)
      .map((word) => word[0]).join("").toUpperCase();
  }

  function profileCacheKey(userId) {
    return `boq-manager-profile:${userId}`;
  }

  function cachedProfile(userId) {
    try {
      return JSON.parse(safeSessionGet(profileCacheKey(userId))) ||
        null;
    } catch (_error) {
      return null;
    }
  }

  function renderUserInterface(profile) {
    if (!profile) return;
    const displayName = profile.displayName || "User";
    document.querySelectorAll("[data-user-name]").forEach((node) =>
      node.textContent = displayName
    );
    document.querySelectorAll("[data-user-email]").forEach((node) =>
      node.textContent = profile.email || ""
    );
    document.querySelectorAll("[data-user-initials]").forEach((node) =>
      node.textContent = initials(displayName)
    );
  }

  async function updateUserInterface(session) {
    const user = session?.user;
    if (!user) return;
    let displayName = user.email?.split("@")[0] || "User";
    const cached = cachedProfile(user.id);
    if (cached) renderUserInterface(cached);
    try {
      const { data } = await client.from(profileTable).select("username")
        .eq("user_id", user.id).maybeSingle();
      if (data?.username?.trim()) displayName = data.username.trim();
    } catch (error) {
      console.error("Unable to refresh user profile:", error);
    }
    const profile = { displayName, email: user.email || "" };
    safeSessionSet(profileCacheKey(user.id), JSON.stringify(profile));
    renderUserInterface(profile);
  }

  function hasCachedWorkspace(userId) {
    const prefix = `boq-manager-v2:${userId}:`;
    return ["boqs", "products", "customers", "settings", "meta"].some(
      (key) => localStorage.getItem(`${prefix}${key}`) !== null,
    );
  }

  function workspaceCachePrefix(userId) {
    return `boq-manager-v2:${userId}:`;
  }

  function workspaceErrorMessage(report) {
    if (report.code === "CLOUD_WORKSPACE_MISSING") {
      return "Your cloud workspace was not returned. No empty workspace was uploaded. Check your connection and retry.";
    }
    if (report.code === "CACHE_WRITE_FAILED") {
      return "Safari could not store the downloaded workspace. Check the diagnostic details and retry.";
    }
    if (report.code === "CACHE_ACCESS_FAILED") {
      return "The browser blocked access to the local workspace cache. Check Safari storage settings and retry.";
    }
    if (report.code === "WORKSPACE_MIGRATION_FAILED") {
      return "The downloaded workspace could not be prepared on this browser. Check the diagnostic details and retry.";
    }
    if (report.code === "WORKSPACE_APPLY_FAILED") {
      return "The downloaded workspace could not be applied on this browser. Check the diagnostic details and retry.";
    }
    return "Unable to download your workspace. Check your connection and retry.";
  }

  async function reportWorkspaceFailure(error, options = {}) {
    const failure = error?.name === "WorkspaceLoadError"
      ? error
      : workspaceDiagnostics.createFailure("unknown", error);
    const report = await workspaceDiagnostics.report(failure);
    lastWorkspaceDiagnostic = report;
    console.error("Unable to refresh cloud data:", {
      ...report,
      cause: failure.cause?.name || failure.errorName,
    });
    if (options.showError) {
      authError(workspaceErrorMessage(report), {
        retry: true,
        diagnostic: workspaceDiagnostics.describe(report),
      });
    }
    return report;
  }

  function notifyWorkspaceUpdated(detail = {}) {
    document.dispatchEvent(
      new CustomEvent("boq:workspace-updated", {
        detail,
      }),
    );
  }

  function announceAuthReady(session) {
    document.dispatchEvent(
      new CustomEvent("boq:auth-ready", {
        detail: { user: session.user },
      }),
    );
  }

  function cloudTimestamp(row) {
    return Number(
      row?.state?.meta?.clientUpdatedAt ||
        Date.parse(row?.client_updated_at || row?.updated_at || "") || 0,
    );
  }

  function timestampValue(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(value || "");
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  async function fetchCloudState(userId) {
    const { data, error } = await client.from(stateTable)
      .select("*")
      .eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function pushCloudState(ensureLatest = false) {
    if (!currentSession?.user) return false;
    if (syncPromise) {
      const result = await syncPromise;
      return ensureLatest ? pushCloudState(false) : result;
    }
    syncPromise = (async () => {
      try {
        const state = store.exportState();
        const clientUpdatedAt = Number(state.meta.clientUpdatedAt || Date.now());
        state.meta.clientUpdatedAt = clientUpdatedAt;
        const { error } = await client.from(stateTable).upsert({
          user_id: currentSession.user.id,
          state,
          client_updated_at: new Date(clientUpdatedAt).toISOString(),
          app_version: "snapshot-v5",
        }, { onConflict: "user_id" });
        if (error) throw error;
        const meta = store.getMeta();
        localStorage.setItem(
          `boq-manager-v2:${currentSession.user.id}:meta`,
          JSON.stringify({
            ...meta,
            lastSyncedAt: Date.now(),
            lastSyncedClientUpdatedAt: clientUpdatedAt,
          }),
        );
        document.dispatchEvent(new CustomEvent("boq:sync-complete"));
        return true;
      } catch (error) {
        console.error("Cloud sync failed:", error);
        document.dispatchEvent(new CustomEvent("boq:sync-error"));
        return false;
      }
    })();
    try {
      return await syncPromise;
    } finally {
      syncPromise = null;
    }
  }

  function scheduleCloudSync() {
    if (!currentSession?.user) return;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(pushCloudState, syncDelay);
  }

  async function reconcileCloud(session, options = {}) {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      let cloud = null;
      try {
        cloud = await fetchCloudState(session.user.id);
      } catch (error) {
        throw workspaceDiagnostics.createFailure("cloud-read", error);
      }

      const cachePrefix = workspaceCachePrefix(session.user.id);
      const snapshotBytes = cloud?.state
        ? workspaceDiagnostics.byteSize(cloud.state)
        : null;
      let checkpoint = null;
      let stage = "cache-read";
      let changed = false;
      let shouldPush = false;
      try {
        checkpoint = workspaceDiagnostics.captureCache(
          localStorage,
          cachePrefix,
        );
        const local = store.exportState();
        const localTimestamp = Number(local.meta.clientUpdatedAt || 0);
        const remoteTimestamp = cloudTimestamp(cloud);
        const hasLocalRecords = Object.values(local.collections || {}).some(
          (records) => Array.isArray(records) && records.length,
        );
        if (workspaceDiagnostics.shouldBlockEmptyCloudPush({
          preventEmptyPush: options.preventEmptyPush,
          cloudState: cloud?.state,
          localTimestamp,
          hasLocalRecords,
        })) {
          stage = "cloud-missing";
          throw new Error("Cloud workspace row was not returned");
        }
        shouldPush = !cloud?.state || localTimestamp > remoteTimestamp;
        if (cloud?.state && remoteTimestamp > localTimestamp) {
          stage = "cache-apply";
          store.applyState(cloud.state, {
            silent: true,
            cloudCreatedAt: cloud.created_at,
            cloudUpdatedAt: cloud.updated_at,
          });
          changed = true;
        }

        stage = "migration";
        const migratedBoqs = store.migrateExistingBoqs({
          silent: true,
          cloudCreatedAt: cloud?.created_at,
          cloudUpdatedAt: cloud?.updated_at,
        });
        const migratedIssuedStatuses = store.migrateIssuedStatuses({
          silent: true,
        });
        const migratedPartNumbers = store.migrateLegacyPartNumbers({
          silent: true,
        });
        const migratedProductMargins = store.migrateProductMargins({
          silent: true,
        });
        const migratedBoqNumbers = store.migrateBoqNumbers({ silent: true });
        const backfilledPartNumbers = store.backfillBoqPartNumbers({
          silent: true,
        });
        const migratedBoqRevisions = store.migrateBoqRevisions({
          silent: true,
        });
        if (
          migratedBoqs || migratedIssuedStatuses || migratedPartNumbers ||
          migratedProductMargins || migratedBoqNumbers ||
          backfilledPartNumbers || migratedBoqRevisions
        ) {
          changed = true;
          shouldPush = true;
        }
      } catch (error) {
        let rollbackSucceeded = null;
        if (checkpoint) {
          try {
            rollbackSucceeded = workspaceDiagnostics.restoreCache(
              localStorage,
              cachePrefix,
              checkpoint,
            );
          } catch (_rollbackError) {
            rollbackSucceeded = false;
          }
        }
        throw workspaceDiagnostics.createFailure(stage, error, {
          rollbackSucceeded,
          snapshotBytes,
        });
      }

      if (shouldPush) await pushCloudState(true);
      if (changed && options.notify !== false) {
        notifyWorkspaceUpdated({ source: "cloud" });
      }
      return changed;
    })();
    try {
      return await refreshInFlight;
    } finally {
      refreshInFlight = null;
      lastRefreshAt = Date.now();
    }
  }

  async function refreshInBackground(options = {}) {
    if (
      !syncPolicy.shouldRefresh({
        hasSession: Boolean(currentSession?.user),
        isVisible: document.visibilityState !== "hidden",
        force: options.force,
        lastRefreshAt,
        interval: backgroundRefreshInterval,
      })
    ) {
      return false;
    }
    try {
      return await reconcileCloud(currentSession);
    } catch (error) {
      await reportWorkspaceFailure(error);
      return false;
    }
  }

  async function enterApplication(session, options = {}) {
    currentSession = session;
    let changedUser = false;
    let cached = null;
    let hadCache = false;
    try {
      changedUser = store.setUser(session.user.id);
      cached = cachedProfile(session.user.id);
      hadCache = hasCachedWorkspace(session.user.id);
    } catch (error) {
      const failure = workspaceDiagnostics.createFailure(
        "cache-read",
        error,
      );
      await reportWorkspaceFailure(failure, { showError: true });
      return false;
    }
    if (cached) renderUserInterface(cached);

    if (options.background) {
      showApplication();
      announceAuthReady(session);
      void updateUserInterface(session);
      void refreshInBackground({ force: true });
      return true;
    }

    let cloudChanged = false;
    try {
      [cloudChanged] = await Promise.all([
        reconcileCloud(session, {
          notify: false,
          preventEmptyPush: Boolean(options.retry),
        }),
        updateUserInterface(session),
      ]);
    } catch (error) {
      await reportWorkspaceFailure(error, { showError: !hadCache });
      if (!hadCache) {
        return false;
      }
    }
    safeSessionSet(workspaceReadyKey, session.user.id);
    if (changedUser || cloudChanged) {
      notifyWorkspaceUpdated({
        source: cloudChanged ? "cloud" : "local",
        initial: true,
        userChanged: changedUser,
      });
    }
    showApplication();
    announceAuthReady(session);
    return true;
  }

  async function initialize() {
    renderAuthInterface();
    if (!workspaceDiagnostics) {
      authError(
        "Workspace diagnostics could not be loaded. Check your connection and reload.",
      );
      return;
    }
    if (!window.supabase?.createClient) {
      authError(
        "Authentication service could not be loaded. Check your connection and reload.",
      );
      return;
    }
    client = window.supabase.createClient(serviceUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    window.BOQAuth.client = client;
    client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        safeSessionRemove(workspaceReadyKey);
        currentSession = null;
        store.setUser(null);
        if (!signingOut) location.reload();
        return;
      }
      if (!session?.user || event === "INITIAL_SESSION") return;
      const previousUserId = currentSession?.user?.id || store.getUserId();
      currentSession = session;
      if (previousUserId && previousUserId !== session.user.id) {
        safeSessionRemove(workspaceReadyKey);
        location.reload();
      }
    });
    const readyUserId = safeSessionGet(workspaceReadyKey);
    const cachedUserId = store.getUserId();
    const warmStart = syncPolicy.isWarmStart(readyUserId, cachedUserId);
    if (warmStart) {
      renderUserInterface(cachedProfile(cachedUserId));
      showApplication();
    }
    const { data, error } = await client.auth.getSession();
    if (error) {
      safeSessionRemove(workspaceReadyKey);
      store.setUser(null);
      authError(error.message);
      return;
    }
    if (!data.session?.user) {
      safeSessionRemove(workspaceReadyKey);
      store.setUser(null);
      showLogin();
      return;
    }
    await enterApplication(data.session, {
      background: warmStart && syncPolicy.canResumeWorkspace(
        readyUserId,
        data.session.user.id,
      ),
    });
  }

  document.addEventListener("submit", async (event) => {
    const loginForm = event.target.closest("[data-login-form]");
    if (loginForm) {
      event.preventDefault();
      clearAuthDiagnostic();
      const button = loginForm.querySelector('button[type="submit"]');
      const errorNode = loginForm.querySelector("[data-login-error]");
      errorNode.textContent = "";
      button.disabled = true;
      button.textContent = "Signing in…";
      const { data, error } = await client.auth.signInWithPassword({
        email: loginForm.elements.email.value.trim(),
        password: loginForm.elements.password.value,
      });
      if (error || !data.session) {
        errorNode.textContent = "Invalid email or password.";
        button.disabled = false;
        button.textContent = "Sign in";
        loginForm.elements.password.select();
        return;
      }
      await enterApplication(data.session);
      return;
    }

    const passwordForm = event.target.closest("[data-password-form]");
    if (!passwordForm) return;
    event.preventDefault();
    const errorNode = passwordForm.querySelector("[data-password-error]");
    const currentPassword = passwordForm.elements.currentPassword.value;
    const nextPassword = passwordForm.elements.newPassword.value;
    const confirmation = passwordForm.elements.confirmPassword.value;
    errorNode.textContent = "";
    if (nextPassword !== confirmation) {
      errorNode.textContent = "New password confirmation does not match.";
      return;
    }
    const email = currentSession?.user?.email;
    const { error: reauthError } = await client.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (reauthError) {
      errorNode.textContent = "Current password is incorrect.";
      return;
    }
    const { error } = await client.auth.updateUser({ password: nextPassword });
    if (error) {
      errorNode.textContent = error.message;
      return;
    }
    window.BOQModal.close(document.getElementById("password-modal"));
    passwordForm.reset();
    window.BOQApp?.showToast("Password updated.");
  });

  document.addEventListener("click", async (event) => {
    const retryButton = event.target.closest("[data-auth-retry]");
    if (retryButton) {
      if (!currentSession?.user) {
        showLogin();
        return;
      }
      const errorNode = document.querySelector("[data-login-error]");
      const diagnosticNode = document.querySelector("[data-auth-diagnostic]");
      if (errorNode) errorNode.textContent = "";
      if (diagnosticNode) diagnosticNode.hidden = true;
      retryButton.disabled = true;
      retryButton.textContent = "Retrying…";
      await enterApplication(currentSession);
      return;
    }
    if (event.target.closest("[data-change-password]")) {
      window.BOQModal.open("password-modal");
    }
    if (!event.target.closest("[data-logout]")) return;
    signingOut = true;
    await pushCloudState(true);
    safeSessionRemove(workspaceReadyKey);
    await client.auth.signOut();
    store.setUser(null);
    location.reload();
  });

  document.addEventListener("boq:data-changed", scheduleCloudSync);
  window.addEventListener("online", () => {
    scheduleCloudSync();
    void refreshInBackground({ force: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void refreshInBackground();
    }
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void refreshInBackground({ force: true });
  });
  window.addEventListener("pagehide", () => {
    if (syncTimer) void pushCloudState(true);
  });

  window.BOQAuth = {
    client: null,
    push: () => pushCloudState(true),
    refresh: async () => {
      if (!currentSession?.user) return false;
      return reconcileCloud(currentSession, { notify: true });
    },
    getWorkspaceDiagnostic: () => lastWorkspaceDiagnostic,
    checkIssueConflict: async (boqId, knownUpdatedAt) => {
      if (!currentSession?.user || !boqId) return { ok: true };
      try {
        const cloud = await fetchCloudState(currentSession.user.id);
        const remote = cloud?.state?.collections?.boqs?.find((boq) =>
          boq.id === boqId
        );
        if (remote && timestampValue(remote.updatedAt) >
            timestampValue(knownUpdatedAt)) {
          return {
            ok: false,
            message:
              "A newer cloud version is available. Refresh before issuing this revision.",
          };
        }
        return { ok: true };
      } catch (_error) {
        return {
          ok: false,
          message:
            "Cloud verification failed. Check your connection before issuing this revision.",
        };
      }
    },
  };
  initialize();
})();
