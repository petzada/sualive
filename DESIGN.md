# Apple — Style Reference
> foldable device in a white gallery. Center product renders as the visual event, with typography and blue controls kept deliberately quiet around it.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Apple treats the product page as a white gallery: enormous product photography occupies the center while compact black typography gives each claim a controlled, almost editorial weight. The page alternates seamless white storytelling sections with #f5f5f7 feature bands containing oversized #ffffff cards, using one saturated blue only for links and compact conversion controls. Rounded 28px media frames soften the hardware-led composition without turning the page into a card dashboard; nearly every surface stays flat and shadowless.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Gallery White | `#ffffff` | `--color-gallery-white` | Primary page canvas, hero background, product story sections, and feature-card surfaces |
| Studio Mist | `#f5f5f7` | `--color-studio-mist` | Alternate full-width section background, feature-stage backdrop, footer surface, and muted content blocks |
| Paper Frost | `#fafafc` | `--color-paper-frost` | Opened global-navigation surface and secondary pale fill |
| Hairline Silver | `#d6d6d6` | `--color-hairline-silver` | 1px dividers, restrained control outlines, and subtle separators |
| Control Gray | `#e6e6e8` | `--color-control-gray` | Disabled control fills, subdued utility surfaces, and single-pixel navigation edge treatment |
| Ink | `#1d1d1f` | `--color-ink` | Headlines, primary body copy, navigation labels, and dark utility icons |
| Slate | `#707070` | `--color-slate` | Secondary copy, legal text, subdued navigation content, and low-emphasis glyphs |
| Steel | `#86868b` | `--color-steel` | Input outlines, inactive indicators, and fine outlined-control edges |
| Apple Blue | `#0066cc` | `--color-apple-blue` | Inline links, section links, and blue text controls — a precise blue punctuation against monochrome product storytelling |
| Pricing Blue | `#0071e3` | `--color-pricing-blue` | Filled pricing and learn-more controls — the brighter blue reserves visual urgency for compact conversion moments |
| Launch Orange | `#b64400` | `--color-launch-orange` | Small launch-status labels such as new-product markers |

## Tokens — Typography

### SF Pro Display — Product names, display headlines, large feature statements, and section-level product claims. The 80px/600 hero treatment tightens to -1.2px, making the largest type feel compact rather than promotional. · `--font-sf-pro-display`
- **Substitute:** Inter, Helvetica Neue, Arial
- **Weights:** 400, 500, 600
- **Sizes:** 19px, 21px, 24px, 28px, 40px, 48px, 80px
- **Line height:** 1.00, 1.05, 1.08, 1.14, 1.17, 1.21, 1.33, 1.38
- **Letter spacing:** -1.2px at 80px; normal at 40px; +0.23px at 19-21px; profile range -0.015em to 0.012em
- **OpenType features:** `"numr"`
- **Role:** Product names, display headlines, large feature statements, and section-level product claims. The 80px/600 hero treatment tightens to -1.2px, making the largest type feel compact rather than promotional.

### SF Pro Text — Navigation, body copy, links, compact buttons, pricing details, labels, and footnotes. The consistently negative tracking lets small interface text remain dense and Apple-specific instead of looking like generic system UI. · `--font-sf-pro-text`
- **Substitute:** Inter, Helvetica Neue, Arial
- **Weights:** 400, 500, 600
- **Sizes:** 10px, 12px, 14px, 17px, 20px, 26px, 44px
- **Line height:** 1.00, 1.18, 1.24, 1.29, 1.33, 1.43, 1.47
- **Letter spacing:** -0.37px at 10px, -0.12px at 12px, -0.22px at 14px, -0.37px at 17px; profile range -0.037em to -0.003em
- **OpenType features:** `"numr"`
- **Role:** Navigation, body copy, links, compact buttons, pricing details, labels, and footnotes. The consistently negative tracking lets small interface text remain dense and Apple-specific instead of looking like generic system UI.

