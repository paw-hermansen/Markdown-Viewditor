import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSetZoom } = vi.hoisted(() => ({
  mockSetZoom: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ setZoom: mockSetZoom }),
}));

const mockStore = {
  get: vi.fn(),
  set: vi.fn(),
  save: vi.fn(),
};

vi.mock("@tauri-apps/plugin-store", () => ({
  Store: {
    load: vi.fn(() => Promise.resolve(mockStore)),
  },
}));

import {
  ZOOM_STEPS,
  MIN_ZOOM,
  MAX_ZOOM,
  currentZoom,
  zoomLabel,
  nextZoomStep,
  setZoom,
  zoomIn,
  zoomOut,
  resetZoom,
  applySavedZoom,
  withNominalZoom,
  handleZoomWheel,
} from "../zoom.svelte";
import { settingsState } from "../settings.svelte";

/** Minimal WheelEvent stand-in (node test environment). */
function wheel(
  deltaY: number,
  mods: { ctrlKey?: boolean; metaKey?: boolean; deltaMode?: number } = {},
): WheelEvent {
  return {
    deltaY,
    deltaMode: mods.deltaMode ?? 0,
    ctrlKey: mods.ctrlKey ?? false,
    metaKey: mods.metaKey ?? false,
    preventDefault: vi.fn(),
  } as unknown as WheelEvent;
}

