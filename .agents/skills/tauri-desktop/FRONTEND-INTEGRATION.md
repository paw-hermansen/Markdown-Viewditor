# Frontend Integration Guide

Complete guide to integrating frontend frameworks with Tauri and implementing type-safe IPC.

## Table of Contents

- [TypeScript Bindings](#typescript-bindings)
- [React Integration](#react-integration)
- [Vue Integration](#vue-integration)
- [Svelte Integration](#svelte-integration)
- [IPC Patterns](#ipc-patterns)
- [State Synchronization](#state-synchronization)

## TypeScript Bindings

### Auto-Generated Types

Install specta for automatic TypeScript generation:

Cargo.toml:

```toml
[dependencies]
tauri-specta = { version = "2.0.0-rc", features = ["typescript"] }
specta = { version = "2.0.0-rc", features = ["tauri"] }
```

Backend with type export:

```rust
use specta::Type;
use serde::{Deserialize, Serialize};
use tauri_specta::*;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct User {
    pub id: String,
    pub username: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CreateUserRequest {
    pub username: String,
    pub email: String,
}

#[tauri::command]
#[specta::specta]
async fn create_user(request: CreateUserRequest) -> Result<User, String> {
    Ok(User {
        id: uuid::Uuid::new_v4().to_string(),
        username: request.username,
        email: request.email,
    })
}

#[tauri::command]
#[specta::specta]
async fn get_user(id: String) -> Result<Option<User>, String> {
    Ok(None)
}

fn main() {
    let builder = tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![create_user, get_user]);

    #[cfg(debug_assertions)]
    builder
        .export(specta_typescript::Typescript::default(), "../ui/src/bindings.ts")
        .expect("Failed to export typescript bindings");

    tauri::Builder::default()
        .invoke_handler(builder.invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Generated TypeScript:

```typescript
export interface User {
  id: string;
  username: string;
  email: string;
}

export interface CreateUserRequest {
  username: string;
  email: string;
}

export async function createUser(request: CreateUserRequest): Promise<User> {
  return await invoke("create_user", { request });
}

export async function getUser(id: string): Promise<User | null> {
  return await invoke("get_user", { id });
}
```

### Manual Type Definitions

ui/src/types/api.ts:

```typescript
export interface User {
  id: string;
  username: string;
  email: string;
}

export interface CreateUserRequest {
  username: string;
  email: string;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  created_at: string;
}

export interface AppConfig {
  theme: "light" | "dark";
  language: string;
  auto_save: boolean;
}

export interface FileInfo {
  name: string;
  size: number;
  path: string;
}
```

## React Integration

### API Wrapper

ui/src/api/tauri.ts:

```typescript
import { invoke } from "@tauri-apps/api/tauri";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { User, CreateUserRequest, Note } from "../types/api";

export class TauriAPI {
  static async createUser(request: CreateUserRequest): Promise<User> {
    return await invoke<User>("create_user", { request });
  }

  static async getUser(id: string): Promise<User | null> {
    return await invoke<User | null>("get_user", { id });
  }

  static async updateUser(id: string, email: string): Promise<User> {
    return await invoke<User>("update_user_email", { id, email });
  }

  static async deleteUser(id: string): Promise<void> {
    await invoke("delete_user", { id });
  }

  static async getNotes(): Promise<Note[]> {
    return await invoke<Note[]>("get_notes");
  }

  static async createNote(title: string, content: string): Promise<Note> {
    return await invoke<Note>("create_note", { title, content });
  }

  static async deleteNote(id: number): Promise<void> {
    await invoke("delete_note", { id });
  }

  static onProgress(callback: (progress: number) => void): Promise<UnlistenFn> {
    return listen<number>("progress", (event) => callback(event.payload));
  }
}
```

### React Hooks

ui/src/hooks/useTauriCommand.ts:

```typescript
import { useState, useCallback } from "react";

interface CommandState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function useTauriCommand<T, Args extends any[]>(
  commandFn: (...args: Args) => Promise<T>,
) {
  const [state, setState] = useState<CommandState<T>>({
    data: null,
    error: null,
    loading: false,
  });

  const execute = useCallback(
    async (...args: Args) => {
      setState({ data: null, error: null, loading: true });

      try {
        const data = await commandFn(...args);
        setState({ data, error: null, loading: false });
        return data;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        setState({ data: null, error: errorMessage, loading: false });
        throw error;
      }
    },
    [commandFn],
  );

  return { ...state, execute };
}
```

ui/src/hooks/useTauriEvent.ts:

```typescript
import { useEffect, useState } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export function useTauriEvent<T>(eventName: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    let unlisten: UnlistenFn;

    listen<T>(eventName, (event) => {
      setValue(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [eventName]);

  return value;
}
```

### React Component Example

```typescript
import React, { useState, useEffect } from 'react';
import { TauriAPI } from '../api/tauri';
import { useTauriCommand } from '../hooks/useTauriCommand';
import type { User } from '../types/api';

export function UserList() {
    const [users, setUsers] = useState<User[]>([]);
    const { loading, error, execute: createUser } = useTauriCommand(TauriAPI.createUser);

    useEffect(() => {
        loadUsers();
    }, []);

    async function loadUsers() {
        try {
            const userList = await TauriAPI.getUsers();
            setUsers(userList);
        } catch (error) {
            console.error('Failed to load users:', error);
        }
    }

    async function handleCreate() {
        try {
            await createUser({
                username: 'newuser',
                email: 'user@example.com'
            });
            await loadUsers();
        } catch (error) {
            console.error('Failed to create user:', error);
        }
    }

    return (
        <div>
            <h1>Users</h1>
            {error && <div className="error">{error}</div>}
            <button onClick={handleCreate} disabled={loading}>
                {loading ? 'Creating...' : 'Create User'}
            </button>
            <ul>
                {users.map((user) => (
                    <li key={user.id}>
                        {user.username} ({user.email})
                    </li>
                ))}
            </ul>
        </div>
    );
}
```

## Vue Integration

### Composables

ui/src/composables/useTauri.ts:

```typescript
import { ref, Ref } from "vue";
import { invoke } from "@tauri-apps/api/tauri";

interface CommandState<T> {
  data: Ref<T | null>;
  error: Ref<string | null>;
  loading: Ref<boolean>;
  execute: (...args: any[]) => Promise<T>;
}

export function useTauriCommand<T>(command: string): CommandState<T> {
  const data = ref<T | null>(null);
  const error = ref<string | null>(null);
  const loading = ref(false);

  const execute = async (...args: any[]): Promise<T> => {
    loading.value = true;
    error.value = null;

    try {
      const result = await invoke<T>(command, ...args);
      data.value = result;
      return result;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  return { data, error, loading, execute };
}
```

ui/src/composables/useTauriEvent.ts:

```typescript
import { ref, onMounted, onUnmounted, Ref } from "vue";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export function useTauriEvent<T>(eventName: string, initialValue: T): Ref<T> {
  const value = ref<T>(initialValue) as Ref<T>;
  let unlisten: UnlistenFn | null = null;

  onMounted(async () => {
    unlisten = await listen<T>(eventName, (event) => {
      value.value = event.payload;
    });
  });

  onUnmounted(() => {
    if (unlisten) unlisten();
  });

  return value;
}
```

### Vue Component Example

```vue
<script setup lang="ts">
import { ref, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/tauri";
import { useTauriCommand } from "@/composables/useTauri";
import type { User } from "@/types/api";

const users = ref<User[]>([]);
const {
  loading,
  error,
  execute: createUser,
} = useTauriCommand<User>("create_user");

onMounted(async () => {
  await loadUsers();
});

async function loadUsers() {
  try {
    users.value = await invoke<User[]>("get_users");
  } catch (err) {
    console.error("Failed to load users:", err);
  }
}

async function handleCreate() {
  try {
    await createUser({
      username: "newuser",
      email: "user@example.com",
    });
    await loadUsers();
  } catch (err) {
    console.error("Failed to create user:", err);
  }
}
</script>

<template>
  <div>
    <h1>Users</h1>
    <div v-if="error" class="error">{{ error }}</div>
    <button @click="handleCreate" :disabled="loading">
      {{ loading ? "Creating..." : "Create User" }}
    </button>
    <ul>
      <li v-for="user in users" :key="user.id">
        {{ user.username }} ({{ user.email }})
      </li>
    </ul>
  </div>
</template>
```

## Svelte Integration

### Svelte Stores

ui/src/lib/stores/tauri.ts:

```typescript
import { writable, derived, Writable } from "svelte/store";
import { invoke } from "@tauri-apps/api/tauri";

interface CommandStore<T> {
  subscribe: Writable<T | null>["subscribe"];
  execute: (...args: any[]) => Promise<T>;
  loading: Writable<boolean>;
  error: Writable<string | null>;
}

export function createCommandStore<T>(command: string): CommandStore<T> {
  const data = writable<T | null>(null);
  const loading = writable(false);
  const error = writable<string | null>(null);

  const execute = async (...args: any[]): Promise<T> => {
    loading.set(true);
    error.set(null);

    try {
      const result = await invoke<T>(command, ...args);
      data.set(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      error.set(errorMessage);
      throw err;
    } finally {
      loading.set(false);
    }
  };

  return {
    subscribe: data.subscribe,
    execute,
    loading,
    error,
  };
}
```

### Svelte 5 Runes Integration

ui/src/lib/api/tauri.svelte.ts:

```typescript
import { invoke } from "@tauri-apps/api/tauri";
import type { User, CreateUserRequest } from "$lib/types/api";

export function createTauriAPI() {
  let users = $state<User[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function getUsers() {
    loading = true;
    error = null;

    try {
      users = await invoke<User[]>("get_users");
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  async function createUser(request: CreateUserRequest) {
    loading = true;
    error = null;

    try {
      const user = await invoke<User>("create_user", { request });
      users.push(user);
      return user;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      loading = false;
    }
  }

  async function deleteUser(id: string) {
    loading = true;
    error = null;

    try {
      await invoke("delete_user", { id });
      users = users.filter((u) => u.id !== id);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      loading = false;
    }
  }

  return {
    get users() {
      return users;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    getUsers,
    createUser,
    deleteUser,
  };
}
```

### Svelte 5 Component Example

```svelte
<script lang="ts">
import { onMount } from 'svelte';
import { createTauriAPI } from '$lib/api/tauri.svelte';

const api = createTauriAPI();

onMount(async () => {
    await api.getUsers();
});

async function handleCreate() {
    try {
        await api.createUser({
            username: 'newuser',
            email: 'user@example.com'
        });
    } catch (err) {
        console.error('Failed to create user:', err);
    }
}
</script>

<div>
    <h1>Users</h1>

    {#if api.error}
        <div class="error">{api.error}</div>
    {/if}

    <button onclick={handleCreate} disabled={api.loading}>
        {api.loading ? 'Creating...' : 'Create User'}
    </button>

    <ul>
        {#each api.users as user (user.id)}
            <li>{user.username} ({user.email})</li>
        {/each}
    </ul>
</div>
```

## IPC Patterns

### Request-Response Pattern

Backend:

```rust
#[tauri::command]
async fn fetch_data(id: String) -> Result<Data, String> {
    let data = database::fetch(&id).await?;
    Ok(data)
}
```

Frontend:

```typescript
const data = await invoke<Data>("fetch_data", { id: "123" });
```

### Streaming Pattern

Backend:

```rust
use tauri::{Manager, Window};

#[tauri::command]
async fn stream_data(window: Window) -> Result<(), String> {
    for i in 0..100 {
        window
            .emit("data-chunk", i)
            .map_err(|e| e.to_string())?;

        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }

    window
        .emit("data-complete", ())
        .map_err(|e| e.to_string())?;

    Ok(())
}
```

Frontend:

```typescript
import { listen } from "@tauri-apps/api/event";

const unlistenChunk = await listen<number>("data-chunk", (event) => {
  console.log("Received chunk:", event.payload);
});

const unlistenComplete = await listen("data-complete", () => {
  console.log("Streaming complete");
  unlistenChunk();
  unlistenComplete();
});

await invoke("stream_data");
```

### Pub-Sub Pattern

Backend:

```rust
use std::sync::Arc;
use parking_lot::RwLock;
use tauri::{AppHandle, Manager};

#[derive(Clone)]
pub struct EventBus {
    app: AppHandle,
}

impl EventBus {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }

    pub fn publish<T: serde::Serialize + Clone>(&self, event: &str, payload: T) {
        self.app.emit_all(event, payload).ok();
    }
}

#[tauri::command]
async fn subscribe_to_updates(app: AppHandle) -> Result<(), String> {
    let event_bus = EventBus::new(app);

    tokio::spawn(async move {
        loop {
            let update = fetch_latest_update().await;
            event_bus.publish("system-update", update);
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        }
    });

    Ok(())
}
```

Frontend:

```typescript
import { listen } from "@tauri-apps/api/event";

await invoke("subscribe_to_updates");

const unlisten = await listen("system-update", (event) => {
  console.log("Received update:", event.payload);
});
```

## State Synchronization

### Bi-directional Sync

Backend:

```rust
use std::sync::Arc;
use parking_lot::RwLock;
use tauri::{AppHandle, Manager, State};

#[derive(Clone, serde::Serialize)]
pub struct AppConfig {
    pub theme: String,
    pub language: String,
}

pub struct ConfigState {
    config: Arc<RwLock<AppConfig>>,
    app: AppHandle,
}

impl ConfigState {
    pub fn update_and_broadcast(&self, config: AppConfig) {
        *self.config.write() = config.clone();
        self.app.emit_all("config-changed", config).ok();
    }
}

#[tauri::command]
fn update_config(state: State<ConfigState>, config: AppConfig) -> Result<(), String> {
    state.update_and_broadcast(config);
    Ok(())
}

#[tauri::command]
fn get_config(state: State<ConfigState>) -> AppConfig {
    state.config.read().clone()
}
```

Frontend:

```typescript
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";

interface AppConfig {
  theme: string;
  language: string;
}

let config = $state<AppConfig>({ theme: "light", language: "en" });

listen<AppConfig>("config-changed", (event) => {
  config = event.payload;
});

async function updateTheme(theme: string) {
  config.theme = theme;
  await invoke("update_config", { config });
}
```
