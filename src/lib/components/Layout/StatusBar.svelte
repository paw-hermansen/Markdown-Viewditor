<script lang="ts">
  import { editorState } from '$lib/stores/editor.svelte';
  import { settingsState, updateSetting } from '$lib/stores/settings.svelte';
  import { levelState } from '$lib/stores/markdown-levels.svelte';
  import { zoomIn, zoomOut, resetZoom, zoomLabel } from '$lib/stores/zoom.svelte';
  import { modLabel } from '$lib/utils/keyboard';
  import { createPopupController, exclusiveGroup } from '$lib/utils/popup';
  import {
    listFeatureToggles,
    compareFeatureToggles,
    presetFor,
    presetForEnabled,
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

  // Display order (required-preset group, then alphabetical) for both the
  // checklist and the violation rows — see compareFeatureToggles().
  let toggles = $derived(listFeatureToggles().sort(compareFeatureToggles));
  let totalToggles = $derived(toggles.length);

  // Display label for the level: "Custom (n/9)" when in custom mode.
  let levelLabel = $derived(
    settingsState.markdownLevel === 'custom'
      ? `Custom (${settingsState.enabledFeatures.length}/${totalToggles})`
      : LEVEL_LABELS[settingsState.markdownLevel]
  );

  let enabledSet = $derived(new Set(settingsState.enabledFeatures));

  let openId = $state<string | null>(null);
  const group = exclusiveGroup(
    ["level", "violations", "zoom"],
    { get: () => openId, set: (id) => (openId = id) },
  );

  let levelPopRef: HTMLDivElement | undefined = $state(undefined);
  let violationsPopRef: HTMLDivElement | undefined = $state(undefined);
  let zoomPopRef: HTMLDivElement | undefined = $state(undefined);

  /**
   * Placement + dismissal for each popover is owned by the popup controller:
   * measured into the clipping ancestor, right-anchored (so a relabeling
   * trigger keeps the popover glued), opening upward from the status bar.
   * `capHeight` is false for fixed-content popovers that must never scroll
   * (the zoom popup). Dismissal (bubble-phase outside click + Escape) closes
   * the whole group; the trigger buttons call `stopPropagation` so a click
   * that opens a popover doesn't immediately dismiss it.
   */
  function makeController(
    getPop: () => HTMLElement | undefined,
    capHeight: boolean,
  ) {
    return createPopupController(
      () => getPop() ?? null,
      () => getPop()?.parentElement ?? null,
      {
        align: 'right',
        openDirection: 'up',
        capHeight,
        gap: 4,
        onScroll: 'ignore',
        onResize: 're-place',
        onDismiss: () => group.close(),
      },
      {
        getTrigger: () =>
          (getPop()?.parentElement?.querySelector('button') as HTMLElement) ?? null,
      },
    );
  }

  const controllers = {
    level: makeController(() => levelPopRef, true),
    violations: makeController(() => violationsPopRef, true),
    zoom: makeController(() => zoomPopRef, false),
  };

  // Open the active popover's controller (placement + dismissal) and close the
  // rest, driven by the mutually-exclusive `openId`.
  $effect(() => {
    const id = openId;
    for (const c of Object.values(controllers)) c.close();
    if (id) controllers[id as keyof typeof controllers].open();
  });

  let violations = $derived([...levelState.violations].sort(compareFeatureToggles));

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
    updateSetting('markdownLevel', presetForEnabled(next));
  }

  function violationMessageFor(v: UsedFeature): string {
    return violationMessage(v, settingsState.markdownLevel);
  }

  function onLevelButtonClick(e: MouseEvent) {
    e.stopPropagation();
    group.toggle("level");
  }

  function onZoomButtonClick(e: MouseEvent) {
    e.stopPropagation();
    group.toggle("zoom");
  }

  function onViolationBadgeClick(e: MouseEvent) {
    e.stopPropagation();
    group.toggle("violations");
  }
