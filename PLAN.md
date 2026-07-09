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

### Phase 2: Basic Editor - IN PROGRESS

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
- [ ] Create Viewer component (`Viewer.svelte`)
- [ ] Implement live preview with markdown-it
- [ ] Create Viewer store (`stores/viewer.svelte.ts`)

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

---

## Implementation Status

**Current Phase: Phase 2 - Basic Editor** (Editor done, Viewer pending)

### What Has Been Implemented

#### Project Structure

```
markediviewer/
├── src/                              # Svelte frontend
│   ├── app.html                      # HTML shell
│   ├── app.css                       # Global styles with CSS variables
│   ├── routes/
│   │   ├── +layout.svelte            # Root layout
│   │   └── +page.svelte              # Main page with basic layout
│   └── lib/
│       ├── components/               # Component directories
│       ├── stores/                   # State management
│       ├── utils/                    # Utility functions
│       └── types/
│           └── index.ts              # TypeScript type definitions
├── src-tauri/                        # Rust backend
│   ├── src/
│   │   ├── main.rs                   # Entry point
│   │   └── lib.rs                    # IPC commands & app setup
│   ├── capabilities/
│   │   └── default.json              # Security permissions
│   ├── tauri.conf.json               # Tauri configuration
│   ├── Cargo.toml                    # Rust dependencies
│   └── build.rs                      # Build script
├── package.json                      # NPM dependencies
├── svelte.config.js                  # SvelteKit configuration
├── vite.config.ts                    # Vite configuration
├── tsconfig.json                     # TypeScript configuration
└── .gitignore                        # Git ignore rules
```

#### Backend (Rust/Tauri v2)

- IPC commands implemented:
  - `read_file(path)` - Read file content
  - `write_file(path, content)` - Write file content
  - `list_files(dir)` - List directory contents
  - `create_file(path)` - Create empty file
  - `delete_file(path)` - Delete file or directory
  - `greet(name)` - Test command
- Plugins configured:
  - tauri-plugin-fs
  - tauri-plugin-dialog
  - tauri-plugin-clipboard-manager
  - tauri-plugin-store
- Security capabilities set up

#### Frontend (Svelte 5 + SvelteKit)

- Basic layout with toolbar, content area, and status bar
- View mode toggle (Split/Edit/View)
- CSS design system with dark/light theme variables
- TypeScript types for ViewMode, FileInfo, Settings, EditorState, ViewerState
- **Editor Component** (Phase 2 - DONE):
  - CodeMirror 6 integration with markdown language support
  - Syntax highlighting and line numbers
  - Real-time content tracking with cursor position
  - Keyboard shortcuts (Ctrl+B for bold, Ctrl+I for italic, Ctrl+K for link)
- **Editor Toolbar** (Phase 2 - DONE):
  - Formatting buttons for bold, italic, heading, link, image, code, lists, etc.
  - Visual feedback with hover and active states
- **Editor Store** (Phase 2 - DONE):
  - State management with Svelte 5 runes
  - Track content, cursor position, word count, and modification status
  - Helper functions for updating and resetting state

#### NOT YET IMPLEMENTED (Phase 2 remaining + Phase 3):

- **Viewer Component** (`Viewer.svelte`) - Live preview rendering
- **Viewer Store** (`stores/viewer.svelte.ts`) - Viewer state management
- **markdown-it integration** - Real-time markdown parsing and rendering
- **ThemeSelector** - Theme picker for viewer
- **Scroll synchronization** - Editor ↔ preview scroll sync

#### Build System

- Vite configured for Tauri development
- SvelteKit with static adapter
- TypeScript strict mode enabled

### Dependencies Status

#### Installed ✅ (in package.json)

- @codemirror/commands, @codemirror/lang-markdown, @codemirror/language
- @codemirror/state, @codemirror/theme-one-dark, @codemirror/view
- codemirror (v6.0.2)
- markdown-it (v14) - **installed but NOT yet integrated**
- shiki (v1) - **installed but NOT yet integrated**

