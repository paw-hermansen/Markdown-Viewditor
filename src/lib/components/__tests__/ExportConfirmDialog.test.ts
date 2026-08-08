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
      themeLabel: "GitHub Dark",
      actionLabel: "Export",
      isMacOS: true,
    });

    expect(exportConfirmState.current).not.toBeNull();
    expect(exportConfirmState.current!.themeLabel).toBe("GitHub Dark");
    expect(exportConfirmState.current!.actionLabel).toBe("Export");
    expect(exportConfirmState.current!.isMacOS).toBe(true);

    resolveExportConfirm({ confirmed: true, dontShowAgain: false });
    await promise;
  });

  it("resolves with the provided result", async () => {
    const promise = showExportConfirmDialog({
      themeLabel: "Monokai",
      actionLabel: "Print",
      isMacOS: false,
    });

    resolveExportConfirm({ confirmed: true, dontShowAgain: true });
    const result = await promise;
    expect(result.confirmed).toBe(true);
    expect(result.dontShowAgain).toBe(true);
  });

  it("clears current after resolution", async () => {
    const promise = showExportConfirmDialog({
      themeLabel: "GitHub Dark",
      actionLabel: "Export",
      isMacOS: true,
    });

    resolveExportConfirm({ confirmed: false, dontShowAgain: false });
    await promise;
    expect(exportConfirmState.current).toBeNull();
  });

  it("resolves with confirmed=false when cancelled", async () => {
    const promise = showExportConfirmDialog({
      themeLabel: "GitHub Dark",
      actionLabel: "Export",
      isMacOS: true,
    });

    resolveExportConfirm({ confirmed: false, dontShowAgain: false });
    const result = await promise;
    expect(result.confirmed).toBe(false);
  });

  it("stores platform-specific action label", async () => {
    const promise = showExportConfirmDialog({
      themeLabel: "Nord",
      actionLabel: "Print",
      isMacOS: false,
    });

    expect(exportConfirmState.current!.actionLabel).toBe("Print");
    expect(exportConfirmState.current!.isMacOS).toBe(false);

    resolveExportConfirm({ confirmed: true, dontShowAgain: false });
    await promise;
  });
});
