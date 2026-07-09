# Bits UI Integration with Svelte 5

Complete guide for using Bits UI - an unstyled, accessible component library - with Svelte 5 runes and SvelteKit.

## Overview

Bits UI provides headless, accessible components that follow WAI-ARIA patterns. Combined with Svelte 5's runes, you get powerful, type-safe, reactive UI components with complete styling control.

## Installation

```bash
npm install bits-ui
```

## Core Integration Patterns

### Dialog with Svelte 5 Runes

```svelte
<script lang="ts">
import { Dialog } from 'bits-ui';

let open = $state(false);
let email = $state('');
let errors = $state<Record<string, string>>({});

function validateEmail(value: string): boolean {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(value);
}

function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    errors = {};

    if (!email) {
        errors.email = 'Email is required';
        return;
    }

    if (!validateEmail(email)) {
        errors.email = 'Invalid email format';
        return;
    }

    submitForm({ email });
    open = false;
}

async function submitForm(data: { email: string }) {
    try {
        const response = await fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error('Subscription failed');
        }
    } catch (error) {
        errors.email = 'Failed to subscribe. Please try again.';
    }
}
</script>

<Dialog.Root bind:open>
    <Dialog.Trigger>Subscribe</Dialog.Trigger>
    <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
            <Dialog.Title>Subscribe to Newsletter</Dialog.Title>
            <Dialog.Description>Enter your email to receive updates.</Dialog.Description>

            <form onsubmit={handleSubmit}>
                <label for="email">Email</label>
                <input
                    id="email"
                    type="email"
                    bind:value={email}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                />
                {#if errors.email}
                    <span id="email-error" role="alert">{errors.email}</span>
                {/if}
                <button type="submit">Subscribe</button>
            </form>

            <Dialog.Close>Cancel</Dialog.Close>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>

<style>
    :global([data-dialog-overlay]) {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 50;
    }

    :global([data-dialog-content]) {
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 2rem;
        border-radius: 0.5rem;
        max-width: 28rem;
        width: 90%;
        z-index: 50;
    }

    input[aria-invalid="true"] {
        border-color: #ef4444;
    }

    span[role="alert"] {
        color: #ef4444;
        font-size: 0.875rem;
    }
</style>
```

### Select with Search and $derived

```svelte
<script lang="ts">
import { Select } from 'bits-ui';

interface Country {
    value: string;
    label: string;
}

const countries: Country[] = [
    { value: 'us', label: 'United States' },
    { value: 'ca', label: 'Canada' },
    { value: 'uk', label: 'United Kingdom' },
    { value: 'au', label: 'Australia' },
    { value: 'de', label: 'Germany' },
    { value: 'fr', label: 'France' }
];

let selectedCountry = $state('');
let searchQuery = $state('');

const filteredCountries = $derived(
    countries.filter(c =>
        c.label.toLowerCase().includes(searchQuery.toLowerCase())
    )
);

const selectedLabel = $derived(
    countries.find(c => c.value === selectedCountry)?.label ?? 'Select a country'
);

function handleSelect(value: string | undefined) {
    if (value && countries.some(c => c.value === value)) {
        selectedCountry = value;
    }
}
</script>

<Select.Root selected={{ value: selectedCountry }} onSelectedChange={(v) => handleSelect(v?.value)}>
    <Select.Trigger aria-label="Select country">
        <Select.Value placeholder="Select a country">
            {selectedLabel}
        </Select.Value>
    </Select.Trigger>

    <Select.Portal>
        <Select.Content>
            <Select.Input bind:value={searchQuery} placeholder="Search countries..." />
            <Select.Viewport>
                {#each filteredCountries as country (country.value)}
                    <Select.Item value={country.value}>
                        <Select.ItemText>{country.label}</Select.ItemText>
                    </Select.Item>
                {:else}
                    <div>No countries found</div>
                {/each}
            </Select.Viewport>
        </Select.Content>
    </Select.Portal>
</Select.Root>

<style>
    :global([data-select-trigger]) {
        width: 100%;
        padding: 0.5rem 1rem;
        border: 1px solid #e5e7eb;
        border-radius: 0.25rem;
        background: white;
        text-align: left;
    }

    :global([data-select-content]) {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 0.25rem;
        padding: 0.5rem;
        max-height: 20rem;
        overflow-y: auto;
        z-index: 50;
    }

    :global([data-select-item]) {
        padding: 0.5rem;
        cursor: pointer;
        border-radius: 0.25rem;
    }

    :global([data-select-item][data-highlighted]) {
        background: #f3f4f6;
    }

    :global([data-select-item][data-selected]) {
        background: #dbeafe;
    }
</style>
```

