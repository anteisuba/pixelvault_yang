import { getModelById } from '@/constants/models'
import {
  getNovelAiMaxCharacters,
  supportsNovelAiCharacters,
} from '@/constants/novelai'
import type { PromptDialect } from '@/constants/prompt-dialects'
import { pruneIncompatibleCapabilityValues } from '@/lib/model-capability-chips'
import { translateTagPromptText } from '@/lib/tag-composer'
import type { AdvancedParams } from '@/types'

/**
 * 出图时**按各模型能力裁剪 payload**（D10 ② Q3）。
 *
 * 台内多选的时候参数面是**并集**：只有一家支持的那些照样可改（灰着，标
 * 「只对 X 生效」）。那份并集不能原样发给每一家 —— 这里是它落地的地方，
 * 一条名单跑 N 个模型时**逐个裁剪一次**。
 *
 * 裁三件事：
 * 1. **能力**：不认识的专属键整个删掉（与切模型时的静默回默认同一个函数）。
 * 2. **角色构图**：不支持的模型删掉整块；支持但人数上限更低的（V4.5 6 人）
 *    截到它的上限 —— ⛔ 不整块丢：用户摆的前六个人是有意义的。
 * 3. **方言**：标签台写出来的统一串按 provider 翻成它自己的语法
 *    （NAI `{tag}` / PixAI `(tag:1.2)`）。⚠ 只有标签台的串能翻 ——
 *    自然语言台写的 `a girl: 1.2 meters tall` 翻一遍会被改写成权重。
 *
 * ⚠ 纯函数、不认识 React：调用点是发请求那一跳（`use-unified-generate`），
 * 单模型与对比矩阵**共用这一份**，⛔ 不在两个分支各写一遍。
 */

export interface TailorableImageRequest {
  /** ⚠ 可选：`StudioGenerateRequest.modelId` 本来就是可选的（缺型号时由服务端
   *  按路由解析）。认不出型号就只翻译方言、不做能力裁剪。 */
  modelId?: string
  freePrompt?: string
  advancedParams?: AdvancedParams
}

export function tailorImageRequestToModel<T extends TailorableImageRequest>(
  request: T,
  dialect: PromptDialect,
): T {
  const adapterType = request.modelId
    ? getModelById(request.modelId)?.adapterType
    : undefined
  let advancedParams = request.advancedParams
  let freePrompt = request.freePrompt

  if (advancedParams) {
    const pruned = pruneIncompatibleCapabilityValues(
      advancedParams,
      adapterType,
      request.modelId,
    )
    if (pruned) advancedParams = pruned

    const layout = advancedParams.novelAiLayout
    if (layout && request.modelId) {
      if (!supportsNovelAiCharacters(request.modelId)) {
        advancedParams = { ...advancedParams, novelAiLayout: undefined }
      } else {
        const max = getNovelAiMaxCharacters(request.modelId)
        if (layout.characters.length > max) {
          advancedParams = {
            ...advancedParams,
            novelAiLayout: {
              ...layout,
              characters: layout.characters.slice(0, max),
            },
          }
        }
      }
    }
  }

  if (dialect === 'tags') {
    if (freePrompt) {
      freePrompt = translateTagPromptText(freePrompt, adapterType)
    }
    if (advancedParams?.negativePrompt) {
      advancedParams = {
        ...advancedParams,
        negativePrompt: translateTagPromptText(
          advancedParams.negativePrompt,
          adapterType,
        ),
      }
    }
    // 角色各自的正负标签也是标签串 —— 漏了它们，画面上的人会带着
    // `rain:1.2` 这种没人认识的写法进提示词。
    const layout = advancedParams?.novelAiLayout
    if (layout) {
      advancedParams = {
        ...advancedParams,
        novelAiLayout: {
          ...layout,
          characters: layout.characters.map((character) => ({
            ...character,
            prompt: translateTagPromptText(character.prompt, adapterType),
            negativePrompt: translateTagPromptText(
              character.negativePrompt,
              adapterType,
            ),
          })),
        },
      }
    }
  }

  if (
    advancedParams === request.advancedParams &&
    freePrompt === request.freePrompt
  ) {
    return request
  }
  return { ...request, advancedParams, freePrompt }
}
