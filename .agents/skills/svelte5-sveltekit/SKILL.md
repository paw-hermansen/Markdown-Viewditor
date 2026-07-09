# Svelte 5 and SvelteKit Development

Guides you through building modern web applications with Svelte 5 and SvelteKit. Focuses on runes, snippets, type safety, and SvelteKit's full-stack capabilities.

## When to Use This Skill

- Building new SvelteKit applications
- Creating Svelte 5 components with runes
- Implementing data loading and form actions
- Building API endpoints
- Adding type-safe routing and navigation
- Migrating from Svelte 4 to Svelte 5
- Integrating Bits UI components (see BITS-UI.md)

## Project Structure

```
src/
├── lib/
│   ├── components/      # Reusable Svelte components
│   ├── server/          # Server-only code
│   └── utils/           # Shared utilities
├── routes/
│   ├── +page.svelte     # Route component
│   ├── +page.ts         # Load function (client & server)
│   ├── +page.server.ts  # Server-only load & actions
│   ├── +layout.svelte   # Layout component
│   ├── +layout.ts       # Layout load function
│   └── api/             # API endpoints
│       └── +server.ts   # API route handler
└── app.html             # HTML template
```

## Quick Start

### Svelte 5 Runes

#### $state - Reactive State

```svelte
<script lang="ts">
let count = $state(0);
let user = $state({ name: '', email: '' });

function increment() {
    count++;
}

function updateName(name: string) {
    user.name = name;
}
</script>

<button onclick={increment}>
    Clicks: {count}
</button>

<input
    type="text"
    value={user.name}
    oninput={(e) => updateName(e.currentTarget.value)}
>
```

#### $derived - Computed Values

```svelte
<script lang="ts">
let count = $state(0);
let doubled = $derived(count * 2);
let message = $derived(count > 10 ? 'High' : 'Low');
</script>

<p>Count: {count}, Doubled: {doubled}, Status: {message}</p>
```

#### $effect - Side Effects

```svelte
<script lang="ts">
let count = $state(0);

$effect(() => {
    console.log(`Count changed to ${count}`);
    document.title = `Count: ${count}`;
});

$effect(() => {
    const interval = setInterval(() => count++, 1000);
    return () => clearInterval(interval);
});
</script>
```

#### $props - Component Props

```svelte
<script lang="ts">
interface Props {
    title: string;
    count?: number;
    onUpdate?: (value: number) => void;
}

let { title, count = 0, onUpdate }: Props = $props();

function handleClick() {
    onUpdate?.(count + 1);
}
</script>

<h1>{title}</h1>
<button onclick={handleClick}>Count: {count}</button>
```

### Snippets - Reusable Markup

```svelte
<script lang="ts">
let items = $state(['Apple', 'Banana', 'Cherry']);
</script>

{#snippet card(title: string, content: string)}
    <div class="card">
        <h3>{title}</h3>
        <p>{content}</p>
    </div>
{/snippet}

{#snippet listItem(item: string, index: number)}
    <li>{index + 1}. {item}</li>
{/snippet}

<div>
    {@render card('Welcome', 'This is a reusable card')}
    {@render card('Another', 'Cards are snippets')}
</div>

<ul>
    {#each items as item, i}
        {@render listItem(item, i)}
    {/each}
</ul>
```

### SvelteKit Routing

#### Basic Page - src/routes/+page.svelte

```svelte
<script lang="ts">
let count = $state(0);
</script>

<h1>Home Page</h1>
<button onclick={() => count++}>Count: {count}</button>
```

#### Dynamic Route - src/routes/blog/[slug]/+page.svelte

```svelte
<script lang="ts">
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();
</script>

<article>
    <h1>{data.post.title}</h1>
    <div>{@html data.post.content}</div>
</article>
```

#### Dynamic Route Load - src/routes/blog/[slug]/+page.ts

```typescript
import type { PageLoad } from "./$types";
import { error } from "@sveltejs/kit";

export const load: PageLoad = async ({ params, fetch }) => {
  const response = await fetch(`/api/posts/${params.slug}`);

  if (!response.ok) {
    throw error(404, "Post not found");
  }

  const post = await response.json();

  return {
    post,
  };
};
```

### Data Loading

#### Server Load Function - src/routes/dashboard/+page.server.ts

```typescript
import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    throw redirect(302, "/login");
  }

  const users = await locals.db.user.findMany({
    where: { active: true },
    select: { id: true, name: true, email: true },
  });

  return {
    user: locals.user,
    users,
  };
};
```

### Form Actions

#### Server Actions - src/routes/settings/+page.server.ts

```typescript
import type { Actions, PageServerLoad } from "./$types";
import { fail } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals }) => {
  return {
    settings: await locals.db.settings.findUnique({
      where: { userId: locals.user.id },
    }),
  };
};

export const actions: Actions = {
  update: async ({ request, locals }) => {
    const data = await request.formData();
    const name = data.get("name");
    const email = data.get("email");

    if (!name || typeof name !== "string") {
      return fail(400, { error: "Name is required" });
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return fail(400, { error: "Valid email is required" });
    }

    await locals.db.user.update({
      where: { id: locals.user.id },
      data: { name, email },
    });

    return { success: true };
  },
};
```

#### Form Component - src/routes/settings/+page.svelte

