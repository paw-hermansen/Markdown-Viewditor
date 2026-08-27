// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("keyboard utils", () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
  });

  describe("modLabel (non-macOS)", () => {
    beforeEach(() => {
      Object.defineProperty(globalThis, "navigator", {
        value: { userAgent: "Mozilla/5.0 (X11; Linux x86_64)" },
        configurable: true,
      });
    });

    it("returns shortcut unchanged on non-macOS", async () => {
      const { modLabel } = await import("../keyboard");
      expect(modLabel("Ctrl+S")).toBe("Ctrl+S");
    });

    it("returns Ctrl+Shift+S unchanged", async () => {
      const { modLabel } = await import("../keyboard");
      expect(modLabel("Ctrl+Shift+S")).toBe("Ctrl+Shift+S");
    });

    it("returns standalone Ctrl unchanged", async () => {
      const { modLabel } = await import("../keyboard");
      expect(modLabel("Ctrl")).toBe("Ctrl");
    });

    it("returns standalone Shift unchanged", async () => {
      const { modLabel } = await import("../keyboard");
      expect(modLabel("Shift")).toBe("Shift");
    });

    it("returns standalone Alt unchanged", async () => {
      const { modLabel } = await import("../keyboard");
      expect(modLabel("Alt")).toBe("Alt");
    });
  });

  describe("modLabel (macOS)", () => {
    beforeEach(() => {
      Object.defineProperty(globalThis, "navigator", {
        value: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
        configurable: true,
      });
    });

    it("replaces Ctrl with ⌘", async () => {
      const { modLabel } = await import("../keyboard");
      expect(modLabel("Ctrl+S")).toBe("⌘S");
    });

    it("replaces Ctrl+Shift with ⌘⇧", async () => {
      const { modLabel } = await import("../keyboard");
      expect(modLabel("Ctrl+Shift+S")).toBe("⌘⇧S");
    });

    it("replaces Alt with ⌥", async () => {
      const { modLabel } = await import("../keyboard");
      expect(modLabel("Alt+X")).toBe("⌥X");
    });

    it("handles complex shortcuts", async () => {
      const { modLabel } = await import("../keyboard");
      expect(modLabel("Ctrl+Shift+P")).toBe("⌘⇧P");
    });

    it("handles shortcut without modifiers", async () => {
      const { modLabel } = await import("../keyboard");
      expect(modLabel("F1")).toBe("F1");
    });

    it("replaces standalone Ctrl with ⌘", async () => {
      const { modLabel } = await import("../keyboard");
      expect(modLabel("Ctrl")).toBe("⌘");
    });

    it("replaces standalone Shift with ⇧", async () => {
      const { modLabel } = await import("../keyboard");
      expect(modLabel("Shift")).toBe("⇧");
    });

    it("replaces standalone Alt with ⌥", async () => {
      const { modLabel } = await import("../keyboard");
      expect(modLabel("Alt")).toBe("⌥");
    });
  });
});
