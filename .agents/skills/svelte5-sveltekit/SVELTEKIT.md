# SvelteKit Complete Guide

Complete guide to SvelteKit routing, data loading, hooks, and deployment.

## Table of Contents

- [Routing](#routing)
- [Data Loading](#data-loading)
- [Form Actions](#form-actions)
- [Hooks](#hooks)
- [Error Handling](#error-handling)
- [API Routes](#api-routes)
- [Authentication](#authentication)
- [Deployment](#deployment)

## Routing

### File-Based Routing

```
src/routes/
├── +page.svelte                 # /
├── about/+page.svelte           # /about
├── blog/
│   ├── +page.svelte            # /blog
│   └── [slug]/
│       ├── +page.svelte        # /blog/my-post
│       └── +page.ts            # Load function
├── api/
│   └── posts/
│       └── +server.ts          # /api/posts
└── (auth)/
    ├── login/+page.svelte      # /login (grouped route)
    └── register/+page.svelte   # /register
```

### Dynamic Routes

src/routes/users/[id]/+page.svelte:

```svelte
<script lang="ts">
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();
</script>

<h1>{data.user.name}</h1>
<p>{data.user.email}</p>
```

src/routes/users/[id]/+page.ts:

```typescript
import type { PageLoad } from "./$types";
import { error } from "@sveltejs/kit";

export const load: PageLoad = async ({ params, fetch }) => {
  const response = await fetch(`/api/users/${params.id}`);

  if (!response.ok) {
    throw error(404, "User not found");
  }

  return {
    user: await response.json(),
  };
};
```

### Optional Parameters

src/routes/[[lang]]/+page.svelte:

```svelte
<script lang="ts">
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();
</script>

<h1>Language: {data.lang ?? 'en'}</h1>
```

### Rest Parameters

src/routes/docs/[...path]/+page.svelte:

```svelte
<script lang="ts">
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();
</script>

<h1>Docs: {data.path}</h1>
```

src/routes/docs/[...path]/+page.ts:

```typescript
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params }) => {
  return {
    path: params.path,
  };
};
```

### Route Groups (Layout without segment)

```
src/routes/
├── (marketing)/
│   ├── +layout.svelte          # Layout for marketing pages
│   ├── +page.svelte            # /
│   └── about/+page.svelte      # /about
└── (app)/
    ├── +layout.svelte          # Layout for app pages
    └── dashboard/+page.svelte  # /dashboard
```

### Route Matching

src/params/uuid.ts:

```typescript
import type { ParamMatcher } from "@sveltejs/kit";

export const match: ParamMatcher = (param) => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
    param,
  );
};
```

src/routes/users/[id=uuid]/+page.svelte:

```svelte
<script lang="ts">
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();
</script>

<p>Valid UUID: {data.id}</p>
```

## Data Loading

### Universal Load Functions (+page.ts)

Runs on both server and client:

```typescript
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, params }) => {
  const response = await fetch(`/api/posts/${params.id}`);
  const post = await response.json();

  return { post };
};
```

### Server Load Functions (+page.server.ts)

Runs only on server, has access to server-only APIs:

```typescript
import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.user) {
    throw redirect(302, "/login");
  }

  const posts = await locals.db.post.findMany({
    where: { authorId: locals.user.id },
  });

  return { posts };
};
```

### Layout Load Functions

src/routes/+layout.server.ts:

```typescript
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    user: locals.user ?? null,
  };
};
```

### Parent Data Access

src/routes/dashboard/+layout.server.ts:

```typescript
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    settings: await locals.db.settings.findUnique({
      where: { userId: locals.user.id },
    }),
  };
};
```

src/routes/dashboard/profile/+page.server.ts:

```typescript
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ parent }) => {
  const { user, settings } = await parent();

  return {
    user,
    settings,
    profile: await fetchProfile(user.id),
  };
};
```

### Streaming with Promises

```typescript
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch }) => {
  return {
    posts: fetch("/api/posts").then((r) => r.json()),
    users: fetch("/api/users").then((r) => r.json()),
    stats: fetch("/api/stats").then((r) => r.json()),
  };
};
```

Component usage:

```svelte
<script lang="ts">
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();
</script>

{#await data.posts}
    <p>Loading posts...</p>
{:then posts}
    {#each posts as post}
        <article>{post.title}</article>
    {/each}
{/await}
```

## Form Actions

### Single Action

src/routes/login/+page.server.ts:

```typescript
import type { Actions } from "./$types";
import { fail, redirect } from "@sveltejs/kit";

export const actions: Actions = {
  default: async ({ request, cookies, locals }) => {
    const data = await request.formData();
    const email = data.get("email");
    const password = data.get("password");

    if (!email || typeof email !== "string") {
      return fail(400, { error: "Email is required" });
    }

    if (!password || typeof password !== "string") {
      return fail(400, { error: "Password is required" });
    }

    const user = await locals.db.user.findUnique({
      where: { email },
    });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return fail(401, { error: "Invalid credentials" });
    }

    const session = await createSession(user.id);
    cookies.set("session", session.id, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 7,
    });

    throw redirect(302, "/dashboard");
  },
};
```

### Multiple Named Actions

src/routes/settings/+page.server.ts:

```typescript
import type { Actions, PageServerLoad } from "./$types";
import { fail } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals }) => {
  return {
    user: locals.user,
  };
};

export const actions: Actions = {
  updateProfile: async ({ request, locals }) => {
    const data = await request.formData();
    const name = data.get("name");

    if (!name || typeof name !== "string") {
      return fail(400, { error: "Name is required" });
    }

    await locals.db.user.update({
      where: { id: locals.user.id },
      data: { name },
    });

    return { success: true };
  },

  updatePassword: async ({ request, locals }) => {
    const data = await request.formData();
    const currentPassword = data.get("currentPassword");
    const newPassword = data.get("newPassword");

    if (!currentPassword || typeof currentPassword !== "string") {
      return fail(400, { error: "Current password is required" });
    }

    if (
      !newPassword ||
      typeof newPassword !== "string" ||
      newPassword.length < 8
    ) {
      return fail(400, { error: "New password must be at least 8 characters" });
    }

    const user = await locals.db.user.findUnique({
      where: { id: locals.user.id },
    });

    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      return fail(401, { error: "Invalid current password" });
    }

    const newHash = await hashPassword(newPassword);

    await locals.db.user.update({
      where: { id: locals.user.id },
      data: { passwordHash: newHash },
    });

    return { success: true };
  },

  deleteAccount: async ({ locals, cookies }) => {
    await locals.db.user.delete({
      where: { id: locals.user.id },
    });

    cookies.delete("session", { path: "/" });

    throw redirect(302, "/");
  },
};
```

Component with named actions:

```svelte
<script lang="ts">
import { enhance } from '$app/forms';
import type { PageData, ActionData } from './$types';

let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<form method="POST" action="?/updateProfile" use:enhance>
    <input type="text" name="name" value={data.user.name} required />

    {#if form?.error}
        <p class="error">{form.error}</p>
    {/if}

    <button type="submit">Update Profile</button>
</form>

<form method="POST" action="?/updatePassword" use:enhance>
    <input type="password" name="currentPassword" required />
    <input type="password" name="newPassword" required />

    {#if form?.error}
        <p class="error">{form.error}</p>
    {/if}

    <button type="submit">Update Password</button>
</form>
```

### Progressive Enhancement

```svelte
<script lang="ts">
import { enhance } from '$app/forms';
import type { ActionData } from './$types';

let { form }: { form: ActionData } = $props();
let loading = $state(false);
</script>

<form
    method="POST"
    use:enhance={() => {
        loading = true;

        return async ({ result, update }) => {
            loading = false;

            if (result.type === 'success') {
                console.log('Success!');
            }

            await update();
        };
    }}
>
    <input type="email" name="email" required disabled={loading} />
    <button type="submit" disabled={loading}>
        {loading ? 'Submitting...' : 'Submit'}
    </button>
</form>
```

## Hooks

### Server Hooks (src/hooks.server.ts)

```typescript
import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";

const authentication: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get("session");

  if (sessionId) {
    const session = await getSession(sessionId);

    if (session) {
      event.locals.user = await getUser(session.userId);
    }
  }

  return resolve(event);
};

const authorization: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith("/admin")) {
    if (!event.locals.user?.isAdmin) {
      throw redirect(302, "/");
    }
  }

  return resolve(event);
};

const logging: Handle = async ({ event, resolve }) => {
  const start = Date.now();
  const response = await resolve(event);
  const duration = Date.now() - start;

  console.log(
    `${event.request.method} ${event.url.pathname} ${response.status} ${duration}ms`,
  );

  return response;
};

export const handle = sequence(authentication, authorization, logging);
```

### Client Hooks (src/hooks.client.ts)

```typescript
import type { HandleClientError } from "@sveltejs/kit";

export const handleError: HandleClientError = ({ error, event }) => {
  console.error("Client error:", error, event);

  return {
    message: "An error occurred",
  };
};
```

### Server Error Hook

```typescript
import type { HandleServerError } from "@sveltejs/kit";

export const handleServerError: HandleServerError = ({ error, event }) => {
  console.error("Server error:", error);

  return {
    message: "Internal server error",
    code: error?.code ?? "UNKNOWN",
  };
};
```

### handleFetch Hook

```typescript
import type { HandleFetch } from "@sveltejs/kit";

export const handleFetch: HandleFetch = async ({ request, fetch, event }) => {
  if (request.url.startsWith("https://api.example.com/")) {
    request.headers.set("Authorization", `Bearer ${event.locals.token}`);
  }

  return fetch(request);
};
```

## Error Handling

### Error Pages

src/routes/+error.svelte:

```svelte
<script lang="ts">
import { page } from '$app/stores';
</script>

<h1>{$page.status}: {$page.error?.message}</h1>

{#if $page.status === 404}
    <p>Page not found</p>
{:else if $page.status === 500}
    <p>Internal server error</p>
{:else}
    <p>An error occurred</p>
{/if}

<a href="/">Go home</a>
```

### Throwing Errors

```typescript
import { error } from "@sveltejs/kit";

export const load = async ({ params }) => {
  if (!params.id) {
    throw error(400, "ID is required");
  }

  const item = await fetchItem(params.id);

  if (!item) {
    throw error(404, {
      message: "Item not found",
      details: `No item with ID ${params.id}`,
    });
  }

  return { item };
};
```

### Expected Errors

```typescript
import { error, fail } from "@sveltejs/kit";

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();

    if (!data.get("email")) {
      return fail(400, { error: "Email is required" });
    }

    try {
      await sendEmail(data.get("email"));
      return { success: true };
    } catch (err) {
      return fail(500, { error: "Failed to send email" });
    }
  },
};
```

## API Routes

### REST API

src/routes/api/posts/+server.ts:

```typescript
import type { RequestHandler } from "./$types";
import { json, error } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ url, locals }) => {
  const page = Number(url.searchParams.get("page")) || 1;
  const limit = Number(url.searchParams.get("limit")) || 10;

  if (limit > 100) {
    throw error(400, "Limit cannot exceed 100");
  }

  const posts = await locals.db.post.findMany({
    take: limit,
    skip: (page - 1) * limit,
    orderBy: { createdAt: "desc" },
  });

  const total = await locals.db.post.count();

  return json({
    posts,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json();

  if (!body.title || !body.content) {
    throw error(400, "Title and content are required");
  }

  const post = await locals.db.post.create({
    data: {
      title: body.title,
      content: body.content,
      authorId: locals.user.id,
    },
  });

  return json(post, { status: 201 });
};
```

### Middleware Pattern

src/lib/server/middleware.ts:

```typescript
import { error } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";

export function requireAuth(event: RequestEvent) {
  if (!event.locals.user) {
    throw error(401, "Unauthorized");
  }
}

export function requireAdmin(event: RequestEvent) {
  requireAuth(event);

  if (!event.locals.user.isAdmin) {
    throw error(403, "Forbidden");
  }
}

export async function validateBody<T>(
  request: Request,
  schema: (data: any) => T,
): Promise<T> {
  const body = await request.json();

  try {
    return schema(body);
  } catch (err) {
    throw error(400, "Invalid request body");
  }
}
```

Usage:

```typescript
import { requireAuth, validateBody } from "$lib/server/middleware";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, locals, ...event }) => {
  requireAuth({ locals, ...event });

  const body = await validateBody(request, (data) => {
    if (!data.title) throw new Error("Title required");
    return data;
  });

  const post = await locals.db.post.create({ data: body });

  return json(post, { status: 201 });
};
```

## Authentication

### Session-Based Auth

src/lib/server/auth.ts:

```typescript
import { randomBytes } from "crypto";
import { promisify } from "util";

const randomBytesAsync = promisify(randomBytes);

export async function createSession(userId: string) {
  const sessionId = (await randomBytesAsync(32)).toString("hex");

  await db.session.create({
    data: {
      id: sessionId,
      userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return sessionId;
}

export async function getSession(sessionId: string) {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session;
}

export async function deleteSession(sessionId: string) {
  await db.session.delete({
    where: { id: sessionId },
  });
}
```

src/hooks.server.ts:

```typescript
import type { Handle } from "@sveltejs/kit";
import { getSession } from "$lib/server/auth";

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get("session");

  if (sessionId) {
    const session = await getSession(sessionId);

    if (session) {
      event.locals.user = session.user;
    }
  }

  return resolve(event);
};
```

## Deployment

### Adapters

Install adapter:

```bash
npm install -D @sveltejs/adapter-vercel
npm install -D @sveltejs/adapter-node
npm install -D @sveltejs/adapter-static
npm install -D @sveltejs/adapter-cloudflare
```

svelte.config.js:

```javascript
import adapter from "@sveltejs/adapter-vercel";

export default {
  kit: {
    adapter: adapter(),
  },
};
```

### Environment Variables

.env:

```
DATABASE_URL=postgresql://localhost:5432/mydb
SECRET_KEY=your-secret-key
```

src/lib/server/env.ts:

```typescript
import { env } from "$env/dynamic/private";

export const DATABASE_URL = env.DATABASE_URL;
export const SECRET_KEY = env.SECRET_KEY;
```

### Static Site Generation

src/routes/blog/+page.ts:

```typescript
export const prerender = true;
```

svelte.config.js for full static site:

```javascript
import adapter from "@sveltejs/adapter-static";

export default {
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: undefined,
      precompress: false,
      strict: true,
    }),
  },
};
```
