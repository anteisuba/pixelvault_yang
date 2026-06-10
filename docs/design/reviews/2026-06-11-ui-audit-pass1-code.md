# UI Audit — Pass 1 (Code-Level)

Date: 2026-06-11
Status: **Pass 1 of 2.** Static code analysis only — findings below are read from
source, not yet confirmed in a live browser. Pass 2 (live interaction + visual
pass, real mobile viewport) is planned and will verify the High items.

## Scope

Owner-reported pain points driving this audit:

1. Disclosure inconsistency — "按钮打开方式都不一样", app-wide, worst in Studio.
2. Mobile experience is painful to use.
3. Operation logic — how things open, where results go, how users get back to them.
4. Texture & motion quality (质感 / 动画).

Method: four parallel read-only code sweeps (disclosure patterns / motion +
texture / mobile / IA + flows) over `src/components/**`, `src/app/[locale]/**`,
`src/app/globals.css`, `src/app/homepage.css`, `e2e/*.spec.ts`, and the
`docs/design/system` + `docs/design/pages` fact docs.

## Routes / surfaces checked

All 34 `page.tsx` routes; layout shell (`AppSidebar`, `MobileCollapsedRail`,
`MobileHeader`, `MobileTabBar`); Studio workspace + dock + edit hub + 10 edit
tools + LoRA workbench + node canvas + 3D; Assets (`KreaAssetBrowser`,
`AssetDetailSheet`); Gallery feed/detail (`ImageCard`, `ImageDetailModal`,
`MediaDetailViewer`); Prompts; Cards; Storyboard; Homepage.

---

## A. Disclosure consistency (打开方式)

Inventory: ~12 distinct opening mechanisms in active use — Dialog (17 sites),
Popover (18), Sheet (6), Drawer (5), DropdownMenu (5), AlertDialog (5), custom
`ConfirmDialog` wrapper (3), `ResponsiveDialog` (only 2), custom fixed/absolute
overlays (7+), route-based opening, query-param tabs, bare `useState` inline
panels (20+).

| #   | Finding                                                                                                                                                                                                                                                                                                                                                              | Severity |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| A1  | **Same intent "pick something" uses 6 different patterns.** LoRA pick = Popover (`StudioLoraChip.tsx:38`); voice pick = Dialog (`FishVoiceLibraryDialog.tsx`); reference image = Popover→Dialog nesting (`ReferenceImageChip.tsx:41`); cards/aspect/style/transform = Popover; asset browse = Dialog or Sheet depending on surface.                                  | High     |
| A2  | **`ResponsiveDialog` (Dialog desktop / Drawer mobile) exists but only 2 surfaces use it** (`QuickSetupDialog.tsx:224`, `StudioFaceConsentModal.tsx:15`). Other components hand-roll mobile adaptation (`LoraPromptControlButton.tsx:64` builds its own Popover/Drawer split) or ignore mobile entirely.                                                              | High     |
| A3  | **7+ custom overlays bypass UI primitives** with hand-managed z-index and no focus trap / Esc / click-outside consistency: `CanvasAddMenu.tsx:155` (z-20), `HomepageMenu.tsx:60` (z-30), `ImageDetailModal.tsx:503` (custom `fixed inset-0 z-[90]`, not a Radix Dialog), `StudioNodeAssistantDock.tsx:613`, `CanvasAssistantToggle.tsx:33`, node inspector previews. | High     |
| A4  | **Open/close state has 3 owners**: Studio reducer panels (`FormContext.panels.*`), scattered local `useState` (e.g. `GenerationPreview.tsx:104` has two booleans), and URL query params (LoRA workbench sections). No rule for which to use.                                                                                                                         | High     |
| A5  | **Destructive confirm is split** between Radix `AlertDialog` (`LoraAssetCard`, `StudioNodeWorkbench.tsx:1002`) and a custom `ConfirmDialog` wrapper (`ApiKeyRow`, `ImageDetailModal`, `AssetDetailSheet`). Different layout for the same "are you sure".                                                                                                             | Medium   |
| A6  | **Nested overlay chains** (Popover→Dialog in `ReferenceImageChip`, Drawer-in-Drawer on mobile LoRA) create Esc/focus-restore edge cases.                                                                                                                                                                                                                             | Medium   |
| A7  | Dialog vs Popover has no weight rule: Enhance (heavy) = Dialog but PromptTemplatePicker (equally heavy) = Popover.                                                                                                                                                                                                                                                   | Medium   |

