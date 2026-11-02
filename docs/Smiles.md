**Note**: The rendered look of this file might not be correct if you view it in
any other Markdown viewer than `Markdown Viewditor` because it uses extensions to
Markdown that not all Markdown viewers can render correct and beautiful.

# Molecular Structures (SMILES)

Markdown Viewditor renders organic chemistry structures from SMILES strings via
[smiles-drawer](https://github.com/reymond-group/smilesDrawer). Structures work
in all view modes and export to HTML, PDF, and ODT. SMILES rendering is loaded
lazily — it only activates when your document contains a `smiles` code block.

## Quick Start

Write a fenced code block with the `smiles` language identifier (`smi` also
works) and a SMILES string as the content:

````
```smiles
CC(=O)Oc1ccccc1C(=O)O
```
````

```smiles
CC(=O)Oc1ccccc1C(=O)O
```

## Examples

Benzene (aromatic ring):

````
```smiles
c1ccccc1
```
````

```smiles
c1ccccc1
```

Paracetamol (ring with hetero atoms and an amide):

````
```smiles
CC(=O)Nc1ccc(O)cc1
```
````

```smiles
CC(=O)Nc1ccc(O)cc1
```

Caffeine (fused rings, several nitrogens):

````
```smiles
Cn1cnc2c1c(=O)n(C)c(=O)n2C
```
````

```smiles
Cn1cnc2c1c(=O)n(C)c(=O)n2C
```

One code block renders one molecule. For the SMILES syntax itself, see the
[SMILES specification](https://opensmiles.org/opensmiles.html) or any of the
online SMILES references.

## Settings

Every option can be set per block with fence attributes or positionally with
standalone HTML comment directives. The two layers interact exactly like
Mermaid's host options: document directives apply from their position forward,
fence attributes override them for one block only, and `!key` resets a key to
its default.

### All Settable Attributes

| Attribute            | Type    | Default   | Values                                                            | Description                                    |
| -------------------- | ------- | --------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| `align`              | string  | `center`  | `left`, `center`, `right`                                         | Horizontal alignment of the structure          |
| `scale`              | number  | `1`       | 0.25-4                                                            | Display-size multiplier (`1.5` = 150%)         |
| `fitToWidth`         | boolean | `true`    | `true`, `false`                                                   | Scale down to the viewer width (`false` keeps the scaled size, scrollable) |
| `theme`              | string  | `auto`    | `auto`, `light`, `dark`, `oldschool`, `solarized`, `solarized-dark`, `matrix`, `github`, `carbon`, `cyberpunk`, `gruvbox`, `gruvbox-dark` | Color theme (`auto` follows the app theme)     |
| `atomVisualization`  | string  | `default` | `default`, `balls`, `none`                                        | Atom rendering style                           |
| `showCarbons`        | string  | `default` | `none`, `default`, `terminal`, `acyclic`, `all`                   | Carbon label visibility                        |
| `explicitHydrogens`  | boolean | `true`    | `true`, `false`                                                   | Show hydrogen atoms                            |
| `compactDrawing`     | boolean | `true`    | `true`, `false`                                                   | Abbreviate terminal groups (t-Bu, etc.)        |
| `isomeric`           | boolean | `true`    | `true`, `false`                                                   | Draw stereochemistry                           |

Fine-grained drawing internals (bond length and thickness, fonts, padding,
overlap tuning) are deliberately not settable — they stay at the library's
tested defaults so structures look consistent across documents and exports.

### Fence Attributes (per-block)

Fence attributes are placed in `{...}` after the `smiles` language identifier.
They apply only to that block.

````
```smiles {scale=1.5 align=left}
CC(=O)Oc1ccccc1C(=O)O
```
````

```smiles {scale=1.5 align=left}
CC(=O)Oc1ccccc1C(=O)O
```

````
```smiles {atomVisualization=balls showCarbons=all}
CCO
```
````

```smiles {atomVisualization=balls showCarbons=all}
CCO
```

### HTML Comment Directives (document-level)

Directives are standalone HTML comments placed on their own line. Their
settings become effective from that position forward, until changed by another
directive or the end of the file. Each directive changes only the keys it
names; omitted keys keep their previous values.

```markdown
<!-- smiles: align=left scale=1.5 -->
<!-- smiles: !scale -->
```

The second directive resets `scale` to its default; `align=left` remains in
effect.

## Scaling

`scale` is a pure size multiplier on the structure's natural drawing size:
`scale=1` (default) draws at 100%, `scale=1.5` at 150%. Scaling is vector —
the structure stays crisp at every size in the viewer and in every export.

````
```smiles {scale=0.75}
c1ccccc1
```
````

```smiles {scale=0.75}
c1ccccc1
```

````
```smiles {scale=1.5}
c1ccccc1
```
````

```smiles {scale=1.5}
c1ccccc1
```

## Scaling vs Scrolling

What happens when a structure is wider than the viewer column is controlled
by `fitToWidth` — the same option and semantics as Mermaid's host options:

- **`fitToWidth=true`** (default) - the structure scales down to fit the
  column width. Nothing is clipped, but very large structures may become
  small — and a `scale` larger than what fits is effectively overridden.
- **`fitToWidth=false`** - the structure renders at its scaled size
  (`scale` says exactly what it says) and uses horizontal scrolling when it
  exceeds the column. Alignment still positions narrower structures.

````
```smiles {fitToWidth=false scale=1.5}
CC(=CCC/C(=C/C=C/C(=C/C=C/C(=C/C=C/C=C(/C=C/C=C(/C=C/C=C(/CCC=C(C)C)\C)\C)\C)/C)/C)/C)C
```
````

```smiles {fitToWidth=false scale=1.5}
CC(=CCC/C(=C/C=C/C(=C/C=C/C(=C/C=C/C=C(/C=C/C=C(/C=C/C=C(/CCC=C(C)C)\C)\C)\C)/C)/C)/C)C
```

Print and PDF export have no scrolling: every structure wider than the page
content width is scaled down to fit it (even with `fitToWidth=false`), while
structures that already fit print as they are. Structures are never split
across pages.

## Alignment

`align` positions the structure horizontally, like Mermaid's `align`:
`left`, `center` (default), or `right`.

````
```smiles {align=left scale=0.75}
CCO
```
````

```smiles {align=left scale=0.75}
CCO
```

````
```smiles {align=right scale=0.75}
CCO
```
````

```smiles {align=right scale=0.75}
CCO
```

## Theme Behavior

With `theme=auto` (the default), structures follow the app's dark/light theme —
atom colors and bonds switch palette with the rest of the viewer. An explicit
theme pins the palette regardless of the app theme:

````
```smiles {theme=oldschool}
CC(=O)Oc1ccccc1C(=O)O
```
````

```smiles {theme=oldschool}
CC(=O)Oc1ccccc1C(=O)O
```

The available palettes are the smiles-drawer color themes: `light`, `dark`,
`oldschool`, `solarized`, `solarized-dark`, `matrix`, `github`, `carbon`,
`cyberpunk`, `gruvbox`, and `gruvbox-dark`.

Export note: ODT is a neutral document (white page, no theme background), so
ODT export renders `theme=auto` structures with the `light` palette — the
dark palettes draw white lines on transparency and would be invisible there.
Explicitly pinned themes are honored in every export. PDF and HTML carry the
theme background, so `theme=auto` keeps following the app there.

## Invalid SMILES

Unparseable SMILES renders as the source with an error message instead of
crashing, so documents with incomplete structures stay viewable.

````
```smiles
this is not a smiles
```
````

```smiles
this is not a smiles
```

## Export

| Format | Behavior                                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| HTML   | Structures are inline SVG — fully self-contained; `fitToWidth=false` keeps the scrollable natural size                        |
| PDF    | Vector SVG — prints cleanly at any resolution. Structures wider than the page content width are scaled down to fit it (even with `fitToWidth=false`); structures are never split across pages |
| ODT    | Structures embedded as vector SVG; the shared "SVG images & Mermaid diagrams" → "Rasterize as PNG images" option converts them to PNG. Wide structures are clamped to the page content width (no scroll container in ODF). On render failure the source is kept as a code block |

In ODT export, the `scale` multiplier and `align` carry over: the embedded
frame is sized at the scaled dimensions (clamped to the page content width)
and positioned with the same alignment as in the Viewer. Structures whose
theme is `auto` render with the `light` palette (see Theme Behavior) so they
read on the ODT page.
