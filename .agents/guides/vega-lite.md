# Vega-Lite Contracts

Engine contracts for the `vega-lite` fence extension
(`src/lib/extensions/vega-lite/`). Each rule is pinned by a regression or
upgrade-contract test — if a vega/vega-lite upgrade fails one of those,
re-verify before touching the fix: upstream changed the mechanism (extend
the pass) or dropped it (the pass may be obsolete). Design history and
spike evidence: `.opencode/plans/vega-lite-extension.md` (§16 phase-0
findings, §18 QA fixes).

## Render pipeline

`render-core.ts` is the reuse seam (a future `vega-down` fence compiles to
a spec and calls it). The post-process chain order is a contract:

1. `pinSvgDimensions` — guarantee numeric `width`/`height` root
   attributes (`sniffSvgDimensions` in ODT/DOCX depends on them).
2. `rewriteImageHrefs` — local image policy (below).
3. `rasterizeVegaLabelMath` — KaTeX label math (below).

`renderFence` is synchronous but vega rendering is async, so the
extension uses the mermaid pre-render cache pattern: `preRenderBlocks`
renders into a cache keyed `[theme.type, themeId, theme= choice, content]`
with a theme snapshot in the env (`vegaLiteAppTheme`); `renderFence` is a
lookup. Alignment/`fitToWidth` are wrapper CSS and stay out of the key.

## CSP: the interpreter is mandatory

`vega.parse(spec, undefined, { ast: true })` plus the vega-interpreter as
the View's `expr` evaluator. The default `Function`-constructor path is
never taken — the Tauri CSP has no `unsafe-eval` and must stay that way.
Pinned by the upgrade-contract Function tripwire. `vega.parse` takes
`undefined` (not `null`) for the config argument (typings).

## Theme token split (the dark-export / pinned-theme bugs)

- Only the **viewer's `theme=auto`** mode reads live DOM tokens
  (`#viewer-content` computed styles + `--vega-category-1..8`).
- **Pinned themes (`theme=light|dark`) and all exports use `FIXED_TOKENS`**
  and never the DOM; pinned themes additionally paint their own
  background (`#ffffff` / `#202124`). Export `auto` resolves to the fixed
  light look (neutral document), with `EXPORT_FONT_STACK`.
- The spec's own `config` overrides the generated base per-key
  (`spec.config` beats `opt.config`).
- **Text marks need `config.text.color`**: vega's text marks have a
  hardcoded black default that `mark.color` does not reach.

## Images (the attr$4 round-trip bug)

Vega's SVG writer emits the preloaded `Image` element's `src` readback as
`xlink:href` (vega-scenegraph `attr$4`) and preloads with
`crossOrigin = "anonymous"` — custom URL schemes do not survive that
round-trip in the webview. Therefore:

- The View loader's `sanitize` resolves local paths and `file:` URLs
  (`resolveLink` → `convertFileSrc(…, "localimg")`) and inlines them as
  `data:` URIs via `read_file_as_base64`. Remote/inline hrefs pass
  through with `crossOrigin: null`.
- `sanitize` must stay a **pass-through** for URLs vega should keep: the
  default sanitizer empties `localimg://`/`asset://` and rewrites
  `file:///x` to `/x`.
- ODT/DOCX pass `ctx.filePath` (the open document, threaded through the
  build contexts) as `baseFile` — without it relative image paths cannot
  resolve in exports.
- `export/svg-images.ts` remains as a belt-and-braces inlining pass for
  embeds; `IMG_SRC_RE` covers `<image href>` in HTML exports.
- An unreadable image is non-fatal: keep the URL, surface a warning
  (viewer warning line + export `ctx.warnings`).

## Inline-only data

Only inline `data.values` (and inline generators) render. Enforcement is
a **spec pre-validation** walk (`validateSpecInlineOnly`) — vega swallows
loader rejections (`runAsync` resolves with an empty dataset), so the
rejecting `load` is backstop only.

## Label math (`math-labels.ts`)

- `$…$` / `$$…$$` in single-line `<text>` labels → rasterized `<image>`
  PNGs via the shared `renderMathToPng` (html2canvas-pro, supersampled,
  `targetFontSize`). `MathPngOptions.color` colors chart math with the
  theme foreground (document math stays black).
- Placement: the replacement `<g>` reuses the text element's exact
  `transform` (rotated axis titles need no special handling); math images
  center on the text's optical center (`OPTICAL_CENTER_RATIO`).
- Prices (`$5 and $10`) are never math; multi-tspan (multi-line) labels
  are left as text; any failure keeps the original label — the pass never
  throws and never drops text.

## Export contracts

Attribute-painted SVG (no `<style>` block — pinned), explicit root
dimensions, no `<foreignObject>`, concrete export font. Frames use
`computeVegaLiteFrameDims` (the mermaid model minus `maxWidth`).
`theme=auto` → light in neutral documents; explicit pins honored.

## File map

| File              | Role                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| `schema.ts`       | host options (`align`, `fitToWidth`, `theme`), standalone for exporters  |
| `render-core.ts`  | spec → SVG seam: interpreter render, theme split, post-process chain     |
| `renderer.ts`     | pre-render cache, JSON error mapping (prefix-scan positions), fence HTML |
| `loader.ts`       | inline-only data backstop + image resolve/inline in `sanitize`           |
| `theme-config.ts` | DOM tokens vs `FIXED_TOKENS`, `--vega-category-*` hook                   |
| `image-hrefs.ts`  | local-path → `localimg://` resolution                                    |
| `math-labels.ts`  | KaTeX label rasterization                                                |
| `styles.ts`       | two-mode width CSS (the SMILES scroll conventions)                       |