### Arial — Fallback text inside the observed search/input control only. · `--font-arial`
- **Substitute:** Arial
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.20
- **Role:** Fallback text inside the observed search/input control only.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| global-nav | SF Pro Text | 400 | 12px | 1 | -0.12px | `--text-global-nav` |
| compact-control | SF Pro Text | 400 | 12px | 1.33 | -0.12px | `--text-compact-control` |
| body-small | SF Pro Text | 400 | 14px | 1.29 | -0.224px | `--text-body-small` |
| body | SF Pro Text | 400 | 17px | 1.47 | -0.374px | `--text-body` |
| feature-copy | SF Pro Text | 400 | 17px | 1.24 | -0.374px | `--text-feature-copy` |
| product-nav-title | SF Pro Display | 600 | 19px | 1.21 | 0.228px | `--text-product-nav-title` |
| product-kicker | SF Pro Display | 600 | 21px | 1 | 0.231px | `--text-product-kicker` |
| feature-heading | SF Pro Display | 600 | 40px | 1 | 0px | `--text-feature-heading` |
| hero-display | SF Pro Display | 600 | 80px | 1.05 | -1.2px | `--text-hero-display` |

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 4 | 4px | `--spacing-4` |
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 24 | 24px | `--spacing-24` |
| 28 | 28px | `--spacing-28` |
| 32 | 32px | `--spacing-32` |
| 40 | 40px | `--spacing-40` |
| 48 | 48px | `--spacing-48` |
| 52 | 52px | `--spacing-52` |
| 64 | 64px | `--spacing-64` |
| 76 | 76px | `--spacing-76` |
| 80 | 80px | `--spacing-80` |
| 128 | 128px | `--spacing-128` |
| 144 | 144px | `--spacing-144` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 28px |
| links | 10px |
| pills | 36px |
| badges | 0px |
| images | 28px |
| inputs | 980px |
| buttons | 9999px |
| navigation | 20px |

### Shadows

| Name | Value | Token |
|------|-------|-------|
| subtle | `rgb(230, 230, 232) 0px 0px 0px 1px` | `--shadow-subtle` |
| subtle-2 | `rgb(134, 134, 139) 0px 0px 0px 1px` | `--shadow-subtle-2` |

### Layout

- **Section gap:** 90px
- **Card padding:** 28px
- **Element gap:** 20px

## Components

### Global Store Navigation
**Role:** Persistent utility navigation

A 44px-tall white navigation bar with Apple glyph, compact SF Pro Text 12px/400 links, and rgba(0,0,0,0.8) labels. Keep controls unboxed; opened navigation uses #fafafc with a 1px #e6e6e8 edge and blur(20px).

### Product Local Navigation
**Role:** Product-page header and conversion controls

A white local bar carries the product name in SF Pro Display 19px/600 and compact right-aligned pill controls. Use a 20px container radius where the local bar is floated over the page, with #d6d6d6 as the hairline boundary.

### Outlined Explore Pill
**Role:** Secondary product-navigation control

Use transparent fill, #1d1d1f text, a 1px #86868b outline, and a 9999px radius. Set compact SF Pro Text 12px/400 type with 16px line height; do not give this secondary control a colored fill.

### Pricing Blue Pill
**Role:** Filled conversion control

Use #0071e3 fill with #ffffff SF Pro Text 12px/400 at 16px line height and -0.12px tracking. Set a 9999px radius; this blue treatment stays compact inside the product bar and floating pricing callout.

### Hero Product Stage
**Role:** Launch introduction

Set a #ffffff full-bleed visual stage with centered product name in SF Pro Display 21px/600, then an 80px/600 display statement at 84px line height and -1.2px tracking. Place the foldable-device render directly beneath the text without a containing card.

### Floating Pricing Callout
**Role:** Purchase context over product imagery

