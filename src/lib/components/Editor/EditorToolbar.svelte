<script lang="ts">
  let { onFormat }: { onFormat: (format: string) => void } = $props();

  const formats = [
    { id: 'bold', label: 'B', title: 'Bold (Ctrl+B)', icon: 'B' },
    { id: 'italic', label: 'I', title: 'Italic (Ctrl+I)', icon: 'I' },
    { id: 'heading', label: 'H', title: 'Heading', icon: 'H' },
    { id: 'link', label: '🔗', title: 'Link (Ctrl+K)', icon: '🔗' },
    { id: 'image', label: '🖼', title: 'Image', icon: '🖼' },
    { id: 'code', label: '`', title: 'Inline Code', icon: '`' },
    { id: 'codeblock', label: '```', title: 'Code Block', icon: '```' },
    { id: 'bullet', label: '•', title: 'Bullet List', icon: '•' },
    { id: 'numbered', label: '1.', title: 'Numbered List', icon: '1.' },
    { id: 'task', label: '☑', title: 'Task List', icon: '☑' },
    { id: 'quote', label: '❝', title: 'Blockquote', icon: '❝' },
    { id: 'hr', label: '—', title: 'Horizontal Rule', icon: '—' }
  ];
</script>

<div class="editor-toolbar">
  {#each formats as format}
    <button
      class="toolbar-btn"
      title={format.title}
      onclick={() => onFormat(format.id)}
    >
      {format.icon}
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
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
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
</style>
