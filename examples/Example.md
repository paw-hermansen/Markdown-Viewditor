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

## Table with Alternating Row Styling

The following table uses inline styles to color every other row:

<table>
  <thead>
    <tr>
      <th>Token Class</th>
      <th>Language</th>
      <th>Example</th>
    </tr>
  </thead>
  <tbody>
    <tr style="background: rgba(255,0,0,0.1);">
      <td><code>.hljs-keyword</code></td>
      <td>All</td>
      <td><code>const</code>, <code>SELECT</code>, <code>def</code></td>
    </tr>
    <tr>
      <td><code>.hljs-string</code></td>
      <td>All</td>
      <td><code>"hello"</code>, <code>'world'</code></td>
    </tr>
    <tr style="background: rgba(255,0,0,0.1);">
      <td><code>.hljs-number</code></td>
      <td>JS, Python, CSS, Bash, SQL</td>
      <td><code>42</code>, <code>3.14</code></td>
    </tr>
    <tr>
      <td><code>.hljs-comment</code></td>
      <td>JS, Python, SQL, Bash</td>
      <td><code>// comment</code>, <code># comment</code></td>
    </tr>
    <tr style="background: rgba(255,0,0,0.1);">
      <td><code>.hljs-doctag</code></td>
      <td>JS/TS (JSDoc)</td>
      <td><code>@param</code>, <code>@returns</code></td>
    </tr>
    <tr>
      <td><code>.hljs-literal</code></td>
      <td>JSON, Markdown</td>
      <td><code>true</code>, <code>false</code>, <code>null</code></td>
    </tr>
    <tr style="background: rgba(255,0,0,0.1);">
      <td><code>.hljs-regexp</code></td>
      <td>JS/TS</td>
      <td><code>/pattern/g</code></td>
    </tr>
    <tr>
      <td><code>.hljs-built_in</code></td>
      <td>JS, Python, CSS, SQL</td>
      <td><code>console</code>, <code>print()</code>, <code>url()</code></td>
    </tr>
    <tr style="background: rgba(255,0,0,0.1);">
      <td><code>.hljs-type</code></td>
      <td>JS/TS, Python, SQL</td>
      <td><code>string</code>, <code>VARCHAR</code>, <code>int</code></td>
    </tr>
    <tr>
      <td><code>.hljs-meta</code></td>
      <td>JS, Python, XML, CSS</td>
      <td><code>'use strict'</code>, <code>@decorator</code>, <code>&lt;!DOCTYPE&gt;</code></td>
    </tr>
    <tr style="background: rgba(255,0,0,0.1);">
      <td><code>.hljs-title</code></td>
      <td>JS, Python, Bash</td>
      <td>Function and class names</td>
    </tr>
    <tr>
      <td><code>.hljs-title.function_</code></td>
      <td>JS, Python, Bash</td>
      <td>Declared function names</td>
    </tr>
    <tr style="background: rgba(255,0,0,0.1);">
      <td><code>.hljs-title.class_</code></td>
      <td>JS/TS, Python</td>
      <td>Declared class names</td>
    </tr>
    <tr>
      <td><code>.hljs-variable</code></td>
      <td>JS, Python, Bash, SQL</td>
      <td><code>$HOME</code>, <code>self</code>, <code>@var</code></td>
    </tr>
    <tr style="background: rgba(255,0,0,0.1);">
      <td><code>.hljs-variable.language</code></td>
      <td>JS, Python</td>
      <td><code>this</code>, <code>self</code></td>
    </tr>
    <tr>
      <td><code>.hljs-variable.constant</code></td>
      <td>JS/TS</td>
      <td><code>MAX_SIZE</code>, <code>API_URL</code></td>
    </tr>
    <tr style="background: rgba(255,0,0,0.1);">
      <td><code>.hljs-subst</code></td>
      <td>JS, Python, Bash</td>
      <td><code>${...}</code>, <code>$(...)</code>, f-string <code>{...}</code></td>
    </tr>
    <tr>
      <td><code>.hljs-tag</code></td>
      <td>XML/HTML</td>
      <td><code>&lt;div&gt;</code>, <code>&lt;/div&gt;</code></td>
    </tr>
    <tr style="background: rgba(255,0,0,0.1);">
      <td><code>.hljs-name</code></td>
      <td>XML/HTML</td>
      <td>Tag names inside <code>&lt;&gt;</code></td>
    </tr>
    <tr>
      <td><code>.hljs-selector-*</code></td>
      <td>CSS</td>
      <td><code>#id</code>, <code>.class</code>, <code>:hover</code>, <code>[attr]</code></td>
    </tr>
    <tr style="background: rgba(255,0,0,0.1);">
      <td><code>.hljs-section</code></td>
      <td>Markdown</td>
      <td><code># heading</code> inside code blocks</td>
    </tr>
    <tr>
      <td><code>.hljs-bullet</code></td>
      <td>Markdown</td>
      <td><code>- item</code> inside code blocks</td>
    </tr>
  </tbody>
</table>

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
  <img src="../images/screendump.png" width="100px" alt="A Sized Image">
- <kbd>Ctrl</kbd> + <kbd>C</kbd> to copy
- H<sub>2</sub>O is water
- E = mc<sup>2</sup>
- <mark>highlighted text</mark>
- Special characters: &AElig;&Oslash;&Aring; &ndash; &mdash;
  &#9834;&#9835; &rarr; &frac12;
- Emojis: 😮 ✅ ❤️ ⚽ 🇩🇰
- <del>deleted text</del> and <ins>inserted text</ins>
- Text in <span style="color: red">different</span>
  <span style="color: green">colors</span> and
  <span style="font-size: 144%; font-family: fantasy, serif;">sizes</span>
- Simple animated SVG:<br/>
  <svg width="150" height="60" viewBox="0 30 100 40">
    <ellipse id="outer" cx="50" cy="50" rx="35" ry="20" fill="#4fd1ff"/>
    <ellipse id="inner" cx="50" cy="50" rx="12" ry="6" fill="#050816"/>
    <animate xlink:href="#inner" attributeName="rx" values="12;6;12" dur="2s" repeatCount="indefinite"/>
    <animate xlink:href="#inner" attributeName="ry" values="6;12;6" dur="2s" repeatCount="indefinite"/>
    <animate xlink:href="#outer" attributeName="ry" values="20;10;20" dur="2s" repeatCount="indefinite"/>
  </svg>

<details>
  <summary>Click to expand</summary>
  <p>This content is inside a details/summary element.</p>
</details>

[^1]: This is the first footnote.

[^2]: This is the second footnote with **formatting**.
