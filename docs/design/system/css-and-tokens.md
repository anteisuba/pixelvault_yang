# CSS And Tokens

Last updated: 2026-06-02

This document records the current CSS/token structure and screenshot capture
rules for PixelVault design documentation. It is a fact inventory and working
agreement, not a final visual design system and not a request to change UI code.

## Current

### CSS Entry Points

Current app-level CSS files:

- `src/app/globals.css`
- `src/app/homepage.css`

Current imports:

- `src/app/layout.tsx` imports `./globals.css`.
- `src/components/business/HomepageShell.tsx` imports `@/app/homepage.css`.
- No other `src/app/*.css` files currently exist.

`src/app/globals.css` is the global styling hub. It imports:

- Fontshare Satoshi CSS.
- Tailwind CSS.
- `tw-animate-css`.
- `shadcn/tailwind.css`.
- `@xyflow/react/dist/style.css` for the Node workflow canvas.

`src/app/globals.css` currently has 1185 lines. `src/app/homepage.css`
currently has 1302 lines.

### Runtime Theme State

`src/app/layout.tsx` sets `className="dark"` on the root `<html>` element.
Therefore the `.dark` CSS variable set is active by default at runtime.

The root layout also:

- sets `lang` from `next-intl`;
- installs font variables on `<body>`;
- renders `LocatorSetup` only in development;
- renders Vercel Toolbar only in development when
  `NEXT_PUBLIC_ENABLE_VERCEL_TOOLBAR === 'true'`.

Language-specific font overrides live in `src/app/globals.css`:

- `html:lang(ja)` switches app/display/serif/hero font stacks toward Japanese
  fonts.
- `html:lang(zh)` switches app/display/serif/hero font stacks toward Chinese
  fonts.

The main app shell in `src/app/[locale]/(main)/layout.tsx` uses
`min-h-svh overflow-x-hidden bg-background`, then mounts sidebar, mobile rail,
mobile header, mobile tab bar, and the main content inset.

### Token Layers

Current token groups in `src/app/globals.css`:

| Group                           | Source                                                        | Current Usage                                                                                                           |
| ------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| shadcn semantic colors          | `:root`, `.dark`, `@theme inline`                             | `bg-background`, `text-foreground`, `bg-card`, `border-border`, form controls, dialogs, sheets, menus                   |
| sidebar tokens                  | `:root`, `.dark`, `@theme inline`                             | `AppSidebar`, `MobileTabBar`, `CardsPageContent`, shadcn sidebar primitive                                              |
| font tokens                     | root layout font variables, `@theme inline`, `html:lang(...)` | app body, display text, serif accents, monospace/code                                                                   |
| max-width and typography tokens | `@theme inline`                                               | `max-w-content`, `max-w-gallery`, hero/title/nav text utilities                                                         |
| surface tokens                  | `:root`, `.dark`                                              | `--surface-elevated`, `--surface-soft`, `--surface-highlight`, `--page-border` for editorial panels and shared surfaces |
| Studio layout widths            | `@theme inline`                                               | `--width-studio-left`, `--width-studio-right`, `--width-studio-sidebar`                                                 |
| Node workflow tokens            | `:root`, `.dark`, `@theme inline`                             | `bg-node-*`, `text-node-*`, `shadow-node-panel` in `src/components/business/node/**`                                    |
| animation tokens                | `@theme inline`, keyframes, component CSS                     | shimmer/spin utilities, Studio reveal states, homepage reveal states                                                    |

The current token structure mixes primitives, semantic app tokens, domain
surface tokens, and page-specific utility hooks in one global file. This is a
current implementation fact, not a final target.

### Global CSS Sections

`src/app/globals.css` currently contains these major sections:

- `@source not` exclusions for local agent/artifact directories.
- `@custom-variant dark (&:is(.dark *));`
- `@theme inline` Tailwind token mappings.
- `:root` light variables.
- `html:lang(ja)` and `html:lang(zh)` font overrides.
- `.dark` variables.
- `@layer base` defaults for border/ring, scroll behavior, body, and selection.
- `@layer components` for editorial surfaces, Studio V2 layout classes,
  command palette styling, generation reveal animations, and responsive rules.
- Global reduced-motion handling.

### Page-Local CSS

`src/app/homepage.css` is page-local by convention through `.homepage` and
`homepage-*` selectors, but it is still a CSS file with global selectors once
imported.

Homepage-local tokens:

