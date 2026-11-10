# Markdown Viewditor — Manual Test Plan

Scenario-based manual tests for the things a human has to see: rendering in
the real webview, native dialogs and OS integration, and a smoke pass over
every major area. Everything algorithmic is pinned by the automated suites
(`npm test`, `cargo test`) — this plan deliberately does not repeat them.

**Budget: ≤ 1 hour per platform** (the scenario times below sum to ~60
minutes). Run the scenarios in order; later ones reuse earlier setup.

- Build & launch: `npm run tauri dev` (or install a built binary). Test
  files live in the `testing/` directory.
- `Ctrl` stands for `Cmd` on macOS. Steps marked **macOS 12–14** /
  **Linux/Windows/macOS 15+** apply only on those platforms.
- The fixture files describe their own expected rendering in their headings
  and notes. For the walkthrough scenarios, "reads top to bottom and every
  example looks as the file itself says" is the pass criterion.

## Why former tests are gone

The old plan repeated checks the automated suites already pin (and contained
a duplicated section). Checks moved to automation in this revision:

| Former manual check | Now covered by |
| ------------------- | -------------- |
| Formatting keyboard shortcuts (old S4) | `src/lib/components/Editor/__tests__/EditorKeyboard.test.ts` |
| Find / replace-all (old S3) | `src/lib/components/Editor/__tests__/EditorSearch.test.ts` |
| Split-handle drag, snapping, double-click (old S2) | `src/lib/components/Layout/__tests__/AppLayout.test.ts` ("split resize handle") |
| Custom theme discovery & parsing (old S11) | `src/lib/utils/__tests__/user-themes.test.ts` |
| Encoding (BOM / CRLF / Latin-1), read-only errors, `.bak` backups (old S8) | `cargo test` — `src-tauri/src/commands/file.rs` |

Rendering internals (markdown pipeline, KaTeX delimiters/directives, Mermaid
transforms, export XML/zip/geometry) are unit-tested the same way; the
scenarios keep only the human-eye pass over the real output.

## Scenario overview

| #   | Scenario                                     | Min |
| --- | -------------------------------------------- | --- |
| S1  | Launch, layout & `Rendering-All.md` walkthrough | 8   |
| S2  | `MathChemMermaid-All.md` + `VegaLite-All.md` walkthroughs | 10  |
| S3  | Editing session                              | 7   |
| S4  | Files, unsaved changes & external changes    | 9   |
| S5  | Zoom & themes                                | 7   |
| S6  | Compatibility levels                         | 4   |
| S7  | Export & print                               | 11  |
| S8  | Command palette, About & quit                | 4   |

---

## S1 — Launch, layout & `Rendering-All.md` walkthrough

*Fresh start (clear saved state first if needed). Files: `Simple.md`,
`Rendering-All.md`, `SKILL.md`.*

| #    | Do                                                                                                                     | Expect                                                                                                                                                                                                                                                                                                                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Start the app. Resize below 800×600. Right-click anywhere.                                                              | Window ~1200×800, title "Markdown Viewditor"; clamps at 800×600; no native context menu.                                                                                                                                                                                                                                                                                                            |
| 1.2  | Launch `markdown-viewditor testing/Simple.md` from a terminal.                                                          | `Simple.md` opens automatically.                                                                                                                                                                                                                                                                                                                                                                   |
| 1.3  | Open `Rendering-All.md`.                                                                                                | Brief loading overlay over the viewer, then split view (~50/50, editor left).                                                                                                                                                                                                                                                                                                                       |
| 1.4  | Drag the divider around, drop at each far edge, double-click it, hover it.                                              | Pane ratio follows the mouse; far left = viewer-only, far right = editor-only; double-click snaps back to 50%; handle highlights on hover.                                                                                                                                                                                                                                                          |
| 1.5  | Click Edit / Split / View; press `Ctrl+Shift+V` a few times.                                                            | Only the selected panes show; active button highlighted; shortcut cycles editor → split → viewer.                                                                                                                                                                                                                                                                                                   |
| 1.6  | Scroll the viewer, then the editor — slowly and quickly.                                                                | Each pane drives the other (scroll sync) without drift or oscillation; in single-pane modes only the visible pane scrolls.                                                                                                                                                                                                                                                                          |
| 1.7  | **Read `Rendering-All.md` top to bottom in the viewer.**                                                                | Every section renders as the file itself describes: H1–H6 headings, formatting combinations, footnotes at the bottom, lists incl. 6-level nesting and tasks, nested blockquotes, both tables (incl. column alignment), all 7 code blocks syntax-highlighted, the long code block scrolling in place, horizontal rule, raw HTML (details/summary opens and closes, kbd, sub/sup, mark, ins/del, colored spans, special characters) and the Frontmatter card. |
| 1.8  | Open `SKILL.md`.                                                                                                        | "Skill" card with badge, name, description and license.                                                                                                                                                                                                                                                                                                                                            |
| 1.9  | In the Links section: click both anchor links, the external link, the local file link; hover a link and an image; Tab to a link and press Enter. | Anchors scroll to "Custom Heading ID" and "Tables"; external link opens in the browser; local link opens with the OS handler; hover shows the target; Enter behaves like the click.                                                                                                                                                                                                                  |
| 1.10 | Look at the Images section; press `Ctrl+R`.                                                                             | All local variants render (relative path, HTML img, spaces, unicode subdir), data URI, both SVGs, the remote photo, and the missing image shows a broken placeholder without crashing. On reload the remote photo changes and everything re-renders.                                                                                                                                                 |
| 1.11 | Glance at the status bar while clicking around.                                                                         | Level button reads "Advanced"; cursor position and word count track the editor.                                                                                                                                                                                                                                                                                                                     |

