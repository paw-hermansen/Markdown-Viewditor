import { registerFeatureDetectors } from "$lib/utils/markdown-levels";

registerFeatureDetectors({
  id: "smiles",
  label: "SMILES structures",
  // GitHub does not render SMILES fences, so the feature belongs to the
  // app-specific `advanced` level only (same placement as chemical-formulas).
  presets: { advanced: true },
  detect(tokens) {
    const lines: number[] = [];
    for (const t of tokens) {
      if (t.type === "fence" && t.map) {
        const lang = t.info.trim().split(/\s+/)[0].toLowerCase();
        if (lang === "smiles" || lang === "smi") lines.push(t.map[0] + 1);
      }
    }
    return lines;
  },
});
