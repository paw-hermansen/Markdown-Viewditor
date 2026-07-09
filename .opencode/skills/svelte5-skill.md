# Svelte 5 Skill

> Comprehensive Svelte 5 + SvelteKit guide with runes, snippets, and modern patterns.
> Sources: ejirocodes (best practices), JeongHeonK (gotchas), sveltejs/ai-tools (official)

## Critical Rules

### Always Do

- Use `$state()` for reactive state, not plain `let`
- Use `$derived()` for computed values, not `$effect()`
- Use `onclick` not `on:click` (Svelte 5 syntax)
- Use callback props instead of `createEventDispatcher`
- Use snippets with `{@render}` instead of `<slot>`
- Use `$bindable()` for two-way binding props
- Use `Promise.all` for parallel requests in load functions

### Never Do

- Never use `let` without `$state()` for reactive variables
- Never use `$effect()` for derived values (use `$derived()`)
- Never use `on:click` syntax (use `onclick`)
- Never use `createEventDispatcher` (use callback props)
- Never use `<slot>` (use snippets)
- Never forget `$bindable()` when using `bind:`
- Never use module-level state in SSR (causes cross-request leaks)

## Runes

### $state (Reactive State)

```svelte
<script>
  let count = $state(0);
  let user = $state({ name: 'John', age: 30 });
  let items = $state(['a', 'b', 'c']);

  // Mutation works
  function increment() {
    count++;
    user.age++;
    items.push('d');
  }
</script>
```

### $state.raw (Opt-out Deep Reactivity)

```svelte
<script>
  let items = $state.raw([1, 2, 3]);

  // items.push(4) WON'T trigger update
  items = [...items, 4]; // WILL trigger update
</script>
```

### $derived (Computed Values)

```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);

  // Complex derivations
  let filteredItems = $derived.by(() => {
    if (filter === 'even') return items.filter(n => n % 2 === 0);
    return items.filter(n => n % 2 !== 0);
  });
</script>
```

### $effect (Side Effects)

```svelte
<script>
  let count = $state(0);

  $effect(() => {
    console.log('Count changed:', count);
    document.title = `Count is ${count}`;
  });

  // Cleanup
  $effect(() => {
    const interval = setInterval(() => {}, 1000);
    return () => clearInterval(interval);
  });
</script>
```

### $props (Component Props)

```svelte
<script>
  let { name, age = 25, onclick } = $props();
</script>

<div onclick={() => onclick?.()}>
  {name} is {age} years old
</div>
```

### $bindable (Two-Way Binding)

```svelte
<script>
  let { value = $bindable(''), disabled = $bindable(false) } = $props();
</script>

<input bind:value {disabled} />
```

## TypeScript Integration

### Typed Props

```svelte
<script lang="ts">
  interface Props {
    name: string;
    age?: number;
    onclick?: (e: MouseEvent) => void;
  }

  let { name, age = 25, onclick }: Props = $props();
</script>
```

### Generic Components

```svelte
<script lang="ts" generics="T extends { id: string | number }">
  interface Props {
    items: T[];
    selected?: T;
    onSelect: (item: T) => void;
  }

  let { items, selected, onSelect }: Props = $props();
</script>

{#each items as item (item.id)}
  <div
    class:selected={selected?.id === item.id}
    onclick={() => onSelect(item)}
  >
    {item.name}
  </div>
{/each}
```

### Snippet Typing

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    row: Snippet<[data: { id: number; name: string }]>;
  }

  let { children, row }: Props = $props();
</script>

{@render children()}

