# Chemical Formulas and Physical Units

Markdown Viewditor includes [mhchem](https://mhchem.github.io/MathJax-mhchem/) for writing chemical equations and physical units. The `\ce{...}` and `\pu{...}` commands work inside all supported math delimiters (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`, bare `\begin{}`, and ` ```math ` fences).

## Chemical Formulas

Water: `$\ce{H2O}$` → $\ce{H2O}$
Sulfuric acid: `$\ce{H2SO4}$` → $\ce{H2SO4}$
Glucose: `$\ce{C6H12O6}$` → $\ce{C6H12O6}$

## Charges

Hydrogen ion: `$\ce{H+}$` → $\ce{H+}$
Chromate: `$\ce{CrO4^2-}$` → $\ce{CrO4^2-}$
Complex ion: `$\ce{[AgCl2]-}$` → $\ce{[AgCl2]-}$

## Stoichiometric Numbers

`$\ce{2H2 + O2 -> 2H2O}$` → $\ce{2H2 + O2 -> 2H2O}$

Fractional: `$\ce{0.5 H2O}$` or `$\ce{1/2 H2O}$`

## Reaction Arrows

| Syntax            | Meaning                       |
| ----------------- | ----------------------------- |
| `$\ce{A -> B}$`   | yields                        |
| `$\ce{A <- B}$`   | is produced by                |
| `$\ce{A <-> B}$`  | resonance / equilibrium       |
| `$\ce{A <=> B}$`  | reversible reaction           |
| `$\ce{A <=>> B}$` | equilibrium favoring products |

Arrows can carry annotations above and below:

```
$$
\ce{A ->[\text{heat}][\text{catalyst}] B}
$$
```

## Isotopes and Nuclides

Thorium-227: `$\ce{^{227}_{90}Th+}$` → $\ce{^{227}_{90}Th+}$

Neutron: `$\ce{^0_-1n-}$` → $\ce{^0_-1n-}$

## Chemical Bonds

Single: `$\ce{C6H5-CHO}$` → $\ce{C6H5-CHO}$
Double: `$\ce{CH2=CH2}$` → $\ce{CH2=CH2}$
Triple: `$\ce{HC#CH}$` → $\ce{HC#CH}$

Delocalized: `$\ce{A\bond{~--}B\bond{~=}C}$`

## States of Aggregation

Aqueous: `$\ce{CO3^2-_{(aq)}}$` → $\ce{CO3^2-_{(aq)}}$

Precipitate: `$\ce{BaSO4 v}$` → $\ce{BaSO4 v}$ (down arrow = precipitate)

Gas evolved: `$\ce{CO2 ^}$` → $\ce{CO2 ^}$ (up arrow = gas)

## Oxidation States

`$\ce{Fe^{II}Fe^{III}2O4}$` → $\ce{Fe^{II}Fe^{III}2O4}$ (magnetite)

## Greek Characters in Chemistry

`$\ce{\mu-Cl}$` → $\ce{\mu-Cl}$ (bridging chloro)

`$\ce{[Pt(\eta^2-C2H4)Cl3]-}$` → $\ce{[Pt(\eta^2-C2H4)Cl3]-}$ (Zeise's salt)

## Physical Units (`\pu{...}`)

The `\pu{...}` command typesets physical quantities with proper formatting:

| Input                     | Output                  |
| ------------------------- | ----------------------- |
| `$\pu{123 kJ/mol}$`       | $\pu{123 kJ/mol}$       |
| `$\pu{1.5e-3 mol/L}$`     | $\pu{1.5e-3 mol/L}$     |
| `$\pu{3e8 m\cdot s-1}$`   | $\pu{3e8 m\cdot s-1}$   |
| `$\pu{8.314 J // mol K}$` | $\pu{8.314 J // mol K}$ |

## Mixing Chemistry with Math

Variables are italic, elements are upright — mhchem handles this automatically:

`$\ce{NO_x}$` — the `$x$` is italic (variable): $\ce{NO_x}$

Equilibrium expressions can combine `\ce{...}` with regular math:

```
$$
K = \frac{[\ce{Hg^2+}][\ce{Hg}]}{[\ce{Hg2^2+}]}
$$
```

## Block Equations

Multi-step reactions in display math:

```
$$
\ce{Zn^2+ <=>[+ 2OH-][+ 2H+] Zn(OH)2 v <=>[+ 2OH-][+ 2H+] [Zn(OH)4]^2-}
$$
```

## Chemistry in Different Delimiters

Bracket form: `\(\ce{H2O}\)` renders inline. Block:

```
\[
\ce{2H2 + O2 -> 2H2O}
\]
```

Fenced block:

````
```math
\ce{CO2 + C -> 2CO}
```
````

## Further Reading

- [mhchem documentation](https://mhchem.github.io/MathJax-mhchem/) — full command reference
- [KaTeX chemistry support](https://katex.org/docs/supported#chemistry) — what KaTeX supports natively
