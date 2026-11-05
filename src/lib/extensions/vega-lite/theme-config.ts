/**
 * App theme → Vega config (plan §7).
 *
 * Two token sources (this split is a contract — bugs found by
 * `testing/VegaLite-All.md`):
 *
 * - `auto` in the viewer reads live DOM tokens (computed styles on
 *   `#viewer-content`, where the theme CSS is scoped) so charts follow the
 *   app theme, and stays `background: transparent` so the document
 *   background shows through.
 * - **Pinned themes (`theme=light|dark`) and exports use the FIXED palettes
 *   below, never the DOM.** A pinned theme is a self-contained look — it
 *   must not change when the app theme changes — and exports are neutral
 *   documents whose look must not depend on the editor's dark theme
 *   (light-gray-on-white export bug). Pinned themes additionally paint
 *   their own background so a dark chart is legible on a white page and
 *   stable across app themes.
 *
 * Custom themes can steer the categorical palette of *auto* charts by
 * declaring `--vega-category-1` … `--vega-category-8` on
 * `#viewer-content`; anything unset falls back to the built-in palettes.
 */
export interface VegaAppThemeInfo {
  type: "light" | "dark";
  themeId: string;
}

/** Concrete font stack for neutral documents (ODT/DOCX export). */
export const EXPORT_FONT_STACK =
  "Liberation Sans, Arial, Helvetica, sans-serif";

const FALLBACK_FONT_STACK = "Helvetica, Arial, sans-serif";

const FALLBACK_CATEGORY = [
  "#4c78a8",
  "#f58518",
  "#e45756",
  "#72b7b2",
  "#54a24b",
  "#eeca3b",
  "#b279a2",
  "#ff9da6",
];

/** Fixed look per theme: very dark gray on white / light gray on dark. */
const FIXED_TOKENS: Record<"light" | "dark", { fg: string; bg: string }> = {
  light: { fg: "#333333", bg: "#ffffff" },
  dark: { fg: "#e6e6e6", bg: "#202124" },
};

/** Read the app theme from the DOM (setTheme's atomic attributes). */
export function getVegaAppTheme(): VegaAppThemeInfo {
  if (typeof document !== "undefined") {
    const type: "light" | "dark" =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "dark"
        : "light";
    const themeId =
      document.documentElement.getAttribute("data-theme-id") ?? "unknown";
    return { type, themeId };
  }
  return { type: "light", themeId: "unknown" };
}

/** `theme=auto` follows the app theme; `light`/`dark` force a built-in look. */
export function resolveThemeChoice(choice: string): "light" | "dark" {
  return choice === "light" || choice === "dark"
    ? choice
    : getVegaAppTheme().type;
}

/**
 * `color`/`rgb()`/`rgba()`/`#hex` → `rgba(...)` at the given alpha, for
 * derived paints (grid lines, view stroke). Unparseable values pass through
 * unchanged — safer than dropping the paint entirely.
 */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((c) => c + c)
            .join("")
        : hex[1];
    const r = parseInt(digits.slice(0, 2), 16);
    const g = parseInt(digits.slice(2, 4), 16);
    const b = parseInt(digits.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color.trim());
  if (rgb) {
    const [r, g, b] = rgb[1].split(",").map((part) => part.trim());
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

interface ThemeTokens {
  fg: string;
  font: string;
  category: string[];
}

function fixedTokens(theme: "light" | "dark"): ThemeTokens {
  return {
    fg: FIXED_TOKENS[theme].fg,
    font: FALLBACK_FONT_STACK,
    category: FALLBACK_CATEGORY,
  };
}

function domTokens(theme: "light" | "dark"): ThemeTokens {
  const fallback = fixedTokens(theme);
  if (
    typeof document === "undefined" ||
    typeof getComputedStyle !== "function"
  ) {
    return fallback;
  }
  const host =
    document.getElementById("viewer-content") ?? document.documentElement;
  const computed = getComputedStyle(host);
  const fg = computed.color || fallback.fg;
  const font = computed.fontFamily || fallback.font;
  const category: string[] = [];
  for (let i = 1; i <= FALLBACK_CATEGORY.length; i++) {
    category.push(
      computed.getPropertyValue(`--vega-category-${i}`).trim() ||
        FALLBACK_CATEGORY[i - 1],
    );
  }
  return { fg, font, category };
}

export interface VegaConfigOptions {
  /** Force the font (exports pin the concrete neutral stack). */
  font?: string;
  /** Read live DOM tokens (viewer `auto`); false = fixed palette. */
  useDomTokens?: boolean;
  /** Paint the theme's own background (pinned themes); auto stays transparent. */
  paintBackground?: boolean;
}

/**
 * The Vega config base for a theme. Passed as `opt.config` to
 * `vl.compile` — the spec's own `config` object overrides it per-key.
 */
export function buildVegaConfig(
  theme: "light" | "dark",
  opts?: VegaConfigOptions,
): Record<string, unknown> {
  const tokens = opts?.useDomTokens ? domTokens(theme) : fixedTokens(theme);
  const fg = tokens.fg;
  return {
    background: opts?.paintBackground ? FIXED_TOKENS[theme].bg : "transparent",
    font: opts?.font ?? tokens.font,
    range: { category: tokens.category },
    mark: { color: tokens.category[0] },
    // Text marks have a hardcoded black default that `mark.color` does NOT
    // override — only `config.text.color` moves their fill (pinned by the
    // upgrade-contract test). Without this, value labels stay black on dark
    // themes.
    text: { color: fg },
    axis: {
      domainColor: fg,
      gridColor: withAlpha(fg, 0.15),
      tickColor: fg,
      labelColor: fg,
      titleColor: fg,
    },
    legend: {
      labelColor: fg,
      titleColor: fg,
    },
    title: {
      color: fg,
      subtitleColor: withAlpha(fg, 0.7),
    },
    view: {
      stroke: withAlpha(fg, 0.2),
    },
  };
}
