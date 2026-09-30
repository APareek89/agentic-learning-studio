(() => {
  const root = document.documentElement;
  let selected = "light";
  try { selected = localStorage.getItem("portfolio-theme") || "light"; } catch {}
  const toggle = document.getElementById("portfolio-theme");
  function setTheme(theme) {
    root.dataset.theme = theme;
    const frame = document.getElementById("viewer-frame");
    frame?.contentWindow?.postMessage({ type: "als-theme", value: theme }, "*");
    try { localStorage.setItem("als-theme", theme); } catch {}
    const viewerToggle = document.getElementById("viewer-theme");
    if (viewerToggle) { viewerToggle.textContent = theme === "dark" ? "Light theme" : "Dark theme"; viewerToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme"); }
    try { localStorage.setItem("portfolio-theme", theme); } catch {}
    if (toggle) { toggle.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme"); toggle.innerHTML = `<i data-lucide="${theme === "dark" ? "sun" : "moon"}"></i>`; }
    window.lucide?.createIcons();
  }
  window.setPortfolioTheme = setTheme;
  setTheme(selected);
  toggle?.addEventListener("click", () => { selected = root.dataset.theme === "dark" ? "light" : "dark"; setTheme(selected); try { localStorage.setItem("portfolio-theme", selected); } catch {} });
  let toastTimer;
  window.portfolioToast = (message) => {
    let toast = document.getElementById("portfolio-toast");
    if (!toast) { toast = document.createElement("div"); toast.id = "portfolio-toast"; toast.className = "portfolio-toast"; toast.setAttribute("role", "status"); document.body.append(toast); }
    toast.textContent = message; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 7000);
  };
  document.querySelectorAll("[data-try-example]").forEach((button) => button.addEventListener("click", async () => {
    if (typeof authRequiredAndOut === "function" && authRequiredAndOut()) { openAuth("signin"); window.portfolioToast("Sign in, then try the free cached example."); return; }
    button.disabled = true;
    try {
      const response = await fetch("/api/examples/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: "agent-memory" }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load example.");
      openLessonInWorkspace(data.artifact.id, data.artifact.title, "Cached example");
      loadDashboard(); window.portfolioToast("Cached example ready. No AI call was made.");
    } catch (error) { window.portfolioToast(error.message); }
    finally { button.disabled = false; }
  }));
})();
