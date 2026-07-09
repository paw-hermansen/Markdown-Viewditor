# Testing and Security Guide

Testing strategies and security best practices for Svelte 5 and SvelteKit applications.

## Table of Contents

- [Unit Testing](#unit-testing)
- [Component Testing](#component-testing)
- [Integration Testing](#integration-testing)
- [E2E Testing](#e2e-testing)
- [Security Best Practices](#security-best-practices)

## Unit Testing

### Setup Vitest

vite.config.ts:

```typescript
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ["src/**/*.{test,spec}.{js,ts}"],
    environment: "jsdom",
    globals: true,
  },
});
```

### Testing Utilities

src/lib/utils/validation.ts:

```typescript
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

export function sanitizeHtml(html: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
  };
  return html.replace(/[&<>"']/g, (char) => map[char]);
}
```

src/lib/utils/validation.test.ts:

```typescript
import { describe, it, expect } from "vitest";
import { isValidEmail, isStrongPassword, sanitizeHtml } from "./validation";

describe("isValidEmail", () => {
  it("accepts valid emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("name.surname@company.co.uk")).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(isValidEmail("invalid")).toBe(false);
    expect(isValidEmail("missing@domain")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
  });
});

describe("isStrongPassword", () => {
  it("accepts strong passwords", () => {
    expect(isStrongPassword("Passw0rd")).toBe(true);
    expect(isStrongPassword("MyP@ssw0rd123")).toBe(true);
  });

  it("rejects weak passwords", () => {
    expect(isStrongPassword("short")).toBe(false);
    expect(isStrongPassword("alllowercase123")).toBe(false);
    expect(isStrongPassword("ALLUPPERCASE123")).toBe(false);
    expect(isStrongPassword("NoNumbers")).toBe(false);
  });
});

describe("sanitizeHtml", () => {
  it("escapes HTML entities", () => {
    expect(sanitizeHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );

    expect(sanitizeHtml("A & B")).toBe("A &amp; B");
    expect(sanitizeHtml("It's working")).toBe("It&#x27;s working");
  });
});
```

## Component Testing

### Testing Svelte Components

src/lib/components/Counter.svelte:

```svelte
<script lang="ts">
interface Props {
    initial?: number;
    onUpdate?: (value: number) => void;
}

let { initial = 0, onUpdate }: Props = $props();

let count = $state(initial);

function increment() {
    count++;
    onUpdate?.(count);
}

function decrement() {
    count--;
    onUpdate?.(count);
}
</script>

<div>
    <button onclick={decrement} data-testid="decrement">-</button>
    <span data-testid="count">{count}</span>
    <button onclick={increment} data-testid="increment">+</button>
</div>
```

src/lib/components/Counter.test.ts:

```typescript
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import Counter from "./Counter.svelte";

describe("Counter", () => {
  it("renders with initial value", () => {
    render(Counter, { props: { initial: 5 } });
    expect(screen.getByTestId("count")).toHaveTextContent("5");
  });

  it("increments count", async () => {
    render(Counter);
    const incrementButton = screen.getByTestId("increment");

    await fireEvent.click(incrementButton);

    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  it("decrements count", async () => {
    render(Counter, { props: { initial: 5 } });
    const decrementButton = screen.getByTestId("decrement");

    await fireEvent.click(decrementButton);

    expect(screen.getByTestId("count")).toHaveTextContent("4");
  });

  it("calls onUpdate callback", async () => {
    const onUpdate = vi.fn();
    render(Counter, { props: { onUpdate } });

    const incrementButton = screen.getByTestId("increment");
    await fireEvent.click(incrementButton);

    expect(onUpdate).toHaveBeenCalledWith(1);
  });
});
```

### Testing Forms

src/lib/components/LoginForm.svelte:

```svelte
<script lang="ts">
interface Props {
    onSubmit: (email: string, password: string) => void;
}

let { onSubmit }: Props = $props();

let email = $state('');
let password = $state('');
let error = $state('');

function handleSubmit() {
    if (!email.includes('@')) {
        error = 'Invalid email';
        return;
    }

    if (password.length < 8) {
        error = 'Password must be at least 8 characters';
        return;
    }

    error = '';
    onSubmit(email, password);
}
</script>

<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
    <input
        type="email"
        bind:value={email}
        placeholder="Email"
        data-testid="email"
    />
    <input
        type="password"
        bind:value={password}
        placeholder="Password"
        data-testid="password"
    />

    {#if error}
        <p data-testid="error">{error}</p>
    {/if}

    <button type="submit" data-testid="submit">Login</button>
</form>
```

src/lib/components/LoginForm.test.ts:

```typescript
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import LoginForm from "./LoginForm.svelte";

describe("LoginForm", () => {
  it("shows error for invalid email", async () => {
    const onSubmit = vi.fn();
    render(LoginForm, { props: { onSubmit } });

    await fireEvent.input(screen.getByTestId("email"), {
      target: { value: "invalid" },
    });
    await fireEvent.input(screen.getByTestId("password"), {
      target: { value: "password123" },
    });
    await fireEvent.click(screen.getByTestId("submit"));

    expect(screen.getByTestId("error")).toHaveTextContent("Invalid email");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows error for short password", async () => {
    const onSubmit = vi.fn();
    render(LoginForm, { props: { onSubmit } });

    await fireEvent.input(screen.getByTestId("email"), {
      target: { value: "user@example.com" },
    });
    await fireEvent.input(screen.getByTestId("password"), {
      target: { value: "short" },
    });
    await fireEvent.click(screen.getByTestId("submit"));

    expect(screen.getByTestId("error")).toHaveTextContent(
      "at least 8 characters",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits valid credentials", async () => {
    const onSubmit = vi.fn();
    render(LoginForm, { props: { onSubmit } });

    await fireEvent.input(screen.getByTestId("email"), {
      target: { value: "user@example.com" },
    });
    await fireEvent.input(screen.getByTestId("password"), {
      target: { value: "password123" },
    });
    await fireEvent.click(screen.getByTestId("submit"));

    expect(onSubmit).toHaveBeenCalledWith("user@example.com", "password123");
  });
});
```

## Integration Testing

### Testing Load Functions

src/routes/posts/[id]/+page.server.test.ts:

```typescript
import { describe, it, expect, vi } from "vitest";
import { load } from "./+page.server";

vi.mock("$lib/server/db", () => ({
  db: {
    post: {
      findUnique: vi.fn(),
    },
  },
}));

describe("Post page load", () => {
  it("loads post successfully", async () => {
    const mockPost = {
      id: "1",
      title: "Test Post",
      content: "Content",
    };

    const { db } = await import("$lib/server/db");
    vi.mocked(db.post.findUnique).mockResolvedValue(mockPost);

    const result = await load({
      params: { id: "1" },
      locals: {} as any,
    } as any);

    expect(result).toEqual({ post: mockPost });
  });

  it("throws 404 for missing post", async () => {
    const { db } = await import("$lib/server/db");
    vi.mocked(db.post.findUnique).mockResolvedValue(null);

    await expect(
      load({ params: { id: "999" }, locals: {} as any } as any),
    ).rejects.toThrow();
  });
});
```

### Testing Actions

src/routes/settings/+page.server.test.ts:

```typescript
import { describe, it, expect, vi } from "vitest";
import { actions } from "./+page.server";

describe("Settings actions", () => {
  it("updates profile with valid data", async () => {
    const formData = new FormData();
    formData.append("name", "John Doe");

    const mockLocals = {
      user: { id: "1" },
      db: {
        user: {
          update: vi.fn().mockResolvedValue({}),
        },
      },
    };

    const result = await actions.updateProfile({
      request: { formData: () => Promise.resolve(formData) } as any,
      locals: mockLocals as any,
    } as any);

    expect(result).toEqual({ success: true });
    expect(mockLocals.db.user.update).toHaveBeenCalledWith({
      where: { id: "1" },
      data: { name: "John Doe" },
    });
  });

  it("fails with missing name", async () => {
    const formData = new FormData();

    const result = await actions.updateProfile({
      request: { formData: () => Promise.resolve(formData) } as any,
      locals: {} as any,
    } as any);

    expect(result).toHaveProperty("status", 400);
  });
});
```

## E2E Testing

### Playwright Setup

playwright.config.ts:

```typescript
import type { PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = {
  webServer: {
    command: "npm run build && npm run preview",
    port: 4173,
  },
  testDir: "tests",
  testMatch: /(.+\.)?(test|spec)\.[jt]s/,
};

export default config;
```

### E2E Test Example

tests/auth.test.ts:

```typescript
import { expect, test } from "@playwright/test";

test.describe("Authentication", () => {
  test("user can register", async ({ page }) => {
    await page.goto("/register");

    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "Password123");
    await page.fill('[name="confirmPassword"]', "Password123");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL("/dashboard");
    await expect(page.locator("h1")).toContainText("Dashboard");
  });

  test("user can login", async ({ page }) => {
    await page.goto("/login");

    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "Password123");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL("/dashboard");
  });

  test("user can logout", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "Password123");
    await page.click('button[type="submit"]');

    await page.click('button:has-text("Logout")');

    await expect(page).toHaveURL("/");
  });

  test("shows error for invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.fill('[name="email"]', "wrong@example.com");
    await page.fill('[name="password"]', "wrongpassword");
    await page.click('button[type="submit"]');

    await expect(page.locator(".error")).toContainText("Invalid credentials");
  });
});
```

### Testing Protected Routes

tests/protected.test.ts:

```typescript
import { expect, test } from "@playwright/test";

test("redirects to login when not authenticated", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/login");
});

test("can access protected route when authenticated", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "session",
      value: "valid-session-token",
      domain: "localhost",
      path: "/",
    },
  ]);

  await page.goto("/dashboard");
  await expect(page).toHaveURL("/dashboard");
  await expect(page.locator("h1")).toContainText("Dashboard");
});
```

## Security Best Practices

### Input Validation

Always validate user input on the server:

```typescript
import { fail } from "@sveltejs/kit";
import type { Actions } from "./$types";

export const actions: Actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    const email = data.get("email");
    const age = data.get("age");

    if (!email || typeof email !== "string") {
      return fail(400, { error: "Email is required" });
    }

    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return fail(400, { error: "Invalid email format" });
    }

    if (email.length > 254) {
      return fail(400, { error: "Email too long" });
    }

    if (age && (typeof age !== "string" || !/^\d+$/.test(age))) {
      return fail(400, { error: "Age must be a number" });
    }

    const ageNum = age ? parseInt(age, 10) : null;
    if (ageNum !== null && (ageNum < 0 || ageNum > 150)) {
      return fail(400, { error: "Invalid age" });
    }
  },
};
```

### XSS Prevention

Always sanitize HTML and use `{@html}` sparingly:

```svelte
<script lang="ts">
import DOMPurify from 'isomorphic-dompurify';

let { html }: { html: string } = $props();

let sanitized = $derived(DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
    ALLOWED_ATTR: []
}));
</script>

{@html sanitized}
```

### CSRF Protection

SvelteKit includes CSRF protection by default for form actions. For API endpoints:

```typescript
import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";

export const POST: RequestHandler = async ({ request, cookies }) => {
  const csrfToken = request.headers.get("x-csrf-token");
  const storedToken = cookies.get("csrf-token");

  if (!csrfToken || csrfToken !== storedToken) {
    throw error(403, "Invalid CSRF token");
  }
};
```

### SQL Injection Prevention

Always use parameterized queries:

```typescript
const userId = params.id;

const user = await db.user.findUnique({
  where: { id: userId },
});
```

Never concatenate SQL:

```typescript
const query = `SELECT * FROM users WHERE id = ${userId}`;
```

### Authentication Security

src/lib/server/password.ts:

```typescript
import { hash, verify } from "@node-rs/argon2";

const hashingConfig = {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, hashingConfig);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return verify(hash, password);
}
```

### Secure Cookie Settings

```typescript
import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
  const session = await authenticate(event);

  if (session) {
    event.cookies.set("session", session.id, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return resolve(event);
};
```

### Rate Limiting

```typescript
import type { Handle } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";

const requests = new Map<string, number[]>();

function rateLimit(ip: string, maxRequests = 100, windowMs = 60000): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;

  const userRequests = requests.get(ip) || [];
  const recentRequests = userRequests.filter((time) => time > windowStart);

  if (recentRequests.length >= maxRequests) {
    return false;
  }

  recentRequests.push(now);
  requests.set(ip, recentRequests);

  return true;
}

export const handle: Handle = async ({ event, resolve }) => {
  const ip = event.getClientAddress();

  if (!rateLimit(ip)) {
    throw error(429, "Too many requests");
  }

  return resolve(event);
};
```

### Content Security Policy

src/hooks.server.ts:

```typescript
import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';",
  );

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()",
  );

  return response;
};
```

### Environment Variables

Never expose secrets to the client:

```typescript
import { SECRET_API_KEY } from "$env/static/private";

export async function load() {
  const data = await fetch("https://api.example.com", {
    headers: {
      Authorization: `Bearer ${SECRET_API_KEY}`,
    },
  });

  return { data };
}
```

### Dependency Security

```bash
npm audit
npm audit fix
```

Keep dependencies updated:

```bash
npm outdated
npm update
```
