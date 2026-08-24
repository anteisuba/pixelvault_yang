import 'server-only'

import type { ImageSubmitResponseData, StudioGenerateRequest } from '@/types'
import { getModelById } from '@/constants/models'
import { compileRecipe } from '@/services/kernel/card-recipe-compiler.service'
import { submitImageGeneration } from '@/services/image/submit-image.service'
import { ensureUser } from '@/services/user.service'
import { GenerationValidationError } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * Studio generation — two paths:
 *
 * Quick mode (modelId present):
 *   Skip recipe compilation → submit image worker job
 *
 * Card mode (styleCardId present):
 *   compileRecipe → submit image worker job
 */
export async function compileAndGenerate(
  clerkId: string,
  input: StudioGenerateRequest,
): Promise<ImageSubmitResponseData> {
  const dbUser = await ensureUser(clerkId)

  // ── Quick mode: modelId direct path ─────────────────────────
  if (input.modelId) {
    /**
     * ⚠ 兜底从 `CARD_RECIPE.FREE_PROMPT_MAX_LENGTH`（2000）改成**没有兜底**
     * （owner 2026-08-24）。那个 2000 的主人是卡片配方里「动作 / 姿势」那个
     * 输入框，被借来当了 quick 模式的默认上限；而这条链路真正的边界是
     * `StudioGenerateSchema` 的 `FREE_PROMPT_ABSOLUTE_MAX_LENGTH`（32000），
     * 常量注释本来就写着「per-model gates decide the real quick-mode cap」。
     *
     * 模型声明了 `maxPromptChars` 就按它拦（那是厂商的真实上限，提前拦比让
     * provider 报一句英文错更有用）；没声明就不拦 —— 与音频侧
     * `resolveAudioTextLimit` 的两层同构：不给未知模型编一个上限。
     */
    const promptLimit = getModelById(input.modelId)?.maxPromptChars
    const freePrompt = input.freePrompt ?? ''
    if (promptLimit !== undefined && freePrompt.length > promptLimit) {
      const message = `提示词超过该模型上限 ${promptLimit} 字符`
      throw new GenerationValidationError(
        [{ field: 'freePrompt', message }],
        message,
      )
    }

    logger.info('[StudioGenerate] Quick mode — direct generation', {
      userId: dbUser.id,
      modelId: input.modelId,
      hasApiKeyId: !!input.apiKeyId,
    })

    // B5: Inject seed override into advancedParams
    const mergedQuickAdvanced = {
      ...(input.advancedParams
        ? (input.advancedParams as Record<string, unknown>)
        : {}),
      ...(input.seed != null ? { seed: input.seed } : {}),
    }

    const requestInput = {
      prompt: freePrompt,
      modelId: input.modelId,
      apiKeyId: input.apiKeyId,
      aspectRatio: input.aspectRatio ?? '1:1',
      referenceImages:
        input.referenceImages && input.referenceImages.length > 0
          ? input.referenceImages
          : undefined,
      advancedParams:
        Object.keys(mergedQuickAdvanced).length > 0
          ? mergedQuickAdvanced
          : undefined,
      projectId: input.projectId,
      recipeUsage: input.recipeUsage,
    }

    return submitImageGeneration(
      clerkId,
      requestInput,
      {},
      {
        runGroupId: input.runGroupId,
        runGroupType: input.runGroupType,
        runGroupIndex: input.runGroupIndex,
        sourceSurface: input.sourceSurface,
      },
    )
  }

  // ── Card mode: recipe compilation path ──────────────────────
  logger.info('[StudioGenerate] Card mode — compiling recipe', {
    userId: dbUser.id,
    styleCardId: input.styleCardId,
    characterCardId: input.characterCardId,
    backgroundCardId: input.backgroundCardId,
  })

  const compiled = await compileRecipe({
    userId: dbUser.id,
    characterCardId: input.characterCardId,
    backgroundCardId: input.backgroundCardId,
    styleCardId: input.styleCardId,
    freePrompt: input.freePrompt,
  })

  logger.info('[StudioGenerate] Recipe compiled, starting generation', {
    userId: dbUser.id,
    modelId: compiled.modelId,
    adapterType: compiled.adapterType,
  })

  // Merge card-based reference images with user-uploaded ones from toolbar
  const allReferenceImages = [
    ...compiled.referenceImages,
    ...(input.referenceImages ?? []),
  ]

  // Merge advanced params: compiled (from StyleCard) is base, input override takes precedence
  const mergedAdvancedParams =
    input.advancedParams || compiled.advancedParams || input.seed != null
      ? {
          ...(compiled.advancedParams ?? {}),
          ...(input.advancedParams ?? {}),
          ...(input.seed != null ? { seed: input.seed } : {}),
        }
      : undefined

  return submitImageGeneration(
    clerkId,
    {
      prompt: compiled.compiledPrompt,
      modelId: compiled.modelId,
      aspectRatio: input.aspectRatio ?? '1:1',
      referenceImages:
        allReferenceImages.length > 0 ? allReferenceImages : undefined,
      advancedParams: mergedAdvancedParams,
      projectId: input.projectId,
      recipeUsage: input.recipeUsage,
    },
    {},
    {
      runGroupId: input.runGroupId,
      runGroupType: input.runGroupType,
      runGroupIndex: input.runGroupIndex,
      sourceSurface: input.sourceSurface,
      studioSnapshot: {
        freePrompt: input.freePrompt,
        characterCardId: input.characterCardId,
        backgroundCardId: input.backgroundCardId,
        styleCardId: input.styleCardId,
      },
    },
  )
}
