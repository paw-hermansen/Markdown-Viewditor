import { registerFeatureDetectors } from "$lib/utils/markdown-levels";

registerFeatureDetectors({
  id: "vega-lite",
  label: "Vega-Lite charts",
  // GitHub does not render vega-lite fences, so the feature belongs to the
  // app-specific `advanced` level only (same placement as SMILES).
  presets: { advanced: true },
  detect(tokens) {
    const lines: number[] = [];
    for (const t of tokens) {
      if (t.type === "fence" && t.map) {
        const lang = t.info.trim().split(/\s+/)[0].toLowerCase();
        if (lang === "vega-lite" || lang === "vegalite") {
          lines.push(t.map[0] + 1);
        }
      }
    }
    return lines;
  },
});
