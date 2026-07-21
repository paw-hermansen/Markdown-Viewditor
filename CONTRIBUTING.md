# Contributing

Thank you for your interest in contributing to Markdown Viewditor! Anyone may open issues (including suggestions) or submit pull requests. Both human-created changes, AI-created changes, and all mixes of human and AI created changes will be considered. All pull requests will be approved or denied by the maintainer ([@paw-hermansen](https://github.com/paw-hermansen)).

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/Markdown-Viewditor.git`
3. Create a branch: `git checkout -b feature/my-change`
4. Install dependencies: `npm install`
5. Start the dev server: `npm run tauri dev`

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
