---
title: Markdown Viewditor — Rendering Test
author: Test Suite
tags: [test, rendering, comprehensive]
---

# Rendering Test — All Features

This file exercises every viewer rendering feature, link/image edge case,
HTML element, and frontmatter variant in one document.

---

## Headings

### Level 3 Heading

#### Level 4 Heading

##### Level 5 Heading

###### Level 6 Heading

## Custom Heading ID {#custom-test-id}

This heading has a custom ID. An anchor link to `#custom-test-id` should
scroll here.

## Text Formatting

This is a regular paragraph with **bold text**, _italic text_,
***bold-italic***, and ~~strikethrough~~ text. Also `inline code` and
==highlighted== text. Combinations like **wei*rd co~~mbi~~*~~na~~ti**ons
should work.

Here is a paragraph with a footnote reference[^1] and another[^2].
Footnotes appear at the bottom of the document.

[^1]: This is the first footnote.
[^2]: This is the second footnote with **formatting**.

## Lists

### Unordered List

- Item 1
- Item 2
- Item 3

### Ordered List

1. First
2. Second
3. Third

### Task List

- [ ] Unchecked task
- [x] Checked task
- [ ] Another unchecked

### Deeply Nested List (6 levels)

- Level 1a
  1. Level 2a
     - Level 3a
       1. Level 4a
          - Level 5a
            - [ ] Level 6a
            - [X] Level 6b
          - Level 5b
       2. Level 4b
     - Level 3b
  2. Level 2b
- Level 1b

## Blockquotes

> This is a blockquote with **formatted** text and `code`.
>
> > Nested blockquote.
> >
> > > Third level.
>
> Back to first level.

> A blockquote with a nested list:
> 1. row 1
>     - **nested** row
>         - *nested* row
> 1. row 2

## Tables

### Basic Table

| Feature | Status | Notes |
|---------|--------|-------|
| Editor | Done | CodeMirror 6 |
| Viewer | Done | markdown-it |
| Themes | Done | 9 built-in |

### Aligned Columns

| Left Aligned | Centered | Right Aligned |
| :--- | :---: | ---: |
| White | Popular | 24.8 |
| Black | Popular | 22.0 |
| Grey | Popular | 21.3 |

## Code Blocks

### JavaScript

```javascript
"use strict";

/** @param {string} name */
function greet(name) {
  return `Hello, ${name}!`;
}

const MAX_RETRIES = 3;
const regex = /[a-z]+/gi;
const PI = 3.14;

class Animal extends Creature {
  constructor(species) {
    this.species = species;
  }

  speak = () => {
    console.log(this.species);
  };
}

const items = [1, 2, 3];
const isReady = true;
const nothing = null;

// This is a comment
/* Block comment */
```

### Python

```python
import os

MAX_VALUE = 100

@dataclass
class Animal:
    species: str
    legs: int = 4

    def speak(self):
        return f"{self.species} says hello"

def process(data: list[str]) -> dict:
    """Process the data."""
    result = len(data)
    print(f"Processed {result} items")
    return {"count": result}
```

### CSS

```css
@keyframes slideIn {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}

:root {
  --primary-color: #ff6600;
}

.container > .header {
  background: var(--primary-color);
  font-family: "Helvetica Neue", sans-serif;
  padding: 16px;
}

#main-nav {
  display: flex;
}

a:hover,
input[type="text"] {
  border-color: #00ffff;
  outline: none !important;
}

div::before {
  content: "Hello";
}
```

### HTML / XML

```xml
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Example</title>
  </head>
  <body>
    <p>Hello &amp; welcome!</p>
    <!-- This is a comment -->
  </body>
</html>
```

### JSON

```json
{
  "name": "Markdown Viewditor",
  "version": 1,
  "active": true,
  "tags": ["test", "demo"],
  "config": null
}
```

### Bash

```bash
#!/bin/bash

GREETING="Hello World"

greet() {
    local name=$1
    echo "Hello, ${name}!"
}

for i in $(seq 1 10); do
    if [ $i -gt 5 ]; then
        echo "Big number: $i"
    fi
done

echo "Done: $GREETING"
```

### SQL

```sql
CREATE TABLE users (
    id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    score DECIMAL(10,2) DEFAULT 0
);

INSERT INTO users (name, email, score)
VALUES ('Alice', 'alice@example.com', 95.5);

SELECT u.name, COUNT(*) AS total
FROM users u
WHERE u.score > 80 AND u.active = 1
GROUP BY u.name
HAVING total > 1
ORDER BY u.name ASC;
```

### Very Long Code Block (for scroll testing)