### Tabs with $effect for Lazy Loading

```svelte
<script lang="ts">
import { Tabs } from 'bits-ui';

interface UserProfile {
    name: string;
    email: string;
}

interface Settings {
    theme: string;
    notifications: boolean;
}

let activeTab = $state('profile');
let profileData = $state<UserProfile | null>(null);
let settingsData = $state<Settings | null>(null);
let loading = $state(false);

$effect(() => {
    if (activeTab === 'profile' && !profileData) {
        loadProfileData();
    } else if (activeTab === 'settings' && !settingsData) {
        loadSettingsData();
    }
});

async function loadProfileData() {
    loading = true;
    try {
        const response = await fetch('/api/profile');
        if (response.ok) {
            profileData = await response.json();
        }
    } catch (error) {
        console.error('Failed to load profile data');
    } finally {
        loading = false;
    }
}

async function loadSettingsData() {
    loading = true;
    try {
        const response = await fetch('/api/settings');
        if (response.ok) {
            settingsData = await response.json();
        }
    } catch (error) {
        console.error('Failed to load settings data');
    } finally {
        loading = false;
    }
}
</script>

<Tabs.Root bind:value={activeTab}>
    <Tabs.List>
        <Tabs.Trigger value="profile">Profile</Tabs.Trigger>
        <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
        <Tabs.Trigger value="billing">Billing</Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value="profile">
        {#if loading}
            <p>Loading...</p>
        {:else if profileData}
            <h2>{profileData.name}</h2>
            <p>{profileData.email}</p>
        {:else}
            <p>No profile data available</p>
        {/if}
    </Tabs.Content>

    <Tabs.Content value="settings">
        {#if loading}
            <p>Loading...</p>
        {:else if settingsData}
            <div>
                <p>Theme: {settingsData.theme}</p>
                <p>Notifications: {settingsData.notifications ? 'Enabled' : 'Disabled'}</p>
            </div>
        {:else}
            <p>No settings data available</p>
        {/if}
    </Tabs.Content>

    <Tabs.Content value="billing">
        <div>Billing content</div>
    </Tabs.Content>
</Tabs.Root>

<style>
    :global([data-tabs-list]) {
        display: flex;
        gap: 0.25rem;
        border-bottom: 1px solid #e5e7eb;
        margin-bottom: 1rem;
    }

    :global([data-tabs-trigger]) {
        padding: 0.5rem 1rem;
        border: none;
        background: transparent;
        cursor: pointer;
        border-bottom: 2px solid transparent;
    }

    :global([data-tabs-trigger][data-state="active"]) {
        border-bottom-color: #3b82f6;
        color: #3b82f6;
    }

    :global([data-tabs-content]) {
        padding: 1rem 0;
    }
</style>
```

### Checkbox with Indeterminate State

```svelte
<script lang="ts">
import { Checkbox } from 'bits-ui';

let parentChecked = $state<boolean | 'indeterminate'>('indeterminate');
let childChecked = $state([true, false, false]);

$effect(() => {
    const checkedCount = childChecked.filter(Boolean).length;
    if (checkedCount === 0) {
        parentChecked = false;
    } else if (checkedCount === childChecked.length) {
        parentChecked = true;
    } else {
        parentChecked = 'indeterminate';
    }
});

function toggleParent() {
    const newValue = parentChecked !== true;
    childChecked = childChecked.map(() => newValue);
}
</script>

<div>
    <Checkbox.Root checked={parentChecked} onCheckedChange={toggleParent}>
        <Checkbox.Input />
        <Checkbox.Indicator>
            {#if parentChecked === true}
                ✓
            {:else if parentChecked === 'indeterminate'}
                −
            {/if}
        </Checkbox.Indicator>
    </Checkbox.Root>
    <label>Select all</label>
</div>

{#each childChecked as checked, i}
    <div>
        <Checkbox.Root bind:checked={childChecked[i]}>
            <Checkbox.Input />
            <Checkbox.Indicator>
                {#if checked}✓{/if}
            </Checkbox.Indicator>
        </Checkbox.Root>
        <label>Option {i + 1}</label>
    </div>
{/each}

<style>
    div {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }

    :global([data-checkbox-root]) {
        width: 1.25rem;
        height: 1.25rem;
        border: 1px solid #e5e7eb;
        border-radius: 0.25rem;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    }

    :global([data-checkbox-root][data-state="checked"]) {
        background: #3b82f6;
        border-color: #3b82f6;
        color: white;
    }
</style>
```

