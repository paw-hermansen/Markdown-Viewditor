---
title: Test Document
author: Tester
tags: [test, markdown]
---

# Heading 1

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

This is a paragraph with **bold**, *italic*, ***bold-italic***, and ~~strikethrough~~ text.

This is a second paragraph with `inline code` and a [link](https://example.com).

- item1
- item2

1. item1
2. item 2




This is code and some text

An autolink: https://example.com

[Jump to table](#table)

[Jump to ÆØÅ-header with spaces](#header-with)

## Lists

### Unordered
- Item 1
- Item 2
  - Nested 2.1
    - Nested 2.1.1

### Ordered
1. First
2. Second
3. Third

### Task List
- [ ] Unchecked task
- [x] Checked task
- [ ] Another unchecked

## Code Blocks

```javascript
function hello(name) {
  console.log(`Hello, ${name}!`);
  return true;
}
```

```python
def greet(name: str) -> str:
    return f"Hello, {name}!"
```

```css
body {
  background: #1a1a2e;
  color: #e0e0e0;
  font-family: sans-serif;
}
```

## Blockquotes

> This is a blockquote.
>
> > Nested blockquote.
>
> Back to first level.

## Table

| Feature | Status | Notes |
|---------|--------|-------|
| Editor | Done | CodeMirror 6 |
| Viewer | Done | markdown-it |
| Themes | Done | 8 built-in |

## Header with ÆØÅ

## Media

![Local image](./ai_flower.png)

<img src="./ai_flower.png" alt="HTML img tag" width="200">

## Footnotes

This has a footnote[^1] and another[^2].

[^1]: First footnote definition.
[^2]: Second footnote definition.

## Raw HTML

<details>
<summary>Click to expand</summary>
Hidden content here.
</details>

Press <kbd>Ctrl</kbd> + <kbd>S</kbd> to save.

H<sub>2</sub>O and E=mc<sup>2</sup>

<mark>Highlighted text</mark>

<ins>Inserted text</ins>

## Horizontal Rule

---