#### Need to Install

- gray-matter (frontmatter parsing)
- katex (math equations)
- mermaid (diagrams)
- dompurify (HTML sanitization)

### Next Steps (to complete Phase 2 & 3)

1. **Create Viewer.svelte** - Component to render markdown-it output
2. **Create stores/viewer.svelte.ts** - Viewer state management
3. **Integrate markdown-it** - Wire up real-time rendering in `utils/markdown.ts`
4. **Create ThemeSelector.svelte** - Theme picker UI
5. **Connect Editor ↔ Viewer** - Pass content from editor store to viewer
6. **Add scroll synchronization** - Phase 5 feature

---

## Code Review & Recommendations

### What's Working Well

1. **Project Structure**: Clean, well-organized directory structure
2. **Backend**: Tauri commands implemented correctly with proper error handling
3. **TypeScript Types**: Well-defined interfaces in `types/index.ts`
4. **CSS Design System**: Good use of CSS variables for theming
5. **Configuration**: Tauri config and capabilities properly set up

### Areas for Improvement

#### 1. Viewer Component Missing

**Current Issue**: Viewer pane shows placeholder text instead of rendered markdown

**Recommendations**:

- Create `Viewer.svelte` component with markdown-it rendering
- Create `stores/viewer.svelte.ts` for viewer state
- Integrate markdown-it for real-time preview

#### 2. Component Structure

**Current**: Editor components exist, Viewer components missing

**Recommendation**: Create Viewer component hierarchy:

```
src/lib/components/
├── Editor/
│   ├── Editor.svelte          # CodeMirror wrapper ✅ DONE
│   ├── EditorToolbar.svelte   # Formatting buttons ✅ DONE
│   └── EditorStatus.svelte    # Cursor position, word count (optional)
├── Viewer/
│   ├── Viewer.svelte          # Live preview ❌ TODO
│   ├── ViewerToolbar.svelte   # Theme selector ❌ TODO
│   └── ThemeSelector.svelte   # Style picker ❌ TODO
└── Layout/
    ├── AppLayout.svelte       # Main layout
    ├── StatusBar.svelte       # Bottom status
    └── ViewToggle.svelte      # Split/Editor/Viewer buttons
```

#### 3. No State Management

**Current**: Local `$state()` in `+page.svelte`

**Recommendation**: Create proper stores:

```typescript
// stores/editor.svelte.ts
export const editorState = $state({
  content: "",
  cursorLine: 0,
  cursorCol: 0,
  wordCount: 0,
  isModified: false,
});

// stores/settings.svelte.ts
export const settings = $state({
  viewMode: "split",
  editorFontSize: 14,
  viewerTheme: "github-dark",
  splitRatio: 0.5,
});
```

#### 4. No Live Preview Implementation

**Current**: Placeholder text in viewer pane

**Recommendation**: Implement markdown-it integration:

```typescript
// utils/markdown.ts
import MarkdownIt from "markdown-it";

export const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

export function renderMarkdown(content: string): string {
  return md.render(content);
}
```

#### 5. Missing Error Handling in Frontend

**Current**: Basic try-catch in saveFile function

**Recommendation**: Create error handling utility:

```typescript
// utils/errors.ts
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

export function showError(message: string) {
  // Show toast notification
  console.error(message);
}
```

### Implementation Priority

#### 🔴 Critical (Phase 2)

1. ~~**Create Editor component with CodeMirror**~~ ✅ DONE
2. ~~**Create proper store architecture**~~ ✅ DONE
3. ~~**Extract components from +page.svelte**~~ ✅ DONE (Editor extracted)
4. **Create Viewer component with markdown-it** ❌ TODO
5. **Implement basic live preview** ❌ TODO

#### 🟡 Important (Phase 3-4)

1. **Add theme system**
2. **Implement scroll synchronization**
3. **Add file dialog integration**
4. **Create settings persistence**

