---
name: improve-pixelvault-ui
description: PixelVault-specific UI implementation workflow for page redesigns, layout cleanup, component visual polish, model selectors, Studio/Gallery/Profile/Arena/Storyboard screens, responsive fixes, and user-facing copy changes. Use when Codex is asked to improve, redesign, simplify, audit, polish, or implement UI in the Personal AI Gallery codebase.
---

# Improve PixelVault UI

## Overview

Execute UI changes in PixelVault without drifting from its architecture, i18n model, or existing design system. This skill exists because UI redesign, Studio layout, model selector, gallery, empty state, and mobile cleanup tasks repeat often in this repository.

## Workflow

1. Inspect context before editing:
   - Read `AGENTS.md`.
   - Read the closest relevant docs under `docs/guides/`, `docs/plans/ui/`, and `docs/progress/` when the task is page-level or non-trivial.
   - Locate the route entry, related components, hooks, message keys, and existing shared UI primitives.

2. Audit the current UI:
   - Check hierarchy, spacing rhythm, typography scale, CTA clarity, responsiveness, accessibility, and visual noise.
   - Identify whether existing project skills such as `frontend-design`, `audit`, `critique`, `normalize`, `polish`, `adapt`, `harden`, or `clarify` should also be used.
   - State the weak points briefly before implementation when the task is exploratory or page-level.

3. Implement through the existing layer boundaries:
   - Keep page files thin and compose existing business/layout components.
   - Keep business logic out of presentational UI.
   - Use existing `components/ui`, shadcn/Radix primitives, Tailwind tokens, and local design conventions before creating new components.
   - Prefer improving existing components over creating duplicates.

4. Make all visible text translation-ready:
   - Add or reuse keys in `src/messages/en`, `src/messages/ja`, and `src/messages/zh`.
   - Do not introduce component-local dictionaries or hardcoded user-facing strings.
   - Use semantic keys that survive layout changes.

5. Normalize and polish:
   - Unify container width, spacing, text scale, button treatment, empty states, and mobile behavior.
   - Avoid nested cards, decorative gradients, arbitrary Tailwind values, weak contrast, generic dashboard aesthetics, and random visual effects.
   - Keep controls stable with responsive constraints so labels and dynamic content do not shift layout.

6. Validate:
   - Run typecheck/lint/build or focused tests when relevant and feasible.
   - Do not start `npm run dev` or any dev server in this project. Ask the user for the running URL if browser inspection is required.
   - If UI preview tooling is unstable or unavailable, report what was statically verified.

## Project Rules

- Do not change route structure for visual tasks unless the user explicitly asks.
- Do not change API contracts, credits logic, auth, storage, or provider behavior during UI work unless required by the task.
- Do not add new dependencies for cosmetic tweaks unless there is a clear product reason.
- For model selector or Studio workflow UI, confirm current model metadata from `src/constants/models.ts` before using IDs or labels.
- For page-level work, preserve locale-prefixed routing under `/en`, `/ja`, and `/zh`.

## Common Triggers

- "Optimize the model selector."
- "Simplify all frontend pages."
- "Make this page feel more like a premium gallery."
- "Fix the mobile layout."
- "Add a prompt engineering page under gallery."
- "This UI is too noisy or too web-like; clean it up."
