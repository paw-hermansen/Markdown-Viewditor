import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$lib/constants/messages", () => ({ APP_TITLE: "Markdown Viewditor" }));

import {
  confirmState,
  confirmSaveDiscardCancel,
  confirmOverwrite,
  confirmReplace,
  confirmReload,
  confirmOk,
  resolveConfirm,
} from "../confirm.svelte";

describe("confirm store", () => {
  beforeEach(() => {
    confirmState.current = null;
  });

  it("confirmSaveDiscardCancel opens a dialog and resolves with the chosen value", async () => {
    const promise = confirmSaveDiscardCancel("discard?");
    expect(confirmState.current).not.toBeNull();
    expect(confirmState.current!.message).toBe("discard?");
    expect(confirmState.current!.buttons.map((b) => b.value)).toEqual([
      "cancel",
      "discard",
      "save",
    ]);

    resolveConfirm("save");
    await expect(promise).resolves.toBe("save");
    expect(confirmState.current).toBeNull();
  });

  it("resolves null when dismissed (Escape/backdrop)", async () => {
    const promise = confirmSaveDiscardCancel("discard?");
    resolveConfirm(null);
    await expect(promise).resolves.toBeNull();
  });

  it("confirmOverwrite resolves boolean true for yes", async () => {
    const promise = confirmOverwrite("overwrite?");
    expect(confirmState.current!.buttons.map((b) => b.value)).toEqual([
      "no",
      "yes",
    ]);
    resolveConfirm("yes");
    await expect(promise).resolves.toBe(true);
  });

  it("confirmOverwrite resolves boolean false for no", async () => {
    const promise = confirmOverwrite("overwrite?");
    resolveConfirm("no");
    await expect(promise).resolves.toBe(false);
  });

  it("confirmReplace resolves boolean true for yes", async () => {
    const promise = confirmReplace("replace?");
    expect(confirmState.current!.buttons.map((b) => b.value)).toEqual([
      "no",
      "yes",
    ]);
    resolveConfirm("yes");
    await expect(promise).resolves.toBe(true);
  });

  it("confirmReplace resolves boolean false for no", async () => {
    const promise = confirmReplace("replace?");
    resolveConfirm("no");
    await expect(promise).resolves.toBe(false);
  });

  it("confirmReload resolves true for yes when not dirty", async () => {
    const promise = confirmReload("reload?", false);
    expect(confirmState.current!.buttons.map((b) => b.label)).toEqual([
      "Cancel",
      "Reload",
    ]);
    resolveConfirm("yes");
    await expect(promise).resolves.toBe(true);
  });

  it("confirmReload resolves true for yes when dirty", async () => {
    const promise = confirmReload("reload?", true);
    expect(confirmState.current!.buttons.map((b) => b.label)).toEqual([
      "Cancel",
      "Yes, Discard My Changes",
    ]);
    resolveConfirm("yes");
    await expect(promise).resolves.toBe(true);
  });

  it("confirmReload resolves false for no", async () => {
    const promise = confirmReload("reload?", false);
    resolveConfirm("no");
    await expect(promise).resolves.toBe(false);
  });

  it("confirmOk resolves true for ok", async () => {
    const promise = confirmOk("informational");
    expect(confirmState.current!.buttons).toHaveLength(1);
    resolveConfirm("ok");
    await expect(promise).resolves.toBe(true);
  });

  it("only one dialog may be open at a time", async () => {
    const first = confirmSaveDiscardCancel("first");
    resolveConfirm("cancel");
    await first;
    const second = confirmOverwrite("second");
    resolveConfirm("yes");
    await expect(second).resolves.toBe(true);
    expect(confirmState.current).toBeNull();
  });
});
