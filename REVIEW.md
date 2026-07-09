# MarkEdiViewer - Code Review & Recommendations

## Current State Assessment

### ✅ What's Working Well

1. **Project Structure**: Clean, well-organized directory structure
2. **Backend**: Tauri commands implemented correctly with proper error handling
3. **TypeScript Types**: Well-defined interfaces in `types/index.ts`
4. **CSS Design System**: Good use of CSS variables for theming
5. **Configuration**: Tauri config and capabilities properly set up

### ⚠️ Areas for Improvement

#### 1. **Frontend Implementation Issues**

**Current Issue**: `+page.svelte` uses plain textarea instead of CodeMirror

```svelte
<!-- Current (not ideal) -->
<textarea bind:value={content}></textarea>

<!-- Should be -->
<Editor bind:content />
```

**Recommendations**:

- Replace textarea with CodeMirror wrapper component
- Implement proper component architecture
- Use stores for state management instead of local state

#### 2. **Missing Component Structure**

**Current**: All code in single `+page.svelte` file

**Recommendation**: Create proper component hierarchy:

```
src/lib/components/
├── Editor/
│   ├── Editor.svelte          # CodeMirror wrapper
│   ├── EditorToolbar.svelte   # Formatting buttons
│   └── EditorStatus.svelte    # Cursor position, word count
├── Viewer/
│   ├── Viewer.svelte          # Live preview
│   ├── ViewerToolbar.svelte   # Theme selector
│   └── ThemeSelector.svelte   # Style picker
└── Layout/
    ├── AppLayout.svelte       # Main layout
    ├── StatusBar.svelte       # Bottom status
    └── ViewToggle.svelte      # Split/Editor/Viewer buttons
```

#### 3. **No State Management**

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

#### 4. **No Live Preview Implementation**

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

#### 5. **Missing Error Handling in Frontend**

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

---

## Implementation Priority

### 🔴 Critical (Phase 2)

1. **Create Editor component with CodeMirror**
2. **Implement basic live preview with markdown-it**
3. **Create proper store architecture**
4. **Extract components from +page.svelte**

### 🟡 Important (Phase 3-4)

1. **Add theme system**
2. **Implement scroll synchronization**
3. **Add file dialog integration**
4. **Create settings persistence**

### 🟢 Nice to Have (Phase 5-7)

1. **Keyboard shortcuts**
2. **Command palette**
3. **Mobile support**
4. **Advanced features**

---

## Code Quality Improvements

### 1. **Type Safety**

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

### 2. **Component Props**

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

### 3. **Event Handling**

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

### 4. **CSS Organization**

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

---

## Performance Considerations

### 1. **Markdown Parsing**

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

### 2. **CodeMirror Initialization**

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

### 3. **Memory Management**

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

---

## Security Improvements

### 1. **Path Validation**

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

### 2. **Content Sanitization**

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

## Testing Recommendations

### 1. **Unit Tests**

```typescript
// tests/markdown.test.ts
import { renderMarkdown } from "../src/lib/utils/markdown";

describe("Markdown Rendering", () => {
  it("renders headings correctly", () => {
    const result = renderMarkdown("# Hello");
    expect(result).toContain("<h1>Hello</h1>");
  });

  it("renders bold text", () => {
    const result = renderMarkdown("**bold**");
    expect(result).toContain("<strong>bold</strong>");
  });
});
```

### 2. **Component Tests**

```typescript
// tests/Editor.test.ts
import { render, screen } from "@testing-library/svelte";
import Editor from "../src/lib/components/Editor/Editor.svelte";

describe("Editor Component", () => {
  it("renders editor element", () => {
    render(Editor, { props: { content: "" } });
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});
```

---

## Next Steps

### Immediate (This Week)

1. ✅ Review PLAN.md (completed)
2. Create Editor component with CodeMirror
3. Implement basic live preview
4. Create store architecture

### Short Term (Next 2 Weeks)

1. Implement theme system
2. Add file dialog integration
3. Create settings persistence
4. Add error handling

### Long Term (Next Month)

1. Implement scroll synchronization
2. Add keyboard shortcuts
3. Create command palette
4. Test on all platforms

---

## Conclusion

The project has a solid foundation with good architecture decisions (Tauri v2 + Svelte 5). The main areas for improvement are:

1. **Component Architecture**: Move from monolithic page to proper components
2. **State Management**: Implement proper stores with Svelte 5 runes
3. **Live Preview**: Implement the core feature with markdown-it
4. **Error Handling**: Add comprehensive error handling
5. **Performance**: Optimize markdown parsing and rendering

With these improvements, MarkEdiViewer will be a robust, performant markdown editor with excellent user experience.
