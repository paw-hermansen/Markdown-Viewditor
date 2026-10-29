import type { Command } from "./registry.svelte";

/**
 * The app's command table, extracted from `+page.svelte` so the keyboard
 * matrix can be driven by tests against the *real* table (not a duplicate).
 *
 * Handlers are passed in as thunks (zero-argument invocation, keeping the
 * MouseEvent-as-path fix structural).
 */
export interface PageCommandHandlers {
  handleNew: () => void;
  handleOpen: () => void;
  handleSave: () => void;
  handleSaveAs: () => void;
  handleReload: () => void;
  handleExit: () => void;
  handlePrint: () => void;
  togglePalette: () => void;
  cycleViewMode: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  handleFormatDocument: () => void;
  handleAbout: () => void;
  /** Editor formatting (CodeMirror handles the actual key). */
  handleFormat: (format: string) => void;
}

export function buildPageCommands(
  h: PageCommandHandlers,
  opts: { exportOnly: boolean },
): Command[] {
  return [
    // ── app commands (matchable: the global keydown matcher fires these) ──
    {
      id: "file.new",
      title: "New File",
      category: "File",
      shortcut: { code: "KeyN", mod: true, shift: "any" },
      run: h.handleNew,
    },
    {
      id: "file.open",
      title: "Open File",
      category: "File",
      shortcut: { code: "KeyO", mod: true, shift: "any" },
      run: h.handleOpen,
    },
    {
      id: "file.save",
      title: "Save",
      category: "File",
      shortcut: { code: "KeyS", mod: true, shift: false },
      run: h.handleSave,
    },
    {
      id: "file.save-as",
      title: "Save As",
      category: "File",
      shortcut: { code: "KeyS", mod: true, shift: true },
      run: h.handleSaveAs,
    },
    {
      id: "file.reload",
      title: "Reload from Disk",
      category: "File",
      shortcut: { code: "KeyR", mod: true, shift: "any" },
      run: h.handleReload,
    },
    {
      id: "file.quit",
      title: "Quit",
      category: "File",
      shortcut: { code: "KeyQ", mod: true, shift: false },
      run: h.handleExit,
    },
    {
      id: "file.print",
      title: opts.exportOnly ? "Create PDF" : "Print Preview",
      category: "File",
      shortcut: { code: "KeyP", mod: true, shift: false },
      run: h.handlePrint,
    },
    {
      id: "palette.toggle",
      title: "Command Palette",
      category: "File",
      shortcut: { code: "KeyP", mod: true, shift: true },
      run: h.togglePalette,
    },
    {
      id: "view.cycle",
      title: "Cycle View Mode",
      category: "View",
      shortcut: { code: "KeyV", mod: true, shift: true },
      run: h.cycleViewMode,
    },
    {
      id: "view.zoom-in",
      title: "Zoom In",
      category: "View",
      note: "or =",
      shortcut: { keys: ["+", "="], mod: true, shift: "any" },
      run: h.zoomIn,
    },
    {
      id: "view.zoom-out",
      title: "Zoom Out",
      category: "View",
      shortcut: { keys: ["-", "_"], mod: true, shift: "any" },
      run: h.zoomOut,
    },
    {
      id: "view.zoom-reset",
      title: "Reset Zoom",
      category: "View",
      shortcut: { keys: ["0"], code: "Numpad0", mod: true, shift: "any" },
      run: h.resetZoom,
    },
    {
      id: "format.document",
      title: "Format Document",
      category: "Format",
      shortcut: { code: "KeyF", shift: true, alt: true },
      run: h.handleFormatDocument,
    },
    {
      id: "help.about",
      title: "About",
      category: "Help",
      shortcut: { code: "F1", mod: false, shift: false },
      run: h.handleAbout,
    },

    // ── editor formatting (matchable: false — CodeMirror owns the binding) ──
    {
      id: "edit.bold",
      title: "Bold",
      category: "Format",
      matchable: false,
      shortcut: { code: "KeyB", mod: true, shift: false },
      run: () => h.handleFormat("bold"),
    },
    {
      id: "edit.italic",
      title: "Italic",
      category: "Format",
      matchable: false,
      shortcut: { code: "KeyI", mod: true, shift: false },
      run: () => h.handleFormat("italic"),
    },
    {
      id: "edit.strikethrough",
      title: "Strikethrough",
      category: "Format",
      matchable: false,
      shortcut: { code: "KeyX", mod: true, shift: true },
      run: () => h.handleFormat("strikethrough"),
    },
    {
      id: "edit.highlight",
      title: "Highlight",
      category: "Format",
      matchable: false,
      shortcut: { code: "KeyM", mod: true, shift: true },
      run: () => h.handleFormat("highlight"),
    },
    {
      id: "edit.heading",
      title: "Heading",
      category: "Format",
      matchable: false,
      shortcut: { code: "KeyH", mod: true, shift: true },
      run: () => h.handleFormat("heading"),
    },
    {
      id: "edit.link",
      title: "Link",
      category: "Format",
      matchable: false,
      shortcut: { code: "KeyK", mod: true, shift: false },
      run: () => h.handleFormat("link"),
    },
    {
      id: "edit.image",
      title: "Image",
      category: "Format",
      matchable: false,
      shortcut: { code: "KeyI", mod: true, shift: true },
      run: () => h.handleFormat("image"),
    },
    {
      id: "edit.code",
      title: "Code",
      category: "Format",
      matchable: false,
      note: "toggles",
      shortcut: { code: "KeyE", mod: true, shift: false },
      run: () => h.handleFormat("code"),
    },
    {
      id: "edit.bullet",
      title: "Bullet List",
      category: "Format",
      matchable: false,
      shortcut: { code: "Digit8", mod: true, shift: true },
      run: () => h.handleFormat("bullet"),
    },
    {
      id: "edit.numbered",
      title: "Numbered List",
      category: "Format",
      matchable: false,
      shortcut: { code: "Digit7", mod: true, shift: true },
      run: () => h.handleFormat("numbered"),
    },
    {
      id: "edit.task",
      title: "Task List",
      category: "Format",
      matchable: false,
      run: () => h.handleFormat("task"),
    },
    {
      id: "edit.quote",
      title: "Blockquote",
      category: "Format",
      matchable: false,
      run: () => h.handleFormat("quote"),
    },
    {
      id: "edit.hr",
      title: "Horizontal Rule",
      category: "Format",
      matchable: false,
      run: () => h.handleFormat("hr"),
    },
  ];
}
