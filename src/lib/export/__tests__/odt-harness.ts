/**
 * Shared scaffolding for the ODT exporter tests.
 *
 * Every ODT suite used to carry its own copy of the same ritual — mock the
 * save dialog and `invoke`, run the exporter, dig the `.odt` bytes back out
 * of the `write_file_binary` call, unzip them — and `odt.test.ts` alone had
 * eight helpers and thirty inlined copies of it.
 *
 * The fragility worth knowing about: several helpers read
 * `invoke.mock.calls[0][1]`, which is only the export's payload when nothing
 * else called `invoke` first. Any export that resolves an image issues
 * `read_file_as_base64` before the write, and those tests were silently
 * reading the wrong call. {@link exportToZip} searches for the write and only
 * considers the calls made by its own export.
 *
 * The reader helpers below keep the names the suites already use; they are
 * one-liners over {@link exportToZip}. New tests should prefer `exportToZip`
 * with an explicit options object.
 */

import JSZip from "jszip";
import katex from "katex";
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import vscodeKatex from "@vscode/markdown-it-katex";
import mark from "markdown-it-mark";
import { vi } from "vitest";
import type Token from "markdown-it/lib/token.mjs";
import mathBracketsPlugin from "$lib/utils/math-brackets";
import { odtExporter } from "../exporters/odt";
import type { ExportContext, ExportResult } from "../types";

/** Markdown-it plugins to enable beyond the base (footnote + task-lists). */
export type OdtPlugin = "mark" | "math";

export interface OdtExportOptions {
  /** Extra markdown-it plugins. Defaults to none. */
  plugins?: OdtPlugin[];
  frontmatter?: Record<string, unknown> | null;
  fileName?: string;
  /** Per-export options (`odt.rasterizeMath`, …). */
  options?: Record<string, unknown>;
  /**
   * Canned responses for `invoke` commands the export may issue besides the
   * write — e.g. `{ read_file_as_base64: someBase64 }`.
   */
  invokeStubs?: Record<string, unknown>;
  /**
   * Path the save dialog resolves to. `null` simulates the user cancelling,
   * which the exporter answers with an empty result and no write.
   */
  savePath?: string | null;
}

/** The markdown-it instance the exporter's `tokens`/`html` pair is built with. */
export function markdownIt(plugins: OdtPlugin[] = []): MarkdownIt {
  let md = new MarkdownIt({ html: true }).use(footnote).use(taskLists);
  if (plugins.includes("mark")) md = md.use(mark);
  if (plugins.includes("math")) {
    md = md
      .use(vscodeKatex, {
        katex,
        enableBareBlocks: true,
        enableFencedBlocks: true,
      })
      .use(mathBracketsPlugin);
  }
  return md;
}

export function makeTokens(src: string, plugins: OdtPlugin[] = []): Token[] {
  return markdownIt(plugins).parse(src, {});
}

// The plugin-specific names the suites already call.
export const makeMarkTokens = (src: string): Token[] =>
  makeTokens(src, ["mark"]);
export const makeMathTokens = (src: string): Token[] =>
  makeTokens(src, ["math"]);

/**
 * Run the ODT exporter with the IPC mocks wired up. Returns the exporter's
 * result together with the `.odt` payload it wrote, which the reader helpers
 * below turn into a zip.
 */
async function runExport(
  src: string,
  opts: OdtExportOptions,
): Promise<{ result: ExportResult; payload: number[] }> {
  const plugins = opts.plugins ?? [];
  const md = markdownIt(plugins);
  const ctx: ExportContext = {
    markdown: src,
    html: md.render(src),
    frontmatter: opts.frontmatter ?? null,
    fileName: opts.fileName ?? "test",
    tokens: md.parse(src, {}),
    options: opts.options,
  };

  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");
  const { invokeStubs, savePath = "/tmp/test.odt" } = opts;
  vi.mocked(save).mockResolvedValue(savePath as never);
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation(async (cmd: string) =>
    invokeStubs && cmd in invokeStubs ? invokeStubs[cmd] : undefined,
  );

  // Consider only the calls this export makes: a test may have exported
  // before, and `invoke.mock.calls` accumulates.
  const before = vi.mocked(invoke).mock.calls.length;
  const result = await odtExporter.export(ctx);
  const ours = vi.mocked(invoke).mock.calls.slice(before);
  const write = ours.find((call) => call[0] === "write_file_binary");
  if (!write) {
    // A cancelled save dialog writes nothing — that is the point of it.
    if (savePath === null) return { result, payload: [] };
    throw new Error("write_file_binary was never invoked");
  }
  return {
    result,
    payload: (write[1] as { content: number[] }).content,
  };
}

/** Run the exporter and return its result (saved path, warnings). */
export async function runOdtExport(
  src: string,
  opts: OdtExportOptions = {},
): Promise<ExportResult> {
  return (await runExport(src, opts)).result;
}

/** Run the exporter and return the `.odt` package it wrote. */
export async function exportToZip(
  src: string,
  opts: OdtExportOptions = {},
): Promise<JSZip> {
  const { payload } = await runExport(src, opts);
  return JSZip.loadAsync(new Uint8Array(payload));
}

/** The zip entry names, in package order. */
export function zipEntries(zip: JSZip): string[] {
  return Object.keys(zip.files);
}

/** One entry's text. Throws when the package has no such entry. */
export function zipText(zip: JSZip, entry: string): Promise<string> {
  const file = zip.file(entry);
  if (!file) throw new Error(`no such entry in the exported ODT: ${entry}`);
  return file.async("text");
}

// ── reader helpers, named as the suites already call them ─────────────────

export async function getContentXml(
  src: string,
  options?: Record<string, unknown>,
): Promise<string> {
  return zipText(await exportToZip(src, { options }), "content.xml");
}

export async function getContentXmlWithMark(
  src: string,
  options?: Record<string, unknown>,
): Promise<string> {
  return zipText(
    await exportToZip(src, { plugins: ["mark"], options }),
    "content.xml",
  );
}

export async function getMathContentXml(
  src: string,
  options?: Record<string, unknown>,
): Promise<string> {
  return zipText(
    await exportToZip(src, { plugins: ["math"], options }),
    "content.xml",
  );
}

export async function getStylesXml(
  src: string,
  options?: Record<string, unknown>,
): Promise<string> {
  return zipText(await exportToZip(src, { options }), "styles.xml");
}

/**
 * The list of file paths inside the exported ODT ZIP.
 *
 * `invokeStubs` (optional) maps additional `invoke` commands to canned
 * responses — used by tests that hit the relative-path branch in
 * `resolveImage`, which calls `read_file_as_base64`.
 */
export async function getZipFileList(
  src: string,
  options?: Record<string, unknown>,
  invokeStubs?: Record<string, unknown>,
): Promise<string[]> {
  return zipEntries(await exportToZip(src, { options, invokeStubs }));
}
