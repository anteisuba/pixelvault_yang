# Design System

Three surface modes coexist in PixelVault:

- **Editorial surfaces** (Studio canvas, Gallery, Account) — Anthropic.com "Warm Editorial" aesthetic on warm off-white
- **Marketing surfaces** (Homepage, landing pages, **Auth**) — Krea-style minimal, near-white, single-sans
- **Krea Overlay surfaces** (AppSidebar, full-screen modals, asset browsers) — dark immersive chrome that frames the editorial canvas

Auth (sign-in, sign-up) is part of the marketing funnel: a user clicking "登录"/"Sign in" from the homepage expects visual continuity. They cross into Editorial only after authentication succeeds and they land in Studio.

Krea Overlay surfaces sit on top of (or beside) Editorial — the user reads navigation and asset thumbnails against dark chrome, then composes against the editorial canvas. Triggered by adding the `dark` className to a wrapper, which flips the `--sidebar` / `--background` / `--foreground` / `--primary` / `--border` tokens to their dark-mode oklch values defined in `src/app/globals.css` (`.dark { … }` block).

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

## Krea Overlay Surface

Use this surface only when the surface itself is **navigation chrome or an asset overlay**, not primary content:

- AppSidebar (PixelVault main left rail) — always Krea Overlay
- AssetSelectorDialog (Studio Image chip → Select asset) — full-bleed Krea Overlay
- `/assets` browser body when shown as a modal-style page (optional)

How to opt in:

- Wrap the surface in a container with `className="dark"` (Tailwind picks up the `.dark` selector in `globals.css` and flips the design tokens)
- Inside, use the standard Tailwind tokens — `bg-sidebar`, `bg-background`, `text-foreground`, `border-border`, `bg-primary` — they all resolve to the dark variants automatically. Don't hand-roll hex values

Pair with editorial:

- Krea Overlay never replaces the canvas. The Studio prompt + preview + dock stay editorial (warm off-white) so the creative work area feels calm; only the surrounding chrome and overlays go dark
- Don't apply `dark` to a whole route segment (e.g. don't dark-mode `/studio/image`); apply it at the component boundary that defines the overlay

## Forbidden Styles

- Blue-purple gradients, neon glows
- Heavy drop-shadow cards
- Inter / Roboto / generic sans-serif (use Space Grotesk)
- Dark backgrounds + blue glow + tech aesthetic (Krea Overlay is allowed because it uses warm dark sidebar tokens, not blue + neon)
- Tailwind arbitrary values (e.g. `w-[256px]`) — extend config instead