## S2 — `MathChemMermaid-All.md` + `VegaLite-All.md` walkthroughs

*Split view. Open each file freshly (first render matters for some
checks).*

| #   | Do                                                                             | Expect                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | Open `MathChemMermaid-All.md`.                                                   | Loads without errors.                                                                                                                                                                                                                                                                                                                                               |
| 2.2 | **Read the whole file top to bottom.**                                          | Every example renders as its section says: all math delimiter styles (the "$5 and $10" sentence stays plain text), fence attributes (fontsize, leqno, fleqn) and comment directives (apply, reset, override, invisible, unknown ignored), invalid LaTeX shows a compact inline error without crashing, chemistry (sub/superscripts, annotated arrows, isotopes, bonds, units), and every Mermaid diagram type — all mindmap connectors visible, gantt text readable, wide blocks scroll in place. |
| 2.3 | Look at "Math Labels", "Math in Sequence and State Labels", "Math Error" and "Single Dollars Are Literal". | Formulas render as clean KaTeX inside node/edge labels, centered in boxes that hug the text, no `$` visible; a TeX typo fails the whole diagram with the red error block; `$x^2$` keeps both dollar signs.                                                                                                                                                           |
| 2.4 | Look at the SMILES section (fresh render).                                       | Molecules render as skeletal structures; scale/align/theme/fitToWidth options take effect (explicit themes ignore the app theme); directives apply and reset; the invalid SMILES block shows the styled error without breaking the document.                                                                                                                            |
| 2.5 | Switch the app theme dark ↔ light.                                               | Mermaid diagrams re-render with the matching mermaid theme; the forest-theme diagram and explicit SMILES themes keep their own colors.                                                                                                                                                                                                                               |
| 2.6 | Open `VegaLite-All.md`; **read it top to bottom.**                              | Every chart renders as its notes say: layers (smooth curve + points + dashed trend line + loess), marker shapes and series colors, bars (log axis legend readable), Unicode labels; §7 `theme=dark` stays a dark box while the app theme is light, `fitToWidth=false` scrolls, the directive chart is right-aligned; §9 shows `square.png` and the data-URI pixel with no warning line; both error cases show red blocks without breaking the document. |
| 2.7 | In §6b look at the KaTeX labels, then switch the app theme dark ↔ light.        | Formulas render like the plain labels (no `$` visible) and sit on the text baseline; on the theme switch the math recolors with the labels — light gray on dark, dark gray on light.                                                                                                                                                                                  |

## S3 — Editing session

*New file (`Ctrl+N`).*

