import { describe, it, expect } from "vitest";
import { tabLabels, UNTITLED } from "../tab-labels";

describe("tabLabels", () => {
  it("uses the bare file name when names are unique", () => {
    expect(tabLabels(["/a/one.md", "/b/two.md"])).toEqual(["one.md", "two.md"]);
  });

  it("adds the parent directory for same-named files", () => {
    expect(tabLabels(["/x/a/readme.md", "/x/b/readme.md", "/x/c.md"])).toEqual([
      "a/readme.md",
      "b/readme.md",
      "c.md",
    ]);
  });

  it("extends only as far as needed when parents collide too", () => {
    expect(
      tabLabels([
        "/p/a/docs/readme.md",
        "/p/b/docs/readme.md",
        "/p/c/readme.md",
      ]),
    ).toEqual(["a/docs/readme.md", "b/docs/readme.md", "c/readme.md"]);
  });

  it("treats backslashes as separators (Windows paths)", () => {
    expect(tabLabels(["C:\\a\\x.md", "C:\\b\\x.md"])).toEqual([
      "a/x.md",
      "b/x.md",
    ]);
  });

  it("labels unsaved documents as Untitled", () => {
    expect(tabLabels([null, "/a/x.md", null])).toEqual([
      UNTITLED,
      "x.md",
      UNTITLED,
    ]);
  });
});
