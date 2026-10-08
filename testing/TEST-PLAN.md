# Markdown Viewditor — Manual Test Plan

## Test Environment Setup

- Build & launch: `npm run tauri dev` (or install a built binary)
- Test files live in the `testing/` directory.
- Tests marked **macOS** / **Linux&Windows** apply only to that platform;
  unmarked tests are platform-independent.

> Notation:
>
> - `Ctrl` below stands for `Cmd` on macOS and `Ctrl` on Linux/Windows.
> - GFM: **G**ithub **F**lavored **M**arkdown

---

# Part 1 — Test Stories

Each story is a self-contained walkthrough. Complete the stories in order.

---

## S1: Cold Launch & Window

*No file needed — fresh start.*

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Start the app for the first time (or clear saved state). | Window opens at ~1200×800, title "Markdown Viewditor". |
| 1.2 | Resize the window below 800×600. | Window clamps at 800×600. |
| 1.3 | Move and resize the window, close the app, reopen. | Position and size are restored. |
| 1.4 | Maximize the window, close, reopen. | Opens maximized. |
| 1.5 | Right-click anywhere in the app. | No native context menu appears. |
| 1.6 | Launch from the command line: `markdown-viewditor testing/Simple.md`. | `Simple.md` opens automatically. |
| 1.7 | Open a file, close the app, reopen without arguments. | The same file opens on startup. |

---

## S2: Layout, Navigation & View Modes

*File: `Rendering-All.md`*

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Open `Rendering-All.md`. | A loading overlay with spinner appears briefly over the viewer, then content loads. |
| 2.2 | Observe the layout. | Split view: editor left, viewer right, ~50/50. |
| 2.3 | Drag the center divider left and right. | Pane ratio changes; panes resize smoothly. |
| 2.4 | Drag the handle to the far left (<5%). | Switches to viewer-only mode. |
| 2.5 | Drag the handle to the far right (>95%). | Switches to editor-only mode. |
| 2.6 | Double-click the handle. | Snaps back to exactly 50% split. |
| 2.7 | Hover the handle. | Handle turns accent color. |
| 2.8 | Click "Edit", "Split", "View" buttons. | Only the selected pane(s) are visible; active button has accent background. |
| 2.9 | In split view, scroll the viewer slowly. | Editor scrolls to the corresponding section (scroll sync). |
| 2.10 | Scroll the editor slowly. | Viewer scrolls to the corresponding section. |
| 2.11 | Scroll quickly in either pane. | No drift, oscillation, or lag. |
| 2.12 | Switch to editor-only mode, scroll. | Only the editor scrolls; viewer is unaffected. |
| 2.13 | Switch to viewer-only mode, scroll. | Only the viewer scrolls; editor is unaffected. |
| 2.14 | Set the view to "Editor", close, reopen. | Restores "Editor" mode. |

---

## S3: Editor Basics & Search

*Open a new untitled file (Ctrl+N).*

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Click in the editor, type `Hello World`. | Text appears, cursor moves. |
| 3.2 | Look at the left gutter. | Line numbers are displayed. |
| 3.3 | Type `# Heading`, `**bold**`, `` `code` ``. | Markdown syntax is color-highlighted. |
| 3.4 | Click at different positions in the text. | Status bar shows correct `Line X, Col Y`. |
| 3.5 | Type several words. | Status bar word count updates. |
| 3.6 | Select all text (Ctrl+A), delete. | Word count shows 0. |
| 3.7 | Type some text, press Ctrl+F. | Search bar opens. Type a word that exists — editor jumps to the match. |
| 3.8 | Press Escape. | Search bar closes. |
| 3.9 | Press Ctrl+F again (same search bar; the Find field keeps your term from 3.7 — retype it if empty). Type a replacement in the Replace field and click `replace all`. | Every occurrence is replaced (Find behavior was already checked in 3.7). Word count updates. Press Escape to close. |

---

## S4: Editor Toolbar & Formatting Shortcuts

*Open a new untitled file (Ctrl+N). Type a line of text, select it.*

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Click the **Bold** toolbar button. | Wraps in `**...**`; viewer shows **bold**. |
| 4.2 | Click **Italic**. | Becomes `***...***` (bold-italic). |
| 4.3 | Click **Italic** again. | Back to `**...**` (bold only). |
| 4.4 | Select plain text, click **Italic**. | Wraps in `*...*`. Click again → plain text. |
| 4.5 | Click **Strikethrough**. | Wraps in `~~...~~`; viewer shows ~~strikethrough~~. |
| 4.6 | Click **Highlight**. | Wraps in `==...==`; viewer shows ==highlight==. |
| 4.7 | Click **Heading**. | Adds `## `. Click again: cycles H3→H4→H5→H6→plain. |
| 4.8 | Click **Link**. | Inserts `[text](url)`. |
| 4.9 | Click **Image**. | Inserts `![alt](url)`. |
| 4.10 | Select text, click **Code**. | Wraps in `` ` ` `` (inline code). |
| 4.11 | Click **Code** again. | Toggles to ` ``` ` code block. |
| 4.12 | Click **Code** again. | Back to inline code. |
| 4.13 | Click **Bullet List**. | Adds `- ` prefix. |
| 4.14 | Click **Numbered List**. | Adds `1. ` prefix. |
| 4.15 | Click **Task List**. | Adds `- [ ] ` prefix. |
| 4.16 | Click **Blockquote**. | Adds `> ` prefix. |
| 4.17 | Click **Horizontal Rule**. | Inserts `\n---\n`. |
| 4.18 | Click any toolbar button. | Editor does not lose focus. |
| 4.19 | Select text, press `Ctrl+B`. | Toggles `**bold**` (same as button). |
| 4.20 | Press `Ctrl+I`. | Toggles `*italic*`. |
| 4.21 | Press `Ctrl+Shift+X`. | Toggles `~~strikethrough~~`. |
| 4.22 | Press `Ctrl+Shift+M`. | Toggles `==highlight==`. |
| 4.23 | Press `Ctrl+Shift+H`. | Cycles heading levels. |
| 4.24 | Press `Ctrl+K`. | Inserts link. |
| 4.25 | Press `Ctrl+Shift+I`. | Inserts image. |
| 4.26 | Press `Ctrl+E`. | Toggles code. |
| 4.27 | Press `Ctrl+Shift+8`. | Adds bullet list prefix. |
| 4.28 | Press `Ctrl+Shift+7`. | Adds numbered list prefix. |
| 4.29 | Press `Ctrl+Shift+V`. | Cycles editor → split → viewer → editor. |
| 4.30 | Type a paragraph with several lines, select it, press `Shift+Alt+F`. | Lines re-wrap to fit the editor width. |
| 4.31 | Select a blockquote paragraph, press `Shift+Alt+F`. | Lines re-wrap; `> ` prefixes are preserved. |

---

## S5: Viewer — Full Rendering

*File: `Rendering-All.md` — open in split view.*

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | Look at the "Headings" section. | H1 is the page title; H3–H6 render at decreasing sizes. |
| 5.2 | Look at "Custom Heading ID". | The heading is rendered. An anchor link to `#custom-test-id` (in the Links section) scrolls here. |
| 5.3 | Look at "Text Formatting". | Bold, italic, bold-italic, strikethrough, inline code, and ==highlighted== text all render. Combinations like bold-italic-strikethrough work. |
| 5.4 | Look at the footnote references. | Superscript links [1] and [2] appear inline. Footnote definitions appear at the bottom of the document. |
| 5.5 | Look at "Lists". | Unordered (bullets), ordered (numbers), task (checkboxes) render correctly. |
| 5.6 | Look at "Deeply Nested List". | Six indentation levels render correctly with mixed bullets, numbers, and checkboxes. |
| 5.7 | Look at "Blockquotes". | Nested blockquotes indent correctly. A blockquote containing a nested list renders both. |
| 5.8 | Look at "Tables". | Both tables render with borders. The aligned-columns table has left, center, and right alignment. |
| 5.9 | Look at "Code Blocks". | All 7 language blocks (JS, Python, CSS, HTML, JSON, Bash, SQL) have syntax highlighting — keywords, strings, comments are colored. |
| 5.10 | Look at the "Very Long Code Block". | It renders without breaking layout and scrolls inside its block. |
| 5.11 | Look at "Horizontal Rule". | A horizontal line separates sections. |
| 5.12 | Look at "Raw HTML Elements". | `<details>`/`<summary>` collapses/expands. `<kbd>` shows keyboard style. `<sub>`, `<sup>` render correctly. `<mark>` highlights. `<ins>`/`<del>` render. Colored `<span>` text appears in red and green. Special characters Æ Ø Å – — ♪ ♫ → ½ render correctly. |
| 5.13 | Look at "YAML Frontmatter". | A "Frontmatter" card shows `title`, `author`, `tags` as a key-value grid. |
| 5.14 | Open `SKILL.md` in the viewer. | A "Skill" card shows a badge, name, description, and license. |
| 5.15 | In `Rendering-All.md`, click the anchor link to `#custom-test-id`. | Viewer scrolls to the "Custom Heading ID" heading. |
| 5.16 | Click the anchor link to `#tables`. | Viewer scrolls to the Tables section. Special characters in anchors work (CSS.escape). |
| 5.17 | Click the external link (`https://example.com`). | Opens in external browser. |
| 5.18 | Click the local file link (`README.md`). | Opens with OS default handler. |
| 5.19 | Hover over a link in the viewer. | A tooltip appears showing the link's destination URL. |
| 5.20 | Look at "Images". | Local relative path, HTML `<img>`, filenames with spaces (quoted and percent-encoded), unicode filename in subdirectory all render. |
| 5.21 | Look at the remote image. | Loads from the internet (random photo from picsum.photos). |
| 5.22 | Press Ctrl+R to reload the file. | The remote image changes (picsum.photos returns a random photo each load); viewer re-renders. |
| 5.23 | Look at the data URI image. | A small colored square renders inline. |
| 5.24 | Look at the missing image. | Shows a broken-image placeholder; no crash. |
| 5.25 | Look at the SVG images. | The SVG from file and the inline SVG both render. |
| 5.26 | Hover over an image in the viewer. | A tooltip shows the alt text or image source path. |
| 5.27 | Tab to a link, press Enter. | Same behavior as clicking (opens in browser/handler). |

