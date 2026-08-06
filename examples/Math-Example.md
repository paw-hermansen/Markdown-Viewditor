# Math Formula Examples

A demonstration of math rendering across AI-engine delimiters.

## Inline math (dollar form — Copilot / Gemini / GitHub)

The Pythagorean theorem: $a^2 + b^2 = c^2$. A price like $5 and $10 is NOT
math (pandoc rules: opening `$` not followed by space, closing `$` not
followed by a digit). The `$` signs in that sentence render as literal text
because the dollar-delimiter rules reject prices.

## Block math (dollar form)

$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

## Inline math (bracket form — ChatGPT / Claude)

Euler's identity: \( e^{i\pi} + 1 = 0 \).

## Block math (bracket form)

\[
\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}
\]

## Bare `\begin{...}` blocks

\begin{align}
\nabla \times \vec{B} - \frac{1}{c} \frac{\partial \vec{E}}{\partial t}
  &= \frac{4\pi}{c} \vec{j} \\
\nabla \cdot \vec{E} &= 4 \pi \rho
\end{align}

## Fenced math blocks

```math
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
```

## Matrices

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

## Cases

$$
f(x) = \begin{cases}
1 & \text{if } x > 0 \\
0 & \text{if } x \leq 0
\end{cases}
$$

## Invalid LaTeX (renders as a compact error, does not throw)

$$ \undefinedcommand $$
