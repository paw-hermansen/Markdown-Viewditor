# Testing Strategies and Security Best Practices

Complete guide to testing and security for SvelteKit applications with SurrealDB using hexagonal architecture.

## Table of Contents

- [Unit Testing](#unit-testing)
- [Integration Testing](#integration-testing)
- [End-to-End Testing](#end-to-end-testing)
- [Security Best Practices](#security-best-practices)
- [Input Validation](#input-validation)
- [Authentication & Authorization](#authentication--authorization)
- [Performance & Monitoring](#performance--monitoring)

## Unit Testing

### Domain Entity Tests

src/lib/domain/entities/User.test.ts:

```typescript
import { describe, it, expect } from "vitest";
import { User, ValidationError } from "./User";

describe("User Entity", () => {
  describe("create", () => {
    it("should create a valid user", () => {
      const result = User.create({
        email: "test@example.com",
        name: "Test User",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.email).toBe("test@example.com");
        expect(result.value.name).toBe("Test User");
      }
    });

    it("should reject invalid email", () => {
      const result = User.create({
        email: "invalid-email",
        name: "Test User",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ValidationError);
        expect(result.error.message).toContain("email");
      }
    });

    it("should reject short name", () => {
      const result = User.create({
        email: "test@example.com",
        name: "A",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("2-100 characters");
      }
    });

    it("should reject long name", () => {
      const result = User.create({
        email: "test@example.com",
        name: "A".repeat(101),
      });

      expect(result.ok).toBe(false);
    });
  });

  describe("fromDb", () => {
    it("should create user from database record", () => {
      const dbUser = {
        id: "user:123",
        email: "test@example.com",
        name: "Test User",
        created_at: "2024-01-01T00:00:00Z",
      };

      const user = User.fromDb(dbUser);

      expect(user.id).toBe("user:123");
      expect(user.email).toBe("test@example.com");
      expect(user.name).toBe("Test User");
    });
  });
});
```

### Use Case Tests

src/lib/application/use-cases/CreateUser.test.ts:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { CreateUserUseCase } from "./CreateUser";
import type { IUserRepository } from "$lib/domain/repositories/IUserRepository";
import { User } from "$lib/domain/entities/User";

describe("CreateUserUseCase", () => {
  let mockRepository: IUserRepository;
  let useCase: CreateUserUseCase;

  beforeEach(() => {
    mockRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      findByEmail: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    };

    useCase = new CreateUserUseCase(mockRepository);
  });

  it("should create a new user", async () => {
    const userData = {
      email: "test@example.com",
      name: "Test User",
    };

    vi.mocked(mockRepository.findByEmail).mockResolvedValue(null);

    const userResult = User.create(userData);
    if (!userResult.ok) throw new Error("Invalid user data");

    vi.mocked(mockRepository.create).mockResolvedValue(userResult.value);

    const result = await useCase.execute(userData);

    expect(result.email).toBe(userData.email);
    expect(mockRepository.findByEmail).toHaveBeenCalledWith(userData.email);
    expect(mockRepository.create).toHaveBeenCalled();
  });

  it("should throw error if email already exists", async () => {
    const userData = {
      email: "existing@example.com",
      name: "Test User",
    };

    const existingUser = User.create(userData);
    if (!existingUser.ok) throw new Error("Invalid user data");

    vi.mocked(mockRepository.findByEmail).mockResolvedValue(existingUser.value);

    await expect(useCase.execute(userData)).rejects.toThrow("already exists");
    expect(mockRepository.create).not.toHaveBeenCalled();
  });

  it("should throw validation error for invalid data", async () => {
    const userData = {
      email: "invalid-email",
      name: "Test User",
    };

    vi.mocked(mockRepository.findByEmail).mockResolvedValue(null);

    await expect(useCase.execute(userData)).rejects.toThrow(ValidationError);
  });
});
```

## Integration Testing

### Repository Integration Tests

src/lib/infrastructure/persistence/surrealdb/SurrealUserRepository.test.ts:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { SurrealUserRepository } from "./SurrealUserRepository";
import { User } from "$lib/domain/entities/User";
import Surreal from "surrealdb";

describe("SurrealUserRepository Integration", () => {
  let db: Surreal;
  let repository: SurrealUserRepository;

  beforeAll(async () => {
    db = new Surreal();
    await db.connect("http://127.0.0.1:8000/rpc", {
      namespace: "test",
      database: "test",
    });

    repository = new SurrealUserRepository(db);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.query("DELETE user");
  });

  it("should create a user", async () => {
    const userResult = User.create({
      email: "test@example.com",
      name: "Test User",
    });

    if (!userResult.ok) throw new Error("Invalid user data");

    const created = await repository.create(userResult.value);

    expect(created.id).toBeDefined();
    expect(created.email).toBe("test@example.com");
    expect(created.name).toBe("Test User");
  });

  it("should find user by id", async () => {
    const userResult = User.create({
      email: "test@example.com",
      name: "Test User",
    });

    if (!userResult.ok) throw new Error("Invalid user data");

    const created = await repository.create(userResult.value);
    const found = await repository.findById(created.id.split(":")[1]);

    expect(found).not.toBeNull();
    expect(found?.email).toBe("test@example.com");
  });

  it("should find user by email", async () => {
    const userResult = User.create({
      email: "test@example.com",
      name: "Test User",
    });

    if (!userResult.ok) throw new Error("Invalid user data");

    await repository.create(userResult.value);
    const found = await repository.findByEmail("test@example.com");

    expect(found).not.toBeNull();
    expect(found?.name).toBe("Test User");
  });

  it("should update a user", async () => {
    const userResult = User.create({
      email: "test@example.com",
      name: "Test User",
    });

    if (!userResult.ok) throw new Error("Invalid user data");

    const created = await repository.create(userResult.value);
    const updated = await repository.update(created.id.split(":")[1], {
      name: "Updated Name",
    });

    expect(updated.name).toBe("Updated Name");
  });

  it("should delete a user", async () => {
    const userResult = User.create({
      email: "test@example.com",
      name: "Test User",
    });

    if (!userResult.ok) throw new Error("Invalid user data");

    const created = await repository.create(userResult.value);
    await repository.delete(created.id.split(":")[1]);

    const found = await repository.findById(created.id.split(":")[1]);
    expect(found).toBeNull();
  });

  it("should list users with pagination", async () => {
    for (let i = 0; i < 5; i++) {
      const userResult = User.create({
        email: `test${i}@example.com`,
        name: `Test User ${i}`,
      });

      if (!userResult.ok) throw new Error("Invalid user data");
      await repository.create(userResult.value);
    }

    const users = await repository.list({ limit: 3, offset: 0 });
    expect(users).toHaveLength(3);
  });
});
```

### API Route Tests

src/routes/api/users/+server.test.ts:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { GET, POST } from "./+server";

describe("/api/users", () => {
  describe("GET", () => {
    it("should return paginated users", async () => {
      const mockLocals = {
        db: createMockDb(),
      };

      const request = new Request("http://localhost/api/users?page=1&limit=10");
      const response = await GET({
        url: new URL(request.url),
        locals: mockLocals,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty("users");
      expect(data).toHaveProperty("page");
    });

    it("should reject limit > 100", async () => {
      const mockLocals = {
        db: createMockDb(),
      };

      const request = new Request("http://localhost/api/users?limit=101");

      await expect(
        GET({
          url: new URL(request.url),
          locals: mockLocals,
        }),
      ).rejects.toThrow();
    });
  });

  describe("POST", () => {
    it("should create a new user", async () => {
      const mockLocals = {
        db: createMockDb(),
      };

      const request = new Request("http://localhost/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          name: "Test User",
        }),
      });

      const response = await POST({
        request,
        locals: mockLocals,
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.email).toBe("test@example.com");
    });

    it("should reject invalid data", async () => {
      const mockLocals = {
        db: createMockDb(),
      };

      const request = new Request("http://localhost/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test User",
        }),
      });

      await expect(
        POST({
          request,
          locals: mockLocals,
        }),
      ).rejects.toThrow();
    });
  });
});

function createMockDb() {
  return {
    query: vi.fn(),
    select: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    close: vi.fn(),
  };
}
```

## End-to-End Testing

### Playwright Tests

tests/e2e/users.spec.ts:

```typescript
import { test, expect } from "@playwright/test";

test.describe("User Management", () => {
  test("should create a new user", async ({ page }) => {
    await page.goto("/users");

    await page.fill('input[name="email"]', "test@example.com");
    await page.fill('input[name="name"]', "Test User");

    await page.click('button[type="submit"]');

    await expect(page.locator(".success")).toBeVisible();
    await expect(page.locator("text=Test User")).toBeVisible();
  });

  test("should show validation error for invalid email", async ({ page }) => {
    await page.goto("/users");

    await page.fill('input[name="email"]', "invalid-email");
    await page.fill('input[name="name"]', "Test User");

    await page.click('button[type="submit"]');

    await expect(page.locator(".error")).toBeVisible();
  });

  test("should display user list", async ({ page }) => {
    await page.goto("/users");

    await expect(page.locator("ul li")).toHaveCount.greaterThan(0);
  });
});
```

### Component Tests

src/lib/components/UserForm.test.ts:

```typescript
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import UserForm from "./UserForm.svelte";

describe("UserForm", () => {
  it("should render form fields", () => {
    const { getByLabelText } = render(UserForm);

    expect(getByLabelText("Email")).toBeTruthy();
    expect(getByLabelText("Name")).toBeTruthy();
  });

  it("should call onSubmit with form data", async () => {
    let submittedData: any = null;

    const { getByLabelText, getByRole } = render(UserForm, {
      onSubmit: (data: any) => {
        submittedData = data;
      },
    });

    await fireEvent.input(getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });

    await fireEvent.input(getByLabelText("Name"), {
      target: { value: "Test User" },
    });

    await fireEvent.click(getByRole("button"));

    expect(submittedData).toEqual({
      email: "test@example.com",
      name: "Test User",
    });
  });
});
```

## Security Best Practices

### Input Validation

src/lib/domain/validation/InputValidator.ts:

```typescript
export class InputValidator {
  static validateEmail(email: string): { valid: boolean; error?: string } {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return { valid: false, error: "Invalid email format" };
    }

    if (email.length > 255) {
      return { valid: false, error: "Email must be less than 255 characters" };
    }

    return { valid: true };
  }

  static validatePassword(password: string): {
    valid: boolean;
    error?: string;
  } {
    if (password.length < 8) {
      return { valid: false, error: "Password must be at least 8 characters" };
    }

    if (password.length > 128) {
      return {
        valid: false,
        error: "Password must be less than 128 characters",
      };
    }

    if (!/[A-Z]/.test(password)) {
      return {
        valid: false,
        error: "Password must contain at least one uppercase letter",
      };
    }

    if (!/[a-z]/.test(password)) {
      return {
        valid: false,
        error: "Password must contain at least one lowercase letter",
      };
    }

    if (!/[0-9]/.test(password)) {
      return {
        valid: false,
        error: "Password must contain at least one number",
      };
    }

    if (!/[!@#$%^&*]/.test(password)) {
      return {
        valid: false,
        error: "Password must contain at least one special character",
      };
    }

    return { valid: true };
  }

  static sanitizeString(input: string, maxLength: number = 1000): string {
    return input.trim().slice(0, maxLength);
  }

  static validateUsername(username: string): {
    valid: boolean;
    error?: string;
  } {
    if (username.length < 3) {
      return { valid: false, error: "Username must be at least 3 characters" };
    }

    if (username.length > 50) {
      return {
        valid: false,
        error: "Username must be less than 50 characters",
      };
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return {
        valid: false,
        error:
          "Username can only contain letters, numbers, underscores, and hyphens",
      };
    }

    return { valid: true };
  }

  static validateUrl(url: string): { valid: boolean; error?: string } {
    try {
      new URL(url);
      return { valid: true };
    } catch {
      return { valid: false, error: "Invalid URL format" };
    }
  }

  static sanitizeHtml(html: string): string {
    return html
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;");
  }
}
```

### SQL Injection Prevention

src/lib/infrastructure/persistence/surrealdb/SecureQueries.ts:

```typescript
import type { Surreal } from "surrealdb";
import { RecordId } from "surrealdb";

export class SecureQueries {
  constructor(private readonly db: Surreal) {}

  async safeUserQuery(email: string): Promise<any[]> {
    const result = await this.db.query(
      "SELECT * FROM user WHERE email = $email",
      { email },
    );
    return result[0]?.result || [];
  }

  async safeCreate(userData: { name: string; email: string }): Promise<any> {
    const result = await this.db.query("CREATE user CONTENT $userData", {
      userData,
    });
    return result[0]?.result?.[0];
  }

  async safeRecordIdQuery(table: string, id: string): Promise<any> {
    const result = await this.db.query("SELECT * FROM $recordId", {
      recordId: new RecordId(table, id),
    });
    return result[0]?.result?.[0];
  }

  async safeArrayQuery(ids: string[]): Promise<any[]> {
    const result = await this.db.query("SELECT * FROM user WHERE id IN $ids", {
      ids,
    });
    return result[0]?.result || [];
  }
}
```

## Authentication & Authorization

### Rate Limiting

src/lib/infrastructure/middleware/rateLimit.ts:

```typescript
import { error } from "@sveltejs/kit";

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

export function rateLimit(
  identifier: string,
  maxRequests: number = 100,
  windowMs: number = 60000,
): void {
  const now = Date.now();
  const record = store[identifier];

  if (!record || now > record.resetTime) {
    store[identifier] = {
      count: 1,
      resetTime: now + windowMs,
    };
    return;
  }

  if (record.count >= maxRequests) {
    throw error(429, "Too many requests");
  }

  record.count++;
}
```

### CSRF Protection

src/hooks.server.ts (with CSRF):

```typescript
import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { randomBytes } from "crypto";

const handleCsrf: Handle = async ({ event, resolve }) => {
  if (event.request.method === "GET") {
    const token = randomBytes(32).toString("hex");
    event.locals.csrfToken = token;
    event.cookies.set("csrf_token", token, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    });
  } else {
    const cookieToken = event.cookies.get("csrf_token");
    const headerToken = event.request.headers.get("x-csrf-token");

    if (!cookieToken || cookieToken !== headerToken) {
      throw error(403, "Invalid CSRF token");
    }
  }

  return resolve(event);
};

export const handle = sequence(handleCsrf, handleDatabase, handleAuth);
```

### Permission Checking

src/lib/infrastructure/auth/PermissionChecker.ts:

```typescript
import { error } from "@sveltejs/kit";

export interface User {
  id: string;
  email: string;
  role: "admin" | "user" | "guest";
}

export class PermissionChecker {
  static requireAuth(user?: User): User {
    if (!user) {
      throw error(401, "Unauthorized");
    }
    return user;
  }

  static requireAdmin(user?: User): User {
    this.requireAuth(user);
    if (user!.role !== "admin") {
      throw error(403, "Forbidden: Admin access required");
    }
    return user!;
  }

  static requireRole(user: User | undefined, roles: string[]): User {
    this.requireAuth(user);
    if (!roles.includes(user!.role)) {
      throw error(403, `Forbidden: Required roles: ${roles.join(", ")}`);
    }
    return user!;
  }

  static canAccessResource(user: User, resourceOwnerId: string): boolean {
    return user.role === "admin" || user.id === resourceOwnerId;
  }
}
```

Usage in routes:

```typescript
import { PermissionChecker } from "$lib/infrastructure/auth/PermissionChecker";

export const GET: RequestHandler = async ({ locals, params }) => {
  PermissionChecker.requireAuth(locals.user);

  const product = await repository.findById(params.id);

  if (!PermissionChecker.canAccessResource(locals.user, product.ownerId)) {
    throw error(403, "Cannot access this resource");
  }

  return json(product);
};
```

## Performance & Monitoring

### Query Performance Monitoring

src/lib/infrastructure/monitoring/QueryMonitor.ts:

```typescript
import type { Surreal } from "surrealdb";

export class QueryMonitor {
  private queryTimes: Map<string, number[]> = new Map();

  async monitoredQuery<T>(
    db: Surreal,
    queryName: string,
    query: string,
    params?: Record<string, any>,
  ): Promise<T> {
    const start = performance.now();

    try {
      const result = await db.query<[T]>(query, params);
      const duration = performance.now() - start;

      this.recordQueryTime(queryName, duration);

      if (duration > 1000) {
        console.warn(`Slow query detected: ${queryName} took ${duration}ms`);
      }

      return result[0]?.result as T;
    } catch (error) {
      console.error(`Query failed: ${queryName}`, error);
      throw error;
    }
  }

  private recordQueryTime(queryName: string, duration: number): void {
    if (!this.queryTimes.has(queryName)) {
      this.queryTimes.set(queryName, []);
    }

    const times = this.queryTimes.get(queryName)!;
    times.push(duration);

    if (times.length > 100) {
      times.shift();
    }
  }

  getAverageQueryTime(queryName: string): number {
    const times = this.queryTimes.get(queryName);
    if (!times || times.length === 0) return 0;

    return times.reduce((a, b) => a + b, 0) / times.length;
  }

  getStats(): Record<string, { avg: number; count: number }> {
    const stats: Record<string, { avg: number; count: number }> = {};

    for (const [name, times] of this.queryTimes.entries()) {
      stats[name] = {
        avg: this.getAverageQueryTime(name),
        count: times.length,
      };
    }

    return stats;
  }
}
```

### Error Tracking

src/lib/infrastructure/monitoring/ErrorTracker.ts:

```typescript
export interface ErrorReport {
  message: string;
  stack?: string;
  context: Record<string, any>;
  timestamp: Date;
}

export class ErrorTracker {
  private errors: ErrorReport[] = [];

  trackError(error: Error, context: Record<string, any> = {}): void {
    const report: ErrorReport = {
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date(),
    };

    this.errors.push(report);

    console.error("Error tracked:", report);
  }

  getRecentErrors(count: number = 10): ErrorReport[] {
    return this.errors.slice(-count);
  }

  clearErrors(): void {
    this.errors = [];
  }
}
```

### Health Check Endpoint

src/routes/api/health/+server.ts:

```typescript
import type { RequestHandler } from "./$types";
import { json } from "@sveltejs/kit";
import Surreal from "surrealdb";
import { config } from "$lib/infrastructure/persistence/surrealdb/connection";

export const GET: RequestHandler = async () => {
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      database: "unknown",
    },
  };

  try {
    const db = new Surreal();
    await db.connect(config.url, {
      namespace: config.namespace,
      database: config.database,
    });

    await db.query("SELECT 1");
    health.services.database = "healthy";
    await db.close();
  } catch (error) {
    health.status = "unhealthy";
    health.services.database = "unhealthy";
  }

  return json(health, {
    status: health.status === "healthy" ? 200 : 503,
  });
};
```
