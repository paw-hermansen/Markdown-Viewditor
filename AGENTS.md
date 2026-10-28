# Project Agents Guide

## Project Overview

**Markdown Viewditor** - A markdown viewer and editor with **live preview** built with:

- **Backend**: Rust (Tauri v2)
- **Frontend**: Svelte 5 + SvelteKit
- **Platforms**: Linux, macOS, Windows, Android, iOS

## Key Commands

```bash
# Development
npm install
npm run dev                    # or: npm run tauri dev

# Build
npm run build                  # or: npm run tauri build

# Mobile
npm run tauri android init
npm run tauri android dev
npm run tauri ios init
npm run tauri ios dev

# Lint & Typecheck
npm run lint
npm run check
cargo clippy
```

## Detailed Guides

The full contracts and conventions live in linked guides. Read the relevant
guide before touching that area — especially the rendering/export contracts,
which pin engine-internal workarounds with dedicated regression tests.

| Guide                                                        | Contents                                                                                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [Conventions & Core Patterns](.agents/guides/patterns.md)    | Svelte/Rust/CSS conventions, Tauri entry point, Svelte 5 patterns, IPC, live preview, markdown syntax levels, CodeMirror lint, common mistakes |
| [Math & Mermaid Contracts](.agents/guides/math-mermaid.md)   | KaTeX + Mermaid engine contracts: zoom fixes, label measurement/conversion, edge widths, gantt width, upgrade checklist                        |
| [Zoom, Theme & UI Behavior](.agents/guides/zoom-theme-ui.md) | App zoom (webview page zoom), theme background, theme/Mermaid cache keys, render busy overlay                                                  |
| [Export & Print](.agents/guides/export-print.md)             | Exporter registry, standalone HTML, PDF/print fidelity contract                                                                                |
| [Versioning & Releases](.agents/guides/release.md)           | Release pipeline (GitHub Actions), Microsoft Store / MSIX distribution                                                                         |

## Resources

- Tauri: https://v2.tauri.app
- Svelte: https://svelte.dev
- SvelteKit: https://kit.svelte.dev

## Plans

Design and implementation plans live in `.opencode/plans/`:

- `extension-system.md` — Extension architecture (lazy-loading, fence attributes, KaTeX refactor, mermaid, ABC, SMILES)
- `EXPORT-PLAN.md` — Export pipeline design
- `PLAN-SEARCH.md` — Search implementation plan
