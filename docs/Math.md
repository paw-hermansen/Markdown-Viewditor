# Math Formulas

Markdown Viewditor renders math via [$\KaTeX$](https://katex.org). Formulas work in all view modes and export to HTML, ODT, and PDF.

## Delimiter Syntax

Math works with multiple delimiter styles so that content copied from AI chatbots renders correctly:

| Style   | Inline    | Block                             | Used by                         |
| ------- | --------- | --------------------------------- | ------------------------------- |
| Dollar  | `$...$`   | `$$...$$`                         | Copilot, GitHub, Gemini, Claude |
| Bracket | `\(...\)` | `\[`<br/> ... <br/> `\]`          | ChatGPT, Claude                 |
| Bare    | —         | `\begin{align}...\end{align}`     | LaTeX convention                |
| Fenced  | —         | ` ```math`<br/> ... <br/> ` ``` ` | Many                            |

All styles can be mixed freely in the same document.

### Dollar delimiters

Inline: `$a^2 + b^2 = c^2$` that becomes $a^2 + b^2 = c^2$ inside a text line.

Block:

```
$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$
```

$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

Pandoc rules prevent false positives — an opening `$` must not be followed by a space, and a closing `$` must not be followed by a digit. Prices like `$5` and `$10` render as literal text.

### Bracket delimiters

Inline: `\( e^{i\pi} + 1 = 0 \)`that becomes \( e^{i\pi} + 1 = 0 \) inside a text line.

Block:

```
\[
\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}
\]
```

\[
\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}
\]

### Bare `\begin{}` blocks

Standard LaTeX environments work without wrapping delimiters:

```
\begin{align}
\nabla \times \vec{B} - \frac{1}{c} \frac{\partial \vec{E}}{\partial t}
  &= \frac{4\pi}{c} \vec{j} \\
\nabla \cdot \vec{E} &= 4 \pi \rho
\end{align}
```

\begin{align}
\nabla \times \vec{B} - \frac{1}{c} \frac{\partial \vec{E}}{\partial t}
&= \frac{4\pi}{c} \vec{j} \\
\nabla \cdot \vec{E} &= 4 \pi \rho
\end{align}