## SvelteKit Integration

### Form Actions with Bits UI Dialog

```typescript
import type { Actions } from "./$types";
import { fail } from "@sveltejs/kit";
import { z } from "zod";

const subscriptionSchema = z.object({
  email: z.string().email("Invalid email format"),
  name: z.string().min(2, "Name must be at least 2 characters"),
});

export const actions: Actions = {
  subscribe: async ({ request, locals }) => {
    const data = await request.formData();
    const email = data.get("email");
    const name = data.get("name");

    const result = subscriptionSchema.safeParse({ email, name });

    if (!result.success) {
      return fail(400, {
        errors: result.error.flatten().fieldErrors,
      });
    }

    try {
      await locals.db.subscription.create({
        data: result.data,
      });

      return { success: true };
    } catch (error) {
      return fail(500, {
        errors: { email: ["Failed to subscribe. Please try again."] },
      });
    }
  },
};
```

```svelte
<script lang="ts">
import { Dialog } from 'bits-ui';
import { enhance } from '$app/forms';
import type { ActionData } from './$types';

let { form }: { form: ActionData } = $props();

let open = $state(false);

$effect(() => {
    if (form?.success) {
        open = false;
    }
});
</script>

<Dialog.Root bind:open>
    <Dialog.Trigger>Subscribe</Dialog.Trigger>
    <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
            <Dialog.Title>Subscribe to Newsletter</Dialog.Title>

            <form method="POST" action="?/subscribe" use:enhance>
                <label for="name">Name</label>
                <input
                    id="name"
                    name="name"
                    type="text"
                    aria-invalid={!!form?.errors?.name}
                />
                {#if form?.errors?.name}
                    <span role="alert">{form.errors.name[0]}</span>
                {/if}

                <label for="email">Email</label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    aria-invalid={!!form?.errors?.email}
                />
                {#if form?.errors?.email}
                    <span role="alert">{form.errors.email[0]}</span>
                {/if}

                <button type="submit">Subscribe</button>
            </form>

            <Dialog.Close>Cancel</Dialog.Close>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>
```

### Server-Side Data Loading with Select

```typescript
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const countries = await locals.db.country.findMany({
    select: { code: true, name: true },
    orderBy: { name: "asc" },
  });

  return {
    countries: countries.map((c) => ({
      value: c.code,
      label: c.name,
    })),
  };
};
```

```svelte
<script lang="ts">
import { Select } from 'bits-ui';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

let selectedCountry = $state('');
let searchQuery = $state('');

const filteredCountries = $derived(
    data.countries.filter(c =>
        c.label.toLowerCase().includes(searchQuery.toLowerCase())
    )
);
</script>

<Select.Root selected={{ value: selectedCountry }}>
    <Select.Trigger>
        <Select.Value placeholder="Select country" />
    </Select.Trigger>
    <Select.Portal>
        <Select.Content>
            <Select.Input bind:value={searchQuery} placeholder="Search..." />
            <Select.Viewport>
                {#each filteredCountries as country (country.value)}
                    <Select.Item value={country.value}>
                        <Select.ItemText>{country.label}</Select.ItemText>
                    </Select.Item>
                {/each}
            </Select.Viewport>
        </Select.Content>
    </Select.Portal>
</Select.Root>
```

## Reusable Component Patterns

### Compound Component with $props

```svelte
<script lang="ts">
import { Dialog } from 'bits-ui';

interface Props {
    open?: boolean;
    title: string;
    description?: string;
    children?: import('svelte').Snippet;
    trigger?: import('svelte').Snippet;
    onOpenChange?: (open: boolean) => void;
}

let {
    open = $bindable(false),
    title,
    description,
    children,
    trigger,
    onOpenChange
}: Props = $props();

$effect(() => {
    onOpenChange?.(open);
});
</script>

<Dialog.Root bind:open>
    {#if trigger}
        {@render trigger()}
    {:else}
        <Dialog.Trigger>Open</Dialog.Trigger>
    {/if}

    <Dialog.Portal>
        <Dialog.Overlay class="overlay" />
        <Dialog.Content class="content">
            <Dialog.Title class="title">{title}</Dialog.Title>
            {#if description}
                <Dialog.Description class="description">{description}</Dialog.Description>
            {/if}
            <div class="body">
                {@render children?.()}
            </div>
            <Dialog.Close class="close">×</Dialog.Close>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>

<style>
    :global(.overlay) {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 50;
    }

    :global(.content) {
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 2rem;
        border-radius: 0.5rem;
        max-width: 32rem;
        width: 90%;
        z-index: 50;
    }

    :global(.title) {
        font-size: 1.5rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
    }

    :global(.description) {
        color: #6b7280;
        margin-bottom: 1rem;
    }

    :global(.body) {
        margin-bottom: 1.5rem;
    }

    :global(.close) {
        position: absolute;
        top: 1rem;
        right: 1rem;
        width: 2rem;
        height: 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        font-size: 1.5rem;
        cursor: pointer;
        border-radius: 0.25rem;
    }
</style>
```

