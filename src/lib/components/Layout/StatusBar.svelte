<script lang="ts">
  import { editorState } from '$lib/stores/editor.svelte';
  import { settingsState, updateSetting } from '$lib/stores/settings.svelte';
  import { levelState } from '$lib/stores/markdown-levels.svelte';
  import {
    listFeatureToggles,
    presetFor,
    violationMessage,
    MAX_DISPLAY_LINES,
    type MarkdownLevel,
    type UsedFeature
  } from '$lib/utils/markdown-levels';

  let showEditorInfo = $derived(settingsState.viewMode === 'split' || settingsState.viewMode === 'editor');

  const LEVELS: MarkdownLevel[] = ['basic', 'github', 'advanced', 'custom'];
  const LEVEL_LABELS: Record<MarkdownLevel, string> = {
    basic: 'Basic',
    github: 'GitHub',
    advanced: 'Advanced',
    custom: 'Custom'
  };

  let toggles = $derived(listFeatureToggles());
  let totalToggles = $derived(toggles.length);

  // Display label for the level: "Custom (n/9)" when in custom mode.
  let levelLabel = $derived(
    settingsState.markdownLevel === 'custom'
      ? `Custom (${settingsState.enabledFeatures.length}/${totalToggles})`
      : LEVEL_LABELS[settingsState.markdownLevel]
  );

  let enabledSet = $derived(new Set(settingsState.enabledFeatures));

  let showLevel = $state(false);
  let showViolations = $state(false);

  let violations = $derived(levelState.violations);

  function selectLevel(level: MarkdownLevel) {
    if (level === 'custom') {
      // Entering custom from a preset keeps the current enabled set as-is.
      updateSetting('markdownLevel', 'custom');
      return;
    }
    updateSetting('enabledFeatures', presetFor(level));
    updateSetting('markdownLevel', level);
  }

  function toggleFeature(id: string, on: boolean) {
    const current = new Set(settingsState.enabledFeatures);
    if (on) current.add(id);
    else current.delete(id);
    // Preserve registry order in the stored array.
    const next = listFeatureToggles()
      .map((t) => t.id)
      .filter((tid) => current.has(tid));
    updateSetting('enabledFeatures', next);
    updateSetting('markdownLevel', 'custom');
  }

  function violationMessageFor(v: UsedFeature): string {
    return violationMessage(v, settingsState.markdownLevel);
  }

  function handlePopoverKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      showLevel = false;
      showViolations = false;
    }
  }

  function closePopovers(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (!target.closest('.level-popover-area')) {
      showLevel = false;
      showViolations = false;
    }
  }

  function onLevelButtonClick(e: MouseEvent) {
    e.stopPropagation();
    showLevel = !showLevel;
    showViolations = false;
  }

  function onViolationBadgeClick(e: MouseEvent) {
    e.stopPropagation();
    showViolations = !showViolations;
    showLevel = false;
  }
</script>

<svelte:window onclick={closePopovers} />

