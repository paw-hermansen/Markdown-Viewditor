# Markdown Viewditor — Manual Test Plan

## Test Environment Setup

- Build & launch: `npm run tauri dev` (or install a built binary)
- Markdown files in folder `examples` have all the required content for the
  tests (chemistry/math samples, BOM / CRLF / Latin-1 / Unicode files, an
  SVG, local PNG images in `examples/image/`).
- Tests marked **macOS**/**Linux&Windows** apply only to that platform;
  unmarked tests are platform-independent.

> Notation:
>
> - `Ctrl` below stands for `Cmd` on macOS and `Ctrl` on Linux/Windows.
> - GFM: **G**ithub **F**lavored **M**arkdown

---

## 1. Application Launch & Window

| #   | Test                     | Steps                                       | Expected                                             |
| --- | ------------------------ | ------------------------------------------- | ---------------------------------------------------- |
| 1.1 | First launch             | Start the app                               | Window opens at 1200×800, title "Markdown Viewditor" |
| 1.2 | Minimum size             | Resize window below 800×600                 | Window clamps at 800×600                             |
| 1.3 | Window state persistence | Move/resize window, close, reopen           | Position and size restored                           |
| 1.4 | Maximized persistence    | Maximize, close, reopen                     | Opens maximized                                      |
| 1.5 | CLI file open            | Launch with `markdown-viewditor myfile.md`  | File opens automatically                             |
| 1.6 | Restore last file        | Open a file, close app, reopen without args | Same file opens                                      |

---

## 2. Layout & Split Pane

| #   | Test                          | Steps                                               | Expected                                      |
| --- | ----------------------------- | --------------------------------------------------- | --------------------------------------------- |
| 2.1 | Default layout                | Launch app                                          | Split view: editor left, viewer right, ~50/50 |
| 2.2 | Resize handle drag            | Drag the center divider left/right                  | Pane ratio changes, panes resize              |
| 2.3 | Snap to viewer / editor       | Drag handle to far left (<5%) / far right (>95%)    | Switches to viewer-only / editor-only mode    |
| 2.4 | Snap to center & double-click | Drag handle within 2.5% of 50% (or double-click it) | Snaps / resets to exactly 50% split           |
| 2.5 | Handle visual feedback        | Hover/drag the handle                               | Handle turns accent color                     |
| 2.6 | Context menu suppression      | Right-click anywhere in the app                     | No native context menu appears                |

---

## 3. View Toggle

| #   | Test                    | Steps                               | Expected                            |
| --- | ----------------------- | ----------------------------------- | ----------------------------------- |
| 3.1 | Editor / Split / Viewer | Click "Edit"/"Split"/"View" buttons | Only the selected pane(s) visible   |
| 3.2 | Active state highlight  | Switch modes                        | Active button has accent background |
| 3.3 | Persistence             | Set to "Editor", close, reopen      | Restores "Editor" mode              |

---

## 4. Editor

| #   | Test                          | Steps                                                 | Expected                                    |
| --- | ----------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| 4.1 | Type text                     | Click in editor, type `Hello World`                   | Text appears, cursor moves                  |
| 4.2 | Line numbers                  | Look at left gutter                                   | Line numbers displayed                      |
| 4.3 | Syntax highlighting           | Type markdown (`# Heading`, `**bold**`, `` `code` ``) | Markdown syntax is color-highlighted        |
| 4.4 | Cursor position in status bar | Click at different positions                          | Status bar shows correct `Line X, Col Y`    |
| 4.5 | Word count                    | Type several words / clear all content                | Status bar word count updates; 0 when empty |

---

## 5. Editor Toolbar — Formatting Buttons

For each: select text, click the toolbar button, verify markdown output in the
editor and rendered output in the viewer.

| #    | Test                  | Button           | Verify                                                  |
| ---- | --------------------- | ---------------- | ------------------------------------------------------- |
| 5.1  | Bold                  | `B`              | Wraps in `**...**`, viewer shows **bold**               |
| 5.2  | Italic                | `I`              | Wraps in `*...*`, viewer shows _italic_                 |
| 5.3  | Strikethrough         | ~~S~~            | Wraps in `~~...~~`, viewer shows ~~strikethrough~~      |
| 5.4  | Highlight             | <mark>M</mark>   | Wraps in `==...==`, viewer shows ==highlight==          |
| 5.5  | Heading (cycles)      | **H**            | Adds `## `; cycles H2→H3→H4→H5→H6→plain                 |
| 5.6  | Link                  | chain icon       | Inserts `[text](url)`                                   |
| 5.7  | Image                 | picture icon     | Inserts `![alt](url)`                                   |
| 5.8  | Code (toggle)         | `</>`            | Wraps in `` ` ` `` (inline); toggles to ` ``` ` (block) |
| 5.9  | Bullet List           | bullet           | Adds `- ` prefix                                        |
| 5.10 | Numbered List         | `1.`             | Adds `1. ` prefix                                       |
| 5.11 | Task List             | checkbox         | Adds `- [ ] ` prefix                                    |
| 5.12 | Blockquote            | quote            | Adds `> ` prefix                                        |
| 5.13 | Horizontal Rule       | em-dash          | Inserts `\n---\n`                                       |
| 5.14 | Editor focus retained | Click any button | Editor does not lose focus                              |

### Bold/Italic Toggle Detail

1. Select text, click Bold → `**text**`
2. Click Italic → `***text***` (bold-italic)
3. Click Italic again → `**text**` (back to bold only)
4. Select plain text, click Italic → `*text*`; click again → plain text

### Code Toggle Detail

1. Select text, click `</>` → `` `text` `` (inline code)
2. Click `</>` again → ` ```\ntext\n``` ` (code block, with newline before fences)
3. Click `</>` again → `` `text` `` (back to inline code)
4. With cursor mid-line, toggling to code block adds `\n` before ` ``` `
5. With empty line before code block, toggling back preserves the empty line

---

## 6. Keyboard Shortcuts

### 6.1 File & App Shortcuts

| #   | Test            | Shortcut       | Expected                                    |
| --- | --------------- | -------------- | ------------------------------------------- |
| 6.1 | New file        | `Ctrl+N`       | Creates new empty file (prompts if unsaved) |
| 6.2 | Open file       | `Ctrl+O`       | Opens file dialog                           |
| 6.3 | Save            | `Ctrl+S`       | Saves current file                          |
| 6.4 | Save As         | `Ctrl+Shift+S` | Opens save-as dialog                        |
| 6.5 | Reload          | `Ctrl+R`       | Reloads file from disk                      |
| 6.6 | Quit            | `Ctrl+Q`       | Quits app (prompts if unsaved, saves state) |
| 6.7 | Command palette | `Ctrl+Shift+P` | Opens command palette                       |
| 6.8 | Print           | `Ctrl+P`       | Opens print dialog (see §13)                |
| 6.9 | About           | `F1`           | Opens About dialog                          |

### 6.2 Editor Formatting Shortcuts

| #    | Test             | Shortcut       | Expected                                               |
| ---- | ---------------- | -------------- | ------------------------------------------------------ |
| 6.10 | Bold             | `Ctrl+B`       | Toggles `**bold**`                                     |
| 6.11 | Italic           | `Ctrl+I`       | Toggles `*italic*`                                     |
| 6.12 | Strikethrough    | `Ctrl+Shift+X` | Toggles `~~strikethrough~~`                            |
| 6.13 | Highlight        | `Ctrl+Shift+M` | Toggles `==highlight==`                                |
| 6.14 | Heading (cycles) | `Ctrl+Shift+H` | Adds `## `; cycles H2→H3→…→H6→plain                    |
| 6.15 | Insert link      | `Ctrl+K`       | Inserts `[text](url)`                                  |
| 6.16 | Insert image     | `Ctrl+Shift+I` | Inserts `![alt](url)`                                  |
| 6.17 | Code (toggle)    | `Ctrl+E`       | Toggles `` `inline code` `` ↔ ` ```\ncode block\n``` ` |
| 6.18 | Bullet list      | `Ctrl+Shift+8` | Adds `- ` prefix                                       |
| 6.19 | Numbered list    | `Ctrl+Shift+7` | Adds `1. ` prefix                                      |

### 6.3 View Shortcuts

| #    | Test            | Shortcut       | Expected                                |
| ---- | --------------- | -------------- | --------------------------------------- |
| 6.21 | Cycle view mode | `Ctrl+Shift+V` | Cycles editor → split → viewer → editor |

---

## 7. File Operations

### Test Files

Use these files from `examples/`:

| File                   | Purpose                                 |
| ---------------------- | --------------------------------------- |
| `Simple.md`            | Standard UTF-8, basic markdown features |
| `Empty.md`             | Zero-content file                       |
| `Large.md`             | ~5800 lines, performance testing        |
| `BOM_Simple.md`        | UTF-8 with Byte Order Mark              |
| `CRLF_Simple.md`       | Windows-style CRLF line endings         |
| `ISO8859-1_Simple.md`  | ISO-8859-1 (Latin-1) encoding           |
| `简单.md`              | Unicode (CJK) filename                  |
| `Space Simple.md`      | Filename with spaces                    |
| `Math-Example.md`      | Math formulas (KaTeX)                   |
| `Chemistry-Example.md` | Chemistry formulas (mhchem)             |

### Test Steps

| #    | Test                           | Steps                                                                                           | Expected                                                                                                                                                                          |
| ---- | ------------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1  | Open file                      | Click Open, select `examples/Simple.md`                                                         | Content loads into editor, viewer renders it; filename shown in toolbar                                                                                                           |
| 7.2  | Open dialog filters            | Open dialog                                                                                     | Shows "Markdown" and "All Files" filters                                                                                                                                          |
| 7.3  | Cancel open / save-as dialog   | Open any dialog, click Cancel                                                                   | No change to current content                                                                                                                                                      |
| 7.4  | Save new (untitled) file       | With "Untitled" file, click Save                                                                | Save-as dialog appears                                                                                                                                                            |
| 7.5  | Save existing file             | Open `examples/Simple.md`, edit content, click Save                                             | File saved, `*` indicator disappears, `.bak` backup created in same directory                                                                                                     |
| 7.6  | Save As same path              | Save As to the current file's path                                                              | If externally modified, overwrite prompt: "This file has been modified by another application since it was last saved. Overwrite the external changes?"; otherwise saves directly |
| 7.7  | Save As different path         | Save As to a new location (e.g. `/tmp/test-save.md`)                                            | New file created, app tracks new path                                                                                                                                             |
| 7.8  | Save As to existing file       | Save As to a file that already exists (e.g. `examples/Empty.md`)                                | OS native overwrite confirmation appears; on confirm, file is replaced (no second app dialog)                                                                                     |
| 7.9  | Save As to read-only file      | Create a read-only file (`chmod 444 /tmp/readonly.md`), Save As to it                           | Toast error: `"This file is read-only. Use Save As to save your work to a different location."`                                                                                   |
| 7.10 | Unsaved-change dialog — New    | Edit content, click New (toolbar or `Ctrl+N`)                                                   | Dialog: `"You have unsaved changes. Create a new file?"` with Cancel / Yes, And Discard My Changes / Save First                                                                   |
| 7.11 | Unsaved-change dialog — Open   | Edit content, click Open (`Ctrl+O`)                                                             | Dialog: `"You have unsaved changes. Open a different file?"` with same three buttons                                                                                              |
| 7.12 | Unsaved-change dialog — Reload | Edit content, click Reload (`Ctrl+R`)                                                           | Dialog: `"You have unsaved changes. Reload from disk and discard your changes?"` with Cancel / Yes, Discard My Changes                                                            |
| 7.13 | Dialog — Save First (untitled) | In 3-button dialog, click Save First                                                            | Save-as dialog appears; on save editor clears to "Untitled"                                                                                                                       |
| 7.14 | Dialog — Save First (named)    | Open `examples/Simple.md`, edit, trigger dialog, click Save First                               | File saved (no clear), action proceeds                                                                                                                                            |
| 7.15 | Dialog — Discard               | In 3-button dialog, click Yes, And Discard My Changes                                           | Editor clears (only for New), action proceeds, changes lost                                                                                                                       |
| 7.16 | Dialog — Cancel                | In 3-button dialog, click Cancel                                                                | No change to editor content or current file                                                                                                                                       |
| 7.17 | Reload from disk               | Open `examples/Simple.md`, edit externally, click Reload with no local edits                    | Content updates from disk                                                                                                                                                         |
| 7.18 | Reload always reloads          | Open `examples/Example.md`, note the external image (`https://picsum.photos/128`), click Reload | Viewer re-renders; external image shows a new random photo (reload is never skipped)                                                                                              |
| 7.19 | Reload deleted file            | Open a temp file, delete it externally, click Reload                                            | Dialog: `"This file no longer exists on disk (it may have been deleted or moved). Use Save As to save your work to a new location."` with OK button                               |
| 7.20 | File name display              | Open `examples/Simple.md`                                                                       | "Simple.md" shown in toolbar                                                                                                                                                      |
| 7.21 | Modified indicator             | Edit content                                                                                    | `*` appears after filename in toolbar; dot appears on Save button                                                                                                                 |
| 7.22 | Read-only indicator            | Open a read-only file (`chmod 444`)                                                             | 🔒 icon appears next to filename in toolbar with tooltip "Read-only"                                                                                                              |
| 7.23 | Save read-only file            | Open a read-only file, edit, click Save                                                         | Toast error: `"This file is read-only. Use Save As to save your work to a different location."`                                                                                   |
| 7.24 | .bak backup created            | Open `examples/Simple.md`, edit, save, check directory                                          | `Simple.md.bak` contains the previous content                                                                                                                                     |
| 7.25 | Encoding — UTF-8 BOM           | Open `examples/BOM_Simple.md`                                                                   | Content reads correctly, no BOM artifact in editor, no garbled characters                                                                                                         |
| 7.26 | Encoding — CRLF                | Open `examples/CRLF_Simple.md`                                                                  | Content reads correctly, no `^M` artifacts, renders normally                                                                                                                      |
| 7.27 | Encoding — Latin-1             | Open `examples/ISO8859-1_Simple.md`                                                             | Decoded losslessly (Æ Ø Å visible), no crash or garbled text                                                                                                                      |
| 7.28 | Encoding — Unicode filename    | Open `examples/简单.md`                                                                         | Opens correctly, filename displays in toolbar                                                                                                                                     |
| 7.29 | Filename with spaces           | Open `examples/Space Simple.md`                                                                 | Opens correctly, saves correctly                                                                                                                                                  |
| 7.30 | Empty file                     | Open `examples/Empty.md`                                                                        | Viewer empty, word count 0, no crash                                                                                                                                              |
| 7.31 | Toast on save failure          | Save to a path that fails (e.g. read-only directory)                                            | Toast error: `"Failed to save the file."` with detail message                                                                                                                     |
| 7.32 | Toast on open failure          | Open a file that fails (e.g. permission denied)                                                 | Toast error: `"Failed to open the file."` with detail message                                                                                                                     |
| 7.33 | Externally modified indicator  | Open file, edit in another editor, focus app but decline reload                                 | ⚠ icon appears next to filename in toolbar with tooltip "Externally modified"                                                                                                     |

---

## 8. External Modification Detection

### Test Files

Create a temporary file for these tests (e.g. `/tmp/ext-test.md`) with some
markdown content. Use a second editor (e.g. `nano`, `vim`, or another instance
of the app) to modify the file externally.

### Test Steps

| #    | Test                              | Steps                                                                                  | Expected                                                                                                                                                                      |
| ---- | --------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1  | Modified externally (clean)       | Open `/tmp/ext-test.md`, edit in another editor, focus app                             | Dialog: `"This file has been modified by another application. Do you want to reload it?"` with Cancel / Reload buttons                                                        |
| 8.2  | Modified externally (dirty)       | Open `/tmp/ext-test.md`, edit in app, edit externally, focus app                       | Dialog: `"This file has been modified by another application. You also have unsaved changes. Reload and discard your changes?"` with Cancel / Yes, Discard My Changes buttons |
| 8.3  | Decline reload aftermath          | Decline reload prompt (click Cancel)                                                   | ⚠ icon appears on filename in toolbar (tooltip "Externally modified"); no re-prompt on later focuses until file changes again                                                 |
| 8.4  | Decline reload — Save still warns | Decline reload, then `Ctrl+S`                                                          | Dialog: `"This file has been modified by another application since it was last saved. Overwrite the external changes?"` with Cancel / Overwrite External Changes buttons      |
| 8.5  | Accept reload (clean)             | With no local edits, accept reload prompt (click Reload)                               | Content updates from disk, ⚠ clears, baseline reset                                                                                                                           |
| 8.6  | Accept reload (dirty)             | With local edits, accept reload prompt (click Yes, Discard My Changes)                 | Content updates from disk, ⚠ clears, local edits lost, baseline reset                                                                                                         |
| 8.7  | File deleted externally           | Open `/tmp/ext-test.md`, delete it externally (`rm /tmp/ext-test.md`), focus app       | Dialog: `"This file no longer exists on disk (it may have been deleted or moved). Use Save As to save your work to a new location."` with OK button                           |
| 8.8  | Save after external deletion      | After deletion warning, press `Ctrl+S`                                                 | Save As dialog appears (does not recreate at old path)                                                                                                                        |
| 8.9  | Save over external modification   | Open file, modify externally, press `Ctrl+S`                                           | Dialog: `"This file has been modified by another application since it was last saved. Overwrite the external changes?"` with Cancel / Overwrite External Changes buttons      |
| 8.10 | Reload with external modification | Modify externally, press `Ctrl+R`                                                      | If dirty: dialog `"You have unsaved changes. Reload from disk and discard your changes?"`; else reloads content silently                                                      |
| 8.11 | Size-only change detected         | Edit file externally without changing mtime (e.g. `echo x >> file; touch -r ref file`) | ⚠ appears on next focus (mtime OR size comparison)                                                                                                                            |
| 8.12 | Reload always re-renders          | Open file, no external changes, press `Ctrl+R`                                         | Content reloads from disk; viewer re-renders (no toast)                                                                                                                       |

---

## 9. Viewer — Markdown Rendering

Create a test file with all supported features and verify each renders
correctly:

| #    | Feature                     | Syntax                                             | Verify                                   |
| ---- | --------------------------- | -------------------------------------------------- | ---------------------------------------- |
| 9.1  | H1–H6                       | `# ` through `###### `                             | Styled headings of decreasing size       |
| 9.2  | Paragraphs                  | Text with blank lines                              | Separate paragraphs                      |
| 9.3  | Inline emphasis             | `**bold**`, `*italic*`, `~~strike~~`, `` `code` `` | Bold, italic, strikethrough, inline code |
| 9.4  | Fenced code blocks          | ` ```js ... ``` `                                  | Syntax-highlighted code block            |
| 9.5  | Blockquotes                 | `> text`                                           | Indented quote block                     |
| 9.6  | Lists                       | `- item` / `1. item` / `- [ ] task` / `- [x] done` | Bullets, numbers, checkboxes             |
| 9.7  | Tables                      | GFM pipe tables                                    | Rendered table with borders              |
| 9.8  | Links / Autolinks           | `[text](url)` / `https://example.com`              | Clickable links                          |
| 9.9  | Images                      | `![alt](src)`                                      | Image displayed                          |
| 9.10 | Horizontal rules            | `---`                                              | Horizontal line                          |
| 9.11 | Footnotes                   | `[^1]` and `[^1]: def`                             | Footnote links and definitions           |
| 9.12 | Raw HTML                    | `<details>`, `<kbd>`, `<mark>`, `<sub>`, `<sup>`   | HTML rendered correctly                  |
| 9.13 | YAML frontmatter (standard) | `---\nkey: value\n---`                             | "Frontmatter" card with key-value grid   |
| 9.14 | YAML frontmatter (skill)    | `---\nname: ...\ndescription: ...\n---`            | "Skill" card with badge and metadata     |

---

## 10. Viewer — Code Syntax Highlighting

Add fenced code blocks for each language and verify highlighting in the viewer.

| #    | Test       | Languages                                          |
| ---- | ---------- | -------------------------------------------------- |
| 10.1 | Multi-lang | JavaScript, Python, HTML/XML, CSS, SQL, JSON, Bash |

For each: keywords, strings, comments / tags / properties / values are
highlighted with the active theme's colors.

---

## 11. Viewer — Link Navigation

| #    | Test                      | Steps                            | Expected                           |
| ---- | ------------------------- | -------------------------------- | ---------------------------------- |
| 11.1 | External URL link         | Click `https://example.com` link | Opens in external browser          |
| 11.2 | Anchor link               | Click `#section` link            | Viewer scrolls to matching heading |
| 11.3 | Anchor with special chars | Use anchor with spaces/symbols   | Scrolls correctly (CSS.escape)     |
| 11.4 | Local file path link      | Click link to local file         | Opens with OS default handler      |
| 11.5 | Keyboard link activation  | Tab to a link, press Enter       | Same behavior as click             |

---

## 12. Viewer — Local Images

| #    | Test              | Steps                                       | Expected                             |
| ---- | ----------------- | ------------------------------------------- | ------------------------------------ |
| 12.1 | Relative paths    | `![](./image.png)` etc.                     | Image renders (incl. subdirs)        |
| 12.2 | Path edge cases   | Paths with spaces / unicode / `./图片.png`  | Image renders correctly              |
| 12.3 | HTML img tag      | `<img src="./local.png">`                   | Image renders                        |
| 12.4 | Remote / data URI | `https://...` / `data:image/png;base64,...` | Loads from internet / renders inline |
| 12.5 | Missing image     | `![](./nonexistent.png)`                    | Broken image, no crash               |

---

## 13. Export & Print

The viewer toolbar exposes:

- an **Export as…** dropdown (with HTML, HTML Bundle, PDF, and ODT exporters),
- a **Print / PDF** button (Linux & Windows only — macOS routes PDF through
  the dropdown as "Export as PDF").

> There is an "Export / Print" confirmation dialog (governed by the
> "Show export confirmation" checkbox inside the dropdown footer). With it
> enabled each export/print first shows the dialog; with "Do not show this
> message again" ticked it is skipped thereafter.

### Test Files

| File                            | Purpose                                       |
| ------------------------------- | --------------------------------------------- |
| `examples/Simple.md`            | Basic markdown, YAML frontmatter              |
| `examples/Example.md`           | Comprehensive: images, SVG, all HTML elements |
| `examples/Math-Example.md`      | KaTeX math formulas                           |
| `examples/Chemistry-Example.md` | mhchem chemistry formulas                     |
| `examples/weird.svg`            | SVG file for ODT rasterization tests          |

### 13.1 Export Confirm Dialog

Reset by un-checking "Show export confirmation" / "Do not show again"
before each row.

| #    | Test                              | Steps                                                      | Expected                                                                                                                                                                                                                                |
| ---- | --------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13.1 | Dialog appearance (viewer theme)  | With confirmation ON, click HTML/HTML Bundle/PDF export    | Title: "Export HTML" / "Export HTML Bundle" / "Export / Print"; message: "Exports use the current viewer theme." / "Exports and prints use the current viewer theme."; shows "Current theme: {name}"; hint about Printer Friendly theme |
| 13.2 | Dialog appearance (neutral / ODT) | With confirmation ON, click "Export as ODT"                | Title: "Export" / "Export / Print"; message: "This export always uses a neutral, printer-friendly style."; no theme line; shows ODT options (math rasterize, SVG rasterize, resolution)                                                 |
| 13.3 | Cancel via Cancel button          | Click Cancel                                               | No export runs, dialog closes                                                                                                                                                                                                           |
| 13.4 | Cancel via Escape / backdrop      | Press Escape / click backdrop                              | No export runs, dialog closes                                                                                                                                                                                                           |
| 13.5 | Confirm via Enter                 | Press Enter                                                | Export runs                                                                                                                                                                                                                             |
| 13.6 | Don't show again                  | Tick "Do not show this message again", confirm             | Next export runs without the dialog                                                                                                                                                                                                     |
| 13.7 | Re-enable confirmation            | Untick "Show export confirmation" in dropdown footer       | Dialog reappears next export                                                                                                                                                                                                            |
| 13.8 | Options persisted (ODT)           | ODT: change rasterize/resolution, confirm, re-export later | Last-used options are pre-selected                                                                                                                                                                                                      |

### 13.2 Export as HTML

| #     | Test                     | Steps                                            | Expected                                              |
| ----- | ------------------------ | ------------------------------------------------ | ----------------------------------------------------- |
| 13.9  | Save dialog defaults     | Open `examples/Simple.md`, choose Export as HTML | Save dialog opens with `Simple.html`, HTML filter     |
| 13.10 | Standalone HTML produced | Save and open the file in a browser              | Self-contained page renders identically to the viewer |
| 13.11 | Theme applied            | Repeat with a dark theme active                  | Output uses the same theme                            |
| 13.12 | Local images inlined     | Export `examples/Example.md`                     | Relative/local images embedded as data URIs           |
| 13.13 | Cancel save              | Cancel the save dialog                           | No file written, no toast                             |
| 13.14 | Math rendered            | Export `examples/Math-Example.md`                | KaTeX formulas render from the inlined CSS            |
| 13.15 | Warnings surface         | Export a file referencing a missing local image  | "Export Warnings" dialog lists the failed image       |
| 13.16 | Success toast            | Export successfully                              | Toast: "Exported" with the saved file path            |
| 13.17 | Error toast              | Trigger an export failure                        | Toast: "Export failed" with detail message            |

### 13.3 Export as HTML Bundle

The HTML Bundle exporter produces a `.zip` containing `index.html` with
images stored in an `images/` folder and fonts in a `fonts/` folder,
referenced via relative paths. The result can be unpacked and served from
any static host.

| #     | Test                      | Steps                                                   | Expected                                                                 |
| ----- | ------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| 13.18 | Save dialog defaults      | Open `examples/Simple.md`, choose Export as HTML Bundle | Save dialog opens with `Simple.zip`, ZIP filter                          |
| 13.19 | Zip structure             | Save and extract the zip                                | Contains `index.html`, `images/` folder, `fonts/` folder                 |
| 13.20 | HTML uses relative paths  | Open `index.html` in a browser                          | Page renders identically to the viewer; image srcs point to `images/...` |
| 13.21 | Fonts extracted           | Check `fonts/` folder in the zip                        | Contains KaTeX `.woff2` font files                                       |
| 13.22 | Theme applied             | Repeat with a dark theme active                         | Output uses the same theme                                               |
| 13.23 | Local images extracted    | Export `examples/Example.md`                            | `images/` folder contains the local image files                          |
| 13.24 | Image filename collisions | Export a file with two images sharing a basename        | Both present: `logo.png` and `logo-1.png`                                |
| 13.25 | Cancel save               | Cancel the save dialog                                  | No file written, no toast                                                |
| 13.26 | Math rendered             | Export `examples/Math-Example.md`                       | KaTeX formulas render from the extracted fonts in `fonts/`               |
| 13.27 | Warnings surface          | Export a file referencing a missing local image         | "Export Warnings" dialog lists the failed image                          |
| 13.28 | Success toast             | Export successfully                                     | Toast: "Exported" with the saved file path                               |
| 13.29 | Error toast               | Trigger an export failure                               | Toast: "Export failed" with detail message                               |

### 13.4 Export as PDF / Print

The PDF exporter shares the in-app print path. The mechanism is
platform-specific — split tests below.

#### Common (Print container & fidelity)

> **Note (Linux & Windows):** The export overlay ("Exporting…") is shown
> during the build phase (font loading, layout settling) but is hidden by
> CSS (`body.exporting .backdrop { display: none }`) right before
> `window.print()` opens the native print dialog. On Linux/Windows this
> transition is nearly instantaneous — the overlay may flash and disappear
> too fast to notice. This is expected; the overlay is only clearly visible
> on macOS where the save dialog + async WKWebView capture takes longer.

| #     | Test                        | Steps                                                      | Expected                                                                                  |
| ----- | --------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 13.30 | Export overlay (macOS)      | On macOS, trigger PDF export                               | Modal overlay with "Exporting…" spinner visible during build phase                        |
| 13.31 | Export overlay (Linux/Win)  | On Linux/Windows, trigger PDF export                       | Overlay may flash too fast to see; the print dialog appearing confirms the export started |
| 13.32 | Overlay postrun             | Wait for export to finish                                  | Overlay disappears (if visible), original viewer visible                                  |
| 13.33 | Line wrap matches viewer    | Compare a long-paragraph file in the export vs viewer      | Wrapping is identical word-for-word                                                       |
| 13.34 | Math prints                 | Export `examples/Math-Example.md` / `Chemistry-Example.md` | Formulas render correctly in the output                                                   |
| 13.35 | Full-bleed theme background | With a dark theme active, export                           | Page background matches the viewer (not white)                                            |
| 13.36 | Cancel after dialog         | Cancel save / print dialog                                 | No file written (macOS) / no print started (others)                                       |

#### macOS — Export as PDF

| #     | Test                 | Steps                      | Expected                                                           |
| ----- | -------------------- | -------------------------- | ------------------------------------------------------------------ |
| 13.37 | Toolbar label        | Inspect the viewer toolbar | Dropdown item "Export as PDF" (no separate Print button)           |
| 13.38 | Save dialog          | Click "Export as PDF"      | Native save dialog with `<name>.pdf`, PDF filter                   |
| 13.39 | Vector PDF created   | Save and open in Preview   | Vector PDF with selectable text; one long page (WKWebView capture) |
| 13.40 | Edge-to-edge scaling | Export                     | Content fills the PDF width edge-to-edge (webview-bounds page)     |
| 13.41 | Print button hidden  | Inspect toolbar            | No "Print / PDF" button on macOS                                   |
| 13.42 | Success toast        | Export PDF successfully    | Toast: "PDF saved" with the saved file path                        |
| 13.43 | Error toast          | Trigger a PDF failure      | Toast: "Create PDF failed" with detail message                     |

#### Linux & Windows — Export as PDF (Print…)

| #     | Test                               | Steps                                  | Expected                                                               |
| ----- | ---------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| 13.44 | Toolbar labels                     | Inspect the viewer toolbar             | "Export as PDF (Print…)" dropdown item + separate "Print / PDF" button |
| 13.45 | Print dialog opens                 | Click "Print / PDF" (or `Ctrl+P`)      | Native print dialog opens with styled content                          |
| 13.46 | Save as PDF                        | In print dialog choose "Save as PDF"   | Vector PDF written, opens correctly                                    |
| 13.47 | Background over margins (Chromium) | Enable "Background graphics" if needed | Page background paints to the paper edge on WebView2/Chromium          |
| 13.48 | Direct print                       | Pick a real printer, click Print       | Document prints with correct styling                                   |
| 13.49 | Error toast                        | Trigger a print failure                | Toast: "Print failed" with detail message                              |

### 13.5 Export as ODT

ODT always uses a neutral, printer-friendly style — the active theme is
ignored. The confirm dialog shows three option groups when the dialog is on.

| #     | Test                               | Steps                                                      | Expected                                                                              |
| ----- | ---------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 13.50 | Save dialog                        | Click Export as… → ODT                                     | Save dialog with `<name>.odt`, ODT filter                                             |
| 13.51 | Opens in LibreOffice               | Open the .odt                                              | Document opens; text, headings, lists, tables render                                  |
| 13.52 | Code highlighting printer-friendly | Export a fenced code block                                 | Highlighting uses printer-friendly token colors (not theme)                           |
| 13.53 | Math — native MathML (default)     | Export `examples/Math-Example.md` (rasterize math OFF)     | Formulas appear as editable ODF Math objects                                          |
| 13.54 | Math — rasterized PNG              | Tick "Rasterize as PNG images"; export                     | Formulas render as inline PNG frames in the ODT                                       |
| 13.55 | SVG — vector (default)             | Export `examples/Example.md` (references `weird.svg`)      | SVG embedded as a `Pictures/*.svg` entry (vector)                                     |
| 13.56 | SVG — rasterized PNG               | Tick "Rasterize as PNG images"; export                     | SVG replaced with `<draw:image … image/x-png>`                                        |
| 13.57 | Resolution picker                  | Switch resolution to 1×/2×/3×/4× and re-export (raster on) | PNG file size scales with the multiplier                                              |
| 13.58 | Resolution disabled when no raster | Tick neither rasterize option                              | Resolution `<select>` is greyed out (fieldset disabled)                               |
| 13.59 | `<dc:title>` from frontmatter      | Export `examples/Simple.md` (has YAML frontmatter)         | `meta.xml` carries the title field regardless of frontmatter card option              |
| 13.60 | Footnotes                          | Export a file with `[^1]`                                  | Rendered as ODF footnotes (citation + body)                                           |
| 13.61 | Local / remote / data-URI images   | Export `examples/Example.md`                               | Local images embedded; data URIs embedded; remote fetched (or warning if unreachable) |
| 13.62 | Warnings summary                   | Reference an unreachable remote image, export              | "Export Warnings" dialog lists the failed fetch                                       |
| 13.63 | Sub/sup, kbd, mark spans           | Export a file with `<sub>`, `<sup>`, `<kbd>`, `<mark>`     | Rendered as text spans with appropriate character styles                              |
| 13.64 | Tables                             | Export a file with a GFM table                             | Rendered as an ODF table (header + body cells)                                        |
| 13.65 | Cancel save                        | Cancel the save dialog                                     | No file written, no toast                                                             |
| 13.66 | Success toast                      | Export ODT successfully                                    | Toast: "Exported" with the saved file path                                            |
| 13.67 | Error toast                        | Trigger an ODT export failure                              | Toast: "Export failed" with detail message                                            |

### 13.6 Frontmatter Option (All Exporters)

All four exporters (HTML, HTML Bundle, PDF, ODT) expose an "Include frontmatter card"
toggle in the export confirm dialog. The toggle is disabled when the document
has no YAML frontmatter.

| #     | Test                                  | Steps                                              | Expected                                                                        |
| ----- | ------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| 13.68 | HTML — option in dialog               | With confirmation ON, export file with frontmatter | "Include frontmatter card" toggle visible and ON                                |
| 13.69 | HTML — option disabled                | Export file without frontmatter                    | Toggle greyed out (disabled)                                                    |
| 13.70 | HTML — frontmatter included (ON)      | Export with toggle ON                              | HTML contains `.frontmatter-card` element                                       |
| 13.71 | HTML — frontmatter excluded (OFF)     | Export with toggle OFF                             | No `.frontmatter-card` in HTML                                                  |
| 13.72 | HTML — option persisted               | Set toggle OFF, export, re-export                  | Toggle stays OFF on next export                                                 |
| 13.73 | HTML Bundle — option in dialog        | With confirmation ON, export file with frontmatter | "Include frontmatter card" toggle visible and ON                                |
| 13.74 | HTML Bundle — option disabled         | Export file without frontmatter                    | Toggle greyed out (disabled)                                                    |
| 13.75 | HTML Bundle — frontmatter included    | Export with toggle ON                              | `index.html` in zip contains `.frontmatter-card` element                        |
| 13.76 | HTML Bundle — frontmatter excluded    | Export with toggle OFF                             | No `.frontmatter-card` in `index.html`                                          |
| 13.77 | HTML Bundle — option persisted        | Set toggle OFF, export, re-export                  | Toggle stays OFF on next export                                                 |
| 13.78 | PDF — option in dialog                | With confirmation ON, export file with frontmatter | "Include frontmatter card" toggle visible and ON                                |
| 13.79 | PDF — option disabled                 | Export file without frontmatter                    | Toggle greyed out (disabled)                                                    |
| 13.80 | PDF — frontmatter included (ON)       | Export with toggle ON                              | PDF contains frontmatter card                                                   |
| 13.81 | PDF — frontmatter excluded (OFF)      | Export with toggle OFF                             | No frontmatter card in PDF                                                      |
| 13.82 | PDF — option persisted                | Set toggle OFF, export, re-export                  | Toggle stays OFF on next export                                                 |
| 13.83 | ODT — option in dialog                | With confirmation ON, export file with frontmatter | "Include frontmatter card" toggle visible and ON                                |
| 13.84 | ODT — option disabled                 | Export file without frontmatter                    | Toggle greyed out (disabled)                                                    |
| 13.85 | ODT — frontmatter card included (ON)  | Export with toggle ON                              | ODF body contains frontmatter card table                                        |
| 13.86 | ODT — frontmatter card excluded (OFF) | Export with toggle OFF                             | No frontmatter card in ODF                                                      |
| 13.87 | ODT — option persisted                | Set toggle OFF, export, re-export                  | Toggle stays OFF on next export                                                 |
| 13.88 | ODT — `<dc:title>` always set         | Export with frontmatter card OFF                   | `meta.xml` still carries the title field (card option does not affect metadata) |

---

## 14. Theme Selector

| #    | Test                           | Steps                                    | Expected                                                         |
| ---- | ------------------------------ | ---------------------------------------- | ---------------------------------------------------------------- |
| 14.1 | Open / close dropdown          | Click theme button; click outside        | Dropdown opens and closes                                        |
| 14.2 | Switch dark / light theme      | Select "GitHub Dark" then "GitHub Light" | Viewer & editor syntax colors swap accordingly                   |
| 14.3 | App chrome follows             | Switch themes                            | Toolbar, status bar, borders change color                        |
| 14.4 | Active theme highlight + badge | Open dropdown                            | Active row has accent background; shows "Dark"/"Light" badge     |
| 14.5 | Theme persistence              | Select a theme, close, reopen            | Same theme active                                                |
| 14.6 | Try all 9 built-in themes      | Select each theme in sequence            | Each applies correctly, no visual glitches                       |
| 14.7 | Printer Friendly theme         | Select "Printer Friendly / Neutral"      | Light theme with neutral syntax highlighting; used by ODT export |

### Built-in Themes Reference

| Theme                      | Type  |
| -------------------------- | ----- |
| GitHub Dark                | Dark  |
| GitHub Light               | Light |
| Atom One Dark              | Dark  |
| Atom One Light             | Light |
| Monokai                    | Dark  |
| Monokai Light              | Light |
| Nord                       | Dark  |
| Nord Light                 | Light |
| Printer Friendly / Neutral | Light |

### Custom Theme

| #     | Test                 | Steps                                                | Expected                                    |
| ----- | -------------------- | ---------------------------------------------------- | ------------------------------------------- |
| 14.8  | Add custom theme     | Place a `.css` file in the themes directory, restart | Appears in dropdown                         |
| 14.9  | Dark/light detection | Custom CSS with dark/light background keywords       | Badge shows "Dark"/"Light" accordingly      |
| 14.10 | Custom theme applies | Select custom theme from dropdown                    | Viewer and code highlighting use custom CSS |

---

## 15. Compatibility Levels

The compatibility levels feature warns when the document uses markdown syntax
outside the selected level. It does NOT restrict rendering — the Viewer always
renders everything. Warnings appear as editor gutter diagnostics and a badge
in the status bar.

### Levels Reference

| Level    | Description                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------- |
| Basic    | Only pure CommonMark is compatible. All extended features are flagged.                                                 |
| GitHub   | Enables: Tables, Strikethrough, Task lists, Autolinks, Footnotes, Raw HTML, Math `$…$` / `$$…$$`                       |
| Advanced | Enables all features including Highlight, Frontmatter, LaTeX math, Chemical formulas (default). Everything is allowed. |
| Custom   | User manually toggles individual features on/off via checkboxes.                                                       |

### Features (11 total)

| Feature           | Syntax                           | In GitHub? | In Advanced? |
| ----------------- | -------------------------------- | ---------- | ------------ |
| Tables            | GFM pipe tables                  | yes        | yes          |
| Strikethrough     | `~~text~~`                       | yes        | yes          |
| Highlight         | `==text==`                       | no         | yes          |
| Task lists        | `- [ ]` / `- [x]`                | yes        | yes          |
| Autolinks         | Bare URLs                        | yes        | yes          |
| Footnotes         | `[^1]`                           | yes        | yes          |
| Raw HTML          | `<kbd>`, `<mark>`, etc.          | yes        | yes          |
| Frontmatter       | YAML `---` blocks                | no         | yes          |
| Math (dollar)     | `$…$` / `$$…$$`                  | yes        | yes          |
| Math (LaTeX)      | `\(...\)`, `\[...\]`, `\begin{}` | no         | yes          |
| Chemical formulas | `\ce{…}`                         | no         | yes          |

### Test Files

| File                            | Features used                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `examples/Simple.md`            | Tables, footnotes, raw HTML (basic+github features)                               |
| `examples/Math-Example.md`      | All math delimiter styles (dollar, LaTeX, fences)                                 |
| `examples/Chemistry-Example.md` | Chemical formulas (`\ce{}`)                                                       |
| `examples/Example.md`           | Everything: tables, task lists, strikethrough, highlight, HTML, math, frontmatter |

### Test Steps

| #     | Test                          | Steps                                                               | Expected                                                                                                                                                           |
| ----- | ----------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 15.1  | Default level is Advanced     | Open app, check status bar                                          | Level button shows "Advanced"                                                                                                                                      |
| 15.2  | Level selector opens          | Click the level button in the status bar (right side)               | Popover opens with four level buttons (Basic, GitHub, Advanced, Custom) and feature toggle checklist                                                               |
| 15.3  | Switch to Basic               | Click "Basic" in the level popover                                  | Level changes to "Basic"; no warnings for a clean CommonMark document                                                                                              |
| 15.4  | Basic warns on tables         | Open `examples/Simple.md` (has tables), set level to "Basic"        | ⚠ badge appears in status bar with count; editor gutter shows warnings on table lines; clicking badge shows "Tables is above the 'basic' level (requires: github)" |
| 15.5  | Basic warns on all extensions | Open `examples/Example.md`, set level to "Basic"                    | Warnings for tables, strikethrough, highlight, task lists, autolinks, footnotes, raw HTML, math, frontmatter, chemistry                                            |
| 15.6  | Switch to GitHub              | Click "GitHub" in the level popover                                 | Level changes to "GitHub"; warnings clear for features in the GitHub set                                                                                           |
| 15.7  | GitHub warns on highlight     | Open file with `==text==`, set level to "GitHub"                    | Warnings on highlight lines (requires: advanced)                                                                                                                   |
| 15.8  | GitHub warns on LaTeX math    | Open `examples/Math-Example.md`, set level to "GitHub"              | Warnings on `\(...\)`, `\[...\]`, `\begin{}`, and ` ```math ` lines (requires: advanced)                                                                           |
| 15.9  | GitHub warns on chemistry     | Open `examples/Chemistry-Example.md`, set level to "GitHub"         | Warnings on `\ce{…}` lines (requires: advanced)                                                                                                                    |
| 15.10 | Advanced — no warnings        | Set level to "Advanced", open any example file                      | No warnings, no badge                                                                                                                                              |
| 15.11 | Custom mode                   | Click "Custom", toggle features on/off                              | Level label changes to "Custom (n/11)" showing enabled count; warnings update accordingly                                                                          |
| 15.12 | Custom — toggle re-enables    | In Custom mode, re-enable a disabled feature that the document uses | Warnings for that feature clear                                                                                                                                    |
| 15.13 | Editor lint integration       | With warnings active, hover over a yellow gutter marker             | Tooltip shows the violation message (e.g. "Raw HTML is above the 'basic' level (requires: github)")                                                                |
| 15.14 | Level persistence             | Select "GitHub", close app, reopen                                  | Level is still "GitHub"                                                                                                                                            |
| 15.15 | Analysis debounce             | Switch to "Basic", rapidly type markdown with extended features     | Warnings appear after ~200ms debounce, not on every keystroke                                                                                                      |

---

## 16. Scroll Sync

| #    | Test                         | Steps                                          | Expected                                    |
| ---- | ---------------------------- | ---------------------------------------------- | ------------------------------------------- |
| 16.1 | Editor↔Viewer sync           | In split view, scroll either pane slowly       | Other pane scrolls to corresponding section |
| 16.2 | Rapid scrolling              | Scroll quickly in either pane                  | No drift, oscillation, or lag               |
| 16.3 | Large document sync          | Open 5000+ line file, scroll                   | Sync remains accurate                       |
| 16.4 | Mixed content sync           | Document with code, tables, lists, blockquotes | Sync handles all block types                |
| 16.5 | Sync disabled in single view | Switch to editor-only or viewer-only           | Scrolling only affects the visible pane     |

---

## 17. Command Palette

| #     | Test                       | Steps                          | Expected                                                                            |
| ----- | -------------------------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| 17.1  | Open palette               | `Ctrl+Shift+P`                 | Command palette overlay appears                                                     |
| 17.2  | Close palette              | Escape / click backdrop        | Palette closes                                                                      |
| 17.3  | Search commands            | Type "save" / "file"           | Filters to matching commands                                                        |
| 17.4  | No results                 | Type "xyzabc"                  | Shows "No matching commands"                                                        |
| 17.5  | Keyboard navigation        | Arrow up/down                  | Selection moves, wraps around                                                       |
| 17.6  | Execute command            | Select "New File", press Enter | New file created, palette closes                                                    |
| 17.7  | Mouse hover selection      | Hover over commands            | Hovered item becomes selected                                                       |
| 17.8  | Shortcut / category badges | Open palette                   | Each command shows shortcut and category                                            |
| 17.9  | Export commands present    | Type "export"                  | Lists "Export as HTML", "Export as HTML Bundle", "Export as PDF …", "Export as ODT" |
| 17.10 | Export runs                | Select "Export as HTML"        | Same path as the toolbar dropdown                                                   |

### Command Palette Commands Reference

| Command                    | Shortcut       | Category                              |
| -------------------------- | -------------- | ------------------------------------- |
| New File                   | `Ctrl+N`       | File                                  |
| Open File                  | `Ctrl+O`       | File                                  |
| Save                       | `Ctrl+S`       | File                                  |
| Save As                    | `Ctrl+Shift+S` | File                                  |
| Reload from Disk           | `Ctrl+R`       | File                                  |
| Quit                       | `Ctrl+Q`       | File                                  |
| Cycle View Mode            | `Ctrl+Shift+V` | View                                  |
| Export as HTML             | —              | File                                  |
| Export as HTML Bundle      | —              | File                                  |
| Export as PDF …            | —              | File                                  |
| Export as ODT              | —              | File                                  |
| Print Preview / Create PDF | `Ctrl+P`       | File (label & visibility OS-specific) |
| About                      | `F1`           | Help                                  |

---

## 18. About Dialog

| #    | Test                          | Steps                        | Expected                                                 |
| ---- | ----------------------------- | ---------------------------- | -------------------------------------------------------- |
| 18.1 | Open via button / F1          | Click info icon / press `F1` | About dialog opens                                       |
| 18.2 | Close (X / backdrop / Escape) | Try each close method        | Dialog closes in all cases                               |
| 18.3 | About tab content             | View About tab               | Shows app info, author, license summary                  |
| 18.4 | Custom Themes tab             | Click Custom Themes tab      | Shows theme documentation with CSS examples              |
| 18.5 | Dependencies tab              | Click Dependencies tab       | Shows table of all third-party libraries                 |
| 18.6 | Shortcuts tab — Quit          | Click Keyboard Shortcuts tab | "Quit" row with `Ctrl+Q` (or `Cmd+Q` on macOS) is listed |
| 18.7 | License tab                   | Click License tab            | Shows full MIT license text                              |
| 18.8 | Check for updates             | Click "Check for Updates"    | Shows status (checking, up-to-date, or available)        |
| 18.9 | External links                | Click any link in About      | Opens in external browser                                |

---

## 19. Status Bar

| #    | Test                     | Steps                       | Expected                                          |
| ---- | ------------------------ | --------------------------- | ------------------------------------------------- |
| 19.1 | Cursor position          | Click at various positions  | Shows `Line X, Col Y`                             |
| 19.2 | Word count               | Type content / clear all    | Updates; `0 words` when empty                     |
| 19.3 | Document type & encoding | Always visible              | Shows "Markdown" / "UTF-8"                        |
| 19.4 | Level selector           | Check status bar right side | Shows current level (e.g. "Advanced")             |
| 19.5 | Violation badge          | Open file with violations   | ⚠ badge with count appears next to level selector |

---

## 20. Error Handling & Edge Cases

| #     | Test                              | Steps                                         | Expected                                                    |
| ----- | --------------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| 20.1  | Empty file                        | Create new file, don't type                   | Viewer empty, word count 0                                  |
| 20.2  | Very large file                   | Open 5MB+ markdown file                       | Loads without freezing, scroll works                        |
| 20.3  | CRLF line endings                 | Open Windows-style line endings file          | Renders correctly                                           |
| 20.4  | Read-only file                    | Open read-only file, try to save              | 🔒 indicator shown, toast error on save, file not corrupted |
| 20.5  | Path edge cases                   | Open/save files with spaces / unicode in path | Works correctly                                             |
| 20.6  | Deeply nested lists / blockquotes | Create 5+ levels of each                      | Render without breaking layout                              |
| 20.7  | Very long code block              | Paste 500+ line code block                    | Renders, scrolls, syncs                                     |
| 20.8  | Rapid typing                      | Type fast for 30 seconds                      | No lost characters, viewer catches up                       |
| 20.9  | Frontmatter with non-object YAML  | Use array or string as frontmatter            | Gracefully ignored, no crash                                |
| 20.10 | Mixed content stress test         | File with every feature combined              | All features render correctly together                      |
| 20.11 | Switching views while rendering   | Rapidly toggle view modes                     | No crashes or visual glitches                               |
| 20.12 | Open file while loading           | Double-click a file rapidly                   | Only one file opens (loading guard)                         |

---

## 21. Quit Behavior

| #    | Test                       | Steps                                        | Expected                                                                                                                                     |
| ---- | -------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 21.1 | Quit with no changes       | Close window / `Ctrl+Q` / palette "Quit"     | App closes immediately; prompt does not appear                                                                                               |
| 21.2 | Quit with unsaved changes  | Edit content, then quit via any of the three | Dialog: `"You have unsaved changes. Close the application and discard your changes?"` with Cancel / Yes, And Discard My Changes / Save First |
| 21.3 | Quit — Cancel              | Click Cancel in dialog                       | Window stays open                                                                                                                            |
| 21.4 | Quit — Discard             | Click Yes, And Discard My Changes            | App closes, changes lost                                                                                                                     |
| 21.5 | Quit — Save (untitled)     | Click Save First (no file name)              | Save As dialog appears; on save app closes                                                                                                   |
| 21.6 | Quit — Save (named)        | Click Save First                             | File saved, app closes                                                                                                                       |
| 21.7 | Quit — Save cancelled      | Click Save First, then cancel Save As        | Window stays open (save didn't complete)                                                                                                     |
| 21.8 | Window state saved on quit | Resize window, quit, reopen                  | Position and size restored (persisted at exit via `save_window_state`)                                                                       |
