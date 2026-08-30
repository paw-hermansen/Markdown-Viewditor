<script lang="ts">
  import { getVersion } from '@tauri-apps/api/app';
  import { relaunch } from '@tauri-apps/plugin-process';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { modLabel } from '$lib/utils/keyboard';
  import { updateStatus, checkForUpdates } from '$lib/stores/update.svelte';
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
        <button class="tab" class:active={activeTab === 'themes'} role="tab" id="tab-themes" aria-selected={activeTab === 'themes'} aria-controls="panel-themes" onclick={() => activeTab = 'themes'}>Custom Themes</button>
        <button class="tab" class:active={activeTab === 'shortcuts'} role="tab" id="tab-shortcuts" aria-selected={activeTab === 'shortcuts'} aria-controls="panel-shortcuts" onclick={() => activeTab = 'shortcuts'}>Keyboard Shortcuts</button>
        <button class="tab" class:active={activeTab === 'dependencies'} role="tab" id="tab-dependencies" aria-selected={activeTab === 'dependencies'} aria-controls="panel-dependencies" onclick={() => activeTab = 'dependencies'}>Dependencies</button>
        <button class="tab" class:active={activeTab === 'license'} role="tab" id="tab-license" aria-selected={activeTab === 'license'} aria-controls="panel-license" onclick={() => activeTab = 'license'}>License</button>
      </div>

      <div class="tab-content">
        {#if activeTab === 'about'}
          <div role="tabpanel" id="panel-about" aria-labelledby="tab-about">
          <section>
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
            <p class="muted">In-app updates are disabled when running inside Flatpak, Snap, or the Windows Store — use your system updater there.</p>
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
          </div>
        {/if}

        {#if activeTab === 'themes'}
          <div role="tabpanel" id="panel-themes" aria-labelledby="tab-themes">
          <section>
            <h2>Custom Themes</h2>
            <p>A custom theme is a CSS file that styles code highlighting and the rendered markdown. Place <code>.css</code> files in the themes directory:</p>
            <table>
              <thead>
                <tr><th>Platform</th><th>Path</th></tr>
              </thead>
              <tbody>
                <tr><td>Linux</td><td><code>~/.config/com.github.paw-hermansen.markdown-viewditor/themes/</code></td></tr>
                <tr><td>macOS</td><td><code>~/Library/Application Support/com.github.paw-hermansen.markdown-viewditor/themes/</code></td></tr>
                <tr><td>Windows</td><td><code>%APPDATA%\com.github.paw-hermansen.markdown-viewditor\themes\</code></td></tr>
              </tbody>
            </table>
            <p class="muted">Theme files are detected on startup and appear in the theme drop-down. A restart is required after adding or removing files.</p>
            <p class="muted">The theme type (dark or light) is auto-detected from the CSS content and also controls the app chrome (toolbar, editor, etc.).</p>
          </section>

          <section>
            <h2>Examples</h2>
            <p>At the bottom of this text you can copy the dark custom theme <code>my-theme.css</code>.</p>
            <p>A more comprehensive light theme can be downloaded from <button class="link" data-href="https://github.com/paw-hermansen/Markdown-Viewditor/blob/main/examples/custom_themes/theme-bubblegum.css" onclick={() => handleLink('https://github.com/paw-hermansen/Markdown-Viewditor/blob/main/examples/custom_themes/theme-bubblegum.css')}>github.com/paw-hermansen/Markdown-Viewditor/blob/main/examples/custom_themes/theme-bubblegum.css</button></p>
          </section>

          <section>
            <h2>What can be customized</h2>
            <p>Both code highlighting and viewer elements are rendered inside <code>#viewer-content</code>. Prefix your selectors with <code>#viewer-content</code> so they override the app's default styles:</p>
            <ul>
              <li><strong>Code highlighting</strong> &mdash; <code>.hljs</code> classes on token spans (see reference below).</li>
              <li><strong>Viewer elements</strong> &mdash; headings, paragraphs, links, tables, blockquotes, etc. (e.g. <code>#viewer-content h1</code>, <code>#viewer-content a</code>, <code>#viewer-content blockquote</code>).</li>
            </ul>
            <p class="muted">For code blocks, set the background on <code>#viewer-content pre</code> and clear it on <code>#viewer-content pre code</code> so the background covers the whole block, not each line.</p>
          </section>

          <section>
            <h2>Highlight.js Token Reference</h2>
            <p>The following <code>.hljs-*</code> classes are actually emitted by the app's registered languages (JavaScript, TypeScript, Python, CSS, XML, HTML, JSON, Bash, Markdown, SQL):</p>
            <table class="ref-table">
              <thead>
                <tr><th>Class</th><th>Produced by</th></tr>
              </thead>
              <tbody>
                <tr><td><code>.hljs</code></td><td>Base class on every code block</td></tr>
                <tr><td><code>.hljs-keyword</code></td><td>JS/TS, Python, CSS, XML, Bash, SQL</td></tr>
                <tr><td><code>.hljs-string</code></td><td>JS/TS, Python, CSS, XML, Bash, Markdown, SQL</td></tr>
                <tr><td><code>.hljs-number</code></td><td>JS/TS, Python, CSS, Bash, SQL</td></tr>
                <tr><td><code>.hljs-comment</code></td><td>JS/TS, Python, SQL, Bash</td></tr>
                <tr><td><code>.hljs-doctag</code></td><td>JS/TS (JSDoc <code>@tags</code>)</td></tr>
                <tr><td><code>.hljs-literal</code></td><td>JSON (<code>true</code>/<code>false</code>/<code>null</code>), Markdown</td></tr>
                <tr><td><code>.hljs-regexp</code></td><td>JS/TS</td></tr>
                <tr><td><code>.hljs-built_in</code></td><td>JS/TS, Python, CSS, SQL</td></tr>
                <tr><td><code>.hljs-type</code></td><td>JS/TS (JSDoc), Python, SQL</td></tr>
                <tr><td><code>.hljs-meta</code></td><td>JS/TS, Python, XML, CSS</td></tr>
                <tr><td><code>.hljs-title</code></td><td>JS/TS, Python, Bash</td></tr>
                <tr><td><code>.hljs-title.class_</code></td><td>JS/TS (class declarations)</td></tr>
                <tr><td><code>.hljs-title.function_</code></td><td>JS/TS, Python, Bash</td></tr>
                <tr><td><code>.hljs-title.class_.inherited__</code></td><td>JS/TS (extends)</td></tr>
                <tr><td><code>.hljs-function</code></td><td>JS/TS (arrow fns), Bash</td></tr>
                <tr><td><code>.hljs-attr</code></td><td>JS/TS, CSS, JSON, XML</td></tr>
                <tr><td><code>.hljs-attribute</code></td><td>CSS (properties, media features)</td></tr>
                <tr><td><code>.hljs-variable</code></td><td>JS/TS, Python, Bash, SQL</td></tr>
                <tr><td><code>.hljs-variable.language</code></td><td>JS/TS (<code>this</code>), Python (<code>self</code>)</td></tr>
                <tr><td><code>.hljs-variable.constant</code></td><td>JS/TS (SCREAMING_CASE)</td></tr>
                <tr><td><code>.hljs-params</code></td><td>JS/TS, Python</td></tr>
                <tr><td><code>.hljs-property</code></td><td>JS/TS</td></tr>
                <tr><td><code>.hljs-operator</code></td><td>SQL</td></tr>
                <tr><td><code>.hljs-punctuation</code></td><td>JSON</td></tr>
                <tr><td><code>.hljs-subst</code></td><td>JS/TS, Python, Bash (template/f-string interpolation)</td></tr>
                <tr><td><code>.hljs-tag</code></td><td>XML</td></tr>
                <tr><td><code>.hljs-name</code></td><td>XML</td></tr>
                <tr><td><code>.hljs-symbol</code></td><td>XML (entities), Markdown</td></tr>
                <tr><td><code>.hljs-selector-tag</code></td><td>CSS</td></tr>
                <tr><td><code>.hljs-selector-id</code></td><td>CSS</td></tr>
                <tr><td><code>.hljs-selector-class</code></td><td>CSS</td></tr>
                <tr><td><code>.hljs-selector-attr</code></td><td>CSS</td></tr>
                <tr><td><code>.hljs-selector-pseudo</code></td><td>CSS</td></tr>
                <tr><td><code>.hljs-section</code></td><td>Markdown (headings)</td></tr>
                <tr><td><code>.hljs-bullet</code></td><td>Markdown (list markers)</td></tr>
                <tr><td><code>.hljs-quote</code></td><td>Markdown</td></tr>
                <tr><td><code>.hljs-link</code></td><td>Markdown</td></tr>
                <tr><td><code>.hljs-strong</code></td><td>Markdown</td></tr>
                <tr><td><code>.hljs-emphasis</code></td><td>Markdown</td></tr>
                <tr><td><code>.hljs-code</code></td><td>Markdown</td></tr>
              </tbody>
            </table>
            <p class="muted">Tiered scopes like <code>title.class</code> become <code>.hljs-title.class_</code> (first part gets <code>hljs-</code> prefix, subsequent parts get trailing underscores).</p>
          </section>

          <section>
            <h2>Markdown Element Reference</h2>
            <p>Markdown syntax is converted to HTML elements inside the viewer:</p>
            <table class="ref-table">
              <thead>
                <tr><th>Markdown</th><th>HTML Element</th></tr>
              </thead>
              <tbody>
                <tr><td><code># text</code></td><td><code>h1</code> &ndash; <code>h6</code></td></tr>
                <tr><td><code>paragraph</code></td><td><code>p</code></td></tr>
                <tr><td><code>**bold**</code></td><td><code>strong</code></td></tr>
                <tr><td><code>*italic*</code></td><td><code>em</code></td></tr>
                <tr><td><code>`code`</code></td><td><code>code</code></td></tr>
                <tr><td><code>```code```</code></td><td><code>pre &gt; code</code></td></tr>
                <tr><td><code>&gt; quote</code></td><td><code>blockquote</code></td></tr>
                <tr><td><code>- item</code></td><td><code>ul &gt; li</code></td></tr>
                <tr><td><code>1. item</code></td><td><code>ol &gt; li</code></td></tr>
                <tr><td><code>- [ ] task</code></td><td><code>li.task-list-item</code></td></tr>
                <tr><td><code>| col |</code></td><td><code>table</code>, <code>th</code>, <code>td</code></td></tr>
                <tr><td><code>[text](url)</code></td><td><code>a</code></td></tr>
                <tr><td><code>![alt](src)</code></td><td><code>img</code></td></tr>
                <tr><td><code>~~text~~</code></td><td><code>del</code></td></tr>
                <tr><td><code>---</code></td><td><code>hr</code></td></tr>
                <tr><td><code>[^1]</code></td><td><code>sup.footnote-ref</code>, <code>section.footnotes</code></td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2>Raw HTML Elements</h2>
            <p>The following HTML elements can be used directly in markdown (with <code>html: true</code> enabled) and styled with custom themes:</p>
            <table class="ref-table">
              <thead>
                <tr><th>HTML</th><th>Element</th></tr>
              </thead>
              <tbody>
                <tr><td><code>&lt;details&gt;&lt;summary&gt;text&lt;/summary&gt;content&lt;/details&gt;</code></td><td><code>details</code>, <code>summary</code></td></tr>
                <tr><td><code>&lt;kbd&gt;key&lt;/kbd&gt;</code></td><td><code>kbd</code></td></tr>
                <tr><td><code>&lt;sub&gt;text&lt;/sub&gt;</code></td><td><code>sub</code></td></tr>
                <tr><td><code>&lt;sup&gt;text&lt;/sup&gt;</code></td><td><code>sup</code></td></tr>
                <tr><td><code>&lt;ins&gt;text&lt;/ins&gt;</code></td><td><code>ins</code></td></tr>
                <tr><td><code>&lt;mark&gt;text&lt;/mark&gt;</code></td><td><code>mark</code></td></tr>
              </tbody>
            </table>
            <p class="muted">These elements require raw HTML in your markdown source. They can be styled like any other element in custom themes.</p>
          </section>

          <section>
            <h2>YAML Frontmatter Styling</h2>
            <p>When a markdown file has YAML frontmatter (between <code>---</code> delimiters), it is rendered as a card above the content. Skill files (with <code>name</code> and <code>description</code>) get special treatment:</p>
            <table class="ref-table">
              <thead>
                <tr><th>Class</th><th>Description</th></tr>
              </thead>
              <tbody>
                <tr><td><code>.frontmatter-card</code></td><td>Card container for all frontmatter</td></tr>
                <tr><td><code>.frontmatter-title</code></td><td>"Frontmatter" label (non-skill files)</td></tr>
                <tr><td><code>.skill-badge</code></td><td>"Skill" badge (skill files only)</td></tr>
                <tr><td><code>.skill-name</code></td><td>Skill name (skill files only)</td></tr>
                <tr><td><code>.skill-description</code></td><td>Skill description (skill files only)</td></tr>
                <tr><td><code>.skill-meta dt</code></td><td>Metadata key labels</td></tr>
                <tr><td><code>.skill-meta dd</code></td><td>Metadata values</td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2>Additional Styling Possibilities</h2>
            <p>These CSS selectors can be used for more granular control over viewer elements:</p>
            <table class="ref-table">
              <thead>
                <tr><th>Selector</th><th>Description</th></tr>
              </thead>
              <tbody>
                <tr><td><code>a:hover</code></td><td>Link hover state</td></tr>
                <tr><td><code>li::marker</code></td><td>List item markers (bullets, numbers)</td></tr>
                <tr><td><code>tr:nth-child(even) td</code></td><td>Table zebra stripes</td></tr>
                <tr><td><code>.footnotes-sep</code></td><td>Footnote separator line</td></tr>
                <tr><td><code>.footnotes ol</code></td><td>Footnote list</td></tr>
                <tr><td><code>.footnote-backref</code></td><td>Footnote back reference link</td></tr>
                <tr><td><code>.task-list-item input[type="checkbox"]</code></td><td>Task list checkbox styling</td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2>Example: Custom Dark Theme</h2>
            <p>Create <code>my-theme.css</code> in the themes directory:</p>
            <pre class="code-example"><code>{`/* Code highlighting — prefix selectors with #viewer-content. */
#viewer-content .hljs { color: #abb2bf; }
#viewer-content .hljs-keyword, #viewer-content .hljs-doctag { color: #c678dd; }
#viewer-content .hljs-string, #viewer-content .hljs-regexp { color: #98c379; }
#viewer-content .hljs-comment { color: #5c6370; font-style: italic; }
#viewer-content .hljs-number, #viewer-content .hljs-literal { color: #d19a66; }
#viewer-content .hljs-title, #viewer-content .hljs-title.function_ { color: #61afef; }
#viewer-content .hljs-built_in, #viewer-content .hljs-type { color: #e5c07b; }
#viewer-content .hljs-attr, #viewer-content .hljs-attribute { color: #d19a66; }
#viewer-content .hljs-meta { color: #56b6c2; }
#viewer-content .hljs-variable, #viewer-content .hljs-params { color: #e06c75; }
#viewer-content .hljs-tag, #viewer-content .hljs-name { color: #e06c75; }
#viewer-content .hljs-selector-tag, #viewer-content .hljs-selector-class { color: #e06c75; }
#viewer-content .hljs-section { color: #e06c75; font-weight: bold; }
#viewer-content .hljs-bullet { color: #98c379; }
#viewer-content .hljs-link { color: #61afef; text-decoration: underline; }
#viewer-content .hljs-strong { font-weight: bold; }

/* Viewer elements — prefix selectors with #viewer-content. */
#viewer-content { background: #282c34; color: #abb2bf; }
#viewer-content h1 { color: #e5c07b; border-bottom-color: #3e4451; }
#viewer-content h2, #viewer-content h3 { color: #e5c07b; }
#viewer-content a { color: #61afef; }
#viewer-content a:hover { color: #98c379; }
#viewer-content blockquote { border-left-color: #c678dd; color: #5c6370; }
#viewer-content code { background: #2c313a; }
#viewer-content pre { background: #282c34; }
#viewer-content pre code { background: transparent; }
#viewer-content th { background: #2c313a; color: #5c6370; }
#viewer-content th, #viewer-content td { border-color: #3e4451; }
#viewer-content hr { border-top-color: #3e4451; }
#viewer-content .frontmatter-card { background: #2c313a; border-color: #3e4451; }
#viewer-content .footnotes { color: #5c6370; font-size: 0.85em; }
#viewer-content .footnote-backref { color: #61afef; }`}</code></pre>
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
    opacity: 0.9;
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

  code {
    background: var(--bg-tertiary);
    padding: 1px 5px;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 12px;
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
