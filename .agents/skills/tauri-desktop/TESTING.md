# Testing and Security Guide

Testing strategies and security best practices for Tauri applications.

## Table of Contents

- [Unit Testing](#unit-testing)
- [Integration Testing](#integration-testing)
- [E2E Testing](#e2e-testing)
- [Security Best Practices](#security-best-practices)
- [Performance Testing](#performance-testing)

## Unit Testing

### Testing Rust Commands

src/commands/user.rs:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::user::User;

    #[test]
    fn test_user_creation() {
        let user = User::new("testuser".to_string(), "test@example.com".to_string());
        assert!(user.is_ok());

        let user = user.unwrap();
        assert_eq!(user.username(), "testuser");
        assert_eq!(user.email(), "test@example.com");
    }

    #[test]
    fn test_user_validation() {
        let result = User::new("".to_string(), "test@example.com".to_string());
        assert!(result.is_err());

        let result = User::new("testuser".to_string(), "invalid-email".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_email_update() {
        let mut user = User::new("testuser".to_string(), "old@example.com".to_string()).unwrap();
        let result = user.update_email("new@example.com".to_string());
        assert!(result.is_ok());
        assert_eq!(user.email(), "new@example.com");
    }
}
```

### Testing Services with Mocks

src/services/user_service.rs:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use std::sync::{Arc, Mutex};

    struct MockUserRepository {
        users: Arc<Mutex<Vec<User>>>,
    }

    impl MockUserRepository {
        fn new() -> Self {
            Self {
                users: Arc::new(Mutex::new(Vec::new())),
            }
        }
    }

    #[async_trait]
    impl UserRepository for MockUserRepository {
        async fn find_by_id(&self, id: &str) -> Result<Option<User>, String> {
            let users = self.users.lock().unwrap();
            Ok(users.iter().find(|u| u.id().to_string() == id).cloned())
        }

        async fn find_by_email(&self, email: &str) -> Result<Option<User>, String> {
            let users = self.users.lock().unwrap();
            Ok(users.iter().find(|u| u.email() == email).cloned())
        }

        async fn save(&self, user: &User) -> Result<(), String> {
            let mut users = self.users.lock().unwrap();
            users.retain(|u| u.id() != user.id());
            users.push(user.clone());
            Ok(())
        }

        async fn delete(&self, id: &str) -> Result<(), String> {
            let mut users = self.users.lock().unwrap();
            users.retain(|u| u.id().to_string() != id);
            Ok(())
        }
    }

    #[tokio::test]
    async fn test_create_user() {
        let repo = Arc::new(MockUserRepository::new());
        let service = UserService::new(repo.clone());

        let result = service
            .create_user("testuser".to_string(), "test@example.com".to_string())
            .await;

        assert!(result.is_ok());
        let user = result.unwrap();
        assert_eq!(user.username(), "testuser");
    }

    #[tokio::test]
    async fn test_duplicate_email() {
        let repo = Arc::new(MockUserRepository::new());
        let service = UserService::new(repo.clone());

        service
            .create_user("user1".to_string(), "test@example.com".to_string())
            .await
            .unwrap();

        let result = service
            .create_user("user2".to_string(), "test@example.com".to_string())
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already exists"));
    }

    #[tokio::test]
    async fn test_delete_user() {
        let repo = Arc::new(MockUserRepository::new());
        let service = UserService::new(repo.clone());

        let user = service
            .create_user("testuser".to_string(), "test@example.com".to_string())
            .await
            .unwrap();

        let result = service.delete_user(&user.id().to_string()).await;
        assert!(result.is_ok());

        let found = service.get_user(&user.id().to_string()).await.unwrap();
        assert!(found.is_none());
    }
}
```

### Testing Database Layer

tests/database_test.rs:

```rust
use sqlx::SqlitePool;
use tauri_app::services::database::SqliteUserRepository;
use tauri_app::services::user_service::UserRepository;
use tauri_app::models::user::User;

#[tokio::test]
async fn test_database_operations() {
    let pool = SqlitePool::connect(":memory:")
        .await
        .expect("Failed to connect to database");

    sqlx::query(
        "CREATE TABLE users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE
        )"
    )
    .execute(&pool)
    .await
    .expect("Failed to create table");

    let repo = SqliteUserRepository::new(pool);

    let user = User::new("testuser".to_string(), "test@example.com".to_string()).unwrap();
    repo.save(&user).await.expect("Failed to save user");

    let found = repo
        .find_by_email("test@example.com")
        .await
        .expect("Failed to find user");

    assert!(found.is_some());
    assert_eq!(found.unwrap().username(), "testuser");
}
```

## Integration Testing

### Testing Tauri Commands

tests/commands_test.rs:

```rust
use tauri::test::{mock_builder, MockRuntime};

#[test]
fn test_greet_command() {
    let app = mock_builder()
        .invoke_handler(tauri::generate_handler![greet])
        .build(tauri::generate_context!())
        .expect("failed to build app");

    let window = app.get_window("main").unwrap();
    let result: String = tauri::test::get_ipc_response(
        &window,
        tauri::InvokeRequest {
            cmd: "greet".to_string(),
            callback: tauri::ipc::CallbackFn(0),
            error: tauri::ipc::CallbackFn(1),
            body: serde_json::json!({ "name": "World" }),
            headers: Default::default(),
            invoke_key: None,
        },
    );

    assert_eq!(result, "Hello, World!");
}
```

### Testing with State

```rust
use tauri::test::{mock_builder, mock_context, MockRuntime};
use tauri::State;

#[derive(Default)]
struct TestState {
    counter: std::sync::Mutex<i32>,
}

#[tauri::command]
fn increment(state: State<TestState>) -> i32 {
    let mut counter = state.counter.lock().unwrap();
    *counter += 1;
    *counter
}

#[test]
fn test_stateful_command() {
    let app = mock_builder()
        .manage(TestState::default())
        .invoke_handler(tauri::generate_handler![increment])
        .build(mock_context())
        .expect("failed to build app");

    let window = app.get_window("main").unwrap();

    for expected in 1..=5 {
        let result: i32 = tauri::test::get_ipc_response(
            &window,
            tauri::InvokeRequest {
                cmd: "increment".to_string(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                body: serde_json::json!({}),
                headers: Default::default(),
                invoke_key: None,
            },
        );

        assert_eq!(result, expected);
    }
}
```

## E2E Testing

### WebDriver Setup

Install WebDriver for E2E testing:

```bash
cargo install tauri-driver
npm install -D @wdio/cli
```

wdio.conf.ts:

```typescript
export const config: WebdriverIO.Config = {
  specs: ["./test/e2e/**/*.ts"],
  capabilities: [
    {
      maxInstances: 1,
      "tauri:options": {
        application: "../src-tauri/target/release/app",
      },
    },
  ],
  logLevel: "info",
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },
};
```

### E2E Test Example

test/e2e/user.test.ts:

```typescript
describe("User Management", () => {
  before(async () => {
    await browser.pause(1000);
  });

  it("should create a new user", async () => {
    const usernameInput = await $('input[name="username"]');
    const emailInput = await $('input[name="email"]');
    const submitButton = await $('button[type="submit"]');

    await usernameInput.setValue("testuser");
    await emailInput.setValue("test@example.com");
    await submitButton.click();

    await browser.pause(500);

    const userList = await $("ul.user-list");
    const users = await userList.$$("li");
    expect(users.length).toBeGreaterThan(0);
  });

  it("should display validation error for invalid email", async () => {
    const emailInput = await $('input[name="email"]');
    const submitButton = await $('button[type="submit"]');

    await emailInput.setValue("invalid-email");
    await submitButton.click();

    const errorMessage = await $(".error");
    await expect(errorMessage).toHaveText("Invalid email format");
  });

  it("should delete a user", async () => {
    const deleteButton = await $("button.delete-user");
    await deleteButton.click();

    const confirmButton = await $("button.confirm-delete");
    await confirmButton.click();

    await browser.pause(500);

    const userList = await $("ul.user-list");
    const users = await userList.$$("li");
    expect(users.length).toBe(0);
  });
});
```

### Testing Window Management

test/e2e/windows.test.ts:

```typescript
describe("Window Management", () => {
  it("should open settings window", async () => {
    const settingsButton = await $('button[data-action="open-settings"]');
    await settingsButton.click();

    await browser.pause(1000);

    const windows = await browser.getWindowHandles();
    expect(windows.length).toBe(2);

    await browser.switchToWindow(windows[1]);
    const title = await browser.getTitle();
    expect(title).toBe("Settings");
  });

  it("should communicate between windows", async () => {
    const windows = await browser.getWindowHandles();

    await browser.switchToWindow(windows[0]);
    const updateButton = await $('button[data-action="update-from-main"]');
    await updateButton.click();

    await browser.switchToWindow(windows[1]);
    await browser.pause(500);

    const statusText = await $('[data-testid="sync-status"]');
    await expect(statusText).toHaveText("Synchronized");
  });
});
```

## Security Best Practices

### Capability-Based Permissions

src-tauri/capabilities/default.json:

```json
{
  "$schema": "https://schema.tauri.app/config/2.0.0",
  "identifier": "default",
  "description": "Default permissions",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default",
    "fs:read-file",
    "fs:write-file",
    {
      "identifier": "fs:scope-app-data",
      "allow": ["$APPDATA/**"],
      "deny": []
    }
  ]
}
```

### Input Validation

```rust
use validator::Validate;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Validate)]
pub struct CreateUserRequest {
    #[validate(length(min = 3, max = 20))]
    pub username: String,

    #[validate(email)]
    pub email: String,

    #[validate(length(min = 8))]
    pub password: String,
}

#[tauri::command]
async fn create_user(request: CreateUserRequest) -> Result<User, String> {
    request.validate().map_err(|e| e.to_string())?;

    Ok(User::new(request.username, request.email)?)
}
```

### Path Traversal Prevention

```rust
use std::path::{Path, PathBuf};
use tauri::api::path::app_data_dir;

fn validate_path(config: &tauri::Config, path: &str) -> Result<PathBuf, String> {
    let app_dir = app_data_dir(config)
        .ok_or("Failed to get app data directory")?;

    let requested_path = Path::new(path);
    let canonical = requested_path
        .canonicalize()
        .map_err(|_| "Invalid path")?;

    if !canonical.starts_with(&app_dir) {
        return Err("Path traversal detected".to_string());
    }

    Ok(canonical)
}

#[tauri::command]
async fn read_secure_file(
    config: tauri::State<'_, tauri::Config>,
    path: String,
) -> Result<String, String> {
    let safe_path = validate_path(&config, &path)?;
    std::fs::read_to_string(safe_path).map_err(|e| e.to_string())
}
```

### SQL Injection Prevention

Always use parameterized queries:

```rust
#[tauri::command]
async fn search_users(db: State<'_, Database>, query: String) -> Result<Vec<User>, String> {
    let users = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE username LIKE ? OR email LIKE ?"
    )
    .bind(format!("%{}%", query))
    .bind(format!("%{}%", query))
    .fetch_all(&db.pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(users)
}
```

### Secure Storage

```rust
use keyring::Entry;

#[tauri::command]
fn store_token(service: String, username: String, token: String) -> Result<(), String> {
    let entry = Entry::new(&service, &username)
        .map_err(|e| e.to_string())?;

    entry
        .set_password(&token)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_token(service: String, username: String) -> Result<String, String> {
    let entry = Entry::new(&service, &username)
        .map_err(|e| e.to_string())?;

    entry
        .get_password()
        .map_err(|e| e.to_string())
}
```

### Content Security Policy

tauri.conf.json:

```json
{
  "app": {
    "security": {
      "csp": {
        "default-src": "'self'",
        "script-src": ["'self'", "'wasm-unsafe-eval'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'", "https://api.example.com"]
      }
    }
  }
}
```

### Rate Limiting

```rust
use std::sync::Arc;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::time::{Duration, Instant};

pub struct RateLimiter {
    requests: Arc<Mutex<HashMap<String, Vec<Instant>>>>,
    max_requests: usize,
    window: Duration,
}

impl RateLimiter {
    pub fn new(max_requests: usize, window: Duration) -> Self {
        Self {
            requests: Arc::new(Mutex::new(HashMap::new())),
            max_requests,
            window,
        }
    }

    pub fn check(&self, key: &str) -> Result<(), String> {
        let mut requests = self.requests.lock();
        let now = Instant::now();

        let entry = requests.entry(key.to_string()).or_insert_with(Vec::new);
        entry.retain(|&time| now.duration_since(time) < self.window);

        if entry.len() >= self.max_requests {
            return Err("Rate limit exceeded".to_string());
        }

        entry.push(now);
        Ok(())
    }
}

#[tauri::command]
async fn rate_limited_operation(
    limiter: State<'_, RateLimiter>,
    user_id: String,
) -> Result<String, String> {
    limiter.check(&user_id)?;

    Ok("Operation completed".to_string())
}
```

## Performance Testing

### Benchmarking Commands

benches/command_bench.rs:

```rust
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use tauri_app::services::user_service::UserService;

fn benchmark_user_creation(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let service = create_test_service();

    c.bench_function("create_user", |b| {
        b.to_async(&rt).iter(|| async {
            service
                .create_user(
                    black_box("testuser".to_string()),
                    black_box("test@example.com".to_string()),
                )
                .await
        });
    });
}

criterion_group!(benches, benchmark_user_creation);
criterion_main!(benches);
```

### Memory Profiling

```bash
cargo install cargo-instruments
cargo instruments --template Allocations --bin tauri-app
```

### Bundle Size Analysis

```bash
cargo bloat --release --crates
cargo build --release && ls -lh target/release/tauri-app
```
