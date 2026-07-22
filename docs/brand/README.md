# KITVERA Brand Identity

**Status:** Approved by user on 2026-07-22

## Brand name

The marketplace brand is **KITVERA**. Use the uppercase spelling in primary
logo lockups and brand-facing headings. Do not abbreviate or translate it.

## Approved logo direction

The approved concept combines three signals in one mark:

- a browser frame with three window dots;
- modular content blocks representing reusable website-template sections;
- a geometric `K` identifying KITVERA.

The approved raster concept is
[`kitvera-logo-approved-concept-v1.png`](./kitvera-logo-approved-concept-v1.png).
Its SHA-256 is
`b9c2fd015089424480614c53417d314de93a312bbd063c06d7cc5d486ed827af`.

This PNG is the visual source of truth for the approved direction. All current
derivative assets are extracted directly from this image so the silhouette and
proportions cannot drift. A future production SVG must be manually redrawn and
approved against an overlay comparison; do not auto-trace raster artefacts or
reinterpret the mark.

## Core palette

| Token | Value | Use |
| --- | --- | --- |
| Coral | `#F26B4A` | Primary mark and restrained accent |
| Charcoal | `#171717` | Wordmark, dark surfaces, primary text |
| Paper | `#F7F3EE` | Warm light brand surface |
| White | `#FFFFFF` | Reverse mark and neutral surface |

The identity uses flat colour. Avoid gradients, bevels, shadows, tree/forest
imagery, shopping-cart symbols, and visual imitation of ThemeForest.

## Required variants

The approved asset set includes a horizontal lockup, standalone mark,
one-colour variant, reverse lockup, and favicon/app-icon exports. Maintain clear
space around the mark and never distort, rotate, or recolour individual parts
outside the approved palette.

## Reusable assets

The `assets/` directory contains transparent PNG assets extracted from the
approved concept. Use these assets until a manually redrawn SVG passes visual
overlay approval against the source image.

| Asset | Intended use |
| --- | --- |
| `kitvera-logo-horizontal.png` | Header/footer on light backgrounds |
| `kitvera-logo-horizontal-reverse.png` | Header/footer on dark backgrounds |
| `kitvera-symbol-coral.png` | Standalone mark, avatars and social graphics |
| `kitvera-symbol-charcoal.png` | One-colour print and neutral UI contexts |
| `kitvera-favicon-16.png` | Legacy 16px browser favicon |
| `kitvera-favicon-32.png` | Legacy 32px browser favicon |
| `kitvera-apple-touch-icon-180.png` | Apple touch icon |
| `kitvera-app-icon-512.png` | App/PWA icon and large square export |
| `kitvera-symbol-coral-512.png` | Raster standalone mark for social tools |
| `brand-tokens.json` | Machine-readable brand name and colour tokens |
| `brand-tokens.css` | CSS custom properties for web implementation |

The exported wordmark is part of the approved image and has no runtime font
dependency. Use an accessible text label when the standalone symbol is the
only visible brand indicator.
