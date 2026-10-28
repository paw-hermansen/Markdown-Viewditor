let currentThemeStyle: HTMLStyleElement | null = null;
let currentThemeId = "";

export function syncViewerBackground(): void {
  const el = document.getElementById("viewer-content");
  const bg = el ? getComputedStyle(el).backgroundColor : "";
  if (el && bg) {
    document.documentElement.style.setProperty("--viewer-bg", bg);
  }
}

export function injectThemeCss(themeId: string, css: string): void {
  if (currentThemeId === themeId) return;

  if (!currentThemeStyle) {
    currentThemeStyle = document.createElement("style");
    currentThemeStyle.id = "hljs-theme";
    document.head.appendChild(currentThemeStyle);
  }

  currentThemeStyle.textContent = css;
  currentThemeId = themeId;

  // Covers runtime theme switches (the viewer is mounted by then); the
  // Viewer's own effect is what covers startup.
  requestAnimationFrame(() => syncViewerBackground());
}

// Backward-compatible alias.
export const setTheme = injectThemeCss;
