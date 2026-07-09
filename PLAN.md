# MarkEdiViewer - Development Plan

## Project Overview

**MarkEdiViewer** is a cross-platform markdown editor and viewer with **live preview**, built with Tauri v2 + Svelte 5, supporting Linux, macOS, Windows, Android, and iOS.

---

## Use Cases

### UC1: Create New File

- User creates a new markdown file
- Starts in editor mode with empty document
- **Live preview** shows rendered output as they type
- Can save to disk

### UC2: Edit Existing File

- User opens an existing markdown file
- Content loaded into editor
- **Live preview** updates in real-time
- Can modify and save changes

### UC3: View Existing File

- User opens a file in view-only mode
- Rendered markdown displayed with chosen theme
- Can switch themes/styles
- **Live preview** mode available for editing

### UC4: File Management

- Open files via system dialog or drag-and-drop
- Recent files list for quick access
- Auto-save functionality (optional)
- Export to HTML/PDF

---

## Key Feature: Live Preview

**Live preview** is the core feature of MarkEdiViewer. As the user types in the editor, the viewer immediately shows the rendered markdown. This provides:

1. **Instant feedback** - See formatting as you write
2. **Reduced errors** - Catch formatting mistakes immediately
3. **Faster workflow** - No need to switch between editor and preview
4. **Better understanding** - Learn markdown by seeing results instantly

### How It Works

```
User types → Editor content changes → Markdown parsed → Viewer updated
     ↓                                              ↓
  Keystroke                                      Rendered
  (instant)                                     (instant)
```

The preview is "live" because it updates on every keystroke, not on save or button press.

### Performance Considerations

- **Debounce parsing**: Wait 150ms after last keystroke before parsing
- **Incremental updates**: Only re-render changed sections when possible
- **Virtual scrolling**: For large documents, only render visible portion
- **Web Workers**: Offload markdown parsing to avoid UI blocking

---

## Architecture

### Frontend Structure

```
src/
├── lib/
│   ├── components/
│   │   ├── Editor/
│   │   │   ├── Editor.svelte          # CodeMirror wrapper
│   │   │   ├── EditorToolbar.svelte   # Formatting buttons
│   │   │   └── EditorStatus.svelte    # Cursor position, word count
│   │   ├── Viewer/
│   │   │   ├── Viewer.svelte          # Live preview (rendered markdown)
│   │   │   ├── ViewerToolbar.svelte   # Theme selector
│   │   │   └── ThemeSelector.svelte   # Style picker
│   │   ├── Layout/
│   │   │   ├── AppLayout.svelte       # Main layout
│   │   │   ├── StatusBar.svelte       # Bottom status
│   │   │   └── ViewToggle.svelte      # Split/Editor/Viewer buttons
│   │   └── shared/
│   │       └── Button.svelte
│   ├── stores/
│   │   ├── editor.svelte.ts           # Editor state
│   │   ├── viewer.svelte.ts           # Viewer state
│   │   ├── file.svelte.ts             # File operations
│   │   └── settings.svelte.ts         # User preferences
│   ├── utils/
│   │   ├── markdown.ts                # Markdown parsing (live)
│   │   ├── scroll-sync.ts             # Scroll synchronization
│   │   └── themes.ts                  # Viewer themes
│   └── types/
│       └── index.ts                   # TypeScript types
├── routes/
│   ├── +layout.svelte                 # Root layout
│   └── +page.svelte                   # Main page
└── app.html
```

### Component Communication Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                     AppLayout.svelte                        │
│  ┌─────────────────┐       ┌─────────────────┐             │
│  │   Editor.svelte │       │  Viewer.svelte  │             │
│  │                 │       │                 │             │
│  │  content ───────┼───────┼──→ markdown-it  │             │
│  │  cursorPos ─────┼───────┼──→ scrollSync   │             │
│  │                 │       │                 │             │
│  └─────────────────┘       └─────────────────┘             │
│           │                       │                         │
│           └───────────────────────┘                         │
│                    ↓                                        │
│            stores/editor.svelte.ts                          │
│            stores/viewer.svelte.ts                          │
└─────────────────────────────────────────────────────────────┘
```

### State Management (Svelte 5 Runes)

```typescript
// stores/editor.svelte.ts
export const editorState = $state({
  content: "",
  cursorLine: 0,
  cursorCol: 0,
  wordCount: 0,
  isModified: false,
});

