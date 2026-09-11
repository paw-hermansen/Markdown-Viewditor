# Markdown Examples

A quick-reference for every markdown feature supported by Markdown Viewditor.

## Text Formatting

**Bold text** with `**text**` or `__text__`.
_Italic text_ with `_text_` or `*text*`.
**_Bold italic_** with `_**text**_`.
~~Strikethrough~~ with `~~text~~`.
==Highlighted text== with `==text==`.
`Inline code` with backticks.

## Headings

```
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
```

## Paragraphs and Line Breaks

Separate paragraphs with a blank line. Use two trailing spaces or `<br/>` for a line break within a paragraph.

## Lists

### Unordered

```
- Item one
- Item two
  - Nested item
```

### Ordered

```
1. First
2. Second
3. Third
```

### Task Lists

```
- [x] Done
- [ ] Not done
```

### Nesting

Lists can be nested to arbitrary depth — mix ordered, unordered, and task lists:

```
- Level 1
  1. Level 2
     - Level 3
       - [ ] Task item
```

## Links and Images

```
[Link text](https://example.com)
[Internal anchor](#heading-text)
![Alt text](image.png)
```

Bare URLs are auto-linked: `https://example.com`

Local file links open in the default app. Internal anchor links (e.g. `[see above](#lists)`) scroll to the heading.

## Blockquotes

```
> Quoted text.
>
> > Nested quote.
```

## Tables

Column alignment with `:---` (left), `:---:` (center), `---:` (right):

```
| Left | Center | Right |
| :--- | :---: | ---: |
| a | b | c |
```

## Code Blocks

Fenced code blocks with language identifier for syntax highlighting:

````
```javascript
const x = 42;
```
````

Supported languages: JavaScript, TypeScript, Python, CSS, XML/HTML, JSON, Bash, Markdown, SQL.

## Horizontal Rules

Three or more dashes, asterisks, or underscores on a line by themselves:

```
---
```

## Footnotes

```
Text with a footnote[^1].

[^1]: Footnote content here.
```

## YAML Frontmatter

Content between `---` delimiters at the top of a file is parsed as YAML frontmatter and rendered as a styled card:

```yaml
---
title: My Document
author: Jane Doe
---
```

Skill files with `name` and `description` fields get special badge styling.

## Custom Heading IDs

```
## My Heading {#custom-id}
```

Link to it with `[click here](#custom-id)`.

## Raw HTML

The following HTML elements work inline when raw HTML is enabled (default at GitHub compatibility level and above):

| HTML                                                 | Renders as                  |
| ---------------------------------------------------- | --------------------------- |
| `<kbd>Ctrl</kbd>`                                    | Keyboard shortcut           |
| `<sub>text</sub>`                                    | Subscript                   |
| `<sup>text</sup>`                                    | Superscript                 |
| `<mark>text</mark>`                                  | Highlighted text            |
| `<del>text</del>`                                    | Deleted/struck-through text |
| `<ins>text</ins>`                                    | Inserted/underlined text    |
| `<details><summary>title</summary>content</details>` | Collapsible section         |

Inline HTML with styling: `<span style="color: red">red text</span>`

Inline SVG is supported — both simple shapes and animated elements.

## Math and Chemistry

See [Math.md](Math.md) and [Chemistry.md](Chemistry.md) for formula syntax.

## Compatibility Levels

Not all features work everywhere. The status bar lets you pick a compatibility level — the editor warns about features that exceed it:

| Level        | Features                                                          |
| ------------ | ----------------------------------------------------------------- |
| **Basic**    | CommonMark core only                                              |
| **GitHub**   | Tables, strikethrough, task lists, autolinks, footnotes, raw HTML |
| **Advanced** | All GitHub + YAML frontmatter                                     |
| **Custom**   | Toggle individual features                                        |

Rendering is never restricted — this is a portability indicator, not a hard limit.
