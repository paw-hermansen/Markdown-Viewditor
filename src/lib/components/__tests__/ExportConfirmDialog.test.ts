// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { tick } from "svelte";
import { checkA11y } from "$lib/utils/__tests__/a11y-helper";
import ExportConfirmDialog from "$lib/components/ExportConfirmDialog.svelte";
import type { OptionGroup } from "$lib/export/types";

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
      title: "Export HTML",
      themeKind: "viewer",
      themeLabel: "GitHub Dark",
      actionLabel: "Export",
      isMacOS: true,
      optionGroups: [],
      currentOptions: {},
    });

    expect(exportConfirmState.current).not.toBeNull();
    expect(exportConfirmState.current!.title).toBe("Export HTML");
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
      title: "Print / PDF",
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
      title: "Export HTML",
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
      title: "Export HTML",
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
      title: "Print / PDF",
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
      title: "Export ODT",
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

  it("has no accessibility violations", async () => {
    exportConfirmState.current = {
      title: "Export HTML",
      themeKind: "viewer",
      themeLabel: "GitHub Dark",
      actionLabel: "Export",
      isMacOS: true,
      optionGroups: [],
      currentOptions: {},
      resolve: () => {},
    };
    const { container } = render(ExportConfirmDialog);
    await checkA11y(container);
    exportConfirmState.current = null;
  });
});

describe("export-confirm-dialog select options", () => {
  const optionGroups: OptionGroup[] = [
    {
      id: "resolution",
      label: "Image resolution",
      options: [
        {
          id: "odt.rasterResolution",
          label: "Resolution",
          kind: "select",
          value: 2,
          choices: [
            { value: 1, label: "1x (96 DPI)" },
            { value: 2, label: "2x (192 DPI)" },
            { value: 3, label: "3x (288 DPI)" },
          ],
        },
      ],
    },
  ];

  function openDialog(
    currentOptions: Record<string, unknown> = { "odt.rasterResolution": 2 },
  ) {
    return showExportConfirmDialog({
      title: "Export ODT",
      themeKind: "neutral",
      themeLabel: "",
      actionLabel: "Export",
      isMacOS: true,
      optionGroups,
      currentOptions,
    });
  }

  beforeEach(() => {
    exportConfirmState.current = null;
  });

  it("renders a themed select field instead of a native select", async () => {
    const promise = openDialog();
    render(ExportConfirmDialog);
    await tick();

    expect(document.querySelector("select")).toBeNull();
    const trigger = screen.getByRole("button", { name: "Resolution" });
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveTextContent("2x (192 DPI)");

    resolveExportConfirm({ confirmed: false, dontShowAgain: false });
    await promise;
  });

  it("carries the chosen select value into the resolved options", async () => {
    const promise = openDialog();
    render(ExportConfirmDialog);
    await tick();

    await fireEvent.click(screen.getByRole("button", { name: "Resolution" }));
    await tick();
    await fireEvent.click(screen.getByRole("option", { name: "3x (288 DPI)" }));
    await tick();
    await fireEvent.click(screen.getByRole("button", { name: "Export" }));

    const result = await promise;
    expect(result.confirmed).toBe(true);
    expect(result.options).toEqual({ "odt.rasterResolution": 3 });
  });

  it("maps select values by type, not by string identity", async () => {
    const promise = openDialog({ "odt.rasterResolution": 1 });
    render(ExportConfirmDialog);
    await tick();

    await fireEvent.click(screen.getByRole("button", { name: "Resolution" }));
    await tick();
    await fireEvent.click(screen.getByRole("option", { name: "2x (192 DPI)" }));
    await tick();
    await fireEvent.click(screen.getByRole("button", { name: "Export" }));

    const result = await promise;
    expect(result.options?.["odt.rasterResolution"]).toBe(2);
  });

  it("has no accessibility violations with a select group", async () => {
    exportConfirmState.current = {
      title: "Export ODT",
      themeKind: "neutral",
      themeLabel: "",
      actionLabel: "Export",
      isMacOS: true,
      optionGroups,
      currentOptions: { "odt.rasterResolution": 2 },
      resolve: () => {},
    };
    const { container } = render(ExportConfirmDialog);
    await checkA11y(container);
    exportConfirmState.current = null;
  });
});
