<script lang="ts">
  import { modLabel } from '$lib/utils/keyboard';

  let { onFormat }: { onFormat: (format: string) => void } = $props();

  const formats = [
    { id: 'bold', label: 'B', title: modLabel('Bold (Ctrl+B)'), cls: 'icon-bold' },
    { id: 'italic', label: 'I', title: modLabel('Italic (Ctrl+I)'), cls: 'icon-italic' },
    { id: 'strikethrough', label: 'S', title: modLabel('Strikethrough (Ctrl+Shift+X)'), cls: 'icon-strikethrough' },
    { id: 'highlight', label: 'M', title: modLabel('Highlight (Ctrl+Shift+M)'), cls: 'icon-highlight' },
    { id: 'heading', label: 'H', title: modLabel('Heading (Ctrl+Shift+H)'), cls: 'icon-heading' },
    { id: 'link', label: '🔗', title: modLabel('Link (Ctrl+K)'), cls: '' },
    { id: 'image', label: '🖼', title: modLabel('Image (Ctrl+Shift+I)'), cls: '' },
    { id: 'code', label: '</>', title: modLabel('Code (Ctrl+E, toggles)'), cls: 'icon-code' },
    { id: 'bullet', label: '•', title: modLabel('Bullet List (Ctrl+Shift+8)'), cls: '' },
    { id: 'numbered', label: '1.', title: modLabel('Numbered List (Ctrl+Shift+7)'), cls: '' },
    { id: 'task', label: '☑', title: 'Task List', cls: '' },
    { id: 'quote', label: '❝', title: 'Blockquote', cls: '' },
    { id: 'hr', label: '—', title: 'Horizontal Rule', cls: '' }
  ];

  function handleToolbarKeydown(e: KeyboardEvent) {
    const buttons = Array.from(document.querySelectorAll('.editor-toolbar .toolbar-btn')) as HTMLElement[];
    const currentIndex = buttons.indexOf(document.activeElement as HTMLElement);

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = (currentIndex + 1) % buttons.length;
      buttons[next]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = (currentIndex - 1 + buttons.length) % buttons.length;
      buttons[prev]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      buttons[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      buttons[buttons.length - 1]?.focus();
    }
  }
</script>

<div class="editor-toolbar" role="toolbar" aria-label="Formatting" tabindex="0" onkeydown={handleToolbarKeydown}>
  {#each formats as format}
    <button
      class="toolbar-btn {format.cls}"
      title={format.title}
      aria-label={format.title}
      onmousedown={(e) => { e.preventDefault(); }}
      onclick={() => onFormat(format.id)}
    >
      {format.label}
    </button>
  {/each}
</div>

<style>
  .editor-toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    overflow-y: hidden;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 32px;
    padding: 0 4px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    transition: all 150ms ease-in-out;
  }

  .toolbar-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .toolbar-btn:active {
    background: var(--accent);
    color: white;
  }

  .icon-bold {
    font-weight: 800;
  }

  .icon-italic {
    font-style: italic;
    font-weight: 500;
  }

  .icon-strikethrough {
    text-decoration: line-through;
    text-decoration-thickness: 2px;
  }

  .icon-highlight {
    background: linear-gradient(to top, var(--toolbar-highlight, #fde68a) 40%, transparent 40%);
    padding: 0 3px;
    border-radius: 2px;
  }

  .icon-heading {
    font-weight: 700;
    font-size: 15px;
  }

  .icon-code {
    font-family: monospace;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: -0.5px;
  }
</style>
