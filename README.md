# Markdown Viewditor

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()

A clean, simple, and modern markdown viewer and editor with **live preview** built with Tauri v2 + Svelte 5.

![Screendump](images/screendump.png)

## Download

Pre-built binaries for Windows, macOS, and Linux are published on the
[Releases page](../../releases/latest). Pick the file matching your platform:

| Platform | File                                                  | Notes                                                                    |
| -------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| Windows  | `Markdown-Viewditor_*_x64-setup.exe` (NSIS) or `.msi` | SmartScreen may warn on first launch — click **More info → Run anyway**. |
| macOS    | `Markdown-Viewditor_*_aarch64.dmg` (Apple Silicon)    | See [macOS first-launch note](#macos-first-launch-note) below.           |
| Linux    | `*.deb` (Debian/Ubuntu) or `*.rpm` (Fedora/RHEL)      | Install via your package manager.                                        |

### macOS first-launch note

The macOS build is **not code-signed** (to keep releases free). The first time
you open it, Gatekeeper will block it. To bypass:

```bash
xattr -dr com.apple.quarantine "/Applications/Markdown Viewditor.app"
```

or right-click the app → **Open** → **Open anyway**.

### Auto-updates

The Windows and macOS builds check the GitHub Releases feed for
updates and can install them in place (Help → About → Check for Updates).

## Features

- **Live Preview** — See your markdown rendered in real-time as you type
- **GitHub-Flavored Markdown** — Tables, task lists, strikethrough, footnotes, and more
- **HTML** — Use HTML along with the markdown
- **Three View Modes** — Editor only, Split, View only
- **Scroll Sync** — Editor and view stay synchronized
- **Multiple Themes** — 8 built-in themes + custom CSS themes (see ⓘ inside the app)
- **YAML Frontmatter** — for AI agents [SKILL.md](https://agentskills.io) files
- **Cross-Platform** — Windows, macOS, Linux

## AI-Assisted Development

This application was built with the help of [OpenCode](https://opencode.ai), an AI-powered coding assistant. Development used multiple AI models.

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

For technical documentation on architecture, coding conventions, and the release pipeline, see [AGENTS.md](AGENTS.md).

## License

MIT — see [LICENSE](LICENSE) for details.
