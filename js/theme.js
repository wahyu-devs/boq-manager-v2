(function initializeTheme() {
  const storageKey = "boq-manager-theme";

  function themeIcon(theme) {
    if (theme === "dark") {
      return '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.64 5.64l1.42 1.42M16.94 16.94l1.42 1.42M18.36 5.64l-1.42 1.42M7.06 16.94l-1.42 1.42"/><circle cx="12" cy="12" r="4"/></svg>';
    }
    return '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20.5 14.2A8.4 8.4 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/></svg>';
  }

  function updateControls() {
    const currentTheme = document.documentElement.dataset.theme || "light";
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      button.innerHTML = themeIcon(currentTheme);
      button.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
      button.setAttribute("title", `Switch to ${nextTheme} mode`);
      button.setAttribute("aria-pressed", String(currentTheme === "dark"));
    });

    document.querySelectorAll("[data-theme-select]").forEach((select) => {
      select.value = localStorage.getItem(storageKey) || "system";
    });
  }

  function setTheme(theme, persist = true) {
    const resolvedTheme = theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light")
      : theme;

    document.body.classList.add("theme-transition");
    document.documentElement.dataset.theme = resolvedTheme;

    if (persist) {
      if (theme === "system") localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, theme);
    }

    updateControls();
    window.setTimeout(
      () => document.body.classList.remove("theme-transition"),
      220,
    );
  }

  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-theme-toggle]");
    if (!toggle) return;
    const currentTheme = document.documentElement.dataset.theme || "light";
    setTheme(currentTheme === "dark" ? "light" : "dark");
  });

  document.addEventListener("change", (event) => {
    if (!event.target.matches("[data-theme-select]")) return;
    setTheme(event.target.value);
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener(
    "change",
    () => {
      if (!localStorage.getItem(storageKey)) setTheme("system", false);
    },
  );

  window.BOQTheme = { setTheme, updateControls };
  updateControls();
})();
