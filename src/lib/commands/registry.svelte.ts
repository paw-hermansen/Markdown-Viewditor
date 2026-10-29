import { modLabel } from "$lib/utils/keyboard";

/**
 * App-level command registry (PR-15).
 *
 * Single source of truth for commands and their shortcuts. `+page.svelte`
 * registers its handlers once; `CommandPalette` and `AppLayout` read from here
 * instead of receiving drilled callback props.
 */

export interface CommandShortcut {
  /** Match against `KeyboardEvent.code` (layout-safe letters/functions). */
  code?: string;
  /** Match against `KeyboardEvent.key` (zoom symbols, numpad). */
  keys?: string[];
  mod?: boolean;
  shift?: boolean | "any";
  alt?: boolean;
}

export interface Command {
  id: string;
  title: string;
  category: "File" | "View" | "Format" | "Export" | "Help";
  shortcut?: CommandShortcut;
  run: () => void | Promise<void>;
  enabled?: () => boolean;
  /**
   * Whether the global keydown matcher may fire this command. Set `false` for
   * commands whose shortcut is handled elsewhere (e.g. CodeMirror editor
   * formatting) so the registry can single-source labels without the binding
   * firing twice.
   */
  matchable?: boolean;
  /** Optional parenthetical note in the tooltip, e.g. "toggles". */
  note?: string;
}

let commands: Command[] = [];

export function registerCommands(cmds: Command[]): void {
  commands = [...commands, ...cmds];
}

export function clearCommands(): void {
  commands = [];
}

export function listCommands(): Command[] {
  return commands;
}

export function getCommand(id: string): Command | undefined {
  return commands.find((c) => c.id === id);
}

export async function runCommand(id: string): Promise<void> {
  const cmd = getCommand(id);
  if (!cmd) return;
  if (cmd.enabled && !cmd.enabled()) return;
  await cmd.run();
}

/** Display title for a command id. */
export function titleFor(id: string): string {
  return getCommand(id)?.title ?? id;
}

/** Formatted shortcut label for a command id (via `modLabel`). */
export function shortcutLabelFor(id: string): string | undefined {
  return formatShortcut(getCommand(id)?.shortcut);
}

/** "Title (Shortcut, note)" for a command id — the single-source tooltip text. */
export function commandTitle(id: string): string {
  const cmd = getCommand(id);
  const title = cmd?.title ?? id;
  const shortcut = formatShortcut(cmd?.shortcut);
  const inner = [shortcut, cmd?.note].filter(Boolean).join(", ");
  return inner ? `${title} (${inner})` : title;
}

export function shortcutParts(s?: CommandShortcut): string[] {
  if (!s) return [];
  const parts: string[] = [];
  if (s.mod) parts.push("Ctrl");
  if (s.alt) parts.push("Alt");
  if (s.shift === true) parts.push("Shift");
  let key = "";
  if (s.code) {
    if (s.code.startsWith("Key")) key = s.code.slice(3);
    else if (s.code.startsWith("Digit")) key = s.code.slice(5);
    else if (s.code === "F1") key = "F1";
    else if (s.code === "Numpad0") key = "0";
    else key = s.code;
  } else if (s.keys && s.keys.length) {
    key = s.keys[0];
  }
  if (key) parts.push(key);
  return parts;
}

export function formatShortcut(s?: CommandShortcut): string | undefined {
  const parts = shortcutParts(s);
  if (parts.length === 0) return undefined;
  return modLabel(parts.join("+"));
}

/** Modifier + key labels for a command id (for per-key `<kbd>` rendering). */
export function shortcutKeys(id: string): string[] {
  return shortcutParts(getCommand(id)?.shortcut);
}

export function handleGlobalKeydown(
  e: KeyboardEvent,
  guards: { isLoading?: boolean; exporting?: boolean } = {},
): boolean {
  if (guards.isLoading || guards.exporting) return false;

  const isMod = e.metaKey || e.ctrlKey;

  for (const cmd of commands) {
    const s = cmd.shortcut;
    if (!s) continue;
    if (cmd.matchable === false) continue;

    if (s.mod === true && !isMod) continue;
    if (s.mod === false && isMod) continue;

    if (s.shift === true && !e.shiftKey) continue;
    if (s.shift === false && e.shiftKey) continue;

    if (s.alt === true && !e.altKey) continue;
    if (s.alt === false && e.altKey) continue;

    let matched = false;
    if (s.code && e.code === s.code) matched = true;
    if (!matched && s.keys && s.keys.includes(e.key)) matched = true;
    if (!matched) continue;

    if (cmd.enabled && !cmd.enabled()) continue;

    e.preventDefault();
    void cmd.run();
    return true;
  }
  return false;
}