- `--home-border`
- `--home-muted`
- `--home-surface`
- `--home-surface-soft`

Homepage-local systems currently include:

- skip link;
- header/nav/locale switcher;
- primary and secondary CTA treatments;
- hero and mosaic;
- feature sections;
- model lineup;
- showcase rail;
- bottom CTA and footer;
- reveal motion and reduced-motion handling;
- responsive rules.

### Domain Surface Usage

Current repeated surface families observed in code:

- `editorial-*` classes in global CSS for editorial pages and error surfaces.
- `homepage-*` classes for the public homepage.
- `studio-*` classes in global CSS for the image/video/audio Studio shell.
- `node-*` tokens and Tailwind utilities for `/studio/node`.
- `sidebar-*` tokens for desktop sidebar and mobile navigation.
- shadcn primitive tokens for dialogs, sheets, inputs, selects, dropdowns,
  drawers, cards, badges, progress, and command UI.

Current route/domain facts that matter for CSS:

- `/studio/image`, `/studio/video`, and `/studio/audio` share one mounted
  workspace layout.
- `/studio/node` uses React Flow and the Node token family.
- Main app pages are locale-prefixed and run inside the shared sidebar/mobile
  shell.

### Page Usage Map

This map records where token families and CSS surface languages are used today.
It is a fact map, not a refactor plan.

| Surface / page family               | Current CSS / token language                                               | Page-private or domain-specific facts                                                                                       | Arbitrary value categories observed                                                                             | Current quality read                                                               |
| ----------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Public home                         | `src/app/homepage.css`, `.homepage`, `homepage-*`, `--home-*`              | large page-local system for header, hero, feature bands, model lineup, showcase rail, footer, reveal motion, and light band | label tracking such as `tracking-[0.18em]`, footer tracking, homepage grid ratios                               | keep page-local until another page needs the same pattern                          |
| Main app shell                      | `sidebar-*`, `bg-background`, `text-foreground`, `border-border`           | `AppSidebar`, `MobileTabBar`, locale switcher, account menu, and sidebar primitives own shell tokens                        | mobile bar transition `duration-[180ms]`, label width caps such as `max-w-[4.5rem]`                             | valid shell token family; not a generic page surface                               |
| Studio Image / Video / Audio        | `.studio-layout-v2`, `.studio-canvas`, `.studio-dock`, shadcn primitives   | shared mounted workspace; prompt root owns local `--studio-prompt-max-h`; generation reveal classes live in global CSS      | prompt max-height vars, generated media max heights, popover widths, drawer/dialog max heights                  | valid domain hooks, but some `studio-*` global classes appear legacy or unused     |
| Studio Edit                         | shadcn semantic tokens and direct Tailwind layout utilities                | no edit-specific token family; source shell and task pages use `bg-card`, `bg-muted`, `border-border`, task-specific panels | `2xl:max-w-[88rem]`, `lg:grid-cols-[minmax(0,1fr)_360px]`, source image `max-h-[70svh]`, provider `text-[11px]` | page doc should own edit direction before tokens are extracted                     |
| Assets                              | shadcn semantic tokens inside a dense asset browser                        | no broad asset token family; sidebar-like filters and asset cards compose primitives                                        | `h-[calc(100svh-3rem)]`, `text-[10px]`, media detail `max-h-[calc(...)]`, `w-[min(...)]`                        | likely needs page-owned layout rules before token extraction                       |
| Gallery listing and detail          | `max-w-gallery`, `editorial-*` on detail/error, shadcn primitives in cards | listing grid uses `GalleryGrid`; empty panel uses dashed `primary` surface; detail media has viewport caps                  | `max-h-[70svh]`, media preview object-fit caps, detail/player sizing                                            | gallery listing and editorial detail should be documented separately               |
| Creator profile                     | `max-w-content`, Polaroid component classes, shadcn primitives             | profile grid and empty state are component-owned; public profile also uses route error/loading surfaces                     | Polaroid modal max-width/max-height values, image detail viewport caps                                          | profile/polaroid surface is a distinct component language                          |
| Cards                               | `dark bg-sidebar text-sidebar-foreground`, card manager primitives         | page background borrows sidebar tokens; managers use direct shadcn primitives and card-specific tiles                       | many `text-[10px]`, dialog `max-h-[85vh]`, chip width caps                                                      | borrowing shell tokens for page background should be reviewed in `cards.md`        |
| Node workflow                       | `node-*`, `bg-node-*`, `text-node-*`, `shadow-node-panel`, React Flow CSS  | domain-scoped token family across workbench, panels, inspector, assistant dock, minimap, and controls                       | `h-[calc(100svh-3rem)]`, grid arbitrary values in controls                                                      | strong domain token family; keep scoped to `/studio/node`                          |
| 3D workspace                        | shadcn primitives plus dense editor-specific Tailwind                      | no broad 3D token family found in this pass                                                                                 | many `text-[10px]`/`text-[11px]`, viewport height calculations, max-width and max-height caps                   | needs a page doc before deciding whether dense editor controls need tokens         |
| Prompts / Arena / Storyboard        | `editorial-*` plus shadcn primitives                                       | editorial classes repeat across recipe, competition, story, and route-state surfaces                                        | leaderboard grid arbitrary columns and page-specific panel sizing                                               | `editorial-*` is a real cross-page candidate, but responsibilities are mixed today |
| API Keys sheet / account menu       | shadcn sheet/card primitives plus sidebar/account-menu context             | API key management is not a standalone route in this pass; empty states live inside `ApiKeyManager`                         | dashed empty blocks use primitives; no dedicated token family found                                             | should be documented with shell/settings before being treated as page design       |
| Global route loading/error surfaces | `editorial-*`, `max-w-content`, shadcn skeleton/card primitives            | route-level `loading.tsx` and `error.tsx` vary by page                                                                      | route skeleton heights such as `h-[calc(...)]`, modal-like center panels                                        | loading/error should be captured per page before normalization                     |

