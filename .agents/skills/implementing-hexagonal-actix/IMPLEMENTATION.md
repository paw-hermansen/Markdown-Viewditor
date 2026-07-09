# Complete Implementation Guide

Layer-by-layer implementation of hexagonal architecture with Actix-web.

## Table of Contents

- [Domain Layer](#domain-layer)
- [Application Layer](#application-layer)
- [Infrastructure Layer](#infrastructure-layer)
- [Wiring It Together](#wiring-it-together)

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

### Actix Handlers

HTTP request handlers:

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

### Route Configuration

Configure Actix routes:

```rust
use actix_web::web;
use crate::infrastructure::web::handlers;

pub fn configure_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/v1")
            .route("/users", web::post().to(handlers::create_user))
            .route("/users", web::get().to(handlers::list_users))
            .route("/users/{id}", web::get().to(handlers::get_user))
            .route("/users/{id}", web::patch().to(handlers::update_user_name))
            .route("/users/{id}", web::delete().to(handlers::delete_user))
    );
}
```

## Wiring It Together

Main application setup with dependency injection:

```rust
use actix_web::{web, App, HttpServer};
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;

mod domain;
mod application;
mod infrastructure;

use infrastructure::persistence::PostgresUserRepository;
use application::use_cases::UserUseCase;
use infrastructure::web::routes::configure_routes;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
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

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(user_service.clone()))
            .configure(configure_routes)
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
```

## Migration Scripts

Database schema setup:

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
