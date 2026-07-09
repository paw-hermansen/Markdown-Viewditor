# Tauri Desktop Application Development

Guides you through building secure, performant cross-platform desktop applications with Tauri. Combines Rust backend with modern web frontend technologies.

## When to Use This Skill

- Building cross-platform desktop applications
- Creating apps with Rust backend and web UI
- Implementing secure IPC between frontend and backend
- Managing application windows and system tray
- Accessing file system and system APIs
- Building distributable desktop apps
- Migrating from Electron to Tauri

## Project Structure

```
tauri-app/
├── src/                      # Rust backend
│   ├── main.rs              # Entry point
│   ├── commands/            # Tauri commands
│   │   ├── mod.rs
│   │   ├── file.rs
│   │   └── user.rs
│   ├── state/               # Application state
│   │   ├── mod.rs
│   │   └── app_state.rs
│   ├── services/            # Business logic
│   │   ├── mod.rs
│   │   └── database.rs
│   └── models/              # Data models
│       └── mod.rs
├── src-tauri/
│   ├── Cargo.toml           # Rust dependencies
│   ├── tauri.conf.json      # Tauri configuration
│   ├── icons/               # App icons
│   └── capabilities/        # Security permissions
└── ui/                      # Frontend (React/Vue/Svelte)
    ├── src/
    ├── package.json
    └── index.html
```

## Quick Start

### Project Setup

```bash
cargo install create-tauri-app
cargo create-tauri-app
cd tauri-app
```

### Basic Tauri Command

src/main.rs:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Frontend (TypeScript):

```typescript
import { invoke } from "@tauri-apps/api/tauri";

async function greet() {
  const message = await invoke<string>("greet", { name: "World" });
  console.log(message);
}
```

### Commands with Error Handling

src/commands/file.rs:

```rust
use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub size: u64,
    pub path: String,
}

#[derive(Debug, thiserror::Error)]
pub enum FileError {
    #[error("File not found: {0}")]
    NotFound(String),
    #[error("Permission denied: {0}")]
    PermissionDenied(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

impl serde::Serialize for FileError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, FileError> {
    let path_buf = PathBuf::from(&path);

    if !path_buf.exists() {
        return Err(FileError::NotFound(path));
    }

    let content = fs::read_to_string(path_buf)?;
    Ok(content)
}

#[tauri::command]
pub async fn list_files(directory: String) -> Result<Vec<FileInfo>, FileError> {
    let path = PathBuf::from(&directory);

    if !path.exists() {
        return Err(FileError::NotFound(directory));
    }

    let mut files = Vec::new();

    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let metadata = entry.metadata()?;

        if metadata.is_file() {
            files.push(FileInfo {
                name: entry.file_name().to_string_lossy().to_string(),
                size: metadata.len(),
                path: entry.path().to_string_lossy().to_string(),
            });
        }
    }

    Ok(files)
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), FileError> {
    fs::write(path, content)?;
    Ok(())
}
```

src/main.rs:

```rust
mod commands;

use commands::file::{read_file, list_files, write_file};

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_file,
            list_files,
            write_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Frontend:

```typescript
import { invoke } from "@tauri-apps/api/tauri";

interface FileInfo {
  name: string;
  size: number;
  path: string;
}

async function readFile(path: string): Promise<string> {
  return await invoke<string>("read_file", { path });
}

async function listFiles(directory: string): Promise<FileInfo[]> {
  return await invoke<FileInfo[]>("list_files", { directory });
}

async function writeFile(path: string, content: string): Promise<void> {
  await invoke("write_file", { path, content });
}
```

### Application State

src/state/app_state.rs:

```rust
use std::sync::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub name: String,
    pub email: String,
}

#[derive(Default)]
pub struct AppState {
    pub user: Mutex<Option<User>>,
    pub settings: Mutex<AppSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: String,
    pub language: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "light".to_string(),
            language: "en".to_string(),
        }
    }
}
```

src/commands/user.rs:

```rust
use tauri::State;
use crate::state::app_state::{AppState, User, AppSettings};

#[tauri::command]
pub async fn get_user(state: State<'_, AppState>) -> Result<Option<User>, String> {
    let user = state.user.lock().map_err(|e| e.to_string())?;
    Ok(user.clone())
}

#[tauri::command]
pub async fn set_user(
    state: State<'_, AppState>,
    user: User,
) -> Result<(), String> {
    let mut user_state = state.user.lock().map_err(|e| e.to_string())?;
    *user_state = Some(user);
    Ok(())
}

#[tauri::command]
pub async fn get_settings(
    state: State<'_, AppState>,
) -> Result<AppSettings, String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?;
    Ok(settings.clone())
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), String> {
    let mut app_settings = state.settings.lock().map_err(|e| e.to_string())?;
    *app_settings = settings;
    Ok(())
}
```

src/main.rs:

```rust
mod commands;
mod state;

use state::app_state::AppState;
use commands::user::{get_user, set_user, get_settings, update_settings};

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_user,
            set_user,
            get_settings,
            update_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Events and Communication

Backend emitting events:

