# Design Docs

Last updated: 2026-06-02

This directory is for UI design documentation.

The design docs should be written slowly and confirmed one by one.
Do not treat any page direction as final until it has been discussed and accepted.

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
├── system/
│   └── README.md
├── pages/
│   └── README.md
└── reviews/
    └── README.md
```

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
