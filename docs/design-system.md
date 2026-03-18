# Design System

Reference: Anthropic.com "Warm Editorial" aesthetic.

## Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#faf9f5` | Page background (warm off-white, never pure `#fff`) |
| Foreground | `#141413` | Primary text (near-black, never pure `#000`) |
| Muted | `#b0aea5` | Secondary text, captions |
| Border | `#e8e6dc` | Section dividers, card borders |
| Primary | `#d97757` | Terracotta orange — CTAs, accent |
| Secondary | `#6a9bcc` | Cool blue — links, info states |
| Tertiary | `#788c5d` | Olive green — success, tags |

## Typography

| Role | Family | Notes |
|------|--------|-------|
| Headings | Space Grotesk | Sans-serif, `font-display` |
| Body | Lora / system serif | Serif, `font-serif` |
| UI labels | Space Grotesk | Uppercase + tracking for non-CJK; normal case for CJK |

Title and body **must** be a sans + serif pairing.

## Layout

- Content max-width: `1200px` (`max-w-content` in Tailwind config)
- Prose column: `≤720px`
- Section spacing: `80–128px`
- Generous whitespace — when in doubt, add more

## Motion

- **Allowed**: `fade-in` + `translate-up`, duration `300–600ms`, `ease-out`
- **Forbidden**: bounce, spring, parallax scrolling, particle effects

## Forbidden Styles

- Blue-purple gradients, neon glows
- Heavy drop-shadow cards
- Pure white `#ffffff` backgrounds
- Inter / Roboto / generic sans-serif
- "Generic AI" look: dark backgrounds + blue glow + tech aesthetic
- Tailwind arbitrary values (e.g. `w-[256px]`) — extend config instead
