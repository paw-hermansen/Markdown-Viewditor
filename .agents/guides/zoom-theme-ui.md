# App Zoom, Theme & UI Behavior

Runtime UI behavior: webview page zoom, theme background derivation, theme/Mermaid
cache coordination, and the render busy overlay.

## App Zoom

`src/lib/stores/zoom.svelte.ts` owns app-wide zoom (70%–300%), applied as the
webview's native **page** zoom (`getCurrentWebview().setZoom()` → WebKitGTK
`set_zoom_level`, WKWebView `setPageZoom`, WebView2 `SetZoomFactor`). Never
implement this with CSS `zoom`: WebKit mis-scales inline SVG under it (the
reason the macOS capture path refuses it — see "Print/PDF Fidelity Contract"
in [Export & Print](export-print.md); the macOS 15+
print-dialog path needs zoom's layout effect for pagination and swaps the
diagrams for text labels first), while page zoom scales
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
  (see "Mermaid Label Measurement" in
  [Math & Mermaid Contracts](math-mermaid.md)).
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

## Theme background (`--viewer-bg`)

Theme CSS scopes its colors to `#viewer-content`, and the app-wide background
(editor, viewer container, chrome) comes from `--viewer-bg`, which is derived
at runtime: `syncViewerBackground()` (`utils/theme-css.ts`) copies the computed
`#viewer-content` background onto `<html>`. It runs from the Viewer's
mount/theme effect (`Viewer.svelte`) and from `setTheme()` after the theme CSS
is injected. Never derive it from a bare startup rAF: `#viewer-content` does
not exist until the app renders (`+layout` waits for `ready`), and a frame
flushed before that — e.g. the persisted zoom applying at launch — makes the
probe miss deterministically at zoom != 100%. The symptom is the whole app on
the generic dark/light palette while only the viewer's text box shows the
theme.

## Theme changes and Mermaid cache keys

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

## Render busy overlay

`Viewer.svelte` shows a ghosted "Rendering…" overlay (the same pill/spinner as
the file-open "Loading…" overlay; the request/debounce/busy state machine is
`createRenderScheduler` in `stores/render-scheduler.svelte.ts`) for **major
renders only**: the first render
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