{#each items as item}
  {@render row(item)}
{/each}
```

## Snippets (Replaces Slots)

### Define Snippet

```svelte
{#snippet header()}
  <h1>Header Content</h1>
{/snippet}

{#snippet item(data: { id: number; name: string })}
  <div>{data.name}</div>
{/snippet}
```

### Render Snippet

```svelte
{@render header()}
{@render item({ id: 1, name: 'Item 1' })}
```

### Component with Snippets

```svelte
<!-- Card.svelte -->
<script>
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    children: Snippet;
    footer?: Snippet;
  }

  let { title, children, footer }: Props = $props();
</script>

<div class="card">
  <h2>{title}</h2>
  <div class="content">{@render children()}</div>
  {#if footer}
    <div class="footer">{@render footer()}</div>
  {/if}
</div>
```

## Event Handling

### Callback Props (Not createEventDispatcher)

```svelte
<script>
  let {
    onclick,
    onsubmit,
    onchange
  } = $props();
</script>

<button onclick={() => onclick?.({ timestamp: Date.now() })}>
  Click
</button>
```

## SvelteKit Integration

### Load Function (Type-Safe)

```typescript
// src/routes/+page.ts
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch("/api/data");
  const data = await response.json();
  return { data };
};
```

### Page Component

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<h1>{data.title}</h1>
```

### Form Actions

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<form method="POST">
  <input name="email" type="email" />
  {#if form?.error}
    <p class="error">{form.error}</p>
  {/if}
  <button type="submit">Submit</button>
</form>
```

### Server Load (Universal)

```typescript
// src/routes/+page.server.ts
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  return {
    user: locals.user,
  };
};
```

## SSR Pitfalls

### Module-Level State (Cross-Request Leak)

```svelte
<!-- WRONG: Module-level state leaks between requests -->
<script context="module">
  let count = 0; // Shared across all requests!
</script>

<!-- CORRECT: Use component-level state -->
<script>
  let count = $state(0); // Isolated per request
</script>
```

### svelte:boundary (Error Boundaries)

```svelte
{#snippet errorComponent(error: Error, reset: () => void)}
  <div class="error">
    <p>{error.message}</p>
    <button onclick={reset}>Try again</button>
  </div>
{/snippet}

<svelte:boundary onerror={errorComponent}>
  <SomeRiskyComponent />
</svelte:boundary>
```

## Common Patterns

### Form with Enhance

```svelte
<script>
  import { enhance } from '$app/forms';
</script>

<form method="POST" use:enhance>
  <!-- form fields -->
</form>
```

### Parallel Load

```typescript
// WRONG: Sequential
export const load = async ({ fetch }) => {
  const users = await fetch("/api/users");
  const posts = await fetch("/api/posts");
  return { users, posts };
};

// CORRECT: Parallel
export const load = async ({ fetch }) => {
  const [users, posts] = await Promise.all([
    fetch("/api/users"),
    fetch("/api/posts"),
  ]);
  return { users, posts };
};
```

### State Isolation

```typescript
// CORRECT: Factory function
export function createCounter(initial = 0) {
  let count = $state(initial);
  return {
    get count() {
      return count;
    },
    increment() {
      count++;
    },
    decrement() {
      count--;
    },
  };
}
```

## Migration from Svelte 4

### Before (Svelte 4)

```svelte
<script>
  export let name;
  $: doubled = count * 2;
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>

<button on:click={() => dispatch('click')}>Click</button>
<slot />
```

### After (Svelte 5)

```svelte
<script>
  let { name, onclick, children } = $props();
  let doubled = $derived(count * 2);
</script>

<button onclick={() => onclick?.()}>Click</button>
{@render children()}
```

## Quick Reference

| Svelte 4                  | Svelte 5                      |
| ------------------------- | ----------------------------- |
| `export let prop`         | `let { prop } = $props()`     |
| `$: derived = ...`        | `let derived = $derived(...)` |
| `on:click`                | `onclick`                     |
| `createEventDispatcher()` | Callback props                |
| `<slot>`                  | `{@render children()}`        |
| `<slot name="foo">`       | `{@render foo()}`             |
| `bind:value`              | `$bindable()` + `bind:value`  |

## Resources

- Official Docs: https://svelte.dev
- SvelteKit: https://kit.svelte.dev
- Migration Guide: https://svelte.dev/docs/svelte/v5-migration-guide
