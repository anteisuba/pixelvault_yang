# Home Page

Last updated: 2026-06-02

This document records the current page-level facts for the public homepage. It
is not a redesign spec and not a request to change UI code.

## Current

### Route Surface

| Surface | Route       | Current UI entry | Notes                                        |
| ------- | ----------- | ---------------- | -------------------------------------------- |
| Home    | `/[locale]` | `HomepageShell`  | public marketing homepage, `revalidate=3600` |

`src/app/[locale]/page.tsx` is auth-agnostic on the server. The auth-aware CTA
is resolved client-side through `HomepageAuthCta`, so the route can be cached.

### Structure

Current visible structure:

- `HomepageShell`
  - `HomepageRevealMotion`
  - skip link to `#homepage-main`
  - sticky homepage header
    - brand link
    - `LocaleSwitcher`
    - `HomepageAuthCta`
  - `HomepageHero`
  - `HomepageFeatureSection` list from `HOMEPAGE_FEATURE_SECTIONS`
  - `HomepageShowcaseRail`
  - `HomepageCapabilityMatrix`
  - `HomepageModelLineup`
  - `HomepageBottomCta`
  - `HomepageFooter`

## Current State Matrix

| State      | Current fact                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| Loading    | no route-level `loading.tsx` found for `/[locale]`; auth CTA has client placeholder while Clerk loads |
| Error      | no route-level home `error.tsx` found; global error surface is app-level                              |
| Empty      | not applicable; homepage is static/content-driven                                                     |
| Signed-out | `HomepageAuthCta` renders sign-in / sign-up actions                                                   |
| Signed-in  | `HomepageAuthCta` renders Studio entry instead of auth actions                                        |
| No credits | not page-owned                                                                                        |

## Page CSS / Layout Rules

Current CSS facts:

- `HomepageShell` imports `@/app/homepage.css`.
- Homepage styles are page-local by convention through `.homepage` and
  `homepage-*` selectors.
- Homepage-local tokens include `--home-border`, `--home-muted`,
  `--home-surface`, and `--home-surface-soft`.
- The page also uses shared `max-w-content`, font tokens, and `LocaleSwitcher`.
- `homepage.css` contains reveal motion, responsive rules, feature tone classes,
  hero/mosaic styles, CTA styles, and a light feature-band theme island.

Do not promote homepage classes into global page patterns unless another page
needs the same treatment.

## Components

| Area     | Components                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------- |
| shell    | `HomepageShell`, `HomepageRevealMotion`, `LocaleSwitcher`                                           |
| header   | brand link, homepage auth CTA                                                                       |
| hero     | `HomepageHero`                                                                                      |
| sections | `HomepageFeatureSection`, `HomepageShowcaseRail`, `HomepageCapabilityMatrix`, `HomepageModelLineup` |
| footer   | `HomepageBottomCta`, `HomepageFooter`                                                               |

## Interaction Details

- Locale switching is available in the sticky header.
- Auth CTA changes after Clerk client state resolves.
- Header/CTA links use locale-aware routing through `Link`.
- Homepage reveal effects are controlled by `HomepageRevealMotion` and
  homepage CSS.
- Skip link exists for keyboard users.

## Responsive

Known source facts:

- Header uses compact mobile sizing and larger `sm` sizing.
- Content is constrained by `max-w-content`.
- Homepage CSS owns detailed responsive behavior.

No fresh 375 / 390 / 430 / 768 / 1024 / 1440 screenshot pass was run for this
page document.

## Empty / Loading / Error States

Homepage does not have a data-empty state. The state that matters most for page
design is the Clerk CTA transition:

- auth not loaded: CTA placeholder;
- signed out: sign-in / sign-up actions;
- signed in: Studio action.

## Screenshot Evidence

Not captured in this pass.

Needed later:

- desktop 1440 home full page;
- mobile 390 home top/hero;
- signed-out CTA state;
- signed-in CTA state;
- `en` / `ja` / `zh` text-fit comparison for hero/header/footer.

## i18n / Accessibility

- Visible copy comes from `Homepage`, `Common`, and `Metadata` namespaces.
- Route metadata uses the `Metadata` namespace.
- Header brand link has an aria label.
- Skip link exists.
- Locale text fit still needs real screenshot QA.

## Do Not Break

- Locale-prefixed home route.
- Static/cache-friendly server page behavior.
- Client-only auth CTA behavior.
- Homepage-local CSS scoping.
- Header locale switcher.
- Skip link and keyboard access.

## Unresolved

- Which homepage visuals should become future shared visual language, if any?
- Should homepage remain separate from product app surfaces visually?
- Which homepage screenshots should become canonical page-design evidence?

## Source Of Truth

- `src/app/[locale]/page.tsx`
- `src/components/business/HomepageShell.tsx`
- `src/components/business/HomepageAuthCta.tsx`
- `src/components/business/HomepageHero.tsx`
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

- Date: 2026-06-02
- Method: documentation review and code inspection of the route, homepage
  shell, homepage CSS, constants, and message source files listed above.
