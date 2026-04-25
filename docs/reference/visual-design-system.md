# PixelVault Visual Design System

This document is the **single source of truth** for all visual design decisions in PixelVault.
Any new page, component, or UI change must follow the rules defined here to maintain visual consistency.

---

## 1. Design Philosophy

PixelVault is an **AI creative platform**. The design should:

- Let **generated content (images/videos) be the visual hero** — UI chrome stays minimal
- Feel **premium and modern** without being flashy or distracting
- Use **depth and layering** (glass, shadows, gradients) instead of flat colored blocks
- Maintain a **calm confidence** — clean spacing, intentional typography, restrained color
- Align with industry standards for creative tools (Midjourney, Leonardo.ai, Figma)

---

## 2. Color Palette

### 2.1 Primary — Warm Amber/Orange

The primary color is **warm amber/orange** at oklch hue `~42`. This was chosen for:

- Warm, inviting feel that signals creativity and energy
- Distinctive identity — stands out from the blue/violet AI tool crowd
- Natural, approachable aesthetic for a creative platform

| Token                  | Light Mode                | Dark Mode                |
| ---------------------- | ------------------------- | ------------------------ |
| `--primary`            | `oklch(0.64 0.112 42.3)`  | `oklch(0.7 0.109 43.3)`  |
| `--primary-foreground` | `oklch(0.987 0.004 88.4)` | `oklch(0.18 0.012 52.4)` |

### 2.2 Neutrals

All neutrals carry a **subtle warm tint** (hue 52–84) to harmonize with the primary.

| Token                | Light Mode                | Dark Mode                 |
| -------------------- | ------------------------- | ------------------------- |
| `--background`       | `oklch(0.975 0.008 75.4)` | `oklch(0.19 0.012 52.4)`  |
| `--foreground`       | `oklch(0.245 0.017 58.1)` | `oklch(0.955 0.008 84.1)` |
| `--card`             | `oklch(0.986 0.006 77.5)` | `oklch(0.228 0.013 50.3)` |
| `--muted`            | `oklch(0.949 0.009 76.8)` | `oklch(0.272 0.015 49.7)` |
| `--muted-foreground` | `oklch(0.53 0.017 61.2)`  | `oklch(0.735 0.014 71.1)` |
| `--border`           | `oklch(0.866 0.013 72.7)` | `oklch(1 0 0 / 10%)`      |

### 2.3 Chart/Accent Colors

Used for tags, data visualization, and accent differentiation:

| Token       | Purpose       | Light                     | Dark                      |
| ----------- | ------------- | ------------------------- | ------------------------- |
| `--chart-1` | Primary/amber | `oklch(0.64 0.112 42.3)`  | `oklch(0.7 0.109 43.3)`   |
| `--chart-2` | Blue          | `oklch(0.66 0.065 231.4)` | `oklch(0.69 0.086 231.2)` |
| `--chart-3` | Green         | `oklch(0.61 0.05 146.7)`  | `oklch(0.7 0.072 146.3)`  |
| `--chart-4` | Gold          | `oklch(0.79 0.034 80.7)`  | `oklch(0.76 0.044 79.8)`  |
| `--chart-5` | Rust          | `oklch(0.57 0.04 33.9)`   | `oklch(0.65 0.055 34.7)`  |

### 2.4 Surface Variables

Three levels of elevated surfaces for layering:

```css
--surface-elevated: color-mix(in oklab, var(--card) 92%, var(--background));
--surface-soft: color-mix(in oklab, var(--secondary) 78%, var(--background));
--surface-highlight: color-mix(in oklab, var(--primary) 8%, var(--background));
--page-border: color-mix(in oklab, var(--border) 85%, transparent);
```

### 2.5 Color Rules

- **Never use raw hex or rgb** — always use oklch variables
- **Never hardcode colors** — always use CSS custom properties
- **Primary tints** for interactive accents: `bg-primary/5`, `border-primary/15`, `text-primary`
- **Borders** use lower opacity: `border-border/60` not `border-border`
- **Muted text** uses `var(--muted-foreground)`, never raw gray

---

## 3. Typography

### 3.1 Font Stack

| Role        | Font Family     | CSS Variable     | Usage                                 |
| ----------- | --------------- | ---------------- | ------------------------------------- |
| **Display** | Space Grotesk   | `--font-display` | Headings, hero titles, section titles |
| **Sans**    | Instrument Sans | `--font-sans`    | Body text, UI labels, buttons         |
| **Serif**   | Source Serif 4  | `--font-serif`   | Descriptions, copy, narrative text    |
| **Mono**    | Geist Mono      | `--font-mono`    | Code, timestamps, technical values    |

