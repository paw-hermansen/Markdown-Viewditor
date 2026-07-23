# Contributing

Thank you for your interest in contributing to Markdown Viewditor! Anyone may open issues (including suggestions) or submit pull requests. Both human-created changes, AI-created changes, and all mixes of human and AI created changes will be considered. All pull requests will be approved or denied by the maintainer ([@paw-hermansen](https://github.com/paw-hermansen)).

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/Markdown-Viewditor.git`
3. Create a branch: `git checkout -b feature/my-change`
4. Install dependencies: `npm install`
5. Start the dev server: `npm run tauri dev`

## Build Prerequisites

In addition to [Rust](https://rustup.rs) and [Node.js](https://nodejs.org) (which includes `npm`), each platform requires specific system libraries for development and bundling.

> **Tip:** [nvm](https://github.com/nvm-sh/nvm) makes it easy to install and switch between multiple Node.js/npm versions.

### Linux

#### Development Libraries

These are required for **all** Linux builds (dev and bundle):

| Distro              | Install command                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Debian / Ubuntu** | `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf`                               |
| **Fedora**          | `sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel libxdo-devel patchelf` + `sudo dnf group install "c-development"` |
| **Arch**            | `sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl libappindicator-gtk3 librsvg xdotool patchelf`                                                                |

#### Bundle-Specific Extras

The project's `tauri.conf.json` uses `bundle.targets: "all"`, which produces AppImage, `.deb`, and `.rpm` packages on Linux. Each format may need extra tooling:

| Bundle       | Extra dependencies          | Notes                                                                                                                             |
| ------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **AppImage** | `libfuse2`                  | Required by `linuxdeploy` (which Tauri downloads automatically). Not needed on the end-user's system — only on the build machine. |
| **.deb**     | `dpkg`                      | Pre-installed on Debian/Ubuntu.                                                                                                   |
| **.rpm**     | `rpm` (provides `rpmbuild`) | Only needed when building RPM on a non-RPM distro (e.g., Ubuntu).                                                                 |

> **Note:** If you don't need AppImage, change `bundle.targets` from `"all"` to `["deb", "rpm"]` in `src-tauri/tauri.conf.json` to avoid the `libfuse2` / `linuxdeploy` dependency.

### macOS

- **Xcode Command Line Tools** (sufficient for desktop builds):
  ```bash
  xcode-select --install
  ```
- Or install **full Xcode** from the App Store (required for iOS targets).

No additional system libraries are needed — macOS provides WebKit (WKWebView) built-in.

### Windows

| Dependency                    | Notes                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Microsoft C++ Build Tools** | Install from [visualstudio.microsoft.com](https://visualstudio.microsoft.com/visual-cpp-build-tools/). Select "Desktop development with C++".                                  |
| **WebView2 Runtime**          | Pre-installed on Windows 10 (v1803+) and Windows 11. For older systems, download the [Evergreen Bootstrapper](https://developer.microsoft.com/en-us/microsoft-edge/webview2/). |
| **VBSCRIPT** (optional)       | Only needed for WiX/MSI bundling. Enable via: Settings → Apps → Optional features → More Windows features → check "VBSCRIPT".                                                  |

## Development

Run all commands from the project root unless noted otherwise.

```bash
# Frontend (project root)
npm run check          # Typecheck
npm run lint           # Lint (prettier + eslint)
npm run test           # Run tests

# Rust backend (from src-tauri/)
cargo clippy           # Lint
cargo test             # Test
```

All checks must pass before a PR can be merged. CI runs automatically on pull requests.

## Pulling an Upstream Change

Keep your fork up to date:

```bash
git remote add upstream https://github.com/paw-hermansen/Markdown-Viewditor.git
git fetch upstream
git rebase upstream/main
```

## Submitting a Pull Request

Checklist:

- [ ] Branch is based on and up to date with `main`
- [ ] `npm run check` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] `cargo clippy` passes (no warnings)
- [ ] `cargo test` passes
- [ ] Changes are described in the PR

## Reporting Issues

Checklist:

- [ ] Search existing issues first
- [ ] Include steps to reproduce (for bugs)
- [ ] Include expected vs actual behavior
- [ ] Include your OS and app version

## Versioning

Releases are managed by the maintainer. Version bumps are done with:

```bash
npm run version:patch    # 0.1.0 → 0.1.1
npm run version:minor    # 0.1.0 → 0.2.0
npm run version:major    # 0.1.0 → 1.0.0
```