---

## S6: Math, Chemistry & Mermaid

*File: `MathChemMermaid-All.md` — open in split view.*

### 6a. Math — Delimiter Styles

| Step | Action | Expected |
|------|--------|----------|
| 6.1 | Look at "Inline Dollar". | Pythagorean theorem renders with superscripts. The price sentence ("$5 and $10") is plain text. |
| 6.2 | Look at "Block Dollar". | Quadratic formula renders as a centered fraction with ± and √. |
| 6.3 | Look at "Matrices". | Two matrices multiplied, with parentheses and aligned elements. |
| 6.4 | Look at "Cases". | Piecewise function with a brace and two branches. |
| 6.5 | Look at "Inline Bracket". | Euler's identity renders inline. |
| 6.6 | Look at "Block Bracket". | Gaussian integral renders centered with ∫ and √π. |
| 6.7 | Look at "Bare `\begin{...}` Blocks". | Maxwell equations render aligned at `=` signs. |
| 6.8 | Look at "Fenced ` ```math ` Blocks". | Basel problem sum renders as math. The anonymous ` ``` ` block below it renders as plain code. |
| 6.9 | Look at "Very Wide Block". | Renders without breaking layout; horizontal scrollbar appears if needed. |
| 6.10 | Look at "Invalid LaTeX". | A compact error message appears inline; no crash. |

### 6b. Math — Fence Attributes

| Step | Action | Expected |
|------|--------|----------|
| 6.11 | Look at "Fontsize Scaling (2×)". | The fraction `x²/y²` renders at 2× base size. |
| 6.12 | Look at "Left-side Equation Numbers (leqno)". | Equation number (1) appears on the left. |
| 6.13 | Look at "Flush-left Alignment (fleqn)". | The integral is left-aligned, not centered. |
| 6.14 | Look at "Combined Attributes". | Equation number (3) on the left AND 1.5× size. |

### 6c. Math — HTML Comment Directives

| Step | Action | Expected |
|------|--------|----------|
| 6.15 | Look at "Fontsize Directive". | The `<!-- math: fontsize=1.3 -->` comment is not visible. The inline `$…$` and block `$$…$$` math below it render at 1.3× size. |
| 6.16 | Look at "Reset Fontsize". | After `<!-- math: !fontsize -->`, the inline math is at default size. |
| 6.17 | Look at "Leqno Directive". | Two blocks below `<!-- math: leqno -->` both have left equation numbers (3) and (4). |
| 6.18 | Look at "Reset Leqno". | After `<!-- math: !leqno -->`, equation (Right 5) has a right-side number. |
| 6.19 | Look at "Directive on Bracket Math". | Bracket inline `\(x^2\)` and bracket block `\[∫\]` are both scaled. |
| 6.20 | Look at "Multiple Directives on One Line". | Both leqno and fontsize=2.0 apply to equation (6). |
| 6.21 | Look at "Scoping — Fence Overrides Directive". | The ` ```math {fontsize=2.0} ``` ` block is at 2×, not 1.5×. The `$$…$$` block after it resumes at 1.5× (directive still active). |
| 6.22 | Look at "Directive Comment Not Rendered". | The `<!-- math: leqno -->` comment is not visible in the viewer. |
| 6.23 | Look at "Unknown Namespace Ignored". | The `<!-- unknown: foo=bar -->` comment has no effect. |

### 6d. Chemistry

| Step | Action | Expected |
|------|--------|----------|
| 6.24 | Look at "Chemistry — Formulas". | H₂O, H₂SO₄, C₆H₁₂O₆ render with subscripts. |
| 6.25 | Look at "Charges". | H⁺, CrO₄²⁻, [AgCl₂]⁻ render with superscripts. |
| 6.26 | Look at "Stoichiometric Numbers". | 2H₂ + O₂ → 2H₂O renders with coefficients. |
| 6.27 | Look at "Reaction Arrows". | Arrow table renders. Annotated arrow shows "heat" above and "catalyst" below. |
| 6.28 | Look at "Isotopes and Bonds". | Thorium isotope with superscript/subscript. Single, double, triple bonds render. |
| 6.29 | Look at "States of Aggregation". | (aq), precipitate ↓, gas ↑ render. |
| 6.30 | Look at "Physical Units". | 123 kJ/mol and 3×10⁸ m·s⁻¹ render correctly. |
| 6.31 | Look at "Inline in Sentences". | Chemistry inline in prose with physical units. |
| 6.32 | Look at "Block Equations". | Zinc equilibrium renders as a multi-step reaction. |
| 6.33 | Look at "Equilibrium with Math". | K expression with `\frac` and `\ce` mixed. |
| 6.34 | Look at "Bracket Delimiters". | Inline and bracket-block chemistry render. |
| 6.35 | Look at "Fenced Blocks". | Chemistry in a ` ```math ` fence renders. |

### 6e. Mermaid