CJK locales override display and serif fonts:

- Japanese: Noto Sans JP / Noto Serif JP
- Chinese: Noto Sans SC / Noto Serif SC

### 3.2 Typography Scale

| Element           | Class / Style              | Size                              | Weight | Tracking  |
| ----------------- | -------------------------- | --------------------------------- | ------ | --------- |
| Hero title        | `.editorial-title`         | `clamp(2.6rem, 5.5vw, 4.2rem)`    | 500    | `-0.05em` |
| Section title     | `.editorial-section-title` | `clamp(1.5rem, 3vw, 2.2rem)`      | 500    | `-0.04em` |
| Eyebrow label     | `.editorial-eyebrow`       | `0.72rem`                         | 600    | `0.18em`  |
| Body copy (serif) | `.editorial-copy`          | `clamp(1.03rem, 1.65vw, 1.18rem)` | 400    | normal    |
| Nav links         | `text-nav`                 | `0.6875rem`                       | 600    | `0.16em`  |
| Brand name        | `text-brand`               | `1.12rem`                         | 500    | `-0.04em` |
| Metric label      | `.editorial-metric-label`  | `0.7rem`                          | 600    | `0.16em`  |
| Metric value      | `.editorial-metric-value`  | `0.99rem`                         | 400    | normal    |

### 3.3 Typography Rules

- **Display font** (`font-display`): Only for headings and titles. Never for body text.
- **Serif font** (`font-serif`): For descriptive copy, model descriptions, prompts, metric values
- **Sans font** (`font-sans`): Default body, buttons, labels, form elements
- **Eyebrows**: Always `uppercase`, `tracking-[0.18em]`, `font-semibold`, colored `var(--primary)` with `opacity: 0.75–0.85`
- **CJK override**: When `isDenseLocale` is true, eyebrows use `tracking-normal normal-case`
- **Line heights**: Headings `0.95–1.0`, body copy `1.72–1.8`, UI elements `1.0`
- **Title max-width**: Hero titles constrained to `18ch` for natural line breaks
- **text-wrap**: Titles use `balance`, body copy uses `pretty`

---

## 4. Spacing & Layout

### 4.1 Page Layout

```
max-width: 78rem (editorial-container) / 75rem (max-w-content for navbar)
padding-inline: 1rem → 1.5rem (sm) → 2rem (lg)
```

### 4.2 Vertical Rhythm

| Context                      | Gap                                                                  |
| ---------------------------- | -------------------------------------------------------------------- |
| Between sections (container) | `clamp(2.25rem, 3.5vw, 3rem)`                                        |
| Hero internal gap            | `clamp(1.5rem, 3vw, 2rem)`                                           |
| Hero copy internal gap       | `0.85rem`                                                            |
| Inside panels                | `clamp(1.3rem, 2.5vw, 1.8rem)` padding                               |
| Grid gaps                    | `0.85rem` (scene cards), `1.35rem` (feature grid), `gap-5` (gallery) |

### 4.3 Hero Layout

- **Alignment**: `align-items: start` — left copy and right metrics top-aligned, no empty space above titles
- **2-column breakpoint**: `1024px` (lg) — hero becomes side-by-side at tablet landscape
- **Grid columns**: `minmax(0, 1.15fr) minmax(16rem, 0.85fr)`
- **Separator**: 3px gradient line (`primary/40%` → transparent) via `::after` pseudo-element, not a thin border

### 4.4 Metrics Card

- Wrapped in a card: `padding: 1.15rem`, `border-radius: var(--radius-2xl)`, `border: 1px solid var(--page-border)`
- Background: `color-mix(in oklab, var(--card) 60%, var(--background))`
- Internal items separated by `border-bottom: 1px solid var(--page-border)`
- Compact gaps: `0.65rem` between items, `0.25rem` between label and value

### 4.5 Spacing Rules

- Use Tailwind's standard spacing scale — avoid arbitrary values
- Gallery grid uses `columns-1 gap-5 sm:columns-2 xl:columns-3` with masonry layout
- Padding inside panels: `p-5 sm:p-6`
- Section borders: `border-b border-border/70` or `border-border/60`

---

## 5. Surfaces & Depth

### 5.1 Background Treatments

**Body background** — Layered radial + linear gradient:

```css
background:
  radial-gradient(ellipse 80% 50% at 50% -10%, primary/6%, transparent 60%),
  linear-gradient(180deg, primary/3%, transparent 24rem), var(--background);
```