```svelte
<script lang="ts">
import { enhance } from '$app/forms';
import type { PageData, ActionData } from './$types';

let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<form method="POST" action="?/update" use:enhance>
    <input
        type="text"
        name="name"
        value={data.settings?.name ?? ''}
        required
    />

    <input
        type="email"
        name="email"
        value={data.settings?.email ?? ''}
        required
    />

    {#if form?.error}
        <p class="error">{form.error}</p>
    {/if}

    {#if form?.success}
        <p class="success">Settings updated!</p>
    {/if}

    <button type="submit">Save</button>
</form>
```

### API Endpoints

#### REST API - src/routes/api/users/+server.ts

```typescript
import type { RequestHandler } from "./$types";
import { json, error } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ locals, url }) => {
  const limit = Number(url.searchParams.get("limit")) || 10;
  const offset = Number(url.searchParams.get("offset")) || 0;

  if (limit > 100) {
    throw error(400, "Limit cannot exceed 100");
  }

  const users = await locals.db.user.findMany({
    take: limit,
    skip: offset,
    select: { id: true, name: true, email: true },
  });

  return json({ users, limit, offset });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json();

  if (!body.email || !body.email.includes("@")) {
    throw error(400, "Valid email is required");
  }

  const user = await locals.db.user.create({
    data: {
      email: body.email,
      name: body.name,
    },
  });

  return json(user, { status: 201 });
};
```

#### Dynamic API Route - src/routes/api/users/[id]/+server.ts

```typescript
import type { RequestHandler } from "./$types";
import { json, error } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = await locals.db.user.findUnique({
    where: { id: params.id },
  });

  if (!user) {
    throw error(404, "User not found");
  }

  return json(user);
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const body = await request.json();

  const user = await locals.db.user.update({
    where: { id: params.id },
    data: body,
  });

  return json(user);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  await locals.db.user.delete({
    where: { id: params.id },
  });

  return json({ success: true });
};
```

### Layouts

#### Root Layout - src/routes/+layout.svelte

```svelte
<script lang="ts">
import type { LayoutData } from './$types';

let { data, children }: { data: LayoutData; children: any } = $props();
</script>

<nav>
    <a href="/">Home</a>
    <a href="/about">About</a>
    {#if data.user}
        <a href="/dashboard">Dashboard</a>
        <form method="POST" action="/logout">
            <button type="submit">Logout</button>
        </form>
    {:else}
        <a href="/login">Login</a>
    {/if}
</nav>

<main>
    {@render children()}
</main>
```

#### Nested Layout - src/routes/dashboard/+layout.svelte

```svelte
<script lang="ts">
import type { LayoutData } from './$types';

let { data, children }: { data: LayoutData; children: any } = $props();
</script>

<div class="dashboard">
    <aside>
        <nav>
            <a href="/dashboard">Overview</a>
            <a href="/dashboard/users">Users</a>
            <a href="/dashboard/settings">Settings</a>
        </nav>
    </aside>

    <div class="content">
        {@render children()}
    </div>
</div>
```

## Advanced Patterns

### Type-Safe Event Handlers

```svelte
<script lang="ts">
interface FormElements extends HTMLFormControlsCollection {
    email: HTMLInputElement;
    password: HTMLInputElement;
}

interface LoginFormElement extends HTMLFormElement {
    readonly elements: FormElements;
}

function handleSubmit(event: SubmitEvent & { currentTarget: LoginFormElement }) {
    event.preventDefault();
    const { email, password } = event.currentTarget.elements;
    console.log(email.value, password.value);
}
</script>

<form onsubmit={handleSubmit}>
    <input type="email" name="email" required />
    <input type="password" name="password" required />
    <button type="submit">Login</button>
</form>
```

### Class Directive with State

```svelte
<script lang="ts">
let active = $state(false);
let count = $state(0);
let theme = $state<'light' | 'dark'>('light');
</script>

<button
    class:active
    class:high={count > 10}
    class:dark={theme === 'dark'}
    onclick={() => active = !active}
>
    Toggle
</button>
```

### Binding

```svelte
<script lang="ts">
let value = $state('');
let checked = $state(false);
let selected = $state('');
let group = $state<string[]>([]);

let inputElement = $state<HTMLInputElement>();

$effect(() => {
    inputElement?.focus();
});
</script>

<input type="text" bind:value bind:this={inputElement} />
<input type="checkbox" bind:checked />
<select bind:value={selected}>
    <option value="a">A</option>
    <option value="b">B</option>
</select>

<input type="checkbox" bind:group value="x" />
<input type="checkbox" bind:group value="y" />
```

## Supporting Files

For detailed information on specific topics:

- **COMPONENTS.md** - Deep dive on Svelte 5 components, runes, snippets, and advanced patterns
- **SVELTEKIT.md** - Complete guide to SvelteKit routing, layouts, data loading, hooks, and deployment
- **TESTING.md** - Testing strategies with Vitest, Playwright, and security best practices
- **BITS-UI.md** - Using Bits UI (unstyled, accessible components) with Svelte 5 runes and SvelteKit

## Key Dependencies

```json
{
  "dependencies": {
    "@sveltejs/kit": "^2.0.0",
    "svelte": "^5.0.0"
  },
  "devDependencies": {
    "@sveltejs/adapter-auto": "^3.0.0",
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "vitest": "^2.0.0",
    "@playwright/test": "^1.40.0"
  }
}
```

## Common Commands

```bash
npm create svelte@latest my-app
npm install
npm run dev
npm run build
npm run preview
npm test
npm run test:integration
```
