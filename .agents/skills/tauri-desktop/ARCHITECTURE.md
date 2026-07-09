# Tauri Architecture Guide

Complete guide to structuring Tauri applications for maintainability, testability, and scalability.

## Table of Contents

- [Project Structure](#project-structure)
- [Clean Architecture Pattern](#clean-architecture-pattern)
- [State Management](#state-management)
- [Command Patterns](#command-patterns)
- [Error Handling](#error-handling)
- [Plugin System](#plugin-system)

## Project Structure

### Recommended Layout

```
tauri-app/
├── src/                          # Rust backend
│   ├── main.rs                   # Application entry point
│   ├── lib.rs                    # Optional library crate
│   │
│   ├── commands/                 # Tauri command handlers
│   │   ├── mod.rs
│   │   ├── file.rs              # File operations
│   │   ├── user.rs              # User management
│   │   ├── settings.rs          # Settings
│   │   └── window.rs            # Window management
│   │
│   ├── services/                 # Business logic layer
│   │   ├── mod.rs
│   │   ├── database.rs          # Database service
│   │   ├── auth.rs              # Authentication service
│   │   ├── file_system.rs       # File system service
│   │   └── network.rs           # Network service
│   │
│   ├── models/                   # Data models
│   │   ├── mod.rs
│   │   ├── user.rs
│   │   ├── note.rs
│   │   └── config.rs
│   │
│   ├── state/                    # Application state
│   │   ├── mod.rs
│   │   └── app_state.rs
│   │
│   ├── events/                   # Event handlers
│   │   ├── mod.rs
│   │   └── handlers.rs
│   │
│   └── utils/                    # Utilities
│       ├── mod.rs
│       ├── crypto.rs
│       └── validation.rs
│
├── src-tauri/
│   ├── Cargo.toml               # Rust dependencies
│   ├── tauri.conf.json          # Tauri configuration
│   ├── build.rs                 # Build script
│   ├── icons/                   # Application icons
│   └── capabilities/            # Security permissions
│       └── default.json
│
└── ui/                          # Frontend (choose your framework)
    ├── src/
    │   ├── api/                 # Tauri API wrappers
    │   ├── components/
    │   ├── stores/              # Frontend state
    │   └── types/               # TypeScript types
    ├── package.json
    └── tsconfig.json
```

## Clean Architecture Pattern

### Domain Layer (Core Business Logic)

src/models/user.rs:

```rust
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    id: Uuid,
    username: String,
    email: String,
}

impl User {
    pub fn new(username: String, email: String) -> Result<Self, String> {
        if username.is_empty() {
            return Err("Username cannot be empty".to_string());
        }

        if !email.contains('@') {
            return Err("Invalid email format".to_string());
        }

        Ok(Self {
            id: Uuid::new_v4(),
            username,
            email,
        })
    }

    pub fn id(&self) -> &Uuid {
        &self.id
    }

    pub fn username(&self) -> &str {
        &self.username
    }

    pub fn email(&self) -> &str {
        &self.email
    }

    pub fn update_email(&mut self, email: String) -> Result<(), String> {
        if !email.contains('@') {
            return Err("Invalid email format".to_string());
        }
        self.email = email;
        Ok(())
    }
}
```

### Service Layer (Business Logic)

src/services/user_service.rs:

```rust
use std::sync::Arc;
use async_trait::async_trait;
use crate::models::user::User;

#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn find_by_id(&self, id: &str) -> Result<Option<User>, String>;
    async fn find_by_email(&self, email: &str) -> Result<Option<User>, String>;
    async fn save(&self, user: &User) -> Result<(), String>;
    async fn delete(&self, id: &str) -> Result<(), String>;
}

pub struct UserService {
    repository: Arc<dyn UserRepository>,
}

impl UserService {
    pub fn new(repository: Arc<dyn UserRepository>) -> Self {
        Self { repository }
    }

    pub async fn create_user(
        &self,
        username: String,
        email: String,
    ) -> Result<User, String> {
        if let Some(_) = self.repository.find_by_email(&email).await? {
            return Err("Email already exists".to_string());
        }

        let user = User::new(username, email)?;
        self.repository.save(&user).await?;

        Ok(user)
    }

    pub async fn get_user(&self, id: &str) -> Result<Option<User>, String> {
        self.repository.find_by_id(id).await
    }

    pub async fn update_user_email(
        &self,
        id: &str,
        email: String,
    ) -> Result<User, String> {
        let mut user = self
            .repository
            .find_by_id(id)
            .await?
            .ok_or("User not found")?;

        user.update_email(email)?;
        self.repository.save(&user).await?;

        Ok(user)
    }

    pub async fn delete_user(&self, id: &str) -> Result<(), String> {
        self.repository.delete(id).await
    }
}
```

### Repository Implementation

src/services/database.rs:

```rust
use async_trait::async_trait;
use sqlx::SqlitePool;
use std::sync::Arc;
use crate::models::user::User;
use crate::services::user_service::UserRepository;

pub struct SqliteUserRepository {
    pool: SqlitePool,
}

impl SqliteUserRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl UserRepository for SqliteUserRepository {
    async fn find_by_id(&self, id: &str) -> Result<Option<User>, String> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| e.to_string())
    }

    async fn find_by_email(&self, email: &str) -> Result<Option<User>, String> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = ?")
            .bind(email)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| e.to_string())
    }

    async fn save(&self, user: &User) -> Result<(), String> {
        sqlx::query(
            "INSERT INTO users (id, username, email) VALUES (?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET username = ?, email = ?"
        )
        .bind(user.id().to_string())
        .bind(user.username())
        .bind(user.email())
        .bind(user.username())
        .bind(user.email())
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    async fn delete(&self, id: &str) -> Result<(), String> {
        sqlx::query("DELETE FROM users WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }
}
```

### Command Layer (Tauri Interface)

src/commands/user.rs:

```rust
use std::sync::Arc;
use tauri::State;
use crate::models::user::User;
use crate::services::user_service::UserService;

pub struct UserServiceState(pub Arc<UserService>);

#[tauri::command]
pub async fn create_user(
    service: State<'_, UserServiceState>,
    username: String,
    email: String,
) -> Result<User, String> {
    service.0.create_user(username, email).await
}

#[tauri::command]
pub async fn get_user(
    service: State<'_, UserServiceState>,
    id: String,
) -> Result<Option<User>, String> {
    service.0.get_user(&id).await
}

#[tauri::command]
pub async fn update_user_email(
    service: State<'_, UserServiceState>,
    id: String,
    email: String,
) -> Result<User, String> {
    service.0.update_user_email(&id, email).await
}

#[tauri::command]
pub async fn delete_user(
    service: State<'_, UserServiceState>,
    id: String,
) -> Result<(), String> {
    service.0.delete_user(&id).await
}
```

### Wiring It Together

src/main.rs:

```rust
mod commands;
mod models;
mod services;

use std::sync::Arc;
use sqlx::SqlitePool;
use services::database::SqliteUserRepository;
use services::user_service::UserService;
use commands::user::{UserServiceState, create_user, get_user, update_user_email, delete_user};

#[tokio::main]
async fn main() {
    let pool = SqlitePool::connect("sqlite:app.db")
        .await
        .expect("Failed to connect to database");

    let user_repository = Arc::new(SqliteUserRepository::new(pool));
    let user_service = Arc::new(UserService::new(user_repository));

    tauri::Builder::default()
        .manage(UserServiceState(user_service))
        .invoke_handler(tauri::generate_handler![
            create_user,
            get_user,
            update_user_email,
            delete_user
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## State Management

### Global Application State

src/state/app_state.rs:

```rust
use std::sync::Arc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub theme: String,
    pub language: String,
    pub auto_save: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            language: "en".to_string(),
            auto_save: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub email: String,
}

pub struct AppState {
    config: Arc<RwLock<AppConfig>>,
    current_user: Arc<RwLock<Option<User>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            config: Arc::new(RwLock::new(AppConfig::default())),
            current_user: Arc::new(RwLock::new(None)),
        }
    }
}

impl AppState {
    pub fn get_config(&self) -> AppConfig {
        self.config.read().clone()
    }

    pub fn update_config<F>(&self, f: F)
    where
        F: FnOnce(&mut AppConfig),
    {
        let mut config = self.config.write();
        f(&mut config);
    }

    pub fn get_user(&self) -> Option<User> {
        self.current_user.read().clone()
    }

    pub fn set_user(&self, user: Option<User>) {
        let mut current = self.current_user.write();
        *current = user;
    }
}
```

Commands for state management:

```rust
use tauri::State;
use crate::state::app_state::{AppState, AppConfig, User};

#[tauri::command]
pub fn get_config(state: State<AppState>) -> AppConfig {
    state.get_config()
}

#[tauri::command]
pub fn update_theme(state: State<AppState>, theme: String) -> Result<(), String> {
    state.update_config(|config| {
        config.theme = theme;
    });
    Ok(())
}

#[tauri::command]
pub fn get_current_user(state: State<AppState>) -> Option<User> {
    state.get_user()
}

#[tauri::command]
pub fn set_current_user(state: State<AppState>, user: User) -> Result<(), String> {
    state.set_user(Some(user));
    Ok(())
}

#[tauri::command]
pub fn logout(state: State<AppState>) -> Result<(), String> {
    state.set_user(None);
    Ok(())
}
```

## Command Patterns

### Command with Progress Tracking

```rust
use tauri::{Manager, Window};
use serde::Serialize;

#[derive(Clone, Serialize)]
struct ProgressPayload {
    stage: String,
    progress: f64,
    message: String,
}

#[tauri::command]
pub async fn process_with_progress(window: Window) -> Result<(), String> {
    let stages = vec![
        ("Initializing", 0.0),
        ("Loading data", 0.25),
        ("Processing", 0.50),
        ("Saving results", 0.75),
        ("Completed", 1.0),
    ];

    for (stage, progress) in stages {
        window
            .emit(
                "process-progress",
                ProgressPayload {
                    stage: stage.to_string(),
                    progress,
                    message: format!("Currently: {}", stage),
                },
            )
            .map_err(|e| e.to_string())?;

        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }

    Ok(())
}
```

### Cancellable Command

```rust
use std::sync::Arc;
use parking_lot::Mutex;
use tauri::{Manager, Window, State};

pub struct CancellationToken {
    cancelled: Arc<Mutex<bool>>,
}

impl CancellationToken {
    pub fn new() -> Self {
        Self {
            cancelled: Arc::new(Mutex::new(false)),
        }
    }

    pub fn cancel(&self) {
        *self.cancelled.lock() = true;
    }

    pub fn is_cancelled(&self) -> bool {
        *self.cancelled.lock()
    }

    pub fn reset(&self) {
        *self.cancelled.lock() = false;
    }
}

#[tauri::command]
pub async fn long_running_task(
    token: State<'_, CancellationToken>,
    window: Window,
) -> Result<String, String> {
    token.reset();

    for i in 0..100 {
        if token.is_cancelled() {
            return Err("Task cancelled".to_string());
        }

        window
            .emit("task-progress", i)
            .map_err(|e| e.to_string())?;

        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }

    Ok("Task completed".to_string())
}

#[tauri::command]
pub fn cancel_task(token: State<CancellationToken>) {
    token.cancel();
}
```

### Batch Operations

```rust
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct BatchRequest {
    pub items: Vec<String>,
}

#[derive(Serialize)]
pub struct BatchResult {
    pub success: Vec<String>,
    pub failed: Vec<(String, String)>,
}

#[tauri::command]
pub async fn batch_process(request: BatchRequest) -> Result<BatchResult, String> {
    let mut success = Vec::new();
    let mut failed = Vec::new();

    for item in request.items {
        match process_single_item(&item).await {
            Ok(_) => success.push(item),
            Err(e) => failed.push((item, e)),
        }
    }

    Ok(BatchResult { success, failed })
}

async fn process_single_item(item: &str) -> Result<(), String> {
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    Ok(())
}
```

## Error Handling

### Custom Error Types

src/errors.rs:

```rust
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub code: String,
    pub message: String,
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let response = ErrorResponse {
            code: self.error_code(),
            message: self.to_string(),
        };
        response.serialize(serializer)
    }
}

impl AppError {
    fn error_code(&self) -> String {
        match self {
            AppError::Database(_) => "DATABASE_ERROR",
            AppError::Io(_) => "IO_ERROR",
            AppError::Validation(_) => "VALIDATION_ERROR",
            AppError::NotFound(_) => "NOT_FOUND",
            AppError::Unauthorized(_) => "UNAUTHORIZED",
            AppError::Internal(_) => "INTERNAL_ERROR",
        }
        .to_string()
    }
}
```

Usage in commands:

```rust
use crate::errors::AppError;

#[tauri::command]
pub async fn get_user_by_id(id: String) -> Result<User, AppError> {
    if id.is_empty() {
        return Err(AppError::Validation("ID cannot be empty".to_string()));
    }

    let user = database::find_user(&id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("User {} not found", id)))?;

    Ok(user)
}
```

## Plugin System

### Creating a Custom Plugin

src/plugins/analytics.rs:

```rust
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime, State,
};
use std::sync::Arc;
use parking_lot::Mutex;

#[derive(Default)]
struct AnalyticsState {
    events: Arc<Mutex<Vec<String>>>,
}

#[tauri::command]
fn track_event(state: State<AnalyticsState>, event: String) {
    let mut events = state.events.lock();
    events.push(event);
    println!("Tracked event: {:?}", events.last());
}

#[tauri::command]
fn get_events(state: State<AnalyticsState>) -> Vec<String> {
    state.events.lock().clone()
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("analytics")
        .invoke_handler(tauri::generate_handler![track_event, get_events])
        .setup(|app, _api| {
            app.manage(AnalyticsState::default());
            Ok(())
        })
        .build()
}
```

Using the plugin:

```rust
mod plugins;

fn main() {
    tauri::Builder::default()
        .plugin(plugins::analytics::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Frontend usage:

```typescript
import { invoke } from "@tauri-apps/api/tauri";

await invoke("plugin:analytics|track_event", { event: "user_login" });
const events = await invoke("plugin:analytics|get_events");
```
