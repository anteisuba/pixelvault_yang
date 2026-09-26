import 'server-only'

import type { ImageSubmitResponseData, StudioGenerateRequest } from '@/types'
import { getModelById } from '@/constants/models'
import { getMaxReferenceImages } from '@/constants/provider-capabilities'
import { compileImageOutlet } from '@/lib/card-bus-compile'
import { loadCardBusCharacters } from '@/services/cards/card-bus.service'
import { compileRecipe } from '@/services/kernel/card-recipe-compiler.service'
import { submitImageGeneration } from '@/services/image/submit-image.service'
import { ensureUser } from '@/services/user.service'
import { GenerationValidationError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import {
  compileReferenceMentions,
  getReferenceMentionIndices,
} from '@/lib/studio-reference-mentions'

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
  const mentionIndices = getReferenceMentionIndices(input.freePrompt ?? '')
  const unavailableMention = mentionIndices.some(
    (index) => !input.referenceImages?.[index],
  )
  if (unavailableMention) {
    const message = 'Referenced image is no longer available'
    throw new GenerationValidationError(
      [{ field: 'freePrompt', message }],
      message,
    )
  }

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
    const catalogModel = getModelById(input.modelId)
    const promptLimit = catalogModel?.maxPromptChars
    const userReferences = input.referenceImages ?? []
    const advanced = (input.advancedParams ?? {}) as Record<string, unknown>

    /**
     * ⭐ 在场角色卡走卡片总线（进度表 35 ⑤）：每个角色的视觉文字进正文前缀，
     * 卡图排在用户参考图**之后**（`@图N` 的下标不被挤动），角色负面排在负面最后。
     */
    const characters = input.characterCardIds?.length
      ? await loadCardBusCharacters(dbUser.id, input.characterCardIds)
      : []
    const outlet = compileImageOutlet(characters, {
      adapterType: catalogModel?.adapterType ?? '',
      modelId: input.modelId,
      maxReferenceImages: catalogModel
        ? getMaxReferenceImages(catalogModel.adapterType, input.modelId)
        : 1,
      userReferenceCount: userReferences.length,
      hasNovelAiLayout: advanced.novelAiLayout !== undefined,
      hasLoras: Array.isArray(advanced.loras) && advanced.loras.length > 0,
    })

    const freePrompt = [
      outlet.promptPrefix,
      compileReferenceMentions(input.freePrompt ?? ''),
    ]
      .filter(Boolean)
      .join('\n\n')
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

    const negativePrompt = [
      typeof advanced.negativePrompt === 'string'
        ? advanced.negativePrompt
        : '',
      outlet.negative ?? '',
    ]
      .filter((part) => part.trim())
      .join(', ')

    // B5: Inject seed override into advancedParams
    const mergedQuickAdvanced = {
      ...advanced,
      ...(negativePrompt ? { negativePrompt } : {}),
      ...(outlet.novelAiLayout ? { novelAiLayout: outlet.novelAiLayout } : {}),
      ...(input.seed != null ? { seed: input.seed } : {}),
    }

    const referenceImages = [...userReferences, ...outlet.referenceImages]
    // 图例逐位对齐整串参考图：用户自己挂的那几张没有说明（null）。
    const referenceImageLabels = outlet.referenceLabels.length
      ? [...userReferences.map(() => null), ...outlet.referenceLabels]
      : undefined
    const requestInput = {
      prompt: freePrompt,
      modelId: input.modelId,
      apiKeyId: input.apiKeyId,
      aspectRatio: input.aspectRatio ?? '1:1',
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      ...(referenceImageLabels ? { referenceImageLabels } : {}),
      advancedParams:
        Object.keys(mergedQuickAdvanced).length > 0
          ? mergedQuickAdvanced
          : undefined,
      projectId: input.projectId,
      recipeUsage: input.recipeUsage,
      ...(characters.length
        ? { characterCardIds: characters.map((character) => character.cardId) }
        : {}),
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
        displayLabel: input.displayLabel,
        // 快照带 (cardId, version)：改了卡之后仍能指认这张图用的是哪一版。
        ...(characters.length
          ? {
              studioSnapshot: {
                characterCards: characters.map((character) => ({
                  id: character.cardId,
                  version: character.version,
                })),
              },
            }
          : {}),
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
    freePrompt: mentionIndices.length ? undefined : input.freePrompt,
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
      prompt: mentionIndices.length
        ? [
            compiled.compiledPrompt,
            compileReferenceMentions(
              input.freePrompt ?? '',
              compiled.referenceImages.length,
            ),
          ]
            .filter(Boolean)
            .join('\n\n')
        : compiled.compiledPrompt,
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
      displayLabel: input.displayLabel,
      studioSnapshot: {
        freePrompt: input.freePrompt,
        characterCardId: input.characterCardId,
        backgroundCardId: input.backgroundCardId,
        styleCardId: input.styleCardId,
      },
    },
  )
}
