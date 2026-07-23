import "@testing-library/jest-dom/vitest";

if (typeof window !== "undefined") {
  window.__TAURI_INTERNALS__ = {
    invoke: vi.fn(),
    transformCallback: vi.fn(),
  };
}