## B. Motion & texture (动效 / 质感)

Inventory: framer-motion in exactly 8 files; 21 `@keyframes` (17 globals.css /
2 homepage.css / 2 PolaroidCard); Tailwind `animate-*` ~144 occurrences.

| #   | Finding                                                                                                                                                                                                                                                                                                | Severity |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| B1  | **Two competing easing dialects, no canonical curve.** CSS studio/homepage keyframes use `cubic-bezier(0.22, 1, 0.36, 1)`; `StudioPromptArea.tsx` framer code uses `[0.4, 0, 0.2, 1]`; other framer files use named `easeOut`/`easeInOut`. Nothing is exported as a constant.                          | High     |
| B2  | **Duration scatter with no scale**: 150 / 180 / 220 / 250 / 300 / 350 / 360 / 380 / 400 / 500 / 700 / 800 ms all in active use. Stagger rhythm also differs (Studio 50ms steps vs homepage 70ms steps).                                                                                                | Medium   |
| B3  | **All 8 framer-motion files ignore `prefers-reduced-motion`** (no `useReducedMotion`). CSS animations are covered by the global media query (`globals.css:1176`), JS-driven ones are not.                                                                                                              | Medium   |
| B4  | **Hardcoded colors break token discipline in the most visible component**: `StudioPromptArea.tsx:1074` uses `bg-white text-neutral-950` (the composer bar on the dark studio canvas); `TagSourceBadge.tsx` `bg-zinc-900`; `PromptTagTray.tsx` `bg-neutral-100/200`. Violates the no-magic-values rule. | High     |
| B5  | **Radius mixing at the same hierarchy level**: cards split `rounded-2xl` (244 uses) vs `rounded-xl` (167); `dialog.tsx:70` is `rounded-lg` while most panels are `rounded-2xl`.                                                                                                                        | Medium   |
| B6  | `--shadow-node-panel` token exists but generic `shadow-sm` dominates (67 vs 17 uses); 9 ad-hoc tinted shadows (`shadow-primary/20`, `shadow-black/25`). No elevation ladder.                                                                                                                           | Low      |

## C. Mobile

Architecture: rail `w-11` + header `h-11` + bottom tab bar `h-12`; Studio dock
panels go through `ResponsiveDialog` → bottom Drawer (good); everything else is
patchy.