// Derived values
export const previewHtml = $derived(markdownIt.render(editorState.content));
```

### Backend Structure (Rust)

```
src-tauri/
├── src/
│   ├── lib.rs                         # IPC commands
│   ├── commands/
│   │   ├── file.rs                    # File operations
│   │   └── settings.rs                # Settings persistence
│   └── state.rs                       # Application state
├── capabilities/
│   └── default.json                   # Permissions
├── Cargo.toml
└── tauri.conf.json
```

---

## Key Features

### 1. Editor (CodeMirror 6)

**Core Features:**

- Syntax highlighting for markdown
- Line numbers
- Auto-indentation
- Undo/redo
- Find & replace
- Multiple cursors

**Formatting Toolbar:**

- Bold (`**text**`)
- Italic (`*text*`)
- Heading (`## `)
- Link (`[text](url)`)
- Image (`![alt](url)`)
- Code (`` `code` ``)
- Code block (` ` ```)
- Bullet list (`- `)
- Numbered list (`1. `)
- Task list (`- [ ] `)
- Blockquote (`> `)
- Horizontal rule (`---`)
- Table

**Keyboard Shortcuts:**

- `Ctrl+B`: Bold
- `Ctrl+I`: Italic
- `Ctrl+K`: Insert link
- `Ctrl+S`: Save
- `Ctrl+Shift+P`: Command palette

### 2. Live Preview (Viewer)

**Features:**

- **Real-time rendering** - Updates on every keystroke
- Syntax highlighting for code blocks
- Task list checkboxes (interactive)
- Images displayed inline
- Links clickable
- Math equations (KaTeX)
- Diagrams (Mermaid)

**Theme System:**

- Multiple built-in themes:
  - GitHub Dark
  - GitHub Light
  - Solarized Dark
  - Solarized Light
  - Dracula
  - Nord
  - One Dark
  - One Light
- Custom CSS support
- Theme persisted in settings

### 3. Scroll Synchronization

**Implementation:**

- Map editor line numbers to viewer DOM positions
- On editor scroll → calculate visible lines → scroll viewer to same lines
- On viewer scroll → calculate visible lines → scroll editor to same lines
- Use requestAnimationFrame for smooth updates
- Debounce to prevent feedback loops

### 4. File Operations

**Tauri Commands:**

```rust
#[tauri::command]
async fn read_file(path: String) -> Result<String, AppError>

#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), AppError>

#[tauri::command]
async fn list_files(dir: String) -> Result<Vec<FileInfo>, AppError>

#[tauri::command]
async fn create_file(path: String) -> Result<(), AppError>

#[tauri::command]
async fn delete_file(path: String) -> Result<(), AppError>
```

### 5. Settings Persistence

**Settings Schema:**

```typescript
interface Settings {
  viewMode: "split" | "editor" | "viewer";
  editorFontSize: number;
  editorFontFamily: string;
  editorLineNumbers: boolean;
  editorWordWrap: boolean;
  viewerTheme: string;
  splitRatio: number; // 0.0 to 1.0
  lastOpenedFile: string | null;
  recentFiles: string[];
}
```

---

## Implementation Phases

### Phase 1: Project Setup - COMPLETED ✅

- [x] Initialize Tauri v2 project with Svelte 5
- [x] Configure build system
- [x] Set up project structure
- [x] Install dependencies

### Phase 2: Basic Editor - COMPLETED ✅

- [x] Integrate CodeMirror 6
  - Create `Editor.svelte` wrapper component
  - Configure markdown language support
  - Add line numbers and gutters
  - Set up syntax highlighting
- [x] Implement basic editing
  - Create `stores/editor.svelte.ts` for state management
  - Track content changes with `$state()`
  - Calculate word count and cursor position
- [x] Add syntax highlighting
  - Use `@codemirror/lang-markdown`
  - Configure markdown-specific highlighting
- [x] Create editor toolbar
  - Create `EditorToolbar.svelte`
  - Add formatting buttons (Bold, Italic, Heading, etc.)
  - Implement formatting actions using CodeMirror commands

**Implementation Notes:**

```typescript
// Editor.svelte - CodeMirror integration pattern
import { EditorView, basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";

let editorView: EditorView;

$effect(() => {
  editorView = new EditorView({
    doc: content,
    extensions: [
      basicSetup,
      markdown(),
      oneDark,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          content = update.state.doc.toString();
        }
      }),
    ],
    parent: editorElement,
  });
});
```

### Phase 3: Live Preview

- [ ] Integrate markdown-it
  - Configure with HTML, linkify, typographer options
  - Add plugins for tables, task lists, footnotes
- [ ] Add Shiki syntax highlighting
  - Configure for code blocks
  - Support multiple themes
- [ ] Implement **real-time rendering**
  - Use `$derived()` for reactive preview
  - Debounce parsing (150ms) for performance
  - Update preview on content change
- [ ] Create theme selector
  - Create `ThemeSelector.svelte`
  - Load themes from `utils/themes.ts`
  - Persist selection in settings

**Implementation Notes:**

```typescript
// utils/markdown.ts
import MarkdownIt from "markdown-it";
import { fromHighlighter } from "markdown-it-shiki";
import { createHighlighter } from "shiki";

