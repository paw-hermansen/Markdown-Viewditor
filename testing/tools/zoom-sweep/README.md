# Zoom sweep — Mermaid diagram families under webview page zoom

Read-only diagnostic: renders one diagram per Mermaid family in a headless-ish
WebKitGTK WebView, sweeps zoom levels, and reports anything that stops scaling
uniformly. Use it after upgrading Mermaid, WebKit, or the zoom pipeline to
catch the next "labels drift at 200%" regression class early.

## Requirements

- Linux with `gir1.2-webkit2-4.1` and `python3-gi` (the same engine stack the
  app's wry webview uses — `set_zoom_level` is the identical call)
- `node_modules/mermaid` present (run `npm install` first)
- A display; use `xvfb-run -a python3 mermaid-zoom-sweep.py` when headless

## Usage

```bash
python3 mermaid-zoom-sweep.py          # summary table on stdout
# screenshots per zoom level land in /tmp/mermaid-zoom-sweep/
```

## Reading the output

- `emDy` — count of em-based `dy`/`dx` offsets. Anything > 0 must be handled
  by `normalizeSvgTextOffsets` (`src/lib/extensions/mermaid/text-offsets.ts`);
  the sweep shows the *raw* drift so you can confirm the fix is still needed
  and still sufficient.
- `fo wR/hR` — label `<div>` box relative to its `<foreignObject>` box; must
  stay constant across zooms. A growing ratio is the 279041 foreignObject
  double-scaling family.
- `text drift` — position drift of visible text vs a scaled reference shape
  (unzoomed CSS px). Tolerance ±2. The `<switch>` fallback `<text>` duplicates
  that follow each `<foreignObject>` are never painted and are excluded.

## Known engine quirks (see AGENTS.md "App Zoom" / "Math (KaTeX) Integration")

- WebKit resolves em offsets against the zoom-divided font size — the
  `text-offsets.ts` pass.
- WebKit mis-resolves translate-based SVG text placement
  (`transform="translate(x, y)"` on text, xychart's axis labels) — labels
  collapse toward the top of the chart and vanish at high zoom;
  `text-offsets.ts` folds it into `x`/`y` attributes.
- WebKit floors effective font sizes at 10px — why the zoom ladder stops at
  70%.
- Old WebKit (macOS 12) mis-scales `<foreignObject>` and SVG markers under
  zoom — not reproducible on modern WebKitGTK; eyeball on macOS 12.
- Mermaid's `useMaxWidth` shrinks diagrams to fit the container, so at high
  zoom they stay the same physical size while the surrounding UI grows.
