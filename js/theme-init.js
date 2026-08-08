(function applyInitialTheme() {
  try {
    let savedTheme = localStorage.getItem("boq-manager-theme");
    if (!savedTheme) {
      const previousTheme = localStorage.getItem("boq_theme");
      if (previousTheme === "light" || previousTheme === "dark") {
        savedTheme = previousTheme;
        localStorage.setItem("boq-manager-theme", previousTheme);
      }
    }
    const systemPrefersDark =
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = savedTheme || (systemPrefersDark ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  } catch (error) {
    document.documentElement.dataset.theme = "light";
  }
})();
