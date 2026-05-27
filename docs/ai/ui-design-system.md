# PixelVault AI UI Design System

This document defines the UI direction for PixelVault as an AI creation gallery for image, video, and audio generation. It is the local design-system authority until a dedicated design-system skill is installed, reviewed, and reconciled with project rules.

## Product Direction

- Mobile-first.
- Dark-mode-first.
- Creation-tool feel: focused, direct, media-rich, and operational.
- Suitable for image, video, audio, gallery, arena, storyboard, profile, and creator workflows.
- Translation-ready for English, Japanese, and Chinese.
- Avoid generic AI styling: no random purple gradients, meaningless glassmorphism, oversized empty heroes, inconsistent spacing, or decorative effects that reduce clarity.

## Visual Principles

- Lead with the user artifact: prompt, generated media, model choice, timeline, gallery item, or creator work.
- Keep repeated creation flows dense but calm.
- Use cards for repeated items, tools, modals, and framed media only. Do not nest cards inside cards.
- Prefer quiet structure over decorative chrome.
- Make each screen's primary action obvious and reachable on mobile.
- Use motion only when it clarifies state, continuity, or feedback.

## Color

Dark surfaces should be neutral and layered:

- App background: near-black neutral.
- Raised surfaces: slightly lighter neutral with subtle borders.
- Primary action: high-contrast accent, used sparingly.
- Secondary accents: separate hues for creation status, model metadata, and destructive states.
- Avoid one-note palettes dominated by a single hue family.
- Avoid broad purple or purple-blue gradients unless the page concept explicitly requires them and contrast remains strong.

Use semantic tokens or existing Tailwind theme tokens. Do not place raw color decisions in many components when a reusable token or class should exist.

## Typography

- Body copy must stay readable on mobile, with 16px as the practical minimum for interactive text fields.
- Use compact headings inside panels and tools. Reserve hero-scale type for true heroes only.
- Do not scale font size directly with viewport width.
- Letter spacing should remain 0 unless a specific existing token requires otherwise.
- English, Japanese, and Chinese text must fit without clipped labels, broken buttons, or layout overlap.
- Test long translated labels and long model names before treating a component as complete.

## Spacing

Use a consistent spacing rhythm based on existing Tailwind tokens:

- 2, 3, and 4 for compact control interiors.
- 4 and 6 for panel padding.
- 6, 8, and 10 for page rhythm.
- 12 and above only for true section separation.

Avoid arbitrary spacing values unless they solve a real layout constraint that tokens cannot express cleanly.

## Containers

- Mobile content should use full width with safe horizontal padding.
- Desktop content should use stable max-width containers.
- Tool surfaces should not shift when controls load, labels wrap, hover states appear, or media metadata changes.
- Media grids need explicit aspect ratios.
- Use `min-w-0` in flex and grid children that contain translated text or long model names.

## Cards

Cards are for repeated artifacts or framed tools.

- Radius: 8px or less unless an existing component token requires more.
- Border: subtle, consistent, and visible in dark mode.
- Shadow: restrained; use elevation to clarify hierarchy, not decoration.
- Media: reserve aspect ratio and avoid layout shift.
- Text: title, key metadata, and primary action should remain scannable.

## Buttons

- One primary action per screen or panel.
- Use icons for familiar actions when lucide icons exist.
- Icon-only buttons need accessible labels and tooltips when meaning is not obvious.
- Touch targets should be at least 44px where practical.
- Disabled, loading, hover, focus, and pressed states must be distinct.
- Button text must not wrap awkwardly or overflow in English, Japanese, or Chinese.

## Inputs

Prompt input is a first-class creative surface.

- Textareas must support long prompts without horizontal scroll.
- Labels must be visible or clearly associated; do not rely on placeholder-only labeling.
- Helper text and errors should sit near the related field.
- Focus rings must remain visible in dark mode.
- Mobile prompt controls must stay reachable when the keyboard is open.
- Avoid fixed bottom controls that cover focused fields.

## Modals, Drawers, And Bottom Sheets

- Use modal for focused confirmation or inspection.
- Use drawer or bottom sheet for mobile editing, model selection, filters, and settings.
- Sheets must account for safe area and visual viewport changes.
- Provide clear close/back behavior.
- Avoid nested scroll traps.
- Critical actions must remain reachable without precision tapping.

## Gallery Grid

- Mobile: 1 to 2 columns depending on content density and media aspect ratio.
- Tablet: 2 to 3 columns.
- Desktop: 3 to 5 columns depending on available metadata.
- Use stable aspect ratios and reserved image dimensions.
- Long titles and metadata must truncate or wrap predictably.
- Empty, loading, and error states must be translation-ready and visually aligned with the grid.

## Tailwind Rules

- Prefer standard Tailwind tokens and existing utilities.
- Avoid arbitrary values when a token is available.
- Use `min-h-dvh`, `min-h-svh`, or `h-dvh` for viewport-height layouts.
- Use safe-area padding for bottom navigation, sticky bars, and sheets.
- Use `overflow-x-hidden` only with source inspection; do not hide broken layout as a substitute for fixing it.
- Use `grid-flow-dense` only when the grid math is clear and the visual order remains acceptable.
- Keep route paths, model IDs, provider names, and reusable UI modes in constants.

## Skill Usage

- Taste Skill: visual upgrade and anti-generic direction.
- Anthropic `frontend-design`: production-grade component and page implementation.
- `ui-ux-pro-max`: audit, accessibility, touch behavior, responsive, forms, modals, cards, and motion.
- Project AGENTS rules and this document override skill rules when there is a conflict.
