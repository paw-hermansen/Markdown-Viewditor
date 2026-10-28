# Versioning & Releases

## Versioning

Releases are fully automated via GitHub Actions:

1. Go to **Actions → Version Bump → Run workflow** and select bump type (patch/minor/major)
2. Review and merge the auto-created PR
3. The release builds automatically on Linux, Windows, and macOS

The `release` environment restricts who can trigger version bumps.

### Release Pipeline

The release process spans three workflows:

1. **version-bump.yml** — Runs `scripts/version-bump.sh --files-only` to update version files, creates a `release/v{version}` branch, commits, and opens a PR to `main`.
2. **tag-release.yml** — Triggered when a `release/v*` PR is merged to `main`. Creates and pushes a lightweight `v{version}` tag.
3. **release.yml** — Triggered by the tag push. Builds platform binaries (Linux, Windows, macOS) and creates a GitHub Release.
4. **release-msix.yml** — Triggered by the same tag push. Builds a multi-arch (x64 + arm64) MSIX bundle for Microsoft Store distribution.

### Microsoft Store Distribution

The MSIX bundle is built using [`@choochmeque/tauri-windows-bundle`](https://github.com/Choochmeque/tauri-windows-bundle).
Configuration lives under `src-tauri/gen/windows/`:

- `bundle.config.json` — MSIX identity, publisher, capabilities, extensions
- `AppxManifest.xml.template` — manifest template with `{{PLACEHOLDER}}` variables
- `Assets/` — Store icon tiles (scale/targetsize variants)

Build locally: `npm run tauri:windows:build -- --arch x64,arm64`

The MSIX workflow produces a `.msixbundle` artifact containing both x64 and arm64 builds.
Upload it manually to [Partner Center](https://partner.microsoft.com/) for Store submission.
Microsoft re-signs MSIX packages for free — no code signing certificate needed.

Store identity values (from Partner Center):
- `Package/Identity/Name`: `PawHermansen.MarkdownViewditor`
- `Package/Identity/Publisher`: `CN=15E8FDBE-19B2-435E-B9C3-FF697C5E3B1B`