Float a #ffffff rounded 28px capsule near the lower product render with 14px/600 #1d1d1f pricing text and compact secondary copy. Keep the blue Pricing Blue pill inside the callout; do not use drop shadows.

### Section Anchor Navigation
**Role:** In-page feature navigation

Render a horizontal list of SF Pro Text 17px/500 labels at 25px line height and -0.374px tracking in #1d1d1f. Use transparent backgrounds, 28px vertical padding, and no card or underline treatment.

### Highlights Stage
**Role:** Feature-carousel section

Use #f5f5f7 as the full section background, with a large #1d1d1f section heading and an Apple Blue text link aligned opposite it. Feature slides are #ffffff 28px-radius cards with no shadow.

### Feature Media Card
**Role:** Product-detail showcase

Use a #ffffff surface, 28px radius, no border, and no shadow. Center the device render with an SF Pro Display 24px/600 or 40px/600 feature statement above it; media may crop beyond the card edge.

### Carousel Playback Control
**Role:** Highlights media control

Use a translucent control track based on rgba(210,210,215,0.64), 36px radius, and subdued rgba(0,0,0,0.56) glyphs. Keep slide dots and pause control grouped in a small pill rather than adding visible card chrome.

### Editorial Feature Block
**Role:** Long-form product story

Place a small #1d1d1f SF Pro Display kicker above a large left-aligned display statement, followed by SF Pro Text 17px/400 body copy at approximately 21px line height and -0.374px tracking. The accompanying hardware image is oversized and allowed to enter from the opposite side.

### Rounded Search Input
**Role:** Global navigation search

Use #ffffff fill, #1d1d1f 13px Arial text, 24px left padding, 45px right padding, a 1px #86868b outline, and a 980px radius. Keep the default field visually absent until expanded from navigation.

### Launch Status Label
**Role:** New-product annotation

Use #b64400 SF Pro Text 12px/600 with 16px line height and -0.12px tracking. Leave it as plain text with no pill background or border.

## Do's and Don'ts

### Do
- Use #ffffff as the default product-story canvas and reserve #f5f5f7 for full-width feature bands and footer regions.
- Set display hero statements in SF Pro Display 80px/600, 84px line height, and -1.2px tracking.
- Use SF Pro Text 17px/400 with -0.374px tracking for feature paragraphs and in-page navigation at 17px/500.
- Use 28px radius for feature cards and contained media; keep those cards shadowless.
- Use #0071e3 only for compact filled conversion pills with #ffffff 12px SF Pro Text.
- Use #0066cc for inline links and textual section links rather than turning every navigation item blue.
- Space major storytelling sections by 90px and use 20px gaps between related interface elements.

### Don't
- Do not add gradients; product imagery supplies the page’s color and visual depth.
- Do not use shadows on feature cards, editorial blocks, or floating pricing capsules.
- Do not replace the 28px feature-card radius with 8px, 12px, or square corners.
- Do not use #0071e3 as a large hero background or a universal filled button color.
- Do not set hero headlines in bold 700 or wider tracking than -1.2px at 80px.
- Do not introduce colored status pills for launch labels; use bare #b64400 12px text.
- Do not place dense boxed UI panels over the product renders; keep #ffffff space around hardware imagery.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Gallery White | `#ffffff` | Primary hero, editorial canvas, local navigation, and feature-card surface. |
| 1 | Studio Mist | `#f5f5f7` | Alternate section band, carousel backdrop, muted content area, and footer. |
| 2 | Paper Frost | `#fafafc` | Opened global-navigation layer. |
| 3 | Control Gray | `#e6e6e8` | Disabled or subdued utility-control fill and thin navigation edge. |

## Elevation

Surfaces gain separation through #ffffff against #f5f5f7, 28px media corners, and sparse 1px #d6d6d6 edges rather than cast shadows. The only elevation-like marks are 0 0 0 1px outlines on navigation and selected controls.

## Imagery

