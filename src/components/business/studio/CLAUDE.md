# src/components/business/studio/ — Studio Workspace Components

## Risk Level: HIGH (31 tightly-coupled components sharing 3 contexts)

## Component Tree

```
StudioPage
├── StudioResizableLayout
│   ├── StudioTopBar (mode selector, top actions)
│   ├── StudioSidebar
│   │   ├── StudioModeSelector (image/video/audio)
│   │   ├── StudioQuickRouteSelector (model selector)
│   │   ├── StudioCardSection → StudioCardSelectors (char/bg/style cards)
│   │   ├── StudioCardManagement (card CRUD)
│   │   └── StudioToolbarPanels (enhance, reverse, advanced, refImage, etc.)
│   └── StudioCanvas
│       ├── StudioPreview → GenerationPreview (current result)
│       ├── CompareGrid (B4 — side-by-side compare)
│       └── VariantGrid (B5 — multi-variant generation)
├── StudioBottomDock
│   ├── StudioPromptArea (prompt input + generate button)
│   ├── StudioGenerateBar (aspect ratio + generate action)
│   ├── StudioDockPanelArea (mobile panel area)
│   └── StudioGallery (sidebar history gallery)
├── StudioPanelSheets (mobile drawer panels)
├── StudioPanelPopovers (desktop popover panels)
├── StudioLightbox (fullscreen image viewer)
├── StudioCommandPalette (Cmd+K quick actions)
└── StudioErrorBoundary (error recovery)
```

## Data Flow

```
User Input (prompt, aspect ratio, cards)
    ↓
StudioFormContext (HOT — useStudioForm)
    ↓
StudioDataContext (cards, projects via useStudioData)
    ↓
useUnifiedGenerate() → POST /api/studio/generate
    ↓
StudioGenContext (result via useStudioGen)
    ↓
GenerationPreview renders result
```

## Rules

1. **Before modifying any component**: check which context hooks it uses (`useStudioForm`, `useStudioData`, `useStudioGen`)
2. **Panels**: controlled by `StudioFormState.panels` — toggling is handled by reducer dispatch, not local state
3. **Mobile vs Desktop**: `StudioPanelSheets` (mobile) and `StudioPanelPopovers` (desktop) render the same panel content — changes must update both
4. **Entry point**: `index.ts` re-exports the main component

## Relatively Isolated Components (safer to modify)

- `CompareGrid.tsx` — B4 compare feature, self-contained
- `VariantGrid.tsx` — B5 variant feature, self-contained
- `StudioCommandPalette.tsx` — Cmd+K overlay, reads context but doesn't write
- `StudioLightbox.tsx` — Fullscreen viewer, display-only
- `StudioErrorBoundary.tsx` — Error recovery wrapper

## High-Risk Components (modify with caution)

- `StudioPromptArea.tsx` — Core input, dispatches to FormContext
- `StudioCanvas.tsx` — Uses Pragmatic DnD, complex layout logic
- `StudioSidebar.tsx` — Orchestrates card selection + model options
- `StudioResizableLayout.tsx` — Controls panel sizes, affects all children
