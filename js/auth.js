(function initializeAuthentication() {
  const serviceUrl = "https://lhrwrkcablnqewgndpsr.supabase.co";
  const publishableKey = "sb_publishable_NFPcMihNQpPB10r9tRYZdg_6AaOL3lo";
  const profileTable = "user_profiles";
  const stateTable = "user_app_state";
  const syncDelay = 3000;
  const store = window.BOQStore;
  let client = null;
  let currentSession = null;
  let syncTimer = null;
  let syncInFlight = false;

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
            <div><h1 id="auth-title">Preparing your workspace</h1><p>Checking your session and latest data…</p></div>
          </div>
          <form class="auth-form stack-md" data-login-form hidden>
            <div><h1>Welcome back</h1><p>Sign in to continue to BOQ Manager.</p></div>
            <label class="field"><span class="field-label">Email</span><input class="input" name="email" type="email" autocomplete="username" required></label>
            <label class="field"><span class="field-label">Password</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
            <label class="checkbox-row"><input type="checkbox" name="remember" checked><span>Keep me signed in</span></label>
            <p class="form-error" data-login-error role="alert"></p>
            <button class="button button-primary auth-submit" type="submit">Sign in</button>
          </form>
        </section>
      </div>
      <div class="modal-backdrop" id="password-modal" hidden>
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="password-title">
          <header class="modal-header"><div><h2 id="password-title">Change password</h2><p class="muted text-sm">Confirm your current password first.</p></div><button class="icon-button" type="button" data-close-modal aria-label="Close">×</button></header>
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

  function authError(message) {
    const loading = document.querySelector("[data-auth-loading]");
    const form = document.querySelector("[data-login-form]");
    if (loading) loading.hidden = true;
    if (form) form.hidden = false;
    const error = document.querySelector("[data-login-error]");
    if (error) error.textContent = message || "Unable to sign in.";
  }

  function showLogin() {
    document.body.classList.add("auth-pending");
    document.querySelector("[data-auth-loading]")?.setAttribute("hidden", "");
    const form = document.querySelector("[data-login-form]");
    if (form) {
      form.hidden = false;
      form.elements.email.focus();
    }
  }

  function showApplication() {
    document.querySelector("[data-auth-screen]")?.remove();
    document.body.classList.remove("auth-pending");
  }

  function initials(value) {
    return String(value || "User").split(/\s+/).filter(Boolean).slice(0, 2)
      .map((word) => word[0]).join("").toUpperCase();
  }

  async function updateUserInterface(session) {
    const user = session?.user;
    if (!user) return;
    let displayName = user.email?.split("@")[0] || "User";
    const { data } = await client.from(profileTable).select("username")
      .eq("user_id", user.id).maybeSingle();
    if (data?.username?.trim()) displayName = data.username.trim();
    document.querySelectorAll("[data-user-name]").forEach((node) =>
      node.textContent = displayName
    );
    document.querySelectorAll("[data-user-email]").forEach((node) =>
      node.textContent = user.email || ""
    );
    document.querySelectorAll("[data-user-initials]").forEach((node) =>
      node.textContent = initials(displayName)
    );
  }

  function cloudTimestamp(row) {
    return Number(row?.state?.meta?.clientUpdatedAt ||
      Date.parse(row?.client_updated_at || row?.updated_at || "") || 0);
  }

  async function fetchCloudState(userId) {
    const { data, error } = await client.from(stateTable)
      .select("*")
      .eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function pushCloudState() {
    if (!currentSession?.user || syncInFlight) return false;
    syncInFlight = true;
    try {
      const state = store.exportState();
      const clientUpdatedAt = Number(state.meta.clientUpdatedAt || Date.now());
      state.meta.clientUpdatedAt = clientUpdatedAt;
      const { error } = await client.from(stateTable).upsert({
        user_id: currentSession.user.id,
        state,
        client_updated_at: new Date(clientUpdatedAt).toISOString(),
        app_version: "snapshot-v4",
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
    } finally {
      syncInFlight = false;
    }
  }

  function scheduleCloudSync() {
    if (!currentSession?.user) return;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(pushCloudState, syncDelay);
  }

  async function reconcileCloud(session) {
    const cloud = await fetchCloudState(session.user.id);
    const local = store.exportState();
    const localTimestamp = Number(local.meta.clientUpdatedAt || 0);
    const remoteTimestamp = cloudTimestamp(cloud);
    let changed = false;
    let shouldPush = !cloud?.state || localTimestamp > remoteTimestamp;
    if (cloud?.state && remoteTimestamp > localTimestamp) {
      store.applyState(cloud.state, {
        silent: true,
        cloudCreatedAt: cloud.created_at,
        cloudUpdatedAt: cloud.updated_at,
      });
      changed = true;
    }
    const migrated = store.migrateExistingBoqs({
      silent: true,
      cloudCreatedAt: cloud?.created_at,
      cloudUpdatedAt: cloud?.updated_at,
    });
    if (migrated) {
      changed = true;
      shouldPush = true;
    }
    if (shouldPush) await pushCloudState();
    return changed;
  }

  async function enterApplication(session, options = {}) {
    currentSession = session;
    const changedUser = store.setUser(session.user.id);
    await updateUserInterface(session);
    let cloudChanged = false;
    try {
      cloudChanged = await reconcileCloud(session);
    } catch (error) {
      console.error("Unable to refresh cloud data:", error);
    }
    if ((changedUser || cloudChanged) && !options.afterReload) {
      sessionStorage.setItem("boq-manager-session-refresh", session.user.id);
      location.reload();
      return;
    }
    sessionStorage.removeItem("boq-manager-session-refresh");
    showApplication();
    document.dispatchEvent(new CustomEvent("boq:auth-ready", {
      detail: { user: session.user },
    }));
  }

  async function initialize() {
    renderAuthInterface();
    if (!window.supabase?.createClient) {
      authError("Authentication service could not be loaded. Check your connection and reload.");
      return;
    }
    client = window.supabase.createClient(serviceUrl, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    window.BOQAuth.client = client;
    const { data, error } = await client.auth.getSession();
    if (error) {
      authError(error.message);
      return;
    }
    if (!data.session?.user) {
      store.setUser(null);
      showLogin();
      return;
    }
    const afterReload = sessionStorage.getItem("boq-manager-session-refresh") ===
      data.session.user.id;
    await enterApplication(data.session, { afterReload });
  }

  document.addEventListener("submit", async (event) => {
    const loginForm = event.target.closest("[data-login-form]");
    if (loginForm) {
      event.preventDefault();
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
    if (event.target.closest("[data-change-password]")) {
      window.BOQModal.open("password-modal");
    }
    if (!event.target.closest("[data-logout]")) return;
    await pushCloudState();
    await client.auth.signOut();
    store.setUser(null);
    location.reload();
  });

  document.addEventListener("boq:data-changed", scheduleCloudSync);
  window.addEventListener("online", scheduleCloudSync);
  window.addEventListener("pagehide", () => {
    if (syncTimer) void pushCloudState();
  });

  window.BOQAuth = {
    client: null,
    push: pushCloudState,
    refresh: async () => {
      if (!currentSession?.user) return false;
      return reconcileCloud(currentSession);
    },
  };
  initialize();
})();