```rust
use tauri::{Manager, Window};
use serde::Serialize;

#[derive(Clone, Serialize)]
struct ProgressPayload {
    current: u64,
    total: u64,
}

#[tauri::command]
async fn process_large_file(window: Window) -> Result<(), String> {
    let total = 100;

    for current in 0..=total {
        window
            .emit("progress", ProgressPayload { current, total })
            .map_err(|e| e.to_string())?;

        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }

    Ok(())
}
```

Frontend listening to events:

```typescript
import { listen } from "@tauri-apps/api/event";

interface ProgressPayload {
  current: number;
  total: number;
}

const unlisten = await listen<ProgressPayload>("progress", (event) => {
  const { current, total } = event.payload;
  const percentage = (current / total) * 100;
  console.log(`Progress: ${percentage}%`);
});
```

### Window Management

```rust
use tauri::{Manager, WindowBuilder, WindowUrl};

#[tauri::command]
async fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_window("settings") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    WindowBuilder::new(
        &app,
        "settings",
        WindowUrl::App("settings.html".into()),
    )
    .title("Settings")
    .inner_size(800.0, 600.0)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn close_window(window: Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())?;
    Ok(())
}
```

Frontend:

```typescript
import { invoke } from "@tauri-apps/api/tauri";
import { appWindow } from "@tauri-apps/api/window";

async function openSettings() {
  await invoke("open_settings_window");
}

async function closeCurrentWindow() {
  await appWindow.close();
}
```

### System Tray

src/main.rs:

```rust
use tauri::{
    CustomMenuItem, SystemTray, SystemTrayEvent, SystemTrayMenu,
    SystemTrayMenuItem, Manager,
};

fn main() {
    let show = CustomMenuItem::new("show".to_string(), "Show");
    let hide = CustomMenuItem::new("hide".to_string(), "Hide");
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");

    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_item(hide)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);

    let system_tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::MenuItemClick { id, .. } => {
                match id.as_str() {
                    "show" => {
                        let window = app.get_window("main").unwrap();
                        window.show().unwrap();
                        window.set_focus().unwrap();
                    }
                    "hide" => {
                        let window = app.get_window("main").unwrap();
                        window.hide().unwrap();
                    }
                    "quit" => {
                        std::process::exit(0);
                    }
                    _ => {}
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Database Integration

src/services/database.rs:

```rust
use sqlx::{SqlitePool, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub created_at: String,
}

pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn new(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = SqlitePool::connect(database_url).await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&pool)
        .await?;

        Ok(Self { pool })
    }

    pub async fn create_note(
        &self,
        title: String,
        content: String,
    ) -> Result<Note, sqlx::Error> {
        let result = sqlx::query(
            "INSERT INTO notes (title, content) VALUES (?, ?)"
        )
        .bind(&title)
        .bind(&content)
        .execute(&self.pool)
        .await?;

        let id = result.last_insert_rowid();

        let note = sqlx::query_as::<_, Note>(
            "SELECT id, title, content, created_at FROM notes WHERE id = ?"
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;

        Ok(note)
    }

    pub async fn get_notes(&self) -> Result<Vec<Note>, sqlx::Error> {
        let notes = sqlx::query_as::<_, Note>(
            "SELECT id, title, content, created_at FROM notes ORDER BY created_at DESC"
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(notes)
    }

    pub async fn delete_note(&self, id: i64) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM notes WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }
}
```

Commands using database:

```rust
use tauri::State;
use crate::services::database::{Database, Note};

#[tauri::command]
pub async fn create_note(
    db: State<'_, Database>,
    title: String,
    content: String,
) -> Result<Note, String> {
    db.create_note(title, content)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_notes(db: State<'_, Database>) -> Result<Vec<Note>, String> {
    db.get_notes().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_note(db: State<'_, Database>, id: i64) -> Result<(), String> {
    db.delete_note(id).await.map_err(|e| e.to_string())
}
```

### Configuration

tauri.conf.json:

```json
{
  "$schema": "https://schema.tauri.app/config/2.0.0",
  "productName": "MyApp",
  "version": "1.0.0",
  "identifier": "com.myapp.dev",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "My App",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["deb", "msi", "dmg", "app"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

Cargo.toml:

```toml
[package]
name = "tauri-app"
version = "1.0.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = ["protocol-asset"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
thiserror = "1"
sqlx = { version = "0.7", features = ["runtime-tokio-native-tls", "sqlite"] }

[build-dependencies]
tauri-build = { version = "2", features = [] }
```

## Supporting Files

For detailed information on specific topics:

- **ARCHITECTURE.md** - Project structure, state management, command patterns, and clean architecture
- **FRONTEND-INTEGRATION.md** - Integration with React/Vue/Svelte, TypeScript bindings, IPC patterns
- **TESTING.md** - Unit testing, integration testing, E2E testing, and security best practices

## Common Commands

```bash
cargo tauri dev
cargo tauri build
cargo tauri build --debug
cargo tauri info
```

## Key Features

- **Security First** - Capability-based permissions, CSP, sandboxing
- **Cross-Platform** - Windows, macOS, Linux from single codebase
- **Small Bundle Size** - ~600KB instead of Electron's ~50MB
- **Native Performance** - Rust backend with web frontend
- **Type Safety** - Full TypeScript support with generated bindings
- **Auto Updates** - Built-in update mechanism
