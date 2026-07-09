# Real-Time Subscriptions and Live Queries

Complete guide to implementing real-time features in SvelteKit with SurrealDB's live queries and subscriptions.

## Table of Contents

- [Live Query Basics](#live-query-basics)
- [Svelte Stores for Real-Time Data](#svelte-stores-for-real-time-data)
- [Server-Sent Events (SSE)](#server-sent-events-sse)
- [WebSocket Integration](#websocket-integration)
- [Real-Time Dashboard](#real-time-dashboard)
- [Performance Optimization](#performance-optimization)

## Live Query Basics

### Simple Live Query

src/lib/infrastructure/realtime/LiveQueryManager.ts:

```typescript
import type { Surreal } from "surrealdb";

interface LiveAction {
  action: "CREATE" | "UPDATE" | "DELETE" | "CLOSE";
  result: any;
}

export class LiveQueryManager {
  private queryUuids: Map<string, string> = new Map();

  constructor(private readonly db: Surreal) {}

  async subscribe<T>(
    table: string,
    callback: (action: string, data: T) => void,
    withDiff: boolean = false,
  ): Promise<string> {
    const queryUuid = await this.db.live(
      table,
      (action, result) => {
        if (action === "CLOSE") {
          console.log(`Live query closed for ${table}`);
          return;
        }

        callback(action, result);
      },
      withDiff,
    );

    this.queryUuids.set(table, queryUuid);
    return queryUuid;
  }

  async unsubscribe(table: string): Promise<void> {
    const queryUuid = this.queryUuids.get(table);
    if (queryUuid) {
      await this.db.kill(queryUuid);
      this.queryUuids.delete(table);
    }
  }

  async unsubscribeAll(): Promise<void> {
    const promises = Array.from(this.queryUuids.keys()).map((table) =>
      this.unsubscribe(table),
    );
    await Promise.all(promises);
  }
}
```

### Live Query with Filtering

src/lib/infrastructure/realtime/FilteredLiveQuery.ts:

```typescript
import type { Surreal } from "surrealdb";

export class FilteredLiveQuery<T> {
  constructor(private readonly db: Surreal) {}

  async subscribeWithFilter(
    table: string,
    filter: (data: T) => boolean,
    callback: (action: string, data: T) => void,
  ): Promise<string> {
    return await this.db.live(table, (action, result) => {
      if (action === "CLOSE") return;

      if (filter(result)) {
        callback(action, result);
      }
    });
  }

  async subscribeToQuery(
    query: string,
    callback: (action: string, data: any) => void,
  ): Promise<string> {
    const result = await this.db.query<[{ result: string }[]]>(`LIVE ${query}`);

    const queryUuid = result[0]?.result?.[0]?.result;

    if (!queryUuid) {
      throw new Error("Failed to create live query");
    }

    await this.db.subscribeLive(queryUuid, callback);

    return queryUuid;
  }
}
```

## Svelte Stores for Real-Time Data

### Basic Live Store

src/lib/stores/liveStore.svelte.ts:

```typescript
import { writable } from "svelte/store";
import Surreal from "surrealdb";

interface LiveData<T> {
  data: T[];
  loading: boolean;
  error: string | null;
}

export function createLiveStore<T>(
  table: string,
  config: {
    url: string;
    namespace: string;
    database: string;
  },
) {
  const { subscribe, set, update } = writable<LiveData<T>>({
    data: [],
    loading: true,
    error: null,
  });

  let db: Surreal;
  let queryUuid: string;

  async function initialize() {
    try {
      db = new Surreal();
      await db.connect(config.url, {
        namespace: config.namespace,
        database: config.database,
      });

      const initial = await db.select<T>(table);

      update((state) => ({
        ...state,
        data: initial,
        loading: false,
      }));

      queryUuid = await db.live(table, (action, result) => {
        if (action === "CLOSE") return;

        update((state) => {
          let newData = [...state.data];

          switch (action) {
            case "CREATE":
              newData.push(result);
              break;
            case "UPDATE":
              const updateIndex = newData.findIndex(
                (item: any) => item.id === result.id,
              );
              if (updateIndex !== -1) {
                newData[updateIndex] = result;
              }
              break;
            case "DELETE":
              newData = newData.filter((item: any) => item.id !== result.id);
              break;
          }

          return { ...state, data: newData };
        });
      });
    } catch (err) {
      set({
        data: [],
        loading: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function cleanup() {
    if (queryUuid && db) {
      await db.kill(queryUuid);
    }
    if (db) {
      await db.close();
    }
  }

  initialize();

  return {
    subscribe,
    cleanup,
  };
}
```

Usage in component:

```svelte
<script lang="ts">
import { createLiveStore } from '$lib/stores/liveStore.svelte';
import { onDestroy } from 'svelte';

interface User {
  id: string;
  name: string;
  email: string;
}

const usersStore = createLiveStore<User>('user', {
  url: 'http://127.0.0.1:8000/rpc',
  namespace: 'production',
  database: 'main'
});

onDestroy(() => {
  usersStore.cleanup();
});
</script>

{#if $usersStore.loading}
  <p>Loading...</p>
{:else if $usersStore.error}
  <p class="error">{$usersStore.error}</p>
{:else}
  <ul>
    {#each $usersStore.data as user}
      <li>{user.name} ({user.email})</li>
    {/each}
  </ul>
{/if}
```

### Advanced Live Store with Actions

src/lib/stores/advancedLiveStore.svelte.ts:

```typescript
import { writable } from "svelte/store";
import type { Surreal } from "surrealdb";

interface StoreConfig<T> {
  db: Surreal;
  table: string;
  initialData?: T[];
  transform?: (item: any) => T;
  filter?: (item: T) => boolean;
  sort?: (a: T, b: T) => number;
}

export function createAdvancedLiveStore<T extends { id: string }>(
  config: StoreConfig<T>,
) {
  const { subscribe, set, update } = writable<T[]>(config.initialData || []);

  let queryUuid: string;

  async function initialize() {
    try {
      const initial = await config.db.select<T>(config.table);

      let data = initial;

      if (config.transform) {
        data = data.map(config.transform);
      }

      if (config.filter) {
        data = data.filter(config.filter);
      }

      if (config.sort) {
        data.sort(config.sort);
      }

      set(data);

      queryUuid = await config.db.live(config.table, (action, result) => {
        if (action === "CLOSE") return;

        let item = result;
        if (config.transform) {
          item = config.transform(result);
        }

        if (config.filter && !config.filter(item)) {
          return;
        }

        update((currentData) => {
          let newData = [...currentData];

          switch (action) {
            case "CREATE":
              newData.push(item);
              break;
            case "UPDATE":
              const updateIndex = newData.findIndex((i) => i.id === item.id);
              if (updateIndex !== -1) {
                newData[updateIndex] = item;
              }
              break;
            case "DELETE":
              newData = newData.filter((i) => i.id !== item.id);
              break;
          }

          if (config.sort) {
            newData.sort(config.sort);
          }

          return newData;
        });
      });
    } catch (error) {
      console.error("Failed to initialize live store:", error);
    }
  }

  async function cleanup() {
    if (queryUuid && config.db) {
      await config.db.kill(queryUuid);
    }
  }

  initialize();

  return {
    subscribe,
    cleanup,
  };
}
```

Usage:

```svelte
<script lang="ts">
import { createAdvancedLiveStore } from '$lib/stores/advancedLiveStore.svelte';
import { onDestroy } from 'svelte';

let { data } = $props();

const productsStore = createAdvancedLiveStore({
  db: data.db,
  table: 'product',
  transform: (item) => ({
    ...item,
    displayPrice: `$${item.price.toFixed(2)}`
  }),
  filter: (item) => item.inventory > 0,
  sort: (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
});

onDestroy(() => {
  productsStore.cleanup();
});
</script>

<ul>
  {#each $productsStore as product}
    <li>{product.name} - {product.displayPrice}</li>
  {/each}
</ul>
```

## Server-Sent Events (SSE)

### SSE Endpoint

src/routes/api/live/products/+server.ts:

```typescript
import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import Surreal from "surrealdb";
import { config } from "$lib/infrastructure/persistence/surrealdb/connection";

export const GET: RequestHandler = async ({ setHeaders, locals }) => {
  if (!locals.user) {
    throw error(401, "Unauthorized");
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const db = new Surreal();

      try {
        await db.connect(config.url, {
          namespace: config.namespace,
          database: config.database,
        });

        const products = await db.select("product");

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "initial", data: products })}\n\n`,
          ),
        );

        const queryUuid = await db.live("product", (action, result) => {
          if (action === "CLOSE") {
            controller.close();
            return;
          }

          const message = JSON.stringify({
            type: action.toLowerCase(),
            data: result,
          });
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        });

        const interval = setInterval(() => {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        }, 30000);

        return () => {
          clearInterval(interval);
          db.kill(queryUuid);
          db.close();
        };
      } catch (err) {
        controller.error(err);
        await db.close();
      }
    },
  });

  setHeaders({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  return new Response(stream);
};
```

### SSE Client Store

src/lib/stores/sseStore.svelte.ts:

```typescript
import { writable } from "svelte/store";

interface SSEData<T> {
  data: T[];
  connected: boolean;
  error: string | null;
}

export function createSSEStore<T extends { id: string }>(endpoint: string) {
  const { subscribe, set, update } = writable<SSEData<T>>({
    data: [],
    connected: false,
    error: null,
  });

  let eventSource: EventSource;

  function connect() {
    eventSource = new EventSource(endpoint);

    eventSource.onopen = () => {
      update((state) => ({ ...state, connected: true, error: null }));
    };

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        update((state) => {
          let newData = [...state.data];

          switch (message.type) {
            case "initial":
              newData = message.data;
              break;
            case "create":
              newData.push(message.data);
              break;
            case "update":
              const updateIndex = newData.findIndex(
                (item) => item.id === message.data.id,
              );
              if (updateIndex !== -1) {
                newData[updateIndex] = message.data;
              }
              break;
            case "delete":
              newData = newData.filter((item) => item.id !== message.data.id);
              break;
          }

          return { ...state, data: newData };
        });
      } catch (err) {
        console.error("Failed to parse SSE message:", err);
      }
    };

    eventSource.onerror = (err) => {
      update((state) => ({
        ...state,
        connected: false,
        error: "Connection lost",
      }));
    };
  }

  function disconnect() {
    if (eventSource) {
      eventSource.close();
      update((state) => ({ ...state, connected: false }));
    }
  }

  connect();

  return {
    subscribe,
    disconnect,
  };
}
```

## WebSocket Integration

### WebSocket Handler

src/routes/ws/+server.ts:

```typescript
import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import Surreal from "surrealdb";
import { config } from "$lib/infrastructure/persistence/surrealdb/connection";

