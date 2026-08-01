const isMac =
  typeof navigator !== "undefined" &&
  /Macintosh|Mac OS X/.test(navigator.userAgent);

export function modLabel(shortcut: string): string {
  if (!isMac) return shortcut;
  return shortcut
    .replace(/Ctrl\+/g, "⌘")
    .replace(/Shift\+/g, "⇧")
    .replace(/Alt\+/g, "⌥");
}