| #   | Do                                                                                                                                 | Expect                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 3.1 | Type quickly for ~20 seconds (paragraphs, a heading, bullets).                                                                     | No lost characters; viewer keeps up; line numbers and markdown syntax colors show; line/col and word count update. |
| 3.2 | Select a word and work through the toolbar buttons: bold, italic (on bold text → bold-italic → bold), italic on plain text (wrap → unwrap), strikethrough, highlight, heading (repeat: H2…H6 → plain), link, image, code (inline → block → inline), bullet, numbered, task, blockquote, hr. | Each button edits the text as expected and the viewer shows the result; the editor keeps focus after every click. |
| 3.3 | Repeat three of them by keyboard: `Ctrl+B`, `Ctrl+I`, `Ctrl+E`.                                                                    | Same effects as the buttons. (All shortcuts are pinned by `EditorKeyboard.test.ts`.)                          |
| 3.4 | Select a long unwrapped paragraph, press `Shift+Alt+F`; do the same inside a blockquote.                                            | Lines re-wrap to the editor width; `> ` prefixes preserved.                                                   |
| 3.5 | Put the cursor in a long unwrapped paragraph (no selection), press `Shift+Alt+P`; repeat with the cursor in a blockquote paragraph, then on a blank line and inside a code block. | Only the cursor's paragraph re-wraps (blockquote `> ` prefixes preserved); the rest of the document is unchanged; nothing happens on a blank line or in a code block. |
| 3.6 | `Ctrl+F`, search a word that occurs several times; type a replacement; click "replace all"; Escape.                                 | Search bar opens and jumps to matches; every occurrence replaced; word count updates; bar closes.             |
| 3.7 | Save As `/tmp/manual-test.md`; save again to the same name; edit; save again.                                                                                   | Save dialog offers Markdown/All Files filters; filename and `*` indicator behave; `.bak` backup created; saving over the existing file asks for OS confirmation; `Ctrl+R` reloads from disk. |

## S4 — Files, unsaved changes & external changes

*Files: the odd fixtures in `testing/`; a temp file for the external-change
steps (use a second editor or a terminal).*

| #   | Do                                                                                                            | Expect                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Open in turn: `Empty.md`, `Large.md`, `BOM_Simple.md`, `CRLF_Simple.md`, `ISO8859-1_Simple.md`, `简单.md`, `Space Simple.md`; save `Space Simple.md` once. | All open and render; empty viewer for `Empty.md`; `Large.md` loads and scrolls without freezing; no BOM or `^M` artifacts; `Æ Ø Å` readable in the Latin-1 file; unicode/spaced filenames shown correctly. |
| 4.2 | Edit, press `Ctrl+N`, try each dialog button once.                                                            | "You have unsaved changes…" dialog: Cancel keeps the document, Discard clears it, Save First saves then clears.                                                   |
| 4.3 | Repeat with `Ctrl+O` and `Ctrl+R`.                                                                            | New/Open: same 3-button dialog, action proceeds after Save First/Discard. Reload: 2-button dialog (Cancel / Yes, Discard My Changes).                             |
| 4.4 | `chmod 444` a copy (see `testing/README.md`), open it, edit, save.                                            | Lock icon with "Read-only" tooltip; save shows the read-only toast.                                                                                              |
| 4.5 | Open a temp file, change it in another editor, refocus the app; decline the reload, then `Ctrl+S`; then accept a later external change. | "Modified by another application" dialog (Cancel / Reload); declining shows a warning icon and Ctrl+S asks before overwriting; accepting reloads and clears the warning. |
| 4.6 | Repeat 4.5 with local unsaved edits; then delete the file externally.                                         | Dialog warns that reload discards your changes; on deletion: "This file no longer exists…", and Ctrl+S opens Save As without recreating the old path.            |
| 4.7 | Try opening a file without read permission and saving into a read-only directory.                             | "Failed to open the file." / "Failed to save the file." toasts; no crash.                                                                                       |

## S5 — Zoom & themes

*`MathChemMermaid-All.md` open (from S2). Set the theme/zoom/view mode you
want to keep before S8 — the final restart there verifies they persist.*

