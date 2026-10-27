/**
 * DOM text measurement for the editor: how wide the visible text column
 * is, and a font-matched probe for measuring candidate line widths
 * (used by the markdown formatter).
 */
import type { EditorView } from "codemirror";
import type { TextMeasurer } from "$lib/utils/markdown-formatter";

export interface TextProbe {
  measure: TextMeasurer;
  destroy: () => void;
}

function cssPixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The visible text width of the editor's content column, in CSS px.
 * Page-zoom-invariant: `scaleX` (the rect/`offsetWidth` ratio) divides out
 * any zoom/device-pixel scaling on both sides of the comparison, so the
 * returned width is layout units either way (AGENTS.md "App Zoom").
 */
export function getVisibleTextWidth(view: EditorView): number {
  const scroll = view.scrollDOM;
  const line = view.contentDOM.querySelector<HTMLElement>(".cm-line");
  if (!line || !scroll.clientWidth) return 0;

  const scrollRect = scroll.getBoundingClientRect();
  const lineRect = line.getBoundingClientRect();
  const scrollStyle = getComputedStyle(scroll);
  const lineStyle = getComputedStyle(line);
  const scaleX =
    scroll.offsetWidth > 0 ? scrollRect.width / scroll.offsetWidth : 1;
  const borderLeft = cssPixels(scrollStyle.borderLeftWidth);
  const paddingRight = cssPixels(scrollStyle.paddingRight);

  // The line can be horizontally scrolled, so restore its unscrolled text
  // origin before comparing it with the visible right edge of the scroller.
  const textStart =
    lineRect.left +
    (scroll.scrollLeft + cssPixels(lineStyle.paddingLeft)) * scaleX;
  const visibleRight =
    scrollRect.left + (borderLeft + scroll.clientWidth - paddingRight) * scaleX;

  return (
    (visibleRight - textStart) / scaleX - cssPixels(lineStyle.paddingRight)
  );
}

/**
 * A hidden measuring span styled like the editor's `.cm-line`, so measured
 * widths match what the editor would lay out. Destroy it when done.
 */
export function getTextMeasurer(view: EditorView): TextProbe | undefined {
  const line = view.contentDOM.querySelector<HTMLElement>(".cm-line");
  if (!line || !document.body) return undefined;

  const style = getComputedStyle(line);
  const probe = document.createElement("span");
  probe.dataset.markdownFormatProbe = "true";
  probe.setAttribute("aria-hidden", "true");
  probe.style.position = "fixed";
  probe.style.left = "-100000px";
  probe.style.top = "-100000px";
  probe.style.display = "inline-block";
  probe.style.width = "max-content";
  probe.style.whiteSpace = "pre";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.padding = "0";
  probe.style.margin = "0";
  probe.style.border = "0";
  probe.style.fontFamily = style.fontFamily;
  probe.style.fontSize = style.fontSize;
  probe.style.fontStyle = style.fontStyle;
  probe.style.fontVariant = style.fontVariant;
  probe.style.fontWeight = style.fontWeight;
  probe.style.fontStretch = style.fontStretch;
  probe.style.letterSpacing = style.letterSpacing;
  probe.style.wordSpacing = style.wordSpacing;
  probe.style.fontKerning = style.fontKerning;
  probe.style.fontFeatureSettings = style.fontFeatureSettings;
  document.body.appendChild(probe);

  return {
    measure: (text) => {
      probe.textContent = text;
      return probe.getBoundingClientRect().width;
    },
    destroy: () => probe.remove(),
  };
}
