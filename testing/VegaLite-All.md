# Vega-Lite — All Features

This file exercises the `vega-lite` fence extension: raw Vega-Lite JSON
specs, host fence attributes, HTML comment directives, image marks, and the
error fallbacks. Charts are static SVG (no interactivity). Labels support
KaTeX math via `$...$` / `$$...$$` and plain text / Unicode both work.

Everything here uses inline data only — `data.url` sources are rejected by
design ("inline data only" error block).

---

## 1. Smoke Test — Line and Points

The smallest useful chart. Should render centered with a smooth-looking
two-point line and dots.

```vega-lite
{
  "data": { "values": [{"x": 1, "y": 2}, {"x": 2, "y": 5}, {"x": 3, "y": 4}, {"x": 4, "y": 8}] },
  "layer": [
    {
      "mark": { "type": "line", "interpolate": "monotone", "stroke": "steelblue", "strokeWidth": 2 },
      "encoding": {
        "x": { "field": "x", "type": "quantitative", "title": "x" },
        "y": { "field": "y", "type": "quantitative", "title": "y" }
      }
    },
    {
      "mark": { "type": "point", "shape": "circle", "filled": true, "fill": "steelblue", "size": 50 },
      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "y", "type": "quantitative" }
      }
    }
  ],
  "width": 320,
  "height": 200,
  "title": "Smoke test"
}
```

---

## 2. Layers — Curve, Points, Trend Line

The motivating example: one dataset, four layers. Eyeball that the smooth
curve (monotone interpolation) passes through the points, the red dashed
trend line is a least-squares fit (regression transform), and the green line
is a loess smooth.

```vega-lite
{
  "datasets": {
    "obs": [
      {"x": 0, "y": 25}, {"x": 1, "y": 31}, {"x": 2, "y": 38},
      {"x": 3, "y": 33}, {"x": 4, "y": 40}, {"x": 5, "y": 46},
      {"x": 6, "y": 41}, {"x": 7, "y": 48}, {"x": 8, "y": 54},
      {"x": 9, "y": 50}, {"x": 10, "y": 56}, {"x": 11, "y": 51}
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
      "mark": { "type": "point", "shape": "circle", "filled": true, "fill": "steelblue", "size": 40 },
      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "y", "type": "quantitative" }
      }
    },
    {
      "data": { "name": "obs" },
      "transform": [{ "regression": "y", "on": "x", "method": "linear" }],
      "mark": { "type": "line", "stroke": "firebrick", "strokeDash": [6, 4], "strokeWidth": 2 },
      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "y", "type": "quantitative" }
      }
    },
    {
      "data": { "name": "obs" },
      "transform": [{ "loess": "y", "on": "x", "bandwidth": 0.4 }],
      "mark": { "type": "line", "stroke": "green", "strokeWidth": 1.5 },
      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "y", "type": "quantitative" }
      }
    },
    {
      "data": { "name": "obs" },
      "mark": { "type": "text", "dy": -12, "fontSize": 9 },
      "encoding": {
        "x": { "field": "x", "type": "quantitative" },
        "y": { "field": "y", "type": "quantitative" },
        "text": { "field": "y", "type": "quantitative" }
      }
    }
  ],
  "width": 420,
  "height": 260,
  "title": "Smooth curve + points + trend line (regression) + loess"
}
```

---

## 3. Scatter — Marker Shapes and Series Colors

Point shapes and category colors come from the app theme's palette
(`--vega-category-*`, falling back to built-ins). Toggle the app theme and
re-check this chart.

```vega-lite
{
  "data": {
    "values": [
      {"x": 1.2, "y": 3.1, "series": "alpha"},
      {"x": 2.1, "y": 2.7, "series": "alpha"},
      {"x": 2.9, "y": 3.8, "series": "alpha"},
      {"x": 1.7, "y": 1.2, "series": "beta"},
      {"x": 2.6, "y": 1.9, "series": "beta"},
      {"x": 3.4, "y": 1.1, "series": "beta"},
      {"x": 3.1, "y": 3.2, "series": "gamma"},
      {"x": 3.9, "y": 2.4, "series": "gamma"},
      {"x": 4.5, "y": 3.6, "series": "gamma"}
    ]
  },
  "mark": { "type": "point", "filled": true, "size": 70 },
  "encoding": {
    "x": { "field": "x", "type": "quantitative", "title": "x", "scale": {"domain": [0, 5]} },
    "y": { "field": "y", "type": "quantitative", "title": "y", "scale": {"domain": [0, 4]} },
    "color": { "field": "series", "type": "nominal", "legend": {"title": "Series"} },
    "shape": { "field": "series", "type": "nominal" }
  },
  "width": 320,
  "height": 240,
  "title": "Shapes and colors per series"
}
```

---

## 4. Bars — Vertical with Legend, Horizontal with Time Axis

