import { AI_MODELS } from './models/enum'

export const NOVELAI_V5_MAX_CHARACTERS = 22

export function supportsNovelAiCharacters(modelId?: string): boolean {
  return (
    modelId === AI_MODELS.NOVELAI_V5_FULL ||
    modelId === AI_MODELS.NOVELAI_V5_CURATED
  )
}

/**
 * 遮罩重绘用的 inpaint 模型名。⚠ NovelAI 的 inpaint 是**换一个模型 + 换一个
 * action**（`infill`），不是在原模型上加个参数。
 *
 * V5 只有 Full 有自己的 inpaint 模型，Curated 借 V4.5 Full 的那一个
 * （`docs/design/roadmap-canvas/research/novelai-pixai.md` A 节，官方 models 页
 * 与 inpaint 页 2026-09-20 核对）。所以 Curated 走的是一次**实打实的回落** ——
 * 界面上要说出来，⛔ 不能让用户以为重绘也跑在 V5 Curated 上。
 */
export const NOVELAI_INPAINT_MODEL_IDS: Record<string, string> = {
  'nai-diffusion-5-full': 'nai-diffusion-5-full-inpainting',
  'nai-diffusion-5-curated': 'nai-diffusion-4-5-full-inpainting',
}

/** 这个模型能不能遮罩重绘；返回真正要发给 provider 的模型名。 */
export function resolveNovelAiInpaintModelId(
  externalModelId?: string,
): string | undefined {
  if (!externalModelId) return undefined
  return NOVELAI_INPAINT_MODEL_IDS[externalModelId]
}

/** 重绘时会掉到另一代模型上吗（今天只有 V5 Curated → V4.5 Full）。 */
export function novelAiInpaintFallsBack(externalModelId?: string): boolean {
  const target = resolveNovelAiInpaintModelId(externalModelId)
  if (!target || !externalModelId) return false
  return !target.startsWith(externalModelId)
}
