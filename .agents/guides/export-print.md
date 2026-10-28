# Export Pipeline & Print/PDF Fidelity

Exporter registry, standalone HTML builds, and the print/PDF fidelity contract.

## Export Pipeline

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
  button. The output route is decided by `pdf-mode.ts` (probed once at app
  startup via `invoke('macos_major_version')` — the WKWebView user agent is
  frozen at 10_15_7 and cannot distinguish macOS releases):
  - **Linux/Windows and macOS 15+** — the system print dialog:
    `window.print()` on Linux/Windows, `invoke('print_webview')` on macOS
    (WKWebView has no JS `window.print()`; `print.rs` drives the same
    NSPrintPanel through `-[WKWebView printOperationWithPrintInfo:]` run via
    `runOperationModalForWindow:delegate:didRunSelector:contextInfo:`, and
    the command resolves when the operation finishes so the clone outlives
    the capture).
  - **macOS < 15** (legacy fallback) — `invoke('create_pdf')`
    (`createPDFWithConfiguration` with an explicit A4-width rect — an async
    capture of the laid-out page as one long vector page) after a save
    dialog.
    Two hard-won rules for the print-dialog route on macOS (both from the
    2026 spike that un-broke it; the historical "WKWebView cannot print
    injected DOM" diagnosis was wrong — the call shape was the problem):
  - **Never use the synchronous `-[NSPrintOperation runOperation]`** — it
    deadlocks the run loop (WebKit's printing view wants a running run loop
    to build its page preview) and yields blank pages. Only the async
    `runOperationModalForWindow…` works.
  - **Initialize the print view's frame** (`op.view().setFrame(webView.bounds())`)
    before starting, or AppKit logs "The NSPrintOperation view's frame was
    not initialized properly" and may trap in future releases.
    The completion delegate (`PrintRunDelegate` in `print.rs`) is deliberately
    leaked per print: AppKit holds delegates unretained and the callback runs
    on it. `NSPrintOperation printOperationWithView:` (view-based printing) is
    a different, bad API — it rasterizes the layer tree at Retina resolution
    (hundreds-of-MB files); `printOperationWithPrintInfo:` prints vector.
- `src/lib/styles/markdown.css` is the single source of truth for markdown
  rendering styles — including the frontmatter/skill card — imported by
  `Viewer.svelte` and applied to the print clone, which carries the
  `.viewer-content` class (and the `#viewer-content` id in theme mode).
- `math-render.ts` rasterizes KaTeX HTML to PNG (ODT "Rasterize as PNG",
  and KaTeX inside Mermaid labels via `captureElementToPng`) with
  **html2canvas-pro** (maintained fork of html2canvas; `^`-free pinned
  version). Two contracts to keep when touching it:
  - Always pass `scale` explicitly to html2canvas-pro. Pro defaults it to
    `devicePixelRatio`, which would silently change output bitmap
    dimensions and break the `effectiveScale` math and canvas-size
    verification in `renderMathToPng` (guarded by a regression test in
    `__tests__/math-render.test.ts`).
  - Stock html2canvas 1.4.1 mis-positions absolutely positioned inline
    `<svg>` elements (upstream niklasvh/html2canvas#3047 — never fixed
    there), which dropped KaTeX's tall-brace extenders from rasterized
    math: a `\begin{cases}` brace exported as PNG had half-line gaps
    between its top/middle/bottom pieces. html2canvas-pro fixes the
    painting; it also measures canvas font metrics via
    `measureText().fontBoundingBox*`, honoring KaTeX's italic style —
    the reason the old `patches/html2canvas+1.4.1.patch` existed (that
    patch is gone; don't reintroduce per-library patches here without
    checking pro first). Regression: TEST-PLAN 10.49.
  - Inline SVGs are rasterized as images at an integer-rounded natural
    size, so any `preserveAspectRatio` scale/anchor error becomes a
    positional error: KaTeX's `xMinYMin` (uniform scale, top-left anchor)
    squeezed the brace extender bars ~⅓ thickness left of the ⎧⎨⎩ hooks.
    `stabilizeSvgForRaster()` rewrites exact `xMinYMin` → `none` in the
    html2canvas `onclone` hook (clone only — the viewer DOM is never
    touched). Its scope is deliberately narrow: KaTeX's clipped SVGs
    (`\sqrt`, wide accents, 3-piece `\overbrace`) need `… slice` + CSS
    clipping, and forcing `none` on them flattens the curves — keep the
    exact-match gate. Regression: `__tests__/math-render.test.ts`
    ("stabilizeSvgForRaster"), TEST-PLAN 10.49.

## Print/PDF Fidelity Contract

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
  - Linux/Windows and macOS 15+ print through the print dialog with CSS
    `zoom` on the clone, mapping 832px onto the A4 printable width (718 CSS
    px at 96dpi). Zoom is required here — it is layout-affecting, which is
    what lets the print engine paginate the clone across A4 pages (never
    scale the print path with a bare `transform: scale()`: it doesn't affect
    layout/pagination). On macOS the zoom hits WebKit's foreignObject
    scaling bug (below), so the diagrams are swapped for their text-label
    variant first.
  - macOS < 15 captures one page sized to an explicit rect with
    `createPDFWithConfiguration` (1 CSS px = 1 PDF pt), so the clone is
    scaled by a paint-time `transform: scale()` inside a sized
    `.print-scaler` wrapper (which clips the un-scaled layout overflow;
    `syncScaleHeight()` sizes it to the scaled height after `beginPrint()`),
    mapping 832px onto the A4 printable width **in points** (538.6pt) so
    the PDF's physical scale matches the print-dialog output. CSS `zoom`
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
- Mermaid diagrams in the macOS clone (both routes) are swapped for their
  foreignObject-free text-label variant before the output
  (`prepareMermaidForPrint` → `renderMermaidSvgForPrint`, same theme and
  `font-family: inherit` as the viewer): the viewer's HTML labels are
  converted to measured `<text>` by `convertForeignObjectLabels` — see
  "Mermaid Label Export Conversion" in
  [Math & Mermaid Contracts](math-mermaid.md) — instead of Mermaid's
  `htmlLabels: false` dialect, which misplaces node labels. Belt and braces
  next to the transform scaling of the capture path, since old WebKit
  mis-scales `<foreignObject>` even under transforms — and required on the
  macOS 15+ dialog path, whose CSS `zoom` would otherwise hit the same bug.
  The wrapper markup (`data-align`, `--mermaid-max-width`,
  `data-fit-to-width`, `data-line`) is preserved. Linux/Windows keep the
  viewer SVGs unchanged.
- Paper target is A4 with 10mm margins: `@page { size: A4; margin: 10mm }`
  in app.css (default in Chromium print dialogs; WebKitGTK ignores it and
  uses the system paper size — wrapping is unaffected, only the fill ratio).
  The macOS 15+ dialog path pre-configures its `NSPrintInfo` to the same A4
  sheet with 10mm margins in `print.rs` (the panel still lets the user pick
  other paper). The macOS < 15 capture cannot honor `@page` size —
  `createPDF` has no paper size and no pagination, and the rect passed to it
  _is_ the page. `exportPdf()` therefore passes the A4 width (210mm in
  points) as the rect width and the full document height as its height,
  while `beginPrint()` constrains the document to that width with 10mm
  margins: the result is one A4-wide page at the same physical scale as the
  print-dialog output, with the content column centered at 10mm margins.
  One long page is accepted there — true A4 tiling would need Rust-side
  slicing of the capture.
- Full-bleed backgrounds come from two channels set by `buildPrintContainer`:
  inline `background` on `html`/`body` (page content area everywhere; whole
  captured area on the macOS < 15 capture, which has no physical margins) and an injected
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