Usage:

```svelte
<script lang="ts">
import CustomDialog from '$lib/components/CustomDialog.svelte';

let dialogOpen = $state(false);

function handleConfirm() {
    console.log('Confirmed!');
    dialogOpen = false;
}
</script>

<CustomDialog
    bind:open={dialogOpen}
    title="Confirm Action"
    description="Are you sure you want to proceed?"
>
    <button onclick={handleConfirm}>Confirm</button>
    <button onclick={() => dialogOpen = false}>Cancel</button>
</CustomDialog>
```

### Context-based State Management

```svelte
<script lang="ts" context="module">
import { setContext, getContext } from 'svelte';

interface ToastState {
    message: string;
    type: 'success' | 'error' | 'info';
    visible: boolean;
}

const TOAST_KEY = Symbol('toast');

export function createToastContext() {
    let state = $state<ToastState>({
        message: '',
        type: 'info',
        visible: false
    });

    function show(message: string, type: ToastState['type'] = 'info') {
        state = { message, type, visible: true };
        setTimeout(() => {
            state.visible = false;
        }, 3000);
    }

    function hide() {
        state.visible = false;
    }

    setContext(TOAST_KEY, {
        get state() { return state; },
        show,
        hide
    });
}

export function useToast() {
    return getContext<ReturnType<typeof createToastContext>>(TOAST_KEY);
}
</script>
```

Usage in layout:

```svelte
<script lang="ts">
import { Dialog } from 'bits-ui';
import { createToastContext, useToast } from '$lib/components/Toast.svelte';

createToastContext();
const toast = useToast();

let { children } = $props();
</script>

<div>
    {@render children()}
</div>

<Dialog.Root open={toast.state.visible}>
    <Dialog.Content>
        <p class={toast.state.type}>{toast.state.message}</p>
    </Dialog.Content>
</Dialog.Root>
```

## Styling Approaches

### Data Attributes with Svelte Scoping

```svelte
<style>
    :global([data-dialog-overlay]) {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        z-index: 50;
        animation: fadeIn 150ms ease-out;
    }

    :global([data-dialog-content]) {
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 2rem;
        border-radius: 0.5rem;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        max-width: 32rem;
        width: 90%;
        z-index: 50;
        animation: slideIn 150ms ease-out;
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    @keyframes slideIn {
        from {
            transform: translate(-50%, -48%);
            opacity: 0;
        }
        to {
            transform: translate(-50%, -50%);
            opacity: 1;
        }
    }
</style>
```

### Tailwind CSS Classes

```svelte
<Dialog.Root bind:open>
    <Dialog.Trigger class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        Open
    </Dialog.Trigger>
    <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl max-w-md w-[90%] p-6 z-50">
            <Dialog.Title class="text-xl font-semibold mb-2">Title</Dialog.Title>
            <Dialog.Description class="text-gray-600 mb-4">Description</Dialog.Description>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>
```

### CSS Variables with Theme Context

```svelte
<script lang="ts">
import { setContext } from 'svelte';

interface Theme {
    primary: string;
    radius: string;
    shadow: string;
}

const theme: Theme = {
    primary: '#3b82f6',
    radius: '0.5rem',
    shadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
};

setContext('theme', theme);
</script>

<div style="
    --color-primary: {theme.primary};
    --radius: {theme.radius};
    --shadow: {theme.shadow};
">
    <slot />
</div>

<style>
    :global([data-dialog-content]) {
        background: white;
        border-radius: var(--radius);
        box-shadow: var(--shadow);
    }

    :global([data-select-trigger]:focus-visible) {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
    }
</style>
```

## Animation with Svelte Transitions

```svelte
<script lang="ts">
import { Dialog } from 'bits-ui';
import { fade, scale, fly } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';

let open = $state(false);

function customSlide(node: HTMLElement) {
    return {
        duration: 200,
        css: (t: number) => {
            const eased = cubicOut(t);
            return `
                opacity: ${eased};
                transform: translate(-50%, ${-50 + (1 - eased) * -2}%);
            `;
        }
    };
}
</script>

<Dialog.Root bind:open>
    <Dialog.Trigger>Open</Dialog.Trigger>
    {#if open}
        <Dialog.Portal>
            <Dialog.Overlay transition={fade} transitionConfig={{ duration: 150 }} />
            <Dialog.Content transition={customSlide}>
                Content
            </Dialog.Content>
        </Dialog.Portal>
    {/if}
</Dialog.Root>
```

