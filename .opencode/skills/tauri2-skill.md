# Tauri v2 Skill

> Expert guide for building secure, cross-platform desktop and mobile apps with Tauri v2 + Svelte frontend.
> Sources: Impertio-Studio (27 skills), patrickhaahr (best practices), nodnarbnitram (patterns & pitfalls)

## Critical Rules

### Always Do

- Register every command in `tauri::generate_handler![cmd1, cmd2, ...]`
- Return `Result<T, E>` from commands for proper error handling
- Use `Mutex<T>` or `RwLock<T>` for shared state
- Add capabilities before using any plugin features
- Use `lib.rs` for shared code (required for mobile builds)
- Use `#[cfg_attr(mobile, tauri::mobile_entry_point)]` on `pub fn run()`

### Never Do

- Never use borrowed types (`&str`) in async commands - use owned types
- Never block the main thread - use async for I/O operations
- Never hardcode paths - use Tauri path APIs
- Never skip capability setup - even "safe" operations need permissions

## Project Structure

```
my-tauri-app/
├── src/                          # Frontend source (Svelte)
├── src-tauri/
│   ├── src/
│   │   ├── main.rs              # Thin passthrough → lib::run()
│   │   └── lib.rs               # ALL application logic lives here
│   ├── capabilities/
│   │   └── default.json         # Capability definitions
│   ├── tauri.conf.json          # App configuration
│   ├── Cargo.toml               # Rust dependencies
│   └── build.rs                 # Build script
└── package.json
```

## Configuration (tauri.conf.json)

```json
{
  "$schema": "./gen/schemas/desktop-schema.json",
  "productName": "markdown-editor",
  "version": "1.0.0",
  "identifier": "com.example.markdown-editor",
  "build": {
    "devUrl": "http://localhost:5173",
    "frontendDist": "../build",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Markdown Editor",
        "width": 1200,
        "height": 800
      }
    ],
    "security": {
      "csp": "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'",
      "capabilities": ["default"]
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/icon.icns", "icons/icon.ico", "icons/icon.png"]
  }
}
```

## Cargo.toml

```toml
[package]
name = "markdown-editor"
version = "0.1.0"
edition = "2021"

[lib]
name = "app_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"
tauri-plugin-clipboard-manager = "2"
tauri-plugin-store = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"

[profile.release]
codegen-units = 1
lto = "fat"
opt-level = "z"
panic = "abort"
strip = true
```

## Security: Capability-Based Permissions

```json
// src-tauri/capabilities/default.json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability for main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:path:default",
    "dialog:default",
    "fs:default",
    "clipboard-manager:default",
    "store:default"
  ]
}
```

## Rust Commands (IPC)

### Entry Point (lib.rs)

