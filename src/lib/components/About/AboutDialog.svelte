<script lang="ts">
  import { openUrl } from '@tauri-apps/plugin-opener';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();
  let activeTab = $state<'about' | 'themes' | 'dependencies'>('about');

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  async function handleLink(url: string) {
    try {
      await openUrl(url);
    } catch (err) {
      console.warn('Failed to open URL:', err);
    }
  }

  const dependencies = [
    { name: 'Tauri v2', license: 'MIT / Apache-2.0', copyright: 'Tauri Apps Contributors', url: 'https://tauri.app' },
    { name: 'Svelte 5', license: 'MIT', copyright: 'Svelte Contributors', url: 'https://svelte.dev' },
    { name: 'SvelteKit', license: 'MIT', copyright: 'Svelte Contributors', url: 'https://kit.svelte.dev' },
    { name: 'Vite', license: 'MIT', copyright: 'Evan You', url: 'https://vitejs.dev' },
    { name: 'TypeScript', license: 'Apache-2.0', copyright: 'Microsoft Corp.', url: 'https://www.typescriptlang.org' },
    { name: 'CodeMirror 6', license: 'MIT', copyright: 'Marijn Haverbeke et al.', url: 'https://codemirror.net' },
    { name: 'markdown-it', license: 'MIT', copyright: 'Vitaly Puzrin, Alex Kocharin', url: 'https://github.com/markdown-it/markdown-it' },
    { name: 'highlight.js', license: 'BSD 3-Clause', copyright: 'Ivan Sagalaev', url: 'https://highlightjs.org' },
  ];
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="backdrop" role="presentation" onclick={handleBackdropClick}>
    <div class="dialog" role="dialog" aria-label="About Markdown Viewditor">
      <button class="close-btn" onclick={onClose} aria-label="Close">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <div class="header">
        <h1>Markdown Viewditor</h1>
        <p class="version">Version 0.1.0</p>
      </div>

      <div class="tabs" role="tablist">
        <button class="tab" class:active={activeTab === 'about'} role="tab" aria-selected={activeTab === 'about'} onclick={() => activeTab = 'about'}>About</button>
        <button class="tab" class:active={activeTab === 'themes'} role="tab" aria-selected={activeTab === 'themes'} onclick={() => activeTab = 'themes'}>Custom Themes</button>
        <button class="tab" class:active={activeTab === 'dependencies'} role="tab" aria-selected={activeTab === 'dependencies'} onclick={() => activeTab = 'dependencies'}>Dependencies</button>
      </div>

      <div class="tab-content">
        {#if activeTab === 'about'}
          <section>
            <h2>Author</h2>
            <p>Paw Hermansen<br/><span class="muted">Retired Senior Software Developer</span></p>
          </section>

          <section>
            <h2>AI-Assisted Development</h2>
            <p>
              This application was built with the help of
              <button class="link" onclick={() => handleLink('https://opencode.ai')}>OpenCode</button>,
              an AI-powered coding assistant. Development used multiple AI models and
              specialized skill files for among others frontend design, documentation, and theme creation.
            </p>
          </section>

          <section>
            <h2>License</h2>
            <p>
              Licensed under the
              <button class="link" onclick={() => handleLink('https://opensource.org/licenses/MIT')}>MIT License</button>.
              You are free to use, modify, and distribute this software.
            </p>
          </section>
        {/if}

        {#if activeTab === 'themes'}
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
            <p class="muted">Custom theme css files are auto-detected after a restart and included in the apps theme drop-down.</p>
            <p class="muted">The themes are mainly focused on styling the Viewer. The theme type (dark/light) is auto-detected from the CSS content and is used elsewhere in the app.</p>
          </section>

          <section>
            <h2>What can be customized</h2>
            <p>A theme file can override code block syntax highlighting and app UI colors.</p>
            <p class="muted"><strong>Code highlighting</strong> uses <code>.hljs</code> classes. <strong>App colors</strong> use CSS custom properties like <code>--bg-primary</code>, <code>--text-primary</code>, <code>--accent</code>, etc.</p>
          </section>

          <section>
            <h2>Example: One Dark theme</h2>
            <p>Create <code>one-dark.css</code> in the themes directory:</p>
            <pre class="code-example"><code>{`/* Code highlighting */
.hljs { color: #abb2bf; background: #282c34; }
.hljs-keyword, .hljs-doctag { color: #c678dd; }
.hljs-string, .hljs-regexp { color: #98c379; }
.hljs-comment { color: #5c6370; font-style: italic; }
.hljs-number, .hljs-literal { color: #d19a66; }
.hljs-function .hljs-title { color: #61afef; }
.hljs-built_in { color: #e5c07b; }
.hljs-attr, .hljs-attribute { color: #d19a66; }

/* App UI */
:root {
  --bg-primary: #282c34;
  --bg-secondary: #21252b;
  --bg-tertiary: #2c313a;
  --bg-hover: rgba(255, 255, 255, 0.05);
  --text-primary: #abb2bf;
  --text-secondary: #828997;
  --text-muted: #5c6370;
  --accent: #c678dd;
  --border: #3e4451;
}`}</code></pre>
          </section>
        {/if}

        {#if activeTab === 'dependencies'}
          <section>
            <h2>Third-Party Libraries</h2>
            <table class="deps-table">
              <thead>
                <tr><th>Library</th><th>License</th><th>Copyright</th></tr>
              </thead>
              <tbody>
                {#each dependencies as dep}
                  <tr>
                    <td><button class="link" onclick={() => handleLink(dep.url)}>{dep.name}</button></td>
                    <td>{dep.license}</td>
                    <td class="muted">{dep.copyright}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </section>
        {/if}
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

  .header {
    padding: 28px 28px 0;
  }

  h1 {
    font-size: 22px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .version {
    color: var(--text-secondary);
    font-size: 14px;
    margin-bottom: 20px;
  }

  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border);
    padding: 0 28px;
  }

  .tab {
    padding: 8px 16px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: all 150ms ease-in-out;
  }

  .tab:hover {
    color: var(--text-primary);
  }

  .tab.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .tab-content {
    padding: 20px 28px 28px;
  }

  section {
    margin-bottom: 20px;
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

  .link {
    color: var(--accent);
    text-decoration: none;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-size: inherit;
    line-height: inherit;
    vertical-align: baseline;
  }

  .link:hover {
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

  .code-example {
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px;
    overflow-x: auto;
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-primary);
    margin-top: 8px;
  }

  .code-example code {
    background: none;
    padding: 0;
    font-size: inherit;
  }

  .deps-table td:nth-child(3) {
    font-size: 12px;
  }
</style>
