# Implementing Hexagonal Architecture with SvelteKit and SurrealDB

Guides you through implementing hexagonal architecture (ports and adapters pattern) in SvelteKit projects using SurrealDB as the persistence layer. Ensures clean separation between domain logic, application use cases, and infrastructure concerns while leveraging SurrealDB's multi-model capabilities.

## When to Use This Skill

- Building SvelteKit applications with clean architecture
- Implementing multi-model data patterns (document, graph, key-value, time-series)
- Need real-time data subscriptions and live queries
- Graph traversal and relationship modeling
- Want framework-independent business logic with SurrealDB
- Structuring full-stack TypeScript applications for testability

## Architecture Overview

```
src/
├── lib/
│   ├── domain/
│   │   ├── entities/
│   │   │   └── User.ts
│   │   └── repositories/
│   │       └── IUserRepository.ts
│   ├── application/
│   │   └── use-cases/
│   │       ├── CreateUser.ts
│   │       └── GetUser.ts
│   └── infrastructure/
│       ├── persistence/
│       │   └── surrealdb/
│       │       ├── connection.ts
│       │       ├── SurrealUserRepository.ts
│       │       └── migrations.ts
│       └── web/
│           └── sveltekit/
└── routes/
    ├── +page.svelte
    ├── +page.server.ts
    └── api/
        └── users/
            └── +server.ts
```

## Quick Start

### Step 1: Install Dependencies

```bash
npm install surrealdb
npm install -D @types/node
```

### Step 2: Define Domain Entity

src/lib/domain/entities/User.ts:

```typescript
export class User {
  private constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly name: string,
    public readonly createdAt: Date,
  ) {}

  static create(data: {
    email: string;
    name: string;
  }): Result<User, ValidationError> {
    if (!this.isValidEmail(data.email)) {
      return { ok: false, error: new ValidationError("Invalid email format") };
    }

    if (data.name.length < 2 || data.name.length > 100) {
      return {
        ok: false,
        error: new ValidationError("Name must be 2-100 characters"),
      };
    }

    return { ok: true, value: new User("", data.email, data.name, new Date()) };
  }

  static fromDb(data: DbUser): User {
    return new User(data.id, data.email, data.name, new Date(data.created_at));
  }

  private static isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

interface DbUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
}
```

### Step 3: Define Repository Port (Interface)

src/lib/domain/repositories/IUserRepository.ts:

```typescript
import type { User } from "../entities/User";

export interface IUserRepository {
  create(user: User): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  update(id: string, data: Partial<User>): Promise<User>;
  delete(id: string): Promise<void>;
  list(options?: ListOptions): Promise<User[]>;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}
```

### Step 4: Implement Use Case

src/lib/application/use-cases/CreateUser.ts:

```typescript
import type { IUserRepository } from "$lib/domain/repositories/IUserRepository";
import { User } from "$lib/domain/entities/User";

export class CreateUserUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(data: { email: string; name: string }): Promise<User> {
    const existingUser = await this.userRepository.findByEmail(data.email);
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    const userResult = User.create(data);
    if (!userResult.ok) {
      throw userResult.error;
    }

    return await this.userRepository.create(userResult.value);
  }
}
```

### Step 5: Implement SurrealDB Connection and Repository

src/lib/infrastructure/persistence/surrealdb/connection.ts:

```typescript
import Surreal from "surrealdb";
import {
  PRIVATE_SURREALDB_URL,
  PRIVATE_SURREALDB_NAMESPACE,
  PRIVATE_SURREALDB_DATABASE,
} from "$env/static/private";

export const config = {
  url: PRIVATE_SURREALDB_URL || "http://127.0.0.1:8000/rpc",
  namespace: PRIVATE_SURREALDB_NAMESPACE || "production",
  database: PRIVATE_SURREALDB_DATABASE || "main",
};

export async function createConnection(): Promise<Surreal> {
  const db = new Surreal();
  await db.connect(config.url, {
    namespace: config.namespace,
    database: config.database,
  });
  return db;
}
```

src/lib/infrastructure/persistence/surrealdb/SurrealUserRepository.ts:

```typescript
import type { Surreal } from "surrealdb";
import { RecordId } from "surrealdb";
import type {
  IUserRepository,
  ListOptions,
} from "$lib/domain/repositories/IUserRepository";
import { User } from "$lib/domain/entities/User";

interface DbUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export class SurrealUserRepository implements IUserRepository {
  constructor(private readonly db: Surreal) {}

  async create(user: User): Promise<User> {
    const result = await this.db.query<[DbUser[]]>(
      `CREATE user CONTENT {
        email: $email,
        name: $name,
        created_at: time::now()
      }`,
      {
        email: user.email,
        name: user.name,
      },
    );

    if (!result[0]?.result?.[0]) {
      throw new Error("Failed to create user");
    }

    return User.fromDb(result[0].result[0]);
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.db.query<[DbUser[]]>("SELECT * FROM $userId", {
      userId: new RecordId("user", id),
    });

    const user = result[0]?.result?.[0];
    return user ? User.fromDb(user) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.query<[DbUser[]]>(
      "SELECT * FROM user WHERE email = $email LIMIT 1",
      { email },
    );

    const user = result[0]?.result?.[0];
    return user ? User.fromDb(user) : null;
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    const result = await this.db.query<[DbUser[]]>(
      "UPDATE $userId MERGE $data RETURN AFTER",
      {
        userId: new RecordId("user", id),
        data: {
          ...(data.email && { email: data.email }),
          ...(data.name && { name: data.name }),
        },
      },
    );

    if (!result[0]?.result?.[0]) {
      throw new Error("Failed to update user");
    }

    return User.fromDb(result[0].result[0]);
  }

  async delete(id: string): Promise<void> {
    await this.db.query("DELETE $userId", { userId: new RecordId("user", id) });
  }

  async list(options: ListOptions = {}): Promise<User[]> {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const result = await this.db.query<[DbUser[]]>(
      "SELECT * FROM user ORDER BY created_at DESC LIMIT $limit START $offset",
      { limit, offset },
    );

    return (result[0]?.result || []).map(User.fromDb);
  }
}
```