| #   | Do                                                                                                              | Expect                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | `Ctrl++` up to 300%, `Ctrl+-` down to 70%, `Ctrl+0`; use the status-bar −/+/Reset; `Ctrl`+wheel.                 | Everything scales (editor, viewer, toolbars, status bar); indicator matches; split handle stays easy to grab.                          |
| 5.2 | At 200% glance at a formula, the sequence diagram, the gantt chart and the mindmap.                              | Math and diagrams scale with the text; labels stay attached to their arrows, bars and boxes; nothing clipped or drifting.               |
| 5.3 | At 300%: open the Export as… menu, the theme dropdown and the compatibility popup; press `Ctrl+N` with unsaved edits. At 70% check the status bar. | Menus, popup and dialog fit and stay fully clickable (scroll instead of clipping); status bar text never clipped at small zoom.        |
| 5.4 | In split view put a line mid-screen; zoom up to 300% step by step, then back.                                    | Visible content stays anchored; no jumping between steps.                                                                               |
| 5.5 | **macOS 12 (Monterey) / after engine upgrades:** restart the app at 150% zoom and open the math/mermaid doc.     | Diagrams identical to a 100%-start render: labels centered, boxes sized to their text.                                                  |
| 5.6 | Open the theme dropdown; cycle all 9 built-in themes and Printer Friendly.                                       | Each applies to viewer, editor syntax, toolbar and status bar; active theme marked; mermaid follows dark/light.                        |
| 5.7 | Copy `testing/custom_themes/*.css` into the themes folder (paths in `testing/README.md`), restart, select one.   | The themes appear in the dropdown and apply.                                                                                            |

## S6 — Compatibility levels

*`Rendering-All.md` open in split view.*

| #   | Do                                                                                        | Expect                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | Click the level button; switch Basic/GitHub/Advanced while watching the popover.          | Popover stays glued to the level button while switching.                                                                                                                  |
| 6.2 | At "Basic": look at the editor gutter and the warning badge; hover a gutter marker.        | Warnings on lines with tables, strikethrough, highlight, tasks, autolinks, footnotes, raw HTML, math, frontmatter and mermaid; badge shows the count; tooltip names the feature and required level. |
| 6.3 | Click the warning badge.                                                                  | Violation list ordered GitHub-first, then Advanced-only, alphabetical within each group.                                                                                   |
| 6.4 | Switch to "GitHub"; then open `MathChemMermaid-All.md`.                                   | Tables/strike/tasks/autolinks/footnotes/raw HTML/dollar-math/mermaid warnings clear; highlight, frontmatter, chemistry and LaTeX math remain; the math doc warns on its LaTeX/chemistry fences. |
| 6.5 | Switch to "Advanced", then "Custom" and toggle a feature.                                 | Advanced: all clear, no badge. Custom: "Custom (n/13)" and warnings follow the toggles.                                                                                   |
| 6.6 | At "Basic" type `==x==` repeatedly.                                                       | Warnings appear after a short pause (~200 ms debounce), not on every keystroke.                                                                                           |

## S7 — Export & print

*Needs a browser and LibreOffice; a printer is optional. Files:
`Rendering-All.md`, `MathChemMermaid-All.md`, `VegaLite-All.md`.*

