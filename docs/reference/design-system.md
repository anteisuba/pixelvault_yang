# Design System

Two surface modes coexist in PixelVault:

- **Editorial surfaces** (Studio, Gallery, Auth, Account) — Anthropic.com "Warm Editorial" aesthetic
- **Marketing surfaces** (Homepage, landing pages) — Krea-style minimal, near-white, single-sans

## Color Palette

| Token      | Hex       | Editorial Usage                              | Marketing Usage                            |
| ---------- | --------- | -------------------------------------------- | ------------------------------------------ |
| Background | `#faf9f5` | Default page background (warm off-white)     | Pure `#fff` is allowed for crisper hero    |
| Foreground | `#141413` | Primary text (near-black, never pure `#000`) | Also used as **primary CTA background**    |
| Muted      | `#b0aea5` | Secondary text, captions                     | Same                                       |
| Border     | `#e8e6dc` | Section dividers, card borders               | Same                                       |
| Primary    | `#d97757` | Terracotta orange — accent, brand mark       | Brand accent only — **not** main CTA color |
| Secondary  | `#6a9bcc` | Cool blue — links, info states               | Same                                       |
| Tertiary   | `#788c5d` | Olive green — success, tags                  | Same                                       |

CTA hierarchy on marketing pages: **black pill (`#141413`) for primary**, outline + warm-white for secondary. The terracotta accent stays for brand mark, badges, and editorial surfaces.

## Typography

| Role      | Family              | Editorial                  | Marketing                                |
| --------- | ------------------- | -------------------------- | ---------------------------------------- |
| Headings  | Space Grotesk       | Sans-serif, `font-display` | Same, but tighter tracking, larger scale |
| Body      | Lora / system serif | Serif, `font-serif`        | **Single sans (Space Grotesk) allowed**  |
| UI labels | Space Grotesk       | Uppercase + tracking       | Normal case, no tracking                 |

Editorial surfaces **must** be sans + serif pairing. Marketing surfaces may use single Space Grotesk for a cleaner presentation.

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
- Inter / Roboto / generic sans-serif (use Space Grotesk)
- Dark backgrounds + blue glow + tech aesthetic
- Tailwind arbitrary values (e.g. `w-[256px]`) — extend config instead
