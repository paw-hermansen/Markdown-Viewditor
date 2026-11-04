/**
 * Shared scaffolding for the DOCX exporter tests (mirrors `odt-harness.ts`).
 *
 * Mocks the save dialog and `invoke`, runs `docxExporter.export()`, digs the
 * `.docx` bytes out of the `write_file_binary` call (searching only the calls
 * its own export made — `read_file_as_base64` calls precede the write), and
 * unzips the package with JSZip.
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
import { docxExporter } from "../exporters/docx";
import type { ExportContext, ExportResult } from "../types";

export type DocxPlugin = "mark" | "math";

export interface DocxExportOptions {
  /** Extra markdown-it plugins. Defaults to none. */
  plugins?: DocxPlugin[];
  frontmatter?: Record<string, unknown> | null;
  fileName?: string;
  /** Per-export options (`docx.rasterizeMath`, …). */
  options?: Record<string, unknown>;
  /** Canned responses for `invoke` commands besides the write. */
  invokeStubs?: Record<string, unknown>;
  /** Save-dialog result; `null` simulates a cancel. */
  savePath?: string | null;
}

/** The markdown-it instance the exporter's `tokens`/`html` pair is built with. */
export function markdownIt(plugins: DocxPlugin[] = []): MarkdownIt {
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

export function makeTokens(src: string, plugins: DocxPlugin[] = []): Token[] {
  return markdownIt(plugins).parse(src, {});
}

export const makeMarkTokens = (src: string): Token[] =>
  makeTokens(src, ["mark"]);
export const makeMathTokens = (src: string): Token[] =>
  makeTokens(src, ["math"]);

async function runExport(
  src: string,
  opts: DocxExportOptions,
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
  const { invokeStubs, savePath = "/tmp/test.docx" } = opts;
  vi.mocked(save).mockResolvedValue(savePath as never);
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation(async (cmd: string) =>
    invokeStubs && cmd in invokeStubs ? invokeStubs[cmd] : undefined,
  );

  // Only the calls this export makes count (mock.calls accumulates).
  const before = vi.mocked(invoke).mock.calls.length;
  const result = await docxExporter.export(ctx);
  const ours = vi.mocked(invoke).mock.calls.slice(before);
  const write = ours.find((call) => call[0] === "write_file_binary");
  if (!write) {
    if (savePath === null) return { result, payload: [] };
    throw new Error("write_file_binary was never invoked");
  }
  return {
    result,
    payload: (write[1] as { content: number[] }).content,
  };
}

/** Run the exporter and return its result (saved path, warnings). */
export async function runDocxExport(
  src: string,
  opts: DocxExportOptions = {},
): Promise<ExportResult> {
  return (await runExport(src, opts)).result;
}

/** Run the exporter and return the `.docx` package it wrote. */
export async function exportToZip(
  src: string,
  opts: DocxExportOptions = {},
): Promise<JSZip> {
  const { payload } = await runExport(src, opts);
  return JSZip.loadAsync(new Uint8Array(payload));
}

/** The zip entry names. */
export function zipEntries(zip: JSZip): string[] {
  return Object.keys(zip.files);
}

/** One entry's text. Throws when the package has no such entry. */
export function zipText(zip: JSZip, entry: string): Promise<string> {
  const file = zip.file(entry);
  if (!file) throw new Error(`no such entry in the exported DOCX: ${entry}`);
  return file.async("text");
}

/** One entry's raw bytes. */
export function zipBytes(zip: JSZip, entry: string): Promise<Uint8Array> {
  const file = zip.file(entry);
  if (!file) throw new Error(`no such entry in the exported DOCX: ${entry}`);
  return file.async("uint8array");
}

// ── reader helpers ────────────────────────────────────────────────────────

export async function getDocumentXml(
  src: string,
  options?: Record<string, unknown>,
): Promise<string> {
  return zipText(await exportToZip(src, { options }), "word/document.xml");
}

export async function getDocumentXmlWithMark(
  src: string,
  options?: Record<string, unknown>,
): Promise<string> {
  return zipText(
    await exportToZip(src, { plugins: ["mark"], options }),
    "word/document.xml",
  );
}

export async function getMathDocumentXml(
  src: string,
  options?: Record<string, unknown>,
): Promise<string> {
  return zipText(
    await exportToZip(src, { plugins: ["math"], options }),
    "word/document.xml",
  );
}

export async function getStylesXml(
  src: string,
  options?: Record<string, unknown>,
): Promise<string> {
  return zipText(await exportToZip(src, { options }), "word/styles.xml");
}

export async function getRelsXml(
  src: string,
  options?: Record<string, unknown>,
): Promise<string> {
  return zipText(
    await exportToZip(src, { options }),
    "word/_rels/document.xml.rels",
  );
}

export async function getNumberingXml(
  src: string,
  options?: Record<string, unknown>,
): Promise<string> {
  return zipText(await exportToZip(src, { options }), "word/numbering.xml");
}

export async function getFootnotesXml(
  src: string,
  options?: Record<string, unknown>,
): Promise<string> {
  return zipText(await exportToZip(src, { options }), "word/footnotes.xml");
}

export async function getZipFileList(
  src: string,
  options?: Record<string, unknown>,
  invokeStubs?: Record<string, unknown>,
): Promise<string[]> {
  return zipEntries(await exportToZip(src, { options, invokeStubs }));
}
