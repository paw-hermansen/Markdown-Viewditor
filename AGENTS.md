# Project Agents Guide

## Project Overview

**Markdown Viewditor** - A markdown viewer and editor with **live preview** built with:

- **Backend**: Rust (Tauri v2)
- **Frontend**: Svelte 5 + SvelteKit
- **Platforms**: Linux, macOS, Windows, Android, iOS

## Key Commands

```bash
# Development
npm install
npm run dev                    # or: npm run tauri dev

# Build
npm run build                  # or: npm run tauri build

# Mobile
npm run tauri android init
npm run tauri android dev
npm run tauri ios init
npm run tauri ios dev

# Lint & Typecheck
npm run lint
npm run check
cargo clippy

# Versioning

Releases are fully automated via GitHub Actions:

1. Go to **Actions → Version Bump → Run workflow** and select bump type (patch/minor/major)
2. Review and merge the auto-created PR
3. The release builds automatically on Linux, Windows, and macOS

The `release` environment restricts who can trigger version bumps.

### Release Pipeline

The release process spans three workflows:

1. **version-bump.yml** — Runs `scripts/version-bump.sh --files-only` to update version files, creates a `release/v{version}` branch, commits, and opens a PR to `main`.
2. **tag-release.yml** — Triggered when a `release/v*` PR is merged to `main`. Creates and pushes a lightweight `v{version}` tag.
3. **release.yml** — Triggered by the tag push. Builds platform binaries (Linux, Windows, macOS) and creates a GitHub Release.
4. **release-msix.yml** — Triggered by the same tag push. Builds a multi-arch (x64 + arm64) MSIX bundle for Microsoft Store distribution.

### Microsoft Store Distribution

The MSIX bundle is built using [`@choochmeque/tauri-windows-bundle`](https://github.com/Choochmeque/tauri-windows-bundle).
Configuration lives under `src-tauri/gen/windows/`:

- `bundle.config.json` — MSIX identity, publisher, capabilities, extensions
- `AppxManifest.xml.template` — manifest template with `{{PLACEHOLDER}}` variables
- `Assets/` — Store icon tiles (scale/targetsize variants)

Build locally: `npm run tauri:windows:build -- --arch x64,arm64`

The MSIX workflow produces a `.msixbundle` artifact containing both x64 and arm64 builds.
Upload it manually to [Partner Center](https://partner.microsoft.com/) for Store submission.
Microsoft re-signs MSIX packages for free — no code signing certificate needed.

Store identity values (from Partner Center):
- `Package/Identity/Name`: `PawHermansen.MarkdownViewditor`
- `Package/Identity/Publisher`: `CN=15E8FDBE-19B2-435E-B9C3-FF697C5E3B1B`
```

## Coding Conventions

### Svelte Components

- Use `.svelte` extension, PascalCase names
- Use `$state()` for reactive state
- Use `$derived()` for computed values
- Use `$effect()` for side effects
- Use `$props()` for component props
- Use `onclick` not `on:click`
- Use snippets `{@render}` not `<slot>`

### Rust Code

- Use `snake_case` functions, `PascalCase` types
- Use `#[tauri::command]` for IPC
- Return `Result<T, E>` for error handling
- Use `lib.rs` for all logic (mobile requirement)

### CSS

- CSS custom properties (variables)
- 8px spacing grid
- Support dark/light themes
- Responsive design

## Critical Patterns

### Tauri v2 Entry Point

```rust
// src-tauri/src/lib.rs
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![commands...])
        .run(tauri::generate_context!())
        .expect("error");
}

// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    app_lib::run();
}
```

### Svelte 5 Component

```svelte
<script>
  let { name = $bindable('') } = $props();
  let doubled = $derived(name.length * 2);

  $effect(() => {
    console.log('Name changed:', name);
  });
</script>

<input bind:value={name} />
<p>Length: {doubled}</p>
```

### Calling Rust from Svelte

```svelte
<script>
  import { invoke } from '@tauri-apps/api/core';

  async function readFile(path) {
    return await invoke('read_file', { path });
  }
</script>
```

### Live Preview Pattern

```svelte
<script>
  import MarkdownIt from 'markdown-it';

  let content = $state('# Hello World');
  let html = $derived(md.render(content));

  const md = new MarkdownIt();
</script>

<textarea bind:value={content}></textarea>
<div>{@html html}</div>
```

### Markdown Syntax Levels

`src/lib/utils/markdown-levels.ts` defines a **feature-detector registry**:
each toggleable syntax feature registers a `FeatureDetector` that walks the
markdown-it token stream and returns occurrence line numbers. Named presets
(basic / github / advanced) derive their `enabledFeatures` from the registry,
so Plan 2's math detectors extend the presets automatically without touching
the engine.

- `registerFeatureDetectors(...)` — register a detector (idempotent on `id`).
- `analyzeContent(content)` (in `markdown.ts`) — parse-only analysis reusing
  the existing markdown-it singleton; no rendering.
- `findViolations(used, enabledFeatures)` — used features not in the enabled set.
- The store (`stores/markdown-levels.svelte.ts`) debounces analysis (~200 ms)
  via `$effect.root` started from `AppLayout`, so it works in all view modes
  (the Viewer is unmounted in editor-only mode).

### CodeMirror Lint Pattern

```ts
import { linter, forceLinting, type Diagnostic } from "@codemirror/lint";

const levelLinter = linter((view): readonly Diagnostic[] => {
  // Read reactive state inside the closure (levelState is a $state proxy).
  return diagnostics;
});

// Re-run when the underlying state changes:
$effect(() => {
  void levelState.violations;
  if (!editorView) return;
  forceLinting(editorView);
});
```

`basicSetup` already pulls in `@codemirror/lint`'s gutter/tooltip support; we
list it as an explicit dependency for stability.

### Math (KaTeX) Integration

`src/lib/utils/markdown.ts` registers the @vscode/markdown-it-katex plugin
(dollar/bare/fence delimiters) **after** the line-numbers plugin, then the
custom `math-brackets.ts` plugin (`\(...\)` / `\[...\]`). Order matters: the
bracket inline rule must run **before** markdown-it's `escape` rule, which
would otherwise consume the backslash and hide the delimiter.

