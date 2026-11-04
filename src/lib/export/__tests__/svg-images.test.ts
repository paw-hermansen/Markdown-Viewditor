import { describe, expect, it, vi } from "vitest";
import { inlineSvgImageHrefs } from "../svg-images";
import type { InvokeImpl } from "../assets";

const stub = (base64: string): InvokeImpl =>
  vi.fn(async (cmd: string) => {
    if (cmd === "read_file_as_base64") return base64;
    return undefined;
  }) as unknown as InvokeImpl;

describe("inlineSvgImageHrefs", () => {
  it("inlines localimg/asset hrefs to data URIs via Tauri IPC", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<image xlink:href="localimg://localhost/%2Fhome%2Fa%2Fpic.png" />' +
      '<image href="asset://localhost/%2Fhome%2Fb%2Flogo.svg" />' +
      "</svg>";
    const { svg: out, warnings } = await inlineSvgImageHrefs(svg, stub("QUJD"));
    expect(warnings).toEqual([]);
    expect(out).toContain("data:image/png;base64,QUJD");
    expect(out).toContain("data:image/svg+xml;base64,QUJD");
    expect(out).not.toContain("localimg://");
    expect(out).not.toContain("asset://");
  });

  it("passes remote and data: hrefs through untouched", async () => {
    const svg =
      '<svg><image href="https://x/a.png" />' +
      '<image xlink:href="data:image/png;base64,AA" /></svg>';
    const invoke = stub("QUJD");
    const { svg: out } = await inlineSvgImageHrefs(svg, invoke);
    expect(out).toBe(svg);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("warns and leaves the href when the file cannot be read", async () => {
    const svg =
      '<svg><image xlink:href="localimg://localhost/%2Fa.png" /></svg>';
    const failing: InvokeImpl = vi.fn(async () => {
      throw new Error("nope");
    }) as unknown as InvokeImpl;
    const { svg: out, warnings } = await inlineSvgImageHrefs(svg, failing);
    expect(out).toBe(svg);
    expect(warnings.some((w) => w.includes("could not be inlined"))).toBe(true);
  });
});
