export const UNTITLED = "Untitled";

/**
 * Tab labels: the file name, extended with just enough trailing path
 * segments to tell same-named files apart ("a/readme.md" vs "b/readme.md").
 * `/` and `\` are both separators; labels always use `/`. `null` (an unsaved
 * document) is labelled "Untitled".
 */
export function tabLabels(paths: (string | null)[]): string[] {
  const segs = paths.map((p) => (p ? p.split(/[\\/]/).filter(Boolean) : []));
  const depth = paths.map(() => 1);
  const label = (i: number) =>
    paths[i] === null ? UNTITLED : segs[i].slice(-depth[i]).join("/");

  for (let changed = true; changed;) {
    changed = false;
    const groups = new Map<string, number[]>();
    paths.forEach((p, i) => {
      if (p !== null)
        groups.set(label(i), [...(groups.get(label(i)) ?? []), i]);
    });
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      for (const i of group) {
        if (depth[i] < segs[i].length) {
          depth[i]++;
          changed = true;
        }
      }
    }
  }
  return paths.map((_, i) => label(i));
}
