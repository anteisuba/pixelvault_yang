'use client'

import { memo, useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { PLATFORM_GENERATION_GUARD } from '@/constants/config'
import { STUDIO_MOBILE_QUEUE_PROGRESS_CAP } from '@/constants/studio-mobile'
import {
  getGeneratingStageKey,
  resolveGenerationProgress,
} from '@/lib/generation-progress'
import type { RunItem } from '@/types'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

interface StudioVideoQueueStripProps {
  items: ReadonlyArray<RunItem>
  /** 当前在播放器里看的那一条；null = 看最新结果。 */
  focusedItemId: string | null
  onFocus: (itemId: string) => void
  onRetry: (itemId: string) => void
  /**
   * 呈现方式。`strip`（默认）= 桌面舞台底部那条横滑；`cards` = 移动端舞台**顶部**
   * 的整宽卡片列（每条自带进度条与「取消」）。
   *
   * ⚠ 手机上横滑那条读不了：一屏宽 375，第二条起就在屏幕外，而「我排了几条、
   * 各排到哪了」正是等 2–5 分钟时唯一要看的东西。
   */
  variant?: 'strip' | 'cards'
  /** 取消这一条（只中止它自己的轮询）。给了才画「取消」。 */
  onCancel?: (itemId: string) => void
}

/** `mm:ss`，给每条自己的已用时长用。 */
function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

/**
 * 视频队列条 —— 播放器下方的横向一条（owner 2026-08-23 选定「A 的骨架 + B 的
 * 队列」）。
 *
 * ## 为什么是横条不是竖栏
 *
 * 方向 B 原稿把队列画成右侧 208px 的竖栏。放进 A 的骨架里就等于从播放器身上切掉
 * 208px —— 而这块屏幕的主角是那条视频。横条占的是 A 原来「取次条」的位置，语义
 * 取 B 的（每条自报状态 / 带计时 / 可单条重试 / 写明并发上限）。
 *
 * ## 每条自己计时
 *
 * ⚠ 不能用批次的 `startedAt`：视频可以边等边排下一条，四条的已用时长各不相同，
 * 共用批次起点会让后排的一进来就显示「已等 3 分钟」。计时锚点是 `item.startedAt`。
 *
 * ## 失败只失败它自己
 *
 * 队列里第 1 条失败不会终止第 2、3 条 —— 生成侧只 `markActiveRunItemFailed`，
 * 不调全局 `finish(err)`。所以这里的「重试这条」也只重放它自己的参数。
 */
export const StudioVideoQueueStrip = memo(function StudioVideoQueueStrip({
  items,
  focusedItemId,
  onFocus,
  onRetry,
  variant = 'strip',
  onCancel,
}: StudioVideoQueueStripProps) {
  const t = useTranslations('StudioVideoQueue')
  const tStages = useTranslations('StudioV3')
  const hasRunning = items.some((item) => item.status === 'generating')

  // 只在真有东西在跑时才起秒表 —— 全跑完还每秒 setState 是白刷新。
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!hasRunning) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [hasRunning])

  if (items.length === 0) return null

  const runningCount = items.filter(
    (item) => item.status === 'generating',
  ).length

  if (variant === 'cards') {
    return (
      <div
        data-testid="studio-video-queue-cards"
        className="mb-3 flex flex-col gap-2"
      >
        {items.map((item, index) => {
          const elapsed = item.startedAt ? (now - item.startedAt) / 1000 : 0
          const running = item.status === 'generating'
          // ⭐ 封顶 95%：视频没有真进度信号，条子走到 100 再停在那里等，
          //    比停在 95 更像「卡住了」。判据与桌面进度环同一条曲线。
          const percent = running
            ? Math.min(
                STUDIO_MOBILE_QUEUE_PROGRESS_CAP,
                resolveGenerationProgress({ elapsedSeconds: elapsed }).percent,
              )
            : item.status === 'completed'
              ? 100
              : 0
          const stageLabel = tStages(
            `generatingOverlayStages.${getGeneratingStageKey(elapsed)}` as const,
          )

          return (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-background p-2.5"
            >
              <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted/30">
                {running ? (
                  <Spinner size="sm" className="text-muted-foreground" />
                ) : item.status === 'failed' ? (
                  <AlertTriangle className="size-4 text-destructive/60" />
                ) : item.generation?.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.generation.thumbnailUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : null}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span
                  className={cn(
                    'truncate text-xs font-medium',
                    item.status === 'failed'
                      ? 'text-destructive'
                      : 'text-foreground',
                  )}
                  title={item.status === 'failed' ? item.error : undefined}
                >
                  {running
                    ? t('itemRunning', { index: index + 1 })
                    : item.status === 'failed'
                      ? t('itemFailed', { index: index + 1 })
                      : t('itemDone', { index: index + 1 })}
                </span>
                <span
                  data-testid="studio-video-queue-timer"
                  className="font-mono text-2xs tabular-nums text-muted-foreground"
                >
                  {running
                    ? `${formatElapsed(elapsed)} · ${stageLabel}`
                    : (item.error ?? formatElapsed(elapsed))}
                </span>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(percent)}
                  aria-label={t('label')}
                  className="h-1 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-base ease-standard"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>

              {/* 跑着的能取消、失败的能重试、完成的能拿去播放器里看 ——
                  一条卡上永远只有一个动作，不摆三颗按钮让人挑。 */}
              {running && onCancel ? (
                <button
                  type="button"
                  onClick={() => onCancel(item.id)}
                  data-testid="studio-video-queue-cancel"
                  className="min-h-11 shrink-0 rounded-lg px-3 text-xs text-muted-foreground transition-colors duration-fast ease-standard active:bg-muted"
                >
                  {t('cancel')}
                </button>
              ) : item.status === 'failed' ? (
                <button
                  type="button"
                  onClick={() => onRetry(item.id)}
                  className="min-h-11 shrink-0 rounded-lg px-3 text-xs text-muted-foreground underline underline-offset-2 transition-colors duration-fast ease-standard active:bg-muted"
                >
                  {t('retry')}
                </button>
              ) : item.status === 'completed' ? (
                <button
                  type="button"
                  onClick={() => onFocus(item.id)}
                  aria-pressed={item.id === focusedItemId}
                  className="min-h-11 shrink-0 rounded-lg px-3 text-xs text-muted-foreground transition-colors duration-fast ease-standard active:bg-muted"
                >
                  {t('viewTake', { index: index + 1 })}
                </button>
              ) : null}
            </div>
          )
        })}

        {/* 说明文案在移动端**必须出现**：桌面把它挂在 `xl:block` 上，于是手机端
            「要等多久 / 能不能离开这一页」完全无处可知，而那正是视频档等待时
            唯一的问题。 */}
        <p
          data-testid="studio-video-queue-hint"
          className="text-2xs leading-relaxed text-muted-foreground"
        >
          {t('mobileHint')}
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 flex items-start gap-3 border-t border-border/60 pt-3">
      <div className="flex shrink-0 flex-col gap-1">
        <span className="text-2xs font-medium text-muted-foreground/70">
          {t('label')}
        </span>
        <span className="font-mono text-2xs tabular-nums text-muted-foreground">
          {t('concurrency', {
            running: runningCount,
            max: PLATFORM_GENERATION_GUARD.MAX_ACTIVE_JOBS_PER_USER,
          })}
        </span>
      </div>

      {/* ⚠ 一律左对齐、自己横滑：助手浮标是 fixed 在结果区右上角的（owner
          2026-08-14「覆盖不挤压」），右上角那块永远留给它。参考轨那边真机探针
          抓到过按钮中心点被浮标吃掉。 */}
      <div className="studio-scroll-area flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
        {items.map((item, index) => {
          const isFocused = item.id === focusedItemId
          const elapsed = item.startedAt ? (now - item.startedAt) / 1000 : null

          return (
            <div key={item.id} className="flex w-32 shrink-0 flex-col gap-1.5">
              {item.status === 'generating' ? (
                <div className="flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-muted/20">
                  <Spinner size="sm" className="text-muted-foreground" />
                  {elapsed !== null ? (
                    <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                      {formatElapsed(elapsed)}
                    </span>
                  ) : null}
                </div>
              ) : item.status === 'failed' ? (
                <div className="flex h-[72px] flex-col items-center justify-center gap-1 rounded-lg border border-border/60 bg-background px-2">
                  <AlertTriangle className="size-4 text-destructive/60" />
                  <button
                    type="button"
                    onClick={() => onRetry(item.id)}
                    className="text-2xs text-muted-foreground underline underline-offset-2 transition-colors duration-fast ease-standard hover:text-foreground"
                  >
                    {t('retry')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onFocus(item.id)}
                  aria-pressed={isFocused}
                  aria-label={t('viewTake', { index: index + 1 })}
                  className={cn(
                    'relative h-[72px] overflow-hidden rounded-lg bg-muted/20 transition-shadow',
                    isFocused
                      ? 'outline outline-2 -outline-offset-2 outline-foreground'
                      : 'outline outline-1 -outline-offset-1 outline-border/60',
                    'focus-visible:outline-2 focus-visible:outline-primary',
                  )}
                >
                  {/* ⚠ 视频的缩略图可能是空的（素材域记过这一条：视频零缩略图）。
                      缺图时不画一个坏掉的 img，留素色格子 + 时长即可。 */}
                  {item.generation?.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.generation.thumbnailUrl}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : null}
                  {item.generation?.duration ? (
                    <span className="absolute bottom-1 left-1.5 font-mono text-2xs tabular-nums text-muted-foreground">
                      {`${Math.round(item.generation.duration)}s`}
                    </span>
                  ) : null}
                </button>
              )}

              <span
                className={cn(
                  'truncate text-2xs',
                  item.status === 'failed'
                    ? 'text-destructive'
                    : isFocused
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground',
                )}
                title={item.status === 'failed' ? item.error : undefined}
              >
                {item.status === 'generating'
                  ? t('itemRunning', { index: index + 1 })
                  : item.status === 'failed'
                    ? t('itemFailed', { index: index + 1 })
                    : isFocused
                      ? t('itemViewing', { index: index + 1 })
                      : t('itemDone', { index: index + 1 })}
              </span>
            </div>
          )
        })}
      </div>

      <p className="hidden w-44 shrink-0 text-2xs leading-relaxed text-muted-foreground/70 xl:block">
        {t('hint')}
      </p>

      {/* 失败那条的原因写在标签的 title 上还不够 —— 屏幕阅读器与鼠标都够不到
          横滑区外的解释，所以这里再列一次当前所有失败原因。 */}
      {items.some((item) => item.status === 'failed') ? (
        <span className="sr-only">
          {items
            .filter((item) => item.status === 'failed')
            .map((item) => item.error)
            .join('; ')}
        </span>
      ) : null}
    </div>
  )
})

export { formatElapsed as formatQueueElapsed }
