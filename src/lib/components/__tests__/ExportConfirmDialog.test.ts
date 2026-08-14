import { describe, it, expect, beforeEach } from "vitest";

import {
  exportConfirmState,
  showExportConfirmDialog,
  resolveExportConfirm,
} from "$lib/stores/export-confirm-dialog.svelte";

describe("export-confirm-dialog store", () => {
  beforeEach(() => {
    exportConfirmState.current = null;
  });

  it("sets current request when showExportConfirmDialog is called", async () => {
    const promise = showExportConfirmDialog({
      themeKind: "viewer",
      themeLabel: "GitHub Dark",
      actionLabel: "Export",
      isMacOS: true,
      optionGroups: [],
      currentOptions: {},
    });

    expect(exportConfirmState.current).not.toBeNull();
    expect(exportConfirmState.current!.themeLabel).toBe("GitHub Dark");
    expect(exportConfirmState.current!.actionLabel).toBe("Export");
    expect(exportConfirmState.current!.isMacOS).toBe(true);
    expect(exportConfirmState.current!.themeKind).toBe("viewer");
    expect(exportConfirmState.current!.optionGroups).toEqual([]);

    resolveExportConfirm({ confirmed: true, dontShowAgain: false });
    await promise;
  });

  it("resolves with the provided result", async () => {
    const promise = showExportConfirmDialog({
      themeKind: "viewer",
      themeLabel: "Monokai",
      actionLabel: "Print",
      isMacOS: false,
      optionGroups: [],
      currentOptions: {},
    });

    resolveExportConfirm({ confirmed: true, dontShowAgain: true });
    const result = await promise;
    expect(result.confirmed).toBe(true);
    expect(result.dontShowAgain).toBe(true);
  });

  it("clears current after resolution", async () => {
    const promise = showExportConfirmDialog({
      themeKind: "viewer",
      themeLabel: "GitHub Dark",
      actionLabel: "Export",
      isMacOS: true,
      optionGroups: [],
      currentOptions: {},
    });

    resolveExportConfirm({ confirmed: false, dontShowAgain: false });
    await promise;
    expect(exportConfirmState.current).toBeNull();
  });

  it("resolves with confirmed=false when cancelled", async () => {
    const promise = showExportConfirmDialog({
      themeKind: "viewer",
      themeLabel: "GitHub Dark",
      actionLabel: "Export",
      isMacOS: true,
      optionGroups: [],
      currentOptions: {},
    });

    resolveExportConfirm({ confirmed: false, dontShowAgain: false });
    const result = await promise;
    expect(result.confirmed).toBe(false);
  });

  it("stores platform-specific action label", async () => {
    const promise = showExportConfirmDialog({
      themeKind: "viewer",
      themeLabel: "Nord",
      actionLabel: "Print",
      isMacOS: false,
      optionGroups: [],
      currentOptions: {},
    });

    expect(exportConfirmState.current!.actionLabel).toBe("Print");
    expect(exportConfirmState.current!.isMacOS).toBe(false);

    resolveExportConfirm({ confirmed: true, dontShowAgain: false });
    await promise;
  });

  it("carries resolved options back through the promise", async () => {
    const promise = showExportConfirmDialog({
      themeKind: "neutral",
      themeLabel: "",
      actionLabel: "Export",
      isMacOS: true,
      optionGroups: [],
      currentOptions: { "odt.rasterizeMath": false },
    });

    resolveExportConfirm({
      confirmed: true,
      dontShowAgain: false,
      options: { "odt.rasterizeMath": true, "odt.rasterResolution": 3 },
    });
    const result = await promise;
    expect(result.options).toEqual({
      "odt.rasterizeMath": true,
      "odt.rasterResolution": 3,
    });
  });
});
