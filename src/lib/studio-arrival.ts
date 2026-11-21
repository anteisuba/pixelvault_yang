import { resolveAdapterType } from '@/constants/models'
import {
  PROMPT_DIALECT_ROUTES,
  getPromptDialect,
} from '@/constants/prompt-dialects'
import { ROUTES } from '@/constants/routes'
import type { OutputType } from '@/types'

/**
 * 「做同款 / 使用模板」落到哪一台：按**型号**选，⛔ 只按出图类型。
 *
 * 🔬 11-21 真机：提示词库一条 NovelAI 模板点「使用」落到 `/studio/image`，那一台的模型
 * 名单里根本没有 NAI（方言由路由说了算，`StudioModeSync`），于是模型停在 Gemini、
 * `1.2::xxx::` 这种 NAI 权重写法配 Gemini 等于废的。吃标签的型号去标签台。
 */
export function studioArrivalBench(
  outputType: OutputType,
  modelId: string | null | undefined,
): string {
  if (outputType === 'VIDEO') return ROUTES.STUDIO_VIDEO
  if (outputType === 'AUDIO') return ROUTES.STUDIO_AUDIO
  const adapterType = modelId ? resolveAdapterType(modelId) : null
  return PROMPT_DIALECT_ROUTES[getPromptDialect(adapterType ?? undefined)]
}
