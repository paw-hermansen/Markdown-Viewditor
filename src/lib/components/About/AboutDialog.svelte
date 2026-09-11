<script lang="ts">
  import { getVersion } from '@tauri-apps/api/app';
  import { relaunch } from '@tauri-apps/plugin-process';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { modLabel } from '$lib/utils/keyboard';
  import { updateStatus, checkForUpdates, updaterState } from '$lib/stores/update.svelte';
  import { settingsState, updateSetting } from '$lib/stores/settings.svelte';
  import { focusTrap } from '$lib/utils/focus-trap';
  import licenseText from '../../../../LICENSE?raw';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();
  let activeTab = $state<'about' | 'themes' | 'shortcuts' | 'dependencies' | 'license'>('about');
  let appVersion = $state('');
  let uiState = $state<'idle' | 'checking' | 'downloading' | 'installing' | 'up-to-date' | 'error'>('idle');
  let updateMessage = $state('');

  $effect(() => {
    if (open) {
      getVersion().then((v) => (appVersion = v)).catch(() => (appVersion = '0.1.0'));
      if (updateStatus.available) {
        uiState = 'idle';
        updateMessage = `Version ${updateStatus.version} is available`;
      }
    }
  });

  async function handleCheckForUpdates() {
    if (uiState === 'checking' || uiState === 'downloading' || uiState === 'installing') return;
    uiState = 'checking';
    updateMessage = '';
    const found = await checkForUpdates();
    if (found) {
      uiState = 'idle';
      updateMessage = `Version ${updateStatus.version} is available`;
    } else {
      uiState = 'up-to-date';
      updateMessage = 'You are on the latest version';
    }
  }

  async function handleDownloadAndInstall() {
    if (!updateStatus.pendingUpdate) return;
    try {
      uiState = 'downloading';
      updateMessage = 'Downloading...';
      let total = 0;
      let downloaded = 0;
      await updateStatus.pendingUpdate.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data.contentLength) {
          total = event.data.contentLength;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength ?? 0;
          if (total > 0) {
            updateMessage = `Downloading... ${Math.round((downloaded / total) * 100)}%`;
          }
        }
      });
      uiState = 'installing';
      updateMessage = 'Installing...';
      await relaunch();
    } catch (err) {
      uiState = 'error';
      updateMessage = err instanceof Error ? err.message : String(err);
    }
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
    { name: '@tauri-apps/api', license: 'MIT / Apache-2.0', copyright: 'Tauri Apps Contributors', url: 'https://tauri.app' },
    { name: 'tauri-plugin-fs', license: 'MIT / Apache-2.0', copyright: 'Tauri Apps Contributors', url: 'https://github.com/tauri-apps/plugins-workspace' },
    { name: 'tauri-plugin-dialog', license: 'MIT / Apache-2.0', copyright: 'Tauri Apps Contributors', url: 'https://github.com/tauri-apps/plugins-workspace' },
    { name: 'tauri-plugin-clipboard-manager', license: 'MIT / Apache-2.0', copyright: 'Tauri Apps Contributors', url: 'https://github.com/tauri-apps/plugins-workspace' },
    { name: 'tauri-plugin-store', license: 'MIT / Apache-2.0', copyright: 'Tauri Apps Contributors', url: 'https://github.com/tauri-apps/plugins-workspace' },
    { name: 'tauri-plugin-opener', license: 'MIT / Apache-2.0', copyright: 'Tauri Apps Contributors', url: 'https://github.com/tauri-apps/plugins-workspace' },
    { name: 'tauri-plugin-updater', license: 'MIT / Apache-2.0', copyright: 'Tauri Apps Contributors', url: 'https://github.com/tauri-apps/plugins-workspace' },
    { name: 'tauri-plugin-process', license: 'MIT / Apache-2.0', copyright: 'Tauri Apps Contributors', url: 'https://github.com/tauri-apps/plugins-workspace' },
    { name: '@tauri-apps/plugin-dialog', license: 'MIT / Apache-2.0', copyright: 'Tauri Apps Contributors', url: 'https://github.com/tauri-apps/plugins-workspace' },
    { name: '@tauri-apps/plugin-opener', license: 'MIT / Apache-2.0', copyright: 'Tauri Apps Contributors', url: 'https://github.com/tauri-apps/plugins-workspace' },
    { name: '@tauri-apps/plugin-store', license: 'MIT / Apache-2.0', copyright: 'Tauri Apps Contributors', url: 'https://github.com/tauri-apps/plugins-workspace' },
    { name: '@tauri-apps/plugin-updater', license: 'MIT / Apache-2.0', copyright: 'Tauri Apps Contributors', url: 'https://github.com/tauri-apps/plugins-workspace' },
    { name: '@tauri-apps/plugin-process', license: 'MIT / Apache-2.0', copyright: 'Tauri Apps Contributors', url: 'https://github.com/tauri-apps/plugins-workspace' },
    { name: 'Svelte 5', license: 'MIT', copyright: 'Svelte Contributors', url: 'https://svelte.dev' },
    { name: 'SvelteKit', license: 'MIT', copyright: 'Svelte Contributors', url: 'https://kit.svelte.dev' },
    { name: 'Vite', license: 'MIT', copyright: 'Evan You', url: 'https://vitejs.dev' },
    { name: 'TypeScript', license: 'Apache-2.0', copyright: 'Microsoft Corp.', url: 'https://www.typescriptlang.org' },
    { name: 'CodeMirror 6', license: 'MIT', copyright: 'Marijn Haverbeke et al.', url: 'https://codemirror.net' },
    { name: 'markdown-it', license: 'MIT', copyright: 'Vitaly Puzrin, Alex Kocharin', url: 'https://github.com/markdown-it/markdown-it' },
    { name: 'markdown-it-highlightjs', license: 'Unlicense', copyright: 'Valérian Galliat', url: 'https://github.com/valeriangalliat/markdown-it-highlightjs' },
    { name: 'markdown-it-task-lists', license: 'ISC', copyright: 'Revin Guillen', url: 'https://github.com/revin/markdown-it-task-lists' },
    { name: 'markdown-it-footnote', license: 'MIT', copyright: 'Vitaly Puzrin, Alex Kocharin', url: 'https://github.com/markdown-it/markdown-it-footnote' },
    { name: 'markdown-it-anchor', license: 'Unlicense', copyright: 'Valérian Galliat', url: 'https://github.com/valeriangalliat/markdown-it-anchor' },
    { name: 'js-yaml', license: 'MIT', copyright: 'Vitaly Puzrin', url: 'https://github.com/nodeca/js-yaml' },
    { name: 'highlight.js', license: 'BSD 3-Clause', copyright: 'Ivan Sagalaev', url: 'https://highlightjs.org' },
    { name: 'serde', license: 'MIT / Apache-2.0', copyright: 'The Rust Project Developers', url: 'https://serde.rs' },
    { name: 'serde_json', license: 'MIT / Apache-2.0', copyright: 'The Rust Project Developers', url: 'https://github.com/serde-rs/json' },
    { name: 'thiserror', license: 'MIT / Apache-2.0', copyright: 'David Tolnay', url: 'https://github.com/dtolnay/thiserror' },
    { name: 'KaTeX', license: 'MIT', copyright: 'Khan Academy', url: 'https://katex.org' },
    { name: '@vscode/markdown-it-katex', license: 'MIT', copyright: 'Microsoft Corp.', url: 'https://github.com/microsoft/vscode-markdown-it-katex' },
    { name: 'mhchem (KaTeX contrib)', license: 'Apache-2.0', copyright: 'Martin Hensel, MathJax Consortium', url: 'https://github.com/mhchem/MathJax-mhchem' },
    { name: 'jszip', license: 'MIT / GPL-3.0', copyright: 'Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso', url: 'https://github.com/Stuk/jszip' },
    { name: 'mime_guess', license: 'MIT', copyright: 'Austin Bonander', url: 'https://github.com/abonander/mime_guess' },
    { name: 'percent-encoding', license: 'MIT / Apache-2.0', copyright: 'The rust-url developers', url: 'https://github.com/servo/rust-url' },
    { name: 'base64', license: 'MIT / Apache-2.0', copyright: 'Alice Maz', url: 'https://github.com/marshallpierce/rust-base64' },
    { name: 'resvg', license: 'Apache-2.0 / MIT', copyright: 'the Resvg Authors', url: 'https://github.com/linebender/resvg' },
    { name: 'usvg', license: 'Apache-2.0 / MIT', copyright: 'the Resvg Authors', url: 'https://github.com/linebender/resvg' },
    { name: 'tiny-skia', license: 'BSD 3-Clause', copyright: 'Google Inc., Yevhenii Reizner', url: 'https://github.com/linebender/tiny-skia' },
    { name: 'objc2', license: 'MIT', copyright: 'Mads Marquart', url: 'https://github.com/madsmtm/objc2' },
    { name: 'objc2-web-kit', license: 'MIT / Apache-2.0 / Zlib', copyright: 'Mads Marquart', url: 'https://github.com/madsmtm/objc2' },
    { name: 'objc2-foundation', license: 'MIT', copyright: 'Mads Marquart', url: 'https://github.com/madsmtm/objc2' },
    { name: 'block2', license: 'MIT', copyright: 'Mads Marquart', url: 'https://github.com/madsmtm/objc2' },
  ];