### Current Arbitrary Values

Arbitrary values exist in current Tailwind usage. Common categories include:

- viewport and safe-area constraints, such as `h-[calc(100svh-3rem)]`,
  `max-h-[95svh]`, and `max-h-[calc(...)]`;
- constrained modal/sheet widths, such as `w-[min(...)]`;
- very small text utilities, such as `text-[10px]`;
- Radix/shadcn runtime variables, such as
  `h-[var(--radix-select-trigger-height)]`;
- fixed interaction timings, such as `duration-[180ms]`;
- attribute selectors and internal state selectors for shadcn/Radix behavior.

These should not be normalized blindly. Future design work should separate
necessary viewport/runtime constraints from visual values that should become
tokens.

Existing global tokens include negative tracking and viewport-based `clamp()`
text sizes. Those are current code facts, not a recommendation to expand this
pattern. Future UI implementation should only preserve or change them after the
relevant page/system direction is confirmed.

### Usage Quality Findings

This pass checked definitions and usage in `src/app` and `src/components`.

Strong or valid current token families:

| Token or class family                                                    | Current quality read                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sidebar-*` tokens                                                       | Valid app-shell tokens. They are used heavily by `AppSidebar`, `MobileTabBar`, `LocaleSwitcher`, and sidebar primitives. Keep them as shell-specific tokens, not generic page styling.                                                                                                                     |
| `node-*` tokens                                                          | Valid domain tokens. They are used throughout `src/components/business/node/**` for canvas, panels, inspectors, assistant dock, minimap, and Node controls. Keep them domain-scoped to `/studio/node`.                                                                                                     |
| `editorial-*` classes                                                    | Real cross-page pattern. They appear across arena, prompts, storyboard, gallery detail/error, profile error, global error, and other route states. They are candidates for a documented editorial page pattern, but the current classes mix page shell, hero, panel, metric, and summary responsibilities. |
| `max-w-content` and `max-w-gallery`                                      | Valid layout utilities. `max-w-content` is used across auth, loading pages, profile/grid surfaces, and `max-w-gallery` anchors gallery listing width.                                                                                                                                                      |
| `text-2xs`, `text-3xs`, `text-nav`, `tracking-nav`, `tracking-nav-dense` | Valid small-label utility family. `text-2xs` is widely used; `text-3xs` is used by mobile/gallery/card labels. These should become the preferred path for repeated 10-11px UI labels.                                                                                                                      |

Weak, orphaned, or review-before-using tokens:

| Token or class                                                                                   | Finding                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--text-hero-title`, `--text-hero-subtitle`, `--leading-hero`, `--tracking-hero`, `--h-hero-btn` | Defined in `@theme inline`, but no non-definition usage was found in `src/app` or `src/components`. Do not build new UI on these until a hero/page direction confirms them.                                            |
| `--text-tab`                                                                                     | Defined, but no non-definition usage was found. Existing tab-like controls use other text utilities.                                                                                                                   |
| `--width-studio-left`, `--width-studio-sidebar`                                                  | Defined, but no non-definition usage was found.                                                                                                                                                                        |
| `--width-studio-right`                                                                           | Only found through `.studio-grid-2col`; no component usage of `.studio-grid-2col` was found in `src/app` or `src/components`. Treat as legacy/backward-compat CSS until Studio page review confirms deletion or reuse. |
| `--overlay-chip`, `--overlay-chip-foreground`                                                    | Defined in light and dark variables, but no usage was found in `src/app` or `src/components`.                                                                                                                          |
| `--surface-highlight`                                                                            | Defined but no usage was found.                                                                                                                                                                                        |
| `--home-surface-soft`                                                                            | Defined twice in `homepage.css`, including inside `.homepage-features-band`, but no usage was found.                                                                                                                   |
| `.studio-gallery-item`, `.studio-grid-2col`, `.studio-panel-animate`, `.studio-generating`       | Some Studio global classes appear unused or legacy in current component search. Do not promote them as system patterns before Studio page review.                                                                      |

Page-local or do-not-promote findings:

- `homepage-*` is a large page-local class family. It should remain homepage
  owned until another page needs the exact same pattern.
- `.homepage-features-band` locally rewrites shadcn-like variables
  (`--background`, `--foreground`, `--card`, `--secondary`, `--muted`,
  `--border`, `--primary`) to create a light contrast band inside the dark
  homepage. This is a page-local theme island, not a global token model.
- `homepage-feature-tone-*`, `homepage-hero-*`, `homepage-rail-*`, and
  `homepage-bottom-cta-*` are page-specific presentation classes. Do not move
  them into `globals.css` or shared components without a second use case.
- `EditWorkspaceShell` does not currently introduce an edit-specific token
  family. The visible `EditShellInner` uses shadcn semantic tokens and direct
  Tailwind layout utilities. Its layout and interactions belong in
  `pages/studio.md` or a future edit-workspace page note, not in this token
  file.

Duplication and normalization candidates:

- `text-3xs` exists as a 10px token, but `text-[10px]` still appears 60 times
  in `src/app` and `src/components`.
- `text-2xs` exists as an 11px token and is used widely, but `text-[11px]`
  still appears 27 times.
- `tracking-nav` and `tracking-nav-dense` exist, but arbitrary tracking values
  such as `tracking-[0.12em]`, `tracking-[0.16em]`, and `tracking-[0.18em]`
  still appear in page/component code.
- `--surface-elevated`, `--surface-soft`, and `--page-border` are currently
  used mostly by editorial/global auth overrides, while many business
  components still compose `bg-card`, `bg-background`, `bg-muted`, and
  `border-border` directly. This is not wrong, but future extraction should
  define when to use a named surface token versus direct shadcn primitives.
- Radius usage mixes shadcn radius tokens, `rounded-2xl`/`rounded-3xl`, and
  page-specific pill/card choices. Do not normalize radii globally until each
  surface family has an owner.

## Problems

1. `globals.css` is doing too many jobs: global token mapping, base styles,
   editorial components, Studio layout, command palette, animations, and
   responsive patches all live together.
2. Token ownership is not fully explicit. Some values are app-wide semantic
   tokens, some are Studio or Node domain tokens, and some are page-local design
   hooks.
3. `homepage.css` is intentionally page-specific, but its size makes it easy for
   homepage-only patterns to leak into the rest of the design system by copy.
4. The app has multiple surface languages today: dark sidebar shell, editorial
   panels, homepage marketing surfaces, Studio workspace, Node canvas, and
   shadcn primitives. They are not yet documented as one coherent system.
5. Current arbitrary-value usage includes both legitimate runtime constraints
   and visual one-offs. They need audit by page/component before any token
   migration.
6. Several global tokens are weak or orphaned in current usage:
   `--text-hero-*`, `--h-hero-btn`, `--text-tab`, `--overlay-chip`,
   `--surface-highlight`, parts of `--width-studio-*`, and
   `--home-surface-soft`.
7. Small-label typography is partially tokenized but inconsistent. Existing
   `text-3xs`/`text-2xs` utilities coexist with many `text-[10px]` and
   `text-[11px]` values.
8. Development overlays can contaminate visual evidence. LocatorJS and optional
   Vercel Toolbar are dev tools, not product UI, but they can appear in
   screenshots if not disabled or annotated.

## Target

The near-term target is documentation clarity, not CSS refactor.

Future design docs should treat the CSS system as four layers:

1. Primitive and shadcn-compatible tokens: color, radius, typography, shadows,
   motion primitives.
2. App semantic tokens: background, card, border, sidebar, surface, foreground,
   focus, danger/success.
3. Domain surface contracts: homepage, main shell, Studio workspace, Node
   canvas, gallery/assets/cards surfaces.
4. Page-local exceptions: one-off layout and media treatments that should stay
   scoped to a page until they repeat enough to extract.

Token extraction rule:

- Promote a value to a token only when it has stable semantic meaning or clear
  reuse.
- Keep page-specific values page-local until at least one follow-up page needs
  the same pattern.
- Do not create a token for every measurement.
- Do not move Studio or Node domain tokens into generic app tokens unless their
  meaning is shared outside that domain.
- Treat weak/orphan tokens as review items before reuse. New design docs should
  cite current usage, not just token existence.
- Prefer existing small text utilities (`text-3xs`, `text-2xs`, `text-nav`)
  over new arbitrary `text-[10px]` or `text-[11px]` values, unless the page doc
  records a specific reason.
- Keep homepage theme-island behavior page-local unless a second page needs the
  same light-band pattern.

For follow-up files:

- `layout-shell.md` should own sidebar/mobile/header/content-shell facts.
- `pages/studio.md` should own Studio image/video/audio workspace layout
  direction.
- Node-specific visual decisions should cite both `docs/domains/node-workflow.md`
  and the Node token family here.
- Page docs should list the exact CSS classes and tokens they depend on before
  proposing visual changes.

## Not Covered In This File

The following investigations are not complete here and should not be treated as
done:

- Layout shell interaction quality: `AppSidebar`, `MobileTabBar`,
  `StudioWorkspaceUI`, and edit workspace behavior belong in
  `layout-shell.md` and page-specific Studio docs.
- Mobile QA quality: this file defines capture rules, but it does not assert
  that 375/390/430/768/1024/1440 behavior is good. That requires a fresh browser
  pass with screenshots and overflow evidence.
- Loading, error, and empty states: route `loading.tsx`/`error.tsx` and page
  empty states should be reviewed in `components.md` or the relevant page docs.
- i18n copy structure: this file only records font and locale-sensitive token
  facts. Namespace quality, hardcoded UI strings, and key naming belong in
  `i18n-accessibility.md` or page docs.

## LocatorJS Screenshot Capture Rules

### Current Dev Wiring

LocatorJS is currently development-only:

- `next.config.ts` injects `@locator/webpack-loader` for `**/*.{tsx,jsx}` with
  `options: { env: 'development' }`.
- `src/components/dev/LocatorSetup.tsx` imports `@locator/runtime` in a client
  `useEffect`.
- `src/app/layout.tsx` renders `<LocatorSetup />` only when
  `NODE_ENV === 'development'`.
- Installed versions observed with `npm ls`: `@locator/runtime@0.5.1` and
  `@locator/webpack-loader@0.5.1`.

The installed Locator shared options store uses the localStorage key
`LOCATOR_OPTIONS` and supports:

- `disabled`
- `showIntro`
- `welcomeScreenDismissed`

### Rule

For design screenshots, disable LocatorJS before the first navigation in the
browser context. Do not remove `LocatorSetup` or change app code just to capture
screenshots.

Use a Playwright init script before `page.goto(...)`:

```ts
await context.addInitScript(() => {
  const key = 'LOCATOR_OPTIONS'
  let existing = {}

  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : {}

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      existing = parsed
    }
  } catch {
    existing = {}
  }

  window.localStorage.setItem(
    key,
    JSON.stringify({
      ...existing,
      disabled: true,
      showIntro: false,
      welcomeScreenDismissed: true,
    }),
  )
})
```

If the screenshot is intentionally captured with LocatorJS visible, label it as
`dev-overlay-present` and do not treat the overlay as product UI. Default design
screenshots should be `dev-overlay-disabled`.

### Capture Procedure

Default viewport set for page design docs:

- 375
- 390
- 430
- 768
- 1024
- 1440

Minimum capture set for broad inventory:

- desktop 1440
- mobile 390

Recommended browser setup:

- set `prefersReducedMotion: 'reduce'` unless the motion itself is under review;
- disable LocatorJS with the init script above;
- keep `NEXT_PUBLIC_ENABLE_VERCEL_TOOLBAR` unset or false for visual captures;
- capture the same locale as the design doc being reviewed, usually `en`;
- add `ja` and `zh` screenshots when text fit, font fallback, or i18n copy
  length is under review.

Recommended page wait:

```ts
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForLoadState('networkidle').catch(() => undefined)
await page.waitForTimeout(1500)
```

Recommended evidence to save beside screenshots:

- absolute URL;
- locale;
- viewport width and height;
- auth state when relevant;
- screenshot path;
- `devOverlay` value: `disabled`, `present`, or `unknown`;
- `bodyTextLength`;
- console errors and page errors;
- horizontal overflow check;
- notable loading, error, empty, disabled, or skeleton state if captured.

Recommended horizontal overflow check:

```ts
const evidence = await page.evaluate(() => {
  const root = document.documentElement
  const locatorRaw = window.localStorage.getItem('LOCATOR_OPTIONS')
  const locatorOptions = locatorRaw ? JSON.parse(locatorRaw) : {}

  return {
    bodyTextLength: document.body.innerText.length,
    clientWidth: root.clientWidth,
    scrollWidth: root.scrollWidth,
    hasHorizontalOverflow: root.scrollWidth > root.clientWidth + 1,
    locatorDisabled:
      document.head.dataset.locatorDisabled === 'disabled' ||
      locatorOptions.disabled === true,
  }
})
```

Screenshot naming convention:

- `docs/screenshots/<doc-slug>/<page-slug>-desktop-1440.png`
- `docs/screenshots/<doc-slug>/<page-slug>-mobile-390.png`
- `docs/screenshots/<doc-slug>/<page-slug>-<state>-<viewport>.png` for
  loading, error, empty, interaction, or locale-specific states.
- `docs/screenshots/<doc-slug>/<evidence-name>.json` for structured evidence.

The current UI inventory uses
`docs/screenshots/current-ui-inventory/<page-slug>-desktop-1440.png`,
`<page-slug>-mobile-390.png`, `mobile-390-evidence.json`, and
`responsive-representative-evidence.json`.

## Do Not Break

- Do not change app UI code while writing this document.
- Do not remove `LocatorSetup` or the LocatorJS loader just for screenshots.
- Do not remove the `@xyflow/react/dist/style.css` import unless Node workflow
  rendering is independently verified.
- Do not change the root `.dark` default without a separate theme decision.
- Do not change locale font overrides without checking `en`, `ja`, and `zh`.
- Do not break the shared Studio image/video/audio mounted workspace.
- Do not break `/studio/node` canvas token usage or React Flow styling.
- Do not break mobile safe-area handling for bottom bars, drawers, sheets, or
  Studio docks.
- Do not turn homepage-local classes into global app patterns without a
  confirmed extraction decision.
- Do not treat development overlays as product UI defects unless they remain
  visible after the capture setup disables them.

## Source Of Truth

Documentation:

- `docs/design/system/README.md`
- `docs/design/system/current-ui-inventory.md`
- `docs/architecture/overview.md`
- `docs/domains/studio.md`
- `docs/domains/node-workflow.md`

Code:

- `src/app/layout.tsx`
- `src/app/[locale]/(main)/layout.tsx`
- `src/app/globals.css`
- `src/app/homepage.css`
- `src/components/business/HomepageShell.tsx`
- `src/components/dev/LocatorSetup.tsx`
- `next.config.ts`
- `src/components/layout/AppSidebar.tsx`
- `src/components/layout/MobileTabBar.tsx`
- `src/components/business/GalleryGrid.tsx`
- `src/components/business/KreaAssetBrowser.tsx`
- `src/components/business/ApiKeyManager.tsx`
- `src/components/business/PolaroidGrid.tsx`
- `src/components/business/CardsPageContent.tsx`
- `src/components/business/Studio3DWorkspace.tsx`
- `src/components/business/node/**`
- `src/components/business/studio/**`
- `src/components/business/studio-shared/**`

Installed package facts:

- `node_modules/@locator/shared/src/sharedOptionsStore.ts`
- `node_modules/@locator/runtime/src/components/Runtime.tsx`
- `npm ls @locator/runtime @locator/webpack-loader`

## Last Verified

Verified on 2026-06-02 by reading the documentation and code source of truth
listed above. This pass did not modify UI code and did not run browser screenshot
capture again.