<footer class="statusbar" aria-label="Document status">
  <div class="statusbar-left"></div>
  <div class="statusbar-center" aria-live="polite" aria-atomic="true">
    {#if showEditorInfo}
      <span>Line {editorState.cursorLine}, Col {editorState.cursorCol}</span>
      <span class="separator">|</span>
    {/if}
    <span>{editorState.wordCount} words</span>
  </div>
  <div class="statusbar-right">
    <div class="level-popover-area">
      <button
        class="level-btn"
        onclick={onLevelButtonClick}
        title="Markdown compatibility level"
        aria-label="Markdown compatibility level"
        aria-expanded={showLevel}
      >
        {levelLabel} <span class="caret">&#x25BE;</span>
      </button>
      {#if showLevel}
        <div class="popover level-popover" role="dialog" aria-label="Markdown level and feature toggles" tabindex="0" onkeydown={handlePopoverKeydown}>
          <div class="level-options">
            {#each LEVELS as lvl}
              <button
                class="level-option"
                class:active={settingsState.markdownLevel === lvl}
                onclick={(e) => { e.stopPropagation(); selectLevel(lvl); }}
              >
                {LEVEL_LABELS[lvl]}{#if lvl === 'custom'} ({settingsState.enabledFeatures.length}/{totalToggles}){/if}
              </button>
            {/each}
          </div>
          <div class="popover-divider"></div>
          <div class="toggles-list">
            {#each toggles as t}
              <label class="toggle-row" title={t.label}>
                <input
                  type="checkbox"
                  checked={enabledSet.has(t.id)}
                  onchange={(e) => toggleFeature(t.id, (e.currentTarget as HTMLInputElement).checked)}
                  onclick={(e) => e.stopPropagation()}
                />
                <span class="toggle-label">{t.label}</span>
              </label>
            {/each}
          </div>
        </div>
      {/if}
    </div>
    {#if violations.length > 0}
      <span class="separator">|</span>
      <div class="level-popover-area">
        <button
          class="violation-badge"
          onclick={onViolationBadgeClick}
          title={`${violations.length} feature violation${violations.length === 1 ? '' : 's'}`}
          aria-label={`${violations.length} markdown feature violations`}
          aria-expanded={showViolations}
        >
          &#x26A0; {violations.length}
        </button>
        {#if showViolations}
          <div class="popover violations-popover" role="dialog" aria-label="Feature violations" tabindex="0" onkeydown={handlePopoverKeydown}>
            {#each violations as v}
              <div class="violation-row">
                <div class="violation-msg">{violationMessageFor(v)}</div>
                {#if v.lines.length > 0}
                  <div class="violation-lines">line{v.lines.length === 1 ? '' : 's'}: {v.lines.slice(0, MAX_DISPLAY_LINES).join(', ')}{v.lines.length > MAX_DISPLAY_LINES ? '\u2026' : ''}</div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    <span class="separator">|</span>
    <span>Markdown</span>
    <span class="separator">|</span>
    <span>UTF-8</span>
  </div>
</footer>

<style>
  .statusbar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 4px 16px;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-muted);
    height: 28px;
    user-select: none;
  }

  .statusbar-left,
  .statusbar-center,
  .statusbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .statusbar-right {
    justify-content: flex-end;
  }

  .separator {
    opacity: 0.5;
  }

  .level-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-muted);
    cursor: pointer;
    padding: 1px 6px;
    border-radius: 4px;
    font: inherit;
    height: 20px;
  }

  .level-btn:hover {
    background: var(--bg-hover);
    border-color: var(--border);
  }

  .caret {
    font-size: 10px;
    opacity: 0.7;
  }

  .violation-badge {
    background: transparent;
    border: 1px solid transparent;
    color: #f59e0b;
    cursor: pointer;
    padding: 1px 6px;
    border-radius: 4px;
    font: inherit;
    height: 20px;
  }

  .violation-badge:hover {
    background: color-mix(in srgb, #f59e0b 15%, transparent);
    border-color: #f59e0b;
  }

  .level-popover-area {
    position: relative;
  }

  .popover {
    position: absolute;
    bottom: calc(100% + 4px);
    right: 0;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    padding: 8px;
    z-index: 100;
    min-width: 220px;
    font-size: 12px;
    color: var(--text-primary);
  }

  .level-options {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .level-option {
    text-align: left;
    background: transparent;
    border: none;
    color: var(--text-primary);
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    font: inherit;
  }

  .level-option:hover {
    background: var(--bg-hover);
  }

  .level-option.active {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--text-primary);
    font-weight: 600;
  }

  .popover-divider {
    height: 1px;
    background: var(--border);
    margin: 6px 0;
  }

  .toggles-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    padding: 2px 0;
  }

  .toggle-label {
    color: var(--text-primary);
  }

  .violations-popover {
    min-width: 280px;
    max-width: 360px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .violation-row {
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
  }

  .violation-row:last-child {
    border-bottom: none;
  }

  .violation-msg {
    color: var(--text-primary);
  }

  .violation-lines {
    color: var(--text-muted);
    font-size: 11px;
    margin-top: 2px;
  }

  @media (max-width: 640px) {
    .statusbar-right {
      display: none;
    }
  }
</style>
