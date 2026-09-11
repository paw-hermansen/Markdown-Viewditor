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