</script>



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
        aria-expanded={openId === 'level'}
      >
        {levelLabel} <span class="caret">&#x25BE;</span>
      </button>
      {#if openId === 'level'}
        <div bind:this={levelPopRef} class="popover level-popover" role="dialog" aria-label="Markdown level and feature toggles" tabindex="0">
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
    <span class="separator" class:hidden={violations.length === 0}>|</span>
    <div class="level-popover-area">
      <button
        class="violation-badge"
        class:hidden={violations.length === 0}
        onclick={onViolationBadgeClick}
        title={`${violations.length} feature violation${violations.length === 1 ? '' : 's'}`}
        aria-label={`${violations.length} markdown feature violations`}
        aria-expanded={openId === 'violations'}
      >
        &#x26A0; {violations.length}
      </button>
      {#if openId === 'violations' && violations.length > 0}
        <div bind:this={violationsPopRef} class="popover violations-popover" role="dialog" aria-label="Feature violations" tabindex="0">
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
    <!-- Decorative labels: hidden at narrow CSS viewports (incl. high zoom)
         so the interactive controls above/below stay reachable. -->
    <span class="statusbar-deco">
      <span class="separator">|</span>
      <span>Markdown</span>
      <span class="separator">|</span>
      <span>UTF-8</span>
      <span class="separator">|</span>
    </span>
    <div class="level-popover-area">
      <button
        class="level-btn"
        onclick={onZoomButtonClick}
        title={modLabel('Zoom level (Ctrl++ / Ctrl+- / Ctrl+0)')}
        aria-label="Zoom level"
        aria-expanded={openId === 'zoom'}
      >
        {zoomLabel()} <span class="caret">&#x25BE;</span>
      </button>
      {#if openId === 'zoom'}
        <div bind:this={zoomPopRef} class="popover zoom-popover" role="dialog" aria-label="Zoom" tabindex="0">
          <div class="zoom-row">
            <button
              class="zoom-step-btn"
              onclick={(e) => { e.stopPropagation(); void zoomOut(); }}
              title={modLabel('Zoom out (Ctrl+-)')}
              aria-label="Zoom out"
            >&#x2212;</button>
            <span class="zoom-value">{zoomLabel()}</span>
            <button
              class="zoom-step-btn"
              onclick={(e) => { e.stopPropagation(); void zoomIn(); }}
              title={modLabel('Zoom in (Ctrl++)')}
              aria-label="Zoom in"
            >+</button>
          </div>
          <button
            class="zoom-reset-btn"
            onclick={(e) => { e.stopPropagation(); void resetZoom(); }}
            title={modLabel('Reset zoom (Ctrl+0)')}
          >Reset (100%)</button>
        </div>
      {/if}
    </div>
  </div>
</footer>

<style>
  /* min-height (not height) + nowrap. A hard 28px box left only ~1px of slack
     around the 1.5 line box; at fractional zoom the engine rounds text
     baselines to device pixels and the text was pushed out of the bar (which
     is flush with the window edge) — clipped at 50–60% zoom. Wrapping
     ("UTF-8" at 300% zoom) would overflow a fixed height the same way. */
  .statusbar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 4px 16px;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
    font-size: 12px;
    line-height: 1.3;
    color: var(--text-muted);
    min-height: 28px;
    white-space: nowrap;
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

  /* Keep controls at full size instead of squeezing them into wrapped or
     clipped text when the CSS viewport is narrow (high zoom). */
  .statusbar-right > * {
    flex-shrink: 0;
  }

  .separator {
    opacity: 0.5;
  }

  .separator.hidden,
  .violation-badge.hidden {
    visibility: hidden;
    pointer-events: none;
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
    min-height: 20px;
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
    min-height: 20px;
    min-width: 48px;
    text-align: center;
  }

  .violation-badge:hover {
    background: rgba(245, 158, 11, 0.15);
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
    /* Never taller than the space above the status bar (opens upward), so the
       popup scrolls instead of running off-screen at high zoom. */
    max-height: min(60vh, calc(100vh - 44px));
    overflow-y: auto;
    /* Reserve the scrollbar's strip so scrolling never covers the controls. */
    scrollbar-gutter: stable;
    white-space: normal;
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
    background: var(--accent-tint, rgba(127, 127, 127, 0.2));
    color: var(--text-primary);
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

  .zoom-popover {
    min-width: 160px;
    /* Fixed content (one row + Reset) — never scrolls: it fits above the
       trigger even at the smallest supported window x 300% zoom, and a
       scrollbar would overlay the +/- buttons on Linux. */
    max-height: none;
    overflow-y: visible;
    scrollbar-gutter: auto;
  }

  .zoom-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .zoom-step-btn {
    min-width: 28px;
    min-height: 28px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-primary);
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
  }

  .zoom-step-btn:hover {
    background: var(--bg-hover);
  }

  .zoom-value {
    min-width: 48px;
    text-align: center;
  }

  .zoom-reset-btn {
    width: 100%;
    margin-top: 8px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-primary);
    cursor: pointer;
    padding: 4px 6px;
    font: inherit;
  }

  .zoom-reset-btn:hover {
    background: var(--bg-hover);
  }

  /* Decorative labels participate in the flex row (display: contents) and are
     the first thing dropped when space runs out. */
  .statusbar-deco {
    display: contents;
  }

  /* Page zoom shrinks the CSS viewport, so high zoom looks like a narrow
     window here. Hide the decorative labels but keep the level, violations
     and zoom controls — the zoom control is the way back out. (The old rule
     hid the whole right cluster below 640px, including the zoom control.) */
  @media (max-width: 900px) {
    .statusbar-deco {
      display: none;
    }
  }
</style>
