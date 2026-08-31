import { vi, expect } from "vitest";
import "@testing-library/jest-dom/vitest";

// Import and register vitest-axe matchers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { toHaveNoViolations } = (await import("vitest-axe/matchers")) as any;
expect.extend({ toHaveNoViolations });

// jsdom does not implement scrollIntoView; components that call it in
// $effect blocks would otherwise crash during tests.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// jsdom does not implement getClientRects on Range. CodeMirror calls it
// during its internal measure cycle; without a stub the TypeError leaks
// to stderr even though CodeMirror catches it.
if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}

if (typeof window !== "undefined") {
  window.__TAURI_INTERNALS__ = {
    invoke: vi.fn(),
    transformCallback: vi.fn(),
  };
}
