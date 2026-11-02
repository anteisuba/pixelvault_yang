/**
 * 工作台域的对外入口（客户端）。域外只从这里引，⛔ 直引域内文件
 *（见 docs/design/features-migration.md）。
 */
export { GenerationPreview } from './components/GenerationPreview'
export { Studio3DWorkspace } from './components/Studio3DWorkspace'
export { StudioCharacterDeepLink } from './components/StudioCharacterDeepLink'
export { type CostPreviewBasis } from './components/StudioCostPreview'
export {
  type InpaintMaskDraft,
  StudioInpaintEditor,
} from './components/StudioInpaintEditor'
export { StudioMobileAddSheet } from './components/StudioMobileAddSheet'
export { StudioModeSync } from './components/StudioModeSync'
export { ModelCapabilityControlPanel } from './components/StudioModelCapabilityChips'
export { StudioWorkspaceUI } from './components/StudioWorkspaceUI'
export { VoiceTrainer } from './components/VoiceTrainer'
export { CompareGrid } from './components/image/CompareGrid'
export { StudioResultFeedback } from './components/image/StudioResultFeedback'
export { isTagSuggestionsTarget } from './components/tags/StudioTagSuggestions'
export { StudioTagTextField } from './components/tags/StudioTagTextField'
export { TagLibraryView } from './components/tags/library/TagLibraryView'
export { StudioTemplateUndoToast } from './components/templates/StudioTemplateUndoToast'
export { StudioTemplatesChip } from './components/templates/StudioTemplatesChip'
export { StudioTemplatesPanel } from './components/templates/StudioTemplatesPanel'
export { VoiceBench } from './components/voice-bench/VoiceBench'
export { useStudioModeModelOptions } from './hooks/use-studio-mode-model-options'
export { useStudioSearchGrounding } from './hooks/use-studio-search-grounding'
