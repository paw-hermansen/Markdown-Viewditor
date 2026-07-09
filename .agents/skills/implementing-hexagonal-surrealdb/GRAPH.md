# Graph Relations and Traversal

Graph database patterns for modeling and querying relationships in SurrealDB.

## Table of Contents

- [Introduction](#introduction)
- [Defining Relationships](#defining-relationships)
- [Graph Traversal](#graph-traversal)
- [Repository Pattern with Graphs](#repository-pattern-with-graphs)
- [Advanced Patterns](#advanced-patterns)
- [Use Case Integration](#use-case-integration)

## Introduction

SurrealDB provides native graph database capabilities through the `RELATE` statement and graph traversal syntax. This allows modeling complex relationships while maintaining hexagonal architecture principles.

## Defining Relationships

### RELATE Statement Basics

Create relationships between records:

```rust
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Following {
    id: String,
    r#in: String,
    out: String,
    created_at: String,
}

pub struct UserRelationRepository {
    db: Surreal<surrealdb::engine::any::Any>,
}

impl UserRelationRepository {
    pub fn new(db: Surreal<surrealdb::engine::any::Any>) -> Self {
        Self { db }
    }

    pub async fn follow_user(&self, follower_id: &Uuid, followee_id: &Uuid) -> Result<(), String> {
        let _: Option<Following> = self.db
            .query("RELATE $follower->follows->$followee SET created_at = time::now()")
            .bind(("follower", format!("user:{}", follower_id)))
            .bind(("followee", format!("user:{}", followee_id)))
            .await
            .map_err(|e| format!("Relation error: {}", e))?
            .take(0)
            .map_err(|e| format!("Parse error: {}", e))?;
        Ok(())
    }

    pub async fn unfollow_user(&self, follower_id: &Uuid, followee_id: &Uuid) -> Result<(), String> {
        self.db
            .query("DELETE $follower->follows WHERE out = $followee")
            .bind(("follower", format!("user:{}", follower_id)))
            .bind(("followee", format!("user:{}", followee_id)))
            .await
            .map_err(|e| format!("Delete error: {}", e))?;
        Ok(())
    }
}
```

### Edge Tables with Data

Store metadata on relationships:

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct Following {
    id: String,
    r#in: String,
    out: String,
    created_at: String,
    notifications_enabled: bool,
}

impl UserRelationRepository {
    pub async fn follow_with_settings(
        &self,
        follower_id: &Uuid,
        followee_id: &Uuid,
        notify: bool,
    ) -> Result<(), String> {
        let _: Option<Following> = self.db
            .query(r#"
                RELATE $follower->follows->$followee
                CONTENT {
                    notifications_enabled: $notify,
                    created_at: time::now()
                }
            "#)
            .bind(("follower", format!("user:{}", follower_id)))
            .bind(("followee", format!("user:{}", followee_id)))
            .bind(("notify", notify))
            .await
            .map_err(|e| format!("Relation error: {}", e))?
            .take(0)
            .map_err(|e| format!("Parse error: {}", e))?;
        Ok(())
    }

    pub async fn update_notification_settings(
        &self,
        follower_id: &Uuid,
        followee_id: &Uuid,
        enabled: bool,
    ) -> Result<(), String> {
        self.db
            .query(r#"
                UPDATE $follower->follows
                SET notifications_enabled = $enabled
                WHERE out = $followee
            "#)
            .bind(("follower", format!("user:{}", follower_id)))
            .bind(("followee", format!("user:{}", followee_id)))
            .bind(("enabled", enabled))
            .await
            .map_err(|e| format!("Update error: {}", e))?;
        Ok(())
    }
}
```

### Bidirectional Relationships

Create symmetric relationships:

```rust
impl UserRelationRepository {
    pub async fn create_friendship(&self, user1: &Uuid, user2: &Uuid) -> Result<(), String> {
        self.db
            .query(r#"
                RELATE $user1->friends->$user2 SET created_at = time::now();
                RELATE $user2->friends->$user1 SET created_at = time::now();
            "#)
            .bind(("user1", format!("user:{}", user1)))
            .bind(("user2", format!("user:{}", user2)))
            .await
            .map_err(|e| format!("Relation error: {}", e))?;
        Ok(())
    }

    pub async fn remove_friendship(&self, user1: &Uuid, user2: &Uuid) -> Result<(), String> {
        self.db
            .query(r#"
                DELETE $user1->friends WHERE out = $user2;
                DELETE $user2->friends WHERE out = $user1;
            "#)
            .bind(("user1", format!("user:{}", user1)))
            .bind(("user2", format!("user:{}", user2)))
            .await
            .map_err(|e| format!("Delete error: {}", e))?;
        Ok(())
    }
}
```

## Graph Traversal

### Simple Traversal

Traverse one level deep:

```rust
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct FollowersResult {
    followers: Vec<User>,
}

impl UserRelationRepository {
    pub async fn get_followers(&self, user_id: &Uuid) -> Result<Vec<User>, String> {
        let mut result = self.db
            .query("SELECT <-follows<-user AS followers FROM $user")
            .bind(("user", format!("user:{}", user_id)))
            .await
            .map_err(|e| format!("Query error: {}", e))?;

        let data: Vec<FollowersResult> = result.take(0)
            .map_err(|e| format!("Parse error: {}", e))?;

        Ok(data.into_iter()
            .flat_map(|r| r.followers)
            .collect())
    }

    pub async fn get_following(&self, user_id: &Uuid) -> Result<Vec<User>, String> {
        let mut result = self.db
            .query("SELECT ->follows->user AS following FROM $user")
            .bind(("user", format!("user:{}", user_id)))
            .await
            .map_err(|e| format!("Query error: {}", e))?;

        #[derive(Debug, Deserialize)]
        struct FollowingResult {
            following: Vec<User>,
        }

        let data: Vec<FollowingResult> = result.take(0)?;
        Ok(data.into_iter()
            .flat_map(|r| r.following)
            .collect())
    }
}
```

### Multi-Hop Traversal

Traverse multiple levels:

```rust
#[derive(Debug, Deserialize)]
struct FriendsOfFriends {
    fof: Vec<User>,
}

impl UserRelationRepository {
    pub async fn get_friends_of_friends(&self, user_id: &Uuid) -> Result<Vec<User>, String> {
        let mut result = self.db
            .query("SELECT ->friends->user->friends->user AS fof FROM $user")
            .bind(("user", format!("user:{}", user_id)))
            .await
            .map_err(|e| format!("Query error: {}", e))?;

        let data: Vec<FriendsOfFriends> = result.take(0)?;
        Ok(data.into_iter()
            .flat_map(|r| r.fof)
            .collect())
    }

    pub async fn get_second_degree_connections(&self, user_id: &Uuid) -> Result<Vec<User>, String> {
        let mut result = self.db
            .query(r#"
                SELECT ->follows->user->follows->user AS connections
                FROM $user
            "#)
            .bind(("user", format!("user:{}", user_id)))
            .await?;

        #[derive(Debug, Deserialize)]
        struct Connections {
            connections: Vec<User>,
        }

        let data: Vec<Connections> = result.take(0)?;
        Ok(data.into_iter()
            .flat_map(|r| r.connections)
            .collect())
    }
}
```

### Filtered Traversal

Combine traversal with filters:

```rust
impl UserRelationRepository {
    pub async fn get_active_followers(&self, user_id: &Uuid) -> Result<Vec<User>, String> {
        let mut result = self.db
            .query(r#"
                SELECT <-follows<-user AS followers
                FROM $user
                WHERE <-follows.notifications_enabled = true
            "#)
            .bind(("user", format!("user:{}", user_id)))
            .await?;

        let data: Vec<FollowersResult> = result.take(0)?;
        Ok(data.into_iter()
            .flat_map(|r| r.followers)
            .collect())
    }

    pub async fn get_mutual_followers(&self, user1: &Uuid, user2: &Uuid) -> Result<Vec<User>, String> {
        let mut result = self.db
            .query(r#"
                SELECT <-follows<-user AS mutual
                FROM $user1
                WHERE <-follows.in = $user2
            "#)
            .bind(("user1", format!("user:{}", user1)))
            .bind(("user2", format!("user:{}", user2)))
            .await?;

        #[derive(Debug, Deserialize)]
        struct Mutual {
            mutual: Vec<User>,
        }

        let data: Vec<Mutual> = result.take(0)?;
        Ok(data.into_iter()
            .flat_map(|r| r.mutual)
            .collect())
    }
}
```

### Bidirectional Traversal

Query in both directions:

```rust
#[derive(Debug, Deserialize)]
pub struct SocialCircle {
    pub following: Vec<User>,
    pub followers: Vec<User>,
    pub friends: Vec<User>,
}

impl UserRelationRepository {
    pub async fn get_social_circle(&self, user_id: &Uuid) -> Result<SocialCircle, String> {
        let mut result = self.db
            .query(r#"
                SELECT
                    ->follows->user AS following,
                    <-follows<-user AS followers,
                    ->friends->user AS friends
                FROM $user
            "#)
            .bind(("user", format!("user:{}", user_id)))
            .await?;

        let mut circles: Vec<SocialCircle> = result.take(0)?;
        circles.into_iter()
            .next()
            .ok_or("User not found".to_string())
    }
}
```

## Repository Pattern with Graphs

### Graph Repository Port

Define graph operations as traits:

```rust
use async_trait::async_trait;

#[async_trait]
pub trait SocialGraphRepository: Send + Sync {
    async fn follow(&self, follower: &Uuid, followee: &Uuid) -> Result<(), String>;
    async fn unfollow(&self, follower: &Uuid, followee: &Uuid) -> Result<(), String>;
    async fn get_followers(&self, user_id: &Uuid) -> Result<Vec<User>, String>;
    async fn get_following(&self, user_id: &Uuid) -> Result<Vec<User>, String>;
    async fn are_friends(&self, user1: &Uuid, user2: &Uuid) -> Result<bool, String>;
    async fn get_social_circle(&self, user_id: &Uuid) -> Result<SocialCircle, String>;
}
```

### SurrealDB Graph Implementation

Complete implementation:

```rust
pub struct SurrealSocialGraphRepository {
    db: Surreal<surrealdb::engine::any::Any>,
}

impl SurrealSocialGraphRepository {
    pub fn new(db: Surreal<surrealdb::engine::any::Any>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl SocialGraphRepository for SurrealSocialGraphRepository {
    async fn follow(&self, follower: &Uuid, followee: &Uuid) -> Result<(), String> {
        let _: Option<Following> = self.db
            .query("RELATE $follower->follows->$followee SET created_at = time::now()")
            .bind(("follower", format!("user:{}", follower)))
            .bind(("followee", format!("user:{}", followee)))
            .await
            .map_err(|e| format!("Relation error: {}", e))?
            .take(0)
            .map_err(|e| format!("Parse error: {}", e))?;
        Ok(())
    }

    async fn unfollow(&self, follower: &Uuid, followee: &Uuid) -> Result<(), String> {
        self.db
            .query("DELETE $follower->follows WHERE out = $followee")
            .bind(("follower", format!("user:{}", follower)))
            .bind(("followee", format!("user:{}", followee)))
            .await
            .map_err(|e| format!("Delete error: {}", e))?;
        Ok(())
    }

    async fn get_followers(&self, user_id: &Uuid) -> Result<Vec<User>, String> {
        let mut result = self.db
            .query("SELECT <-follows<-user AS followers FROM $user")
            .bind(("user", format!("user:{}", user_id)))
            .await?;

        let data: Vec<FollowersResult> = result.take(0)?;
        Ok(data.into_iter()
            .flat_map(|r| r.followers)
            .collect())
    }

    async fn get_following(&self, user_id: &Uuid) -> Result<Vec<User>, String> {
        let mut result = self.db
            .query("SELECT ->follows->user AS following FROM $user")
            .bind(("user", format!("user:{}", user_id)))
            .await?;

        #[derive(Debug, Deserialize)]
        struct FollowingResult {
            following: Vec<User>,
        }

        let data: Vec<FollowingResult> = result.take(0)?;
        Ok(data.into_iter()
            .flat_map(|r| r.following)
            .collect())
    }

    async fn are_friends(&self, user1: &Uuid, user2: &Uuid) -> Result<bool, String> {
        let mut result = self.db
            .query(r#"
                SELECT count() AS count
                FROM $user1->friends
                WHERE out = $user2
            "#)
            .bind(("user1", format!("user:{}", user1)))
            .bind(("user2", format!("user:{}", user2)))
            .await?;

        #[derive(Debug, Deserialize)]
        struct CountResult {
            count: i64,
        }

        let data: Vec<CountResult> = result.take(0)?;
        Ok(data.first().map(|r| r.count > 0).unwrap_or(false))
    }

    async fn get_social_circle(&self, user_id: &Uuid) -> Result<SocialCircle, String> {
        let mut result = self.db
            .query(r#"
                SELECT
                    ->follows->user AS following,
                    <-follows<-user AS followers,
                    ->friends->user AS friends
                FROM $user
            "#)
            .bind(("user", format!("user:{}", user_id)))
            .await?;

        let mut circles: Vec<SocialCircle> = result.take(0)?;
        circles.into_iter()
            .next()
            .ok_or("User not found".to_string())
    }
}
```

## Advanced Patterns

### Recommendation Algorithms

Find suggested connections:

```rust
impl SurrealSocialGraphRepository {
    pub async fn get_suggested_connections(&self, user_id: &Uuid, limit: usize) -> Result<Vec<User>, String> {
        let mut result = self.db
            .query(r#"
                SELECT ->follows->user->follows->user AS suggestions
                FROM $user
                WHERE suggestions.id != $user
                AND suggestions.id NOT IN (SELECT ->follows->user.id FROM $user)
                LIMIT $limit
            "#)
            .bind(("user", format!("user:{}", user_id)))
            .bind(("limit", limit))
            .await?;

        #[derive(Debug, Deserialize)]
        struct Suggestions {
            suggestions: Vec<User>,
        }

        let data: Vec<Suggestions> = result.take(0)?;
        Ok(data.into_iter()
            .flat_map(|r| r.suggestions)
            .collect())
    }

    pub async fn get_popular_users(&self, limit: usize) -> Result<Vec<(User, i64)>, String> {
        let mut result = self.db
            .query(r#"
                SELECT *, count(<-follows) AS follower_count
                FROM user
                ORDER BY follower_count DESC
                LIMIT $limit
            "#)
            .bind(("limit", limit))
            .await?;

        #[derive(Debug, Deserialize)]
        struct PopularUser {
            #[serde(flatten)]
            user: User,
            follower_count: i64,
        }

        let data: Vec<PopularUser> = result.take(0)?;
        Ok(data.into_iter()
            .map(|pu| (pu.user, pu.follower_count))
            .collect())
    }
}
```

### Community Detection

Find clusters of connected users:

```rust
impl SurrealSocialGraphRepository {
    pub async fn get_mutual_friends(&self, user1: &Uuid, user2: &Uuid) -> Result<Vec<User>, String> {
        let mut result = self.db
            .query(r#"
                SELECT ->friends->user AS user1_friends FROM $user1;
                SELECT ->friends->user AS user2_friends FROM $user2;
            "#)
            .bind(("user1", format!("user:{}", user1)))
            .bind(("user2", format!("user:{}", user2)))
            .await?;

        #[derive(Debug, Deserialize)]
        struct Friends {
            friends: Vec<User>,
        }

        let user1_friends: Vec<Friends> = result.take(0)?;
        let user2_friends: Vec<Friends> = result.take(1)?;

        let set1: std::collections::HashSet<_> = user1_friends
            .into_iter()
            .flat_map(|f| f.friends)
            .map(|u| u.id().clone())
            .collect();

        let mutual: Vec<User> = user2_friends
            .into_iter()
            .flat_map(|f| f.friends)
            .filter(|u| set1.contains(u.id()))
            .collect();

        Ok(mutual)
    }

    pub async fn get_network_size(&self, user_id: &Uuid, depth: usize) -> Result<i64, String> {
        let query = format!(
            "SELECT count({}->follows->user) AS size FROM $user",
            "->follows->user".repeat(depth)
        );

        let mut result = self.db
            .query(&query)
            .bind(("user", format!("user:{}", user_id)))
            .await?;

        #[derive(Debug, Deserialize)]
        struct NetworkSize {
            size: i64,
        }

        let data: Vec<NetworkSize> = result.take(0)?;
        Ok(data.first().map(|ns| ns.size).unwrap_or(0))
    }
}
```

### Performance Optimization

Index for faster graph queries:

```sql
DEFINE INDEX follows_in ON TABLE follows COLUMNS in;
DEFINE INDEX follows_out ON TABLE follows COLUMNS out;
DEFINE INDEX friends_in ON TABLE friends COLUMNS in;
DEFINE INDEX friends_out ON TABLE friends COLUMNS out;
```

Limit traversal depth:

```rust
impl SurrealSocialGraphRepository {
    pub async fn get_network_limited(&self, user_id: &Uuid, max_depth: usize) -> Result<Vec<User>, String> {
        if max_depth > 3 {
            return Err("Max depth exceeded for performance".to_string());
        }

        let mut result = self.db
            .query(&format!(
                "SELECT {}->user AS network FROM $user LIMIT 1000",
                "->follows".repeat(max_depth)
            ))
            .bind(("user", format!("user:{}", user_id)))
            .await?;

        #[derive(Debug, Deserialize)]
        struct Network {
            network: Vec<User>,
        }

        let data: Vec<Network> = result.take(0)?;
        Ok(data.into_iter()
            .flat_map(|n| n.network)
            .collect())
    }
}
```

## Use Case Integration

### Social Graph Use Case

Integrate graph operations into use cases:

```rust
use std::sync::Arc;

pub struct SocialUseCase {
    user_repository: Arc<dyn UserRepository>,
    graph_repository: Arc<dyn SocialGraphRepository>,
}

impl SocialUseCase {
    pub fn new(
        user_repository: Arc<dyn UserRepository>,
        graph_repository: Arc<dyn SocialGraphRepository>,
    ) -> Self {
        Self {
            user_repository,
            graph_repository,
        }
    }

    pub async fn follow_user(&self, follower_id: &Uuid, followee_id: &Uuid) -> Result<(), String> {
        let _follower = self.user_repository
            .find_by_id(follower_id)
            .await?
            .ok_or("Follower not found")?;

        let _followee = self.user_repository
            .find_by_id(followee_id)
            .await?
            .ok_or("Followee not found")?;

        if follower_id == followee_id {
            return Err("Cannot follow yourself".to_string());
        }

        self.graph_repository.follow(follower_id, followee_id).await
    }

    pub async fn get_user_network(&self, user_id: &Uuid) -> Result<SocialCircle, String> {
        let _user = self.user_repository
            .find_by_id(user_id)
            .await?
            .ok_or("User not found")?;

        self.graph_repository.get_social_circle(user_id).await
    }

    pub async fn suggest_connections(&self, user_id: &Uuid) -> Result<Vec<User>, String> {
        let _user = self.user_repository
            .find_by_id(user_id)
            .await?
            .ok_or("User not found")?;

        self.graph_repository.get_suggested_connections(user_id, 10).await
    }
}
```

### Schema Definition

Define graph schema in SurrealDB:

```sql
DEFINE TABLE follows SCHEMAFULL;
DEFINE FIELD in ON TABLE follows TYPE record(user);
DEFINE FIELD out ON TABLE follows TYPE record(user);
DEFINE FIELD created_at ON TABLE follows TYPE datetime;
DEFINE FIELD notifications_enabled ON TABLE follows TYPE bool DEFAULT true;

DEFINE INDEX follows_in ON TABLE follows COLUMNS in;
DEFINE INDEX follows_out ON TABLE follows COLUMNS out;

DEFINE TABLE friends SCHEMAFULL;
DEFINE FIELD in ON TABLE friends TYPE record(user);
DEFINE FIELD out ON TABLE friends TYPE record(user);
DEFINE FIELD created_at ON TABLE friends TYPE datetime;

DEFINE INDEX friends_in ON TABLE friends COLUMNS in;
DEFINE INDEX friends_out ON TABLE friends COLUMNS out;
```
