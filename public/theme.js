// Applies the saved theme (System / Light / Dark) before first paint; loaded in every page's <head>.
(function () {
  try {
    const theme = localStorage.getItem("board-theme");
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  } catch {}
})();