| #   | Do                                                                                                                         | Expect                                                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 7.1 | Export HTML with confirmation on: try Escape, backdrop and Cancel, then Enter. Tick/untick "Show export and print confirmation" in the Export as… menu. | Dialog names the export and the current theme; cancelling runs nothing; Enter starts the export; the checkbox turns the dialog off and on again.                                                                                                                                              |
| 7.2 | Export `Rendering-All.md` as HTML; open it in a browser next to the viewer. Then set the app to 200% zoom and export again.                                                | Looks like the viewer (same theme); images embedded (works offline); "Exported" toast. The 200% export is identical to the 100% one (on-screen zoom must not leak into exports) and the app returns to 200% afterwards.                                                                                                                                                                                                                                                                       |
| 7.3 | Export as HTML Bundle; extract the zip.                                                                                    | `index.html` + `images/` (and `fonts/` for the math doc); `index.html` renders standalone; `square.png` and `square-2.png` both present (basename collision).                                                                                                                                                                                                |
| 7.4 | Export `MathChemMermaid-All.md` as ODT (rasterize OFF, default); open in LibreOffice and compare every diagram with the viewer. | Text/tables/lists/headings right; code in printer-friendly colors; formulas are editable formula objects; footnotes are real footnotes; every diagram family matches the viewer: theme colors (no black boxes), complete arrows, gantt text at the same relative size as other diagrams, math labels at the right height in their boxes, edge labels keep their translucent gray background, molecules render. |
| 7.4b | Export `Rendering-All.md` as ODT too and skim it. | Local images embedded, footnotes are real footnotes, the table and the HTML spans (`<kbd>`, `<mark>`, `<sub>`/`<sup>`) render. |
| 7.4c | Export `VegaLite-All.md` as ODT from a **dark** app theme; open in LibreOffice and compare with the viewer. | Charts are vector SVG matching the viewer; all lines/titles/labels are dark on the white page (never light gray); the §7 `theme=dark` chart keeps its dark box; §9 `square.png` and the §6b math labels are present (no broken images); the §7 wide chart is clamped to the page width. |
| 7.5 | Re-export with "Rasterize as PNG" ON at 2× resolution.                                                                     | Formulas and diagrams are sharp PNGs (bigger files than at 1×); the resolution selector is greyed out until a rasterize option is ticked. Zoom into a multi-row `cases` formula — its brace is continuous (no gaps or sideways offsets). Options are remembered on the next export.                                                                                                                                                                              |
| 7.6 | Export once with the frontmatter card OFF; open the ODT's file properties.                                                 | No frontmatter card in the body; document properties still carry title/author from the frontmatter. The toggle is greyed out for a file without frontmatter.                                                                                                                                                                                                  |
| 7.7 | PDF: **macOS 12–14** use "Export as PDF". **Linux/Windows/macOS 15+** use "Print / PDF" (`Ctrl+P`) → Save as PDF. Save `MathChemMermaid-All.md`, open the PDF. | Vector PDF with selectable text; math and chemistry render; every diagram intact (arrows, boxes, labels, gantt text size, math-label height — as in the viewer); line wrapping matches the viewer; dark theme keeps its background; the wide diagram is scaled to the page. Cancel the dialog once → no file written. **macOS 12–14:** one long A4-wide page, "Exporting…" overlay, "PDF saved" toast (and "Create PDF failed" for a read-only destination). **macOS 15+:** the print panel is a sheet on the window and closing it leaves no stuck overlay. |
| 7.8 | *(Optional, printer connected)* Print one page of the same file.                                                           | Prints with the same styling as the screen.                                                                                                                                                                                                                                                                                                                  |
| 7.9 | Export `MathChemMermaid-All.md` as DOCX (default options); open it in LibreOffice Writer, then in Google Docs / Word.       | Opens with **no repair prompt anywhere**. Headings show in the navigation pane; lists are real lists (no literal bullets); tables have borders, a shaded repeating header row, and fit the page; code is in printer-friendly colors; equations are editable native equations; footnotes are real footnotes; links work; every diagram family renders as an image matching the viewer (theme colors, complete arrows, molecules). |
| 7.10 | Re-export with "Rasterize math as PNG" ON at 3×.                                                                          | Equations are PNG images (alt text = the TeX source) at the same size and line position as the ODT export — compare the two side by side in Word and LibreOffice: formulas neither oversized nor riding above the text line. In Google Docs they sit on the baseline (the run-position shift is ignored there) but never overlap. Options are remembered on the next export.                                                                                                                                                                                                                                   |
| 7.10b | Re-export with "Rasterize diagrams" OFF (vector mode), open in Word 2016+ and in LibreOffice / Google Docs.               | No repair prompt anywhere; in Word the diagrams zoom sharply (SVG), elsewhere they show the PNG fallback — both match the viewer.                                                                                                                                                                                                                             |
| 7.11 | Export `Rendering-All.md` as DOCX; skim it.                                                                                | Local images embedded; the frontmatter card is present (toggle off → gone, but File → Properties keeps title/author); the table renders; `<kbd>`, `<mark>`, `<sub>`/`<sup>` render.                                                                                                                                                                            |
| 7.11b | Export `VegaLite-All.md` as DOCX from a **dark** app theme; open it in Writer.                                             | Same expectations as 7.4c; in vector mode the charts zoom sharply (SVG) and elsewhere show the PNG fallback — both match the viewer.                                                                                                                                                                                                                           |

**DOCX schema gate (8.13):** before a release, validate exported DOCX
fixtures against the bundled ISO/IEC 29500-4 schemas — zero errors required:

```bash
python3 .agents/skills/docx/scripts/office/validate.py exported-file.docx
```

Fixtures should cover prose/headings, lists, tables, math (both option modes),
diagrams, images, footnotes, and the frontmatter card (EXPORT-PLAN 8.13).

## S8 — Command palette, About & quit

*Set the theme, zoom, view mode and compatibility level you want to keep
before starting — step 8.5 verifies they persist.*

