# Home Page

Last updated: 2026-06-03

This document records the current page-level facts for the public homepage. It
is not a redesign spec and not a request to change UI code.

## Current

### Route Surface

| Surface | Route       | Current UI entry | Notes                                        |
| ------- | ----------- | ---------------- | -------------------------------------------- |
| Home    | `/[locale]` | `HomepageShell`  | public marketing homepage, `revalidate=3600` |

`src/app/[locale]/page.tsx` is auth-agnostic on the server. The hero's
auth-aware primary CTA is resolved client-side through `HomepageHeroCta`, so
the route can be cached.

### Structure

Current visible structure:

- `HomepageShell`
  - `HomepageRevealMotion`
  - skip link to `#homepage-main`
  - sticky homepage header
    - brand link
    - sign-in link
    - `HomepageMenu` language trigger
  - `HomepageHero`
    - hero headline and subline
    - auth-aware primary CTA through `HomepageHeroCta`
    - gallery CTA
  - `HomepageFeatureSection` list from `HOMEPAGE_FEATURE_SECTIONS`
    - `imageEditing` renders a dedicated dark `Made with ANTEI` community
      works section
    - later feature sections keep the standard image/text section layout
  - `HomepageShowcaseRail`
  - `HomepageCapabilityMatrix`
  - `HomepageModelLineup`
  - `HomepageBottomCta`
  - `HomepageFooter`

## Current State Matrix

| State      | Current fact                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| Loading    | no route-level `loading.tsx` found for `/[locale]`; hero CTA has client placeholder while Clerk loads |
| Error      | no route-level home `error.tsx` found; global error surface is app-level                              |
| Empty      | not applicable; homepage is static/content-driven                                                     |
| Signed-out | header shows sign-in; hero primary CTA points to sign-up                                              |
| Signed-in  | header remains static; hero primary CTA points to Studio                                              |
| No credits | not page-owned                                                                                        |

## Page CSS / Layout Rules

Current CSS facts:

- `HomepageShell` imports `@/app/homepage.css`.
- Homepage styles are page-local by convention through `.homepage` and
  `homepage-*` selectors.
- Homepage-local tokens include `--home-border`, `--home-muted`,
  `--home-surface`, and `--home-surface-soft`.
- The page also uses shared `max-w-content`, font tokens, and locale-aware
  navigation helpers.
- `homepage.css` contains reveal motion, responsive rules, hero CTA styles,
  the dark `homepage-made-*` community works section, feature tone classes,
  CTA styles, and a light feature-band theme island for later feature sections.
- The public hero is intentionally text/CTA-only. Result imagery now belongs to
  the `Made with ANTEI` section below the hero, so the first two sections do not
  repeat the same visual role.
- `Made with ANTEI` uses `HOMEPAGE_MADE_WITH_ANTEI_ITEMS` from
  `src/constants/homepage.ts` and existing `/showcase/*.webp` assets.

Do not promote homepage classes into global page patterns unless another page
needs the same treatment.

## Components

| Area     | Components                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------- |
| shell    | `HomepageShell`, `HomepageRevealMotion`, `HomepageMenu`                                             |
| header   | brand link, sign-in link, language trigger                                                          |
| hero     | `HomepageHero`, `HomepageHeroCta`                                                                   |
| sections | `HomepageFeatureSection`, `HomepageShowcaseRail`, `HomepageCapabilityMatrix`, `HomepageModelLineup` |
| footer   | `HomepageBottomCta`, `HomepageFooter`                                                               |

## Interaction Details

- Locale switching is available from the sticky header language trigger.
- Hero primary CTA changes after Clerk client state resolves.
- Header/CTA links use locale-aware routing through `Link`.
- Homepage reveal effects are controlled by `HomepageRevealMotion` and
  homepage CSS.
- Skip link exists for keyboard users.
- `Made with ANTEI` cards link remix/submission actions to Studio and the
  section footer links to Gallery.

## Responsive

Known source facts:

- Header uses compact mobile sizing and larger `sm` sizing.
- Content is constrained by `max-w-content`.
- Homepage CSS owns detailed responsive behavior.
- `Made with ANTEI` is a three-column card mosaic on desktop and a compact
  horizontal card rail on mobile to avoid a very tall stacked works section.

Fresh QA in this pass covered 390px and 652px mobile widths for the hero and
`Made with ANTEI` section, plus desktop 1024px section screenshots.

## Empty / Loading / Error States

Homepage does not have a data-empty state. The state that matters most for page
design is the Clerk CTA transition:

- auth not loaded: hero CTA placeholder;
- signed out: hero primary action points to sign-up;
- signed in: hero primary action points to Studio.

## Screenshot Evidence

Captured in this pass through Playwright/in-app browser evidence:

- 390px and 652px mobile home top/hero plus `Made with ANTEI` rail geometry;
- desktop 1024px `Made with ANTEI` section screenshot;
- `zh` header/hero text-fit during browser review.

Needed later:

- desktop 1440 full-page pass;
- signed-out CTA state;
- signed-in CTA state;
- `en` / `ja` / `zh` full-page text-fit comparison.

## i18n / Accessibility

- Visible copy comes from `Homepage`, `Common`, and `Metadata` namespaces.
- Route metadata uses the `Metadata` namespace.
- Header brand link has an aria label.
- Header language trigger uses `LocaleSwitcher` copy through `HomepageMenu`.
- Skip link exists.
- `Made with ANTEI` visible card labels and calls to action live under
  `Homepage.madeWithAntei` in all supported locale message files.

## Do Not Break

- Locale-prefixed home route.
- Static/cache-friendly server page behavior.
- Client-only auth CTA behavior.
- Homepage-local CSS scoping.
- Header language switcher.
- Hero and `Made with ANTEI` should not both become full result-image grids.
- Skip link and keyboard access.

## Unresolved

- Which homepage visuals should become future shared visual language, if any?
- Should homepage remain separate from product app surfaces visually?
- Which homepage screenshots should become canonical page-design evidence?
- Whether `Made with ANTEI` should later use live public gallery data or remain
  a static marketing showcase.

## Source Of Truth

- `src/app/[locale]/page.tsx`
- `src/components/business/HomepageShell.tsx`
- `src/components/business/HomepageHero.tsx`
- `src/components/business/HomepageHeroCta.tsx`
- `src/components/business/HomepageFeatureSection.tsx`
- `src/components/business/HomepageModelLineup.tsx`
- `src/components/business/HomepageBottomCta.tsx`
- `src/components/business/HomepageFooter.tsx`
- `src/constants/homepage.ts`
- `src/app/homepage.css`
- `src/messages/en.json`
- `src/messages/ja.json`
- `src/messages/zh.json`

## Last Verified

- Date: 2026-06-03
- Method: code inspection of homepage shell/hero/feature components, constants,
  CSS, and messages; validation with ESLint, Prettier, TypeScript, targeted
  Vitest, and Playwright checks for desktop 1024px plus mobile 390px and 652px.
