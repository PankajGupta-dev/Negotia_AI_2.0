---
name: Ink & Amber Editorial Terminal
colors:
  surface: '#161311'
  surface-dim: '#161311'
  surface-bright: '#3c3836'
  surface-container-lowest: '#100e0c'
  surface-container-low: '#1e1b19'
  surface-container: '#221f1d'
  surface-container-high: '#2d2927'
  surface-container-highest: '#383432'
  on-surface: '#e9e1dd'
  on-surface-variant: '#dbc2b0'
  inverse-surface: '#e9e1dd'
  inverse-on-surface: '#33302d'
  outline: '#a38c7c'
  outline-variant: '#554336'
  surface-tint: '#ffb77d'
  primary: '#ffb77d'
  on-primary: '#4d2600'
  primary-container: '#d97707'
  on-primary-container: '#432100'
  inverse-primary: '#904d00'
  secondary: '#8bd79b'
  on-secondary: '#003918'
  secondary-container: '#005829'
  on-secondary-container: '#81cc90'
  tertiary: '#ffb4ac'
  on-tertiary: '#690007'
  tertiary-container: '#f55e55'
  on-tertiary-container: '#5c0005'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdcc3'
  primary-fixed-dim: '#ffb77d'
  on-primary-fixed: '#2f1500'
  on-primary-fixed-variant: '#6e3900'
  secondary-fixed: '#a6f4b5'
  secondary-fixed-dim: '#8bd79b'
  on-secondary-fixed: '#00210b'
  on-secondary-fixed-variant: '#005226'
  tertiary-fixed: '#ffdad6'
  tertiary-fixed-dim: '#ffb4ac'
  on-tertiary-fixed: '#410002'
  on-tertiary-fixed-variant: '#8e1214'
  background: '#161311'
  on-background: '#e9e1dd'
  surface-variant: '#383432'
typography:
  display-lg:
    fontFamily: EB Garamond
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: EB Garamond
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.01em
  headline-xl:
    fontFamily: EB Garamond
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: EB Garamond
    fontSize: 28px
    fontWeight: '500'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: EB Garamond
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.02em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.06em
  contract-clause:
    fontFamily: EB Garamond
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: 0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-base: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
  space-3xl: 4rem
  gutter-mobile: 1rem
  gutter-desktop: 1.5rem
  terminal-rail-width: 4.5rem
  sidebar-width: 20rem
  document-max-width: 54rem
---

## Brand & Style

This design system establishes an "Ink & Amber" aesthetic tailored for high-stakes legal contract analysis and autonomous negotiation. It bridges the authoritative quietude of rare-book jurisprudence with the focused density of a modern computational terminal. 

The personality is scholarly yet rapid, resolute, and tactile. It replaces sterile enterprise blue palettes with warm mineral darks, parchment creams, and luminous wax-seal amber accents. The interface is engineered to evoke deep legal trust, acute intellectual focus, and precision. It avoids juvenile bubbly motifs, ultra-rounded pills, and decorative gradients, favoring instead hairline rulings, crisp architectural grids, and editorial restraint.

## Colors

The color system operates across two co-existing textural planes: the **Dark Ink Terminal** (primary chrome, tool rails, navigation, and live negotiation feeds) and the **Parchment Canvas** (document viewer, clause comparison, and review workspaces).

### Dark Ink Palette (Chrome & Navigation)
- **Ink Surface Primary**: `#1C1917` (Stone-900 / Warm Charcoal)
- **Ink Surface Secondary**: `#292524` (Stone-800 / Raised Panel)
- **Dark Hairline Border**: `#44403C` (Stone-700 / 1px Ruled Dividers)
- **Dark Text Primary**: `#F5F1E8`
- **Dark Text Muted**: `#A8A29E`

### Parchment Palette (Legal Workspace & Document Canvas)
- **Parchment Primary**: `#F5F1E8` (Warm Legal Cream)
- **Parchment Secondary**: `#EDE7DC` (Recessed Work Surface)
- **Parchment Paper Highlight**: `#FFFFFF` (Document Folio Base)
- **Parchment Hairline Border**: `#D6CEBE` (Stone/Parchment Edge)
- **Parchment Text Primary**: `#1C1917` (Deepest Charcoal Ink)
- **Parchment Text Body**: `#44403C` (Drafting Ink)
- **Parchment Text Muted**: `#78716C` (Secondary Notes / Metadata)

### Semantic & Accents
- **Amber Primary (Action / Wax Seal)**: `#D97706` (Burnt Amber); Hover: `#B45309`; Subtle Tint: `#FEF3C7` (Light Mode) or `#451A03` (Dark Mode).
- **Safe / Approved / Low Risk**: `#166534` (Forest Green); Light Tint: `#DCFCE7`; Dark Tint: `#052E16`.
- **Conflict / Redline / High Risk**: `#991B1B` (Rust Carmine); Light Tint: `#FEE2E2`; Dark Tint: `#450A0A`.
- **Caution / Flagged**: `#D97706`.

## Typography

The typographic hierarchy implements an editorial split:
1. **Headlines, Key Clauses & Milestone Summaries (`EB Garamond`)**: Conveys classical legal authority, judicial stature, and clear reading cadence. All contract clauses presented for review are set in `contract-clause` to encourage deliberate, high-comprehension review.
2. **UI Controls, Navigation, and General Body (`Plus Jakarta Sans`)**: Provides clarity, crisp legibility, and geometric sharpness across dense tables, clause trees, and metadata sidebars.
3. **Data Points, Timestamps, Clause References, and Risk Badges (`JetBrains Mono`)**: Introduces terminal-grade precision for technical indices like `§ 14.2(b)`, token usage, confidence metrics, and audit timestamps.