| #   | Finding                                                                                                                                                                                                                         | Severity |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| C1  | **Soft keyboard hides the dock / Generate button** (sticky dock, no `visualViewport` handling — `globals.css:927-935`, `StudioResizableLayout.tsx:24`). Confirmed by real-device facts in `docs/design/system/layout-shell.md`. | High     |
| C2  | **Transform / Reverse-Engineer / edit panels use bare `Dialog`, not `ResponsiveDialog`** → cramped centered modals on phones (`StudioTransformPanel.tsx`, `ReverseEngineerPanel.tsx`).                                          | High     |
| C3  | **Reference-image drag & drop is desktop-only** (Pragmatic DnD, `StudioCanvas.tsx:146`); upload-chip path exists but drag affordance is dead weight on touch.                                                                   | High     |
| C4  | **Tablet band broken**: at 768–1023px `useIsMobile()` returns false → desktop sidebar mounts and the studio canvas gets clipped (overflow hidden on shell).                                                                     | High     |
| C5  | Select dropdowns and fixed widths overflow narrow viewports: `GalleryFilterBar.tsx:206-241` (`w-[130px]`/`w-[180px]`), `AssetDetailSheet.tsx:662` (`w-[min(34rem,90vw)]`), `MediaDetailViewer.tsx:214`.                         | Medium   |
| C6  | Touch targets below 44px in studio toolbar (`size="icon"` ≈ 24–32px) — violates the project's 44px rule.                                                                                                                        | Medium   |
| C7  | Node canvas / 3D viewer touch interaction untested and likely partial (xyflow has native touch, our popovers don't).                                                                                                            | Medium   |
| C8  | **e2e mobile coverage is only horizontal-overflow checks on a few pages** — zero coverage for studio flows, keyboard behavior, drawers, touch.                                                                                  | High     |

## D. Operation logic / IA

| #   | Finding                                                                                                                                                                                                                            | Severity |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| D1  | **Generated result has no "saved" affordance** — no toast/badge telling users it landed in Gallery/Assets; users can believe work is lost.                                                                                         | High     |
| D2  | **No "Edit this" from the canvas result** — editing a just-generated image requires detouring via Gallery/Assets detail (2–3 extra clicks + page load) even though `studioImageEditPath()` exists.                                 | High     |
| D3  | **No "Save prompt" from the canvas** — saving a recipe requires leaving Studio for `/gallery/[id]` → `/prompts?create=1...`.                                                                                                       | Medium   |
| D4  | **Result actions differ per surface** (canvas vs gallery detail vs assets modal) — no shared ResultActions component.                                                                                                              | Medium   |
| D5  | **LoRA / Node / 3D / Edit live outside the shared `StudioProvider`** — context resets between tools; Edit hub additionally uses a different visual language than the dark studio canvas, so it doesn't feel like the same product. | Medium   |
| D6  | Edit placeholders (`object-replace`, `style-transfer`, `text-render`) render as full equal cards in the task grid → broken expectations on click.                                                                                  | Medium   |
| D7  | First-run onboarding backdrop (z-40) blocks the sidebar toggle; custom account menu popover breaks keyboard navigation (no Radix menu roles).                                                                                      | Medium   |
| D8  | Generate button uses `aria-disabled` but stays clickable — conflicting signals for AT users.                                                                                                                                       | Low      |

---

## Top cross-cutting issues

1. There is no **disclosure decision rule** — A1/A2/A4 are one root cause, and C2 is its mobile symptom.
2. There is no **motion/easing/duration canon** — B1/B2/B3 are one root cause.
3. Mobile failures concentrate on **three mechanics**: keyboard-aware dock (C1), ResponsiveDialog adoption (C2/A2), tablet breakpoint (C4).
4. The result lifecycle (generate → where did it go → act on it) is the biggest **flow** gap: D1/D2/D3/D4 are one feature ("unified result actions + persistence affordance").
5. Custom overlays (A3) are the biggest **rewrite risk** — migrate them to primitives before any visual restyling, or the restyle has to be done twice.

## Proposed direction (DRAFT — for discussion, not final)

Per `docs/design/README.md`, nothing here is final until discussed.

1. **Disclosure decision tree** (one page, then enforced): anchored quick-config
   with ≤ ~6 options → Popover; anything browsable/searchable or form-like →
   `ResponsiveOverlay` (Dialog on desktop / bottom Drawer on mobile, one shared
   primitive); destructive confirm → AlertDialog only; full detail → route.
   Migrate the 7 custom overlays onto primitives.
2. **Motion constants module** (`src/constants/motion.ts`): one easing token
   (candidate: `cubic-bezier(0.22, 1, 0.36, 1)` — already the CSS majority),
   a duration scale (e.g. 120/200/320/500), one stagger rule; `useReducedMotion`
   in all framer components.
3. **Mobile mechanics first, cosmetics second**: visualViewport-aware dock,
   ResponsiveOverlay adoption on the panels in C2, tablet breakpoint decision
   (proposal: desktop sidebar at ≥1024px), 44px touch-target floor.
4. **Unified ResultActions** component shared by canvas/gallery/assets +
   "saved to gallery" affordance on generation completion.
5. Token cleanup for B4 hardcoded colors (blocked on Phase 0 taste direction
   for actual values; the _mechanical_ fix to tokens can proceed).

## Validation method

- Pass 2 (live run) must confirm: C1 keyboard behavior on a real/emulated
  viewport, C2 dialog cramping, A3 overlay focus/Esc behavior, C4 tablet band,
  D7 onboarding block.
- Every fix wave then follows the CLAUDE.md confirmation ladder: lint+build →
  `e2e/visual.spec.ts` (+ baseline updates named explicitly) → `toHaveCSS` /
  `getByRole` assertions for changed tokens/targets → interaction run.

## Follow-up decisions (owner input needed)

1. Taste references (参考集) — still pending; blocks Phase 0 direction and the
   value side of B4/B5.
2. Pilot surface for Phase 2 (样板间) — candidates: Studio image workspace
   (highest impact, highest risk) vs Gallery (visible, lower risk).
3. Sign-off on the disclosure decision tree + ResponsiveOverlay consolidation.
4. Tablet breakpoint policy (≥1024px desktop sidebar?).
5. Motion canon values (easing/duration scale) — pick after taste references.
