# Chemical Formula Examples

A demonstration of chemical formulas and equations using
[mhchem](https://mhchem.github.io/MathJax-mhchem/) (`\ce{…}` / `\pu{…}`).

## Chemical Formulas

Water: $\ce{H2O}$. Sulfuric acid: $\ce{H2SO4}$. Glucose: $\ce{C6H12O6}$.

## Charges

Hydrogen ion: $\ce{H+}$. Chromate: $\ce{CrO4^2-}$. Complex ion: $\ce{[AgCl2]-}$.

## Stoichiometric Numbers

$\ce{2H2 + O2 -> 2H2O}$

$\ce{0.5 H2O}$ or $\ce{1/2 H2O}$

## Reaction Arrows

| Syntax | Meaning |
|--------|---------|
| $\ce{A -> B}$ | yields |
| $\ce{A <- B}$ | is produced by |
| $\ce{A <-> B}$ | resonance / equilibrium |
| $\ce{A <=> B}$ | reversible reaction |
| $\ce{A <=>> B}$ | equilibrium favoring products |

Arrows can carry annotations above and below:

$$
\ce{A ->[\text{heat}][\text{catalyst}] B}
$$

## Isotopes and Nuclides

Thorium-227: $\ce{^{227}_{90}Th+}$

Neutron: $\ce{^0_-1n-}$

## Bonds

Single: $\ce{C6H5-CHO}$. Double: $\ce{CH2=CH2}$. Triple: $\ce{HC#CH}$.

Delocalized: $\ce{A\bond{~--}B\bond{~=}C}$

## States of Aggregation

Aqueous: $\ce{CO3^2-_{(aq)}}$

Precipitate: $\ce{BaSO4 v}$ (down arrow = precipitate)

Gas evolved: $\ce{CO2 ^}$ (up arrow = gas)

## Oxidation States

$\ce{Fe^{II}Fe^{III}2O4}$ — magnetite

## Greek Characters in Chemistry

$\ce{\mu-Cl}$ — bridging chloro

$\ce{[Pt(\eta^2-C2H4)Cl3]-}$ — Zeise's salt

## Physical Units (pu)

Energy: $\pu{123 kJ/mol}$

Concentration: $\pu{1.5e-3 mol\mathbin{/}L}$

Speed of light: $\pu{3e8 m\cdot s-1}$

Gas constant: $\pu{8.314 J // mol K}$

## Italic Variables vs Upright Elements

Variables are italic, elements are upright — mhchem handles this
automatically:

$\ce{NO_x}$ — the $x$ is italic (variable)

$\ce{Fe^n+}$ — the $n$ is italic (variable)

## Inline Chemistry in Sentences

The combustion of methane is $\ce{CH4 + 2O2 -> CO2 + 2H2O}$, releasing
$\pu{890 kJ\mathbin{/}mol}$ of energy. The product $\ce{CO2}$ is a greenhouse gas.

## Block Equations

$$
\ce{Zn^2+ <=>[+ 2OH-][+ 2H+] Zn(OH)2 v <=>[+ 2OH-][+ 2H+] [Zn(OH)4]^2-}
$$

## Equilibrium with Math

$$
K = \frac{[\ce{Hg^2+}][\ce{Hg}]}{[\ce{Hg2^2+}]}
$$

## Chemistry Inside Bracket Delimiters

Inline: \(\ce{H2O}\). Block:

\[
\ce{2H2 + O2 -> 2H2O}
\]

## Chemistry in Fenced Blocks

```math
\ce{CO2 + C -> 2CO}
```
