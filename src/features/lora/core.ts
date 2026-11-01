/**
 * lora 域的对外入口 —— 纯函数与常量（不带 React、不碰库），客户端和服务端都能引
 *（见 docs/design/features-migration.md）。
 */
export {
  getBaseOnlyGenerationBases,
  getCompatibleBases,
  getDefaultBase,
  LORA_BASE_MODELS,
  type LoraBaseFamily,
  normalizeToLoraBaseFamily,
  resolveLoraStackWeightBudget,
} from './constants/lora-base-models'
export {
  findForbiddenDialectHits,
  LORA_PROMPT_DIALECTS,
} from './constants/lora-prompt-dialects'
export {
  civitaiDisplayImageUrl,
  proxyCivitaiImageUrl,
} from './lib/civitai-image-url'
export {
  buildLoraDialectRule,
  buildLoraDialectSection,
  isLoraNegativeInert,
  resolveLoraDialect,
} from './lib/lora-dialect-section'
export { isLoraBaseModelMountCompatible } from './lib/lora-model-compatibility'
export { mergeNegativePrompt } from './lib/lora-source-match-prompt'
export { buildLibraryFavoriteRequest } from './lib/lora-source-snapshot'
export { cleanTriggerToken } from './lib/lora-trigger-clean'
export {
  loraTemplateFallbackName,
  readRecipeAspectRatio,
  readRecipeLoraSetup,
  readRecipeNegativePrompt,
  readRecipeNovelAiCharacters,
  readRecipeRunnerParameters,
  type RecipeLoraRead,
  withRecipeNegativePrompt,
} from './lib/recipe-lora-setup'
