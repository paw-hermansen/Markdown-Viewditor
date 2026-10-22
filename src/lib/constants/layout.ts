/**
 * Viewer geometry defaults. The authoritative value lives in CSS
 * (`.viewer-content`'s `max-width` in `src/lib/styles/markdown.css`); these
 * constants are what code falls back to when it cannot read the live layout
 * — a headless export, or a viewer element that is not mounted.
 *
 * Keep `VIEWER_CONTENT_MAX_WIDTH_PX` equal to the CSS.
 */
export const VIEWER_CONTENT_MAX_WIDTH_PX = 800;