#### 🟢 Nice to Have (Phase 5-7)

1. ~~**Keyboard shortcuts**~~ ✅ DONE (Ctrl+B, Ctrl+I, Ctrl+K)
2. **Command palette**
3. **Mobile support**
4. **Advanced features**

### Code Quality Improvements

#### 1. Type Safety

**Current**: Some `any` types possible

**Recommendation**: Strict TypeScript:

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

#### 2. Component Props

**Current**: No props validation

**Recommendation**: Use Svelte 5 props:

```svelte
<script lang="ts">
  interface Props {
    content: string;
    viewMode: 'split' | 'editor' | 'viewer';
    onContentChange?: (content: string) => void;
  }

  let { content = $bindable(''), viewMode = 'split', onContentChange }: Props = $props();
</script>
```

#### 3. Event Handling

**Current**: Inline event handlers

**Recommendation**: Extract to named functions:

```svelte
<script>
  function handleSave() {
    // Save logic
  }

  function handleViewModeChange(mode: ViewMode) {
    viewMode = mode;
  }
</script>

<button onclick={handleSave}>Save</button>
```

#### 4. CSS Organization

**Current**: Styles in component file

**Recommendation**: Consider CSS modules or utility classes:

```svelte
<style>
  /* Use CSS custom properties consistently */
  .button {
    background: var(--accent);
    color: white;
    border-radius: var(--radius-sm);
    transition: all 150ms ease-in-out;
  }

  .button:hover {
    opacity: 0.9;
  }
</style>
```

### Performance Considerations

#### 1. Markdown Parsing

**Issue**: Parsing on every keystroke is expensive

**Solution**: Debounce parsing:

```typescript
import { debounce } from "lodash-es";

const debouncedParse = debounce((content: string) => {
  html = md.render(content);
}, 150);

$effect(() => {
  debouncedParse(content);
});
```

#### 2. CodeMirror Initialization

**Issue**: Re-initializing editor on every render

**Solution**: Use `$effect()` with proper cleanup:

```typescript
let editorView: EditorView;

$effect(() => {
  editorView = new EditorView({
    doc: content,
    extensions: [/* ... */],
    parent: editorElement,
  });

  return () => {
    editorView.destroy();
  };
});
```

#### 3. Memory Management

**Issue**: Potential memory leaks

**Solution**: Proper cleanup in components:

```svelte
<script>
  import { onMount, onDestroy } from 'svelte';

  let editorView: EditorView;

  onDestroy(() => {
    editorView?.destroy();
  });
</script>
```

### Security Improvements

#### 1. Path Validation

**Current**: Direct file path usage

**Recommendation**: Validate paths:

```typescript
function validatePath(path: string): boolean {
  // Prevent path traversal
  if (path.includes("..")) return false;
  // Ensure path is within allowed directories
  return true;
}
```

#### 2. Content Sanitization

**Current**: Rendering raw HTML from markdown

**Recommendation**: Sanitize HTML:

```typescript
import DOMPurify from "dompurify";

export function renderMarkdown(content: string): string {
  const rawHtml = md.render(content);
  return DOMPurify.sanitize(rawHtml);
}
```

---

## Implementation Examples

### Editor Component

Create file: `src/lib/components/Editor/Editor.svelte`

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, basicSetup } from 'codemirror';
  import { markdown } from '@codemirror/lang-markdown';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { EditorState } from '@codemirror/state';

  interface Props {
    content?: string;
    onContentChange?: (content: string) => void;
  }

  let { content = $bindable(''), onContentChange }: Props = $props();

  let editorElement: HTMLDivElement;
  let editorView: EditorView;

  onMount(() => {
    editorView = new EditorView({
      doc: content,
      extensions: [
        basicSetup,
        markdown(),
        oneDark,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            content = update.state.doc.toString();
            onContentChange?.(content);
          }
        })
      ],
      parent: editorElement
    });
  });

  onDestroy(() => {
    editorView?.destroy();
  });

  export function insertText(text: string) {
    const { from, to } = editorView.state.selection.main;
    editorView.dispatch({
      changes: { from, to, insert: text }
    });
  }

  export function getCursorPos() {
    return editorView.state.selection.main.head;
  }
