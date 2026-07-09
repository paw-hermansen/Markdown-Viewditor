# Complete Implementation Guide

Layer-by-layer implementation of hexagonal architecture with Axum.

## Table of Contents

- [Domain Layer](#domain-layer)
- [Application Layer](#application-layer)
- [Infrastructure Layer](#infrastructure-layer)
- [Wiring It Together](#wiring-it-together)
- [Middleware Integration](#middleware-integration)

## Domain Layer

### Entities

Domain entities with business rules and validation:

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
        if !email.contains('@') {
            return Err("Invalid email format".to_string());
        }
        Ok(Self {
            id: Uuid::new_v4(),
            email,
            name,
        })
    }

    pub fn id(&self) -> &Uuid {
        &self.id
    }

    pub fn email(&self) -> &str {
        &self.email
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn update_name(&mut self, name: String) -> Result<(), String> {
        if name.is_empty() {
            return Err("Name cannot be empty".to_string());
        }
        self.name = name;
        Ok(())
    }
}
```

### Repository Ports

Define repository interfaces as traits:

```rust
use async_trait::async_trait;
use uuid::Uuid;
use crate::domain::entities::User;

#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn find_by_id(&self, id: &Uuid) -> Result<Option<User>, String>;
    async fn find_by_email(&self, email: &str) -> Result<Option<User>, String>;
    async fn save(&self, user: &User) -> Result<(), String>;
    async fn delete(&self, id: &Uuid) -> Result<(), String>;
    async fn list_all(&self) -> Result<Vec<User>, String>;
}
```

## Application Layer

### Service Ports

Define application service interfaces:

```rust
use async_trait::async_trait;
use uuid::Uuid;
use crate::domain::entities::User;

#[async_trait]
pub trait UserService: Send + Sync {
    async fn create_user(&self, email: String, name: String) -> Result<User, String>;
    async fn get_user(&self, id: &Uuid) -> Result<Option<User>, String>;
    async fn update_user_name(&self, id: &Uuid, name: String) -> Result<User, String>;
    async fn delete_user(&self, id: &Uuid) -> Result<(), String>;
    async fn list_users(&self) -> Result<Vec<User>, String>;
}
```

### Use Cases

Implement business logic orchestration:

```rust
use async_trait::async_trait;
use uuid::Uuid;
use std::sync::Arc;
use crate::domain::entities::User;
use crate::domain::repositories::UserRepository;
use crate::application::ports::UserService;

pub struct UserUseCase {
    repository: Arc<dyn UserRepository>,
}

impl UserUseCase {
    pub fn new(repository: Arc<dyn UserRepository>) -> Self {
        Self { repository }
    }
}

#[async_trait]
impl UserService for UserUseCase {
    async fn create_user(&self, email: String, name: String) -> Result<User, String> {
        if let Some(_) = self.repository.find_by_email(&email).await? {
            return Err("User with this email already exists".to_string());
        }

        let user = User::new(email, name)?;
        self.repository.save(&user).await?;
        Ok(user)
    }

    async fn get_user(&self, id: &Uuid) -> Result<Option<User>, String> {
        self.repository.find_by_id(id).await
    }

    async fn update_user_name(&self, id: &Uuid, name: String) -> Result<User, String> {
        let mut user = self.repository
            .find_by_id(id)
            .await?
            .ok_or("User not found".to_string())?;

        user.update_name(name)?;
        self.repository.save(&user).await?;
        Ok(user)
    }

    async fn delete_user(&self, id: &Uuid) -> Result<(), String> {
        self.repository.delete(id).await
    }

    async fn list_users(&self) -> Result<Vec<User>, String> {
        self.repository.list_all().await
    }
}
```

## Infrastructure Layer

### Persistence Adapter

Implement repository for PostgreSQL:

```rust
use async_trait::async_trait;
use uuid::Uuid;
use sqlx::PgPool;
use crate::domain::entities::User;
use crate::domain::repositories::UserRepository;

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
    async fn find_by_id(&self, id: &Uuid) -> Result<Option<User>, String> {
        sqlx::query_as!(
            UserRow,
            "SELECT id, email, name FROM users WHERE id = $1",
            id
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Database error: {}", e))
        .map(|opt| opt.map(User::from))
    }

    async fn find_by_email(&self, email: &str) -> Result<Option<User>, String> {
        sqlx::query_as!(
            UserRow,
            "SELECT id, email, name FROM users WHERE email = $1",
            email
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Database error: {}", e))
        .map(|opt| opt.map(User::from))
    }

    async fn save(&self, user: &User) -> Result<(), String> {
        sqlx::query!(
            "INSERT INTO users (id, email, name) VALUES ($1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET email = $2, name = $3",
            user.id(),
            user.email(),
            user.name()
        )
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

        Ok(())
    }

    async fn delete(&self, id: &Uuid) -> Result<(), String> {
        sqlx::query!("DELETE FROM users WHERE id = $1", id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Database error: {}", e))?;

        Ok(())
    }

    async fn list_all(&self) -> Result<Vec<User>, String> {
        sqlx::query_as!(UserRow, "SELECT id, email, name FROM users ORDER BY name")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Database error: {}", e))
            .map(|rows| rows.into_iter().map(User::from).collect())
    }
}

#[derive(sqlx::FromRow)]
struct UserRow {
    id: Uuid,
    email: String,
    name: String,
}

impl From<UserRow> for User {
    fn from(row: UserRow) -> Self {
        User::new(row.email, row.name).unwrap()
    }
}
```

### Web DTOs

Data transfer objects for HTTP layer:

```rust
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::domain::entities::User;

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub name: String,
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        Self {
            id: *user.id(),
            email: user.email().to_string(),
            name: user.name().to_string(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub email: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserNameRequest {
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}
```

### Axum Handlers

HTTP request handlers using Axum extractors:

```rust
use axum::{
    extract::{Path, State, Json},
    http::StatusCode,
    response::IntoResponse,
};
use uuid::Uuid;
use std::sync::Arc;
use crate::application::ports::UserService;
use crate::infrastructure::web::dtos::*;

pub async fn create_user(
    State(service): State<Arc<dyn UserService>>,
    Json(req): Json<CreateUserRequest>,
) -> impl IntoResponse {
    match service.create_user(req.email, req.name).await {
        Ok(user) => (StatusCode::CREATED, Json(UserResponse::from(user))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: e })).into_response(),
    }
}

pub async fn get_user(
    State(service): State<Arc<dyn UserService>>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    match service.get_user(&id).await {
        Ok(Some(user)) => (StatusCode::OK, Json(UserResponse::from(user))).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "User not found".to_string(),
            }),
        ).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: e }),
        ).into_response(),
    }
}

