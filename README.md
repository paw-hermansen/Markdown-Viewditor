# Markdown Viewditor

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()

A clean, simple, and modern markdown viewer and editor with **live preview** built with Tauri v2 + Svelte 5.

![Screendump](images/screendump.png)

## Features

- **Live Preview** — See your markdown rendered in real-time as you type
- **GitHub-Flavored Markdown** — Tables, task lists, strikethrough, footnotes, and more
- **HTML** — Use HTML along with the markdown
- **Three View Modes** — Editor only, Split, View only
- **Scroll Sync** — Editor and view stay synchronized
- **Multiple Themes** — 8 built-in themes + custom CSS (see ⓘ inside the app)
- **Cross-Platform** — Windows, macOS, Linux

## AI-Assisted Development

This application was built with the help of [OpenCode](https://opencode.ai), an AI-powered coding assistant. Development used multiple AI models and specialized skill files.

Also most of the documentation has been written by AI. I believe that everything is fairly accurate but it might of course contain errors.

## Quick Start

1. **Install Rust** (required for Tauri) — see [rustup.rs](https://rustup.rs) for Windows, macOS, and Linux installers, then restart your terminal
2. **Install platform dependencies** — see the [Build Prerequisites](CONTRIBUTING.md#build-prerequisites) section (Linux requires extra system libraries)
3. **Install dependencies** and start the dev server:

```bash
npm install
npm run tauri dev
```

Mobile (Android, iOS) is technically supported by Tauri v2 but untested. A markdown editor on a phone is... an experiment. Contributions welcome.

## Custom Themes

Place `.css` files in the themes directory:

| Platform | Path                                                                                |
| -------- | ----------------------------------------------------------------------------------- |
| Linux    | `~/.config/com.github.paw-hermansen.markdown-viewditor/themes/`                     |
| macOS    | `~/Library/Application Support/com.github.paw-hermansen.markdown-viewditor/themes/` |
| Windows  | `%APPDATA%\com.github.paw-hermansen.markdown-viewditor\themes\`                     |

Theme type (dark/light) is auto-detected from the CSS content.

## Contributing

Contributions are welcome! Anyone may [open an issue](../../issues) (bug reports and suggestions alike) or submit a pull request — whether human-created, AI-created, or any mix of both. All pull requests will be reviewed and approved or denied by the maintainer.

Please read the [Contributing Guide](CONTRIBUTING.md) for the PR workflow, checklists, and development setup, and the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## License

MIT — see [LICENSE](LICENSE) for details.