</script>

<div bind:this={editorElement} class="editor-container"></div>

<style>
  .editor-container {
    width: 100%;
    height: 100%;
    overflow: auto;
  }

  .editor-container :global(.cm-editor) {
    height: 100%;
    font-family: var(--font-mono);
    font-size: 14px;
  }

  .editor-container :global(.cm-content) {
    padding: 16px;
  }
</style>
```

### Editor Store

Create file: `src/lib/stores/editor.svelte.ts`

```typescript
export const editorState = $state({
  content: "",
  cursorLine: 1,
  cursorCol: 1,
  wordCount: 0,
  isModified: false,
});

export function updateContent(content: string) {
  editorState.content = content;
  editorState.isModified = true;
  updateWordCount();
}

export function updateCursor(line: number, col: number) {
  editorState.cursorLine = line;
  editorState.cursorCol = col;
}

function updateWordCount() {
  const words = editorState.content.trim().split(/\s+/).filter(Boolean);
  editorState.wordCount = words.length;
}

export function resetModified() {
  editorState.isModified = false;
}
```

### Markdown Utility

Create file: `src/lib/utils/markdown.ts`

```typescript
import MarkdownIt from "markdown-it";

export const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

export function renderMarkdown(content: string): string {
  try {
    return md.render(content);
  } catch (error) {
    console.error("Markdown parse error:", error);
    return "<p>Error rendering markdown</p>";
  }
}
```

### Viewer Component

Create file: `src/lib/components/Viewer/Viewer.svelte`

```svelte
<script lang="ts">
  import { renderMarkdown } from '$lib/utils/markdown';

  interface Props {
    content: string;
    theme?: string;
  }

  let { content, theme = 'github-dark' }: Props = $props();

  let html = $derived(renderMarkdown(content));
</script>

<div class="viewer-container" data-theme={theme}>
  <div class="viewer-content">
    {@html html}
  </div>
</div>

<style>
  .viewer-container {
    width: 100%;
    height: 100%;
    overflow: auto;
    padding: 16px;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .viewer-content {
    max-width: 800px;
    margin: 0 auto;
    line-height: 1.6;
  }

  .viewer-content :global(h1) {
    font-size: 2em;
    margin-bottom: 0.5em;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.3em;
  }

  .viewer-content :global(h2) {
    font-size: 1.5em;
    margin-top: 1em;
    margin-bottom: 0.5em;
  }

  .viewer-content :global(p) {
    margin-bottom: 1em;
  }

  .viewer-content :global(code) {
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 0.9em;
  }

  .viewer-content :global(pre) {
    background: var(--bg-tertiary);
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    margin-bottom: 1em;
  }

  .viewer-content :global(pre code) {
    background: none;
    padding: 0;
  }

  .viewer-content :global(ul),
  .viewer-content :global(ol) {
    margin-bottom: 1em;
    padding-left: 2em;
  }

  .viewer-content :global(li) {
    margin-bottom: 0.25em;
  }

  .viewer-content :global(blockquote) {
    border-left: 4px solid var(--accent);
    padding-left: 1em;
    margin-left: 0;
    margin-bottom: 1em;
    color: var(--text-secondary);
  }

  .viewer-content :global(a) {
    color: var(--accent);
    text-decoration: none;
  }

  .viewer-content :global(a:hover) {
    text-decoration: underline;
  }

  .viewer-content :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
  }

  .viewer-content :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1em;
  }

  .viewer-content :global(th),
  .viewer-content :global(td) {
    border: 1px solid var(--border);
    padding: 8px 12px;
    text-align: left;
  }

  .viewer-content :global(th) {
    background: var(--bg-tertiary);
    font-weight: 600;
  }

  .viewer-content :global(hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: 2em 0;
  }
