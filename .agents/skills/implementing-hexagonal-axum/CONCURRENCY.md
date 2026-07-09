# Rust Concurrency Patterns for Hexagonal Architecture

Thread-safe patterns for implementing hexagonal architecture with shared state and concurrent access.

## Table of Contents

- [Arc - Atomic Reference Counting](#arc---atomic-reference-counting)
- [Mutex - Mutual Exclusion](#mutex---mutual-exclusion)
- [RwLock - Read-Write Lock](#rwlock---read-write-lock)
- [Tokio Async Primitives](#tokio-async-primitives)
- [Parking Lot](#parking-lot---high-performance)
- [Channels - Message Passing](#channels---message-passing)
- [OnceCell - Lazy Initialization](#oncecell---lazy-initialization)
- [Best Practices](#concurrency-best-practices)

## Arc - Atomic Reference Counting

Use `Arc` for shared ownership across threads. Essential for sharing services and repositories.

```rust
use std::sync::Arc;

let repository = Arc::new(PostgresUserRepository::new(pool));
let service: Arc<dyn UserService> = Arc::new(UserUseCase::new(repository.clone()));

let service_clone = service.clone();
tokio::spawn(async move {
    service_clone.get_user(&user_id).await
});
```

## Mutex - Mutual Exclusion

Use `Mutex` for shared mutable state with exclusive access. Blocks threads waiting for lock.

```rust
use std::sync::{Arc, Mutex};
use std::collections::HashMap;

pub struct CachedUserRepository {
    inner: Arc<dyn UserRepository>,
    cache: Arc<Mutex<HashMap<Uuid, User>>>,
}

impl CachedUserRepository {
    pub fn new(inner: Arc<dyn UserRepository>) -> Self {
        Self {
            inner,
            cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[async_trait]
impl UserRepository for CachedUserRepository {
    async fn find_by_id(&self, id: &Uuid) -> Result<Option<User>, String> {
        {
            let cache = self.cache.lock().unwrap();
            if let Some(user) = cache.get(id) {
                return Ok(Some(user.clone()));
            }
        }

        let user = self.inner.find_by_id(id).await?;
        if let Some(ref u) = user {
            let mut cache = self.cache.lock().unwrap();
            cache.insert(*id, u.clone());
        }
        Ok(user)
    }

    async fn save(&self, user: &User) -> Result<(), String> {
        self.inner.save(user).await?;
        let mut cache = self.cache.lock().unwrap();
        cache.insert(*user.id(), user.clone());
        Ok(())
    }

    async fn delete(&self, id: &Uuid) -> Result<(), String> {
        self.inner.delete(id).await?;
        let mut cache = self.cache.lock().unwrap();
        cache.remove(id);
        Ok(())
    }
}
```

## RwLock - Read-Write Lock

Use `RwLock` for shared state with multiple readers or single writer. Better performance than Mutex for read-heavy workloads.

```rust
use std::sync::{Arc, RwLock};
use std::collections::HashMap;

pub struct ConfigurationService {
    settings: Arc<RwLock<HashMap<String, String>>>,
}

impl ConfigurationService {
    pub fn new() -> Self {
        Self {
            settings: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn get(&self, key: &str) -> Option<String> {
        let settings = self.settings.read().unwrap();
        settings.get(key).cloned()
    }

    pub fn set(&self, key: String, value: String) {
        let mut settings = self.settings.write().unwrap();
        settings.insert(key, value);
    }

    pub fn get_all(&self) -> HashMap<String, String> {
        let settings = self.settings.read().unwrap();
        settings.clone()
    }
}
```

## Tokio Async Primitives

### Tokio Mutex

Use `tokio::sync::Mutex` for async contexts. Yields instead of blocking threads.

```rust
use tokio::sync::Mutex;
use std::sync::Arc;

pub struct AsyncCachedRepository {
    inner: Arc<dyn UserRepository>,
    cache: Arc<Mutex<HashMap<Uuid, User>>>,
}

#[async_trait]
impl UserRepository for AsyncCachedRepository {
    async fn find_by_id(&self, id: &Uuid) -> Result<Option<User>, String> {
        {
            let cache = self.cache.lock().await;
            if let Some(user) = cache.get(id) {
                return Ok(Some(user.clone()));
            }
        }

        let user = self.inner.find_by_id(id).await?;
        if let Some(ref u) = user {
            let mut cache = self.cache.lock().await;
            cache.insert(*id, u.clone());
        }
        Ok(user)
    }

    async fn save(&self, user: &User) -> Result<(), String> {
        self.inner.save(user).await?;
        let mut cache = self.cache.lock().await;
        cache.insert(*user.id(), user.clone());
        Ok(())
    }

    async fn delete(&self, id: &Uuid) -> Result<(), String> {
        self.inner.delete(id).await?;
        let mut cache = self.cache.lock().await;
        cache.remove(id);
        Ok(())
    }
}
```

### Tokio RwLock

Use `tokio::sync::RwLock` for async read-write scenarios.

```rust
use tokio::sync::RwLock;
use std::sync::Arc;

pub struct AsyncConfigService {
    settings: Arc<RwLock<HashMap<String, String>>>,
}

impl AsyncConfigService {
    pub fn new() -> Self {
        Self {
            settings: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn get(&self, key: &str) -> Option<String> {
        let settings = self.settings.read().await;
        settings.get(key).cloned()
    }

    pub async fn set(&self, key: String, value: String) {
        let mut settings = self.settings.write().await;
        settings.insert(key, value);
    }
}
```

## Parking Lot - High Performance

Use `parking_lot` for better performance than standard library primitives.

Add to dependencies:

```toml
parking_lot = "0"
```

```rust
use parking_lot::{Mutex, RwLock};
use std::sync::Arc;

pub struct FastCachedRepository {
    inner: Arc<dyn UserRepository>,
    cache: Arc<Mutex<HashMap<Uuid, User>>>,
}

#[async_trait]
impl UserRepository for FastCachedRepository {
    async fn find_by_id(&self, id: &Uuid) -> Result<Option<User>, String> {
        {
            let cache = self.cache.lock();
            if let Some(user) = cache.get(id) {
                return Ok(Some(user.clone()));
            }
        }

        let user = self.inner.find_by_id(id).await?;
        if let Some(ref u) = user {
            self.cache.lock().insert(*id, u.clone());
        }
        Ok(user)
    }

    async fn save(&self, user: &User) -> Result<(), String> {
        self.inner.save(user).await?;
        self.cache.lock().insert(*user.id(), user.clone());
        Ok(())
    }

    async fn delete(&self, id: &Uuid) -> Result<(), String> {
        self.inner.delete(id).await?;
        self.cache.lock().remove(id);
        Ok(())
    }
}
```

## Channels - Message Passing

Use channels for communication between tasks.

```rust
use tokio::sync::mpsc;
use std::sync::Arc;

pub struct EventPublisher {
    tx: mpsc::UnboundedSender<DomainEvent>,
}

pub enum DomainEvent {
    UserCreated(Uuid),
    UserDeleted(Uuid),
}

impl EventPublisher {
    pub fn new() -> (Self, mpsc::UnboundedReceiver<DomainEvent>) {
        let (tx, rx) = mpsc::unbounded_channel();
        (Self { tx }, rx)
    }

    pub fn publish(&self, event: DomainEvent) {
        let _ = self.tx.send(event);
    }
}

pub struct UserUseCaseWithEvents {
    repository: Arc<dyn UserRepository>,
    publisher: Arc<EventPublisher>,
}

#[async_trait]
impl UserService for UserUseCaseWithEvents {
    async fn create_user(&self, email: String, name: String) -> Result<User, String> {
        let user = User::new(email, name)?;
        self.repository.save(&user).await?;
        self.publisher.publish(DomainEvent::UserCreated(*user.id()));
        Ok(user)
    }

    async fn delete_user(&self, id: &Uuid) -> Result<(), String> {
        self.repository.delete(id).await?;
        self.publisher.publish(DomainEvent::UserDeleted(*id));
        Ok(())
    }
}
```

## OnceCell - Lazy Initialization

Use `OnceCell` for one-time initialization.

```rust
use std::sync::OnceLock;

static CONFIG: OnceLock<AppConfig> = OnceLock::new();

pub struct AppConfig {
    pub database_url: String,
    pub port: u16,
}

pub fn get_config() -> &'static AppConfig {
    CONFIG.get_or_init(|| AppConfig {
        database_url: std::env::var("DATABASE_URL").unwrap(),
        port: 8080,
    })
}
```

## Thread-Safe Repository Pattern

Complete example with proper concurrency:

```rust
use std::sync::Arc;
use parking_lot::RwLock;
use std::collections::HashMap;

pub struct InMemoryUserRepository {
    users: Arc<RwLock<HashMap<Uuid, User>>>,
    email_index: Arc<RwLock<HashMap<String, Uuid>>>,
}

impl InMemoryUserRepository {
    pub fn new() -> Self {
        Self {
            users: Arc::new(RwLock::new(HashMap::new())),
            email_index: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

#[async_trait]
impl UserRepository for InMemoryUserRepository {
    async fn find_by_id(&self, id: &Uuid) -> Result<Option<User>, String> {
        let users = self.users.read();
        Ok(users.get(id).cloned())
    }

    async fn find_by_email(&self, email: &str) -> Result<Option<User>, String> {
        let email_index = self.email_index.read();
        let user_id = email_index.get(email);

        match user_id {
            Some(id) => {
                let users = self.users.read();
                Ok(users.get(id).cloned())
            }
            None => Ok(None),
        }
    }

    async fn save(&self, user: &User) -> Result<(), String> {
        let mut users = self.users.write();
        let mut email_index = self.email_index.write();

        users.insert(*user.id(), user.clone());
        email_index.insert(user.email().to_string(), *user.id());

        Ok(())
    }

    async fn delete(&self, id: &Uuid) -> Result<(), String> {
        let mut users = self.users.write();
        let mut email_index = self.email_index.write();

        if let Some(user) = users.remove(id) {
            email_index.remove(user.email());
        }

        Ok(())
    }
}
```

## Concurrency Best Practices

1. **Prefer Arc over cloning**: Share ownership instead of cloning expensive data
2. **Use RwLock for read-heavy**: Multiple readers can access simultaneously
3. **Avoid holding locks across await**: Deadlock risk and performance issues
4. **Use parking_lot**: Better performance than std primitives
5. **Prefer message passing**: Channels over shared state when possible
6. **Tokio primitives for async**: Use tokio::sync for async contexts
7. **Minimize lock scope**: Release locks as soon as possible
8. **Avoid nested locks**: Prevent deadlocks
9. **Handle lock poisoning**: Use appropriate error handling
10. **Profile before optimizing**: Measure actual contention