## Security Best Practices

### XSS Prevention with DOMPurify

```svelte
<script lang="ts">
import { Dialog } from 'bits-ui';
import DOMPurify from 'dompurify';

let userContent = $state('');

const sanitizedContent = $derived(DOMPurify.sanitize(userContent));
</script>

<Dialog.Content>
    {@html sanitizedContent}
</Dialog.Content>
```

### CSRF Protection with SvelteKit

```typescript
import type { Handle } from "@sveltejs/kit";
import { generateToken, verifyToken } from "$lib/server/csrf";

export const handle: Handle = async ({ event, resolve }) => {
  if (event.request.method === "GET") {
    event.locals.csrfToken = generateToken();
  }

  if (["POST", "PUT", "DELETE", "PATCH"].includes(event.request.method)) {
    const token = event.request.headers.get("x-csrf-token");
    if (!token || !verifyToken(token)) {
      return new Response("Invalid CSRF token", { status: 403 });
    }
  }

  const response = await resolve(event);
  return response;
};
```

```svelte
<script lang="ts">
import { Dialog } from 'bits-ui';
import { page } from '$app/stores';

async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const formData = new FormData(event.target as HTMLFormElement);

    await fetch('/api/submit', {
        method: 'POST',
        headers: {
            'x-csrf-token': $page.data.csrfToken
        },
        body: formData
    });
}
</script>

<Dialog.Content>
    <form onsubmit={handleSubmit}>
        <input type="hidden" name="csrf_token" value={$page.data.csrfToken} />
    </form>
</Dialog.Content>
```

### Input Validation with Zod

```svelte
<script lang="ts">
import { Dialog } from 'bits-ui';
import { z } from 'zod';

const formSchema = z.object({
    email: z.string().email('Invalid email'),
    age: z.number().min(18, 'Must be 18+').max(120),
    username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'Invalid username')
});

let formData = $state({ email: '', age: 0, username: '' });
let errors = $state<Record<string, string>>({});

function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    errors = {};

    const result = formSchema.safeParse(formData);

    if (!result.success) {
        errors = Object.fromEntries(
            result.error.errors.map(err => [err.path[0], err.message])
        );
        return;
    }

    submitForm(result.data);
}
</script>
```

## Component Reference

### Available Components

- **Accordion** - Expandable content sections
- **Alert Dialog** - Modal requiring user action
- **Checkbox** - Checkboxes with indeterminate state
- **Combobox** - Searchable select with autocomplete
- **Context Menu** - Right-click menus
- **Dialog** - Modal dialogs and overlays
- **Dropdown Menu** - Action menus with nesting
- **Popover** - Floating content containers
- **Radio Group** - Radio button groups
- **Select** - Dropdown selection lists
- **Slider** - Range input sliders
- **Switch** - Toggle switches
- **Tabs** - Tabbed content panels
- **Tooltip** - Hover/focus tooltips
- **Date Picker** - Date selection
- **Progress** - Progress indicators
- **Separator** - Visual dividers

### Common Patterns

All components work seamlessly with:

- `$state` for reactive state
- `$derived` for computed values
- `$effect` for side effects
- `$props` for component props
- `bind:` directives for two-way binding
- Snippets for reusable markup
- SvelteKit form actions
- Server-side data loading

## Documentation Resources

- **Bits UI Documentation**: https://bits-ui.com/docs/llms.txt
- **Component Examples**: https://bits-ui.com/docs/components/
- **Svelte 5 Documentation**: https://svelte.dev/docs/llms

## Best Practices

1. **Use $state for component-local state** - Keep reactive state clear and type-safe
2. **Use $derived for computed values** - Automatically recompute when dependencies change
3. **Use $effect for side effects** - Handle cleanup with return functions
4. **Validate all user input** - Use Zod or similar validation libraries
5. **Sanitize HTML content** - Prevent XSS attacks with DOMPurify
6. **Implement CSRF protection** - Use tokens for state-changing operations
7. **Use proper ARIA labels** - Bits UI provides accessibility, enhance with labels
8. **Test with screen readers** - Verify accessibility implementation
9. **Style with data attributes** - Use Bits UI's built-in data attributes for styling
10. **Leverage SvelteKit features** - Combine Bits UI with form actions and load functions
