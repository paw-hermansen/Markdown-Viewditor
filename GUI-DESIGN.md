# Markdown Viewditor - GUI Design Document

## Design Philosophy

**Clean. Simple. Modern. Live.**

- Minimal chrome, maximum content
- Soft shadows and subtle borders
- Generous whitespace
- Smooth transitions
- Focus on readability
- **Live preview** as the core experience

---

## Color Palette

### Dark Theme (Default)

```
Background:    #1e1e2e   (near-neutral with subtle purple tint)
Surface:       #24243a
Card:          #2a2a42
Primary:       #e94560
Text:          #eaeaea
Text Muted:    #8892b0
Border:        #313150
```

### Light Theme

```
Background:    #fafafa
Surface:       #ffffff
Card:          #f5f5f5
Primary:       #e94560
Text:          #2d2d2d
Text Muted:    #6b7280
Border:        #d1d5db
```

---

## Layout

### Main View (Split Mode with Live Preview)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ⬤ ⬤ ⬤    readme.md *        Markdown Viewditor              ☰        │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [B] [I] [H] [Link] [Image] [Code] [CodeBlock] [UL] [OL] [Task]  │
│  [Quote] [HR] [Strike] [Table]    [Split] [Edit] [View]           │
│                                                                     │
├────────────────────────────────┬─┬──────────────────────────────────┤
│                                │ │                                  │
│   1  # Hello World             │ │  Hello World                     │
│   2                            │ │  ─────────────                   │
│   3  This is **markdown**      │ │  This is markdown                │
│   4  with *formatting*.        │ │  with formatting.                │
│   5                            │ │                                  │
│   6  ## Features               │ │  Features                        │
│   7  - Item 1                  │ │  • Item 1                        │
│   8  - Item 2                  │ │  • Item 2                        │
│   9                            │ │                                  │
│  10  [█]                       │ │                                  │
│                                │ │  Live preview updates            │
│                                │ │  as you type                     │
├────────────────────────────────┴─┴──────────────────────────────────┤
│                                                                     │
│   Ln 10, Col 4        42 words        ~1 min read        Markdown  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**The split view shows:**

- **Left:** Editor with line numbers and cursor
- **Right:** Live preview that updates on every keystroke
- **Center:** Draggable divider to resize panes (default 50/50)
- **Bottom:** Status bar with cursor position, word count, and reading time

### Editor Only Mode

