// L1.5 studio-shared (Spec 2): re-exported for backward compat with
// callers that still import from the studio barrel. New code should
// import directly from '@/components/business/studio-shared' once that
// public API ships in Action 3.
export { StudioModeSelector } from '@/components/business/studio-shared/workflow/StudioModeSelector'
export { StudioGenerateBar } from '@/components/business/studio-shared/workflow/StudioGenerateBar'
export { StudioErrorBoundary } from '@/components/business/studio-shared/chrome/StudioErrorBoundary'
export { StudioApiRoutesSection } from '@/components/business/studio-shared/setup/StudioApiRoutesSection'
export { StudioCanvas } from '@/components/business/studio-shared/chrome/StudioCanvas'
export { StudioBottomDock } from '@/components/business/studio-shared/chrome/StudioBottomDock'
export { StudioFlowLayout } from '@/components/business/studio-shared/chrome/StudioResizableLayout'
export { StudioWorkflowGroupTabs } from '@/components/business/studio-shared/workflow/StudioWorkflowGroupTabs'
export { StudioWorkflowPicker } from '@/components/business/studio-shared/workflow/StudioWorkflowPicker'
export { StudioWorkflowSummary } from '@/components/business/studio-shared/workflow/StudioWorkflowSummary'
export { StudioLightbox } from '@/components/business/studio-shared/chrome/StudioLightbox'
export { StudioCommandPalette } from '@/components/business/studio-shared/chrome/StudioCommandPalette'
export { StudioFaceConsentModal } from '@/components/business/studio-shared/setup/StudioFaceConsentModal'

// Still flat — to be relocated by Spec 6 (4 giants + 24 remaining SHARED)
// or by individual L2 module specs.
export { StudioPromptArea } from './StudioPromptArea'
export { GenerationPreview } from './GenerationPreview'
export { StudioToolbarPanels } from './StudioToolbarPanels'
export { StudioCardSection } from './StudioCardSection'
export { StudioQuickRouteSelector } from './StudioQuickRouteSelector'
export { StudioGallery } from './StudioGallery'
export { StudioTransformPanel } from './StudioTransformPanel'
export { StudioInputImage } from './StudioInputImage'
export { StudioTransformToggle } from './StudioTransformToggle'
export { StudioVariantsGrid } from './StudioVariantsGrid'
export { StudioSceneProgress } from './StudioSceneProgress'
export { StudioSceneFeedback } from './StudioSceneFeedback'
export type { SceneFeedbackAction } from './StudioSceneFeedback'
