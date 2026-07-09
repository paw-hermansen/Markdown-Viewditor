# Testing and Security Guide

Testing strategies and security best practices for hexagonal architecture.

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
4. **Web Layer**: Use actix-web test utilities

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

Test HTTP endpoints with actix-web:

```rust
use actix_web::{test, web, App};

#[actix_web::test]
async fn test_create_user_endpoint() {
    let repository = Arc::new(MockUserRepository::new());
    let service = Arc::new(UserUseCase::new(repository));

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(service))
            .route("/users", web::post().to(create_user))
    ).await;

    let req = test::TestRequest::post()
        .uri("/users")
        .set_json(&CreateUserRequest {
            email: "test@example.com".to_string(),
            name: "John Doe".to_string(),
        })
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());
}

#[actix_web::test]
async fn test_get_user_not_found() {
    let repository = Arc::new(MockUserRepository::new());
    let service = Arc::new(UserUseCase::new(repository));

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(service))
            .route("/users/{id}", web::get().to(get_user))
    ).await;

    let req = test::TestRequest::get()
        .uri(&format!("/users/{}", Uuid::new_v4()))
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 404);
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
    service: web::Data<Arc<dyn UserService>>,
    req: web::Json<CreateUserRequest>,
) -> impl Responder {
    match service.create_user(req.email.clone(), req.name.clone()).await {
        Ok(user) => HttpResponse::Created().json(UserResponse::from(user)),
        Err(e) => {
            log::error!("Failed to create user: {}", e);
            HttpResponse::BadRequest().json(ErrorResponse {
                error: "Failed to create user".to_string()
            })
        }
    }
}
```

### 4. Rate Limiting

Use actix middleware:

```rust
use actix_web::middleware::Logger;
use actix_governor::{Governor, GovernorConfigBuilder};

let governor_conf = GovernorConfigBuilder::default()
    .per_second(2)
    .burst_size(5)
    .finish()
    .unwrap();

HttpServer::new(move || {
    App::new()
        .wrap(Logger::default())
        .wrap(Governor::new(&governor_conf))
        .configure(configure_routes)
})
```

### 5. CORS Configuration

Configure CORS appropriately:

```rust
use actix_cors::Cors;

HttpServer::new(move || {
    let cors = Cors::default()
        .allowed_origin("https://yourdomain.com")
        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
        .allowed_headers(vec![header::AUTHORIZATION, header::CONTENT_TYPE])
        .max_age(3600);

    App::new()
        .wrap(cors)
        .configure(configure_routes)
})
```

### 6. Authentication & Authorization

Implement as middleware:

```rust
use actix_web::{dev::ServiceRequest, Error, HttpMessage};
use actix_web_httpauth::extractors::bearer::BearerAuth;

async fn validator(req: ServiceRequest, credentials: BearerAuth) -> Result<ServiceRequest, Error> {
    let token = credentials.token();
    if validate_token(token).await {
        Ok(req)
    } else {
        Err(actix_web::error::ErrorUnauthorized("Invalid token"))
    }
}

use actix_web_httpauth::middleware::HttpAuthentication;

App::new()
    .wrap(HttpAuthentication::bearer(validator))
    .configure(configure_routes)
```

### 7. Request Size Limits

Limit request payload sizes:

```rust
App::new()
    .app_data(web::JsonConfig::default().limit(4096))
    .configure(configure_routes)
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

Always use HTTPS in production:

```rust
use actix_web::HttpServer;
use openssl::ssl::{SslAcceptor, SslFiletype, SslMethod};

let mut builder = SslAcceptor::mozilla_intermediate(SslMethod::tls()).unwrap();
builder.set_private_key_file("key.pem", SslFiletype::PEM).unwrap();
builder.set_certificate_chain_file("cert.pem").unwrap();

HttpServer::new(|| App::new().configure(configure_routes))
    .bind_openssl("127.0.0.1:8443", builder)?
    .run()
    .await
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
