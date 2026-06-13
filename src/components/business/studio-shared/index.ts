/**
 * Public API for the L1.5 Studio Shared layer.
 *
 * Studio Shared hosts UI / hooks that are consumed by 2+ Studio tools
 * (Image, Video, Audio, 3D, Edit, LoRA, Node) and carry no
 * tool-specific business logic. See:
 *   docs/spark/2026-05-28-architecture-contract-design.md
 *   docs/spark/2026-05-28-spec-2-studio-shared-layer.md
 *
 * External modules MUST import from this index, not from individual
 * files inside chrome/ setup/ workflow/ primitives/.
 *
 * Status (Spec 2, 2026-05-28): first batch of 16 files. Remaining 3
 * giants (StudioPromptArea, GenerationPreview, StudioDockPanelArea)
 * and 24 other SHARED files stay in the flat
 * studio/ layer until Spec 6 splits and relocates them.
 */

// chrome — workbench shell components
export * from './chrome/ActiveLoraBar'
export * from './chrome/StudioBottomDock'
export * from './chrome/StudioCanvas'
export * from './chrome/StudioCommandPalette'
export * from './chrome/StudioErrorBoundary'
export * from './chrome/StudioLightbox'
export * from './chrome/StudioResizableLayout'

// setup — API key / model configuration gates
export * from './setup/QuickSetupDialog'
export * from './setup/StudioApiRoutesSection'

// workflow — workflow / mode selection chrome
export * from './workflow/StudioGenerateBar'
export * from './workflow/StudioModeSelector'
export * from './workflow/StudioWorkflowGroupTabs'
export * from './workflow/StudioWorkflowPicker'
export * from './workflow/StudioWorkflowSummary'

// primitives — small atomic UI shared across tools
export * from './primitives/tool-surface'
