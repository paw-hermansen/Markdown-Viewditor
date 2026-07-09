# Real-Time Patterns with SurrealDB

Live queries and real-time subscription patterns for hexagonal architecture.

## Table of Contents

- [Introduction](#introduction)
- [Basic Live Queries](#basic-live-queries)
- [Hexagonal Integration](#hexagonal-integration)
- [WebSocket Broadcasting](#websocket-broadcasting)
- [Performance Considerations](#performance-considerations)
- [Security](#security)
- [Best Practices](#best-practices)

## Introduction

SurrealDB provides built-in real-time capabilities through live queries. These allow applications to subscribe to data changes and receive notifications when records are created, updated, or deleted.

## Basic Live Queries

### Stream Setup

Subscribe to all changes on a table:

```rust
use futures::StreamExt;
use surrealdb::Notification;

pub async fn watch_users(db: &Surreal<surrealdb::engine::any::Any>) -> Result<(), String> {
    let mut stream = db
        .select("user")
        .live()
        .await
        .map_err(|e| format!("Live query error: {}", e))?;

    while let Some(notification) = stream.next().await {
        match notification {
            Ok(notification) => {
                match notification.action {
                    Action::Create => {
                        let user: User = notification.data.try_into().ok().unwrap();
                        println!("User created: {}", user.email());
                    }
                    Action::Update => {
                        let user: User = notification.data.try_into().ok().unwrap();
                        println!("User updated: {}", user.email());
                    }
                    Action::Delete => {
                        println!("User deleted");
                    }
                    _ => {}
                }
            }
            Err(e) => eprintln!("Stream error: {}", e),
        }
    }

    Ok(())
}
```

### Single Record Subscription

Watch a specific record:

```rust
pub async fn watch_user(db: &Surreal<surrealdb::engine::any::Any>, user_id: &Uuid) -> Result<(), String> {
    let mut stream = db
        .select(("user", user_id.to_string()))
        .live()
        .await
        .map_err(|e| format!("Live query error: {}", e))?;

    while let Some(notification) = stream.next().await {
        match notification {
            Ok(notification) => {
                println!("User {} changed: {:?}", user_id, notification.action);
            }
            Err(e) => eprintln!("Stream error: {}", e),
        }
    }

    Ok(())
}
```

### Filtered Subscriptions

Subscribe with query filters:

```rust
pub async fn watch_active_users(db: &Surreal<surrealdb::engine::any::Any>) -> Result<(), String> {
    let mut result = db
        .query("LIVE SELECT * FROM user WHERE active = true")
        .await
        .map_err(|e| format!("Query error: {}", e))?;

    let mut stream = result.stream(0)
        .map_err(|e| format!("Stream error: {}", e))?;

    while let Some(notification) = stream.next().await {
        match notification {
            Ok(notification) => {
                println!("Active user changed: {:?}", notification);
            }
            Err(e) => eprintln!("Stream error: {}", e),
        }
    }

    Ok(())
}
```

## Hexagonal Integration

### Event Publisher Port

Define event publisher interface in application layer:

```rust
use async_trait::async_trait;
use futures::stream::Stream;
use std::pin::Pin;
use uuid::Uuid;
use crate::domain::entities::User;

#[derive(Debug, Clone)]
pub enum UserEvent {
    Created(User),
    Updated(User),
    Deleted(Uuid),
}

#[async_trait]
pub trait EventPublisher: Send + Sync {
    async fn subscribe_user_changes(&self) -> Result<Pin<Box<dyn Stream<Item = UserEvent> + Send>>, String>;
}
```

### SurrealDB Event Adapter

Implement event publisher for SurrealDB:

```rust
use futures::stream::{Stream, StreamExt};
use surrealdb::{Action, Notification, Surreal};
use std::pin::Pin;

pub struct SurrealEventPublisher {
    db: Surreal<surrealdb::engine::any::Any>,
}

impl SurrealEventPublisher {
    pub fn new(db: Surreal<surrealdb::engine::any::Any>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl EventPublisher for SurrealEventPublisher {
    async fn subscribe_user_changes(&self) -> Result<Pin<Box<dyn Stream<Item = UserEvent> + Send>>, String> {
        let stream = self.db
            .select("user")
            .live()
            .await
            .map_err(|e| format!("Live query failed: {}", e))?;

        let mapped_stream = stream.filter_map(|notification| async move {
            match notification {
                Ok(n) => match n.action {
                    Action::Create => {
                        n.data.try_into().ok().map(UserEvent::Created)
                    }
                    Action::Update => {
                        n.data.try_into().ok().map(UserEvent::Updated)
                    }
                    Action::Delete => {
                        extract_id(&n.data).map(UserEvent::Deleted)
                    }
                    _ => None,
                },
                Err(_) => None,
            }
        });

        Ok(Box::pin(mapped_stream))
    }
}

fn extract_id(data: &surrealdb::sql::Value) -> Option<Uuid> {
    Uuid::parse_str(&data.to_string()).ok()
}
```

### Use Case with Events

Integrate event streaming into use cases:

```rust
use futures::StreamExt;
use std::sync::Arc;

pub struct UserUseCaseWithEvents {
    repository: Arc<dyn UserRepository>,
    event_publisher: Arc<dyn EventPublisher>,
}

impl UserUseCaseWithEvents {
    pub fn new(
        repository: Arc<dyn UserRepository>,
        event_publisher: Arc<dyn EventPublisher>,
    ) -> Self {
        Self {
            repository,
            event_publisher,
        }
    }

    pub async fn watch_changes(&self) -> Result<(), String> {
        let mut stream = self.event_publisher.subscribe_user_changes().await?;

        tokio::spawn(async move {
            while let Some(event) = stream.next().await {
                match event {
                    UserEvent::Created(user) => {
                        println!("New user created: {}", user.email());
                    }
                    UserEvent::Updated(user) => {
                        println!("User updated: {}", user.email());
                    }
                    UserEvent::Deleted(id) => {
                        println!("User deleted: {}", id);
                    }
                }
            }
        });

        Ok(())
    }
}
```

## WebSocket Broadcasting

### Actix-web WebSocket

Broadcast SurrealDB changes to web clients via WebSocket:

```rust
use actix::{Actor, StreamHandler, AsyncContext};
use actix_web::{web, HttpRequest, HttpResponse};
use actix_web_actors::ws;
use futures::StreamExt;

struct UserEventWebSocket {
    event_publisher: Arc<dyn EventPublisher>,
}

impl Actor for UserEventWebSocket {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        let event_publisher = self.event_publisher.clone();
        let addr = ctx.address();

        tokio::spawn(async move {
            if let Ok(mut stream) = event_publisher.subscribe_user_changes().await {
                while let Some(event) = stream.next().await {
                    let message = match event {
                        UserEvent::Created(user) => {
                            serde_json::json!({
                                "type": "created",
                                "user": {
                                    "id": user.id().to_string(),
                                    "email": user.email(),
                                    "name": user.name()
                                }
                            }).to_string()
                        }
                        UserEvent::Updated(user) => {
                            serde_json::json!({
                                "type": "updated",
                                "user": {
                                    "id": user.id().to_string(),
                                    "email": user.email(),
                                    "name": user.name()
                                }
                            }).to_string()
                        }
                        UserEvent::Deleted(id) => {
                            serde_json::json!({
                                "type": "deleted",
                                "id": id.to_string()
                            }).to_string()
                        }
                    };

                    addr.do_send(ws::Message::Text(message.into()));
                }
            }
        });
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for UserEventWebSocket {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => ctx.pong(&msg),
            Ok(ws::Message::Close(_)) => ctx.stop(),
            _ => {}
        }
    }
}

pub async fn user_events_ws(
    req: HttpRequest,
    stream: web::Payload,
    event_publisher: web::Data<Arc<dyn EventPublisher>>,
) -> Result<HttpResponse, actix_web::Error> {
    ws::start(
        UserEventWebSocket {
            event_publisher: event_publisher.get_ref().clone(),
        },
        &req,
        stream,
    )
}
```

### Axum WebSocket

Broadcast SurrealDB changes with Axum:

```rust
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use futures::StreamExt;

pub async fn user_events_ws(
    ws: WebSocketUpgrade,
    State(event_publisher): State<Arc<dyn EventPublisher>>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, event_publisher))
}

async fn handle_socket(
    mut socket: WebSocket,
    event_publisher: Arc<dyn EventPublisher>,
) {
    if let Ok(mut stream) = event_publisher.subscribe_user_changes().await {
        while let Some(event) = stream.next().await {
            let message = match event {
                UserEvent::Created(user) => {
                    serde_json::json!({
                        "type": "created",
                        "user": {
                            "id": user.id().to_string(),
                            "email": user.email(),
                            "name": user.name()
                        }
                    }).to_string()
                }
                UserEvent::Updated(user) => {
                    serde_json::json!({
                        "type": "updated",
                        "user": {
                            "id": user.id().to_string(),
                            "email": user.email(),
                            "name": user.name()
                        }
                    }).to_string()
                }
                UserEvent::Deleted(id) => {
                    serde_json::json!({
                        "type": "deleted",
                        "id": id.to_string()
                    }).to_string()
                }
            };

            if socket.send(Message::Text(message)).await.is_err() {
                break;
            }
        }
    }
}
```

## Performance Considerations

### Stream Backpressure

Handle backpressure to prevent memory issues:

```rust
use futures::stream::{Stream, StreamExt};
use tokio::sync::mpsc;

pub async fn buffered_event_stream(
    publisher: Arc<dyn EventPublisher>,
) -> Result<(), String> {
    let (tx, mut rx) = mpsc::channel::<UserEvent>(100);

    tokio::spawn(async move {
        if let Ok(mut stream) = publisher.subscribe_user_changes().await {
            while let Some(event) = stream.next().await {
                if tx.send(event).await.is_err() {
                    break;
                }
            }
        }
    });

    while let Some(event) = rx.recv().await {
        process_event(event).await;
    }

    Ok(())
}

async fn process_event(event: UserEvent) {
    match event {
        UserEvent::Created(user) => {
            println!("Processing created user: {}", user.email());
        }
        _ => {}
    }
}
```

### Connection Lifecycle

Manage connection lifecycle:

```rust
use tokio::time::{sleep, Duration};

pub async fn resilient_event_stream(
    publisher: Arc<dyn EventPublisher>,
) -> Result<(), String> {
    loop {
        match publisher.subscribe_user_changes().await {
            Ok(mut stream) => {
                while let Some(event) = stream.next().await {
                    handle_event(event);
                }
            }
            Err(e) => {
                eprintln!("Stream error: {}, reconnecting...", e);
                sleep(Duration::from_secs(5)).await;
            }
        }
    }
}

fn handle_event(event: UserEvent) {
    println!("Event received: {:?}", event);
}
```

### Error Recovery

Implement error recovery strategies:

```rust
pub async fn fault_tolerant_stream(
    publisher: Arc<dyn EventPublisher>,
) -> Result<(), String> {
    let mut retry_count = 0;
    let max_retries = 5;

    loop {
        match publisher.subscribe_user_changes().await {
            Ok(mut stream) => {
                retry_count = 0;
                while let Some(event) = stream.next().await {
                    handle_event(event);
                }
            }
            Err(e) if retry_count < max_retries => {
                retry_count += 1;
                eprintln!("Stream error (attempt {}/{}): {}", retry_count, max_retries, e);
                sleep(Duration::from_secs(2_u64.pow(retry_count))).await;
            }
            Err(e) => {
                return Err(format!("Max retries exceeded: {}", e));
            }
        }
    }
}
```

## Security

### Row-Level Permissions

Enforce permissions on live queries:

```sql
DEFINE TABLE user SCHEMAFULL
    PERMISSIONS
        FOR select WHERE id = $auth.id OR $auth.role = 'admin'
        FOR create, update WHERE id = $auth.id
        FOR delete WHERE $auth.role = 'admin';
```

### Authentication for Streams

Authenticate before subscribing:

```rust
use surrealdb::opt::auth::Record;
use std::collections::BTreeMap;

pub async fn authenticated_stream(
    db: &Surreal<surrealdb::engine::any::Any>,
    email: &str,
    password: &str,
) -> Result<(), String> {
    let _jwt = db.signin(Record {
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

    let mut stream = db.select("user").live().await?;

    while let Some(notification) = stream.next().await {
        println!("Notification: {:?}", notification);
    }

    Ok(())
}
```

### Rate Limiting Subscriptions

Limit subscription creation:

```rust
use std::sync::Arc;
use tokio::sync::Semaphore;

pub struct RateLimitedEventPublisher {
    publisher: Arc<dyn EventPublisher>,
    semaphore: Arc<Semaphore>,
}

impl RateLimitedEventPublisher {
    pub fn new(publisher: Arc<dyn EventPublisher>, max_concurrent: usize) -> Self {
        Self {
            publisher,
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
        }
    }

    pub async fn subscribe(&self) -> Result<Pin<Box<dyn Stream<Item = UserEvent> + Send>>, String> {
        let _permit = self.semaphore
            .acquire()
            .await
            .map_err(|e| format!("Rate limit exceeded: {}", e))?;

        self.publisher.subscribe_user_changes().await
    }
}
```

## Best Practices

### When to Use Live Queries

Use live queries for:

- Real-time dashboards and monitoring
- Collaborative applications (chat, documents)
- Notification systems
- Live data feeds

Avoid live queries for:

- One-time data fetches
- High-frequency batch processing
- Scenarios with strict latency requirements

### Stream Cleanup

Always clean up streams properly:

```rust
use tokio::select;
use tokio::signal;

pub async fn graceful_shutdown(
    publisher: Arc<dyn EventPublisher>,
) -> Result<(), String> {
    let mut stream = publisher.subscribe_user_changes().await?;

    loop {
        select! {
            Some(event) = stream.next() => {
                handle_event(event);
            }
            _ = signal::ctrl_c() => {
                println!("Shutting down...");
                drop(stream);
                break;
            }
        }
    }

    Ok(())
}
```

### Memory Management

Monitor memory usage with buffered streams:

```rust
use tokio::sync::mpsc;

pub async fn memory_bounded_stream(
    publisher: Arc<dyn EventPublisher>,
    buffer_size: usize,
) -> Result<(), String> {
    let (tx, mut rx) = mpsc::channel::<UserEvent>(buffer_size);

    tokio::spawn(async move {
        if let Ok(mut stream) = publisher.subscribe_user_changes().await {
            while let Some(event) = stream.next().await {
                if tx.send(event).await.is_err() {
                    eprintln!("Receiver dropped");
                    break;
                }
            }
        }
    });

    while let Some(event) = rx.recv().await {
        process_event(event).await;
    }

    Ok(())
}
```