```vega-lite
{
  "data": {
    "values": [
      {"month": "Jan", "v": 250}, {"month": "Feb", "v": 400},
      {"month": "Mar", "v": 520}, {"month": "Apr", "v": 610},
      {"month": "May", "v": 780}, {"month": "Jun", "v": 900}
    ]
  },
  "mark": { "type": "bar", "cornerRadiusEnd": 3 },
  "encoding": {
    "x": { "field": "month", "type": "nominal", "title": "Month" },
    "y": { "field": "v", "type": "quantitative", "title": "Downloads" },
    "color": { "field": "month", "type": "nominal", "legend": null }
  },
  "width": 340,
  "height": 220,
  "title": "Vertical bars"
}
```

```vega-lite
{
  "data": {
    "values": [
      {"d": "2026-01-01", "v": 4}, {"d": "2026-02-01", "v": 7},
      {"d": "2026-03-01", "v": 5}, {"d": "2026-04-01", "v": 9}
    ]
  },
  "mark": { "type": "bar" },
  "encoding": {
    "y": { "field": "d", "type": "temporal", "title": "date" },
    "x": { "field": "v", "type": "quantitative", "title": "horizontal value" }
  },
  "width": 380,
  "height": 200,
  "title": "Horizontal bars, time axis (year label at the year boundary is standard vega)"
}
```

---

## 5. Log Axis

**Authoring note:** bars on a log scale need an explicit baseline
(`"y2": {"datum": 1}` below) — without it vega emits zero-height bars in
every renderer, not just this app.

```vega-lite
{
  "data": {
    "values": [
      {"x": "10^1", "v": 10}, {"x": "10^2", "v": 100},
      {"x": "10^3", "v": 1000}, {"x": "10^4", "v": 9000}
    ]
  },
  "mark": { "type": "bar", "cornerRadiusEnd": 3 },
  "encoding": {
    "x": { "field": "x", "type": "nominal", "title": "category" },
    "y": { "field": "v", "type": "quantitative", "title": "value (log)", "scale": {"type": "log", "domainMin": 1} },
    "y2": { "datum": 1 },
    "color": { "field": "x", "type": "nominal", "legend": {"title": "Legend title"} }
  },
  "width": 380,
  "height": 240,
  "title": "Bars with log axis + legend"
}
```

---

## 6. Unicode Math-ish Labels

Plain text and Unicode math-ish characters work as-is.

```vega-lite
{
  "data": {
    "values": [
      {"t": "0", "v": 0, "label": "0"},
      {"t": "π/2", "v": 1, "label": "sin(π/2) = 1"},
      {"t": "π", "v": 0, "label": "sin(π) = 0"},
      {"t": "3π/2", "v": -1, "label": "sin(3π/2) = −1"},
      {"t": "√2", "v": 0.7, "label": "x² + y² = 2"}
    ]
  },
  "layer": [
    {
      "mark": { "type": "line", "interpolate": "monotone", "stroke": "currentColor" },
      "encoding": {
        "x": { "field": "t", "type": "nominal", "title": "x ∈ {0, π/2, π, 3π/2, √2}" },
        "y": { "field": "v", "type": "quantitative", "title": "f(x) = sin(x)" }
      }
    },
    {
      "mark": { "type": "point", "filled": true, "size": 50 },
      "encoding": {
        "x": { "field": "t", "type": "nominal" },
        "y": { "field": "v", "type": "quantitative" }
      }
    },
    {
      "mark": { "type": "text", "dy": -12, "fontSize": 10 },
      "encoding": {
        "x": { "field": "t", "type": "nominal" },
        "y": { "field": "v", "type": "quantitative" },
        "text": { "field": "label", "type": "nominal" }
      }
    }
  ],
  "width": 420,
  "height": 220,
  "title": "Unicode labels: π, √2, x², −1"
}
```

---

## 6b. Math Labels (KaTeX)

`$...$` and `$$...$$` inside labels are rasterized to crisp math (whole
labels and mixed text+math both work; prices like `$5` are never math).
Eyeball that the formulas match the theme foreground and sit on the text
baseline like the plain labels above. Toggle the theme: the math must
recolor with the labels.

```vega-lite
{
  "data": {
    "values": [
      {"t": "0", "v": 0, "label": "$\\sin(0) = 0$"},
      {"t": "1", "v": 1, "label": "$\\sin(\\pi/2) = 1$"},
      {"t": "2", "v": 0, "label": "$\\sin(\\pi) = 0$"}
    ]
  },
  "layer": [
    {
      "mark": { "type": "line", "interpolate": "monotone", "stroke": "steelblue" },
      "encoding": {
        "x": { "field": "t", "type": "nominal", "title": "$x$ (radians)" },
        "y": { "field": "v", "type": "quantitative", "title": "$f(x) = \\sin x$" }
      }
    },
    {
      "mark": { "type": "point", "filled": true, "size": 50 },
      "encoding": {
        "x": { "field": "t", "type": "nominal" },
        "y": { "field": "v", "type": "quantitative" }
      }
    },
    {
      "mark": { "type": "text", "dy": -12, "fontSize": 10 },
      "encoding": {
        "x": { "field": "t", "type": "nominal" },
        "y": { "field": "v", "type": "quantitative" },
        "text": { "field": "label", "type": "nominal" }
      }
    }
  ],
  "width": 420,
  "height": 220,
  "title": "KaTeX labels: $\\sin$ values and mixed text + math"
}
```