describe("zoom store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsState.zoomLevel = 1;
  });

  describe("ladder", () => {
    it("keeps ZOOM_STEPS ascending and within bounds", () => {
      for (let i = 1; i < ZOOM_STEPS.length; i++) {
        expect(ZOOM_STEPS[i]).toBeGreaterThan(ZOOM_STEPS[i - 1]);
      }
      expect(ZOOM_STEPS[0]).toBe(MIN_ZOOM);
      expect(ZOOM_STEPS[ZOOM_STEPS.length - 1]).toBe(MAX_ZOOM);
    });
  });

  describe("nextZoomStep", () => {
    it("steps up and down the ladder", () => {
      expect(nextZoomStep(1, 1)).toBe(1.1);
      expect(nextZoomStep(1, -1)).toBe(0.9);
    });

    it("steps from off-ladder levels to the nearest neighbor", () => {
      expect(nextZoomStep(1.3, 1)).toBe(1.5);
      expect(nextZoomStep(1.3, -1)).toBe(1.25);
    });

    it("clamps at the ladder ends", () => {
      expect(nextZoomStep(3, 1)).toBe(3);
      expect(nextZoomStep(10, 1)).toBe(3);
      expect(nextZoomStep(0.5, -1)).toBe(0.5);
      expect(nextZoomStep(0.1, -1)).toBe(0.5);
    });
  });

  describe("setZoom", () => {
    it("applies the level to the webview and stores it", async () => {
      await setZoom(1.25);
      expect(mockSetZoom).toHaveBeenCalledWith(1.25);
      expect(settingsState.zoomLevel).toBe(1.25);
      expect(currentZoom()).toBe(1.25);
    });

    it("clamps out-of-range levels", async () => {
      await setZoom(10);
      expect(settingsState.zoomLevel).toBe(3);
      await setZoom(0);
      expect(settingsState.zoomLevel).toBe(0.5);
    });

    it("does not throw when the webview rejects", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockSetZoom.mockRejectedValueOnce(new Error("no permission"));
      await expect(setZoom(1.5)).resolves.toBeUndefined();
      expect(settingsState.zoomLevel).toBe(1.5);
      warnSpy.mockRestore();
    });
  });

  describe("zoomIn / zoomOut / resetZoom", () => {
    it("steps up", async () => {
      await zoomIn();
      expect(settingsState.zoomLevel).toBe(1.1);
      expect(mockSetZoom).toHaveBeenCalledWith(1.1);
    });

    it("steps down", async () => {
      await zoomOut();
      expect(settingsState.zoomLevel).toBe(0.9);
      expect(mockSetZoom).toHaveBeenCalledWith(0.9);
    });

    it("resets to 100%", async () => {
      await setZoom(2);
      vi.clearAllMocks();
      await resetZoom();
      expect(settingsState.zoomLevel).toBe(1);
      expect(mockSetZoom).toHaveBeenCalledWith(1);
    });
  });

  describe("applySavedZoom", () => {
    it("applies the persisted level without changing it", async () => {
      settingsState.zoomLevel = 1.25;
      await applySavedZoom();
      expect(mockSetZoom).toHaveBeenCalledWith(1.25);
      expect(settingsState.zoomLevel).toBe(1.25);
    });
  });

  describe("zoomLabel", () => {
    it("formats the level as a percentage", () => {
      expect(zoomLabel(1)).toBe("100%");
      expect(zoomLabel(1.25)).toBe("125%");
      expect(zoomLabel(0.9)).toBe("90%");
    });
  });

  describe("withNominalZoom", () => {
    it("runs at 100% and restores the previous level", async () => {
      await setZoom(2);
      vi.clearAllMocks();

      const result = await withNominalZoom(async () => {
        expect(mockSetZoom).toHaveBeenLastCalledWith(1);
        return 42;
      });

      expect(result).toBe(42);
      expect(mockSetZoom.mock.calls.map((c) => c[0])).toEqual([1, 2]);
      expect(settingsState.zoomLevel).toBe(2);
    });

    it("restores the previous level even when the export fails", async () => {
      await setZoom(1.5);
      vi.clearAllMocks();

      await expect(
        withNominalZoom(async () => {
          throw new Error("export failed");
        }),
      ).rejects.toThrow("export failed");

      expect(mockSetZoom.mock.calls.map((c) => c[0])).toEqual([1, 1.5]);
    });

    it("shares one guard across nested calls", async () => {
      await setZoom(1.5);
      vi.clearAllMocks();

      await withNominalZoom(async () => {
        await withNominalZoom(async () => {
          expect(mockSetZoom).toHaveBeenLastCalledWith(1);
        });
        // The nested guard must not restore mid-export.
        expect(mockSetZoom).toHaveBeenLastCalledWith(1);
      });

      expect(mockSetZoom.mock.calls.map((c) => c[0])).toEqual([1, 1.5]);
    });
  });

  describe("handleZoomWheel", () => {
    it("ignores plain wheel events", () => {
      const e = wheel(-200);
      handleZoomWheel(e);
      expect(e.preventDefault).not.toHaveBeenCalled();
      expect(mockSetZoom).not.toHaveBeenCalled();
    });

    it("zooms in on Ctrl+wheel up", () => {
      handleZoomWheel(wheel(-50, { ctrlKey: true }));
      expect(settingsState.zoomLevel).toBe(1.1);
    });

    it("zooms out on Ctrl+wheel down", () => {
      handleZoomWheel(wheel(50, { ctrlKey: true }));
      expect(settingsState.zoomLevel).toBe(0.9);
    });

    it("accepts Meta (macOS pinch) as well", () => {
      handleZoomWheel(wheel(-50, { metaKey: true }));
      expect(settingsState.zoomLevel).toBe(1.1);
    });

    it("accumulates small trackpad deltas into one step", () => {
      handleZoomWheel(wheel(-10, { ctrlKey: true }));
      expect(settingsState.zoomLevel).toBe(1);
      handleZoomWheel(wheel(-40, { ctrlKey: true }));
      expect(settingsState.zoomLevel).toBe(1.1);
    });

    it("steps more than once for large deltas", () => {
      handleZoomWheel(wheel(-100, { ctrlKey: true }));
      expect(settingsState.zoomLevel).toBe(1.25);
    });

    it("preventDefaults zoom gestures so the page does not scroll", () => {
      const e = wheel(-50, { ctrlKey: true });
      handleZoomWheel(e);
      expect(e.preventDefault).toHaveBeenCalled();
    });
  });
});
