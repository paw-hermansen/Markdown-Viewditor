# UI/UX Design Skill

> Design patterns for Markdown editor - dark theme, accessibility, responsive layout.

## Design Principles

1. **Minimalism** - Clean interface, focus on content
2. **Consistency** - 8px grid, consistent typography
3. **Accessibility** - WCAG 2.1 AA, keyboard navigation
4. **Responsiveness** - Desktop + mobile support

## Color System (Dark Theme)

```css
:root {
  /* Background */
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --bg-tertiary: #2d2d2d;
  --bg-hover: #3e3e3e;
  
  /* Text */
  --text-primary: #cccccc;
  --text-secondary: #858585;
  --text-muted: #606060;
  
  /* Accent */
  --accent-primary: #0078d4;
  --accent-hover: #1a8cff;
  --accent-muted: #0078d440;
  
  /* Status */
  --success: #4ec9b0;
  --warning: #dcdcaa;
  --error: #f14c4c;
  
  /* Borders */
  --border: #3e3e3e;
  --border-focus: #0078d4;
}
```

## Typography

```css
:root {
  --font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
}
```

## Spacing (8px Grid)

```css
:root {
  --space-1: 0.25rem;  /* 4px */
  --space-2: 0.5rem;   /* 8px */
  --space-3: 0.75rem;  /* 12px */
  --space-4: 1rem;     /* 16px */
  --space-6: 1.5rem;   /* 24px */
  --space-8: 2rem;     /* 32px */
}
```

## Editor Layout

```css
.editor-layout {
  display: grid;
  grid-template-columns: 250px 1fr 1fr;
  grid-template-rows: 48px 1fr 32px;
  height: 100vh;
}

@media (max-width: 768px) {
  .editor-layout {
    grid-template-columns: 1fr;
  }
  
  .sidebar { display: none; }
}
```

## Component: Toolbar

```svelte
<div class="toolbar">
  <div class="toolbar-group">
    <button class="toolbar-btn" title="Bold (Ctrl+B)">
      <BoldIcon />
    </button>
    <button class="toolbar-btn" title="Italic (Ctrl+I)">
      <ItalicIcon />
    </button>
  </div>
  
  <div class="toolbar-separator"></div>
  
  <div class="toolbar-group">
    <button class="toolbar-btn" title="Heading">
      <HeadingIcon />
    </button>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    padding: var(--space-2);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
  }
  
  .toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    border-radius: 4px;
    cursor: pointer;
  }
  
  .toolbar-btn:hover {
    background: var(--bg-hover);
  }
</style>
```

## Component: Status Bar

```svelte
<div class="statusbar">
  <div class="statusbar-left">
    <span class="status-item">Line {line}, Col {col}</span>
    <span class="status-item">{wordCount} words</span>
  </div>
  
  <div class="statusbar-right">
    <span class="status-item">UTF-8</span>
    <span class="status-item">Markdown</span>
  </div>
</div>

<style>
  .statusbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--space-3);
    background: var(--bg-tertiary);
    border-top: 1px solid var(--border);
    font-size: var(--text-xs);
    color: var(--text-secondary);
    height: 32px;
  }
</style>
```

## Component: Command Palette

```svelte
<script>
  let isOpen = $state(false);
  let query = $state('');
  let selectedIndex = $state(0);
  
  let filteredCommands = $derived(
    commands.filter(cmd => 
      cmd.label.toLowerCase().includes(query.toLowerCase())
    )
  );
  
  function handleKeydown(e) {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      isOpen = !isOpen;
    }
    if (e.key === 'Escape') isOpen = false;
    if (e.key === 'ArrowDown') {
      selectedIndex = Math.min(selectedIndex + 1, filteredCommands.length - 1);
    }
    if (e.key === 'ArrowUp') {
      selectedIndex = Math.max(selectedIndex - 1, 0);
    }
    if (e.key === 'Enter') {
      filteredCommands[selectedIndex]?.action();
      isOpen = false;
    }
  }
</script>

{#if isOpen}
  <div class="command-palette-overlay" onclick={() => isOpen = false}>
    <div class="command-palette" onclick|stopPropagation>
      <input bind:value={query} placeholder="Type a command..." autofocus />
      <div class="command-list">
        {#each filteredCommands as command, i}
          <div 
            class="command-item"
            class:selected={i === selectedIndex}
            onclick={() => { command.action(); isOpen = false; }}
          >
            <span>{command.label}</span>
            {#if command.shortcut}
              <span class="shortcut">{command.shortcut}</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
```

## Accessibility

### ARIA Labels
```svelte
<button aria-label="Bold" aria-pressed={isBold} title="Bold (Ctrl+B)">
  <BoldIcon />
</button>

<nav aria-label="File explorer">
  <!-- File tree -->
</nav>

<div role="status" aria-live="polite">
  {statusMessage}
</div>
```

### Focus Management
```css
:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}

:focus:not(:focus-visible) {
  outline: none;
}
```

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Keyboard Shortcuts

```javascript
const shortcuts = {
  'ctrl+b': () => toggleBold(),
  'ctrl+i': () => toggleItalic(),
  'ctrl+s': () => saveFile(),
  'ctrl+shift+p': () => openCommandPalette(),
  'ctrl+n': () => newFile(),
  'ctrl+o': () => openFile(),
  'ctrl+w': () => closeFile(),
};
```

## Animations

```css
/* Fade */
.fade-enter { opacity: 0; }
.fade-enter-active { transition: opacity 0.2s; }
.fade-enter-to { opacity: 1; }

/* Slide */
.slide-enter { transform: translateX(-100%); }
.slide-enter-active { transition: transform 0.3s ease-out; }
.slide-enter-to { transform: translateX(0); }
```

## Icon Libraries

- **Lucide** (Recommended): https://lucide.dev
- **Phosphor**: https://phosphoricons.com
- **Heroicons**: https://heroicons.com

```svelte
<script>
  import { Bold, Italic, Code, Link, List, Save } from 'lucide-svelte';
</script>

<Bold size={18} strokeWidth={2} />
```

## Resources

- Material Design: https://m3.material.io
- Apple HIG: https://developer.apple.com/design/human-interface-guidelines
- Tailwind CSS: https://tailwindcss.com
- shadcn-svelte: https://shadcn-svelte.com
