import { describe, it, expect } from "vitest";
import { base64ToBytes, bytesToBase64, bytesToDataUri } from "../base64";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe("bytesToBase64 / base64ToBytes", () => {
  it("round-trips arbitrary bytes", () => {
    const input = bytes(0, 1, 127, 128, 255, 42);
    expect(base64ToBytes(bytesToBase64(input))).toEqual(input);
  });

  it("matches the standard base64 alphabet", () => {
    // "Man" -> "TWFu"; confirms `+/` and padding behave like every other
    // implementation in the pipeline (data: URIs, Tauri IPC payloads).
    expect(bytesToBase64(bytes(77, 97, 110))).toBe("TWFu");
    expect(bytesToBase64(bytes(77, 97))).toBe("TWE=");
  });

  it("round-trips the empty buffer", () => {
    expect(bytesToBase64(bytes())).toBe("");
    expect(base64ToBytes("")).toEqual(bytes());
  });

  it("round-trips across the chunk boundary", () => {
    // The encoder emits `String.fromCharCode(...)` in 0x8000-byte chunks;
    // a value that straddles the boundary would corrupt if the chunking
    // were wrong (or blow the argument limit if it were absent).
    const input = new Uint8Array(0x8000 * 2 + 7);
    for (let i = 0; i < input.length; i++) input[i] = i % 256;
    expect(base64ToBytes(bytesToBase64(input))).toEqual(input);
  });

  it("round-trips binary blobs", () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(base64ToBytes(bytesToBase64(png))).toEqual(png);
  });
});

describe("bytesToDataUri", () => {
  it("wraps base64 in a data URI of the given type", () => {
    expect(bytesToDataUri(bytes(77, 97, 110), "image/png")).toBe(
      "data:image/png;base64,TWFu",
    );
  });

  it("produces a URI base64ToBytes can read back", () => {
    const input = bytes(1, 2, 3, 4, 5);
    const uri = bytesToDataUri(input, "font/woff2");
    const payload = uri.slice(uri.indexOf(",") + 1);
    expect(base64ToBytes(payload)).toEqual(input);
  });
});
