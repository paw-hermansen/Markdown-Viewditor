import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import ts from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs["flat/recommended"],
  prettier,
  ...svelte.configs["flat/prettier"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
  {
    // Entry and UI code must not statically import exporter
    // implementations: the exporter registry loads them lazily on first
    // export (ensureExporters), and static imports from the entry bundle
    // fuse the whole export pipeline into the startup chunk — defeating
    // the registry's lazy import()s. Option ids live in
    // src/lib/export/option-ids.ts instead.
    files: [
      "src/routes/**/*.{ts,svelte}",
      "src/lib/components/**/*.{ts,svelte}",
      "src/lib/stores/**/*.{ts,svelte}",
      "src/lib/commands/**/*.{ts,svelte}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/export/exporters/*"],
              message:
                "Exporters load lazily via ensureExporters(); import option ids from $lib/export/option-ids instead of exporter implementations.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      "build/",
      ".svelte-kit/",
      "dist/",
      "node_modules/",
      "src-tauri/target/",
    ],
  },
);
