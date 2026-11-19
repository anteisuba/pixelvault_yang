import 'server-only'

import type { StudioGenerateRequest, StudioGenerateResponseData } from '@/types'
import { getModelById } from '@/constants/models'
import {
  getMaxCharacterReferenceImages,
  getMaxReferenceImages,
} from '@/constants/provider-capabilities'
import {
  compileImageOutlet,
  type CardBusCharacter,
} from '@/lib/card-bus-compile'
import {
  loadCardBusCharacters,
  ownedCharacterCardIds,
} from '@/features/cards/server'
import { submitImageGeneration } from '@/services/image/submit-image.service'
import { ensureUser } from '@/services/user.service'
import { GenerationValidationError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import {
  compileReferenceMentions,
  getReferenceMentionIndices,
} from '@/lib/studio-reference-mentions'

/**
 * Studio generation: selected model + 在场角色卡（卡片总线）→ submit image worker job.
 * （风格卡驱动的卡片配方编译 2026-10-21 随风格卡下线。）
 */
export async function compileAndGenerate(
  clerkId: string,
  input: StudioGenerateRequest,
): Promise<StudioGenerateResponseData> {
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

  /**
   * ⚠ 兜底从卡片配方那个 2000 改成**没有兜底**（owner 2026-08-24；那个 2000
   * 本身也在 09-27 随「提示词不设我们自己的字数上限」删了）。这条链路剩下的
   * 边界只有 `StudioGenerateSchema` 的防滥用护栏 `PROMPT_TEXT_GUARD_MAX_CHARS`。
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
    ? await loadCardBusCharacters(
        dbUser.id,
        input.characterCardIds,
        input.characterImagePicks,
        input.characterLookIds,
      )
    : []
  const outlet = compileImageOutlet(characters, {
    adapterType: catalogModel?.adapterType ?? '',
    modelId: input.modelId,
    maxReferenceImages: catalogModel
      ? getMaxReferenceImages(catalogModel.adapterType, input.modelId)
      : 1,
    ...(catalogModel
      ? {
          maxCharacterReferenceImages: getMaxCharacterReferenceImages(
            catalogModel.adapterType,
            input.modelId,
          ),
        }
      : {}),
    userReferenceCount: userReferences.length,
    hasNovelAiLayout: advanced.novelAiLayout !== undefined,
    novelAiPreciseReference: input.characterNovelAiPreciseReference === true,
    hasInpaintMask: typeof advanced.inpaintMask === 'string',
  })
  // 只记归属的角色（LoRA 台）：本人的才记，已在场（走了编译）的不重复。
  const attributedIds = input.characterAttributionIds?.length
    ? (
        await ownedCharacterCardIds(dbUser.id, input.characterAttributionIds)
      ).filter((id) => !characters.some((character) => character.cardId === id))
    : []
  const linkedCardIds = [
    ...characters.map((character) => character.cardId),
    ...attributedIds,
  ]

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

  logger.info('[StudioGenerate] Direct generation', {
    userId: dbUser.id,
    modelId: input.modelId,
    hasApiKeyId: !!input.apiKeyId,
  })

  const negativePrompt = [
    typeof advanced.negativePrompt === 'string' ? advanced.negativePrompt : '',
    outlet.negative ?? '',
  ]
    .filter((part) => part.trim())
    .join(', ')

  // B5: Inject seed override into advancedParams
  const mergedQuickAdvanced = {
    ...advanced,
    ...(negativePrompt ? { negativePrompt } : {}),
    ...(outlet.novelAiLayout ? { novelAiLayout: outlet.novelAiLayout } : {}),
    // 卡图走精确参考：⛔ 不能落成图生图底图（worker 按这一项分辨）。
    ...(outlet.novelAiPreciseReference
      ? { novelAiReferenceMode: 'precise' as const }
      : {}),
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
    ...(linkedCardIds.length
      ? {
          characterCardIds: linkedCardIds,
          characterLookIds: characterLookIdsOf(characters),
        }
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
      conversationId: input.conversationId,
      // 快照带 (cardId, version)：改了卡之后仍能指认这张图用的是哪一版；带上造型，
      // 重混时能把她原样挂回去。
      // `freePrompt` = 用户自己写的那句（编译前）：重混回填、详情「提示词」都读它，
      // ⛔ 读 `prompt`（那是拼了角色前缀的编译串）。
      studioSnapshot: {
        ...(input.freePrompt ? { freePrompt: input.freePrompt } : {}),
        ...(characters.length
          ? {
              characterCards: characters.map((character) => ({
                id: character.cardId,
                version: character.version,
                ...(character.lookId ? { lookId: character.lookId } : {}),
                // 当时勾的那几张：重混原样挂回（11-19 真机：只勾 1 张主图，重混成了 4 张全选）。
                ...(input.characterImagePicks?.[character.cardId]?.length
                  ? {
                      imagePicks: input.characterImagePicks[character.cardId],
                    }
                  : {}),
              })),
            }
          : {}),
      },
    },
  )
}

/** 出图用的造型，随出图记录记下（角色④）。 */
function characterLookIdsOf(
  characters: readonly CardBusCharacter[],
): Record<string, string> {
  return Object.fromEntries(
    characters.flatMap((character) =>
      character.lookId ? [[character.cardId, character.lookId]] : [],
    ),
  )
}