```javascript
// This is a long code block to test rendering and scroll-sync with 100+ lines.
function line01() { return 1; }
function line02() { return 2; }
function line03() { return 3; }
function line04() { return 4; }
function line05() { return 5; }
function line06() { return 6; }
function line07() { return 7; }
function line08() { return 8; }
function line09() { return 9; }
function line10() { return 10; }
function line11() { return 11; }
function line12() { return 12; }
function line13() { return 13; }
function line14() { return 14; }
function line15() { return 15; }
function line16() { return 16; }
function line17() { return 17; }
function line18() { return 18; }
function line19() { return 19; }
function line20() { return 20; }
function line21() { return 21; }
function line22() { return 22; }
function line23() { return 23; }
function line24() { return 24; }
function line25() { return 25; }
function line26() { return 26; }
function line27() { return 27; }
function line28() { return 28; }
function line29() { return 29; }
function line30() { return 30; }
function line31() { return 31; }
function line32() { return 32; }
function line33() { return 33; }
function line34() { return 34; }
function line35() { return 35; }
function line36() { return 36; }
function line37() { return 37; }
function line38() { return 38; }
function line39() { return 39; }
function line40() { return 40; }
function line41() { return 41; }
function line42() { return 42; }
function line43() { return 43; }
function line44() { return 44; }
function line45() { return 45; }
function line46() { return 46; }
function line47() { return 47; }
function line48() { return 48; }
function line49() { return 49; }
function line50() { return 50; }
function line51() { return 51; }
function line52() { return 52; }
function line53() { return 53; }
function line54() { return 54; }
function line55() { return 55; }
function line56() { return 56; }
function line57() { return 57; }
function line58() { return 58; }
function line59() { return 59; }
function line60() { return 60; }
function line61() { return 61; }
function line62() { return 62; }
function line63() { return 63; }
function line64() { return 64; }
function line65() { return 65; }
function line66() { return 66; }
function line67() { return 67; }
function line68() { return 68; }
function line69() { return 69; }
function line70() { return 70; }
function line71() { return 71; }
function line72() { return 72; }
function line73() { return 73; }
function line74() { return 74; }
function line75() { return 75; }
function line76() { return 76; }
function line77() { return 77; }
function line78() { return 78; }
function line79() { return 79; }
function line80() { return 80; }
function line81() { return 81; }
function line82() { return 82; }
function line83() { return 83; }
function line84() { return 84; }
function line85() { return 85; }
function line86() { return 86; }
function line87() { return 87; }
function line88() { return 88; }
function line89() { return 89; }
function line90() { return 90; }
function line91() { return 91; }
function line92() { return 92; }
function line93() { return 93; }
function line94() { return 94; }
function line95() { return 95; }
function line96() { return 96; }
function line97() { return 97; }
function line98() { return 98; }
function line99() { return 99; }
function line100() { return 100; }
function line101() { return 101; }
function line102() { return 102; }
function line103() { return 103; }
function line104() { return 104; }
function line105() { return 105; }
// End of long code block.
```

## Links

- [External link](https://example.com) — opens in browser
- Autolink: https://example.com
- [Anchor to custom heading](#custom-test-id) — scrolls to custom heading
- [Anchor to "Tables"](#tables) — scrolls to Tables section
- [Local file](README.md) — opens with OS default handler

## Images

### Local Relative Path

![Local image](./ai_flower.png)

### HTML img Tag

<img src="./ai_flower.png" alt="HTML img tag" width="200">

### Filename with Space (quoted)

![Filename with space](<./ai flower.png>)

### Filename with Space (percent-encoded)

![Percent-encoded space](./ai%20flower.png)

### Unicode Filename in Subdirectory

![Unicode name](./image/人工智能生成的花朵.png)

### Remote Image

![External image](https://picsum.photos/128)

### Data URI (small inline PNG)

![Embedded image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==)

### Missing Image (should show broken, no crash)

![Missing image](./nonexistent.png)

### SVG from File

![SVG from file](./weird.svg)

### Inline SVG

Here is an inline SVG: <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="red"/></svg> inside text.

## Horizontal Rule

---

## Raw HTML Elements

<details>
<summary>Click to expand</summary>
Hidden content inside details/summary.
</details>

Press <kbd>Ctrl</kbd> + <kbd>S</kbd> to save.

H<sub>2</sub>O and E=mc<sup>2</sup>.

<mark>Highlighted text</mark>

<ins>Inserted text</ins> and <del>deleted text</del>.

Colored text: <span style="color: red">red</span> and
<span style="color: green">green</span>.

Special characters: Æ Ø Å – — ♪ ♫ → ½

## YAML Frontmatter — Standard Card

(At the top of this file: `title`, `author`, `tags` — rendered as a
"Frontmatter" card with key-value grid.)

## YAML Frontmatter — Skill Card

The file `SKILL.md` in this directory has `name`, `description`, `license`
frontmatter — rendered as a "Skill" card with badge and metadata.