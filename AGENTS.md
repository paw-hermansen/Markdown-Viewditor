# Project Agents Guide

## Project Overview

**Markdown Viewditor** - A markdown viewer and editor with **live preview** built with:

- **Backend**: Rust (Tauri v2)
- **Frontend**: Svelte 5 + SvelteKit
- **Platforms**: Linux, macOS, Windows, Android, iOS

## Key Commands

```bash
# Development
npm install
npm run dev                    # or: npm run tauri dev

# Build
npm run build                  # or: npm run tauri build

# Mobile
npm run tauri android init
npm run tauri android dev
npm run tauri ios init
npm run tauri ios dev

# Lint & Typecheck
npm run lint
npm run check
cargo clippy
```

## Coding Conventions

### Svelte Components

- Use `.svelte` extension, PascalCase names
- Use `$state()` for reactive state
- Use `$derived()` for computed values
- Use `$effect()` for side effects
- Use `$props()` for component props
- Use `onclick` not `on:click`
- Use snippets `{@render}` not `<slot>`

### Rust Code

- Use `snake_case` functions, `PascalCase` types
- Use `#[tauri::command]` for IPC
- Return `Result<T, E>` for error handling
- Use `lib.rs` for all logic (mobile requirement)

### CSS

- CSS custom properties (variables)
- 8px spacing grid
- Support dark/light themes
- Responsive design

## Critical Patterns

### Tauri v2 Entry Point

```rust
// src-tauri/src/lib.rs
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![commands...])
        .run(tauri::generate_context!())
        .expect("error");
}

// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    app_lib::run();
}
```

### Svelte 5 Component

```svelte
<script>
  let { name = $bindable('') } = $props();
  let doubled = $derived(name.length * 2);

  $effect(() => {
    console.log('Name changed:', name);
  });
</script>

<input bind:value={name} />
<p>Length: {doubled}</p>
```

### Calling Rust from Svelte

```svelte
<script>
  import { invoke } from '@tauri-apps/api/core';

  async function readFile(path) {
    return await invoke('read_file', { path });
  }
</script>
```

### Live Preview Pattern

```svelte
<script>
  import MarkdownIt from 'markdown-it';

  let content = $state('# Hello World');
  let html = $derived(md.render(content));

  const md = new MarkdownIt();
</script>

<textarea bind:value={content}></textarea>
<div>{@html html}</div>
```

## Common Mistakes to Avoid

| Mistake                  | Solution                           |
| ------------------------ | ---------------------------------- |
| `let` without `$state()` | Use `$state()` for reactive vars   |
| `on:click` syntax        | Use `onclick` (Svelte 5)           |
| `<slot>`                 | Use `{@render children()}`         |
| `&str` in async commands | Use `String` (owned type)          |
| Missing capabilities     | Add to `capabilities/default.json` |
| Commands not registered  | Add to `generate_handler![]`       |

## Resources

- Tauri: https://v2.tauri.app
- Svelte: https://svelte.dev
- SvelteKit: https://kit.svelte.dev
- Skill files: `.opencode/skills/`
- Development plan: `PLAN.md`
- Design specs: `GUI-DESIGN.md`
