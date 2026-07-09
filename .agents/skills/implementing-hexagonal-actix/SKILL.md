# Implementing Hexagonal Architecture with Actix-web

Guides you through implementing hexagonal architecture (ports and adapters pattern) in Rust projects using the Actix-web framework. Ensures clean separation between domain logic, application use cases, and infrastructure concerns.

## When to Use This Skill

- Building new Actix web services with clean architecture
- Refactoring existing Actix applications for better testability
- Implementing domain-driven design patterns
- Need framework-independent business logic
- Want to swap infrastructure components easily

## Architecture Overview

```
src/
├── domain/           # Business logic (framework-agnostic)
│   ├── entities/     # Core business objects
│   ├── repositories/ # Repository traits (ports)
├── application/      # Use cases and orchestration
│   ├── use_cases/    # Application use cases
│   └── ports/        # Service interfaces
├── infrastructure/   # Framework-specific adapters
│   ├── web/          # Actix handlers and routes
│   └── persistence/  # Database implementations
└── main.rs           # Dependency injection setup
```

## Quick Start

### Step 1: Define Domain Entity

```rust
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct User {
    id: Uuid,
    email: String,
    name: String,
}

impl User {
    pub fn new(email: String, name: String) -> Result<Self, String> {
        if email.is_empty() {
            return Err("Email cannot be empty".to_string());
        }
        Ok(Self {
            id: Uuid::new_v4(),
            email,
            name,
        })
    }

    pub fn id(&self) -> &Uuid { &self.id }
    pub fn email(&self) -> &str { &self.email }
    pub fn name(&self) -> &str { &self.name }
}
```

### Step 2: Define Repository Port (Trait)

```rust
use async_trait::async_trait;

#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn find_by_id(&self, id: &Uuid) -> Result<Option<User>, String>;
    async fn save(&self, user: &User) -> Result<(), String>;
    async fn delete(&self, id: &Uuid) -> Result<(), String>;
}
```

### Step 3: Implement Use Case

```rust
use std::sync::Arc;

pub struct UserUseCase {
    repository: Arc<dyn UserRepository>,
}

impl UserUseCase {
    pub fn new(repository: Arc<dyn UserRepository>) -> Self {
        Self { repository }
    }

    pub async fn create_user(&self, email: String, name: String) -> Result<User, String> {
        let user = User::new(email, name)?;
        self.repository.save(&user).await?;
        Ok(user)
    }
}
```

### Step 4: Implement Database Adapter

```rust
use sqlx::PgPool;

pub struct PostgresUserRepository {
    pool: PgPool,
}

impl PostgresUserRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl UserRepository for PostgresUserRepository {
    async fn save(&self, user: &User) -> Result<(), String> {
        sqlx::query!(
            "INSERT INTO users (id, email, name) VALUES ($1, $2, $3)",
            user.id(), user.email(), user.name()
        )
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;
        Ok(())
    }
}
```

### Step 5: Create Actix Handler

```rust
use actix_web::{web, HttpResponse, Responder};

#[derive(Deserialize)]
pub struct CreateUserRequest {
    pub email: String,
    pub name: String,
}

pub async fn create_user(
    service: web::Data<Arc<UserUseCase>>,
    req: web::Json<CreateUserRequest>,
) -> impl Responder {
    match service.create_user(req.email.clone(), req.name.clone()).await {
        Ok(user) => HttpResponse::Created().json(user),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({"error": e})),
    }
}
```

### Step 6: Wire Everything Together

```rust
use actix_web::{web, App, HttpServer};
use sqlx::postgres::PgPoolOptions;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&std::env::var("DATABASE_URL").unwrap())
        .await
        .expect("Failed to connect to database");

    let repository = Arc::new(PostgresUserRepository::new(pool));
    let service = Arc::new(UserUseCase::new(repository));

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(service.clone()))
            .route("/users", web::post().to(create_user))
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
```

## Required Dependencies

```toml
[dependencies]
actix-web = "4"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4", "serde"] }
async-trait = "0.1"
sqlx = { version = "0", features = ["runtime-tokio-rustls", "postgres", "uuid"] }
```

## Additional Resources

For detailed patterns and advanced topics, see:

- **[CONCURRENCY.md](CONCURRENCY.md)** - Thread-safe patterns with Arc, Mutex, RwLock, channels
- **[IMPLEMENTATION.md](IMPLEMENTATION.md)** - Complete layer-by-layer implementation guide
- **[TESTING.md](TESTING.md)** - Testing strategies and security best practices

## Key Principles

1. **Domain Independence**: Business logic has no framework dependencies
2. **Dependency Inversion**: Infrastructure depends on domain, not vice versa
3. **Testability**: Each layer tested independently with mocks
4. **Flexibility**: Swap databases, frameworks without touching business logic
5. **Security First**: Validate at boundaries, use parameterized queries

## Benefits

- Framework-agnostic business logic
- Easy to test and maintain
- Simple to swap implementations
- Clear separation of concerns
- Technology-independent domain model
