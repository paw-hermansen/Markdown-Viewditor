# Markdown Viewditor

A clean, simple, and modern markdown editor and viewer with **live preview** built with Tauri v2 + Svelte 5.

## Overview

**Markdown Viewditor** is a cross-platform markdown editor that provides:

- **Three use cases**: Create, Edit, View markdown files
- **Live preview**: See rendered markdown as you type
- **Linked editor/viewer**: Synchronized scrolling
- **Multiple themes**: 6 built-in themes + custom CSS
- **Persistent settings**: View mode, theme, preferences saved

## Features

- **Live Preview:** See your markdown rendered in real-time as you type
- **Three View Modes:** Split (editor + preview), Editor only, Preview only
- **Multiple Themes:** 6 built-in viewer themes (GitHub, Atom One, Monokai, Nord)
- **Scroll Sync:** Editor and preview stay perfectly synchronized
- **Cross-Platform:** Windows, macOS, Linux, Android, iOS

## What is Live Preview?

Live preview shows you exactly how your markdown will look as you type. No need to switch tabs or press buttons — the preview updates instantly as you write, giving you immediate visual feedback on your formatting, headings, lists, code blocks, and more.

## How to Run

```bash
# Install dependencies
npm install

# Start development in browser (frontend only)
npm run dev

# Start development as desktop app (via npm)
npm run tauri dev

# Start development as desktop app (via cargo)
cargo tauri dev

# Build for production
npm run build

# Build desktop app
cargo tauri build

# Lint
npm run lint

# Typecheck
npm run check

# Run tests (single run)
npm run test

# Run tests (watch mode)
npm run test:watch
```

## Versions

| Tool            | Version | Description                                             |
| --------------- | ------- | ------------------------------------------------------- |
| Tauri           | 2.11.5  | Desktop & mobile app framework (Rust backend)           |
| @tauri-apps/api | 2.11.1  | Tauri JavaScript API for frontend-backend communication |
| Svelte          | 5.56.4  | UI component framework with runes reactivity            |
| SvelteKit       | 2.69.2  | Application framework for Svelte (routing, SSR, build)  |
| Vite            | 6.4.3   | Fast build tool and dev server                          |
| TypeScript      | 5.9.3   | Typed superset of JavaScript                            |
| Rust edition    | 2021    | Systems programming language for the backend            |
| CodeMirror      | 6.7.1   | Code editor component for the markdown editor           |
| markdown-it     | 14.3.0  | Markdown parser and renderer                            |
| highlight.js    | 11.x    | Syntax highlighter for code blocks                      |

## Project Structure

```
├── src/                    # Svelte frontend
├── src-tauri/              # Rust backend
│   └── test.md             # Sample markdown file for testing save functionality
├── .opencode/skills/       # AI skill files
├── README.md               # This file
├── PLAN.md                 # Development plan & progress
├── GUI-DESIGN.md           # Design specifications
├── AGENTS.md               # AI agent guide
├── LICENSE                 # MIT License
└── THIRD-PARTY-LICENSES.md # Dependency licenses
```

## Custom Themes

You can create your own themes by placing `.css` files in the themes directory:

| Platform | Path                                                                                |
| -------- | ----------------------------------------------------------------------------------- |
| Linux    | `~/.config/com.github.paw-hermansen.markdown-viewditor/themes/`                     |
| macOS    | `~/Library/Application Support/com.github.paw-hermansen.markdown-viewditor/themes/` |
| Windows  | `%APPDATA%\com.github.paw-hermansen.markdown-viewditor\themes\`                     |

The theme type (dark/light) is auto-detected from the CSS content.

### What can be customized

A theme CSS file can override both **code block syntax highlighting** and **app UI colors**.

**Code block syntax highlighting** (highlight.js classes):

```css
.hljs {
  color: #abb2bf;
  background: #282c34;
}
.hljs-keyword {
  color: #c678dd;
}
.hljs-string {
  color: #98c379;
}
.hljs-comment {
  color: #5c6370;
  font-style: italic;
}
.hljs-number {
  color: #d19a66;
}
.hljs-function .hljs-title {
  color: #61afef;
}
.hljs-built_in {
  color: #e5c07b;
}
.hljs-attr {
  color: #d19a66;
}
.hljs-section {
  color: #61afef;
  font-weight: bold;
}
.hljs-addition {
  color: #98c379;
  background: #1e3a27;
}
.hljs-deletion {
  color: #e06c75;
  background: #3a1e27;
}
```

**App UI colors** (CSS custom properties):

```css
:root {
  --bg-primary: #282c34; /* main background */
  --bg-secondary: #21252b; /* panels, sidebars */
  --bg-tertiary: #2c313a; /* code blocks, gutters */
  --bg-hover: rgba(255, 255, 255, 0.05); /* hover states */
  --text-primary: #abb2bf; /* main text */
  --text-secondary: #828997; /* secondary text */
  --text-muted: #5c6370; /* muted text */
  --accent: #c678dd; /* links, selection, focus */
  --border: #3e4451; /* borders */
}
```

**Light theme overrides** (if auto-detected as light):

```css
[data-theme="light"] {
  --bg-primary: #fafafa;
  --bg-secondary: #ffffff;
  --bg-tertiary: #f5f5f5;
  --bg-hover: rgba(0, 0, 0, 0.05);
  --text-primary: #2d2d2d;
  --text-secondary: #6b7280;
  --text-muted: #9ca3af;
  --accent: #c678dd;
  --border: #e5e7eb;
}
```

### Example: One Dark theme

Create `~/.config/com.github.paw-hermansen.markdown-viewditor/themes/one-dark.css`:

```css
/* Code highlighting */
.hljs {
  color: #abb2bf;
  background: #282c34;
}
.hljs-keyword,
.hljs-doctag {
  color: #c678dd;
}
.hljs-string,
.hljs-regexp {
  color: #98c379;
}
.hljs-comment {
  color: #5c6370;
  font-style: italic;
}
.hljs-number,
.hljs-literal {
  color: #d19a66;
}
.hljs-function .hljs-title {
  color: #61afef;
}
.hljs-built_in {
  color: #e5c07b;
}
.hljs-attr,
.hljs-attribute {
  color: #d19a66;
}
.hljs-section,
.hljs-name {
  color: #61afef;
}
.hljs-addition {
  color: #98c379;
  background: #1e3a27;
}
.hljs-deletion {
  color: #e06c75;
  background: #3a1e27;
}

/* App UI */
:root {
  --bg-primary: #282c34;
  --bg-secondary: #21252b;
  --bg-tertiary: #2c313a;
  --bg-hover: rgba(255, 255, 255, 0.05);
  --text-primary: #abb2bf;
  --text-secondary: #828997;
  --text-muted: #5c6370;
  --accent: #c678dd;
  --border: #3e4451;
}
```

The file name becomes the theme ID and label (e.g., `one-dark.css` appears as "One Dark" in the theme selector).

## License

MIT License - see [LICENSE](LICENSE) for details.

## Third-Party Licenses

See [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md) for all dependency licenses.
