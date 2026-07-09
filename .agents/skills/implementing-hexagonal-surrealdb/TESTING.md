# Testing and Security Guide

Testing strategies and security best practices for hexagonal architecture with SurrealDB.

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
3. **Infrastructure Layer**: Integration tests with in-memory SurrealDB
4. **Web Layer**: Use framework test utilities

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

### SurrealDB Test Setup

Integration tests with in-memory SurrealDB:

```rust
use surrealdb::engine::local::Mem;
use surrealdb::Surreal;

async fn setup_test_db() -> Surreal<surrealdb::engine::any::Any> {
    let db = Surreal::new::<Mem>(()).await.unwrap();
    db.use_ns("test").use_db("test").await.unwrap();

    db.query(r#"
        DEFINE TABLE user SCHEMAFULL;
        DEFINE FIELD id ON TABLE user TYPE string;
        DEFINE FIELD email ON TABLE user TYPE string ASSERT string::is::email($value);
        DEFINE FIELD name ON TABLE user TYPE string;
        DEFINE INDEX user_email ON TABLE user COLUMNS email UNIQUE;
    "#)
    .await
    .unwrap();

    db
}

#[tokio::test]
async fn test_surreal_repository_save_and_find() {
    let db = setup_test_db().await;
    let repository = SurrealUserRepository::new(db);

    let user = User::new("test@example.com".to_string(), "John Doe".to_string()).unwrap();
    repository.save(&user).await.unwrap();

    let found = repository.find_by_id(user.id()).await.unwrap();
    assert!(found.is_some());
    assert_eq!(found.unwrap().email(), "test@example.com");
}

#[tokio::test]
async fn test_surreal_repository_find_by_email() {
    let db = setup_test_db().await;
    let repository = SurrealUserRepository::new(db);

    let user = User::new("test@example.com".to_string(), "John Doe".to_string()).unwrap();
    repository.save(&user).await.unwrap();

    let found = repository.find_by_email("test@example.com").await.unwrap();
    assert!(found.is_some());
}

#[tokio::test]
async fn test_surreal_repository_delete() {
    let db = setup_test_db().await;
    let repository = SurrealUserRepository::new(db);

    let user = User::new("test@example.com".to_string(), "John Doe".to_string()).unwrap();
    repository.save(&user).await.unwrap();
    repository.delete(user.id()).await.unwrap();

    let found = repository.find_by_id(user.id()).await.unwrap();
    assert!(found.is_none());
}

#[tokio::test]
async fn test_surreal_repository_list_all() {
    let db = setup_test_db().await;
    let repository = SurrealUserRepository::new(db);

    let user1 = User::new("user1@example.com".to_string(), "User 1".to_string()).unwrap();
    let user2 = User::new("user2@example.com".to_string(), "User 2".to_string()).unwrap();

    repository.save(&user1).await.unwrap();
    repository.save(&user2).await.unwrap();

    let users = repository.list_all().await.unwrap();
    assert_eq!(users.len(), 2);
}
```

## Integration Tests

### Actix-web Tests

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

### Axum Tests

Test HTTP endpoints with Axum:

```rust
use axum::{
    body::Body,
    http::{Request, StatusCode},
    Router,
};
use tower::ServiceExt;

#[tokio::test]
async fn test_create_user_endpoint_axum() {
    let repository = Arc::new(MockUserRepository::new());
    let service = Arc::new(UserUseCase::new(repository));

    let app = Router::new()
        .route("/users", axum::routing::post(create_user))
        .with_state(service);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/users")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "email": "test@example.com",
                        "name": "John Doe"
                    }).to_string()
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
}

#[tokio::test]
async fn test_get_user_not_found_axum() {
    let repository = Arc::new(MockUserRepository::new());
    let service = Arc::new(UserUseCase::new(repository));

    let app = Router::new()
        .route("/users/:id", axum::routing::get(get_user))
        .with_state(service);

    let response = app
        .oneshot(
            Request::builder()
                .uri(&format!("/users/{}", Uuid::new_v4()))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
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

### 2. Query Injection Prevention

Use parameterized queries with SurrealDB:

```rust
async fn find_by_email(&self, email: &str) -> Result<Option<User>, String> {
    let mut result = self.db
        .query("SELECT * FROM user WHERE email = $email")
        .bind(("email", email))
        .await
        .map_err(|e| format!("Query error: {}", e))?;

    let users: Vec<User> = result.take(0)?;
    Ok(users.into_iter().next())
}
```

### 3. Record-Level Permissions

Define permissions in SurrealDB schema:

```sql
DEFINE TABLE user SCHEMAFULL
    PERMISSIONS
        FOR select WHERE id = $auth.id OR $auth.role = 'admin'
        FOR create, update WHERE id = $auth.id OR $auth.role = 'admin'
        FOR delete WHERE $auth.role = 'admin';

