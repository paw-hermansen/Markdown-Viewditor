<script lang="ts">
  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  const dependencies = [
    { name: 'Tauri v2', license: 'MIT / Apache-2.0', url: 'https://tauri.app' },
    { name: 'Svelte 5', license: 'MIT', url: 'https://svelte.dev' },
    { name: 'SvelteKit', license: 'MIT', url: 'https://kit.svelte.dev' },
    { name: 'Vite', license: 'MIT', url: 'https://vitejs.dev' },
    { name: 'TypeScript', license: 'Apache-2.0', url: 'https://www.typescriptlang.org' },
    { name: 'CodeMirror 6', license: 'MIT', url: 'https://codemirror.net' },
    { name: 'markdown-it', license: 'MIT', url: 'https://github.com/markdown-it/markdown-it' },
    { name: 'highlight.js', license: 'BSD 3-Clause', url: 'https://highlightjs.org' },
  ];
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="backdrop" role="presentation" onclick={handleBackdropClick}>
    <div class="dialog" role="dialog" aria-label="About Markdown Viewditor">
      <button class="close-btn" onclick={onClose} aria-label="Close">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <div class="content">
        <h1>Markdown Viewditor</h1>
        <p class="version">Version 0.1.0</p>

        <section>
          <h2>Author</h2>
          <p>Paw Hermansen<br/><span class="muted">Retired Senior Software Developer</span></p>
        </section>

        <section>
          <h2>AI-Assisted Development</h2>
          <p>
            This application was built with the help of
            <a href="https://opencode.ai" target="_blank" rel="noopener">OpenCode</a>,
            an AI-powered coding assistant. Development used multiple AI models and
            specialized skill files for frontend design, documentation, and theme creation.
          </p>
        </section>

        <section>
          <h2>License</h2>
          <p>
            Licensed under the
            <a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener">MIT License</a>.
            You are free to use, modify, and distribute this software.
          </p>
        </section>

        <section>
          <h2>Dependencies</h2>
          <table>
            <thead>
              <tr><th>Library</th><th>License</th></tr>
            </thead>
            <tbody>
              {#each dependencies as dep}
                <tr>
                  <td><a href={dep.url} target="_blank" rel="noopener">{dep.name}</a></td>
                  <td>{dep.license}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          <p class="muted details-link">See THIRD-PARTY-LICENSES.md for full license texts.</p>
        </section>

        <section>
          <h2>Custom Themes</h2>
          <p>Place <code>.css</code> files in the themes directory:</p>
          <table>
            <thead>
              <tr><th>Platform</th><th>Path</th></tr>
            </thead>
            <tbody>
              <tr><td>Linux</td><td><code>~/.config/com.markdown-viewditor.app/themes/</code></td></tr>
              <tr><td>macOS</td><td><code>~/Library/Application Support/com.markdown-viewditor.app/themes/</code></td></tr>
              <tr><td>Windows</td><td><code>%APPDATA%\com.markdown-viewditor.app\themes\</code></td></tr>
            </tbody>
          </table>
          <p class="muted">
            Themes can override code highlighting (<code>.hljs</code> classes)
            and app colors (<code>--bg-primary</code>, <code>--text-primary</code>, etc.).
            See README.md for a complete example.
          </p>
        </section>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    animation: fade-in 150ms ease-out;
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .dialog {
    position: relative;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    max-width: 560px;
    width: 90vw;
    max-height: 85vh;
    overflow-y: auto;
    animation: slide-up 150ms ease-out;
  }

  @keyframes slide-up {
    from { transform: translateY(16px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    border-radius: 6px;
    cursor: pointer;
    transition: all 150ms ease-in-out;
  }

  .close-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .content {
    padding: 32px;
  }

  h1 {
    font-size: 22px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .version {
    color: var(--text-secondary);
    font-size: 14px;
    margin-bottom: 24px;
  }

  section {
    margin-bottom: 24px;
  }

  section:last-child {
    margin-bottom: 0;
  }

  h2 {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  p {
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-primary);
  }

  .muted {
    color: var(--text-muted);
    font-size: 13px;
  }

  a {
    color: var(--accent);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  code {
    background: var(--bg-tertiary);
    padding: 1px 5px;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 12px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0;
    font-size: 13px;
  }

  th, td {
    text-align: left;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
  }

  th {
    color: var(--text-muted);
    font-weight: 600;
    font-size: 12px;
  }

  td a {
    font-weight: 500;
  }

  .details-link {
    margin-top: 8px;
  }
</style>
