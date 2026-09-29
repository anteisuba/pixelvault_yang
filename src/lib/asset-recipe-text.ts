import { z } from 'zod'

import { USER_UPLOAD_PROVIDER } from '@/constants/uploads'
import type { GenerationRecord } from '@/types'

/**
 * 快照里「复制配方」要的那几个参数。只取这几个、每个都可缺 —— 存量快照形状
 * 不齐，⛔ 用整份 `GenerationSnapshotSchema` 去卡（它要求的字段老数据未必有）。
 */
const RecipeSnapshotSchema = z.object({
  advancedParams: z
    .object({
      steps: z.number().optional(),
      guidanceScale: z.number().optional(),
      runnerSampler: z.string().optional(),
      runnerScheduler: z.string().optional(),
    })
    .optional(),
})

type RecipeSnapshot = z.infer<typeof RecipeSnapshotSchema>

function readSnapshot(snapshot: unknown): RecipeSnapshot['advancedParams'] {
  const parsed = RecipeSnapshotSchema.safeParse(snapshot)
  return parsed.success ? parsed.data.advancedParams : undefined
}

/** 这一张的 seed（数据库是 bigint，JSON 回来可能是字符串或数字）。 */
export function formatGenerationSeed(
  seed: GenerationRecord['seed'],
): string | null {
  if (seed === null || seed === undefined || seed === '') return null
  return String(seed)
}

/**
 * 素材查看器「复制配方」的文本：与 LoRA 样例查看器同一种写法（A1111 那一路）——
 * 第一行提示词，第二行负面，第三行参数。本地上传没有模型，只写尺寸。
 */
export function buildAssetRecipeText(
  generation: Pick<
    GenerationRecord,
    | 'prompt'
    | 'negativePrompt'
    | 'model'
    | 'width'
    | 'height'
    | 'seed'
    | 'snapshot'
  >,
): string {
  const lines: string[] = []
  const prompt = generation.prompt.trim()
  if (prompt) lines.push(prompt)
  const negative = generation.negativePrompt?.trim()
  if (negative) lines.push(`Negative prompt: ${negative}`)

  const advanced = readSnapshot(generation.snapshot)
  const params: string[] = []
  if (advanced?.steps !== undefined) params.push(`Steps: ${advanced.steps}`)
  if (advanced?.runnerSampler) params.push(`Sampler: ${advanced.runnerSampler}`)
  if (advanced?.runnerScheduler) {
    params.push(`Scheduler: ${advanced.runnerScheduler}`)
  }
  if (advanced?.guidanceScale !== undefined) {
    params.push(`CFG scale: ${advanced.guidanceScale}`)
  }
  const seed = formatGenerationSeed(generation.seed)
  if (seed) params.push(`Seed: ${seed}`)
  if (generation.width > 0 && generation.height > 0) {
    params.push(`Size: ${generation.width}x${generation.height}`)
  }
  if (generation.model && generation.model !== USER_UPLOAD_PROVIDER) {
    params.push(`Model: ${generation.model}`)
  }
  if (params.length > 0) lines.push(params.join(', '))
  return lines.join('\n')
}
