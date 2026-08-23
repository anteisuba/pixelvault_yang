'use client'

import { memo } from 'react'
import { Trash2, Wand2 } from 'lucide-react'
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
}: StudioReferenceRailProps) {
  const t = useTranslations('ImageChip')
  const tEdit = useTranslations('StudioImageEdit')

  return (
    <div className="mb-4 flex items-center gap-3 border-b border-border/60 pb-3">
      <span className="shrink-0 text-xs text-muted-foreground">
        {t('referenceLabel')}
      </span>

      <div
        // ⚠ 不能 `flex-1` 把动作推到最右边：助手浮标（StudioAssistantFab）是
        // fixed 在结果区右上角的，owner 定的就是「覆盖不挤压」。真机探针实测
        // 「移除参考图」的中心点被它吃掉。整条轨一律左对齐，缩略图多了在自己
        // 的 max-w 里横滑，右上角那块永远留给浮标。
        className="studio-scroll-area flex min-w-0 max-w-md gap-2 overflow-x-auto"
        role="tablist"
        aria-label={t('referenceLabel')}
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
              role="tab"
              aria-selected={isActive}
              title={disabledTitle}
              aria-label={t('previewReferenceImage', { index: index + 1 })}
              onClick={() => onActiveIndexChange(index)}
              className={cn(
                'relative size-11 shrink-0 overflow-hidden rounded-lg transition-shadow',
                isActive
                  ? 'outline outline-2 -outline-offset-2 outline-foreground'
                  : 'outline outline-1 -outline-offset-1 outline-border/60',
                entry.disabledReason !== null && 'opacity-40',
                'focus-visible:outline-2 focus-visible:outline-primary',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={entry.url} alt="" className="size-full object-cover" />
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
    </div>
  )
})