The page is dominated by high-resolution product photography and device renders rather than illustration. Hardware is isolated against pure white or warm neutral image backdrops, often cropped at an oversized scale so the fold and thin profile become the composition; hands appear in the hero to demonstrate physical scale. Images are either edge-free on the white hero canvas or contained in large 28px-radius white cards against #f5f5f7. Product UI appears inside device screens as explanatory evidence, while icons remain small, monochrome global-navigation glyphs.

## Layout

The page begins with a compact global store navigation above a product-local navigation bar, then opens into a centered white hero with stacked product label, oversized headline, preorder copy, a dominant foldable-phone render, and a floating pricing capsule. Storytelling proceeds through a light-gray #f5f5f7 highlights band with a horizontally advancing set of large white 28px-radius media cards, followed by wide white editorial sections that pair left-aligned text blocks with oversized product imagery entering from the right or below. Section headers introduce each chapter, while an in-page horizontal anchor navigation supports long-form scrolling; the page is spacious, image-led, and does not rely on visible grid lines or conventional card stacks.

## Agent Prompt Guide

Quick Color Reference:
- Gallery White: #ffffff — Primary page canvas, hero background, product story sections, and feature-card surfaces
- Studio Mist: #f5f5f7 — Alternate full-width section background, feature-stage backdrop, footer surface, and muted content blocks
- Paper Frost: #fafafc — Opened global-navigation surface and secondary pale fill
- Hairline Silver: #d6d6d6 — 1px dividers, restrained control outlines, and subtle separators
- Control Gray: #e6e6e8 — Disabled control fills, subdued utility surfaces, and single-pixel navigation edge treatment
- Ink: #1d1d1f — Headlines, primary body copy, navigation labels, and dark utility icons
- Slate: #707070 — Secondary copy, legal text, subdued navigation content, and low-emphasis glyphs
- Steel: #86868b — Input outlines, inactive indicators, and fine outlined-control edges
- Apple Blue: #0066cc — Inline links, section links, and blue text controls — a precise blue punctuation against monochrome product storytelling
- Pricing Blue: #0071e3 — Filled pricing and learn-more controls — the brighter blue reserves visual urgency for compact conversion moments
- Launch Orange: #b64400 — Small launch-status labels such as new-product markers

