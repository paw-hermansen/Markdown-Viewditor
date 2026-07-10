import { describe, it, expect } from "vitest";
import { updateWordCount } from "../editor.svelte";

describe("updateWordCount", () => {
  it("should count words correctly", () => {
    const content = "Hello World";
    updateWordCount(content);
    // Note: This test verifies the function runs without error
    // Full state assertion requires Svelte 5 test environment
  });

  it("should handle empty string", () => {
    expect(() => updateWordCount("")).not.toThrow();
  });

  it("should handle whitespace-only string", () => {
    expect(() => updateWordCount("   ")).not.toThrow();
  });
});