</script>

{#if open}
  <div class="backdrop" role="presentation" onclick={handleBackdropClick}>
    <div class="dialog" role="dialog" aria-label="About Markdown Viewditor" aria-modal="true" use:focusTrap={{ onEscape: onClose }}>
      <button class="close-btn" onclick={onClose} aria-label="Close">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <div class="header">
        <h1>Markdown Viewditor</h1>
        <p class="version">Version {appVersion || '0.1.0'}</p>
      </div>

      <div class="tabs" role="tablist">
        <button class="tab" class:active={activeTab === 'about'} role="tab" id="tab-about" aria-selected={activeTab === 'about'} aria-controls="panel-about" onclick={() => activeTab = 'about'}>About</button>
        <button class="tab" class:active={activeTab === 'shortcuts'} role="tab" id="tab-shortcuts" aria-selected={activeTab === 'shortcuts'} aria-controls="panel-shortcuts" onclick={() => activeTab = 'shortcuts'}>Keyboard Shortcuts</button>
        <button class="tab" class:active={activeTab === 'dependencies'} role="tab" id="tab-dependencies" aria-selected={activeTab === 'dependencies'} aria-controls="panel-dependencies" onclick={() => activeTab = 'dependencies'}>Dependencies</button>
        <button class="tab" class:active={activeTab === 'license'} role="tab" id="tab-license" aria-selected={activeTab === 'license'} aria-controls="panel-license" onclick={() => activeTab = 'license'}>License</button>
      </div>

      <div class="tab-content">
        {#if activeTab === 'about'}
          <div role="tabpanel" id="panel-about" aria-labelledby="tab-about">
          <section>
            {#if updaterState.enabled}
            <h2>Updates</h2>
            <div class="update-row">
              <button
                class="update-btn"
                onclick={handleCheckForUpdates}
                disabled={uiState === 'checking' || uiState === 'downloading' || uiState === 'installing'}
              >
                {#if uiState === 'checking'}
                  Checking...
                {:else if uiState === 'downloading'}
                  Downloading
                {:else if uiState === 'installing'}
                  Installing
                {:else}
                  Check for Updates
                {/if}
              </button>
              {#if updateStatus.available}
                <button class="update-btn primary" onclick={handleDownloadAndInstall} disabled={uiState === 'downloading' || uiState === 'installing'}>
                  Download &amp; Install {updateStatus.version}
                </button>
              {/if}
              {#if updateMessage}
                <span class="update-msg" class:error={uiState === 'error'}>{updateMessage}</span>
              {/if}
            </div>
            <label class="auto-check-toggle">
              <input
                type="checkbox"
                checked={settingsState.autoCheckUpdates}
                onchange={() => updateSetting('autoCheckUpdates', !settingsState.autoCheckUpdates)}
              />
              <span>Auto-check for updates on startup</span>
            </label>
            <p class="muted">In-app updates are disabled when running inside Flatpak or the Windows Store — use your system updater there.</p>
            {/if}
          </section>

          <section>
            <h2>Author</h2>
            <p>Paw Hermansen<br/><span class="muted">Retired Senior Software Developer</span></p>
          </section>

          <section>
            <h2>Project</h2>
            <p>
              <button class="link" data-href="https://github.com/paw-hermansen/Markdown-Viewditor" onclick={() => handleLink('https://github.com/paw-hermansen/Markdown-Viewditor')}>github.com/paw-hermansen/Markdown-Viewditor</button>
            </p>
          </section>

          <section>
            <h2>Privacy Policy</h2>
            <p>
              <button class="link" data-href="https://github.com/paw-hermansen/Markdown-Viewditor/blob/main/PRIVACY-POLICY.md" onclick={() => handleLink('https://github.com/paw-hermansen/Markdown-Viewditor/blob/main/PRIVACY-POLICY.md')}>PRIVACY-POLICY.md</button>
            </p>
          </section>

          <section>
            <h2>AI-Augmented Development</h2>
            <p>
              This application was built by a human Senior Software Developer with the help of
              <button class="link" data-href="https://opencode.ai" onclick={() => handleLink('https://opencode.ai')}>OpenCode</button>,
              an AI-powered coding assistant. Development used multiple AI models and specialized skill files.
            </p>
          </section>

          <section>
            <h2>License</h2>
            <p>
              Licensed under the
              <button class="link" onclick={() => activeTab = 'license'}>MIT License</button>.
              You are free to use, modify, and distribute this software.
            </p>
          </section>

          <section>
            <h2>Documentation</h2>
            <p>Detailed guides and references are available on GitHub:</p>
            <ul>
              <li><button class="link" data-href="https://github.com/paw-hermansen/Markdown-Viewditor/tree/main/docs/Examples.md" onclick={() => handleLink('https://github.com/paw-hermansen/Markdown-Viewditor/tree/main/docs/Examples.md')}>Markdown Examples</button> &mdash; syntax reference for all supported markdown features</li>
              <li><button class="link" data-href="https://github.com/paw-hermansen/Markdown-Viewditor/tree/main/docs/CustomThemes.md" onclick={() => handleLink('https://github.com/paw-hermansen/Markdown-Viewditor/tree/main/docs/CustomThemes.md')}>Custom Themes</button> &mdash; creating and installing custom CSS themes</li>
              <li><button class="link" data-href="https://github.com/paw-hermansen/Markdown-Viewditor/tree/main/docs/Math.md" onclick={() => handleLink('https://github.com/paw-hermansen/Markdown-Viewditor/tree/main/docs/Math.md')}>Math Formulas</button> &mdash; KaTeX math rendering and delimiter syntax</li>
              <li><button class="link" data-href="https://github.com/paw-hermansen/Markdown-Viewditor/tree/main/docs/Chemistry.md" onclick={() => handleLink('https://github.com/paw-hermansen/Markdown-Viewditor/tree/main/docs/Chemistry.md')}>Chemical Formulas</button> &mdash; mhchem equations and physical units</li>
            </ul>
          </section>
          </div>
        {/if}

        {#if activeTab === 'shortcuts'}
          <div role="tabpanel" id="panel-shortcuts" aria-labelledby="tab-shortcuts">
          <section>
            <h2>Command Palette</h2>
            <p>Press <kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">{modLabel('Shift')}</kbd> + <kbd class="shortcut-key">P</kbd> to open the Command Palette for quick access to all commands.</p>
          </section>

          <section>
            <h2>File</h2>
            <table class="ref-table">
              <thead>
                <tr><th>Action</th><th>Shortcut</th></tr>
              </thead>
              <tbody>
                <tr><td>New File</td><td><kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">N</kbd></td></tr>
                <tr><td>Open File</td><td><kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">O</kbd></td></tr>
                <tr><td>Save</td><td><kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">S</kbd></td></tr>
                <tr><td>Save As</td><td><kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">{modLabel('Shift')}</kbd> + <kbd class="shortcut-key">S</kbd></td></tr>
                <tr><td>Reload from Disk</td><td><kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">R</kbd></td></tr>
                <tr><td>Quit</td><td><kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">Q</kbd></td></tr>
                <tr><td>Print / Create PDF</td><td><kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">P</kbd></td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2>Editor</h2>
            <table class="ref-table">
              <thead>
                <tr><th>Action</th><th>Shortcut</th></tr>
              </thead>
              <tbody>
                <tr><td>Bold</td><td><kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">B</kbd></td></tr>
                <tr><td>Italic</td><td><kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">I</kbd></td></tr>
                <tr><td>Strikethrough</td><td><kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">{modLabel('Shift')}</kbd> + <kbd class="shortcut-key">X</kbd></td></tr>
                <tr><td>Highlight</td><td><kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">{modLabel('Shift')}</kbd> + <kbd class="shortcut-key">M</kbd></td></tr>
                <tr><td>Heading</td><td><kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">{modLabel('Shift')}</kbd> + <kbd class="shortcut-key">H</kbd></td></tr>
                <tr><td>Insert Link</td><td><kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">K</kbd></td></tr>
                <tr><td>Insert Image</td><td><kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">{modLabel('Shift')}</kbd> + <kbd class="shortcut-key">I</kbd></td></tr>
                <tr><td>Inline Code / Code Block</td><td><kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">E</kbd> (toggles)</td></tr>
                <tr><td>Bullet List</td><td><kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">{modLabel('Shift')}</kbd> + <kbd class="shortcut-key">8</kbd></td></tr>
                <tr><td>Numbered List</td><td><kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">{modLabel('Shift')}</kbd> + <kbd class="shortcut-key">7</kbd></td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2>View</h2>
            <table class="ref-table">
              <thead>
                <tr><th>Action</th><th>Shortcut</th></tr>
              </thead>
              <tbody>
                <tr><td>Cycle View Mode</td><td><kbd class="shortcut-key">{modLabel('Ctrl')}</kbd> + <kbd class="shortcut-key">{modLabel('Shift')}</kbd> + <kbd class="shortcut-key">V</kbd></td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2>Help</h2>
            <table class="ref-table">
              <thead>
                <tr><th>Action</th><th>Shortcut</th></tr>
              </thead>
              <tbody>
                <tr><td>About</td><td><kbd class="shortcut-key">F1</kbd></td></tr>
              </tbody>
            </table>
          </section>
          </div>
        {/if}

        {#if activeTab === 'dependencies'}
          <div role="tabpanel" id="panel-dependencies" aria-labelledby="tab-dependencies">
          <section>
            <h2>Third-Party Libraries</h2>
            <table class="deps-table">
              <thead>
                <tr><th>Library</th><th>License</th><th>Copyright</th></tr>
              </thead>
              <tbody>
                {#each dependencies as dep}
                  <tr>
                    <td><button class="link" data-href={dep.url} onclick={() => handleLink(dep.url)}>{dep.name}</button></td>
                    <td>{dep.license}</td>
                    <td class="muted">{dep.copyright}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </section>
          </div>
        {/if}

        {#if activeTab === 'license'}
          <div role="tabpanel" id="panel-license" aria-labelledby="tab-license">
          <section>
            <h2>MIT License</h2>
            <pre class="license-text">{licenseText}</pre>
          </section>
          </div>
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

  .update-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }

  .update-btn {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-size: 13px;
    cursor: pointer;
    transition: all 150ms ease-in-out;
  }

  .update-btn:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .update-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .update-btn.primary {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }

  .update-btn.primary:hover:not(:disabled) {
    background: var(--accent);
    border-color: var(--accent);
    opacity: 0.85;
  }

  .update-msg {
    font-size: 13px;
    color: var(--text-secondary);
  }

  .update-msg.error {
    color: #e06c75;
  }

  .auto-check-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    font-size: 13px;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .auto-check-toggle input {
    accent-color: var(--accent);
    cursor: pointer;
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
    color: var(--text-primary);
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
    text-align: left;
    position: relative;
  }

  .link:hover {
    text-decoration: underline;
  }

  .link[data-href]::after {
    content: attr(data-href);
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.8em;
    font-family: monospace;
    white-space: nowrap;
    max-width: 400px;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    visibility: hidden;
    text-decoration: none;
  }

  .link[data-href]:hover::after {
    visibility: visible;
  }

  .shortcut-key {
    display: inline-block;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 6px;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-primary);
    box-shadow: 0 1px 0 var(--border);
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

  .deps-table td:nth-child(3) {
    font-size: 12px;
  }

  .license-text {
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 16px;
    overflow-y: auto;
    max-height: 400px;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-wrap: break-word;
    margin-top: 8px;
  }
</style>
