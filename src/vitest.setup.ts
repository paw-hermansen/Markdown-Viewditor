import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// jsdom does not implement scrollIntoView; components that call it in
// $effect blocks would otherwise crash during tests.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

if (typeof window !== "undefined") {
  window.__TAURI_INTERNALS__ = {
    invoke: vi.fn(),
    transformCallback: vi.fn(),
  };
}
