# Graph Relations and Traversal Patterns

Complete guide to implementing graph database patterns with SurrealDB in SvelteKit using hexagonal architecture.

## Table of Contents

- [Schema Definition](#schema-definition)
- [Graph Repository Interface](#graph-repository-interface)
- [Relation Management](#relation-management)
- [Graph Traversal](#graph-traversal)
- [Social Network Example](#social-network-example)
- [Content Graph Example](#content-graph-example)
- [Advanced Patterns](#advanced-patterns)

## Schema Definition

### Basic Graph Schema

schema/graph.surql:

```surrealql
DEFINE TABLE user SCHEMAFULL;
DEFINE FIELD name ON user TYPE string;
DEFINE FIELD email ON user TYPE string ASSERT string::is_email($value);
DEFINE FIELD created_at ON user TYPE datetime;
DEFINE INDEX email ON user FIELDS email UNIQUE;

DEFINE TABLE post SCHEMAFULL;
DEFINE FIELD title ON post TYPE string;
DEFINE FIELD content ON post TYPE string;
DEFINE FIELD created_at ON post TYPE datetime;

DEFINE TABLE comment SCHEMAFULL;
DEFINE FIELD text ON comment TYPE string;
DEFINE FIELD created_at ON comment TYPE datetime;

DEFINE TABLE wrote SCHEMAFULL TYPE RELATION FROM user TO post | comment;
DEFINE FIELD created_at ON wrote TYPE datetime;

DEFINE TABLE likes SCHEMAFULL TYPE RELATION FROM user TO post | comment;
DEFINE FIELD created_at ON likes TYPE datetime;

DEFINE TABLE follows SCHEMAFULL TYPE RELATION FROM user TO user;
DEFINE FIELD since ON follows TYPE datetime;
```

### Advanced Graph Schema with Properties

schema/advanced-graph.surql:

```surrealql
DEFINE TABLE person SCHEMAFULL;
DEFINE FIELD name ON person TYPE string;
DEFINE FIELD bio ON person TYPE string;
DEFINE FIELD created_at ON person TYPE datetime;

DEFINE TABLE organization SCHEMAFULL;
DEFINE FIELD name ON organization TYPE string;
DEFINE FIELD industry ON organization TYPE string;
DEFINE FIELD founded ON organization TYPE datetime;

DEFINE TABLE works_at SCHEMAFULL TYPE RELATION FROM person TO organization;
DEFINE FIELD role ON works_at TYPE string;
DEFINE FIELD start_date ON works_at TYPE datetime;
DEFINE FIELD end_date ON works_at TYPE option<datetime>;
DEFINE FIELD is_current ON works_at TYPE bool;

DEFINE TABLE mentors SCHEMAFULL TYPE RELATION FROM person TO person;
DEFINE FIELD since ON mentors TYPE datetime;
DEFINE FIELD expertise ON mentors TYPE array;

DEFINE TABLE collaborates_with SCHEMAFULL TYPE RELATION FROM person TO person;
DEFINE FIELD projects ON collaborates_with TYPE array;
DEFINE FIELD since ON collaborates_with TYPE datetime;
```

## Graph Repository Interface

### Domain Repository Interface

src/lib/domain/repositories/IGraphRepository.ts:

```typescript
export interface GraphNode {
  id: string;
  type: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: string;
  properties?: Record<string, any>;
}

export interface TraversalOptions {
  maxDepth?: number;
  direction?: "out" | "in" | "both";
  edgeTypes?: string[];
}

export interface IGraphRepository {
  createNode(type: string, data: Record<string, any>): Promise<GraphNode>;
  createEdge(edge: GraphEdge): Promise<void>;
  deleteEdge(from: string, to: string, type: string): Promise<void>;
  getNeighbors(
    nodeId: string,
    edgeType: string,
    direction?: "out" | "in",
  ): Promise<GraphNode[]>;
  traverse(startId: string, options: TraversalOptions): Promise<GraphNode[]>;
  shortestPath(
    fromId: string,
    toId: string,
    edgeType: string,
  ): Promise<GraphNode[]>;
  getRelationProperties(
    from: string,
    to: string,
    relationType: string,
  ): Promise<Record<string, any> | null>;
}
```

## Relation Management

### Graph Service

src/lib/infrastructure/persistence/surrealdb/SurrealGraphRepository.ts:

```typescript
import type { Surreal } from "surrealdb";
import { RecordId } from "surrealdb";
import type {
  IGraphRepository,
  GraphNode,
  GraphEdge,
  TraversalOptions,
} from "$lib/domain/repositories/IGraphRepository";

export class SurrealGraphRepository implements IGraphRepository {
  constructor(private readonly db: Surreal) {}

  async createNode(
    type: string,
    data: Record<string, any>,
  ): Promise<GraphNode> {
    const result = await this.db.query<[any[]]>(`CREATE $type CONTENT $data`, {
      type,
      data,
    });

    const node = result[0]?.result?.[0];
    if (!node) {
      throw new Error("Failed to create node");
    }

    return {
      id: node.id,
      type,
    };
  }

  async createEdge(edge: GraphEdge): Promise<void> {
    const [fromType, fromId] = edge.from.split(":");
    const [toType, toId] = edge.to.split(":");

    await this.db.query(
      `RELATE $from->$edgeType->$to SET ${
        edge.properties
          ? Object.keys(edge.properties)
              .map((key) => `${key} = $props.${key}`)
              .join(", ") + ","
          : ""
      } created_at = time::now()`,
      {
        from: new RecordId(fromType, fromId),
        to: new RecordId(toType, toId),
        edgeType: edge.type,
        ...(edge.properties && { props: edge.properties }),
      },
    );
  }

  async deleteEdge(from: string, to: string, type: string): Promise<void> {
    const [fromType, fromId] = from.split(":");
    const [toType, toId] = to.split(":");

    await this.db.query(`DELETE $from->$edgeType WHERE out = $to`, {
      from: new RecordId(fromType, fromId),
      to: new RecordId(toType, toId),
      edgeType: type,
    });
  }

  async getNeighbors(
    nodeId: string,
    edgeType: string,
    direction: "out" | "in" = "out",
  ): Promise<GraphNode[]> {
    const [type, id] = nodeId.split(":");
    const traversal =
      direction === "out" ? `->${edgeType}->` : `<-${edgeType}<-`;

    const result = await this.db.query<[any[]]>(
      `SELECT ${traversal}* AS neighbors FROM $nodeId`,
      { nodeId: new RecordId(type, id) },
    );

    const neighbors = result[0]?.result?.[0]?.neighbors || [];
    return neighbors.map((n: any) => ({
      id: n.id,
      type: n.id.split(":")[0],
    }));
  }

  async traverse(
    startId: string,
    options: TraversalOptions,
  ): Promise<GraphNode[]> {
    const [type, id] = startId.split(":");
    const maxDepth = options.maxDepth || 3;
    const direction = options.direction || "out";

    let traversal = "";
    switch (direction) {
      case "out":
        traversal = `->${options.edgeTypes?.join("|") || "*"}->`;
        break;
      case "in":
        traversal = `<-${options.edgeTypes?.join("|") || "*"}<-`;
        break;
      case "both":
        traversal = `<->${options.edgeTypes?.join("|") || "*"}<->`;
        break;
    }

    const result = await this.db.query<[any[]]>(
      `SELECT ${traversal.repeat(maxDepth)}* AS nodes FROM $startId`,
      { startId: new RecordId(type, id) },
    );

    const nodes = result[0]?.result?.[0]?.nodes || [];
    return nodes.map((n: any) => ({
      id: n.id,
      type: n.id.split(":")[0],
    }));
  }

  async shortestPath(
    fromId: string,
    toId: string,
    edgeType: string,
  ): Promise<GraphNode[]> {
    const result = await this.db.query<[any[]]>(
      `SELECT * FROM $fromId WHERE id IN (
        SELECT VALUE id FROM (
          SELECT ->$edgeType->* AS path FROM $fromId
        ) WHERE $toId IN path
      )`,
      { fromId, toId, edgeType },
    );

    const path = result[0]?.result || [];
    return path.map((n: any) => ({
      id: n.id,
      type: n.id.split(":")[0],
    }));
  }

  async getRelationProperties(
    from: string,
    to: string,
    relationType: string,
  ): Promise<Record<string, any> | null> {
    const [fromType, fromId] = from.split(":");
    const [toType, toId] = to.split(":");

    const result = await this.db.query<[any[]]>(
      `SELECT * FROM $from->$relationType WHERE out = $to`,
      {
        from: new RecordId(fromType, fromId),
        to: new RecordId(toType, toId),
        relationType,
      },
    );

    return result[0]?.result?.[0] || null;
  }
}
```

## Graph Traversal

### Use Case: Get User Network

src/lib/application/use-cases/GetUserNetwork.ts:

```typescript
import type { IGraphRepository } from "$lib/domain/repositories/IGraphRepository";

export interface UserNetworkNode {
  id: string;
  name: string;
  degree: number;
}

export class GetUserNetworkUseCase {
  constructor(private readonly graphRepository: IGraphRepository) {}

  async execute(userId: string, depth: number = 2): Promise<UserNetworkNode[]> {
    const nodes = await this.graphRepository.traverse(userId, {
      maxDepth: depth,
      direction: "both",
      edgeTypes: ["follows", "collaborates_with"],
    });

    return nodes.map((node) => ({
      id: node.id,
      name: "",
      degree: 0,
    }));
  }
}
```

### Use Case: Find Mutual Connections

src/lib/application/use-cases/FindMutualConnections.ts:

```typescript
import type { Surreal } from "surrealdb";
import { RecordId } from "surrealdb";

export class FindMutualConnectionsUseCase {
  constructor(private readonly db: Surreal) {}

  async execute(userId1: string, userId2: string): Promise<any[]> {
    const result = await this.db.query<[any[]]>(
      `SELECT VALUE id FROM (
        SELECT ->follows->user AS connections FROM $user1
      ) WHERE connections IN (
        SELECT ->follows->user AS connections FROM $user2
      )`,
      {
        user1: new RecordId("user", userId1),
        user2: new RecordId("user", userId2),
      },
    );

    return result[0]?.result || [];
  }
}
```

## Social Network Example

### Social Graph Domain

src/lib/domain/entities/SocialGraph.ts:

```typescript
export interface SocialNode {
  id: string;
  name: string;
  followers: number;
  following: number;
}

export interface Connection {
  userId: string;
  targetId: string;
  since: Date;
}

export class SocialGraph {
  static createFollowConnection(userId: string, targetId: string): Connection {
    return {
      userId,
      targetId,
      since: new Date(),
    };
  }
}
```

### Social Graph Repository

src/lib/infrastructure/persistence/surrealdb/SurrealSocialGraphRepository.ts:

```typescript
import type { Surreal } from "surrealdb";
import { RecordId } from "surrealdb";

export interface FollowStats {
  userId: string;
  followers: number;
  following: number;
  mutualFollows: number;
}

export class SurrealSocialGraphRepository {
  constructor(private readonly db: Surreal) {}

  async follow(userId: string, targetId: string): Promise<void> {
    await this.db.query(
      `RELATE $user->follows->$target SET since = time::now()`,
      {
        user: new RecordId("user", userId),
        target: new RecordId("user", targetId),
      },
    );
  }

  async unfollow(userId: string, targetId: string): Promise<void> {
    await this.db.query(`DELETE $user->follows WHERE out = $target`, {
      user: new RecordId("user", userId),
      target: new RecordId("user", targetId),
    });
  }

  async getFollowers(userId: string): Promise<any[]> {
    const result = await this.db.query<[any[]]>(
      `SELECT <-follows<-user.* AS followers FROM $userId`,
      { userId: new RecordId("user", userId) },
    );

    return result[0]?.result?.[0]?.followers || [];
  }

  async getFollowing(userId: string): Promise<any[]> {
    const result = await this.db.query<[any[]]>(
      `SELECT ->follows->user.* AS following FROM $userId`,
      { userId: new RecordId("user", userId) },
    );

    return result[0]?.result?.[0]?.following || [];
  }

  async getMutualFollows(userId: string): Promise<any[]> {
    const result = await this.db.query<[any[]]>(
      `SELECT <->follows<->user.* AS mutuals FROM $userId`,
      { userId: new RecordId("user", userId) },
    );

    return result[0]?.result?.[0]?.mutuals || [];
  }

  async getFollowStats(userId: string): Promise<FollowStats> {
    const result = await this.db.query<[any[]]>(
      `SELECT
        count(<-follows) AS followers,
        count(->follows) AS following,
        count(<->follows) AS mutualFollows
       FROM $userId
       GROUP ALL`,
      { userId: new RecordId("user", userId) },
    );

    const stats = result[0]?.result?.[0];

    return {
      userId,
      followers: stats?.followers || 0,
      following: stats?.following || 0,
      mutualFollows: stats?.mutualFollows || 0,
    };
  }

  async getSuggestedFollows(
    userId: string,
    limit: number = 10,
  ): Promise<any[]> {
    const result = await this.db.query<[any[]]>(
      `SELECT ->follows->user->follows->user.* AS suggestions
       FROM $userId
       WHERE suggestions.id != $userId
       AND suggestions.id NOT IN (SELECT ->follows->user.id FROM $userId)
       LIMIT $limit`,
      {
        userId: new RecordId("user", userId),
        limit,
      },
    );

    return result[0]?.result || [];
  }
}
```

### Social Graph Routes

src/routes/api/users/[id]/followers/+server.ts:

```typescript
import type { RequestHandler } from "./$types";
import { json, error } from "@sveltejs/kit";
import { SurrealSocialGraphRepository } from "$lib/infrastructure/persistence/surrealdb/SurrealSocialGraphRepository";

export const GET: RequestHandler = async ({ params, locals }) => {
  const repository = new SurrealSocialGraphRepository(locals.db);

  try {
    const followers = await repository.getFollowers(params.id);
    return json({ followers });
  } catch (err) {
    throw error(500, "Failed to get followers");
  }
};
```

src/routes/api/users/[id]/follow/+server.ts:

```typescript
import type { RequestHandler } from "./$types";
import { json, error } from "@sveltejs/kit";
import { SurrealSocialGraphRepository } from "$lib/infrastructure/persistence/surrealdb/SurrealSocialGraphRepository";

export const POST: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    throw error(401, "Unauthorized");
  }

  const repository = new SurrealSocialGraphRepository(locals.db);

  try {
    await repository.follow(locals.user.id, params.id);
    return json({ success: true });
  } catch (err) {
    throw error(500, "Failed to follow user");
  }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    throw error(401, "Unauthorized");
  }

  const repository = new SurrealSocialGraphRepository(locals.db);

  try {
    await repository.unfollow(locals.user.id, params.id);
    return json({ success: true });
  } catch (err) {
    throw error(500, "Failed to unfollow user");
  }
};
```

## Content Graph Example

### Content Relations Schema

schema/content-graph.surql:

```surrealql
DEFINE TABLE article SCHEMAFULL;
DEFINE FIELD title ON article TYPE string;
DEFINE FIELD content ON article TYPE string;
DEFINE FIELD published_at ON article TYPE datetime;

DEFINE TABLE tag SCHEMAFULL;
DEFINE FIELD name ON tag TYPE string;
DEFINE INDEX tag_name ON tag FIELDS name UNIQUE;

DEFINE TABLE category SCHEMAFULL;
DEFINE FIELD name ON category TYPE string;
DEFINE INDEX category_name ON category FIELDS name UNIQUE;

DEFINE TABLE has_tag SCHEMAFULL TYPE RELATION FROM article TO tag;
DEFINE FIELD weight ON has_tag TYPE number DEFAULT 1;

DEFINE TABLE in_category SCHEMAFULL TYPE RELATION FROM article TO category;

DEFINE TABLE references SCHEMAFULL TYPE RELATION FROM article TO article;
DEFINE FIELD context ON references TYPE string;
```

### Content Graph Repository

src/lib/infrastructure/persistence/surrealdb/SurrealContentGraphRepository.ts:

```typescript
import type { Surreal } from "surrealdb";
import { RecordId } from "surrealdb";

export class SurrealContentGraphRepository {
  constructor(private readonly db: Surreal) {}

  async addTag(
    articleId: string,
    tagName: string,
    weight: number = 1,
  ): Promise<void> {
    await this.db.query(
      `LET $tag = (SELECT * FROM tag WHERE name = $tagName LIMIT 1)[0] OR
                  CREATE tag CONTENT { name: $tagName };
       RELATE $article->has_tag->$tag SET weight = $weight;`,
      {
        article: new RecordId("article", articleId),
        tagName,
        weight,
      },
    );
  }

  async getRelatedArticles(
    articleId: string,
    limit: number = 10,
  ): Promise<any[]> {
    const result = await this.db.query<[any[]]>(
      `SELECT ->has_tag->tag<-has_tag<-article AS related
       FROM $articleId
       WHERE related.id != $articleId
       LIMIT $limit`,
      { articleId: new RecordId("article", articleId), limit },
    );

    return result[0]?.result?.[0]?.related || [];
  }

  async getArticlesByTag(tagName: string): Promise<any[]> {
    const result = await this.db.query<[any[]]>(
      `SELECT <-has_tag<-article.* AS articles
       FROM tag
       WHERE name = $tagName`,
      { tagName },
    );

    return result[0]?.result?.[0]?.articles || [];
  }

  async getPopularTags(limit: number = 20): Promise<any[]> {
    const result = await this.db.query<[any[]]>(
      `SELECT
        name,
        count(<-has_tag) AS article_count,
        math::sum(<-has_tag.weight) AS total_weight
       FROM tag
       GROUP BY name
       ORDER BY article_count DESC
       LIMIT $limit`,
      { limit },
    );

    return result[0]?.result || [];
  }

  async createReference(
    fromArticleId: string,
    toArticleId: string,
    context: string,
  ): Promise<void> {
    await this.db.query(
      `RELATE $from->references->$to SET context = $context`,
      {
        from: new RecordId("article", fromArticleId),
        to: new RecordId("article", toArticleId),
        context,
      },
    );
  }

  async getCitationGraph(articleId: string, depth: number = 2): Promise<any[]> {
    const result = await this.db.query<[any[]]>(
      `SELECT
        ->references->article AS citations,
        <-references<-article AS cited_by
       FROM $articleId`,
      { articleId: new RecordId("article", articleId) },
    );

    return result[0]?.result || [];
  }
}
```

## Advanced Patterns

### Multi-Hop Traversal

src/lib/infrastructure/persistence/surrealdb/GraphTraversal.ts:

```typescript
import type { Surreal } from "surrealdb";
import { RecordId } from "surrealdb";

export class GraphTraversal {
  constructor(private readonly db: Surreal) {}

  async findPathBetweenUsers(
    fromId: string,
    toId: string,
    maxDepth: number = 5,
  ): Promise<string[][]> {
    const result = await this.db.query<[any[]]>(
      `SELECT ->follows->user AS path FROM $from
       WHERE $to IN path
       LIMIT 10`,
      {
        from: new RecordId("user", fromId),
        to: new RecordId("user", toId),
      },
    );

    return result[0]?.result || [];
  }

  async getInfluencers(minFollowers: number = 1000): Promise<any[]> {
    const result = await this.db.query<[any[]]>(
      `SELECT
        *,
        count(<-follows) AS follower_count,
        count(->follows) AS following_count
       FROM user
       WHERE follower_count >= $minFollowers
       ORDER BY follower_count DESC
       LIMIT 50`,
      { minFollowers },
    );

    return result[0]?.result || [];
  }

  async getRecommendations(userId: string, limit: number = 10): Promise<any[]> {
    const result = await this.db.query<[any[]]>(
      `SELECT
        ->follows->user->follows->user AS recommendations,
        count(->follows->user->follows->user.id) AS score
       FROM $userId
       WHERE recommendations.id != $userId
       AND recommendations.id NOT IN (SELECT ->follows->user.id FROM $userId)
       GROUP BY recommendations.id
       ORDER BY score DESC
       LIMIT $limit`,
      {
        userId: new RecordId("user", userId),
        limit,
      },
    );

    return result[0]?.result || [];
  }

  async detectCommunities(edgeType: string): Promise<any[]> {
    const result = await this.db.query<[any[]]>(
      `SELECT
        id,
        ->$edgeType->user AS connections,
        count(->$edgeType) AS connection_count
       FROM user
       GROUP BY id
       ORDER BY connection_count DESC`,
      { edgeType },
    );

    return result[0]?.result || [];
  }
}
```

### Weighted Graph Queries

src/lib/infrastructure/persistence/surrealdb/WeightedGraph.ts:

```typescript
import type { Surreal } from "surrealdb";
import { RecordId } from "surrealdb";

export class WeightedGraph {
  constructor(private readonly db: Surreal) {}

  async createWeightedEdge(
    from: string,
    to: string,
    edgeType: string,
    weight: number,
  ): Promise<void> {
    const [fromType, fromId] = from.split(":");
    const [toType, toId] = to.split(":");

    await this.db.query(
      `RELATE $from->$edgeType->$to SET weight = $weight, created_at = time::now()`,
      {
        from: new RecordId(fromType, fromId),
        to: new RecordId(toType, toId),
        edgeType,
        weight,
      },
    );
  }

  async updateEdgeWeight(
    from: string,
    to: string,
    edgeType: string,
    weight: number,
  ): Promise<void> {
    const [fromType, fromId] = from.split(":");
    const [toType, toId] = to.split(":");

    await this.db.query(
      `UPDATE $from->$edgeType SET weight = $weight WHERE out = $to`,
      {
        from: new RecordId(fromType, fromId),
        to: new RecordId(toType, toId),
        edgeType,
        weight,
      },
    );
  }

  async getStrongestConnections(
    userId: string,
    limit: number = 10,
  ): Promise<any[]> {
    const result = await this.db.query<[any[]]>(
      `SELECT ->follows->user.*, ->follows.weight AS connection_strength
       FROM $userId
       ORDER BY connection_strength DESC
       LIMIT $limit`,
      {
        userId: new RecordId("user", userId),
        limit,
      },
    );

    return result[0]?.result || [];
  }

  async calculateTotalInfluence(userId: string): Promise<number> {
    const result = await this.db.query<[any[]]>(
      `SELECT math::sum(->follows.weight) AS total_influence
       FROM $userId
       GROUP ALL`,
      { userId: new RecordId("user", userId) },
    );

    return result[0]?.result?.[0]?.total_influence || 0;
  }
}
```

### Temporal Graph Queries

src/lib/infrastructure/persistence/surrealdb/TemporalGraph.ts:

```typescript
import type { Surreal } from "surrealdb";
import { RecordId } from "surrealdb";

export class TemporalGraph {
  constructor(private readonly db: Surreal) {}

  async getConnectionsSince(userId: string, since: Date): Promise<any[]> {
    const result = await this.db.query<[any[]]>(
      `SELECT ->follows->user.*, ->follows.since AS connected_since
       FROM $userId
       WHERE connected_since >= $since`,
      {
        userId: new RecordId("user", userId),
        since: since.toISOString(),
      },
    );

    return result[0]?.result || [];
  }

  async getConnectionGrowth(userId: string, days: number = 30): Promise<any[]> {
    const result = await this.db.query<[any[]]>(
      `SELECT
        time::day(->follows.since) AS day,
        count() AS new_connections
       FROM $userId
       WHERE ->follows.since >= time::now() - duration::from::days($days)
       GROUP BY day
       ORDER BY day ASC`,
      {
        userId: new RecordId("user", userId),
        days,
      },
    );

    return result[0]?.result || [];
  }

  async getActiveConnections(
    userId: string,
    lastActiveDays: number = 7,
  ): Promise<any[]> {
    const result = await this.db.query<[any[]]>(
      `SELECT ->follows->user.*
       FROM $userId
       WHERE ->follows->user.last_active >= time::now() - duration::from::days($days)`,
      {
        userId: new RecordId("user", userId),
        days: lastActiveDays,
      },
    );

    return result[0]?.result || [];
  }
}
```
