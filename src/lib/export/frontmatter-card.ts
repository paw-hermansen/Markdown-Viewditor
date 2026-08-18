/**
 * Shared frontmatter/skill card rendering utilities for the export pipeline.
 *
 * The on-screen Viewer (Viewer.svelte) renders the frontmatter card as live
 * Svelte DOM. HTML and ODT exporters need the same markup as a plain string
 * so they can embed it in standalone output. This module provides that
 * generation for both formats.
 */

import type { Frontmatter } from "$lib/types";

/** Shared option ID — each exporter prefixes with its own id. */
export const OPTION_INCLUDE_FRONTMATTER = "includeFrontmatter";

/**
 * A frontmatter block with both `name` and `description` is treated as a
 * skill file and rendered as a prominent skill card. Mirrors the detection
 * logic in Viewer.svelte.
 */
export function isSkill(fm: Frontmatter): boolean {
  return Boolean(fm.name) && Boolean(fm.description);
}

/** Convert any frontmatter value to a displayable string. */
export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generate the frontmatter/skill card as an HTML string, matching the
 * structure produced by Viewer.svelte (lines 321-348). The CSS classes
 * correspond to rules in markdown.css (lines 192-252), which the HTML
 * exporter inlines via the stylesheet collector.
 */
export function generateFrontmatterCardHtml(fm: Frontmatter): string {
  const skill = isSkill(fm);

  if (skill) {
    const skip = new Set(["name", "description"]);
    const extraEntries = Object.entries(fm).filter(([k]) => !skip.has(k));

    let html = '<div class="frontmatter-card" data-line="1">';
    html += '<div class="skill-badge">Skill</div>';
    if (fm.name) {
      html += `<div class="skill-name">${escapeHtml(String(fm.name))}</div>`;
    }
    if (fm.description) {
      html += `<p class="skill-description">${escapeHtml(String(fm.description))}</p>`;
    }
    if (extraEntries.length > 0) {
      html += '<dl class="skill-meta">';
      for (const [key, value] of extraEntries) {
        html += `<dt>${escapeHtml(key)}</dt>`;
        html += `<dd>${escapeHtml(formatValue(value))}</dd>`;
      }
      html += "</dl>";
    }
    html += "</div>";
    return html;
  }

  // Plain frontmatter (no skill).
  let html = '<div class="frontmatter-card" data-line="1">';
  html += '<div class="frontmatter-title">Frontmatter</div>';
  html += '<dl class="skill-meta">';
  for (const [key, value] of Object.entries(fm)) {
    html += `<dt>${escapeHtml(key)}</dt>`;
    html += `<dd>${escapeHtml(formatValue(value))}</dd>`;
  }
  html += "</dl>";
  html += "</div>";
  return html;
}