pub async fn update_user_name(
    State(service): State<Arc<dyn UserService>>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateUserNameRequest>,
) -> impl IntoResponse {
    match service.update_user_name(&id, req.name).await {
        Ok(user) => (StatusCode::OK, Json(UserResponse::from(user))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: e })).into_response(),
    }
}

pub async fn delete_user(
    State(service): State<Arc<dyn UserService>>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    match service.delete_user(&id).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: e }),
        ).into_response(),
    }
}

pub async fn list_users(
    State(service): State<Arc<dyn UserService>>,
) -> impl IntoResponse {
    match service.list_users().await {
        Ok(users) => {
            let responses: Vec<UserResponse> = users.into_iter().map(UserResponse::from).collect();
            (StatusCode::OK, Json(responses)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: e }),
        ).into_response(),
    }
}
```

### Route Configuration

Configure Axum routes:

```rust
use axum::{
    routing::{get, post, patch, delete},
    Router,
};
use std::sync::Arc;
use crate::application::ports::UserService;
use crate::infrastructure::web::handlers;

pub fn create_router(user_service: Arc<dyn UserService>) -> Router {
    Router::new()
        .route("/api/v1/users", post(handlers::create_user))
        .route("/api/v1/users", get(handlers::list_users))
        .route("/api/v1/users/:id", get(handlers::get_user))
        .route("/api/v1/users/:id", patch(handlers::update_user_name))
        .route("/api/v1/users/:id", delete(handlers::delete_user))
        .with_state(user_service)
}
```

## Wiring It Together

Main application setup with dependency injection:

```rust
use sqlx::postgres::PgPoolOptions;
use tokio::net::TcpListener;
use std::sync::Arc;

mod domain;
mod application;
mod infrastructure;

use infrastructure::persistence::PostgresUserRepository;
use application::use_cases::UserUseCase;
use infrastructure::web::routes::create_router;

#[tokio::main]
async fn main() {
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("Failed to create pool");

    let user_repository = Arc::new(PostgresUserRepository::new(pool));
    let user_service: Arc<dyn application::ports::UserService> =
        Arc::new(UserUseCase::new(user_repository));

    let app = create_router(user_service);

    let listener = TcpListener::bind("127.0.0.1:8080")
        .await
        .expect("Failed to bind");

    axum::serve(listener, app)
        .await
        .expect("Failed to start server");
}
```

## Middleware Integration

### Logging and Tracing

```rust
use tower_http::trace::TraceLayer;
use axum::Router;

let app = create_router(user_service)
    .layer(TraceLayer::new_for_http());
```

### CORS

```rust
use tower_http::cors::{CorsLayer, Any};

let cors = CorsLayer::new()
    .allow_origin(Any)
    .allow_methods(Any)
    .allow_headers(Any);

let app = create_router(user_service)
    .layer(cors);
```

### Custom Middleware

```rust
use axum::{
    middleware::{self, Next},
    response::Response,
    http::Request,
};

async fn logging_middleware<B>(
    req: Request<B>,
    next: Next<B>,
) -> Response {
    let method = req.method().clone();
    let uri = req.uri().clone();

    let response = next.run(req).await;

    println!("{} {} - {}", method, uri, response.status());

    response
}

let app = create_router(user_service)
    .layer(middleware::from_fn(logging_middleware));
```

### Application State Pattern

For multiple services:

```rust
use parking_lot::RwLock;

#[derive(Clone)]
pub struct AppState {
    user_service: Arc<dyn UserService>,
    config: Arc<RwLock<AppConfig>>,
}

pub fn create_router_with_state(state: AppState) -> Router {
    Router::new()
        .route("/users", post(create_user))
        .with_state(state)
}

async fn create_user(
    State(state): State<AppState>,
    Json(req): Json<CreateUserRequest>,
) -> impl IntoResponse {
    match state.user_service.create_user(req.email, req.name).await {
        Ok(user) => (StatusCode::CREATED, Json(UserResponse::from(user))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: e })).into_response(),
    }
}
```

## Database Migration

Schema setup:

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
```
