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
  themes that change them still match). CSS `zoom` on the clone then maps
  that width onto the paper. Because layout (fonts, widths, line breaking)
  happens identically to the viewer and zoom only rescales, **line wrapping
  in the PDF matches the viewer word-for-word**. Never scale via
  `transform: scale()` (doesn't affect layout/pagination) and never
  re-declare content styles for print (that's why app.css holds only shell,
  geometry, and color-mode rules).
- Paper target is A4 with 10mm margins: `@page { size: A4; margin: 10mm }`
  in app.css (default in Chromium print dialogs; WebKitGTK ignores it and
  uses the system paper size — wrapping is unaffected, only the fill ratio).
  The macOS `createPDF` capture paginates at the webview's page bounds, so
  its page size is the viewport, not A4 — the layout is scaled to fill the
  webview width so content fills the PDF edge-to-edge. The capture produces
  one long page (WKWebView can't tile a nil rect); that's accepted.
- Full-bleed backgrounds come from two channels set by `buildPrintContainer`:
  inline `background` on `html`/`body` (page content area everywhere; whole
  captured page on macOS, which has no physical margins) and an injected
  `@page { background: … }` rule (Chromium extends it over the margins too;
  WebKit can't paint the physical margin ring — engine limitation, same on
  Linux and macOS). `print-color-adjust: exact` on
  `html.exporting`/`body.exporting`/`.print-content` makes backgrounds print
  without the dialog's "Background graphics" option.
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
- Development plan: `PLAN.md`
- Design specs: `GUI-DESIGN.md`
