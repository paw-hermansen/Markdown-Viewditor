# Vega-Lite Charts

Markdown Viewditor renders charts from raw
[Vega-Lite](https://vega.github.io/vega-lite/) JSON specifications in
fenced code blocks with the `vega-lite` language identifier. The full
Vega-Lite grammar is supported — layers, transforms, log/time scales,
legends, themes — and the charts export everywhere: HTML, PDF, ODT and
DOCX.

Vega-Lite is loaded lazily: the chart engine only activates when your
document contains a `vega-lite` code block.

## Quick Start

```vega-lite
{
  "data": { "values": [{"x": 1, "y": 2}, {"x": 2, "y": 5}, {"x": 3, "y": 4}] },
  "mark": { "type": "line", "point": true, "interpolate": "monotone" },
  "encoding": {
    "x": { "field": "x", "type": "quantitative", "title": "x" },
    "y": { "field": "y", "type": "quantitative", "title": "y" }
  },
  "width": 320,
  "height": 200,
  "title": "My first chart"
}
```

The fence body is a complete Vega-Lite specification. Chart size comes
from the spec's own `width`/`height` (or `autosize`); host options like
alignment are fence attributes (below).

## Concepts: Data and Layers

A chart can define data once and draw several **layers** over it — a
smooth curve through the points, the points themselves, and a fitted
trend line, for example. Transforms like `regression` and `loess` compute
the fit in the renderer:

```vega-lite
{
  "datasets": {
    "obs": [
      {"x": 0, "y": 25}, {"x": 1, "y": 31}, {"x": 2, "y": 38},
      {"x": 3, "y": 33}, {"x": 4, "y": 40}, {"x": 5, "y": 46}
    ]
  },
  "layer": [
    {
      "data": { "name": "obs" },
      "mark": { "type": "line", "interpolate": "monotone", "stroke": "steelblue", "strokeWidth": 2 },
      "encoding": {
        "x": { "field": "x", "type": "quantitative", "title": "x (samples)" },
        "y": { "field": "y", "type": "quantitative", "title": "y = f(x)" }
      }
    },
    {
      "data": { "name": "obs" },
      "mark": { "type": "point", "filled": true, "size": 40 },
      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "y", "type": "quantitative" }
      }
    },
    {
      "data": { "name": "obs" },
      "transform": [{ "regression": "y", "on": "x", "method": "linear" }],
      "mark": { "type": "line", "stroke": "firebrick", "strokeDash": [6, 4] },
      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "y", "type": "quantitative" }
      }
    }
  ],
  "width": 420,
  "height": 240,
  "title": "Curve, points and trend line"
}
```

Each layer keeps its own `mark`, `data` reference and `transform` — the
smooth-curve look is one layer's `interpolate`, not a property of the
whole chart.

## Settings

### All Settable Attributes

| Attribute     | Values                     | Default  | Meaning                                              |
| ------------- | -------------------------- | -------- | ---------------------------------------------------- |
| `align`       | `left` \| `center` \| `right` | `center` | Horizontal alignment of the chart block               |
| `fitToWidth`  | `true` \| `false`          | `true`   | Scale down to the viewer width (else scroll)          |
| `theme`       | `auto` \| `light` \| `dark` | `auto`   | Color theme (`auto` follows the app dark/light theme) |

Chart sizing, colors of individual marks, fonts and everything else is
part of the Vega-Lite spec itself (its `width`/`height` and `config`
keys).

### Fence Attributes (per-block)

````
```vega-lite {align=left fitToWidth=false theme=dark}
{ ... }
```
````

### HTML Comment Directives (document-level)

````
<!-- vega-lite: align=left theme=dark -->
````
Directives apply to all `vega-lite` fences after them; fence attributes
override directive values for their own block.

## Theme Behavior

- `theme=auto` (the default) follows the app's dark/light theme: axis,
  legend and label colors are taken from the active theme, and the chart
  background stays transparent so the document background shows through.
- Custom themes can steer the chart palette with the CSS variables
  `--vega-category-1` … `--vega-category-8` (see
  [Custom Themes](CustomThemes.html)).
- `theme=light` or `theme=dark` pins a **self-contained** look: fixed
  colors plus the theme's own background, identical in every app theme
  and in exports.

## Math in Labels

`$…$` and `$$…$$` inside single-line labels (axis titles, tick labels,
legend labels, `text` marks) are rendered as KaTeX math, rasterized to
crisp images that match the label color:

```vega-lite
{
  "data": { "values": [{"t": "0", "v": 0}, {"t": "π/2", "v": 1}] },
  "mark": { "type": "line", "point": true },
  "encoding": {
    "x": { "field": "t", "type": "nominal", "title": "$x$ (radians)" },
    "y": { "field": "v", "type": "quantitative", "title": "$f(x) = \\sin x$" }
  },
  "width": 320,
  "height": 180,
  "title": "KaTeX labels"
}
```

Notes: mixed text and math (`$x$ (samples)`) works; prices like `$5` are
never treated as math; multi-line labels are kept as plain text.

## Image Marks

`image` marks follow the same policy as markdown images: `https:` and
`data:` URLs are used as-is, and local file paths are resolved relative
to the document (and embedded into exports, so the exported file is
self-contained). A file that cannot be read shows a warning under the
chart and in the export warnings.

## Data Policy

Charts are **self-contained**: only inline data (`data.values`, and
inline generators like `sequence`) renders. Any `data.url` source is
rejected with an "inline data only" error — documents render identically
offline, and opening a document never fetches from the network.

## Scaling vs Scrolling

- `fitToWidth=true` (default): the chart scales down to the viewer
  column and back up on wider windows.
- `fitToWidth=false`: the chart keeps the spec's own size and scrolls
  horizontally. Print and exports clamp wide charts to the page width.

## Invalid Specs

A spec that is not valid JSON, or that uses a `data.url` source, renders
as a red error block with the escaped source and a short message (with
line/column for JSON errors). One broken block never affects the rest of
the document.

## Export

Charts export everywhere as vector SVG: HTML and PDF inline them
directly; ODT and DOCX embed them as vector images (with a PNG fallback
in DOCX, and an optional raster mode in both). Exports use a neutral
light look unless a theme is explicitly pinned. Local images inside
charts are embedded, so exported files have no external dependencies.

## Reference

- [Vega-Lite documentation](https://vega.github.io/vega-lite/docs/)
- [Example gallery](https://vega.github.io/vega-lite/examples/) — every
  chart there can be pasted into a `vega-lite` fence as-is
- [Online editor](https://vega.github.io/vega-editor/) for experimenting
  with specs
