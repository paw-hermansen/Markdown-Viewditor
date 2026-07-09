# Svelte 5 Components Guide

Deep dive into Svelte 5 components, runes, snippets, and advanced patterns.

## Table of Contents

- [Runes](#runes)
- [Snippets](#snippets)
- [Component Composition](#component-composition)
- [Advanced Patterns](#advanced-patterns)
- [Migration from Svelte 4](#migration-from-svelte-4)

## Runes

### $state - Fine-Grained Reactivity

Basic reactive state:

```svelte
<script lang="ts">
let count = $state(0);
let name = $state('');
</script>
```

Object and array state:

```svelte
<script lang="ts">
let user = $state({
    name: 'Alice',
    email: 'alice@example.com',
    preferences: {
        theme: 'dark',
        notifications: true
    }
});

let items = $state<string[]>([]);

function addItem(item: string) {
    items.push(item);
}

function updateTheme(theme: string) {
    user.preferences.theme = theme;
}
</script>
```

$state.raw for non-reactive objects:

```svelte
<script lang="ts">
let data = $state.raw({
    large: 'dataset',
    that: 'should not',
    be: 'reactive'
});
</script>
```

$state.snapshot for getting current state:

```svelte
<script lang="ts">
let items = $state([1, 2, 3]);

function logSnapshot() {
    const snapshot = $state.snapshot(items);
    console.log(snapshot);
}
</script>
```

### $derived - Computed Values

Simple derivations:

```svelte
<script lang="ts">
let count = $state(0);
let doubled = $derived(count * 2);
let isEven = $derived(count % 2 === 0);
</script>
```

Complex derivations:

```svelte
<script lang="ts">
interface User {
    firstName: string;
    lastName: string;
    email: string;
}

let user = $state<User>({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com'
});

let fullName = $derived(`${user.firstName} ${user.lastName}`);
let initials = $derived(
    user.firstName[0]?.toUpperCase() + user.lastName[0]?.toUpperCase()
);
let domain = $derived(user.email.split('@')[1]);
</script>
```

$derived.by for complex logic:

```svelte
<script lang="ts">
let numbers = $state([1, 2, 3, 4, 5]);

let stats = $derived.by(() => {
    const sum = numbers.reduce((a, b) => a + b, 0);
    const avg = sum / numbers.length;
    const max = Math.max(...numbers);
    const min = Math.min(...numbers);

    return { sum, avg, max, min };
});
</script>

<p>Sum: {stats.sum}</p>
<p>Average: {stats.avg}</p>
<p>Max: {stats.max}</p>
<p>Min: {stats.min}</p>
```

### $effect - Side Effects

Basic effects:

```svelte
<script lang="ts">
let count = $state(0);

$effect(() => {
    console.log(`Count is now ${count}`);
});
</script>
```

Effects with cleanup:

```svelte
<script lang="ts">
let active = $state(true);

$effect(() => {
    if (!active) return;

    const interval = setInterval(() => {
        console.log('tick');
    }, 1000);

    return () => {
        clearInterval(interval);
        console.log('cleaned up');
    };
});
</script>
```

DOM effects:

```svelte
<script lang="ts">
let element = $state<HTMLElement>();
let width = $state(0);

$effect(() => {
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
        width = entries[0].contentRect.width;
    });

    observer.observe(element);

    return () => observer.disconnect();
});
</script>

<div bind:this={element}>Width: {width}px</div>
```

$effect.pre - Before DOM update:

```svelte
<script lang="ts">
let items = $state([1, 2, 3]);
let previousLength = $state(0);

$effect.pre(() => {
    previousLength = items.length;
});

$effect(() => {
    if (items.length > previousLength) {
        console.log('Items added');
    }
});
</script>
```

$effect.root - Manual effect lifecycle:

```svelte
<script lang="ts">
import { $effect } from 'svelte';

let count = $state(0);
let cleanup: (() => void) | undefined;

function startTracking() {
    cleanup = $effect.root(() => {
        $effect(() => {
            console.log(`Count: ${count}`);
        });
    });
}

function stopTracking() {
    cleanup?.();
}
</script>
```

### $props - Component Props

Basic props:

```svelte
<script lang="ts">
interface Props {
    title: string;
    description?: string;
}

let { title, description = 'No description' }: Props = $props();
</script>

<h1>{title}</h1>
<p>{description}</p>
```

Props with callbacks:

```svelte
<script lang="ts">
interface Props {
    items: string[];
    onAdd?: (item: string) => void;
    onRemove?: (index: number) => void;
}

let { items, onAdd, onRemove }: Props = $props();

function handleAdd() {
    onAdd?.('New item');
}

function handleRemove(index: number) {
    onRemove?.(index);
}
</script>
```

Rest props:

```svelte
<script lang="ts">
interface Props {
    title: string;
    [key: string]: any;
}

let { title, ...rest }: Props = $props();
</script>

<div {...rest}>
    <h1>{title}</h1>
</div>
```

### $bindable - Two-Way Binding

```svelte
<script lang="ts">
interface Props {
    value: string;
}

let { value = $bindable() }: Props = $props();
</script>

<input type="text" bind:value />
```

Usage:

```svelte
<script lang="ts">
import Input from './Input.svelte';

let text = $state('');
</script>

<Input bind:value={text} />
<p>You typed: {text}</p>
```

## Snippets

### Basic Snippets

```svelte
<script lang="ts">
let items = $state(['Apple', 'Banana', 'Cherry']);
</script>

{#snippet item(text: string)}
    <li class="item">{text}</li>
{/snippet}

<ul>
    {#each items as item}
        {@render item(item)}
    {/each}
</ul>
```

### Snippets with Multiple Parameters

```svelte
{#snippet card(title: string, description: string, icon?: string)}
    <div class="card">
        {#if icon}
            <span class="icon">{icon}</span>
        {/if}
        <h3>{title}</h3>
        <p>{description}</p>
    </div>
{/snippet}

{@render card('Welcome', 'Get started here', '👋')}
{@render card('Features', 'Explore our features')}
```

### Snippets as Props

Component.svelte:

```svelte
<script lang="ts">
import type { Snippet } from 'svelte';

interface Props {
    header?: Snippet;
    footer?: Snippet<[string]>;
    items: string[];
}

let { header, footer, items }: Props = $props();
</script>

<div class="container">
    {#if header}
        {@render header()}
    {/if}

    <ul>
        {#each items as item}
            <li>{item}</li>
        {/each}
    </ul>

    {#if footer}
        {@render footer('Made with Svelte')}
    {/if}
</div>
```

Usage:

```svelte
<script lang="ts">
import Component from './Component.svelte';

let items = $state(['One', 'Two', 'Three']);
</script>

<Component {items}>
    {#snippet header()}
        <h1>My List</h1>
    {/snippet}

    {#snippet footer(text: string)}
        <footer>{text}</footer>
    {/snippet}
</Component>
```

### Conditional Snippets

```svelte
<script lang="ts">
import type { Snippet } from 'svelte';

interface Props {
    loading?: Snippet;
    error?: Snippet<[Error]>;
    success?: Snippet<[Data]>;
    data?: Data;
    isLoading: boolean;
    error?: Error;
}

let { loading, error, success, data, isLoading, error: errorState }: Props = $props();
</script>

{#if isLoading && loading}
    {@render loading()}
{:else if errorState && error}
    {@render error(errorState)}
{:else if data && success}
    {@render success(data)}
{/if}
```

## Component Composition

### Wrapper Components

```svelte
<script lang="ts">
import type { Snippet } from 'svelte';

interface Props {
    title: string;
    children: Snippet;
}

let { title, children }: Props = $props();
</script>

<div class="panel">
    <header>
        <h2>{title}</h2>
    </header>
    <div class="content">
        {@render children()}
    </div>
</div>
```

### Component with Multiple Slots

```svelte
<script lang="ts">
import type { Snippet } from 'svelte';

interface Props {
    header?: Snippet;
    sidebar?: Snippet;
    children: Snippet;
    footer?: Snippet;
}

let { header, sidebar, children, footer }: Props = $props();
</script>

<div class="layout">
    {#if header}
        <header>{@render header()}</header>
    {/if}

    <div class="main">
        {#if sidebar}
            <aside>{@render sidebar()}</aside>
        {/if}
        <main>{@render children()}</main>
    </div>

    {#if footer}
        <footer>{@render footer()}</footer>
    {/if}
</div>
```

### Higher-Order Components

```svelte
<script lang="ts">
import type { ComponentType } from 'svelte';

interface Props {
    component: ComponentType;
    props: Record<string, any>;
}

let { component: Component, props }: Props = $props();

let isVisible = $state(true);
</script>

{#if isVisible}
    <Component {...props} />
{/if}

<button onclick={() => isVisible = !isVisible}>
    Toggle
</button>
```

## Advanced Patterns

### Store-like State Management

```svelte
<script lang="ts" context="module">
function createCounter(initial = 0) {
    let count = $state(initial);

    return {
        get count() { return count; },
        increment: () => count++,
        decrement: () => count--,
        reset: () => count = initial
    };
}
</script>

<script lang="ts">
let counter = createCounter(0);
</script>

<button onclick={counter.decrement}>-</button>
<span>{counter.count}</span>
<button onclick={counter.increment}>+</button>
<button onclick={counter.reset}>Reset</button>
```

### Context API

Parent.svelte:

```svelte
<script lang="ts">
import { setContext } from 'svelte';
import type { Snippet } from 'svelte';

interface Props {
    children: Snippet;
}

let { children }: Props = $props();

interface AppContext {
    theme: string;
    setTheme: (theme: string) => void;
}

let theme = $state('light');

setContext<AppContext>('app', {
    get theme() { return theme; },
    setTheme: (newTheme: string) => theme = newTheme
});
</script>

<div class="app" class:dark={theme === 'dark'}>
    {@render children()}
</div>
```

Child.svelte:

```svelte
<script lang="ts">
import { getContext } from 'svelte';

interface AppContext {
    theme: string;
    setTheme: (theme: string) => void;
}

const { theme, setTheme } = getContext<AppContext>('app');
</script>

<p>Current theme: {theme}</p>
<button onclick={() => setTheme('dark')}>Dark</button>
<button onclick={() => setTheme('light')}>Light</button>
```

### Custom Event Dispatching

```svelte
<script lang="ts">
import { createEventDispatcher } from 'svelte';

const dispatch = createEventDispatcher<{
    submit: { email: string; password: string };
    cancel: never;
}>();

let email = $state('');
let password = $state('');

function handleSubmit() {
    dispatch('submit', { email, password });
}
</script>

<form onsubmit={handleSubmit}>
    <input type="email" bind:value={email} />
    <input type="password" bind:value={password} />
    <button type="submit">Submit</button>
    <button type="button" onclick={() => dispatch('cancel')}>Cancel</button>
</form>
```

### Portals (Teleporting Elements)

```svelte
<script lang="ts">
import { onMount } from 'svelte';
import type { Snippet } from 'svelte';

interface Props {
    target?: string;
    children: Snippet;
}

let { target = 'body', children }: Props = $props();

let container = $state<HTMLElement>();

onMount(() => {
    const targetEl = document.querySelector(target);
    if (targetEl && container) {
        targetEl.appendChild(container);

        return () => {
            if (container && targetEl.contains(container)) {
                targetEl.removeChild(container);
            }
        };
    }
});
</script>

<div bind:this={container}>
    {@render children()}
</div>
```

### Lazy Loading Components

```svelte
<script lang="ts">
import { onMount } from 'svelte';
import type { ComponentType } from 'svelte';

let HeavyComponent = $state<ComponentType>();

onMount(async () => {
    const module = await import('./HeavyComponent.svelte');
    HeavyComponent = module.default;
});
</script>

{#if HeavyComponent}
    <HeavyComponent />
{:else}
    <p>Loading...</p>
{/if}
```

## Migration from Svelte 4

### Reactive Statements → $derived

Svelte 4:

```svelte
<script>
let count = 0;
$: doubled = count * 2;
</script>
```

Svelte 5:

```svelte
<script>
let count = $state(0);
let doubled = $derived(count * 2);
</script>
```

### Reactive Blocks → $effect

Svelte 4:

```svelte
<script>
let count = 0;
$: {
    console.log(count);
    document.title = `Count: ${count}`;
}
</script>
```

Svelte 5:

```svelte
<script>
let count = $state(0);

$effect(() => {
    console.log(count);
    document.title = `Count: ${count}`;
});
</script>
```

### export let → $props

Svelte 4:

```svelte
<script>
export let title;
export let description = 'Default';
</script>
```

Svelte 5:

```svelte
<script>
let { title, description = 'Default' } = $props();
</script>
```

### Slots → Snippets

Svelte 4:

```svelte
<div class="card">
    <slot name="header" />
    <slot />
    <slot name="footer" />
</div>
```

Svelte 5:

```svelte
<script>
let { header, children, footer } = $props();
</script>

<div class="card">
    {#if header}{@render header()}{/if}
    {@render children()}
    {#if footer}{@render footer()}{/if}
</div>
```
