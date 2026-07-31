# Markdown Viewditor — Manual Test Plan

## Test Environment Setup

- Build & launch: `npm run tauri dev` (or install a built binary)
- Markdown files in folder `examples` have all the required content for the tests

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

| #   | Test                     | Steps                                         | Expected                                      |
| --- | ------------------------ | --------------------------------------------- | --------------------------------------------- |
| 2.1 | Default layout           | Launch app                                    | Split view: editor left, viewer right, ~50/50 |
| 2.2 | Resize handle drag       | Drag the center divider left/right            | Pane ratio changes, viewer/editor resize      |
| 2.3 | Snap to viewer           | Drag handle to far left (<5%)                 | Switches to viewer-only mode                  |
| 2.4 | Snap to editor           | Drag handle to far right (>95%)               | Switches to editor-only mode                  |
| 2.5 | Snap to center           | Drag handle near center (within 2.5% of 50%)  | Snaps to exactly 50%                          |
| 2.6 | Double-click reset       | Drag handle away from center, double-click it | Resets to 50% split, split mode               |
| 2.7 | Handle visual feedback   | Hover/drag the handle                         | Handle turns accent color                     |
| 2.8 | Context menu suppression | Right-click anywhere in the app               | No native context menu appears                |

---

## 3. View Toggle

| #   | Test                   | Steps                                 | Expected                            |
| --- | ---------------------- | ------------------------------------- | ----------------------------------- |
| 3.1 | Editor only            | Click "Edit" button in center toolbar | Only editor pane visible            |
| 3.2 | Split view             | Click "Split" button                  | Both panes visible side-by-side     |
| 3.3 | Viewer only            | Click "View" button                   | Only viewer pane visible            |
| 3.4 | Active state highlight | Switch modes                          | Active button has accent background |
| 3.5 | Persistence            | Set to "Editor", close, reopen        | Restores "Editor" mode              |

---

## 4. Editor

| #   | Test                          | Steps                                                 | Expected                                   |
| --- | ----------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| 4.1 | Type text                     | Click in editor, type `Hello World`                   | Text appears, cursor moves                 |
| 4.2 | Line numbers                  | Look at left gutter                                   | Line numbers displayed                     |
| 4.3 | Syntax highlighting           | Type markdown (`# Heading`, `**bold**`, `` `code` ``) | Markdown syntax is color-highlighted       |
| 4.4 | Cursor position in status bar | Click at different positions                          | Status bar shows correct `Line X, Col Y`   |
| 4.5 | Word count                    | Type several words                                    | Status bar word count updates in real-time |
| 4.6 | Empty document                | Clear all content                                     | Word count = 0, viewer empty               |

---

## 5. Editor Toolbar — Formatting Buttons

For each: select text, click the toolbar button, verify markdown output in the editor and rendered output in the viewer.

| #    | Test                  | Button                   | Verify                                    |
| ---- | --------------------- | ------------------------ | ----------------------------------------- |
| 5.1  | Bold                  | `B`                      | Wraps in `**...**`, viewer shows **bold** |
| 5.2  | Italic                | `I`                      | Wraps in `*...*`, viewer shows _italic_   |
| 5.3  | Heading               | `H`                      | Adds `## `, cycles H2→H3→...→H6→plain     |
| 5.4  | Link                  | chain icon               | Inserts `[text](url)`                     |
| 5.5  | Image                 | picture icon             | Inserts `![alt](url)`                     |
| 5.6  | Inline Code           | backtick                 | Wraps in `` ` ``                          |
| 5.7  | Code Block            | triple backtick          | Wraps in ` ``` ` fences                   |
| 5.8  | Bullet List           | bullet                   | Adds `- ` prefix                          |
| 5.9  | Numbered List         | `1.`                     | Adds `1. ` prefix                         |
| 5.10 | Task List             | checkbox                 | Adds `- [ ] ` prefix                      |
| 5.11 | Blockquote            | quote                    | Adds `> ` prefix                          |
| 5.12 | Horizontal Rule       | em-dash                  | Inserts `\n---\n`                         |
| 5.13 | Editor focus retained | Click any toolbar button | Editor does not lose focus                |

### Heading Cycling Detail

1. Select a line with no heading → click H → adds `## ` (H2)
2. Click H again → becomes `### ` (H3)
3. Continue through H4, H5, H6
4. Click H on H6 → removes all heading markers (plain text)

