'use client'

import { memo, useId, useRef } from 'react'
import { AlertTriangle, Trash2, Wand2 } from '@/components/icons'
import { useTranslations } from 'next-intl'

import type { ReferenceImageEntry } from '@/hooks/use-image-upload'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface StudioReferenceRailProps {
  entries: ReadonlyArray<ReferenceImageEntry>
  /** 当前槽位，由父级 clamp 过；空列表时父级不渲染本组件。 */
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onEdit: (index: number) => void
  onRemove: (index: number) => void
  /**
   * 这条轨叫什么。**由模态与视频用途决定，不是装饰**（切片 B）：
   * 图片是「参考图」，视频关键帧档是「首帧」，其余视频档是「内容参考」。
   * 同一张图在不同用途下被送去干完全不同的事，轨上不写清就只能靠猜。
   */
  label: string
}

/**
 * 参考轨 —— 结果区顶部的常驻一条（owner 2026-08-23 拍板）。
 *
 * 它一次修两个真机问题：
 *
 * - **切不了**：旧版舞台写死取第一条可用槽，「参考图 1 / 2」的第 2 张没有任何
 *   抵达路径。这里位置是可点的。
 * - **生成后就没了**：旧版整块的渲染条件是「还没有结果」，第一张图落地后连
 *   「编辑这张」一起消失，只剩提示词框角上 34px 的缩略图。这条轨与结果并存。
 *
 * ⚠ 禁用槽（over_limit / unsupported）照样列出来并且可选中 —— 它们不参与生成，
 * 但「为什么这张没被用上」正是用户要看的信息，藏起来等于把问题变成谜。
 */
export const StudioReferenceRail = memo(function StudioReferenceRail({
  entries,
  activeIndex,
  onActiveIndexChange,
  onEdit,
  onRemove,
  label,
}: StudioReferenceRailProps) {
  const t = useTranslations('ImageChip')
  const tEdit = useTranslations('StudioImageEdit')
  const reasonId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const activeReason = entries[activeIndex]?.disabledReason
  const reasonText =
    activeReason === 'over_limit'
      ? t('disabledOverLimit')
      : activeReason === 'unsupported'
        ? t('disabledUnsupported')
        : null

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-3 border-b border-border/60 pb-3"
      // 助手挂 / 摘参考图时整条轨闪一次（进度表 21）。
      data-assistant-field="references"
    >
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>

      <div
        // ⚠ 不能 `flex-1` 把动作推到最右边：助手浮标（StudioAssistantFab）是
        // fixed 在结果区右上角的，owner 定的就是「覆盖不挤压」。真机探针实测
        // 「移除参考图」的中心点被它吃掉。整条轨一律左对齐，缩略图多了在自己
        // 的 max-w 里横滑，右上角那块永远留给浮标。
        className="studio-scroll-area flex min-w-0 max-w-md gap-2 overflow-x-auto"
        role="tablist"
        // 可访问名与可见标签是同一句 —— 视频关键帧档下读屏念「参考图」而屏上
        // 写着「首帧」，是两个事实。
        aria-label={label}
      >
        {entries.map((entry, index) => {
          const isActive = index === activeIndex
          const disabledTitle =
            entry.disabledReason === 'over_limit'
              ? t('disabledOverLimit')
              : entry.disabledReason === 'unsupported'
                ? t('disabledUnsupported')
                : undefined

          return (
            <button
              // 参考图可以重复添加同一个 url，index 才是槽位的身份。
              key={`${entry.url}-${index}`}
              type="button"
              ref={(node) => {
                tabRefs.current[index] = node
              }}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              aria-describedby={isActive && reasonText ? reasonId : undefined}
              title={disabledTitle}
              aria-label={t('previewReferenceImage', { index: index + 1 })}
              onClick={() => onActiveIndexChange(index)}
              onKeyDown={(event) => {
                let nextIndex: number
                switch (event.key) {
                  case 'ArrowRight':
                    nextIndex = (index + 1) % entries.length
                    break
                  case 'ArrowLeft':
                    nextIndex = (index - 1 + entries.length) % entries.length
                    break
                  case 'Home':
                    nextIndex = 0
                    break
                  case 'End':
                    nextIndex = entries.length - 1
                    break
                  default:
                    return
                }
                event.preventDefault()
                onActiveIndexChange(nextIndex)
                tabRefs.current[nextIndex]?.focus()
              }}
              className={cn(
                'relative size-11 shrink-0 overflow-hidden rounded-lg transition-shadow',
                isActive
                  ? 'outline outline-2 -outline-offset-2 outline-foreground'
                  : 'outline outline-1 -outline-offset-1 outline-border/60',
                'focus-visible:outline-2 focus-visible:outline-primary',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={entry.url}
                alt=""
                className={cn(
                  'size-full object-cover',
                  disabledTitle && 'opacity-40',
                )}
              />
              {disabledTitle && (
                <span className="absolute right-0 bottom-0 rounded-tl bg-background p-0.5 text-status-warning">
                  <AlertTriangle className="size-3" aria-hidden="true" />
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="studio-touch-actions flex shrink-0 items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={() => onEdit(activeIndex)}
        >
          <Wand2 className="size-3.5" />
          {tEdit('stageEditThis')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="rounded-full"
          aria-label={t('removeReferenceImage', { index: activeIndex + 1 })}
          onClick={() => onRemove(activeIndex)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div
        className={reasonText ? 'basis-full' : 'sr-only'}
        role="status"
        aria-atomic="true"
      >
        {reasonText && (
          <p
            id={reasonId}
            className="flex items-start gap-2 text-xs text-status-warning"
          >
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {reasonText}
          </p>
        )}
      </div>
    </div>
  )
})
