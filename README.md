# MarkEdiViewer

A clean, simple, and modern markdown editor and viewer with **live preview** built with Tauri v2 + Svelte 5.

## Overview

**MarkEdiViewer** is a cross-platform markdown editor that provides:

- **Three use cases**: Create, Edit, View markdown files
- **Live preview**: See rendered markdown as you type
- **Linked editor/viewer**: Synchronized scrolling
- **Multiple themes**: 8 built-in themes + custom CSS
- **Persistent settings**: View mode, theme, preferences saved

## Features

- **Live Preview:** See your markdown rendered in real-time as you type
- **Three View Modes:** Split (editor + preview), Editor only, Preview only
- **Multiple Themes:** 8 built-in viewer themes (GitHub, Solarized, Dracula, etc.)
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
| shiki           | 1.29.2  | Syntax highlighter for code blocks                      |

## Project Structure

```
├── src/                    # Svelte frontend
├── src-tauri/              # Rust backend
├── .opencode/skills/       # AI skill files
├── README.md               # This file
├── PLAN.md                 # Development plan & progress
├── GUI-DESIGN.md           # Design specifications
├── AGENTS.md               # AI agent guide
├── LICENSE                 # MIT License
└── THIRD-PARTY-LICENSES.md # Dependency licenses
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Third-Party Licenses

See [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md) for all dependency licenses.
