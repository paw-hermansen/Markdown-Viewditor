// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { syncViewerBackground } from "../markdown";

describe("syncViewerBackground", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.style.removeProperty("--viewer-bg");
  });

  it("derives --viewer-bg from the #viewer-content background", () => {
    const el = document.createElement("div");
    el.id = "viewer-content";
    el.style.backgroundColor = "rgb(1, 2, 3)";
    document.body.appendChild(el);

    syncViewerBackground();

    expect(
      document.documentElement.style.getPropertyValue("--viewer-bg"),
    ).toContain("1, 2, 3");
  });

  it("does nothing when #viewer-content does not exist yet", () => {
    syncViewerBackground();
    expect(document.documentElement.style.getPropertyValue("--viewer-bg")).toBe(
      "",
    );
  });
});
