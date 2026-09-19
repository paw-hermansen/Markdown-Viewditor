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

## Very wide block math (should scroll)

$$
\begin{aligned}
\mathcal{L}(\theta) ={}& -\sum_{i=1}^{n} \log p(y_i \mid x_i, \theta) + \lambda_1 \lVert\theta\rVert_1 + \lambda_2 \lVert\theta\rVert_2^2 + \alpha\,\mathrm{tr}(\Sigma^{-1}S) + \beta\,\log\det(\Sigma) + \gamma\,\mathrm{KL}(q(z) \mathbin\Vert p(z)) + \delta\,\mathbb{E}_{z\sim q(z)}[\lVert f_\theta(z) - y\rVert_2^2]
\end{aligned}
$$

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

## Fenced anonymous blocks (does not render math)

```
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

---

## Fence Attributes

### Fontsize scaling

The formula below uses `fontsize=2.0` to render at double size:

```math {fontsize=2.0}
\frac{x^2}{y^2}
```

### Left-side equation numbers (leqno)

```math {leqno}
E = mc^2 \tag{1}
```

### Flush-left alignment (fleqn)

```math {fleqn}
\int_0^1 f(x)\,dx = F(1) - F(0)
```

### Combined attributes

```math {leqno fontsize=1.5}
a^2 + b^2 = c^2 \tag{2}
```

---

## HTML Comment Directives

<!-- math: fontsize=1.3 -->

The directive above makes all following math render at 1.3× base size.

$x^2 + y^2 = z^2$

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$

<!-- math: !fontsize -->

The `!fontsize` directive resets back to default (1.0).

$\alpha + \beta = \gamma$

<!-- math: leqno -->

The `leqno` directive enables left-side equation numbers for all following math.

$$
\nabla \cdot \vec{E} = \frac{\rho}{\epsilon_0} \tag{3}
$$

$$
\nabla \times \vec{B} = \mu_0 \vec{j} + \mu_0 \epsilon_0 \frac{\partial \vec{E}}{\partial t} \tag{4}
$$

<!-- math: !leqno -->

The `!leqno` directive disables left-side equation numbers.

$$
F = ma\tag{Right 5}
$$
