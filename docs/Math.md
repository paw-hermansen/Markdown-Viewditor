# Math Formulas

Markdown Viewditor renders math via [KaTeX](https://katex.org). Formulas work in all view modes and export to HTML, ODT, and PDF.

## Delimiter Syntax

Math works with multiple delimiter styles so that content copied from AI chatbots renders correctly:

| Style   | Inline    | Block                         | Used by                         |
| ------- | --------- | ----------------------------- | ------------------------------- |
| Dollar  | `$...$`   | `$$...$$`                     | Copilot, GitHub, Gemini, Claude |
| Bracket | `\(...\)` | `\[...\]`                     | ChatGPT, Claude                 |
| Bare    | —         | `\begin{align}...\end{align}` | LaTeX convention                |
| Fenced  | —         | ` ```math...``` `             | Many                            |

All styles can be mixed freely in the same document.

### Dollar delimiters

Inline: `$a^2 + b^2 = c^2$`

Block:

```
$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$
```

Pandoc rules prevent false positives — an opening `$` must not be followed by a space, and a closing `$` must not be followed by a digit. Prices like `$5` and `$10` render as literal text.

### Bracket delimiters

Inline: `\( e^{i\pi} + 1 = 0 \)`

Block:

```
\[
\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}
\]
```

### Bare `\begin{}` blocks

Standard LaTeX environments work without wrapping delimiters:

```
\begin{align}
\nabla \times \vec{B} - \frac{1}{c} \frac{\partial \vec{E}}{\partial t}
  &= \frac{4\pi}{c} \vec{j} \\
\nabla \cdot \vec{E} &= 4 \pi \rho
\end{align}
```

### Fenced math blocks

Use a fenced code block with the `math` language identifier:

````
```math
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
```
````

A plain fenced block (without `math`) renders as code, not math.

Fenced math blocks also support per-block attributes in curly braces:

````
```math {leqno fontsize=1.5}
E = mc^2
```
````

See [Math Attributes](#math-attributes) below.

## Math Attributes

KaTeX rendering can be customized per-block with fence attributes or per-document with HTML comment directives.

### Fence Attributes (per-block)

Fence attributes are placed in `{...}` after the `math` language identifier. They apply only to that block.

| Attribute  | Type    | Default | Description                                     |
| ---------- | ------- | ------- | ----------------------------------------------- |
| `leqno`    | boolean | `false` | Place equation numbers on the left side         |
| `fleqn`    | boolean | `false` | Flush-left display math (instead of centered)   |
| `fontsize` | number  | `1.0`   | Font size scaling factor (multiplies base size) |

Examples:

````
```math {leqno}
E = mc^2 \tag{1}
```
````

````
```math {fontsize=2.0}
\frac{x^2}{y^2}
```
````

````
```math {fleqn leqno fontsize=1.5}
\int_0^1 f(x)\,dx \tag{2}
```
````

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

Fence attributes override directives, but only within the fenced block. After the block ends, the document reverts to the directive state.

````
<!-- math: leqno -->

$$
a^2 + b^2 = c^2 \tag{1}
$$

```math {fontsize=2.0}
\int_0^1 f(x)\,dx \tag{2}
````

$$
x + y = z \tag{3}
$$

````

In this example: equations (1) and (3) get `leqno` from the directive. Equation (2) gets both `leqno` (inherited) and `fontsize=2.0` (fence override).

### Directive-Only Attributes

These attributes can only be set via HTML comment directives (not fence attributes):

| Attribute     | Type    | Default     | Description                                        |
| ------------- | ------- | ----------- | -------------------------------------------------- |
| `throwOnError` | boolean | `false`     | Throw on invalid LaTeX (instead of inline error)   |
| `errorColor`   | string  | `"#cc0000"` | Color for rendering errors                         |
| `strict`       | string  | `"warn"`    | KaTeX strictness: `ignore`, `warn`, or `error`     |
| `trust`        | boolean | `false`     | Allow dangerous commands (`\href`, `\includegraphics`) |

Example:

```markdown
<!-- math: errorColor=#ff0000 -->
<!-- math: strict=ignore -->
````

### All Settable Math Attributes

Complete reference of all attributes available for math rendering:

| Attribute      | Fence? | Directive? | Type    | Default     | Values                    | Description                            |
| -------------- | ------ | ---------- | ------- | ----------- | ------------------------- | -------------------------------------- |
| `leqno`        | yes    | yes        | boolean | `false`     |                           | Left-side equation numbers             |
| `fleqn`        | yes    | yes        | boolean | `false`     |                           | Flush-left display math                |
| `fontsize`     | yes    | yes        | number  | `1.0`       | 0.3 – 5.0                 | Font size scaling factor               |
| `throwOnError` | no     | yes        | boolean | `false`     |                           | Throw on invalid LaTeX                 |
| `errorColor`   | no     | yes        | string  | `"#cc0000"` | any CSS color             | Error highlight color                  |
| `strict`       | no     | yes        | string  | `"warn"`    | `ignore`, `warn`, `error` | KaTeX strictness level                 |
| `trust`        | no     | yes        | boolean | `false`     |                           | Allow `\href`, `\includegraphics` etc. |

**Fence?** — settable in ` ```math {key=val} ` syntax.
**Directive?** — settable in `<!-- math: key=val -->` syntax.

## Common Constructs

### Fractions and roots

`$\frac{a}{b}$`, `$\sqrt{x}$`, `$\sqrt[3]{x}$`

### Subscripts and superscripts

`$x_i$`, `$x^2$`, `$x_i^{2}$`

### Greek letters

`$\alpha$`, `$\beta$`, `$\gamma$`, `$\Delta$`, `$\Sigma$`, `$\Omega$`

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

### Piecewise functions (cases)

```
$$
f(x) = \begin{cases}
1 & \text{if } x > 0 \\
0 & \text{if } x \leq 0
\end{cases}
$$
```

### Auto-numbered equations

Use `\tag{}` for equation labels:

```
$$
i\hbar \frac{\partial}{\partial t}\Psi = \hat{H}\Psi \tag{1}
$$
```

## Wide Equations

Block math that exceeds the viewer width scrolls horizontally — no content is clipped.

## Invalid LaTeX

Unrecognized commands render as a compact inline error message instead of crashing. This lets you view documents with partial math support:

`$$ \undefinedcommand $$`

## KaTeX Reference

KaTeX supports most of LaTeX's math mode. For the full list of supported commands and symbols:

**[KaTeX Supported Functions](https://katex.org/docs/supported)**

## Chemistry in Math

Chemical formulas use the `\ce{...}` and `\pu{...}` commands inside any math delimiter. See [Chemistry.md](Chemistry.md) for details.
