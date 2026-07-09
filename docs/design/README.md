# Design Docs

Last updated: 2026-06-02

This directory is for UI design documentation.

The design docs should be written slowly and confirmed one by one.
Do not treat any page direction as final until it has been discussed and accepted.

This directory is PixelVault's UI design-system knowledge base. It follows the
same operating idea as a personal design system: agents must read the visual
rules and the relevant page scene before changing UI, then use existing
components, layouts, screenshots, and reviews as the starting point.

## Purpose

Design docs should eventually cover:

- the current UI state,
- global CSS and visual system rules,
- shared layout and component rules,
- responsive behavior,
- i18n and accessibility constraints,
- and future page-by-page UI optimization direction.

This directory is only structured for now.
Detailed design docs are intentionally deferred until each topic is reviewed.

## Proposed Structure

```text
docs/design/
├── README.md
├── direction.md
├── system/
│   └── README.md
├── pages/
│   └── README.md
└── reviews/
    └── README.md
```

Current supporting assets:

- `canvas-drafts/` stores visual exploration assets and wireframes.
- `reviews/assets/` and `reviews/svg/` store evidence for design reviews.
- `docs/screenshots/` stores browser and mobile QA screenshots.

These assets are not rules by themselves. A UI task should first read the
relevant `system/` and `pages/` files, then use assets as evidence or starting
material.

## Writing Order

Recommended order:

1. `system/current-ui-inventory.md`
2. `system/css-and-tokens.md`
3. `system/layout-shell.md`
4. `system/components.md`
5. `system/responsive.md`
6. `system/i18n-accessibility.md`
7. `pages/home.md`
8. `pages/studio.md`
9. `pages/assets.md`
10. `pages/gallery.md`
11. `pages/profile.md`
12. `pages/cards.md`
13. `pages/node-workflow.md`
14. `pages/3d.md`

Each file should be created only when that topic is being discussed.

## UI Task Workflow

Before UI implementation or visual review, follow this sequence:

1. Classify the scene: landing/marketing, product app surface, Studio workspace,
   asset/gallery/profile page, modal/dialog, state component, or responsive bug.
2. Ask or answer five questions: target user outcome, route/component owner,
   what must stay unchanged, source screenshots or design references, and
   validation evidence.
3. Read `docs/design/direction.md` if the task affects visual direction.
4. Read relevant `system/*.md` and `pages/*.md` files.
5. Inspect the current route, component, messages, and CSS source of truth.
6. Start from existing components, layout shells, or reviewed designs; do not
   create a parallel visual system.
7. Implement one page or component slice.
8. Self-check against hierarchy, spacing, typography, responsiveness, a11y,
   i18n, and the project anti-slop rules.
9. Run relevant validation or explain why it was skipped.
10. Record only reusable findings back into `system/`, `pages/`, or `reviews/`.

## Confirmation Rule

Before writing any detailed design doc, ask or confirm:

- What is the page or system area responsible for?
- What should the current UI keep?
- What feels wrong today?
- What should the future UI optimize for?
- What must not be broken during redesign?
- Which screenshots, routes, components, and CSS files are the source of truth?

## Design Doc Template

Use this template for detailed design docs:

```md
# Title

## Current

## Problems

## Target

## Page CSS / Layout Rules

## Components

## Responsive

## i18n / Accessibility

## Do Not Break

## Unresolved

## Source of Truth

## Last Verified
```

## Source of Truth

Current structure facts:

- `docs/README.md`
- `docs/status.md`
- `src/app/globals.css`
- `src/app/homepage.css`
- `src/components/ui/`
- `src/components/layout/`
- `src/components/business/`
- `src/messages/`
- `src/i18n/`
- `docs/screenshots/`
