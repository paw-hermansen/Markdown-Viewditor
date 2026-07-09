# Complete Implementation Guide

Layer-by-layer implementation of hexagonal architecture with SurrealDB.

## Table of Contents

- [Domain Layer](#domain-layer)
- [Application Layer](#application-layer)
- [Infrastructure Layer](#infrastructure-layer)
- [Wiring It Together](#wiring-it-together)
- [Schema Setup](#schema-setup)

## Domain Layer

### Entities

Domain entities with business rules and validation:

```rust
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
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

### SurrealDB Connection Setup

Remote connection management:

```rust
use surrealdb::engine::remote::ws::Ws;
use surrealdb::opt::auth::Root;
use surrealdb::Surreal;

pub struct SurrealConnection;

impl SurrealConnection {
    pub async fn connect(url: &str) -> Result<Surreal<surrealdb::engine::any::Any>, String> {
        let db = Surreal::new::<Ws>(url)
            .await
            .map_err(|e| format!("Connection failed: {}", e))?;

        let username = std::env::var("SURREAL_USER").unwrap_or("root".to_string());
        let password = std::env::var("SURREAL_PASS").unwrap_or("root".to_string());

        db.signin(Root {
            username: &username,
            password: &password,
        })
        .await
        .map_err(|e| format!("Authentication failed: {}", e))?;

        db.use_ns("app").use_db("main")
            .await
            .map_err(|e| format!("Namespace/Database selection failed: {}", e))?;

        Ok(db)
    }
}
```

### Persistence Adapter

Implement repository for SurrealDB:

```rust
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use surrealdb::Surreal;
use uuid::Uuid;
use crate::domain::entities::User;
use crate::domain::repositories::UserRepository;

pub struct SurrealUserRepository {
    db: Surreal<surrealdb::engine::any::Any>,
}

impl SurrealUserRepository {
    pub fn new(db: Surreal<surrealdb::engine::any::Any>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl UserRepository for SurrealUserRepository {
    async fn find_by_id(&self, id: &Uuid) -> Result<Option<User>, String> {
        let user: Option<User> = self.db
            .select(("user", id.to_string()))
            .await
            .map_err(|e| format!("Database error: {}", e))?;
        Ok(user)
    }

    async fn find_by_email(&self, email: &str) -> Result<Option<User>, String> {
        let mut result = self.db
            .query("SELECT * FROM user WHERE email = $email")
            .bind(("email", email))
            .await
            .map_err(|e| format!("Query error: {}", e))?;

        let users: Vec<User> = result.take(0)
            .map_err(|e| format!("Parse error: {}", e))?;
        Ok(users.into_iter().next())
    }

    async fn save(&self, user: &User) -> Result<(), String> {
        let _: Option<User> = self.db
            .create(("user", user.id().to_string()))
            .content(user)
            .await
            .map_err(|e| {
                self.db
                    .update(("user", user.id().to_string()))
                    .content(user)
            });

        Ok(())
    }

    async fn delete(&self, id: &Uuid) -> Result<(), String> {
        let _: Option<User> = self.db
            .delete(("user", id.to_string()))
            .await
            .map_err(|e| format!("Database error: {}", e))?;
        Ok(())
    }

    async fn list_all(&self) -> Result<Vec<User>, String> {
        let users: Vec<User> = self.db
            .select("user")
            .await
            .map_err(|e| format!("Database error: {}", e))?;
        Ok(users)
    }
}
```

### Alternative: Upsert Pattern

For create-or-update semantics:

```rust
async fn save(&self, user: &User) -> Result<(), String> {
    let _: Option<User> = self.db
        .upsert(("user", user.id().to_string()))
        .content(user)
        .await
        .map_err(|e| format!("Database error: {}", e))?;
    Ok(())
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

### Actix-web Handlers

HTTP request handlers for Actix:

```rust
use actix_web::{web, HttpResponse, Responder};
use uuid::Uuid;
use std::sync::Arc;
use crate::application::ports::UserService;
use crate::infrastructure::web::dtos::*;

pub async fn create_user(
    service: web::Data<Arc<dyn UserService>>,
    req: web::Json<CreateUserRequest>,
) -> impl Responder {
    match service.create_user(req.email.clone(), req.name.clone()).await {
        Ok(user) => HttpResponse::Created().json(UserResponse::from(user)),
        Err(e) => HttpResponse::BadRequest().json(ErrorResponse { error: e }),
    }
}

pub async fn get_user(
    service: web::Data<Arc<dyn UserService>>,
    id: web::Path<Uuid>,
) -> impl Responder {
    match service.get_user(&id).await {
        Ok(Some(user)) => HttpResponse::Ok().json(UserResponse::from(user)),
        Ok(None) => HttpResponse::NotFound().json(ErrorResponse {
            error: "User not found".to_string(),
        }),
        Err(e) => HttpResponse::InternalServerError().json(ErrorResponse { error: e }),
    }
}

pub async fn update_user_name(
    service: web::Data<Arc<dyn UserService>>,
    id: web::Path<Uuid>,
    req: web::Json<UpdateUserNameRequest>,
) -> impl Responder {
    match service.update_user_name(&id, req.name.clone()).await {
        Ok(user) => HttpResponse::Ok().json(UserResponse::from(user)),
        Err(e) => HttpResponse::BadRequest().json(ErrorResponse { error: e }),
    }
}

pub async fn delete_user(
    service: web::Data<Arc<dyn UserService>>,
    id: web::Path<Uuid>,
) -> impl Responder {
    match service.delete_user(&id).await {
        Ok(_) => HttpResponse::NoContent().finish(),
        Err(e) => HttpResponse::InternalServerError().json(ErrorResponse { error: e }),
    }
}

pub async fn list_users(
    service: web::Data<Arc<dyn UserService>>,
) -> impl Responder {
    match service.list_users().await {
        Ok(users) => {
            let responses: Vec<UserResponse> = users.into_iter().map(UserResponse::from).collect();
            HttpResponse::Ok().json(responses)
        }
        Err(e) => HttpResponse::InternalServerError().json(ErrorResponse { error: e }),
    }
}
```

### Axum Handlers

HTTP request handlers for Axum:

```rust
use axum::{
    extract::{Json, Path, State},
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
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: e }),
        ).into_response(),
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
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: e }),
        ).into_response(),
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

## Wiring It Together

### Actix-web Setup

Main application with Actix-web:

```rust
use actix_web::{web, App, HttpServer};
use std::sync::Arc;

mod domain;
mod application;
mod infrastructure;

use infrastructure::persistence::{SurrealConnection, SurrealUserRepository};
use application::use_cases::UserUseCase;
use infrastructure::web::actix_handlers as handlers;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let surreal_url = std::env::var("SURREAL_URL")
        .unwrap_or("ws://127.0.0.1:8000".to_string());

    let db = SurrealConnection::connect(&surreal_url)
        .await
        .expect("Failed to connect to SurrealDB");

    let user_repository = Arc::new(SurrealUserRepository::new(db));
    let user_service: Arc<dyn application::ports::UserService> =
        Arc::new(UserUseCase::new(user_repository));

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(user_service.clone()))
            .route("/api/v1/users", web::post().to(handlers::create_user))
            .route("/api/v1/users", web::get().to(handlers::list_users))
            .route("/api/v1/users/{id}", web::get().to(handlers::get_user))
            .route("/api/v1/users/{id}", web::patch().to(handlers::update_user_name))
            .route("/api/v1/users/{id}", web::delete().to(handlers::delete_user))
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
```

### Axum Setup

Main application with Axum:

```rust
use axum::{
    routing::{delete, get, patch, post},
    Router,
};
use tokio::net::TcpListener;
use std::sync::Arc;

mod domain;
mod application;
mod infrastructure;

use infrastructure::persistence::{SurrealConnection, SurrealUserRepository};
use application::use_cases::UserUseCase;
use infrastructure::web::axum_handlers as handlers;

#[tokio::main]
async fn main() {
    let surreal_url = std::env::var("SURREAL_URL")
        .unwrap_or("ws://127.0.0.1:8000".to_string());

    let db = SurrealConnection::connect(&surreal_url)
        .await
        .expect("Failed to connect to SurrealDB");

    let user_repository = Arc::new(SurrealUserRepository::new(db));
    let user_service: Arc<dyn application::ports::UserService> =
        Arc::new(UserUseCase::new(user_repository));

    let app = Router::new()
        .route("/api/v1/users", post(handlers::create_user))
        .route("/api/v1/users", get(handlers::list_users))
        .route("/api/v1/users/:id", get(handlers::get_user))
        .route("/api/v1/users/:id", patch(handlers::update_user_name))
        .route("/api/v1/users/:id", delete(handlers::delete_user))
        .with_state(user_service);

    let listener = TcpListener::bind("127.0.0.1:8080")
        .await
        .expect("Failed to bind");

    axum::serve(listener, app)
        .await
        .expect("Failed to start server");
}
```

## Schema Setup

### SurrealQL Schema Definition

Define schema with validation and constraints:

```sql
DEFINE TABLE user SCHEMAFULL;
DEFINE FIELD id ON TABLE user TYPE string;
DEFINE FIELD email ON TABLE user TYPE string ASSERT string::is::email($value);
DEFINE FIELD name ON TABLE user TYPE string;

DEFINE INDEX user_email ON TABLE user COLUMNS email UNIQUE;
```

### Schema Initialization

Apply schema programmatically:

```rust
use surrealdb::Surreal;

pub async fn initialize_schema(db: &Surreal<surrealdb::engine::any::Any>) -> Result<(), String> {
    db.query(r#"
        DEFINE TABLE user SCHEMAFULL;
        DEFINE FIELD id ON TABLE user TYPE string;
        DEFINE FIELD email ON TABLE user TYPE string ASSERT string::is::email($value);
        DEFINE FIELD name ON TABLE user TYPE string;
        DEFINE INDEX user_email ON TABLE user COLUMNS email UNIQUE;
    "#)
    .await
    .map_err(|e| format!("Schema initialization failed: {}", e))?;

    Ok(())
}
```

### Environment Configuration

Example `.env` file:

```env
SURREAL_URL=ws://127.0.0.1:8000
SURREAL_USER=root
SURREAL_PASS=root
```
