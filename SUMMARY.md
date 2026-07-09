# MarkEdiViewer - Plan Summary

## What We're Building

**MarkEdiViewer** - A cross-platform markdown editor and viewer with **live preview**:
- **Three use cases**: Create, Edit, View markdown files
- **Live preview**: See rendered markdown as you type
- **Linked editor/viewer**: Synchronized scrolling
- **Multiple themes**: 8 built-in themes + custom CSS
- **Persistent settings**: View mode, theme, preferences saved

## Key Feature: Live Preview

**Live preview** is the core feature of MarkEdiViewer. As you type in the editor, the preview immediately shows the rendered markdown. This provides:

1. **Instant feedback** - See formatting as you write
2. **Reduced errors** - Catch formatting mistakes immediately
3. **Faster workflow** - No need to switch between editor and preview
4. **Better understanding** - Learn markdown by seeing results instantly

## GUI Design Recommendation

**Three-Pane Layout** with live preview:

```
┌─────────────────────────────────────────────────────────────────┐
│  Toolbar                                    [Split][Edit][View] │
├────────────────────────────────┬────────────────────────────────┤
│  Editor                        │  Live Preview                 │
│  (CodeMirror)                  │  (Rendered MD)                │
│                                │                               │
├────────────────────────────────┴────────────────────────────────┤
│  Status: Line X, Col Y | Words: Z | UTF-8 | Markdown           │
└─────────────────────────────────────────────────────────────────┘
```

**Why this design?**
1. Familiar layout (VS Code, Obsidian, Notion)
2. **Live preview** while editing
3. Flexible view modes (Split/Editor/Viewer)
4. All features visible and accessible

## Key Features

| Feature | Description |
|---------|-------------|
| **Editor** | CodeMirror 6 with syntax highlighting, toolbar |
| **Live Preview** | Real-time markdown rendering with theme support |
| **Scroll Sync** | Bidirectional synchronized scrolling |
| **Themes** | 8 built-in themes (GitHub, Solarized, Dracula, etc.) |
| **Settings** | Persisted via Tauri Store plugin |

## Implementation Phases

1. **Project Setup** - Initialize Tauri v2 + Svelte 5
2. **Basic Editor** - CodeMirror integration
3. **Live Preview** - Real-time markdown rendering with themes
4. **Layout** - Three-pane layout with view modes
5. **Scroll Sync** - Bidirectional synchronization
6. **Settings** - Persistence via Tauri Store
7. **Polish** - Keyboard shortcuts, error handling

## Next Steps

1. Review the plan documents:
   - `PLAN.md` - Full development plan
   - `GUI-DESIGN.md` - Detailed GUI design

2. Approve the design direction

3. Start implementation

---

**Do you approve this plan? Should we proceed with implementation?**
