# MarkEdiViewer

A clean, simple, and modern markdown editor and viewer with **live preview** built with Tauri v2 + Svelte 5.

## Features

- **Live Preview:** See your markdown rendered in real-time as you type
- **Three View Modes:** Split (editor + preview), Editor only, Preview only
- **Multiple Themes:** 8 built-in viewer themes (GitHub, Solarized, Dracula, etc.)
- **Scroll Sync:** Editor and preview stay perfectly synchronized
- **Cross-Platform:** Windows, macOS, Linux, Android, iOS

## What is Live Preview?

Live preview shows you exactly how your markdown will look as you type. No need to switch tabs or press buttons — the preview updates instantly as you write, giving you immediate visual feedback on your formatting, headings, lists, code blocks, and more.

## Quick Start

```bash
# Install dependencies
npm install

# Start development
npm run dev

# Build for production
npm run build
```

## Project Structure

```
├── src/                    # Svelte frontend
├── src-tauri/              # Rust backend
├── .opencode/skills/       # AI skill files
├── LICENSE                 # MIT License
├── THIRD-PARTY-LICENSES.md # Dependency licenses
└── GUI-DESIGN.md           # Design specifications
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Third-Party Licenses

See [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md) for all dependency licenses.