- KaTeX CSS is the woff2-only `src/lib/styles/katex/katex.woff2.css`,
  regenerated by `scripts/update-katex-css.sh` after KaTeX upgrades.
- A bounded LRU memo cache (`katex-cache.ts`) wraps `katex.renderToString`
  so whole-document re-renders (150 ms debounce) cost ~0 for unchanged
  formulas.
- **`.vlist-s` anchor is pinned to 2px** (`extensions/katex/styles.ts`,
  `!important`), overriding KaTeX's stock `font-size: 1px`. KaTeX anchors
  every vlist table's baseline on that cell; under WebKit page zoom any
  factor < 1 makes the 1px font sub-pixel and its metrics collapse, so the
  table re-anchors and all plain-baseline formula content (relations `=`,
  `\left(...\right)` delimiters, `\text{}`) drops ~one KaTeX font-size below
  the vlist-positioned content (matrix/cases rows). Measured on WebKitGTK at
  85% zoom: ~16px drift; Windows/Blink unaffected. 2px survives the zoom
  multiplication (1.4px at the 70% zoom floor) and is geometry-identical to stock
  KaTeX at 100% — keep it when upgrading KaTeX (its CSS comment explains why
  the cell exists at all). Regression: `__tests__/styles.test.ts`.
  Related WebKit quirk — the zoom floor: the engine floors effective font
  sizes at exactly 10px, so sizes stop scaling at different zoom levels
  (UI text 14px below 72%, KaTeX base 16.9px below 59%, KaTeX script-size
  11.9px already below 85%, where sub/superscripts clamp to 10px and render
  nearly as large as the formula's base text). This is why the zoom ladder
  stops at 70% (`MIN_ZOOM` in zoom.svelte.ts): 60% and 50% render scripts at
  base size and (at 50%) break formula geometry outright (2–8px drift plus
  whole-formula over-scaling). Known artifact at 70–80%: mildly oversized
  sub/superscripts in script-heavy math.
- `enableMathBlockInHtml` / `enableMathInlineInHtml` stay **disabled**: they
  splice math tokens into html_block content with `map: null`, which strips
  `data-line` anchors and breaks scroll-sync.

### Mermaid on Older WebKit (CSSStyleSheet shim)

Mermaid (>= 11.6) builds every diagram's CSS with the Constructable
Stylesheets API (`new CSSStyleSheet()`), which WebKit only supports from
Safari 16.4 (macOS 13.3 / iOS 16.4). On older WKWebView (e.g. macOS 12) the
constructor throws `TypeError: Illegal constructor` and every diagram falls
into the "Mermaid rendering failed" block. `css-stylesheet-shim.ts`
(feature-detected, no-op on healthy engines) backs a real `CSSStyleSheet`
with an inert `<style>` element so Mermaid's output stays identical across
platforms. It is called from `ensureLoaded()` in the mermaid `renderer.ts`
before `import("mermaid")`. Upstream: mermaid-js/mermaid#6666 — remove the
shim if Mermaid ever ships its own fallback.

### Mermaid SVG Id Scoping

`namespaceSvgIds()` in the mermaid `renderer.ts` renames every id of a
rendered diagram (`mmd-0` → `mmd-svg-{wrapper}-mmd-0`) so several copies can
coexist, and rewrites the diagram's own `<style>` references to follow.
Mermaid serializes that CSS **compactly** (`#mmd-0{font-size:16px;…}`), so the
selector match must accept an id directly followed by `{` — the root rule
carries the label `font-family`/`font-size`/`fill`, and an orphaned rule makes
labels render at whatever the engine inherits into `<foreignObject>`
(WebKitGTK multiplies implicitly inherited font sizes by the device scale
factor, so 90% desktop text scaling turned 16px labels into 12.6px and node
boxes kept dead space for lines that were never drawn).

The PDF/print clone runs a **second** id-scoping pass over the same markup
(`export/id-scope.ts` → `scopeSubtreeIds()`); it must accept the identical
selector forms or it re-orphans what the first pass fixed — that is how small
Mermaid label text ended up in Linux PDFs even after the renderer fix: the
clone's labels fell back to implicit inheritance again, which WebKitGTK also
mis-scales under the clone's CSS `zoom` (the zoom factor gets applied twice).
Both passes now share `rewriteIdSelectors()` in
`src/lib/utils/css-id-rewrite.ts` — extend the contract there, never in a
local copy — and keep the "no orphaned id selectors" invariants in
`__tests__/mermaid.test.ts` and `export/__tests__/id-scope.test.ts` green.

### Mermaid Label Font Size (16px contract)

Mermaid bakes each HTML label's `<foreignObject>` clip box from a
`getBoundingClientRect()` on the label root `<div>` (see `addHtmlSpan` in its
`createText` chunk), while the diagram's root rule (`#mmd-N{font-size:16px}`)
is injected separately. On WebKitGTK that measurement can win the style-resolution
race _across the `foreignObject` boundary_: the div computes the page's
`html, body { font-size: 14px }` (app.css) and paint later uses the root rule's
16px, so every label clips at exactly 14/16 = 87.5% (`start` → `star`,
`+String name` → `+String nam`). Whether the race hits depends on timing, which
is why it reproduces consistently on one machine and never on another.

Both sides of the fix live in `src/lib/extensions/mermaid/` and read one
constant, `MERMAID_FONT_SIZE` (in `styles.ts`) — keep them equal:

- `MERMAID_STYLES` specifies `font-size` **on the label roots**, not just on an
  ancestor: `.mermaid-block svg foreignObject > div` for placed diagrams and
  `body > div[id^="dmmd-"] svg foreignObject > div` for Mermaid's pre-render
  temp container (render id `mmd-N` mirrors as `div#dmmd-N`) — that temp
  container is where measurement happens. A specified value beats inheritance,
  so measurement and paint agree even when the injected stylesheet hasn't
  resolved yet. The rule only helps if `injectMermaidStyles()` has run, which
  `renderMarkdown()` guarantees: `loadExtensionsForContent()` precedes
  `preRenderExtensionsForContent()`.
- `renderer.ts` pins the same value as `themeVariables.fontSize` in **every**
  `ensureInitialized()` config (viewer, print, export), so Mermaid's root rule
  can never drift from the stylesheet. Mermaid 12 ignores the top-level
  `config.fontSize` key here — `themeVariables.fontSize` is the lever.

`__tests__/mermaid.test.ts` and `__tests__/styles.test.ts` assert the pin and
the config↔CSS consistency. The export/print variants measure labels in a
hidden host and convert them to `<text>` (see "Mermaid Label Export
Conversion" below), so the pin also governs the measured label metrics.

A sibling quirk in the same zoom area: Mermaid positions label text with
em-based `dy`/`dx` offsets (sequence message labels use `dy="1em"`), and
WebKit page zoom resolves em against the _zoom-divided_ computed font size
while the diagram geometry scales normally — labels slide up toward the
neighbouring line as zoom grows (at 200% a sequence label sat closer to the
previous message's line than to its own). `text-offsets.ts` rewrites every
em-based `x`/`y`/`dy`/`dx` to absolute user units at cache-fill time
(`normalizeSvgTextOffsets` in `renderer.ts`, all three variants) — `x`/`y`
included because usvg resolves em against _its_ font resolution, which
drifted converted labels vertically in ODT rasters. The same
pass folds translate-based text placement (`transform="translate(X, Y)
rotate(0)"` with x/y at 0 — xychart's axis labels) into plain `x`/`y`
attributes: under WebKit page zoom those labels collapse toward the top of
the chart and vanish (measured -278 user units at 300%; dominant-baseline is
not the culprit). Both rewrites are zoom-proof and no-ops in effect on Blink
and at 100% zoom — keep them when touching the render pipeline. Regression:
`__tests__/text-offsets.test.ts`.

Zoom-sweep inventory (WebKitGTK): the em-`dy` families are sequence
(incl. notes/loops/activations), gantt, timeline, c4, sankey and gitgraph —
all covered by that one pass — plus xychart's translate-positioned labels.
The `<foreignObject>` HTML-label families
(flowchart, class, state, journey, mindmap, block) measure uniform at
100–300% zoom on modern WebKit (label div boxes track their fo boxes
exactly). erDiagram/pie/quadrant are clean. Two facts worth keeping:
diagram geometry is render-zoom-independent (re-rendering a diagram at any
zoom produces identical geometry — the cache is safe), and the `<switch>`
fallback `<text>` duplicates after each `<foreignObject>` are never painted,
so ignore their rects in measurements. Old WebKit (macOS 12) remains the
place to eyeball foreignObject labels and SVG markers under zoom
(webkit.org/show_bug.cgi?id=279041). Diagrams with Mermaid's `useMaxWidth`
(default) shrink to fit the container, so at high zoom they stay the same
physical size while the rest of the UI grows — by design, not a bug.

### Mermaid Label Measurement (page zoom)

Mermaid sizes every HTML label at render time from `getBoundingClientRect()`
on the label `<div>` inside its `<foreignObject>` and bakes those numbers into
the `foreignObject` box, the label's centering translate, and the node box
geometry. CSSOM-View makes those rects local to the foreignObject and
page-zoom-invariant — what Blink, Gecko, and modern WebKit return (the "label
div boxes track their fo boxes" finding above). Older WebKit instead returns
page-viewport rects whose _sizes_ are scaled by the page zoom factor
(webkit.org/show_bug.cgi?id=71819 and 261109, dup of 23963 — fixed upstream
only in Dec 2025, so WKWebView on macOS 12 Monterey and older iOS is
affected).

The symptom is sticky: a render that runs while the app is zoomed bakes
oversized boxes with the labels hugging their left/top edge and the text
looking too small for its box — and since the SVG is cached per content+theme
(zoom is deliberately not part of rendering), zooming afterwards, **even back
to 100%**, never heals it. Renders made at 100% zoom are correct on every
engine, which is what makes this look like a "macOS renders differently" bug.

`fo-measure.ts` fixes this at the source — and must do so _exactly_, because
Mermaid's label-wrap heuristic is a fragile **exact** equality (`bbox.width
=== width` in `addHtmlSpan`, upstream mermaid-js/mermaid#7794): any hair-off
perturbation of the measured width silently disables wrapping, and long
labels get clipped at the box edge instead of wrapping over lines. Two rules
are load-bearing:

1. **At 100% zoom the API is never touched.** No engine scales foreignObject
   rects at zoom 1 (the verified-good baseline on every platform), and a
   probe factor that drifts from 1 by sub-pixel measurement noise would
   perturb widths enough to break the wrap equality — that regression
   happened once; do not reintroduce it.
2. **Corrections divide by the app's exact zoom factor** (`currentZoom()` —
   the bug scales by exactly the page zoom; the probe only _classifies_ the
   engine) and round the result to 1e-6 px to kill IEEE round-trip noise
   (`200 * 1.1 / 1.1 = 200.00000000000003`), so integral widths come out
   bit-exact and wrapping keeps working.

`withZoomNormalizedLabelMeasurement()` wraps **every** `mermaid.render()` call
in `renderer.ts` (viewer pre-render queue and the export/print variants),
patching `Element.prototype.getBoundingClientRect` for the render's duration
so rects of foreignObject content inside Mermaid's temp containers
(`div[id^="dmmd-"]`) are normalized. Everything outside the temp containers is
a plain pass-through, so a zoomed render produces geometry identical to a 100%
render. Keep any new Mermaid render entry point inside the wrapper, and never
measure `<foreignObject>` content with raw `getBoundingClientRect` elsewhere
in app code without dividing out the same factor (or using rect _ratios_, like
`fo-labels.ts`/`math-fit.ts` do). Guarded by `__tests__/fo-measure.test.ts`
and the upgrade-contract suite, which pins that Mermaid still measures labels
this way. Regression: TEST-PLAN 15.29–15.31 (start the app zoomed).

### Mermaid Label Export Conversion (`foreignObject` → SVG text)

Exports and the PDF print clone cannot ship the viewer's labels: the viewer
renders them as HTML inside `<foreignObject>`, which usvg/resvg (Linux ODT
PNG rasterization) and LibreOffice svgio (vector ODT) drop outright and
WebKit mis-scales under CSS scaling. Mermaid's own `htmlLabels: false`
text-label dialect is NOT a usable substitute — it was the root cause of the
ODT label bugs:

- state labels hug the left edge (`centerLabel: true` shifts the label group
  by `-bbox.width/2` of a bbox that `withMinWidth` widened to the node's
  _minimum_ width, while the text is start-anchored),
- ER and mindmap-_root_ labels spill right (label group at `translate(0, …)`
  = the node center with start-anchored text; only _edge_ labels get
  `text-anchor: middle` from Mermaid),
- mindmap children lose their vertical centering (the `.mindmap-node-label`
  CSS with `text-anchor/dominant-baseline: middle` only lands on the HTML
  label, never on the text one),
- journey section titles are invisible (the `<switch>` fallback `<text>` has
  `class="journey-section section-type-0"`, whose CSS fill _is_ the section
  box color — usvg paints the fallback branch, so text and box are both
  `#ECECFF`).

So the export/print variants render `htmlLabels: true` (the viewer's own
label layout — the visual reference) and `convertForeignObjectLabels`
(`src/lib/extensions/mermaid/fo-labels.ts`) rewrites every label into
standalone SVG **measured from that layout**:

- one `<text>` per rendered line, `text-anchor="middle"` at the measured
  line center, alphabetic baseline at the measured baseline (ratio from a
  hidden probe line — never `dominant-baseline`, which LibreOffice may
  ignore). Self-centering in every renderer even when usvg resolves a
  different fallback font than WebKit.
- per-run `<tspan>`s carry computed font-weight/style/family/decoration and
  fill, so bold/italic/code spans survive; everything is written as inline
  `style` so Mermaid's class CSS can never restyle the text.
- inline `<svg>` icons (`fa:fa-*`) are cloned in place with `currentColor`
  materialized; KaTeX label output (the export config sets
  `forceLegacyMathML`, so Mermaid emits KaTeX _HTML_, not bare MathML) is
  captured via `captureElementToPng` (math-render.ts) and embedded as
  `<image>`; failure degrades the formula to plain text.
- all geometry is client-px ratios through the `foreignObject` box, so app
  zoom and SVG display scaling cancel (same argument as `math-fit.ts`).

Without DOM layout (jsdom, DOM-less) each label degrades to a plain
`<text>` at the foreignObject box center — still centered, still visible.
The measurable path and the degradation path are covered in
`__tests__/fo-labels.test.ts` + `__tests__/fo-labels-integration.test.ts`
(real Mermaid, one diagram per broken family). Keep the conversion when
touching the export pipeline; if a Mermaid upgrade changes how labels are
emitted, the integration suite is the tripwire.

### Mermaid Edge Stroke Width (negative `edge-depth-N` ramp)

Mermaid sizes mindmap/timeline/kanban edges from a per-depth ramp
(`.edge-depth-N { stroke-width: … }`, `17 - 3 * i` for the default look)
that goes **negative** from `edge-depth-5` on (`-1`, `-4`, …; only mindmap's
`neo` look floors at 2). Mindmap's `N` is `node.level + 1`, and the parser
passes the indent token's _character length_ as the level — so the class
jumps with the indentation step: a two-level mindmap indented with 4 spaces
emits `edge-depth-5` = `stroke-width: -1` on its second-level edges. The
symptom is missing connectors (two of four mindmap lines gone on
macOS/Monterey while Linux/Windows draw all four), and it hits any mindmap
3+ levels deep even at 2-space indentation.

A negative stroke width is invalid CSS, and Mermaid round-trips its theme
CSS through the CSSOM (`new CSSStyleSheet()` → `cssRules[].cssText`), so
each engine's parser settles the declaration's fate before we see the SVG:
engines that drop it fall back to `#id .edge { stroke-width: 3 }` and the
connector draws (Blink, current WebKitGTK), while Monterey's older WebKit
keeps it and paints the stroke with a non-positive width — nothing (also
missing from PDFs made there).

`clampNegativeStrokeWidths()` (`svg-css.ts`) rewrites every negative
`stroke-width` (CSS declarations and presentation attributes alike) to
`2px` — the smallest width the ramp itself uses — at cache-fill time and in
the export/print render paths, next to `normalizeSvgTextOffsets` in
`renderer.ts`. Regression: `__tests__/svg-css.test.ts`, TEST-PLAN 6.44;
the upgrade-contract suite pins that Mermaid still emits the negative
values (if that stops, the pass may be removable).

### Mermaid Gantt Width (`gantt.useWidth`)

Mermaid's gantt renderer is the only family whose coordinate system is NOT
derived from content bounds: it spans the timeline across the render
container (`w = elem.parentElement.offsetWidth` in its renderer) and draws
its 11px fonts in that space. This app renders every diagram in Mermaid's
body-level temp container (`mermaid.render()` → `body > div#dmmd-N`), so
gantt charts were built for the full **window** width and `.mermaid-block`
(`min(maxWidth, 800px column)`) then shrank them — text and all — by
`hostWidth / windowWidth` (11px labels rendered at ~4px on a 1920px window;
the same tiny text lands in PDFs/ODT).

`diagramRenderWidth(options)` (mermaid `renderer.ts`) computes the width the
host box displays the diagram at and pins it as `gantt.useWidth` in every
`ensureInitialized` config:

- `fitToWidth: true` (default) → `min(maxWidth, viewer column)` — the chart
  renders 1:1 at its display width, text stays 11px.
- `fitToWidth: false` → `maxWidth` — a gantt has no intrinsic width, so its
  "natural size" is the requested width and the host scrolls when that
  exceeds the column. Mirrors `computeMermaidFrameDims` in `exporters/odt.ts`.

The width is part of the SVG cache key for gantt **only**
(`isContainerSizedDiagram` mirrors Mermaid's `detectType` preprocessing —
frontmatter and `%%{init: …}%%` stripped, then `^\s*gantt`); every other
family keeps the width-independent key so host-option changes still never
duplicate Mermaid work. Pre-render pass and fence renderer must resolve the
same width or the fence lookup degrades to an error block (same failure mode
as the theme snapshot). The width is always the _maximum_ column width
(`#viewer-content`'s computed `max-width`, never its live width), so exports
never depend on window size; `renderMermaidSvgForExport` takes the resolved
host options for this, and the print clone re-renders with the options
stashed next to the source in `mermaidSources`.

Upgrade pins in `__tests__/upgrade-contract.test.ts`: Mermaid still honors
`gantt.useWidth` (viewBox width follows it), and `isContainerSizedDiagram`
still agrees with `mermaid.detectType`. Regression: TEST-PLAN 6.45–6.46,
10.42, 14.22.

Related sizing contract for `fitToWidth=false` (all diagram families): the
natural size comes from the explicit `width`/`height` attributes
`normalizeSvgForNaturalSize()` writes from the viewBox, and the styles must
**not** set `width: auto` on the SVG. `width: auto` discards that size and
resolves through the engine's default object sizing, which is
engine-dependent: WebKitGTK then renders the diagram at exactly 10/9 of its
natural size (measured: 360×64 → 400×71, container-independent;
`__tests__/styles.test.ts` pins the absence). `height: auto` alone is exact
and keeps the aspect ratio when the print clamp (`max-width: 100%`) shrinks
an over-wide diagram.

### Upgrading KaTeX / Mermaid

The zoom fixes pin into library internals: KaTeX's `.vlist-s` anchor cell and
its `font-size: 1px` CSS rule (the 2px pin), and Mermaid's em-based `dy`/`dx`
label offsets plus translate-based text placement (the `text-offsets.ts`
rewrites), its negative `edge-depth-N` stroke-width ramp (the `svg-css.ts`
clamp) and the `gantt.useWidth` config knob (the Gantt width pin). The
`upgrade-contract.test.ts` suites in both extensions render _REAL_ library
output and fail when those internals change shape. Read the
failure message: "lost its target / no longer emits" means either upstream
changed the mechanism (extend the fix) or dropped it (the compensation may be
obsolete) — re-measure with the zoom-sweep harness before touching either.

Upgrade checklist:

1. `npm install katex@<ver>` / `npm install mermaid@<ver>` (the `^0.16` /
   `^12` ranges keep majors out — KaTeX 0.18 renames CSS classes outright).
2. KaTeX: run `scripts/update-katex-css.sh` to regenerate the woff2
   stylesheet the pin targets.
3. `npx vitest run` — the upgrade-contract suites are the tripwires.
4. On Linux: `python3 testing/tools/zoom-sweep/mermaid-zoom-sweep.py`.
5. Manual (the zoom bugs only reproduce on WebKit): S6 and S15 of the test
   plan — especially 15.7–15.10 and 15.19–15.26 — on Linux and macOS.

A sibling quirk in the same zoom area: Mermaid positions label text with
em-based `dy`/`dx` offsets (sequence message labels use `dy="1em"`), and
WebKit page zoom resolves em against the _zoom-divided_ computed font size
while the diagram geometry scales normally — labels slide up toward the
neighbouring line as zoom grows (at 200% a sequence label sat closer to the
previous message's line than to its own). `text-offsets.ts` rewrites every
em-based `dy`/`dx` to absolute user units at cache-fill time
(`normalizeSvgTextOffsets` in `renderer.ts`, all three variants). The same
pass folds translate-based text placement (`transform="translate(X, Y)
rotate(0)"` with x/y at 0 — xychart's axis labels) into plain `x`/`y`
attributes: under WebKit page zoom those labels collapse toward the top of
the chart and vanish (measured -278 user units at 300%; dominant-baseline is
not the culprit). Both rewrites are zoom-proof and no-ops in effect on Blink
and at 100% zoom — keep them when touching the render pipeline. Regression:
`__tests__/text-offsets.test.ts`.

Zoom-sweep inventory (WebKitGTK): the em-`dy` families are sequence
(incl. notes/loops/activations), gantt, timeline, c4, sankey and gitgraph —
all covered by that one pass — plus xychart's translate-positioned labels.
The `<foreignObject>` HTML-label families
(flowchart, class, state, journey, mindmap, block) measure uniform at
100–300% zoom on modern WebKit (label div boxes track their fo boxes
exactly). erDiagram/pie/quadrant are clean. Two facts worth keeping:
diagram geometry is render-zoom-independent (re-rendering a diagram at any
zoom produces identical geometry — the cache is safe), and the `<switch>`
fallback `<text>` duplicates after each `<foreignObject>` are never painted,
so ignore their rects in measurements. Old WebKit (macOS 12) remains the
place to eyeball foreignObject labels and SVG markers under zoom
(webkit.org/show_bug.cgi?id=279041). Diagrams with Mermaid's `useMaxWidth`
(default) shrink to fit the container, so at high zoom they stay the same
physical size while the rest of the UI grows — by design, not a bug.

### Upgrading KaTeX / Mermaid

The zoom fixes pin into library internals: KaTeX's `.vlist-s` anchor cell and
its `font-size: 1px` CSS rule (the 2px pin), and Mermaid's em-based `dy`/`dx`
label offsets plus translate-based text placement (the `text-offsets.ts`
rewrites). The `upgrade-contract.test.ts` suites in both extensions render
_REAL_ library output and fail when those internals change shape. Read the
failure message: "lost its target / no longer emits" means either upstream
changed the mechanism (extend the fix) or dropped it (the compensation may be
obsolete) — re-measure with the zoom-sweep harness before touching either.

Upgrade checklist:

1. `npm install katex@<ver>` / `npm install mermaid@<ver>` (the `^0.16` /
   `^12` ranges keep majors out — KaTeX 0.18 renames CSS classes outright).
2. KaTeX: run `scripts/update-katex-css.sh` to regenerate the woff2
   stylesheet the pin targets.
3. `npx vitest run` — the upgrade-contract suites are the tripwires.
4. On Linux: `python3 testing/tools/zoom-sweep/mermaid-zoom-sweep.py`.
5. Manual (the zoom bugs only reproduce on WebKit): S6 and S15 of the test
   plan — especially 15.7–15.10 and 15.19–15.26 — on Linux and macOS.

### Scroll-Sync Anchor Contract for Math

`createLineNumbersPlugin` can't tag math output (its fence wrapper only
injects into `<pre`; `math_block` has no `renderToken`-based rule). The
`wrapMathAnchorRenderers()` helper in `markdown.ts` runs **after** every
`.use()` and wraps `math_block` + `fence` renderers to inject `data-line`
into the first opening tag of the returned HTML (idempotent — skips if
`data-line` is already present). This is deterministic regardless of plugin
order and covers `$$…$$`, `\[…\]`, bare `\begin{}`, and ` ```math `
fences. If you touch this, the monotonicity test in
`__tests__/markdown-math.test.ts` must stay green.

### App Zoom

`src/lib/stores/zoom.svelte.ts` owns app-wide zoom (70%–300%), applied as the
webview's native **page** zoom (`getCurrentWebview().setZoom()` → WebKitGTK
`set_zoom_level`, WKWebView `setPageZoom`, WebView2 `SetZoomFactor`). Never
implement this with CSS `zoom`: WebKit mis-scales inline SVG under it (the
reason the macOS PDF path refuses it — see below), while page zoom scales
Mermaid/KaTeX/tables uniformly. The `zoomLevel` setting persists in
`settings.json` and is re-applied by `applySavedZoom()` right after
`loadSettings()` in `+layout.svelte`.

- Shortcuts (`handleGlobalKeydown` in `+page.svelte`) match **`e.key`** (the
  produced character: `=`/`+`, `-`/`_`, `0`), not `e.code` — symbols live on
  different physical keys per keyboard layout (German `+`, French `=`,
  AZERTY shifted digits). Ctrl/Cmd+wheel and macOS pinch go through
  `handleZoomWheel` (registered `{ passive: false }`).
- `core:webview:allow-set-webview-zoom` must stay in
  `src-tauri/capabilities/default.json` — it is NOT part of `core:default`.
- All measurement code (`measureMathVisualBounds`, `computeViewerLayoutWidth`,
  the editor's `scaleX`) is page-zoom-invariant: page zoom shrinks the CSS-px
  viewport but computed styles and rects in CSS px do not change. Keep it that
  way — prefer ratios of `getBoundingClientRect` over raw px assumptions. The
  one exception is Mermaid's own label measurement inside `<foreignObject>`,
  which older WebKit scales by the page zoom; `fo-measure.ts` normalizes it
  (see "Mermaid Label Measurement").
- UI chrome must stay zoom-proof: no fixed `height` on bars/buttons (use
  `min-height` — a hard px box plus device-pixel baseline rounding clips text
  at fractional zoom), `white-space: nowrap` on single-line status text, and
  measured popup placement — `popup-placement.ts` clamps dropdowns/popovers
  into their _clipping ancestor_ (`.content { overflow: hidden }`, not the
  window) so entries scroll into reach instead of being cut at the status
  bar line or the pane edge at high zoom. Never place popups with fixed
  offsets or bare `right: 0` edge alignment; measure the trigger and clip
  boxes after render (`DropdownButton`, `StatusBar`, `SelectField`). Apply
  the measured position with `anchorPopup()`, anchored on the _alignment_
  side (a right-aligned popup gets a `right` offset from its wrapper's edge):
  a `left` offset bakes the trigger's current width into a constant, so a
  trigger that relabels (the status-bar level button: "Advanced" → "Basic")
  slides the popup off its edge by exactly the width delta. Measure
  the popup's natural height with `naturalBoxHeight()` (scrollHeight +
  borders, rounded up — WebKit rounds border metrics to fractions of a
  pixel): under `box-sizing: border-box`, `max-height: scrollHeight` is ~2px
  short and draws a spurious scrollbar — and on Linux those overlay the
  controls. Fixed-content popovers (the zoom popup) disable scrolling
  entirely instead: `placePopover(..., capHeight = false)` plus
  `overflow-y: visible`. `scrollbar-gutter: stable` is kept for other
  engines, but it reserves nothing on WebKitGTK's overlay scrollbars. The
  top bar keeps a hard minimum gap between the filename and the
  Edit/Split/View toggle (`gap: 16px` on `.toolbar` — flex gaps hold even
  when the row overflows, where `space-between` collapses to zero) and the
  filename yields first (`max-width: clamp(0px, 30vw - 120px, 200px)`), so
  long names or high zoom ellipsize the name instead of crowding the
  buttons.
- Zoom changes keep the visible line anchored: `setZoom` runs registered
  `ZoomScrollAnchor`s around `applyZoomLevel` — the editor and viewer capture
  the line at the viewport middle before the change and restore it after two
  settle frames (CodeMirror must re-measure re-wrapped line heights first;
  `utils/zoom-scroll-anchor.ts`). WebKit preserves `scrollTop` across zoom,
  but the content above the anchor re-flows (line wrapping, diagram
  fit-to-width), so an unanchored view jumps. `+page.svelte` registers the
  composite anchor and pauses scroll-sync for the capture/restore window.

### Theme background (`--viewer-bg`)

Theme CSS scopes its colors to `#viewer-content`, and the app-wide background
(editor, viewer container, chrome) comes from `--viewer-bg`, which is derived
at runtime: `syncViewerBackground()` (`utils/markdown.ts`) copies the computed
`#viewer-content` background onto `<html>`. It runs from the Viewer's
mount/theme effect (`Viewer.svelte`) and from `setTheme()` after the theme CSS
is injected. Never derive it from a bare startup rAF: `#viewer-content` does
not exist until the app renders (`+layout` waits for `ready`), and a frame
flushed before that — e.g. the persisted zoom applying at launch — makes the
probe miss deterministically at zoom != 100%. The symptom is the whole app on
the generic dark/light palette while only the viewer's text box shows the
theme.

### Theme changes and Mermaid cache keys

Mermaid SVGs are cached per `[appTheme.type, appTheme.themeId, variant,
content]`. The app theme for one render is **snapshotted once** in
`preRenderMermaidBlocks` onto the markdown-it env (`mermaidAppTheme`);
`renderFence` must look the cache up with that snapshot
(`themeSnapshotFromEnv(env)`) and never re-read `getAppTheme()` — a theme
change mid-render then makes the fence lookup miss the keys the pass filled,
and every diagram renders as a "Mermaid rendering failed" block (or hits a
stale theme's cached SVGs and keeps the old colors).

Theme commits must be **atomic**: `viewerState.theme` is what triggers the
render `$effect`, so it may only change together with the theme CSS injection
and the `data-theme*` attribute updates (i.e. via `setTheme` in
`stores/viewer.svelte.ts`). Never write `viewerState.theme` directly — the
old `ThemeSelector` had `bind:value={viewerState.theme}`, so DropdownButton
wrote the state the moment a theme was clicked, the re-render raced the
attribute update, and diagrams broke exactly as above. Regression tests:
`mermaid.test.ts` ("cache keys in sync …mid-render") and
`ThemeSelector.test.ts` ("does not commit viewerState.theme until the theme
is applied").

### Render busy overlay

`Viewer.svelte` shows a ghosted "Rendering…" overlay (the same pill/spinner as
the file-open "Loading…" overlay) for **major renders only**: the first render
of a document, a theme change (every Mermaid diagram misses the theme-keyed
cache and re-renders) and `forceRender()`/Reload. Routine typing re-renders
never show it — an overlay flickering on every debounced keystroke render is
worse than the wait. Major renders also skip the 150 ms debounce (discrete
actions, not typing) and raise the overlay synchronously via `requestRender(…,
major)` when they start; it is dropped once the new DOM is on screen
(`clearBusy()` after `tick()`). Quick renders never paint it (the early render
phases are synchronous), so there is no flash threshold to maintain. The
overlay is `pointer-events: none` (`.rendering-overlay`) so the editor and
scrolling stay usable. File open keeps its blocking "Loading…" overlay; export
keeps `ExportOverlay`. Note the spinner can only animate where the render
yields (the Mermaid pre-render loop); parse/render/`{@html}` are synchronous
and freeze it briefly.

**Zoom never shows it and must not**: zoom is the webview's native page zoom —
it re-renders nothing (the Mermaid/KaTeX caches are zoom-independent); the
delay on heavy documents is engine relayout/repaint, which blocks the same
thread an overlay would animate on.

Mermaid's pre-render pass renders diagrams strictly sequentially on purpose:
a concurrent worker pool was measured at ~0 wall-clock gain (12 diagrams:
~2.1 s at concurrency 4 vs ~2.0 s at 1 in the jsdom harness) because
`mermaid.render` is synchronous CPU on the one JS thread — JS-level
concurrency has no async gaps to overlap. Don't re-introduce a pool for
speed; the lever for faster theme changes is avoiding re-renders (e.g.
patching Mermaid SVGs in place), not parallelizing them. Error cleanup is
scoped to the failing render's temp nodes
(`removeMermaidTempElements(renderId)`).

### Export Pipeline

`src/lib/export/` hosts an extensible exporter registry:

- `registry.svelte.ts` — `$state`-backed exporter list; `registerBuiltinExporters()`
  lazily loads the HTML exporter. PDF is NOT in the registry — it's handled by
  the existing Print button (`exportPdf` directly), so registering it would
  duplicate the Print entry in the toolbar/palette. A future file format
  (DOCX/EPUB) = one file + one `registerExporter` call; the toolbar shows a
  single button when there's one exporter and a dropdown when there are 2+.
- `document.ts` — `buildStandaloneHtml()` collects same-origin stylesheets,
  inlines `url()` fonts and `localimg://` images to data URIs (via
  `assets.ts`), and wraps the body in `.viewer-content`.
- `exporters/pdf.ts` shares `buildPrintContainer()` with the in-app Print
  button; macOS uses `invoke('create_pdf')` (WKWebView
  `createPDFWithConfiguration` with a nil configuration — an async capture
  of the laid-out page that paginates the full document into vector pages),
  other platforms use `window.print()`. The macOS path does NOT use
  `NSPrintOperation`: that rasterizes WKWebView's layer tree at Retina
  resolution (hundreds-of-MB files) and `runOperation` deadlocks the main
  run loop when called from inside `with_webview`.
- `src/lib/styles/markdown.css` is the single source of truth for markdown
  rendering styles — including the frontmatter/skill card — imported by
  `Viewer.svelte` and applied to the print clone, which carries the
  `.viewer-content` class (and the `#viewer-content` id in theme mode).

### Print/PDF Fidelity Contract

The print clone reproduces the Viewer exactly, then scales to paper:

- Exports and prints always run at **zoom 1.0**, regardless of the on-screen
  app zoom: `withNominalZoom()` (in `stores/zoom.svelte.ts`) wraps the
  `exportPdf()` / `runExporter()` calls in `+page.svelte` (re-entrant, restores
  the level afterwards). The macOS capture rect is in points and
  `scaleWideMathForPrint()` measures the laid-out clone, so a live zoom would
  break the physical calibration and the wide-math page fit. Any new export
  entry point must go through the same guard.

- The clone is laid out at the viewer's maximum content width (default
  800px column + 2×16px gutters = 832px; `computeViewerLayoutWidth()` reads
  the live viewer's computed `max-width` and container padding so custom
  themes that change them still match). `exportPdf()` then maps that width
  onto the paper, platform-split:
  - Linux/Windows print through the print dialog with CSS `zoom` on the
    clone, mapping 832px onto the A4 printable width (718 CSS px at 96dpi).
    Zoom is required here — it is layout-affecting, which is what lets the
    print engine paginate the clone across A4 pages (never scale the print
    path with a bare `transform: scale()`: it doesn't affect
    layout/pagination).
  - macOS captures one page sized to an explicit rect with
    `createPDFWithConfiguration` (1 CSS px = 1 PDF pt), so the clone is
    scaled by a paint-time `transform: scale()` inside a sized
    `.print-scaler` wrapper (which clips the un-scaled layout overflow;
    `syncScaleHeight()` sizes it to the scaled height after `beginPrint()`),
    mapping 832px onto the A4 printable width **in points** (538.6pt) so
    the PDF's physical scale matches the Linux/Windows output. CSS `zoom`
    must NOT be used on this path: WebKit's zoom handling mis-scales inline
    SVG (font-size inside `<foreignObject>` is multiplied by the zoom factor
    twice — webkit.org/show_bug.cgi?id=279041 — and SVG geometry/markers
    distort under zoom on older WebKit), which produced giant diagram labels
    and missing arrow heads/boxes in the PDF.
    Because layout (fonts, widths, line breaking) happens identically to the
    viewer on both paths and only the paint is rescaled, **line wrapping in
    the PDF matches the viewer word-for-word**. Never re-declare content
    styles for print (that's why app.css holds only shell, geometry, and
    color-mode rules).
- One deliberate deviation from viewer-identical layout: display math wider
  than the column (the Viewer scrolls it via `.katex-block`'s horizontal
  scrollbar) is scaled down to the printable width at export time, because
  print media clips overflow instead of scrolling it. `scaleWideMathForPrint()`
  in `src/lib/export/math-fit.ts` measures each `.katex-display > .katex`
  ink extent (via `measureMathVisualBounds`, zoom-safe: both sides of the
  ratio come from `getBoundingClientRect`) and sets KaTeX's em-based
  `--katex-font-scale` on the formula, merged multiplicatively with any
  `fontsize` directive value. It runs in `exportPdf()` after `beginPrint()`
  plus a layout settle (theme `#viewer-content` metrics change KaTeX widths)
  and before the capture. Inline math is never scaled. The only CSS it needs
  is `.print-content .katex { font-size: calc(1.21em * var(--katex-font-scale, 1)) }`
  in app.css.
- Mermaid diagrams in the macOS clone are swapped for their foreignObject-
  free text-label variant before the capture (`prepareMermaidForPrint` →
  `renderMermaidSvgForPrint`, same theme and `font-family: inherit` as the
  viewer): the viewer's HTML labels are converted to measured `<text>` by
  `convertForeignObjectLabels` — see "Mermaid Label Export Conversion" —
  instead of Mermaid's `htmlLabels: false` dialect, which misplaces node
  labels. Belt and braces next to the transform scaling, since old WebKit
  mis-scales `<foreignObject>` even under transforms. The wrapper markup
  (`data-align`, `--mermaid-max-width`, `data-fit-to-width`, `data-line`) is
  preserved. Linux/Windows keep the viewer SVGs unchanged.
- Paper target is A4 with 10mm margins: `@page { size: A4; margin: 10mm }`
  in app.css (default in Chromium print dialogs; WebKitGTK ignores it and
  uses the system paper size — wrapping is unaffected, only the fill ratio).
  The macOS capture cannot honor `@page` size — `createPDF` has no paper
  size and no pagination, and the rect passed to it _is_ the page.
  `exportPdf()` therefore passes the A4 width (210mm in points) as the rect
  width and the full document height as its height, while `beginPrint()`
  constrains the document to that width with 10mm margins: the result is one
  A4-wide page at the same physical scale as the Linux/Windows output, with
  the content column centered at 10mm margins. One long page is accepted —
  true A4 tiling would need Rust-side slicing of the capture.
- Full-bleed backgrounds come from two channels set by `buildPrintContainer`:
  inline `background` on `html`/`body` (page content area everywhere; whole
  captured area on macOS, whose capture has no physical margins) and an injected
  `@page { background: … }` rule (Chromium extends it over the margins too;
  WebKit can't paint the physical margin ring — engine limitation, same on
  Linux and macOS). `print-color-adjust: exact` on
  `html.exporting`/`body.exporting`/`.print-content` makes backgrounds print
  without the dialog's "Background graphics" option.
- The print clone's element IDs are scoped (`scopeSubtreeIds()` in
  `src/lib/export/id-scope.ts`, called from `buildPrintContainer`): the clone
  normally duplicates the live viewer's markup, and at capture time the
  original stays in the DOM inside the `display: none` app shell. Blink
  (Windows/WebView2) won't paint SVG resource references whose target sits
  under a `display: none` ancestor — the ones that matter are the marker and
  paint-server URLs (`marker-end` / `fill` with `url(#…)`), so unscoped clones
  lose Mermaid's arrowheads in Windows PDFs while the plain edge paths still
  print (WebKitGTK/WKWebView paint them fine). Every id in the clone is
  renamed with a per-export prefix and the clone's own `url(#…)` / `href` /
  aria / `for` / `<style>` references are rewritten to follow — including
  `#id` selectors inside Mermaid's per-SVG `<style>`, or the diagram loses
  its styles.
- Printer-friendly mode is fully theme-independent: a small CSS-variable
  override palette in app.css plus GitHub Light `.hljs` token rules re-scoped
  to `body.print-friendly .print-content` at export time
  (`scopeSyntaxCssForPrint()`), which outranks the active theme's global
  hljs rules. Custom themes are assumed to scope rules to `#viewer-content`
  (like the built-ins); bare global selectors would leak into the app shell.

## Common Mistakes to Avoid

| Mistake                  | Solution                           |
| ------------------------ | ---------------------------------- |
| `let` without `$state()` | Use `$state()` for reactive vars   |
| `on:click` syntax        | Use `onclick` (Svelte 5)           |
| `<slot>`                 | Use `{@render children()}`         |
| `&str` in async commands | Use `String` (owned type)          |
| Missing capabilities     | Add to `capabilities/default.json` |
| Commands not registered  | Add to `generate_handler![]`       |

## Resources

- Tauri: https://v2.tauri.app
- Svelte: https://svelte.dev
- SvelteKit: https://kit.svelte.dev

## Plans

Design and implementation plans live in `.opencode/plans/`:

- `extension-system.md` — Extension architecture (lazy-loading, fence attributes, KaTeX refactor, mermaid, ABC, SMILES)
- `EXPORT-PLAN.md` — Export pipeline design
- `PLAN-SEARCH.md` — Search implementation plan