````
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ⬤ ⬤ ⬤    readme.md *        Markdown Viewditor              ☰        │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [B] [I] [H] [Link] [Image] [Code] [CodeBlock] [UL] [OL] [Task]  │
│  [Quote] [HR] [Strike] [Table]    [Split] [Edit] [View]           │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   1  # Hello World                                                 │
│   2                                                                │
│   3  This is **markdown** with *formatting*.                       │
│   4                                                                │
│   5  ## Features                                                   │
│   6  - Item 1                                                      │
│   7  - Item 2                                                      │
│   8                                                                │
│   9  - [ ] Task 1                                                  │
│  10 - [x] Task 2                                                   │
│  11                                                                │
│  12 This is a paragraph with a [link](https://example.com).        │
│  13                                                                │
│  14 ```javascript                                                  │
│  15 const hello = "world";                                         │
│  16 console.log(hello);                                            │
│  17 ```                                                            │
│  18                                                                │
│  19  [█]                                                           │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Ln 19, Col 1       156 words       ~1 min read        Markdown  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
````

### Viewer Only Mode (Live Preview with Outline)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ⬤ ⬤ ⬤    readme.md *        Markdown Viewditor              ☰        │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Theme: [GitHub Dark]                [Split] [Edit] [View]         │
│                                                                     │
├──────────────┬──────────────────────────────────────────────────────┤
│              │                                                      │
│  Outline     │  Hello World                                         │
│  ────────    │  ═══════════                                         │
│              │                                                      │
│  > Features  │  This is markdown with formatting.                   │
│    > Item 1  │                                                      │
│    > Item 2  │  Features                                            │
│              │  ────────                                            │
│              │  • Item 1                                            │
│              │  • Item 2                                            │
│              │                                                      │
│              │  ☐ Task 1                                            │
│              │  ☑ Task 2                                            │
│              │                                                      │
│              │  This is a paragraph with a link.                    │
│              │                                                      │
│              │  ┌─────────────────────────────────┐                │
│              │  │ const hello = "world";          │                │
│              │  │ console.log(hello);             │                │
│              │  └─────────────────────────────────┘                │
│              │                                                      │
├──────────────┴──────────────────────────────────────────────────────┤
│                                                                     │
│   156 words        ~1 min read        Theme: GitHub Dark            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

The outline sidebar shows a clickable heading tree. Collapsible on narrow screens.

---

## Components

### Title Bar

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ⬤ ⬤ ⬤    readme.md *  [↻]     Markdown Viewditor           ☰        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

- Traffic light buttons (macOS style)
- **Current filename** left of center, with `*` modified indicator
- **Reload button** `[↻]` next to filename (Lucide: `refresh-cw`)
- App name right of center
- Hamburger menu right

### Reload from Disk

The reload button reloads the file from disk, discarding any local edits.

**Appearance:**

```
          Inactive (gray)           Active (accent)
         ┌──────────────┐          ┌──────────────┐
         │    [↻]       │          │    [↻]       │
         └──────────────┘          └──────────────┘
```

- Gray and non-interactive when inactive
- Accent-colored when active
- Hidden when no file is loaded (untitled document)
- Keyboard shortcut: F5

**When is the button active?**

| Situation                                    | State    | On click                        |
| -------------------------------------------- | -------- | ------------------------------- |
| No file loaded (untitled)                    | Hidden   | —                               |
| File loaded, no changes anywhere             | Inactive | —                               |
| External change detected by file watcher     | Active   | Reload                          |
| External change + local unsaved edits        | Active   | Confirm dialog then reload      |
| User dismissed external change notification  | Active   | Reload (confirm if local edits) |
| Local unsaved edits only, no external change | Active   | Confirm dialog then reload      |

The button is active whenever there is something to reload — either an external change exists, or the user has unsaved edits they may want to discard.

**Confirmation dialog (when unsaved edits exist):**

```
┌─────────────────────────────────────────────┐
│                                             │
│  Reload file from disk?                     │
│                                             │
│  You have unsaved changes that will be      │
│  lost if you reload.                        │
│                                             │
│           [Cancel]    [Reload]              │
│                                             │
└─────────────────────────────────────────────┘
```

**File watcher — external change notification:**

When the file changes on disk while the editor is open, a banner appears:

```
┌─────────────────────────────────────────────────────────────────────┐
│  readme.md has been modified on disk.    [Reload] [Keep Editor]    │
└─────────────────────────────────────────────────────────────────────┘
```

- Clicking **Reload** loads the disk version immediately (shows confirm dialog if local edits exist)
- Clicking **Keep Editor** dismisses the banner; the reload button becomes active so the user can reload later
- The banner uses the accent color for the border-left to draw attention

### Toolbar

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  [B] [I] [H] [Link] [Image] [Code] [CodeBlock] [UL] [OL] [Task]  │
│  [Quote] [HR] [Strike] [Table]    [Split] [Edit] [View]           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Left side:** Formatting buttons (Lucide icons)
**Right side:** View mode toggle

**Button Style:**

- 32x32px
- Rounded corners (6px)
- Subtle hover effect
- Active state indicator

**Formatting Buttons (Lucide Icons):**

| Action        | Icon            | Shortcut | Tooltip                                                             |
| ------------- | --------------- | -------- | ------------------------------------------------------------------- |
| Bold          | `bold`          | Ctrl+B   | Select text and click to bold, or click to start typing bold        |
| Italic        | `italic`        | Ctrl+I   | Select text and click to italicize, or click to start typing italic |
| Strikethrough | `strikethrough` | —        | Select text and click to strike through                             |
| Heading       | `heading`       | Ctrl+H   | Adds `##` at line start. Click again to cycle H1 → H2 → H3          |
| Link          | `link`          | Ctrl+K   | Select text first to use as link text, then click                   |
| Image         | `image`         | —        | Inserts `![alt](url)` placeholder                                   |
| Inline Code   | `code`          | —        | Wraps selection in backticks                                        |
| Code Block    | `terminal`      | —        | Inserts fenced code block with language hint                        |
| Bullet List   | `list`          | —        | Adds `-` prefix. Select lines to convert to list                    |
| Numbered List | `list-ordered`  | —        | Adds `1.` prefix. Select lines to convert to list                   |
| Task List     | `list-checks`   | —        | Adds `- [ ]` checkbox                                               |
| Blockquote    | `quote`         | —        | Adds `>` prefix to selection                                        |
| Horizontal    | `minus`         | —        | Inserts `---` divider on new line                                   |
| Table         | `table`         | —        | Inserts a 3×3 markdown table template                               |

### Tooltips

Every toolbar button shows a tooltip on interaction. The tooltip explains the button's behavior and its shortcut key (if any).

**Desktop (hover):**

```
          ┌──────────────────────────────────┐
          │  Bold (Ctrl+B)                   │
  [B] ◄── │  Select text and click to bold,  │
          │  or click to start typing bold   │
          └──────────────────────────────────┘
```

- Appears after 500ms hover delay
- Positioned below the button
- Disappears on mouse leave
- Never obscures the editor content area

**Mobile (long-press):**

```
          ┌──────────────────────────────────┐
          │  Select text and tap to bold     │
  [B] ◄── │  Long-press for help             │
          └──────────────────────────────────┘
```

- Long-press (500ms) on a button shows tooltip
- Haptic feedback on trigger (if supported)
- Tap anywhere to dismiss
- First-use hint shown on app launch: _"Select text, then tap a format button to apply it"_

**Tooltip style:**

- Background: `var(--card)`
- Border: `1px solid var(--border)`
- Shadow: `var(--shadow-md)`
- Font: `var(--font-sans)` at 12px
- Max width: 240px
- Arrow pointing to parent button

### View Mode Toggle

```
[Split] [Edit] [View]
```

- Pill-shaped container
- Active button highlighted
- Smooth transition between modes

### Split Divider

```
├────────────────────────────────┬─┬──────────────────────────────────┤
│                                │ │                                  │
│   Editor pane                  │ │  Preview pane                    │
│                                │ │                                  │
```

- 6px wide draggable divider
- Cursor changes to `col-resize` on hover
- Accent-colored line when dragging
- Double-click to reset to 50/50
- Min pane width: 200px
- Ratio persisted in settings

---

## Overlays

### Find & Replace

```
┌─────────────────────────────────────┐
│  Find                    [X]        │
│  ┌───────────────────────┐ [▲] [▼] │
│  │ search term           │          │
│  └───────────────────────┘          │
│  Replace                            │
│  ┌───────────────────────┐ [Replace]│
│  │ replacement           │ [All]    │
│  └───────────────────────┘          │
│  [ ] Match case  [ ] Regex          │
└─────────────────────────────────────┘
```

- Opens via Ctrl+F (find) or Ctrl+H (find & replace)
- Floating panel at top-right of editor
- Escape to close
- Enter to find next, Shift+Enter to find previous
- Match count shown (e.g., "3 of 12")

### Command Palette

```
┌─────────────────────────────────────────────┐
│  Type a command or search...                │
├─────────────────────────────────────────────┤
│  > Toggle Bold                              │
│  > Insert Link                              │
│  > Switch to Split View                     │
│  > Open File                                │
│  > Save                                     │
│  > Toggle Theme                             │
└─────────────────────────────────────────────┘
```

- Opens via Ctrl+Shift+P (or Cmd+Shift+P)
- Fuzzy search across all commands
- Arrow keys to navigate, Enter to execute
- Escape to close
- Categories: File, Edit, View, Format

---

## Live Preview

The live preview is always active when in Split or View mode. It renders markdown in real-time as you type.

**Rendering stack:**

- `markdown-it` for parsing
- `highlight.js` for code block syntax highlighting
- Scroll sync between editor and preview (proportional)

---

## Typography

### UI Text

```
Font: Inter, -apple-system, BlinkMacSystemFont, sans-serif
Size: 14px
Weight: 400
Line Height: 1.5
```

### Editor

```
Font: JetBrains Mono, Fira Code, monospace
Size: 14px
Weight: 400
Line Height: 1.6
```

### Headings (Viewer)

```
H1: 28px, Weight 600
H2: 24px, Weight 600
H3: 20px, Weight 600
```

---

## Spacing

```
Base unit: 8px

Toolbar padding: 8px 16px
Content padding: 16px
Status bar padding: 8px 16px
Button gap: 4px
Section gap: 16px
```

---

## Shadows & Borders

### Shadows

```
Card: 0 1px 3px rgba(0, 0, 0, 0.1)
Dropdown: 0 4px 12px rgba(0, 0, 0, 0.15)
Modal: 0 8px 24px rgba(0, 0, 0, 0.2)
```

### Borders

```
Default: 1px solid var(--border)
Focus: 2px solid var(--primary)
Divider: 1px solid var(--border)
```

---

## Animations

### Transitions

```
Duration: 150ms
Easing: ease-in-out
Properties: background, color, opacity, transform
```

### Hover Effects

```
Button: background lighten 10%
Link: color darken 10%
Card: shadow increase
```

---

## Icons

**Icon set:** Lucide Icons (via `lucide-svelte`)

All toolbar and UI icons use Lucide. No emoji characters in the UI.

| Context  | Icon           |
| -------- | -------------- |
| Menu     | `menu`         |
| Settings | `settings`     |
| File     | `file`         |
| Save     | `save`         |
| Search   | `search`       |
| Close    | `x`            |
| Expand   | `chevron-down` |
| Collapse | `chevron-up`   |

---

## Interactions

### Drag and Drop

- Drag a `.md` / `.txt` file onto the window to open it
- Visual overlay shown during drag: "Drop to open file"
- Supported on all desktop platforms

### Keyboard Shortcuts

| Action            | Shortcut        |
| ----------------- | --------------- |
| New File          | Ctrl+N          |
| Open File         | Ctrl+O          |
| Save              | Ctrl+S          |
| Save As           | Ctrl+Shift+S    |
| Reload from Disk  | F5              |
| Find              | Ctrl+F          |
| Find & Replace    | Ctrl+H          |
| Command Palette   | Ctrl+Shift+P    |
| Toggle Bold       | Ctrl+B          |
| Toggle Italic     | Ctrl+I          |
| Insert Link       | Ctrl+K          |
| Toggle Split View | Ctrl+\          |
| Toggle Sidebar    | Ctrl+B (viewer) |
| Zoom In           | Ctrl+=          |
| Zoom Out          | Ctrl+-          |

---

## Responsive Behavior

### Desktop (>1024px)

- Full layout with split view
- Resizable split divider
- Outline sidebar in viewer mode
- All features visible

### Tablet (768px - 1024px)

- Toggle between views (no split)
- Touch-friendly buttons (36x36px)
- Outline sidebar collapsible
- Bottom sheet for formatting toolbar

### Mobile (<768px)

- Single pane only
- Floating action button for mode toggle (editor ↔ preview)
- Formatting toolbar as bottom sheet (swipe up to reveal)
- Virtual keyboard toolbar with essential formatting (B, I, H, Link, Code)
- No outline sidebar (use heading navigation in preview)
- Pull-down to open file picker

---

## Accessibility

### Focus States

```
Outline: 2px solid var(--primary)
Offset: 2px
```

### Color Contrast

```
Text on background: 4.5:1 minimum
Interactive elements: 3:1 minimum
```

### Keyboard Navigation

```
Tab: Move between elements
Enter/Space: Activate buttons
Escape: Close modals/overlays
Arrow keys: Navigate lists and outline
```

### Screen Reader

- All toolbar buttons have `aria-label`
- View mode toggle uses `role="tablist"`
- Live region announces file save status
- Outline navigation uses `nav` landmark

---

## Summary

**Clean:** Minimal chrome, focus on content
**Simple:** Intuitive layout, familiar patterns
**Modern:** Soft shadows, smooth transitions, generous whitespace
**Live:** Real-time preview updates on every keystroke

The design prioritizes readability and ease of use while maintaining a professional, modern aesthetic. The **live preview** feature is the core experience, providing instant feedback as you write.