</style>
```

### Main Page Example

Update file: `src/routes/+page.svelte`

```svelte
<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import Editor from '$lib/components/Editor/Editor.svelte';
  import Viewer from '$lib/components/Viewer/Viewer.svelte';
  import { editorState, updateContent, resetModified } from '$lib/stores/editor.svelte';

  let viewMode = $state<'split' | 'editor' | 'viewer'>('split');

  async function saveFile() {
    try {
      await invoke('write_file', { path: 'test.md', content: editorState.content });
      resetModified();
      console.log('File saved');
    } catch (error) {
      console.error('Failed to save:', error);
    }
  }

  function handleContentChange(content: string) {
    updateContent(content);
  }
</script>

<div class="app">
  <header class="toolbar">
    <div class="toolbar-left">
      <span class="app-name">MarkEdiViewer</span>
    </div>
    <div class="toolbar-center">
      <div class="view-toggle">
        <button
          class:active={viewMode === 'split'}
          onclick={() => (viewMode = 'split')}
        >
          Split
        </button>
        <button
          class:active={viewMode === 'editor'}
          onclick={() => (viewMode = 'editor')}
        >
          Edit
        </button>
        <button
          class:active={viewMode === 'viewer'}
          onclick={() => (viewMode = 'viewer')}
        >
          View
        </button>
      </div>
    </div>
    <div class="toolbar-right">
      <button onclick={saveFile}>
        Save
        {#if editorState.isModified}
          <span class="modified-indicator">●</span>
        {/if}
      </button>
    </div>
  </header>

  <main class="content" class:split={viewMode === 'split'} class:editor-only={viewMode === 'editor'} class:viewer-only={viewMode === 'viewer'}>
    {#if viewMode === 'split' || viewMode === 'editor'}
      <div class="editor-pane">
        <Editor
          bind:content={editorState.content}
          onContentChange={handleContentChange}
        />
      </div>
    {/if}

    {#if viewMode === 'split' || viewMode === 'viewer'}
      <div class="viewer-pane">
        <Viewer content={editorState.content} />
      </div>
    {/if}
  </main>

  <footer class="statusbar">
    <span>Ln {editorState.cursorLine}, Col {editorState.cursorCol}</span>
    <span>{editorState.wordCount} words</span>
    <span>UTF-8</span>
    <span>Markdown</span>
  </footer>
</div>

<style>
  /* ... existing styles ... */

  .modified-indicator {
    color: var(--accent);
    margin-left: 4px;
  }
</style>
```

### Testing the Implementation

#### 1. Run Development Server

```bash
npm run dev
```

#### 2. Test Editor Features

- [x] Type markdown text
- [x] See syntax highlighting
- [ ] Verify live preview updates (Viewer not implemented)
- [x] Test save functionality

#### 3. Test View Modes

- [ ] Split mode shows editor and preview (Viewer placeholder only)
- [x] Editor mode shows only editor
- [ ] Viewer mode shows only preview (Viewer not implemented)

### Common Issues & Solutions

#### Issue: CodeMirror not rendering

**Solution**: Ensure the parent element has a defined height:

```css
.editor-container {
  height: 100%;
  min-height: 200px;
}
```

#### Issue: Live preview not updating

**Cause**: Viewer component not yet implemented. Currently shows placeholder text.

**Solution**: Create `Viewer.svelte` component with markdown-it integration:

```typescript
let html = $derived(renderMarkdown(content));
```

#### Issue: Styles not applying to preview

**Solution**: Use `:global()` selector for HTML content:

```css
.viewer-content :global(h1) {
  /* styles */
}
```

### Resources

- [CodeMirror 6 Documentation](https://codemirror.net/6/docs/)
- [markdown-it Documentation](https://markdown-it.github.io/)
- [Svelte 5 Runes](https://svelte.dev/blog/runes)
- [Tauri v2 Documentation](https://v2.tauri.app/)
