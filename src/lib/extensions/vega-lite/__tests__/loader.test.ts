import { describe, expect, it } from "vitest";
import { INLINE_ONLY_DATA_MESSAGE, inlineOnlyLoader } from "../loader";

describe("inlineOnlyLoader", () => {
  it("rejects every load with the inline-only message", async () => {
    await expect(inlineOnlyLoader.load()).rejects.toThrow(
      INLINE_ONLY_DATA_MESSAGE,
    );
    await expect(inlineOnlyLoader.http()).rejects.toThrow(
      INLINE_ONLY_DATA_MESSAGE,
    );
    await expect(inlineOnlyLoader.file()).rejects.toThrow(
      INLINE_ONLY_DATA_MESSAGE,
    );
  });

  it("passes every URI through sanitize unchanged (async)", async () => {
    // Vega's default sanitizer empties localimg:// / asset:// and rewrites
    // file:// — the pass-through is load-bearing for the image-href contract.
    for (const uri of [
      "https://example.com/pic.png",
      "data:image/png;base64,AA",
      "localimg://localhost/%2Fhome%2Fa.png",
      "asset://localhost/%2Fhome%2Fb.png",
      "file:///home/user/pic.png",
      "/home/user/pic.png",
    ]) {
      await expect(inlineOnlyLoader.sanitize(uri)).resolves.toEqual({
        href: uri,
      });
    }
  });
});
