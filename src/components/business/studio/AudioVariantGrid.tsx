'use client'

import { memo } from 'react'
import { AlertTriangle, Ban, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { RunItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

interface AudioVariantGridProps {
  items: RunItem[]
  /** 取消这一条正在跑的音频。给了才画每行的取消按钮。 */
  onCancel?: (itemId: string) => void
  /** 取消这一轮里所有还没结束的条目。给了且确有条目在跑才画「全部取消」。 */
  onCancelAll?: () => void
}

/** `m:ss`。时长缺席时（provider 没回）不印，不猜。 */
function formatClipLength(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * 音频结果 —— **一行一条**（切片 E）。
 *
 * ## 为什么不是栅格
 *
 * 图片可以并置扫视，一眼看完四张；**听不能扫** —— 并排放两列不省时间，只是
 * 把每条的播放条压窄一半。而音频这块屏幕真正稀缺的是**播放条的宽度**：一分钟
 * 的旁白在 320px 的条上拖不准。一行一条把宽度还给它。
 *
 * ## 每条印什么
 *
 * 序号 · 时长 · 播放器。⛔ **不印提示词** —— 变体是同一段提示词跑 N 次
 * （`generateAudioVariants` 只换随机性，不换参数），逐条印等于把同一句话印四遍。
 * ⛔ 也不画波形：我们手上只有 URL，画一条与音频无关的假波形比不画更糟。
 *
 * ⚠ 失败行没有「重试这条」：音频没有逐条重放的接口（视频那条是
 * `retryVideoQueueItem`，音频侧没有对应物）。画一颗点了没反应的按钮是这轮一路
 * 在治的那类缺陷，所以只写原因。
 */
export const AudioVariantGrid = memo(function AudioVariantGrid({
  items,
  onCancel,
  onCancelAll,
}: AudioVariantGridProps) {
  const t = useTranslations('StudioV3')
  const tCancel = useTranslations('GenerationCancel')
  const hasRunning = items.some((item) => item.status === 'generating')

  return (
    <div className="flex flex-col gap-2">
      {hasRunning && onCancelAll && (
        <div className="flex items-center justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-full text-muted-foreground"
            onClick={onCancelAll}
          >
            <Ban className="size-3.5" />
            {tCancel('cancelAll')}
          </Button>
        </div>
      )}
      {items.map((item, idx) => {
        const isCompleted =
          item.status === 'completed' && item.generation != null
        const clipLength = formatClipLength(item.generation?.duration)

        return (
          <div
            key={item.id}
            className={cn(
              'flex min-h-16 items-center gap-3 rounded-xl border border-border/60 px-4 py-3',
              item.status === 'failed' || item.status === 'cancelled'
                ? 'bg-muted/10'
                : 'bg-background',
            )}
          >
            <div className="flex w-20 shrink-0 flex-col gap-0.5">
              <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                {`#${idx + 1}`}
              </span>
              {clipLength ? (
                <span className="font-mono text-2xs tabular-nums text-muted-foreground/70">
                  {clipLength}
                </span>
              ) : null}
            </div>

            {item.status === 'generating' && (
              <div className="flex min-w-0 flex-1 items-center gap-2 text-muted-foreground">
                <Spinner size="md" />
                <span className="text-xs">{t('generating')}</span>
                {onCancel && (
                  <button
                    type="button"
                    onClick={() => onCancel(item.id)}
                    data-testid="audio-variant-cancel"
                    className="ml-auto min-h-8 shrink-0 rounded-lg px-2.5 text-2xs text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground"
                  >
                    {tCancel('cancel')}
                  </button>
                )}
              </div>
            )}

            {item.status === 'failed' && (
              <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <AlertTriangle className="size-4 shrink-0 text-destructive/60" />
                <span className="text-xs">
                  {item.error ?? t('generateFailed')}
                </span>
              </div>
            )}

            {item.status === 'cancelled' && (
              <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <X className="size-4 shrink-0 text-muted-foreground/60" />
                <span className="text-xs">{tCancel('cancelled')}</span>
              </div>
            )}

            {isCompleted && item.generation && (
              <audio
                controls
                preload="none"
                src={item.generation.url}
                className="animate-in fade-in min-w-0 flex-1 duration-300"
              />
            )}
          </div>
        )
      })}
    </div>
  )
})