**Page backgrounds** (editorial-page) — Lighter version of the same:

```css
radial-gradient(ellipse 70% 40% at 50% 0%, primary/5%, transparent 60%),
linear-gradient(180deg, primary/2%, transparent 18rem)
```

### 5.2 Card & Panel Styling

| Component         | Border                         | Background             | Shadow                                           |
| ----------------- | ------------------------------ | ---------------------- | ------------------------------------------------ |
| Editorial panel   | `1px solid var(--page-border)` | `surface-elevated/94%` | `0 1px 2px fg/3%, 0 4px 16px fg/2%`              |
| Image card        | `border-border/60`             | `bg-card/84`           | `shadow-sm`, hover: `shadow-lg shadow-primary/5` |
| Inner card (form) | `border-border/50`             | `bg-background/40`     | none                                             |
| Scene card        | `border home-border`           | gradient               | `0 1px 2px fg/3%`, hover: lift + larger shadow   |

### 5.3 Glass Effects

| Element         | Blur                  | Saturation      | Background Opacity |
| --------------- | --------------------- | --------------- | ------------------ |
| Navbar          | `blur-xl`             | `saturate-150`  | `bg-background/80` |
| Mobile tab bar  | `blur-xl`             | `saturate-150`  | `bg-background/80` |
| Homepage header | `blur(16px)`          | `saturate(1.4)` | `bg 82%`           |
| Pill overlays   | `blur(4px)–blur(8px)` | —               | `70–78%`           |

### 5.4 Depth Rules

- **Cards hover up**: `transform: translateY(-1px to -2px)` on hover
- **Shadows scale with hover**: `shadow-sm` → `shadow-lg shadow-primary/5`
- **Never use heavy drop shadows** — keep them subtle and tinted with primary
- **Borders get softer on hover**: from `border-border/60` → `border-primary/20`
- **Image overlays** (badges, play buttons): use `bg-black/50 backdrop-blur-md` for theme independence

---

## 6. Components

### 6.1 Buttons

**Primary button**:

```
bg-primary text-primary-foreground rounded-full
shadow-sm shadow-primary/20
hover: shadow-md shadow-primary/25, bg-primary/90
active: shadow-sm
```

**Outline button**:

```
border border-input bg-background rounded-full
hover: bg-accent, border-primary/20
```

**Pill toggle (active)**:

```
bg-primary text-primary-foreground shadow-sm shadow-primary/20
```

**Pill toggle (inactive)**:

```
border border-border/60 bg-background/50
hover: bg-primary/5, border-primary/20
```

### 6.2 Image Card

- Rounded: `rounded-3xl`
- Image hover: `scale-[1.03]` over `500ms ease-out`
- Card hover: border shifts to `border-primary/20`, shadow grows to `shadow-lg shadow-primary/5`
- Metadata uses `dl` grid with separated label/value rows
- Overlay elements (badges, play buttons) use `bg-black/50 backdrop-blur-md text-white`

### 6.3 Editorial Panel

- `rounded-3xl` with `border var(--page-border)`
- Two-layer box shadow for subtle depth
- Internal sections separated by `border-b border-border/70`
- Section headers: eyebrow + display title + serif copy

### 6.4 Navbar

- Height: `h-14`
- Glass: `bg-background/80 backdrop-blur-xl backdrop-saturate-150`
- Border: `border-b border-border/60`
- Active link indicator: `1.5px` underline in `bg-primary`
- Credits pill: `border-primary/15 bg-primary/5`
- Brand: `font-display text-brand font-medium tracking-brand`

### 6.5 Mobile Tab Bar

- Same glass treatment as Navbar
- Active tab: `text-primary`
- Label: `text-tab` with `tracking-[0.12em] uppercase`

### 6.6 Empty States

```
rounded-3xl border-dashed border-primary/20 bg-primary/3
icon: bg-primary/10 text-primary
```

---

## 7. Motion & Animation

### 7.1 Page Enter Animation

