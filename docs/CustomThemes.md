# Custom Themes

A custom theme is a CSS file that styles code highlighting and rendered markdown in Markdown Viewditor.

## Installation

Place `.css` files in the themes directory:

| Platform | Path                                                                                |
| -------- | ----------------------------------------------------------------------------------- |
| Linux    | `~/.config/com.github.paw-hermansen.markdown-viewditor/themes/`                     |
| macOS    | `~/Library/Application Support/com.github.paw-hermansen.markdown-viewditor/themes/` |
| Windows  | `%APPDATA%\com.github.paw-hermansen.markdown-viewditor\themes\`                     |

Theme files are detected on startup and appear in the theme drop-down. A restart is required after adding or removing files.

The theme type (dark or light) is auto-detected from the CSS content and also controls the app chrome (toolbar, editor background, etc.).

## Example Themes

Two example themes are included in the repository:

- [theme-bubblegum.css](https://github.com/paw-hermansen/Markdown-Viewditor/blob/main/testing/custom_themes/theme-bubblegum.css) — a light theme with pink accents
- [theme-kaleidoscope.css](https://github.com/paw-hermansen/Markdown-Viewditor/blob/main/testing/custom_themes/theme-kaleidoscope.css) — a dark theme exercising all token classes

## What Can Be Customized

Both code highlighting and viewer elements are rendered inside `#viewer-content`. Prefix your selectors with `#viewer-content` so they override the app's default styles:

- **Code highlighting** — `.hljs` classes on token spans (see reference below).
- **Viewer elements** — headings, paragraphs, links, tables, blockquotes, etc. (e.g. `#viewer-content h1`, `#viewer-content a`, `#viewer-content blockquote`).

For code blocks, set the background on `#viewer-content pre` and clear it on `#viewer-content pre code` so the background covers the whole block, not each line.

## Highlight.js Token Reference

The following `.hljs-*` classes are emitted by the app's registered languages (JavaScript, TypeScript, Python, CSS, XML, HTML, JSON, Bash, Markdown, SQL):

| Class                            | Produced by                                           |
| -------------------------------- | ----------------------------------------------------- |
| `.hljs`                          | Base class on every code block                        |
| `.hljs-keyword`                  | JS/TS, Python, CSS, XML, Bash, SQL                    |
| `.hljs-string`                   | JS/TS, Python, CSS, XML, Bash, Markdown, SQL          |
| `.hljs-number`                   | JS/TS, Python, CSS, Bash, SQL                         |
| `.hljs-comment`                  | JS/TS, Python, SQL, Bash                              |
| `.hljs-doctag`                   | JS/TS (JSDoc `@tags`)                                 |
| `.hljs-literal`                  | JSON (`true`/`false`/`null`), Markdown                |
| `.hljs-regexp`                   | JS/TS                                                 |
| `.hljs-built_in`                 | JS/TS, Python, CSS, SQL                               |
| `.hljs-type`                     | JS/TS (JSDoc), Python, SQL                            |
| `.hljs-meta`                     | JS/TS, Python, XML, CSS                               |
| `.hljs-title`                    | JS/TS, Python, Bash                                   |
| `.hljs-title.class_`             | JS/TS (class declarations)                            |
| `.hljs-title.function_`          | JS/TS, Python, Bash                                   |
| `.hljs-title.class_.inherited__` | JS/TS (extends)                                       |
| `.hljs-function`                 | JS/TS (arrow fns), Bash                               |
| `.hljs-attr`                     | JS/TS, CSS, JSON, XML                                 |
| `.hljs-attribute`                | CSS (properties, media features)                      |
| `.hljs-variable`                 | JS/TS, Python, Bash, SQL                              |
| `.hljs-variable.language`        | JS/TS (`this`), Python (`self`)                       |
| `.hljs-variable.constant`        | JS/TS (SCREAMING_CASE)                                |
| `.hljs-params`                   | JS/TS, Python                                         |
| `.hljs-property`                 | JS/TS                                                 |
| `.hljs-operator`                 | SQL                                                   |
| `.hljs-punctuation`              | JSON                                                  |
| `.hljs-subst`                    | JS/TS, Python, Bash (template/f-string interpolation) |
| `.hljs-tag`                      | XML                                                   |
| `.hljs-name`                     | XML                                                   |
| `.hljs-symbol`                   | XML (entities), Markdown                              |
| `.hljs-selector-tag`             | CSS                                                   |
| `.hljs-selector-id`              | CSS                                                   |
| `.hljs-selector-class`           | CSS                                                   |
| `.hljs-selector-attr`            | CSS                                                   |
| `.hljs-selector-pseudo`          | CSS                                                   |
| `.hljs-section`                  | Markdown (headings)                                   |
| `.hljs-bullet`                   | Markdown (list markers)                               |
| `.hljs-quote`                    | Markdown                                              |
| `.hljs-link`                     | Markdown                                              |
| `.hljs-strong`                   | Markdown                                              |
| `.hljs-emphasis`                 | Markdown                                              |
| `.hljs-code`                     | Markdown                                              |

Tiered scopes like `title.class` become `.hljs-title.class_` (first part gets `hljs-` prefix, subsequent parts get trailing underscores).

## Markdown Element Reference

Markdown syntax is converted to HTML elements inside the viewer:

