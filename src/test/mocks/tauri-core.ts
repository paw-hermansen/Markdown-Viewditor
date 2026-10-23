/**
 * The canonical `@tauri-apps/api/core` mock.
 *
 * `convertFileSrc` stands in for Tauri's asset-protocol URL builder, and
 * tests assert exact URLs through it — so its shape is a contract that used
 * to be copy-pasted into ten test files and could drift in one of them.
 *
 * Import it *inside* the `vi.mock` factory: the factory is hoisted above
 * module imports, so a top-level import is not in scope when it runs.
 *
 * ```ts
 * vi.mock("@tauri-apps/api/core", async () => {
 *   const { tauriCoreMock } = await import("../../../test/mocks/tauri-core");
 *   return tauriCoreMock();
 * });
 * ```
 */
import { vi } from "vitest";

/**
 * Tauri's `convertFileSrc`, as the tests see it: `<protocol>://localhost/`
 * plus the percent-encoded path.
 */
export function convertFileSrcStub(path: string, protocol = "asset"): string {
  return `${protocol}://localhost/${encodeURIComponent(path)}`;
}

/**
 * A mock module for `@tauri-apps/api/core`. `invoke` starts as a bare spy —
 * tests that care about its answers set `mockResolvedValue` /
 * `mockImplementation` on it, or pass their own through `overrides`.
 */
export function tauriCoreMock(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    invoke: vi.fn(),
    convertFileSrc: convertFileSrcStub,
    ...overrides,
  };
}
