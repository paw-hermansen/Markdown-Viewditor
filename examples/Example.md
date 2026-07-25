# Kaleidoscope Test Theme Example

This file exercises **all** `.hljs-*` token classes emitted by the app's registered languages and all viewer HTML elements. Use it with the [theme-kaleidoscope.css](theme-kaleidoscope.css) custom theme to verify styling.

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

- [x] Write a Markdown Viewer and Editor and give it a stupid name
- [ ] Become Rich ~~and Famous~~
- [ ] Listen to Wagner's _The Ring of the Nibelung_ in its entirety

Nested Lists

- Level 1a
  1. Level 2a
     - Level 3a
       1. Level 4a
          - Level 5a
            - [ ] Level 6a
            - [ ] Level 6b
          - Level 5b
       2. Level 4b
     - Level 3b
  2. Level 2b
- Level 1b


## Links

Links open in whatever app is default on your operating system
for that kind of links:

- [Google Search](https://google.com) probably opens a browser
- [My local README markdown file](README.md) probably opens in _Markdown Viewditor_

## Blockquote

> This is a blockquote. It can contain **formatted** text and `code`.
>
> It can also span multiple paragraphs.
>
> > And can be nested
> > > In multiple levels
>
> And can have text after nested levels

## Tables with aligned columns

Ref.: https://en.wikipedia.org/wiki/Car_colour_popularity

| Left Aligned | Centered | Right Aligned |
| :--- | :---: | ---: |
| White | Popular | 24.8 |
| Black | Popular | 22.0 |
| Grey | Popular | 21.3 |
| Silver | Kind of not | 9.1 |
| Blue | Kind of not | 8.9 |
| Red | Kind of not | 7.3 |
| Green | Not | 2.0 |
| Others | Not | 1.8 |

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

![Image](./ai_flower.png)
![Filename with space](./ai flower.png)
![Image in subdir, unicode name](./image/人工智能生成的花朵.png)
![Using Backslash](image\人工智能生成的花朵.png)
![Embedded image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAAwnpUWHRSYXcgcHJvZmlsZSB0eXBlIGV4aWYAAHjabVBbEsMgCPz3FD2CPEQ8jmnTmd6gxy8KycS2m2FBwA2S9vfrmW4DCJy4VJUmkg3cuGG3QLOjT4bMkyeOkp2XfDoLaCkyT3FBov/IwyngrltUrkL3KGxroXHo65cQuqMx0YgfIdRCiNALEALdn5Wlab0+YdvzCnVLg1jXsX/O1bb3KPYfQtwJKBsTiQ9AwyRRt6AaA8lotK+bqXGZreAL+benA+kD7XxZJ4dOlOsAAAGFaUNDUElDQyBwcm9maWxlAAB4nH2Rv0vDQBzFX1OlIhUFKxRxyFCdLIKKONYqFKFCqBVadTC59Bc0aUhSXBwF14KDPxarDi7Oujq4CoLgDxD/AHFSdJESv5cUWsR6cNyHd/ced+8AoV5mmtUVAzTdNlOJuJjJroqBVwQwgCGEMSEzy5iTpCQ6jq97+Ph6F+VZnc/9OfrUnMUAn0gcY4ZpE28Qz2zaBud94hAryirxOfG4SRckfuS64vEb54LLAs8MmenUPHGIWCy0sdLGrGhqxNPEEVXTKV/IeKxy3uKslauseU/+wmBOX1nmOs0RJLCIJUgQoaCKEsqwEaVVJ8VCivbjHfzDrl8il0KuEhg5FlCBBtn1g//B726t/NSklxSMA90vjvMxCgR2gUbNcb6PHadxAvifgSu95a/UgdlP0mstLXIE9G8DF9ctTdkDLneA8JMhm7Ir+WkK+TzwfkbflAUGb4HeNa+35j5OH4A0dZW8AQ4OgbECZa93eHdPe2//nmn29wPB/HLGLL/HEAAADXhpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+Cjx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IlhNUCBDb3JlIDQuNC4wLUV4aXYyIj4KIDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+CiAgPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKICAgIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIgogICAgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIKICAgIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIKICAgIHhtbG5zOkdJTVA9Imh0dHA6Ly93d3cuZ2ltcC5vcmcveG1wLyIKICAgIHhtbG5zOnRpZmY9Imh0dHA6Ly9ucy5hZG9iZS5jb20vdGlmZi8xLjAvIgogICAgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIgogICB4bXBNTTpEb2N1bWVudElEPSJnaW1wOmRvY2lkOmdpbXA6MWE1ODkxMzItMDgzMi00OTk4LWEyN2UtODE5ZTU2NTM5N2ZhIgogICB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOmI3NDIxOWZiLWY4NDMtNDgwMy1hY2NhLTllNTBlYjY4MzhiYiIKICAgeG1wTU06T3JpZ2luYWxEb2N1bWVudElEPSJ4bXAuZGlkOmZhMTg4YjZlLWZkNzctNGM5My05YTY5LTYyNmJhYTU3NjM2OCIKICAgZGM6Rm9ybWF0PSJpbWFnZS9wbmciCiAgIEdJTVA6QVBJPSIyLjAiCiAgIEdJTVA6UGxhdGZvcm09IkxpbnV4IgogICBHSU1QOlRpbWVTdGFtcD0iMTc4NDIzNzMzNjkxNzg5NSIKICAgR0lNUDpWZXJzaW9uPSIyLjEwLjM2IgogICB0aWZmOk9yaWVudGF0aW9uPSIxIgogICB4bXA6Q3JlYXRvclRvb2w9IkdJTVAgMi4xMCIKICAgeG1wOk1ldGFkYXRhRGF0ZT0iMjAyNjowNzoxNlQyMjoyODo1NiswMTowMCIKICAgeG1wOk1vZGlmeURhdGU9IjIwMjY6MDc6MTZUMjI6Mjg6NTYrMDE6MDAiPgogICA8eG1wTU06SGlzdG9yeT4KICAgIDxyZGY6U2VxPgogICAgIDxyZGY6bGkKICAgICAgc3RFdnQ6YWN0aW9uPSJzYXZlZCIKICAgICAgc3RFdnQ6Y2hhbmdlZD0iLyIKICAgICAgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDpiM2JjODIwNi1lMjQ4LTRiMjUtYmY4NS0zZWEwZDA1ZWE2ZDIiCiAgICAgIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkdpbXAgMi4xMCAoTGludXgpIgogICAgICBzdEV2dDp3aGVuPSIyMDI2LTA3LTE2VDIyOjI4OjU2KzAxOjAwIi8+CiAgICA8L3JkZjpTZXE+CiAgIDwveG1wTU06SGlzdG9yeT4KICA8L3JkZjpEZXNjcmlwdGlvbj4KIDwvcmRmOlJERj4KPC94OnhtcG1ldGE+CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAKPD94cGFja2V0IGVuZD0idyI/Pp/5BkcAAAAJcEhZcwAACxMAAAsTAQCanBgAAAAHdElNRQfqBxAVHDhNqp2TAAAgAElEQVR42ky8SbCkR3Im5u4R/5Z7vrXeqw1VhSoABTRAAI1Gs/cmmtNchuQ0aUNqNKMhqRFNNx3GpIsuMpPppKNuOuhA2mhMY8MxSkazsaGGZItkN9kb0GigUCgUan9Vb82Xe+a/RLi7DvHnQ8OewepVlmX+GeHx+eeffx54bvc1AEBARABERARFJEAkREIwCACGDFoiAhBEjKMktUlkosjGsYkMmCROkiRN47hhG3GcWWsIBADAoAh75koqx1XFVcHLZekqVzjvWJ2qMHsv7H3hPasAEiB6g9ZaC4iGyBobRTaNkyxO0ixNbWojEyFZY2wUGSIABQBVVBFVRYMKyixKBAqgqqpMigpA1lhrDBFZQAQga60hQ0TGWiJDSEQUx3Ecx2naSJM4iiNrLKGxkbHGRpGJbWTIIqmwiIh4QRFmEQBQ8ZV3rnKF98yO2Tnnmdl7L+I9sxdmrpwvyqJyVVmWFhER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)
![External image](https://picsum.photos/128)

## Expected Missing Image

![Missing image](./not_here.png)


## Additional Viewer Elements

Here are some more HTML elements for testing:

- Sized image:<br/>
  <img src="./ai_flower.png" width="80px" alt="A Sized Image">
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
