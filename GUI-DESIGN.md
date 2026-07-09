# MarkEdiViewer - GUI Design Document

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
Background:    #1a1a2e
Surface:       #16213e
Card:          #0f3460
Primary:       #e94560
Text:          #eaeaea
Text Muted:    #8892b0
Border:        #233554
```

### Light Theme

```
Background:    #fafafa
Surface:       #ffffff
Card:          #f5f5f5
Primary:       #e94560
Text:          #2d2d2d
Text Muted:    #6b7280
Border:        #e5e7eb
```

---

## Layout

### Main View (Split Mode with Live Preview)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ⬤ ⬤ ⬤                   MarkEdiViewer                 ☰          │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   B   I   H   🔗   ⟨⟩   •   ☐   —        [Split] [Edit] [View]   │
│                                                                     │
├───────────────────────────┬─────────────────────────────────────────┤
│                           │                                         │
│   1  # Hello World        │   Hello World                           │
│   2                       │   ─────────────                         │
│   3  This is **markdown** │   This is markdown                      │
│   4  with *formatting*.   │   with formatting.                      │
│   5                       │                                         │
│   6  ## Features          │   Features                              │
│   7  - Item 1             │   • Item 1                              │
│   8  - Item 2             │   • Item 2                              │
│   9                       │                                         │
│  10  [█]                  │                                         │
│                           │   ↑                                     │
│                           │   Live preview updates                  │
│                           │   as you type                           │
├───────────────────────────┴─────────────────────────────────────────┤
│                                                                     │
│   Ln 10, Col 4        42 words        UTF-8        Markdown        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**The split view shows:**

- **Left:** Editor with line numbers and cursor
- **Right:** Live preview that updates on every keystroke
- **Bottom:** Status bar with cursor position and word count

### Editor Only Mode

````
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ⬤ ⬤ ⬤                   MarkEdiViewer                 ☰          │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   B   I   H   🔗   ⟨⟩   •   ☐   —        [Split] [Edit] [View]   │
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
│  19 [█]                                                            │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Ln 19, Col 1       156 words        UTF-8        Markdown        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
````

### Viewer Only Mode (Live Preview)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ⬤ ⬤ ⬤                   MarkEdiViewer                 ☰          │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Theme: [GitHub Dark ▼]                [Split] [Edit] [View]      │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│                           Hello World                               │
│                           ═══════════                               │
│                                                                     │
│                           This is markdown with formatting.         │
│                                                                     │
│                           Features                                  │
│                           ────────                                  │
│                           • Item 1                                  │
│                           • Item 2                                  │
│                                                                     │
│                           ☐ Task 1                                  │
│                           ☑ Task 2                                  │
│                                                                     │
│                           This is a paragraph with a link.          │
│                                                                     │
│                           ┌─────────────────────────────────┐       │
│                           │ const hello = "world";          │       │
│                           │ console.log(hello);             │       │
│                           └─────────────────────────────────┘       │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   156 words        Theme: GitHub Dark                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Components

### Title Bar

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ⬤ ⬤ ⬤                   MarkEdiViewer                 ☰          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

- Traffic light buttons (macOS style)
- App name centered
- Hamburger menu right

### Toolbar

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   B   I   H   🔗   ⟨⟩   •   ☐   —        [Split] [Edit] [View]   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Left side:** Formatting buttons
**Right side:** View mode toggle

**Button Style:**

- 32x32px
- Rounded corners (6px)
- Subtle hover effect
- Active state indicator

### View Mode Toggle

```
[Split] [Edit] [View]
```

- Pill-shaped container
- Active button highlighted
- Smooth transition between modes

### Live Preview Indicator

The live preview is always active when in Split or View mode. A subtle indicator shows the preview is "live":

```
┌─────────────────────────────────────────┐
│                                         │
│   Hello World                           │
│   ═══════════                           │
│                                         │
│   ↑                                     │
│   Live preview updates                  │
│   as you type                           │
│                                         │
└─────────────────────────────────────────┘
```

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
Default: 1px solid rgba(255, 255, 255, 0.1)
Focus: 2px solid #e94560
Divider: 1px solid rgba(255, 255, 255, 0.05)
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

**Recommended:** Lucide Icons

```
Bold: B (text)
Italic: I (text)
Heading: H (text)
Link: 🔗
Code: ⟨⟩
List: •
Task: ☐
Divider: —
Menu: ☰
```

---

## Responsive Behavior

### Desktop (>1024px)

- Full layout
- Split view with live preview
- All features visible

### Tablet (768px - 1024px)

- Toggle between views
- Touch-friendly buttons
- Live preview in split mode

### Mobile (<768px)

- Single pane
- Bottom toolbar
- Swipe gestures
- Toggle between editor and preview

---

## Accessibility

### Focus States

```
Outline: 2px solid #e94560
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
Escape: Close modals
Arrow keys: Navigate lists
```

---

## Summary

**Clean:** Minimal chrome, focus on content
**Simple:** Intuitive layout, familiar patterns
**Modern:** Soft shadows, smooth transitions, generous whitespace
**Live:** Real-time preview updates on every keystroke

The design prioritizes readability and ease of use while maintaining a professional, modern aesthetic. The **live preview** feature is the core experience, providing instant feedback as you write.