It only works for `\begin{...}` blocks on the outer level. Other
valid backslash commands (see [$\KaTeX$ docs](https://katex.org/docs/supported))
must be put inside math delimiters:

```
$$
\def\arraystretch{1.5}
\begin{array}{c:c:c}
   a & b & c \\ \hline
   d & e & f \\ \hdashline
   g & h & i
\end{array}
$$
```

$$
\def\arraystretch{1.5}
\begin{array}{c:c:c}
   a & b & c \\ \hline
   d & e & f \\ \hdashline
   g & h & i
\end{array}
$$

### Fenced math blocks

Use a fenced code block with the `math` language identifier:

````
```math
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
```
````

```math
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
```

A plain fenced block (without `math`) renders as code, not math.

Fenced math blocks also support per-block attributes in curly braces:

````
```math {leqno fontsize=1.5}
E = mc^2
```
````

```math {leqno fontsize=1.5}
E = mc^2
```

See [Math Attributes](#math-attributes) below.

## Math Attributes

$\KaTeX$ rendering can be customized per-block with fence attributes or per-document with HTML comment directives.

### Fence Attributes (per-block)

Fence attributes are placed in `{...}` after the `math` language identifier. They apply only to that block.

| Attribute  | Type    | Default | Values    | Description                                     |
| ---------- | ------- | ------- | --------- | ----------------------------------------------- |
| `leqno`    | boolean | `false` |           | Place equation numbers on the left side         |
| `fleqn`    | boolean | `false` |           | Flush-left display math (instead of centered)   |
| `fontsize` | number  | `1.0`   | 0.3 – 5.0 | Font size scaling factor (multiplies base size) |

Examples:

````
```math {leqno}
E = mc^2 \tag{1}
```
````

```math {leqno}
E = mc^2 \tag{1}
```

````
```math {fontsize=2.0}
\frac{x^2}{y^2}
```
````

```math {fontsize=2.0}
\frac{x^2}{y^2}
```

````
```math {fleqn leqno fontsize=1.5}
\int_0^1 f(x)\,dx \tag{2}
```
````

```math {fleqn leqno fontsize=1.5}
\int_0^1 f(x)\,dx \tag{2}
```

### HTML Comment Directives (document-level)

Directives set default values for all math in the document. They use the same attribute syntax as fence attributes and persist until changed by another directive.

```markdown
<!-- math: leqno -->
<!-- math: fontsize=1.5 -->
```

Directives affect all math syntax: `$...$`, `$$...$$`, `\(...\)`, `\[...\]`, `\begin{}`, and ` ```math ``` `.

To reset a boolean directive: `<!-- math: !leqno -->`
To reset a non-boolean directive back to its default: `<!-- math: !fontsize -->`

### Scoping

How directives and fence attributes interact:

- **Document directives** (`<!-- math: ... -->`) set defaults for the entire document.
- **Fence attributes** (` ```math {...} `) override directives for that block only.
- After a fenced block ends, the document reverts to the directive values.

#### Example

A document sets `leqno` globally, then one fenced block adds `fontsize`:

````markdown
<!-- math: leqno -->

$$
a^2 + b^2 = c^2 \tag{1}
$$

```math {fontsize=1.44}
\int_0^1 f(x)\,dx \tag{2}
```

$$
x + y = z \tag{3}
$$
````

**Result:**

<!-- math: leqno -->

$$
a^2 + b^2 = c^2 \tag{1}
$$

```math {fontsize=1.44}
\int_0^1 f(x)\,dx \tag{2}
```

$$
x + y = z \tag{3}
$$

| Equation | Attributes applied                   | Source                     |
| -------- | ------------------------------------ | -------------------------- |
| (1)      | `leqno`                              | Document directive         |
| (2)      | `leqno` (inherited) + `fontsize=2.0` | Directive + fence override |
| (3)      | `leqno`                              | Document directive         |

The fenced block does not affect surrounding math — it only adds to its own scope.

<!-- math: !leqno -->

## Common Constructs

### Fractions and roots

`$\frac{a}{b}$` → $\frac{a}{b}$

`$\sqrt{x}$` → $\sqrt{x}$

`$\sqrt[7]{x}$` → $\sqrt[7]{x}$

### Subscripts and superscripts

`$x_i$` → $x_i$

`$x^2$` → $x^2$

`$x_i^{2}$` → $x_i^{2}$

### Greek letters

`$\alpha$` → $\alpha$

`$\beta$` → $\beta$

`$\gamma$` → $\gamma$

`$\Delta$` → $\Delta$

`$\Sigma$` → $\Sigma$

`$\Omega$` → $\Omega$

### Matrices

```
$$
\begin{pmatrix}
a & b \\
c & d
\end{pmatrix}
\begin{pmatrix}
x \\
y
\end{pmatrix}
=
\begin{pmatrix}
ax + by \\
cx + dy
\end{pmatrix}
$$
```

$$
\begin{pmatrix}
a & b \\
c & d
\end{pmatrix}
\begin{pmatrix}
x \\
y
\end{pmatrix}
=
\begin{pmatrix}
ax + by \\
cx + dy
\end{pmatrix}
$$

### Piecewise functions (cases)

```
$$
f(x) = \begin{cases}
1 & \text{if } x > 0 \\
0 & \text{if } x \leq 0
\end{cases}
$$
```

$$
f(x) = \begin{cases}
1 & \text{if } x > 0 \\
0 & \text{if } x \leq 0
\end{cases}
$$

## Wide Equations

Block math that exceeds the viewer width scrolls horizontally — no content is clipped.

## Invalid LaTeX

Unrecognized commands render as a compact inline error message instead of crashing. This lets you view documents with partial math support:

`$$ \undefinedcommand $$`

## $\KaTeX$ Reference

$\KaTeX$ supports most of $\LaTeX$'s math mode. For the full list of supported commands and symbols:

**[$\KaTeX$ Supported Functions](https://katex.org/docs/supported)**

## Chemistry in Math

Chemical formulas use the `\ce{...}` and `\pu{...}` commands inside any math delimiter. See [Chemistry.md](Chemistry.md) for details.