## Layout & Spacing

The layout is architected around a multi-panel workspace:
- **Leftmost Terminal Rail (`terminal-rail-width`)**: Fixed utility strip containing high-level workspace switches and platform state indicators.
- **Navigation / Clause Outline Drawer (`sidebar-width`)**: Collapsible panel with structured tree hierarchy of contract sections, risk levels, and negotiation stages.
- **Center Document Folio (`document-max-width`)**: Parchment canvas with generous 48px horizontal margins mimicking classical legal document briefs.
- **Right Negotiation Terminal (Adaptive 320px–420px)**: Live AI copilot dialogue, redline comparison engine, and fallback rule configurators.

### Breakpoints & Responsive Behavior
- **Desktop Wide (≥1440px)**: 3-panel split view active simultaneously (Clause Index, Parchment Canvas, Negotiation Terminal).
- **Desktop / Laptop (1024px – 1439px)**: 2-panel view; the Clause Index collapses into a slide-over panel.
- **Tablet / Mobile (<1024px)**: Stacked tabbed interface switching between "Document", "Negotiation AI", and "Risk Ledger".

## Elevation & Depth

This design system avoids soft multi-layered drop shadows in favor of **structural hairlines, inset parchment borders, and tonal layering**.

- **Surface Tiering**:
  - `Level 0 (App Canvas)`: `#1C1917` (Dark Ink Base) or `#EDE7DC` (Recessed Parchment Floor).
  - `Level 1 (Panels & Sheets)`: Raised with a 1px solid border (`#44403C` on dark, `#D6CEBE` on parchment).
  - `Level 2 (Popovers & Modals)`: Solid `#292524` or `#FFFFFF` backed by a sharp, dense ambient shadow: `0 8px 24px -4px rgba(28, 25, 23, 0.35)`.
- **The Legal Pad Divider**: Horizontal section separators use crisp 1px borders paired with an optional 1px offset highlight, creating a bookbinding groove rather than a blurry elevation gradient.

## Shapes

The design system adheres to a strict maximum radius of 4px to 6px (`roundedness: 1`). 

- Standard interactive components (buttons, input fields, cards, select dropdowns) utilize `rounded` (4px).
- Modals, popovers, and primary work folios utilize `rounded-lg` (6px).
- Status chips and risk counters utilize `rounded-sm` (2px).
- The single circular exception is the **Copilot Wax Seal Emblem**, a complete circle (`rounded-full`) reserved strictly for the AI agent indicator badge and digital signature verification stamps.

## Components

### Buttons
- **Primary (Burnt Amber)**: Background `#D97706`, text `#FFFFFF`, border 1px solid `#B45309`, radius 4px, font `Plus Jakarta Sans` SemiBold (13px). Hover: `#B45309`.
- **Secondary Dark (Terminal Chrome)**: Background `#292524`, text `#F5F1E8`, border 1px solid `#44403C`. Hover: `#44403C`.
- **Secondary Parchment (Document Mode)**: Background `#EDE7DC`, text `#1C1917`, border 1px solid `#D6CEBE`. Hover: `#E2DACD`.
- **Ghost / Action Link**: Transparent background, text `#D97706`, underlined on hover with a 1px solid amber line.

### Status Chips & Badges
- **Shape**: 2px corner radius, padding 2px 6px, font `JetBrains Mono` (10px, uppercase, tracking +0.06em).
- **Approved / Low Risk**: Background `#DCFCE7`, text `#166534`, border 1px solid `#86EFAC`. Dark mode variant: Background `#052E16`, text `#4ADE80`, border `#166534`.
- **High Risk / Redline**: Background `#FEE2E2`, text `#991B1B`, border 1px solid `#FCA5A5`. Dark mode variant: Background `#450A0A`, text `#F87171`, border `#991B1B`.
- **In Negotiation**: Background `#FEF3C7`, text `#B45309`, border 1px solid `#FCD34D`. Dark mode variant: Background `#451A03`, text `#FBBF24`, border `#78350F`.

### Form Controls (Inputs, Checkboxes, Radios)
- **Input Fields**: 4px radius, 1px solid border (`#44403C` dark, `#D6CEBE` light). Background `#1C1917` (dark) or `#FFFFFF` (parchment). Focus ring: 1px solid `#D97706` without outer glow.
- **Checkboxes & Radios**: Angular 2px radius for checkboxes, crisp circles for radios. Checked state is deep amber `#D97706` with sharp white markers.

### Cards & Panels
- Cards maintain zero blur. Visual separation is accomplished exclusively through background contrast (`#292524` over `#1C1917`) and the 1px hairline border. Header strips within cards feature a 1px solid bottom hairline divider.

### AI Copilot Wax-Seal Emblem
- A 24px or 32px circular medallion (`rounded-full`) in `#D97706` featuring an embossed monogram or quill/scales icon in `#FEF3C7`. When AI is processing or actively redlining, it radiates a slow, stepped 1px border ring pulse rather than a blur halo.

### Redline Diff Block
- **Deletion (Opposing Counsel/Removed)**: Background `#FEE2E2` with strike-through text in `#991B1B` and 1px left accent bar.
- **Insertion (Negotia Proposal)**: Background `#DCFCE7` with underline text in `#166534` and 1px left accent bar.