| Step | Action | Expected |
|------|--------|----------|
| 6.36 | Look at "Mermaid — Basic Flowchart". | A flowchart renders as inline SVG: Start → Decision → Action 1/2 → End. |
| 6.37 | Look at "Mermaid — Sequence Diagram". | A sequence diagram with Alice and Bob exchanging messages. |
| 6.38 | Look at "Mermaid — Error Case". | A styled error block shows the source code with a "Mermaid rendering failed" message; no crash. |
| 6.39 | Look at "Mermaid — Fence Attributes: Align Left, Max Width 400". | The diagram is left-aligned and constrained to 400px width. |
| 6.40 | Look at "Mermaid — Fence Attributes: Fit to Width Disabled". | The diagram renders at natural size with a horizontal scrollbar; no vertical scrollbar. |
| 6.41 | Look at "Mermaid — HTML Comment Directives". | The diagram below the `<!-- mermaid: align=right maxWidth=300 -->` directive is right aligne at 300px. After the reset directive, the next diagram uses defaults. |
| 6.42 | Look at "Mermaid — Theme Override via YAML". | The diagram uses the "forest" theme (different from the app's dark/light theme). |
| 6.43 | Switch the app theme between dark and light. | Mermaid diagrams re-render with the matching Mermaid theme (dark → "dark", light → "default"). |

---

## S7: Compatibility Levels

*Files: `Rendering-All.md`, `MathChemMermaid-All.md`*

| Step | Action | Expected |
|------|--------|----------|
| 7.1 | Open `Rendering-All.md`, check the status bar. | Level button shows "Advanced". |
| 7.2 | Click the level button, click "Basic". | Level changes to "Basic". No warnings for pure CommonMark content. |
| 7.3 | With "Basic" level, look at `Rendering-All.md` in editor. | Gutter warnings appear on lines using tables, strikethrough, highlight, task lists, autolinks, footnotes, raw HTML, math, frontmatter, and mermaid. Warning badge shows count in status bar. |
| 7.4 | Hover over a yellow gutter marker. | Tooltip shows the violation message (e.g. "Tables is above the 'basic' level (requires: github)"). |
| 7.5 | Click the warning badge. | Popover shows violation details, ordered by required preset (GitHub features first, then Advanced-only) and alphabetically within each group. The level popover's toggle checklist uses the same order. |
| 7.6 | Switch to "GitHub". | Warnings clear for tables, strikethrough, task lists, autolinks, footnotes, raw HTML, math (dollar), and mermaid. Warnings remain for highlight, frontmatter, chemistry, and LaTeX math. |
| 7.7 | Open `MathChemMermaid-All.md` with "GitHub" level. | Warnings on `\(...\)`, `\[...\]`, `\begin{}`, ` ```math `, `\ce{}`, and mermaid fence lines. |
| 7.8 | Switch to "Advanced". | All warnings clear. No badge. |
| 7.9 | Switch to "Custom". | Level shows "Custom (n/13)" with enabled count. Toggle features on/off — warnings update. |
| 7.10 | Select "GitHub", close app, reopen. | Level is still "GitHub". |
| 7.11 | Switch to "Basic", type `==text==` rapidly. | Warnings appear after ~200ms debounce, not on every keystroke. |

---

## S8: File Operations

*Files: `Simple.md`, `Empty.md`, `Large.md`, `BOM_Simple.md`, `CRLF_Simple.md`, `ISO8859-1_Simple.md`, `简单.md`, `Space Simple.md`*

This story walks through all file operations: opening, saving, handling unsaved changes, reloading, and encoding edge cases.

### 8a. Open & Save

| Step | Action | Expected |
|------|--------|----------|
| 8.1 | Click Open, select `Simple.md`. | Content loads into editor, viewer renders it; "Simple.md" shown in toolbar. |
| 8.2 | Open the file dialog. | Shows "Markdown" and "All Files" filters. Cancel — no change. |
| 8.3 | With "Untitled" file, click Save. | Save-as dialog appears. |
| 8.4 | Open `Simple.md`, edit content, click Save. | File saved; `*` indicator disappears; `.bak` backup created. |
| 8.5 | Use Save As to a new location (e.g. `/tmp/test-save.md`). | New file created; app tracks new path. |
| 8.6 | Use Save As to an existing file. | OS overwrite confirmation appears; on confirm, file is replaced. |
| 8.7 | Create a read-only file (`chmod 444 /tmp/readonly.md`), Save As to it. | Toast: "This file is read-only…" |

### 8b. Unsaved Changes Dialog

| Step | Action | Expected |
|------|--------|----------|
| 8.8 | Edit content, click New (or Ctrl+N). | Dialog: "You have unsaved changes. Create a new file?" with Cancel / Discard / Save First. |
| 8.9 | Edit content, click Open (Ctrl+O). | Same 3-button dialog. |
| 8.10 | Edit content, click Reload (Ctrl+R). | 2-button dialog: Cancel / Yes, Discard My Changes. |
| 8.11 | In the 3-button dialog, click Save First (no filename). | Save-as dialog; on save, editor clears to "Untitled". |
| 8.12 | In the 3-button dialog, click Save First (with filename). | File saved (no clear); action proceeds. |
| 8.13 | In the 3-button dialog, click Discard. | Editor clears (New) or action proceeds; changes lost. |
| 8.14 | In the 3-button dialog, click Cancel. | No change. |

### 8c. Reload & Deletion

| Step | Action | Expected |
|------|--------|----------|
| 8.15 | Open `Simple.md`, edit externally, click Reload (no local edits). | Content updates from disk. |
| 8.16 | Open a temp file, delete externally, click Reload. | Dialog: "This file no longer exists…" with OK. |
| 8.17 | After deletion, press Ctrl+S. | Save-as dialog (does not recreate at old path). |
| 8.18 | Edit content. | `*` after filename; dot on Save button. |

### 8d. Read-only Files

| Step | Action | Expected |
|------|--------|----------|
| 8.19 | Open a read-only file (`chmod 444`). | Lock icon with tooltip "Read-only". |
| 8.20 | Edit the read-only file, click Save. | Toast: "This file is read-only…" |

### 8e. Encoding & Special Filenames

| Step | Action | Expected |
|------|--------|----------|
| 8.21 | Open `Empty.md`. | Viewer empty; word count 0; no crash. |
| 8.22 | Open `Large.md`. | Loads without freezing; scroll works. |
| 8.23 | Open `BOM_Simple.md`. | Content reads correctly, no BOM artifact. |
| 8.24 | Open `CRLF_Simple.md`. | Content reads correctly, no `^M` artifacts. |
| 8.25 | Open `ISO8859-1_Simple.md`. | Decoded losslessly (Æ Ø Å visible). |
| 8.26 | Open `简单.md`. | Opens correctly; filename displays in toolbar. |
| 8.27 | Open `Space Simple.md`. | Opens and saves correctly. |

### 8f. Error Handling

| Step | Action | Expected |
|------|--------|----------|
| 8.28 | Save to a read-only directory. | Toast: "Failed to save the file." |
| 8.29 | Open a file that fails (permission denied). | Toast: "Failed to open the file." |

---

## S9: External Modification

*Create a temporary file `/tmp/ext-test.md` with some content. Use a second editor (or terminal) to modify it while the app has it open.*

This story tests how the app handles files modified or deleted by external programs.

### 9a. Detect External Changes

| Step | Action | Expected |
|------|--------|----------|
| 9.1 | Open `/tmp/ext-test.md`, edit externally, focus app. | Dialog: "This file has been modified by another application. Do you want to reload it?" with Cancel / Reload. |
| 9.2 | Edit in app, edit externally, focus app. | Dialog: "…You also have unsaved changes. Reload and discard your changes?" with Cancel / Yes, Discard. |

### 9b. Decline Reload

| Step | Action | Expected |
|------|--------|----------|
| 9.3 | Click Cancel (decline). | Warning icon appears on filename; no re-prompt until file changes again. |
| 9.4 | After declining, press Ctrl+S. | Dialog: "…Overwrite the external changes?" with Cancel / Overwrite. |

### 9c. Accept Reload

| Step | Action | Expected |
|------|--------|----------|
| 9.5 | Accept reload (no local edits). | Content updates; warning clears; baseline reset. |
| 9.6 | Accept reload (with local edits). | Content updates; warning clears; local edits lost. |

### 9d. File Deleted Externally

| Step | Action | Expected |
|------|--------|----------|
| 9.7 | Delete file externally, focus app. | Dialog: "This file no longer exists…" with OK. |
| 9.8 | After deletion, press Ctrl+S. | Save-as dialog. |

### 9e. Edge Cases

| Step | Action | Expected |
|------|--------|----------|
| 9.9 | Open file, modify externally, press Ctrl+S. | Overwrite warning dialog. |
| 9.10 | Modify externally, press Ctrl+R. | If dirty: reload dialog. If clean: reloads silently. |
| 9.11 | **Linux/macOS:** Edit externally without changing mtime: `touch -r file.md .timestamp; echo x >> file.md; touch -r .timestamp file.md`. **Windows (PowerShell):** `$f = 'ext-test.md'; $t = (Get-Item $f).LastWriteTime; Add-Content $f 'x'; (Get-Item $f).LastWriteTime = $t`. | Warning icon appears (size comparison). |
| 9.12 | Press Ctrl+R with no external changes. | Content reloads; viewer re-renders; no toast. |

---

## S10: Export — All Formats

*Files: `Rendering-All.md`, `MathChemMermaid-All.md`*

### 10a. Confirm Dialog

| Step | Action | Expected |
|------|--------|----------|
| 10.1 | With confirmation ON, click HTML/PDF export. | Dialog: title "Export HTML" / "Export / Print"; shows current theme name; hint about Printer Friendly theme. |
| 10.2 | With confirmation ON, click ODT export. | Dialog: "This export always uses a neutral, printer-friendly style."; shows ODT options (math rasterize, "SVG images & Mermaid diagrams" rasterize, resolution). |
| 10.3 | Click Cancel / press Escape / click backdrop. | No export runs. |
| 10.4 | Press Enter. | Export runs. |
| 10.5 | With confirmation ON, open the confirm dialog. | Hint below the options names the "Show export and print confirmation" checkbox (macOS: "Show export confirmation") in the Export as… menu. No "Do not show this message again" checkbox. |
| 10.6 | Untick "Show export and print confirmation" in the dropdown footer. | Next export/print skips the dialog. Re-tick it: the dialog reappears. |

### 10b. Export as HTML

*File: `Rendering-All.md`*

| Step | Action | Expected |
|------|--------|----------|
| 10.7 | Choose Export as HTML. | Save dialog with `Rendering-All.html`, HTML filter. |
| 10.8 | Save and open in browser. | Self-contained page renders identically to the viewer. |
| 10.9 | Repeat with a dark theme. | Output uses the same theme. |
| 10.10 | Export `Rendering-All.md`. | Local images embedded as data URIs. |
| 10.11 | Export `MathChemMermaid-All.md`. | KaTeX and chemistry formulas render from inlined CSS. |
| 10.12 | Export a file with a missing local image. | Warnings dialog lists the failed image. |
| 10.13 | Successful export. | Toast: "Exported" with path. |
| 10.14 | Cancel the save dialog. | No file written, no toast. |

### 10c. Export as HTML Bundle

*File: `Rendering-All.md`*

| Step | Action | Expected |
|------|--------|----------|
| 10.15 | Choose Export as HTML Bundle. | Save dialog with `.zip`, ZIP filter. |
| 10.16 | Save and extract. | Contains `index.html` and `images/`. If the document has math (KaTeX), also contains `fonts/` with `.woff2` files. |
| 10.17 | Open `index.html` in browser. | Renders identically; image srcs point to `images/...`. |
| 10.18 | If `fonts/` is present, check contents. | Contains KaTeX `.woff2` files needed for math rendering. |
| 10.19 | Repeat with a dark theme. | Output uses same theme. |
| 10.20 | Export with two images sharing a basename. | Both present: `square.png` and `square-2.png`. |
| 10.21 | Export `MathChemMermaid-All.md`. | Math renders from extracted fonts. |
| 10.22 | Successful export. | Toast: "Exported". |

### 10d. Export as ODT

*Files: `MathChemMermaid-All.md` (for math/chemistry/mermaid tests), `Rendering-All.md` (for images and HTML elements)*

This section tests ODT export with various content types and rasterization options.

#### Basic ODT Export

| Step | Action | Expected |
|------|--------|----------|
| 10.23 | Choose Export as ODT. | Save dialog with `.odt`, ODT filter. |
| 10.24 | Open in LibreOffice. | Text, headings, lists, tables, code highlighting render. Code uses printer-friendly colors. |
| 10.42 | Successful export. | Toast: "Exported". |

#### Math Rendering Options (use `MathChemMermaid-All.md`)

| Step | Action | Expected |
|------|--------|----------|
| 10.25 | Math — rasterize OFF (default). | Formulas appear as editable ODF Math objects. |
| 10.26 | Math — rasterize ON (tick "Rasterize as PNG"). | Formulas render as inline PNG frames. |

#### SVG & Mermaid Options (use `MathChemMermaid-All.md`)

| Step | Action | Expected |
|------|--------|----------|
| 10.27 | SVG — rasterize OFF. | SVG embedded as `Pictures/*.svg` (vector). |
| 10.28 | SVG — rasterize ON. | SVG replaced with PNG image. |
| 10.29 | Resolution: switch to 2×, re-export. | PNG file size scales up. |
| 10.30 | Neither raster option ticked. | Resolution selector is greyed out. |
| 10.39 | Mermaid — rasterize OFF. | Diagram embedded as SVG. |
| 10.40 | Mermaid — rasterize ON ("SVG images & Mermaid diagrams"). | Diagram replaced with PNG. |
| 10.41 | Invalid mermaid fence. | Source kept as preformatted code block. |

#### Frontmatter & Metadata

| Step | Action | Expected |
|------|--------|----------|
| 10.31 | Frontmatter: toggle OFF, export. | No frontmatter card in ODT. |
| 10.32 | Frontmatter: toggle ON. | Frontmatter card table appears in ODF body. |
| 10.33 | Frontmatter toggle OFF. | `meta.xml` still carries `<dc:title>` from frontmatter (`title`, or `name` for skill files) and `<dc:creator>` from `author` — not the filename. |

#### Content Fidelity (use `Rendering-All.md`)

| Step | Action | Expected |
|------|--------|----------|
| 10.34 | Export file with footnotes. | Rendered as ODF footnotes. |
| 10.35 | Export `Rendering-All.md`. | Local images embedded; remote fetched (or warning). |
| 10.36 | Export with unreachable remote image. | Warnings dialog lists the failed fetch. |
| 10.37 | Export file with `<sub>`, `<sup>`, `<kbd>`, `<mark>`. | Rendered as text spans with character styles. |
| 10.38 | Export file with GFM table. | Rendered as ODF table. |
| 10.43 | Change ODT rasterize/resolution, export, re-export later. | Last-used options are pre-selected. |

### 10e. Frontmatter Toggle — All Exporters

| Step | Action | Expected |
|------|--------|----------|
| 10.44 | For each exporter (HTML, HTML Bundle, PDF, ODT): export file with frontmatter. | "Include frontmatter card" toggle visible and ON. |
| 10.45 | For each exporter: export file without frontmatter. | Toggle greyed out (disabled). |
| 10.46 | For each exporter: toggle ON. | Frontmatter card present in output. |
| 10.47 | For each exporter: toggle OFF. | No frontmatter card in output. |
| 10.48 | For each exporter: set OFF, export, re-export. | Toggle stays OFF. |

---

## S11: Themes

*File: `Rendering-All.md` — open in viewer.*

| Step | Action | Expected |
|------|--------|----------|
| 11.1 | Click the theme button; click outside. | Dropdown opens and closes. |
| 11.2 | Select "GitHub Dark", then "GitHub Light". | Viewer, editor syntax, toolbar, status bar, borders change. |
| 11.3 | Open the dropdown. | Active row has accent background and "Dark"/"Light" badge. |
| 11.4 | Select each of the 9 built-in themes in sequence. | Each applies correctly; no glitches. |
| 11.5 | Select "Printer Friendly / Neutral". | Light theme with neutral syntax highlighting. |
| 11.6 | Place a `.css` file in the themes directory, restart. | Custom theme appears in dropdown. Select it — viewer and code use custom CSS. |
| 11.7 | Select a theme, close, reopen. | Same theme active. |
| 11.8 | Select a theme, set zoom to 70% (repeat with 125%), close, reopen. | The theme background applies to editor and viewer just like at 100% — not a generic dark/light background everywhere except the viewer's text area (startup regression: the `--viewer-bg` derivation raced the first render). |

---

## S12: Command Palette & About

*Any open file.*

| Step | Action | Expected |
|------|--------|----------|
| 12.1 | Press `Ctrl+Shift+P`. | Command palette opens. |
| 12.2 | Press Escape / click backdrop. | Palette closes. |
| 12.3 | Type "save". | Filters to matching commands. |
| 12.4 | Type "xyzabc". | "No matching commands". |
| 12.5 | Arrow up/down. | Selection moves, wraps. |
| 12.6 | Select "New File", press Enter. | New file created; palette closes. |
| 12.7 | Hover over commands. | Hovered item becomes selected. |
| 12.8 | Open palette. | Each command shows shortcut and category badges. |
| 12.9 | Type "export". | Lists Export as HTML, HTML Bundle, PDF, ODT. |
| 12.10 | Select an export command. | Same export flow as toolbar. |
| 12.11 | Press `F1` or click info icon. | About dialog opens. |
| 12.12 | Close via X / backdrop / Escape. | Dialog closes. |
| 12.13 | View About tab. | App info, author, license, documentation links. |
| 12.14 | Click Dependencies tab. | Table of third-party libraries. |
| 12.15 | Click Keyboard Shortcuts tab. | Lists all shortcuts including Quit. |
| 12.16 | Click License tab. | Full MIT license text. |
| 12.17 | Click "Check for Updates". | Shows status (checking, up-to-date, or available). |
| 12.18 | Click any link in About. | Opens in external browser. |

---

## S13: Quit Behavior & Edge Cases

| Step | Action | Expected |
|------|--------|----------|
| 13.1 | Close / `Ctrl+Q` / palette "Quit" with no changes. | App closes immediately. |
| 13.2 | Edit content, quit. | Dialog: "You have unsaved changes. Close the application and discard your changes?" with Cancel / Discard / Save First. |
| 13.3 | Click Cancel. | Window stays open. |
| 13.4 | Click Discard. | App closes, changes lost. |
| 13.5 | Click Save First (no filename). | Save-as; on save, app closes. |
| 13.6 | Click Save First (with filename). | File saved, app closes. |
| 13.7 | Click Save First, cancel Save-as. | Window stays open. |
| 13.8 | Resize window, quit, reopen. | Position and size restored. |
| 13.9 | Open `Large.md`. | Loads without freezing; scroll works. |
| 13.10 | Type fast for 30 seconds. | No lost characters; viewer catches up. |
| 13.11 | Open `MathChemMermaid-All.md`. | All features (math, chemistry, mermaid, tables, code) render together without conflicts. |
| 13.12 | Rapidly toggle view modes. | No crashes or glitches. |

---

## S14: Platform-Specific — PDF / Print

*File: `Rendering-All.md`*

### macOS

| Step | Action | Expected |
|------|--------|----------|
| 14.1 | Inspect viewer toolbar. | Dropdown has "Export as PDF"; no separate Print button. |
| 14.2 | Click "Export as PDF". | Native save dialog with `.pdf`, PDF filter. |
| 14.3 | Save and open in Preview. | Vector PDF, selectable text, one long page exactly A4-wide (210mm) with 10mm margins. |
| 14.4 | Trigger PDF export. | "Exporting…" overlay visible during build phase. |
| 14.5 | Export successfully. | Toast: "PDF saved" with path. |
| 14.6 | Trigger a failure (e.g. save to a read-only location like `/System/test.pdf`). | Toast: "Create PDF failed" with detail. |
| 14.18 | Compare with the Linux/Windows PDF of the same file (e.g. `MathChemMermaid-All.md`), both at 100% zoom. | Same physical content size and margins — no viewer zoom needed to match. |

### Linux & Windows

| Step | Action | Expected |
|------|--------|----------|
| 14.7 | Inspect viewer toolbar. | Dropdown has "Export as PDF (Print…)" + separate "Print / PDF" button. |
| 14.8 | Click "Print / PDF" (or `Ctrl+P`). | Native print dialog opens with styled content. |
| 14.9 | Choose "Save as PDF". | Vector PDF written, opens correctly. |
| 14.10 | Enable "Background graphics" if needed. | Background paints to paper edge (Chromium). |
| 14.11 | Pick a real printer, print. | Document prints with correct styling. |
| 14.12 | Trigger a failure (e.g. select a printer that is offline or disconnected, then print). | Toast: "Print failed" with detail. |
| 14.13 | Trigger PDF export. | Overlay may flash; print dialog confirms export started. |
| 14.21 | Export `MathChemMermaid-All.md` from Linux; inspect the Mermaid diagrams. | Node label text is the same size as in the Viewer (same line count, e.g. 3/4 lines, and no dead space below the label inside the boxes). |

### Common (all platforms)

| Step | Action | Expected |
|------|--------|----------|
| 14.14 | Compare long paragraphs in export vs viewer. | Line wrapping matches word-for-word. |
| 14.15 | Export `MathChemMermaid-All.md`. | Math and chemistry render correctly. |
| 14.16 | Export with dark theme. | Page background matches viewer (not white). |
| 14.17 | Cancel save / print dialog. | No file written. |
| 14.19 | Export `MathChemMermaid-All.md`; inspect the Mermaid diagrams. | Arrow heads on every edge, sequence diagram shows its actor boxes, labels the same size as in the Viewer (no giant, clipped, or truncated text). |
| 14.20 | Inspect the wide `fitToWidth=false` diagram. | Scaled to the page content width; every word of every node label visible. |

---

## S15: Zoom

*File: `MathChemMermaid-All.md` — open in split view.*

### 15a. Zoom Controls

| Step | Action | Expected |
|------|--------|----------|
| 15.1 | Press `Ctrl++` (or `Ctrl+=`) three times. | Everything scales up in steps — editor text, viewer text, toolbars, status bar; the zoom indicator in the status bar shows the new level (e.g. 125%). |
| 15.2 | Press `Ctrl+-` down to 70%. | Everything scales down; the editor↔viewer split handle stays easy to grab and drag (panes resize as usual). |
| 15.3 | Press `Ctrl+0`. | Back to exactly 100%. |
| 15.4 | Hold `Ctrl` and scroll the mouse wheel (pinch on a macOS trackpad). | Zoom steps in/out like the keyboard; plain two-finger scrolling still only scrolls. |
| 15.5 | Use the status bar zoom control (`−`, `+`, Reset). | Same steps as the shortcuts; the indicator always matches the actual zoom. The zoom popup never scrolls (fixed content) at any zoom level — its `−` / `+` buttons are always fully clickable, with no scrollbar over them. |
| 15.6 | Set zoom to ~150%, close the app, reopen. | Zoom level is restored (like the theme and current file). |

### 15b. Zoom with Math & Mermaid

| Step | Action | Expected |
|------|--------|----------|
| 15.7 | At 200%, look at "Block Dollar", "Matrices", and an inline formula. | Formulas scale proportionally with the surrounding text — no clipping, no mis-sized glyphs; inline math stays aligned on its line; the `fontsize=2` block is still 2× relative to base. |
| 15.8 | At 200%, look at the flowchart and the sequence diagram. | Diagrams scale uniformly with the content — labels, node boxes, and arrow heads stay proportional; no giant, clipped, or truncated labels; no dead space inside node boxes. |
| 15.9 | At 200%, scroll the "Very Wide Block" math and the `fitToWidth=false` diagram. | Both still scroll horizontally inside their blocks; the rest of the layout is unbroken. |
| 15.10 | At 70%, re-check 15.7–15.8. | Same proportions at small size; Mermaid label text is neither clipped nor scaled by hand — it grows/shrinks with the rest. |

### 15c. Zoom and Exports

| Step | Action | Expected |
|------|--------|----------|
| 15.11 | At 100% zoom, export PDF of `MathChemMermaid-All.md` and keep it. Set zoom to 200%, export again (macOS: Export as PDF; Linux/Windows: `Ctrl+P` / Export as PDF (Print…)). | The two PDFs are visually identical when compared at 100% in a PDF viewer: same physical content size and margins, the wide math formula scaled to the page content width in both, Mermaid labels the same size as in the viewer at 100% (as in 14.19–14.21). |
| 15.12 | At 200% zoom, export HTML and ODT. | Output is identical to exports made at 100% (open and compare); on-screen zoom does not leak into the files. |
| 15.13 | After each export completes. | The app is back at the zoom level set before the export — the export's temporary 100% does not persist. |

### 15d. Chrome & Menus at Extreme Zoom

| Step | Action | Expected |
|------|--------|----------|
| 15.14 | At 75% and 70% zoom (the minimum), look at the status bar. | Text is vertically centered and fully visible — no clipped lower halves, at any zoom step in between. |
| 15.15 | At 300% zoom, look at the status bar. | No text wraps ("UTF-8" stays on one line); the decorative "Markdown" / "UTF-8" labels drop out if space runs out, but the level button and zoom control stay visible and clickable. |
| 15.16 | At 300% zoom, open the "Export as…" menu and the theme dropdown (both in split view). | Each menu is fully inside the window — nothing cut at the left edge, and the lowest entries visible above the status bar (scrolling instead of hiding); every entry is reachable, the "Show export confirmation" footer checkbox stays visible while the list scrolls, and when scrolling is needed the scrollbar never covers the items. |
| 15.17 | At 300% zoom, open the status bar Compatibility popup. | The popup sits fully above the status bar and scrolls when needed; all four level options and every feature toggle are reachable, and the scrollbar never covers them. |
| 15.18 | At 300% zoom, edit a file and press `Ctrl+N` (unsaved-changes dialog). | The dialog fits or scrolls within the screen; Cancel / Discard / Save First are all reachable. |

### 15e. Math Baseline Alignment at Low Zoom

*File: `MathChemMermaid-All.md` — the "Matrices" (6.3) and "Cases" (6.4) formulas are the regression cases: relations/delimiters vs vlist-positioned rows.*

| Step | Action | Expected |
|------|--------|----------|
| 15.19 | At 85%, 80% and 70% zoom, look at "Matrices" and "Cases". | The parentheses, the brace and the `=` sign stay on the same line as the matrix entries / cases rows — nothing sits a line lower (was broken below 90% on Linux/macOS before the `.vlist-s` anchor fix). |
| 15.20 | At 70% zoom (the minimum), re-check 15.19, and compare with the same formulas in an exported HTML opened in Safari (Cmd+− below 90%). | Still aligned in the app — sub/superscripts may look slightly large at 70–80% (known engine font-size floor; see AGENTS.md) but nothing may be misaligned. The Safari check tells whether the engine still misplaces KaTeX baselines upstream of the app. |

### 15f. Mermaid Label Attachment at High Zoom

*File: `MathChemMermaid-All.md` — the sequence diagram (6.37) is the regression case: message labels vs their arrow lines.*

| Step | Action | Expected |
|------|--------|----------|
| 15.21 | At 150%, 200% and 300% zoom, look at the sequence diagram. | Every message label ("Hello Bob", …) stays closer to its own arrow than to the previous message's line (before the `dy` fix the label sat closer to the line *above* at 200%), and stays evenly placed between the lines as at 100%. |
| 15.22 | At 200% zoom, also check the actor boxes ("Alice", "Bob") and a flowchart (6.36). | Actor labels stay centred in their boxes; flowchart node labels, arrows and boxes stay proportional. |
| 15.23 | At 200% and 300% zoom, look at the "Gantt Chart", "Timeline" and "C4 Diagram" sections of `MathChemMermaid-All.md`. | Date/step/actor labels stay attached to their bars and marks — same em-offset regression class as 15.21. |
| 15.24 | At 200% and 300% zoom, look at the "Journey Diagram" and "Mindmap" sections. | Labels stay centred inside their shapes and boxes. Note: diagrams with fit-to-width stay the same physical size at high zoom (Mermaid's `useMaxWidth`) while surrounding text grows — by design. |
| 15.25 | At 200% and 300% zoom, look at the "Xychart (Bar Chart)" section. | The y-axis tick labels and the axis title stay visible and attached to their ticks (before the `translate` fix they collapsed to the top of the chart and vanished at 300%). |
| 15.26 | At 200% and 300% zoom, glance at the remaining "Mermaid — Diagram Types" sections (Class, State, ER, Pie, Quadrant, Sankey, Git Graph, Block). | All labels stay legible and attached to their shapes — nothing vanishes, drifts, or scales differently from its diagram. |

### 15g. Scroll Anchoring

| Step | Action | Expected |
|------|--------|----------|
| 15.27 | In split view, scroll the editor so one line sits at the vertical middle (e.g. around line 326 of `MathChemMermaid-All.md`); press `Ctrl++` step by step to 300%. | The same rendered line stays at the vertical middle at every step (the viewer keeps showing the matching content) — no visible jumping between steps. |
| 15.28 | Press `Ctrl+-` step by step to 70%, then `Ctrl+0`. Repeat once in editor-only mode and once in viewer-only mode. | Still anchored at every step, in all view modes. |

---

# Part 2 — Feature Reference

Each row lists a feature or sub-feature and the test story where it is
verified. Stories are identified by **S#** (e.g. **S5**); the step number
within each story gives the precise check.

| Feature | Sub-feature | Tested In |
|---------|-------------|-----------|
| About dialog | Open/close (F1, info icon) | **S12** (12.11–12.12) |
| About dialog | About tab content | **S12** (12.13) |
| About dialog | Dependencies tab | **S12** (12.14) |
| About dialog | Keyboard Shortcuts tab | **S12** (12.15) |
| About dialog | License tab | **S12** (12.16) |
| About dialog | Check for updates | **S12** (12.17) |
| About dialog | External links | **S12** (12.18) |
| Anchor links | Regular headings | **S5** (5.16) |
| Anchor links | Custom heading IDs `{#id}` | **S5** (5.15) |
| Anchor links | Special characters (CSS.escape) | **S5** (5.16) |
| Chemistry | Formulas (`\ce{}`) | **S6** (6.24) |
| Chemistry | Charges | **S6** (6.25) |
| Chemistry | Stoichiometric numbers | **S6** (6.26) |
| Chemistry | Reaction arrows (with annotations) | **S6** (6.27) |
| Chemistry | Isotopes | **S6** (6.28) |
| Chemistry | Bonds (single/double/triple) | **S6** (6.28) |
| Chemistry | States of aggregation | **S6** (6.29) |
| Chemistry | Physical units (`\pu{}`) | **S6** (6.30) |
| Chemistry | Inline in sentences | **S6** (6.31) |
| Chemistry | Block equations | **S6** (6.32) |
| Chemistry | Equilibrium with math | **S6** (6.33) |
| Chemistry | Bracket delimiters | **S6** (6.34) |
| Chemistry | Fenced ` ```math ` blocks | **S6** (6.35) |
| Code blocks | Syntax highlighting (7 languages) | **S5** (5.9) |
| Code blocks | Very long code block (scroll) | **S5** (5.10) |
| Command palette | Open/close | **S12** (12.1–12.2) |
| Command palette | Search/filter | **S12** (12.3–12.4) |
| Command palette | Keyboard navigation | **S12** (12.5) |
| Command palette | Execute command | **S12** (12.6) |
| Command palette | Mouse hover | **S12** (12.7) |
| Command palette | Shortcut/category badges | **S12** (12.8) |
| Command palette | Export commands | **S12** (12.9–12.10) |
| Compatibility levels | Default is Advanced | **S7** (7.1) |
| Compatibility levels | Level selector | **S7** (7.2) |
| Compatibility levels | Basic warnings | **S7** (7.3–7.5) |
| Compatibility levels | GitHub warnings | **S7** (7.6–7.7) |
| Compatibility levels | Advanced (no warnings) | **S7** (7.8) |
| Compatibility levels | Custom mode | **S7** (7.9) |
| Compatibility levels | Level persistence | **S7** (7.10) |
| Compatibility levels | Analysis debounce | **S7** (7.11) |
| Editor | Type text | **S3** (3.1) |
| Editor | Line numbers | **S3** (3.2) |
| Editor | Syntax highlighting | **S3** (3.3) |
| Editor | Cursor position (status bar) | **S3** (3.4) |
| Editor | Word count | **S3** (3.5–3.6) |
| Editor | Find (Ctrl+F) | **S3** (3.7–3.8) |
| Editor | Replace All (Replace field in search bar) | **S3** (3.9) |
| Editor | Format Document (Shift+Alt+F) | **S4** (4.30–4.31) |
| Editor | Focus retained after toolbar click | **S4** (4.18) |
| Editor toolbar | Bold | **S4** (4.1, 4.19) |
| Editor toolbar | Italic | **S4** (4.2–4.4, 4.20) |
| Editor toolbar | Strikethrough | **S4** (4.5, 4.21) |
| Editor toolbar | Highlight | **S4** (4.6, 4.22) |
| Editor toolbar | Heading (cycles) | **S4** (4.7, 4.23) |
| Editor toolbar | Link | **S4** (4.8, 4.24) |
| Editor toolbar | Image | **S4** (4.9, 4.25) |
| Editor toolbar | Code (toggle inline↔block) | **S4** (4.10–4.12, 4.26) |
| Editor toolbar | Bullet list | **S4** (4.13, 4.27) |
| Editor toolbar | Numbered list | **S4** (4.14, 4.28) |
| Editor toolbar | Task list | **S4** (4.15) |
| Editor toolbar | Blockquote | **S4** (4.16) |
| Editor toolbar | Horizontal rule | **S4** (4.17) |
| Encoding | UTF-8 BOM | **S8** (8.23) |
| Encoding | CRLF line endings | **S8** (8.24) |
| Encoding | ISO-8859-1 (Latin-1) | **S8** (8.25) |
| Encoding | Unicode filename | **S8** (8.26) |
| Encoding | Filename with spaces | **S8** (8.27) |
| Export | Confirm dialog (appearance) | **S10** (10.1–10.2) |
| Export | Confirm dialog (cancel/escape) | **S10** (10.3) |
| Export | Confirm dialog (confirm/enter) | **S10** (10.4) |
| Export | Don't show again | **S10** (10.5) |
| Export | Re-enable confirmation | **S10** (10.6) |
| Export | Frontmatter toggle — all exporters | **S10** (10.44–10.48) |
| Export HTML | Save dialog defaults | **S10** (10.7) |
| Export HTML | Standalone HTML | **S10** (10.8) |
| Export HTML | Theme applied | **S10** (10.9) |
| Export HTML | Local images inlined | **S10** (10.10) |
| Export HTML | Math rendered | **S10** (10.11) |
| Export HTML | Warnings (missing image) | **S10** (10.12) |
| Export HTML | Success/error toast | **S10** (10.13) |
| Export HTML | Cancel save | **S10** (10.14) |
| Export HTML Bundle | Save dialog defaults | **S10** (10.15) |
| Export HTML Bundle | Zip structure | **S10** (10.16) |
| Export HTML Bundle | Relative paths in HTML | **S10** (10.17) |
| Export HTML Bundle | Fonts extracted | **S10** (10.18) |
| Export HTML Bundle | Theme applied | **S10** (10.19) |
| Export HTML Bundle | Filename collisions | **S10** (10.20) |
| Export HTML Bundle | Math rendered | **S10** (10.21) |
| Export HTML Bundle | Success toast | **S10** (10.22) |
| Export ODT | Opens in LibreOffice | **S10** (10.24) |
| Export ODT | Math — native MathML | **S10** (10.25) |
| Export ODT | Math — rasterized PNG | **S10** (10.26) |
| Export ODT | SVG — vector | **S10** (10.27) |
| Export ODT | SVG — rasterized PNG | **S10** (10.28) |
| Export ODT | Resolution picker | **S10** (10.29–10.30) |
| Export ODT | Frontmatter card toggle | **S10** (10.31–10.33) |
| Export ODT | Footnotes | **S10** (10.34) |
| Export ODT | Local/remote images | **S10** (10.35) |
| Export ODT | Warnings summary | **S10** (10.36) |
| Export ODT | HTML element spans | **S10** (10.37) |
| Export ODT | Tables | **S10** (10.38) |
| Export ODT | Mermaid — vector | **S10** (10.39) |
| Export ODT | Mermaid — rasterized | **S10** (10.40) |
| Export ODT | Mermaid — failure fallback | **S10** (10.41) |
| Export ODT | Options persisted | **S10** (10.43) |
| Export PDF | Overlay (macOS) | **S14** (14.4) |
| Export PDF | Overlay (Linux/Win) | **S14** (14.13) |
| Export PDF | Line wrap matches viewer | **S14** (14.14) |
| Export PDF | Math renders | **S14** (14.15) |
| Export PDF | Full-bleed background | **S14** (14.16) |
| Export PDF | macOS — save dialog | **S14** (14.2) |
| Export PDF | macOS — vector PDF | **S14** (14.3) |
| Export PDF | macOS — success/error toast | **S14** (14.5–14.6) |
| Export PDF | macOS — A4 page scale matches other platforms | **S14** (14.18) |
| Export PDF | Mermaid diagrams intact (arrows, boxes, labels) | **S14** (14.19) |
| Export PDF | Mermaid label size matches viewer (Linux) | **S14** (14.21) |
| Export PDF | Mermaid wide diagram scaled to page | **S14** (14.20) |
| Export PDF | Linux/Win — print dialog | **S14** (14.8) |
| Export PDF | Linux/Win — save as PDF | **S14** (14.9) |
| Export PDF | Linux/Win — background margins | **S14** (14.10) |
| Export PDF | Linux/Win — direct print | **S14** (14.11) |
| Export PDF | Linux/Win — error toast | **S14** (14.12) |
| External modification | Modified (clean) | **S9** (9.1) |
| External modification | Modified (dirty) | **S9** (9.2) |
| External modification | Decline reload | **S9** (9.3) |
| External modification | Decline + save warns | **S9** (9.4) |
| External modification | Accept reload (clean) | **S9** (9.5) |
| External modification | Accept reload (dirty) | **S9** (9.6) |
| External modification | File deleted | **S9** (9.7) |
| External modification | Save after deletion | **S9** (9.8) |
| External modification | Save over modification | **S9** (9.9) |
| External modification | Reload + modification | **S9** (9.10) |
| External modification | Size-only change | **S9** (9.11) |
| External modification | Reload re-renders | **S9** (9.12) |
| File operations | Open file | **S8** (8.1) |
| File operations | Dialog filters | **S8** (8.2) |
| File operations | Save new (untitled) | **S8** (8.3) |
| File operations | Save existing | **S8** (8.4) |
| File operations | Save As — different path | **S8** (8.5) |
| File operations | Save As — existing file | **S8** (8.6) |
| File operations | Save As — read-only | **S8** (8.7) |
| File operations | Unsaved dialog — New | **S8** (8.8) |
| File operations | Unsaved dialog — Open | **S8** (8.9) |
| File operations | Unsaved dialog — Reload | **S8** (8.10) |
| File operations | Save First (untitled) | **S8** (8.11) |
| File operations | Save First (named) | **S8** (8.12) |
| File operations | Discard | **S8** (8.13) |
| File operations | Cancel | **S8** (8.14) |
| File operations | Reload from disk | **S8** (8.15) |
| File operations | Reload deleted file | **S8** (8.16) |
| File operations | Save after deletion | **S8** (8.17) |
| File operations | Modified indicator | **S8** (8.18) |
| File operations | Read-only indicator | **S8** (8.19) |
| File operations | Save read-only | **S8** (8.20) |
| File operations | Empty file | **S8** (8.21) |
| File operations | Large file | **S8** (8.22) |
| File operations | Toast on save failure | **S8** (8.28) |
| File operations | Toast on open failure | **S8** (8.29) |
| Layout | Default split view | **S2** (2.2) |
| Layout | Resize handle drag | **S2** (2.3) |
| Layout | Snap to viewer/editor | **S2** (2.4–2.5) |
| Layout | Snap to center / double-click | **S2** (2.6) |
| Layout | Handle visual feedback | **S2** (2.7) |
| Links | External URL | **S5** (5.17) |
| Links | Local file path | **S5** (5.18) |
| Links | Link tooltip on hover | **S5** (5.19) |
| Links | Keyboard activation (Tab + Enter) | **S5** (5.27) |
| Loading overlay | During file load | **S2** (2.1) |
| Math | Dollar inline `$…$` | **S6** (6.1) |
| Math | Dollar block `$$…$$` | **S6** (6.2) |
| Math | Matrices | **S6** (6.3) |
| Math | Cases | **S6** (6.4) |
| Math | Bracket inline `\(...\)` | **S6** (6.5) |
| Math | Bracket block `\[...\]` | **S6** (6.6) |
| Math | Bare `\begin{...}` | **S6** (6.7) |
| Math | Fenced ` ```math ` | **S6** (6.8) |
| Math | Anonymous fenced block (not math) | **S6** (6.8) |
| Math | Very wide block (scroll) | **S6** (6.9) |
| Math | Invalid LaTeX (error, no crash) | **S6** (6.10) |
| Math attributes | Fence: fontsize | **S6** (6.11) |
| Math attributes | Fence: leqno | **S6** (6.12) |
| Math attributes | Fence: fleqn | **S6** (6.13) |
| Math attributes | Fence: combined | **S6** (6.14) |
| Math attributes | Directive: fontsize | **S6** (6.15) |
| Math attributes | Directive: reset (`!key`) | **S6** (6.16) |
| Math attributes | Directive: leqno (persists) | **S6** (6.17) |
| Math attributes | Directive: reset leqno | **S6** (6.18) |
| Math attributes | Directive on bracket math | **S6** (6.19) |
| Math attributes | Multiple directives | **S6** (6.20) |
| Math attributes | Scoping (fence overrides directive) | **S6** (6.21) |
| Math attributes | Directive comment not rendered | **S6** (6.22) |
| Math attributes | Unknown namespace ignored | **S6** (6.23) |
| Mermaid | Basic flowchart | **S6** (6.36) |
| Mermaid | Sequence diagram | **S6** (6.37) |
| Mermaid | Error case (invalid syntax) | **S6** (6.38) |
| Mermaid | Fence: align + maxWidth | **S6** (6.39) |
| Mermaid | Fence: fitToWidth=false | **S6** (6.40) |
| Mermaid | HTML comment directives | **S6** (6.41) |
| Mermaid | Theme override (YAML) | **S6** (6.42) |
| Mermaid | Dark/light theme mapping | **S6** (6.43) |
| Print / PDF | macOS — toolbar label | **S14** (14.1) |
| Print / PDF | Linux/Win — toolbar labels | **S14** (14.7) |
| Print / PDF | Linux/Win — print dialog | **S14** (14.8) |
| Print / PDF | Cancel after dialog | **S14** (14.17) |
| Quit | No changes — immediate close | **S13** (13.1) |
| Quit | Unsaved changes dialog | **S13** (13.2) |
| Quit | Cancel | **S13** (13.3) |
| Quit | Discard | **S13** (13.4) |
| Quit | Save First (untitled) | **S13** (13.5) |
| Quit | Save First (named) | **S13** (13.6) |
| Quit | Save cancelled | **S13** (13.7) |
| Quit | Window state saved | **S13** (13.8) |
| Raw HTML | `<details>`/`<summary>` | **S5** (5.12) |
| Raw HTML | `<kbd>` | **S5** (5.12) |
| Raw HTML | `<sub>`, `<sup>` | **S5** (5.12) |
| Raw HTML | `<mark>` | **S5** (5.12) |
| Raw HTML | `<ins>`, `<del>` | **S5** (5.12) |
| Raw HTML | Colored `<span>` | **S5** (5.12) |
| Raw HTML | Special characters | **S5** (5.12) |
| Rendering | H1–H6 headings | **S5** (5.1) |
| Rendering | Paragraphs | **S5** (5.1) |
| Rendering | Bold, italic, bold-italic | **S5** (5.3) |
| Rendering | Strikethrough | **S5** (5.3) |
| Rendering | Inline code | **S5** (5.3) |
| Rendering | Highlight (`==…==`) | **S5** (5.3) |
| Rendering | Footnotes | **S5** (5.4) |
| Rendering | Lists (unordered, ordered, task) | **S5** (5.5) |
| Rendering | Deeply nested lists (6 levels) | **S5** (5.6) |
| Rendering | Blockquotes (nested) | **S5** (5.7) |
| Rendering | Blockquote with nested list | **S5** (5.7) |
| Rendering | Tables (aligned columns) | **S5** (5.8) |
| Rendering | Horizontal rule | **S5** (5.11) |
| Rendering | Custom heading IDs `{#id}` | **S5** (5.2) |
| Rendering | Frontmatter card (standard) | **S5** (5.13) |
| Rendering | Frontmatter card (skill) | **S5** (5.14) |
| Rendering — images | Local relative path | **S5** (5.20) |
| Rendering — images | HTML `<img>` tag | **S5** (5.20) |
| Rendering — images | Filename with spaces | **S5** (5.20) |
| Rendering — images | Unicode filename in subdir | **S5** (5.20) |
| Rendering — images | Remote image | **S5** (5.21) |
| Rendering — images | Reload re-renders | **S5** (5.22) |
| Rendering — images | Data URI | **S5** (5.23) |
| Rendering — images | Missing image (no crash) | **S5** (5.24) |
| Rendering — images | SVG from file | **S5** (5.25) |
| Rendering — images | Inline SVG | **S5** (5.25) |
| Rendering — images | Image tooltip on hover | **S5** (5.26) |
| Scroll sync | Editor↔Viewer | **S2** (2.9–2.10) |
| Scroll sync | Rapid scrolling | **S2** (2.11) |
| Scroll sync | Single view disables sync | **S2** (2.12–2.13) |
| Themes | Open/close dropdown | **S11** (11.1) |
| Themes | Switch dark/light | **S11** (11.2) |
| Themes | App chrome follows | **S11** (11.2) |
| Themes | Active highlight + badge | **S11** (11.3) |
| Themes | All 9 built-in themes | **S11** (11.4) |
| Themes | Printer Friendly | **S11** (11.5) |
| Themes | Custom theme | **S11** (11.6) |
| Themes | Persistence | **S11** (11.7) |
| Themes | Background at startup with zoom | **S11** (11.8) |
| View toggle | Editor / Split / Viewer | **S2** (2.8) |
| View toggle | Active state highlight | **S2** (2.8) |
| View toggle | Persistence | **S2** (2.14) |
| Window | First launch (size, title) | **S1** (1.1) |
| Window | Minimum size | **S1** (1.2) |
| Window | State persistence | **S1** (1.3) |
| Window | Maximized persistence | **S1** (1.4) |
| Window | Context menu suppression | **S1** (1.5) |
| Window | CLI file open | **S1** (1.6) |
| Window | Restore last file | **S1** (1.7) |
| Zoom | Keyboard shortcuts (`Ctrl++`, `Ctrl+-`, `Ctrl+0`) | **S15** (15.1–15.3) |
| Zoom | Mouse wheel / trackpad pinch | **S15** (15.4) |
| Zoom | Status bar control | **S15** (15.5) |
| Zoom | Persistence | **S15** (15.6) |
| Zoom | Split handle usable at low zoom | **S15** (15.2) |
| Zoom | Math scales proportionally | **S15** (15.7) |
| Zoom | Mermaid diagrams scale cleanly | **S15** (15.8, 15.10) |
| Zoom | Wide math / diagram still scrolls | **S15** (15.9) |
| Zoom | Math baseline alignment at low zoom | **S15** (15.19–15.20) |
| Zoom | Mermaid labels stay attached to their line | **S15** (15.21–15.22) |
| Zoom | Mermaid em-offset families (gantt/timeline/c4) | **S15** (15.23) |
| Zoom | Mermaid HTML-label families (journey/mindmap) | **S15** (15.24) |
| Zoom | Mermaid translate-positioned labels (xychart) | **S15** (15.25) |
| Zoom | Mermaid remaining diagram types | **S15** (15.26) |
| Zoom | Scroll anchor preserved while zooming | **S15** (15.27–15.28) |
| Zoom | Status bar legibility at extreme zoom | **S15** (15.14–15.15) |
| Zoom | Menus scroll at high zoom (Export as…, theme) | **S15** (15.16) |
| Zoom | Compatibility popup scrolls at high zoom | **S15** (15.17) |
| Zoom | Dialogs usable at high zoom | **S15** (15.18) |
| Zoom | PDF export unaffected | **S15** (15.11) |
| Zoom | HTML/ODT export unaffected | **S15** (15.12) |
| Zoom | Zoom restored after export | **S15** (15.13) |
| Edge cases | Very large file | **S13** (13.9) |
| Edge cases | Rapid typing | **S13** (13.10) |
| Edge cases | Mixed content stress test (`MathChemMermaid-All.md`) | **S13** (13.11) |
| Edge cases | View mode switching | **S13** (13.12) |