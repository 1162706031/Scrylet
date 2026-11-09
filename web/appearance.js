(() => {
  "use strict";
  const ids = ["forest", "ocean", "clay", "midnight"], key = "scrylet.appearance.v1";
  let revision = -1, running = false;
  const valid = value => value && value.apiVersion === 1 && ids.includes(value.themeId) &&
    Number.isSafeInteger(value.revision) && value.revision >= 0 && Object.keys(value).length === 3;
  function apply(value, cached = false) {
    if (!valid(value) || (!cached && value.revision < revision)) return false;
    if (!cached) revision = value.revision;
    document.documentElement.dataset.theme = value.themeId;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Styling still works without storage. */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--snap-bg").trim();
    return true;
  }
  try { apply(JSON.parse(localStorage.getItem(key)), true); } catch { /* First visit uses the shared default. */ }
  window.scryletAppearance = Object.freeze({ apply });
  async function sync() {
    if (running || document.hidden || !/^https?:$/.test(location.protocol)) return;
    running = true;
    try {
      const result = await fetch("/snap/appearance", { cache: "no-store", credentials: "same-origin", redirect: "error", signal: AbortSignal.timeout(5000) });
      if (result.ok) apply(await result.json());
    } catch { /* Keep the last known palette while disconnected; retry on return. */ }
    finally { running = false; }
  }
  if (/^https?:$/.test(location.protocol)) {
    void sync();
    setInterval(() => void sync(), 1500);
    addEventListener("focus", () => void sync());
    document.addEventListener("visibilitychange", () => void sync());
  }
})();
