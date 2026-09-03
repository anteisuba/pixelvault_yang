'use client'

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioForm } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'
import {
  StudioVideoSpecFields,
  useStudioVideoSpec,
} from '@/components/business/studio/StudioVideoSpecFields'
import {
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
} from '@/components/business/studio-shared/primitives/tool-surface'

interface StudioVideoSpecPopoverProps {
  disabled?: boolean
}

/**
 * StudioVideoSpecPopover —— 视频参数栏的「规格」单一触发器：时长 · 分辨率 ·
 * 宽高比 · 原生出声收进一个下拉，触发器上写全（`5s · 720p · 16:9`）。
 *
 * 与图片的 `StudioSpecPopover` 是**同一个形态**（参数栏三种披露里的形态 2），
 * 药丸样式与比例线框都从 `tool-surface` 共用，观感逐像素一致。
 *
 * 它替掉了三样东西（2026-08-23 切片 B）：
 * - 「视频设置」对话框（`StudioVideoParams` + `panels.videoParams`）；
 * - 视频栏里那颗独立的 `StudioAspectRatioPopover`；
 * - 对话框里的反向提示词输入框 —— 改由参数栏的折叠行承担。
 *
 * ⭐ 2026-09-03：档位与摘要整组搬进 `StudioVideoSpecFields` /
 * `useStudioVideoSpec`，移动端底部 composer 的规格 sheet 用的是**同一份**。
 * 这里只剩「触发器 + 浮层外壳」。三条判据（档位实算 / 摘要只印候选内的值 /
 * 四样全空整块不渲染）随之搬到那边，判据本身一字未改。
 */
export function StudioVideoSpecPopover({
  disabled,
}: StudioVideoSpecPopoverProps) {
  const { state, dispatch } = useStudioForm()
  const t = useTranslations('StudioV2')
  const { summary, isEmpty } = useStudioVideoSpec()

  const open = state.panels.videoSpec

  if (isEmpty) return null

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-2xs font-medium text-muted-foreground/70">
        {t('specLabel')}
      </span>
      <StudioToolSurface
        open={open}
        onOpenChange={(nextOpen) =>
          dispatch({
            type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
            payload: 'videoSpec',
          })
        }
      >
        <StudioToolSurfaceTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={t('specLabel')}
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-lg border border-border/60 bg-background px-3 text-xs font-medium text-foreground',
              'transition-colors duration-fast ease-standard hover:border-primary/25',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              'disabled:pointer-events-none disabled:opacity-50',
              open && 'border-primary/30 bg-muted/45',
            )}
          >
            <span className="truncate">{summary}</span>
            <ChevronDown
              className={cn(
                'ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-base ease-standard',
                open && 'rotate-180',
              )}
            />
          </button>
        </StudioToolSurfaceTrigger>
        <StudioToolPopoverContent
          size="small"
          className="w-64"
          side="bottom"
          align="start"
          label={t('specLabel')}
        >
          <StudioVideoSpecFields />
        </StudioToolPopoverContent>
      </StudioToolSurface>
    </div>
  )
}