---

## 7. Fence Attributes

### align=left

```vega-lite {align=left}
{
  "data": { "values": [{"x": 1, "y": 3}, {"x": 2, "y": 7}, {"x": 3, "y": 5}] },
  "mark": { "type": "line", "point": true },
  "encoding": {
    "x": { "field": "x", "type": "quantitative" },
    "y": { "field": "y", "type": "quantitative" }
  },
  "width": 220,
  "height": 140,
  "title": "Left-aligned"
}
```

### theme=dark (forced, independent of the app theme)

Toggle the app theme: this chart must stay dark-themed either way.

```vega-lite {theme=dark}
{
  "data": { "values": [{"x": 1, "y": 3}, {"x": 2, "y": 7}, {"x": 3, "y": 5}, {"x": 4, "y": 9}] },
  "mark": { "type": "bar" },
  "encoding": {
    "x": { "field": "x", "type": "nominal" },
    "y": { "field": "y", "type": "quantitative" }
  },
  "width": 260,
  "height": 160,
  "title": "Forced dark theme"
}
```

### fitToWidth=false (natural size, horizontal scroll)

A deliberately wide chart: it must keep its 1200 px width and scroll
horizontally instead of shrinking to the column.

```vega-lite {fitToWidth=false align=left}
{
  "data": {
    "values": [
      {"x": 0, "y": 2}, {"x": 1, "y": 4}, {"x": 2, "y": 3}, {"x": 3, "y": 7},
      {"x": 4, "y": 5}, {"x": 5, "y": 9}, {"x": 6, "y": 6}, {"x": 7, "y": 10},
      {"x": 8, "y": 8}, {"x": 9, "y": 12}, {"x": 10, "y": 9}, {"x": 11, "y": 13}
    ]
  },
  "mark": { "type": "line", "interpolate": "monotone", "point": true },
  "encoding": {
    "x": { "field": "x", "type": "quantitative" },
    "y": { "field": "y", "type": "quantitative" }
  },
  "width": 1200,
  "height": 220,
  "title": "Wide chart in scroll mode (fitToWidth=false)"
}
```

---

## 8. Directive — `<!-- vega-lite: ... -->`

Same options as fence attributes; the directive applies to the fences after
it. This chart should render right-aligned.

<!-- vega-lite: align=right -->

```vega-lite
{
  "data": { "values": [{"x": 1, "y": 5}, {"x": 2, "y": 2}, {"x": 3, "y": 6}, {"x": 4, "y": 4}] },
  "mark": { "type": "area", "line": {"stroke": "steelblue"}, "interpolate": "monotone" },
  "encoding": {
    "x": { "field": "x", "type": "quantitative" },
    "y": { "field": "y", "type": "quantitative" }
  },
  "width": 280,
  "height": 160,
  "title": "Right-aligned via directive"
}
```

---

## 9. Image Marks

Image hrefs follow the markdown image policy: `https:`/`data:` pass through,
local paths resolve relative to this file through the localimg protocol.
The second chart references `square.png` next to this file — it should show
the square image twice (once via relative path, once via data URI).

```vega-lite
{
  "data": {
    "values": [
      {"x": 40, "u": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}
    ]
  },
  "mark": { "type": "image", "width": 60, "height": 60 },
  "encoding": {
    "x": { "field": "x", "type": "quantitative", "scale": {"domain": [0, 80]} },
    "y": {"datum": 0},
    "url": { "field": "u", "type": "nominal" }
  },
  "width": 300,
  "height": 100,
  "title": "Image mark with a data: URI"
}
```

```vega-lite
{
  "data": {
    "values": [
      {"x": 40, "u": "square.png"},
      {"x": 120, "u": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}
    ]
  },
  "mark": { "type": "image", "width": 60, "height": 60 },
  "encoding": {
    "x": { "field": "x", "type": "quantitative", "scale": {"domain": [0, 160]} },
    "y": {"datum": 0},
    "url": { "field": "u", "type": "nominal" }
  },
  "width": 300,
  "height": 100,
  "title": "Local image (square.png) + data URI"
}
```

---

## 10. Error Fallbacks

Both of these must render as red error blocks with the escaped source, not
crash the document. The JSON error shows a line/column; the data-url error
says "inline data only".

### Invalid JSON (missing comma)

```vega-lite
{
  "data": { "values": [{"x": 1, "y": 2}] }
  "mark": "point"
}
```

### Remote data (not allowed)

```vega-lite
{
  "data": { "url": "https://vega.github.io/vega-datasets/data/cars.json" },
  "mark": "point",
  "encoding": {
    "x": { "field": "Horsepower", "type": "quantitative" },
    "y": { "field": "Miles_per_Gallon", "type": "quantitative" }
  },
  "width": 300,
  "height": 200
}
```

---

## 11. Known Limitations

- `"width": "container"` compiles but its wrapper-resize semantics are
  untested and unsupported — set explicit `width`/`height` instead.
- Label math rasterizes single-line labels only: multi-line labels are kept
  as plain text. Prices like `$5` are never treated as math.
- Interactive charts (pan/zoom/selections) are out of scope; output is
  static SVG.
