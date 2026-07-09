# Testing and Security Guide

Testing strategies and security best practices for hexagonal architecture with Axum.

## Table of Contents

- [Testing Strategy](#testing-strategy)
- [Domain Layer Tests](#domain-layer-tests)
- [Application Layer Tests](#application-layer-tests)
- [Infrastructure Layer Tests](#infrastructure-layer-tests)
- [Integration Tests](#integration-tests)
- [Security Best Practices](#security-best-practices)

## Testing Strategy

**Layer-by-layer approach:**

1. **Domain Layer**: Pure unit tests (no mocking needed)
2. **Application Layer**: Mock repositories using traits
3. **Infrastructure Layer**: Integration tests with test database
4. **Web Layer**: Use Axum test utilities with tower::ServiceExt

## Domain Layer Tests

Test business logic without dependencies:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_creation_with_valid_data() {
        let user = User::new("test@example.com".to_string(), "John Doe".to_string());
        assert!(user.is_ok());
        let user = user.unwrap();
        assert_eq!(user.email(), "test@example.com");
        assert_eq!(user.name(), "John Doe");
    }

    #[test]
    fn test_user_creation_with_empty_email() {
        let user = User::new("".to_string(), "John Doe".to_string());
        assert!(user.is_err());
        assert_eq!(user.unwrap_err(), "Email cannot be empty");
    }

    #[test]
    fn test_user_creation_with_invalid_email() {
        let user = User::new("invalid-email".to_string(), "John Doe".to_string());
        assert!(user.is_err());
    }

    #[test]
    fn test_update_name() {
        let mut user = User::new("test@example.com".to_string(), "John".to_string()).unwrap();
        assert!(user.update_name("Jane".to_string()).is_ok());
        assert_eq!(user.name(), "Jane");
    }

    #[test]
    fn test_update_name_with_empty_string() {
        let mut user = User::new("test@example.com".to_string(), "John".to_string()).unwrap();
        assert!(user.update_name("".to_string()).is_err());
    }
}
```

## Application Layer Tests

Mock repositories for isolated testing:

```rust
use async_trait::async_trait;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;

struct MockUserRepository {
    users: Arc<Mutex<HashMap<Uuid, User>>>,
}

impl MockUserRepository {
    fn new() -> Self {
        Self {
            users: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[async_trait]
impl UserRepository for MockUserRepository {
    async fn find_by_id(&self, id: &Uuid) -> Result<Option<User>, String> {
        Ok(self.users.lock().unwrap().get(id).cloned())
    }

    async fn find_by_email(&self, email: &str) -> Result<Option<User>, String> {
        Ok(self.users
            .lock()
            .unwrap()
            .values()
            .find(|u| u.email() == email)
            .cloned())
    }

    async fn save(&self, user: &User) -> Result<(), String> {
        self.users.lock().unwrap().insert(*user.id(), user.clone());
        Ok(())
    }

    async fn delete(&self, id: &Uuid) -> Result<(), String> {
        self.users.lock().unwrap().remove(id);
        Ok(())
    }

    async fn list_all(&self) -> Result<Vec<User>, String> {
        Ok(self.users.lock().unwrap().values().cloned().collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_user_success() {
        let repository = Arc::new(MockUserRepository::new());
        let use_case = UserUseCase::new(repository);

        let result = use_case.create_user(
            "test@example.com".to_string(),
            "John Doe".to_string()
        ).await;

        assert!(result.is_ok());
        let user = result.unwrap();
        assert_eq!(user.email(), "test@example.com");
    }

    #[tokio::test]
    async fn test_create_user_duplicate_email() {
        let repository = Arc::new(MockUserRepository::new());
        let use_case = UserUseCase::new(repository);

        use_case.create_user("test@example.com".to_string(), "John".to_string()).await.unwrap();

        let result = use_case.create_user("test@example.com".to_string(), "Jane".to_string()).await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "User with this email already exists");
    }

    #[tokio::test]
    async fn test_get_user_not_found() {
        let repository = Arc::new(MockUserRepository::new());
        let use_case = UserUseCase::new(repository);

        let result = use_case.get_user(&Uuid::new_v4()).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[tokio::test]
    async fn test_delete_user() {
        let repository = Arc::new(MockUserRepository::new());
        let use_case = UserUseCase::new(repository.clone());

        let user = use_case.create_user("test@example.com".to_string(), "John".to_string()).await.unwrap();
        let result = use_case.delete_user(user.id()).await;

        assert!(result.is_ok());
        let check = use_case.get_user(user.id()).await.unwrap();
        assert!(check.is_none());
    }
}
```

## Infrastructure Layer Tests

Integration tests with test database:

```rust
use sqlx::PgPool;

#[sqlx::test]
async fn test_postgres_repository_save_and_find(pool: PgPool) {
    let repository = PostgresUserRepository::new(pool);

    let user = User::new("test@example.com".to_string(), "John Doe".to_string()).unwrap();
    repository.save(&user).await.unwrap();

    let found = repository.find_by_id(user.id()).await.unwrap();
    assert!(found.is_some());
    assert_eq!(found.unwrap().email(), "test@example.com");
}

#[sqlx::test]
async fn test_postgres_repository_find_by_email(pool: PgPool) {
    let repository = PostgresUserRepository::new(pool);

    let user = User::new("test@example.com".to_string(), "John Doe".to_string()).unwrap();
    repository.save(&user).await.unwrap();

    let found = repository.find_by_email("test@example.com").await.unwrap();
    assert!(found.is_some());
}

#[sqlx::test]
async fn test_postgres_repository_delete(pool: PgPool) {
    let repository = PostgresUserRepository::new(pool);

    let user = User::new("test@example.com".to_string(), "John Doe".to_string()).unwrap();
    repository.save(&user).await.unwrap();
    repository.delete(user.id()).await.unwrap();

    let found = repository.find_by_id(user.id()).await.unwrap();
    assert!(found.is_none());
}
```

## Integration Tests

Test HTTP endpoints with Axum and Tower:

```rust
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use tower::ServiceExt;

#[tokio::test]
async fn test_create_user_endpoint() {
    let repository = Arc::new(MockUserRepository::new());
    let service: Arc<dyn UserService> = Arc::new(UserUseCase::new(repository));
    let app = create_router(service);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/users")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"email":"test@example.com","name":"John Doe"}"#
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
}

#[tokio::test]
async fn test_get_user_not_found() {
    let repository = Arc::new(MockUserRepository::new());
    let service: Arc<dyn UserService> = Arc::new(UserUseCase::new(repository));
    let app = create_router(service);

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(&format!("/api/v1/users/{}", Uuid::new_v4()))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_create_user_invalid_email() {
    let repository = Arc::new(MockUserRepository::new());
    let service: Arc<dyn UserService> = Arc::new(UserUseCase::new(repository));
    let app = create_router(service);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/users")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"email":"","name":"John Doe"}"#
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}
```

## Security Best Practices

### 1. Input Validation

Always validate at domain boundaries:

```rust
impl User {
    pub fn new(email: String, name: String) -> Result<Self, String> {
        if email.is_empty() {
            return Err("Email cannot be empty".to_string());
        }
        if !email.contains('@') {
            return Err("Invalid email format".to_string());
        }
        if name.is_empty() {
            return Err("Name cannot be empty".to_string());
        }
        if name.len() > 255 {
            return Err("Name too long".to_string());
        }
        Ok(Self {
            id: Uuid::new_v4(),
            email,
            name,
        })
    }
}
```

### 2. SQL Injection Prevention

Use parameterized queries with sqlx:

```rust
sqlx::query!(
    "SELECT * FROM users WHERE email = $1",
    email
)
.fetch_optional(&self.pool)
.await
```

### 3. Error Handling

Never expose internal errors to clients:

```rust
pub async fn create_user(
    State(service): State<Arc<dyn UserService>>,
    Json(req): Json<CreateUserRequest>,
) -> impl IntoResponse {
    match service.create_user(req.email, req.name).await {
        Ok(user) => (StatusCode::CREATED, Json(UserResponse::from(user))).into_response(),
        Err(e) => {
            tracing::error!("Failed to create user: {}", e);
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Failed to create user".to_string()
                }),
            ).into_response()
        }
    }
}
```

### 4. Rate Limiting

Use tower-governor:

```rust
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};

let governor_conf = Box::new(
    GovernorConfigBuilder::default()
        .per_second(2)
        .burst_size(5)
        .finish()
        .unwrap(),
);

let app = create_router(service)
    .layer(GovernorLayer {
        config: Box::leak(governor_conf),
    });
```

### 5. CORS Configuration

Configure CORS appropriately:

```rust
use tower_http::cors::{CorsLayer, Any};
use http::Method;

let cors = CorsLayer::new()
    .allow_origin("https://yourdomain.com".parse::<HeaderValue>().unwrap())
    .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
    .allow_headers(Any);

let app = create_router(service).layer(cors);
```

### 6. Authentication & Authorization

Implement using middleware:

```rust
use axum::{
    middleware::{self, Next},
    response::Response,
    http::{Request, StatusCode},
};

async fn auth_middleware<B>(
    req: Request<B>,
    next: Next<B>,
) -> Result<Response, StatusCode> {
    let auth_header = req.headers()
        .get("Authorization")
        .and_then(|h| h.to_str().ok());

    match auth_header {
        Some(token) if validate_token(token).await => Ok(next.run(req).await),
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}

let app = create_router(service)
    .layer(middleware::from_fn(auth_middleware));
```

### 7. Request Size Limits

Configure request body limits:

```rust
use tower_http::limit::RequestBodyLimitLayer;

let app = create_router(service)
    .layer(RequestBodyLimitLayer::new(1024 * 1024));
```

### 8. Concurrency Safety

Use proper synchronization primitives (see CONCURRENCY.md):

- Arc for shared ownership
- Mutex/RwLock for mutable state
- tokio::sync for async contexts

### 9. Environment Variables

Never hardcode secrets:

```rust
use std::env;

let database_url = env::var("DATABASE_URL")
    .expect("DATABASE_URL must be set");
let jwt_secret = env::var("JWT_SECRET")
    .expect("JWT_SECRET must be set");
```

### 10. TLS/HTTPS

Use rustls for production:

```rust
use axum_server::tls_rustls::RustlsConfig;

let config = RustlsConfig::from_pem_file(
    "cert.pem",
    "key.pem"
).await.unwrap();

axum_server::bind_rustls("0.0.0.0:443".parse().unwrap(), config)
    .serve(app.into_make_service())
    .await
    .unwrap();
```

## Security Checklist

- [ ] All inputs validated at domain layer
- [ ] Parameterized queries prevent SQL injection
- [ ] Error messages sanitized
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] Authentication implemented
- [ ] Authorization enforced in use cases
- [ ] Request size limits set
- [ ] TLS/HTTPS enabled in production
- [ ] Secrets in environment variables
- [ ] Logging configured (no sensitive data)
- [ ] Dependencies regularly updated