```rust
// src-tauri/src/lib.rs
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Not found: {0}")]
    NotFound(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::ser::Serializer {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

#[derive(Serialize, Deserialize)]
struct FileInfo {
    path: String,
    content: String,
    size: u64,
}

#[tauri::command]
fn greet(name: String) -> String {
    format!("Hello, {}!", name)
}

#[tauri::command]
async fn read_file(path: String) -> Result<String, AppError> {
    Ok(std::fs::read_to_string(&path)?)
}

#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), AppError> {
    std::fs::write(&path, &content)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            read_file,
            write_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Main Entry (main.rs)

```rust
// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    app_lib::run();
}
```

## Frontend Integration (Svelte)

### Calling Rust Commands

```svelte
<script>
  import { invoke } from '@tauri-apps/api/core';

  let content = $state('');

  async function openFile() {
    try {
      content = await invoke('read_file', { path: '/path/to/file.md' });
    } catch (error) {
      console.error('Failed to read file:', error);
    }
  }

  async function saveFile() {
    try {
      await invoke('write_file', { path: '/path/to/file.md', content });
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  }
</script>
```

### Event System

```svelte
<script>
  import { listen } from '@tauri-apps/api/event';

  let unlisten;

  onMount(async () => {
    unlisten = await listen('file-changed', (event) => {
      console.log('File changed:', event.payload);
    });
  });

  onDestroy(() => {
    unlisten?.();
  });
</script>
```

### Channel Streaming (High-Frequency)

```rust
use tauri::ipc::Channel;

#[derive(Clone, serde::Serialize)]
#[serde(tag = "event", content = "data")]
enum FileEvent {
    Progress { percent: u32 },
    Complete { path: String },
}

#[tauri::command]
async fn watch_file(path: String, on_event: Channel<FileEvent>) {
    // Stream events to frontend
    on_event.send(FileEvent::Progress { percent: 50 }).unwrap();
    on_event.send(FileEvent::Complete { path }).unwrap();
}
```

```typescript
import { invoke, Channel } from "@tauri-apps/api/core";

const channel = new Channel();
channel.onmessage = (msg) => console.log(msg.event, msg.data);
await invoke("watch_file", { path: "/file.md", onEvent: channel });
```

## State Management

```rust
use std::sync::Mutex;
use tauri::State;

struct AppState {
    current_file: Mutex<Option<String>>,
    is_modified: Mutex<bool>,
}

#[tauri::command]
fn get_current_file(state: State<'_, AppState>) -> Option<String> {
    state.current_file.lock().unwrap().clone()
}

#[tauri::command]
fn set_current_file(path: String, state: State<'_, AppState>) {
    *state.current_file.lock().unwrap() = Some(path);
}

// In builder:
tauri::Builder::default()
    .manage(AppState {
        current_file: Mutex::new(None),
        is_modified: Mutex::new(false),
    })
```

## Essential Plugins

```bash
cargo tauri plugin add fs
cargo tauri plugin add dialog
cargo tauri plugin add clipboard-manager
cargo tauri plugin add store
cargo tauri plugin add window-state
```

## Common Mistakes Prevention

| Issue                  | Root Cause                                        | Solution                         |
| ---------------------- | ------------------------------------------------- | -------------------------------- |
| "Command not found"    | Missing from generate_handler!                    | Add command to handler macro     |
| "Permission denied"    | Missing capability                                | Add to capabilities/default.json |
| Plugin feature fails   | Plugin installed but permission not in capability | Add plugin permission string     |
| White screen on launch | Frontend not building                             | Check beforeDevCommand in config |
| State panic on access  | Type mismatch in State<T>                         | Use exact type from .manage()    |
| Mobile build fails     | Missing Rust targets                              | Run `rustup target add <target>` |
| Borrowed type error    | `&str` in async command                           | Use `String` instead             |

## Cross-Platform

```rust
#[cfg(target_os = "linux")]
fn configure_platform() {
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
}

#[cfg(target_os = "windows")]
fn configure_platform() {
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--disable-features=msWebOOUI");
}
```

### Platform-Specific Capabilities

```json
// src-tauri/capabilities/desktop.json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "desktop-capability",
  "platforms": ["linux", "macos", "windows"],
  "permissions": ["global-shortcut:allow-register"]
}
```

## Build Optimization

```toml
# src-tauri/Cargo.toml
[profile.release]
codegen-units = 1
lto = "fat"
opt-level = "z"
panic = "abort"
strip = true
```

## Troubleshooting

### White Screen on Launch

1. Verify `devUrl` matches frontend dev server port
2. Check `beforeDevCommand` runs dev server
3. Open DevTools (F12) to check for errors

### Command Returns Undefined

1. Verify command is in `generate_handler![]`
2. Check Rust command returns a value
3. Ensure argument names match (camelCase in JS, snake_case in Rust)

### Mobile Build Failures

```bash
# Android targets
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android

# iOS targets (macOS only)
rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim
```

## Resources

- Official Docs: https://v2.tauri.app
- Commands: https://v2.tauri.app/develop/calling-rust/
- Capabilities: https://v2.tauri.app/security/capabilities/
- Config Reference: https://v2.tauri.app/reference/config/
