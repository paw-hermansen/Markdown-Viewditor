# Implementing Hexagonal Architecture with SurrealDB

Guides you through implementing hexagonal architecture (ports and adapters pattern) in Rust projects using SurrealDB as the persistence layer. Ensures clean separation between domain logic, application use cases, and infrastructure concerns while leveraging SurrealDB's multi-model capabilities.

## When to Use This Skill

- Building new services with SurrealDB as persistence layer
- Implementing multi-model data patterns (document, graph, key-value)
- Need real-time data subscriptions and live queries
- Graph traversal and relationship modeling
- Want framework-independent business logic with SurrealDB

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
│   ├── web/          # Actix/Axum handlers and routes
│   └── persistence/  # SurrealDB implementations
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

### Step 4: Implement SurrealDB Adapter

```rust
use surrealdb::engine::remote::ws::Ws;
use surrealdb::opt::auth::Root;
use surrealdb::Surreal;

pub struct SurrealUserRepository {
    db: Surreal<surrealdb::engine::any::Any>,
}

impl SurrealUserRepository {
    pub async fn new(connection_url: &str) -> Result<Self, String> {
        let db = Surreal::new::<Ws>(connection_url)
            .await
            .map_err(|e| format!("Connection failed: {}", e))?;

        db.signin(Root {
            username: "root",
            password: "root",
        })
        .await
        .map_err(|e| format!("Authentication failed: {}", e))?;

        db.use_ns("app").use_db("main")
            .await
            .map_err(|e| format!("Namespace/Database selection failed: {}", e))?;

        Ok(Self { db })
    }
}

#[async_trait]
impl UserRepository for SurrealUserRepository {
    async fn save(&self, user: &User) -> Result<(), String> {
        let _: Option<User> = self.db
            .create(("user", user.id().to_string()))
            .content(user)
            .await
            .map_err(|e| format!("Database error: {}", e))?;
        Ok(())
    }

    async fn find_by_id(&self, id: &Uuid) -> Result<Option<User>, String> {
        let user: Option<User> = self.db
            .select(("user", id.to_string()))
            .await
            .map_err(|e| format!("Database error: {}", e))?;
        Ok(user)
    }

    async fn delete(&self, id: &Uuid) -> Result<(), String> {
        let _: Option<User> = self.db
            .delete(("user", id.to_string()))
            .await
            .map_err(|e| format!("Database error: {}", e))?;
        Ok(())
    }
}
```

### Step 5: Create Web Handler

```rust
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct CreateUserRequest {
    pub email: String,
    pub name: String,
}

#[derive(Serialize)]
pub struct UserResponse {
    pub id: String,
    pub email: String,
    pub name: String,
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        Self {
            id: user.id().to_string(),
            email: user.email().to_string(),
            name: user.name().to_string(),
        }
    }
}
```

#### Actix-web Handler

```rust
use actix_web::{web, HttpResponse, Responder};

pub async fn create_user(
    service: web::Data<Arc<UserUseCase>>,
    req: web::Json<CreateUserRequest>,
) -> impl Responder {
    match service.create_user(req.email.clone(), req.name.clone()).await {
        Ok(user) => HttpResponse::Created().json(UserResponse::from(user)),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({"error": e})),
    }
}
```

#### Axum Handler

```rust
use axum::{
    extract::{Json, State},
    http::StatusCode,
    response::IntoResponse,
};

pub async fn create_user(
    State(service): State<Arc<UserUseCase>>,
    Json(req): Json<CreateUserRequest>,
) -> impl IntoResponse {
    match service.create_user(req.email, req.name).await {
        Ok(user) => (StatusCode::CREATED, Json(UserResponse::from(user))).into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": e})),
        ).into_response(),
    }
}
```

### Step 6: Wire Everything Together

#### Actix-web Setup

```rust
use actix_web::{web, App, HttpServer};
use std::sync::Arc;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let repository = Arc::new(
        SurrealUserRepository::new("ws://127.0.0.1:8000")
            .await
            .expect("Failed to connect to SurrealDB")
    );
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

#### Axum Setup

```rust
use axum::{routing::post, Router};
use tokio::net::TcpListener;
use std::sync::Arc;

#[tokio::main]
async fn main() {
    let repository = Arc::new(
        SurrealUserRepository::new("ws://127.0.0.1:8000")
            .await
            .expect("Failed to connect to SurrealDB")
    );
    let service = Arc::new(UserUseCase::new(repository));

    let app = Router::new()
        .route("/users", post(create_user))
        .with_state(service);

    let listener = TcpListener::bind("127.0.0.1:8080")
        .await
        .expect("Failed to bind");

    axum::serve(listener, app)
        .await
        .expect("Failed to start server");
}
```

## Required Dependencies

```toml
[dependencies]
surrealdb = "2"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4", "serde"] }
async-trait = "0.1"
futures = "0.3"

# Optional: Choose your web framework
actix-web = { version = "4", optional = true }
axum = { version = "0", optional = true }
tower = { version = "0", optional = true }
tower-http = { version = "0", features = ["cors", "trace"], optional = true }
```

## Additional Resources

For detailed patterns and advanced topics, see:

- **[IMPLEMENTATION.md](IMPLEMENTATION.md)** - Complete layer-by-layer implementation guide
- **[REALTIME.md](REALTIME.md)** - Live queries and real-time subscriptions
- **[GRAPH.md](GRAPH.md)** - Graph relations and traversal patterns
- **[TESTING.md](TESTING.md)** - Testing strategies and security best practices

## Key Principles

1. **Domain Independence**: Business logic has no framework dependencies
2. **Dependency Inversion**: Infrastructure depends on domain, not vice versa
3. **Testability**: Each layer tested independently with mocks
4. **Flexibility**: Swap databases, frameworks without touching business logic
5. **Security First**: Validate at boundaries, use parameterized queries
6. **Multi-Model Flexibility**: Leverage document, graph, and key-value patterns as needed

## Benefits

- Framework-agnostic business logic
- Easy to test and maintain
- Simple to swap implementations
- Clear separation of concerns
- Technology-independent domain model
- Multi-model data support (document, graph, key-value)
- Real-time subscriptions built-in
- Graph traversal and relationships
