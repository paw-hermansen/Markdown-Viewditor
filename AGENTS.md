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
the config↔CSS consistency. PDF/print is unaffected either way: those variants
use `<text>` labels (`htmlLabels: false`), so there is no `foreignObject` to
clip.

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
  `renderMermaidSvgForPrint`: `htmlLabels: false` + `textPlacement: "tspan"`,
  same theme and `font-family: inherit` as the viewer) — belt and braces
  next to the transform scaling, since old WebKit mis-scales
  `<foreignObject>` even under transforms. The wrapper markup (`data-align`,
  `--mermaid-max-width`, `data-fit-to-width`, `data-line`) is preserved.
  Linux/Windows keep the viewer SVGs unchanged.
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
