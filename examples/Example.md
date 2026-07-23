# Kaleidoscope Test Theme Example

This file exercises **all** `.hljs-*` token classes emitted by the app's registered languages and all viewer HTML elements. Use it with the **Test Kaleidoscope** theme to verify styling.

## Text Formatting

This is a regular paragraph with **bold text**, _italic text_, and `inline code`. You can also use _**bold italic**_ together. Here is a [link to highlight.js](https://highlightjs.org) and here is ~~strikethrough~~ text.

Here is a paragraph with a footnote reference[^1] and another[^2]. Footnotes appear at the bottom of the document.

## Lists

Unordered list:

- 200 g durum flour
- 200 g wheat flour
- 4 eggs

Ordered list:

1. Build a volcano out of the flour and drop the eggs into the crater
2. Gradually fold the eggs into the flour, continuing until the dough is done
3. Knead the dough until it becomes smooth and slightly elastic
4. Cut it into whatever shape you like best

Task list

###### TODO After Retirement:

- [x] Write a Markdown Viewer and Editor
- [ ] Become Rich ~~and Famous~~
- [ ] Listen to Wagner's _The Ring of the Nibelung_ in its entirety

## Links

Links open in whatever app is default on your operating system
for that kind of links:

- [Google Search](https://google.com) probably opens a browser
- [My local README markdown file](README.md) probably opens in _Markdown Viewditor_

## Blockquote

> This is a blockquote. It can contain **formatted** text and `code`.
>
> It can also span multiple paragraphs.

## Tables with aligned columns

Ref.: https://en.wikipedia.org/wiki/Car_colour_popularity

| Left Aligned |  Centered   | Right Aligned |
| :----------- | :---------: | ------------: |
| White        |   Popular   |          24.8 |
| Black        |   Popular   |          22.0 |
| Grey         |   Popular   |          21.3 |
| Silver       | Kind of not |           9.1 |
| Blue         | Kind of not |           8.9 |
| Red          | Kind of not |           7.3 |
| Green        |     Not     |           2.0 |
| Others       |     Not     |           1.8 |

## Highlight Classes

|Token Class |  Language   | Example |
| --- | --- | --- |
| `.hljs-keyword` | All | `const`, `SELECT`, `def` |
| `.hljs-string` | All | `"hello"`, `'world'` |
| `.hljs-number` | JS, Python, CSS, Bash, SQL | `42`, `3.14` |
| `.hljs-comment` | JS, Python, SQL, Bash | `// comment`, `# comment` |
| `.hljs-doctag` | JS/TS (JSDoc) | `@param`, `@returns` |
| `.hljs-literal` | JSON, Markdown | `true`, `false`, `null` |
| `.hljs-regexp` | JS/TS | `/pattern/g` |
| `.hljs-built_in` | JS, Python, CSS, SQL | `console`, `print()`, `url()` |
| `.hljs-type` | JS/TS, Python, SQL | `string`, `VARCHAR`, `int` |
| `.hljs-meta` | JS, Python, XML, CSS | `'use strict'`, `@decorator`, `&lt;!DOCTYPE&gt;` |
| `.hljs-title` | JS, Python, Bash | Function and class names |
| `.hljs-title.function_` | JS, Python, Bash | Declared function names |
| `.hljs-title.class_` | JS/TS, Python | Declared class names |
| `.hljs-variable` | JS, Python, Bash, SQL | `$HOME`, `self`, `@var` |
| `.hljs-variable.language` | JS, Python | `this`, `self` |
| `.hljs-variable.constant` | JS/TS | `MAX_SIZE`, `API_URL` |
| `.hljs-subst` | JS, Python, Bash | `${...}`, `$(...)`, f-string `{...}` |
| `.hljs-tag` | XML/HTML | `&lt;div&gt;`, `&lt;/div&gt;` |
| `.hljs-name` | XML/HTML | Tag names inside `&lt;&gt;` |
| `.hljs-selector-*` | CSS | `#id`, `.class`, `:hover`, `[attr]` |
| `.hljs-section` | Markdown | `# heading` inside code blocks |
| `.hljs-bullet` | Markdown | `- item` inside code blocks |

## Horizontal Rule

---

## Code Blocks

### JavaScript

```javascript
"use strict"; // meta

/** @param {string} name - doctag */
function greet(name) {
  // title.function_, params
  return `Hello, ${name}!`; // subst
}

const MAX_RETRIES = 3; // variable.constant
const regex = /[a-z]+/gi; // regexp
const PI = 3.14; // number

class Animal extends Creature {
  // title.class_, title.class_.inherited__
  constructor(species) {
    this.species = species; // variable.language
  }

  speak = () => {
    // function (arrow)
    console.log(this.species); // built_in, property
  };
}

const items = [1, 2, 3]; // literal (in context), number
const isReady = true; // literal
const nothing = null; // literal

// This is a comment
/* Block comment */
```

### TypeScript

```typescript
// This is a comment
interface User {
  id: number;
  name: string;
  email: string;
}

const fetchUser = async (id: number): Promise<User> => {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
};

const API_URL = "https://example.com"; // variable.constant
const DEBUG = false; // literal
```

### Python

```python
# This is a comment
import os

MAX_VALUE = 100  # variable.constant

@dataclass  # meta (decorator)
class Animal:  # title.class_
    species: str  # type
    legs: int = 4  # type, number

    def speak(self):  # title.function_, variable.language (self)
        return f"{self.species} says hello"  # subst (f-string)

def process(data: list[str]) -> dict:  # title.function_, type, params
    """Process the data."""  # string
    result = len(data)  # built_in
    print(f"Processed {result} items")  # built_in, subst
    return {"count": result}  # literal
```

### CSS

```css
/* Comment */
@keyframes slideIn {
  /* keyword */
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}

:root {
  /* selector-pseudo */
  --primary-color: #ff6600; /* attr (custom property) */
}

.container > .header {
  /* selector-class */
  background: var(--primary-color);
  font-family: "Helvetica Neue", sans-serif; /* string */
  padding: 16px; /* number */
}

#main-nav {
  /* selector-id */
  display: flex;
}

a:hover, /* selector-pseudo */
input[type="text"] {
  /* selector-attr */
  border-color: #00ffff;
  outline: none !important; /* meta */
}

div::before {
  /* selector-tag, selector-pseudo */
  content: "Hello";
}
```

### XML / HTML

```xml
<!DOCTYPE html>  <!-- meta -->
<html lang="en">
  <head>
    <meta charset="UTF-8" />  <!-- tag, name, attr, string -->
    <title>Example</title>
  </head>
  <body>
    <p>Hello &amp; welcome!</p>  <!-- symbol (&amp;) -->
    <!-- This is a comment -->
  </body>
</html>
```

### JSON

```json
{
  "name": "Kaleidoscope", // attr, string
  "version": 1, // attr, number
  "active": true, // attr, literal
  "tags": ["test", "demo"], // attr, string
  "config": null // attr, literal
}
```

### Bash

```bash
#!/bin/bash  # meta (shebang)

# This is a comment
GREETING="Hello World"  # variable, string

greet() {  # title (function name), function
    local name=$1  # keyword, variable, params
    echo "Hello, ${name}!"  # subst
}

for i in $(seq 1 10); do  # keyword, subst
    if [ $i -gt 5 ]; then  # keyword, number, variable
        echo "Big number: $i"
    fi
done

echo "Done: $GREETING"
```

### SQL

```sql
-- This is a comment
CREATE TABLE users (
    id INT PRIMARY KEY,           -- type, keyword
    name VARCHAR(255) NOT NULL,   -- type, string
    email VARCHAR(255) UNIQUE,    -- type, string
    score DECIMAL(10,2) DEFAULT 0 -- type, number
);

INSERT INTO users (name, email, score)
VALUES ('Alice', 'alice@example.com', 95.5);

SELECT u.name, COUNT(*) AS total  -- built_in, keyword
FROM users u
WHERE u.score > 80 AND u.active = 1  -- operator, number
GROUP BY u.name
HAVING total > 1
ORDER BY u.name ASC;

-- Using a variable
SET @min_score = 50;  -- variable, number
SELECT * FROM users WHERE score >= @min_score;
```

### Markdown (inside a code block)

```markdown
# Heading 1 (section)

## Heading 2 (section)

**bold text** (strong)
_italic text_ (emphasis)
`inline code` (code)

- list item (bullet)
- another item (bullet)

> blockquote (quote)
> more quote (quote)

[link text](url) (link)
```

## Images

![Placeholder image](../images/ai_flower.png)

## Additional Viewer Elements

Here are some more HTML elements for testing:

- Sized image:<br/>
  <img src="../images/ai_flower.png" width="80px" alt="A Sized Image">
- <kbd>Ctrl</kbd> + <kbd>C</kbd> to copy
- H<sub>2</sub>O is water
- E = mc<sup>2</sup>
- <mark>highlighted text</mark>
- Special characters: &AElig;&Oslash;&Aring; &ndash; &mdash;
  &#9834;&#9835; &rarr; &frac12;
- Emojis (copy-paste): 😮 ✅ ❤️ ⚽ 🇩🇰
- <del>deleted text</del> and <ins>inserted text</ins>
- Text in <span style="color: red">different</span>
  <span style="color: green">colors</span> and
  <span style="font-size: 144%; font-family: fantasy, serif;">sizes</span>
- Simple animated SVG:<br/>
  <svg width="150" height="60" viewBox="0 30 100 40">
    <ellipse id="outer" cx="50" cy="50" rx="35" ry="20" fill="#4fd1ff"/>
    <ellipse id="inner" cx="50" cy="50" rx="12" ry="6" fill="#050816"/>
    <animate xlink:href="#inner" attributeName="rx" values="12;0;12" dur="2s" repeatCount="indefinite"/>
    <animate xlink:href="#inner" attributeName="ry" values="0;12;0" dur="3s" repeatCount="indefinite"/>
    <animate xlink:href="#outer" attributeName="ry" values="18;0;18" dur="5s" repeatCount="indefinite"/>
  </svg>

<details>
  <summary>Click to expand</summary>
  <p>This content is inside a details/summary element.</p>
</details>

[^1]: This is the first footnote.

[^2]: This is the second footnote with **formatting**.
