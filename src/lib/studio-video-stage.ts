import type { PendingRunItem, RunItem } from '@/types'

/**
 * 视频台舞台上要不要画「这一条正在跑」的进度框 —— 要的话是哪一条。
 *
 * ## 为什么需要它
 *
 * 视频提交后立刻返回（`useUnifiedGenerate.generateVideo`）：全局 `isGenerating` 只
 * 覆盖提交那几百毫秒，之后「还在跑」只活在 run item 上。舞台以前只认
 * `isGenerating`，于是进度框几秒后就离场、舞台回到空态，只剩队列条一小格在计数
 * （2026-11-17 生产真机）。
 *
 * ## 判据
 *
 * - 用户在队列里点开了一条**已完成**的来看 → 不抢舞台（返回 null）。
 * - 正在跑的**恰好一条**，且它是队列里**最新**那一条 → 舞台给它。
 *   不止一条在跑时舞台不替用户挑（各自的进度在队列条上），最新那条已经出完 /
 *   失败时舞台该放结果或交给队列行说失败。
 *
 * 跑完后这一条不再是 `generating`，返回 null，舞台自然落到 `lastGeneration`
 * （轮询完成时已写入）—— 进度框直接换成结果，与图片台同一个收尾。
 */
export function resolveStudioVideoStageItem(input: {
  readonly items: readonly RunItem[]
  /** 队列里被点开来看的那一条；null = 看最新。 */
  readonly focusedItemId: string | null
}): PendingRunItem | null {
  const { items, focusedItemId } = input
  if (
    focusedItemId !== null &&
    items.some(
      (item) => item.id === focusedItemId && item.status === 'completed',
    )
  ) {
    return null
  }
  const running = items.filter(
    (item): item is PendingRunItem => item.status === 'generating',
  )
  if (running.length !== 1) return null
  const latest = items[items.length - 1]
  return latest?.id === running[0].id ? running[0] : null
}