| Markdown       | HTML Element                            |
| -------------- | --------------------------------------- |
| `# text`       | `h1` – `h6`                             |
| `paragraph`    | `p`                                     |
| `**bold**`     | `strong`                                |
| `*italic*`     | `em`                                    |
| `` `code` ``   | `code`                                  |
| ` ```code``` ` | `pre > code`                            |
| `> quote`      | `blockquote`                            |
| `- item`       | `ul > li`                               |
| `1. item`      | `ol > li`                               |
| `- [ ] task`   | `li.task-list-item`                     |
| `\| col \|`    | `table`, `th`, `td`                     |
| `[text](url)`  | `a`                                     |
| `![alt](src)`  | `img`                                   |
| `~~text~~`     | `del`                                   |
| `---`          | `hr`                                    |
| `[^1]`         | `sup.footnote-ref`, `section.footnotes` |

## Raw HTML Elements

The following HTML elements can be used directly in markdown (with raw HTML enabled) and styled with custom themes:

| HTML                                                | Element              |
| --------------------------------------------------- | -------------------- |
| `<details><summary>text</summary>content</details>` | `details`, `summary` |
| `<kbd>key</kbd>`                                    | `kbd`                |
| `<sub>text</sub>`                                   | `sub`                |
| `<sup>text</sup>`                                   | `sup`                |
| `<ins>text</ins>`                                   | `ins`                |
| `<mark>text</mark>`                                 | `mark`               |

## YAML Frontmatter Styling

When a markdown file has YAML frontmatter, it is rendered as a card above the content. Skill files (with `name` and `description`) get special treatment:

| Class                | Description                           |
| -------------------- | ------------------------------------- |
| `.frontmatter-card`  | Card container for all frontmatter    |
| `.frontmatter-title` | "Frontmatter" label (non-skill files) |
| `.skill-badge`       | "Skill" badge (skill files only)      |
| `.skill-name`        | Skill name (skill files only)         |
| `.skill-description` | Skill description (skill files only)  |
| `.skill-meta dt`     | Metadata key labels                   |
| `.skill-meta dd`     | Metadata values                       |

## Additional Styling Selectors

These CSS selectors can be used for more granular control over viewer elements:

| Selector                                 | Description                          |
| ---------------------------------------- | ------------------------------------ |
| `a:hover`                                | Link hover state                     |
| `li::marker`                             | List item markers (bullets, numbers) |
| `tr:nth-child(even) td`                  | Table zebra stripes                  |
| `.footnotes-sep`                         | Footnote separator line              |
| `.footnotes ol`                          | Footnote list                        |
| `.footnote-backref`                      | Footnote back reference link         |
| `.task-list-item input[type="checkbox"]` | Task list checkbox styling           |

## Example: Custom Dark Theme

Create `my-theme.css` in the themes directory:

```css
/* Code highlighting — prefix selectors with #viewer-content. */
#viewer-content .hljs {
  color: #abb2bf;
}
#viewer-content .hljs-keyword,
#viewer-content .hljs-doctag {
  color: #c678dd;
}
#viewer-content .hljs-string,
#viewer-content .hljs-regexp {
  color: #98c379;
}
#viewer-content .hljs-comment {
  color: #5c6370;
  font-style: italic;
}
#viewer-content .hljs-number,
#viewer-content .hljs-literal {
  color: #d19a66;
}
#viewer-content .hljs-title,
#viewer-content .hljs-title.function_ {
  color: #61afef;
}
#viewer-content .hljs-built_in,
#viewer-content .hljs-type {
  color: #e5c07b;
}
#viewer-content .hljs-attr,
#viewer-content .hljs-attribute {
  color: #d19a66;
}
#viewer-content .hljs-meta {
  color: #56b6c2;
}
#viewer-content .hljs-variable,
#viewer-content .hljs-params {
  color: #e06c75;
}
#viewer-content .hljs-tag,
#viewer-content .hljs-name {
  color: #e06c75;
}
#viewer-content .hljs-selector-tag,
#viewer-content .hljs-selector-class {
  color: #e06c75;
}
#viewer-content .hljs-section {
  color: #e06c75;
  font-weight: bold;
}
#viewer-content .hljs-bullet {
  color: #98c379;
}
#viewer-content .hljs-link {
  color: #61afef;
  text-decoration: underline;
}
#viewer-content .hljs-strong {
  font-weight: bold;
}

/* Viewer elements — prefix selectors with #viewer-content. */
#viewer-content {
  background: #282c34;
  color: #abb2bf;
}
#viewer-content h1 {
  color: #e5c07b;
  border-bottom-color: #3e4451;
}
#viewer-content h2,
#viewer-content h3 {
  color: #e5c07b;
}
#viewer-content a {
  color: #61afef;
}
#viewer-content a:hover {
  color: #98c379;
}
#viewer-content blockquote {
  border-left-color: #c678dd;
  color: #5c6370;
}
#viewer-content code {
  background: #2c313a;
}
#viewer-content pre {
  background: #282c34;
}
#viewer-content pre code {
  background: transparent;
}
#viewer-content th {
  background: #2c313a;
  color: #5c6370;
}
#viewer-content th,
#viewer-content td {
  border-color: #3e4451;
}
#viewer-content hr {
  border-top-color: #3e4451;
}
#viewer-content .frontmatter-card {
  background: #2c313a;
  border-color: #3e4451;
}
#viewer-content .footnotes {
  color: #5c6370;
  font-size: 0.85em;
}
#viewer-content .footnote-backref {
  color: #61afef;
}
```