| #   | Do                                                                                            | Expect                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1 | `Ctrl+Shift+P`: type "save", then "xyzabc"; arrow around; hover rows.                          | Filtered list; "No matching commands" for junk; selection wraps and follows the mouse; shortcut and category badges shown.                          |
| 8.2 | Run "New File" with Enter; then type "export" and run one export command.                     | Commands run and the palette closes; the export commands cover HTML, Bundle, PDF, ODT and DOCX and use the same flow as the toolbar.                  |
| 8.3 | `F1` (or the info icon): check all four tabs, "Check for Updates", and one link.              | About / Dependencies / Keyboard Shortcuts / License all populated; update check shows a status; links open in the browser; closes via X, Escape, backdrop. |
| 8.4 | Edit a file and quit (`Ctrl+Q`); try Cancel, Discard and Save First (incl. cancelling the save dialog). | Unsaved-changes dialog each time; Cancel keeps the app open, Discard closes losing changes, Save First saves then closes, cancelled save keeps the app open. |
| 8.5 | Arrange the window (resize/move or maximize), quit, reopen.                                   | Window position/size/maximized restored; the last file reopens; theme, zoom, view mode and compatibility level are restored.                        |

---

## Coverage map

| Area                                                           | Manual | Automated (vitest / cargo)                                        |
| -------------------------------------------------------------- | ------ | ----------------------------------------------------------------- |
| Window, launch, CLI file argument                              | S1     | —                                                                 |
| Layout, split handle, view modes                               | S1     | `AppLayout.test.ts` (incl. split handle), `ViewToggle.test.ts`    |
| Scroll sync                                                    | S1     | `scroll-sync.test.ts`                                             |
| Rendering: headings, footnotes, lists, tables, code, HTML, frontmatter, links | S1     | `markdown*.test.ts`, `Viewer.test.ts`                             |
| Images (all source variants)                                   | S1     | `markdown.test.ts`, `image-src.test.ts`, `image-title.test.ts`    |
| Math & chemistry                                               | S2     | `markdown-math.test.ts`, `katex/*`                                |
| Mermaid                                                        | S2     | `mermaid/*`                                                       |
| SMILES                                                         | S2     | `smiles/*`                                                        |
| Editor typing, status bar                                      | S3     | `editor.test.ts`, `StatusBar.test.ts`                             |
| Toolbar & keyboard formatting                                  | S3     | `editor-format.test.ts`, `EditorToolbar.test.ts`, `EditorKeyboard.test.ts` |
| Format Document / Current Paragraph                            | S3     | `markdown-formatter.test.ts`, `Editor.test.ts`, `keyboard-matrix.test.ts` |
| Find / replace                                                 | S3     | `EditorSearch.test.ts`                                            |
| File open/save, unsaved-changes dialogs, reload                | S4     | `file.test.ts`, `confirm.test.ts`, `page.test.ts`, `file.rs`      |
| Encoding (BOM/CRLF/Latin-1), read-only, backups                | S4     | `cargo test` — `src-tauri/src/commands/file.rs`                   |
| External modification & deletion                               | S4     | — (needs real file-system watching)                               |
| Zoom & scroll anchoring                                        | S5     | `zoom.test.ts`, `zoom-scroll-anchor.test.ts`                      |
| Themes & custom themes                                         | S5     | `themes.test.ts`, `user-themes.test.ts`                           |
| Compatibility levels & lint warnings                           | S6     | `markdown-levels.test.ts`, `Editor.test.ts`                       |
| Export HTML / Bundle / ODT / DOCX / PDF internals              | S7     | `src/lib/export/__tests__/*` (docx suite incl. package/rel integrity + XSD gate below) |
| Export confirm dialog & options                                | S7     | `ExportConfirmDialog.test.ts`, `option-settings.test.ts`          |
| Command palette & About dialog                                 | S8     | `CommandPalette.test.ts`, `AboutDialog.test.ts`                   |
| Quit & persistence                                             | S8     | `settings.test.ts`                                                |

## Engine upgrades

The deep KaTeX/Mermaid/WebKit geometry regressions are pinned by the
`upgrade-contract` unit tests; after an engine upgrade also run
`python3 testing/tools/zoom-sweep/mermaid-zoom-sweep.py` (Linux, see
`testing/tools/zoom-sweep/README.md`) and give S2 and S5.5 an extra careful
read.