DEFINE FIELD email ON TABLE user TYPE string
    PERMISSIONS FOR select WHERE id = $auth.id OR $auth.role = 'admin';
```

### 4. Authentication Scopes

Implement authentication with SurrealDB scopes:

```sql
DEFINE ACCESS user_access ON DATABASE TYPE RECORD
    SIGNUP ( CREATE user SET email = $email, pass = crypto::argon2::generate($password) )
    SIGNIN ( SELECT * FROM user WHERE email = $email AND crypto::argon2::compare(pass, $password) )
    DURATION FOR SESSION 24h;
```

Rust implementation:

```rust
use surrealdb::opt::auth::Record;

pub async fn authenticate_user(db: &Surreal<surrealdb::engine::any::Any>, email: &str, password: &str) -> Result<String, String> {
    let jwt = db.signin(Record {
        namespace: "app",
        database: "main",
        access: "user_access",
        params: BTreeMap::from([
            ("email".to_string(), email.into()),
            ("password".to_string(), password.into()),
        ]),
    })
    .await
    .map_err(|e| format!("Authentication failed: {}", e))?;

    Ok(jwt.into())
}
```

### 5. Secure Connection

Always use secure WebSocket in production:

```rust
use surrealdb::engine::remote::ws::Wss;

let db = Surreal::new::<Wss>("wss://production.surrealdb.com")
    .await
    .map_err(|e| format!("Connection failed: {}", e))?;
```

### 6. Error Handling

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

### 7. Rate Limiting

#### Actix-web Rate Limiting

```rust
use actix_governor::{Governor, GovernorConfigBuilder};

let governor_conf = GovernorConfigBuilder::default()
    .per_second(2)
    .burst_size(5)
    .finish()
    .unwrap();

HttpServer::new(move || {
    App::new()
        .wrap(Governor::new(&governor_conf))
        .configure(configure_routes)
})
```

#### Axum Rate Limiting

```rust
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};

let governor_conf = Box::new(
    GovernorConfigBuilder::default()
        .per_second(2)
        .burst_size(5)
        .finish()
        .unwrap()
);

let app = Router::new()
    .route("/users", post(create_user))
    .layer(GovernorLayer { config: governor_conf });
```

### 8. CORS Configuration

#### Actix-web CORS

```rust
use actix_cors::Cors;
use actix_web::http::header;

let cors = Cors::default()
    .allowed_origin("https://yourdomain.com")
    .allowed_methods(vec!["GET", "POST", "PATCH", "DELETE"])
    .allowed_headers(vec![header::AUTHORIZATION, header::CONTENT_TYPE])
    .max_age(3600);

App::new()
    .wrap(cors)
    .configure(configure_routes)
```

#### Axum CORS

```rust
use tower_http::cors::{CorsLayer, Any};

let cors = CorsLayer::new()
    .allow_origin("https://yourdomain.com".parse::<HeaderValue>().unwrap())
    .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
    .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);

let app = Router::new()
    .route("/users", post(create_user))
    .layer(cors);
```

### 9. Environment Variables

Never hardcode secrets:

```rust
use std::env;

let surreal_url = env::var("SURREAL_URL")
    .expect("SURREAL_URL must be set");
let surreal_user = env::var("SURREAL_USER")
    .expect("SURREAL_USER must be set");
let surreal_pass = env::var("SURREAL_PASS")
    .expect("SURREAL_PASS must be set");
```

### 10. TLS/HTTPS

Always use HTTPS in production with proper TLS configuration for both the web server and SurrealDB connection.

## Security Checklist

- [ ] All inputs validated at domain layer
- [ ] Parameterized queries prevent injection
- [ ] Error messages sanitized
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] Authentication implemented with SurrealDB scopes
- [ ] Authorization enforced with record-level permissions
- [ ] Request size limits set
- [ ] TLS/WSS enabled in production
- [ ] Secrets in environment variables
- [ ] Logging configured (no sensitive data)
- [ ] Dependencies regularly updated
- [ ] SurrealDB schema with PERMISSIONS defined
- [ ] Password hashing with crypto::argon2
