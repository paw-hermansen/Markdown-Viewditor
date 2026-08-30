import { axe } from "vitest-axe";
import type AxeCore from "axe-core";
import { expect } from "vitest";

/**
 * Default axe-core configuration for Markdown Viewditor tests.
 * Excludes CodeMirror internals (shadow DOM, dynamically generated)
 * and KaTeX math rendering elements.
 */
const DEFAULT_AXE_OPTIONS: AxeCore.RunOptions = {
  rules: {
    // CodeMirror generates elements with duplicate IDs for its internal structure
    "duplicate-id-active": { enabled: false },
    "duplicate-id-aria": { enabled: false },
  },
};

/**
 * Run axe-core accessibility checks on an HTML element or string.
 * Returns the results and also asserts no violations by default.
 *
 * @param html - Element or HTML string to check
 * @param options - Optional axe-core run options to merge with defaults
 * @returns The axe results for further inspection if needed
 */
export async function checkA11y(
  html: Element | string,
  options?: AxeCore.RunOptions,
): Promise<AxeCore.AxeResults> {
  const mergedOptions: AxeCore.RunOptions = {
    ...DEFAULT_AXE_OPTIONS,
    ...options,
    rules: {
      ...DEFAULT_AXE_OPTIONS.rules,
      ...options?.rules,
    },
  };

  const results = await axe(html, mergedOptions);

  expect(results).toHaveNoViolations();

  return results;
}

/**
 * Run axe-core accessibility checks without asserting.
 * Useful for debugging or when you want to inspect violations manually.
 *
 * @param html - Element or HTML string to check
 * @param options - Optional axe-core run options to merge with defaults
 * @returns The axe results
 */
export async function runA11yCheck(
  html: Element | string,
  options?: AxeCore.RunOptions,
): Promise<AxeCore.AxeResults> {
  const mergedOptions: AxeCore.RunOptions = {
    ...DEFAULT_AXE_OPTIONS,
    ...options,
    rules: {
      ...DEFAULT_AXE_OPTIONS.rules,
      ...options?.rules,
    },
  };

  return axe(html, mergedOptions);
}
