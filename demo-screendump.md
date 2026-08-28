---
title: "Water: Properties & Sustainability"
author: "Technical Dept."
date: 2026-08-28
---

# Water: Properties & Sustainability {#water}

Water ($\ce{H2O}$) is the most ~~abundant~~ ==essential== compound on
Earth. Its unique properties arise from _molecular geometry_ and
_hydrogen bonding_.[^1]

> Water is the driving force in nature
>
> -- <cite>Leonardo da Vinci</cite>

## Molecular Structure

The water molecule has a bond angle of $104.5°$ and bond length
$d = 95.84\,\text{pm}$. The dipole moment is:

$$\vec{p} = q \cdot \vec{d} = 1.85\,\text{D}$$

Key equilibria in aqueous solution:

$$\ce{2H2O <=> H3O+ + OH-} \qquad K_w = 1.0 \times 10^{-14}$$

## Physical Properties {#properties}

| Property        |  Value | Unit    |
| :-------------- | -----: | :------ |
| Molar mass      | 18.015 | g/mol   |
| Density (25 °C) |  0.997 | g/cm³   |
| Boiling point   | 100.00 | °C      |
| Specific heat   |  4.184 | J/(g·K) |
| Surface tension |  71.97 | mN/m    |

> Water's high specific heat capacity makes it an excellent thermal regulator
> in both industrial and biological systems.

## Key Reactions

The electrolysis of water produces hydrogen and oxygen:

$$\ce{2H2O ->[\text{electricity}] 2H2 ^ + O2 ^}$$

Neutralization with sodium hydroxide:

$$\ce{HCl + NaOH -> NaCl + H2O} \quad \Delta H = -57.1\,\text{kJ/mol}$$

The autoionization constant follows the van 't Hoff equation:

$$\ln K_w = -\frac{\Delta H^\circ}{R}\left(\frac{1}{T}\right) + C$$

## Code Example

```python
def water_density(temp_c: float) -> float:
    """Approximate density of water (g/cm³) at 1 atm."""
    return 0.99983 + 5.054e-5 * temp_c - 7.029e-6 * temp_c**2
```

## Sustainability Checklist

- [x] Reduce industrial water waste
- [x] Implement closed-loop cooling systems
- [ ] Deploy solar-powered desalination
- [ ] Achieve net-zero water discharge by 2030

## Action Items

1. Audit current water usage across facilities
2. Install flow sensors with <kbd>Ctrl</kbd>+<kbd>S</kbd> logging shortcut
3. Publish quarterly sustainability metrics

---

[^1]: The anomalous expansion below 4 °C is critical for aquatic ecosystems — ice floats because $\rho_{\text{ice}} < \rho_{\text{water}}$.

_Report generated with Markdown Viewditor — press <kbd>Ctrl</kbd>+<kbd>E</kbd> to toggle views._
