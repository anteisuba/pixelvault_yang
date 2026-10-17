import { z } from 'zod'

import { BENCH_CANVAS_HANDOFF } from '@/constants/studio'

/**
 * **工作台 ↔ 画布交接**（P6，owner 2026-10-16「助手能把一件事从工作台交到画布（或反过来）接着做」）。
 *
 * 两边不在同一个 Provider 里（`/studio/node` 在 `StudioProvider` 外面），换路由表单就没了 ——
 * 所以按下交接卡的那一页把要带走的写进 sessionStorage 再跳，落地那一页读一次就清掉。
 * 下一句话不走这里：`requestOperatorDraft` 交给那边助手的输入框（⛔ 不替用户发）。
 *
 * 读一律过 Zod、只认 http(s) 地址：坏的 / 旧的一份当没有，⛔ 不抛。
 */

const RemoteUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((url) => /^https?:/i.test(url))

const ReferenceUrlsSchema = z
  .array(RemoteUrlSchema)
  .max(BENCH_CANVAS_HANDOFF.maxReferences)
  .default([])

/** 工作台 → 画布：落成画布上一张图片卡（提示词、模型、刚出的图）+ 连进它的参考图。 */
const BenchToCanvasSchema = z.object({
  /** 项目 id，或 `CANVAS_NEW_PROJECT_QUERY_VALUE`（新建一块）。 */
  projectId: z.string().trim().min(1),
  prompt: z.string().default(''),
  modelId: z.string().trim().min(1).optional(),
  referenceUrls: ReferenceUrlsSchema,
  result: z
    .object({
      url: RemoteUrlSchema,
      generationId: z.string().trim().min(1).optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
    })
    .optional(),
  /** 落地后填进画布助手输入框的那一句。 */
  next: z.string().trim().min(1).optional(),
})

export type BenchToCanvasHandoff = z.infer<typeof BenchToCanvasSchema>

/** 画布 → 工作台：选中那张卡的提示词、模型、参考图填进工作台。 */
const CanvasToBenchSchema = z.object({
  prompt: z.string().default(''),
  modelId: z.string().trim().min(1).optional(),
  referenceUrls: ReferenceUrlsSchema,
})

export type CanvasToBenchHandoff = z.infer<typeof CanvasToBenchSchema>

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(key, JSON.stringify(value))
}

/** 读一次就清掉 —— 刷新不会再落一张卡。 */
function take<T>(key: string, schema: z.ZodType<T>): T | null {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(key)
  if (!raw) return null
  window.sessionStorage.removeItem(key)
  try {
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** 只取 http(s) 的参考图、去重、截到上限；回给调用方截掉了几张。 */
export function pickHandoffReferences(urls: readonly string[]): {
  urls: string[]
  dropped: number
} {
  const remote = [
    ...new Set(urls.filter((url) => RemoteUrlSchema.safeParse(url).success)),
  ]
  const kept = remote.slice(0, BENCH_CANVAS_HANDOFF.maxReferences)
  return { urls: kept, dropped: new Set(urls).size - kept.length }
}

export function writeBenchToCanvasHandoff(handoff: BenchToCanvasHandoff): void {
  write(
    BENCH_CANVAS_HANDOFF.toCanvasStorageKey,
    BenchToCanvasSchema.parse(handoff),
  )
}

export function takeBenchToCanvasHandoff(): BenchToCanvasHandoff | null {
  return take(BENCH_CANVAS_HANDOFF.toCanvasStorageKey, BenchToCanvasSchema)
}

export function writeCanvasToBenchHandoff(handoff: CanvasToBenchHandoff): void {
  write(
    BENCH_CANVAS_HANDOFF.toBenchStorageKey,
    CanvasToBenchSchema.parse(handoff),
  )
}

export function takeCanvasToBenchHandoff(): CanvasToBenchHandoff | null {
  return take(BENCH_CANVAS_HANDOFF.toBenchStorageKey, CanvasToBenchSchema)
}
