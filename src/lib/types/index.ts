export type ViewMode = "split" | "editor" | "viewer";

export type MarkdownLevel = "basic" | "github" | "advanced" | "custom";

/** Image resolution multiplier for rasterized ODT outputs (1×/96, 2×/192, 3×/288 DPI). */
export type OdtRasterResolution = 1 | 2 | 3;

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
  exportConfirmDismissed: boolean;
  /** Render math formulas as PNG images instead of editable MathML formulas. */
  odtRasterizeMath: boolean;
  /** Render all SVGs (inline, `<img>`, markdown image) as PNG images instead of vector SVG. */
  odtRasterizeSvg: boolean;
  /** Pixel-scale multiplier for rasterized images (applies only when rasterization is on). */
  odtRasterResolution: OdtRasterResolution;
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
  tokens: import("markdown-it/lib/token.mjs").default[];
}
