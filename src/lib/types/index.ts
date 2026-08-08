export type ViewMode = "split" | "editor" | "viewer";

export type MarkdownLevel = "basic" | "github" | "advanced" | "custom";

export interface FileInfo {
  path: string;
  name: string;
  isDir: boolean;
  size: number;
}

export interface Settings {
  viewMode: ViewMode;
  editorFontSize: number;
  editorFontFamily: string;
  editorLineNumbers: boolean;
  editorWordWrap: boolean;
  viewerTheme: string;
  splitRatio: number;
  lastOpenedFile: string | null;
  recentFiles: string[];
  markdownLevel: MarkdownLevel;
  enabledFeatures: string[];
}

export interface EditorState {
  content: string;
  cursorLine: number;
  cursorCol: number;
  wordCount: number;
  isModified: boolean;
}

export interface ViewerState {
  theme: string;
  scrollTop: number;
}

export interface Frontmatter {
  name?: string;
  description?: string;
  license?: string;
  [key: string]: unknown;
}

export interface RenderResult {
  html: string;
  frontmatter: Frontmatter | null;
}
