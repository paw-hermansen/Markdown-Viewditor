/**
 * Explicit state for the ODT document builder.
 *
 * The 8 inline-format flags are **flat toggles**, not a stack — an
 * unbalanced raw-HTML tag (`<b>` with no close) leaks into later tokens
 * today, and that behaviour must be preserved. `currentStyle()` keeps the
 * fixed B, I, U, S letter order of the `Char_*` style names, sub winning
 * over sup, and `mark`/`link` as orthogonal overlays.
 */

export class InlineFormatState {
  boldActive = false;
  italicActive = false;
  underlineActive = false;
  strikeActive = false;
  linkHref: string | null = null;
  subActive = false;
  superActive = false;
  markActive = false;

  currentStyle(): string | null {
    let flags = "";
    if (this.boldActive) flags += "B";
    if (this.italicActive) flags += "I";
    if (this.underlineActive) flags += "U";
    if (this.strikeActive) flags += "S";
    if (flags === "") flags = "P";

    let position = "";
    if (this.subActive) position = "_sub";
    else if (this.superActive) position = "_sup";

    if (flags === "P" && position === "") return null;

    return `Char_${flags}${position}`;
  }
}