```css
@keyframes fadeReveal {
  from {
    opacity: 0;
    transform: translateY(1.25rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

- Hero copy: `650ms 100ms cubic-bezier(0.16, 1, 0.3, 1)`
- Hero visual: `650ms 250ms` (same easing)
- Hero metrics: `550ms 400ms`
- Sections: scroll-linked via `animation-timeline: view()`

### 7.2 Interaction Transitions

| Interaction                | Duration    | Easing                         |
| -------------------------- | ----------- | ------------------------------ |
| Color changes              | `180–200ms` | `ease`                         |
| Card hover (shadow/border) | `300ms`     | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Image scale on hover       | `500ms`     | `ease-out`                     |
| Button press               | instant     | —                              |
| Nav underline              | `220ms`     | `cubic-bezier(0.4, 0, 0.2, 1)` |

### 7.3 Motion Rules

- Respect `prefers-reduced-motion` — all animations wrapped in media query
- Use `cubic-bezier(0.16, 1, 0.3, 1)` for enter animations (expressive deceleration)
- Use `cubic-bezier(0.4, 0, 0.2, 1)` for state transitions (Material standard)
- Use `ease-out` for hover scaling
- Never animate layout properties (width, height, top, left) — use transform

---

## 8. Responsive Behavior

### 8.1 Breakpoints

| Breakpoint | Token | Usage                                                            |
| ---------- | ----- | ---------------------------------------------------------------- |
| `640px`    | `sm:` | Padding increase, 2-column gallery                               |
| `768px`    | `md:` | Desktop nav visible, mobile tab bar hidden                       |
| `1024px`   | `lg:` | Hero 2-column grid, panel padding increase, side-by-side layouts |
| `1280px`   | `xl:` | 3-column gallery                                                 |

### 8.2 Mobile Adaptations

- Navbar: brand name only (no label/subline)
- Hero: single column, full-width CTA buttons
- Gallery: single column masonry
- Tab bar visible at `< md`
- Content padding: `1rem` minimum

---

## 9. Accessibility

- **Contrast**: All text meets WCAG AA minimum (4.5:1 for normal text)
- **Focus visible**: `ring-4 outline-1` with `ring-ring/10` tint
- **Buttons vs links**: Semantic HTML — buttons for actions, links for navigation
- **Labels**: All form inputs have visible labels or aria-labels
- **Selection**: Custom selection color using `var(--primary) 22%`
- **Tap targets**: Minimum `44px` for mobile interactive elements

---

## 10. Naming Conventions for Styling

### 10.1 CSS Classes

- Editorial system: `.editorial-{element}` (e.g., `.editorial-panel`, `.editorial-title`)
- CSS modules: `styles.{camelCase}` (e.g., `styles.sceneCard`, `styles.heroGrid`)

### 10.2 Tailwind Patterns

- Primary tints: `bg-primary/{opacity}`, `border-primary/{opacity}`, `text-primary`
- Border softening: `border-border/{opacity}` (prefer `60` over `75` or `80`)
- Card backgrounds: `bg-card/{opacity}` (prefer `84`)
- Glass: `bg-background/{opacity} backdrop-blur-xl backdrop-saturate-150`

### 10.3 What NOT to Do

- ❌ `bg-blue-500` — use `bg-primary`
- ❌ `border-gray-200` — use `border-border/60`
- ❌ `text-gray-500` — use `text-muted-foreground`
- ❌ `shadow-lg` without primary tint — use `shadow-lg shadow-primary/5`
- ❌ `bg-foreground text-background` for active toggles — use `bg-primary text-primary-foreground`
- ❌ Arbitrary values like `w-[257px]` — use standard Tailwind tokens
- ❌ `backdrop-blur-md` for nav/tabbar — use `backdrop-blur-xl backdrop-saturate-150`

---

## 11. Adding New Pages

When creating a new page, follow this structure:

```tsx
<div className="editorial-page">
  <div className="editorial-container">
    {/* Hero section */}
    <section className="editorial-hero">
      <div className="editorial-hero-copy">
        <span className="editorial-eyebrow">{eyebrow}</span>
        <h1 className="editorial-title">{title}</h1>
        <p className="editorial-copy max-w-2xl">{description}</p>
        <div className="editorial-actions">{/* Buttons */}</div>
      </div>
      <div className="editorial-metrics">{/* Metric items */}</div>
    </section>

    {/* Content panels */}
    <section className="editorial-panel">
      <div className="editorial-section-head">
        <p className="editorial-eyebrow">{label}</p>
        <h2 className="editorial-section-title">{title}</h2>
        <p className="editorial-section-copy">{description}</p>
      </div>
      {/* Panel content */}
    </section>
  </div>
</div>
```

---

## 12. Changelog

| Date       | Change                                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-26 | Initial design system — warm amber/orange palette, glass effects, shadow depth, editorial typography system                                                       |
| 2026-03-26 | Layout tightening — compact hero spacing, top-aligned hero grid, metrics card with background, gradient separator, hero 2-col at lg (1024px), reduced title sizes |
