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
- Code block (``` ``` ```)
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
  viewMode: 'split' | 'editor' | 'viewer';
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

### Phase 1: Project Setup - COMPLETED
- [x] Initialize Tauri v2 project with Svelte 5
- [x] Configure build system
- [x] Set up project structure
- [x] Install dependencies

### Phase 2: Basic Editor
- [ ] Integrate CodeMirror 6
- [ ] Implement basic editing
- [ ] Add syntax highlighting
- [ ] Create editor toolbar

### Phase 3: Live Preview
- [ ] Integrate markdown-it
- [ ] Add Shiki syntax highlighting
- [ ] Implement **real-time rendering**
- [ ] Create theme selector

### Phase 4: Layout & Navigation
- [ ] Implement three-pane layout
- [ ] Add view mode toggle (Split/Editor/Viewer)
- [ ] Implement file operations

### Phase 5: Scroll Synchronization
- [ ] Implement editor → preview sync
- [ ] Implement preview → editor sync
- [ ] Handle edge cases
- [ ] Optimize performance

### Phase 6: Settings & Persistence
- [ ] Create settings store
- [ ] Implement Tauri Store integration
- [ ] Save/restore window state
- [ ] Persist user preferences

### Phase 7: Polish & Testing
- [ ] Add keyboard shortcuts
- [ ] Implement command palette
- [ ] Add error handling
- [ ] Test on all platforms

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

## Success Criteria

- [ ] Create, edit, save markdown files
- [ ] **Live preview** updates on every keystroke
- [ ] Split view with synchronized scrolling
- [ ] Multiple viewer themes
- [ ] Persist user preferences
- [ ] Works on all target platforms
- [ ] Responsive layout
- [ ] Accessible (keyboard navigation)