### Bold/Italic Toggle Detail

1. Select text, click Bold → `**text**`
2. Click Italic → `***text***` (bold-italic)
3. Click Italic again → `**text**` (back to bold only)
4. Select plain text, click Italic → `*text*`
5. Click Italic again → plain text (unwrapped)

---

## 6. Keyboard Shortcuts

| #    | Test            | Shortcut       | Expected                                    |
| ---- | --------------- | -------------- | ------------------------------------------- |
| 6.1  | New file        | `Ctrl+N`       | Creates new empty file (prompts if unsaved) |
| 6.2  | Open file       | `Ctrl+O`       | Opens file dialog                           |
| 6.3  | Save            | `Ctrl+S`       | Saves current file                          |
| 6.4  | Save As         | `Ctrl+Shift+S` | Opens save-as dialog                        |
| 6.5  | Reload          | `Ctrl+R`       | Reloads file from disk                      |
| 6.6  | Quit            | `Ctrl+Q`       | Quits app (prompts if unsaved, saves state) |
| 6.7  | Command palette | `Ctrl+Shift+P` | Opens command palette                       |
| 6.8  | Print           | `Ctrl+P`       | Opens print dialog                          |
| 6.9  | About           | `F1`           | Opens About dialog                          |
| 6.10 | Bold            | `Ctrl+B`       | Toggles bold                                |
| 6.11 | Italic          | `Ctrl+I`       | Toggles italic                              |
| 6.12 | Insert link     | `Ctrl+K`       | Inserts link syntax                         |

> On macOS, replace `Ctrl` with `Cmd` for all shortcuts above.

---

## 7. File Operations

| #    | Test                          | Steps                                       | Expected                                                           |
| ---- | ----------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| 7.1  | Open file                     | Click Open, select a `.md` file             | Content loads into editor, viewer renders it                       |
| 7.2  | Open dialog filters           | Open dialog                                 | Shows "Markdown" and "All Files" filters                           |
| 7.3  | Cancel open dialog            | Open dialog, cancel                         | No change to current content                                       |
| 7.4  | Save new file                 | With "Untitled" file, click Save            | Save-as dialog appears                                             |
| 7.5  | Save existing file            | Edit file, click Save                       | File saved, `*` indicator disappears, `.bak` backup created        |
| 7.6  | Save As same path             | Save As to the current file's path          | If externally modified, overwrite prompt; otherwise saves directly |
| 7.7  | Save As different path        | Save As to a new location                   | New file created, app tracks new path                              |
| 7.8  | Save As to existing file      | Save As to a file that already exists       | Prompt: "A file named ... already exists. Replace?"                |
| 7.9  | Save As to read-only file     | Save As to a read-only file                 | Toast: "This file is read-only. Choose a different location."      |
| 7.10 | New file with unsaved changes | Edit content, click New                     | 3-button dialog: Save / Don't Save / Cancel                        |
| 7.11 | New file — Save chosen        | In 3-button dialog, click Save              | Saves (Save As if untitled), then clears editor, "Untitled"        |
| 7.12 | New file — Don't Save chosen  | In 3-button dialog, click Don't Save        | Editor clears, file name = "Untitled", changes lost                |
| 7.13 | New file — Cancel chosen      | In 3-button dialog, click Cancel            | No change, editor content preserved                                |
| 7.14 | Open with unsaved changes     | Edit content, click Open                    | 3-button dialog: Save / Don't Save / Cancel                        |
| 7.15 | Reload from disk              | Edit externally, click Reload               | Content updates from disk                                          |
| 7.16 | Reload with unsaved changes   | Edit in app, click Reload                   | 3-button dialog: Save / Don't Save / Cancel                        |
| 7.17 | Reload unchanged file         | No edits in app or on disk, click Reload    | Reloads for example an external image that changes for each reload                           |
| 7.18 | Reload deleted file           | Delete file externally, click Reload        | Warning: "File no longer exists. Use Save As."                     |
| 7.19 | File name display             | Open a file                                 | File name shown in toolbar and status bar                          |
| 7.20 | Modified indicator            | Edit content                                | `*` appears after filename, dot on Save button                     |
| 7.21 | Read-only indicator           | Open a read-only file                       | 🔒 appears next to filename in toolbar and status bar              |
| 7.22 | Save to read-only file        | Edit a read-only file, click Save           | Toast error: "Could not save: the file is read-only."              |
| 7.23 | Save — .bak backup created    | Save over an existing file, check directory | `<filename>.bak` contains the previous content                     |
| 7.24 | UTF-8 BOM stripped on read    | Open file with UTF-8 BOM                    | Content reads correctly, no BOM artifact in editor                 |
| 7.25 | Non-UTF-8 file                | Open file with ISO/IEC 8859-1 (Latin-1) encoding             | Content decoded losslessly, no crash or garbled text               |
| 7.26 | Toast on save failure         | Save to a path that fails (e.g. permission) | Error toast appears with failure message                           |
| 7.27 | Toast on open failure         | Open a file that fails (e.g. locked)        | Error toast appears with failure message                           |

