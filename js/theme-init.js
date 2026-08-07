(function applyInitialTheme() {
  try {
    const savedTheme = localStorage.getItem("boq-manager-theme");
    const systemPrefersDark =
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = savedTheme || (systemPrefersDark ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  } catch (error) {
    document.documentElement.dataset.theme = "light";
  }
})();