export const GET: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    throw error(401, "Unauthorized");
  }

  const upgradeHeader = request.headers.get("upgrade");
  if (upgradeHeader !== "websocket") {
    throw error(400, "Expected websocket upgrade");
  }

  const db = new Surreal();
  await db.connect(config.url, {
    namespace: config.namespace,
    database: config.database,
  });

  return new Response(null, {
    status: 101,
    headers: {
      Upgrade: "websocket",
      Connection: "Upgrade",
    },
  });
};
```

### WebSocket Store

src/lib/stores/websocketStore.svelte.ts:

```typescript
import { writable } from "svelte/store";

interface WSData<T> {
  data: T[];
  connected: boolean;
  error: string | null;
}

export function createWebSocketStore<T extends { id: string }>(url: string) {
  const { subscribe, set, update } = writable<WSData<T>>({
    data: [],
    connected: false,
    error: null,
  });

  let ws: WebSocket;
  let reconnectTimeout: ReturnType<typeof setTimeout>;

  function connect() {
    ws = new WebSocket(url);

    ws.onopen = () => {
      update((state) => ({ ...state, connected: true, error: null }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        update((state) => {
          let newData = [...state.data];

          switch (message.type) {
            case "initial":
              newData = message.data;
              break;
            case "create":
              newData.push(message.data);
              break;
            case "update":
              const updateIndex = newData.findIndex(
                (item) => item.id === message.data.id,
              );
              if (updateIndex !== -1) {
                newData[updateIndex] = message.data;
              }
              break;
            case "delete":
              newData = newData.filter((item) => item.id !== message.data.id);
              break;
          }

          return { ...state, data: newData };
        });
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    };

    ws.onerror = () => {
      update((state) => ({
        ...state,
        connected: false,
        error: "Connection error",
      }));
    };

    ws.onclose = () => {
      update((state) => ({ ...state, connected: false }));
      reconnectTimeout = setTimeout(connect, 3000);
    };
  }

  function disconnect() {
    clearTimeout(reconnectTimeout);
    if (ws) {
      ws.close();
    }
  }

  function send(data: any) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  connect();

  return {
    subscribe,
    send,
    disconnect,
  };
}
```

## Real-Time Dashboard

### Dashboard Component

src/routes/dashboard/+page.svelte:

```svelte
<script lang="ts">
import { createLiveStore } from '$lib/stores/liveStore.svelte';
import { onDestroy } from 'svelte';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

interface Activity {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

interface Stats {
  id: string;
  users: number;
  products: number;
  orders: number;
}

const activityStore = createLiveStore<Activity>('activity', {
  url: data.surrealUrl,
  namespace: data.namespace,
  database: data.database
});

const statsStore = createLiveStore<Stats>('stats', {
  url: data.surrealUrl,
  namespace: data.namespace,
  database: data.database
});

onDestroy(() => {
  activityStore.cleanup();
  statsStore.cleanup();
});

let latestActivities = $derived(
  $activityStore.data
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10)
);
</script>

<div class="dashboard">
  <h1>Real-Time Dashboard</h1>

  <div class="stats">
    {#if $statsStore.data[0]}
      <div class="stat">
        <h3>Users</h3>
        <p>{$statsStore.data[0].users}</p>
      </div>
      <div class="stat">
        <h3>Products</h3>
        <p>{$statsStore.data[0].products}</p>
      </div>
      <div class="stat">
        <h3>Orders</h3>
        <p>{$statsStore.data[0].orders}</p>
      </div>
    {/if}
  </div>

  <div class="activity">
    <h2>Recent Activity</h2>
    {#if $activityStore.loading}
      <p>Loading...</p>
    {:else if $activityStore.error}
      <p class="error">{$activityStore.error}</p>
    {:else}
      <ul>
        {#each latestActivities as activity}
          <li class="activity-{activity.type}">
            <span class="time">{new Date(activity.timestamp).toLocaleTimeString()}</span>
            <span class="message">{activity.message}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .dashboard {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .stat {
    padding: 1.5rem;
    background: #f5f5f5;
    border-radius: 8px;
  }

  .stat h3 {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    color: #666;
  }

  .stat p {
    margin: 0;
    font-size: 2rem;
    font-weight: bold;
  }

  .activity ul {
    list-style: none;
    padding: 0;
  }

  .activity li {
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    background: #fff;
    border-left: 4px solid #ddd;
    border-radius: 4px;
  }

  .activity-create {
    border-left-color: #4caf50;
  }

  .activity-update {
    border-left-color: #2196f3;
  }

  .activity-delete {
    border-left-color: #f44336;
  }

  .time {
    color: #666;
    font-size: 0.875rem;
    margin-right: 1rem;
  }
</style>
```

## Performance Optimization

### Debounced Updates

src/lib/stores/debouncedLiveStore.svelte.ts:

```typescript
import { writable } from "svelte/store";
import type { Surreal } from "surrealdb";

export function createDebouncedLiveStore<T extends { id: string }>(
  db: Surreal,
  table: string,
  debounceMs: number = 300,
) {
  const { subscribe, set, update } = writable<T[]>([]);

  let queryUuid: string;
  let pendingUpdates: Array<{ action: string; data: T }> = [];
  let debounceTimeout: ReturnType<typeof setTimeout>;

  function processPendingUpdates() {
    if (pendingUpdates.length === 0) return;

    update((currentData) => {
      let newData = [...currentData];

      for (const { action, data } of pendingUpdates) {
        switch (action) {
          case "CREATE":
            newData.push(data);
            break;
          case "UPDATE":
            const updateIndex = newData.findIndex(
              (item) => item.id === data.id,
            );
            if (updateIndex !== -1) {
              newData[updateIndex] = data;
            }
            break;
          case "DELETE":
            newData = newData.filter((item) => item.id !== data.id);
            break;
        }
      }

      return newData;
    });

    pendingUpdates = [];
  }

  async function initialize() {
    const initial = await db.select<T>(table);
    set(initial);

    queryUuid = await db.live(table, (action, result) => {
      if (action === "CLOSE") return;

      pendingUpdates.push({ action, data: result });

      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(processPendingUpdates, debounceMs);
    });
  }

  async function cleanup() {
    clearTimeout(debounceTimeout);
    if (queryUuid && db) {
      await db.kill(queryUuid);
    }
  }

  initialize();

  return {
    subscribe,
    cleanup,
  };
}
```

### Paginated Live Query

src/lib/stores/paginatedLiveStore.svelte.ts:

```typescript
import { writable } from "svelte/store";
import type { Surreal } from "surrealdb";

interface PaginatedData<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export function createPaginatedLiveStore<T extends { id: string }>(
  db: Surreal,
  table: string,
  pageSize: number = 20,
) {
  const { subscribe, set, update } = writable<PaginatedData<T>>({
    data: [],
    total: 0,
    page: 1,
    pageSize,
    hasMore: false,
  });

  let allData: T[] = [];
  let queryUuid: string;

  function updateView(page: number) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageData = allData.slice(start, end);

    update((state) => ({
      ...state,
      data: pageData,
      total: allData.length,
      page,
      hasMore: end < allData.length,
    }));
  }

  async function initialize() {
    allData = await db.select<T>(table);
    updateView(1);

    queryUuid = await db.live(table, (action, result) => {
      if (action === "CLOSE") return;

      switch (action) {
        case "CREATE":
          allData.push(result);
          break;
        case "UPDATE":
          const updateIndex = allData.findIndex(
            (item) => item.id === result.id,
          );
          if (updateIndex !== -1) {
            allData[updateIndex] = result;
          }
          break;
        case "DELETE":
          allData = allData.filter((item) => item.id !== result.id);
          break;
      }

      update((state) => {
        updateView(state.page);
        return state;
      });
    });
  }

  async function cleanup() {
    if (queryUuid && db) {
      await db.kill(queryUuid);
    }
  }

  function nextPage() {
    update((state) => {
      if (state.hasMore) {
        updateView(state.page + 1);
      }
      return state;
    });
  }

  function prevPage() {
    update((state) => {
      if (state.page > 1) {
        updateView(state.page - 1);
      }
      return state;
    });
  }

  function goToPage(page: number) {
    updateView(page);
  }

  initialize();

  return {
    subscribe,
    nextPage,
    prevPage,
    goToPage,
    cleanup,
  };
}
```
