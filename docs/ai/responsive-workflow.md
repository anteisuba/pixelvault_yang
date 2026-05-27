# PixelVault Responsive UI Workflow

This workflow applies to page redesigns, mobile adaptation, prompt input changes, bottom action bars, drawers, modals, gallery grids, and any UI task that may affect viewport behavior.

## Assumptions

- PixelVault is mobile-first and dark-mode-first.
- UI-only tasks must not change API contracts, database schema, auth, credits, provider calls, storage logic, or generation logic.
- Current project commands use `npm` and `package-lock.json`. Do not migrate package managers as part of a UI task unless that is the explicit task.
- The generation experience lives under the Studio routes, especially `/en/studio` and its workflow routes.

## Required Order

1. Inspect the route entry, composed components, hooks, API client usage, and translation keys.
2. Audit layout, typography, spacing, CTA hierarchy, responsive constraints, and visual noise.
3. Identify mobile risks before writing code: `100vh`, `h-screen`, `min-h-screen`, `fixed`, `absolute`, `overflow-hidden`, nested scroll areas, sticky bars, prompt textareas, modals, drawers, and gallery grids.
4. State the problem list with file paths, severity, priority, and proposed patch direction.
5. Patch one page or component at a time.
6. Normalize spacing, text scale, buttons, containers, sheet behavior, and responsive breakpoints.
7. Run fast validation first, then browser/mobile QA when the change is visible.
8. Report changed files, what changed, validation run, and remaining manual checks.

## Viewports

Always consider these widths:

- 375px
- 390px
- 430px
- 768px
- 1024px
- 1440px

Use height values that expose real mobile constraints, such as 667px, 812px, 844px, and 932px.

## CSS Rules

- Avoid `height: 100vh` and broad `h-screen` usage for mobile surfaces.
- Prefer `min-h-dvh`, `min-h-svh`, or `h-dvh` when a viewport-height layout is necessary.
- Use `max-w-full`, `min-w-0`, `overflow-x-hidden`, and stable grid tracks to prevent horizontal scroll.
- Reserve bottom spacing for fixed or sticky navigation with `pb-safe` style utilities or explicit `env(safe-area-inset-bottom)` support.
- Avoid nested scroll regions unless the interaction requires them.
- Use stable dimensions for fixed-format boards, grids, media tiles, icon buttons, counters, and toolbars.
- Keep touch targets at least 44px high or wide where practical.

## Prompt Input And Mobile Keyboard

Prompt input must remain usable when the keyboard appears.

Required behavior:

- the prompt textarea remains visible while focused
- the primary generation action remains reachable or has a clear reachable replacement
- long prompts can be edited without horizontal scroll
- the page can scroll enough to reveal focused fields above the keyboard
- fixed bottom controls do not cover the focused textarea
- bottom sheets account for safe area and visual viewport changes

Desktop browser emulation is not enough for keyboard behavior. Use the real-device checklist in `docs/ai/mobile-qa-checklist.md`.

## Validation Commands

Use the commands that match the touched surface:

```bash
npm run lint
npm run build
npx playwright test e2e/mobile.spec.ts --project=mobile
```

If a command cannot run because of missing environment variables, login, third-party services, or local machine constraints, report that explicitly.
