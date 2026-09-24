import { registerFeatureDetectors } from "$lib/utils/markdown-levels";

registerFeatureDetectors({
  id: "mermaid",
  label: "Mermaid diagrams",
  presets: { github: true, advanced: true },
  detect(tokens) {
    const lines: number[] = [];
    for (const t of tokens) {
      if (t.type === "fence" && t.map) {
        const lang = t.info.trim().split(/\s+/)[0].toLowerCase();
        if (lang === "mermaid") lines.push(t.map[0] + 1);
      }
    }
    return lines;
  },
});
