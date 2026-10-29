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

export function formatShortcut(s?: CommandShortcut): string | undefined {
  if (!s) return undefined;
  const parts: string[] = [];
  if (s.mod) parts.push("Ctrl");
  if (s.alt) parts.push("Alt");
  if (s.shift === true) parts.push("Shift");
  let key = "";
  if (s.code) {
    if (s.code.startsWith("Key")) key = s.code.slice(3);
    else if (s.code === "F1") key = "F1";
    else if (s.code === "Numpad0") key = "0";
    else key = s.code;
  } else if (s.keys && s.keys.length) {
    key = s.keys[0];
  }
  if (key) parts.push(key);
  const joined = parts.join("+");
  return modLabel(joined);
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