---

## 8. External Modification Detection

| #    | Test                               | Steps                                                             | Expected                                                         |
| ---- | ---------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| 8.1  | File modified externally (clean)   | Open file, edit in another editor, switch back to app             | Prompt: "modified by another application. Reload it?"            |
| 8.2  | File modified externally (dirty)   | Open file, edit in app, edit externally, switch back              | Prompt: "modified by another application. Reload and discard?"   |
| 8.3  | Decline reload — ⚠ persists        | Decline reload prompt                                             | ⚠ indicator stays on filename, `changeStatus` stays "modified"   |
| 8.4  | Decline reload — Save still warns  | Decline reload, then press Ctrl+S                                 | Overwrite prompt: "Overwrite external changes?" (still asked)    |
| 8.5  | Decline reload — no re-prompt      | Decline reload, switch away and back                              | No second reload prompt (already acknowledged)                   |
| 8.6  | Accept reload                      | Accept reload prompt                                              | Content updates, ⚠ clears, baseline reset                        |
| 8.7  | File deleted externally            | Open file, delete it externally, switch to app                    | Warning: "File no longer exists. Use Save As."                   |
| 8.8  | Save after external deletion       | After deletion warning, press Ctrl+S                              | Save routes to Save As dialog (does not recreate at old path)    |
| 8.9  | Save over externally modified      | Modify externally, press Ctrl+S                                   | Overwrite prompt: "Overwrite external changes?"                  |
| 8.10 | Reload after external modification | Modify externally, press Ctrl+R                                   | If dirty: 3-button dialog (Save/Don't Save/Cancel); else reloads |
| 8.11 | Size-only change detected          | Edit file externally without changing mtime (e.g. `touch -r ref`) | ⚠ appears on next focus (mtime OR size comparison)               |

---

## 9. Viewer — Markdown Rendering

Create a test file with all supported features and verify each renders correctly:

| #    | Feature                     | Syntax                                           | Verify                                 |
| ---- | --------------------------- | ------------------------------------------------ | -------------------------------------- |
| 9.1  | H1–H6                       | `# ` through `###### `                           | Styled headings of decreasing size     |
| 9.2  | Paragraphs                  | Text with blank lines                            | Separate paragraphs                    |
| 9.3  | Bold                        | `**text**`                                       | Bold text                              |
| 9.4  | Italic                      | `*text*`                                         | Italic text                            |
| 9.5  | Strikethrough               | `~~text~~`                                       | Strikethrough text                     |
| 9.6  | Inline code                 | `` `code` ``                                     | Styled inline code                     |
| 9.7  | Fenced code blocks          | ` ```js ... ``` `                                | Syntax-highlighted code block          |
| 9.8  | Blockquotes                 | `> text`                                         | Indented quote block                   |
| 9.9  | Unordered lists             | `- item`                                         | Bullet list                            |
| 9.10 | Ordered lists               | `1. item`                                        | Numbered list                          |
| 9.11 | Task lists                  | `- [ ] task` / `- [x] done`                      | Checkboxes, checked/unchecked          |
| 9.12 | Tables                      | GFM pipe tables                                  | Rendered table with borders            |
| 9.13 | Links                       | `[text](url)`                                    | Clickable link                         |
| 9.14 | Images                      | `![alt](src)`                                    | Image displayed                        |
| 9.15 | Horizontal rules            | `---`                                            | Horizontal line                        |
| 9.16 | Footnotes                   | `[^1]` and `[^1]: def`                           | Footnote links and definitions         |
| 9.17 | Raw HTML                    | `<details>`, `<kbd>`, `<mark>`, `<sub>`, `<sup>` | HTML rendered correctly                |
| 9.18 | YAML frontmatter (standard) | `---\nkey: value\n---`                           | "Frontmatter" card with key-value grid |
| 9.19 | YAML frontmatter (skill)    | `---\nname: ...\ndescription: ...\n---`          | "Skill" card with badge and metadata   |
| 9.20 | Autolinks                   | `https://example.com`                            | Clickable link                         |

---

## 10. Viewer — Code Syntax Highlighting

| #    | Test       | Steps                        | Expected                                |
| ---- | ---------- | ---------------------------- | --------------------------------------- |
| 10.1 | JavaScript | Add fenced JS code block     | Keywords, strings, comments highlighted |
| 10.2 | Python     | Add fenced Python code block | Python syntax highlighted               |
| 10.3 | HTML/XML   | Add fenced HTML code block   | Tags and attributes highlighted         |
| 10.4 | CSS        | Add fenced CSS code block    | Properties and values highlighted       |
| 10.5 | SQL        | Add fenced SQL code block    | SQL keywords highlighted                |
| 10.6 | JSON       | Add fenced JSON code block   | Keys and values highlighted             |
| 10.7 | Bash       | Add fenced bash code block   | Shell syntax highlighted                |

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

| #    | Test               | Steps                                | Expected                           |
| ---- | ------------------ | ------------------------------------ | ---------------------------------- |
| 12.1 | Relative image     | `![](./image.png)` in same directory | Image renders                      |
| 12.2 | Subdirectory image | `![](./img/photo.jpg)`               | Image renders                      |
| 12.3 | Path with spaces   | `![](./my image.png)`                | Image renders                      |
| 12.4 | Path with unicode  | `![](./图片.png)`                    | Image renders                      |
| 12.5 | Missing image      | `![](./nonexistent.png)`             | Broken image, no crash             |
| 12.6 | HTML img tag       | `<img src="./local.png">`            | Image renders                      |
| 12.7 | Remote image URL   | `![](https://example.com/img.png)`   | Loads from internet (if available) |
| 12.8 | Data URI image     | `![](data:image/png;base64,...)`     | Renders inline                     |

---

## 13. Viewer Toolbar

| #    | Test                  | Steps                          | Expected                               |
| ---- | --------------------- | ------------------------------ | -------------------------------------- |
| 13.1 | Copy HTML             | Click "Copy HTML" button       | Clipboard contains viewer's HTML       |
| 13.2 | Verify copied HTML    | Paste into a text editor       | Valid HTML with rendered markdown      |
| 13.3 | Print                 | Click Print button or `Ctrl+P` | Print dialog opens with styled content |
| 13.4 | Print preview content | Check print preview            | Formatted markdown with proper styling |

---

## 14. Theme Selector

| #     | Test                           | Steps                         | Expected                                         |
| ----- | ------------------------------ | ----------------------------- | ------------------------------------------------ |
| 14.1  | Open dropdown                  | Click theme button            | Dropdown with theme list appears                 |
| 14.2  | Close dropdown (outside click) | Click outside dropdown        | Dropdown closes                                  |
| 14.3  | Select dark theme              | Select "GitHub Dark"          | Dark viewer background, dark code highlighting   |
| 14.4  | Select light theme             | Select "GitHub Light"         | Light viewer background, light code highlighting |
| 14.5  | Editor theme follows           | Switch dark→light→dark        | Editor syntax colors change accordingly          |
| 14.6  | App chrome updates             | Switch themes                 | Toolbar, status bar, borders change color        |
| 14.7  | Theme persistence              | Select a theme, close, reopen | Same theme active                                |
| 14.8  | Try all 8 built-in themes      | Select each theme one by one  | Each applies correctly, no visual glitches       |
| 14.9  | Active theme highlight         | Open dropdown                 | Active theme has accent background               |
| 14.10 | Theme type badges              | Open dropdown                 | Each theme shows "Dark" or "Light" badge         |

### Built-in Themes Reference

| Theme          | Type  |
| -------------- | ----- |
| GitHub Dark    | Dark  |
| GitHub Light   | Light |
| Atom One Dark  | Dark  |
| Atom One Light | Light |
| Monokai        | Dark  |
| Monokai Light  | Light |
| Nord           | Dark  |
| Nord Light     | Light |

### Custom Theme Test

| #     | Test                   | Steps                                                | Expected                                    |
| ----- | ---------------------- | ---------------------------------------------------- | ------------------------------------------- |
| 14.11 | Add custom theme       | Place a `.css` file in the themes directory, restart | Appears in dropdown                         |
| 14.12 | Custom dark detection  | Create CSS with dark background keywords             | Badge shows "Dark"                          |
| 14.13 | Custom light detection | Create CSS with light background keywords            | Badge shows "Light"                         |
| 14.14 | Custom theme applies   | Select custom theme from dropdown                    | Viewer and code highlighting use custom CSS |

---

## 15. Scroll Sync

| #    | Test                         | Steps                                          | Expected                                |
| ---- | ---------------------------- | ---------------------------------------------- | --------------------------------------- |
| 15.1 | Editor→Viewer sync           | In split view, scroll editor slowly            | Viewer scrolls to corresponding section |
| 15.2 | Viewer→Editor sync           | Scroll viewer slowly                           | Editor scrolls to corresponding section |
| 15.3 | Rapid scrolling              | Scroll quickly in either pane                  | No drift, oscillation, or lag           |
| 15.4 | Large document sync          | Open 5000+ line file, scroll                   | Sync remains accurate                   |
| 15.5 | Mixed content sync           | Document with code, tables, lists, blockquotes | Sync handles all block types            |
| 15.6 | Sync disabled in single view | Switch to editor-only or viewer-only           | Scrolling only affects the visible pane |

---

## 16. Command Palette

| #     | Test                          | Steps                          | Expected                                 |
| ----- | ----------------------------- | ------------------------------ | ---------------------------------------- |
| 16.1  | Open palette                  | `Ctrl+Shift+P`                 | Command palette overlay appears          |
| 16.2  | Close palette (Escape)        | Press `Escape`                 | Palette closes                           |
| 16.3  | Close palette (outside click) | Click overlay backdrop         | Palette closes                           |
| 16.4  | Search commands               | Type "save"                    | Filters to Save, Save As                 |
| 16.5  | Search by category            | Type "file"                    | Shows all file commands                  |
| 16.6  | No results                    | Type "xyzabc"                  | Shows "No matching commands"             |
| 16.7  | Keyboard navigation           | Arrow up/down                  | Selection moves, wraps around            |
| 16.8  | Execute command               | Select "New File", press Enter | New file created, palette closes         |
| 16.9  | Mouse hover selection         | Hover over commands            | Hovered item becomes selected            |
| 16.10 | Shortcut badges               | Open palette                   | Each command shows its keyboard shortcut |
| 16.11 | Category badges               | Open palette                   | Each command shows its category          |

### Command Palette Commands Reference

| Command          | Shortcut       | Category |
| ---------------- | -------------- | -------- |
| New File         | `Ctrl+N`       | File     |
| Open File        | `Ctrl+O`       | File     |
| Save             | `Ctrl+S`       | File     |
| Save As          | `Ctrl+Shift+S` | File     |
| Reload from Disk | `Ctrl+R`       | File     |
| Quit             | `Ctrl+Q`       | File     |
| Split View       | —              | View     |
| Editor Only      | —              | View     |
| Viewer Only      | —              | View     |
| Copy HTML        | —              | Edit     |
| Print Preview    | `Ctrl+P`       | File     |
| About            | `F1`           | Help     |

---

## 17. About Dialog

| #     | Test                 | Steps                        | Expected                                          |
| ----- | -------------------- | ---------------------------- | ------------------------------------------------- |
| 17.1  | Open via button      | Click info icon in toolbar   | About dialog opens                                |
| 17.2  | Open via F1          | Press `F1`                   | About dialog opens                                |
| 17.3  | Close (X button)     | Click X                      | Dialog closes                                     |
| 17.4  | Close (backdrop)     | Click outside dialog         | Dialog closes                                     |
| 17.5  | Close (Escape)       | Press `Escape`               | Dialog closes                                     |
| 17.6  | About tab content    | View About tab               | Shows app info, author, license summary           |
| 17.7  | Custom Themes tab    | Click Custom Themes tab      | Shows theme documentation with CSS examples       |
| 17.8  | Dependencies tab     | Click Dependencies tab       | Shows table of all third-party libraries          |
| 17.9  | Shortcuts tab — Quit | Click Keyboard Shortcuts tab | "Quit" row with `Ctrl+Q` is listed                |
| 17.10 | License tab          | Click License tab            | Shows full MIT license text                       |
| 17.10 | Check for updates    | Click "Check for Updates"    | Shows status (checking, up-to-date, or available) |
| 17.11 | External links       | Click any link in About      | Opens in external browser                         |

---

## 18. Status Bar

| #    | Test               | Steps                      | Expected                 |
| ---- | ------------------ | -------------------------- | ------------------------ |
| 18.1 | File name display  | Open a file                | Shows file name on left  |
| 18.2 | Untitled display   | No file open               | Shows "Untitled"         |
| 18.3 | Cursor position    | Click at various positions | Shows `Line X, Col Y`    |
| 18.4 | Word count         | Type content               | Shows correct word count |
| 18.5 | Word count (empty) | Clear all content          | Shows `0 words`          |
| 18.6 | Document type      | Always visible             | Shows "Markdown"         |
| 18.7 | Encoding           | Always visible             | Shows "UTF-8"            |

---

## 19. Error Handling & Edge Cases

| #     | Test                             | Steps                                | Expected                                                    |
| ----- | -------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| 19.1  | Empty file                       | Create new file, don't type          | Viewer empty, word count 0                                  |
| 19.2  | Very large file                  | Open 5MB+ markdown file              | Loads without freezing, scroll works                        |
| 19.3  | File with BOM                    | Open UTF-8 BOM file                  | Content reads correctly, no BOM artifact                    |
| 19.4  | CRLF line endings                | Open Windows-style line endings file | Renders correctly                                           |
| 19.5  | Read-only file                   | Open read-only file, try to save     | 🔒 indicator shown, toast error on save, file not corrupted |
| 19.6  | Path with spaces                 | Open/save files with spaces in path  | Works correctly                                             |
| 19.7  | Unicode filename                 | Open file with unicode characters    | Works correctly                                             |
| 19.8  | Deeply nested lists              | Create 5+ levels of nested lists     | Renders without breaking layout                             |
| 19.9  | Nested blockquotes               | Create multi-level blockquotes       | Renders correctly                                           |
| 19.10 | Very long code block             | Paste 500+ line code block           | Renders, scrolls, syncs                                     |
| 19.11 | Rapid typing                     | Type fast for 30 seconds             | No lost characters, viewer catches up                       |
| 19.12 | Frontmatter with non-object YAML | Use array or string as frontmatter   | Gracefully ignored, no crash                                |
| 19.13 | Mixed content stress test        | File with every feature combined     | All features render correctly together                      |
| 19.14 | Switching views while rendering  | Rapidly toggle view modes            | No crashes or visual glitches                               |
| 19.15 | Open file while loading          | Double-click a file rapidly          | Only one file opens (loading guard)                         |

---

## 20. Quit Behavior

| #     | Test                       | Steps                               | Expected                                                                   |
| ----- | -------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| 20.1  | Quit with no changes       | Close window                        | App closes immediately                                                     |
| 20.2  | Quit with unsaved changes  | Edit content, close window          | 3-button dialog: Save / Don't Save / Cancel                                |
| 20.3  | Quit — Cancel              | Click Cancel in 3-button dialog     | Window stays open                                                          |
| 20.4  | Quit — Don't Save          | Click Don't Save in 3-button dialog | App closes, changes lost                                                   |
| 20.5  | Quit — Save (untitled)     | Click Save in 3-button dialog       | Save As dialog appears; on save app closes                                 |
| 20.6  | Quit — Save (named)        | Click Save in 3-button dialog       | File saved, app closes                                                     |
| 20.7  | Quit — Save cancelled      | Click Save, cancel Save As dialog   | Window stays open (save didn't complete)                                   |
| 20.8  | Ctrl+Q shortcut            | Press `Ctrl+Q`                      | Same behavior as closing the window (3-button dialog if unsaved)           |
| 20.9  | Command Palette Quit       | Open palette, type "quit", Enter    | Same behavior as closing the window (3-button dialog if unsaved)           |
| 20.10 | Window state saved on quit | Resize window, quit, reopen         | Position and size restored (state persisted at exit via save_window_state) |