const highlighter = await createHighlighter({
  themes: ["github-dark", "github-light"],
  langs: ["javascript", "typescript", "python", "rust", "css", "html"],
});

export const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
}).use(fromHighlighter(highlighter, {}));
```

### Phase 4: Layout & Navigation

- [ ] Implement three-pane layout
  - Create `AppLayout.svelte`
  - Use CSS Grid for responsive layout
  - Handle split/editor/viewer modes
- [ ] Add view mode toggle
  - Create `ViewToggle.svelte`
  - Persist mode in settings
- [ ] Implement file operations
  - Create `stores/file.svelte.ts`
  - Integrate Tauri dialog plugin
  - Handle open/save/save-as flows
  - Add recent files tracking

**Implementation Notes:**

```svelte
<!-- AppLayout.svelte -->
<script>
  let { viewMode = $bindable('split') } = $props();
</script>

<div class="layout" class:split={viewMode === 'split'}>
  {#if viewMode === 'split' || viewMode === 'editor'}
    <Editor bind:content />
  {/if}
  {#if viewMode === 'split' || viewMode === 'viewer'}
    <Viewer {content} />
  {/if}
</div>
```

### Phase 5: Scroll Synchronization

- [ ] Implement editor → preview sync
  - Map editor line numbers to viewer DOM positions
  - Use `requestAnimationFrame` for smooth updates
  - Handle edge cases (images, code blocks)
- [ ] Implement preview → editor sync
  - Track viewer scroll position
  - Calculate corresponding editor line
  - Scroll editor to match
- [ ] Handle edge cases
  - Large documents
  - Dynamic content (images loading)
  - Feedback loop prevention
- [ ] Optimize performance
  - Throttle scroll events
  - Cache DOM positions
  - Use intersection observer

**Implementation Notes:**

```typescript
// utils/scroll-sync.ts
export function createScrollSync(editor: EditorView, viewer: HTMLElement) {
  let isSyncing = false;

  editor.scrollDOM.addEventListener("scroll", () => {
    if (isSyncing) return;
    isSyncing = true;

    requestAnimationFrame(() => {
      const line = getVisibleLine(editor);
      const target = viewer.querySelector(`[data-line="${line}"]`);
      target?.scrollIntoView({ block: "start" });

      setTimeout(() => {
        isSyncing = false;
      }, 100);
    });
  });
}
```

### Phase 6: Settings & Persistence

- [ ] Create settings store
  - Create `stores/settings.svelte.ts`
  - Use `$state()` for reactive settings
  - Type-safe with TypeScript interface
- [ ] Implement Tauri Store integration
  - Load settings on app start
  - Save settings on change
  - Handle defaults gracefully
- [ ] Save/restore window state
  - Window size and position
  - Last opened file
  - View mode
- [ ] Persist user preferences
  - Editor font size
  - Theme selection
  - Split ratio

**Implementation Notes:**

```typescript
// stores/settings.svelte.ts
import { Store } from "@tauri-apps/plugin-store";

const store = await Store.load("settings.json");

export const settings = $state({
  viewMode: "split",
  editorFontSize: 14,
  viewerTheme: "github-dark",
  splitRatio: 0.5,
  lastOpenedFile: null,
  recentFiles: [],
});

export async function loadSettings() {
  const saved = await store.get("settings");
  if (saved) Object.assign(settings, saved);
}

export async function saveSettings() {
  await store.set("settings", { ...settings });
  await store.save();
}
```

### Phase 7: Polish & Testing

- [ ] Add keyboard shortcuts
  - Ctrl+B: Bold
  - Ctrl+I: Italic
  - Ctrl+K: Insert link
  - Ctrl+S: Save
  - Ctrl+Shift+P: Command palette
- [ ] Implement command palette
  - Fuzzy search for commands
  - Recent files
  - Settings
- [ ] Add error handling
  - File not found
  - Permission denied
  - Parse errors
  - Graceful degradation
- [ ] Test on all platforms
  - Linux (Ubuntu, Fedora)
  - macOS (latest)
  - Windows (10, 11)
  - Android (if mobile support needed)
  - iOS (if mobile support needed)

### Phase 8: Mobile Support (Optional)

- [ ] Android initialization
  - `cargo tauri android init`
  - Configure AndroidManifest.xml
  - Test on emulator/device
- [ ] iOS initialization
  - `cargo tauri ios init`
  - Configure Info.plist
  - Test on simulator/device
- [ ] Mobile-specific UI
  - Touch-friendly buttons
  - Bottom toolbar
  - Swipe gestures
  - Virtual keyboard handling

---

## Dependencies

### Frontend (package.json)

```json
{
  "dependencies": {
    "@codemirror/view": "^6.x",
    "@codemirror/state": "^6.x",
    "@codemirror/lang-markdown": "^6.x",
    "@codemirror/language": "^6.x",
    "@codemirror/commands": "^6.x",
    "@codemirror/theme-one-dark": "^6.x",
    "markdown-it": "^14.x",
    "shiki": "^1.x",
    "gray-matter": "^4.x",
    "katex": "^0.16.x",
    "mermaid": "^10.x"
  }
}
```

### Backend (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"
tauri-plugin-clipboard-manager = "2"
tauri-plugin-store = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
```

---

## Error Handling Strategy

### Frontend Error Handling

```typescript
// lib/utils/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

// Usage in components
try {
  await invoke("read_file", { path });
} catch (error) {
  if (error instanceof AppError) {
    showErrorToast(error.message);
  } else {
    showErrorToast("An unexpected error occurred");
  }
}
```

### Backend Error Handling

```rust
// Already implemented in lib.rs
#[derive(Debug, Error)]
enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Not found: {0}")]
    NotFound(String),
}
```

### Error Types to Handle

- File not found
- Permission denied
- File already exists
- Invalid path
- Parse errors (markdown)
- Network errors (if cloud sync added)
- Storage errors (settings persistence)

---

## Performance Optimization

### Markdown Parsing

- **Debounce**: Wait 150ms after last keystroke
- **Web Workers**: Offload parsing to background thread
- **Caching**: Cache parsed HTML for unchanged content
- **Incremental**: Only re-parse changed sections (future optimization)

### Rendering

- **Virtual Scrolling**: For documents > 1000 lines
- **Lazy Loading**: Images loaded on scroll
- **DOM Recycling**: Reuse DOM nodes for list items

### Memory Management

- **Dispose CodeMirror**: Clean up on component destroy
- **Clear Cache**: Release memory when files close
- **Limit Recent Files**: Keep max 10 recent files

---

## Accessibility Requirements

### Keyboard Navigation

- **Tab Order**: Logical tab sequence
- **Focus Indicators**: Visible focus ring (2px solid accent)
- **Shortcuts**: All actions accessible via keyboard
- **Skip Links**: Skip to main content

### Screen Reader Support

- **ARIA Labels**: All interactive elements labeled
- **Live Regions**: Announce content changes
- **Roles**: Proper semantic roles
- **Landmarks**: Header, main, footer

### Color Contrast

- **Text on Background**: 4.5:1 minimum ratio
- **Interactive Elements**: 3:1 minimum ratio
- **Focus Indicators**: High contrast mode support

### Motor Accessibility

- **Click Targets**: Minimum 44x44px
- **Spacing**: Adequate space between interactive elements
- **No Time Limits**: No time-based interactions

---

## Security Considerations

### File System Access

- **Capabilities**: Only grant necessary permissions
- **Sandboxing**: Restrict file access to user directories
- **Path Validation**: Prevent path traversal attacks

### Content Security Policy

```json
{
  "csp": "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"
}
```

### Data Handling

- **No Telemetry**: No data collection
- **Local Storage**: All data stored locally
- **Encryption**: Optional file encryption (future)

---

## Testing Strategy

### Unit Tests

- Markdown parsing functions
- Scroll sync logic
- Settings management
- File operations

### Integration Tests

- Component interactions
- Store updates
- Tauri IPC communication

### E2E Tests

- Full user workflows
- File operations
- Theme switching
- View mode changes

### Platform Testing

- **Linux**: Ubuntu 22.04+, Fedora 38+
- **macOS**: Ventura, Sonoma
- **Windows**: 10, 11
- **Android**: API 33+ (if mobile)
- **iOS**: 16+ (if mobile)

---

## Future Enhancements

### Phase 9: Advanced Features (Future)

- [ ] File tree sidebar
- [ ] Multiple tabs
- [ ] Split editor (multiple views)
- [ ] Find in files
- [ ] Git integration
- [ ] Export to PDF
- [ ] Cloud sync
- [ ] Collaborative editing
- [ ] Plugin system
- [ ] Custom themes

### Phase 10: Performance (Future)

- [ ] Web Worker for parsing
- [ ] Virtual DOM for viewer
- [ ] Lazy loading for large files
- [ ] Memory optimization

---

## Success Criteria

- [ ] Create, edit, save markdown files
- [ ] **Live preview** updates on every keystroke
- [ ] Split view with synchronized scrolling
- [ ] Multiple viewer themes
- [ ] Persist user preferences
- [ ] Works on all target platforms
- [ ] Responsive layout
- [ ] Accessible (keyboard navigation)
- [ ] Error handling for all operations
- [ ] Performance: < 100ms for preview update
- [ ] Memory: < 200MB for 10MB file