Create a #ffffff launch hero with centered SF Pro Display 21px/600 product label and a centered 80px/600, 84px-line-height headline in Ink (#1d1d1f); place an oversized foldable-device render directly below with no enclosing card.
Create a Product Local Navigation bar with an SF Pro Display 19px/600 Ink product title, an outlined Explore Pill, and a Pricing Blue (#0071e3) 9999px-radius pricing pill using #ffffff SF Pro Text 12px/400.
Create a Studio Mist (#f5f5f7) highlights section with an Ink heading and Apple Blue (#0066cc) text link; use a #ffffff 28px-radius feature media card with no shadow and an SF Pro Display 40px/600 feature statement.
Create a white editorial product section with a left-aligned Ink feature statement and SF Pro Text 17px/400 body copy at 21px line height and -0.374px tracking; crop a large product photograph into the right side.
Create a floating #ffffff 28px-radius pricing callout over a product render using Ink 14px/600 pricing copy and a compact Pricing Blue 9999px-radius pill.

## Similar Brands

- **Google Pixel** — Product-led landing pages pair isolated hardware renders with generous white space and compact blue conversion controls.
- **Sony** — Large hardware photography and restrained editorial feature chapters make the product, rather than decorative interface chrome, carry the page.
- **Nothing** — Uses oversized device imagery and sparse product storytelling, though Apple’s palette is more monochrome and its controls are smaller.
- **Tesla** — Full-width product visual stages and minimal surrounding UI create a similarly showroom-like conversion flow.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-gallery-white: #ffffff;
  --color-studio-mist: #f5f5f7;
  --color-paper-frost: #fafafc;
  --color-hairline-silver: #d6d6d6;
  --color-control-gray: #e6e6e8;
  --color-ink: #1d1d1f;
  --color-slate: #707070;
  --color-steel: #86868b;
  --color-apple-blue: #0066cc;
  --color-pricing-blue: #0071e3;
  --color-launch-orange: #b64400;

  /* Typography — Font Families */
  --font-sf-pro-display: 'SF Pro Display', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-sf-pro-text: 'SF Pro Text', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-arial: 'Arial', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-global-nav: 12px;
  --leading-global-nav: 1;
  --tracking-global-nav: -0.12px;
  --text-compact-control: 12px;
  --leading-compact-control: 1.33;
  --tracking-compact-control: -0.12px;
  --text-body-small: 14px;
  --leading-body-small: 1.29;
  --tracking-body-small: -0.224px;
  --text-body: 17px;
  --leading-body: 1.47;
  --tracking-body: -0.374px;
  --text-feature-copy: 17px;
  --leading-feature-copy: 1.24;
  --tracking-feature-copy: -0.374px;
  --text-product-nav-title: 19px;
  --leading-product-nav-title: 1.21;
  --tracking-product-nav-title: 0.228px;
  --text-product-kicker: 21px;
  --leading-product-kicker: 1;
  --tracking-product-kicker: 0.231px;
  --text-feature-heading: 40px;
  --leading-feature-heading: 1;
  --tracking-feature-heading: 0px;
  --text-hero-display: 80px;
  --leading-hero-display: 1.05;
  --tracking-hero-display: -1.2px;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-52: 52px;
  --spacing-64: 64px;
  --spacing-76: 76px;
  --spacing-80: 80px;
  --spacing-128: 128px;
  --spacing-144: 144px;

  /* Layout */
  --section-gap: 90px;
  --card-padding: 28px;
  --element-gap: 20px;

  /* Border Radius */
  --radius-md: 4px;
  --radius-lg: 10px;
  --radius-2xl: 20px;
  --radius-3xl: 28px;
  --radius-3xl-2: 32px;
  --radius-3xl-3: 36px;
  --radius-full: 120px;
  --radius-full-2: 170px;
  --radius-full-3: 980px;
  --radius-full-4: 999px;
  --radius-full-5: 9999px;

  /* Named Radii */
  --radius-cards: 28px;
  --radius-links: 10px;
  --radius-pills: 36px;
  --radius-badges: 0px;
  --radius-images: 28px;
  --radius-inputs: 980px;
  --radius-buttons: 9999px;
  --radius-navigation: 20px;

  /* Shadows */
  --shadow-subtle: rgb(230, 230, 232) 0px 0px 0px 1px;
  --shadow-subtle-2: rgb(134, 134, 139) 0px 0px 0px 1px;

  /* Surfaces */
  --surface-gallery-white: #ffffff;
  --surface-studio-mist: #f5f5f7;
  --surface-paper-frost: #fafafc;
  --surface-control-gray: #e6e6e8;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-gallery-white: #ffffff;
  --color-studio-mist: #f5f5f7;
  --color-paper-frost: #fafafc;
  --color-hairline-silver: #d6d6d6;
  --color-control-gray: #e6e6e8;
  --color-ink: #1d1d1f;
  --color-slate: #707070;
  --color-steel: #86868b;
  --color-apple-blue: #0066cc;
  --color-pricing-blue: #0071e3;
  --color-launch-orange: #b64400;

  /* Typography */
  --font-sf-pro-display: 'SF Pro Display', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-sf-pro-text: 'SF Pro Text', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-arial: 'Arial', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-global-nav: 12px;
  --leading-global-nav: 1;
  --tracking-global-nav: -0.12px;
  --text-compact-control: 12px;
  --leading-compact-control: 1.33;
  --tracking-compact-control: -0.12px;
  --text-body-small: 14px;
  --leading-body-small: 1.29;
  --tracking-body-small: -0.224px;
  --text-body: 17px;
  --leading-body: 1.47;
  --tracking-body: -0.374px;
  --text-feature-copy: 17px;
  --leading-feature-copy: 1.24;
  --tracking-feature-copy: -0.374px;
  --text-product-nav-title: 19px;
  --leading-product-nav-title: 1.21;
  --tracking-product-nav-title: 0.228px;
  --text-product-kicker: 21px;
  --leading-product-kicker: 1;
  --tracking-product-kicker: 0.231px;
  --text-feature-heading: 40px;
  --leading-feature-heading: 1;
  --tracking-feature-heading: 0px;
  --text-hero-display: 80px;
  --leading-hero-display: 1.05;
  --tracking-hero-display: -1.2px;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-52: 52px;
  --spacing-64: 64px;
  --spacing-76: 76px;
  --spacing-80: 80px;
  --spacing-128: 128px;
  --spacing-144: 144px;

  /* Border Radius */
  --radius-md: 4px;
  --radius-lg: 10px;
  --radius-2xl: 20px;
  --radius-3xl: 28px;
  --radius-3xl-2: 32px;
  --radius-3xl-3: 36px;
  --radius-full: 120px;
  --radius-full-2: 170px;
  --radius-full-3: 980px;
  --radius-full-4: 999px;
  --radius-full-5: 9999px;

  /* Shadows */
  --shadow-subtle: rgb(230, 230, 232) 0px 0px 0px 1px;
  --shadow-subtle-2: rgb(134, 134, 139) 0px 0px 0px 1px;
}
```

## Tema escuro

Acréscimo ao documento original, que só descreve o tema claro. Os nomes abaixo são os nomes neutros
de `apps/web/src/styles/tokens.css`, que é a fonte dos valores.

### Regra para as próximas telas

- **Toda tela nova nasce nos dois temas**: o claro exatamente como está hoje e o escuro.
- O tema claro não muda. O escuro redefine os **mesmos** tokens sob `:root[data-theme="dark"]`; nenhum
  componente escolhe cor por tema (nada de `dark:` nem de cor condicional no código). Quem usa só
  tokens já funciona nos dois.
- As variáveis do HeroUI apontam para os tokens (`styles/index.css`), então os componentes dele
  acompanham sozinhos. O atributo fica no `<html>`, para valer também no que é desenhado fora da
  árvore da tela (dicas, popovers).
- Como no claro: sem gradiente e sem sombra projetada; no máximo contorno de 1px.

### Tokens

| Token | Papel | Claro | Escuro |
|-------|-------|-------|--------|
| `--color-canvas` | cartões e painéis; fundo padrão no claro | `#ffffff` | `#1c1c1e` |
| `--color-mist` | fundo da sala, faixa alternada, blocos discretos | `#f5f5f7` | `#0e0e10` |
| `--color-frost` | camada flutuante (dicas, popovers) | `#fafafc` | `#242426` |
| `--color-control` | trilho de abas, avatar, controle desabilitado | `#e6e6e8` | `#2e2e31` |
| `--color-hairline` | divisores de 1px | `#d6d6d6` | `#3a3a3d` |
| `--color-outline` | contorno de campo e de controle | `#86868b` | `#8e8e93` |
| `--color-ink` | títulos e corpo | `#1d1d1f` | `#f5f5f7` |
| `--color-muted` | texto secundário | `#707070` | `#a8a8ad` |
| `--color-link` | links em texto | `#0066cc` | `#5eadff` |
| `--color-accent` | botão preenchido, pílula de lotação, anel de foco | `#0071e3` | `#3d9bff` |
| `--color-on-accent` | texto e ícone sobre `accent` | `#ffffff` | `#06121f` |
| `--color-notice` | aviso e erro em texto puro | `#b64400` | `#ff9d4d` |
| `--color-stage` | fundo atrás do vídeo e etiquetas sobre ele | `#1d1d1f` | `#000000` |
| `--color-on-stage` | texto sobre `stage` | `#ffffff` | `#ffffff` |
| `--shadow-outline-soft` | contorno suave de 1px | 1px `control` | 1px `control` |
| `--shadow-outline` | contorno de 1px | 1px `outline` | 1px `outline` |

`stage` e `on-stage` existem porque o vídeo fica sobre fundo escuro nos dois temas; no claro valem o
mesmo que `ink` e `canvas`. Os dois contornos são escritos a partir de `control` e `outline`, por isso
acompanham o tema sem valor próprio.

### Onde vale e onde fica o botão

- Por enquanto **só dentro da sala** (conectado e reconectando). Página inicial, tela de entrada e as
  telas de erro, sala acabou, cheia, removido e banido ficam sempre no claro.
- O botão de alternar fica no topo da sala, à direita, ao lado do botão de sair: ícone de lua (ir para
  o escuro) ou de sol (voltar ao claro), cor neutra (`canvas` + contorno suave), com rótulo acessível e
  dica. Ele não aparece fora da sala.
- Padrão: claro. O tema do sistema não é seguido. A escolha fica guardada no navegador
  (`localStorage`, chave `sualive:theme`) e é aplicada ao entrar numa sala; ao sair, a interface volta
  ao claro.

### Contraste

- Texto e ícones com significado: pelo menos **4,5:1** sobre a superfície em que aparecem (AA).
  Contorno de campo e anel de foco: pelo menos **3:1**.
- Cor nunca é o único sinal de um estado: o ícone, o texto ou o anel mudam junto.
- Ao mudar um valor da tabela, refaça a conta dos pares abaixo (luminância relativa da WCAG 2).

| Par (texto sobre fundo) | Claro | Escuro |
|-------------------------|-------|--------|
| `ink` sobre `canvas` | 16,8:1 | 15,6:1 |
| `ink` sobre `mist` | 15,5:1 | 17,7:1 |
| `ink` sobre `frost` (dica) | 16,1:1 | 14,2:1 |
| `ink` sobre `control` | 13,5:1 | 12,4:1 |
| `muted` sobre `canvas` | 5,0:1 | 7,2:1 |
| `muted` sobre `mist` | 4,6:1 | 8,1:1 |
| `muted` sobre `control` | 4,0:1 | 5,7:1 |
| `link` sobre `canvas` | 5,6:1 | 7,2:1 |
| `on-accent` sobre `accent` | 4,7:1 | 6,6:1 |
| `accent` sobre `mist` (botão e anel de foco) | 4,3:1 | 6,7:1 |
| `accent` sobre `canvas` | 4,7:1 | 5,9:1 |
| `notice` sobre `canvas` | 5,5:1 | 8,3:1 |
| `outline` sobre `canvas` (contorno de campo) | 3,6:1 | 5,2:1 |
| `canvas` sobre `ink` (botão invertido) | 16,8:1 | 15,6:1 |
| `on-stage` sobre `stage` a 70% (pior caso: vídeo branco atrás) | 6,2:1 | 8,5:1 |

No claro, `muted` sobre `control` (aba não selecionada, em telas pequenas) fica em 4,0:1: é do tema
original e não foi alterado. No escuro todos os pares de texto passam de 4,5:1.

### Decisões do dono que superam o texto original

- Os botões de ação da sala (microfone, câmera, tela, mão, reagir, copiar link) são **pílulas azuis
  preenchidas** (`accent` com `on-accent`), apesar de o texto original reservar o azul preenchido a
  controles compactos de conversão. Sair e alternar tema ficam neutros, no topo.
- A lotação da sala (por exemplo `3/6`) é uma **pílula azul** (`accent` com `on-accent`), apesar de o
  texto original pedir rótulos de estado sem pílula colorida.

### Temas de sala

O dono Plus escolhe um entre 6 temas prontos para a sala de link fixo dele; vale para todos na sala.
Os valores ficam em `apps/web/src/styles/room-themes.css`, sob `data-room-theme` no `<html>` (só com
a sala na tela), e combinam com o claro e o escuro, que continuam sendo escolha de cada pessoa.

- Um tema **redefine os mesmos tokens**, nunca cria outros: `canvas`, `mist`, `frost`, `control`,
  `hairline`, `outline`, `muted`, `link`, `accent` e `notice` (no escuro, também `on-accent`).
  `ink`, `stage`, `on-stage` e, no claro, `on-accent` não mudam.
- `default` (Padrão) não redefine nada: é exatamente a tabela de tokens acima.
- Sem gradiente e sem sombra; o "fundo" do tema é o `mist` da sala. Não existe editor de temas.

| Tema | Claro: `mist` / `canvas` / `accent` | Escuro: `mist` / `canvas` / `accent` |
|------|--------------------------------------|---------------------------------------|
| `default` Padrão | `#f5f5f7` / `#ffffff` / `#0071e3` | `#0e0e10` / `#1c1c1e` / `#3d9bff` |
| `ocean` Oceano | `#e3eff9` / `#f6fafe` / `#0b62ad` | `#07111b` / `#10202f` / `#4aa8ff` |
| `forest` Floresta | `#e6f2e8` / `#f7fbf7` / `#1f7a3d` | `#08130b` / `#122117` / `#52c477` |
| `sunset` Pôr do sol | `#fbece1` / `#fffaf6` / `#b3461a` | `#170c07` / `#281810` / `#ff9259` |
| `lavender` Lavanda | `#eee9fa` / `#fbf9ff` / `#6843c0` | `#0e0a18` / `#1b1629` / `#a487ff` |
| `graphite` Grafite | `#e2e3e6` / `#f3f4f5` / `#3a3d44` | `#050506` / `#141416` / `#aeb2ba` |

Contraste (mesma conta da seção acima), pior par de cada tema novo, claro / escuro:

| Par | Oceano | Floresta | Pôr do sol | Lavanda | Grafite |
|-----|--------|----------|------------|---------|---------|
| `ink` sobre `control` | 12,7 / 10,8 | 12,7 / 11,3 | 12,5 / 12,2 | 11,8 / 12,7 | 11,1 / 13,7 |
| `muted` sobre `mist` | 5,1 / 9,1 | 5,3 / 9,4 | 5,4 / 9,4 | 5,6 / 9,0 | 5,4 / 8,6 |
| `muted` sobre `control` | 4,5 / 5,6 | 4,6 / 6,1 | 4,6 / 6,5 | 4,7 / 6,4 | 4,6 / 6,3 |
| `link` sobre `mist` | 6,1 / 9,3 | 5,7 / 10,4 | 5,8 / 10,4 | 6,8 / 8,6 | 5,7 / 11,2 |
| `on-accent` sobre `accent` | 6,2 / 7,5 | 5,4 / 8,5 | 5,5 / 8,5 | 6,7 / 6,9 | 10,9 / 8,7 |
| `accent` sobre `mist` (anel de foco) | 5,3 / 7,5 | 4,7 / 8,6 | 4,8 / 8,7 | 5,6 / 7,0 | 8,5 / 9,6 |
| `notice` sobre `mist` | 5,6 / 9,2 | 5,7 / 9,2 | 5,6 / 9,3 | 5,5 / 9,5 | 5,1 / 9,9 |
| `outline` sobre `mist` (contorno) | 3,3 / 6,6 | 3,4 / 6,8 | 3,5 / 6,7 | 3,7 / 6,2 | 3,7 / 6,2 |

Todos os pares de texto dos temas novos passam de 4,5:1 nos dois modos (inclusive `muted` sobre
`control`, que no Padrão claro fica em 4,0:1), e os contornos passam de 3:1.