### Step 6: Setup SvelteKit Hooks

src/app.d.ts:

```typescript
import type { Surreal } from "surrealdb";
import type { IUserRepository } from "$lib/domain/repositories/IUserRepository";

declare global {
  namespace App {
    interface Locals {
      db: Surreal;
      repositories: {
        user: IUserRepository;
      };
      user?: {
        id: string;
        email: string;
      };
    }

    interface PageData {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

export {};
```

src/hooks.server.ts:

```typescript
import type { Handle } from "@sveltejs/kit";
import {
  createConnection,
  config,
} from "$lib/infrastructure/persistence/surrealdb/connection";
import { SurrealUserRepository } from "$lib/infrastructure/persistence/surrealdb/SurrealUserRepository";
import { sequence } from "@sveltejs/kit/hooks";

const handleDatabase: Handle = async ({ event, resolve }) => {
  const db = await createConnection(config);

  event.locals.db = db;
  event.locals.repositories = {
    user: new SurrealUserRepository(db),
  };

  const response = await resolve(event);

  await db.close();

  return response;
};

const handleAuth: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get("auth_token");

  if (token) {
    try {
      await event.locals.db.authenticate(token);
      event.locals.user = await event.locals.db.info();
    } catch (error) {
      console.error("Authentication failed:", error);
      event.cookies.delete("auth_token", { path: "/" });
    }
  }

  return resolve(event);
};

export const handle = sequence(handleDatabase, handleAuth);
```

### Step 7: Create SvelteKit Routes

src/routes/users/+page.server.ts:

```typescript
import type { PageServerLoad, Actions } from "./$types";
import { CreateUserUseCase } from "$lib/application/use-cases/CreateUser";
import { fail } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals }) => {
  const users = await locals.repositories.user.list({ limit: 20 });
  return { users };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const formData = await request.formData();
    const email = formData.get("email");
    const name = formData.get("name");

    if (typeof email !== "string" || typeof name !== "string") {
      return fail(400, { error: "Invalid form data" });
    }

    try {
      const createUser = new CreateUserUseCase(locals.repositories.user);
      const user = await createUser.execute({ email, name });
      return { success: true, user };
    } catch (err) {
      return fail(400, {
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
};
```

## Configuration

.env:

```
PRIVATE_SURREALDB_URL=http://127.0.0.1:8000/rpc
PRIVATE_SURREALDB_NAMESPACE=production
PRIVATE_SURREALDB_DATABASE=main
```

schema.surql:

```surrealql
DEFINE TABLE user SCHEMAFULL;
DEFINE FIELD name ON user TYPE string;
DEFINE FIELD email ON user TYPE string ASSERT string::is_email($value);
DEFINE FIELD created_at ON user TYPE datetime;
DEFINE INDEX email ON user FIELDS email UNIQUE;
```

## Key Dependencies

package.json:

```json
{
  "dependencies": {
    "@sveltejs/kit": "^2.0.0",
    "svelte": "^5.0.0",
    "surrealdb": "^1.0.0"
  },
  "devDependencies": {
    "@sveltejs/adapter-auto": "^3.0.0",
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}
```

## Supporting Files

For detailed information on specific topics:

- **[IMPLEMENTATION.md](IMPLEMENTATION.md)** - Complete layer-by-layer implementation guide with advanced patterns
- **[REALTIME.md](REALTIME.md)** - Live queries, real-time subscriptions, and reactive stores
- **[GRAPH.md](GRAPH.md)** - Graph relations, traversal patterns, and multi-hop queries
- **[TESTING.md](TESTING.md)** - Testing strategies, security best practices, and validation

## Key Principles

1. **Domain Independence**: Business logic has no framework dependencies
2. **Dependency Inversion**: Infrastructure depends on domain, not vice versa
3. **Testability**: Each layer tested independently with mocks
4. **Flexibility**: Swap databases, frameworks without touching business logic
5. **Security First**: Validate at boundaries, use parameterized queries
6. **Multi-Model Flexibility**: Leverage document, graph, and key-value patterns as needed
7. **Type Safety**: Full TypeScript support with strict typing

## Benefits

- Framework-agnostic business logic
- Easy to test and maintain
- Simple to swap implementations
- Clear separation of concerns
- Technology-independent domain model
- Multi-model data support (document, graph, key-value, time-series)
- Real-time subscriptions built-in
- Graph traversal and relationships
- Type-safe queries and entities
- Progressive enhancement with SvelteKit

## Production Considerations

- **Connection Management**: Create single connection per request in hooks.server.ts
- **Error Handling**: Wrap database operations in try-catch blocks
- **Validation**: Always validate user input at domain boundaries
- **Authentication**: Use SurrealDB's built-in authentication system
- **Security**: Never expose database credentials in client-side code
- **Monitoring**: Log database errors and performance metrics
